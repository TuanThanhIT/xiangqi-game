import { BadRequestException, ConflictException, HttpException, Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { DatabaseService } from "../../db/database.service";
import { accounts, emailOtps, emailSends } from "../../db/schema";
import { authConfig } from "../auth.config";
import { AUTH_CLOCK } from "../auth-clock";
import { OtpMailer } from "./delivery/otp-mailer";

type Tx = Parameters<Parameters<DatabaseService["db"]["transaction"]>[0]>[0];
type Account = typeof accounts.$inferSelect;
export interface VerificationState {
  status: "pending_verification"; accountId: string; maskedEmail: string;
  pendingExpiresAt: string; otpExpiresAt: string | null; resendAt: string; delivery: "sent" | "not_sent" | "failed";
}
export const otpDigest = (id: string, accountId: string, code: string): string => createHmac("sha256", authConfig().key)
  .update(`xiangqi:email-otp:v1:email_verification:${id}:${accountId}:${code}`).digest("hex");

@Injectable()
export class OtpService {
  constructor(private readonly database: DatabaseService, private readonly mailer: OtpMailer, @Inject(AUTH_CLOCK) private readonly now: () => Date) {}
  async lock(tx: Tx, emailKey: string): Promise<void> {
    // Shared email lock/quota namespace, including the future password-reset purpose.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${'auth-email:' + emailKey}, 0))`);
  }
  private async nextSend(tx: Tx, emailKey: string): Promise<Date> {
    const now = this.now().getTime();
    const recent = await tx.select().from(emailSends).where(and(eq(emailSends.emailKey, emailKey), eq(emailSends.status, "sent"),
      gt(emailSends.sentAt, new Date(now - 3600000)))).orderBy(desc(emailSends.sentAt)).limit(5);
    return new Date(Math.max(now, recent[0] ? recent[0].sentAt!.getTime() + 60000 : now,
      recent.length >= 5 ? recent[4].sentAt!.getTime() + 3600000 : now));
  }
  async state(tx: Tx, account: Account, delivery: VerificationState["delivery"] = "not_sent"): Promise<VerificationState> {
    const [otp] = await tx.select().from(emailOtps).where(and(eq(emailOtps.accountId, account.id), eq(emailOtps.purpose, "email_verification"),
      isNull(emailOtps.invalidatedAt), isNull(emailOtps.consumedAt))).limit(1);
    const [local, domain] = account.emailKey.split("@");
    return { status: "pending_verification", accountId: account.id, maskedEmail: `${Array.from(local)[0]}***@${domain}`,
      pendingExpiresAt: account.pendingExpiresAt.toISOString(), otpExpiresAt: otp?.expiresAt.toISOString() ?? null,
      resendAt: (await this.nextSend(tx, account.emailKey)).toISOString(), delivery };
  }
  async send(tx: Tx, account: Account): Promise<VerificationState> {
    if ((await this.nextSend(tx, account.emailKey)).getTime() > this.now().getTime()) return this.state(tx, account);
    const [previous] = await tx.select().from(emailOtps).where(and(eq(emailOtps.accountId, account.id), eq(emailOtps.purpose, "email_verification")))
      .orderBy(desc(emailOtps.sentAt)).limit(1);
    const id = randomUUID();
    let code: string;
    do { code = randomInt(0, 1000000).toString().padStart(6, "0"); }
    while (previous && timingSafeEqual(Buffer.from(previous.digest, "hex"), Buffer.from(otpDigest(previous.id, account.id, code), "hex")));
    const digest = otpDigest(id, account.id, code), attemptedAt = this.now();
    // Persist a failed delivery record without throwing inside the transaction (which would roll it back).
    await tx.insert(emailSends).values({ id, emailKey: account.emailKey, purpose: "email_verification", attemptedAt, status: "failed" });
    try { await this.mailer.send({ id, email: account.emailKey, code }); }
    catch { return this.state(tx, account, "failed"); }
    const sentAt = this.now();
    await tx.update(emailSends).set({ status: "sent", sentAt }).where(eq(emailSends.id, id));
    await tx.update(emailOtps).set({ invalidatedAt: sentAt }).where(and(eq(emailOtps.accountId, account.id), eq(emailOtps.purpose, "email_verification"),
      isNull(emailOtps.consumedAt), isNull(emailOtps.invalidatedAt)));
    await tx.insert(emailOtps).values({ id, accountId: account.id, purpose: "email_verification", digest, sentAt, expiresAt: new Date(sentAt.getTime() + 300000) });
    return this.state(tx, account, "sent");
  }
  private async withPending<T>(accountId: string, action: (tx: Tx, account: Account) => Promise<T>): Promise<T> {
    return this.database.db.transaction(async (tx) => {
      const [identity] = await tx.select({ emailKey: accounts.emailKey }).from(accounts).where(eq(accounts.id, accountId));
      if (!identity) throw new HttpException({ code: "REGISTRATION_EXPIRED" }, 410);
      await this.lock(tx, identity.emailKey);
      const [account] = await tx.select().from(accounts).where(eq(accounts.id, accountId)).for("update");
      if (!account) throw new HttpException({ code: "REGISTRATION_EXPIRED" }, 410);
      if (account.emailVerifiedAt) throw new ConflictException({ code: "OTP_ALREADY_USED" });
      if (account.pendingExpiresAt.getTime() <= this.now().getTime()) throw new HttpException({ code: "REGISTRATION_EXPIRED" }, 410);
      return action(tx, account);
    });
  }
  status(accountId: string): Promise<VerificationState> { return this.withPending(accountId, (tx, account) => this.state(tx, account)); }
  async resend(accountId: string): Promise<VerificationState> {
    return this.withPending(accountId, async (tx, account) => {
      const resendAt = await this.nextSend(tx, account.emailKey);
      if (resendAt.getTime() > this.now().getTime()) throw new HttpException({ code: "OTP_SEND_LIMIT" }, 429);
      return this.send(tx, account);
    });
  }
  async verify(accountId: string, code: string | undefined): Promise<{ ok: true }> {
    if (!code || !/^\d{6}$/.test(code)) throw new BadRequestException({ code: "INVALID_OTP_INPUT" });
    const result = await this.withPending(accountId, async (tx, account) => {
      const now = this.now();
      const [otp] = await tx.select().from(emailOtps).where(and(eq(emailOtps.accountId, accountId), eq(emailOtps.purpose, "email_verification"),
        isNull(emailOtps.invalidatedAt), isNull(emailOtps.consumedAt))).for("update");
      if (!otp || otp.failedAttempts >= 5 || otp.expiresAt.getTime() <= now.getTime()) return "OTP_EXPIRED";
      if (!timingSafeEqual(Buffer.from(otp.digest, "hex"), Buffer.from(otpDigest(otp.id, accountId, code), "hex"))) {
        const failedAttempts = otp.failedAttempts + 1;
        await tx.update(emailOtps).set({ failedAttempts, ...(failedAttempts >= 5 ? { invalidatedAt: now } : {}) }).where(eq(emailOtps.id, otp.id));
        return failedAttempts >= 5 ? "OTP_LOCKED" : "OTP_INVALID";
      }
      await tx.update(accounts).set({ emailVerifiedAt: now }).where(eq(accounts.id, account.id));
      await tx.update(emailOtps).set({ consumedAt: now }).where(eq(emailOtps.id, otp.id));
      return null;
    });
    if (result) throw new BadRequestException({ code: result }); // Failed-attempt updates have committed.
    return { ok: true };
  }
}

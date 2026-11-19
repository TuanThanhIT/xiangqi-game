import { ConflictException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { DatabaseService } from "../../db/database.service";
import { accounts, avatars } from "../../db/schema";
import { AUTH_CLOCK } from "../auth-clock";
import { OtpService } from "../otp/otp.service";
import type { VerificationState } from "../otp/otp.service";
import { hashPassword, verifyPassword } from "../password";
import type { LoginInput } from "../login/login.pipe";
import type { RegistrationInput } from "./registration.pipe";

@Injectable()
export class RegistrationService {
  constructor(private readonly database: DatabaseService, private readonly otp: OtpService, @Inject(AUTH_CLOCK) private readonly now: () => Date) {}
  async register(input: RegistrationInput): Promise<VerificationState> {
    const passwordHash = await hashPassword(input.password);
    const outcome = await this.database.db.transaction(async (tx) => {
      const normalized = await tx.execute(sql`select lower(btrim(${input.email})) as email_key,
        lower(btrim(regexp_replace(${input.nickname}, '[[:space:]]+', ' ', 'g'))) as nickname_key`);
      const emailKey = String(normalized.rows[0].email_key), nicknameKey = String(normalized.rows[0].nickname_key);
      await this.otp.lock(tx, emailKey);
      // Free either expired key on demand; a cleanup job is not required for correctness.
      await tx.delete(accounts).where(and(isNull(accounts.emailVerifiedAt), lte(accounts.pendingExpiresAt, this.now()),
        or(eq(accounts.emailKey, emailKey), eq(accounts.nicknameKey, nicknameKey))));
      const [existing] = await tx.select().from(accounts).where(eq(accounts.emailKey, emailKey)).for("update");
      if (existing) {
        if (existing.emailVerifiedAt) throw new ConflictException({ code: "EMAIL_IN_USE" });
        return this.otp.state(tx, existing); // Never overwrite password/name/deadline or implicitly resend.
      }
      const createdAt = this.now();
      // Restore required reference data if it was removed; preserve any existing avatar.
      // This shares the account transaction and is safe for simultaneous registrations.
      await tx.insert(avatars).values({ id: "default", name: "Mặc định" }).onConflictDoNothing();
      const [account] = await tx.insert(accounts).values({ email: emailKey, nickname: input.nickname, passwordHash, createdAt,
        pendingExpiresAt: new Date(createdAt.getTime() + 86400000) }).onConflictDoNothing().returning();
      if (!account) throw new ConflictException({ code: "NICKNAME_IN_USE" });
      return this.otp.reserve(tx, account);
    });
    return "kind" in outcome ? this.otp.deliver(outcome) : outcome;
  }
  async fromLogin(input: LoginInput): Promise<VerificationState> {
    const [account] = await this.database.db.select().from(accounts).where(eq(accounts.emailKey, input.email));
    if (!(await verifyPassword(input.password, account?.passwordHash)) || !account) throw new UnauthorizedException({ code: "INVALID_CREDENTIALS" });
    return this.otp.status(account.id); // No mail and no session; only after checking the existing password.
  }
}

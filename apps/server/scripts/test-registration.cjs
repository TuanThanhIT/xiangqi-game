require("reflect-metadata");
const assert = require("node:assert/strict");
const { randomBytes, randomUUID } = require("node:crypto");
const { NestFactory } = require("@nestjs/core");
const { and, eq, inArray, sql } = require("drizzle-orm");
const { AppModule } = require("../dist/app.module.js");
const { configureHttp } = require("../dist/configure-http.js");
const { DatabaseService } = require("../dist/db/database.service.js");
const { accounts, avatars, emailOtps, emailSends, sessions } = require("../dist/db/schema.js");
const { RegistrationService } = require("../dist/auth/registration/registration.service.js");
const { LoginService } = require("../dist/auth/login/login.service.js");
const { OtpService } = require("../dist/auth/otp/otp.service.js");
const { SessionService } = require("../dist/auth/session/session.service.js");
const { OtpMailer } = require("../dist/auth/otp/delivery/otp-mailer.js");

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false, bodyParser: false });
  let db; const emails = [];
  try {
    configureHttp(app); await app.listen(0, "127.0.0.1");
    db = app.get(DatabaseService).db;
    assert.ok((await db.execute(sql`select current_database() as name`)).rows[0].name === "xiangqi_dev");
    const base = await app.getUrl(), suffix = randomUUID().slice(0, 8), password = randomBytes(24).toString("base64url");
    let clock = new Date(), failMail = false;
    const delivered = [];
    app.get(RegistrationService).now = () => new Date(clock);
    app.get(SessionService).now = () => new Date(clock);
    app.get(LoginService).now = () => new Date(clock);
    app.get(OtpService).now = () => new Date(clock);
    app.get(OtpMailer).send = async (message) => { if (failMail) throw new Error("fake delivery failure"); delivered.push(message); };
    const email = (label) => { const value = `${label}-${suffix}@xiangqi.test`; emails.push(value); return value; };
    const post = async (path, body) => {
      const response = await fetch(base + `/auth/${path}`, { method: "POST", headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      assert.ok(response.headers.get("x-request-id") && response.headers.get("cache-control") === "no-store");
      assert.ok(!JSON.stringify(data).includes(password));
      assert.ok(!Object.hasOwn(data, "accessToken") && !Object.hasOwn(data, "code") || response.status >= 400);
      return { status: response.status, data };
    };
    const register = (address, nickname) => post("register", { email: address, nickname, password });
    const resend = (id) => post("verification/resend", { accountId: id });
    const verify = (id, code) => post("verification/verify", { accountId: id, code });
    const lastMail = (address) => delivered.filter((mail) => mail.email === address).at(-1);
    const row = async (id) => (await db.select().from(accounts).where(eq(accounts.id, id)))[0];
    const advance = (ms) => { clock = new Date(clock.getTime() + ms); };
    const [avatarBefore] = await db.select().from(avatars).where(eq(avatars.id, "default"));
    const a = email("same-name-a"), b = email("same-name-b");
    const collision = await Promise.all([register(a, `  Kỳ   THỦ ${suffix} `), register(b, `kỳ thủ ${suffix}`)]);
    assert.deepEqual(collision.map((r) => r.status).sort(), [200, 409]);
    assert.ok(collision.find((r) => r.status === 409).data.code === "NICKNAME_IN_USE");
    const winner = collision.find((r) => r.status === 200).data, winnerRow = await row(winner.accountId);
    assert.ok(winnerRow.avatarId === "default");
    const [avatarAfter] = await db.select().from(avatars).where(eq(avatars.id, "default"));
    assert.ok(avatarAfter);
    if (avatarBefore) assert.deepEqual(avatarAfter, avatarBefore); // Never overwrite existing reference data.
    assert.ok(winnerRow.nickname === winnerRow.nickname.trim() && !winnerRow.nickname.includes("  "));
    const originalDigest = winnerRow.passwordHash, originalDeadline = winnerRow.pendingExpiresAt.getTime(), count = delivered.length;
    const sameEmail = await post("register", { email: ` ${winnerRow.email.toUpperCase()} `, nickname: "Khác", password: randomBytes(24).toString("base64url") });
    assert.ok(sameEmail.status === 200 && sameEmail.data.accountId === winner.accountId && delivered.length === count);
    const preserved = await row(winner.accountId);
    assert.ok(preserved.passwordHash === originalDigest && preserved.nickname === winnerRow.nickname && preserved.pendingExpiresAt.getTime() === originalDeadline);
    const parallelEmail = email("parallel-email"), beforeParallel = delivered.length;
    const parallel = await Promise.all([register(parallelEmail, `Parallel A ${suffix}`), register(parallelEmail, `Parallel B ${suffix}`)]);
    assert.ok(parallel.every((r) => r.status === 200) && parallel[0].data.accountId === parallel[1].data.accountId);
    assert.ok(delivered.length === beforeParallel + 1);
    const [storedOtp] = await db.select().from(emailOtps).where(eq(emailOtps.accountId, winner.accountId));
    assert.ok(storedOtp.digest.length === 64 && storedOtp.digest !== lastMail(winnerRow.email).code);
    assert.ok(storedOtp.expiresAt.getTime() - storedOtp.sentAt.getTime() === 300000);
    assert.ok((await post("login", { email: winnerRow.email, password })).data.code === "EMAIL_NOT_VERIFIED");
    assert.ok((await post("verification/start", { email: winnerRow.email, password })).status === 200);
    assert.ok((await post("verification/start", { email: winnerRow.email, password: "wrong" })).status === 401);

    // Correct-code consumption and account verification are one transaction, only one winner.
    const otp = lastMail(winnerRow.email).code;
    const consumed = await Promise.all([verify(winner.accountId, otp), verify(winner.accountId, otp)]);
    assert.deepEqual(consumed.map((r) => r.status).sort(), [200, 409]);
    assert.ok((await db.select().from(sessions).where(eq(sessions.accountId, winner.accountId))).length === 0);
    assert.ok((await register(winnerRow.email, "Unused")).data.code === "EMAIL_IN_USE");

    const expiredEmail = email("expires"), expired = (await register(expiredEmail, `Expires ${suffix}`)).data;
    const expiredCode = lastMail(expiredEmail).code;
    advance(86400000);
    assert.ok((await verify(expired.accountId, expiredCode)).status === 410);
    const replacement = await register(expiredEmail, `Replaced ${suffix}`);
    assert.ok(replacement.status === 200 && replacement.data.accountId !== expired.accountId);
    assert.ok((await register(email("reuse-name"), `Expires ${suffix}`)).status === 200);
    const otherExpiredEmail = email("expired-name"), otherExpired = (await register(otherExpiredEmail, `Free name ${suffix}`)).data;
    advance(86400000);
    assert.ok((await register(email("claim-name"), `FREE NAME ${suffix}`)).status === 200);
    assert.ok(!(await row(otherExpired.accountId)));

    const attemptsEmail = email("attempts"), attempts = (await register(attemptsEmail, `Attempts ${suffix}`)).data;
    const correct = lastMail(attemptsEmail).code, wrong = correct === "000000" ? "111111" : "000000";
    const failures = await Promise.all(Array.from({ length: 5 }, () => verify(attempts.accountId, wrong)));
    assert.ok(failures.every((r) => r.status === 400));
    assert.ok(failures.filter((r) => r.data.code === "OTP_LOCKED").length === 1);
    assert.ok((await verify(attempts.accountId, correct)).status === 400);
    assert.ok((await db.select().from(emailOtps).where(eq(emailOtps.accountId, attempts.accountId)))[0].failedAttempts === 5);

    const ttlEmail = email("ttl"), ttl = (await register(ttlEmail, `TTL ${suffix}`)).data;
    advance(300000);
    assert.ok((await verify(ttl.accountId, lastMail(ttlEmail).code)).data.code === "OTP_EXPIRED");
    const quotaEmail = email("quota"), quota = (await register(quotaEmail, `Quota ${suffix}`)).data;
    const quotaDeadline = (await row(quota.accountId)).pendingExpiresAt.getTime(), oldCode = lastMail(quotaEmail).code;
    assert.ok((await resend(quota.accountId)).status === 429);
    advance(59999); assert.ok((await resend(quota.accountId)).status === 429);
    advance(1);
    const concurrentSends = await Promise.all([resend(quota.accountId), resend(quota.accountId)]);
    assert.deepEqual(concurrentSends.map((r) => r.status).sort(), [200, 429]);
    assert.ok((await verify(quota.accountId, oldCode)).status === 400);
    for (let index = 0; index < 3; index++) { advance(60000); assert.ok((await resend(quota.accountId)).status === 200); }
    advance(60000); assert.ok((await resend(quota.accountId)).status === 429);
    assert.ok((await row(quota.accountId)).pendingExpiresAt.getTime() === quotaDeadline);
    advance(3299999); assert.ok((await resend(quota.accountId)).status === 429);
    advance(1); assert.ok((await resend(quota.accountId)).status === 200);

    // Future password-reset rows consume the same email quota, independent of purpose.
    const sharedEmail = email("shared"), shared = (await register(sharedEmail, `Shared ${suffix}`)).data;
    advance(60000);
    await db.insert(emailSends).values(Array.from({ length: 4 }, () => ({ emailKey: sharedEmail, purpose: "password_reset", attemptedAt: clock, sentAt: clock, status: "sent" })));
    assert.ok((await resend(shared.accountId)).status === 429);

    failMail = true;
    const firstFailureEmail = email("first-failure"), firstFailure = await register(firstFailureEmail, `First fail ${suffix}`);
    assert.ok(firstFailure.status === 200 && firstFailure.data.delivery === "failed" && firstFailure.data.otpExpiresAt === null);
    assert.ok(!lastMail(firstFailureEmail));
    assert.equal((await db.select().from(emailOtps).where(eq(emailOtps.accountId, firstFailure.data.accountId))).length, 0);
    failMail = false;
    assert.ok((await resend(firstFailure.data.accountId)).data.delivery === "sent");
    const failureEmail = email("delivery"), failure = (await register(failureEmail, `Delivery ${suffix}`)).data;
    const validBeforeFailure = lastMail(failureEmail).code;
    advance(60000); failMail = true;
    const failedSend = await resend(failure.accountId);
    assert.ok(failedSend.status === 200 && failedSend.data.delivery === "failed");
    const sendsAfterFailure = await db.select().from(emailSends).where(and(eq(emailSends.emailKey, failureEmail), eq(emailSends.status, "failed")));
    assert.ok(sendsAfterFailure.length === 1 && sendsAfterFailure[0].sentAt === null);
    assert.ok(Date.parse(failedSend.data.resendAt) === clock.getTime());
    failMail = false;
    assert.ok((await verify(failure.accountId, validBeforeFailure)).status === 200);
    console.log("PASS OTP/registration: unique đồng thời, email pending bất biến, giải phóng 24h, digest/HMAC, TTL 5 phút, sai 5 lần, cooldown/rolling quota chung, resend/verify đồng thời, mail thất bại giữ mã cũ; không tạo session.");
  } finally {
    if (db && emails.length) {
      await db.delete(accounts).where(inArray(accounts.emailKey, emails));
      await db.delete(emailSends).where(inArray(emailSends.emailKey, emails));
    }
    await app.close();
  }
}
main().catch(() => { console.error("FAIL registration integration (payload/OTP không được in). Kiểm tra assertions và database local."); process.exitCode = 1; });

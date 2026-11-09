import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { LoginPipe } from "../src/auth/login/login.pipe";
import { hashPassword, verifyPassword } from "../src/auth/password";
import { RegistrationPipe } from "../src/auth/registration/registration.pipe";
import { VerificationPipe } from "../src/auth/otp/verification.pipe";

test("Auth input: chuẩn hóa email, giữ nguyên mật khẩu và từ chối input sai", () => {
  const pipe = new LoginPipe();
  const password = randomBytes(24).toString("base64url");
  assert.equal(pipe.transform({ email: "  Fixture@Example.test  ", password }).email, "fixture@example.test");
  assert.ok(pipe.transform({ email: "fixture@example.test", password }).password === password);
  for (const input of [null, [], {}, { email: "bad", password }, { email: "fixture@example.test", password: "" },
    { email: "fixture@example.test", password, extra: true }, { email: "fixture@example.test", password: "x".repeat(1025) }]) {
    assert.throws(() => pipe.transform(input));
  }
});

test("Auth password: scrypt có salt riêng, kiểm tra đúng/sai và digest không hợp lệ", async () => {
  const password = randomBytes(24).toString("base64url");
  const first = await hashPassword(password), second = await hashPassword(password);
  assert.ok(first !== second);
  assert.ok(!first.includes(password));
  assert.ok(await verifyPassword(password, first));
  assert.equal(await verifyPassword(randomBytes(24).toString("base64url"), first), false);
  assert.equal(await verifyPassword(password, undefined), false);
  assert.equal(await verifyPassword(password, "malformed"), false);
});

test("Registration/OTP input: biệt danh gộp khoảng trắng, email chuẩn hóa; không chấp nhận trường thừa hoặc mã sai dạng", () => {
  const registration = new RegistrationPipe();
  const valid = registration.transform({ nickname: "  Kỳ   THỦ  ", email: " Test@Example.test ", password: "input-only" });
  assert.equal(valid.nickname, "Kỳ THỦ"); assert.equal(valid.email, "test@example.test");
  assert.throws(() => registration.transform({ nickname: " ", email: "test@example.test", password: "input-only" }));
  assert.throws(() => registration.transform({ nickname: "Kỳ thủ", email: "test@example.test", password: "input-only", verified: true }));
  const verification = new VerificationPipe(), accountId = "6b477683-312d-4c43-812d-c9ae45a14b75";
  assert.equal(verification.transform({ accountId, code: "012345" }).code, "012345");
  for (const code of ["12345", "1234567", "abcdef", 123456]) assert.throws(() => verification.transform({ accountId, code }));
  assert.throws(() => verification.transform({ accountId, code: "012345", extra: true }));
});

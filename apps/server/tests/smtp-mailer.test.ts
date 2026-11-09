import test from "node:test";
import assert from "node:assert/strict";
import nodemailer from "nodemailer";
import { SmtpMailer, smtpConfig } from "../src/auth/otp/delivery/smtp-mailer";

const env = { SMTP_HOST: "smtp.gmail.com", SMTP_PORT: "465", SMTP_SECURE: "true", SMTP_USER: "sender@example.test", SMTP_PASSWORD: "fake-test-only", SMTP_FROM: "sender@example.test" };
test("SMTP: cấu hình thiếu biến báo tên, bắt buộc TLS và cùng địa chỉ gửi", () => {
  for (const name of Object.keys(env)) {
    const missing: NodeJS.ProcessEnv = { ...env }; delete missing[name];
    assert.throws(() => smtpConfig(missing), new RegExp(name));
  }
  const config = smtpConfig(env);
  assert.equal(config.secure, true); assert.equal(config.debug, false); assert.equal(config.logger, false);
  assert.equal(smtpConfig({ ...env, SMTP_PORT: "587", SMTP_SECURE: "false" }).requireTLS, true);
  assert.throws(() => smtpConfig({ ...env, SMTP_SECURE: "false" }));
  assert.throws(() => smtpConfig({ ...env, SMTP_FROM: "other@example.test" }));
});
test("SMTP: verify không gửi thư; chỉ chấp nhận đúng người nhận, truyền lỗi cho giao dịch OTP", async () => {
  const original = nodemailer.createTransport;
  let sent = 0, mode = "accepted", checked = false;
  const recipient = "player@example.test";
  nodemailer.createTransport = (() => ({
    verify: async () => { checked = true; },
    sendMail: async (mail: { to: string; text: string; subject: string }) => {
      sent++; assert.equal(mail.to, recipient); assert.match(mail.text, /5 phút/); assert.match(mail.subject, /Xác minh/);
      if (mode === "error") throw new Error("fake SMTP failure");
      return { accepted: mode === "accepted" ? [recipient] : [], rejected: mode === "accepted" ? [] : [recipient] };
    },
  })) as unknown as typeof nodemailer.createTransport;
  try {
    const sender = new SmtpMailer(smtpConfig(env));
    await sender.verify(); assert.ok(checked); assert.equal(sent, 0);
    const mail = { id: "test", email: recipient, code: "123456" };
    await sender.send(mail);
    mode = "rejected"; await assert.rejects(sender.send(mail));
    mode = "error"; await assert.rejects(sender.send(mail));
  } finally { nodemailer.createTransport = original; }
});

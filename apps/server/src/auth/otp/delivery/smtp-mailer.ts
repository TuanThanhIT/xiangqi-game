import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import type { OtpMail } from "./otp-mailer";

export function smtpConfig(env: NodeJS.ProcessEnv = process.env): SMTPTransport.Options & { from: string } {
  for (const name of ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"]) {
    if (!env[name]?.trim()) throw new Error(`Thiếu ${name} trong apps/server/.env khi OTP_MAIL_MODE=smtp.`);
  }
  const port = Number(env.SMTP_PORT);
  if (![465, 587].includes(port) || !["true", "false"].includes(env.SMTP_SECURE!)) throw new Error("SMTP_PORT phải là 465 hoặc 587; SMTP_SECURE phải là true hoặc false.");
  const secure = env.SMTP_SECURE === "true";
  if (secure !== (port === 465)) throw new Error("SMTP dùng 465/secure=true hoặc 587/secure=false với STARTTLS bắt buộc.");
  const email = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
  if (!email.test(env.SMTP_USER!) || !email.test(env.SMTP_FROM!) || env.SMTP_FROM !== env.SMTP_USER) throw new Error("SMTP_FROM phải là địa chỉ email trùng SMTP_USER.");
  return { host: env.SMTP_HOST!.trim(), port, secure, requireTLS: !secure,
    auth: { user: env.SMTP_USER!, pass: env.SMTP_PASSWORD! }, from: env.SMTP_FROM!,
    connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 8000,
    logger: false, debug: false, tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    disableFileAccess: true, disableUrlAccess: true };
}

export class SmtpMailer {
  private readonly transport;
  constructor(private readonly config = smtpConfig()) { this.transport = nodemailer.createTransport(config); }
  async verify(): Promise<void> { await this.transport.verify(); }
  async send(mail: OtpMail): Promise<void> {
    const reset = mail.purpose === "password_reset";
    const result = await this.transport.sendMail({
      from: { name: "Xiangqi Game", address: this.config.from }, to: mail.email,
      subject: reset ? "Mã đặt lại mật khẩu Xiangqi Game" : "Xác minh email đăng ký Xiangqi Game",
      text: `Xin chào,\n\nMã ${reset ? "đặt lại mật khẩu" : "xác minh email đăng ký"} Xiangqi Game của bạn là: ${mail.code}\n\nMã có hiệu lực 5 phút. Không chia sẻ mã này với bất kỳ ai.\nNếu bạn không ${reset ? "yêu cầu đặt lại mật khẩu" : "đăng ký tài khoản"}, vui lòng bỏ qua email này.\n\nXiangqi Game`,
    });
    if (!result.accepted.some((address) => typeof address === "string" && address.toLowerCase() === mail.email.toLowerCase()) || result.rejected.length) throw new Error("SMTP_DELIVERY_REJECTED");
  }
}

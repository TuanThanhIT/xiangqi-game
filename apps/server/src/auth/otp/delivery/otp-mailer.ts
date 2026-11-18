import { Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { databaseUrl, loadServerEnv } from "../../../db/config";
import { SmtpMailer, smtpConfig } from "./smtp-mailer";

export const mailboxDirectory = () => resolve(__dirname, "../../../../../../.tmp/otp-mailbox");
export const mailboxFilename = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex") + ".json";
export interface OtpMail { id: string; email: string; code: string; purpose?: "email_verification"|"password_reset" }

@Injectable()
export class OtpMailer {
  onModuleInit(): void {
    loadServerEnv();
    const mode = process.env.OTP_MAIL_MODE ?? (process.env.NODE_ENV === "production" ? "" : "local");
    if (mode === "smtp") { smtpConfig(); return; }
    if (mode !== "local" || process.env.NODE_ENV === "production") throw new Error("Cần cấu hình OTP_MAIL_MODE=smtp cho production; chỉ hỗ trợ local hoặc smtp.");
  }
  async send(mail: OtpMail): Promise<void> {
    loadServerEnv();
    if (process.env.OTP_MAIL_MODE === "smtp") { await new SmtpMailer().send(mail); return; }
    if (process.env.NODE_ENV === "production" || (process.env.OTP_MAIL_MODE ?? "local") !== "local") throw new Error("MAIL_NOT_CONFIGURED");
    const target = new URL(databaseUrl());
    if (decodeURIComponent(target.pathname) !== "/xiangqi_dev" || !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) throw new Error("LOCAL_MAIL_ONLY");
    const directory = mailboxDirectory();
    await mkdir(directory, { recursive: true });
    const temporary = resolve(directory, `${randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify({ ...mail, createdAt: new Date().toISOString() }), { mode: 0o600, flag: "wx" });
    await rename(temporary, resolve(directory, mailboxFilename(mail.email)));
    // No OTP, address or mail payload in normal application logs.
  }
}

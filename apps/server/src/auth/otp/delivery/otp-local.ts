import "reflect-metadata";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import { sql } from "drizzle-orm";
import { DatabaseModule } from "../../../db/database.module";
import { DatabaseService } from "../../../db/database.service";
import { loadServerEnv } from "../../../db/config";
import { mailboxDirectory, mailboxFilename } from "./otp-mailer";

async function main(): Promise<void> {
  loadServerEnv();
  if (process.env.NODE_ENV === "production" || (process.env.OTP_MAIL_MODE ?? "local") !== "local") throw new Error("LOCAL_ONLY");
  const email = process.argv[2];
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("EMAIL_REQUIRED");
  const app = await NestFactory.createApplicationContext(DatabaseModule, { logger: false, abortOnError: false });
  try {
    const target = await app.get(DatabaseService).db.execute(sql`select current_database() as name`);
    if (target.rows[0]?.name !== "xiangqi_dev") throw new Error("LOCAL_ONLY");
    const mail = JSON.parse(await readFile(resolve(mailboxDirectory(), mailboxFilename(email)), "utf8")) as { code: string };
    // Explicit local mailbox reader only; never invoke from an HTTP endpoint or normal logger.
    process.stdout.write(`OTP local (chỉ dùng development): ${mail.code}\n`);
  } finally { await app.close(); }
}
void main().catch(() => { console.error("Không đọc được OTP local. Kiểm tra email, cấu hình local và việc gửi mã."); process.exitCode = 1; });

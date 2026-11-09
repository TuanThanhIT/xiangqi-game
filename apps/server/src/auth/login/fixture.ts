import "reflect-metadata";
import { randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import { eq, sql } from "drizzle-orm";
import { DatabaseModule } from "../../db/database.module";
import { DatabaseService } from "../../db/database.service";
import { loadServerEnv } from "../../db/config";
import { accounts } from "../../db/schema";
import { hashPassword } from "../password";

export const FIXTURE_EMAIL = "login.fixture@xiangqi.test";
const FIXTURE_ID = "6b477683-312d-4c43-812d-c9ae45a14b75";
async function main(): Promise<void> {
  loadServerEnv();
  if (process.env.NODE_ENV === "production") throw new Error("LOCAL_ONLY");
  const app = await NestFactory.createApplicationContext(DatabaseModule, { logger: false, abortOnError: false });
  try {
    const { db } = app.get(DatabaseService);
    const target = await db.execute(sql`select current_database() as name`);
    if (target.rows[0]?.name !== "xiangqi_dev") throw new Error("LOCAL_ONLY");
    const [existing] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.emailKey, FIXTURE_EMAIL));
    if (existing && existing.id !== FIXTURE_ID) throw new Error("FIXTURE_CONFLICT");
    let password = process.env.AUTH_FIXTURE_PASSWORD;
    if (!password) {
      password = randomBytes(24).toString("base64url");
      appendFileSync(resolve(__dirname, "../../../.env"), `\nAUTH_FIXTURE_PASSWORD=${password}\n`);
    }
    const passwordHash = await hashPassword(password);
    await db.insert(accounts).values({ id: FIXTURE_ID, email: FIXTURE_EMAIL, nickname: "Kỳ thủ thử nghiệm", passwordHash, emailVerifiedAt: new Date() })
      .onConflictDoUpdate({ target: accounts.id, set: { passwordHash, emailVerifiedAt: new Date() } });
    console.log("Fixture local đã sẵn sàng. Email: login.fixture@xiangqi.test. Mật khẩu xem AUTH_FIXTURE_PASSWORD trong apps/server/.env; không hiển thị ở log.");
  } finally { await app.close(); }
}
if (require.main === module) void main().catch(() => { console.error("Không tạo được fixture local; kiểm tra database đích, quyền hoặc dữ liệu fixture xung đột."); process.exitCode = 1; });

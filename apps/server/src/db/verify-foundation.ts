import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import { sql } from "drizzle-orm";
import { AppModule } from "../app.module";
import { DatabaseService } from "./database.service";
import { accounts, avatars, sessions } from "./schema";

async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  try {
    await app.listen(0, "127.0.0.1");
    const health = await fetch(`${await app.getUrl()}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });
    const { db } = app.get(DatabaseService);
    const target = await db.execute(sql`select current_database() as name`);
    assert.equal(target.rows[0]?.name, "xiangqi_dev");
    const rollback = new Error("ROLLBACK_VERIFICATION");
    await assert.rejects(db.transaction(async (tx) => {
      assert.equal((await tx.select().from(avatars)).some((a) => a.id === "default"), true);
      const key = randomUUID();
      const [account] = await tx.insert(accounts).values({
        email: ` ${key}@EXAMPLE.COM `, nickname: `  Người   Chơi ${key}  `, passwordHash: "test-hash",
      }).returning();
      assert.equal(account.emailKey, `${key}@example.com`);
      assert.equal(account.nicknameKey, `người chơi ${key}`);
      assert.equal(account.avatarId, "default");
      assert.equal(account.pendingExpiresAt.getTime() - account.createdAt.getTime(), 24 * 60 * 60 * 1000);
      const uniqueViolation = (e: unknown): boolean => {
        const err = e as { code?: string; cause?: { code?: string } };
        return (err.code ?? err.cause?.code) === "23505";
      };
      await assert.rejects(tx.transaction((nested) => nested.insert(accounts).values({
        email: `${key}@example.com`, nickname: key, passwordHash: "test-hash",
      })), uniqueViolation);
      await assert.rejects(tx.transaction((nested) => nested.insert(accounts).values({
        email: `${key}-other@example.com`, nickname: `NGƯỜI CHƠI ${key}`, passwordHash: "test-hash",
      })), uniqueViolation);
      await tx.insert(accounts).values({ email: `${key}-accent@example.com`, nickname: `Nguoi Choi ${key}`, passwordHash: "test-hash" });
      const [session] = await tx.insert(sessions).values({ accountId: account.id, refreshTokenHash: key }).returning();
      assert.equal(session.expiresAt.getTime() - session.createdAt.getTime(), 7 * 24 * 60 * 60 * 1000);
      throw rollback;
    }), (e: unknown) => e === rollback);
    console.log("PASS: /health; avatar mặc định; khóa chuẩn hóa duy nhất, phân biệt dấu; hạn chờ 24h và phiên 7 ngày. Dữ liệu thử đã rollback.");
  } finally { await app.close(); }
}

void main().catch(() => {
  console.error("Xác minh nền DB thất bại; không hiển thị dữ liệu hoặc lỗi driver để tránh lộ bí mật.");
  process.exitCode = 1;
});

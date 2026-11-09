import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { sql } from "drizzle-orm";
import { DatabaseModule } from "./database.module";
import { DatabaseService } from "./database.service";

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(DatabaseModule, { logger: false, abortOnError: false });
  try {
    const { db } = app.get(DatabaseService);
    const result = await db.execute(sql`select 1 as ok, current_database() as database, current_user as role`);
    console.log(JSON.stringify(result.rows));
    const tables = await db.execute(sql`select schemaname, tablename from pg_tables where schemaname not in ('pg_catalog', 'information_schema') order by schemaname, tablename`);
    console.log("Tables:", JSON.stringify(tables.rows));
    const history = tables.rows.find((r) => r.tablename === "__drizzle_migrations");
    if (history) {
      const rows = await db.execute(sql`select id, hash, created_at from ${sql.identifier(String(history.schemaname))}.${sql.identifier("__drizzle_migrations")} order by id`);
      console.log("Migrations:", JSON.stringify(rows.rows));
    }
    if (result.rows[0]?.database !== "xiangqi_dev") throw new Error("WRONG_DATABASE");
  } finally { await app.close(); }
}

void main().catch((error: unknown) => {
  // Avoid printing driver errors that might contain connection credentials.
  const code = (error as { code?: string }).code;
  console.error("Kiểm tra DB thất bại.", code ? `Mã: ${code}` : "Kiểm tra cấu hình hoặc database đích.");
  process.exitCode = 1;
});

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadEnvFile } from "node:process";

// Resolve from this module, independent of the command's working directory.
export function loadServerEnv(): void {
  let root = __dirname;
  while (true) {
    const manifest = resolve(root, "package.json");
    if (existsSync(manifest) && JSON.parse(readFileSync(manifest, "utf8")).name === "@xiangqi/server") break;
    const parent = dirname(root);
    if (parent === root) throw new Error("Không tìm thấy thư mục backend.");
    root = parent;
  }
  const envPath = resolve(root, ".env");
  if (existsSync(envPath)) loadEnvFile(envPath);
}

export function databaseUrl(): string {
  loadServerEnv();
  const value = process.env.DATABASE_URL;
  if (!value?.trim()) throw new Error("Thiếu DATABASE_URL trong apps/server/.env hoặc môi trường.");
  return value;
}

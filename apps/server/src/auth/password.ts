import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const options = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, options, (error, key) => error ? reject(error) : resolve(key)));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password, salt);
  return `scrypt$32768$8$1$${salt}$${key.toString("hex")}`;
}

// Work even for absent accounts so they follow the same expensive verification path.
const dummy = `scrypt$32768$8$1$${"0".repeat(32)}$${"0".repeat(128)}`;
export async function verifyPassword(password: string, encoded: string | undefined): Promise<boolean> {
  const valid = typeof encoded === "string" && /^scrypt\$32768\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/.test(encoded);
  const parts = (valid ? encoded! : dummy).split("$");
  const candidate = await derive(password, parts[4]);
  return timingSafeEqual(candidate, Buffer.from(parts[5], "hex")) && valid;
}

import { loadServerEnv } from "../db/config";

export const REFRESH_COOKIE = "xq_refresh";
export const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
export const ACCESS_SECONDS = 15 * 60;
export function authConfig(): { key: Uint8Array; origins: string[]; secure: boolean } {
  loadServerEnv();
  const key = Buffer.from(process.env.AUTH_ACCESS_SECRET ?? "", "base64url");
  if (key.length < 32) throw new Error("Cần AUTH_ACCESS_SECRET ngẫu nhiên tối thiểu 32 byte trong apps/server/.env.");
  const secure = process.env.NODE_ENV === "production";
  const configured = process.env.AUTH_WEB_ORIGIN;
  if (secure && !configured) throw new Error("Cần AUTH_WEB_ORIGIN trên production.");
  const origins = configured ? [new URL(configured).origin] : ["http://localhost:3000", "http://127.0.0.1:3000"];
  if (secure && !origins.every((origin) => origin.startsWith("https://"))) throw new Error("Production yêu cầu HTTPS.");
  return { key, origins, secure };
}

export function refreshCookie(token: string, expiresAt: Date): string {
  const { secure } = authConfig();
  return `${REFRESH_COOKIE}=${token}; Path=/api/auth; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}${secure ? "; Secure" : ""}`;
}
export function clearRefreshCookie(): string {
  return `${REFRESH_COOKIE}=; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${authConfig().secure ? "; Secure" : ""}`;
}
export function readRefreshCookie(cookie: string | undefined): string | null {
  if (!cookie || cookie.length > 8192) return null;
  const matches = cookie.split(";").map((part) => part.trim()).filter((part) => part.startsWith(`${REFRESH_COOKIE}=`));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(REFRESH_COOKIE.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

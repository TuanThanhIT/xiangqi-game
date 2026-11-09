// Integration tests deliberately load the built CommonJS output, including jose at runtime.
require("reflect-metadata");
const assert = require("node:assert/strict");
const { randomBytes, randomUUID } = require("node:crypto");
const { NestFactory } = require("@nestjs/core");
const { eq, sql } = require("drizzle-orm");
const { AppModule } = require("../dist/app.module.js");
const { configureHttp } = require("../dist/configure-http.js");
const { DatabaseService } = require("../dist/db/database.service.js");
const { accounts, sessions } = require("../dist/db/schema.js");
const { LoginService } = require("../dist/auth/login/login.service.js");
const { SessionService, refreshDigest } = require("../dist/auth/session/session.service.js");
const { hashPassword } = require("../dist/auth/password.js");
const { SESSION_MS, authConfig, refreshCookie } = require("../dist/auth/auth.config.js");

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false, bodyParser: false });
  let db;
  const ids = [];
  try {
    configureHttp(app); await app.listen(0, "127.0.0.1");
    const base = await app.getUrl();
    db = app.get(DatabaseService).db;
    assert.ok((await db.execute(sql`select current_database() as name`)).rows[0].name === "xiangqi_dev");
    let clock = new Date(Math.floor(Date.now() / 1000) * 1000);
    app.get(SessionService).now = () => new Date(clock);
    app.get(LoginService).now = () => new Date(clock);
    const password = randomBytes(24).toString("base64url"), suffix = randomUUID();
    for (const verified of [true, false]) {
      const id = randomUUID(); ids.push(id);
      await db.insert(accounts).values({ id, email: `${verified ? "verified" : "pending"}-${suffix}@xiangqi.test`,
        nickname: `${verified ? "Verified" : "Pending"} ${suffix}`, passwordHash: await hashPassword(password), emailVerifiedAt: verified ? clock : null });
    }
    const origin = "http://localhost:3000";
    const post = (path, body, cookie, requestOrigin = origin) => fetch(base + path, { method: "POST", headers: {
      "Content-Type": "application/json", ...(requestOrigin ? { Origin: requestOrigin } : {}), ...(cookie ? { Cookie: cookie } : {}),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const credentials = { email: `verified-${suffix}@xiangqi.test`, password };
    async function error(response, status, code) {
      assert.ok(response.status === status);
      const data = await response.json();
      assert.ok(data.code === code && data.statusCode === status);
      assert.deepEqual(Object.keys(data).sort(), ["code", "message", "statusCode"]);
      assert.ok(response.headers.get("x-request-id"));
      assert.ok(response.headers.get("cache-control") === "no-store");
      assert.ok(!JSON.stringify(data).includes(password));
      return data;
    }
    const wrong = await error(await post("/auth/login", { ...credentials, password: "wrong-password" }), 401, "INVALID_CREDENTIALS");
    const missing = await error(await post("/auth/login", { ...credentials, email: `missing-${suffix}@xiangqi.test` }), 401, "INVALID_CREDENTIALS");
    assert.deepEqual(wrong, missing);
    await error(await post("/auth/login", { email: `pending-${suffix}@xiangqi.test`, password: "wrong-password" }), 401, "INVALID_CREDENTIALS");
    await error(await post("/auth/login", { email: `pending-${suffix}@xiangqi.test`, password }), 403, "EMAIL_NOT_VERIFIED");
    await error(await post("/auth/login", credentials, undefined, "https://untrusted.example"), 403, "ORIGIN_NOT_ALLOWED");
    await error(await post("/auth/login", credentials, undefined, null), 403, "ORIGIN_NOT_ALLOWED");
    async function login() {
      const response = await post("/auth/login", credentials);
      assert.ok(response.status === 200);
      const setCookie = response.headers.getSetCookie()[0];
      assert.ok(setCookie.includes("HttpOnly") && setCookie.includes("SameSite=Lax") && setCookie.includes("Path=/api/auth"));
      const cookie = setCookie.split(";")[0];
      const data = await response.json();
      assert.deepEqual(Object.keys(data).sort(), ["accessToken", "expiresAt", "profile"]);
      assert.deepEqual(Object.keys(data.profile).sort(), ["avatar", "email", "id", "nickname"]);
      const row = (await db.select().from(sessions).where(eq(sessions.refreshTokenHash, refreshDigest(cookie.split("=")[1]))))[0];
      assert.ok(row && row.refreshTokenHash !== cookie.split("=")[1]);
      assert.ok(row.expiresAt.getTime() - row.createdAt.getTime() === SESSION_MS);
      assert.ok(Date.parse(data.expiresAt) - clock.getTime() <= 900000);
      return { cookie, data, row };
    }
    const first = await login(), independent = await login();
    assert.ok(first.cookie !== independent.cookie);
    const me = (token) => fetch(base + "/me", { headers: { Authorization: `Bearer ${token}` } });
    assert.ok((await me(first.data.accessToken)).status === 200);
    await error(await me(first.data.accessToken + "x"), 401, "UNAUTHENTICATED");
    for (const response of await Promise.all([post("/auth/refresh", undefined, first.cookie), post("/auth/refresh", undefined, first.cookie)])) {
      assert.ok(response.status === 200 && response.headers.getSetCookie().length === 0);
      await response.json();
    }
    // Discard a successful refresh response, then retry with the unchanged token.
    await post("/auth/refresh", undefined, first.cookie);
    assert.ok((await post("/auth/refresh", undefined, first.cookie)).status === 200);
    const unchanged = (await db.select().from(sessions).where(eq(sessions.id, first.row.id)))[0];
    assert.ok(unchanged.expiresAt.getTime() === first.row.expiresAt.getTime() && unchanged.refreshTokenHash === first.row.refreshTokenHash);
    const loggedOut = await post("/auth/logout", undefined, first.cookie);
    assert.ok(loggedOut.status === 200 && loggedOut.headers.getSetCookie()[0].includes("Max-Age=0"));
    await error(await me(first.data.accessToken), 401, "SESSION_EXPIRED");
    await error(await post("/auth/refresh", undefined, first.cookie), 401, "SESSION_EXPIRED");
    assert.ok((await me(independent.data.accessToken)).status === 200);
    assert.ok((await post("/auth/refresh", undefined, independent.cookie)).status === 200);
    const initialClock = clock;
    clock = new Date(initialClock.getTime() + 899000);
    assert.ok((await me(independent.data.accessToken)).status === 200);
    clock = new Date(initialClock.getTime() + 900000);
    await error(await me(independent.data.accessToken), 401, "UNAUTHENTICATED");
    assert.ok((await post("/auth/refresh", undefined, independent.cookie)).status === 200);
    clock = new Date(independent.row.expiresAt.getTime() - 1000);
    const nearExpiry = await (await post("/auth/refresh", undefined, independent.cookie)).json();
    assert.ok(Date.parse(nearExpiry.expiresAt) <= independent.row.expiresAt.getTime());
    assert.ok((await me(nearExpiry.accessToken)).status === 200);
    clock = new Date(independent.row.expiresAt);
    await error(await me(nearExpiry.accessToken), 401, "UNAUTHENTICATED");
    const expired = await post("/auth/refresh", undefined, independent.cookie);
    await error(expired, 401, "SESSION_EXPIRED");
    assert.ok(expired.headers.getSetCookie()[0].includes("Max-Age=0"));
    const oldEnv = { node: process.env.NODE_ENV, origin: process.env.AUTH_WEB_ORIGIN };
    try {
      process.env.NODE_ENV = "production"; process.env.AUTH_WEB_ORIGIN = "https://game.example.test";
      assert.ok(authConfig().secure);
      assert.ok(refreshCookie("not-a-real-token", new Date()).includes("; Secure"));
    } finally {
      if (oldEnv.node === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv.node;
      if (oldEnv.origin === undefined) delete process.env.AUTH_WEB_ORIGIN; else process.env.AUTH_WEB_ORIGIN = oldEnv.origin;
    }
    console.log("PASS auth built CommonJS + jose: đúng/sai mật khẩu, chưa xác minh, Origin, JWT/guard, digest/cookie, refresh đồng thời/mất response, hạn chính xác 7 ngày, logout cô lập phiên.");
  } finally {
    if (db) for (const id of ids) await db.delete(accounts).where(eq(accounts.id, id));
    await app.close();
  }
}
main().catch(() => { console.error("FAIL auth integration. Không in payload hoặc lỗi có thể chứa bí mật."); process.exitCode = 1; });

import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loader } from "./load-source.mjs";

const profile = { id: randomUUID(), email: "test@xiangqi.test", nickname: "Kỳ thủ", avatar: { id: "default", name: "Mặc định", assetPath: null } };
const result = () => ({ accessToken: "test-token-in-memory-only", expiresAt: new Date(Date.now() + 900000).toISOString(), profile });
test("Auth proxy: Origin, whitelist cookie, Set-Cookie riêng, no-store/requestId; không retry", async () => {
  const original = globalThis.fetch;
  const proxy = loader({ "../rooms/room-config": { getBackendHttpOrigin: () => "http://localhost:3001" } })("apps/web/src/features/auth/auth-proxy.ts").proxyAuth;
  const id = randomUUID(), token = "A".repeat(43), cookie = `xq_refresh=${token}; Path=/api/auth; HttpOnly; SameSite=Lax; Expires=Fri, 13 Nov 2026 12:00:00 GMT`;
  const request = (origin = "http://localhost:3000") => new Request("http://localhost:3000/api/auth/refresh", { method: "POST", headers: { Origin: origin, Cookie: `unrelated=private; xq_refresh=${token}`, "x-request-id": id } });
  let calls = 0;
  try {
    globalThis.fetch = async (_url, options) => {
      calls++;
      assert.equal(options.headers.Cookie, `xq_refresh=${token}`);
      assert.equal(options.headers.Origin, "http://localhost:3000");
      assert.equal(options.headers["x-request-id"], id);
      return Response.json(result(), { headers: { "Set-Cookie": cookie, "x-request-id": id } });
    };
    const response = await proxy(request(), "refresh");
    assert.equal(response.status, 200);
    assert.deepEqual(response.headers.getSetCookie(), [cookie]);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-request-id"), id);
    assert.equal((await response.json()).profile.nickname, profile.nickname);
    assert.equal((await proxy(request("https://untrusted.example"), "refresh")).status, 403);
    assert.equal(calls, 1);
    globalThis.fetch = async () => { calls++; throw new Error("do-not-log"); };
    assert.equal((await proxy(request(), "refresh")).status, 502);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; }
});

test("Auth client: refresh single-flight, token chỉ bộ nhớ, phân biệt mạng và phiên hết hạn", async () => {
  const original = globalThis.fetch;
  const auth = loader()("apps/web/src/features/auth/auth-client.ts");
  let refreshes = 0;
  try {
    globalThis.fetch = async (path, options) => {
      assert.equal(options.cache, "no-store");
      if (path.endsWith("refresh")) { refreshes++; await new Promise((done) => setTimeout(done, 10)); return Response.json(result()); }
      assert.ok(options.headers.Authorization.startsWith("Bearer "));
      return Response.json(profile);
    };
    const users = await Promise.all([auth.loadProfile(), auth.loadProfile()]);
    assert.equal(refreshes, 1); assert.equal(users[0].nickname, profile.nickname);
    auth.forgetAuth();
    globalThis.fetch = async () => { throw new Error("network"); };
    await assert.rejects(auth.loadProfile(), (error) => error.status === 0 && error.code === "NETWORK_ERROR");
    globalThis.fetch = async () => Response.json({ code: "SESSION_EXPIRED", statusCode: 401, message: "expired" }, { status: 401 });
    await assert.rejects(auth.loadProfile(), (error) => error.status === 401 && error.code === "SESSION_EXPIRED");
  } finally { globalThis.fetch = original; auth.forgetAuth(); }
});

import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loader } from "./load-source.mjs";

test("Registration proxy: state che email, chặn field OTP ngoài contract; không tự retry", async () => {
  const original = globalThis.fetch;
  const load = loader({ "../rooms/room-config": { getBackendHttpOrigin: () => "http://localhost:3001" } });
  const proxy = load("apps/web/src/features/auth/auth-proxy.ts").proxyAuth;
  const state = { status: "pending_verification", accountId: randomUUID(), maskedEmail: "t***@example.test",
    pendingExpiresAt: new Date(Date.now() + 86400000).toISOString(), otpExpiresAt: null, resendAt: new Date().toISOString(), delivery: "not_sent" };
  const request = () => new Request("http://localhost:3000/api/auth/verification/status", { method: "POST", headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" }, body: JSON.stringify({ accountId: state.accountId }) });
  let calls = 0;
  try {
    globalThis.fetch = async () => { calls++; return Response.json(state); };
    const valid = await proxy(request(), "verification/status");
    assert.equal(valid.status, 200); assert.deepEqual(await valid.json(), state);
    globalThis.fetch = async () => { calls++; return Response.json({ ...state, code: "never-forward-this" }); };
    const invalid = await proxy(request(), "verification/status");
    assert.equal(invalid.status, 502); assert.ok(!(await invalid.text()).includes("never-forward-this"));
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; }
});

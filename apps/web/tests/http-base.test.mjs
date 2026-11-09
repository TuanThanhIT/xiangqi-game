import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loader } from "./load-source.mjs";

test("Proxy Base: requestId xuyên suốt, giữ body/status V1, không chuyển cookie hay retry POST", async () => {
  const original = globalThis.fetch;
  const proxy = loader({ "./room-config": { getBackendHttpOrigin: () => "http://localhost:3001" } })("apps/web/src/features/rooms/room-proxy.ts").proxyRoomRequest;
  const id = randomUUID(), upstreamId = randomUUID();
  const request = (body = { nickname: "Base" }, requestId = id) => new Request("http://localhost/api/rooms", {
    method: "POST", body: JSON.stringify(body), headers: { "x-request-id": requestId, Cookie: "private", Authorization: "private" },
  });
  let calls = 0;
  try {
    const session = { roomCode: "ABC234", seat: "red", nickname: "Base", seatToken: "A".repeat(43) };
    globalThis.fetch = async (_url, options) => {
      calls++;
      assert.deepEqual(options.headers, { "Content-Type": "application/json", "x-request-id": id });
      assert.equal(options.method, "POST");
      assert.equal(options.redirect, "error");
      return Response.json(session, { status: 201, headers: { "x-request-id": id } });
    };
    let response = await proxy(request());
    assert.equal(response.status, 201);
    assert.equal(response.headers.get("x-request-id"), id);
    assert.deepEqual(await response.json(), session);
    assert.equal(calls, 1);
    globalThis.fetch = async () => {
      calls++;
      return Response.json({ statusCode: 409, code: "ROOM_FULL", message: "upstream message" }, {
        status: 409, headers: { "x-request-id": upstreamId },
      });
    };
    response = await proxy(request(), "ABC234");
    assert.equal(response.status, 409);
    assert.equal(response.headers.get("x-request-id"), upstreamId);
    assert.deepEqual(await response.json(), { statusCode: 409, code: "ROOM_FULL", message: "Phòng đã đủ hai người." });
    const before = calls;
    response = await proxy(request({}, "arbitrary-header-secret"));
    assert.equal(response.status, 400);
    assert.match(response.headers.get("x-request-id"), /^[0-9a-f-]{36}$/);
    assert.equal(calls, before);
    for (const [name, status, code] of [["TimeoutError", 504, "UPSTREAM_TIMEOUT"], ["Error", 502, "UPSTREAM_UNAVAILABLE"]]) {
      globalThis.fetch = async () => { calls++; throw Object.assign(new Error("private"), { name }); };
      const count = calls;
      response = await proxy(request());
      assert.equal(response.status, status);
      assert.equal(response.headers.get("x-request-id"), id);
      const data = await response.json();
      assert.equal(data.code, code);
      assert.ok(!data.message.includes("private"));
      assert.equal(calls, count + 1);
    }
  } finally { globalThis.fetch = original; }
});

test("Client Base: lỗi có requestId/status, giữ thông báo V1 và không retry", async () => {
  const original = globalThis.fetch;
  const { requestRoom, RoomRequestError } = loader()("apps/web/src/features/rooms/room-api.ts");
  const id = randomUUID();
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls++;
      return Response.json({ statusCode: 404, code: "ROOM_NOT_FOUND", message: "ignored" }, {
        status: 404, headers: { "x-request-id": id },
      });
    };
    await assert.rejects(requestRoom("Base", "ABC234", new AbortController().signal), (error) => {
      assert.ok(error instanceof RoomRequestError);
      assert.equal(error.message, "Phòng không tồn tại.");
      assert.equal(error.requestId, id);
      assert.equal(error.status, 404);
      return true;
    });
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { configureHttp } from "../src/configure-http";
import type { JsonParserApplication } from "../src/configure-http";
import { RoomsService } from "../src/rooms/rooms.service";

test("HTTP Base: requestId trên health, pipe, parser, 404 và lỗi nội bộ; giữ body V1", async () => {
  const app = await NestFactory.create<JsonParserApplication>(AppModule, { logger: false, abortOnError: false, bodyParser: false });
  try {
    configureHttp(app);
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl();
    const health = await fetch(base + "/health");
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });
    const id = health.headers.get("x-request-id");
    assert.match(id!, /^[0-9a-f-]{36}$/);
    const second = await fetch(base + "/health");
    assert.notEqual(second.headers.get("x-request-id"), id);
    for (const [path, body, status, code] of [
      ["/rooms", "{}", 400, "INVALID_REQUEST"],
      ["/rooms", "{", 400, "INVALID_JSON"],
      ["/missing", undefined, 404, "NOT_FOUND"],
    ] as const) {
      const expectedId = randomUUID();
      const response = await fetch(base + path, {
        method: body === undefined ? "GET" : "POST", body,
        headers: { "Content-Type": "application/json", "x-request-id": expectedId },
      });
      assert.equal(response.status, status);
      assert.equal(response.headers.get("x-request-id"), expectedId);
      const data = await response.json() as { statusCode: number; code: string };
      assert.deepEqual(Object.keys(data).sort(), ["code", "message", "statusCode"]);
      assert.equal(data.statusCode, status);
      assert.equal(data.code, code);
    }
    const invalid = await fetch(base + "/health", { headers: { "x-request-id": "untrusted-secret" } });
    assert.notEqual(invalid.headers.get("x-request-id"), "untrusted-secret");
    assert.match(invalid.headers.get("x-request-id")!, /^[0-9a-f-]{36}$/);
    app.get(RoomsService).create = () => { throw new Error("password=secret cookie=secret"); };
    const internal = await fetch(base + "/rooms", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nickname: "Base" }),
    });
    assert.equal(internal.status, 500);
    assert.ok(internal.headers.get("x-request-id"));
    assert.deepEqual(await internal.json(), { statusCode: 500, code: "INTERNAL_ERROR", message: "Đã xảy ra lỗi nội bộ." });
  } finally { await app.close(); }
});

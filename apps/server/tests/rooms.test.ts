import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { NestFactory } from "@nestjs/core";
import { HttpException } from "@nestjs/common";
import { configureHttp } from "../src/configure-http";
import type { JsonParserApplication } from "../src/configure-http";
import { AppModule } from "../src/app.module";
import { RoomsService, generateRoomCode } from "../src/rooms/rooms.service";
import type { Room, SeatResponse } from "../src/rooms/rooms.types";

function internalRooms(service: RoomsService): Map<string, Room> {
  // Chỉ dùng trong test, không tạo API xem phòng.
  return (service as unknown as { rooms: Map<string, Room> }).rooms;
}
function errorCode(error: unknown, code: string): boolean {
  assert.ok(error instanceof HttpException);
  const body = error.getResponse() as { code: string };
  assert.equal(body.code, code);
  return true;
}

test("Service: mã crypto đúng định dạng, token riêng, không lộ phòng trong response", () => {
  for (let i = 0; i < 20; i++) assert.ok(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(generateRoomCode()));
  const service = new RoomsService(() => "ABC234");
  const red = service.create("Đỏ");
  const black = service.join(red.roomCode, "Đen");
  assert.equal(red.seat, "red"); assert.equal(black.seat, "black");
  assert.ok(red.seatToken !== black.seatToken);
  for (const response of [red, black]) {
    assert.deepEqual(Object.keys(response).sort(), ["nickname", "roomCode", "seat", "seatToken"]);
    assert.ok(/^[A-Za-z0-9_-]{43}$/.test(response.seatToken));
  }
  assert.throws(() => service.join(red.roomCode, "Khác"), (e) => errorCode(e, "ROOM_FULL"));
  assert.equal(internalRooms(service).get(red.roomCode)!.black!.nickname, "Đen");
  assert.ok(internalRooms(service).get(red.roomCode)!.black!.token === black.seatToken);
  assert.throws(() => service.join("ZZZ234", "Khác"), (e) => errorCode(e, "ROOM_NOT_FOUND"));
});

test("Service: va chạm thử lại, tối đa 20 lần, không ghi đè phòng cũ", () => {
  const codes = ["ABC234", "ABC234", "DEF567"];
  const service = new RoomsService(() => codes.shift()!);
  const first = service.create("Một");
  const second = service.create("Hai");
  assert.equal(second.roomCode, "DEF567");
  assert.equal(internalRooms(service).get(first.roomCode)!.red.nickname, "Một");
  assert.ok(internalRooms(service).get(first.roomCode)!.red.token === first.seatToken);
  let calls = 0;
  const full = new RoomsService(() => { calls++; return "ABC234"; });
  full.create("Một"); calls = 0;
  assert.throws(() => full.create("Hai"), (e) => errorCode(e, "ROOM_CODE_UNAVAILABLE"));
  assert.equal(calls, 20);
  assert.equal(internalRooms(full).size, 1);
});

test("HTTP: health, create/join, validation, cạnh tranh, lỗi parse và lỗi bất ngờ", async (t) => {
  const app = await NestFactory.create<JsonParserApplication>(AppModule, { logger: false, abortOnError: false, bodyParser: false });
  try {
    configureHttp(app);
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl();
    const service = app.get(RoomsService);
    const post = (route: string, body: unknown) => fetch(base + route, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    async function expectError(response: Response, status: number, code: string) {
      assert.equal(response.status, status);
      const body = await response.json() as { statusCode: number; code: string; message: string };
      assert.equal(body.statusCode, status); assert.equal(body.code, code);
      assert.deepEqual(Object.keys(body).sort(), ["code", "message", "statusCode"]);
    }
    await t.test("health giữ nguyên", async () => {
      const response = await fetch(base + "/health");
      assert.equal(response.status, 200); assert.deepEqual(await response.json(), { status: "ok" });
    });
    await t.test("create trim, join, status và no-store, token không lộ đối phương", async () => {
      const response = await post("/rooms", { nickname: "  Người tạo  " });
      assert.equal(response.status, 201); assert.equal(response.headers.get("cache-control"), "no-store");
      const red = await response.json() as SeatResponse;
      assert.equal(red.nickname, "Người tạo"); assert.equal(red.seat, "red");
      const joined = await post(`/rooms/${red.roomCode}/join`, { nickname: "  Người vào  " });
      assert.equal(joined.status, 200); assert.equal(joined.headers.get("cache-control"), "no-store");
      const black = await joined.json() as SeatResponse;
      assert.equal(black.nickname, "Người vào"); assert.equal(black.seat, "black");
      assert.ok(black.seatToken !== red.seatToken);
      for (const body of [red, black]) assert.deepEqual(Object.keys(body).sort(), ["nickname", "roomCode", "seat", "seatToken"]);
      assert.ok(!JSON.stringify(black).includes(red.seatToken));
      await expectError(await post(`/rooms/${red.roomCode}/join`, { nickname: "Ba" }), 409, "ROOM_FULL");
    });
    await t.test("validation cả create và join: kiểu sai, trường thừa, trim và Unicode", async () => {
      const created = await (await post("/rooms", { nickname: "A" })).json() as SeatResponse;
      for (const route of ["/rooms", `/rooms/${created.roomCode}/join`]) {
        for (const body of [null, [], "abc", 1, true, {}, { nickname: 1 }, { nickname: false },
          { nickname: null }, { nickname: [] }, { nickname: "" }, { nickname: " \t\n " },
          { nickname: "a".repeat(31) }, { nickname: "😀".repeat(31) }, { nickname: "A", extra: true }]) {
          await expectError(await post(route, body), 400, "INVALID_REQUEST");
        }
      }
      const unicode = await post("/rooms", { nickname: ` ${"😀".repeat(30)} ` });
      assert.equal(unicode.status, 201);
      const unicodeBody = await unicode.json() as SeatResponse;
      assert.equal(Array.from(unicodeBody.nickname).length, 30);
      const one = await post(`/rooms/${created.roomCode}/join`, { nickname: " 😀 " });
      assert.equal(one.status, 200); assert.equal((await one.json() as SeatResponse).nickname, "😀");
    });
    await t.test("mã sai và phòng không tồn tại", async () => {
      await expectError(await post("/rooms/abc/join", { nickname: "A" }), 400, "INVALID_ROOM_CODE");
      let missing = "ZZZZZZ";
      while (internalRooms(service).has(missing)) missing = generateRoomCode();
      await expectError(await post(`/rooms/${missing}/join`, { nickname: "A" }), 404, "ROOM_NOT_FOUND");
    });
    await t.test("hai join cạnh tranh: một thắng, người thua không thay dữ liệu ghế", async () => {
      const red = await (await post("/rooms", { nickname: "Chủ" })).json() as SeatResponse;
      const responses = await Promise.all([post(`/rooms/${red.roomCode}/join`, { nickname: "A" }), post(`/rooms/${red.roomCode}/join`, { nickname: "B" })]);
      assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
      const won = await responses.find((r) => r.status === 200)!.json() as SeatResponse;
      await expectError(responses.find((r) => r.status === 409)!, 409, "ROOM_FULL");
      const seat = internalRooms(service).get(red.roomCode)!.black!;
      assert.equal(seat.nickname, won.nickname); assert.ok(seat.token === won.seatToken);
      await expectError(await post(`/rooms/${red.roomCode}/join`, { nickname: "C" }), 409, "ROOM_FULL");
      assert.equal(internalRooms(service).get(red.roomCode)!.black, seat);
      assert.ok(seat.token !== red.seatToken);
    });
    await t.test("chỉ JSON parse sai là INVALID_JSON; lỗi bất ngờ được che", async () => {
      await expectError(await fetch(base + "/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"nickname":' }), 400, "INVALID_JSON");
      const original = service.create;
      try {
        service.create = () => { throw new Error("internal-sensitive-detail"); };
        const response = await post("/rooms", { nickname: "A" });
        const text = await response.text();
        assert.equal(response.status, 500); assert.ok(!text.includes("internal-sensitive-detail"));
        const body = JSON.parse(text);
        assert.equal(body.code, "INTERNAL_ERROR"); assert.equal(body.stack, undefined);
      } finally { service.create = original; }
    });
  } finally {
    await app.close();
  }
});

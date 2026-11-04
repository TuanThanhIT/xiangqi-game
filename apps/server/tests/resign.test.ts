import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { RoomsService } from "../src/rooms/rooms.service";
import type { Room, SeatIdentity } from "../src/rooms/rooms.types";
import type { ResignAck } from "../src/rooms/resign-request";
import * as helpers from "../src/rooms/room-game";

function setup(join = true) {
  const service = new RoomsService(() => "ABC234"); service.create("R");
  if (join) service.join("ABC234", "B");
  const red: SeatIdentity = { roomCode: "ABC234", seat: "red" }, black: SeatIdentity = { roomCode: "ABC234", seat: "black" };
  service.claimSocket(red, "r"); service.markSocketAttached(red, "r");
  if (join) { service.claimSocket(black, "b"); service.markSocketAttached(black, "b"); }
  const room = () => (service as unknown as { rooms: Map<string, Room> }).rooms.get("ABC234")!;
  return { service, red, black, room };
}
const move = (requestId = randomUUID(), expectedRevision = 0) => ({ requestId, expectedRevision, pieceId: "red-soldier-0", to: { row: 5, col: 0 } });
function error(ack: ResignAck, code: string) { assert.equal(ack.ok, false); if (!ack.ok) assert.equal(ack.code, code); }

test("Resign: cả hai phe, ngoài lượt/đối thủ offline, trước nước đầu giữ bàn và lastMove null", () => {
  for (const side of ["red", "black"] as const) {
    const s = setup(); const opponent = side === "red" ? s.black : s.red;
    s.service.releaseSocket(opponent, side === "red" ? "b" : "r");
    const old = s.room().game!, before = structuredClone(old);
    const ack = s.service.resign(s[side], side === "red" ? "r" : "b", { requestId: randomUUID() });
    assert.equal(ack.ok, true); assert.deepEqual(old, before);
    const game = s.room().game!;
    assert.deepEqual(game.pieces, before.pieces); assert.equal(game.sideToMove, "red");
    assert.equal(game.lastMove, null); assert.equal(game.revision, 1);
    assert.deepEqual(game.result, { status: "finished", winner: opponent.seat, loser: side, reason: "resignation" });
    assert.equal(s.service.publicGameState("ABC234").playEnabled, false);
  }
});

test("Resign: sau nước đi giữ lastMove; retry/cache/reconnect không phát lại hoặc tính lại kết quả", () => {
  const s = setup(); const m = move(); assert.equal(s.service.move(s.red, "r", m).ok, true);
  const before = structuredClone(s.room().game!); let events = 0;
  const off = s.service.onRoomChange(() => events++);
  try {
    const req = { requestId: randomUUID() }, ack = s.service.resign(s.red, "r", req);
    assert.equal(ack.ok, true); assert.equal(events, 1);
    assert.deepEqual(s.room().game!.pieces, before.pieces); assert.equal(s.room().game!.sideToMove, before.sideToMove);
    assert.deepEqual(s.room().game!.lastMove, before.lastMove); assert.equal(s.room().game!.revision, 2);
    assert.deepEqual(s.service.resign(s.red, "r", { requestId: req.requestId.toUpperCase() }), ack); assert.equal(events, 1);
    s.service.claimSocket(s.red, "new");
    error(s.service.resign(s.red, "r", req), "SOCKET_NOT_ACTIVE");
    error(s.service.resign(s.red, "new", req), "SOCKET_NOT_ACTIVE");
    s.service.markSocketAttached(s.red, "new");
    const finished = structuredClone(s.room().game!);
    s.service.releaseSocket(s.black, "b"); s.service.claimSocket(s.black, "again"); s.service.markSocketAttached(s.black, "again");
    assert.deepEqual(s.room().game, finished);
    const count = events; assert.deepEqual(s.service.resign(s.red, "new", req), ack); assert.equal(events, count);
    assert.equal(s.service.publicGameState("ABC234").playEnabled, false);
    error(s.service.resign(s.black, "again", { requestId: randomUUID() }), "GAME_FINISHED");
    assert.deepEqual(s.service.move(s.red, "new", m), { ok: true, requestId: m.requestId, appliedRevision: 1 });
    const next = s.service.move(s.black, "again", { ...move(), pieceId: "black-soldier-0", to: { row: 4, col: 0 }, expectedRevision: 2 });
    assert.ok(!next.ok && next.code === "GAME_FINISHED");
  } finally { off(); }
});

test("Resign: validation, chưa có trận và lỗi bất ngờ không lộ nội bộ/ghi dở bàn", (t) => {
  const s = setup(), before = structuredClone(s.room().game);
  const valid = randomUUID();
  for (const payload of [null, [], {}, { requestId: 1 }, { requestId: "bad" },
    { requestId: "00000000-0000-1000-8000-000000000000" }, { requestId: valid, expectedRevision: 0 },
    { requestId: valid, side: "red" }, { requestId: valid, roomCode: "ABC234" }]) {
    error(s.service.resign(s.red, "r", payload), "INVALID_RESIGN_REQUEST");
  }
  assert.equal(s.room().red.requests.size, 0); assert.deepEqual(s.room().game, before);
  const waiting = setup(false); error(waiting.service.resign(waiting.red, "r", { requestId: valid }), "GAME_NOT_STARTED");
  t.mock.method(helpers, "resignRoomGame", () => { throw new Error("internal-secret"); });
  const ack = s.service.resign(s.red, "r", { requestId: valid }); error(ack, "INTERNAL_ERROR");
  assert.ok(!JSON.stringify(ack).includes("internal-secret")); assert.deepEqual(s.room().game, before);
});

test("Resign: xung đột move/resign cả hai chiều giữ nguyên entry; cùng ID khác ghế độc lập", () => {
  const a = setup(), id = randomUUID(), m = move(id);
  const moved = a.service.move(a.red, "r", m); const original = structuredClone(a.room().red.requests.get(id));
  error(a.service.resign(a.red, "r", { requestId: id }), "REQUEST_ID_CONFLICT");
  assert.deepEqual(a.room().red.requests.get(id), original); assert.deepEqual(a.service.move(a.red, "r", m), moved);
  const b = setup(), req = { requestId: id }, ack = b.service.resign(b.red, "r", req);
  const saved = structuredClone(b.room().red.requests.get(id));
  const conflict = b.service.move(b.red, "r", m); assert.ok(!conflict.ok && conflict.code === "REQUEST_ID_CONFLICT");
  assert.deepEqual(b.room().red.requests.get(id), saved); assert.deepEqual(b.service.resign(b.red, "r", req), ack);
  error(b.service.resign(b.black, "b", req), "GAME_FINISHED"); assert.equal(b.room().black!.requests.get(id)!.kind, "resign");
});

test("Resign: cache hỗn hợp giới hạn 256 mỗi ghế, eviction không kết thúc lại", () => {
  for (const side of ["red", "black"] as const) {
    const s = setup(), id = randomUUID(), socket = side === "red" ? "r" : "b";
    assert.equal(s.service.resign(s[side], socket, { requestId: id }).ok, true);
    for (let i = 0; i < 256; i++) {
      if (i % 2) s.service.move(s[side], socket, move());
      else s.service.resign(s[side], socket, { requestId: randomUUID() });
    }
    const cache = s.room()[side]!.requests; assert.equal(cache.size, 256); assert.equal(cache.has(id), false);
    assert.equal([...cache.values()].filter((a) => a.kind === "move").length, 128);
    let count = 0; const off = s.service.onRoomChange(() => count++);
    try { error(s.service.resign(s[side], socket, { requestId: id }), "GAME_FINISHED"); assert.equal(count, 0); }
    finally { off(); }
    assert.equal(s.room().game!.revision, 1);
  }
});

test("Resign: thứ tự move/resign, hai bên đầu hàng và nước chiếu bí đã thắng trước", () => {
  const a = setup(); assert.equal(a.service.resign(a.black, "b", { requestId: randomUUID() }).ok, true);
  const late = a.service.move(a.red, "r", move()); assert.ok(!late.ok && late.code === "GAME_FINISHED");
  assert.equal(a.room().game!.revision, 1);
  const b = setup(); assert.equal(b.service.move(b.red, "r", move()).ok, true);
  assert.equal(b.service.resign(b.black, "b", { requestId: randomUUID() }).ok, true); assert.equal(b.room().game!.revision, 2);
  error(b.service.resign(b.red, "r", { requestId: randomUUID() }), "GAME_FINISHED");
  const c = setup(); c.room().game!.result = { status: "finished", winner: "red", loser: "black", reason: "checkmate" };
  const before = structuredClone(c.room().game);
  error(c.service.resign(c.red, "r", { requestId: randomUUID() }), "GAME_FINISHED"); assert.deepEqual(c.room().game, before);
});

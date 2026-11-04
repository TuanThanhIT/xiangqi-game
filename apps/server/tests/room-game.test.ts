import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getGameStatus } from "@xiangqi/rules";
import type { Piece } from "@xiangqi/rules";
import { RoomsService } from "../src/rooms/rooms.service";
import type { Room, SeatIdentity } from "../src/rooms/rooms.types";
import type { MoveAck, MoveRequest } from "../src/rooms/move-request";
import * as gameHelpers from "../src/rooms/room-game";

function roomMap(service: RoomsService): Map<string, Room> {
  return (service as unknown as { rooms: Map<string, Room> }).rooms;
}
function setup() {
  const service = new RoomsService(() => "ABC234");
  service.create("Đỏ"); service.join("ABC234", "Đen");
  const red: SeatIdentity = { roomCode: "ABC234", seat: "red" };
  const black: SeatIdentity = { roomCode: "ABC234", seat: "black" };
  for (const [identity, id] of [[red, "r"], [black, "b"]] as const) {
    service.claimSocket(identity, id); service.markSocketAttached(identity, id);
  }
  return { service, red, black, room: () => roomMap(service).get("ABC234")! };
}
function request(pieceId = "red-soldier-0", row = 5, col = 0, expectedRevision = 0): MoveRequest {
  return { requestId: randomUUID(), expectedRevision, pieceId,
    to: { row: row as Piece["position"]["row"], col: col as Piece["position"]["col"] } };
}
function error(ack: MoveAck, code: string) {
  assert.equal(ack.ok, false);
  if (!ack.ok) assert.equal(ack.code, code);
}
function piece(id: string, side: Piece["side"], type: Piece["type"], row: number, col: number): Piece {
  return { id, side, type, position: { row: row as Piece["position"]["row"], col: col as Piece["position"]["col"] } };
}

test("Game: chỉ tạo khi join; khai cuộc mới, revision 0 và snapshot độc lập", () => {
  const service = new RoomsService(() => "ABC234");
  service.create("A"); assert.equal(service.publicGameState("ABC234").game, null);
  service.join("ABC234", "B");
  const state = service.publicGameState("ABC234");
  assert.equal(state.game!.pieces.length, 32);
  assert.equal(state.game!.pieces.filter((p) => p.side === "red").length, 16);
  assert.equal(new Set(state.game!.pieces.map((p) => p.id)).size, 32);
  assert.equal(new Set(state.game!.pieces.map((p) => `${p.position.row},${p.position.col}`)).size, 32);
  assert.equal(state.game!.revision, 0); assert.equal(state.game!.sideToMove, "red");
  assert.equal(state.game!.lastMove, null); assert.equal(state.playEnabled, false);
  state.game!.pieces[0].position.row = 9;
  assert.equal(service.publicGameState("ABC234").game!.pieces[0].position.row, 0);
  assert.deepEqual(Object.keys(state).sort(), ["deadlines", "game", "playEnabled", "roomCode", "serverNow"]);
  assert.deepEqual(Object.keys(state.game!).sort(), ["lastMove", "pieces", "result", "revision", "sideToMove"]);
});

test("Game: tạo thất bại không giữ ghế Đen; tính kết quả lỗi không ghi một phần bàn", (t) => {
  const service = new RoomsService(() => "ABC234"); service.create("A");
  const mockCreate = t.mock.method(gameHelpers, "createRoomGame", () => { throw new Error("private internal details"); });
  assert.throws(() => service.join("ABC234", "B"));
  assert.equal(roomMap(service).get("ABC234")!.black, null);
  assert.equal(roomMap(service).get("ABC234")!.game, null);
  mockCreate.mock.restore();
  const s = setup(); const before = structuredClone(s.room().game);
  t.mock.method(gameHelpers, "nextRoomGame", () => { throw new Error("private internal details"); });
  const ack = s.service.move(s.red, "r", request());
  error(ack, "INTERNAL_ERROR"); assert.ok(!JSON.stringify(ack).includes("private"));
  assert.deepEqual(s.room().game, before);
});

test("Game: luân phiên, ăn quân, lastMove/revision; dữ liệu cũ không bị sửa", () => {
  const s = setup(); const old = s.room().game!; const before = structuredClone(old);
  assert.equal(s.service.move(s.red, "r", request()).ok, true);
  assert.deepEqual(old, before);
  assert.equal(s.service.move(s.black, "b", request("black-soldier-0", 4, 0, 1)).ok, true);
  assert.equal(s.service.move(s.red, "r", request("red-soldier-0", 4, 0, 2)).ok, true);
  const game = s.room().game!;
  assert.equal(game.pieces.length, 31); assert.ok(!game.pieces.some((p) => p.id === "black-soldier-0"));
  assert.equal(game.sideToMove, "black"); assert.equal(game.revision, 3);
  assert.deepEqual(game.lastMove, { pieceId: "red-soldier-0", from: { row: 5, col: 0 }, to: { row: 4, col: 0 } });
  assert.deepEqual(game.result, getGameStatus(game.pieces, "black"));
});

test("Game: runtime validation đầy đủ, sai lượt/luật/ID/revision không đổi bàn", () => {
  const s = setup(); const before = structuredClone(s.room().game);
  const valid = request();
  for (const payload of [null, [], {}, { ...valid, requestId: "bad" }, { ...valid, requestId: "00000000-0000-1000-8000-000000000000" },
    { ...valid, expectedRevision: -1 }, { ...valid, expectedRevision: 0.5 }, { ...valid, expectedRevision: Number.MAX_SAFE_INTEGER + 1 },
    { ...valid, pieceId: "" }, { ...valid, pieceId: "a".repeat(65) }, { ...valid, pieceId: 1 },
    { ...valid, to: null }, { ...valid, to: { row: 10, col: 0 } }, { ...valid, to: { row: 5, col: -1 } },
    { ...valid, to: { row: 5.5, col: 0 } }, { ...valid, to: { row: 5, col: "0" } },
    { ...valid, to: { row: 5, col: 0, extra: true } }, { ...valid, seat: "red" }]) {
    error(s.service.move(s.red, "r", payload), "INVALID_MOVE_REQUEST");
  }
  assert.equal(s.room().red.requests.size, 0);
  error(s.service.move(s.black, "b", request("black-soldier-0", 4, 0)), "NOT_YOUR_TURN");
  error(s.service.move(s.red, "r", request("red-soldier-0", 6, 1)), "ILLEGAL_MOVE");
  error(s.service.move(s.red, "r", request("missing")), "ILLEGAL_MOVE");
  error(s.service.move(s.red, "r", request("black-soldier-0", 4, 0)), "ILLEGAL_MOVE");
  error(s.service.move(s.red, "r", request("red-soldier-0", 5, 0, 1)), "STALE_REVISION");
  assert.deepEqual(s.room().game, before);
});

test("Game: cache trước lượt/revision, cùng ID khác payload, giới hạn và eviction", () => {
  const s = setup(); let changes = 0;
  const unsub = s.service.onRoomChange(() => changes++);
  const req = request(); const original = structuredClone(req);
  const ack = s.service.move(s.red, "r", req); assert.equal(ack.ok, true);
  req.to.row = 4; // Không được sửa payload đã lưu trong cache.
  error(s.service.move(s.red, "r", req), "REQUEST_ID_CONFLICT");
  assert.deepEqual(s.service.move(s.red, "r", { ...original, requestId: original.requestId.toUpperCase() }), ack);
  assert.equal(changes, 1); assert.equal(s.room().game!.revision, 1);
  for (let i = 0; i < 256; i++) s.service.move(s.red, "r", request());
  assert.equal(s.room().red.requests.size, 256);
  assert.ok(!s.room().red.requests.has(original.requestId));
  error(s.service.move(s.red, "r", original), "STALE_REVISION");
  assert.equal(s.room().game!.revision, 1); assert.equal(changes, 1);
  const shared = request("black-soldier-0", 4, 0, 1); shared.requestId = original.requestId;
  assert.equal(s.service.move(s.black, "b", shared).ok, true); // Cache riêng mỗi ghế.
  assert.equal(s.room().black!.requests.size, 1);
  for (let i = 0; i < 256; i++) s.service.move(s.black, "b", request());
  assert.equal(s.room().black!.requests.size, 256); unsub();
});

test("Game: socket chưa attach/cũ bị chặn trước cache; offline/reconnect giữ bàn và retry ack", () => {
  const s = setup(); const req = request(); const ack = s.service.move(s.red, "r", req);
  s.service.claimSocket(s.red, "new");
  error(s.service.move(s.red, "r", req), "SOCKET_NOT_ACTIVE");
  error(s.service.move(s.red, "new", req), "SOCKET_NOT_ACTIVE");
  assert.equal(s.service.releaseSocket(s.red, "r"), false);
  s.service.markSocketAttached(s.red, "new");
  assert.deepEqual(s.service.move(s.red, "new", req), ack);
  const before = structuredClone(s.room().game);
  s.service.releaseSocket(s.red, "new"); assert.equal(s.service.publicGameState("ABC234").playEnabled, false);
  error(s.service.move(s.black, "b", request("black-soldier-0", 4, 0, 1)), "PLAYERS_OFFLINE");
  assert.deepEqual(s.room().game, before);
  s.service.claimSocket(s.red, "again"); s.service.markSocketAttached(s.red, "again");
  assert.equal(s.service.publicGameState("ABC234").playEnabled, true);
  assert.equal(s.service.move(s.black, "b", request("black-soldier-0", 4, 0, 1)).ok, true);
});

test("Game: chưa có trận và không được ăn Tướng", () => {
  const service = new RoomsService(() => "ABC234"); service.create("A");
  const red: SeatIdentity = { roomCode: "ABC234", seat: "red" };
  service.claimSocket(red, "r"); service.markSocketAttached(red, "r");
  error(service.move(red, "r", request()), "GAME_NOT_STARTED");
  const s = setup(); const pieces = [piece("bg", "black", "general", 0, 4), piece("rg", "red", "general", 9, 3),
    piece("rr", "red", "rook", 0, 0)];
  s.room().game = { pieces, sideToMove: "red", lastMove: null, revision: 0, result: getGameStatus(pieces, "red") };
  error(s.service.move(s.red, "r", request("rr", 0, 4)), "ILLEGAL_MOVE");
});

test("Game: nước cuối chiếu bí/hết nước, retry ack cuối; không cho nước tiếp", () => {
  for (const reason of ["checkmate", "stalemate"] as const) {
    const s = setup();
    const pieces = [piece("bg", "black", "general", 0, 4), piece("rg", "red", "general", 9, 3),
      piece("r1", "red", "rook", 1, 0), ...(reason === "checkmate"
        ? [piece("moving", "red", "rook", 2, 1)]
        : [piece("r3", "red", "rook", 2, 3), piece("moving", "red", "rook", 3, 5)])];
    s.room().game = { pieces, sideToMove: "red", lastMove: null, revision: 0, result: getGameStatus(pieces, "red") };
    const req = reason === "checkmate" ? request("moving", 0, 1) : request("moving", 2, 5);
    const ack = s.service.move(s.red, "r", req); assert.equal(ack.ok, true);
    assert.deepEqual(s.room().game!.result, { status: "finished", winner: "red", loser: "black", reason });
    assert.equal(s.service.publicGameState("ABC234").playEnabled, false);
    assert.deepEqual(s.service.move(s.red, "r", req), ack);
    error(s.service.move(s.black, "b", request("bg", 0, 3, 1)), "GAME_FINISHED");
    const resignation = s.service.resign(s.red, "r", { requestId: randomUUID() });
    assert.ok(!resignation.ok && resignation.code === "GAME_FINISHED");
    assert.equal(s.room().game!.result.status, "finished");
    assert.equal((s.room().game!.result as { reason: string }).reason, reason);
    assert.equal(s.room().game!.revision, 1);
  }
});

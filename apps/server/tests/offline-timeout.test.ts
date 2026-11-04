import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { RoomClock } from "../src/rooms/room-clock";
import { RoomsService } from "../src/rooms/rooms.service";
import type { SeatIdentity, Room } from "../src/rooms/rooms.types";
import type { Piece } from "@xiangqi/rules";

function clock() {
  let now = 1000;
  const tasks = new Set<{ callback(): void; at: number }>(), history: (() => void)[] = [];
  const port: RoomClock = { now: () => now, schedule(callback, delay) {
    const task = { callback, at: now + delay }; tasks.add(task); history.push(callback); return () => tasks.delete(task);
  } };
  return { port, tasks, history, set(value: number) { now = value; }, flush() {
    for (let count = 0; count < 50; count++) {
      const next = [...tasks].sort((a, b) => a.at - b.at)[0]; if (!next || next.at > now) return;
      tasks.delete(next); next.callback();
    }
    throw new Error("Timer lặp không dừng");
  } };
}
function setup() {
  const time = clock(); let code = "ABC234";
  const service = new RoomsService(() => code, time.port);
  service.create("R"); service.join(code, "B");
  const red: SeatIdentity = { roomCode: code, seat: "red" }, black: SeatIdentity = { roomCode: code, seat: "black" };
  const connect = (identity: SeatIdentity, id: string) => { service.claimSocket(identity, id); service.markSocketAttached(identity, id); };
  connect(red, "r"); connect(black, "b");
  return { time, service, red, black, connect, state: () => service.publicGameState("ABC234"), setCode: (value: string) => { code = value; } };
}
const request = () => ({ requestId: randomUUID(), expectedRevision: 0, pieceId: "red-soldier-0", to: { row: 5, col: 0 } });

test("Timeout: trước/đúng/sau deadline, timer trễ và callback cũ không cứu/kết thúc lại", () => {
  for (const offset of [-1, 0, 1]) {
    const s = setup();
    try {
      const before = s.state().game!;
      s.service.releaseSocket(s.red, "r"); assert.equal(s.state().deadlines.red, 61000);
      const stale = s.time.history.at(-1)!; s.time.set(61000 + offset); s.connect(s.red, "new"); stale();
      if (offset < 0) { assert.equal(s.state().game!.result.status, "playing"); assert.equal(s.state().deadlines.red, null); assert.equal(s.state().playEnabled, true); }
      else { assert.deepEqual(s.state().game!.result, { status: "finished", winner: "black", loser: "red", reason: "disconnect_timeout" });
        assert.equal(s.state().game!.revision, 1); assert.equal(s.state().deadlines.red, 61000); }
      assert.deepEqual(s.state().game!.pieces, before.pieces); assert.equal(s.state().game!.lastMove, before.lastMove);
      assert.equal(s.state().game!.sideToMove, before.sideToMove);
    } finally { s.service.onModuleDestroy(); }
  }
});

test("Timeout: hai deadline lệch nhau, người quay lại muộn giữ dấu quá hạn; người kia kịp hạn thắng", () => {
  const s = setup();
  try {
    s.service.releaseSocket(s.red, "r"); s.time.set(11000); s.service.releaseSocket(s.black, "b");
    assert.deepEqual(s.state().deadlines, { red: 61000, black: 71000 });
    s.time.set(66000); s.time.flush(); s.connect(s.red, "late");
    assert.equal(s.state().game!.result.status, "playing"); assert.equal(s.state().deadlines.red, 61000); assert.equal(s.state().playEnabled, false);
    s.time.set(70999); s.connect(s.black, "ontime");
    assert.deepEqual(s.state().game!.result, { status: "finished", winner: "black", loser: "red", reason: "disconnect_timeout" });
  } finally { s.service.onModuleDestroy(); }
});

test("Timeout: cả hai quá hạn hủy kể cả người quay lại muộn đang online; reconnect không cứu", () => {
  for (const lateOnline of [false, true]) {
    const s = setup();
    try {
      s.service.releaseSocket(s.red, "r"); s.time.set(11000); s.service.releaseSocket(s.black, "b");
      if (lateOnline) { s.time.set(66000); s.connect(s.red, "late"); }
      s.time.set(71000); // Cố tình không chạy timer: reconnect phải đánh giá trạng thái cũ trước.
      s.connect(s.black, "new");
      assert.deepEqual(s.state().game!.result, { status: "cancelled", reason: "both_disconnected" });
      assert.equal(s.state().game!.revision, 1); assert.equal(s.state().playEnabled, false);
      s.connect(s.red, "view"); s.time.history.forEach((fn) => fn());
      assert.equal(s.state().game!.revision, 1); assert.equal(s.time.tasks.size, 0);
    } finally { s.service.onModuleDestroy(); }
  }
});

test("Timeout: một người trở lại trước hạn khi đối thủ đã quá hạn thì thắng; không lặp timer hết hạn", () => {
  const s = setup();
  try {
    s.service.releaseSocket(s.red, "r"); s.time.set(11000); s.service.releaseSocket(s.black, "b");
    s.time.set(61000); s.time.flush(); assert.equal(s.state().game!.result.status, "playing");
    assert.equal(s.time.tasks.size, 1); assert.equal([...s.time.tasks][0].at, 71000);
    s.time.set(65000); s.connect(s.black, "back");
    assert.deepEqual(s.state().game!.result, { status: "finished", winner: "black", loser: "red", reason: "disconnect_timeout" });
    assert.equal(s.time.tasks.size, 0);
  } finally { s.service.onModuleDestroy(); }
});

test("Timeout: callback dùng trạng thái hiện hành, thay tab không offline giả, cleanup không tác động phòng khác", () => {
  const s = setup();
  try {
    s.service.releaseSocket(s.red, "r"); const stale = s.time.history.at(-1)!;
    s.time.set(2000); s.connect(s.red, "r2");
    s.service.claimSocket(s.red, "tab");
    assert.equal(s.service.releaseSocket(s.red, "r2"), false);
    assert.equal(s.state().deadlines.red, null);
    s.service.markSocketAttached(s.red, "tab"); stale(); assert.equal(s.state().game!.revision, 0);
    s.setCode("DEF234"); s.service.create("other"); s.service.join("DEF234", "other black");
    s.time.set(62000); s.time.flush();
    assert.equal(s.service.publicGameState("DEF234").game!.result.status, "cancelled");
    assert.equal(s.state().game!.result.status, "playing");
    s.service.releaseSocket(s.red, "tab"); s.service.onModuleDestroy();
    assert.equal(s.time.tasks.size, 0); const before = s.state().game;
    s.time.history.forEach((fn) => fn()); assert.deepEqual(s.state().game, before);
  } finally { s.service.onModuleDestroy(); }
});

test("Timeout: đánh giá trước move/resign khi timer trễ, idempotency vẫn trả ack cũ", () => {
  for (const action of ["move", "resign"] as const) {
    const s = setup();
    try {
      const m = request(), ack = s.service.move(s.red, "r", m); assert.equal(ack.ok, true);
      s.service.releaseSocket(s.red, "r"); s.time.set(61000);
      const late = action === "move" ? s.service.move(s.black, "b", { ...request(), expectedRevision: 1 }) : s.service.resign(s.black, "b", { requestId: randomUUID() });
      assert.ok(!late.ok && late.code === "GAME_FINISHED");
      assert.deepEqual(s.state().game!.result, { status: "finished", winner: "black", loser: "red", reason: "disconnect_timeout" });
      s.connect(s.red, "new"); assert.deepEqual(s.service.move(s.red, "new", m), ack); assert.equal(s.state().game!.revision, 2);
    } finally { s.service.onModuleDestroy(); }
  }
  const s = setup();
  try {
    s.service.releaseSocket(s.black, "b"); s.time.set(60999);
    const r = { requestId: randomUUID() }, ack = s.service.resign(s.red, "r", r);
    s.time.set(100000); s.time.history.forEach((fn) => fn());
    assert.deepEqual(s.service.resign(s.red, "r", r), ack); assert.equal(s.state().game!.revision, 1);
    assert.equal((s.state().game!.result as { reason: string }).reason, "resignation");
  } finally { s.service.onModuleDestroy(); }
});

test("Timeout: phòng chưa đủ người không có deadline/timer", () => {
  const time = clock(), service = new RoomsService(() => "ABC234", time.port);
  try {
    service.create("alone"); time.set(999999); time.flush();
    assert.deepEqual(service.publicGameState("ABC234").deadlines, { red: null, black: null });
    assert.equal(time.tasks.size, 0); assert.equal(service.publicGameState("ABC234").game, null);
  } finally { service.onModuleDestroy(); }
});

test("Timeout: nước chiếu bí xử lý trước deadline giữ kết quả, timer muộn không ghi đè", () => {
  const s = setup();
  try {
    s.service.releaseSocket(s.black, "b"); const old = s.time.history.at(-1)!;
    s.time.set(60999); s.connect(s.black, "back");
    const pieces: Piece[] = [
      { id: "bg", type: "general", side: "black", position: { row: 0, col: 4 } },
      { id: "rg", type: "general", side: "red", position: { row: 9, col: 3 } },
      { id: "r1", type: "rook", side: "red", position: { row: 1, col: 0 } },
      { id: "moving", type: "rook", side: "red", position: { row: 2, col: 1 } },
    ];
    const room = (s.service as unknown as { rooms: Map<string, Room> }).rooms.get("ABC234")!;
    room.game = { pieces, revision: 0, sideToMove: "red", lastMove: null, result: { status: "playing", sideToMove: "red", inCheck: false } };
    assert.equal(s.service.move(s.red, "r", { requestId: randomUUID(), expectedRevision: 0, pieceId: "moving", to: { row: 0, col: 1 } }).ok, true);
    s.time.set(61000); old(); s.time.flush();
    assert.deepEqual(s.state().game!.result, { status: "finished", winner: "red", loser: "black", reason: "checkmate" });
    assert.equal(s.state().game!.revision, 1); assert.equal(s.time.tasks.size, 0);
  } finally { s.service.onModuleDestroy(); }
});

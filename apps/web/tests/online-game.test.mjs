import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createInitialPieces, getGameStatus } from "@xiangqi/rules";
import { loader } from "./load-source.mjs";

const load = loader();
const { isGameSnapshot, isMoveAck, isResignAck, sameGame } = load("apps/web/src/features/rooms/game-contract.ts");
const { OnlineGameSession } = load("apps/web/src/features/rooms/online-game-session.ts");
function initial() {
  return { roomCode: "ABC234", serverNow: 1000, deadlines: { red: null, black: null }, playEnabled: true, game: { pieces: createInitialPieces(), sideToMove: "red", lastMove: null,
    revision: 0, result: { status: "playing", sideToMove: "red", inCheck: false } } };
}
function moved() {
  const s = initial(); s.game.pieces.find((p) => p.id === "red-soldier-0").position.row = 5;
  Object.assign(s.game, { revision: 1, sideToMove: "black", lastMove: { pieceId: "red-soldier-0", from: { row: 6, col: 0 }, to: { row: 5, col: 0 } },
    result: { status: "playing", sideToMove: "black", inCheck: false } }); return s;
}
function harness(sync = true) {
  let state, connected = true, now = 0, protocol = 0;
  const tasks = new Set(), allTasks = [], sends = [];
  const session = new OnlineGameSession("ABC234", "red", {
    connected: () => connected, send: (request, callback, kind) => sends.push({ request, callback, kind }), uuid: randomUUID,
    change: (next) => { state = next; }, protocolError: () => protocol++,
    schedule: (callback, delay) => { const task = { callback, at: now + delay }; tasks.add(task); allTasks.push(task); return () => tasks.delete(task); },
  });
  function tick(ms = 5000) {
    const end = now + ms;
    for (;;) {
      const next = [...tasks].sort((a, b) => a.at - b.at)[0];
      if (!next || next.at > end) break;
      now = next.at; tasks.delete(next); next.callback();
    }
    now = end;
  }
  const start = () => session.sendMove("red-soldier-0", { row: 5, col: 0 });
  const success = (index = sends.length - 1) => sends[index].callback({ ok: true, requestId: sends[index].request.requestId, appliedRevision: 1 });
  session.authenticatedNow(); if (sync) session.receiveSnapshot(initial());
  return { session, start, success, sends, tick, allTasks, get state() { return state; }, get protocol() { return protocol; },
    disconnect() { connected = false; session.disconnected(); }, reconnect() { connected = true; session.authenticatedNow(); } };
}

test("Validator: hình dạng/kiểu/quân/Tướng/revision/result/lastMove và ack", () => {
  assert.equal(isGameSnapshot(initial()), true); assert.equal(isGameSnapshot(moved()), true);
  assert.equal(isGameSnapshot({ roomCode: "ABC234", serverNow: 1000, deadlines: { red: null, black: null }, game: null, playEnabled: false }), true);
  for (const mutate of [
    (s) => { s.secret = "x"; }, (s) => { s.game.revision = 0.5; }, (s) => { s.game.pieces[0].position.row = 10; },
    (s) => { s.game.pieces[0].position.col = 0.5; }, (s) => { s.game.pieces[0].type = "queen"; },
    (s) => { s.game.pieces[1].id = s.game.pieces[0].id; }, (s) => { s.game.pieces[1].position = s.game.pieces[0].position; },
    (s) => { s.game.pieces = s.game.pieces.filter((p) => p.type !== "general"); },
    (s) => { s.game.result.sideToMove = "black"; }, (s) => { s.game.lastMove = {}; },
  ]) { const s = initial(); mutate(s); assert.equal(isGameSnapshot(s), false); }
  const id = randomUUID();
  assert.equal(isMoveAck({ ok: true, requestId: id, appliedRevision: 1 }), true);
  assert.equal(isMoveAck({ ok: true, requestId: id, appliedRevision: 0 }), false);
  assert.equal(isMoveAck({ ok: false, requestId: id, code: "UNKNOWN", message: "x" }), false);
  assert.equal(isMoveAck({ ok: false, requestId: null, code: "SOCKET_NOT_ACTIVE", message: "x" }), true);
  for (const reason of ["checkmate", "stalemate"]) {
    const fixture = load("apps/web/src/dev/endgame-fixtures.ts").createEndgameFixture(reason);
    assert.equal(isGameSnapshot({ roomCode: "ABC234", serverNow: 1000, deadlines: { red: null, black: null }, playEnabled: false, game: { pieces: fixture.pieces,
      sideToMove: fixture.sideToMove, revision: 0, lastMove: null, result: getGameStatus(fixture.pieces, fixture.sideToMove) } }), true);
  }
});

test("Chờ snapshot đầu; cùng revision nhận playEnabled, so sánh nội dung không phụ thuộc key/thứ tự quân", () => {
  const h = harness(false); assert.equal(h.start(), false);
  h.session.receiveSnapshot(initial()); assert.equal(h.session.canInteract(), true);
  const reordered = initial(); reordered.game.pieces.reverse(); reordered.game.result = { inCheck: false, sideToMove: "red", status: "playing" };
  assert.equal(sameGame(initial().game, reordered.game), true);
  reordered.playEnabled = false; h.session.receiveSnapshot(reordered); assert.equal(h.state.snapshot.playEnabled, false);
  assert.equal(h.session.canInteract(), false);
  h.session.receiveSnapshot(initial()); assert.equal(h.session.canInteract(), true);
});

test("Cùng revision khác nội dung và revision lùi sau reconnect đều khóa", () => {
  const h = harness(); const bad = initial(); bad.game.pieces[0].position.row = 1;
  h.session.receiveSnapshot(bad); assert.equal(h.protocol, 1); assert.equal(h.session.canInteract(), false);
  const r = harness(); r.session.receiveSnapshot(moved()); r.disconnect(); r.reconnect(); r.session.receiveSnapshot(initial());
  assert.equal(r.protocol, 1); assert.equal(r.state.snapshot.game.revision, 1);
  const q = harness(); q.disconnect(); q.reconnect(); q.session.receiveSnapshot(bad); assert.equal(q.protocol, 1);
});

test("Ack trước snapshot: không optimistic, không nhận request mới khi chờ", () => {
  const h = harness(); assert.equal(h.start(), true); assert.equal(h.start(), false);
  assert.equal(h.sends.length, 1); h.success();
  assert.equal(h.state.snapshot.game.revision, 0); assert.ok(h.state.pending);
  h.session.receiveSnapshot(moved()); assert.equal(h.state.pending, null); assert.equal(h.state.snapshot.game.revision, 1);
});

test("Snapshot trước ack: hiển thị bàn nhưng vẫn chờ, lastMove không tự mở khóa", () => {
  const h = harness(); h.start(); h.session.receiveSnapshot(moved()); assert.ok(h.state.pending);
  h.success(); assert.equal(h.state.pending, null);
  const q = harness(); q.start(); q.session.receiveSnapshot(moved()); q.tick(15000);
  assert.equal(q.sends.length, 3); assert.equal(q.state.message, "Chưa xác định được kết quả nước đi");
  q.session.receiveSnapshot(moved()); assert.ok(q.state.pending.unknown); assert.equal(q.start(), false);
});

test("Retry giữ nguyên ID/payload, tối đa ba lần; callback/timer cũ và ack muộn không tác động", () => {
  const h = harness(); h.start(); const first = structuredClone(h.sends[0].request);
  h.tick(5000); h.success(0); assert.equal(h.state.pending.ack, null);
  h.tick(10000); assert.equal(h.sends.length, 3);
  for (const send of h.sends) assert.deepEqual(send.request, first);
  h.success(); assert.equal(h.state.pending.unknown, true); assert.equal(h.state.recovery, true);
  const before = structuredClone(h.state); h.session.dispose();
  h.allTasks.forEach((t) => t.callback()); h.sends.forEach((s) => s.callback({})); assert.deepEqual(h.state, before);
});

test("Offline không emit/buffer; reconnect phải nhận snapshot, rồi retry nguyên request", () => {
  const h = harness(); h.start(); const req = structuredClone(h.sends[0].request); h.disconnect();
  h.tick(20000); assert.equal(h.sends.length, 1); assert.equal(h.start(), false);
  h.reconnect(); assert.equal(h.sends.length, 1); h.session.receiveSnapshot(moved());
  assert.equal(h.sends.length, 2); assert.deepEqual(h.sends[1].request, req); h.success(); assert.equal(h.state.pending, null);
});

test("Ack từ chối chờ revision mới có timeout; STALE không kết luận lần đầu thất bại", () => {
  const h = harness(); h.start(); const req = h.sends[0].request;
  h.sends[0].callback({ ok: false, requestId: req.requestId, code: "STALE_REVISION", currentRevision: 1, message: "private" });
  assert.ok(h.state.pending); h.tick(4000); h.session.receiveSnapshot(initial()); h.tick(1000);
  assert.equal(h.state.recovery, true); assert.ok(h.state.pending.unknown);
  const q = harness(); q.start(); q.tick(); const id = q.sends[1].request.requestId;
  q.sends[1].callback({ ok: false, requestId: id, code: "STALE_REVISION", currentRevision: 1, message: "secret" });
  q.session.receiveSnapshot(moved()); assert.equal(q.state.pending, null);
  assert.ok(q.state.message.includes("Không thể kết luận")); assert.ok(!q.state.message.includes("secret"));
});

test("Ack sai hợp đồng/ID bị khóa; thiếu snapshot ban đầu có phục hồi", () => {
  const h = harness(); h.start(); h.sends[0].callback({ ok: true, requestId: randomUUID(), appliedRevision: 1 });
  assert.equal(h.protocol, 1);
  const q = harness(false); q.tick(); assert.equal(q.state.recovery, true); assert.equal(q.start(), false);
  const r = harness(); r.start(); r.disconnect(); r.session.reconnectFailed();
  assert.ok(r.state.pending.unknown); assert.equal(r.state.recovery, true);
});

function resigned() {
  const s = initial(); s.playEnabled = false; s.game.revision = 1;
  s.game.result = { status: "finished", winner: "red", loser: "black", reason: "resignation" }; return s;
}

test("Resign validator: trước nước đầu/ngoài lượt, winner-loser khác, chỉ finished/playEnabled false", () => {
  assert.equal(isGameSnapshot(resigned()), true); // Đỏ tới lượt nhưng Đen thua.
  for (const change of [(s) => { s.playEnabled = true; }, (s) => { s.game.result.loser = "red"; },
    (s) => { s.game.result.loser = "other"; }, (s) => { s.game.revision = 0; }]) {
    const s = resigned(); change(s); assert.equal(isGameSnapshot(s), false);
  }
  const inconsistent = resigned(); inconsistent.game.result.reason = "checkmate";
  assert.equal(isGameSnapshot(inconsistent), false);
  const id = randomUUID();
  assert.equal(isResignAck({ ok: false, requestId: id, code: "INVALID_RESIGN_REQUEST", message: "x" }), true);
  assert.equal(isMoveAck({ ok: false, requestId: id, code: "INVALID_RESIGN_REQUEST", message: "x" }), false);
  assert.equal(isResignAck({ ok: false, requestId: id, code: "NOT_YOUR_TURN", message: "x" }), false);
});

test("Resign: ngoài lượt/đối thủ offline được gửi, bản thân offline/chưa sync không được; chung khóa với move", () => {
  const h = harness(); h.session.receiveSnapshot({ ...moved(), playEnabled: false });
  assert.equal(h.session.canInteract(), false); assert.equal(h.session.canResign(), true);
  assert.equal(h.session.sendResign(), true); assert.equal(h.start(), false); assert.equal(h.session.sendResign(), false);
  assert.equal(h.sends[0].kind, "resign"); assert.deepEqual(Object.keys(h.sends[0].request), ["requestId"]);
  h.disconnect(); assert.equal(h.session.canResign(), false); assert.equal(h.session.sendResign(), false);
  h.session.dispose();
  const m = harness(); m.start(); assert.equal(m.session.sendResign(), false); m.session.dispose();
  const q = harness(false); assert.equal(q.session.sendResign(), false); q.session.dispose();
});

test("Resign: ack trước/sau snapshot; delta revision không bị ép bằng 1; kết thúc khóa mọi hành động", () => {
  for (const ackFirst of [true, false]) {
    const h = harness(); h.session.sendResign();
    const snapshot = moved(); snapshot.game.revision = 2; snapshot.playEnabled = false;
    snapshot.game.result = { status: "finished", winner: "black", loser: "red", reason: "resignation" };
    const ack = () => h.sends[0].callback({ ok: true, requestId: h.sends[0].request.requestId, appliedRevision: 2 });
    if (ackFirst) { ack(); assert.equal(h.state.snapshot.game.revision, 0); assert.ok(h.state.pending); h.session.receiveSnapshot(snapshot); }
    else { h.session.receiveSnapshot(snapshot); assert.ok(h.state.pending); ack(); }
    assert.equal(h.state.pending, null); assert.equal(h.protocol, 0); assert.equal(h.session.canResign(), false);
    assert.equal(h.start(), false); assert.equal(h.session.sendResign(), false);
    const bad = structuredClone(snapshot); bad.game.result.winner = "red"; bad.game.result.loser = "black";
    h.session.receiveSnapshot(bad); assert.equal(h.protocol, 1); // Cùng revision vẫn kiểm tra kết quả.
  }
});

test("Resign: retry/timeout, reconnect và callback cũ giữ đúng loại và payload, không mở khóa bằng snapshot", () => {
  const h = harness(); h.session.sendResign(); const req = structuredClone(h.sends[0].request);
  h.disconnect(); h.tick(20000); assert.equal(h.sends.length, 1);
  h.reconnect(); assert.equal(h.sends.length, 1); h.session.receiveSnapshot(resigned()); assert.equal(h.sends.length, 2);
  h.success(0); assert.equal(h.state.pending.ack, null);
  h.tick(10000); assert.equal(h.sends.length, 3);
  assert.equal(h.state.message, "Chưa xác định được kết quả đầu hàng");
  for (const send of h.sends) { assert.equal(send.kind, "resign"); assert.deepEqual(send.request, req); }
  h.session.receiveSnapshot(resigned()); h.success(); assert.ok(h.state.pending.unknown); assert.equal(h.state.recovery, true);
  const before = structuredClone(h.state); h.session.dispose(); h.allTasks.forEach((t) => t.callback()); assert.deepEqual(h.state, before);
});

import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialPieces } from "@xiangqi/rules";
import { loader } from "./load-source.mjs";
const load = loader();
const { isGameSnapshot } = load("apps/web/src/features/rooms/game-contract.ts");
const { OnlineGameSession } = load("apps/web/src/features/rooms/online-game-session.ts");
const { default: OfflineDeadline, remainingOfflineSeconds } = load("apps/web/src/features/rooms/OfflineDeadline.tsx");
const OnlineBoard = load("apps/web/src/features/rooms/OnlineBoard.tsx").default;
function snapshot() {
  return { roomCode: "ABC234", serverNow: 1000, deadlines: { red: null, black: null }, playEnabled: true,
    game: { pieces: createInitialPieces(), sideToMove: "red", revision: 0, lastMove: null,
      result: { status: "playing", sideToMove: "red", inCheck: false } } };
}
function ended(cancelled = false) {
  const s = snapshot(); s.serverNow = 71000; s.deadlines = { red: 61000, black: cancelled ? 71000 : null }; s.playEnabled = false; s.game.revision = 1;
  s.game.result = cancelled ? { status: "cancelled", reason: "both_disconnected" } :
    { status: "finished", winner: "black", loser: "red", reason: "disconnect_timeout" }; return s;
}
test("Timeout validator: kết quả ngoài bàn trước nước đầu; cancelled không winner/loser; deadline/serverNow đúng kiểu", () => {
  assert.equal(isGameSnapshot(ended()), true); assert.equal(isGameSnapshot(ended(true)), true);
  for (const change of [(s) => { s.game.result.winner = "red"; }, (s) => { s.playEnabled = true; },
    (s) => { s.deadlines.black = null; }, (s) => { s.serverNow = 70000; }]) {
    const s = ended(true); change(s); assert.equal(isGameSnapshot(s), false);
  }
  for (const change of [(s) => { delete s.serverNow; }, (s) => { s.deadlines.red = -1; }, (s) => { s.serverNow = 1.5; },
    (s) => { s.deadlines.red = 61001; s.serverNow = 61000; }]) {
    const s = ended(); change(s); assert.equal(isGameSnapshot(s), false);
  }
});
test("Timeout snapshot: cùng revision cập nhật deadline/serverNow/playEnabled; reconnect không reset 60 giây", () => {
  let state; const sent = [], timers = [];
  const c = new OnlineGameSession("ABC234", "red", { connected: () => true, uuid: () => "00000000-0000-4000-8000-000000000000",
    change: (s) => { state = s; }, send: (r) => sent.push(r), schedule: (fn) => { timers.push(fn); return () => {}; }, protocolError() {} });
  c.authenticatedNow(); c.receiveSnapshot(snapshot()); assert.equal(c.canInteract(), true);
  const off = snapshot(); off.playEnabled = false; off.deadlines.black = 61000;
  c.receiveSnapshot(off); assert.equal(state.snapshot.deadlines.black, 61000); assert.equal(c.canInteract(), false);
  c.disconnected(); c.authenticatedNow(); off.serverNow = 21000; c.receiveSnapshot(off);
  assert.equal(state.snapshot.deadlines.black, 61000); assert.equal(state.snapshot.serverNow, 21000);
  assert.equal(remainingOfflineSeconds(61000, state.snapshot.serverNow, 500000, 500000), 40);
  c.receiveSnapshot(ended(true)); assert.equal(c.canResign(), false); assert.equal(c.sendMove("red-soldier-0", { row: 5, col: 0 }), false);
  assert.equal(sent.length, 0); c.dispose();
});
test("Countdown: bù lệch đồng hồ, về 0 chỉ chờ server, kết quả và cancelled không có người thắng", () => {
  assert.equal(remainingOfflineSeconds(61000, 1000, 999000, 1009000), 50);
  assert.equal(remainingOfflineSeconds(61000, 61000, 999000, 999000), 0);
  const s = snapshot(); s.playEnabled = false; s.deadlines.black = 1000;
  const html = renderToStaticMarkup(React.createElement(OfflineDeadline, { snapshot: s, receivedAt: 5000, side: "red" }));
  assert.ok(html.includes("đang chờ server xác nhận")); assert.ok(!html.includes("thắng")); assert.equal(s.game.result.status, "playing");
  for (const cancelled of [false, true]) {
    const markup = renderToStaticMarkup(React.createElement(OnlineBoard, { game: ended(cancelled).game, side: "red", canPlay: false,
      canResign: false, selectionEpoch: 0, sendMove() {}, sendResign() {} }));
    assert.ok(markup.includes(cancelled ? "Trận đã hủy vì cả hai người chơi mất kết nối quá thời hạn" : "Đen thắng do đối thủ mất kết nối quá thời hạn"));
    if (cancelled) assert.ok(!markup.includes("thắng"));
    assert.equal((markup.match(/aria-disabled="true"/g) ?? []).length, 90);
  }
});

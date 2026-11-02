import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createInitialPieces } from "@xiangqi/rules";
import { loader } from "./load-source.mjs";

function mount() {
  const slots = [], effects = [], changes = []; let cursor = 0, posts = 0, cleared = 0;
  const sockets = [];
  const session = { roomCode: "ABC234", seatToken: "A".repeat(43), seat: "red", nickname: "A" };
  class FakeSocket extends EventEmitter {
    connected = false; auth = {}; sends = []; manager = new EventEmitter();
    constructor() {
      super(); this.manager.reconnection = (enabled) => { this.reconnect = enabled; }; this.io = this.manager;
      this.volatile = { emit: (name, request, callback) => { assert.ok(this.connected); this.sends.push({ name, request, callback }); } };
    }
    connect() { this.connected = true; }
    disconnect() { this.connected = false; }
  }
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [slots[i], (next) => { slots[i] = typeof next === "function" ? next(slots[i]) : next; changes.push(i); }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useEffect(fn, deps) { const i = cursor++, old = slots[i];
      if (!old || deps.some((v, index) => !Object.is(v, old.deps[index]))) {
        effects.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; });
      }
    },
  };
  const load = loader({ react, "./room-socket": { createRoomSocket() { const socket = new FakeSocket(); sockets.push(socket); return socket; } },
    "./room-api": { requestRoom() { posts++; throw new Error("Unexpected POST"); } },
    "./room-storage": { readRoomSession: () => ({ session, warning: "" }), saveRoomSession: () => true,
      clearRoomSession: () => { cleared++; return true; } } });
  const hook = load("apps/web/src/features/rooms/useRoomSession.ts").useRoomSession;
  let value;
  function render() { cursor = 0; value = hook(); while (effects.length) effects.shift()(); return value; }
  function cleanup() { for (const slot of slots) slot?.cleanup?.(); }
  const snapshot = () => ({ roomCode: "ABC234", playEnabled: true, game: { pieces: createInitialPieces(), sideToMove: "red",
    lastMove: null, revision: 0, result: { status: "playing", sideToMove: "red", inCheck: false } } });
  return { render, cleanup, sockets, snapshot, changes, get posts() { return posts; }, get cleared() { return cleared; } };
}

test("Hook: reload khôi phục storage không POST; đợi xác thực/snapshot; replaced dừng pending và callback cũ", async () => {
  const previousWindow = globalThis.window; globalThis.window = { sessionStorage: {} };
  const h = mount();
  try {
    h.render(); await Promise.resolve(); h.render(); const s = h.sockets[0];
    assert.ok(s.listenerCount("game:state") > 0); assert.equal(h.posts, 0);
    s.emit("connect"); h.render(); assert.equal(h.render().canPlay, false);
    s.emit("room:session", { roomCode: "ABC234", seat: "red" }); assert.equal(h.render().canPlay, false);
    s.emit("game:state", h.snapshot()); assert.equal(h.render().canPlay, true);
    assert.equal(h.render().sendMove("red-soldier-0", { row: 5, col: 0 }), true);
    assert.equal(h.render().sendMove("red-soldier-0", { row: 5, col: 0 }), false);
    assert.equal(s.sends.length, 1);
    const oldCallback = s.sends[0].callback, id = s.sends[0].request.requestId;
    s.emit("room:replaced", { code: "SEAT_REPLACED", message: "x" });
    const result = h.render(); assert.equal(result.session, null); assert.equal(result.online.pending, null);
    assert.equal(h.cleared, 1); assert.equal(s.reconnect, false); assert.equal(s.connected, false);
    const before = h.changes.length;
    oldCallback({ ok: true, requestId: id, appliedRevision: 1 }); s.emit("game:state", h.snapshot());
    assert.equal(h.changes.length, before); assert.equal(s.listenerCount("game:state"), 0);
  } finally { h.cleanup(); globalThis.window = previousWindow; }
});

test("Hook: disconnect không gửi; reconnect kiểm chứng snapshot; AUTH_FAILED hủy pending và credentials", async () => {
  const previousWindow = globalThis.window; globalThis.window = { sessionStorage: {} };
  const h = mount();
  try {
    h.render(); await Promise.resolve(); h.render(); const s = h.sockets[0];
    s.emit("connect"); s.emit("room:session", { roomCode: "ABC234", seat: "red" }); s.emit("game:state", h.snapshot());
    h.render().sendMove("red-soldier-0", { row: 5, col: 0 });
    s.connected = false; s.emit("disconnect", "transport close");
    assert.equal(h.render().sendMove("red-soldier-0", { row: 5, col: 0 }), false);
    assert.equal(s.sends.length, 1);
    s.connected = true; s.emit("connect"); s.emit("room:session", { roomCode: "ABC234", seat: "red" });
    assert.equal(s.sends.length, 1); s.emit("game:state", h.snapshot()); assert.equal(s.sends.length, 2);
    s.emit("connect_error", Object.assign(new Error("safe"), { data: { code: "AUTH_FAILED", message: "x" } }));
    assert.equal(h.render().online.pending, null); assert.equal(h.render().session, null);
    assert.equal(h.cleared, 1); assert.equal(s.reconnect, false); assert.equal(h.posts, 0);
  } finally { h.cleanup(); globalThis.window = previousWindow; }
});

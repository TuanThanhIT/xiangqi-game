import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createInitialPieces } from "@xiangqi/rules";
import { loader } from "./load-source.mjs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("Theme snapshot: chỉ nhận sau xác thực, giữ qua reconnect; đổi theme giữa phiên bị khóa, không xóa credentials", async () => {
  const previous = globalThis.window; globalThis.window = { sessionStorage: {} };
  const h = mount();
  const state = (themeId) => ({ roomCode: "ABC234", themeId, players: { red: { nickname: "A", side: "red", connected: true }, black: null } });
  try {
    h.render(); await Promise.resolve(); h.render().continueRoom(); h.render(); const s = h.sockets[0];
    s.emit("room:state", state("snow")); assert.equal(h.render().snapshot, null);
    s.emit("connect"); s.emit("room:session", { roomCode: "ABC234", seat: "red" });
    s.emit("room:state", state("bamboo")); assert.equal(h.render().snapshot.themeId, "bamboo");
    s.connected = false; s.emit("disconnect", "transport close");
    s.connected = true; s.emit("connect"); s.emit("room:session", { roomCode: "ABC234", seat: "red" });
    s.emit("room:state", state("bamboo")); assert.equal(h.render().snapshot.themeId, "bamboo");
    s.emit("room:state", state("snow"));
    assert.equal(h.render().online.recovery, true); assert.equal(h.render().snapshot.themeId, "bamboo");
    assert.equal(s.connected, false); assert.equal(h.cleared, 0);
  } finally { h.cleanup(); globalThis.window = previous; }
});

function mount({ realStorage = false, create = false } = {}) {
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
    "./room-api": { requestRoom(nickname, code) { posts++; if (create) return Promise.resolve({ ...session, seat: code ? "black" : "red" }); throw new Error("Unexpected POST"); } },
    ...(!realStorage ? { "./room-storage": { loadRoomSession: () => ({ session: cleared ? null : session, warning: "" }),
      readRoomSession: () => ({ session: cleared ? null : session, warning: "" }), saveRoomSession: () => true,
      sameCredentials: (a, b) => a.roomCode === b.roomCode && a.seatToken === b.seatToken,
      clearRoomSessionIfMatches: () => { cleared++; return true; } } } : {}) });
  const hook = load("apps/web/src/features/rooms/useRoomSession.ts").useRoomSession;
  let value;
  function render() { cursor = 0; value = hook(); while (effects.length) effects.shift()(); return value; }
  function cleanup() { for (const slot of slots) slot?.cleanup?.(); }
  const snapshot = () => ({ roomCode: "ABC234", serverNow: 1000, deadlines: { red: null, black: null }, playEnabled: true, game: { pieces: createInitialPieces(), sideToMove: "red",
    lastMove: null, revision: 0, result: { status: "playing", sideToMove: "red", inCheck: false } } });
  return { render, cleanup, sockets, snapshot, changes, get posts() { return posts; }, get cleared() { return cleared; } };
}

test("Hook: reload khôi phục storage không POST; đợi xác thực/snapshot; replaced dừng pending và callback cũ", async () => {
  const previousWindow = globalThis.window; globalThis.window = { sessionStorage: {} };
  const h = mount();
  try {
    h.render(); await Promise.resolve();
    assert.equal(h.sockets.length, 0); assert.equal(h.render().session, null);
    assert.equal(h.render().savedSession.roomCode, "ABC234");
    h.render().continueRoom(); h.render(); const s = h.sockets[0];
    assert.ok(s.listenerCount("game:state") > 0); assert.equal(h.posts, 0);
    s.emit("connect"); h.render(); assert.equal(h.render().canPlay, false);
    s.emit("room:session", { roomCode: "ABC234", seat: "red" }); assert.equal(h.render().canPlay, false);
    s.emit("game:state", h.snapshot()); assert.equal(h.render().canPlay, true);
    assert.equal(h.render().sendMove("red-soldier-0", { row: 5, col: 0 }), true);
    assert.equal(h.render().sendMove("red-soldier-0", { row: 5, col: 0 }), false);
    assert.equal(s.sends.length, 1);
    const oldCallback = s.sends[0].callback, id = s.sends[0].request.requestId;
    s.emit("room:replaced", { code: "SEAT_REPLACED", message: "x" });
    const result = h.render(); assert.ok(result.session); assert.equal(result.online.pending, null);
    assert.equal(h.cleared, 0); assert.equal(s.reconnect, false); assert.equal(s.connected, false);
    const before = h.changes.length;
    oldCallback({ ok: true, requestId: id, appliedRevision: 1 }); s.emit("game:state", h.snapshot());
    assert.equal(h.changes.length, before);
  } finally { h.cleanup(); globalThis.window = previousWindow; }
});

test("Hook: disconnect không gửi; reconnect kiểm chứng snapshot; AUTH_FAILED hủy pending và credentials", async () => {
  const previousWindow = globalThis.window; globalThis.window = { sessionStorage: {} };
  const h = mount();
  try {
    h.render(); await Promise.resolve(); h.render().continueRoom(); h.render(); const s = h.sockets[0];
    s.emit("connect"); s.emit("room:session", { roomCode: "ABC234", seat: "red" }); s.emit("game:state", h.snapshot());
    h.render().sendMove("red-soldier-0", { row: 5, col: 0 });
    s.connected = false; s.emit("disconnect", "transport close");
    assert.equal(h.render().sendMove("red-soldier-0", { row: 5, col: 0 }), false);
    assert.equal(s.sends.length, 1);
    s.connected = true; s.emit("connect"); s.emit("room:session", { roomCode: "ABC234", seat: "red" });
    assert.equal(s.sends.length, 1); s.emit("game:state", h.snapshot()); assert.equal(s.sends.length, 2);
    s.emit("connect_error", Object.assign(new Error("safe"), { data: { code: "AUTH_FAILED", message: "x" } }));
    assert.equal(h.render().online.pending, null); assert.equal(h.render().session, null);
    assert.equal(h.cleared, 2); assert.equal(s.reconnect, false); assert.equal(h.posts, 0);
  } finally { h.cleanup(); globalThis.window = previousWindow; }
});

test("Hook resign: phát đúng event/payload, offline đối thủ vẫn mở; pending và mất quyền khóa cả hai", async () => {
  const previousWindow = globalThis.window; globalThis.window = { sessionStorage: {} };
  const h = mount();
  try {
    h.render(); await Promise.resolve(); h.render().continueRoom(); h.render(); const s = h.sockets[0];
    s.emit("connect"); s.emit("room:session", { roomCode: "ABC234", seat: "red" });
    s.emit("game:state", { ...h.snapshot(), playEnabled: false });
    assert.equal(h.render().canPlay, false); assert.equal(h.render().canResign, true);
    assert.equal(h.render().sendResign(), true); assert.equal(h.render().canResign, false);
    assert.equal(h.render().sendMove("red-soldier-0", { row: 5, col: 0 }), false);
    assert.equal(s.sends[0].name, "game:resign"); assert.deepEqual(Object.keys(s.sends[0].request), ["requestId"]);
    const callback = s.sends[0].callback;
    s.connected = false; s.emit("disconnect", "transport close");
    assert.equal(h.render().sendResign(), false); assert.equal(s.sends.length, 1);
    s.connected = true; s.emit("connect"); s.emit("room:session", { roomCode: "ABC234", seat: "red" });
    s.emit("game:state", { ...h.snapshot(), playEnabled: false });
    assert.equal(s.sends.length, 2); assert.equal(s.sends[1].name, "game:resign");
    assert.deepEqual(s.sends[1].request, s.sends[0].request);
    s.emit("room:replaced", { code: "SEAT_REPLACED", message: "x" }); h.render();
    const before = h.changes.length; callback({ ok: true, requestId: s.sends[0].request.requestId, appliedRevision: 1 });
    assert.equal(h.changes.length, before); assert.equal(h.render().online.pending, null); assert.equal(s.reconnect, false);
  } finally { h.cleanup(); globalThis.window = previousWindow; }
});

function memoryStorage() {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
}
const KEY = "xiangqi.room.v1";
const storedA = { roomCode: "ABC234", seatToken: "A".repeat(43), seat: "red", nickname: "A" };
const storedB = { roomCode: "DEF234", seatToken: "B".repeat(43), seat: "black", nickname: "B" };
const put = (storage, session) => storage.setItem(KEY, JSON.stringify({ version: 1, ...session }));

test("LocalStorage/tab mới/reload: không socket/POST tới khi tiếp tục; replaced giữ phiên và callback cũ không xóa mới", async () => {
  const previous = globalThis.window, local = memoryStorage(); put(local, storedA);
  globalThis.window = { localStorage: local, sessionStorage: memoryStorage() };
  const first = mount({ realStorage: true }), second = mount({ realStorage: true });
  try {
    first.render(); await Promise.resolve(); assert.equal(first.render().savedSession.roomCode, "ABC234");
    assert.equal(first.sockets.length, 0); first.render().continueRoom(); first.render(); assert.equal(first.sockets.length, 1);
    second.render(); await Promise.resolve(); second.render(); assert.equal(second.sockets.length, 0);
    assert.equal(first.sockets[0].connected, true); second.render().continueRoom(); second.render(); assert.equal(second.sockets.length, 1);
    first.sockets[0].emit("room:replaced", { code: "SEAT_REPLACED", message: "x" }); first.render();
    assert.ok(local.getItem(KEY)); assert.equal(first.sockets[0].connected, false);
    put(local, storedB);
    first.sockets[0].emit("connect_error", Object.assign(new Error("safe"), { data: { code: "AUTH_FAILED", message: "x" } }));
    assert.equal(JSON.parse(local.getItem(KEY)).roomCode, "DEF234"); assert.equal(first.posts + second.posts, 0);
    second.cleanup();
    const reopened = mount({ realStorage: true });
    try { reopened.render(); await Promise.resolve(); assert.equal(reopened.render().savedSession.roomCode, "DEF234"); assert.equal(reopened.sockets.length, 0); }
    finally { reopened.cleanup(); }
  } finally { first.cleanup(); second.cleanup(); globalThis.window = previous; }
});

test("AUTH_FAILED: chỉ xóa credentials khớp; phiên khác thành màn hình tiếp tục, không tự kết nối", async () => {
  const previous = globalThis.window, local = memoryStorage(); put(local, storedA);
  globalThis.window = { localStorage: local, sessionStorage: memoryStorage() };
  const h = mount({ realStorage: true });
  try {
    h.render(); await Promise.resolve(); h.render().continueRoom(); h.render(); const s = h.sockets[0];
    put(local, storedB);
    s.emit("connect_error", Object.assign(new Error("safe"), { data: { code: "AUTH_FAILED", message: "x" } }));
    assert.equal(h.render().session, null); assert.equal(h.render().savedSession.roomCode, "DEF234");
    assert.equal(h.sockets.length, 1); assert.equal(JSON.parse(local.getItem(KEY)).roomCode, "DEF234");
    h.render().continueRoom(); h.render(); const fresh = h.sockets[1];
    fresh.emit("connect_error", Object.assign(new Error("safe"), { data: { code: "AUTH_FAILED", message: "x" } }));
    assert.equal(h.render().savedSession, null); assert.equal(local.getItem(KEY), null); assert.equal(h.posts, 0);
  } finally { h.cleanup(); globalThis.window = previous; }
});

test("Tạo/join mới lưu local rồi kết nối; storage bị chặn chỉ mất khả năng khôi phục", async () => {
  const previous = globalThis.window;
  for (const blocked of [false, true]) for (const code of [undefined, "ABC234"]) {
    const local = memoryStorage(); globalThis.window = { localStorage: local, sessionStorage: memoryStorage() };
    if (blocked) Object.defineProperty(globalThis.window, "localStorage", { get() { throw Error("blocked"); } });
    const h = mount({ realStorage: true, create: true });
    try {
      h.render(); await Promise.resolve(); h.render(); await h.render().submit("A", code); h.render();
      assert.equal(h.posts, 1); assert.equal(h.sockets.length, 1); assert.equal(h.render().session.roomCode, "ABC234");
      assert.equal(h.render().session.seat, code ? "black" : "red");
      if (blocked) assert.ok(h.render().warning.includes("đóng tab")); else assert.equal(JSON.parse(local.getItem(KEY)).roomCode, "ABC234");
    } finally { h.cleanup(); }
  }
  globalThis.window = previous;
});

test("Màn hình tiếp tục chỉ hiện thông tin công khai, không token hoặc form tạo/join", () => {
  const Play = loader({ "./useRoomSession": { useRoomSession: () => ({ ready: true, session: null, savedSession: storedA, online: { snapshot: null }, continueRoom() {} }) },
    "next/navigation": { useRouter: () => ({ push() {} }) },
    "./play-room.module.css": { play: "play" } })("apps/web/src/features/rooms/PlayRoom.tsx").default;
  const html = renderToStaticMarkup(React.createElement(Play));
  assert.ok(html.includes("Tiếp tục phòng")); assert.ok(html.includes("ABC234")); assert.ok(!html.includes(storedA.seatToken));
  assert.ok(html.includes("Tạo phòng mới")); assert.ok(!html.includes("<form")); assert.ok(!html.includes("Vào phòng"));
});

test("Sau trận: mọi kết quả rời phiên không resign/POST; cleanup ngay và callback cũ không xóa phiên mới", async () => {
  const previous = globalThis.window;
  for (const reason of ["checkmate", "stalemate", "resignation", "disconnect_timeout", "both_disconnected"]) {
    const local = memoryStorage(); put(local, storedA);
    globalThis.window = { localStorage: local, sessionStorage: memoryStorage() };
    const h = mount({ realStorage: true });
    try {
      h.render(); await Promise.resolve(); h.render().continueRoom(); h.render();
      const socket = h.sockets[0]; socket.emit("connect"); socket.emit("room:session", { roomCode: "ABC234", seat: "red" });
      socket.emit("game:state", h.snapshot());
      assert.equal(h.render().exitFinishedRoom(), false); assert.ok(local.getItem(KEY));
      const ended = h.snapshot(); ended.playEnabled = false;
      if (reason === "checkmate" || reason === "stalemate") {
        ended.game.pieces = loader()("apps/web/src/dev/endgame-fixtures.ts").createEndgameFixture(reason).pieces;
        ended.game.sideToMove = "black";
        ended.game.revision = 1;
        ended.game.lastMove = { pieceId: "rook-1", from: { row: 1, col: 1 }, to: { row: 1, col: 0 } };
        ended.game.result = { status: "finished", reason, winner: "red", loser: "black" };
      } else {
        ended.game.revision = 1;
        ended.game.result = reason === "both_disconnected" ? { status: "cancelled", reason }
          : { status: "finished", reason, winner: "black", loser: "red" };
        if (reason !== "resignation") { ended.serverNow = 71000; ended.deadlines = { red: 61000, black: reason === "both_disconnected" ? 71000 : null }; }
      }
      socket.emit("game:state", ended);
      assert.equal(h.render().canLeaveFinished, true);
      const oldState = socket.listeners("game:state")[0], oldSession = socket.listeners("room:session")[0];
      assert.equal(h.render().exitFinishedRoom(), true);
      assert.equal(local.getItem(KEY), null); assert.equal(socket.connected, false); assert.equal(socket.reconnect, false);
      assert.equal(socket.eventNames().length, 0); assert.equal(socket.io.eventNames().length, 0);
      assert.equal(h.render().session, null); assert.equal(h.posts, 0); assert.equal(socket.sends.length, 0);
      put(local, storedB); const changes = h.changes.length;
      oldState(ended); oldSession({ roomCode: "ABC234", seat: "red" });
      assert.equal(h.changes.length, changes); assert.equal(JSON.parse(local.getItem(KEY)).roomCode, "DEF234");
      assert.equal(h.render().exitFinishedRoom(), false);
    } finally { h.cleanup(); }
  }
  globalThis.window = previous;
});

test("Sau trận: giữ credentials do tab khác lưu; replaced và storage bị chặn không cho xóa phiên", async () => {
  const previous = globalThis.window;
  for (const outcome of ["other-tab", "replaced", "blocked"]) {
    const local = memoryStorage(); put(local, storedA);
    globalThis.window = { localStorage: local, sessionStorage: memoryStorage() };
    const h = mount({ realStorage: true });
    try {
      h.render(); await Promise.resolve(); h.render().continueRoom(); h.render(); const s = h.sockets[0];
      s.emit("connect"); s.emit("room:session", { roomCode: "ABC234", seat: "red" });
      const ended = h.snapshot(); ended.playEnabled = false; ended.game.revision = 1;
      ended.game.result = { status: "finished", winner: "black", loser: "red", reason: "resignation" };
      s.emit("game:state", ended);
      if (outcome === "other-tab") put(local, storedB);
      if (outcome === "replaced") s.emit("room:replaced", { code: "SEAT_REPLACED", message: "x" });
      if (outcome === "blocked") Object.defineProperty(globalThis.window, "localStorage", { get() { throw Error("blocked"); } });
      assert.equal(h.render().exitFinishedRoom(), outcome === "other-tab");
      if (outcome === "other-tab") {
        assert.equal(JSON.parse(local.getItem(KEY)).roomCode, "DEF234"); assert.equal(h.render().savedSession.roomCode, "DEF234");
      } else assert.equal(JSON.parse(local.getItem(KEY)).roomCode, "ABC234");
      assert.equal(h.posts, 0); assert.equal(s.sends.length, 0);
    } finally { h.cleanup(); }
  }
  globalThis.window = previous;
});

test("Tạo phòng mới: hủy không kết nối/POST; đồng ý khóa thao tác và đầu hàng rồi mới bỏ phiên", async () => {
  const previous = globalThis.window, local = memoryStorage(); put(local, storedA);
  let confirms = 0;
  globalThis.window = { localStorage: local, sessionStorage: memoryStorage(), confirm: () => { confirms++; return false; } };
  const h = mount({ realStorage: true });
  try {
    h.render(); await Promise.resolve(); h.render().newRoom(); h.render();
    assert.equal(h.sockets.length, 0); assert.ok(local.getItem(KEY)); assert.equal(h.posts, 0);
    globalThis.window.confirm = (text) => { assert.equal(text, "Nếu ván cũ còn diễn ra, bạn sẽ đầu hàng để tạo phòng mới."); confirms++; return true; };
    h.render().newRoom(); h.render().newRoom(); h.render(); assert.equal(confirms, 2); assert.equal(h.sockets.length, 1);
    assert.equal(h.render().switchingRoom, true); assert.equal(h.render().sendMove("red-soldier-0", { row: 5, col: 0 }), false);
    const s = h.sockets[0]; s.emit("connect"); assert.equal(s.sends.length, 0);
    s.emit("room:session", { roomCode: "ABC234", seat: "red" }); assert.equal(s.sends.length, 0);
    s.emit("game:state", { ...h.snapshot(), playEnabled: false }); await Promise.resolve(); h.render();
    assert.equal(s.sends.length, 1); assert.equal(s.sends[0].name, "game:resign"); assert.equal(h.render().canResign, false);
    const callback = s.sends[0].callback;
    callback({ ok: true, requestId: s.sends[0].request.requestId, appliedRevision: 1 }); await Promise.resolve();
    assert.ok(local.getItem(KEY)); // Ack một mình không đủ.
    const finished = h.snapshot(); finished.playEnabled = false; finished.game.revision = 1;
    finished.game.result = { status: "finished", winner: "black", loser: "red", reason: "resignation" };
    s.emit("game:state", finished); await Promise.resolve(); h.render();
    assert.equal(h.render().session, null); assert.equal(h.render().savedSession, null); assert.equal(h.render().switchingRoom, false);
    assert.equal(local.getItem(KEY), null); assert.equal(s.connected, false); assert.equal(s.listenerCount("game:state"), 0); assert.equal(h.posts, 0);
    put(local, storedB); callback({ ok: true, requestId: s.sends[0].request.requestId, appliedRevision: 1 });
    assert.equal(JSON.parse(local.getItem(KEY)).roomCode, "DEF234");
  } finally { h.cleanup(); globalThis.window = previous; }
});

test("Tạo phòng mới: chưa có trận hoặc đã kết thúc thì về form, không gửi resign", async () => {
  const previous = globalThis.window;
  for (const ended of [false, true]) {
    const local = memoryStorage(); put(local, storedA);
    globalThis.window = { localStorage: local, sessionStorage: memoryStorage(), confirm: () => true };
    const h = mount({ realStorage: true });
    try {
      h.render(); await Promise.resolve(); h.render().newRoom(); h.render(); const s = h.sockets[0];
      s.emit("connect"); s.emit("room:session", { roomCode: "ABC234", seat: "red" });
      const snapshot = ended ? h.snapshot() : { roomCode: "ABC234", serverNow: 1000, deadlines: { red: null, black: null }, playEnabled: false, game: null };
      if (ended) {
        const fixture = loader()("apps/web/src/dev/endgame-fixtures.ts").createEndgameFixture("checkmate");
        snapshot.playEnabled = false; snapshot.game.pieces = fixture.pieces; snapshot.game.sideToMove = "black";
        snapshot.game.result = { status: "finished", winner: "red", loser: "black", reason: "checkmate" };
      }
      s.emit("game:state", snapshot); await Promise.resolve(); h.render();
      assert.equal(h.render().session, null); assert.equal(h.render().savedSession, null); assert.equal(s.sends.length, 0);
      assert.equal(h.posts, 0); assert.equal(local.getItem(KEY), null);
    } finally { h.cleanup(); }
  }
  globalThis.window = previous;
});

test("Tạo phòng mới: mất ack/reconnect giữ request; chấp nhận kết thúc do nguyên nhân khác, không xóa phiên mới", async () => {
  const previous = globalThis.window, local = memoryStorage(); put(local, storedA);
  globalThis.window = { localStorage: local, sessionStorage: memoryStorage(), confirm: () => true };
  const h = mount({ realStorage: true });
  try {
    h.render(); await Promise.resolve(); h.render().newRoom(); h.render(); const s = h.sockets[0];
    s.emit("connect"); s.emit("room:session", { roomCode: "ABC234", seat: "red" }); s.emit("game:state", h.snapshot());
    await Promise.resolve(); const request = s.sends[0].request;
    s.connected = false; s.emit("disconnect", "transport close"); assert.ok(local.getItem(KEY));
    s.connected = true; s.emit("connect"); s.emit("room:session", { roomCode: "ABC234", seat: "red" });
    s.emit("game:state", h.snapshot()); await Promise.resolve(); assert.deepEqual(s.sends[1].request, request);
    put(local, storedB);
    const finished = h.snapshot(); const moving = finished.game.pieces.find((p) => p.id === "red-soldier-0"); moving.position.row = 5;
    Object.assign(finished.game, { revision: 1, sideToMove: "black", lastMove: { pieceId: moving.id, from: { row: 6, col: 0 }, to: { row: 5, col: 0 } },
      result: { status: "finished", winner: "red", loser: "black", reason: "stalemate" } }); finished.playEnabled = false;
    s.emit("game:state", finished); await Promise.resolve(); h.render();
    assert.equal(h.render().session, null); assert.equal(h.render().savedSession.roomCode, "DEF234");
    assert.equal(JSON.parse(local.getItem(KEY)).roomCode, "DEF234"); assert.equal(h.posts, 0);
  } finally { h.cleanup(); globalThis.window = previous; }
});

test("Tạo phòng mới: AUTH_FAILED xóa đúng phiên; lỗi mạng/payload/replaced giữ token", async () => {
  const previous = globalThis.window;
  for (const outcome of ["auth", "network", "payload", "replaced"]) {
    const local = memoryStorage(); put(local, storedA);
    globalThis.window = { localStorage: local, sessionStorage: memoryStorage(), confirm: () => true };
    const h = mount({ realStorage: true });
    try {
      h.render(); await Promise.resolve(); h.render().newRoom(); h.render(); const s = h.sockets[0];
      if (outcome === "auth") s.emit("connect_error", Object.assign(new Error("safe"), { data: { code: "AUTH_FAILED", message: "x" } }));
      else if (outcome === "network") { s.emit("connect_error", new Error("network")); s.io.emit("reconnect_failed"); }
      else if (outcome === "payload") { s.emit("connect"); s.emit("room:session", { roomCode: "ABC234", seat: "red" }); s.emit("game:state", {}); }
      else s.emit("room:replaced", { code: "SEAT_REPLACED", message: "x" });
      await Promise.resolve(); h.render();
      assert.equal(local.getItem(KEY) === null, outcome === "auth"); assert.equal(h.posts, 0);
      if (outcome === "auth") { assert.equal(h.render().session, null); assert.equal(h.render().savedSession, null); }
    } finally { h.cleanup(); }
  }
  globalThis.window = previous;
});

test("Tạo phòng mới: hết retry vẫn giữ phiên, snapshot tới sau không tự bỏ token", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const previous = globalThis.window, local = memoryStorage(); put(local, storedA);
  globalThis.window = { localStorage: local, sessionStorage: memoryStorage(), confirm: () => true };
  const h = mount({ realStorage: true });
  try {
    h.render(); await Promise.resolve(); h.render().newRoom(); h.render(); const s = h.sockets[0];
    s.emit("connect"); s.emit("room:session", { roomCode: "ABC234", seat: "red" }); s.emit("game:state", h.snapshot());
    await Promise.resolve();
    for (let i = 0; i < 3; i++) { t.mock.timers.tick(5000); await Promise.resolve(); }
    assert.equal(s.sends.length, 3); assert.equal(h.render().online.pending.unknown, true);
    const ended = h.snapshot(); ended.playEnabled = false; ended.game.revision = 1;
    ended.game.result = { status: "finished", winner: "black", loser: "red", reason: "resignation" };
    s.emit("game:state", ended); await Promise.resolve(); h.render();
    assert.ok(local.getItem(KEY)); assert.ok(h.render().session); assert.equal(h.render().switchingRoom, true);
    h.render().newRoom(); assert.equal(h.sockets.length, 1); assert.equal(h.posts, 0);
  } finally { h.cleanup(); globalThis.window = previous; }
});

test("Cancelled: Tiếp tục xem kết quả, Tạo phòng mới về form không gửi resign", async () => {
  const previous = globalThis.window;
  for (const replace of [false, true]) {
    const local = memoryStorage(); put(local, storedA);
    globalThis.window = { localStorage: local, sessionStorage: memoryStorage(), confirm: () => true };
    const h = mount({ realStorage: true });
    try {
      h.render(); await Promise.resolve(); if (replace) h.render().newRoom(); else h.render().continueRoom(); h.render();
      const s = h.sockets[0]; s.emit("connect"); s.emit("room:session", { roomCode: "ABC234", seat: "red" });
      const result = h.snapshot(); result.playEnabled = false; result.serverNow = 71000; result.deadlines = { red: 61000, black: 71000 };
      result.game.revision = 1; result.game.result = { status: "cancelled", reason: "both_disconnected" };
      s.emit("game:state", result); await Promise.resolve(); h.render();
      assert.equal(s.sends.length, 0); assert.equal(h.posts, 0);
      if (replace) { assert.equal(h.render().session, null); assert.equal(h.render().savedSession, null); }
      else { assert.equal(h.render().online.snapshot.game.result.status, "cancelled"); assert.equal(h.render().canPlay, false); assert.equal(h.render().canResign, false); }
    } finally { h.cleanup(); }
  }
  globalThis.window = previous;
});

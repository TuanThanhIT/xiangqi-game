import test from "node:test";
import assert from "node:assert/strict";
import { loader } from "./load-source.mjs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";

test("Theme contract: 5 ID, snapshot bắt buộc theme đã kiểm tra, credentials/storage không mang theme", () => {
  const load = loader(), { isRoomThemeId, ROOM_THEME_IDS } = load("apps/web/src/features/rooms/room-theme.ts");
  const { isSnapshot, isSession } = load("apps/web/src/features/rooms/room-contract.ts");
  assert.deepEqual(ROOM_THEME_IDS, ["earth", "meadow", "ink", "bamboo", "snow"]);
  const players = { red: { nickname: "A", side: "red", connected: true }, black: null };
  for (const themeId of ROOM_THEME_IDS) assert.equal(isSnapshot({ roomCode: "ABC234", themeId, players }), true);
  for (const themeId of [undefined, null, "EARTH", "", "https://example.com/a.png", "../bamboo", "url(x)", {}]) {
    assert.equal(isRoomThemeId(themeId), false); assert.equal(isSnapshot({ roomCode: "ABC234", themeId, players }), false);
  }
  const session = { roomCode: "ABC234", seat: "red", nickname: "A", seatToken: "A".repeat(43) };
  assert.equal(isSession(session), true); assert.equal(isSession({ ...session, themeId: "snow" }), false);
});

function elements(value) {
  if (Array.isArray(value)) return value.flatMap(elements);
  return value?.props ? [value, ...elements(value.props.children)] : [];
}

test("Bộ chọn: 5 radio có tên, preview nhỏ, dấu chọn; create gửi ID, join không chọn lại", () => {
  const load = loader(), Picker = load("apps/web/src/features/rooms/ThemePicker.tsx").default;
  const markup = renderToStaticMarkup(React.createElement(Picker, { value: "earth", disabled: false, onChange() {} }));
  assert.equal((markup.match(/type="radio"/g) ?? []).length, 5);
  assert.equal((markup.match(/checked=""/g) ?? []).length, 1);
  assert.ok(markup.includes("Đã chọn")); assert.ok(!markup.includes("page-bg.webp"));
  const { ROOM_THEME_IDS, ROOM_THEMES } = load("apps/web/src/features/rooms/room-theme.ts");
  for (const id of ROOM_THEME_IDS) {
    assert.ok(markup.includes(ROOM_THEMES[id].name));
    assert.ok(fs.existsSync("apps/web/public" + ROOM_THEMES[id].preview));
  }
  const disabled = renderToStaticMarkup(React.createElement(Picker, { value: "snow", disabled: true, onChange() {} }));
  assert.ok(disabled.includes('<fieldset')); assert.ok(disabled.includes('disabled=""'));
  let cursor = 0; const slots = [], calls = [];
  const Form = loader({ react: { useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], v => { slots[i] = v; }]; } } })("apps/web/src/features/rooms/RoomForm.tsx").default;
  const render = (mode) => { cursor = 0; return Form({ mode, loading: false, submit: (...args) => { calls.push(args); return Promise.resolve(); } }); };
  let tree = render("create");
  const pick = elements(tree).find(e => typeof e.type === "function" && e.props.value === "earth");
  assert.ok(pick); pick.props.onChange("bamboo"); tree = render("create");
  elements(tree).find(e => e.type === "form").props.onSubmit({ preventDefault() {} });
  assert.deepEqual(calls.at(-1), ["", undefined, "bamboo"]);
  tree = render("join"); assert.ok(!elements(tree).some(e => e.props.value === "bamboo" && typeof e.type === "function"));
  elements(tree).find(e => e.type === "form").props.onSubmit({ preventDefault() {} });
  assert.deepEqual(calls.at(-1), ["", ""]);
});

test("Bàn theme: giữ tọa độ/giao điểm/chữ Hán; sông tĩnh, viền kép hai phe, chỉ nạp texture đang dùng", () => {
  const load = loader(), Board = load("apps/web/src/components/BoardView.tsx").default;
  const pieces = load("packages/rules/src/initial-position.ts").createInitialPieces();
  for (const themeId of ["earth", "meadow", "ink", "bamboo", "snow"]) {
    const markup = renderToStaticMarkup(React.createElement(Board, { pieces, themeId, selectedPieceId: null, lastMove: null, disabled: false, onActivate() {}, onClearSelection() {} }));
    assert.ok(markup.includes('viewBox="0 0 552 612"')); assert.ok(!markup.includes("SÔNG"));
    assert.ok(markup.includes(`/themes/${themeId}/ground.webp`));
    assert.equal((markup.match(/class="piece-inner-ring"/g) ?? []).length, 32);
    assert.equal((markup.match(/class="board-intersection"/g) ?? []).length, 90);
    assert.equal((markup.match(/tabindex="0"/g) ?? []).length, 1);
    assert.ok(markup.includes("帥")); assert.ok(markup.includes("將"));
    for (const other of ["earth", "meadow", "ink", "bamboo", "snow"].filter(id=>id!==themeId)) assert.ok(!markup.includes(`/themes/${other}/`));
  }
});

test("UI: chưa có theme snapshot thì trung tính/khóa bàn; nhận server theme mới mở quyền UI sẵn có", () => {
  const session = { roomCode: "ABC234", nickname: "A", seat: "red", seatToken: "A".repeat(43) };
  const pieces = loader()("packages/rules/src/initial-position.ts").createInitialPieces();
  const room = { ready: true, session, snapshot: null, identity: { roomCode: "ABC234", seat: "red" }, phase: "Đã xác thực",
    online: { synced: true, snapshot: { game: { pieces, sideToMove: "red", revision: 0, lastMove: null, result: { status: "playing", sideToMove: "red", inCheck: false } }, deadlines: { red: null, black: null } } },
    canPlay: true, canResign: true, selectionEpoch: 0, sendMove() {}, sendResign() {} };
  const Play = loader({ "./useRoomSession": { useRoomSession: () => room }, "next/navigation": { useRouter: () => ({ push() {} }) } })("apps/web/src/features/rooms/PlayRoom.tsx").default;
  let html = renderToStaticMarkup(React.createElement(Play));
  assert.ok(html.includes("Đang chờ phong cách")); assert.ok(!html.includes('data-theme='));
  assert.equal((html.match(/aria-disabled="true"/g) ?? []).length, 90);
  room.snapshot = { roomCode: "ABC234", themeId: "snow", players: { red: { nickname: "A", side: "red", connected: true }, black: { nickname: "B", side: "black", connected: true } } };
  html = renderToStaticMarkup(React.createElement(Play));
  assert.ok(html.includes('data-theme="snow"')); assert.ok(html.includes('Người chơi phe Đen'));
  assert.equal((html.match(/aria-disabled="true"/g) ?? []).length, 0);
  assert.ok(html.includes("/themes/snow/ground.webp"));
});

test("Proxy theme: mặc định earth, chỉ create chuyển theme; request sai không gọi upstream", async () => {
  let calls = [];
  const session = { roomCode: "ABC234", seat: "red", nickname: "A", seatToken: "A".repeat(43) };
  const original = globalThis.fetch;
  const proxy = loader({ "./room-config": { getBackendHttpOrigin: () => "http://127.0.0.1:3001" } })("apps/web/src/features/rooms/room-proxy.ts").proxyRoomRequest;
  try {
    globalThis.fetch = async (url, options) => {
      calls.push({ url, ...options });
      return Response.json({ ...session, seat: url.endsWith("/join") ? "black" : "red" }, { status: url.endsWith("/join") ? 200 : 201 });
    };
    const request = (body) => new Request("http://localhost/api/rooms", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json", "Cookie": "must-not-forward" } });
    let response = await proxy(request({ nickname: " A " }));
    assert.equal(response.status, 201); assert.deepEqual(JSON.parse(calls.at(-1).body), { nickname: "A", themeId: "earth" });
    response = await proxy(request({ nickname: "A", themeId: "ink" }));
    assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal(JSON.parse(calls.at(-1).body).themeId, "ink");
    response = await proxy(request({ nickname: "A" }), "ABC234");
    assert.equal(response.status, 200); assert.deepEqual(JSON.parse(calls.at(-1).body), { nickname: "A" });
    assert.deepEqual(calls.at(-1).headers, { "Content-Type": "application/json" });
    const count = calls.length;
    for (const themeId of [null, {}, [], "x", "https://example.com/a", "../ink"]) assert.equal((await proxy(request({ nickname: "A", themeId }))).status, 400);
    assert.equal((await proxy(request({ nickname: "A", themeId: "snow" }), "ABC234")).status, 400);
    assert.equal(calls.length, count);
    globalThis.fetch = async () => Response.json({ ...session, unknown: true }, { status: 201 });
    assert.equal((await proxy(request({ nickname: "A", themeId: "earth" }))).status, 502);
    globalThis.fetch = async () => { throw Object.assign(new Error("private"), { name: "TimeoutError" }); };
    const timeout = await proxy(request({ nickname: "A", themeId: "earth" }));
    assert.equal(timeout.status, 504); assert.ok(!(await timeout.text()).includes("private"));
  } finally { globalThis.fetch = original; }
});

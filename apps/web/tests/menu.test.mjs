import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loader } from "./load-source.mjs";

const Link = ({ children, ...props }) => React.createElement("a", props, children);
const css = new Proxy({}, { get: (_, key) => key === "__esModule" ? false : String(key) });
const session = { roomCode: "ABC234", seatToken: "A".repeat(43), seat: "red", nickname: "Đ".repeat(30) };
function elements(value) {
  if (Array.isArray(value)) return value.flatMap(elements);
  return value?.props ? [value, ...elements(value.props.children)] : [];
}

test("Menu: SSR không đọc storage; mount mới hiện tiếp tục; các route đúng và tính năng tương lai khóa", async () => {
  let reads = 0, cursor = 0; const slots = [], effects = [];
  const mocks = { "next/link": Link, "./main-menu.module.css": css,
    "@/features/rooms/room-storage": { loadRoomSession: () => { reads++; return { session, warning: "" }; } } };
  const MenuSSR = loader(mocks)("apps/web/src/components/MainMenu.tsx").default;
  const html = renderToStaticMarkup(React.createElement(MenuSSR));
  assert.equal(reads, 0); assert.ok(!html.includes("Tiếp tục phòng"));
  for (const href of ["/play?mode=create", "/play?mode=join", "/local"]) assert.ok(html.includes(`href="${href}"`));
  assert.deepEqual([...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]), ["/play?mode=create", "/play?mode=join", "/local"]);
  for (const label of ["Đánh với máy", "Tài khoản và hồ sơ", "Bảng xếp hạng", "Bộ sưu tập nhân vật", "Cửa hàng và phần thưởng", "Sắp ra mắt"]) assert.ok(html.includes(label));
  assert.match(html, /<button[^>]*disabled/);
  const Menu = loader({ ...mocks, react: {
    useState(initial) { const i = cursor++; slots[i] ??= initial; return [slots[i], (v) => { slots[i] = v; }]; },
    useEffect(fn) { effects.push(fn); },
  } })("apps/web/src/components/MainMenu.tsx").default;
  const previous = globalThis.window; globalThis.window = {};
  try {
    cursor = 0; Menu(); const cleanup = effects.shift()(); await Promise.resolve();
    cursor = 0; const tree = Menu();
    assert.equal(reads, 1);
    const link = elements(tree).find((e) => e.type === Link && e.props.href === "/play");
    assert.ok(link); const markup = renderToStaticMarkup(tree);
    assert.ok(markup.includes(session.nickname));
    assert.deepEqual([...markup.matchAll(/href="([^"]+)"/g)].map((m) => m[1]), ["/play", "/play?mode=create", "/play?mode=join", "/local"]);
    assert.ok(markup.includes("ABC234")); assert.ok(!markup.includes(session.seatToken)); cleanup();
  } finally { globalThis.window = previous; }
});

test("Route /play chọn đúng form; /local vẫn có bàn khai cuộc và Ván mới", async () => {
  const load = loader({ "next/link": Link, "./play-room.module.css": css, "next/navigation": { useRouter: () => ({ push() {} }) } });
  const Page = load("apps/web/src/app/play/page.tsx").default;
  const Play = load("apps/web/src/features/rooms/PlayRoom.tsx").default;
  for (const mode of ["create", "join", "both"]) {
    const tree = await Page({ searchParams: Promise.resolve({ mode }) });
    assert.equal(elements(tree).find((e) => e.type === Play).props.initialMode, mode);
  }
  const Form = load("apps/web/src/features/rooms/RoomForm.tsx").default;
  for (const mode of ["create", "join"]) {
    const html = renderToStaticMarkup(React.createElement(Form, { mode, loading: false, submit() {} }));
    assert.equal((html.match(/<form/g) ?? []).length, 1);
    assert.equal(html.includes('id="room-code"'), mode === "join");
    assert.ok(html.includes(mode === "join" ? "Vào phòng" : "Tạo phòng"));
  }
  const Local = load("apps/web/src/app/local/page.tsx").default;
  const html = renderToStaticMarkup(React.createElement(Local));
  assert.equal((html.match(/class="piece piece--/g) ?? []).length, 32);
  assert.ok(html.includes("Ván mới")); assert.ok(html.includes('href="/"'));
});

test("Màn hình kết quả: Về menu dùng router; Tạo phòng mới mở đúng form và không thêm lối thoát khi đang chơi", () => {
  let exits = 0; const pushed = [], state = []; let cursor = 0;
  const room = { ready: true, session, online: { synced: true, snapshot: { game: { result: { status: "finished" } } } },
    canLeaveFinished: true, exitFinishedRoom: () => { exits++; return true; } };
  const load = loader({ "next/navigation": { useRouter: () => ({ push: (url) => pushed.push(url) }) }, "./play-room.module.css": css,
    "./useRoomSession": { useRoomSession: () => room }, react: { useState: (initial) => {
      const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], (v) => { state[i] = v; }];
    } } });
  const Play = load("apps/web/src/features/rooms/PlayRoom.tsx").default;
  const Board = load("apps/web/src/features/rooms/OnlineBoard.tsx").default;
  const Form = load("apps/web/src/features/rooms/RoomForm.tsx").default;
  const render = () => { cursor = 0; return Play({ initialMode: "join" }); };
  let actions = elements(render()).find((e) => e.type === Board).props.resultActions;
  elements(actions).find((e) => e.type === "button" && e.props.children === "Về menu").props.onClick();
  assert.deepEqual(pushed, ["/"]); assert.equal(exits, 1);
  actions = elements(render()).find((e) => e.type === Board).props.resultActions;
  elements(actions).find((e) => e.type === "button" && e.props.children === "Tạo phòng mới").props.onClick();
  room.session = null;
  assert.equal(elements(render()).find((e) => e.type === Form).props.mode, "create"); assert.equal(exits, 2);
  const RealBoard = loader()("apps/web/src/features/rooms/OnlineBoard.tsx").default;
  const boardProps = { game: { pieces: [], sideToMove: "red", revision: 0, result: { status: "playing", inCheck: false } }, side: "red", canPlay: false, canResign: false, selectionEpoch: 0, resultActions: actions };
  const html = renderToStaticMarkup(React.createElement(RealBoard, boardProps));
  assert.ok(!html.includes("Về menu")); assert.ok(!html.includes("Tạo phòng mới"));
});

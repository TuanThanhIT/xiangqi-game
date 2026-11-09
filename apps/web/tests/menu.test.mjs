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

test("Cổng game: vào sảnh kiểm tra phiên, đăng nhập riêng, local không cần tài khoản; không đọc token ghế phòng", async () => {
  let reads = 0;
  const Menu = loader({ "next/link": Link,
    "./PortalBoard": { __esModule: true, default: () => React.createElement("div", { role: "img", "aria-label": "Bàn cờ tướng" }) },
    "@/features/rooms/room-storage": { loadRoomSession: () => { reads++; return { session }; } },
  })("apps/web/src/components/MainMenu.tsx").default;
  const html = renderToStaticMarkup(React.createElement(Menu));
  assert.equal(reads, 0);
  assert.deepEqual([...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]), ["/login", "/lobby", "/local"]);
  for (const label of ["Khai cuộc", "Cờ tướng", "Cờ vua", "Cờ úp", "Vào game", "Hẹn bạn một ván, so tài từng nước.", "Chơi cùng thiết bị", "Đăng nhập"]) assert.ok(html.includes(label));
  assert.ok(!html.includes(session.seatToken));
  const Login = loader({ "next/link": Link, "next/navigation": { useRouter: () => ({ replace() {} }) } })("apps/web/src/app/login/page.tsx").default;
  const login = renderToStaticMarkup(await Login());
  assert.ok(login.toLowerCase().includes('autocomplete="username"'));
  assert.ok(login.toLowerCase().includes('autocomplete="current-password"'));
  assert.ok(login.includes('aria-label="Hiện mật khẩu"'));
  assert.ok(login.includes('href="/"'));
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
    "./useRoomSession": { useRoomSession: () => room }, react: { useEffect: () => {}, useState: (initial) => {
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

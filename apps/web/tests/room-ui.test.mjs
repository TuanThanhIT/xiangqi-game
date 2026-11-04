import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loader } from "./load-source.mjs";

const css = new Proxy({}, { get: (_, key) => key === "__esModule" ? false : String(key) });
const styleMock = { "./play-room.module.css": css };
const html = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
function elements(value) {
  if (Array.isArray(value)) return value.flatMap(elements);
  return value?.props ? [value, ...elements(value.props.children)] : [];
}
function hooks() {
  const slots = []; let cursor = 0;
  return { react: { useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial;
    return [slots[i], (value) => { slots[i] = value; }]; } },
    render(Component, props) { cursor = 0; return Component(props); } };
}

test("RoomForm: label/help/lỗi nối input, loading khóa đúng nút, chỉ một nội dung trạng thái được đọc", () => {
  const Form = loader(styleMock)("apps/web/src/features/rooms/RoomForm.tsx").default;
  for (const mode of ["create", "join", "both"]) for (const loading of [false, true]) {
    const markup = html(Form, { mode, loading, errorId: "room-error", submit() {} });
    assert.ok(markup.includes('for="room-nickname"'));
    assert.ok(markup.includes('aria-describedby="nickname-help room-error"'));
    assert.ok(markup.includes('id="nickname-help"'));
    assert.equal(markup.includes('id="room-code"'), mode !== "create");
    if (mode !== "create") assert.ok(markup.includes('aria-describedby="code-help room-error"'));
    const buttons = [...markup.matchAll(/<button([^>]+)>/g)];
    assert.equal(buttons.length, mode === "both" ? 2 : 1);
    assert.ok(buttons.every((m) => m[1].includes('disabled=""') === loading));
    assert.ok(markup.includes('aria-busy="' + loading + '"'));
    assert.ok(markup.includes('class="buttonSizer" aria-hidden="true"'));
    assert.equal((markup.match(/role="alert"/g) ?? []).length, 0); // Lỗi có đúng một vùng ở PlayRoom.
  }
});

test("RoomForm: giữ nguyên nickname, trim/uppercase mã và chỉ gọi submit do người dùng gửi form", () => {
  const h = hooks(), calls = [];
  const Form = loader({ ...styleMock, react: h.react })("apps/web/src/features/rooms/RoomForm.tsx").default;
  const props = { mode: "both", loading: false, submit: (...args) => { calls.push(args); return Promise.resolve(); } };
  let tree = h.render(Form, props);
  elements(tree).find((e) => e.props.id === "room-nickname").props.onChange({ target: { value: "  Kỳ thủ  " } });
  elements(tree).find((e) => e.props.id === "room-code").props.onChange({ target: { value: " abc234 " } });
  tree = h.render(Form, props); assert.equal(calls.length, 0);
  let prevented = 0;
  for (const form of elements(tree).filter((e) => e.type === "form")) form.props.onSubmit({ preventDefault() { prevented++; } });
  assert.equal(prevented, 2);
  assert.deepEqual(calls, [["  Kỳ thủ  ", undefined, "earth"], ["  Kỳ thủ  ", "ABC234"]]);
});

test("Phòng chờ: phân biệt ghế trống/offline/online, tên dài và snapshot chưa xác thực", () => {
  const Lobby = loader(styleMock)("apps/web/src/features/rooms/RoomLobby.tsx").default;
  const name = "Đ".repeat(30);
  const props = { roomCode: "ABC234", identity: null, phase: "Đang xác thực ghế", snapshot: {
    roomCode: "ABC234", themeId: "earth", players: { red: { nickname: name, side: "red", connected: false }, black: null } } };
  const initial = html(Lobby, props);
  assert.ok(initial.includes(name)); assert.ok(initial.includes("Phe Đỏ")); assert.ok(initial.includes("Phe Đen"));
  assert.ok(initial.includes("Đã giữ ghế · đang offline")); assert.ok(initial.includes("Chưa có người giữ ghế"));
  assert.ok(initial.includes("Chưa được server xác nhận")); assert.ok(initial.includes("Sao chép mã phòng"));
  const list = initial.match(/<ul[^>]*>([\s\S]*?)<\/ul>/)[0];
  assert.ok(!list.includes('role="status"')); assert.ok(!list.includes('role="alert"'));
  props.snapshot.players.black = { nickname: "B", side: "black", connected: true };
  const occupied = html(Lobby, props);
  assert.ok(occupied.includes("Đã giữ ghế · online")); assert.ok(!occupied.includes("Chưa có người giữ ghế"));
  assert.ok(occupied.includes("Phòng đã đủ hai người"));
  const noSnapshot = html(Lobby, { ...props, snapshot: null });
  assert.ok(noSnapshot.includes("Đang chờ trạng thái phòng từ server"));
  const inGame = html(Lobby, { ...props, hasGame: true });
  assert.ok(inGame.includes("Phòng chơi")); assert.ok(inGame.includes("lobbyCompact"));
  assert.ok(!inGame.includes("Đang chờ đồng bộ trận"));
});

test("Sao chép mã: giữ hành vi thành công/lỗi, không log dữ liệu; Notice chỉ lỗi thao tác mới alert", async () => {
  const previousNavigator = globalThis.navigator;
  try {
    for (const fail of [false, true]) {
      const h = hooks(), copied = [];
      Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { writeText: async (code) => {
        if (fail) throw Error("blocked"); copied.push(code);
      } } } });
      const Lobby = loader({ ...styleMock, react: h.react })("apps/web/src/features/rooms/RoomLobby.tsx").default;
      const props = { roomCode: "ABC234", identity: null, snapshot: null, phase: "Đang kết nối" };
      const tree = h.render(Lobby, props);
      elements(tree).find((e) => e.type === "button").props.onClick();
      await Promise.resolve(); await Promise.resolve();
      const text = JSON.stringify(h.render(Lobby, props));
      assert.ok(text.includes(fail ? "Không sao chép được" : "Đã sao chép mã phòng"));
      assert.deepEqual(copied, fail ? [] : ["ABC234"]);
    }
  } finally { Object.defineProperty(globalThis, "navigator", { configurable: true, value: previousNavigator }); }
  const Notice = loader(styleMock)("apps/web/src/features/rooms/Notice.tsx").default;
  assert.ok(html(Notice, { children: "Đang kết nối" }).includes('role="status"'));
  assert.ok(html(Notice, { tone: "error", children: "Lỗi", id: "room-error" }).includes('role="alert"'));
  assert.ok(!html(Notice, { live: false, children: "Chờ người chơi" }).includes('role='));
});

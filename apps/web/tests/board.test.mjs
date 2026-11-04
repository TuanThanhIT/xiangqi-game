import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialPieces } from "@xiangqi/rules";
import { loader } from "./load-source.mjs";

function elements(value) {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !value.props) return [];
  return [value, ...elements(value.props.children)];
}
function hooks() {
  let slots = [], cursor = 0;
  return { react: { useId: () => "board-test", useMemo: (fn) => fn(), useRef: (initial) => {
    const index = cursor++; return slots[index] ??= { current: initial };
  }, useState: (initial) => {
    const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
    return [slots[index], (next) => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
  }, useImperativeHandle: (ref, factory) => { if (ref) ref.current = factory(); } },
  render(fn, props) { cursor = 0; return fn(props); } };
}

test("Local/development: SVG đủ 32 quân/90 giao điểm, title chuỗi đơn; fixture kết thúc và nút reset còn nguyên", () => {
  const load = loader(); const Local = load("apps/web/src/components/XiangqiBoard.tsx").default;
  const initialMarkup = renderToStaticMarkup(React.createElement(Local));
  assert.equal((initialMarkup.match(/class="piece piece--/g) ?? []).length, 32);
  assert.equal((initialMarkup.match(/class="board-intersection"/g) ?? []).length, 90);
  assert.ok(initialMarkup.includes("Ván mới")); assert.ok(initialMarkup.includes("Đỏ"));
  assert.ok(!initialMarkup.includes("Đầu hàng"));
  assert.ok(!initialMarkup.includes("<!--"));
  const fixture = load("apps/web/src/dev/endgame-fixtures.ts").createEndgameFixture;
  for (const scenario of ["checkmate", "stalemate"]) {
    const markup = renderToStaticMarkup(React.createElement(Local, { initialGame: fixture(scenario) }));
    assert.ok(markup.includes(scenario === "checkmate" ? "bị chiếu bí" : "hết nước đi hợp lệ dù không bị chiếu"));
    assert.equal((markup.match(/aria-disabled="true"/g) ?? []).length, 90);
    assert.ok(markup.includes("Ván mới"));
  }
});

test("Local: chọn/đi/ăn, hủy confirm giữ trận; reset mới đủ quân/Đỏ và focus nút", () => {
  const h = hooks(), load = loader({ react: h.react });
  const Local = load("apps/web/src/components/XiangqiBoard.tsx").default;
  const Board = load("apps/web/src/components/BoardView.tsx").default;
  function board(tree) { return elements(tree).find((e) => e.type === Board); }
  let tree = h.render(Local); const initial = board(tree).props.pieces;
  const act = (row, col) => { board(tree).props.onActivate({ row, col }); tree = h.render(Local); };
  act(6, 0); act(5, 0); act(3, 0); act(4, 0); act(5, 0); act(4, 0);
  assert.equal(board(tree).props.pieces.length, 31);
  let focused = 0; const button = { focus: () => focused++ };
  const previousWindow = globalThis.window;
  try {
    globalThis.window = { confirm: () => false };
    const before = board(tree).props.pieces;
    elements(tree).find((e) => e.type === "button").props.onClick({ currentTarget: button });
    tree = h.render(Local); assert.equal(board(tree).props.pieces, before);
    globalThis.window.confirm = () => true;
    elements(tree).find((e) => e.type === "button").props.onClick({ currentTarget: button });
    tree = h.render(Local); const after = board(tree).props;
    assert.equal(after.pieces.length, 32); assert.equal(after.selectedPieceId, null); assert.equal(after.lastMove, null);
    assert.notEqual(after.pieces, initial); assert.equal(focused, 2);
    assert.equal(after.pieces.find((p) => p.id === "red-soldier-0").position.row, 6);
    act(6, 0); assert.equal(board(tree).props.selectedPieceId, "red-soldier-0");
  } finally { globalThis.window = previousWindow; }
  for (const scenario of ["checkmate", "stalemate"]) {
    const f = hooks(), l = loader({ react: f.react }), Component = l("apps/web/src/components/XiangqiBoard.tsx").default;
    const initialGame = l("apps/web/src/dev/endgame-fixtures.ts").createEndgameFixture(scenario);
    const view = l("apps/web/src/components/BoardView.tsx").default;
    let end = f.render(Component, { initialGame });
    elements(end).find((e) => e.type === "button").props.onClick({ currentTarget: button });
    end = f.render(Component, { initialGame });
    assert.equal(elements(end).find((e) => e.type === view).props.pieces.length, 32);
  }
});

test("BoardView: roving focus, Enter/Space, bubbling; khóa vẫn cho mũi tên; reset focus index", () => {
  const h = hooks(), load = loader({ react: h.react }); const Board = load("apps/web/src/components/BoardView.tsx").default;
  const handleRef = { current: null }; let actions = 0, cleared = 0, focused = 0;
  const props = { pieces: [], selectedPieceId: null, lastMove: null, disabled: false, handleRef,
    onActivate: () => actions++, onClearSelection: () => cleared++ };
  let tree = h.render(Board, props);
  const points = () => elements(tree).filter((e) => e.props.role === "button");
  assert.equal(points().filter((e) => e.props.tabIndex === 0).length, 1);
  let stop = 0, prevent = 0;
  points()[81].props.onClick({ stopPropagation: () => stop++, currentTarget: { focus: () => focused++ } });
  assert.equal(actions, 1); assert.equal(stop, 1);
  points()[82].props.ref({ focus: () => focused++ });
  points()[81].props.onKeyDown({ key: "ArrowRight", preventDefault: () => prevent++, stopPropagation: () => stop++ });
  points()[81].props.onKeyDown({ key: "Enter", repeat: false, preventDefault: () => prevent++, stopPropagation: () => stop++ });
  assert.equal(actions, 2); assert.equal(focused, 2);
  tree = h.render(Board, { ...props, disabled: true });
  points()[81].props.onKeyDown({ key: " ", repeat: false, preventDefault() {}, stopPropagation() {} });
  assert.equal(actions, 2);
  points()[81].props.onKeyDown({ key: "ArrowRight", preventDefault() {}, stopPropagation() {} });
  assert.equal(focused, 3);
  points()[82].props.onFocus(); handleRef.current.resetFocus(); tree = h.render(Board, props);
  assert.equal(points()[81].props.tabIndex, 0);
  elements(tree).find((e) => e.type === "svg").props.onClick(); assert.equal(cleared, 1);
});

test("Online: chọn đúng phe, gửi ý định không sửa bàn, mất quyền xóa chọn; không có Ván mới", () => {
  const h = hooks(), load = loader({ react: h.react });
  const Online = load("apps/web/src/features/rooms/OnlineBoard.tsx").default;
  const Board = load("apps/web/src/components/BoardView.tsx").default;
  const game = { pieces: createInitialPieces(), sideToMove: "red", revision: 0, lastMove: null,
    result: { status: "playing", sideToMove: "red", inCheck: false } };
  const before = structuredClone(game), sends = [];
  const props = { game, side: "red", canPlay: true, selectionEpoch: 0,
    sendMove: (id, to) => { sends.push({ id, to }); return true; } };
  let tree = h.render(Online, props);
  const view = () => elements(tree).find((e) => e.type === Board).props;
  view().onActivate({ row: 3, col: 0 }); tree = h.render(Online, props); assert.equal(view().selectedPieceId, null);
  view().onActivate({ row: 6, col: 0 }); tree = h.render(Online, props); assert.equal(view().selectedPieceId, "red-soldier-0");
  view().onActivate({ row: 5, col: 0 }); tree = h.render(Online, props);
  assert.deepEqual(sends, [{ id: "red-soldier-0", to: { row: 5, col: 0 } }]); assert.deepEqual(game, before);
  assert.equal(view().selectedPieceId, null);
  view().onActivate({ row: 6, col: 0 }); tree = h.render(Online, props);
  tree = h.render(Online, { ...props, canPlay: false }); assert.equal(view().selectedPieceId, null);
  tree = h.render(Online, props); assert.equal(view().selectedPieceId, null);
  const real = loader()("apps/web/src/features/rooms/OnlineBoard.tsx").default;
  const markup = renderToStaticMarkup(React.createElement(real, props)); assert.ok(!markup.includes("Ván mới"));
});

test("Online resign: hủy confirm không gửi/đổi trận; offline/ngoài lượt bật riêng; kết quả đúng cả hai phe", () => {
  const h = hooks(), load = loader({ react: h.react }), Online = load("apps/web/src/features/rooms/OnlineBoard.tsx").default;
  const game = { pieces: createInitialPieces(), sideToMove: "red", revision: 0, lastMove: null,
    result: { status: "playing", sideToMove: "red", inCheck: false } };
  const before = structuredClone(game); let sends = 0, confirms = 0;
  const props = { game, side: "black", canPlay: false, canResign: true, selectionEpoch: 0, sendMove: () => false,
    sendResign: () => { sends++; return true; } };
  const previousWindow = globalThis.window;
  try {
    globalThis.window = { confirm: () => { confirms++; return false; } };
    let tree = h.render(Online, props);
    const button = () => elements(tree).find((e) => e.type === "button" && e.props.children === "Đầu hàng");
    assert.equal(button().props.disabled, false); button().props.onClick(); assert.equal(sends, 0); assert.deepEqual(game, before);
    globalThis.window.confirm = () => { confirms++; return true; }; button().props.onClick(); assert.equal(sends, 1);
    tree = h.render(Online, { ...props, canResign: false }); assert.equal(button().props.disabled, true);
    button().props.onClick(); assert.equal(sends, 1); assert.equal(confirms, 2);
  } finally { globalThis.window = previousWindow; }
  const RealOnline = loader()("apps/web/src/features/rooms/OnlineBoard.tsx").default;
  for (const winner of ["red", "black"]) {
    const finished = { ...game, revision: 1, result: { status: "finished", winner, loser: winner === "red" ? "black" : "red", reason: "resignation" } };
    const markup = renderToStaticMarkup(React.createElement(RealOnline, { ...props, game: finished, canResign: false }));
    assert.ok(markup.includes(`${winner === "red" ? "Đỏ" : "Đen"} thắng do đối thủ đầu hàng.`));
    assert.equal((markup.match(/aria-disabled="true"/g) ?? []).length, 90); assert.ok(!markup.includes("Ván mới"));
  }
});

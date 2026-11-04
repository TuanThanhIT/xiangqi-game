import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialPieces } from "@xiangqi/rules";
import { loader } from "./load-source.mjs";

const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
const initial = () => ({ pieces: createInitialPieces(), sideToMove: "red", revision: 0, lastMove: null,
  result: { status: "playing", sideToMove: "red", inCheck: false } });

test("Mặt quân: đủ 7 chữ Hán mỗi phe, chỉ đổi mặt; title/aria-label tiếng Việt và đầu vào nguyên vẹn", () => {
  const Board = loader()("apps/web/src/components/BoardView.tsx").default;
  const pieces = createInitialPieces(), before = structuredClone(pieces);
  const markup = render(Board, { pieces, selectedPieceId: null, lastMove: null, disabled: false, onActivate() {}, onClearSelection() {} });
  const expected = {
    red: { general: "帥", advisor: "仕", elephant: "相", rook: "俥", horse: "傌", cannon: "炮", soldier: "兵" },
    black: { general: "將", advisor: "士", elephant: "象", rook: "車", horse: "馬", cannon: "砲", soldier: "卒" },
  };
  const names = { general: "Tướng", advisor: "Sĩ", elephant: "Tượng", rook: "Xe", horse: "Mã", cannon: "Pháo", soldier: "Tốt" };
  const faces = [...markup.matchAll(/<g class="piece piece--(red|black)"[^>]*>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<text[^>]*>(.*?)<\/text>/g)];
  assert.equal(faces.length, 32);
  const seen = { red: new Set(), black: new Set() };
  for (const [index, face] of faces.entries()) {
    const piece = pieces[index], label = `${names[piece.type]} ${piece.side === "red" ? "Đỏ" : "Đen"}, hàng ${piece.position.row}, cột ${piece.position.col}`;
    assert.equal(face[1], piece.side); assert.equal(face[2], label); assert.equal(face[3], expected[piece.side][piece.type]);
    assert.ok(markup.includes(`aria-label="${label}"`)); seen[piece.side].add(piece.type);
  }
  assert.equal(seen.red.size, 7); assert.equal(seen.black.size, 7);
  assert.ok(markup.includes('x="0" y="0" text-anchor="middle" dominant-baseline="central"'));
  assert.deepEqual(pieces, before);
});

test("Online: phân biệt lượt; giữ SVG/tọa độ/roving focus; kết quả và thao tác sau bàn", () => {
  const Online = loader()("apps/web/src/features/rooms/OnlineBoard.tsx").default;
  const game = initial(); const before = structuredClone(game);
  const props = { game, side: "red", canPlay: true, canResign: true, selectionEpoch: 0, sendMove() {}, sendResign() {},
    resultActions: React.createElement("button", null, "Về menu") };
  const own = render(Online, props), other = render(Online, { ...props, side: "black", canPlay: false });
  assert.ok(own.includes("Lượt của bạn")); assert.ok(other.includes("Lượt đối thủ"));
  assert.ok(other.includes("Chưa thể đi quân"));
  assert.ok(own.includes('viewBox="0 0 552 612"'));
  assert.equal((own.match(/class="board-intersection"/g) ?? []).length, 90);
  assert.equal((own.split('</svg>')[0].match(/tabindex="0"/g) ?? []).length, 1);
  assert.ok(own.includes('aria-label="Thông báo và kết quả trận" tabindex="0"'));
  assert.ok(!own.includes('class="xq-match-sidebar"'));
  assert.ok(own.indexOf('Người chơi phe Đen') < own.indexOf('<svg'));
  assert.ok(own.indexOf('Người chơi phe Đỏ') > own.indexOf('</svg>'));
  assert.ok(!own.includes("Về menu"));
  for (const reason of ["resignation", "disconnect_timeout", "checkmate", "stalemate", "both_disconnected"]) {
    const result = reason === "both_disconnected" ? { status: "cancelled", reason } : { status: "finished", winner: "black", loser: "red", reason };
    const ended = render(Online, { ...props, canPlay: false, canResign: false, game: { ...game, revision: 1, result } });
    assert.ok(ended.indexOf("</svg>") < ended.indexOf('aria-label="Kết quả trận online"'));
    assert.ok(ended.includes("Về menu"));
    assert.equal((ended.match(/aria-disabled="true"/g) ?? []).length, 90);
    if (reason === "both_disconnected") {
      assert.ok(ended.includes("xq-result--neutral")); assert.ok(!ended.includes("thắng")); assert.ok(!ended.includes("Bạn thua"));
    } else assert.ok(ended.includes("Bạn thua"));
  }
  assert.deepEqual(game, before);
});

test("Local: kết quả/reset nằm sau bàn; vẫn có đầy đủ tên quân và các dấu ở cùng giao điểm", () => {
  const load = loader(), Local = load("apps/web/src/components/XiangqiBoard.tsx").default;
  const fixture = load("apps/web/src/dev/endgame-fixtures.ts").createEndgameFixture("checkmate");
  const ended = render(Local, { initialGame: fixture });
  assert.ok(ended.indexOf("</svg>") < ended.indexOf('aria-label="Kết quả ván local"'));
  assert.ok(ended.indexOf("</svg>") < ended.indexOf("Ván mới"));
  const Board = load("apps/web/src/components/BoardView.tsx").default;
  const pieces = createInitialPieces();
  const markup = render(Board, { pieces, selectedPieceId: "red-soldier-0", disabled: false,
    lastMove: { pieceId: "red-soldier-0", from: { row: 5, col: 0 }, to: { row: 6, col: 0 } }, onActivate() {}, onClearSelection() {} });
  for (const marker of ["piece-selection", "last-move-from", "last-move-to", "intersection-hit-area"]) assert.ok(markup.includes(marker));
  assert.ok(markup.includes('aria-label="Tốt Đỏ, hàng 6, cột 0"'));
  assert.ok(markup.includes('aria-pressed="true"'));
  assert.equal((markup.match(/class="piece piece--/g) ?? []).length, 32);
});

test("Countdown: số giây thay đổi không đổi live message; về 0 chỉ báo chờ server, không sửa kết quả", () => {
  let now = 5000;
  const load = loader({ react: { useState: () => [now, () => {}], useEffect() {} } });
  const Offline = load("apps/web/src/features/rooms/OfflineDeadline.tsx").default;
  const snapshot = { roomCode: "ABC234", serverNow: 1000, deadlines: { red: null, black: 61000 }, playEnabled: false, game: initial() };
  const before = structuredClone(snapshot);
  const live = (markup) => markup.match(/<span[^>]*role="status"[^>]*>(.*?)<\/span>/)[1];
  const first = renderToStaticMarkup(Offline({ snapshot, receivedAt: 5000, side: "red" }));
  now = 15000;
  const next = renderToStaticMarkup(Offline({ snapshot, receivedAt: 5000, side: "red" }));
  assert.ok(first.includes("60 giây")); assert.ok(next.includes("50 giây"));
  assert.equal(live(first), live(next));
  assert.ok(next.includes('aria-live="off"'));
  now = 65000;
  const expired = renderToStaticMarkup(Offline({ snapshot, receivedAt: 5000, side: "red" }));
  assert.ok(live(expired).includes("chờ server xác nhận")); assert.notEqual(live(first), live(expired));
  assert.ok(!expired.includes("thắng")); assert.deepEqual(snapshot, before);
});

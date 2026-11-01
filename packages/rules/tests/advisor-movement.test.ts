import test from "node:test";
import assert from "node:assert/strict";
import { canAdvisorMoveByGeometry } from "../src/index";
import type { Piece } from "../src/index";

function piece(
  id: string, side: Piece["side"], position: Piece["position"],
  type: Piece["type"] = "soldier",
): Piece {
  return { id, side, type, position };
}

const palaces = [
  { side: "black", center: { row: 1, col: 4 }, corners: [
    { row: 0, col: 3 }, { row: 0, col: 5 }, { row: 2, col: 3 }, { row: 2, col: 5 },
  ] },
  { side: "red", center: { row: 8, col: 4 }, corners: [
    { row: 7, col: 3 }, { row: 7, col: 5 }, { row: 9, col: 3 }, { row: 9, col: 5 },
  ] },
] as const;

test("Sĩ: từ tâm cung đi đủ bốn hướng cho cả hai phe", () => {
  for (const { side, center, corners } of palaces) {
    for (const target of corners) {
      assert.equal(canAdvisorMoveByGeometry([
        piece("advisor", side, center, "advisor"),
      ], "advisor", target), true);
    }
  }
});

test("Sĩ: từ mọi góc cung đi về tâm", () => {
  for (const { side, center, corners } of palaces) {
    for (const start of corners) {
      assert.equal(canAdvisorMoveByGeometry([
        piece("advisor", side, start, "advisor"),
      ], "advisor", center), true);
    }
  }
});

test("Sĩ: không ra ngoài cung qua biên hàng hoặc cột", () => {
  for (const { side, corners } of palaces) {
    for (const start of corners) {
      // Thử cả bốn đích chéo: từ góc chỉ có đúng một đích còn trong cung.
      let accepted = 0;
      for (const dr of [-1, 1]) for (const dc of [-1, 1]) {
        const target = { row: start.row + dr, col: start.col + dc };
        const expected = target.col === 4 && target.row === (side === "black" ? 1 : 8);
        const actual = canAdvisorMoveByGeometry([
          piece("advisor", side, start, "advisor"),
        ], "advisor", target);
        assert.equal(actual, expected);
        if (actual) accepted++;
      }
      assert.equal(accepted, 1);
    }
  }
});

test("Sĩ: từ vị trí đầu ngoài cung hoặc ở cung đối phương bị từ chối", () => {
  for (const { side, start, target } of [
    { side: "black", start: { row: 3, col: 4 }, target: { row: 2, col: 3 } },
    { side: "red", start: { row: 6, col: 4 }, target: { row: 7, col: 3 } },
    { side: "black", start: { row: 1, col: 2 }, target: { row: 0, col: 3 } },
    { side: "black", start: { row: 1, col: 6 }, target: { row: 2, col: 5 } },
    { side: "red", start: { row: 8, col: 2 }, target: { row: 7, col: 3 } },
    { side: "red", start: { row: 8, col: 6 }, target: { row: 9, col: 5 } },
    { side: "black", start: { row: 8, col: 4 }, target: { row: 7, col: 3 } },
    { side: "red", start: { row: 1, col: 4 }, target: { row: 0, col: 3 } },
  ] as const) {
    assert.equal(canAdvisorMoveByGeometry([
      piece("advisor", side, start, "advisor"),
    ], "advisor", target), false);
  }
  // Chỉ kiểm tra hình học và cung, không áp tập vị trí từ khai cuộc.
  assert.equal(canAdvisorMoveByGeometry([
    piece("advisor", "black", { row: 0, col: 4 }, "advisor"),
  ], "advisor", { row: 1, col: 3 }), true);
});

test("Sĩ: từ chối ngang/dọc, sai độ lệch hoặc đứng yên", () => {
  for (const { side, center } of palaces) {
    for (const [dr, dc] of [[0, 0], [0, 1], [0, -1], [1, 0], [-1, 0], [2, 2], [-2, -2], [1, 2], [2, 1]]) {
      assert.equal(canAdvisorMoveByGeometry([
        piece("advisor", side, center, "advisor"),
      ], "advisor", { row: center.row + dr, col: center.col + dc }), false);
    }
  }
});

test("Sĩ: ăn đối phương, không ăn quân cùng phe", () => {
  for (const { side, center, corners } of palaces) {
    const enemySide = side === "black" ? "red" : "black";
    for (const target of corners) {
      assert.equal(canAdvisorMoveByGeometry([
        piece("advisor", side, center, "advisor"), piece("enemy", enemySide, target),
      ], "advisor", target), true);
      assert.equal(canAdvisorMoveByGeometry([
        piece("advisor", side, center, "advisor"), piece("friend", side, target),
      ], "advisor", target), false);
    }
  }
});

test("Sĩ: quân ở các vị trí lân cận không gây cản", () => {
  for (const { side, center, corners } of palaces) {
    const pieces = [piece("advisor", side, center, "advisor"),
      piece("near-1", "red", { row: center.row, col: 3 }),
      piece("near-2", "black", { row: center.row, col: 5 }),
      piece("near-3", "red", { row: (center.row - 1) as Piece["position"]["row"], col: 4 }),
      piece("near-4", "black", { row: (center.row + 1) as Piece["position"]["row"], col: 4 }),
    ];
    for (const target of corners) {
      assert.equal(canAdvisorMoveByGeometry(pieces, "advisor", target), true);
    }
  }
});

test("Sĩ: từ chối ngoài bàn, tọa độ không nguyên, ID sai và sai loại quân", () => {
  const pieces = [piece("advisor", "black", { row: 1, col: 4 }, "advisor")];
  for (const target of [
    { row: -1, col: 3 }, { row: 10, col: 3 }, { row: 0, col: -1 }, { row: 0, col: 9 },
    { row: 0.5, col: 3 }, { row: 0, col: 3.5 },
    { row: NaN, col: 3 }, { row: 0, col: NaN },
    { row: Infinity, col: 3 }, { row: 0, col: -Infinity },
  ]) assert.equal(canAdvisorMoveByGeometry(pieces, "advisor", target), false);
  const target = { row: 0, col: 3 };
  assert.equal(canAdvisorMoveByGeometry([], "missing", target), false);
  assert.equal(canAdvisorMoveByGeometry(pieces, "missing", target), false);
  for (const type of ["rook", "horse", "elephant", "general", "cannon", "soldier"] as const) {
    assert.equal(canAdvisorMoveByGeometry([
      piece("other", "black", { row: 1, col: 4 }, type),
    ], "other", target), false);
  }
});

test("Sĩ: không thay đổi mảng, quân, position hoặc điểm đến", () => {
  const pieces = [piece("advisor", "black", { row: 1, col: 4 }, "advisor"),
    piece("enemy", "red", { row: 0, col: 3 })];
  const snapshot = structuredClone(pieces);
  for (const p of pieces) {
    Object.freeze(p.position);
    Object.freeze(p);
  }
  Object.freeze(pieces);
  const target = Object.freeze({ row: 0, col: 3 });
  assert.equal(canAdvisorMoveByGeometry(pieces, "advisor", target), true);
  assert.equal(canAdvisorMoveByGeometry(pieces, "advisor", { row: 1, col: 5 }), false);
  assert.deepEqual(pieces, snapshot);
  assert.deepEqual(target, { row: 0, col: 3 });
});

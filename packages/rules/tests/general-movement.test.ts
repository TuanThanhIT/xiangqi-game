import test from "node:test";
import assert from "node:assert/strict";
import { canGeneralMoveByGeometry } from "../src/index";
import type { Piece } from "../src/index";

function piece(
  id: string, side: Piece["side"], position: Piece["position"],
  type: Piece["type"] = "soldier",
): Piece {
  return { id, side, type, position };
}

const palaces = [
  { side: "black", center: { row: 1, col: 4 }, rows: [0, 1, 2] },
  { side: "red", center: { row: 8, col: 4 }, rows: [7, 8, 9] },
] as const;
const steps = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;

test("Tướng: từ tâm cung đi đủ bốn hướng cho cả hai phe", () => {
  for (const { side, center } of palaces) {
    for (const [dr, dc] of steps) {
      assert.equal(canGeneralMoveByGeometry([
        piece("general", side, center, "general"),
      ], "general", { row: center.row + dr, col: center.col + dc }), true);
    }
  }
});

test("Tướng: đi dọc các biên cung và không ra ngoài cung qua hàng/cột", () => {
  for (const { side, rows } of palaces) {
    for (const row of rows) for (const col of [3, 4, 5] as const) {
      for (const [dr, dc] of steps) {
        const target = { row: row + dr, col: col + dc };
        const expected = rows.some((r) => r === target.row) && [3, 4, 5].includes(target.col);
        assert.equal(canGeneralMoveByGeometry([
          piece("general", side, { row, col }, "general"),
        ], "general", target), expected);
      }
    }
  }
});

test("Tướng: vị trí đầu ngoài cung hoặc ở cung đối phương bị từ chối", () => {
  for (const { side, start, target } of [
    { side: "black", start: { row: 3, col: 4 }, target: { row: 2, col: 4 } },
    { side: "red", start: { row: 6, col: 4 }, target: { row: 7, col: 4 } },
    { side: "black", start: { row: 1, col: 2 }, target: { row: 1, col: 3 } },
    { side: "black", start: { row: 1, col: 6 }, target: { row: 1, col: 5 } },
    { side: "red", start: { row: 8, col: 2 }, target: { row: 8, col: 3 } },
    { side: "red", start: { row: 8, col: 6 }, target: { row: 8, col: 5 } },
    { side: "black", start: { row: 8, col: 4 }, target: { row: 7, col: 4 } },
    { side: "red", start: { row: 1, col: 4 }, target: { row: 0, col: 4 } },
  ] as const) {
    assert.equal(canGeneralMoveByGeometry([
      piece("general", side, start, "general"),
    ], "general", target), false);
  }
});

test("Tướng: không đi chéo, nhiều bước hoặc đứng yên; không ăn Tướng từ xa", () => {
  for (const { side, center } of palaces) {
    for (const [dr, dc] of [[0, 0], [-1, -1], [-1, 1], [1, -1], [1, 1], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
      assert.equal(canGeneralMoveByGeometry([
        piece("general", side, center, "general"),
      ], "general", { row: center.row + dr, col: center.col + dc }), false);
    }
    // Hai đầu đều trong cung nhưng cách nhau hai bước.
    assert.equal(canGeneralMoveByGeometry([
      piece("general", side, { row: center.row, col: 3 }, "general"),
    ], "general", { row: center.row, col: 5 }), false);
  }
  const generals = [
    piece("black-general", "black", { row: 0, col: 4 }, "general"),
    piece("red-general", "red", { row: 9, col: 4 }, "general"),
  ];
  assert.equal(canGeneralMoveByGeometry(generals, "black-general", { row: 9, col: 4 }), false);
  assert.equal(canGeneralMoveByGeometry(generals, "red-general", { row: 0, col: 4 }), false);
});

test("Tướng: được đến đối phương theo hình học, không đến quân cùng phe", () => {
  for (const { side, center, rows } of palaces) {
    const enemySide = side === "red" ? "black" : "red";
    for (const row of rows) {
      for (const col of [3, 5] as const) {
        const start = { row, col };
        const target: Piece["position"] = { row, col: 4 };
        assert.equal(canGeneralMoveByGeometry([
          piece("general", side, start, "general"), piece("enemy", enemySide, target),
        ], "general", target), true);
        assert.equal(canGeneralMoveByGeometry([
          piece("general", side, start, "general"), piece("friend", side, target),
        ], "general", target), false);
      }
    }
    // Cố ý không xét điểm đích bị tấn công hoặc hai Tướng đối mặt.
    const target = { row: center.row, col: 3 };
    assert.equal(canGeneralMoveByGeometry([
      piece("general", side, center, "general"),
      piece("enemy-rook", enemySide, { row: center.row, col: 0 }, "rook"),
      piece("enemy-general", enemySide, { row: side === "black" ? 9 : 0, col: 3 }, "general"),
    ], "general", target), true);
  }
});

test("Tướng: từ chối ngoài bàn, tọa độ không nguyên, ID sai và sai loại quân", () => {
  const pieces = [piece("general", "black", { row: 1, col: 4 }, "general")];
  for (const target of [
    { row: -1, col: 4 }, { row: 10, col: 4 }, { row: 1, col: -1 }, { row: 1, col: 9 },
    { row: 0.5, col: 4 }, { row: 1, col: 3.5 },
    { row: NaN, col: 4 }, { row: 1, col: NaN },
    { row: Infinity, col: 4 }, { row: 1, col: -Infinity },
  ]) assert.equal(canGeneralMoveByGeometry(pieces, "general", target), false);
  const target = { row: 0, col: 4 };
  assert.equal(canGeneralMoveByGeometry([], "missing", target), false);
  assert.equal(canGeneralMoveByGeometry(pieces, "missing", target), false);
  for (const type of ["rook", "horse", "elephant", "advisor", "cannon", "soldier"] as const) {
    assert.equal(canGeneralMoveByGeometry([
      piece("other", "black", { row: 1, col: 4 }, type),
    ], "other", target), false);
  }
});

test("Tướng: không thay đổi mảng, quân, position hoặc điểm đến", () => {
  const pieces = [piece("general", "black", { row: 1, col: 4 }, "general"),
    piece("enemy", "red", { row: 0, col: 4 })];
  const snapshot = structuredClone(pieces);
  for (const p of pieces) {
    Object.freeze(p.position);
    Object.freeze(p);
  }
  Object.freeze(pieces);
  const target = Object.freeze({ row: 0, col: 4 });
  assert.equal(canGeneralMoveByGeometry(pieces, "general", target), true);
  assert.equal(canGeneralMoveByGeometry(pieces, "general", { row: 0, col: 3 }), false);
  assert.deepEqual(pieces, snapshot);
  assert.deepEqual(target, { row: 0, col: 4 });
});

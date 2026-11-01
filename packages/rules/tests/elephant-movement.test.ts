import test from "node:test";
import assert from "node:assert/strict";
import { canElephantMoveByGeometry } from "../src/index";
import type { Piece } from "../src/index";

function piece(
  id: string, side: Piece["side"], position: Piece["position"],
  type: Piece["type"] = "soldier",
): Piece {
  return { id, side, type, position };
}

const setups = [
  {
    side: "black", start: { row: 2, col: 4 },
    moves: [
      { target: { row: 0, col: 2 }, eye: { row: 1, col: 3 } },
      { target: { row: 0, col: 6 }, eye: { row: 1, col: 5 } },
      { target: { row: 4, col: 2 }, eye: { row: 3, col: 3 } },
      { target: { row: 4, col: 6 }, eye: { row: 3, col: 5 } },
    ],
  },
  {
    side: "red", start: { row: 7, col: 4 },
    moves: [
      { target: { row: 5, col: 2 }, eye: { row: 6, col: 3 } },
      { target: { row: 5, col: 6 }, eye: { row: 6, col: 5 } },
      { target: { row: 9, col: 2 }, eye: { row: 8, col: 3 } },
      { target: { row: 9, col: 6 }, eye: { row: 8, col: 5 } },
    ],
  },
] as const;

test("Tượng: đủ bốn hướng chéo cho cả hai phe, gồm đích sát sông", () => {
  for (const { side, start, moves } of setups) {
    for (const { target } of moves) {
      assert.equal(canElephantMoveByGeometry([
        piece("elephant", side, start, "elephant"),
      ], "elephant", target), true);
      // Kiểm tra chiều ngược lại: xuất phát ngay sát sông hoặc hàng biên.
      assert.equal(canElephantMoveByGeometry([
        piece("elephant", side, target, "elephant"),
      ], "elephant", start), true);
    }
  }
});

test("Tượng: cản mắt bởi bất kỳ phe nào ở cả bốn hướng", () => {
  for (const { side, start, moves } of setups) {
    for (const { target, eye } of moves) {
      for (const blockerSide of ["red", "black"] as const) {
        assert.equal(canElephantMoveByGeometry([
          piece("elephant", side, start, "elephant"), piece("blocker", blockerSide, eye),
        ], "elephant", target), false);
      }
    }
  }
});

test("Tượng: quân gần đường đi nhưng không ở mắt không gây cản", () => {
  for (const { side, start, moves } of setups) {
    const pieces = [piece("elephant", side, start, "elephant"),
      piece("near-1", "red", { row: start.row, col: 3 }),
      piece("near-2", "black", { row: start.row, col: 5 }),
    ];
    for (const { target } of moves) {
      assert.equal(canElephantMoveByGeometry(pieces, "elephant", target), true);
    }
  }
});

test("Tượng: cấm qua sông, kiểm tra cả vị trí đầu và đích", () => {
  const invalid = [
    { side: "black", start: { row: 4, col: 2 }, target: { row: 6, col: 4 } },
    { side: "red", start: { row: 5, col: 2 }, target: { row: 3, col: 4 } },
    { side: "black", start: { row: 6, col: 4 }, target: { row: 4, col: 2 } },
    { side: "red", start: { row: 3, col: 4 }, target: { row: 5, col: 2 } },
    { side: "black", start: { row: 5, col: 2 }, target: { row: 7, col: 4 } },
    { side: "red", start: { row: 4, col: 2 }, target: { row: 2, col: 4 } },
  ] as const;
  for (const { side, start, target } of invalid) {
    assert.equal(canElephantMoveByGeometry([
      piece("elephant", side, start, "elephant"),
    ], "elephant", target), false);
  }
  // Không áp thêm tập giao điểm có thể đạt được từ thế khai cuộc.
  assert.equal(canElephantMoveByGeometry([
    piece("elephant", "black", { row: 1, col: 1 }, "elephant"),
  ], "elephant", { row: 3, col: 3 }), true);
  assert.equal(canElephantMoveByGeometry([
    piece("elephant", "red", { row: 6, col: 1 }, "elephant"),
  ], "elephant", { row: 8, col: 3 }), true);
});

test("Tượng: ăn đối phương khi thông mắt, không ăn cùng phe", () => {
  for (const { side, start, moves } of setups) {
    const enemySide = side === "red" ? "black" : "red";
    for (const { target, eye } of moves) {
      const pieces = [piece("elephant", side, start, "elephant"), piece("enemy", enemySide, target)];
      assert.equal(canElephantMoveByGeometry(pieces, "elephant", target), true);
      assert.equal(canElephantMoveByGeometry([
        ...pieces, piece("blocker", enemySide, eye),
      ], "elephant", target), false);
      assert.equal(canElephantMoveByGeometry([
        piece("elephant", side, start, "elephant"), piece("friend", side, target),
      ], "elephant", target), false);
    }
  }
});

test("Tượng: từ chối sai độ lệch, đứng yên, ngoài bàn và tọa độ không nguyên", () => {
  const pieces = [piece("elephant", "black", { row: 2, col: 4 }, "elephant")];
  for (const target of [
    { row: 2, col: 4 }, { row: 3, col: 5 }, { row: 0, col: 3 },
    { row: 1, col: 2 }, { row: 4, col: 4 }, { row: 2, col: 6 },
    { row: -1, col: 2 }, { row: 10, col: 2 },
    { row: 0, col: -1 }, { row: 0, col: 9 },
    { row: 0.5, col: 2 }, { row: 0, col: 2.5 },
    { row: NaN, col: 2 }, { row: 0, col: NaN },
    { row: Infinity, col: 2 }, { row: 0, col: -Infinity },
  ]) assert.equal(canElephantMoveByGeometry(pieces, "elephant", target), false);
  for (const { side, start, target } of [
    { side: "black", start: { row: 0, col: 0 }, target: { row: -2, col: 2 } },
    { side: "black", start: { row: 2, col: 0 }, target: { row: 0, col: -2 } },
    { side: "red", start: { row: 9, col: 8 }, target: { row: 11, col: 6 } },
    { side: "red", start: { row: 7, col: 8 }, target: { row: 9, col: 10 } },
  ] as const) {
    assert.equal(canElephantMoveByGeometry([
      piece("elephant", side, start, "elephant"),
    ], "elephant", target), false);
  }
});

test("Tượng: từ chối ID sai và tất cả loại quân khác", () => {
  const target = { row: 0, col: 2 };
  assert.equal(canElephantMoveByGeometry([], "missing", target), false);
  assert.equal(canElephantMoveByGeometry([
    piece("elephant", "black", { row: 2, col: 4 }, "elephant"),
  ], "missing", target), false);
  for (const type of ["rook", "horse", "advisor", "general", "cannon", "soldier"] as const) {
    assert.equal(canElephantMoveByGeometry([
      piece("other", "black", { row: 2, col: 4 }, type),
    ], "other", target), false);
  }
});

test("Tượng: không thay đổi mảng, quân, position hoặc đích", () => {
  const pieces = [
    piece("elephant", "black", { row: 2, col: 4 }, "elephant"),
    piece("enemy", "red", { row: 0, col: 2 }),
  ];
  const snapshot = structuredClone(pieces);
  for (const p of pieces) {
    Object.freeze(p.position);
    Object.freeze(p);
  }
  Object.freeze(pieces);
  const target = Object.freeze({ row: 0, col: 2 });
  assert.equal(canElephantMoveByGeometry(pieces, "elephant", target), true);
  assert.equal(canElephantMoveByGeometry(pieces, "elephant", { row: 6, col: 2 }), false);
  assert.deepEqual(pieces, snapshot);
  assert.deepEqual(target, { row: 0, col: 2 });
});

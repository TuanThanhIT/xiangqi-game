import test from "node:test";
import assert from "node:assert/strict";
import { canRookMoveByGeometry } from "../src/index";
import type { Piece } from "../src/index";

function piece(
  id: string,
  side: Piece["side"],
  row: Piece["position"]["row"],
  col: Piece["position"]["col"],
  type: Piece["type"] = "rook",
): Piece {
  return { id, side, type, position: { row, col } };
}

const rook = () => piece("red-rook", "red", 4, 4);

test("1. Đi ngang/dọc đường trống, cả bốn hướng và giao điểm liền kề", () => {
  for (const destination of [
    { row: 4, col: 0 }, { row: 4, col: 8 },
    { row: 0, col: 4 }, { row: 9, col: 4 },
    { row: 4, col: 3 }, { row: 4, col: 5 },
    { row: 3, col: 4 }, { row: 5, col: 4 },
  ]) {
    assert.equal(canRookMoveByGeometry([rook()], "red-rook", destination), true);
  }
  assert.equal(canRookMoveByGeometry([
    rook(), piece("off-path", "red", 3, 3), piece("beyond", "black", 4, 8),
  ], "red-rook", { row: 4, col: 6 }), true);
  assert.equal(canRookMoveByGeometry([piece("black-rook", "black", 0, 0)],
    "black-rook", { row: 9, col: 0 }), true);
});

test("2. Từ chối đi chéo", () => {
  for (const destination of [{ row: 0, col: 0 }, { row: 8, col: 8 }, { row: 5, col: 3 }]) {
    assert.equal(canRookMoveByGeometry([rook()], "red-rook", destination), false);
  }
});

test("3. Không xuyên quân cùng phe hoặc đối phương ở cả bốn hướng", () => {
  for (const side of ["red", "black"] as const) {
    for (const [blocker, destination] of [
      [{ row: 4, col: 3 }, { row: 4, col: 0 }],
      [{ row: 4, col: 5 }, { row: 4, col: 8 }],
      [{ row: 3, col: 4 }, { row: 0, col: 4 }],
      [{ row: 5, col: 4 }, { row: 9, col: 4 }],
    ] as const) {
      const pieces = [rook(), piece("blocker", side, blocker.row, blocker.col, "soldier")];
      assert.equal(canRookMoveByGeometry(pieces, "red-rook", destination), false);
      pieces.push(piece("enemy-at-target", "black", destination.row, destination.col));
      assert.equal(canRookMoveByGeometry(pieces, "red-rook", destination), false);
    }
  }
});

test("4. Được đến quân đối phương khi đường thông thoáng", () => {
  for (const destination of [{ row: 4, col: 8 }, { row: 0, col: 4 }, { row: 4, col: 3 }] as const) {
    assert.equal(canRookMoveByGeometry([
      rook(), piece("enemy", "black", destination.row, destination.col, "cannon"),
    ], "red-rook", destination), true);
  }
});

test("5. Không ăn quân cùng phe", () => {
  for (const destination of [{ row: 4, col: 8 }, { row: 0, col: 4 }] as const) {
    assert.equal(canRookMoveByGeometry([
      rook(), piece("friend", "red", destination.row, destination.col, "horse"),
    ], "red-rook", destination), false);
  }
});

test("6. Từ chối đứng yên, ngoài bàn, số không nguyên hoặc không hữu hạn", () => {
  for (const destination of [
    { row: 4, col: 4 }, { row: -1, col: 4 }, { row: 10, col: 4 },
    { row: 4, col: -1 }, { row: 4, col: 9 },
    { row: 4.5, col: 4 }, { row: 4, col: 3.5 },
    { row: NaN, col: 4 }, { row: 4, col: Infinity },
  ]) assert.equal(canRookMoveByGeometry([rook()], "red-rook", destination), false);
});

test("7. Từ chối ID không tồn tại và tất cả loại quân không phải Xe", () => {
  assert.equal(canRookMoveByGeometry([], "missing", { row: 4, col: 8 }), false);
  assert.equal(canRookMoveByGeometry([rook()], "missing", { row: 4, col: 8 }), false);
  for (const type of ["horse", "elephant", "advisor", "general", "cannon", "soldier"] as const) {
    assert.equal(canRookMoveByGeometry([piece("other", "red", 4, 4, type)],
      "other", { row: 4, col: 8 }), false);
  }
});

test("8. Không sửa mảng, quân, position hoặc điểm đến đầu vào", () => {
  const pieces = [rook(), piece("enemy", "black", 4, 8)];
  const snapshot = structuredClone(pieces);
  for (const p of pieces) {
    Object.freeze(p.position);
    Object.freeze(p);
  }
  Object.freeze(pieces);
  const destination = Object.freeze({ row: 4, col: 8 });
  assert.equal(canRookMoveByGeometry(pieces, "red-rook", destination), true);
  assert.equal(canRookMoveByGeometry(pieces, "red-rook", { row: 5, col: 5 }), false);
  assert.deepEqual(pieces, snapshot);
  assert.deepEqual(destination, { row: 4, col: 8 });
});

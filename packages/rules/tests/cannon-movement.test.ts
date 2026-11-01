import test from "node:test";
import assert from "node:assert/strict";
import { canCannonMoveByGeometry } from "../src/index";
import type { Piece } from "../src/index";

function piece(
  id: string, side: Piece["side"], position: Piece["position"],
  type: Piece["type"] = "soldier",
): Piece {
  return { id, side, type, position };
}

const cannon = () => piece("cannon", "red", { row: 4, col: 4 }, "cannon");
// Mỗi hướng có ba giao điểm trung gian để thử 0, 1, 2 và 3 ngòi.
const directions = [
  { target: { row: 4, col: 0 }, between: [{ row: 4, col: 3 }, { row: 4, col: 2 }, { row: 4, col: 1 }] },
  { target: { row: 4, col: 8 }, between: [{ row: 4, col: 5 }, { row: 4, col: 6 }, { row: 4, col: 7 }] },
  { target: { row: 0, col: 4 }, between: [{ row: 3, col: 4 }, { row: 2, col: 4 }, { row: 1, col: 4 }] },
  { target: { row: 8, col: 4 }, between: [{ row: 5, col: 4 }, { row: 6, col: 4 }, { row: 7, col: 4 }] },
] as const;

test("Pháo: đi đến chỗ trống đường thông ở cả bốn hướng", () => {
  for (const { target, between } of directions) {
    assert.equal(canCannonMoveByGeometry([cannon()], "cannon", target), true);
    assert.equal(canCannonMoveByGeometry([cannon()], "cannon", between[0]), true);
  }
  // Quân lệch đường hoặc nằm sau đích không phải ngòi.
  assert.equal(canCannonMoveByGeometry([
    cannon(), piece("off-path", "black", { row: 3, col: 3 }),
    piece("beyond", "red", { row: 4, col: 8 }),
  ], "cannon", { row: 4, col: 6 }), true);
  assert.equal(canCannonMoveByGeometry([
    piece("black-cannon", "black", { row: 0, col: 0 }, "cannon"),
  ], "black-cannon", { row: 9, col: 0 }), true);
});

test("Pháo: không nhảy qua quân để đến chỗ trống ở cả bốn hướng", () => {
  for (const { target, between } of directions) {
    for (const side of ["red", "black"] as const) {
      for (const count of [1, 2, 3]) {
        const screens = between.slice(0, count).map((position, i) => piece(`screen-${i}`, side, position));
        assert.equal(canCannonMoveByGeometry([cannon(), ...screens], "cannon", target), false);
      }
    }
  }
});

test("Pháo: ăn với đúng một ngòi của bất kỳ phe nào ở cả bốn hướng", () => {
  for (const { target, between } of directions) {
    for (const side of ["red", "black"] as const) {
      for (const position of between) {
        assert.equal(canCannonMoveByGeometry([
          cannon(), piece("screen", side, position), piece("enemy", "black", target),
        ], "cannon", target), true);
      }
    }
  }
  assert.equal(canCannonMoveByGeometry([
    piece("black-cannon", "black", { row: 4, col: 4 }, "cannon"),
    piece("screen", "red", { row: 4, col: 3 }),
    piece("enemy", "red", { row: 4, col: 0 }),
  ], "black-cannon", { row: 4, col: 0 }), true);
});

test("Pháo: không ăn khi có 0, 2 hoặc 3 ngòi ở cả bốn hướng", () => {
  for (const { target, between } of directions) {
    for (const count of [0, 2, 3]) {
      const screens = between.slice(0, count).map((position, i) =>
        piece(`screen-${i}`, i % 2 ? "black" : "red", position));
      assert.equal(canCannonMoveByGeometry([
        cannon(), ...screens, piece("enemy", "black", target),
      ], "cannon", target), false);
    }
    // Quân địch liền kề cũng không thể bị ăn vì không có ngòi.
    assert.equal(canCannonMoveByGeometry([
      cannon(), piece("adjacent-enemy", "black", between[0]),
    ], "cannon", between[0]), false);
  }
});

test("Pháo: không đến quân cùng phe dù có bao nhiêu ngòi", () => {
  for (const { target, between } of directions) {
    for (const count of [0, 1, 2, 3]) {
      const screens = between.slice(0, count).map((position, i) => piece(`screen-${i}`, "black", position));
      assert.equal(canCannonMoveByGeometry([
        cannon(), ...screens, piece("friend", "red", target),
      ], "cannon", target), false);
    }
  }
});

test("Pháo: từ chối chéo, đứng yên, ngoài bàn và tọa độ không nguyên", () => {
  for (const destination of [
    { row: 0, col: 0 }, { row: 5, col: 5 }, { row: 3, col: 5 },
    { row: 4, col: 4 }, { row: -1, col: 4 }, { row: 10, col: 4 },
    { row: 4, col: -1 }, { row: 4, col: 9 },
    { row: 4.5, col: 4 }, { row: 4, col: 3.5 },
    { row: NaN, col: 4 }, { row: 4, col: NaN },
    { row: Infinity, col: 4 }, { row: 4, col: -Infinity },
  ]) assert.equal(canCannonMoveByGeometry([cannon()], "cannon", destination), false);
});

test("Pháo: từ chối ID sai và tất cả loại quân khác", () => {
  assert.equal(canCannonMoveByGeometry([], "missing", { row: 4, col: 8 }), false);
  assert.equal(canCannonMoveByGeometry([cannon()], "missing", { row: 4, col: 8 }), false);
  for (const type of ["rook", "horse", "elephant", "advisor", "general", "soldier"] as const) {
    assert.equal(canCannonMoveByGeometry([
      piece("other", "red", { row: 4, col: 4 }, type),
    ], "other", { row: 4, col: 8 }), false);
  }
});

test("Pháo: không sửa mảng, quân, position hoặc điểm đến", () => {
  const pieces = [
    cannon(), piece("screen", "red", { row: 4, col: 6 }),
    piece("enemy", "black", { row: 4, col: 8 }),
  ];
  const snapshot = structuredClone(pieces);
  for (const p of pieces) {
    Object.freeze(p.position);
    Object.freeze(p);
  }
  Object.freeze(pieces);
  const destination = Object.freeze({ row: 4, col: 8 });
  assert.equal(canCannonMoveByGeometry(pieces, "cannon", destination), true);
  assert.equal(canCannonMoveByGeometry(pieces, "cannon", { row: 4, col: 7 }), false);
  assert.equal(canCannonMoveByGeometry(pieces, "cannon", { row: 3, col: 3 }), false);
  assert.deepEqual(pieces, snapshot);
  assert.deepEqual(destination, { row: 4, col: 8 });
});

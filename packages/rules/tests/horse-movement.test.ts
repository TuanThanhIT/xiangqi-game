import test from "node:test";
import assert from "node:assert/strict";
import { canHorseMoveByGeometry } from "../src/index";
import type { Piece } from "../src/index";

function piece(
  id: string, side: Piece["side"], position: Piece["position"],
  type: Piece["type"] = "soldier",
): Piece {
  return { id, side, type, position };
}

const horse = (side: Piece["side"] = "red") =>
  piece("horse", side, { row: 4, col: 4 }, "horse");

// Dữ liệu kỳ vọng ghi rõ từng chân và hai đích, không tính lại bằng thuật toán hàm.
const legs = [
  { leg: { row: 3, col: 4 }, targets: [{ row: 2, col: 3 }, { row: 2, col: 5 }] },
  { leg: { row: 5, col: 4 }, targets: [{ row: 6, col: 3 }, { row: 6, col: 5 }] },
  { leg: { row: 4, col: 3 }, targets: [{ row: 3, col: 2 }, { row: 5, col: 2 }] },
  { leg: { row: 4, col: 5 }, targets: [{ row: 3, col: 6 }, { row: 5, col: 6 }] },
] as const;
const targets = legs.flatMap<Piece["position"]>(({ targets }) => targets);

test("Mã: đủ tám hướng khi không bị cản, cho cả hai phe", () => {
  for (const side of ["red", "black"] as const) {
    for (const target of targets) {
      assert.equal(canHorseMoveByGeometry([horse(side)], "horse", target), true);
    }
  }
});

test("Mã: mỗi chân chặn đúng hai hướng, quân cản có thể thuộc bất kỳ phe nào", () => {
  for (const { leg, targets: blocked } of legs) {
    for (const side of ["red", "black"] as const) {
      const pieces = [horse(), piece("blocker", side, leg)];
      let rejected = 0;
      for (const target of targets) {
        const expected = !blocked.some((p) => p.row === target.row && p.col === target.col);
        const actual = canHorseMoveByGeometry(pieces, "horse", target);
        assert.equal(actual, expected);
        if (!actual) rejected++;
      }
      assert.equal(rejected, 2);
    }
  }
});

test("Mã: quân ở gần nhưng không đúng chân không gây cản", () => {
  const pieces = [horse(),
    piece("near-1", "red", { row: 3, col: 3 }),
    piece("near-2", "black", { row: 3, col: 5 }),
    piece("near-3", "red", { row: 5, col: 3 }),
    piece("near-4", "black", { row: 5, col: 5 }),
  ];
  for (const target of targets) {
    assert.equal(canHorseMoveByGeometry(pieces, "horse", target), true);
  }
});

test("Mã: ăn quân đối phương khi thông chân, không ăn quân cùng phe", () => {
  for (const side of ["red", "black"] as const) {
    const enemySide = side === "red" ? "black" : "red";
    for (const { leg, targets } of legs) {
      for (const target of targets) {
        const pieces = [horse(side), piece("enemy", enemySide, target)];
        assert.equal(canHorseMoveByGeometry(pieces, "horse", target), true);
        assert.equal(canHorseMoveByGeometry([
          ...pieces, piece("blocker", side, leg),
        ], "horse", target), false);
        assert.equal(canHorseMoveByGeometry([
          horse(side), piece("friend", side, target),
        ], "horse", target), false);
      }
    }
  }
});

test("Mã: từ chối nước sai hình, đứng yên và tọa độ không hợp lệ", () => {
  for (const destination of [
    { row: 4, col: 4 }, { row: 4, col: 5 }, { row: 6, col: 4 },
    { row: 4, col: 6 }, { row: 5, col: 5 }, { row: 6, col: 6 },
    { row: 7, col: 5 }, { row: 5, col: 7 },
    { row: -1, col: 4 }, { row: 10, col: 4 },
    { row: 4, col: -1 }, { row: 4, col: 9 },
    { row: 2.5, col: 3 }, { row: 2, col: 3.5 },
    { row: NaN, col: 3 }, { row: 2, col: NaN },
    { row: Infinity, col: 3 }, { row: 2, col: -Infinity },
  ]) assert.equal(canHorseMoveByGeometry([horse()], "horse", destination), false);

  // Nước đúng hình nhưng vượt biên vẫn phải bị từ chối.
  const corner = [piece("corner", "red", { row: 0, col: 0 }, "horse")];
  for (const destination of [{ row: -2, col: 1 }, { row: 1, col: -2 }]) {
    assert.equal(canHorseMoveByGeometry(corner, "corner", destination), false);
  }
  const otherCorner = [piece("corner", "black", { row: 9, col: 8 }, "horse")];
  for (const destination of [{ row: 11, col: 7 }, { row: 8, col: 10 }]) {
    assert.equal(canHorseMoveByGeometry(otherCorner, "corner", destination), false);
  }
  assert.equal(canHorseMoveByGeometry(corner, "corner", { row: 2, col: 1 }), true);
  assert.equal(canHorseMoveByGeometry(otherCorner, "corner", { row: 7, col: 7 }), true);
});

test("Mã: từ chối ID không tồn tại và tất cả loại quân khác", () => {
  const destination = { row: 2, col: 3 };
  assert.equal(canHorseMoveByGeometry([], "missing", destination), false);
  assert.equal(canHorseMoveByGeometry([horse()], "missing", destination), false);
  for (const type of ["rook", "elephant", "advisor", "general", "cannon", "soldier"] as const) {
    assert.equal(canHorseMoveByGeometry([
      piece("other", "red", { row: 4, col: 4 }, type),
    ], "other", destination), false);
  }
});

test("Mã: không thay đổi mảng, quân, position hoặc điểm đến", () => {
  const pieces = [horse(), piece("enemy", "black", { row: 2, col: 3 })];
  const snapshot = structuredClone(pieces);
  for (const p of pieces) {
    Object.freeze(p.position);
    Object.freeze(p);
  }
  Object.freeze(pieces);
  const destination = Object.freeze({ row: 2, col: 3 });
  assert.equal(canHorseMoveByGeometry(pieces, "horse", destination), true);
  assert.equal(canHorseMoveByGeometry(pieces, "horse", { row: 4, col: 4 }), false);
  assert.deepEqual(pieces, snapshot);
  assert.deepEqual(destination, { row: 2, col: 3 });
});

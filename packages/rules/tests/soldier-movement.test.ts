import test from "node:test";
import assert from "node:assert/strict";
import { canSoldierMoveByGeometry } from "../src/index";
import type { Piece } from "../src/index";

function piece(
  id: string, side: Piece["side"], position: Piece["position"],
  type: Piece["type"] = "soldier",
): Piece {
  return { id, side, type, position };
}

const sides = [
  { side: "black", before: 3, riverEdge: 4, crossed: 5, next: 6, last: 9, forward: 1 },
  { side: "red", before: 6, riverEdge: 5, crossed: 4, next: 3, last: 0, forward: -1 },
] as const;

test("Tốt: trước sông chỉ tiến một bước, không ngang hoặc lùi cho cả hai phe", () => {
  for (const { side, before, forward } of sides) {
    const pieces = [piece("soldier", side, { row: before, col: 4 })];
    assert.equal(canSoldierMoveByGeometry(pieces, "soldier", { row: before + forward, col: 4 }), true);
    for (const col of [3, 5]) {
      assert.equal(canSoldierMoveByGeometry(pieces, "soldier", { row: before, col }), false);
    }
    assert.equal(canSoldierMoveByGeometry(pieces, "soldier", { row: before - forward, col: 4 }), false);
  }
});

test("Tốt: bước tiến vượt sông hợp lệ, đứng ngay trước sông chưa được ngang", () => {
  for (const { side, riverEdge, crossed, forward } of sides) {
    const pieces = [piece("soldier", side, { row: riverEdge, col: 4 })];
    assert.equal(canSoldierMoveByGeometry(pieces, "soldier", { row: crossed, col: 4 }), true);
    for (const col of [3, 5]) {
      assert.equal(canSoldierMoveByGeometry(pieces, "soldier", { row: riverEdge, col }), false);
    }
    assert.equal(canSoldierMoveByGeometry(pieces, "soldier", { row: riverEdge - forward, col: 4 }), false);
  }
});

test("Tốt: sau sông tiến, ngang hai phía được nhưng không lùi", () => {
  for (const { side, crossed, next, forward } of sides) {
    const pieces = [piece("soldier", side, { row: crossed, col: 4 })];
    assert.equal(canSoldierMoveByGeometry(pieces, "soldier", { row: next, col: 4 }), true);
    for (const col of [3, 5]) {
      assert.equal(canSoldierMoveByGeometry(pieces, "soldier", { row: crossed, col }), true);
    }
    assert.equal(canSoldierMoveByGeometry(pieces, "soldier", { row: crossed - forward, col: 4 }), false);
  }
});

test("Tốt: hàng cuối vẫn ngang, không ra ngoài bàn hoặc phong cấp", () => {
  for (const { side, last, forward } of sides) {
    const pieces = [piece("soldier", side, { row: last, col: 4 })];
    for (const col of [3, 5]) {
      assert.equal(canSoldierMoveByGeometry(pieces, "soldier", { row: last, col }), true);
    }
    assert.equal(canSoldierMoveByGeometry(pieces, "soldier", { row: last + forward, col: 4 }), false);
    assert.equal(canSoldierMoveByGeometry(pieces, "soldier", { row: last - forward, col: 4 }), false);
    for (const [col, inside, outside] of [[0, 1, -1], [8, 7, 9]] as const) {
      const atEdge = [piece("soldier", side, { row: last, col })];
      assert.equal(canSoldierMoveByGeometry(atEdge, "soldier", { row: last, col: inside }), true);
      assert.equal(canSoldierMoveByGeometry(atEdge, "soldier", { row: last, col: outside }), false);
      assert.equal(atEdge[0].type, "soldier");
    }
  }
});

test("Tốt: đi và ăn giống nhau, ăn đối phương và không ăn cùng phe", () => {
  for (const { side, before, riverEdge, crossed, next, last } of sides) {
    const enemySide = side === "black" ? "red" : "black";
    const moves: { start: Piece["position"]; target: Piece["position"] }[] = [
      { start: { row: before, col: 4 }, target: { row: riverEdge, col: 4 } },
      { start: { row: riverEdge, col: 4 }, target: { row: crossed, col: 4 } },
      { start: { row: crossed, col: 4 }, target: { row: next, col: 4 } },
      { start: { row: crossed, col: 4 }, target: { row: crossed, col: 3 } },
      { start: { row: crossed, col: 4 }, target: { row: crossed, col: 5 } },
      { start: { row: last, col: 4 }, target: { row: last, col: 3 } },
    ];
    for (const { start, target } of moves) {
      assert.equal(canSoldierMoveByGeometry([piece("soldier", side, start)], "soldier", target), true);
      assert.equal(canSoldierMoveByGeometry([
        piece("soldier", side, start), piece("enemy", enemySide, target),
      ], "soldier", target), true);
      assert.equal(canSoldierMoveByGeometry([
        piece("soldier", side, start), piece("friend", side, target),
      ], "soldier", target), false);
    }
  }
});

test("Tốt: từ chối chéo, nhiều bước, đứng yên và tọa độ không hợp lệ", () => {
  for (const { side, crossed, forward } of sides) {
    const pieces = [piece("soldier", side, { row: crossed, col: 4 })];
    for (const target of [
      { row: crossed, col: 4 },
      { row: crossed + forward, col: 3 }, { row: crossed + forward, col: 5 },
      { row: crossed - forward, col: 3 }, { row: crossed - forward, col: 5 },
      { row: crossed + 2 * forward, col: 4 }, { row: crossed - 2 * forward, col: 4 },
      { row: crossed, col: 2 }, { row: crossed, col: 6 },
      { row: -1, col: 4 }, { row: 10, col: 4 }, { row: crossed, col: -1 }, { row: crossed, col: 9 },
      { row: crossed + 0.5, col: 4 }, { row: crossed, col: 4.5 },
      { row: NaN, col: 4 }, { row: crossed, col: NaN },
      { row: Infinity, col: 4 }, { row: crossed, col: -Infinity },
    ]) assert.equal(canSoldierMoveByGeometry(pieces, "soldier", target), false);
  }
});

test("Tốt: từ chối ID sai và tất cả loại quân khác cho cả hai phe", () => {
  for (const { side, crossed, next } of sides) {
    const target = { row: next, col: 4 };
    assert.equal(canSoldierMoveByGeometry([], "missing", target), false);
    assert.equal(canSoldierMoveByGeometry([
      piece("soldier", side, { row: crossed, col: 4 }),
    ], "missing", target), false);
    for (const type of ["rook", "horse", "elephant", "advisor", "general", "cannon"] as const) {
      assert.equal(canSoldierMoveByGeometry([
        piece("other", side, { row: crossed, col: 4 }, type),
      ], "other", target), false);
    }
  }
});

test("Tốt: không thay đổi mảng, quân, position hoặc điểm đến cho cả hai phe", () => {
  for (const { side, crossed, next } of sides) {
    const enemySide = side === "black" ? "red" : "black";
    const target = Object.freeze({ row: next, col: 4 } as const);
    const pieces = [piece("soldier", side, { row: crossed, col: 4 }), piece("enemy", enemySide, target)];
    const snapshot = structuredClone(pieces);
    for (const p of pieces) {
      Object.freeze(p.position);
      Object.freeze(p);
    }
    Object.freeze(pieces);
    assert.equal(canSoldierMoveByGeometry(pieces, "soldier", target), true);
    assert.equal(canSoldierMoveByGeometry(pieces, "soldier", { row: crossed, col: 4 }), false);
    assert.deepEqual(pieces, snapshot);
    assert.deepEqual(target, { row: next, col: 4 });
  }
});

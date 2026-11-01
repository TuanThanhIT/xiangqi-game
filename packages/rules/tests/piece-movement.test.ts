import test from "node:test";
import assert from "node:assert/strict";
import { canPieceMoveByGeometry } from "../src/index";
import type { Piece } from "../src/index";

const cases: {
  type: Piece["type"];
  start: Piece["position"];
  accepted: Piece["position"];
  rejected: Piece["position"];
}[] = [
  { type: "rook", start: { row: 4, col: 4 }, accepted: { row: 4, col: 8 }, rejected: { row: 5, col: 5 } },
  { type: "cannon", start: { row: 4, col: 4 }, accepted: { row: 0, col: 4 }, rejected: { row: 5, col: 5 } },
  { type: "horse", start: { row: 4, col: 4 }, accepted: { row: 2, col: 3 }, rejected: { row: 4, col: 5 } },
  { type: "elephant", start: { row: 2, col: 4 }, accepted: { row: 0, col: 2 }, rejected: { row: 1, col: 3 } },
  { type: "advisor", start: { row: 1, col: 4 }, accepted: { row: 0, col: 3 }, rejected: { row: 0, col: 4 } },
  { type: "general", start: { row: 1, col: 4 }, accepted: { row: 0, col: 4 }, rejected: { row: 0, col: 3 } },
  { type: "soldier", start: { row: 3, col: 4 }, accepted: { row: 4, col: 4 }, rejected: { row: 3, col: 5 } },
];

for (const { type, start, accepted, rejected } of cases) {
  test(`Điều phối ${type}: chấp nhận và từ chối đúng hình học, không sửa đầu vào`, () => {
    const pieces: Piece[] = [{ id: "moving", side: "black", type, position: { ...start } }];
    const snapshot = structuredClone(pieces);
    Object.freeze(pieces[0].position);
    Object.freeze(pieces[0]);
    Object.freeze(pieces);
    const destination = Object.freeze({ ...accepted });
    assert.equal(canPieceMoveByGeometry(pieces, "moving", destination), true);
    assert.equal(canPieceMoveByGeometry(pieces, "moving", rejected), false);
    assert.deepEqual(pieces, snapshot);
    assert.deepEqual(destination, accepted);
  });
}

test("Điều phối: không tìm thấy ID thì trả false", () => {
  assert.equal(canPieceMoveByGeometry([], "missing", { row: 0, col: 0 }), false);
  const pieces: Piece[] = [{ id: "rook", side: "black", type: "rook", position: { row: 0, col: 0 } }];
  assert.equal(canPieceMoveByGeometry(pieces, "missing", { row: 0, col: 1 }), false);
});

test("Điều phối: Pháo ăn cần ngòi trong khi Xe không cần ngòi", () => {
  const destination = { row: 4, col: 8 } as const;
  for (const type of ["rook", "cannon"] as const) {
    const pieces: Piece[] = [
      { id: "moving", side: "black", type, position: { row: 4, col: 4 } },
      { id: "target", side: "red", type: "soldier", position: destination },
    ];
    assert.equal(canPieceMoveByGeometry(pieces, "moving", destination), type === "rook");
    pieces.push({ id: "screen", side: "red", type: "soldier", position: { row: 4, col: 6 } });
    assert.equal(canPieceMoveByGeometry(pieces, "moving", destination), type === "cannon");
  }
});

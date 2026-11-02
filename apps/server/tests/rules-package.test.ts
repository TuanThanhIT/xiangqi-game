import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialPieces, isLegalMove, getGameStatus } from "@xiangqi/rules";

test("backend CommonJS sử dụng public API của package rules", () => {
  const pieces = createInitialPieces();
  assert.equal(pieces.length, 32);
  assert.equal(pieces.filter((piece) => piece.side === "red").length, 16);
  assert.equal(pieces.filter((piece) => piece.side === "black").length, 16);
  assert.equal(isLegalMove(pieces, "red", "red-soldier-0", { row: 5, col: 0 }), true);
  assert.deepEqual(getGameStatus(pieces, "red"), {
    status: "playing", sideToMove: "red", inCheck: false,
  });
});

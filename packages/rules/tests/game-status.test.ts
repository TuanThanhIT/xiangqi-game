import test from "node:test";
import assert from "node:assert/strict";
import { createInitialPieces, getGameStatus, isInCheck } from "../src/index";
import type { Piece, Side } from "../src/index";

function piece(id: string, side: Side, type: Piece["type"], row: Piece["position"]["row"], col: Piece["position"]["col"]): Piece {
  return { id, side, type, position: { row, col } };
}
function generals(): Piece[] {
  return [piece("own", "black", "general", 0, 4), piece("enemy", "red", "general", 9, 3)];
}
function mirror(pieces: readonly Piece[]): Piece[] {
  return pieces.map((p) => ({ ...p, side: p.side === "black" ? "red" : "black",
    position: { row: (9 - p.position.row) as Piece["position"]["row"], col: (8 - p.position.col) as Piece["position"]["col"] } }));
}

test("Trạng thái: khai cuộc đang chơi, không bị chiếu cho cả hai phe", () => {
  for (const side of ["black", "red"] as const) {
    assert.deepEqual(getGameStatus(createInitialPieces(), side), { status: "playing", sideToMove: side, inCheck: false });
  }
});

test("Trạng thái: đang bị chiếu nhưng còn đường thoát vẫn đang chơi", () => {
  const pieces = [...generals(), piece("rook", "red", "rook", 0, 0)];
  assert.deepEqual(getGameStatus(pieces, "black"), { status: "playing", sideToMove: "black", inCheck: true });
  assert.deepEqual(getGameStatus(mirror(pieces), "red"), { status: "playing", sideToMove: "red", inCheck: true });
});

test("Trạng thái: chiếu bí, bên đến lượt thua cho cả hai phe", () => {
  const pieces = [...generals(), piece("rook-0", "red", "rook", 0, 0), piece("rook-1", "red", "rook", 1, 0)];
  assert.deepEqual(getGameStatus(pieces, "black"), { status: "finished", winner: "red", loser: "black", reason: "checkmate" });
  assert.deepEqual(getGameStatus(mirror(pieces), "red"), { status: "finished", winner: "black", loser: "red", reason: "checkmate" });
});

test("Trạng thái: hết nước không bị chiếu vẫn thua, không hòa", () => {
  // Xe hàng 1 chặn bước tiến; hai Xe cột 3/5 khống chế hai bước ngang.
  const pieces = [...generals(), piece("rook-1", "red", "rook", 1, 0),
    piece("rook-3", "red", "rook", 2, 3), piece("rook-5", "red", "rook", 2, 5)];
  assert.equal(isInCheck(pieces, "black"), false);
  assert.deepEqual(getGameStatus(pieces, "black"), { status: "finished", winner: "red", loser: "black", reason: "stalemate" });
  assert.deepEqual(getGameStatus(mirror(pieces), "red"), { status: "finished", winner: "black", loser: "red", reason: "stalemate" });
});

test("Trạng thái: thiếu/trùng Tướng báo lỗi thống nhất", () => {
  const invalid: Piece[][] = [[]];
  for (const side of ["black", "red"] as const) {
    invalid.push(generals().filter((p) => p.side !== side));
    invalid.push([...generals(), piece("extra", side, "general", side === "black" ? 1 : 8, 5)]);
  }
  for (const pieces of invalid) for (const side of ["black", "red"] as const) {
    let message = "";
    assert.throws(() => isInCheck(pieces, side), (error: unknown) => {
      assert.ok(error instanceof Error); message = error.message; return true;
    });
    assert.throws(() => getGameStatus(pieces, side), (error: unknown) => {
      assert.ok(error instanceof Error); assert.equal(error.message, message); return true;
    });
  }
});

test("Trạng thái: không thay đổi đầu vào khi đang chơi hoặc kết thúc", () => {
  for (const pieces of [createInitialPieces(), [...generals(), piece("rook-0", "red", "rook", 0, 0), piece("rook-1", "red", "rook", 1, 0)]]) {
    const snapshot = structuredClone(pieces);
    for (const p of pieces) { Object.freeze(p.position); Object.freeze(p); }
    Object.freeze(pieces);
    getGameStatus(pieces, "black");
    getGameStatus(pieces, "red");
    assert.deepEqual(pieces, snapshot);
  }
});

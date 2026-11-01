import test from "node:test";
import assert from "node:assert/strict";
import { createInitialPieces, getLegalMoves, isLegalMove, isInCheck } from "../src/index";
import type { Piece, Side, LegalMove } from "../src/index";

function piece(id: string, side: Side, type: Piece["type"], row: Piece["position"]["row"], col: Piece["position"]["col"]): Piece {
  return { id, side, type, position: { row, col } };
}
function generals(): Piece[] {
  return [piece("own", "black", "general", 1, 4), piece("enemy", "red", "general", 9, 3)];
}
function mirror(pieces: readonly Piece[]): Piece[] {
  return pieces.map((p) => ({ ...p, side: p.side === "black" ? "red" : "black",
    position: { row: (9 - p.position.row) as Piece["position"]["row"], col: (8 - p.position.col) as Piece["position"]["col"] } }));
}
function key(move: LegalMove) {
  return `${move.pieceId}:${move.from.row},${move.from.col}:${move.to.row},${move.to.col}`;
}

test("Danh sách: khai cuộc mỗi phe đúng 44 nước, đúng phe, hợp lệ và không trùng", () => {
  const pieces = createInitialPieces();
  for (const side of ["black", "red"] as const) {
    const moves = getLegalMoves(pieces, side);
    assert.equal(moves.length, 44);
    assert.equal(new Set(moves.map(key)).size, moves.length);
    for (const move of moves) {
      const moving = pieces.find((p) => p.id === move.pieceId)!;
      assert.equal(moving.side, side);
      assert.deepEqual(move.from, moving.position);
      assert.equal(isLegalMove(pieces, side, move.pieceId, move.to), true);
    }
    assert.deepEqual(getLegalMoves(pieces, side), moves);
  }
});

test("Danh sách: thế nhỏ có danh sách kỳ vọng cụ thể và thứ tự ổn định", () => {
  const pieces = [piece("own", "black", "general", 0, 3),
    piece("enemy", "red", "general", 9, 5), piece("soldier", "black", "soldier", 9, 0)];
  const expected: LegalMove[] = [
    { pieceId: "own", from: { row: 0, col: 3 }, to: { row: 0, col: 4 } },
    { pieceId: "own", from: { row: 0, col: 3 }, to: { row: 1, col: 3 } },
    { pieceId: "soldier", from: { row: 9, col: 0 }, to: { row: 9, col: 1 } },
  ];
  assert.deepEqual(getLegalMoves(pieces, "black"), expected);
  assert.deepEqual(getLegalMoves(pieces, "black"), expected);
});

test("Danh sách: quân bị ghim chỉ được đi khi vẫn che Tướng", () => {
  const pieces = [...generals(), piece("attacker", "red", "rook", 1, 0), piece("pinned", "black", "rook", 1, 2)];
  assert.equal(isInCheck(pieces, "black"), false);
  for (const [position, side] of [[pieces, "black"], [mirror(pieces), "red"]] as const) {
    const moves = getLegalMoves(position, side).filter((move) => move.pieceId === "pinned");
    assert.ok(moves.length > 0);
    const row = side === "black" ? 1 : 8;
    assert.ok(moves.every((move) => move.to.row === row));
    assert.ok(moves.every((move) => isLegalMove(position, side, move.pieceId, move.to)));
  }
});

test("Danh sách: đang chiếu chỉ giữ nước giải chiếu, không đi quân không liên quan", () => {
  const pieces = [...generals(), piece("attacker", "red", "rook", 1, 0), piece("unrelated", "black", "soldier", 3, 8)];
  for (const [position, side] of [[pieces, "black"], [mirror(pieces), "red"]] as const) {
    assert.equal(isInCheck(position, side), true);
    const moves = getLegalMoves(position, side);
    assert.ok(moves.length > 0);
    assert.ok(moves.every((move) => move.pieceId === "own"));
    for (const move of moves) {
      assert.equal(isLegalMove(position, side, move.pieceId, move.to), true);
      const after = position.filter((p) => p.position.row !== move.to.row || p.position.col !== move.to.col)
        .map((p) => p.id === move.pieceId ? { ...p, position: { ...move.to } } : p);
      assert.equal(isInCheck(after, side), false);
    }
  }
});

test("Danh sách: có thế không còn nước hợp lệ, không tự kết luận kết thúc trận", () => {
  const pieces = [piece("own", "black", "general", 0, 4), piece("enemy", "red", "general", 9, 3),
    piece("rook-0", "red", "rook", 0, 0), piece("rook-1", "red", "rook", 1, 0)];
  assert.deepEqual(getLegalMoves(pieces, "black"), []);
  assert.deepEqual(getLegalMoves(mirror(pieces), "red"), []);
});

test("Danh sách: không chứa nước ăn Tướng đối phương", () => {
  const pieces = [...generals(), piece("rook", "black", "rook", 8, 3)];
  for (const [position, side] of [[pieces, "black"], [mirror(pieces), "red"]] as const) {
    const enemy = position.find((p) => p.type === "general" && p.side !== side)!;
    const moves = getLegalMoves(position, side);
    assert.ok(moves.length > 0);
    assert.ok(moves.every((m) => m.to.row !== enemy.position.row || m.to.col !== enemy.position.col));
  }
});

test("Danh sách: thiếu/trùng Tướng báo Error cùng thông báo với isLegalMove", () => {
  const invalid: Piece[][] = [[]];
  for (const side of ["black", "red"] as const) {
    invalid.push(generals().filter((p) => p.side !== side));
    invalid.push([...generals(), piece("extra", side, "general", side === "black" ? 0 : 8, 5)]);
  }
  for (const pieces of invalid) for (const side of ["black", "red"] as const) {
    let expected = "";
    assert.throws(() => isLegalMove(pieces, side, "missing", { row: 0, col: 0 }), (error: unknown) => {
      assert.ok(error instanceof Error); expected = error.message; return true;
    });
    assert.throws(() => getLegalMoves(pieces, side), (error: unknown) => {
      assert.ok(error instanceof Error); assert.equal(error.message, expected); return true;
    });
  }
});

test("Danh sách: đầu vào bất biến, mọi from/to độc lập với position đầu vào", () => {
  const pieces = createInitialPieces();
  const snapshot = structuredClone(pieces);
  for (const p of pieces) { Object.freeze(p.position); Object.freeze(p); }
  Object.freeze(pieces);
  for (const side of ["black", "red"] as const) {
    const moves = getLegalMoves(pieces, side);
    for (const move of moves) {
      for (const p of pieces) {
        assert.notEqual(move.from, p.position);
        assert.notEqual(move.to, p.position);
      }
      assert.notEqual(move.from, move.to);
    }
    assert.equal(new Set(moves.flatMap((m) => [m.from, m.to])).size, moves.length * 2);
    const again = getLegalMoves(pieces, side);
    moves[0].from.row = 9;
    moves[0].to.col = 8;
    assert.deepEqual(getLegalMoves(pieces, side), again);
    assert.deepEqual(pieces, snapshot);
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { createInitialPieces, isInCheck, isLegalMove, canPieceMoveByGeometry } from "../src/index";
import type { Piece, Side } from "../src/index";

function piece(id: string, side: Side, type: Piece["type"], row: Piece["position"]["row"], col: Piece["position"]["col"]): Piece {
  return { id, side, type, position: { row, col } };
}

function generals(): Piece[] {
  return [piece("own-general", "black", "general", 1, 4), piece("enemy-general", "red", "general", 9, 3)];
}

function mirrorPosition(position: Piece["position"]): Piece["position"] {
  return { row: (9 - position.row) as Piece["position"]["row"], col: (8 - position.col) as Piece["position"]["col"] };
}

function mirror(pieces: readonly Piece[]): Piece[] {
  return pieces.map((p) => ({ ...p, side: p.side === "black" ? "red" : "black", position: mirrorPosition(p.position) }));
}

function expectBoth(pieces: readonly Piece[], id: string, target: Piece["position"], expected: boolean) {
  assert.equal(isLegalMove(pieces, "black", id, target), expected);
  assert.equal(isLegalMove(mirror(pieces), "red", id, mirrorPosition(target)), expected);
}

test("Hợp lệ: tiến Tốt từ khai cuộc cho cả hai phe", () => {
  const pieces = createInitialPieces();
  assert.equal(isLegalMove(pieces, "black", "black-soldier-0", { row: 4, col: 0 }), true);
  assert.equal(isLegalMove(pieces, "red", "red-soldier-0", { row: 5, col: 0 }), true);
});

test("Hợp lệ: từ chối sai phe, ID sai, hình học sai và tọa độ sai", () => {
  for (const side of ["black", "red"] as const) {
    const pieces = createInitialPieces();
    const enemy = side === "black" ? "red" : "black";
    assert.equal(isLegalMove(pieces, side, `${enemy}-soldier-0`, { row: enemy === "black" ? 4 : 5, col: 0 }), false);
    assert.equal(isLegalMove(pieces, side, "missing", { row: 4, col: 0 }), false);
    const row = side === "black" ? 3 : 6;
    assert.equal(isLegalMove(pieces, side, `${side}-soldier-0`, { row, col: 1 }), false);
    assert.equal(isLegalMove(pieces, side, `${side}-soldier-0`, { row: -1, col: 0 }), false);
    assert.equal(isLegalMove(pieces, side, `${side}-soldier-0`, { row: row + 0.5, col: 0 }), false);
  }
});

test("Hợp lệ: quân chắn bị ghim bởi Xe, Pháo hoặc chân Mã không được rời chỗ", () => {
  const cases = [
    {
      pieces: [...generals(), piece("attacker", "red", "rook", 1, 0), piece("moving", "black", "rook", 1, 2)],
      target: { row: 2, col: 2 },
    },
    {
      // Ban đầu hai vật cản nên Pháo không chiếu; rời một quân còn đúng một ngòi.
      pieces: [...generals(), piece("attacker", "red", "cannon", 1, 0),
        piece("screen", "red", "elephant", 1, 3), piece("moving", "black", "rook", 1, 2)],
      target: { row: 2, col: 2 },
    },
    {
      pieces: [...generals(), piece("attacker", "red", "horse", 3, 3), piece("moving", "black", "rook", 2, 3)],
      target: { row: 2, col: 2 },
    },
  ] satisfies { pieces: Piece[]; target: Piece["position"] }[];
  for (const { pieces, target } of cases) {
    assert.equal(isInCheck(pieces, "black"), false);
    assert.equal(isInCheck(mirror(pieces), "red"), false);
    assert.equal(canPieceMoveByGeometry(pieces, "moving", target), true);
    expectBoth(pieces, "moving", target, false);
  }
});

test("Hợp lệ: không rời quân chắn làm hai Tướng đối mặt", () => {
  const pieces = [piece("own-general", "black", "general", 0, 4),
    piece("enemy-general", "red", "general", 9, 4), piece("moving", "black", "rook", 4, 4)];
  assert.equal(isInCheck(pieces, "black"), false);
  expectBoth(pieces, "moving", { row: 4, col: 5 }, false);
  // Vẫn được di chuyển dọc cột nếu còn che giữa hai Tướng.
  expectBoth(pieces, "moving", { row: 5, col: 4 }, true);
});

test("Hợp lệ: Tướng không được đi vào ô bị tấn công", () => {
  const pieces = [...generals(), piece("attacker", "red", "rook", 0, 0)];
  assert.equal(isInCheck(pieces, "black"), false);
  expectBoth(pieces, "own-general", { row: 0, col: 4 }, false);
});

test("Hợp lệ: đang chiếu, nước không giải chiếu bị từ chối", () => {
  const pieces = [...generals(), piece("attacker", "red", "rook", 1, 0), piece("moving", "black", "rook", 3, 8)];
  assert.equal(isInCheck(pieces, "black"), true);
  assert.equal(isInCheck(mirror(pieces), "red"), true);
  expectBoth(pieces, "moving", { row: 3, col: 7 }, false);
});

test("Hợp lệ: giải chiếu bằng di chuyển Tướng", () => {
  const pieces = [...generals(), piece("attacker", "red", "rook", 1, 0)];
  assert.equal(isInCheck(pieces, "black"), true);
  expectBoth(pieces, "own-general", { row: 0, col: 4 }, true);
});

test("Hợp lệ: giải chiếu bằng che chắn", () => {
  const pieces = [...generals(), piece("attacker", "red", "rook", 1, 0), piece("moving", "black", "rook", 2, 2)];
  assert.equal(isInCheck(pieces, "black"), true);
  expectBoth(pieces, "moving", { row: 1, col: 2 }, true);
});

test("Hợp lệ: ăn quân chiếu, mô phỏng phải loại quân bị ăn", () => {
  const pieces = [...generals(), piece("attacker", "red", "rook", 1, 0), piece("moving", "black", "rook", 2, 0)];
  assert.equal(isInCheck(pieces, "black"), true);
  expectBoth(pieces, "moving", { row: 1, col: 0 }, true);
  // Ăn Mã đang chiếu: nếu không loại Mã khỏi mô phỏng, Tướng vẫn bị chiếu.
  const horseCheck = [...generals(), piece("attacker", "red", "horse", 3, 3), piece("moving", "black", "rook", 3, 0)];
  assert.equal(isInCheck(horseCheck, "black"), true);
  expectBoth(horseCheck, "moving", { row: 3, col: 3 }, true);
});

test("Hợp lệ: cấm ăn Tướng đối phương dù hình học cho phép", () => {
  const pieces = [...generals(), piece("moving", "black", "rook", 8, 3)];
  assert.equal(canPieceMoveByGeometry(pieces, "moving", { row: 9, col: 3 }), true);
  expectBoth(pieces, "moving", { row: 9, col: 3 }, false);
});

test("Hợp lệ: thiếu/trùng Tướng báo Error thống nhất với isInCheck trước khi xét ID/lượt", () => {
  for (const side of ["black", "red"] as const) {
    const invalidPositions = [[], ...(["black", "red"] as const).flatMap((invalidSide) => [
      generals().filter((p) => p.side !== invalidSide),
      [...generals(), piece("extra-general", invalidSide, "general", invalidSide === "black" ? 0 : 8, 5)],
    ])];
    for (const pieces of invalidPositions) {
      let checkMessage = "";
      assert.throws(() => isInCheck(pieces, side), (error: unknown) => {
        assert.ok(error instanceof Error);
        checkMessage = error.message;
        return true;
      });
      assert.throws(() => isLegalMove(pieces, side, "missing", { row: 0, col: 0 }), (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, checkMessage);
        return true;
      });
    }
  }
});

test("Hợp lệ: không sửa mảng, quân, position hoặc đích khi đi/ăn/bị từ chối", () => {
  const original = [...generals(), piece("attacker", "red", "rook", 1, 0), piece("moving", "black", "rook", 2, 0)];
  for (const side of ["black", "red"] as const) {
    const pieces = side === "black" ? original : mirror(original);
    const snapshot = structuredClone(pieces);
    const references = pieces.map((p) => ({ piece: p, position: p.position }));
    for (const p of pieces) {
      Object.freeze(p.position);
      Object.freeze(p);
    }
    Object.freeze(pieces);
    const rawTarget: Piece["position"] = { row: 1, col: 0 };
    const target = Object.freeze(side === "black" ? rawTarget : mirrorPosition(rawTarget));
    assert.equal(isLegalMove(pieces, side, "moving", target), true);
    const escape: Piece["position"] = { row: 0, col: 4 };
    assert.equal(isLegalMove(pieces, side, "own-general", side === "black" ? escape : mirrorPosition(escape)), true);
    assert.equal(isLegalMove(pieces, side, "missing", target), false);
    assert.deepEqual(pieces, snapshot);
    assert.deepEqual(target, side === "black" ? rawTarget : mirrorPosition(rawTarget));
    references.forEach((r, i) => {
      assert.equal(pieces[i], r.piece);
      assert.equal(pieces[i].position, r.position);
    });
  }
});

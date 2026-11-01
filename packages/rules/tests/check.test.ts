import test from "node:test";
import assert from "node:assert/strict";
import { createInitialPieces, isInCheck } from "../src/index";
import type { Piece, Side } from "../src/index";

function piece(id: string, side: Side, type: Piece["type"], row: Piece["position"]["row"], col: Piece["position"]["col"]): Piece {
  return { id, side, type, position: { row, col } };
}

function generals(): Piece[] {
  // Khác cột để không vô tình tạo chiếu đối mặt.
  return [piece("black-general", "black", "general", 1, 4), piece("red-general", "red", "general", 9, 3)];
}

function mirror(pieces: readonly Piece[]): Piece[] {
  return pieces.map((p) => ({ ...p, side: p.side === "black" ? "red" : "black",
    position: { row: (9 - p.position.row) as Piece["position"]["row"], col: (8 - p.position.col) as Piece["position"]["col"] } }));
}

function expectBoth(pieces: readonly Piece[], expected: boolean) {
  assert.equal(isInCheck(pieces, "black"), expected);
  assert.equal(isInCheck(mirror(pieces), "red"), expected);
}

test("Chiếu: khai cuộc không chiếu cả hai phe", () => {
  const pieces = createInitialPieces();
  assert.equal(isInCheck(pieces, "black"), false);
  assert.equal(isInCheck(pieces, "red"), false);
});

test("Chiếu Xe: đường thông và bị chắn, cho cả hai phe", () => {
  const pieces = [...generals(), piece("attacker", "red", "rook", 1, 0)];
  expectBoth(pieces, true);
  for (const side of ["black", "red"] as const) {
    expectBoth([...pieces, piece("blocker", side, "elephant", 1, 2)], false);
  }
  // Quân cùng phe không được tính là nguồn chiếu.
  expectBoth([...generals(), piece("friendly-rook", "black", "rook", 1, 0)], false);
});

test("Chiếu Pháo: chỉ đúng một ngòi, ngòi thuộc bất kỳ phe nào", () => {
  const pieces = [...generals(), piece("attacker", "red", "cannon", 1, 0)];
  expectBoth(pieces, false);
  for (const side of ["black", "red"] as const) {
    const oneScreen = [...pieces, piece("screen", side, "elephant", 1, 2)];
    expectBoth(oneScreen, true);
    expectBoth([...oneScreen, piece("second-screen", "black", "elephant", 1, 3)], false);
  }
});

test("Chiếu Mã: chân thoáng chiếu, bị cản bởi bất kỳ phe nào thì không", () => {
  const pieces = [...generals(), piece("attacker", "red", "horse", 3, 3)];
  expectBoth(pieces, true);
  for (const side of ["black", "red"] as const) {
    expectBoth([...pieces, piece("leg", side, "elephant", 2, 3)], false);
  }
});

test("Chiếu Tốt: tiến đúng hướng, ngang sau sông, không lùi", () => {
  expectBoth([...generals(), piece("attacker", "red", "soldier", 2, 4)], true);
  expectBoth([...generals(), piece("attacker", "red", "soldier", 1, 3)], true);
  expectBoth([...generals(), piece("attacker", "red", "soldier", 1, 5)], true);
  expectBoth([...generals(), piece("attacker", "red", "soldier", 0, 4)], false);
});

test("Chiếu Tướng: liền kề theo hình học trong cung của quân tấn công", () => {
  // Fixture nhân tạo: Tướng bị kiểm tra ở cung đối phương để cô lập hình học
  // một bước; hai Tướng khác cột nên không phải luật đối mặt.
  const adjacent = [piece("black-general", "black", "general", 8, 4), piece("red-general", "red", "general", 8, 3)];
  expectBoth(adjacent, true);
  const diagonal = [piece("black-general", "black", "general", 7, 4), piece("red-general", "red", "general", 8, 3)];
  expectBoth(diagonal, false);
});

test("Chiếu đối mặt: cùng cột trống chiếu cả hai phe, có chắn thì không", () => {
  const pieces = [piece("black-general", "black", "general", 0, 4), piece("red-general", "red", "general", 9, 4)];
  for (const side of ["black", "red"] as const) {
    assert.equal(isInCheck(pieces, side), true);
    for (const blockerSide of ["black", "red"] as const) {
      assert.equal(isInCheck([...pieces, piece("blocker", blockerSide, "elephant", 4, 4)], side), false);
    }
  }
  expectBoth(generals(), false);
});

test("Chiếu: thiếu hoặc trùng Tướng của bất kỳ phe nào đều throw Error", () => {
  for (const checkedSide of ["black", "red"] as const) {
    assert.throws(() => isInCheck([], checkedSide), /đúng một Tướng mỗi phe/);
    for (const invalidSide of ["black", "red"] as const) {
      const missing = generals().filter((p) => p.side !== invalidSide);
      assert.throws(() => isInCheck(missing, checkedSide), /đúng một Tướng mỗi phe/);
      const duplicate = [...generals(), piece("extra-general", invalidSide, "general", invalidSide === "black" ? 0 : 8, 5)];
      assert.throws(() => isInCheck(duplicate, checkedSide), /đúng một Tướng mỗi phe/);
      // Vẫn phải báo thế cờ sai dù đang có nguồn chiếu rõ ràng.
      assert.throws(() => isInCheck([...duplicate, piece("rook", "red", "rook", 1, 0)], checkedSide), /đúng một Tướng mỗi phe/);
    }
  }
});

test("Chiếu: không thay đổi đầu vào trên cả kết quả true và false", () => {
  for (const source of [generals(), [...generals(), piece("attacker", "red", "rook", 1, 0)]]) {
    for (const pieces of [source, mirror(source)]) {
      const snapshot = structuredClone(pieces);
      for (const p of pieces) {
        Object.freeze(p.position);
        Object.freeze(p);
      }
      Object.freeze(pieces);
      isInCheck(pieces, "black");
      isInCheck(pieces, "red");
      assert.deepEqual(pieces, snapshot);
    }
  }
});

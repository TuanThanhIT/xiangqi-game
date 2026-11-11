import type { Piece, Side } from "./types";

/** Kiểm tra dữ liệu cấu trúc; không áp đặt số quân hoặc thế cờ lịch sử. */
export function assertValidPosition(pieces: readonly Piece[], side: Side): void {
  if (!Array.isArray(pieces) || (side !== "red" && side !== "black")) throw new Error("Dữ liệu thế cờ không hợp lệ");
  const ids = new Set<string>(), squares = new Set<string>();
  const types = ["rook", "horse", "elephant", "advisor", "general", "cannon", "soldier"];
  for (const piece of pieces) {
    if (!piece || typeof piece.id !== "string" || !piece.id || ids.has(piece.id) ||
        !types.includes(piece.type) || (piece.side !== "red" && piece.side !== "black") ||
        !piece.position || !Number.isInteger(piece.position.row) || !Number.isInteger(piece.position.col) ||
        piece.position.row < 0 || piece.position.row > 9 || piece.position.col < 0 || piece.position.col > 8) {
      throw new Error("Dữ liệu thế cờ không hợp lệ");
    }
    const square = `${piece.position.row}:${piece.position.col}`;
    if (squares.has(square)) throw new Error("Nhiều quân trên cùng một giao điểm");
    ids.add(piece.id); squares.add(square);
  }
}

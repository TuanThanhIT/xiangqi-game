import type { Piece, Side } from "./types";
import { canPieceMoveByGeometry } from "./piece-movement";

/**
 * Kiểm tra đe dọa theo hình học và hai Tướng đối mặt, không thay đổi đầu vào.
 * Yêu cầu đúng một Tướng mỗi phe; các dữ liệu quân khác được giả định hợp lệ.
 * Không đệ quy xét nước đi hợp lệ/an toàn của quân tấn công, không xác định kết thúc trận.
 */
export function isInCheck(pieces: readonly Piece[], side: Side): boolean {
  const blackGenerals = pieces.filter((piece) => piece.type === "general" && piece.side === "black");
  const redGenerals = pieces.filter((piece) => piece.type === "general" && piece.side === "red");
  if (blackGenerals.length !== 1 || redGenerals.length !== 1) {
    throw new Error(`Thế cờ phải có đúng một Tướng mỗi phe: Đen (black)=${blackGenerals.length}, Đỏ (red)=${redGenerals.length}`);
  }

  const general = side === "black" ? blackGenerals[0] : redGenerals[0];
  const opponent = side === "black" ? redGenerals[0] : blackGenerals[0];
  const start = general.position;
  const end = opponent.position;
  if (start.col === end.col) {
    const minRow = Math.min(start.row, end.row);
    const maxRow = Math.max(start.row, end.row);
    const blocked = pieces.some((piece) => piece.position.col === start.col &&
      piece.position.row > minRow && piece.position.row < maxRow);
    if (!blocked) return true;
  }

  return pieces.some((piece) => piece.side !== side &&
    canPieceMoveByGeometry(pieces, piece.id, general.position));
}

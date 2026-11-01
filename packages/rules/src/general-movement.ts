import type { Piece } from "./types";

/**
 * Chỉ xét một bước ngang/dọc, cung đúng phe và phe ở đích trên danh sách quân hợp lệ.
 * Chưa xét lượt, điểm đích bị tấn công, hai Tướng đối mặt hoặc an toàn của Tướng.
 * Không có nước đi xa để ăn Tướng; đây không phải bộ xác thực nước đi toàn trận.
 * Không thực hiện di chuyển hoặc thay đổi dữ liệu đầu vào.
 */
export function canGeneralMoveByGeometry(
  pieces: readonly Piece[],
  pieceId: Piece["id"],
  destination: Readonly<{ row: number; col: number }>,
): boolean {
  const { row, col } = destination;
  if (!Number.isInteger(row) || !Number.isInteger(col) ||
      row < 0 || row > 9 || col < 0 || col > 8) return false;

  const general = pieces.find((piece) => piece.id === pieceId);
  if (!general || general.type !== "general") return false;

  const start = general.position;
  if (Math.abs(row - start.row) + Math.abs(col - start.col) !== 1) return false;

  const minRow = general.side === "black" ? 0 : 7;
  const maxRow = general.side === "black" ? 2 : 9;
  if (start.row < minRow || start.row > maxRow || start.col < 3 || start.col > 5 ||
      row < minRow || row > maxRow || col < 3 || col > 5) return false;

  const target = pieces.find((piece) =>
    piece.position.row === row && piece.position.col === col);
  return target?.side !== general.side;
}

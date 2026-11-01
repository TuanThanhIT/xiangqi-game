import type { Piece } from "./types";

/**
 * Chỉ xét cách đi Sĩ, cung đúng phe và phe ở đích trên danh sách quân hợp lệ.
 * Không xét cản chân/cản mắt hoặc khả năng đạt vị trí từ thế khai cuộc.
 * Không xét lượt, chiếu, chống Tướng, an toàn của Tướng hoặc kết thúc trận.
 * Không thực hiện di chuyển hoặc thay đổi dữ liệu đầu vào.
 */
export function canAdvisorMoveByGeometry(
  pieces: readonly Piece[],
  pieceId: Piece["id"],
  destination: Readonly<{ row: number; col: number }>,
): boolean {
  const { row, col } = destination;
  if (!Number.isInteger(row) || !Number.isInteger(col) ||
      row < 0 || row > 9 || col < 0 || col > 8) return false;

  const advisor = pieces.find((piece) => piece.id === pieceId);
  if (!advisor || advisor.type !== "advisor") return false;

  const start = advisor.position;
  if (Math.abs(row - start.row) !== 1 || Math.abs(col - start.col) !== 1) return false;

  const minRow = advisor.side === "black" ? 0 : 7;
  const maxRow = advisor.side === "black" ? 2 : 9;
  if (start.row < minRow || start.row > maxRow || start.col < 3 || start.col > 5 ||
      row < minRow || row > maxRow || col < 3 || col > 5) return false;

  const target = pieces.find((piece) =>
    piece.position.row === row && piece.position.col === col);
  return target?.side !== advisor.side;
}

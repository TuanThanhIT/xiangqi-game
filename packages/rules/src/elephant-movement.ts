import type { Piece } from "./types";

/**
 * Chỉ xét cách đi Tượng, cản mắt, phần bàn của mỗi phe và phe ở đích.
 * Giả định danh sách quân hợp lệ; không kiểm tra khả năng đạt vị trí từ khai cuộc.
 * Không xét lượt, chiếu, chống Tướng, an toàn của Tướng hoặc kết thúc trận.
 * Không thực hiện di chuyển hoặc thay đổi dữ liệu đầu vào.
 */
export function canElephantMoveByGeometry(
  pieces: readonly Piece[],
  pieceId: Piece["id"],
  destination: Readonly<{ row: number; col: number }>,
): boolean {
  const { row, col } = destination;
  if (!Number.isInteger(row) || !Number.isInteger(col) ||
      row < 0 || row > 9 || col < 0 || col > 8) return false;

  const elephant = pieces.find((piece) => piece.id === pieceId);
  if (!elephant || elephant.type !== "elephant") return false;

  const start = elephant.position;
  if (Math.abs(row - start.row) !== 2 || Math.abs(col - start.col) !== 2) return false;

  const minRow = elephant.side === "black" ? 0 : 5;
  const maxRow = elephant.side === "black" ? 4 : 9;
  if (start.row < minRow || start.row > maxRow || row < minRow || row > maxRow) return false;

  const eyeRow = (start.row + row) / 2;
  const eyeCol = (start.col + col) / 2;
  if (pieces.some((piece) => piece.position.row === eyeRow && piece.position.col === eyeCol)) {
    return false;
  }

  const target = pieces.find((piece) =>
    piece.position.row === row && piece.position.col === col);
  return target?.side !== elephant.side;
}

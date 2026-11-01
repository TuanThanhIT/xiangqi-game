import type { Piece } from "./types";

/**
 * Chỉ xét cách đi Mã, cản chân và phe ở đích trên danh sách quân hợp lệ.
 * Không xác thực lượt, chiếu, chống Tướng, an toàn của Tướng hoặc kết thúc trận.
 * Không thực hiện di chuyển hoặc thay đổi dữ liệu đầu vào.
 */
export function canHorseMoveByGeometry(
  pieces: readonly Piece[],
  pieceId: Piece["id"],
  destination: Readonly<{ row: number; col: number }>,
): boolean {
  const { row, col } = destination;
  if (!Number.isInteger(row) || !Number.isInteger(col) ||
      row < 0 || row > 9 || col < 0 || col > 8) return false;

  const horse = pieces.find((piece) => piece.id === pieceId);
  if (!horse || horse.type !== "horse") return false;

  const start = horse.position;
  const rowDelta = row - start.row;
  const colDelta = col - start.col;
  const twoRows = Math.abs(rowDelta) === 2 && Math.abs(colDelta) === 1;
  const twoCols = Math.abs(rowDelta) === 1 && Math.abs(colDelta) === 2;
  if (!twoRows && !twoCols) return false;

  const legRow = start.row + (twoRows ? Math.sign(rowDelta) : 0);
  const legCol = start.col + (twoCols ? Math.sign(colDelta) : 0);
  if (pieces.some((piece) => piece.position.row === legRow && piece.position.col === legCol)) {
    return false;
  }

  const target = pieces.find((piece) =>
    piece.position.row === row && piece.position.col === col);
  return target?.side !== horse.side;
}

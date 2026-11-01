import type { Piece } from "./types";

/**
 * Chỉ xét cách đi Xe, vật cản và phe ở đích trên danh sách quân hợp lệ.
 * Không xác thực lượt, chiếu, chống Tướng, an toàn của Tướng hoặc kết thúc trận.
 * Không thực hiện di chuyển hoặc thay đổi dữ liệu đầu vào.
 */
export function canRookMoveByGeometry(
  pieces: readonly Piece[],
  pieceId: Piece["id"],
  destination: Readonly<{ row: number; col: number }>,
): boolean {
  const { row, col } = destination;
  if (!Number.isInteger(row) || !Number.isInteger(col) ||
      row < 0 || row > 9 || col < 0 || col > 8) return false;

  const rook = pieces.find((piece) => piece.id === pieceId);
  if (!rook || rook.type !== "rook") return false;

  const start = rook.position;
  if (start.row === row && start.col === col) return false;
  if (start.row !== row && start.col !== col) return false;

  const target = pieces.find((piece) =>
    piece.position.row === row && piece.position.col === col);
  if (target?.side === rook.side) return false;

  const rowStep = Math.sign(row - start.row);
  const colStep = Math.sign(col - start.col);
  for (let r = start.row + rowStep, c = start.col + colStep;
       r !== row || c !== col;
       r += rowStep, c += colStep) {
    if (pieces.some((piece) => piece.position.row === r && piece.position.col === c)) {
      return false;
    }
  }
  return true;
}

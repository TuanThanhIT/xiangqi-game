import type { Piece } from "./types";

/**
 * Chỉ xét cách đi/ăn của Tốt, trạng thái qua sông ở vị trí đầu và phe ở đích.
 * Giả định danh sách quân hợp lệ. Không phong cấp hoặc thay đổi dữ liệu đầu vào.
 * Chưa xét lượt, chiếu hoặc an toàn của Tướng; không xác thực nước đi toàn trận.
 */
export function canSoldierMoveByGeometry(
  pieces: readonly Piece[],
  pieceId: Piece["id"],
  destination: Readonly<{ row: number; col: number }>,
): boolean {
  const { row, col } = destination;
  if (!Number.isInteger(row) || !Number.isInteger(col) ||
      row < 0 || row > 9 || col < 0 || col > 8) return false;

  const soldier = pieces.find((piece) => piece.id === pieceId);
  if (!soldier || soldier.type !== "soldier") return false;

  const start = soldier.position;
  const forward = soldier.side === "black" ? 1 : -1;
  const crossedRiver = soldier.side === "black" ? start.row >= 5 : start.row <= 4;
  const rowDelta = row - start.row;
  const colDelta = col - start.col;
  const advances = rowDelta === forward && colDelta === 0;
  const movesSideways = crossedRiver && rowDelta === 0 && Math.abs(colDelta) === 1;
  if (!advances && !movesSideways) return false;

  const target = pieces.find((piece) =>
    piece.position.row === row && piece.position.col === col);
  return target?.side !== soldier.side;
}

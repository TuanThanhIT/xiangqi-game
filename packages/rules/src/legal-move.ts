import type { Piece, Side } from "./types";
import { canPieceMoveByGeometry } from "./piece-movement";
import { isInCheck } from "./check";

/**
 * Hợp lệ theo luật đã hỗ trợ: đúng phe, hình học và không để Tướng mình bị chiếu.
 * Yêu cầu đúng một Tướng mỗi phe; không cho ăn mất Tướng.
 * Chưa xét chiếu bí, hòa, lặp thế hoặc chiếu dai/đuổi dai; chưa đủ luật thi đấu.
 * Chỉ mô phỏng trên dữ liệu mới, không thay đổi đầu vào hoặc thực hiện nước đi.
 */
export function isLegalMove(
  pieces: readonly Piece[],
  sideToMove: Side,
  pieceId: Piece["id"],
  destination: Readonly<{ row: number; col: number }>,
): boolean {
  // Tái sử dụng kiểm tra số Tướng của isInCheck trước mọi nhánh trả false.
  // Kết quả chiếu hiện tại không quyết định nước đi; thế sau mô phỏng mới quyết định.
  isInCheck(pieces, sideToMove);

  const moving = pieces.find((piece) => piece.id === pieceId);
  if (!moving || moving.side !== sideToMove) return false;
  if (!canPieceMoveByGeometry(pieces, pieceId, destination)) return false;

  const target = pieces.find((piece) =>
    piece.position.row === destination.row && piece.position.col === destination.col);
  if (target?.type === "general") return false;

  // Hình học đã kiểm tra tọa độ nguyên và giới hạn Row/Col ở trên.
  const position: Piece["position"] = {
    row: destination.row as Piece["position"]["row"],
    col: destination.col as Piece["position"]["col"],
  };
  const simulated: Piece[] = pieces
    .filter((piece) => piece !== target)
    .map((piece) => ({
      ...piece,
      position: piece.id === pieceId ? { ...position } : { ...piece.position },
    }));
  return !isInCheck(simulated, sideToMove);
}

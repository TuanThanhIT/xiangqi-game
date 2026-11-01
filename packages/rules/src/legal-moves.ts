import type { LegalMove, Piece, Row, Col, Side } from "./types";
import { isLegalMove } from "./legal-move";
import { isInCheck } from "./check";

/**
 * Liệt kê nước theo luật đã hỗ trợ, chưa xác định kết thúc trận hoặc luật lặp thế.
 * Thứ tự: quân theo danh sách đầu vào, đích theo hàng tăng rồi cột tăng.
 * Không sửa đầu vào; mỗi from/to là đối tượng mới.
 */
export function getLegalMoves(pieces: readonly Piece[], sideToMove: Side): LegalMove[] {
  // Kiểm tra đúng một Tướng mỗi phe kể cả khi không có quân để duyệt.
  isInCheck(pieces, sideToMove);
  const moves: LegalMove[] = [];
  for (const piece of pieces) {
    if (piece.side !== sideToMove) continue;
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 9; col++) {
        const to = { row: row as Row, col: col as Col };
        if (isLegalMove(pieces, sideToMove, piece.id, to)) {
          moves.push({ pieceId: piece.id, from: { ...piece.position }, to });
        }
      }
    }
  }
  return moves;
}

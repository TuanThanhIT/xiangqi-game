import type { Piece } from "./types";
import { canRookMoveByGeometry } from "./rook-movement";
import { canCannonMoveByGeometry } from "./cannon-movement";
import { canHorseMoveByGeometry } from "./horse-movement";
import { canElephantMoveByGeometry } from "./elephant-movement";
import { canAdvisorMoveByGeometry } from "./advisor-movement";
import { canGeneralMoveByGeometry } from "./general-movement";
import { canSoldierMoveByGeometry } from "./soldier-movement";

/**
 * Đầu vào chung điều phối đến hàm hình học đúng loại quân, không thay đổi đầu vào.
 * Giả định danh sách quân hợp lệ. Chưa kiểm tra lượt, chiếu hoặc an toàn của Tướng;
 * đây chưa phải hàm xác thực nước đi hợp lệ toàn trận.
 */
export function canPieceMoveByGeometry(
  pieces: readonly Piece[],
  pieceId: Piece["id"],
  destination: Readonly<{ row: number; col: number }>,
): boolean {
  const piece = pieces.find((candidate) => candidate.id === pieceId);
  if (!piece) return false;

  const type = piece.type;
  switch (type) {
    case "rook": return canRookMoveByGeometry(pieces, pieceId, destination);
    case "cannon": return canCannonMoveByGeometry(pieces, pieceId, destination);
    case "horse": return canHorseMoveByGeometry(pieces, pieceId, destination);
    case "elephant": return canElephantMoveByGeometry(pieces, pieceId, destination);
    case "advisor": return canAdvisorMoveByGeometry(pieces, pieceId, destination);
    case "general": return canGeneralMoveByGeometry(pieces, pieceId, destination);
    case "soldier": return canSoldierMoveByGeometry(pieces, pieceId, destination);
    default: {
      const unhandledType: never = type;
      void unhandledType;
      return false;
    }
  }
}

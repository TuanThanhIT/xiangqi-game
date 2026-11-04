import { createInitialPieces } from "@xiangqi/rules";
import type { Piece } from "@xiangqi/rules";

const initialPieces = createInitialPieces();
export interface CapturedPieces { red: Piece[]; black: Piece[] }

// Chỉ dùng với ván bắt đầu từ khai cuộc chuẩn, không phải lịch sử ăn quân.
// null nghĩa là chưa có bàn xác nhận, không suy diễn thành mất toàn bộ quân.
export function getCapturedPieces(pieces: readonly Piece[] | null): CapturedPieces | null {
  if (pieces === null) return null;
  const present = new Set(pieces.map((piece) => piece.id));
  const captured: CapturedPieces = { red: [], black: [] };
  for (const piece of initialPieces) {
    if (piece.type !== "general" && !present.has(piece.id)) {
      captured[piece.side].push({ ...piece, position: { ...piece.position } });
    }
  }
  return captured;
}

import { createInitialPieces, getGameStatus } from "@xiangqi/rules";
import type { GameStatus, LegalMove, Piece, Side } from "@xiangqi/rules";

// Đầu hàng là sự kiện trận online, không phải kết quả suy ra từ vị trí quân.
export type OnlineGameResult = GameStatus |
  { status: "draw"; reason: "agreement" } |
  { status: "finished"; winner: Side; loser: Side; reason: "resignation" | "disconnect_timeout" | "total_timeout" | "turn_timeout" } |
  { status: "cancelled"; reason: "both_disconnected" };

export interface RoomGame {
  pieces: Piece[];
  sideToMove: Side;
  lastMove: LegalMove | null;
  revision: number;
  result: OnlineGameResult;
  moveNumber?: number;
  captured?: Piece[];
}

// Service đã kiểm tra trận còn chơi; không đổi bàn, lượt hoặc nước vừa đi.
export function resignRoomGame(game: RoomGame, side: Side): RoomGame {
  return { ...game, revision: game.revision + 1,
    result: { status: "finished", winner: side === "red" ? "black" : "red", loser: side, reason: "resignation" } };
}

export function createRoomGame(): RoomGame {
  const pieces = createInitialPieces();
  return { pieces, sideToMove: "red", lastMove: null, revision: 0, moveNumber: 0, captured: [], result: getGameStatus(pieces, "red") };
}

// Chỉ gọi sau isLegalMove; không quyết định luật và không sửa bàn cũ.
export function nextRoomGame(game: RoomGame, pieceId: string, to: Piece["position"]): RoomGame {
  const moving = game.pieces.find((piece) => piece.id === pieceId)!;
  const pieces = game.pieces.filter((piece) => piece.id === pieceId ||
    piece.position.row !== to.row || piece.position.col !== to.col)
    .map((piece) => ({ ...piece, position: { ...(piece.id === pieceId ? to : piece.position) } }));
  const sideToMove = game.sideToMove === "red" ? "black" : "red";
  return { pieces, sideToMove, lastMove: { pieceId, from: { ...moving.position }, to: { ...to } },
    revision: game.revision + 1, moveNumber: (game.moveNumber ?? 0) + 1,
    captured: [...(game.captured ?? []), ...game.pieces.filter(p => p.id !== pieceId && p.position.row === to.row && p.position.col === to.col).map(p => structuredClone(p))],
    result: getGameStatus(pieces, sideToMove) };
}

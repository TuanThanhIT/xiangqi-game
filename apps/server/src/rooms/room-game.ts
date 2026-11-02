import { createInitialPieces, getGameStatus } from "@xiangqi/rules";
import type { GameStatus, LegalMove, Piece, Side } from "@xiangqi/rules";

export interface RoomGame {
  pieces: Piece[];
  sideToMove: Side;
  lastMove: LegalMove | null;
  revision: number;
  result: GameStatus;
}

export function createRoomGame(): RoomGame {
  const pieces = createInitialPieces();
  return { pieces, sideToMove: "red", lastMove: null, revision: 0, result: getGameStatus(pieces, "red") };
}

// Chỉ gọi sau isLegalMove; không quyết định luật và không sửa bàn cũ.
export function nextRoomGame(game: RoomGame, pieceId: string, to: Piece["position"]): RoomGame {
  const moving = game.pieces.find((piece) => piece.id === pieceId)!;
  const pieces = game.pieces.filter((piece) => piece.id === pieceId ||
    piece.position.row !== to.row || piece.position.col !== to.col)
    .map((piece) => ({ ...piece, position: { ...(piece.id === pieceId ? to : piece.position) } }));
  const sideToMove = game.sideToMove === "red" ? "black" : "red";
  return { pieces, sideToMove, lastMove: { pieceId, from: { ...moving.position }, to: { ...to } },
    revision: game.revision + 1, result: getGameStatus(pieces, sideToMove) };
}

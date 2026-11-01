import type { Piece, Side } from "./types";
import { isInCheck } from "./check";
import { getLegalMoves } from "./legal-moves";

export type GameStatus =
  | { status: "playing"; sideToMove: Side; inCheck: boolean }
  | { status: "finished"; winner: Side; loser: Side; reason: "checkmate" | "stalemate" };

/** Chưa xử lý hòa thỏa thuận, lặp thế hoặc chiếu dai/đuổi dai. */
export function getGameStatus(pieces: readonly Piece[], sideToMove: Side): GameStatus {
  const inCheck = isInCheck(pieces, sideToMove);
  if (getLegalMoves(pieces, sideToMove).length > 0) {
    return { status: "playing", sideToMove, inCheck };
  }
  return {
    status: "finished",
    winner: sideToMove === "red" ? "black" : "red",
    loser: sideToMove,
    reason: inCheck ? "checkmate" : "stalemate",
  };
}

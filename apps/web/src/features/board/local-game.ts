import { createInitialPieces, isLegalMove } from "@xiangqi/rules";
import type { GameStatus, Piece, Side } from "@xiangqi/rules";

type Position = Piece["position"];

export interface LocalGame {
  pieces: Piece[];
  sideToMove: Side;
  selectedPieceId: string | null;
  lastMove: { from: Position; to: Position } | null;
  message: string;
}

export function createLocalGame(): LocalGame {
  return {
    pieces: createInitialPieces(),
    sideToMove: "red",
    selectedPieceId: null,
    lastMove: null,
    message: "",
  };
}

// Chuyển state thuần: không setState, sửa đầu vào hoặc tạo side effect.
export function activateIntersection(game: LocalGame, destination: Position, status: GameStatus): LocalGame {
  if (status.status === "finished") return game;
  const target = game.pieces.find((piece) =>
    piece.position.row === destination.row && piece.position.col === destination.col);
  if (target?.side === game.sideToMove) {
    return {
      ...game,
      selectedPieceId: game.selectedPieceId === target.id ? null : target.id,
      message: "",
    };
  }

  if (!game.selectedPieceId) {
    return { ...game, message: target ? "Hãy chọn quân của phe đang đến lượt." : "Hãy chọn quân trước." };
  }
  const moving = game.pieces.find((piece) => piece.id === game.selectedPieceId);
  if (!moving || !isLegalMove(game.pieces, game.sideToMove, moving.id, destination)) {
    return { ...game, message: "Nước đi không hợp lệ. Hãy chọn đích khác." };
  }

  return {
    pieces: game.pieces
      .filter((piece) => piece.id !== target?.id)
      .map((piece) => piece.id === moving.id ? { ...piece, position: { ...destination } } : piece),
    sideToMove: game.sideToMove === "red" ? "black" : "red",
    selectedPieceId: null,
    lastMove: { from: { ...moving.position }, to: { ...destination } },
    message: "",
  };
}

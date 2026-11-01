import type { Col, Piece, PieceType, Side } from "./types";

const backRank: readonly PieceType[] = [
  "rook", "horse", "elephant", "advisor", "general",
  "advisor", "elephant", "horse", "rook",
];

function createSide(side: Side): Piece[] {
  const isBlack = side === "black";
  return [
    ...backRank.map((type, col): Piece => ({
      id: `${side}-back-${col}`, side, type,
      position: { row: isBlack ? 0 : 9, col: col as Col },
    })),
    ...([1, 7] as const).map((col): Piece => ({
      id: `${side}-cannon-${col}`, side, type: "cannon",
      position: { row: isBlack ? 2 : 7, col },
    })),
    ...([0, 2, 4, 6, 8] as const).map((col): Piece => ({
      id: `${side}-soldier-${col}`, side, type: "soldier",
      position: { row: isBlack ? 3 : 6, col },
    })),
  ];
}

export function createInitialPieces(): Piece[] {
  return [...createSide("black"), ...createSide("red")];
}

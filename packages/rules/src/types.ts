export type Side = "black" | "red";
export type PieceType = "rook" | "horse" | "elephant" | "advisor" | "general" | "cannon" | "soldier";
export type Row = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type Col = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export interface Piece {
  id: string;
  side: Side;
  type: PieceType;
  position: { row: Row; col: Col };
}

export interface LegalMove {
  pieceId: Piece["id"];
  from: Piece["position"];
  to: Piece["position"];
}

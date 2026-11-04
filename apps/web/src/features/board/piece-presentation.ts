import type { Piece, PieceType } from "@xiangqi/rules";

export const pieceLabels: Record<PieceType, string> = {
  rook: "Xe", horse: "Mã", elephant: "Tượng", advisor: "Sĩ",
  general: "Tướng", cannon: "Pháo", soldier: "Tốt",
};
export const pieceSymbols: Record<Piece["side"], Record<PieceType, string>> = {
  red: { general: "帥", advisor: "仕", elephant: "相", rook: "俥", horse: "傌", cannon: "炮", soldier: "兵" },
  black: { general: "將", advisor: "士", elephant: "象", rook: "車", horse: "馬", cannon: "砲", soldier: "卒" },
};

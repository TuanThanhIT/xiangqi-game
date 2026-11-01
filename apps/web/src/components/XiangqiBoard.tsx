"use client";

import { useState } from "react";
import { initialPieces } from "@/features/board/initial-position";
import type { PieceType } from "@/features/board/types";

const STEP = 60;
const PADDING = 36;
const x = (col: number) => PADDING + col * STEP;
const y = (row: number) => PADDING + row * STEP;
const labels: Record<PieceType, string> = {
  rook: "Xe", horse: "Mã", elephant: "Tượng", advisor: "Sĩ",
  general: "Tướng", cannon: "Pháo", soldier: "Tốt",
};

export default function XiangqiBoard() {
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const selectedPiece = initialPieces.find((piece) => piece.id === selectedPieceId);

  function togglePiece(id: string) {
    setSelectedPieceId((currentId) => currentId === id ? null : id);
  }

  return (
    <>
    <svg className="xiangqi-board" viewBox="0 0 552 612" role="group" aria-labelledby="board-title board-description" onClick={() => setSelectedPieceId(null)}>
      <title id="board-title">Bàn cờ tướng khai cuộc</title>
      <desc id="board-description">
        32 quân trên giao điểm. Đen ở trên, viền nét đứt; Đỏ ở dưới,
        viền kép. Nhấn Tab để focus quân, Enter hoặc Space để chọn hoặc bỏ chọn.
        Bấm vùng trống để bỏ chọn. Chưa hỗ trợ di chuyển quân.
      </desc>
      <rect className="board-surface" width="552" height="612" rx="12" />
      <g className="board-lines">
        {Array.from({ length: 10 }, (_, row) => (
          <line key={`row-${row}`} x1={x(0)} y1={y(row)} x2={x(8)} y2={y(row)} />
        ))}
        {[0, 8].map((col) => (
          <line key={`edge-${col}`} x1={x(col)} y1={y(0)} x2={x(col)} y2={y(9)} />
        ))}
        {Array.from({ length: 7 }, (_, index) => index + 1).map((col) => (
          <g key={`col-${col}`}>
            <line x1={x(col)} y1={y(0)} x2={x(col)} y2={y(4)} />
            <line x1={x(col)} y1={y(5)} x2={x(col)} y2={y(9)} />
          </g>
        ))}
        {[0, 7].map((row) => (
          <g key={`palace-${row}`}>
            <line x1={x(3)} y1={y(row)} x2={x(5)} y2={y(row + 2)} />
            <line x1={x(5)} y1={y(row)} x2={x(3)} y2={y(row + 2)} />
          </g>
        ))}
      </g>
      <text className="river-label" x={x(4)} y={y(4.5)} dominantBaseline="central" textAnchor="middle">SÔNG</text>
      {initialPieces.map((piece) => (
        <g
          key={piece.id}
          className={`piece piece--${piece.side}`}
          transform={`translate(${x(piece.position.col)} ${y(piece.position.row)})`}
          role="button"
          tabIndex={0}
          aria-label={`${labels[piece.type]} ${piece.side === "black" ? "Đen" : "Đỏ"}, hàng ${piece.position.row}, cột ${piece.position.col}`}
          aria-pressed={selectedPieceId === piece.id}
          onClick={(event) => {
            event.stopPropagation();
            togglePiece(piece.id);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              if (!event.repeat) togglePiece(piece.id);
            }
          }}
        >
          <title>{labels[piece.type]} {piece.side === "black" ? "Đen" : "Đỏ"}, hàng {piece.position.row}, cột {piece.position.col}</title>
          <circle className="piece-focus-ring" r="30" aria-hidden="true" />
          {selectedPieceId === piece.id && (
            <rect className="piece-selection" x="-29" y="-29" width="58" height="58" rx="6" aria-hidden="true" />
          )}
          <circle className="piece-body" r="25" />
          {piece.side === "red" && <circle className="piece-inner-ring" r="21" />}
          <text textAnchor="middle" dominantBaseline="central">{labels[piece.type]}</text>
        </g>
      ))}
    </svg>
    <p className="selection-description" role="status" aria-live="polite" aria-atomic="true">
      {selectedPiece
        ? `Đang chọn: ${labels[selectedPiece.type]} ${selectedPiece.side === "black" ? "Đen" : "Đỏ"}, hàng ${selectedPiece.position.row}, cột ${selectedPiece.position.col}.`
        : "Chưa chọn quân"}
    </p>
    </>
  );
}

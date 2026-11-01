"use client";

import { useMemo, useRef, useState } from "react";
import { getGameStatus } from "@xiangqi/rules";
import type { Piece, PieceType } from "@xiangqi/rules";
import { activateIntersection, createLocalGame } from "@/features/board/local-game";
import type { LocalGame } from "@/features/board/local-game";

const STEP = 60;
const PADDING = 36;
const x = (col: number) => PADDING + col * STEP;
const y = (row: number) => PADDING + row * STEP;
const labels: Record<PieceType, string> = {
  rook: "Xe", horse: "Mã", elephant: "Tượng", advisor: "Sĩ",
  general: "Tướng", cannon: "Pháo", soldier: "Tốt",
};
const intersections = Array.from({ length: 90 }, (_, index): Piece["position"] => ({
  row: Math.floor(index / 9) as Piece["position"]["row"],
  col: (index % 9) as Piece["position"]["col"],
}));

interface XiangqiBoardProps {
  initialGame?: LocalGame;
}

export default function XiangqiBoard({ initialGame }: XiangqiBoardProps = {}) {
  // Prop chỉ dùng lúc mount; sao chép sâu dữ liệu JSON để không sửa prop.
  const [game, setGame] = useState<LocalGame>(() => initialGame
    ? structuredClone(initialGame)
    : createLocalGame());
  const { pieces, sideToMove, selectedPieceId, lastMove, message } = game;
  const selectedPiece = pieces.find((piece) => piece.id === selectedPieceId);
  const gameStatus = useMemo(() => getGameStatus(pieces, sideToMove), [pieces, sideToMove]);
  const finished = gameStatus.status === "finished";
  const sideLabel = sideToMove === "red" ? "Đỏ" : "Đen";
  const [focusedIndex, setFocusedIndex] = useState(81);
  const intersectionRefs = useRef<(SVGGElement | null)[]>([]);

  // Nếu React đang xử lý nhiều cập nhật, không dùng kết quả của bàn/lượt cũ.
  // Chọn quân không đổi pieces/sideToMove nên vẫn tái sử dụng kết quả useMemo.
  function statusFor(current: LocalGame) {
    return current.pieces === pieces && current.sideToMove === sideToMove
      ? gameStatus
      : getGameStatus(current.pieces, current.sideToMove);
  }

  function activate(position: Piece["position"]) {
    setGame((current) => activateIntersection(current, position, statusFor(current)));
  }

  function clearSelection() {
    setGame((current) => statusFor(current).status === "finished"
      ? current
      : { ...current, selectedPieceId: null, message: "" });
  }

  function startNewGame(button: HTMLButtonElement) {
    if (lastMove !== null && !finished &&
        !window.confirm("Ván hiện tại chưa kết thúc. Bạn có muốn xóa ván này và bắt đầu ván mới?")) {
      button.focus();
      return;
    }
    setGame(createLocalGame());
    setFocusedIndex(81);
    button.focus();
  }

  return (
    <>
    <div className="board-actions">
      <button type="button" className="new-game-button" onClick={(event) => startNewGame(event.currentTarget)}>
        Ván mới
      </button>
    </div>
    <div className="game-status" role="status" aria-live="polite" aria-atomic="true">
      {gameStatus.status === "finished" ? (
        <p><strong>Phe {gameStatus.winner === "red" ? "Đỏ" : "Đen"} thắng!</strong>{" "}
          Phe {gameStatus.loser === "red" ? "Đỏ" : "Đen"} thua vì{" "}
          {gameStatus.reason === "checkmate" ? "bị chiếu bí" : "hết nước đi hợp lệ dù không bị chiếu"}.
        </p>
      ) : <p>Đến lượt: <strong>{sideLabel}</strong></p>}
      <p>{selectedPiece
        ? `Đang chọn: ${labels[selectedPiece.type]} ${selectedPiece.side === "black" ? "Đen" : "Đỏ"}, hàng ${selectedPiece.position.row}, cột ${selectedPiece.position.col}.`
        : "Chưa chọn quân"}</p>
      {gameStatus.status === "playing" && gameStatus.inCheck && <p className="check-warning">Phe {sideLabel} đang bị chiếu!</p>}
      {message && <p>{message}</p>}
    </div>
    <svg className="xiangqi-board" viewBox="0 0 552 612" role="group" aria-labelledby="board-title board-description" onClick={clearSelection}>
      <title id="board-title">Bàn cờ tướng hai người luân phiên</title>
      <desc id="board-description">
        Đen ở trên, viền nét đứt; Đỏ ở dưới, viền kép. Đỏ đi trước.
        Nhấn Tab vào bàn, dùng phím mũi tên chuyển giao điểm,
        Enter hoặc Space để chọn quân hoặc đích. Bấm ngoài vùng giao điểm để bỏ chọn.
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
      {lastMove && (
        <g className="last-move" aria-hidden="true">
          <circle className="last-move-from" cx={x(lastMove.from.col)} cy={y(lastMove.from.row)} r="10" />
          <rect className="last-move-to" x={x(lastMove.to.col) - 28} y={y(lastMove.to.row) - 28} width="56" height="56" rx="8" />
        </g>
      )}
      {pieces.map((piece) => (
        <g
          key={piece.id}
          className={`piece piece--${piece.side}`}
          transform={`translate(${x(piece.position.col)} ${y(piece.position.row)})`}
          aria-hidden="true"
        >
          <title>{`${labels[piece.type]} ${piece.side === "black" ? "Đen" : "Đỏ"}, hàng ${piece.position.row}, cột ${piece.position.col}`}</title>
          {selectedPieceId === piece.id && (
            <rect className="piece-selection" x="-29" y="-29" width="58" height="58" rx="6" aria-hidden="true" />
          )}
          <circle className="piece-body" r="25" />
          {piece.side === "red" && <circle className="piece-inner-ring" r="21" />}
          <text textAnchor="middle" dominantBaseline="central">{labels[piece.type]}</text>
        </g>
      ))}
      {intersections.map((position, index) => {
        const piece = pieces.find((candidate) => candidate.position.row === position.row && candidate.position.col === position.col);
        const name = piece ? `${labels[piece.type]} ${piece.side === "red" ? "Đỏ" : "Đen"}` : "Giao điểm trống";
        return (
          <g
            key={`${position.row}-${position.col}`}
            ref={(element) => { intersectionRefs.current[index] = element; }}
            className="board-intersection"
            transform={`translate(${x(position.col)} ${y(position.row)})`}
            role="button"
            tabIndex={focusedIndex === index ? 0 : -1}
            aria-label={`${name}, hàng ${position.row}, cột ${position.col}`}
            aria-pressed={!!piece && selectedPieceId === piece.id}
            aria-disabled={finished}
            onFocus={() => setFocusedIndex(index)}
            onClick={(event) => {
              event.stopPropagation();
              event.currentTarget.focus();
              activate(position);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                if (!event.repeat) activate(position);
                return;
              }
              const offsets: Record<string, [number, number]> = {
                ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
              };
              const offset = offsets[event.key];
              if (!offset) return;
              event.preventDefault();
              event.stopPropagation();
              const row = Math.max(0, Math.min(9, position.row + offset[0]));
              const col = Math.max(0, Math.min(8, position.col + offset[1]));
              intersectionRefs.current[row * 9 + col]?.focus();
            }}
          >
            <title>{`${name}, hàng ${position.row}, cột ${position.col}`}</title>
            <rect className="intersection-hit-area" x="-28" y="-28" width="56" height="56" rx="4" />
          </g>
        );
      })}
    </svg>
    <p className="board-help">Bàn phím: Tab vào bàn, phím mũi tên chọn giao điểm, Enter/Space xác nhận.</p>
    {lastMove && <p className="board-help">
      Nước vừa đi: ({lastMove.from.row}, {lastMove.from.col}) → ({lastMove.to.row}, {lastMove.to.col}). Đầu: vòng tròn; đích: khung nét đứt.
    </p>}
    <p className="board-help">
      Bản thử chưa hỗ trợ hòa thỏa thuận, lặp thế hoặc chiếu dai/đuổi dai.
    </p>
    </>
  );
}

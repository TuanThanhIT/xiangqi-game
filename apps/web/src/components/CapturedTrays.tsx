import { useId } from "react";
import type { Piece } from "@xiangqi/rules";
import { getCapturedPieces } from "@/features/board/captured-pieces";
import { pieceLabels, pieceSymbols } from "@/features/board/piece-presentation";

function TrayContent({ side, pieces }: { side: Piece["side"]; pieces: readonly Piece[] }) {
  return <>
    <header className="xq-tray-heading"><strong>{side === "black" ? "ĐEN" : "ĐỎ"}</strong><span>{pieces.length}</span></header>
    {pieces.length ? <ul className="xq-tray-pieces" aria-label="Theo thứ tự khai cuộc, không phải thứ tự bị ăn">
      {pieces.map((piece) => <li key={piece.id} data-captured-id={piece.id}>
        <span className="xq-sr-only">{pieceLabels[piece.type]} {side === "black" ? "Đen" : "Đỏ"}</span>
        <svg viewBox="0 0 60 60" className={`xq-tray-piece xq-tray-piece--${side}`} aria-hidden="true" focusable="false">
          <circle className="xq-tray-piece-edge" cx="30" cy="32" r="25" />
          <circle className="xq-tray-piece-body" cx="30" cy="29" r="25" />
          <circle className="xq-tray-piece-ring" cx="30" cy="29" r="21" />
          <text x="30" y="29" textAnchor="middle" dominantBaseline="central">{pieceSymbols[side][piece.type]}</text>
        </svg>
      </li>)}
    </ul> : <p className="xq-tray-empty">Chưa có</p>}
  </>;
}

export default function CapturedTrays({ pieces }: { pieces: readonly Piece[] | null }) {
  const uid = useId();
  const captured = getCapturedPieces(pieces);
  if (!captured) return null;
  return <div className="xq-captured-trays">
    {(["black", "red"] as const).map((side) => {
      const label = `Quân ${side === "black" ? "Đen" : "Đỏ"} bị ăn`;
      const id = `${uid}-${side}`;
      return <div key={side} className={`xq-captured-group xq-captured-group--${side}`}>
        <section className="xq-captured-tray xq-tray-desktop" aria-label={label}><TrayContent side={side} pieces={captured[side]} /></section>
        <button type="button" className="xq-tray-toggle" popoverTarget={id} aria-label={`${label}: ${captured[side].length}. Mở danh sách`}>
          {side === "black" ? "Đen" : "Đỏ"} <span>{captured[side].length}</span>
        </button>
        <section popover="auto" id={id} className="xq-captured-tray xq-tray-popover" aria-label={label}>
          <TrayContent side={side} pieces={captured[side]} />
          <button type="button" className="xq-action xq-action--secondary" popoverTarget={id} popoverTargetAction="hide">Đóng</button>
        </section>
      </div>;
    })}
  </div>;
}

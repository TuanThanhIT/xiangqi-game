"use client";
import { useId, useImperativeHandle, useRef, useState } from "react";
import type { Ref } from "react";
import type { Piece } from "@xiangqi/rules";
import { ROOM_THEMES } from "@/features/rooms/room-theme";
import type { RoomThemeId } from "@/features/rooms/room-theme";
import { pieceLabels as labels, pieceSymbols as faceSymbols } from "@/features/board/piece-presentation";
const STEP = 60;
const PADDING = 36;
const x = (col: number) => PADDING + col * STEP;
const y = (row: number) => PADDING + row * STEP;
const positionMarks = [
  ...[2, 7].flatMap((row) => [1, 7].map((col) => ({ row, col }))),
  ...[3, 6].flatMap((row) => [0, 2, 4, 6, 8].map((col) => ({ row, col }))),
];
const markGap = STEP * .12, markArm = STEP * .12;
function RiverBridge({ left }: { left: boolean }) {
  const width = STEP * .2, height = y(5) - y(4);
  const bridgeX = left ? x(0) - STEP * .3 : x(8) + STEP * .1;
  return <g className="river-bridge" transform={`translate(${bridgeX} ${y(4)})`} aria-hidden="true">
    <rect className="bridge-shadow" x="1" y="3" width={width} height={height - 4} rx="2" />
    <rect className="bridge-deck" x="1" y="2" width={width - 2} height={height - 4} rx="1" />
    {Array.from({length: 10},(_,i) => <path key={i} className="bridge-plank" d={`M2 ${5 + i * (height - 10) / 9} H${width - 2}`} />)}
    {[0,width].map((rail) => <g key={rail}>
      <path className="bridge-rail" d={`M${rail} 2 V${height - 2}`} />
      {[2,height - 2].map((post) => <circle key={post} className="bridge-post" cx={rail} cy={post} r="1.7" />)}
    </g>)}
  </g>;
}
const intersections = Array.from({ length: 90 }, (_, index): Piece["position"] => ({
  row: Math.floor(index / 9) as Piece["position"]["row"],
  col: (index % 9) as Piece["position"]["col"],
}));


export interface BoardHandle { resetFocus(): void }
interface Props { pieces: readonly Piece[]; themeId?: RoomThemeId | null; selectedPieceId: string | null; lastMove: { from: Piece["position"]; to: Piece["position"] } | null; disabled: boolean; onActivate(position: Piece["position"]): void; onClearSelection(): void; handleRef?: Ref<BoardHandle> }
export default function BoardView({ pieces, themeId = "earth", selectedPieceId, lastMove, disabled, onActivate, onClearSelection, handleRef }: Props) {
 const [focusedIndex, setFocusedIndex] = useState(81);
 const intersectionRefs = useRef<(SVGGElement | null)[]>([]);
 useImperativeHandle(handleRef, () => ({ resetFocus: () => setFocusedIndex(81) }), []);
 const uid = useId();
 const groundId = `${uid}-ground`;
 const river = { x: x(0), y: y(4), width: x(8) - x(0), height: y(5) - y(4) };
 const titleId = `${uid}-title`, descriptionId = `${uid}-description`;
 // Chỉ đổi thứ tự vẽ: dữ liệu trận và các vùng tương tác giữ nguyên thứ tự.
 const drawnPieces = [...pieces.filter((p) => p.id !== selectedPieceId), ...pieces.filter((p) => p.id === selectedPieceId)];
 return <>
    <svg className="xiangqi-board" viewBox="0 0 552 612" role="group" aria-labelledby={`${titleId} ${descriptionId}`} onClick={onClearSelection}>
      <title id={titleId}>Bàn cờ tướng hai người luân phiên</title>
      <desc id={descriptionId}>
        Đen ở trên, chữ đen; Đỏ ở dưới, chữ đỏ son. Hai phe đều viền kép. Đỏ đi trước.
        Trên sông có chữ Sở Hà, Hán Giới.
        Nhấn Tab vào bàn, dùng phím mũi tên chuyển giao điểm,
        Enter hoặc Space để chọn quân hoặc đích. Bấm ngoài vùng giao điểm để bỏ chọn.
      </desc>
      <defs>
        <pattern id={`${uid}-grain`} patternUnits="userSpaceOnUse" width="11" height="13">
          <circle cx="2" cy="3" r=".45" /><circle cx="8" cy="10" r=".35" /><path d="M7 2h1 M3 9h.8" />
        </pattern>
        <clipPath id={`${uid}-river-clip`}><rect {...river} /></clipPath>
        {themeId && <pattern id={groundId} patternUnits="userSpaceOnUse" width="512" height="512">
          <image href={ROOM_THEMES[themeId].ground} width="512" height="512" />
        </pattern>}
        <linearGradient id={`${uid}-ivory`} x1="0" y1="0" x2=".3" y2="1">
          <stop offset="0" stopColor="#fff6e3" /><stop offset=".55" stopColor="#f4e5c7" /><stop offset="1" stopColor="#dfc99e" />
        </linearGradient>
        <linearGradient id={`${uid}-water`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="var(--xq-river)" /><stop offset=".48" stopColor="var(--xq-river-depth)" /><stop offset="1" stopColor="var(--xq-river)" />
        </linearGradient>
      </defs>
      <rect className="board-surface" width="552" height="612" rx="12" />
      <g className="board-decoration" aria-hidden="true">
        {themeId && <g className="board-ground" fill={`url(#${groundId})`}>
          <rect x="12" y="12" width="528" height="588" />
        </g>}
        <rect className="board-fine-grain" x="12" y="12" width="528" height="588" fill={`url(#${uid}-grain)`} />
        <g clipPath={`url(#${uid}-river-clip)`} className="board-river">
        <rect className="board-water" {...river} style={{ fill: `url(#${uid}-water)` }} />
        <path className="board-waves" d="M40 292 q28 -5 56 0 t48 1 M176 307 q38 6 73 -1 t80 0 M357 291 q26 -4 54 0 t65 -1 M44 320 q36 -5 67 -1 t49 1 M361 321 q45 5 91 -1 M286 289 l31 -2 M125 302 l29 1" />
        <text className="board-river-label" x={x(2)} y={(y(4) + y(5)) / 2} textAnchor="middle" dominantBaseline="central">楚河</text>
        <text className="board-river-label" x={x(6)} y={(y(4) + y(5)) / 2} textAnchor="middle" dominantBaseline="central">漢界</text>
        </g>
        <RiverBridge left /><RiverBridge left={false} />
        <rect className="board-frame" x="4" y="4" width="544" height="604" rx="8" />
        <rect className="board-frame-trim" x="9" y="9" width="534" height="594" rx="5" />
        <path className="board-frame-light" d="M7 598 V7 H545" />
        <path className="board-frame-shade" d="M7 605 H548 V7" />
        {[[9, 9], [543, 9], [9, 603], [543, 603]].map(([cx, cy]) => <circle key={`${cx}-${cy}`} className="board-corner" cx={cx} cy={cy} r="3" />)}
      </g>
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
      <g className="board-position-marks" aria-hidden="true">
        {positionMarks.map(({row,col}) => <g key={`${row}-${col}`} data-mark-position={`${row},${col}`} transform={`translate(${x(col)} ${y(row)})`}>
          {(col === 0 ? [1] : col === 8 ? [-1] : [-1,1]).flatMap((horizontal) => [-1,1].map((vertical) =>
            <path key={`${horizontal}-${vertical}`} data-corner={`${horizontal},${vertical}`} d={`M ${horizontal * (markGap + markArm)} ${vertical * markGap} H ${horizontal * markGap} V ${vertical * (markGap + markArm)}`} />))}
        </g>)}
      </g>
      {lastMove && (
        <g className="last-move" aria-hidden="true">
          <circle className="last-move-from" cx={x(lastMove.from.col)} cy={y(lastMove.from.row)} r="6" />
          <circle className="last-move-to" cx={x(lastMove.to.col)} cy={y(lastMove.to.row)} r="30" />
        </g>
      )}
      {drawnPieces.map((piece) => (
        <g
          key={piece.id}
          className={`piece piece--${piece.side}`}
          transform={`translate(${x(piece.position.col)} ${y(piece.position.row)})`}
          aria-hidden="true" data-selected={selectedPieceId === piece.id || undefined}
        >
          <title>{`${labels[piece.type]} ${piece.side === "black" ? "Đen" : "Đỏ"}, hàng ${piece.position.row}, cột ${piece.position.col}`}</title>
          <g className="piece-art">
          <ellipse className="piece-shadow" cx="0" cy="5" rx="25" ry="24" />
          <circle className="piece-edge" cy="2" r="25" />
          {selectedPieceId === piece.id && <circle className="piece-selection" r="26.5" />}
          <circle className="piece-body" r="25" style={{ fill: `url(#${uid}-ivory)` }} />
          <circle className="piece-inner-ring" r="21" />
          <text x="0" y="0" textAnchor="middle" dominantBaseline="central">{faceSymbols[piece.side][piece.type]}</text>
          </g>
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
            aria-disabled={disabled}
            onFocus={() => setFocusedIndex(index)}
            onClick={(event) => {
              event.stopPropagation();
              event.currentTarget.focus();
              if (!disabled) onActivate(position);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                if (!event.repeat) if (!disabled) onActivate(position);
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
            <circle className="intersection-focus" r="33" aria-hidden="true" />
          </g>
        );
      })}
    </svg>
    <p className="board-help xq-sr-only">Bàn phím: Tab vào bàn, phím mũi tên chọn giao điểm, Enter/Space xác nhận.</p>
    {lastMove && <p className="board-help xq-sr-only">
      Nước vừa đi: ({lastMove.from.row}, {lastMove.from.col}) → ({lastMove.to.row}, {lastMove.to.col}). Đầu: chấm tròn; đích: vòng tròn mảnh.
    </p>}
 </>;
}

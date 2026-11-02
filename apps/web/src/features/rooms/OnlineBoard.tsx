import { useState } from "react";
import type { Piece } from "@xiangqi/rules";
import BoardView from "@/components/BoardView";
import type { OnlineGame } from "./game-contract";
import type { Seat } from "./room-contract";

interface Props { game: OnlineGame; side: Seat; canPlay: boolean; selectionEpoch: number; sendMove(pieceId: string, to: Piece["position"]): boolean }
const labels: Record<Piece["type"], string> = { rook: "Xe", horse: "Mã", elephant: "Tượng", advisor: "Sĩ", general: "Tướng", cannon: "Pháo", soldier: "Tốt" };
export default function OnlineBoard({ game, side, canPlay, selectionEpoch, sendMove }: Props) {
  const [selection, setSelection] = useState<{ id: string; revision: number; epoch: number } | null>(null);
  // Điều chỉnh state ngay khi mất quyền hoặc bàn đổi; giữ nguyên component/focus SVG.
  if (selection && (!canPlay || selection.revision !== game.revision || selection.epoch !== selectionEpoch)) setSelection(null);
  const selectedId = canPlay && selection?.revision === game.revision && selection.epoch === selectionEpoch ? selection.id : null;
  const selected = game.pieces.find((p) => p.id === selectedId);
  function activate(to: Piece["position"]) {
    if (!canPlay) return;
    const target = game.pieces.find((p) => p.position.row === to.row && p.position.col === to.col);
    if (target?.side === side) {
      setSelection(target.id === selectedId ? null : { id: target.id, revision: game.revision, epoch: selectionEpoch });
    } else if (selectedId && sendMove(selectedId, to)) setSelection(null);
  }
  const result = game.result;
  return <>
    <div className="game-status" role="status" aria-live="polite" aria-atomic="true">
      {result.status === "finished" ? <p><strong>Phe {result.winner === "red" ? "Đỏ" : "Đen"} thắng!</strong>{" "}
        Phe {result.loser === "red" ? "Đỏ" : "Đen"} thua vì {result.reason === "checkmate" ? "bị chiếu bí" : "hết nước đi hợp lệ dù không bị chiếu"}.</p>
        : <p>Đến lượt: <strong>{game.sideToMove === "red" ? "Đỏ" : "Đen"}</strong></p>}
      {result.status === "playing" && result.inCheck && <p className="check-warning">Phe {game.sideToMove === "red" ? "Đỏ" : "Đen"} đang bị chiếu!</p>}
      <p>{selected ? `Đang chọn: ${labels[selected.type]} ${side === "red" ? "Đỏ" : "Đen"}, hàng ${selected.position.row}, cột ${selected.position.col}.` : "Chưa chọn quân"}</p>
    </div>
    <BoardView pieces={game.pieces} selectedPieceId={selectedId} lastMove={game.lastMove} disabled={!canPlay}
      onActivate={activate} onClearSelection={() => setSelection(null)} />
    <p className="board-help">Bản thử chưa hỗ trợ hòa thỏa thuận, lặp thế hoặc chiếu dai/đuổi dai.</p>
  </>;
}

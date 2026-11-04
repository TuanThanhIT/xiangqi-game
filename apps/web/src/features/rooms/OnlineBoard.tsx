import { useState } from "react";
import type { Piece } from "@xiangqi/rules";
import BoardView from "@/components/BoardView";
import type { OnlineGame } from "./game-contract";
import type { Seat } from "./room-contract";
import type { ReactNode } from "react";
import Notice from "./Notice";
import type { RoomThemeId } from "./room-theme";
import type { RoomSnapshot } from "./room-contract";
import MatchPlayer from "./MatchPlayer";
import BoardStage from "@/components/BoardStage";

interface Props { game: OnlineGame; side: Seat; themeId?: RoomThemeId | null; canPlay: boolean; canResign: boolean; selectionEpoch: number; players?: RoomSnapshot["players"]; authenticatedSide?: Seat | null; turnHighlightEnabled?: boolean; notices?: ReactNode; resultActions?: ReactNode; sendMove(pieceId: string, to: Piece["position"]): boolean; sendResign(): boolean }
const labels: Record<Piece["type"], string> = { rook: "Xe", horse: "Mã", elephant: "Tượng", advisor: "Sĩ", general: "Tướng", cannon: "Pháo", soldier: "Tốt" };
export default function OnlineBoard({ game, side, themeId, canPlay, canResign, selectionEpoch, sendMove, sendResign, resultActions, players, authenticatedSide, turnHighlightEnabled = false, notices }: Props) {
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
  return <section className="xq-game-shell xq-online-match xq-centered-match" data-ended={result.status !== "playing" || undefined} aria-label="Bàn chơi online">
    <div className="xq-match-main">
    <div className="game-status xq-sr-only" role="status" aria-live="polite" aria-atomic="true">
      <p className="xq-turn">{result.status !== "playing" ? "Trận đã kết thúc" : <>
        <strong>{game.sideToMove === side ? "Lượt của bạn" : "Lượt đối thủ"}</strong> · {game.sideToMove === "red" ? "Đỏ" : "Đen"}
      </>}</p>
      {result.status === "playing" && !canPlay && <p className="xq-game-muted xq-sr-only">Chưa thể đi quân. Theo dõi trạng thái lượt và kết nối.</p>}
      <p className="xq-sr-only">{selected ? `Đang chọn: ${labels[selected.type]} ${side === "red" ? "Đỏ" : "Đen"}, hàng ${selected.position.row}, cột ${selected.position.col}.` : "Chưa chọn quân"}</p>
    </div>
    <MatchPlayer active={turnHighlightEnabled && result.status === "playing" && game.sideToMove === "black"} seat="black" player={players?.black ?? null} own={authenticatedSide === "black"} turn={result.status === "playing" && game.sideToMove === "black" ? (side === "black" ? "Lượt của bạn" : "Lượt đối thủ") : null} />
    <BoardStage pieces={game.pieces}>
      <BoardView pieces={game.pieces} themeId={themeId} selectedPieceId={selectedId} lastMove={game.lastMove} disabled={!canPlay}
        onActivate={activate} onClearSelection={() => setSelection(null)} />
    </BoardStage>
    <MatchPlayer active={turnHighlightEnabled && result.status === "playing" && game.sideToMove === "red"} seat="red" player={players?.red ?? null} own={authenticatedSide === "red"} turn={result.status === "playing" && game.sideToMove === "red" ? (side === "red" ? "Lượt của bạn" : "Lượt đối thủ") : null} />
    <div className="xq-match-feedback">
    <div className="xq-feedback-body" role="region" aria-label="Thông báo và kết quả trận" tabIndex={0}>
    {result.status !== "playing" && <section className={`xq-panel xq-result ${result.status === "cancelled" ? "xq-result--neutral" : ""}`} aria-label="Kết quả trận online">
      <h2>{result.status === "cancelled" ? "Trận đã hủy" : result.winner === side ? "Bạn thắng" : "Bạn thua"}</h2>
      <Notice>
      {result.status === "cancelled" ? <p><strong>Trận đã hủy vì cả hai người chơi mất kết nối quá thời hạn</strong></p>
        : result.status === "finished" ? result.reason === "resignation"
        ? <p><strong>{result.winner === "red" ? "Đỏ" : "Đen"} thắng do đối thủ đầu hàng.</strong></p>
        : result.reason === "disconnect_timeout" ? <p><strong>{result.winner === "red" ? "Đỏ" : "Đen"} thắng do đối thủ mất kết nối quá thời hạn.</strong></p>
        : <p><strong>Phe {result.winner === "red" ? "Đỏ" : "Đen"} thắng!</strong>{" "}
          Phe {result.loser === "red" ? "Đỏ" : "Đen"} thua vì {result.reason === "checkmate" ? "bị chiếu bí" : "hết nước đi hợp lệ dù không bị chiếu"}.</p>
        : null}
      </Notice>
    </section>}
    <div className="xq-match-notices">
    {result.status === "playing" && result.inCheck && <Notice tone="warning">Phe {game.sideToMove === "red" ? "Đỏ" : "Đen"} đang bị chiếu!</Notice>}
    {notices}
    </div>
    </div>
    <div className="xq-result-actions-slot">{result.status !== "playing" && resultActions}<div className="board-actions"><button type="button" className="xq-action xq-action--danger" disabled={!canResign} onClick={() => {
      if (canResign && window.confirm("Bạn có chắc muốn đầu hàng? Bạn sẽ thua ván này.")) sendResign();
    }}>Đầu hàng</button></div></div>
    </div>
    <p className="board-help xq-sr-only">Bản thử chưa hỗ trợ hòa thỏa thuận, lặp thế hoặc chiếu dai/đuổi dai.</p>
    </div>
  </section>;
}

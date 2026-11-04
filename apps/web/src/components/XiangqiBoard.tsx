"use client";

import { useMemo, useRef, useState } from "react";
import { getGameStatus } from "@xiangqi/rules";
import type { Piece, PieceType } from "@xiangqi/rules";
import { activateIntersection, createLocalGame } from "@/features/board/local-game";
import type { LocalGame } from "@/features/board/local-game";

import BoardView from "./BoardView";
import type { BoardHandle } from "./BoardView";
import Notice from "@/features/rooms/Notice";
import BoardStage from "./BoardStage";
const labels: Record<PieceType, string> = {
  rook: "Xe", horse: "Mã", elephant: "Tượng", advisor: "Sĩ",
  general: "Tướng", cannon: "Pháo", soldier: "Tốt",
};
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
  const boardRef = useRef<BoardHandle>(null);

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
    boardRef.current?.resetFocus();
    button.focus();
  }

  return (
    <section className="xq-game-shell" aria-label="Bàn chơi cùng thiết bị">
    <div className="game-status" role="status" aria-live="polite" aria-atomic="true">
      <p className="xq-turn">{finished ? "Ván đã kết thúc" : <>Đến lượt: <strong>{sideLabel}</strong></>}</p>
      <p className="xq-sr-only">{selectedPiece
        ? `Đang chọn: ${labels[selectedPiece.type]} ${selectedPiece.side === "black" ? "Đen" : "Đỏ"}, hàng ${selectedPiece.position.row}, cột ${selectedPiece.position.col}.`
        : "Chưa chọn quân"}</p>
    </div>
    {gameStatus.status === "playing" && gameStatus.inCheck && <Notice tone="warning">Phe {sideLabel} đang bị chiếu!</Notice>}
    {message && <Notice tone="warning">{message}</Notice>}
    <BoardStage pieces={pieces} showCaptured={initialGame === undefined}>
      <BoardView pieces={pieces} selectedPieceId={selectedPieceId} lastMove={lastMove} disabled={finished} onActivate={activate} onClearSelection={clearSelection} handleRef={boardRef} />
    </BoardStage>
    {gameStatus.status === "finished" && <section className="xq-panel xq-result" aria-label="Kết quả ván local">
      <Notice><strong>Phe {gameStatus.winner === "red" ? "Đỏ" : "Đen"} thắng!</strong>{" "}
        Phe {gameStatus.loser === "red" ? "Đỏ" : "Đen"} thua vì{" "}
        {gameStatus.reason === "checkmate" ? "bị chiếu bí" : "hết nước đi hợp lệ dù không bị chiếu"}.
      </Notice>
    </section>}
    <div className="board-actions">
      <button type="button" className="xq-action xq-action--secondary" onClick={(event) => startNewGame(event.currentTarget)}>
        Ván mới
      </button>
    </div>
    <p className="board-help xq-sr-only">
      Bản thử chưa hỗ trợ hòa thỏa thuận, lặp thế hoặc chiếu dai/đuổi dai.
    </p>
    </section>
  );
}

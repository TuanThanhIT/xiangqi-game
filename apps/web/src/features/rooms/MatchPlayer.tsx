import { useId } from "react";
import type { RoomSnapshot, Seat } from "./room-contract";
const activeLabel = "ĐẾN LƯỢT".normalize("NFC");

export default function MatchPlayer({ seat, player, own, turn, active = false }: { seat: Seat; player: RoomSnapshot["players"]["red"] | null; own: boolean; turn: string | null; active?: boolean }) {
  const nameId = useId();
  return <div className={`xq-player-bar xq-player-bar--${seat}`} data-active-turn={active || undefined} aria-label={`Người chơi phe ${seat === "red" ? "Đỏ" : "Đen"}`}>
    <strong className="xq-player-side" aria-label={`Phe ${seat === "red" ? "Đỏ" : "Đen"}`}><span aria-hidden="true">{seat === "red" ? "帥" : "將"}</span></strong>
    <button type="button" className="xq-player-name" popoverTarget={nameId} aria-label={`Đọc biệt danh đầy đủ: ${player?.nickname ?? "Chưa đồng bộ"}${own ? ", Bạn" : ""}`}>{player?.nickname ?? "Chưa đồng bộ"}</button>
    {own && <span className="xq-player-own" aria-label="Người chơi hiện tại">BẠN</span>}
    <div popover="auto" id={nameId} className="xq-name-popover"><p>{player?.nickname ?? "Chưa đồng bộ"}{own && " · Bạn"}</p><button type="button" className="xq-action xq-action--secondary" popoverTarget={nameId} popoverTargetAction="hide">Đóng</button></div>
    <span className={`xq-player-presence${player?.connected ? " is-online" : ""}`}><span aria-hidden="true">●</span><span className="xq-presence-label">{player?.connected ? "Online" : "Offline"}</span></span>
    <span className="xq-player-turn" aria-hidden="true">{active ? activeLabel : turn}</span>
  </div>;
}

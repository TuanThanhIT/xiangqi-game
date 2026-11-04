import { useState } from "react";
import type { RoomIdentity, RoomSnapshot } from "./room-contract";
import Notice from "./Notice";
import styles from "./play-room.module.css";
import { ROOM_THEMES } from "./room-theme";

interface Props { roomCode: string; identity: RoomIdentity | null; snapshot: RoomSnapshot | null; phase: string; hasGame?: boolean }
export default function RoomLobby({ roomCode, identity, snapshot, phase, hasGame = false }: Props) {
  const [copyMessage, setCopyMessage] = useState("");
  async function copy() {
    try { await navigator.clipboard.writeText(roomCode); setCopyMessage("Đã sao chép mã phòng."); }
    catch { setCopyMessage("Không sao chép được. Bạn có thể chọn mã và sao chép thủ công."); }
  }
  return <section className={`xq-panel ${styles.lobbyPanel} ${hasGame ? styles.lobbyCompact : ""}`} aria-labelledby="lobby-title">
    <p className={styles.eyebrow}>HẸN BẠN NHẬP CUỘC</p>
    <h2 id="lobby-title" className={hasGame ? "xq-sr-only" : undefined}>{hasGame ? "Phòng chơi" : "Phòng chờ"}</h2>
    <div className={styles.codeArea}>
      <div><p className={styles.help}>Mã phòng</p><strong className={styles.roomCode}>{roomCode}</strong></div>
      <button type="button" className="xq-action xq-action--secondary" onClick={() => void copy()}>{hasGame && copyMessage === "Đã sao chép mã phòng." ? "Đã sao chép" : "Sao chép mã phòng"}</button>
    </div>
    <div className={styles.copyFeedback}><Notice>{copyMessage}</Notice></div>
    <div className={hasGame ? "xq-sr-only" : undefined}>
      <Notice><strong>Trạng thái kết nối:</strong> {phase}</Notice>
      <p className={styles.identity}>Phe của bạn: <strong>{identity ? (identity.seat === "red" ? "Đỏ" : "Đen") : "Chưa được server xác nhận"}</strong></p>
      {snapshot && <p className={styles.help}>Phong cách: {ROOM_THEMES[snapshot.themeId].name}</p>}
    </div>
    {snapshot ? <>
      <ul className={styles.seats} aria-label="Hai ghế trong phòng">
        {(["red", "black"] as const).map((seat) => {
          const player = snapshot.players[seat];
          return <li key={seat} className={`${styles.seat} ${seat === "red" ? styles.redSeat : styles.blackSeat}`}>
            <h3><span className={styles.seatMark} aria-hidden="true">{seat === "red" ? "Đ" : "ĐEN"}</span>Phe {seat === "red" ? "Đỏ" : "Đen"}</h3>
            {hasGame && player ? <>
              <button type="button" className={styles.nicknameButton} popoverTarget={`player-name-${roomCode}-${seat}`} aria-label={`Đọc đầy đủ biệt danh phe ${seat === "red" ? "Đỏ" : "Đen"}: ${player.nickname}`}>{player.nickname}</button>
              <div popover="auto" id={`player-name-${roomCode}-${seat}`} className={styles.namePopover}>
                <p>Biệt danh phe {seat === "red" ? "Đỏ" : "Đen"}</p><p>{player.nickname}</p>
                <button type="button" className="xq-action xq-action--secondary" popoverTarget={`player-name-${roomCode}-${seat}`} popoverTargetAction="hide">Đóng</button>
              </div>
            </> : <p className={styles.nickname}>{player ? player.nickname : "Chưa có người"}</p>}
            <p className={player?.connected ? styles.connected : styles.help}>
              {player ? (player.connected ? (hasGame ? "Online" : "Đã giữ ghế · online") : (hasGame ? "Offline · ghế đã giữ" : "Đã giữ ghế · đang offline")) : "Chưa có người giữ ghế"}
            </p>
          </li>;
        })}
      </ul>
      {!hasGame && <Notice live={false}>{snapshot.players.black ? "Phòng đã đủ hai người. Đang chờ đồng bộ trận." : "Đang chờ người thứ hai."}</Notice>}
      {!identity && <p className={styles.help}>Danh sách là thông tin nhận lần gần nhất, có thể đã thay đổi khi mất kết nối.</p>}
    </> : <Notice>Đang chờ trạng thái phòng từ server.</Notice>}
  </section>;
}

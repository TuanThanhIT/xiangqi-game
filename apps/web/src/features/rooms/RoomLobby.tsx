import { useState } from "react";
import type { RoomIdentity, RoomSnapshot } from "./room-contract";

interface Props { roomCode: string; identity: RoomIdentity | null; snapshot: RoomSnapshot | null; phase: string; hasGame?: boolean }
export default function RoomLobby({ roomCode, identity, snapshot, phase, hasGame = false }: Props) {
  const [copyMessage, setCopyMessage] = useState("");
  async function copy() {
    try { await navigator.clipboard.writeText(roomCode); setCopyMessage("Đã sao chép mã phòng."); }
    catch { setCopyMessage("Không sao chép được. Bạn có thể chọn mã và sao chép thủ công."); }
  }
  return <section aria-labelledby="lobby-title">
    <h2 id="lobby-title">{hasGame ? "Phòng chơi" : "Phòng chờ"}</h2>
    <p>Mã phòng: <strong className="room-code">{roomCode}</strong></p>
    <button type="button" onClick={() => void copy()}>Sao chép mã phòng</button>
    <p role="status">{copyMessage}</p>
    <p>Trạng thái kết nối: {phase}</p>
    <p>Phe của bạn: {identity ? (identity.seat === "red" ? "Đỏ" : "Đen") : "Chưa được server xác nhận"}</p>
    {snapshot ? <>
      <ul>{(["red", "black"] as const).map((seat) => {
        const player = snapshot.players[seat];
        return <li key={seat}><strong>{seat === "red" ? "Đỏ" : "Đen"}:</strong>{" "}
          {player ? `${player.nickname} — ${player.connected ? "online" : "offline"}` : "Chưa có người giữ ghế"}</li>;
      })}</ul>
      {!hasGame && <p>{snapshot.players.black ? "Phòng đã đủ hai người. Đang chờ đồng bộ trận." : "Đang chờ người thứ hai."}</p>}
      {!identity && <p className="hint">Danh sách là thông tin nhận lần gần nhất, có thể đã thay đổi khi mất kết nối.</p>}
    </> : <p>Đang chờ trạng thái phòng từ server.</p>}
  </section>;
}

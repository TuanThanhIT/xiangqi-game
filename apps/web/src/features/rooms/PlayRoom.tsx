"use client";

import RoomForm from "./RoomForm";
import RoomLobby from "./RoomLobby";
import { useRoomSession } from "./useRoomSession";
import styles from "./play-room.module.css";
import OnlineBoard from "./OnlineBoard";

export default function PlayRoom() {
  const room = useRoomSession();
  return <div className={styles.play}>
    {!room.ready && <p role="status">Đang kiểm tra phiên đã lưu…</p>}
    {room.warning && <p role="status">{room.warning}</p>}
    {room.error && <p role="alert">{room.error}</p>}
    {room.ready && (room.session
      ? <>
        <RoomLobby key={room.session.roomCode} roomCode={room.session.roomCode} identity={room.identity} snapshot={room.snapshot} phase={room.phase} hasGame={!!room.online.snapshot?.game} />
        {!room.online.synced && <p role="status">Đang đồng bộ trận… Bàn gần nhất chỉ dùng để xem.</p>}
        {room.online.message && <p role="status">{room.online.message}</p>}
        {room.online.recovery && <p>Hãy tải lại trang để nhận snapshot mới; không gửi lại yêu cầu tạo/vào phòng.{" "}
          <button type="button" onClick={() => window.location.reload()}>Tải lại trang</button></p>}
        {room.online.snapshot?.game && <>
          {room.identity && room.snapshot && !room.snapshot.players[room.identity.seat === "red" ? "black" : "red"]?.connected &&
            <p role="status">Đối thủ đang offline. Trận tạm dừng, không xử thua.</p>}
          <OnlineBoard game={room.online.snapshot.game} side={room.session.seat} canPlay={room.canPlay}
            selectionEpoch={room.selectionEpoch} sendMove={room.sendMove} />
        </>}
      </>
      : <RoomForm loading={room.loading} submit={room.submit} />)}
  </div>;
}

"use client";

import RoomForm from "./RoomForm";
import RoomLobby from "./RoomLobby";
import { useRoomSession } from "./useRoomSession";
import styles from "./play-room.module.css";

export default function PlayRoom() {
  const room = useRoomSession();
  return <div className={styles.play}>
    {!room.ready && <p role="status">Đang kiểm tra phiên đã lưu…</p>}
    {room.warning && <p role="status">{room.warning}</p>}
    {room.error && <p role="alert">{room.error}</p>}
    {room.ready && (room.session
      ? <RoomLobby key={room.session.roomCode} roomCode={room.session.roomCode} identity={room.identity} snapshot={room.snapshot} phase={room.phase} />
      : <RoomForm loading={room.loading} submit={room.submit} />)}
  </div>;
}

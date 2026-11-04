"use client";

import RoomForm from "./RoomForm";
import RoomLobby from "./RoomLobby";
import { useRoomSession } from "./useRoomSession";
import styles from "./play-room.module.css";
import OnlineBoard from "./OnlineBoard";
import OfflineDeadline from "./OfflineDeadline";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RoomFormMode } from "./RoomForm";
import Notice from "./Notice";
import { roomThemePageStyle } from "./room-theme";
import MatchRoomCode from "./MatchRoomCode";

export default function PlayRoom({ initialMode = "both" }: { initialMode?: RoomFormMode }) {
  const router = useRouter();
  const [mode, setMode] = useState<RoomFormMode>(initialMode);
  const room = useRoomSession();
  const themeId = room.session ? room.snapshot?.themeId : undefined;
  const hasGame = !!room.online.snapshot?.game;
  const lobby = room.session && <RoomLobby key={room.session.roomCode} roomCode={room.session.roomCode} identity={room.identity} snapshot={room.snapshot} phase={room.phase} hasGame={hasGame} />;
  return <main className={`xq-game-page${hasGame ? " xq-match-page" : ""}`} data-theme={themeId} style={roomThemePageStyle(themeId)}>
    <header className={hasGame ? "xq-room-sign" : undefined}><h1>{room.session ? "Xiangqi Game" : "Tạo / vào phòng cờ tướng"}</h1>{hasGame && room.session && <MatchRoomCode code={room.session.roomCode} />}</header>
    <div className={`${styles.play} ${styles.roomPage}`}>
    {!room.ready && <Notice>Đang kiểm tra phiên đã lưu…</Notice>}
    {!hasGame && room.warning && <Notice tone="warning">{room.warning}</Notice>}
    {!hasGame && room.error && <Notice tone="error" id="room-error">{room.error}</Notice>}
    {room.ready && (room.session
      ? <>
        {!hasGame && room.switchingRoom && <Notice>Đang xác thực và xử lý phiên cũ trước khi mở form tạo phòng mới…</Notice>}
        {!hasGame && <div className={styles.roomInfo}>{lobby}</div>}
        {!hasGame && <>
          {!room.online.synced && <Notice>Đang đồng bộ trận… Bàn gần nhất chỉ dùng để xem.</Notice>}
          {room.online.message && <Notice>{room.online.message}</Notice>}
          {room.online.recovery && <Notice tone="warning" live={false}>Hãy tải lại trang để nhận snapshot mới; không gửi lại yêu cầu tạo/vào phòng.{" "}<button type="button" className="xq-action xq-action--secondary" onClick={() => window.location.reload()}>Tải lại trang</button></Notice>}
        </>}
        {room.online.snapshot?.game && <>
          <OnlineBoard game={room.online.snapshot.game} side={room.session.seat} themeId={themeId ?? null} canPlay={room.canPlay && !!themeId} canResign={room.canResign && !!themeId}
            turnHighlightEnabled={!!room.identity && room.online.synced && !!room.online.snapshot?.playEnabled} players={room.snapshot?.players} authenticatedSide={room.identity?.seat ?? null} notices={<>
              {room.warning && <Notice tone="warning">{room.warning}</Notice>}
              {room.error && <Notice tone="error" id="room-error">{room.error}</Notice>}
              {room.switchingRoom && <Notice>Đang xác thực và xử lý phiên cũ trước khi mở form tạo phòng mới…</Notice>}
              {!room.online.synced && <Notice>Đang đồng bộ trận… Bàn gần nhất chỉ dùng để xem.</Notice>}
              {room.online.recovery && <Notice tone="warning" live={false}>Hãy tải lại trang để nhận snapshot mới; không gửi lại yêu cầu tạo/vào phòng.{" "}<button type="button" className="xq-action xq-action--secondary" onClick={() => window.location.reload()}>Tải lại trang</button></Notice>}
              <OfflineDeadline snapshot={room.online.snapshot} receivedAt={room.online.receivedAt ?? 0} side={room.session.seat} />
              {room.online.snapshot.game.result.status === "playing" && room.identity && room.snapshot && !room.snapshot.players[room.identity.seat === "red" ? "black" : "red"]?.connected && <Notice tone="warning" live={false}>Đối thủ offline · Tạm dừng đi quân.</Notice>}
              {room.online.message && <Notice>{room.online.message}</Notice>}
              {!themeId && <Notice>Đang chờ phong cách phòng từ server. Bàn hiện chỉ để xem.</Notice>}
            </>}
            selectionEpoch={room.selectionEpoch} sendMove={room.sendMove} sendResign={room.sendResign}
            resultActions={<div className={styles.resultActions} aria-label="Sau trận">
              <button type="button" className="xq-action xq-action--secondary" disabled={!room.canLeaveFinished} onClick={() => { if (room.exitFinishedRoom()) router.push("/"); }}>Về menu</button>
              <button type="button" className="xq-action xq-action--primary" disabled={!room.canLeaveFinished} onClick={() => { if (room.exitFinishedRoom()) setMode("create"); }}>Tạo phòng mới</button>
            </div>} />
        </>}
      </>
      : room.savedSession ? <section className={`xq-panel ${styles.resumePanel}`} aria-labelledby="resume-title">
        <p className={styles.eyebrow}>PHIÊN ĐÃ LƯU</p>
        <h2 id="resume-title">Tiếp tục phòng</h2>
        <dl className={styles.sessionDetails}>
          <div><dt>Mã phòng</dt><dd className={styles.roomCode}>{room.savedSession.roomCode}</dd></div>
          <div><dt>Biệt danh</dt><dd>{room.savedSession.nickname}</dd></div>
          <div><dt>Phe đã lưu</dt><dd>{room.savedSession.seat === "red" ? "Đỏ" : "Đen"}</dd></div>
        </dl>
        <p className={styles.help}>Chờ backend xác thực phe và đồng bộ trạng thái mới nhất sau khi bạn tiếp tục.</p>
        <div className={styles.sessionActions}>
          <button type="button" className="xq-action xq-action--primary" onClick={room.continueRoom}>Tiếp tục phòng</button>
          <button type="button" className="xq-action xq-action--secondary" onClick={() => { setMode("create"); room.newRoom(); }}>Tạo phòng mới</button>
        </div>
      </section> : <RoomForm mode={mode} loading={room.loading} submit={room.submit} errorId={room.error ? "room-error" : undefined} />)}
  </div></main>;
}

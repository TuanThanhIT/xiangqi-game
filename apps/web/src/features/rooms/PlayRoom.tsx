"use client";

import RoomForm from "./RoomForm";
import RoomLobby from "./RoomLobby";
import { useRoomSession } from "./useRoomSession";
import styles from "./play-room.module.css";
import OnlineBoard from "./OnlineBoard";
import OfflineDeadline from "./OfflineDeadline";
import { useEffect, useState } from "react";
import Link from "next/link";
import WaitingRoom from "./WaitingRoom";
import waiting from "./waiting-room.module.css";
import portal from "@/components/main-menu.module.css";
import entry from "../shared/entry-background.module.css";
import Toast from "../shared/Toast";
import { useRouter } from "next/navigation";
import type { RoomFormMode } from "./RoomForm";
import Notice from "./Notice";
import { roomThemePageStyle } from "./room-theme";
import MatchRoomCode from "./MatchRoomCode";

export default function PlayRoom({ initialMode = "both", accountNickname }: { initialMode?: RoomFormMode; accountNickname?:string }) {
  const router = useRouter();
  const [mode, setMode] = useState<RoomFormMode>(initialMode);
  const room = useRoomSession(!!accountNickname);
  useEffect(()=>{if(room.departed)router.replace(`/lobby?room=${room.departed}`);},[room.departed,router]);
  const themeId = room.session ? room.snapshot?.themeId : undefined;
  const hasGame = !!room.online.snapshot?.game;
  const lobby = room.session && <RoomLobby key={room.session.roomCode} roomCode={room.session.roomCode} identity={room.identity} snapshot={room.snapshot} phase={room.phase} hasGame={hasGame} />;
  if (!hasGame && (accountNickname || room.session?.casual || room.savedSession?.casual)) return <main className={`${portal.portal} ${entry.scene} ${waiting.page}`}>
    <header><h1>Xiangqi Game</h1>{!room.session&&<Link href="/lobby">Về sảnh</Link>}</header>
    <div className={styles.play}>
      {!room.ready?<p role="status">Đang khôi phục phiên phòng…</p>:room.session?<WaitingRoom code={room.session.roomCode} identity={room.identity} snapshot={room.snapshot} phase={room.phase} busy={room.waitingBusy} action={room.waitingAction}/>:room.savedSession?<section className={waiting.panel}><h2>Tiếp tục phòng</h2><p>Mã phòng: {room.savedSession.roomCode}</p><button className="xq-action xq-action--primary" onClick={room.continueRoom}>Tiếp tục phòng</button></section>:<RoomForm mode={mode} loading={room.loading} accountNickname={accountNickname} submit={room.submit} error={room.error}/>}
    </div>
    {(room.session||room.savedSession)&&<Toast message={room.error} onClose={room.clearError}/>}
  </main>;
  return <main className={`xq-game-page${hasGame ? " xq-match-page" : ""}`} data-theme={themeId} style={roomThemePageStyle(themeId)}>
    <header className={hasGame ? "xq-room-sign" : undefined}><h1>{room.session ? "Xiangqi Game" : "Tạo / vào phòng cờ tướng"}</h1>{hasGame && room.session && <MatchRoomCode code={room.session.roomCode} />}</header>
    <div className={`${styles.play} ${styles.roomPage}`}>
    {!room.ready && <Notice>Đang kiểm tra phiên đã lưu…</Notice>}
    {!hasGame && room.warning && <Notice tone="warning">{room.warning}</Notice>}
    {!hasGame && (room.session || room.savedSession) && room.error && <Notice tone="error" id="room-error">{room.error}</Notice>}
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
      </section> : <RoomForm mode={mode} loading={room.loading} submit={room.submit} error={room.error} errorId={room.error ? "room-error" : undefined} />)}
  </div></main>;
}

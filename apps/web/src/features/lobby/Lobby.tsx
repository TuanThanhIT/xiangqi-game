"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuthenticatedProfile } from "../auth/session/useAuthenticatedProfile";
import Toast from "../shared/Toast";
import AccountMenu from "./AccountMenu";
import ModeTabs from "./ModeTabs";
import entry from "../shared/entry-background.module.css";
import LobbyIcon from "./LobbyIcon";
import type { LobbyIconName } from "./LobbyIcon";
import { hasSavedRoom } from "./saved-room";
import { readRoomSession } from "../rooms/room-storage";
import portal from "@/components/main-menu.module.css";
import styles from "./lobby.module.css";

const utilities: { name: string; icon: LobbyIconName }[] = [
  { name: "Điểm danh", icon: "calendar" }, { name: "Nhiệm vụ", icon: "tasks" }, { name: "Cửa hàng", icon: "shop" },
  { name: "Kho", icon: "inventory" }, { name: "Lịch sử", icon: "history" },
];
export default function Lobby({roomNotice=""}:{roomNotice?:string}={}) {
  const { profile, checking, error, busy, check, signOut, clearError } = useAuthenticatedProfile();
  const [resume, setResume] = useState(false);
  const [resumeHref,setResumeHref]=useState("/play");
  const [notice,setNotice]=useState(roomNotice === "closed" ? "Phòng đã đóng hoặc phiên phòng không còn hiệu lực." : roomNotice === "left" ? "Bạn đã rời phòng chờ." : "");
  useEffect(() => {
    const read = () => {
      setResume(hasSavedRoom(() => window.localStorage, () => window.sessionStorage));
      try {const session=readRoomSession(window.localStorage).session??readRoomSession(window.sessionStorage).session;setResumeHref(session?.casual?"/play?casual=1":"/play");}catch{setResumeHref("/play");}
    };
    queueMicrotask(read); window.addEventListener("storage", read); window.addEventListener("focus", read);
    return () => { window.removeEventListener("storage", read); window.removeEventListener("focus", read); };
  }, []);
  return <div className={`${portal.portal} ${styles.shell} ${entry.scene}`} aria-busy={checking || busy}>
    <header className={`${portal.header} ${styles.header}`}>
      <Link href="/" className={`${portal.wordmark} ${styles.brand}`}><span className={portal.seal} aria-hidden="true">象棋</span>Xiangqi Game</Link>
      {!checking && profile && <AccountMenu profile={profile} busy={busy} signOut={signOut} />}
    </header>
    <main className={styles.main}>
      {checking && <div className={styles.sessionState} role="status" aria-label="Đang khôi phục phiên đăng nhập"><span className={styles.spinner} aria-hidden="true" /></div>}
      {!checking && !profile && <section className={styles.sessionState} aria-label="Khôi phục phiên"><button className={styles.secondary} onClick={() => void check()}>Thử lại</button><Link className={styles.local} href="/">Về cổng game</Link></section>}
      {!checking && profile && <>
        <h1 className={styles.title}>Sảnh chính</h1>
        <div className={styles.columns}>
          <section className={styles.gameCard} aria-label="Chế độ chơi">
            <ModeTabs />
            <div id="casual-panel" role="tabpanel" aria-labelledby="casual-tab">
            <div className={styles.hero}><Image src="/lobby/hero.png" alt="Bàn cờ tướng 3D dưới đèn lồng, quân đỏ và đen hai bên sông xanh ngọc" fill priority sizes="(max-width: 760px) 100vw, 65vw" /></div>
            <div className={styles.gameBar}>
              <div className={styles.gameText}><h2>Giải trí</h2><p>Hẹn bạn một ván, so tài từng nước.</p><Link className={styles.local} href="/local">Chơi cùng thiết bị</Link>{resume && <Link className={styles.local} href="/play?mode=create&casual=1">Tạo phòng</Link>}</div>
              <div className={styles.playActions}>
                <Link className={styles.primary} href={resume ? resumeHref : "/play?mode=create&casual=1"}>{resume ? "Tiếp tục trận" : "Tạo phòng"}</Link>
                <Link className={styles.secondary} href="/play?mode=join&casual=1">Vào bằng mã</Link>
              </div>
            </div>
            </div>
          </section>
          <aside className={styles.friends} aria-labelledby="friends-title"><LobbyIcon name="friends" /><h2 id="friends-title">Bạn bè</h2><span className={styles.comingBadge}>Sắp ra mắt</span></aside>
        </div>
        <section className={styles.utilities} aria-label="Tiện ích sắp ra mắt">
          <ul className={styles.utilityBar}>{utilities.map(item => <li key={item.name} aria-label={`${item.name}: Sắp ra mắt`}><LobbyIcon name={item.icon} /><span>{item.name}</span><span className="xq-sr-only"> — Sắp ra mắt</span></li>)}</ul>
        </section>
      </>}
    </main>
    <Toast message={error||notice} tone={error?"error":"info"} onClose={()=>{clearError();setNotice("");}} />
  </div>;
}

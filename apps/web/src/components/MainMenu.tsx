"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import PortalBoard from "./PortalBoard";
import styles from "./main-menu.module.css";
import entry from "@/features/shared/entry-background.module.css";

const games = [
  { id: "xiangqi", name: "Cờ tướng", description: "Đấu cùng bạn bè hoặc chơi trên cùng thiết bị." },
  { id: "chess", name: "Cờ vua", description: "Khám phá những nước đi chiến thuật trên bàn cờ 64 ô." },
  { id: "hidden", name: "Cờ úp", description: "Mỗi quân cờ úp là một bất ngờ. Khám phá thế cờ sau từng nước đi." },
] as const;

function GameIcon({ game }: { game: typeof games[number]["id"] }) {
  return <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5">
    {game === "xiangqi" ? <><circle cx="16" cy="16" r="12" /><text x="16" y="16" textAnchor="middle" dominantBaseline="central" fill="currentColor" stroke="none" fontSize="18" fontFamily="KaiTi, STKaiti, Microsoft JhengHei, Microsoft YaHei, SimSun, serif">將</text></>
      : game === "chess" ? <><path d="m5 11 4 13h14l4-13-7 6-4-9-4 9-7-6ZM9 28h14" /><circle cx="5" cy="9" r="2" /><circle cx="16" cy="6" r="2" /><circle cx="27" cy="9" r="2" /></>
      : <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="6" /><circle cx="21" cy="21" r="9" fill="var(--portal-wood)" /><circle cx="21" cy="21" r="6" /><circle cx="21" cy="21" r="3" /></>}
  </svg>;
}

export default function MainMenu() {
  const [selected, setSelected] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const game = games[selected];
  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    switch (event.key) {
      case "ArrowDown": case "ArrowRight": next = (index + 1) % games.length; break;
      case "ArrowUp": case "ArrowLeft": next = (index + games.length - 1) % games.length; break;
      case "Home": next = 0; break;
      case "End": next = games.length - 1; break;
      default: return;
    }
    event.preventDefault();
    setSelected(next);
    tabs.current[next]?.focus();
  }
  return <div className={`${styles.portal} ${entry.scene}`}>
    <header className={styles.header}>
      <span className={styles.wordmark}><span className={styles.seal} aria-hidden="true">象棋</span>Xiangqi Game</span>
      <Link className={styles.login} href="/login">Đăng nhập</Link>
    </header>
    <main className={`${styles.main} ${styles.gameMain}`}>
      <aside className={styles.selector}>
        <h1>Khai cuộc</h1>
        <div className={styles.headingRule} aria-hidden="true" />
        <div className={styles.tabs} role="tablist" aria-label="Chọn trò chơi" aria-orientation="vertical">
          {games.map((item, index) => <button key={item.id} type="button" role="tab"
            id={`tab-${item.id}`} aria-controls="game-panel" aria-selected={selected === index}
            tabIndex={selected === index ? 0 : -1}
            ref={(node) => { tabs.current[index] = node; }}
            onClick={() => setSelected(index)} onKeyDown={(event) => navigateTabs(event, index)}>
            <GameIcon game={item.id} /><span className={styles.tabName}>{item.name}</span>
            {index > 0 && <small>Sắp ra mắt</small>}
          </button>)}
        </div>
      </aside>
      <section className={styles.card} role="tabpanel" id="game-panel" aria-labelledby={`tab-${game.id}`} tabIndex={0}>
        <PortalBoard game={game.id} />
        <div className={`${styles.details} ${selected === 0 ? styles.xiangqiDetails : ""}`}>
          <div className={styles.summary}><h2>{game.name}</h2><p>{selected === 0 ? "Hẹn bạn một ván, so tài từng nước." : game.description}</p></div>
          <div className={styles.gameActions}>
            {selected === 0 ? <>
              <Link className={`xq-action xq-action--primary ${styles.enter}`} href="/lobby">Vào game</Link>
              <Link className={styles.local} href="/local">Chơi cùng thiết bị</Link>
            </> : <span className={styles.coming}>Sắp ra mắt</span>}
          </div>
        </div>
      </section>
    </main>
  </div>;
}

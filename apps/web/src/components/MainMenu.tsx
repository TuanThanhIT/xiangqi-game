"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadRoomSession } from "@/features/rooms/room-storage";
import type { RoomSession } from "@/features/rooms/room-contract";
import styles from "./main-menu.module.css";

function Lock() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>;
}

export default function MainMenu() {
  const [stored, setStored] = useState<RoomSession | null>(null);
  const [ready, setReady] = useState(false);
  const [warning, setWarning] = useState("");
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const result = loadRoomSession(() => window.localStorage, () => window.sessionStorage);
      setStored(result.session); setWarning(result.warning); setReady(true);
    });
    return () => { active = false; };
  }, []);
  return <main className={styles.menu}>
    <div className={styles.content}>
      <header className={styles.header}>
        <span className={styles.wordmark}>XQ <span>/ CỜ TƯỚNG</span></span>
        <span className={styles.version}>BẢN THỬ V1</span>
      </header>
      <div className={styles.hero}>
        <section className={styles.intro} aria-labelledby="menu-title">
          <p className={styles.eyebrow}>MỘT BÀN CỜ · HAI KỲ THỦ</p>
          <h1 id="menu-title">Xiangqi<span>Game</span></h1>
          <p className={styles.description}>Một nước đi, một thế cờ mới.<br />Gặp bạn qua mã phòng hoặc cùng ngồi bên bàn cờ.</p>
          <div className={styles.seal} aria-hidden="true">TƯỚNG</div>
          <p className={styles.note}>Cờ tướng truyền thống<br />Đang phát triển bản thử nghiệm</p>
        </section>
        <section className={`xq-panel ${styles.panel}`} aria-labelledby="choose-title">
          <p className={styles.eyebrow}>NHẬP CUỘC</p>
          <h2 id="choose-title">Chọn cách chơi</h2>
          {!ready && <p className={styles.status} role="status">Đang kiểm tra phiên đã lưu…</p>}
          {warning && <p className={styles.status} role="status">{warning}</p>}
          <nav aria-label="Chế độ chơi" className={styles.actions}>
            {stored && <Link className={`xq-action xq-action--secondary ${styles.resume}`} href="/play">
              <span>Tiếp tục phòng</span><small>{stored.roomCode} · {stored.nickname} · {stored.seat === "red" ? "Đỏ" : "Đen"}</small>
            </Link>}
            <Link className="xq-action xq-action--primary" href="/play?mode=create">Tạo phòng <span aria-hidden="true">↗</span></Link>
            <Link className="xq-action xq-action--secondary" href="/play?mode=join">Vào phòng <span aria-hidden="true">↗</span></Link>
            <Link className="xq-action xq-action--secondary" href="/local">Chơi cùng thiết bị <span aria-hidden="true">→</span></Link>
            <button type="button" disabled className={`xq-action xq-action--secondary ${styles.coming}`}><span><Lock /> Đánh với máy</span><small>Sắp ra mắt</small></button>
          </nav>
          {stored && <p className={styles.status}>Phiên được xác thực lại tại /play. Tạo phòng mới sẽ hỏi xác nhận xử lý ván cũ trước.</p>}
        </section>
      </div>
      <section className={styles.future} aria-labelledby="future-title">
        <div><p className={styles.eyebrow}>CHẶNG ĐƯỜNG PHÍA TRƯỚC</p><h2 id="future-title">Đang phát triển</h2></div>
        <ul>{["Tài khoản và hồ sơ", "Bảng xếp hạng", "Bộ sưu tập nhân vật", "Cửa hàng và phần thưởng"].map((label) =>
          <li key={label}><Lock /><span>{label}<small>Đã khóa · Sắp ra mắt</small></span></li>)}</ul>
      </section>
      <footer className={styles.footer}>Bản thử chưa hỗ trợ lặp thế, chiếu dai/đuổi dai. Phòng và trận online mất khi server khởi động lại.</footer>
    </div>
  </main>;
}

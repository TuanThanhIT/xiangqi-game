import { useState } from "react";
import styles from "./play-room.module.css";
import ThemePicker from "./ThemePicker";
import type { RoomThemeId } from "./room-theme";

export type RoomFormMode = "create" | "join" | "both";
interface Props { loading: boolean; mode?: RoomFormMode; errorId?: string; submit(nickname: string, code?: string, themeId?: RoomThemeId): Promise<void> }
export default function RoomForm({ loading, submit, mode = "both", errorId }: Props) {
  const [nickname, setNickname] = useState("");
  const [code, setCode] = useState("");
  const [themeId, setThemeId] = useState<RoomThemeId>("earth");
  return <section className={`xq-panel ${styles.formPanel}`} aria-labelledby="form-title" aria-busy={loading}>
    <p className={styles.eyebrow}>NHẬP CUỘC</p>
    <h2 id="form-title">{mode === "create" ? "Tạo phòng" : mode === "join" ? "Vào phòng" : "Tạo hoặc vào phòng"}</h2>
    <p className={styles.help}>Nhập biệt danh của bạn. Khi vào phòng, dùng mã được người tạo chia sẻ.</p>
    <div className={styles.field}>
      <label htmlFor="room-nickname">Biệt danh (1–30 ký tự)</label>
      <input id="room-nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} disabled={loading} autoComplete="nickname"
        aria-describedby={["nickname-help", errorId].filter(Boolean).join(" ")} />
      <p id="nickname-help" className={styles.help}>Khoảng trắng hai đầu sẽ được bỏ khi kiểm tra biệt danh.</p>
    </div>
    {mode !== "join" && <form className={styles.roomForm} onSubmit={(e) => { e.preventDefault(); void submit(nickname, undefined, themeId); }}>
      <ThemePicker value={themeId} disabled={loading} onChange={setThemeId} />
      <button type="submit" className={`xq-action xq-action--primary ${styles.submitButton}`} disabled={loading}>
        <span className={styles.buttonSizer} aria-hidden="true">Đang gửi yêu cầu…</span>
        <span className={styles.buttonLabel}>{loading ? "Đang gửi yêu cầu…" : "Tạo phòng"}</span>
      </button>
    </form>}
    {mode !== "create" && <form className={styles.roomForm} onSubmit={(e) => { e.preventDefault(); void submit(nickname, code.trim().toUpperCase()); }}>
      <div className={styles.field}>
        <label htmlFor="room-code">Mã phòng muốn vào</label>
        <input id="room-code" value={code} onChange={(e) => setCode(e.target.value)} disabled={loading} autoCapitalize="characters" spellCheck={false} autoComplete="off"
          aria-describedby={["code-help", errorId].filter(Boolean).join(" ")} />
        <p id="code-help" className={styles.help}>Mã gồm 6 ký tự chữ/số trên phòng chờ của người tạo.</p>
      </div>
      <button type="submit" className={`xq-action xq-action--primary ${styles.submitButton}`} disabled={loading}>
        <span className={styles.buttonSizer} aria-hidden="true">Đang gửi yêu cầu…</span>
        <span className={styles.buttonLabel}>{loading ? "Đang gửi yêu cầu…" : "Vào phòng"}</span>
      </button>
    </form>}
    <p className={styles.help}>Mỗi browser profile/origin giữ một phiên gần nhất. Yêu cầu tạo/vào phòng không tự gửi lại khi timeout.</p>
  </section>;
}

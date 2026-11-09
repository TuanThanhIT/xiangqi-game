import { useRef, useState } from "react";
import styles from "./play-room.module.css";
import Toast from "../shared/Toast";
import { isNickname, isCode } from "./room-contract";
import ThemePicker from "./ThemePicker";
import type { RoomThemeId } from "./room-theme";

export type RoomFormMode = "create" | "join" | "both";
interface Props { loading: boolean; mode?: RoomFormMode; errorId?: string; error?: string; accountNickname?:string; submit(nickname: string, code?: string, themeId?: RoomThemeId): Promise<void> }
export default function RoomForm({ loading, submit, mode = "both", error = "", accountNickname }: Props) {
  const [nickname, setNickname] = useState(accountNickname??"");
  const [code, setCode] = useState("");
  const [themeId, setThemeId] = useState<RoomThemeId>("earth");
  const [submitted, setSubmitted] = useState<"create" | "join" | null>(null);
  const [toastDismissed, setToastDismissed] = useState(false);
  const nicknameRef = useRef<HTMLInputElement>(null), codeRef = useRef<HTMLInputElement>(null);
  const nicknameError = submitted && !isNickname(nickname.trim()) ? "Biệt danh cần 1–30 ký tự." : "";
  const codeError = submitted === "join" && !isCode(code.trim().toUpperCase()) ? "Mã phòng cần 6 chữ in hoa/số." : "";
  function send(join: boolean) {
    setToastDismissed(false);
    setSubmitted(join ? "join" : "create");
    if (!isNickname(nickname.trim())) nicknameRef.current?.focus();
    else if (join && !isCode(code.trim().toUpperCase())) codeRef.current?.focus();
    if (join) void submit(nickname, code.trim().toUpperCase());
    else void submit(nickname, undefined, themeId);
  }
  return <section className={`xq-panel ${styles.formPanel}`} aria-labelledby="form-title" aria-busy={loading}>
    <p className={styles.eyebrow}>NHẬP CUỘC</p>
    <h2 id="form-title">{mode === "create" ? "Tạo phòng" : mode === "join" ? "Vào phòng" : "Tạo hoặc vào phòng"}</h2>
    <p className={styles.help}>Nhập biệt danh của bạn. Khi vào phòng, dùng mã được người tạo chia sẻ.</p>
    <div className={styles.field}>
      <label htmlFor="room-nickname">Biệt danh (1–30 ký tự)</label>
      <input ref={nicknameRef} aria-invalid={!!nicknameError} id="room-nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} disabled={loading} readOnly={!!accountNickname} autoComplete="nickname"
        aria-describedby={["nickname-help", nicknameError ? "room-nickname-error" : undefined].filter(Boolean).join(" ")} />
      {nicknameError && <span id="room-nickname-error" className={styles.fieldError}>{nicknameError}</span>}
      <p id="nickname-help" className={styles.help}>Khoảng trắng hai đầu sẽ được bỏ khi kiểm tra biệt danh.</p>
    </div>
    {mode !== "join" && <form className={styles.roomForm} onSubmit={(e) => { e.preventDefault(); send(false); }}>
      <ThemePicker value={themeId} disabled={loading} onChange={setThemeId} />
      <button type="submit" className={`xq-action xq-action--primary ${styles.submitButton}`} disabled={loading}>
        <span className={styles.buttonSizer} aria-hidden="true">Đang gửi yêu cầu…</span>
        <span className={styles.buttonLabel}>{loading ? "Đang gửi yêu cầu…" : "Tạo phòng"}</span>
      </button>
    </form>}
    {mode !== "create" && <form className={styles.roomForm} onSubmit={(e) => { e.preventDefault(); send(true); }}>
      <div className={styles.field}>
        <label htmlFor="room-code">Mã phòng muốn vào</label>
        <input ref={codeRef} aria-invalid={!!codeError} id="room-code" value={code} onChange={(e) => setCode(e.target.value)} disabled={loading} autoCapitalize="characters" spellCheck={false} autoComplete="off"
          aria-describedby={["code-help", codeError ? "room-code-error" : undefined].filter(Boolean).join(" ")} />
        {codeError && <span id="room-code-error" className={styles.fieldError}>{codeError}</span>}
        <p id="code-help" className={styles.help}>Mã gồm 6 ký tự chữ/số trên phòng chờ của người tạo.</p>
      </div>
      <button type="submit" className={`xq-action xq-action--primary ${styles.submitButton}`} disabled={loading}>
        <span className={styles.buttonSizer} aria-hidden="true">Đang gửi yêu cầu…</span>
        <span className={styles.buttonLabel}>{loading ? "Đang gửi yêu cầu…" : "Vào phòng"}</span>
      </button>
    </form>}
    <p className={styles.help}>Mỗi browser profile/origin giữ một phiên gần nhất. Yêu cầu tạo/vào phòng không tự gửi lại khi timeout.</p>
    <Toast message={!toastDismissed && !loading && !nicknameError && !codeError ? error : ""} onClose={() => setToastDismissed(true)} />
  </section>;
}

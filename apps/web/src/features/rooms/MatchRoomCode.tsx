import { useState } from "react";

export default function MatchRoomCode({ code }: { code: string }) {
  const [message, setMessage] = useState("");
  return <div className="xq-match-code"><span>Phòng <strong className="roomCode">{code}</strong></span>
    <button type="button" className="xq-action xq-action--secondary" aria-label="Sao chép mã phòng" onClick={async () => {
      try { await navigator.clipboard.writeText(code); setMessage("Đã sao chép"); }
      catch { setMessage("Không sao chép được; chọn mã để sao chép thủ công."); }
    }}><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 5V3H3v13h2"/></svg></button>
    <span className="xq-copy-feedback" aria-hidden="true">{message === "Đã sao chép" ? "Đã chép" : ""}</span>
    <span className="xq-sr-only" role="status">{message}</span>
    {message && message !== "Đã sao chép" && <span className="xq-copy-error" role="alert">{message}</span>}
  </div>;
}

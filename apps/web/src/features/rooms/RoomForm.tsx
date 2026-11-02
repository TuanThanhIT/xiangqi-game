import { useState } from "react";

interface Props { loading: boolean; submit(nickname: string, code?: string): Promise<void> }
export default function RoomForm({ loading, submit }: Props) {
  const [nickname, setNickname] = useState("");
  const [code, setCode] = useState("");
  return <div className="forms">
    <div className="field">
      <label htmlFor="room-nickname">Biệt danh (1–30 ký tự)</label>
      <input id="room-nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} disabled={loading} autoComplete="nickname" />
    </div>
    <form onSubmit={(e) => { e.preventDefault(); void submit(nickname); }}>
      <button type="submit" disabled={loading}>{loading ? "Đang gửi yêu cầu…" : "Tạo phòng"}</button>
    </form>
    <form onSubmit={(e) => { e.preventDefault(); void submit(nickname, code.trim().toUpperCase()); }}>
      <div className="field">
        <label htmlFor="room-code">Mã phòng muốn vào</label>
        <input id="room-code" value={code} onChange={(e) => setCode(e.target.value)} disabled={loading} autoCapitalize="characters" spellCheck={false} autoComplete="off" />
      </div>
      <button type="submit" disabled={loading}>{loading ? "Đang gửi yêu cầu…" : "Vào phòng"}</button>
    </form>
    <p className="hint">Mỗi tab chỉ giữ một phiên phòng. Yêu cầu tạo/vào phòng không tự gửi lại khi timeout.</p>
  </div>;
}

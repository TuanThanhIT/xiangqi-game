import { useEffect, useState } from "react";
import type { GameSnapshot } from "./game-contract";
import type { Seat } from "./room-contract";
import Notice from "./Notice";

export function remainingOfflineSeconds(deadline: number, serverNow: number, receivedAt: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - serverNow - Math.max(0, now - receivedAt)) / 1000));
}
interface Props { snapshot: GameSnapshot; receivedAt: number; side: Seat }
export default function OfflineDeadline({ snapshot, receivedAt, side }: Props) {
  const [now, setNow] = useState(receivedAt);
  useEffect(() => {
    if (snapshot.game?.result.status !== "playing" || (snapshot.deadlines.red === null && snapshot.deadlines.black === null)) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [snapshot.game?.result.status, snapshot.deadlines.red, snapshot.deadlines.black]);
  if (snapshot.game?.result.status !== "playing") return null;
  return <div className="xq-offline" aria-label="Thời hạn kết nối lại">{(["red", "black"] as const).map((seat) => {
    const deadline = snapshot.deadlines[seat];
    if (deadline === null) return null;
    const seconds = remainingOfflineSeconds(deadline, snapshot.serverNow, receivedAt, now);
    const label = `${seat === side ? "Phe của bạn" : "Đối thủ"} (${seat === "red" ? "Đỏ" : "Đen"})`;
    return <Notice key={seat} tone="warning" live={false}>
      <span className="xq-sr-only" role="status">{label}: {seconds > 0 ? "Đang chờ kết nối lại trong thời hạn server quy định." : "Đã hết thời gian; đang chờ server xác nhận kết quả."}</span>
      <p aria-live="off">{label}:{" "}
      {seconds > 0 ? `còn khoảng ${seconds} giây để kết nối lại.` : "đã hết thời gian; đang chờ server xác nhận kết quả."}</p>
    </Notice>;
  })}</div>;
}

import Link from "next/link";
import XiangqiBoard from "@/components/XiangqiBoard";
import { roomThemePageStyle } from "@/features/rooms/room-theme";

export default function LocalPage() {
  return <main className="xq-game-page xq-match-page xq-local-page" data-theme="earth" style={roomThemePageStyle("earth")}><div className="xq-local-content">
    <nav className="xq-local-nav" aria-label="Điều hướng chơi local"><Link className="xq-action xq-action--secondary" href="/">Về menu</Link></nav>
    <h1>Chơi cùng thiết bị</h1>
    <XiangqiBoard />
  </div></main>;
}

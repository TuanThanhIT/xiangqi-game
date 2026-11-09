import Image from "next/image";
import styles from "./main-menu.module.css";

type Game = "xiangqi" | "chess" | "hidden";
const illustrations: Record<Game, { src: string; alt: string }> = {
  xiangqi: { src: "/portal/xiangqi.png", alt: "Bàn cờ tướng gỗ mật ong với quân Đỏ và Đen nổi khối" },
  chess: { src: "/portal/chess.png", alt: "Bàn cờ vua gỗ với quân sáng và tối" },
  hidden: { src: "/portal/hidden-xiangqi.png", alt: "Bàn cờ úp gỗ với các quân úp mặt và một số quân đã mở" },
};

export default function PortalBoard({ game = "xiangqi" }: { game?: Game }) {
  const illustration = illustrations[game];
  return <div className={styles.art} style={{ backgroundImage: `linear-gradient(#42261755, #42261755), url("${illustration.src}")` }}>
    <Image className={styles.portalImage} src={illustration.src} alt={illustration.alt}
      width={game === "xiangqi" ? 1705 : 1706} height={922} sizes="(max-width: 700px) 100vw, 910px"
      priority={game === "xiangqi"} unoptimized />
  </div>;
}

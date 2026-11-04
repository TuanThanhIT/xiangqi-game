import type { ReactNode } from "react";
import styles from "./play-room.module.css";

interface Props { children: ReactNode; tone?: "info" | "warning" | "error"; id?: string; live?: boolean }

// Chỉ trình bày; không sở hữu timer, kết nối hoặc cơ chế retry.
export default function Notice({ children, tone = "info", id, live = true }: Props) {
  return <div id={id} className={`${styles.notice} ${styles[tone]}`}
    role={live ? (tone === "error" ? "alert" : "status") : undefined}>
    {children}
  </div>;
}

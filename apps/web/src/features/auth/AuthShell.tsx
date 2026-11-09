import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import portal from "@/components/main-menu.module.css";
import styles from "./auth.module.css";
import entry from "../shared/entry-background.module.css";
import loginArtwork from "../../../public/auth/login.png";
import registerArtwork from "../../../public/auth/register.png";
import otpArtwork from "../../../public/auth/otp.png";

const artwork = { login: loginArtwork, register: registerArtwork, otp: otpArtwork };

export default function AuthShell({ children, screen = "login" }: { children: ReactNode; screen?: "login" | "register" | "otp" }) {
  return <div className={`${portal.portal} ${styles.shell} ${entry.scene}`}>
    <header className={`${portal.header} ${styles.header}`}>
      <Link href="/" className={`${portal.wordmark} ${styles.brand}`}><span className={portal.seal} aria-hidden="true">象棋</span>Xiangqi Game</Link>
      <Link href="/" className={`${portal.local} ${styles.back}`}>Về cổng game</Link>
    </header>
    <main className={styles.main}><div className={styles.frame} data-auth-frame>
      <div className={styles.artwork} data-screen={screen}><Image src={artwork[screen]} alt="" fill priority sizes="(max-width: 760px) 100vw, 460px" /></div>
      {children}
    </div></main>
  </div>;
}

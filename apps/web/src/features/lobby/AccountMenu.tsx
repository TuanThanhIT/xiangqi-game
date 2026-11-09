"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { Profile } from "../auth/auth-contract";
import styles from "./lobby.module.css";

function Avatar({ profile }: { profile: Profile }) {
  const [failed, setFailed] = useState(false);
  return profile.avatar.assetPath && !failed
    ? <Image className={styles.avatarImage} src={profile.avatar.assetPath} width={44} height={44} alt={profile.avatar.name} unoptimized onError={() => setFailed(true)} />
    : <span className={styles.avatarFallback} role="img" aria-label="Avatar quân cờ mặc định">帥</span>;
}
export default function AccountMenu({ profile, busy, signOut }: { profile: Profile; busy: boolean; signOut(): Promise<void> }) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), logout = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    logout.current?.focus();
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  function keyboard(event: KeyboardEvent) {
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
    else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) { event.preventDefault(); setOpen(true); logout.current?.focus(); }
  }
  return <div ref={container} className={styles.account} onKeyDown={keyboard} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} type="button" className={styles.accountTrigger} aria-label={`Tài khoản ${profile.nickname}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? "account-menu" : undefined} onClick={() => setOpen(value => !value)}>
      <Avatar key={profile.avatar.assetPath} profile={profile} /><span className={styles.nickname}>{profile.nickname}</span>
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m4 7 6 6 6-6" /></svg>
    </button>
    {open && <div id="account-menu" role="menu" aria-label="Tài khoản" data-toast-avoid className={styles.accountMenu}>
      <p className={styles.fullNickname}>{profile.nickname}</p>
      <button ref={logout} type="button" role="menuitem" disabled={busy} onClick={() => void signOut()}>{busy ? "Đang đăng xuất…" : "Đăng xuất"}</button>
    </div>}
  </div>;
}

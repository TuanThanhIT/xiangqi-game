"use client";
import { useState } from "react";
import type { RefObject } from "react";
import styles from "./auth.module.css";

export default function PasswordField({ inputRef, disabled, error, autocomplete = "new-password" }: {
  inputRef: RefObject<HTMLInputElement | null>; disabled: boolean; error?: string; autocomplete?: "new-password" | "current-password";
}) {
  const [visible, setVisible] = useState(false);
  return <div className={styles.field}><label htmlFor="auth-password">Mật khẩu</label>
    <div className={styles.password}><input ref={inputRef} id="auth-password" name="password" type={visible ? "text" : "password"} autoComplete={autocomplete} placeholder="Nhập mật khẩu"
      disabled={disabled} aria-invalid={!!error} aria-describedby={error ? "password-error" : undefined} required />
      <button className={styles.eye} type="button" aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={visible} disabled={disabled} onClick={() => setVisible(!visible)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{visible && <path d="m3 3 18 18" />}</svg>
      </button>
    </div>{error && <span id="password-error" className={styles.error}>{error}</span>}
  </div>;
}

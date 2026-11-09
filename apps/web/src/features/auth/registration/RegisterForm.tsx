"use client";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthRequestError, registrationRequest } from "../auth-client";
import PasswordField from "../PasswordField";
import Toast from "../../shared/Toast";
import { authErrorMessage, rememberDeliveryFailure } from "../auth-feedback";
import styles from "../auth.module.css";

export default function RegisterForm() {
  const router = useRouter(), busy = useRef(false);
  const nickname = useRef<HTMLInputElement>(null), email = useRef<HTMLInputElement>(null), password = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [fields, setFields] = useState({ nickname: "", email: "", password: "" });
  const focusField = useRef<"nickname" | "email" | null>(null);
  useEffect(() => {
    if (!loading && focusField.current) {
      (focusField.current === "email" ? email : nickname).current?.focus();
      focusField.current = null;
    }
  }, [loading, fields]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy.current) return;
    const name = nickname.current!.value.trim().replace(/\s+/gu, " "), address = email.current!.value.trim(), secret = password.current!.value;
    const errors = { nickname: !name || Array.from(name).length > 30 ? "Biệt danh cần từ 1 đến 30 ký tự." : "",
      email: address.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ? "Nhập địa chỉ email hợp lệ." : "",
      password: !secret ? "Nhập mật khẩu của bạn." : new TextEncoder().encode(secret).length > 1024 ? "Mật khẩu quá dài." : "" };
    setFields(errors); setError("");
    if (errors.nickname || errors.email || errors.password) { (errors.nickname ? nickname : errors.email ? email : password).current?.focus(); return; }
    busy.current = true; setLoading(true);
    try {
      const state = await registrationRequest("register", { nickname: name, email: address, password: secret });
      if (state.delivery === "failed") rememberDeliveryFailure(state.accountId);
      if (password.current) password.current.value = "";
      router.replace(`/verify-email?account=${state.accountId}`);
    } catch (e) {
      if (e instanceof AuthRequestError && ["NICKNAME_IN_USE", "INVALID_NICKNAME", "EMAIL_IN_USE"].includes(e.code)) {
        const field = e.code === "EMAIL_IN_USE" ? "email" : "nickname";
        setFields(previous => ({ ...previous, [field]: authErrorMessage(e) }));
        focusField.current = field;
      } else setError(authErrorMessage(e));
    }
    finally { busy.current = false; setLoading(false); }
  }
  return <section className={styles.panel} aria-labelledby="register-title"><h1 id="register-title">Đăng ký</h1><div className={styles.rule} aria-hidden="true" />
    <form className={styles.form} onSubmit={submit} noValidate aria-busy={loading}>
      <div className={styles.field}><label htmlFor="register-nickname">Biệt danh</label>
        <input ref={nickname} id="register-nickname" name="nickname" autoComplete="nickname" placeholder="Nhập biệt danh" disabled={loading} required aria-invalid={!!fields.nickname} aria-describedby={fields.nickname ? "nickname-error" : undefined} />
        {fields.nickname && <span id="nickname-error" className={styles.error}>{fields.nickname}</span>}
      </div>
      <div className={styles.field}><label htmlFor="register-email">Email</label>
        <input ref={email} id="register-email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="Nhập email" disabled={loading} required aria-invalid={!!fields.email} aria-describedby={fields.email ? "email-error" : undefined} />
        {fields.email && <span id="email-error" className={styles.error}>{fields.email}</span>}
      </div>
      <PasswordField inputRef={password} disabled={loading} error={fields.password} />
      <button className={`xq-action xq-action--primary ${styles.submit}`} disabled={loading}>{loading ? "Đang tạo hồ sơ…" : "Tạo tài khoản"}</button>
    </form><p className={styles.foot}>Đã có tài khoản? <Link className={styles.register} href="/login">Đăng nhập</Link></p>
    <Toast message={error} onClose={() => setError("")} />
  </section>;
}

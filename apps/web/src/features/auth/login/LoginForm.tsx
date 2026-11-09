"use client";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthRequestError, login, registrationRequest } from "../auth-client";
import PasswordField from "../PasswordField";
import Toast from "../../shared/Toast";
import { authErrorMessage } from "../auth-feedback";
import styles from "../auth.module.css";

export default function LoginForm({ verified = false }: { verified?: boolean } = {}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showVerified, setShowVerified] = useState(verified);
  const [fields, setFields] = useState({ email: "", password: "" });
  const busy = useRef(false), email = useRef<HTMLInputElement>(null), password = useRef<HTMLInputElement>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    setShowVerified(false);
    const address = email.current!.value.trim(), secret = password.current!.value;
    const problems = { email: address.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ? "Nhập địa chỉ email hợp lệ." : "",
      password: !secret ? "Nhập mật khẩu của bạn." : new TextEncoder().encode(secret).length > 1024 ? "Mật khẩu quá dài." : "" };
    setFields(problems); setError("");
    if (problems.email || problems.password) { (problems.email ? email : password).current?.focus(); return; }
    busy.current = true; setLoading(true);
    try { await login(address, secret); if (password.current) password.current.value = ""; router.replace("/lobby"); }
    catch (caught) {
      let e = caught;
      if (e instanceof AuthRequestError && e.code === "EMAIL_NOT_VERIFIED") {
        try {
          const state = await registrationRequest("verification/start", { email: address, password: secret });
          if (password.current) password.current.value = "";
          router.replace(`/verify-email?account=${state.accountId}`);
          return;
        } catch (failure) { e = failure; }
      }
      setError(authErrorMessage(e));
    }
    finally { busy.current = false; setLoading(false); }
  }
  return <section className={styles.panel} aria-labelledby="login-title">
    <h1 id="login-title">Đăng nhập</h1><div className={styles.rule} aria-hidden="true" />
    <form className={styles.form} onSubmit={submit} noValidate aria-busy={loading}>
      <div className={styles.field}><label htmlFor="auth-email">Email</label>
        <input ref={email} id="auth-email" name="email" type="email" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} placeholder="Nhập email" disabled={loading} aria-invalid={!!fields.email} aria-describedby={fields.email ? "email-error" : undefined} required />
        {fields.email && <span id="email-error" className={styles.error}>{fields.email}</span>}
      </div>
      <PasswordField inputRef={password} disabled={loading} error={fields.password} autocomplete="current-password" />
      <button className={`xq-action xq-action--primary ${styles.submit}`} type="submit" disabled={loading}>{loading ? "Đang đăng nhập…" : "Đăng nhập"}</button>
    </form>
    <p className={styles.foot}>Chưa có tài khoản? <Link className={styles.register} href="/register">Đăng ký</Link></p>
    <Toast message={error || (showVerified ? "Xác minh email thành công. Bạn có thể đăng nhập ngay." : "")} tone={error ? "error" : "success"} onClose={() => { setError(""); setShowVerified(false); }} />
  </section>;
}

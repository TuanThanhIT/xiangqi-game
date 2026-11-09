"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthRequestError, registrationRequest, verifyEmail } from "../auth-client";
import type { VerificationState } from "../auth-contract";
import Toast from "../../shared/Toast";
import { authErrorMessage, hasDeliveryFailure, clearDeliveryFailure, deliveryFailureMessage } from "../auth-feedback";
import styles from "../auth.module.css";

export default function VerifyEmailForm({ accountId }: { accountId: string }) {
  const router = useRouter(), busy = useRef(false), input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<VerificationState | null>(null), [code, setCode] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [statusNotice, setStatusNotice] = useState("");
  const [error, setError] = useState(""), [loading, setLoading] = useState(false), [checking, setChecking] = useState(true);
  const [seconds, setSeconds] = useState(0), [terminal, setTerminal] = useState(false);
  useEffect(() => { if (fieldError && !loading) input.current?.focus(); }, [fieldError, loading]);
  const read = useCallback(async () => {
    setChecking(true); setError(""); setStatusNotice("");
    try {
      const next = await registrationRequest("verification/status", { accountId }); setState(next);
      if (next.delivery === "failed" || hasDeliveryFailure(accountId)) setError(deliveryFailureMessage);
      else if (!next.otpExpiresAt) setStatusNotice("Chưa có mã còn hiệu lực. Bạn có thể yêu cầu Gửi lại mã.");
    }
    catch (e) { setError(authErrorMessage(e)); if (e instanceof AuthRequestError && [410, 409].includes(e.status)) setTerminal(true); }
    finally { setChecking(false); }
  }, [accountId]);
  useEffect(() => { let active = true; queueMicrotask(() => { if (active) void read(); }); return () => { active = false; }; }, [read]);
  useEffect(() => {
    if (!state) return;
    const tick = () => setSeconds(Math.max(0, Math.ceil((Date.parse(state.resendAt) - Date.now()) / 1000)));
    const timer = setInterval(tick, 1000); tick(); return () => clearInterval(timer);
  }, [state]);
  async function resend() {
    if (busy.current) return; busy.current = true; setLoading(true); setError(""); setFieldError(""); setStatusNotice(""); clearDeliveryFailure();
    try {
      const next = await registrationRequest("verification/resend", { accountId }); setState(next);
      if (next.delivery === "failed") setError(deliveryFailureMessage);
      setCode(""); input.current?.focus();
    }
    catch (e) {
      setError(authErrorMessage(e));
      if (e instanceof AuthRequestError && [410, 409].includes(e.status)) setTerminal(true);
      if (e instanceof AuthRequestError && e.status === 429) {
        // Read updated cooldown after a competing tab; never retry the send request.
        try { setState(await registrationRequest("verification/status", { accountId })); } catch { /* retain the original send error */ }
      }
    }
    finally { busy.current = false; setLoading(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy.current) return;
    if (!/^\d{6}$/.test(code)) { setFieldError("Nhập mã xác minh gồm 6 chữ số."); setError(""); setStatusNotice(""); input.current?.focus(); return; }
    busy.current = true; setLoading(true); setError(""); setFieldError(""); setStatusNotice(""); clearDeliveryFailure();
    try { await verifyEmail(accountId, code); setCode(""); router.replace("/login?verified=1"); }
    catch (e) {
      if (e instanceof AuthRequestError && ["OTP_INVALID", "INVALID_OTP_INPUT"].includes(e.code)) {
        setFieldError(authErrorMessage(e));
      } else setError(authErrorMessage(e));
      if (e instanceof AuthRequestError && [410, 409].includes(e.status)) setTerminal(true);
    } finally { busy.current = false; setLoading(false); }
  }
  return <section className={styles.panel} aria-labelledby="verify-title"><h1 id="verify-title">Xác minh email</h1><div className={styles.rule} aria-hidden="true" />
    {checking && <div className={styles.loading} role="status" aria-label="Đang kiểm tra hồ sơ chờ"><span aria-hidden="true" /></div>}
    {!checking && state && !terminal && <>
      <p className={styles.otpIntro}>Nhập mã xác minh 6 chữ số gửi đến<br /><strong>{state.maskedEmail}</strong></p>
      <form className={styles.form} onSubmit={submit} aria-busy={loading} noValidate>
        <div className={styles.field}>
        <label className="xq-sr-only" htmlFor="email-otp">Mã xác minh</label>
        <div className={styles.otpControl}>
          <div className={styles.otpDigits} aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <span key={index}>{code[index] ?? ""}</span>)}</div>
          <input ref={input} id="email-otp" className={styles.otpInput} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required disabled={loading} aria-invalid={!!fieldError} aria-describedby={`${fieldError ? "otp-field-error " : ""}otp-help`} />
        </div>
        {fieldError && <span id="otp-field-error" className={`${styles.error} ${styles.otpFieldError}`}>{fieldError}</span>}
        <p id="otp-help" className={styles.help}>Mã có hạn 5 phút. Có thể dán cả 6 chữ số.</p>
        </div>
        <button className={`xq-action xq-action--primary ${styles.submit}`} disabled={loading}>{loading ? "Đang xử lý…" : "Xác minh"}</button>
      </form>
      <p className={styles.foot}>{seconds > 0 ? `Gửi lại mã sau ${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}` : <button type="button" className={styles.register} onClick={() => void resend()} disabled={loading}>Gửi lại mã</button>}</p>
    </>}
    <Toast message={error || statusNotice} tone={error ? "error" : "info"} onClose={() => { setError(""); setStatusNotice(""); clearDeliveryFailure(); }} />
    {!checking && !state && !terminal && <button className="xq-action xq-action--primary" onClick={() => void read()}>Thử lại</button>}
    <p className={styles.foot}><Link className={styles.register} href="/login">Về đăng nhập</Link>{terminal && <> · <Link className={styles.register} href="/register">Đăng ký lại</Link></>}</p>
  </section>;
}

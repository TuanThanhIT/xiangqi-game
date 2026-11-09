"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { accessExpiresAt, AuthRequestError, forgetAuth, loadProfile, logout } from "../auth-client";
import type { Profile } from "../auth-contract";
import { authErrorMessage } from "../auth-feedback";

export function useAuthenticatedProfile() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null), [checking, setChecking] = useState(true);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const alive = useRef(false), operation = useRef(0), signingOut = useRef(false);
  const check = useCallback(async () => {
    if (signingOut.current) return;
    const epoch = ++operation.current;
    setChecking(true); setError(""); setProfile(null);
    try { const user = await loadProfile(); if (alive.current && epoch === operation.current) setProfile(user); }
    catch (e) {
      if (!alive.current || epoch !== operation.current) return;
      if (e instanceof AuthRequestError && e.status === 401) { forgetAuth(); router.replace("/login"); }
      else setError(authErrorMessage(e));
    } finally { if (alive.current && epoch === operation.current) setChecking(false); }
  }, [router]);
  useEffect(() => {
    alive.current = true;
    const invalidate = () => { operation.current++; };
    queueMicrotask(() => { if (alive.current) void check(); });
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("xiangqi.auth") : null;
    if (channel) channel.onmessage = (event) => { if (event.data === "logout") { operation.current++; forgetAuth(); setProfile(null); router.replace("/login"); } };
    return () => { alive.current = false; invalidate(); channel?.close(); };
  }, [check, router]);
  useEffect(() => {
    if (!profile || busy || checking) return;
    const timer = setTimeout(() => void check(), Math.max(1000, accessExpiresAt() - Date.now() - 4000));
    return () => clearTimeout(timer);
  }, [profile, busy, checking, check]);
  async function signOut() {
    if (signingOut.current) return;
    signingOut.current = true; operation.current++; setBusy(true); setError("");
    try { await logout(); setProfile(null); router.replace("/login"); }
    catch (e) { setError(authErrorMessage(e)); }
    finally { signingOut.current = false; setBusy(false); }
  }
  return { profile, checking, error, busy, check, signOut, clearError: () => setError("") };
}

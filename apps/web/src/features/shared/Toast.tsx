"use client";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import styles from "./toast.module.css";

const subscribe = () => () => {};
export default function Toast({ message, onClose, tone = "error" }: { message: string; onClose(): void; tone?: "error" | "success" | "info" }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const toast = useRef<HTMLDivElement>(null), previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const remember = (event: FocusEvent) => {
      const node = event.target;
      if (node instanceof HTMLElement && node.matches("input, button, a, select, textarea") && !node.closest("[data-toast]")) previousFocus.current = node;
    };
    document.addEventListener("focusin", remember);
    return () => document.removeEventListener("focusin", remember);
  }, []);
  useEffect(() => {
    if (!message) return;
    const place = () => {
      const node = toast.current;
      if (!node) return;
      const viewport = window.visualViewport;
      const start = viewport?.offsetTop ?? 0, end = start + (viewport?.height ?? innerHeight);
      const headerBottom = document.querySelector("header")?.getBoundingClientRect().bottom ?? 72;
      const preferred = Math.max(start + 12, headerBottom + 12);
      node.style.top = `${preferred}px`;
      const menu = document.querySelector("[data-toast-avoid]");
      if (innerWidth > 480) {
        if (menu) {
          const menuBox = menu.getBoundingClientRect(), toastBox = node.getBoundingClientRect();
          if (toastBox.left < menuBox.right && toastBox.right > menuBox.left && toastBox.top < menuBox.bottom && toastBox.bottom > menuBox.top) node.style.top = `${menuBox.bottom + 12}px`;
        }
        return;
      }
      // Avoid the active field and main action even after scrolling or losing keyboard space.
      const active = document.activeElement instanceof HTMLElement && document.activeElement.matches("input, textarea") ? document.activeElement : null;
      const action = document.querySelector("form button:not([type='button'])");
      const controls = [active, action, menu].filter((value): value is Element => !!value).map(value => value.getBoundingClientRect());
      const height = node.getBoundingClientRect().height;
      const positions = [preferred, ...controls.map(rect => rect.bottom + 12), end - height - 12];
      const safe = positions.find(top => top >= start + 8 && top + height <= end - 8 && controls.every(rect => top + height + 8 <= rect.top || top >= rect.bottom + 8));
      if (safe !== undefined) node.style.top = `${safe}px`;
    };
    place();
    const observer = new MutationObserver(place);
    const header = document.querySelector("header");
    if (header) observer.observe(header, { childList: true, subtree: true });
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("focusin", place);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true);
      document.removeEventListener("focusin", place);
      window.visualViewport?.removeEventListener("resize", place); window.visualViewport?.removeEventListener("scroll", place);
    };
  }, [message, mounted]);
  if (!mounted || !message) return null;
  function dismiss() {
    onClose();
    requestAnimationFrame(() => { if (previousFocus.current?.isConnected) previousFocus.current.focus(); });
  }
  return createPortal(<div ref={toast} data-toast data-tone={tone} data-error-toast={tone === "error" ? "" : undefined} className={styles.toast}>
    <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" />{tone === "success" ? <path d="m7 12 3 3 7-7" /> : <path d="M12 7v6m0 3v1" />}</svg>
    <div role={tone === "error" ? "alert" : "status"} aria-atomic="true" className={styles.message}>{message}</div>
    <button type="button" aria-label={tone === "error" ? "Đóng thông báo lỗi" : "Đóng thông báo"} onClick={dismiss} className={styles.close}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg>
    </button>
  </div>, document.body);
}

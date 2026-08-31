import { useEffect, useRef } from "react";

/**
 * The app is creme; the book is white. Setting it on <html> means overscroll
 * and the iOS status bar match the surface, not just the content box.
 */
export function useSurface(surface: "paper" | "page"): void {
  useEffect(() => {
    const root = document.documentElement;
    if (surface === "page") root.setAttribute("data-surface", "page");
    else root.removeAttribute("data-surface");
    return () => root.removeAttribute("data-surface");
  }, [surface]);
}

/**
 * Without this the screen sleeps during a thirty-minute session, which breaks
 * the screen track entirely. Re-acquired on visibilitychange because the lock
 * is dropped whenever the document is hidden. Fails silently where unsupported.
 */
export function useWakeLock(active: boolean): void {
  const ref = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const acquire = async () => {
      if (!("wakeLock" in navigator)) return;
      try {
        const s = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void s.release();
          return;
        }
        ref.current = s;
      } catch {
        /* denied, low battery, or unsupported — reading still works */
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible" && !ref.current) void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      const s = ref.current;
      ref.current = null;
      if (s) void s.release().catch(() => undefined);
    };
  }, [active]);
}

/** Runs `fn` every `ms` while the document is visible. Used for session heartbeats. */
export function useHeartbeat(active: boolean, ms: number, fn: () => void): void {
  const saved = useRef(fn);
  saved.current = fn;

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") saved.current();
    }, ms);
    return () => window.clearInterval(id);
  }, [active, ms]);
}

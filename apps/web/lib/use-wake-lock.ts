"use client";

import { useEffect } from "react";

/**
 * Keeps the screen on while `enabled` (D55): the TV shouldn't dim mid-round,
 * and a phone that locks drops out of the game. Uses the Screen Wake Lock
 * API, which needs HTTPS (or localhost). The browser releases the lock when
 * the tab is hidden, so it's taken again when the tab comes back, and on the
 * next tap if the first try was refused.
 */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined") return;
    const api = navigator.wakeLock;
    if (!api) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const take = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      if (lock && !lock.released) return;
      try {
        lock = await api.request("screen");
        if (stopped) await lock.release();
      } catch {
        // Refused (battery saver, no permission): try again on the next tap.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void take();
    };
    void take();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pointerdown", onVisible, { passive: true });
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pointerdown", onVisible);
      void lock?.release().catch(() => {});
    };
  }, [enabled]);
}

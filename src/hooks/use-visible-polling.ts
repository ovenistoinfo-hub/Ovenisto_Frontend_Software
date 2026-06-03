import { useEffect, useRef } from "react";

/**
 * Runs `callback` on an interval ONLY while the browser tab is visible.
 *
 * Why: an always-running setInterval that hits the API keeps the Neon Postgres
 * compute awake 24/7 (it never scales to zero), which burns compute-hours even
 * when a tablet is just left open in the background. Gating on the Page Visibility
 * API means a backgrounded / overnight tab stops polling, letting the DB idle.
 *
 * Behaviour:
 *  - Fires `callback` immediately on mount (if visible) for a fresh first paint.
 *  - While visible: re-runs every `intervalMs`.
 *  - When the tab is hidden: the interval is cleared (no requests).
 *  - When the tab becomes visible again: fires once immediately, then resumes.
 *
 * Pass `enabled = false` to pause entirely (e.g. a manual Live/Paused toggle).
 */
export function useVisiblePolling(
  callback: () => void,
  intervalMs: number,
  enabled: boolean = true
): void {
  // Keep the latest callback without restarting the interval on every render.
  const savedCallback = useRef(callback);
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setInterval> | undefined;

    const run = () => savedCallback.current();

    const start = () => {
      if (timer) return;
      run(); // immediate refresh on (re)start
      timer = setInterval(run, intervalMs);
    };

    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };

    // Start only if currently visible.
    if (document.visibilityState === "visible") start();

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stop();
    };
  }, [intervalMs, enabled]);
}

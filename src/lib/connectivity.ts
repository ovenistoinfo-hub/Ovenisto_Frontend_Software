/**
 * Connectivity detection for the offline order queue (POS/WaiterPanel).
 *
 * `navigator.onLine` alone is unreliable — a browser can report `true` while the actual backend
 * is unreachable (captive portal, VPN drop, backend down but WiFi up). So a browser `online`
 * event is treated only as a HINT to re-probe, never trusted directly; a browser `offline` event
 * IS trusted immediately, since a real negative from the OS network stack is reliable.
 *
 * Plain module-level store (same shape as outletStore.ts), not React state, so order.service.ts
 * can read the current state synchronously outside the component tree.
 */
import { useEffect, useState } from "react";
import { getSocket } from "@/lib/socket";

// /health is mounted at the server root (before app.use('/api', routes)), not under /api — same
// stripping socket.ts already does for the same reason.
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
const HEALTH_URL = `${API_BASE.replace(/\/api\/?$/, "")}/health`;

let online = typeof navigator !== "undefined" ? navigator.onLine : true;
let inflightProbe: Promise<boolean> | null = null;
const listeners = new Set<(online: boolean) => void>();

function setOnline(next: boolean): void {
  if (next === online) return;
  online = next;
  listeners.forEach((cb) => cb(online));
}

/** Last-known-good state — cheap, synchronous, no network call. */
export function isOnline(): boolean {
  return online;
}

/** Subscribe to online/offline transitions. Returns an unsubscribe function. */
export function onConnectivityChange(cb: (online: boolean) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Actively confirms reachability by hitting the public, DB-free /health endpoint. Deduplicated —
 * a probe already in flight is reused rather than firing a second one. Only a real 2xx flips
 * state to online; a timeout, a thrown error, or a non-2xx flips (or keeps) it offline.
 */
export function probe(): Promise<boolean> {
  if (inflightProbe) return inflightProbe;
  inflightProbe = (async () => {
    try {
      const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(5000) });
      const ok = res.ok;
      setOnline(ok);
      return ok;
    } catch {
      setOnline(false);
      return false;
    } finally {
      inflightProbe = null;
    }
  })();
  return inflightProbe;
}

let initialized = false;

/** Wires the browser online/offline events and the socket reconnect signal. Idempotent — safe to
 *  call from multiple mount points, only sets up listeners once. */
export function initConnectivityWatcher(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  window.addEventListener("offline", () => setOnline(false));
  window.addEventListener("online", () => {
    void probe();
  });

  // The Manager's "reconnect" (not the socket's "connect", which also fires on the FIRST
  // connection) — a genuine successful reconnect is strong evidence of reachability. Mirrors
  // use-module-events.ts's identical reasoning for the same event.
  getSocket().io.on("reconnect", () => setOnline(true));
}

/** Reactive version of isOnline() for UI that needs to re-render on a connectivity change (the
 *  offline indicator, the Promo/Min-Spend "unavailable offline" note). */
export function useIsOnline(): boolean {
  const [state, setState] = useState(isOnline());
  useEffect(() => onConnectivityChange(setState), []);
  return state;
}

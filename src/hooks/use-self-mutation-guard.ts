import { useRef, useCallback } from "react";

/**
 * Suppresses a socket-driven "someone else changed this" toast for a short window
 * right after this client made its own write. Without this, a local action (which
 * already shows its own specific success toast) would double up with a second,
 * generic toast a moment later when the backend's socket push echoes that same
 * change back to the client that made it.
 */
export function useSelfMutationGuard(windowMs: number = 4000) {
  const lastLocalWriteAt = useRef(0);

  const markMine = useCallback(() => {
    lastLocalWriteAt.current = Date.now();
  }, []);

  const isLikelyOwnEcho = useCallback(() => {
    return Date.now() - lastLocalWriteAt.current < windowMs;
  }, [windowMs]);

  return { markMine, isLikelyOwnEcho };
}

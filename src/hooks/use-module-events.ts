import { useEffect, useRef } from "react";
import { getSocket } from "@/lib/socket";
import { api } from "@/services/api";

/**
 * Helper to clear API cache for endpoints related to received socket events.
 * This guarantees that when a push event is received, subsequent GET requests
 * bypass any cached responses and retrieve fresh data.
 */
function invalidateCacheForEvents(eventsList: string[]): void {
  eventsList.forEach((evt) => {
    if (evt.startsWith("order:")) {
      api.clearCache("/orders");
    } else if (evt.startsWith("table:")) {
      api.clearCache("/tables");
    } else if (evt.startsWith("cancellationRequest:")) {
      api.clearCache("/cancellation-requests");
      api.clearCache("/orders");
    } else if (evt.startsWith("challan:")) {
      api.clearCache("/challans");
    } else if (evt.startsWith("demand:")) {
      api.clearCache("/demands");
    } else if (evt.startsWith("purchaseRequest:")) {
      api.clearCache("/purchase-requests");
    } else if (evt.startsWith("purchase:")) {
      api.clearCache("/purchases");
    }
  });
}

/**
 * Subscribes to a set of backend push events and invokes `onChange` when any of
 * them fires. The backend only sends these to sockets in the acting outlet's room,
 * so simply refetching on receipt is already outlet-correct.
 *
 * ALSO refetches on reconnect. Socket.IO has no message replay: any event emitted
 * while this client was disconnected (network blip, laptop sleep, proxy dropping an
 * idle websocket) is gone for good, and reconnecting does not redeliver it. Without
 * this the page would sit stale until the safety poll or an F5. We listen on the
 * MANAGER's "reconnect" (not the socket's "connect") because "reconnect" fires only
 * on a successful RE-connection — "connect" also fires on the first one, which would
 * double-fetch against a page's own mount-time load.
 *
 * The callback is ref-stored so a re-render (a new inline closure) doesn't tear
 * down and re-add every listener.
 *
 * Still pair with a long, visibility-gated safety poll: this covers a socket that
 * drops and returns, but not one that never connects at all (the client is
 * websocket-only with no HTTP fallback, and a failed auth handshake is silent).
 */
export function useModuleEvents(
  events: readonly string[],
  onChange: (payload?: unknown) => void
): void {
  const saved = useRef(onChange);
  useEffect(() => {
    saved.current = onChange;
  }, [onChange]);

  // Join on the event names so a caller passing a new array literal each render
  // doesn't resubscribe, but a genuinely different event list does.
  const key = events.join(",");

  useEffect(() => {
    const socket = getSocket();
    const list = key ? key.split(",") : [];

    const handler = (payload?: unknown) => {
      invalidateCacheForEvents(list);
      saved.current(payload);
    };

    list.forEach((evt) => socket.on(evt, handler));

    // Catch up on whatever was missed while we were disconnected.
    const onReconnect = () => {
      invalidateCacheForEvents(list);
      saved.current();
    };
    socket.io.on("reconnect", onReconnect);

    return () => {
      list.forEach((evt) => socket.off(evt, handler));
      socket.io.off("reconnect", onReconnect);
    };
  }, [key]);
}

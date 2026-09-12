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
    if (evt === "order:created") {
      // A self-order can silently create a brand-new Customer row (the public
      // self-order flow bypasses the authenticated api.ts client entirely, so
      // MUTATION_DEPENDENCIES never sees it) — staff clients only learn about
      // it via this push event, so the customers cache must invalidate here too.
      api.clearCache("/orders");
      api.clearCache("/customers");
      api.clearCache("/reports");
    } else if (evt.startsWith("order:")) {
      // Every Dashboard sales/report section (Sales By Channel, Category, Payment
      // Method, Top Items, Net Profit, Deals Performance, Sales by Staff) reads
      // through /reports/*. Without this, react-query's invalidateQueries still
      // re-calls reportService.getX() on an order event, but api.ts's own 30s GET
      // cache serves the stale cached response instead of a real network request —
      // the section only updates once that cache naturally expires or the page is
      // hard-refreshed (which resets this in-memory cache). Order status changes
      // (e.g. Order Monitor's Complete Order) only emit "order:updated", not
      // "order:created", so this must be cleared in this branch too, not just above.
      api.clearCache("/orders");
      api.clearCache("/reports");
      api.clearCache("/delivery/dashboard");
      api.clearCache("/delivery/my-assignments");
    } else if (evt.startsWith("table:")) {
      api.clearCache("/tables");
    } else if (evt.startsWith("cancellationRequest:")) {
      // Same /reports gap as the order: branch above — the Dashboard's Cancellation Requests
      // section reads /reports/cancellation-requests, which a filed/approved/rejected request
      // changes without necessarily also emitting an order: event this same tick.
      api.clearCache("/cancellation-requests");
      api.clearCache("/orders");
      api.clearCache("/reports");
    } else if (evt.startsWith("challan:")) {
      api.clearCache("/challans");
    } else if (evt.startsWith("demand:")) {
      api.clearCache("/demands");
    } else if (evt.startsWith("purchaseRequest:")) {
      api.clearCache("/purchase-requests");
    } else if (evt.startsWith("purchase:")) {
      // Same /reports gap as the order:/cancellationRequest: branches above — the Dashboard's
      // Purchases & Supplier Spend section reads /reports/purchases-by-supplier.
      api.clearCache("/purchases");
      api.clearCache("/reports");
    } else if (evt.startsWith("reservation:")) {
      api.clearCache("/reservations");
    } else if (evt.startsWith("delivery:")) {
      api.clearCache("/delivery/dashboard");
      api.clearCache("/delivery/my-assignments");
      api.clearCache("/delivery/my-stats");
      api.clearCache("/orders");
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

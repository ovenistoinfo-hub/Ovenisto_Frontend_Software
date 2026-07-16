import { useModuleEvents } from "./use-module-events";

const ORDER_EVENTS = ["order:created", "order:updated", "order:deleted"] as const;

/**
 * Subscribes to backend order push events and invokes `onChange` when any order
 * is created/updated/deleted. This lets order screens (KDS, POS, status boards)
 * refresh on actual changes instead of polling the DB on a fixed timer — the
 * primary lever for letting the Neon compute scale to zero when idle.
 *
 * Pair this with a long, visibility-gated safety poll (useVisiblePolling at e.g.
 * 60s) so the UI still self-heals if a socket message is ever missed.
 */
export function useOrderEvents(onChange: () => void): void {
  useModuleEvents(ORDER_EVENTS, onChange);
}

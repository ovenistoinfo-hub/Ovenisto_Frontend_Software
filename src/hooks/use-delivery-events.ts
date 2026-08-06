import { useModuleEvents } from "./use-module-events";

const DELIVERY_EVENTS = [
  "delivery:assigned",
  "delivery:status_updated",
  "delivery:collected",
] as const;

/**
 * Subscribes to backend delivery push events and invokes `onChange` when any
 * delivery-related event fires (rider assigned, status updated, cash collected).
 *
 * The delivery endpoint caches are invalidated inside `useModuleEvents` via the
 * `delivery:` prefix handler added to `invalidateCacheForEvents`. Pair this with
 * a long visibility-gated safety poll (useVisiblePolling at e.g. 120s) so the UI
 * self-heals if a socket message is ever missed.
 */
export function useDeliveryEvents(onChange: () => void): void {
  useModuleEvents(DELIVERY_EVENTS, onChange);
}

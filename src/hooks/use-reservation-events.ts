import { useModuleEvents } from "./use-module-events";

const RESERVATION_EVENTS = ["reservation:created", "reservation:updated", "reservation:deleted"] as const;

/**
 * Subscribes to backend reservation socket events and triggers the callback.
 */
export function useReservationEvents(onChange: () => void): void {
  useModuleEvents(RESERVATION_EVENTS, onChange);
}

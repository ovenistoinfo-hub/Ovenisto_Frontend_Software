import { useModuleEvents } from "./use-module-events";

const TABLE_EVENTS = ["table:created", "table:updated", "table:deleted"] as const;

/**
 * Subscribes to backend table socket events and triggers the callback.
 */
export function useTableEvents(onChange: () => void): void {
  useModuleEvents(TABLE_EVENTS, onChange);
}

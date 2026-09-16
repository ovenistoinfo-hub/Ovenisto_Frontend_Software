/**
 * IndexedDB (via Dexie) storage for orders placed while offline on POS/WaiterPanel. See
 * order.service.ts's createOrder for how a row gets here, and offlineOrderSync.ts for how it
 * gets flushed to the real backend once connectivity returns.
 */
import Dexie, { type Table } from "dexie";
import type { CreateOrderInput } from "@/services/order.service";

/** Online-only side effects POS.tsx/WaiterPanel.tsx normally fire right after a successful
 *  create, keyed off the real order id — deferred here (instead of firing against a fake id)
 *  and replayed by the sync engine once the order actually exists server-side. */
export interface PendingOrderPostSync {
  occupyTable?: { tableId: string; guests: number };
  endSelfOrderSessionForTableId?: string;
  completeReservationId?: string;
  assignRider?: { riderId: string; estimatedTime: number };
}

export type PendingOrderStatus = "pending" | "syncing" | "failed";

export interface PendingOrder {
  /** Primary key — also doubles as the payload's clientRequestId. */
  localId: string;
  /** "OFFLINE-xxxx" — generated once, stable across every retry. This is what prints and is
   *  shown in the UI; it never changes even after several failed sync attempts. */
  provisionalOrderNumber: string;
  status: PendingOrderStatus;
  createdAt: number;
  updatedAt: number;
  lastAttemptAt: number | null;
  attemptCount: number;
  lastError: string | null;
  sourceScreen: "pos" | "waiter";
  /** Display-only snapshot of the outlet active at queue time. */
  outletId: string | null;
  payload: CreateOrderInput;
  postSync?: PendingOrderPostSync;
}

class OvenistoOfflineDB extends Dexie {
  pendingOrders!: Table<PendingOrder, string>;

  constructor() {
    super("OvenistoOfflineOrders");
    this.version(1).stores({
      // Primary key first, then only the fields actually queried/sorted by.
      pendingOrders: "localId, status, createdAt, sourceScreen",
    });
  }
}

export const offlineDb = new OvenistoOfflineDB();

function makeProvisionalOrderNumber(localId: string): string {
  return `OFFLINE-${localId.slice(0, 4)}`;
}

/** Writes a new queued order. Throws if IndexedDB itself is unavailable/full — callers must not
 *  swallow that silently, since there would then be no record of the order at all. */
export async function addPendingOrder(
  payload: Omit<CreateOrderInput, "clientRequestId">,
  meta: { sourceScreen: "pos" | "waiter"; outletId: string | null; postSync?: PendingOrderPostSync }
): Promise<PendingOrder> {
  const localId = crypto.randomUUID();
  const now = Date.now();
  const row: PendingOrder = {
    localId,
    provisionalOrderNumber: makeProvisionalOrderNumber(localId),
    status: "pending",
    createdAt: now,
    updatedAt: now,
    lastAttemptAt: null,
    attemptCount: 0,
    lastError: null,
    sourceScreen: meta.sourceScreen,
    outletId: meta.outletId,
    payload: { ...payload, clientRequestId: localId },
    postSync: meta.postSync,
  };
  await offlineDb.pendingOrders.add(row);
  return row;
}

/**
 * Flushes the offline order queue (offlineOrdersDb.ts) to the real backend once connectivity is
 * available. Pure logic, no React — src/components/offline/OfflineSyncManager.tsx wires the
 * actual triggers (browser online, socket reconnect, a visible-only safety poll, mount).
 */
import { offlineDb, type PendingOrder } from "@/lib/db/offlineOrdersDb";
import { postOrderDirect, type OrderRecord } from "@/services/order.service";
import { ApiError, getAccessToken } from "@/services/api";
import { reservationService } from "@/services/reservation.service";
import { tableService } from "@/services/table.service";
import { deliveryService } from "@/services/delivery.service";

let flushing = false;

/** Best-effort replay of the online-only side effects POS.tsx/WaiterPanel.tsx deferred at queue
 *  time (see PendingOrderPostSync) — same "fire and ignore failures" style those call sites
 *  already use for these exact calls when placed live. */
async function replayPostSync(row: PendingOrder, created: OrderRecord): Promise<void> {
  const postSync = row.postSync;
  if (!postSync) return;

  if (postSync.completeReservationId) {
    reservationService
      .update(postSync.completeReservationId, { status: "completed", orderId: created.id })
      .catch(() => {});
  }
  if (postSync.occupyTable) {
    tableService
      .updateTable(postSync.occupyTable.tableId, {
        status: "occupied",
        currentOrderId: `${Date.now()}:${postSync.occupyTable.guests}`,
      })
      .catch(() => {});
  }
  if (postSync.endSelfOrderSessionForTableId) {
    tableService.notifySelfOrderSessionEnded(postSync.endSelfOrderSessionForTableId).catch(() => {});
  }
  if (postSync.assignRider) {
    deliveryService
      .assignRider({
        orderId: created.id,
        riderId: postSync.assignRider.riderId,
        estimatedTime: postSync.assignRider.estimatedTime,
      })
      .catch(() => {});
  }
}

/**
 * Serial, oldest-first. Re-queries Dexie each loop iteration so an order placed WHILE a flush is
 * already running is naturally picked up rather than requiring a second pass.
 *
 * - A genuine rejection (ApiError, e.g. stock ran out while offline) marks that one row 'failed'
 *   and CONTINUES — one bad item must not block every order queued after it.
 * - A 401 that survives postOrderDirect's suppressed-redirect refresh attempt is treated like a
 *   network failure (stays 'pending'), not a rejection of this specific order — "can't
 *   authenticate right now," not "this order is invalid."
 * - Any other failure (network-type, or the 401 case above) STOPS the whole loop: the server
 *   assigns sequential order numbers, so letting a later item sync ahead of one still genuinely
 *   blocked would scramble ordering.
 */
export async function flushQueue(): Promise<void> {
  if (flushing) return;
  if (!getAccessToken()) return; // nothing to authenticate a replay with
  flushing = true;
  try {
    for (;;) {
      const [next] = await offlineDb.pendingOrders.where("status").equals("pending").sortBy("createdAt");
      if (!next) break;

      await offlineDb.pendingOrders.update(next.localId, {
        status: "syncing",
        lastAttemptAt: Date.now(),
        attemptCount: next.attemptCount + 1,
      });

      try {
        const created = await postOrderDirect(next.payload);
        await replayPostSync(next, created);
        await offlineDb.pendingOrders.delete(next.localId);
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 401) {
            await offlineDb.pendingOrders.update(next.localId, {
              status: "pending",
              lastError: err.message,
              updatedAt: Date.now(),
            });
            break;
          }
          await offlineDb.pendingOrders.update(next.localId, {
            status: "failed",
            lastError: err.message,
            updatedAt: Date.now(),
          });
          continue;
        }
        await offlineDb.pendingOrders.update(next.localId, {
          status: "pending",
          lastError: err instanceof Error ? err.message : String(err),
          updatedAt: Date.now(),
        });
        break;
      }
    }
  } finally {
    flushing = false;
  }
}

/** Manual retry from the review drawer — resets a 'failed' row to 'pending' and immediately
 *  re-enters the normal flush loop. */
export async function retryFailedOrder(localId: string): Promise<void> {
  await offlineDb.pendingOrders.update(localId, { status: "pending", lastError: null, updatedAt: Date.now() });
  void flushQueue();
}

/** Manual discard from the review drawer — permanently drops an order that genuinely can't be
 *  placed (e.g. a manager confirms the sale is void). */
export async function discardFailedOrder(localId: string): Promise<void> {
  await offlineDb.pendingOrders.delete(localId);
}

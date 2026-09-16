import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { offlineDb } from "@/lib/db/offlineOrdersDb";
import { initConnectivityWatcher, onConnectivityChange } from "@/lib/connectivity";
import { flushQueue } from "@/lib/offlineOrderSync";
import { useVisiblePolling } from "@/hooks/use-visible-polling";

/**
 * Non-visual — owns every trigger that attempts to flush the offline order queue. Mount once, at
 * the app root (see App.tsx), not inside AppHeader/AppLayout: POS.tsx is a standalone route with
 * no AppHeader, so anything mounted there would never run on the screen this matters most for.
 */
export function OfflineSyncManager() {
  const pendingCount = useLiveQuery(
    () => offlineDb.pendingOrders.where("status").equals("pending").count(),
    [],
    0
  );

  useEffect(() => {
    initConnectivityWatcher();
    void flushQueue(); // catches "reopened the tab already online with yesterday's stuck orders"

    // Fires on every online<->offline transition; only a transition TO online is worth a flush
    // attempt. connectivity.ts's watcher already covers browser online/offline events AND socket
    // reconnect — both funnel through this one callback, nothing extra to wire here.
    return onConnectivityChange((online) => {
      if (online) void flushQueue();
    });
  }, []);

  // Safety net only, enabled ONLY while there's actually something to flush — no always-on
  // timer (this repo's Neon compute-hour discipline: a normal shift with an empty queue costs
  // zero extra requests).
  useVisiblePolling(() => void flushQueue(), 15_000, (pendingCount ?? 0) > 0);

  return null;
}

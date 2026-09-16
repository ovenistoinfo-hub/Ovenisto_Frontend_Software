import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { WifiOff, AlertTriangle } from "lucide-react";
import { offlineDb } from "@/lib/db/offlineOrdersDb";
import { useIsOnline } from "@/lib/connectivity";
import { OfflineQueueDrawer } from "./OfflineQueueDrawer";
import { cn } from "@/lib/utils";

/**
 * Hidden when online with an empty queue. Mounted once at the App root (not inside AppHeader —
 * POS.tsx is a standalone route with no AppHeader, so this needs to render independently of it).
 */
export function OfflineIndicator() {
  const online = useIsOnline();
  const [open, setOpen] = useState(false);
  const pendingCount = useLiveQuery(
    () => offlineDb.pendingOrders.where("status").anyOf(["pending", "syncing"]).count(),
    [],
    0
  );
  const failedCount = useLiveQuery(
    () => offlineDb.pendingOrders.where("status").equals("failed").count(),
    [],
    0
  );

  const hasQueue = (pendingCount ?? 0) > 0 || (failedCount ?? 0) > 0;
  if (online && !hasQueue) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-bold shadow-lg border transition-colors print:hidden",
          (failedCount ?? 0) > 0
            ? "bg-destructive/10 text-destructive border-destructive/30"
            : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
        )}
      >
        {(failedCount ?? 0) > 0 ? <AlertTriangle className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
        <span>
          {!online ? "Offline" : "Syncing"}
          {hasQueue && " — "}
          {(pendingCount ?? 0) > 0 && `${pendingCount} queued`}
          {(pendingCount ?? 0) > 0 && (failedCount ?? 0) > 0 && ", "}
          {(failedCount ?? 0) > 0 && `${failedCount} needs review`}
        </span>
      </button>
      <OfflineQueueDrawer open={open} onOpenChange={setOpen} />
    </>
  );
}

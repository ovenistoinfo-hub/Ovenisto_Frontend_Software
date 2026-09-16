import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, Clock, RotateCcw, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { offlineDb, type PendingOrder } from "@/lib/db/offlineOrdersDb";
import { retryFailedOrder, discardFailedOrder } from "@/lib/offlineOrderSync";

/**
 * Lists THIS device's queued orders only — IndexedDB is per-browser, so a failed row here is
 * genuinely invisible anywhere else (including any chain-wide Order Monitor page). Labeled as
 * such below so nobody mistakes it for a chain-wide report.
 */
export function OfflineQueueDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const rows = useLiveQuery(
    () => offlineDb.pendingOrders.orderBy("createdAt").reverse().toArray(),
    [],
    [] as PendingOrder[]
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Offline Orders — This Device's Queue</SheetTitle>
          <SheetDescription>
            Orders placed here while offline. They sync automatically once this device is back
            online — this list is not visible on any other terminal.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          {(rows ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nothing queued.</p>
          ) : (
            (rows ?? []).map((row) => (
              <div key={row.localId} className="rounded-xl border border-border/60 bg-card/60 p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-bold text-sm">{row.provisionalOrderNumber}</span>
                  {row.status === "failed" ? (
                    <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-[10px] font-bold gap-1">
                      <AlertTriangle className="h-3 w-3" /> Needs Review
                    </Badge>
                  ) : row.status === "syncing" ? (
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] font-bold">
                      Syncing…
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] font-bold gap-1">
                      <Clock className="h-3 w-3" /> Pending
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {row.payload.type} · Rs. {row.payload.total.toLocaleString()} · {row.payload.items.length} item(s)
                  {row.sourceScreen === "waiter" ? " · Waiter Panel" : " · POS"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Queued {new Date(row.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {row.attemptCount > 0 ? ` · ${row.attemptCount} attempt(s)` : ""}
                </p>
                {row.lastError && (
                  <p className="text-[11px] text-destructive">{row.lastError}</p>
                )}
                {row.status === "failed" && (
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1 flex-1"
                      onClick={() => void retryFailedOrder(row.localId)}
                    >
                      <RotateCcw className="h-3 w-3" /> Retry
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1 flex-1 text-destructive hover:text-destructive"
                      onClick={() => void discardFailedOrder(row.localId)}
                    >
                      <Trash2 className="h-3 w-3" /> Discard
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

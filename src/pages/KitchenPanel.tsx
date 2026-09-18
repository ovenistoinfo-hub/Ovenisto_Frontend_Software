import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Bell, Clock, Flame, ChefHat, CheckCircle2,
  Utensils, Loader2, Hourglass, Gift, Check
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { orderService, type OrderRecord, type KitchenRecord } from "@/services/order.service";
import { ORDER_TYPE_COLORS } from "@/lib/constants";
import { statusTone } from "@/lib/statusTone";
import { useVisiblePolling } from "@/hooks/use-visible-polling";
import { useOrderEvents } from "@/hooks/use-order-events";
import { useSelfMutationGuard } from "@/hooks/use-self-mutation-guard";
import { getSocket } from "@/lib/socket";
import { useAuth } from "@/contexts/AuthContext";

type KitchenOrderStatus = "new" | "preparing" | "ready" | "completed";

export interface KitchenItemEntry {
  key: string;
  name: string;
  qty: number;
  cookingTime: number;
  dealName?: string | null;
  dealItemKey?: string | null;
  status: "pending" | "preparing" | "ready";
  preparingAt: Date | null;
  actionKey: string; // this dish's own dealItemKey; "shared" only for legacy pre-key orders
}

export interface UnifiedKitchenOrder {
  id: string;
  orderNumber: string;
  type: string;
  tableNumber?: number | null;
  customer?: string | null;
  placedAt: Date;
  dealGroups: Record<string, { dealName: string; items: KitchenItemEntry[] }>;
  plainItems: KitchenItemEntry[];
  allItems: KitchenItemEntry[];
  status: KitchenOrderStatus;
  hasPendingCancellationRequest?: boolean;
}

const typeColors = ORDER_TYPE_COLORS;

// Order-level colors follow the canonical statusTone mapping (shared with POS / Waiter Panel /
// Order Monitor): new = pending = warning, preparing = info, ready = success.
const statusConfig: Record<KitchenOrderStatus, { border: string; bg: string; icon: typeof Clock; iconBg: string; iconColor: string; label: string }> = {
  new: { border: statusTone("pending").borderL, bg: `${statusTone("pending").tint} hover:bg-warning/10`, icon: Bell, iconBg: "bg-warning/15", iconColor: statusTone("pending").text, label: "New" },
  preparing: { border: statusTone("preparing").borderL, bg: `${statusTone("preparing").tint} hover:bg-info/10`, icon: Flame, iconBg: "bg-info/15", iconColor: statusTone("preparing").text, label: "Preparing" },
  ready: { border: statusTone("ready").borderL, bg: `${statusTone("ready").tint} hover:bg-success/10`, icon: CheckCircle2, iconBg: "bg-success/15", iconColor: statusTone("ready").text, label: "Ready" },
  completed: { border: "border-l-muted-foreground/30", bg: "bg-muted/30 opacity-60", icon: CheckCircle2, iconBg: "bg-muted", iconColor: "text-muted-foreground", label: "Completed" },
};

const formatDuration = (totalMinutes: number) => {
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
};

/**
 * Resolves THIS kitchen's status for one specific dish, by that dish's own
 * per-item ticket (`itemKey` = the line's dealItemKey). A legacy line with no
 * key falls back to the order's one shared per-kitchen ticket.
 *
 * When no ticket exists yet, the dish is `pending` — it does NOT inherit
 * `preparing` from a sibling dish that was started. The only inherited state is
 * the order's terminal one: a fully-legacy order with no per-dish rows, or an
 * order the backend auto-marked ready because none of its items route to a
 * kitchen.
 */
const getKitchenItemStatus = (order: OrderRecord, kitchenId: string, itemKey: string | null): "pending" | "preparing" | "ready" => {
  const progress = itemKey
    ? order.kitchenDealProgress?.find((p) => p.kitchenId === kitchenId && p.dealItemKey === itemKey)
    : order.kitchenProgress?.find((p) => p.kitchenId === kitchenId);
  if (progress) return progress.status as "pending" | "preparing" | "ready";
  if (order.status === "ready" || order.status === "completed") return "ready";
  return "pending";
};

interface DishRowProps {
  item: KitchenItemEntry;
  isUpdating: boolean;
  clock: Date;
  onAdvance: (currentStatus: "pending" | "preparing" | "ready") => void;
}

/** One dish line with its own per-dish kitchen controls. Used for both deal sub-items and plain items. */
const DishRow = ({ item, isUpdating, clock, onAdvance }: DishRowProps) => {
  const cookTime = item.cookingTime || 10;
  const elapsedSec = item.preparingAt ? Math.floor((clock.getTime() - item.preparingAt.getTime()) / 1000) : 0;
  const elapsedMin = Math.floor(elapsedSec / 60);
  const remainingSec = Math.max(0, cookTime * 60 - elapsedSec);
  const remainingMin = Math.floor(remainingSec / 60);
  const isOverdue = item.status === "preparing" && elapsedSec > cookTime * 60;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 p-2 rounded-xl bg-muted/20 border border-border/60 hover:border-primary/40 transition-all text-xs">
      {/* Item Qty & Name — the controls wrap onto their own line on narrow cards instead of squeezing the name */}
      <div className="flex items-start gap-1.5 min-w-0 grow basis-32">
        <span className="font-black text-primary font-mono text-xs shrink-0">{item.qty}×</span>
        <span className="font-bold text-foreground text-xs break-words min-w-0">{item.name}</span>
      </div>

      {/* Per-Item Action Pill */}
      <div className="shrink-0 flex items-center gap-1.5 ml-auto">
        {item.status === "pending" ? (
          <Button
            size="sm"
            disabled={isUpdating}
            onClick={() => onAdvance("pending")}
            className={cn("h-10 px-3 text-xs font-bold rounded-md cursor-pointer transition-all gap-1.5 hover:bg-warning/25", statusTone("pending").badge)}
            title="Start cooking this dish"
          >
            {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChefHat className="h-4 w-4" />}
            {item.cookingTime ? `${item.cookingTime}m Prep` : "Start Prep"}
          </Button>
        ) : item.status === "preparing" ? (
          <div className="flex items-center gap-1.5">
            <span className={cn(
              "text-xs font-mono font-bold px-2 py-1 rounded-md",
              isOverdue
                ? "bg-destructive/15 text-destructive border border-destructive/30 animate-pulse"
                : statusTone("preparing").badge
            )}>
              {isOverdue ? `+${elapsedMin - cookTime}m` : `${remainingMin}:${String(remainingSec % 60).padStart(2, "0")}`}
            </span>
            <Button
              size="sm"
              disabled={isUpdating}
              onClick={() => onAdvance("preparing")}
              className={cn("h-10 px-3 text-xs font-bold rounded-md cursor-pointer transition-all gap-1.5 hover:bg-success/25", statusTone("ready").badge)}
              title="Mark this dish ready"
            >
              {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 stroke-[2.5]" />}
              Ready
            </Button>
          </div>
        ) : (
          <span className={cn("text-xs font-bold px-2.5 py-1.5 rounded-md flex items-center gap-1", statusTone("ready").badge)}>
            <CheckCircle2 className="h-4 w-4" /> Done
          </span>
        )}
      </div>
    </div>
  );
};

const KitchenPanel = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const { markMine, isLikelyOwnEcho } = useSelfMutationGuard();

  const [kitchen, setKitchen] = useState<KitchenRecord | null>(null);
  const [kitchenOrders, setKitchenOrders] = useState<UnifiedKitchenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState<"all" | KitchenOrderStatus>("all");
  const [updatingKeys, setUpdatingKeys] = useState<Record<string, boolean>>({});

  // placedAt: when the order was received
  const placedAtMap = useRef<Record<string, Date>>({});
  // preparingAt: when item was accepted (timer starts here)
  const preparingAtMap = useRef<Record<string, Date>>({});

  const loadSeq = useRef(0);

  const buildKitchenOrders = useCallback((orders: OrderRecord[], kitch: KitchenRecord): UnifiedKitchenOrder[] => {
    const cats = kitch.assignedCategories ?? [];
    const hasFilter = cats.length > 0;
    const unifiedList: UnifiedKitchenOrder[] = [];

    for (const o of orders) {
      if (o.status === "cancelled") continue;
      // Exclude self-orders that are still pending AND not yet accepted by a waiter
      if (o.type === "Self Order" && o.status === "pending" && !o.acceptedById) continue;

      // Only consider items whose category matches this kitchen's assigned categories
      const relevantItems = o.items.filter((item) => {
        if (!hasFilter) return true;
        return item.categoryName ? cats.includes(item.categoryName) : false;
      });
      if (!relevantItems.length) continue;

      // Track placedAt date
      if (!placedAtMap.current[o.id]) {
        placedAtMap.current[o.id] = new Date(o.createdAt || Date.now());
      }

      const allItems: KitchenItemEntry[] = [];
      const dealGroups: Record<string, { dealName: string; items: KitchenItemEntry[] }> = {};
      const plainItems: KitchenItemEntry[] = [];

      for (let i = 0; i < relevantItems.length; i++) {
        const rawItem = relevantItems[i];
        // Every dish now carries its own per-item ticket key (deal or plain).
        // "shared" is only reached by a legacy line whose row predates keys.
        const itemKey = (rawItem.dealItemKey as string) || null;
        const actionKey = itemKey ?? "shared";
        const itemTicketId = `${o.id}::${actionKey}`;

        const status = getKitchenItemStatus(o, kitch.id, itemKey);

        if (status === "preparing" && !preparingAtMap.current[itemTicketId]) {
          // If already preparing in backend, estimate start
          const itemProg = itemKey
            ? o.kitchenDealProgress?.find(p => p.kitchenId === kitch.id && p.dealItemKey === itemKey)
            : o.kitchenProgress?.find(p => p.kitchenId === kitch.id);
          preparingAtMap.current[itemTicketId] = itemProg?.updatedAt ? new Date(itemProg.updatedAt) : new Date(o.createdAt || Date.now());
        }

        const entry: KitchenItemEntry = {
          key: `${o.id}_${rawItem.name}_${i}`,
          name: rawItem.name,
          qty: rawItem.qty,
          cookingTime: rawItem.cookingTime ?? 0,
          dealName: rawItem.dealName ?? null,
          dealItemKey: rawItem.dealItemKey ?? null,
          status,
          preparingAt: status === "preparing" ? (preparingAtMap.current[itemTicketId] ?? placedAtMap.current[o.id]) : null,
          actionKey,
        };

        allItems.push(entry);

        // Group into Deal or Plain
        let dealKey: string | null = null;
        let dealName: string | null = null;

        if (rawItem.dealLineId) {
          dealKey = rawItem.dealLineId;
          dealName = rawItem.dealName || "Deal";
        } else if (rawItem.dealName) {
          dealKey = `deal-${rawItem.dealName}`;
          dealName = rawItem.dealName;
        } else if (
          rawItem.name &&
          rawItem.name.includes(":") &&
          (rawItem.name.includes("(Free)") ||
            rawItem.name.includes("(Discounted)") ||
            rawItem.name.toLowerCase().includes("deal") ||
            rawItem.name.toLowerCase().includes("offer") ||
            rawItem.name.toLowerCase().includes("combo") ||
            rawItem.name.toLowerCase().includes("feast"))
        ) {
          const parts = rawItem.name.split(":");
          dealName = parts[0].trim();
          dealKey = `deal-prefix-${dealName}`;
        }

        if (dealKey && dealName) {
          if (!dealGroups[dealKey]) {
            dealGroups[dealKey] = { dealName, items: [] };
          }
          const cleanName =
            rawItem.name && rawItem.name.startsWith(`${dealName}:`)
              ? rawItem.name.replace(`${dealName}:`, "").trim()
              : rawItem.name;
          dealGroups[dealKey].items.push({ ...entry, name: cleanName });
        } else {
          plainItems.push(entry);
        }
      }

      // If all items for this kitchen are already "ready", hide the order from active KDS
      const allReady = allItems.every((item) => item.status === "ready");
      if (allReady) continue;

      // Determine overall card status
      const hasPreparing = allItems.some((item) => item.status === "preparing");
      const overallStatus: KitchenOrderStatus = hasPreparing || allItems.some(i => i.status === "ready")
        ? "preparing"
        : "new";

      unifiedList.push({
        id: o.id,
        orderNumber: o.orderNumber,
        type: o.type,
        tableNumber: o.tableNumber,
        customer: (o as any).customerName || (o as any).customer,
        placedAt: placedAtMap.current[o.id] || new Date(),
        dealGroups,
        plainItems,
        allItems,
        status: overallStatus,
        hasPendingCancellationRequest: Boolean(o.hasPendingCancellationRequest),
      });
    }

    return unifiedList;
  }, []);

  const load = useCallback(async (isSilent = false) => {
    const seq = ++loadSeq.current;
    try {
      const [kitchens, { data: orders }] = await Promise.all([
        orderService.getKitchens(),
        orderService.getOrders({ limit: 100 }),
      ]);
      if (seq !== loadSeq.current) return;

      const kitch = id ? kitchens.find(k => k.id === id) : kitchens[0];
      if (!kitch) {
        setLoading(false);
        return;
      }

      setKitchen(kitch);
      setKitchenOrders(buildKitchenOrders(orders, kitch));
    } catch {
      if (seq === loadSeq.current && !isSilent) {
        toast.error("Failed to load kitchen data");
      }
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [id, buildKitchenOrders]);

  useEffect(() => { load(false); }, [load]);

  // Live second clock for accurate countdowns
  useEffect(() => {
    const interval = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useOrderEvents(() => load(true));
  useVisiblePolling(() => load(true), 60000, !!kitchen);

  // Sound & Toast for newly pushed orders
  useEffect(() => {
    const socket = getSocket();
    const onOrderCreated = (payload: OrderRecord) => {
      if (isLikelyOwnEcho()) return;
      if (payload.outletId && payload.outletId !== user?.outletId) return;
      toast.info(`New order received — #${payload.orderNumber}`);
    };
    const onOrderUpdated = (payload: OrderRecord) => {
      if (isLikelyOwnEcho()) return;
      if (payload.outletId && payload.outletId !== user?.outletId) return;
      if (payload.status === "cancelled") {
        toast.error(`Order #${payload.orderNumber} was cancelled — stop preparation!`);
      }
    };
    socket.on("order:created", onOrderCreated);
    socket.on("order:updated", onOrderUpdated);
    return () => {
      socket.off("order:created", onOrderCreated);
      socket.off("order:updated", onOrderUpdated);
    };
  }, [isLikelyOwnEcho, user?.outletId]);

  // ── Action Handlers ──

  /** Advance ONE dish (by its own actionKey) from pending->preparing or
   *  preparing->ready. Only that dish moves — its siblings are untouched. */
  const handleItemAdvance = async (orderId: string, actionKey: string, currentStatus: "pending" | "preparing" | "ready") => {
    if (!kitchen || currentStatus === "ready") return;
    const nextApiStatus = currentStatus === "pending" ? "preparing" : "ready";
    const lockKey = `${orderId}::${actionKey}`;
    const dealItemKey = actionKey === "shared" ? undefined : actionKey;

    setUpdatingKeys(prev => ({ ...prev, [lockKey]: true }));
    try {
      markMine();
      await orderService.updateOrderKitchenStatus(orderId, kitchen.id, nextApiStatus, dealItemKey);

      if (nextApiStatus === "preparing") {
        preparingAtMap.current[lockKey] = new Date();
      }

      // Optimistically flip ONLY the touched dish, in place — keep the exact
      // grouping buildKitchenOrders produced (dealLineId / cleaned names), so
      // the card doesn't reshuffle on the first press.
      setKitchenOrders(prev => {
        return prev.map(order => {
          if (order.id !== orderId) return order;
          const patch = (it: KitchenItemEntry): KitchenItemEntry =>
            it.actionKey === actionKey
              ? {
                  ...it,
                  status: nextApiStatus as "pending" | "preparing" | "ready",
                  preparingAt: nextApiStatus === "preparing" ? (preparingAtMap.current[lockKey] || new Date()) : it.preparingAt,
                }
              : it;
          const allItems = order.allItems.map(patch);
          const dealGroups: Record<string, { dealName: string; items: KitchenItemEntry[] }> = {};
          for (const [k, g] of Object.entries(order.dealGroups)) {
            dealGroups[k] = { dealName: g.dealName, items: g.items.map(patch) };
          }
          const plainItems = order.plainItems.map(patch);
          const overallStatus: KitchenOrderStatus = allItems.some(i => i.status === "preparing" || i.status === "ready")
            ? "preparing"
            : "new";
          return { ...order, allItems, dealGroups, plainItems, status: overallStatus };
        }).filter(order => !order.allItems.every(i => i.status === "ready")); // remove once all items are ready
      });

      toast.success(`Dish updated to ${nextApiStatus}`);
    } catch {
      toast.error("Failed to update dish status");
    } finally {
      setUpdatingKeys(prev => ({ ...prev, [lockKey]: false }));
    }
  };

  /** Batch advance all active items in the order (Start All Cooking / Mark All Ready) */
  const handleBatchAdvance = async (order: UnifiedKitchenOrder, targetStatus: "preparing" | "ready") => {
    if (!kitchen) return;
    const lockKey = `order_batch_${order.id}`;
    setUpdatingKeys(prev => ({ ...prev, [lockKey]: true }));

    try {
      markMine();
      // "Start All Cooking" starts every pending dish; "Mark All Ready" readies
      // only what's actually cooking — a still-pending dish is never swept to
      // ready (it was never cooked).
      const targetItems = order.allItems.filter(i => targetStatus === "preparing" ? i.status === "pending" : i.status === "preparing");
      const distinctActionKeys = Array.from(new Set(targetItems.map(i => i.actionKey)));
      if (distinctActionKeys.length === 0) {
        toast.info("Nothing to update");
        return;
      }

      // ONE request for every dish — the backend upserts them all in a single
      // transaction and emits a single order:updated (vs. one round-trip,
      // transaction and socket broadcast per dish).
      await orderService.updateOrderKitchenStatus(
        order.id,
        kitchen.id,
        targetStatus,
        undefined,
        distinctActionKeys.map(k => (k === "shared" ? "" : k)).filter(Boolean),
      );

      if (targetStatus === "preparing") {
        distinctActionKeys.forEach(k => {
          preparingAtMap.current[`${order.id}::${k}`] = new Date();
        });
      }

      const touched = new Set(distinctActionKeys);
      setKitchenOrders(prev => {
        return prev.map(o => {
          if (o.id !== order.id) return o;
          const patch = (it: KitchenItemEntry): KitchenItemEntry =>
            touched.has(it.actionKey)
              ? {
                  ...it,
                  status: targetStatus as "pending" | "preparing" | "ready",
                  preparingAt: targetStatus === "preparing" ? (preparingAtMap.current[`${o.id}::${it.actionKey}`] || new Date()) : it.preparingAt,
                }
              : it;
          const allItems = o.allItems.map(patch);
          const dealGroups: Record<string, { dealName: string; items: KitchenItemEntry[] }> = {};
          for (const [k, g] of Object.entries(o.dealGroups)) {
            dealGroups[k] = { dealName: g.dealName, items: g.items.map(patch) };
          }
          const plainItems = o.plainItems.map(patch);
          const status: KitchenOrderStatus = allItems.every(i => i.status === "ready")
            ? "ready"
            : allItems.some(i => i.status === "preparing" || i.status === "ready")
              ? "preparing"
              : "new";
          return { ...o, allItems, dealGroups, plainItems, status };
        }).filter(o => !o.allItems.every(i => i.status === "ready"));
      });

      toast.success(targetStatus === "preparing" ? `Order #${order.orderNumber} started cooking` : `Order #${order.orderNumber} marked ready!`);
    } catch {
      toast.error("Failed to update order");
    } finally {
      setUpdatingKeys(prev => ({ ...prev, [lockKey]: false }));
    }
  };

  const newOrderCount = kitchenOrders.filter((o) => o.status === "new").length;
  const preparingCount = kitchenOrders.filter((o) => o.status === "preparing").length;
  const readyCount = kitchenOrders.filter((o) => o.status === "ready").length;
  const displayed = kitchenOrders
    .filter((o) => statusFilter === "all" || o.status === statusFilter)
    .sort((a, b) => a.placedAt.getTime() - b.placedAt.getTime());

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col" aria-busy="true" aria-label="Loading kitchen orders">
        {/* Header skeleton */}
        <div className="h-16 bg-card border-b-2 border-primary/15 flex items-center justify-between px-5 shrink-0 shadow-sm">
          <div className="flex items-center gap-4">
            <Skeleton className="h-9 w-20 rounded-lg" />
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
          <div className="flex items-center gap-5">
            <Skeleton className="h-10 w-64 rounded-xl" />
            <Skeleton className="h-10 w-32 rounded-xl" />
          </div>
        </div>

        {/* Order card skeletons */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4.5">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="rounded-xl overflow-hidden border-l-4 border-l-border bg-card">
                <CardContent className="p-0">
                  <div className="px-4 pt-3.5 pb-2.5 flex items-center justify-between border-b border-border/50 bg-muted/20">
                    <Skeleton className="h-7 w-28 rounded-lg" />
                    <Skeleton className="h-5 w-16 rounded-md" />
                  </div>
                  <div className="p-3 space-y-2.5">
                    <Skeleton className="h-14 w-full rounded-xl" />
                    <Skeleton className="h-14 w-full rounded-xl" />
                    <Skeleton className="h-14 w-full rounded-xl" />
                  </div>
                  <div className="p-3 border-t border-border/50">
                    <Skeleton className="h-10 w-full rounded-lg" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!kitchen) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex items-center justify-center">
        <div className="flex flex-col items-center text-center">
          <div className="h-24 w-24 rounded-3xl bg-muted/30 flex items-center justify-center mb-5">
            <ChefHat className="h-12 w-12 text-muted-foreground/30" />
          </div>
          <p className="text-xl font-bold text-foreground">Kitchen not found</p>
          <Button asChild className="mt-4"><Link to="/kitchens">Back to Kitchens</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* ── Header ── */}
      <div className="h-16 bg-card border-b-2 border-primary/15 flex items-center justify-between px-5 shrink-0 shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" className="rounded-lg hover:bg-primary/10 cursor-pointer" asChild>
            <Link to="/kitchens"><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Link>
          </Button>
          <Separator orientation="vertical" className="h-8" />
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-xl gradient-primary flex items-center justify-center shadow-md">
              <ChefHat className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-foreground">{kitchen.name}</h1>
              <p className="text-xs text-muted-foreground">Kitchen Display Console</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-5">
          {/* Status Filter Buttons */}
          <div className="flex gap-1.5 bg-muted/50 p-1 rounded-xl">
            {(["all", "new", "preparing"] as const).map((s) => (
              <Button
                key={s}
                variant={statusFilter === s ? "default" : "ghost"}
                size="sm"
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "text-xs capitalize rounded-lg h-10 px-3 transition-all cursor-pointer",
                  statusFilter === s && "gradient-primary text-primary-foreground shadow-sm"
                )}
              >
                {s === "all" ? "All Active" : s === "new" ? "New" : "Preparing"}
              </Button>
            ))}
          </div>

          {/* Stats Badges */}
          <div className="flex items-center gap-2">
            {newOrderCount > 0 && (
              <div className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5", statusTone("pending").badge)}>
                <Bell className="h-4 w-4 animate-bounce" />
                <span className="text-xs font-bold">{newOrderCount} new</span>
              </div>
            )}
            {preparingCount > 0 && (
              <div className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5", statusTone("preparing").badge)}>
                <Flame className="h-4 w-4" />
                <span className="text-xs font-bold">{preparingCount}</span>
              </div>
            )}
            {readyCount > 0 && (
              <div className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5", statusTone("ready").badge)}>
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-xs font-bold">{readyCount}</span>
              </div>
            )}
          </div>

          {/* Clock */}
          <div className="flex items-center gap-2 bg-card border border-border/60 rounded-xl px-4 py-2 shadow-sm">
            <Clock className="h-4 w-4 text-primary" />
            <span className="text-base font-mono font-bold text-foreground tracking-tight">
              {clock.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          </div>
        </div>
      </div>

      {/* ── Orders Grid ── */}
      <div className="flex-1 overflow-y-auto p-5">
        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <div className="h-24 w-24 rounded-3xl bg-muted/30 flex items-center justify-center mb-5">
              <Utensils className="h-12 w-12 text-muted-foreground/30" />
            </div>
            <p className="text-xl font-bold text-foreground mb-1">No orders right now</p>
            <p className="text-sm text-muted-foreground">Orders will appear here when placed</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4.5">
            {displayed.map((order) => {
              const cfg = statusConfig[order.status];
              const StatusIcon = cfg.icon;

              const waitingMin = Math.floor(Math.max(0, (clock.getTime() - order.placedAt.getTime()) / 60000));
              const hasPendingItems = order.allItems.some(i => i.status === "pending");
              const hasPreparingItems = order.allItems.some(i => i.status === "preparing");
              const isBatchUpdating = updatingKeys[`order_batch_${order.id}`];

              return (
                <Card
                  key={order.id}
                  className={cn(
                    "transition-all duration-200 hover:shadow-lg border-l-4 rounded-xl overflow-hidden group flex flex-col justify-between bg-card",
                    cfg.border, cfg.bg,
                    order.status === "preparing" && "border-info/80"
                  )}
                >
                  <CardContent className="p-0 flex flex-col h-full justify-between">
                    <div>
                      {/* ── Top Header ── */}
                      <div className="px-4 pt-3.5 pb-2.5 flex items-center justify-between border-b border-border/50 bg-muted/20">
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "h-7 w-7 rounded-lg flex items-center justify-center",
                            cfg.iconBg, cfg.iconColor
                          )}>
                            <StatusIcon className="h-3.5 w-3.5" />
                          </div>
                          <span className="text-base font-extrabold tracking-tight text-foreground">{order.orderNumber}</span>
                          {order.tableNumber && (
                            <Badge className="text-xs font-extrabold px-1.5 py-0.5 bg-primary text-primary-foreground rounded-md">
                              T-{order.tableNumber}
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          {order.hasPendingCancellationRequest && (
                            <Badge className="bg-warning/15 text-warning border-warning/40 text-xs font-bold px-1.5 py-0.5 flex items-center gap-1">
                              <Clock className="h-3 w-3" /> Cancel Req
                            </Badge>
                          )}
                          <Badge variant="secondary" className={cn("text-xs font-bold rounded-md px-2 py-0.5 border", (typeColors as any)[order.type] ?? "")}>
                            {order.type}
                          </Badge>
                        </div>
                      </div>

                      {/* ── Waiting Time Banner ── */}
                      <div className="px-3.5 py-1.5 flex items-center justify-between text-xs bg-muted/10 border-b border-border/30">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Hourglass className="h-3.5 w-3.5 text-warning" />
                          <span className="font-medium text-[11px]">Waiting {formatDuration(waitingMin)}</span>
                        </div>
                        <span className="text-[11px] font-mono text-muted-foreground">{order.allItems.length} items total</span>
                      </div>

                      {/* ── Items List with Deal Bundling & Per-Item Controls ── */}
                      <div className="p-3 space-y-2.5 max-h-80 overflow-y-auto scrollbar-thin">
                        {/* 1. Grouped Deals */}
                        {Object.entries(order.dealGroups).map(([dealKey, group]) => (
                          <div key={dealKey} className="rounded-xl border border-primary/30 bg-card p-2 space-y-1.5 shadow-2xs">
                            {/* Deal Header */}
                            <div className="flex items-center justify-between text-xs pb-1 border-b border-primary/20">
                              <div className="flex items-center gap-1.5 truncate min-w-0">
                                <Badge variant="outline" className="text-xs font-extrabold text-primary border-primary/30 bg-primary/10 px-1.5 py-0 h-5 uppercase tracking-wider shrink-0 gap-1">
                                  <Gift className="h-3 w-3" /> Deal
                                </Badge>
                                <span className="font-extrabold text-xs text-foreground truncate">{group.dealName}</span>
                              </div>
                            </div>

                            {/* Deal Sub-Items */}
                            <div className="space-y-1.5 pt-0.5">
                              {group.items.map((item) => (
                                <DishRow
                                  key={item.key}
                                  item={item}
                                  isUpdating={Boolean(updatingKeys[`${order.id}::${item.actionKey}`])}
                                  clock={clock}
                                  onAdvance={(currentStatus) => handleItemAdvance(order.id, item.actionKey, currentStatus)}
                                />
                              ))}
                            </div>
                          </div>
                        ))}

                        {/* 2. Standalone Plain Items */}
                        {order.plainItems.map((item) => (
                          <DishRow
                            key={item.key}
                            item={item}
                            isUpdating={Boolean(updatingKeys[`${order.id}::${item.actionKey}`])}
                            clock={clock}
                            onAdvance={(currentStatus) => handleItemAdvance(order.id, item.actionKey, currentStatus)}
                          />
                        ))}
                      </div>
                    </div>

                    {/* ── Card Footer Master Batch Action ── */}
                    <div>
                      <Separator />
                      <div className="p-3 bg-muted/10">
                        {order.hasPendingCancellationRequest ? (
                          <div className="flex items-center justify-center gap-1.5 h-10 text-xs text-warning font-bold bg-warning/15 border border-warning/30 rounded-lg select-none">
                            <Clock className="h-4 w-4" /> Cancel Pending Approval
                          </div>
                        ) : hasPendingItems ? (
                          <Button
                            disabled={isBatchUpdating}
                            className={cn("w-full text-xs font-bold rounded-lg h-10 shadow-sm cursor-pointer transition-all gap-1.5", statusTone("pending").solid)}
                            onClick={() => handleBatchAdvance(order, "preparing")}
                          >
                            {isBatchUpdating ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Flame className="h-4 w-4" />
                            )}
                            Start All Cooking ({order.allItems.filter(i => i.status === "pending").length} items)
                          </Button>
                        ) : hasPreparingItems ? (
                          <Button
                            disabled={isBatchUpdating}
                            className={cn("w-full text-xs font-bold rounded-lg h-10 shadow-sm cursor-pointer transition-all gap-1.5", statusTone("ready").solid)}
                            onClick={() => handleBatchAdvance(order, "ready")}
                          >
                            {isBatchUpdating ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4" />
                            )}
                            Mark All Ready ({order.allItems.filter(i => i.status === "preparing").length} items)
                          </Button>
                        ) : (
                          <div className={cn("flex items-center justify-center gap-1.5 h-10 text-xs font-bold rounded-lg select-none", statusTone("ready").badge)}>
                            <CheckCircle2 className="h-4 w-4" /> Ready to Serve
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default KitchenPanel;

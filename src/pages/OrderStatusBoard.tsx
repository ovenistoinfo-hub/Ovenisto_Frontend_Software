import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, RefreshCw, Bell, Clock, BarChart3, TrendingUp, ShoppingBag,
  AlertCircle, ChefHat, CheckCircle2, Timer, UtensilsCrossed,
  ShoppingCart, Truck, CreditCard, Banknote, Receipt, Check, Loader2,
  Columns, LayoutGrid, Sparkles, User, Flame, Printer
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { orderService, KitchenRecord } from "@/services/order.service";
import { useVisiblePolling } from "@/hooks/use-visible-polling";
import { useOrderEvents } from "@/hooks/use-order-events";
import { OrderPlacedPrintModal, type PlacedOrderSlipData } from "@/components/pos/OrderPlacedPrintModal";

// ─── Status Definitions & Professional Theme Config ───────────────────────

type FilterStatus = "active" | "pending" | "preparing" | "ready" | "completed";

interface StatusConfigItem {
  label: string;
  bgActive: string;
  text: string;
  borderActive: string;
  iconBg: string;
  icon: typeof Clock;
  pill: string;
}

const statusConfig: Record<FilterStatus, StatusConfigItem> = {
  active: {
    label: "All Active",
    bgActive: "bg-primary/10 border-primary/50 shadow-sm",
    text: "text-primary dark:text-primary",
    borderActive: "border-primary/50",
    iconBg: "bg-primary/15 text-primary",
    icon: Flame,
    pill: "bg-primary/15 text-primary border-primary/30",
  },
  pending: {
    label: "Pending",
    bgActive: "bg-amber-500/10 border-amber-500/50 shadow-sm",
    text: "text-amber-500 dark:text-amber-400",
    borderActive: "border-amber-500/50",
    iconBg: "bg-amber-500/15 text-amber-500",
    icon: AlertCircle,
    pill: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  },
  preparing: {
    label: "Preparing",
    bgActive: "bg-sky-500/10 border-sky-500/50 shadow-sm",
    text: "text-sky-500 dark:text-sky-400",
    borderActive: "border-sky-500/50",
    iconBg: "bg-sky-500/15 text-sky-500",
    icon: ChefHat,
    pill: "bg-sky-500/15 text-sky-500 border-sky-500/30",
  },
  ready: {
    label: "Ready",
    bgActive: "bg-emerald-500/10 border-emerald-500/50 shadow-sm",
    text: "text-emerald-500 dark:text-emerald-400",
    borderActive: "border-emerald-500/50",
    iconBg: "bg-emerald-500/15 text-emerald-500",
    icon: CheckCircle2,
    pill: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  },
  completed: {
    label: "Completed",
    bgActive: "bg-purple-500/10 border-purple-500/50 shadow-sm",
    text: "text-purple-500 dark:text-purple-400",
    borderActive: "border-purple-500/50",
    iconBg: "bg-purple-500/15 text-purple-500",
    icon: Check,
    pill: "bg-purple-500/15 text-purple-500 border-purple-500/30",
  },
};

// 3 Main Order Type Columns
type OrderColumnKey = "dine-in" | "takeaway" | "delivery";

interface OrderColumnConfig {
  key: OrderColumnKey;
  title: string;
  subtitle: string;
  icon: typeof UtensilsCrossed;
  types: string[];
  iconBg: string;
  badgeBg: string;
}

const orderColumns: OrderColumnConfig[] = [
  {
    key: "dine-in",
    title: "Dine In & Tables",
    subtitle: "Dine In & Self Order",
    icon: UtensilsCrossed,
    types: ["Dine In", "Self Order"],
    iconBg: "bg-rose-500/15 text-rose-500 border border-rose-500/20",
    badgeBg: "bg-rose-500/20 text-rose-400 border border-rose-500/30",
  },
  {
    key: "takeaway",
    title: "Take Away & Pickup",
    subtitle: "Take Away & Walk-in",
    icon: ShoppingCart,
    types: ["Take Away", "Walk-in"],
    iconBg: "bg-amber-500/15 text-amber-500 border border-amber-500/20",
    badgeBg: "bg-amber-500/20 text-amber-400 border border-amber-500/30",
  },
  {
    key: "delivery",
    title: "Delivery & Online",
    subtitle: "Delivery, Foodpanda & Online",
    icon: Truck,
    types: ["Delivery", "Foodpanda", "Online"],
    iconBg: "bg-sky-500/15 text-sky-500 border border-sky-500/20",
    badgeBg: "bg-sky-500/20 text-sky-400 border border-sky-500/30",
  },
];

const normalize = (o: any) => ({
  ...o,
  customer: o.customerName || o.customer || "Walk-in",
  staff: o.acceptedByName || o.staffName || o.staff || "",
  phone: o.phone || "",
  total: Number(o.total),
  advancePayment: Number(o.advancePayment ?? 0),
  date: o.date ? new Date(o.date).toISOString().split("T")[0] : "",
  items: (o.items || []).map((i: any) => ({ ...i, price: Number(i.price) })),
});

// PKT-aware date string — Pakistan is UTC+5 and the browser/server clock may be on a
// different timezone, so any "is this the same calendar day" comparison must shift by
// +5h before taking the ISO date (root CLAUDE.md's "PKT Timezone Pattern"), not rely on
// raw local/UTC Date methods.
const pktDateStr = (input?: string | number | Date): string => {
  if (!input) return "";
  const d = new Date(input);
  if (isNaN(d.getTime())) return "";
  return new Date(d.getTime() + 5 * 60 * 60 * 1000).toISOString().split("T")[0];
};

// ─── Main Component ─────────────────────────────────────────────────────────

const OrderStatusBoard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { foodMenuItems, settings, currency } = useData();
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [activeStatus, setActiveStatus] = useState<FilterStatus>("active");
  const [viewMode, setViewMode] = useState<"columns" | "grid">("columns");
  const [time, setTime] = useState(new Date());
  const [autoRefresh] = useState(true);
  const [soundAlert, setSoundAlert] = useState(false);
  const [kitchens, setKitchens] = useState<KitchenRecord[]>([]);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [showOrderPlacedModal, setShowOrderPlacedModal] = useState(false);
  const [placedOrderSlip, setPlacedOrderSlip] = useState<PlacedOrderSlipData | null>(null);

  const handleOpenPrintModal = (order: any) => {
    const slipItems = (order.items || []).map((i: any) => ({
      id: i.id,
      name: i.name,
      qty: Number(i.qty) || 1,
      price: Number(i.price) || 0,
      discount: Number(i.discount) || 0,
      modifiers: i.modifiers || [],
      notes: i.notes || null,
      dealName: i.dealName || null,
    }));

    setPlacedOrderSlip({
      orderNumber: order.orderNumber,
      orderType: order.type,
      tableNumber: order.tableNumber || null,
      customerName: order.customer || "Walk-in",
      customerPhone: order.phone,
      customerAddress: order.deliveryAddress,
      staffName: order.staff || user?.name || "Cashier",
      items: slipItems,
      subtotal: Number(order.subtotal ?? order.total ?? 0),
      discount: Number(order.discount) || 0,
      tax: Number(order.tax) || 0,
      total: Number(order.total) || 0,
      advancePayment: order.advancePayment ? Number(order.advancePayment) : undefined,
      netPayable: Number(order.total) - Number(order.advancePayment || 0),
      paymentMethod: order.paymentMethod || "Cash",
      dateStr: order.date || new Date().toLocaleDateString(),
      timeStr: order.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      restaurantName: settings?.restaurantName || "OVENISTO",
      restaurantAddress: settings?.address,
      restaurantPhone: settings?.phone,
      currency: currency || "Rs.",
    });
    setShowOrderPlacedModal(true);
  };

  useEffect(() => {
    orderService.getKitchens().then(setKitchens).catch(() => { });
  }, []);

  const loadOrders = useCallback(async () => {
    try {
      const res = await orderService.getOrders({ limit: 200 });
      // Same gate as KitchenPanel: hide a self-order until a waiter accepts it.
      setAllOrders((res.data || [])
        .filter((o) => !(o.type === "Self Order" && o.status === "pending" && !o.acceptedById))
        .map(normalize));
    } catch { }
  }, []);

  const handleOrderEvent = useCallback((payload?: any) => {
    if (payload && typeof payload === "object" && payload.id) {
      const norm = normalize(payload);
      const isUnacceptedSelfOrder =
        norm.type === "Self Order" && norm.status === "pending" && !norm.acceptedById;

      setAllOrders((prev) => {
        if (isUnacceptedSelfOrder || norm.status === "cancelled") {
          return prev.filter((o) => o.id !== norm.id);
        }
        const exists = prev.some((o) => o.id === norm.id);
        if (exists) {
          return prev.map((o) => (o.id === norm.id ? norm : o));
        }
        return [norm, ...prev];
      });
    } else {
      loadOrders();
    }
  }, [loadOrders]);

  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t); }, []);
  useOrderEvents(handleOrderEvent);
  useVisiblePolling(loadOrders, 60000, autoRefresh);

  // "Is this order from today" — the single source of truth for "today" on this page,
  // used for both the Completed status count/filter AND the footer's Today's
  // Orders/Revenue KPIs (previously two independent, disagreeing checks; see pktDateStr
  // above for why the comparison must be PKT-aware).
  const isTodayOrder = useCallback((o: any) => {
    const todayStr = pktDateStr(Date.now());
    const dStr = pktDateStr(o.createdAt) || pktDateStr(o.date);
    return dStr === todayStr;
  }, []);

  // ── Status Filter Counts ──
  const statusCounts: Record<FilterStatus, number> = useMemo(() => ({
    active: allOrders.filter((o) => o.status === "pending" || o.status === "preparing" || o.status === "ready").length,
    pending: allOrders.filter((o) => o.status === "pending").length,
    preparing: allOrders.filter((o) => o.status === "preparing").length,
    ready: allOrders.filter((o) => o.status === "ready").length,
    completed: allOrders.filter((o) => o.status === "completed" && isTodayOrder(o)).length,
  }), [allOrders, isTodayOrder]);

  // Active status orders list
  const activeStatusOrders = useMemo(() => {
    if (activeStatus === "active") {
      return allOrders.filter((o) => o.status === "pending" || o.status === "preparing" || o.status === "ready");
    }
    if (activeStatus === "completed") {
      return allOrders.filter((o) => o.status === "completed" && isTodayOrder(o));
    }
    return allOrders.filter((o) => o.status === activeStatus);
  }, [allOrders, activeStatus, isTodayOrder]);

  // Group active orders by column (Dine In, Takeaway, Delivery)
  const ordersByColumn = useMemo(() => {
    const map: Record<OrderColumnKey, any[]> = {
      "dine-in": [],
      takeaway: [],
      delivery: [],
    };
    activeStatusOrders.forEach((o) => {
      if (orderColumns[0].types.includes(o.type)) {
        map["dine-in"].push(o);
      } else if (orderColumns[1].types.includes(o.type)) {
        map["takeaway"].push(o);
      } else {
        map["delivery"].push(o);
      }
    });
    return map;
  }, [activeStatusOrders]);

  const todayOrders = useMemo(() => allOrders.filter(isTodayOrder), [allOrders, isTodayOrder]);
  // Cancelled orders never count toward revenue (matches Shifts.tsx / POS.tsx shiftSales).
  const todayRevenue = useMemo(
    () => todayOrders
      .filter((o: any) => (o.status || "").toLowerCase() !== "cancelled")
      .reduce((s: number, o: any) => s + o.total, 0),
    [todayOrders]
  );

  // ── Helpers ──
  // A bare "Cash on Delivery" order only counts as paid once an advance was actually
  // collected at the counter (Number(advancePayment) > 0) — otherwise no money has
  // changed hands yet. Mirrors the COD rule inside POS.tsx / Shifts.tsx's isSettledOrder.
  const isPaid = (o: any) => {
    if (!o.paymentMethod) return false;
    const method = String(o.paymentMethod).toLowerCase().trim();
    if (method === "pending" || method === "unpaid") return false;
    if (method === "cash on delivery" || method === "cod" || method === "cash-on-delivery") {
      return Number(o.advancePayment || 0) > 0;
    }
    return true;
  };

  const getItemKitchenStatus = useCallback((item: any, order: any): "pending" | "preparing" | "ready" => {
    if (order.status === "ready" || order.status === "completed") return "ready";

    const categoryName = item.categoryName || foodMenuItems.find((fi: any) => fi.name === item.name)?.category?.name || (item.category as any)?.name;

    if (!categoryName) {
      return order.status === "preparing" ? "preparing" : "pending";
    }

    const assignedKitchen = kitchens.find(k => (k.status === "active" || !k.status) && k.assignedCategories?.includes(categoryName));

    // If no kitchen is specifically assigned to this category, return order's overall status!
    if (!assignedKitchen) return order.status === "preparing" ? "preparing" : order.status === "ready" ? "ready" : "pending";

    // A deal dish tracks its own ready state separately from the order's shared
    // kitchen ticket (see KitchenPanel) — prefer that when this item carries one.
    if (item.dealId && item.dealItemKey && order.kitchenDealProgress && Array.isArray(order.kitchenDealProgress)) {
      const dealProg = order.kitchenDealProgress.find(
        (p: any) => p.kitchenId === assignedKitchen.id && p.dealItemKey === item.dealItemKey
      );
      if (dealProg) return dealProg.status as "pending" | "preparing" | "ready";
    } else if (order.kitchenProgress && Array.isArray(order.kitchenProgress)) {
      const prog = order.kitchenProgress.find((p: any) => p.kitchenId === assignedKitchen.id);
      if (prog) return prog.status as "pending" | "preparing" | "ready";
    }

    if (order.status === "preparing") return "preparing";
    return "pending";
  }, [kitchens, foodMenuItems]);

  const getElapsed = (order: any) => {
    try {
      const created = new Date(order.createdAt || order.date);
      const diff = Math.max(0, Math.floor((time.getTime() - created.getTime()) / 60000));
      if (diff < 60) return `${diff}m`;
      return `${Math.floor(diff / 60)}h ${diff % 60}m`;
    } catch { return "—"; }
  };

  const getCookingInfo = (order: any) => {
    const maxCookTime = Math.max(...order.items.map((i: any) => {
      if (i.cookingTime) return i.cookingTime;
      const mi = foodMenuItems.find((fi: any) => fi.name === i.name);
      return (mi as any)?.cookingTime || 0;
    }), 0);
    if (maxCookTime <= 0) return null;
    try {
      const prepStart = order.status === "preparing" && order.updatedAt ? new Date(order.updatedAt) : new Date(order.createdAt || order.date);
      const elapsedMin = Math.max(0, Math.floor((time.getTime() - prepStart.getTime()) / 60000));
      const remainingMin = Math.max(0, maxCookTime - elapsedMin);
      const progress = Math.min(100, (elapsedMin / maxCookTime) * 100);
      return { maxCookTime, elapsedMin, remainingMin, progress, isOverdue: elapsedMin > maxCookTime };
    } catch { return null; }
  };

  const getItemCookingInfo = useCallback((item: any, order: any) => {
    const mi = foodMenuItems.find((fi: any) => fi.name === item.name);
    const cookTime = item.cookingTime || (mi as any)?.cookingTime || 0;
    try {
      const categoryName = item.categoryName || mi?.category?.name || (item.category as any)?.name;
      const assignedKitchen = categoryName ? kitchens.find(k => (k.status === "active" || !k.status) && k.assignedCategories?.includes(categoryName)) : null;
      // Same deal-dish-first preference as getItemKitchenStatus above.
      const prog = item.dealId && item.dealItemKey && assignedKitchen && order.kitchenDealProgress && Array.isArray(order.kitchenDealProgress)
        ? order.kitchenDealProgress.find((p: any) => p.kitchenId === assignedKitchen.id && p.dealItemKey === item.dealItemKey)
        : (assignedKitchen && order.kitchenProgress && Array.isArray(order.kitchenProgress))
          ? order.kitchenProgress.find((p: any) => p.kitchenId === assignedKitchen.id)
          : null;

      // Start elapsed calculation ONLY from when THIS kitchen accepted the order (prog.updatedAt).
      // Fallback to order.updatedAt (if order is preparing) or current time (so 0m elapsed if no timestamp exists).
      // Crucially, NEVER fall back to order.createdAt / order.date when calculating item prep time,
      // so time spent waiting in Pending is never counted against the item's prep timer!
      const prepStart = (prog && prog.updatedAt && prog.status === "preparing")
        ? new Date(prog.updatedAt)
        : (order.status === "preparing" && order.updatedAt ? new Date(order.updatedAt) : new Date(time.getTime()));

      const elapsedMin = Math.max(0, Math.floor((time.getTime() - prepStart.getTime()) / 60000));
      const remainingMin = cookTime - elapsedMin;
      const isOverdue = cookTime > 0 && elapsedMin > cookTime;
      const overdueMin = isOverdue ? elapsedMin - cookTime : 0;
      return { cookTime, elapsedMin, remainingMin, isOverdue, overdueMin };
    } catch {
      return { cookTime: 0, elapsedMin: 0, remainingMin: 0, isOverdue: false, overdueMin: 0 };
    }
  }, [foodMenuItems, kitchens, time]);

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    const targetOrder = allOrders.find(o => o.id === orderId);
    if (targetOrder?.hasPendingCancellationRequest) {
      toast.error("Cannot update status while a cancellation request is pending approval.");
      return;
    }
    setUpdatingOrderId(orderId);
    try {
      await orderService.updateOrderStatus(orderId, newStatus);
      setAllOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(prev => prev ? { ...prev, status: newStatus } : null);
      }
      toast.success(`Order #${orderId.slice(-4)} updated to ${newStatus}`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to update order status");
    } finally {
      setUpdatingOrderId(null);
    }
  };

  // ── Render Individual Order Card ──
  const renderOrderCard = (order: any) => {
    const cfg = statusConfig[order.status as FilterStatus] ?? statusConfig.pending;
    const elapsed = getElapsed(order);
    const paid = isPaid(order);
    const cookInfo = getCookingInfo(order);

    return (
      <Card
        key={order.id}
        onClick={() => setSelectedOrder(order)}
        className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all duration-150 border border-border/70 bg-card rounded-xl overflow-hidden group"
      >
        <CardContent className="p-0">
          {/* Card Top Banner with Order Number, Type, Table, Elapsed Time & Print Button */}
          <div className="px-3.5 py-2.5 flex items-center justify-between border-b border-border/50 bg-muted/20">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-extrabold text-sm tracking-tight text-foreground">{order.orderNumber}</span>
              <Badge variant="outline" className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-background/80 border-border/60">
                {order.type}
              </Badge>
              {order.tableNumber && (() => {
                const sameTableOrders = allOrders.filter(o => o.tableNumber === order.tableNumber && o.status !== "cancelled");
                const orderIdx = sameTableOrders.findIndex(o => o.id === order.id);
                return (
                  <Badge className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-rose-500/90 text-white">
                    T-{order.tableNumber}{sameTableOrders.length > 1 ? ` (${orderIdx + 1}/${sameTableOrders.length})` : ""}
                  </Badge>
                );
              })()}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-lg text-muted-foreground hover:text-orange-500 hover:bg-orange-500/10 transition-colors p-0 cursor-pointer border border-border/40 bg-background/80"
                title="Print Slip (KOT / Bill)"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenPrintModal(order);
                }}
              >
                <Printer className="h-3.5 w-3.5" />
              </Button>
              <span className="text-[10px] font-mono font-bold text-muted-foreground bg-background/80 px-2 py-0.5 rounded-full flex items-center gap-1 border border-border/50">
                <Timer className="h-3 w-3 text-amber-500" />
                {elapsed}
              </span>
            </div>
          </div>

          {/* Card Main Info */}
          <div className="p-3.5 space-y-2.5">
            {/* Customer & Staff */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 truncate">
                <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="font-bold text-foreground truncate">{order.customer}</span>
              </div>
              {order.staff && (
                <span className="text-[10px] text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-full shrink-0 border border-border/30">
                  {order.staff}
                </span>
              )}
            </div>

            {/* Items List Snippet — High Contrast & Ultra-Readable */}
            <div className="bg-background/80 dark:bg-muted/20 rounded-xl p-2 space-y-1.5 border border-border/60 shadow-xs">
              {order.items.slice(0, 3).map((item: any, i: number) => {
                const itemStatus = getItemKitchenStatus(item, order);
                const itemCook = getItemCookingInfo(item, order);

                return (
                  <div key={i} className="flex items-center justify-between text-xs gap-2 p-1.5 rounded-lg bg-card border border-border/40 hover:border-primary/30 transition-all">
                    {/* Left: Status Badge + Qty + Name */}
                    <div className="flex items-center gap-1.5 truncate min-w-0">
                      {itemStatus === "ready" ? (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-emerald-500/25 text-emerald-400 dark:text-emerald-300 border border-emerald-500/40 shrink-0 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-emerald-400" /> Ready
                        </span>
                      ) : itemStatus === "preparing" ? (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-sky-500/25 text-sky-300 dark:text-sky-200 border border-sky-500/40 shrink-0 flex items-center gap-1">
                          <ChefHat className="h-3 w-3 animate-pulse text-sky-300" /> Prep
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-amber-500/25 text-amber-300 dark:text-amber-200 border border-amber-500/40 shrink-0 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3 text-amber-400" /> Pend
                        </span>
                      )}
                      <span className="font-black text-xs text-foreground shrink-0">{item.qty}×</span>
                      <span className="truncate font-extrabold text-foreground text-xs">{item.name}</span>
                    </div>

                    {/* Right side: High Contrast Countdown Timer Pill */}
                    <div className="shrink-0">
                      {itemStatus === "ready" ? (
                        <span className="font-mono text-xs font-black text-emerald-400 dark:text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded-md border border-emerald-500/40 flex items-center gap-1 shadow-xs">
                          <Check className="h-3.5 w-3.5 stroke-[3]" /> Done
                        </span>
                      ) : itemStatus === "preparing" ? (
                        <span className={cn(
                          "font-mono text-xs font-black px-2 py-0.5 rounded-md border flex items-center gap-1 shadow-xs",
                          itemCook.isOverdue
                            ? "text-white bg-destructive border-destructive shadow-md animate-pulse"
                            : "text-sky-300 dark:text-sky-200 bg-sky-500/25 border-sky-400/60"
                        )}>
                          {itemCook.isOverdue ? (
                            <>
                              <AlertCircle className="h-3.5 w-3.5 text-white" />
                              +{itemCook.overdueMin}m overdue
                            </>
                          ) : itemCook.cookTime > 0 ? (
                            <>
                              <Clock className="h-3.5 w-3.5 animate-pulse" />
                              {itemCook.remainingMin}m left
                            </>
                          ) : (
                            <>
                              <Clock className="h-3.5 w-3.5" />
                              {itemCook.elapsedMin}m
                            </>
                          )}
                        </span>
                      ) : (
                        <span className="font-mono text-xs font-black text-amber-300 dark:text-amber-200 bg-amber-500/25 px-2 py-0.5 rounded-md border border-amber-400/60 flex items-center gap-1 shadow-xs">
                          <Timer className="h-3.5 w-3.5" />
                          {itemCook.cookTime > 0 ? `${itemCook.cookTime}m est` : "In Queue"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              {order.items.length > 3 && (
                <p className="text-[10px] text-primary font-black pt-0.5 text-right uppercase tracking-wider">+{order.items.length - 3} more items</p>
              )}
            </div>

            {/* Cooking Progress Bar for Preparing Orders */}
            {order.status === "preparing" && cookInfo && (
              <div className="space-y-1 pt-0.5">
                <div className="flex items-center justify-between text-[10px]">
                  <span className={cn("font-bold flex items-center gap-1", cookInfo.isOverdue ? "text-destructive" : cookInfo.remainingMin <= 2 ? "text-amber-500" : "text-sky-500")}>
                    <ChefHat className="h-3 w-3" />
                    {cookInfo.isOverdue ? `Overdue +${cookInfo.elapsedMin - cookInfo.maxCookTime}m` : `${cookInfo.remainingMin}m left`}
                  </span>
                  <span className="text-muted-foreground font-mono">{cookInfo.maxCookTime}m max</span>
                </div>
                <Progress value={cookInfo.progress} className={cn("h-1.5 rounded-full", cookInfo.isOverdue && "[&>div]:bg-destructive", !cookInfo.isOverdue && cookInfo.progress > 75 && "[&>div]:bg-amber-500")} />
              </div>
            )}

            {/* Pending Status Info (Waiting for kitchen start) */}
            {order.status === "pending" && (
              <div className="flex items-center justify-between text-[10px] bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-md text-amber-500 font-bold">
                <span className="flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> In Queue
                </span>
                <span className="font-mono">{getElapsed(order)} wait</span>
              </div>
            )}

            {/* Footer: Payment Status + Quick Print Action (No Bill Amount) */}
            <div className="flex items-center justify-between pt-2 border-t border-border/40">
              <Badge className={cn(
                "text-[10px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1.5",
                paid
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30"
              )}>
                {paid ? <CreditCard className="h-3 w-3" /> : <Banknote className="h-3 w-3" />}
                {paid ? (order.paymentMethod || "Paid") : "Payment Pending"}
              </Badge>

              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-[11px] font-semibold gap-1.5 text-muted-foreground hover:text-foreground border-border/60 hover:bg-muted rounded-lg"
                title="Print Slip"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenPrintModal(order);
                }}
              >
                <Printer className="h-3.5 w-3.5 text-orange-500" />
                <span>Print Slip</span>
              </Button>
            </div>

            {/* Action Button */}
            {order.status === "ready" && (
              <Button
                size="sm"
                disabled={updatingOrderId === order.id}
                onClick={(e) => { e.stopPropagation(); handleStatusUpdate(order.id, "completed"); }}
                className="w-full h-8 text-xs bg-emerald-500 hover:bg-emerald-600 text-white font-bold shadow-xs flex items-center justify-center gap-1.5 rounded-lg transition-all"
              >
                {updatingOrderId === order.id ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Completing Order...
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5" /> Complete Order
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden font-sans">
      {/* ════════════ HEADER BAR ════════════ */}
      <header className="h-14 bg-card border-b border-border/60 flex items-center justify-between px-4 sm:px-6 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-muted" asChild>
            <Link to="/"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center shadow-xs">
              <BarChart3 className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-extrabold tracking-tight text-foreground flex items-center gap-2">
                Order Status Console
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-primary/10 text-primary border border-primary/20">
                  <Sparkles className="h-2.5 w-2.5 mr-1" /> Live
                </span>
              </h1>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* View Mode Switcher */}
          <div className="bg-muted/50 p-1 rounded-lg border border-border/60 flex items-center gap-1">
            <button
              onClick={() => setViewMode("columns")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-all",
                viewMode === "columns" ? "bg-card text-foreground shadow-xs border border-border/60" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Columns className="h-3.5 w-3.5 text-primary" />
              <span className="hidden md:inline">Type Columns</span>
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-all",
                viewMode === "grid" ? "bg-card text-foreground shadow-xs border border-border/60" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5 text-primary" />
              <span className="hidden md:inline">Grid View</span>
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-2 bg-muted/30 px-2.5 py-1 rounded-lg border border-border/40">
            <Checkbox id="sound" checked={soundAlert} onCheckedChange={(v) => setSoundAlert(!!v)} />
            <Label htmlFor="sound" className="text-xs font-medium cursor-pointer flex items-center gap-1 text-muted-foreground">
              <Bell className="h-3.5 w-3.5 text-amber-500" /> Sound
            </Label>
          </div>

          <div className="flex items-center gap-2 bg-card border border-border/80 rounded-lg px-2.5 py-1 shadow-xs">
            <Clock className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-mono font-bold text-foreground tracking-tight">
              {time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          </div>
        </div>
      </header>

      {/* ════════════ TOP HERO STATUS CARDS (ALL ACTIVE + STATUSES) ════════════ */}
      <div className="px-4 sm:px-6 py-3 bg-card/60 border-b border-border/60 shrink-0">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 w-full">
          {(["active", "pending", "preparing", "ready", "completed"] as FilterStatus[]).map((statusKey) => {
            const cfg = statusConfig[statusKey];
            const Icon = cfg.icon;
            const count = statusCounts[statusKey];
            const isActive = activeStatus === statusKey;

            return (
              <button
                key={statusKey}
                onClick={() => setActiveStatus(statusKey)}
                className={cn(
                  "p-3 rounded-xl text-left border transition-all duration-150 relative overflow-hidden group cursor-pointer",
                  isActive
                    ? `${cfg.bgActive} ${cfg.borderActive}`
                    : "bg-card hover:bg-card/90 border-border/60 text-muted-foreground"
                )}
              >
                <div className="flex items-center justify-between relative z-10">
                  <span className={cn("text-xs font-extrabold uppercase tracking-wider", isActive ? cfg.text : "text-muted-foreground")}>
                    {cfg.label}
                  </span>
                  <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105", cfg.iconBg)}>
                    <Icon className="h-4 w-4" />
                  </div>
                </div>

                <div className="mt-1.5 flex items-baseline justify-between relative z-10">
                  <span className={cn("text-2xl font-black font-mono tracking-tight", isActive ? "text-foreground" : "text-foreground/80")}>
                    {count}
                  </span>
                  {isActive && (
                    <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full border", cfg.pill)}>
                      Active Filter
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ════════════ MAIN CONTENT AREA (FULL SCREEN WIDTH) ════════════ */}
      <main className="flex-1 overflow-hidden p-4 sm:px-6 py-4 bg-muted/10 w-full">
        {activeStatusOrders.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <div className="h-16 w-16 rounded-2xl bg-muted/40 flex items-center justify-center mb-3 border border-border/60">
              <ShoppingBag className="h-8 w-8 text-muted-foreground/40" />
            </div>
            <h2 className="text-base font-extrabold text-foreground mb-1">No Orders Found</h2>
            <p className="text-xs text-muted-foreground max-w-sm">
              There are currently no <strong className="text-foreground uppercase">{activeStatus}</strong> orders.
            </p>
          </div>
        ) : viewMode === "columns" ? (
          /* ── MULTI-COLUMN LAYOUT BY ORDER TYPE (FULL WIDTH 3 COLUMNS) ── */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6 h-full w-full overflow-hidden">
            {orderColumns.map((col) => {
              const colOrders = ordersByColumn[col.key] || [];
              const ColIcon = col.icon;
              const totalColSum = colOrders.reduce((s, o) => s + o.total, 0);

              return (
                <div key={col.key} className="flex flex-col h-full bg-card rounded-2xl border border-border/70 overflow-hidden shadow-xs">
                  {/* Column Header */}
                  <div className="p-3.5 border-b border-border/60 bg-muted/30 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2.5">
                      <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", col.iconBg)}>
                        <ColIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-sm text-foreground tracking-tight flex items-center gap-1.5">
                          {col.title}
                        </h3>
                        <p className="text-[10px] text-muted-foreground font-medium">{col.subtitle}</p>
                      </div>
                    </div>

                    <div className="text-right">
                      <Badge className={cn("text-xs font-extrabold px-2 py-0.5 rounded-md", col.badgeBg)}>
                        {colOrders.length} Orders
                      </Badge>
                      <p className="text-[10px] font-mono font-bold text-muted-foreground mt-0.5">
                        Rs. {totalColSum.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Column Cards Vertical Scroll Container */}
                  <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                    {colOrders.length === 0 ? (
                      <div className="h-40 flex flex-col items-center justify-center text-center p-4 border border-dashed border-border/50 rounded-xl">
                        <p className="text-xs font-bold text-muted-foreground">No {col.title} orders</p>
                        <p className="text-[10px] text-muted-foreground/60">in {activeStatus} state</p>
                      </div>
                    ) : (
                      colOrders.map((order) => renderOrderCard(order))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ── FULL GRID VIEW ── */
          <div className="h-full overflow-y-auto w-full pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3.5">
              {activeStatusOrders.map((order) => renderOrderCard(order))}
            </div>
          </div>
        )}
      </main>

      {/* ════════════ BOTTOM KPI SUMMARY BAR ════════════ */}
      <footer className="bg-card border-t border-border/60 flex items-center justify-center gap-6 sm:gap-12 px-4 py-2.5 shrink-0 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <ShoppingBag className="h-3.5 w-3.5 text-primary" />
          </div>
          <div>
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Today's Orders</p>
            <p className="text-xs font-extrabold text-foreground">{todayOrders.length} total orders</p>
          </div>
        </div>

        <Separator orientation="vertical" className="h-7" />

        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
          </div>
          <div>
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Today's Revenue</p>
            <p className="text-xs font-extrabold text-foreground font-mono">Rs. {todayRevenue.toLocaleString()}</p>
          </div>
        </div>

        <Separator orientation="vertical" className="h-7" />

        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
          </div>
          <div>
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Active Pending</p>
            <p className="text-xs font-extrabold text-amber-500 font-mono">{statusCounts.pending}</p>
          </div>
        </div>

        <Separator orientation="vertical" className="h-7 hidden sm:block" />

        <div className="hidden sm:flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-sky-500/10 flex items-center justify-center">
            <ChefHat className="h-3.5 w-3.5 text-sky-500" />
          </div>
          <div>
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">In Kitchen</p>
            <p className="text-xs font-extrabold text-sky-500 font-mono">{statusCounts.preparing}</p>
          </div>
        </div>
      </footer>

      {/* ════════════ ORDER DETAIL DIALOG ════════════ */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-lg w-[95vw] max-h-[90vh] overflow-y-auto p-4 sm:p-6 rounded-2xl">
          {selectedOrder && (() => {
            const cfg = statusConfig[selectedOrder.status as FilterStatus] ?? statusConfig.pending;
            const paid = isPaid(selectedOrder);

            return (
              <>
                <DialogHeader className="border-b pb-3">
                  <DialogTitle className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-xl tracking-tight text-foreground">{selectedOrder.orderNumber}</span>
                      <Badge className="text-xs font-extrabold px-2.5 py-0.5 rounded-md bg-primary/15 text-primary border border-primary/20">
                        {selectedOrder.type}
                      </Badge>
                    </div>
                    <Badge className={cn("text-xs font-extrabold rounded-full px-3 py-1 border", cfg.pill)}>
                      {cfg.label}
                    </Badge>
                  </DialogTitle>
                  <DialogDescription className="sr-only">Detailed breakdown of order items and statuses</DialogDescription>
                </DialogHeader>

                <div className="space-y-4 text-sm pt-2">
                  {/* Detailed Customer & Order Info Box */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs bg-muted/40 rounded-xl p-3.5 border border-border/50">
                    <p><span className="text-muted-foreground">Order Time:</span> <strong className="text-foreground">{selectedOrder.time || getElapsed(selectedOrder)}</strong></p>
                    <p><span className="text-muted-foreground">Customer:</span> <strong className="text-foreground">{selectedOrder.customer}</strong></p>
                    <p><span className="text-muted-foreground">Phone:</span> <strong className="text-foreground">{selectedOrder.phone || "—"}</strong></p>
                    {selectedOrder.staff && (
                      <p><span className="text-muted-foreground">Staff:</span> <strong className="text-foreground">{selectedOrder.staff}</strong></p>
                    )}
                    {selectedOrder.tableNumber && (
                      <p><span className="text-muted-foreground">Table:</span> <strong className="text-rose-500 font-extrabold">#{selectedOrder.tableNumber}</strong></p>
                    )}
                    {selectedOrder.deliveryAddress && (
                      <p className="col-span-2"><span className="text-muted-foreground">Address:</span> <strong className="text-foreground">{selectedOrder.deliveryAddress}</strong></p>
                    )}
                    <p>
                      <span className="text-muted-foreground">Payment Status:</span>{" "}
                      {paid
                        ? <strong className="text-emerald-500 font-extrabold">{selectedOrder.paymentMethod}</strong>
                        : <strong className="text-amber-500 font-extrabold">Unpaid</strong>
                      }
                    </p>
                    {selectedOrder.advancePayment > 0 && (
                      <p><span className="text-muted-foreground">Advance Paid:</span> <strong className="text-sky-500 font-extrabold">Rs. {selectedOrder.advancePayment.toLocaleString()}</strong></p>
                    )}
                  </div>

                  <Separator />

                  {/* Items Table */}
                  <div className="rounded-xl border border-border/60 overflow-hidden">
                    <Table>
                      <TableHeader className="bg-muted/60">
                        <TableRow>
                          <TableHead className="text-xs font-bold">Item Description</TableHead>
                          <TableHead className="text-xs font-bold text-center">Status</TableHead>
                          <TableHead className="text-xs font-bold text-center">Qty</TableHead>
                          <TableHead className="text-xs font-bold text-right">Price</TableHead>
                          <TableHead className="text-xs font-bold text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedOrder.items.map((item: any, i: number) => {
                          const itemStatus = getItemKitchenStatus(item, selectedOrder);
                          return (
                            <TableRow key={i} className="hover:bg-muted/30">
                              <TableCell className="text-xs font-semibold py-2">
                                <div className="flex items-center gap-1.5">
                                  {itemStatus === "ready" ? (
                                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                                  ) : itemStatus === "preparing" ? (
                                    <ChefHat className="h-4 w-4 text-sky-500/70 shrink-0" />
                                  ) : (
                                    <AlertCircle className="h-4 w-4 text-amber-500/70 shrink-0" />
                                  )}
                                  <span>{item.name}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-xs text-center py-2">
                                {itemStatus === "ready" ? (
                                  <Badge className="text-[10px] bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-1.5 py-0 font-bold">Ready</Badge>
                                ) : itemStatus === "preparing" ? (
                                  <Badge variant="outline" className="text-[10px] text-sky-500 border-sky-500/30 bg-sky-500/10 px-1.5 py-0 font-bold">Preparing</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30 bg-amber-500/10 px-1.5 py-0 font-bold">Pending</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-xs font-bold text-center py-2">{item.qty}</TableCell>
                              <TableCell className="text-xs font-mono text-right py-2">Rs. {item.price.toLocaleString()}</TableCell>
                              <TableCell className="text-xs font-mono font-bold text-right py-2">Rs. {((item.price * item.qty) - (item.discount || 0)).toLocaleString()}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Totals Summary */}
                  <div className="bg-muted/30 rounded-xl p-3 space-y-1.5 text-xs border border-border/40">
                    <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-mono font-semibold">Rs. {Number(selectedOrder.subtotal).toLocaleString()}</span></div>
                    {selectedOrder.discount > 0 && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="font-mono font-semibold text-destructive">-Rs. {Number(selectedOrder.discount).toLocaleString()}</span></div>
                    )}
                    <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span className="font-mono font-semibold">Rs. {Number(selectedOrder.tax).toLocaleString()}</span></div>
                    <Separator className="my-1" />
                    <div className="flex justify-between font-extrabold text-base pt-0.5">
                      <span>Total Amount</span>
                      <span className="text-primary font-mono">Rs. {selectedOrder.total.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2 pt-3 border-t">
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto rounded-xl font-bold gap-1.5"
                    onClick={() => handleOpenPrintModal(selectedOrder)}
                  >
                    <Printer className="h-4 w-4 text-orange-500" /> Print Slip
                  </Button>

                  <Button variant="outline" className="w-full sm:w-auto rounded-xl font-bold" onClick={() => setSelectedOrder(null)}>Close Window</Button>

                  {selectedOrder.status === "ready" && (
                    <Button
                      disabled={updatingOrderId === selectedOrder.id}
                      className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold rounded-xl shadow-md flex items-center justify-center gap-1.5"
                      onClick={() => handleStatusUpdate(selectedOrder.id, "completed")}
                    >
                      {updatingOrderId === selectedOrder.id ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-1" /> Completing Order...
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4 mr-1.5" /> Mark Completed
                        </>
                      )}
                    </Button>
                  )}
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Order Placed Print Modal (KOT, Bill, Dual Print) ── */}
      <OrderPlacedPrintModal
        open={showOrderPlacedModal}
        onOpenChange={setShowOrderPlacedModal}
        slipData={placedOrderSlip}
      />
    </div>
  );
};

export default OrderStatusBoard;

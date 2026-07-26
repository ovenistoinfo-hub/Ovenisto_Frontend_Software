import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, RefreshCw, Bell, Clock, BarChart3, TrendingUp, ShoppingBag,
  AlertCircle, ChefHat, CheckCircle2, Timer, UtensilsCrossed,
  ShoppingCart, Truck, CreditCard, Banknote, Receipt, Check,
  Columns, LayoutGrid, Sparkles, User
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useData } from "@/contexts/DataContext";
import { orderService } from "@/services/order.service";
import { useVisiblePolling } from "@/hooks/use-visible-polling";
import { useOrderEvents } from "@/hooks/use-order-events";

// ─── Status Definitions & Professional Theme Config ───────────────────────

type FilterStatus = "pending" | "preparing" | "ready" | "completed";

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
  staff: o.staffName || o.staff || "",
  phone: o.phone || "",
  total: Number(o.total),
  advancePayment: Number(o.advancePayment ?? 0),
  date: o.date ? new Date(o.date).toISOString().split("T")[0] : "",
  items: (o.items || []).map((i: any) => ({ ...i, price: Number(i.price) })),
});

// ─── Main Component ─────────────────────────────────────────────────────────

const OrderStatusBoard = () => {
  const navigate = useNavigate();
  const { foodMenuItems } = useData();
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [activeStatus, setActiveStatus] = useState<FilterStatus>("pending");
  const [viewMode, setViewMode] = useState<"columns" | "grid">("columns");
  const [time, setTime] = useState(new Date());
  const [autoRefresh] = useState(true);
  const [soundAlert, setSoundAlert] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      const res = await orderService.getOrders({ limit: 200 });
      setAllOrders((res.data || []).map(normalize));
    } catch {}
  }, []);

  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t); }, []);
  useOrderEvents(loadOrders);
  useVisiblePolling(loadOrders, 60000, autoRefresh);

  // ── Status Filter Counts ──
  const statusCounts: Record<FilterStatus, number> = useMemo(() => ({
    pending: allOrders.filter((o) => o.status === "pending").length,
    preparing: allOrders.filter((o) => o.status === "preparing").length,
    ready: allOrders.filter((o) => o.status === "ready").length,
    completed: allOrders.filter((o) => o.status === "completed").length,
  }), [allOrders]);

  // Active status orders list
  const activeStatusOrders = useMemo(() => {
    return allOrders.filter((o) => o.status === activeStatus);
  }, [allOrders, activeStatus]);

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

  const todayStr = new Date().toISOString().split("T")[0];
  const todayOrders = useMemo(() => allOrders.filter((o) => o.date === todayStr), [allOrders, todayStr]);
  const todayRevenue = useMemo(() => todayOrders.reduce((s: number, o: any) => s + o.total, 0), [todayOrders]);

  // ── Helpers ──
  const isPaid = (o: any) => !!o.paymentMethod && o.paymentMethod !== "Pending" && o.paymentMethod !== "Unpaid";
  const needsPayment = (o: any) =>
    !isPaid(o) && o.status !== "cancelled" && o.status !== "completed" && o.status !== "scheduled";

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
      const created = new Date(order.createdAt || order.date);
      const elapsedMin = Math.max(0, Math.floor((time.getTime() - created.getTime()) / 60000));
      const remainingMin = Math.max(0, maxCookTime - elapsedMin);
      const progress = Math.min(100, (elapsedMin / maxCookTime) * 100);
      return { maxCookTime, elapsedMin, remainingMin, progress, isOverdue: elapsedMin > maxCookTime };
    } catch { return null; }
  };

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    try {
      await orderService.updateOrderStatus(orderId, newStatus);
      setAllOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(prev => prev ? { ...prev, status: newStatus } : null);
      }
      toast.success(`Order #${orderId.slice(-4)} updated to ${newStatus}`);
    } catch {
      toast.error("Failed to update order status");
    }
  };

  const handleLoadToPOS = (order: any) => {
    navigate("/pos", { state: { loadOrderId: order.id, paymentOnly: true } });
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
          {/* Card Top Banner */}
          <div className="px-3.5 py-2.5 flex items-center justify-between border-b border-border/50 bg-muted/20">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm tracking-tight text-foreground">{order.orderNumber}</span>
              <Badge variant="outline" className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-background/80 border-border/60">
                {order.type}
              </Badge>
              {order.tableNumber && (
                <Badge className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-rose-500/90 text-white">
                  T-{order.tableNumber}
                </Badge>
              )}
            </div>
            <span className="text-[10px] font-mono font-bold text-muted-foreground bg-background/80 px-2 py-0.5 rounded-full flex items-center gap-1 border border-border/50">
              <Timer className="h-3 w-3 text-amber-500" />
              {elapsed}
            </span>
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

            {/* Items List Snippet */}
            <div className="bg-muted/30 rounded-lg p-2.5 space-y-1 border border-border/40">
              {order.items.slice(0, 3).map((item: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground truncate font-medium">
                    <span className="font-extrabold text-foreground mr-1">{item.qty}×</span> {item.name}
                  </span>
                  <span className="font-mono text-[11px] font-semibold text-foreground/80">Rs.{(item.price * item.qty).toLocaleString()}</span>
                </div>
              ))}
              {order.items.length > 3 && (
                <p className="text-[10px] text-primary font-bold pt-0.5 text-right">+{order.items.length - 3} more items</p>
              )}
            </div>

            {/* Cooking Progress Bar if applicable */}
            {(order.status === "pending" || order.status === "preparing") && cookInfo && (
              <div className="space-y-1 pt-0.5">
                <div className="flex items-center justify-between text-[10px]">
                  <span className={cn("font-bold flex items-center gap-1", cookInfo.isOverdue ? "text-destructive" : cookInfo.remainingMin <= 2 ? "text-amber-500" : "text-muted-foreground")}>
                    <ChefHat className="h-3 w-3" />
                    {cookInfo.isOverdue ? `Overdue +${cookInfo.elapsedMin - cookInfo.maxCookTime}m` : `${cookInfo.remainingMin}m left`}
                  </span>
                  <span className="text-muted-foreground font-mono">{cookInfo.maxCookTime}m max</span>
                </div>
                <Progress value={cookInfo.progress} className={cn("h-1.5 rounded-full", cookInfo.isOverdue && "[&>div]:bg-destructive", !cookInfo.isOverdue && cookInfo.progress > 75 && "[&>div]:bg-amber-500")} />
              </div>
            )}

            {/* Footer: Price + Payment Status */}
            <div className="flex items-center justify-between pt-1 border-t border-border/40">
              <div>
                <p className="text-[10px] text-muted-foreground font-medium">Total Bill</p>
                <p className="text-sm font-extrabold text-primary font-mono">Rs. {order.total.toLocaleString()}</p>
              </div>

              <Badge className={cn("text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1", paid ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/30" : "bg-amber-500/10 text-amber-500 border border-amber-500/30")}>
                {paid ? <CreditCard className="h-3 w-3" /> : <Banknote className="h-3 w-3" />}
                {paid ? (order.paymentMethod || "Paid") : "Unpaid"}
              </Badge>
            </div>

            {/* Action Button */}
            {order.status === "pending" && (
              <Button
                size="sm"
                onClick={(e) => { e.stopPropagation(); handleStatusUpdate(order.id, "preparing"); }}
                className="w-full h-8 text-xs bg-amber-500 hover:bg-amber-600 text-white font-bold shadow-xs flex items-center justify-center gap-1.5 rounded-lg transition-all"
              >
                <ChefHat className="h-3.5 w-3.5" /> Start Preparing
              </Button>
            )}
            {order.status === "preparing" && (
              <Button
                size="sm"
                onClick={(e) => { e.stopPropagation(); handleStatusUpdate(order.id, "ready"); }}
                className="w-full h-8 text-xs bg-sky-500 hover:bg-sky-600 text-white font-bold shadow-xs flex items-center justify-center gap-1.5 rounded-lg transition-all"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Mark Ready
              </Button>
            )}
            {order.status === "ready" && (
              <Button
                size="sm"
                onClick={(e) => { e.stopPropagation(); handleStatusUpdate(order.id, "completed"); }}
                className="w-full h-8 text-xs bg-emerald-500 hover:bg-emerald-600 text-white font-bold shadow-xs flex items-center justify-center gap-1.5 rounded-lg transition-all"
              >
                <Check className="h-3.5 w-3.5" /> Complete Order
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

      {/* ════════════ TOP 4 HERO STATUS CARDS (NO ALL ORDERS CARD) ════════════ */}
      <div className="px-4 sm:px-6 py-3 bg-card/60 border-b border-border/60 shrink-0">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full">
          {(["pending", "preparing", "ready", "completed"] as FilterStatus[]).map((statusKey) => {
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
            const showLoadToPOS = needsPayment(selectedOrder);

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
                          <TableHead className="text-xs font-bold text-center">Qty</TableHead>
                          <TableHead className="text-xs font-bold text-right">Price</TableHead>
                          <TableHead className="text-xs font-bold text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedOrder.items.map((item: any, i: number) => (
                          <TableRow key={i} className="hover:bg-muted/30">
                            <TableCell className="text-xs font-semibold py-2">{item.name}</TableCell>
                            <TableCell className="text-xs font-bold text-center py-2">{item.qty}</TableCell>
                            <TableCell className="text-xs font-mono text-right py-2">Rs. {item.price.toLocaleString()}</TableCell>
                            <TableCell className="text-xs font-mono font-bold text-right py-2">Rs. {((item.price * item.qty) - (item.discount || 0)).toLocaleString()}</TableCell>
                          </TableRow>
                        ))}
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
                  <Button variant="outline" className="w-full sm:w-auto rounded-xl font-bold" onClick={() => setSelectedOrder(null)}>Close Window</Button>

                  {selectedOrder.status === "pending" && (
                    <Button
                      className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-white font-extrabold rounded-xl shadow-md"
                      onClick={() => handleStatusUpdate(selectedOrder.id, "preparing")}
                    >
                      <ChefHat className="h-4 w-4 mr-1.5" />
                      Start Preparing
                    </Button>
                  )}

                  {selectedOrder.status === "preparing" && (
                    <Button
                      className="w-full sm:w-auto bg-sky-500 hover:bg-sky-600 text-white font-extrabold rounded-xl shadow-md"
                      onClick={() => handleStatusUpdate(selectedOrder.id, "ready")}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1.5" />
                      Mark Ready
                    </Button>
                  )}

                  {selectedOrder.status === "ready" && (
                    <Button
                      className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold rounded-xl shadow-md"
                      onClick={() => handleStatusUpdate(selectedOrder.id, "completed")}
                    >
                      <Check className="h-4 w-4 mr-1.5" />
                      Mark Completed
                    </Button>
                  )}

                  {showLoadToPOS && (
                    <Button
                      className="w-full sm:w-auto gradient-primary text-primary-foreground font-extrabold rounded-xl shadow-md"
                      onClick={() => { setSelectedOrder(null); handleLoadToPOS(selectedOrder); }}
                    >
                      <Receipt className="h-4 w-4 mr-2" />
                      Collect Payment in POS
                    </Button>
                  )}
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrderStatusBoard;

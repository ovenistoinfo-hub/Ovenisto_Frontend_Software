import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { OrderStatus } from "@/data/mock-data";
import {
  ArrowLeft, RefreshCw, Bell, Clock, BarChart3, TrendingUp, ShoppingBag,
  AlertCircle, ChefHat, CheckCircle2, XCircle, Timer, UtensilsCrossed,
  ShoppingCart, Truck, Globe, CreditCard, Banknote, Receipt,
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

// ─── Config ────────────────────────────────────────────────────────────────

const statusConfig: Record<string, { label: string; bg: string; text: string; border: string; icon: typeof Clock; pill: string }> = {
  pending:   { label: "Pending",   bg: "bg-warning/10",     text: "text-warning",     border: "border-l-warning",     icon: AlertCircle,   pill: "bg-warning/10 text-warning border-warning/30" },
  preparing: { label: "Preparing", bg: "bg-accent/10",      text: "text-accent",      border: "border-l-accent",      icon: ChefHat,       pill: "bg-accent/10 text-accent border-accent/30" },
  ready:     { label: "Ready",     bg: "bg-success/10",     text: "text-success",     border: "border-l-success",     icon: CheckCircle2,  pill: "bg-success/10 text-success border-success/30" },
  completed: { label: "Completed", bg: "bg-info/10",        text: "text-info",        border: "border-l-info",        icon: CheckCircle2,  pill: "bg-info/10 text-info border-info/30" },
  cancelled: { label: "Cancelled", bg: "bg-destructive/10", text: "text-destructive", border: "border-l-destructive", icon: XCircle,       pill: "bg-destructive/10 text-destructive border-destructive/30" },
  scheduled: { label: "Scheduled", bg: "bg-info/10",        text: "text-info",        border: "border-l-info",        icon: Clock,         pill: "bg-info/10 text-info border-info/30" },
};

const statusFilters: (OrderStatus | "all")[] = ["all", "pending", "preparing", "ready", "completed"];

type OrderTypeTab = "all" | "dine-in" | "takeaway" | "delivery" | "foodpanda" | "online";

const typeTabs: { key: OrderTypeTab; label: string; icon: typeof UtensilsCrossed; types: string[] }[] = [
  { key: "all",       label: "All Orders", icon: ShoppingBag,     types: [] },
  { key: "dine-in",   label: "Dine In",    icon: UtensilsCrossed, types: ["Dine In", "Self Order"] },
  { key: "takeaway",  label: "Take Away",  icon: ShoppingCart,    types: ["Take Away", "Walk-in"] },
  { key: "delivery",  label: "Delivery",   icon: Truck,           types: ["Delivery"] },
  { key: "foodpanda", label: "Foodpanda",  icon: Globe,           types: ["Foodpanda"] },
  { key: "online",    label: "Online",     icon: Globe,           types: ["Online"] },
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

// ─── Component ─────────────────────────────────────────────────────────────

const OrderStatusBoard = () => {
  const navigate = useNavigate();
  const { foodMenuItems } = useData();
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [typeTab, setTypeTab]     = useState<OrderTypeTab>("all");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [time, setTime] = useState(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [soundAlert, setSoundAlert] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [mounted, setMounted] = useState(false);

  const loadOrders = useCallback(async () => {
    try {
      const res = await orderService.getOrders({ limit: 200 });
      setAllOrders((res.data || []).map(normalize));
    } catch {}
  }, []);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    loadOrders();
    const t = setInterval(loadOrders, 15000);
    return () => clearInterval(t);
  }, [loadOrders]);

  // ── Filtering ──

  const typeFiltered = typeTab === "all"
    ? allOrders
    : allOrders.filter((o) => {
        const tab = typeTabs.find((t) => t.key === typeTab);
        return tab ? tab.types.includes(o.type) : true;
      });

  const displayed = statusFilter === "all"
    ? typeFiltered
    : typeFiltered.filter((o) => o.status === statusFilter);

  // Counts scoped to current type tab
  const statusCounts: Record<string, number> = {
    all:       typeFiltered.length,
    pending:   typeFiltered.filter((o) => o.status === "pending").length,
    preparing: typeFiltered.filter((o) => o.status === "preparing").length,
    ready:     typeFiltered.filter((o) => o.status === "ready").length,
    completed: typeFiltered.filter((o) => o.status === "completed").length,
  };

  // Type tab counts (across all orders)
  const typeTabCounts: Record<OrderTypeTab, number> = {
    all:       allOrders.length,
    "dine-in": allOrders.filter((o) => ["Dine In", "Self Order"].includes(o.type)).length,
    takeaway:  allOrders.filter((o) => ["Take Away", "Walk-in"].includes(o.type)).length,
    delivery:  allOrders.filter((o) => o.type === "Delivery").length,
    foodpanda: allOrders.filter((o) => o.type === "Foodpanda").length,
    online:    allOrders.filter((o) => o.type === "Online").length,
  };

  const todayStr    = new Date().toISOString().split("T")[0];
  const todayOrders = allOrders.filter((o) => o.date === todayStr);
  const todayRevenue = todayOrders.reduce((s: number, o: any) => s + o.total, 0);

  // ── Helpers ──

  const isPaid = (o: any) => !!o.paymentMethod;
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

  // ── Load to POS for payment ──

  const handleLoadToPOS = (order: any) => {
    navigate("/pos", { state: { loadOrderId: order.id, paymentOnly: true } });
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="h-14 bg-card border-b-2 border-primary/15 flex items-center justify-between px-4 sm:px-5 shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full hover:bg-primary/10" asChild>
            <Link to="/"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <Separator orientation="vertical" className="h-8" />
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl gradient-primary flex items-center justify-center shadow-md">
              <BarChart3 className="h-4.5 w-4.5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-foreground">Order Status</h1>
              <p className="text-[10px] text-muted-foreground hidden sm:block">Central order monitoring</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden sm:flex items-center gap-2">
            <Checkbox id="sound" checked={soundAlert} onCheckedChange={(v) => setSoundAlert(!!v)} />
            <Label htmlFor="sound" className="text-xs cursor-pointer flex items-center gap-1 text-muted-foreground">
              <Bell className="h-3 w-3" />Sound
            </Label>
          </div>
          <Badge variant="secondary" className={cn("text-[10px] rounded-full px-2.5 border hidden sm:flex", autoRefresh ? "bg-success/10 text-success border-success/20" : "bg-muted")}>
            <RefreshCw className={cn("h-2.5 w-2.5 mr-1", autoRefresh && "animate-spin")} />
            {autoRefresh ? "Live" : "Paused"}
          </Badge>
          <div className="flex items-center gap-1.5 bg-card border border-border/60 rounded-xl px-2.5 py-1 shadow-sm">
            <Clock className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-mono font-bold text-foreground tracking-tight">
              {time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          </div>
        </div>
      </div>

      {/* ── Order Type Tabs ── */}
      <div className="flex gap-1 px-4 sm:px-5 py-2.5 border-b border-border/60 bg-card/60 shrink-0 overflow-x-auto">
        {typeTabs.map(({ key, label, icon: Icon }) => {
          const isActive = typeTab === key;
          const count = typeTabCounts[key];
          return (
            <button
              key={key}
              onClick={() => { setTypeTab(key); setStatusFilter("all"); }}
              className={cn(
                "flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all whitespace-nowrap shrink-0",
                isActive
                  ? "gradient-primary text-primary-foreground border-transparent shadow-md"
                  : "bg-card border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              <span className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                isActive ? "bg-white/20" : "bg-muted"
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Status Sub-filter ── */}
      <div className="flex gap-1.5 px-4 sm:px-5 py-2 border-b border-border/40 bg-muted/20 shrink-0">
        {statusFilters.map((s) => {
          const isActive = statusFilter === s;
          const cfg = s === "all" ? { label: "All", text: "text-foreground", bg: "bg-muted/60" } : statusConfig[s];
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-all",
                isActive
                  ? s === "all"
                    ? "bg-foreground/10 text-foreground border-foreground/20"
                    : `${cfg.bg} ${cfg.text} border-current/30`
                  : "bg-card border-border/40 text-muted-foreground hover:text-foreground"
              )}
            >
              {cfg.label} · {statusCounts[s]}
            </button>
          );
        })}
      </div>

      {/* ── Order Cards Grid ── */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5">
        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <div className="h-20 w-20 rounded-3xl bg-muted/30 flex items-center justify-center mb-4">
              <ShoppingBag className="h-10 w-10 text-muted-foreground/30" />
            </div>
            <p className="text-lg font-bold text-foreground mb-1">No orders</p>
            <p className="text-sm">Try a different filter or category</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {displayed.map((order, idx) => {
              const cfg = statusConfig[order.status] ?? statusConfig.pending;
              const StatusIcon = cfg.icon;
              const elapsed = getElapsed(order);
              const paid = isPaid(order);

              return (
                <Card
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className={cn(
                    "cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 border-l-4 rounded-xl overflow-hidden animate-in fade-in slide-in-from-bottom-2",
                    cfg.border,
                    !mounted && `animation-delay-[${idx * 30}ms]`
                  )}
                >
                  <CardContent className="p-0">
                    {/* Card Header */}
                    <div className={cn("px-3 pt-2.5 pb-2 flex items-start justify-between gap-1", cfg.bg)}>
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-foreground tracking-tight">{order.orderNumber}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 rounded-full">{order.type}</Badge>
                          {order.tableNumber && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 rounded-full">T-{order.tableNumber}</Badge>
                          )}
                        </div>
                      </div>
                      <div className={cn("h-6 w-6 rounded-lg flex items-center justify-center shrink-0", cfg.bg)}>
                        <StatusIcon className={cn("h-3 w-3", cfg.text)} />
                      </div>
                    </div>

                    <div className="px-3 py-2 space-y-1.5">
                      {/* Customer & staff */}
                      <p className="text-xs font-semibold text-foreground truncate">{order.customer}</p>
                      {order.staff && (
                        <p className="text-[10px] text-muted-foreground truncate">Staff: {order.staff}</p>
                      )}

                      {/* Items */}
                      <div className="space-y-0.5">
                        {order.items.slice(0, 2).map((item: any, i: number) => (
                          <p key={i} className="text-[10px] text-muted-foreground truncate">
                            <span className="font-medium text-foreground">{item.qty}×</span> {item.name}
                          </p>
                        ))}
                        {order.items.length > 2 && (
                          <p className="text-[9px] text-muted-foreground italic">+{order.items.length - 2} more</p>
                        )}
                      </div>

                      {/* Footer: total + payment + time */}
                      <div className="flex items-center justify-between pt-1.5 border-t border-border/40">
                        <span className="font-bold text-sm text-primary">Rs. {order.total.toLocaleString()}</span>
                        <div className="flex items-center gap-1.5">
                          {paid ? (
                            <CreditCard className="h-3 w-3 text-success" />
                          ) : (
                            <Banknote className="h-3 w-3 text-muted-foreground/50" />
                          )}
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <Timer className="h-2.5 w-2.5" />{elapsed}
                          </span>
                        </div>
                      </div>

                      {/* Cooking progress */}
                      {(order.status === "pending" || order.status === "preparing") && (() => {
                        const info = getCookingInfo(order);
                        if (!info) return null;
                        return (
                          <div className="pt-1 space-y-0.5">
                            <div className="flex items-center justify-between text-[9px]">
                              <span className={cn("font-semibold", info.isOverdue ? "text-destructive" : info.remainingMin <= 2 ? "text-warning" : "text-muted-foreground")}>
                                {info.isOverdue ? `Overdue +${info.elapsedMin - info.maxCookTime}m` : `${info.remainingMin}m left`}
                              </span>
                              <span className="text-muted-foreground">{info.maxCookTime}m</span>
                            </div>
                            <Progress value={info.progress} className={cn("h-1", info.isOverdue && "[&>div]:bg-destructive", !info.isOverdue && info.progress > 75 && "[&>div]:bg-warning")} />
                          </div>
                        );
                      })()}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Bottom KPI Bar ── */}
      <div className="bg-card border-t-2 border-primary/10 flex items-center justify-center gap-6 sm:gap-10 px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <ShoppingBag className="h-3.5 w-3.5 text-primary" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Today</p>
            <p className="text-xs font-bold text-foreground">{todayOrders.length} orders</p>
          </div>
        </div>
        <Separator orientation="vertical" className="h-7" />
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-success/10 flex items-center justify-center">
            <TrendingUp className="h-3.5 w-3.5 text-success" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Revenue</p>
            <p className="text-xs font-bold text-foreground">Rs. {todayRevenue.toLocaleString()}</p>
          </div>
        </div>
        <Separator orientation="vertical" className="h-7" />
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-warning/10 flex items-center justify-center">
            <AlertCircle className="h-3.5 w-3.5 text-warning" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Pending</p>
            <p className="text-xs font-bold text-warning">{statusCounts.pending}</p>
          </div>
        </div>
        <Separator orientation="vertical" className="h-7" />
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-accent/10 flex items-center justify-center">
            <ChefHat className="h-3.5 w-3.5 text-accent" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Preparing</p>
            <p className="text-xs font-bold text-accent">{statusCounts.preparing}</p>
          </div>
        </div>
      </div>

      {/* ── Order Detail Dialog ── */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-lg w-[95vw] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          {selectedOrder && (() => {
            const cfg = statusConfig[selectedOrder.status] ?? statusConfig.pending;
            const paid = isPaid(selectedOrder);
            const showLoadToPOS = needsPayment(selectedOrder);

            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-bold tracking-tight">{selectedOrder.orderNumber}</span>
                    <Badge className={cn("text-xs rounded-full px-3 border font-semibold", cfg.pill)}>
                      {cfg.label}
                    </Badge>
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 text-sm">
                  {/* Info grid */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs bg-muted/30 rounded-xl p-3">
                    <p><span className="text-muted-foreground">Type:</span> <strong>{selectedOrder.type}</strong></p>
                    <p><span className="text-muted-foreground">Time:</span> <strong>{selectedOrder.time || getElapsed(selectedOrder)}</strong></p>
                    <p><span className="text-muted-foreground">Customer:</span> <strong>{selectedOrder.customer}</strong></p>
                    <p><span className="text-muted-foreground">Phone:</span> <strong>{selectedOrder.phone || "—"}</strong></p>
                    {selectedOrder.staff && (
                      <p><span className="text-muted-foreground">Staff:</span> <strong>{selectedOrder.staff}</strong></p>
                    )}
                    {selectedOrder.tableNumber && (
                      <p><span className="text-muted-foreground">Table:</span> <strong>#{selectedOrder.tableNumber}</strong></p>
                    )}
                    {selectedOrder.deliveryAddress && (
                      <p className="col-span-2"><span className="text-muted-foreground">Address:</span> <strong>{selectedOrder.deliveryAddress}</strong></p>
                    )}
                    <p>
                      <span className="text-muted-foreground">Payment:</span>{" "}
                      {paid
                        ? <strong className="text-success">{selectedOrder.paymentMethod}</strong>
                        : <strong className="text-warning">Unpaid</strong>
                      }
                    </p>
                    {selectedOrder.advancePayment > 0 && (
                      <p><span className="text-muted-foreground">Advance:</span> <strong className="text-info">Rs. {selectedOrder.advancePayment.toLocaleString()}</strong></p>
                    )}
                  </div>

                  <Separator />

                  {/* Items */}
                  <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableHead className="text-xs min-w-[120px]">Item</TableHead>
                          <TableHead className="text-xs text-center">Qty</TableHead>
                          <TableHead className="text-xs text-right whitespace-nowrap">Price</TableHead>
                          <TableHead className="text-xs text-right whitespace-nowrap">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedOrder.items.map((item: any, i: number) => (
                          <TableRow key={i} className="hover:bg-muted/30">
                            <TableCell className="text-xs py-1.5 font-medium">{item.name}</TableCell>
                            <TableCell className="text-xs text-center py-1.5">{item.qty}</TableCell>
                            <TableCell className="text-xs text-right py-1.5">Rs. {item.price.toLocaleString()}</TableCell>
                            <TableCell className="text-xs text-right py-1.5">Rs. {((item.price * item.qty) - (item.discount || 0)).toLocaleString()}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <Separator />

                  {/* Totals */}
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>Rs. {Number(selectedOrder.subtotal).toLocaleString()}</span></div>
                    {selectedOrder.discount > 0 && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="text-destructive">-Rs. {Number(selectedOrder.discount).toLocaleString()}</span></div>
                    )}
                    <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>Rs. {Number(selectedOrder.tax).toLocaleString()}</span></div>
                    <Separator />
                    <div className="flex justify-between font-bold text-base pt-0.5">
                      <span>Total</span>
                      <span className="text-primary">Rs. {selectedOrder.total.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
                  <Button variant="outline" className="w-full sm:w-auto" onClick={() => setSelectedOrder(null)}>Close</Button>
                  {showLoadToPOS && (
                    <Button
                      className="w-full sm:w-auto gradient-primary text-primary-foreground shadow-md"
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

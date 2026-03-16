import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import type { Order, OrderStatus } from "@/data/mock-data";
import { ArrowLeft, Flame, RefreshCw, Bell, Clock, BarChart3, TrendingUp, ShoppingBag, AlertCircle, ChefHat, CheckCircle2, XCircle, Timer } from "lucide-react";
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

const statusConfig: Record<OrderStatus, { label: string; bg: string; text: string; border: string; icon: typeof Clock; pill: string }> = {
  pending:   { label: "Pending",   bg: "bg-warning/10",     text: "text-warning",     border: "border-l-warning",     icon: AlertCircle,   pill: "bg-warning/10 text-warning border-warning/30" },
  preparing: { label: "Preparing", bg: "bg-accent/10",      text: "text-accent",      border: "border-l-accent",      icon: ChefHat,       pill: "bg-accent/10 text-accent border-accent/30" },
  ready:     { label: "Ready",     bg: "bg-success/10",     text: "text-success",     border: "border-l-success",     icon: CheckCircle2,  pill: "bg-success/10 text-success border-success/30" },
  completed: { label: "Completed", bg: "bg-info/10",        text: "text-info",        border: "border-l-info",        icon: CheckCircle2,  pill: "bg-info/10 text-info border-info/30" },
  cancelled: { label: "Cancelled", bg: "bg-destructive/10", text: "text-destructive", border: "border-l-destructive", icon: XCircle,       pill: "bg-destructive/10 text-destructive border-destructive/30" },
};

const allStatuses: (OrderStatus | "all")[] = ["all", "pending", "preparing", "ready", "completed", "cancelled"];
const nextActionLabel: Record<string, string> = { pending: "Start Preparing", preparing: "Mark Ready", ready: "Mark Completed" };
const nextActionColors: Record<string, string> = { pending: "bg-warning hover:bg-warning/90 text-warning-foreground", preparing: "gradient-primary text-primary-foreground", ready: "bg-success hover:bg-success/90 text-success-foreground" };

const OrderStatusBoard = () => {
  const { orders: allOrders, updateOrderStatus, foodMenuItems } = useData();
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [time, setTime] = useState(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [soundAlert, setSoundAlert] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t); }, []);

  const displayed = filter === "all" ? allOrders : allOrders.filter(o => o.status === filter);
  const counts = {
    all: allOrders.length,
    pending: allOrders.filter(o => o.status === "pending").length,
    preparing: allOrders.filter(o => o.status === "preparing").length,
    ready: allOrders.filter(o => o.status === "ready").length,
    completed: allOrders.filter(o => o.status === "completed").length,
    cancelled: allOrders.filter(o => o.status === "cancelled").length,
  };

  const todayOrders = allOrders.filter(o => o.date === new Date().toISOString().split("T")[0]);
  const todayRevenue = todayOrders.reduce((s, o) => s + o.total, 0);

  const advanceStatus = (order: Order) => {
    const next: Record<string, OrderStatus> = { pending: "preparing", preparing: "ready", ready: "completed" };
    const nextStatus = next[order.status];
    if (!nextStatus) return;
    updateOrderStatus(order.id, nextStatus);
    toast.success(`${order.orderNumber} moved to ${statusConfig[nextStatus].label}`);
    if (selectedOrder?.id === order.id) setSelectedOrder({ ...order, status: nextStatus });
  };

  const getElapsed = (order: Order) => {
    try {
      const [h, m] = order.time.replace(/ (AM|PM)/, "").split(":").map(Number);
      const isPM = order.time.includes("PM");
      const orderDate = new Date(order.date);
      orderDate.setHours(isPM && h !== 12 ? h + 12 : h === 12 && !isPM ? 0 : h, m);
      const diff = Math.max(0, Math.floor((time.getTime() - orderDate.getTime()) / 60000));
      if (diff < 60) return `${diff} min`;
      return `${Math.floor(diff / 60)}h ${diff % 60}m`;
    } catch { return "—"; }
  };

  const getCookingInfo = (order: Order) => {
    const maxCookTime = Math.max(...order.items.map(i => {
      const ct = (i as any).cookingTime;
      if (ct) return ct;
      const menuItem = foodMenuItems.find(fi => fi.name === i.name);
      return (menuItem as any)?.cookingTime || 0;
    }), 0);
    if (maxCookTime <= 0) return null;
    try {
      const [h, m] = order.time.replace(/ (AM|PM)/, "").split(":").map(Number);
      const isPM = order.time.includes("PM");
      const orderDate = new Date(order.date);
      orderDate.setHours(isPM && h !== 12 ? h + 12 : h === 12 && !isPM ? 0 : h, m);
      const elapsedMin = Math.max(0, Math.floor((time.getTime() - orderDate.getTime()) / 60000));
      const remainingMin = Math.max(0, maxCookTime - elapsedMin);
      const progress = Math.min(100, (elapsedMin / maxCookTime) * 100);
      const isOverdue = elapsedMin > maxCookTime;
      return { maxCookTime, elapsedMin, remainingMin, progress, isOverdue };
    } catch { return null; }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="h-16 bg-card border-b-2 border-primary/15 flex items-center justify-between px-4 sm:px-5 shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full hover:bg-primary/10" asChild>
            <Link to="/"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <Separator orientation="vertical" className="h-8" />
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-xl gradient-primary flex items-center justify-center shadow-md">
              <BarChart3 className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-foreground">Order Monitor</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">Live order status board</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <div className="hidden sm:flex items-center gap-2">
            <Checkbox id="sound-alert" checked={soundAlert} onCheckedChange={(v) => setSoundAlert(!!v)} />
            <Label htmlFor="sound-alert" className="text-xs cursor-pointer flex items-center gap-1 text-muted-foreground">
              <Bell className="h-3 w-3" />Sound
            </Label>
          </div>
          <Badge variant="secondary" className={cn("text-xs rounded-full px-3 border hidden sm:flex", autoRefresh ? "bg-success/10 text-success border-success/20" : "bg-muted")}>
            <RefreshCw className={cn("h-3 w-3 mr-1", autoRefresh && "animate-spin")} />
            {autoRefresh ? "Live" : "Paused"}
          </Badge>
          <div className="flex items-center gap-2 bg-card border border-border/60 rounded-xl px-3 py-1.5 shadow-sm">
            <Clock className="h-4 w-4 text-primary" />
            <span className="text-sm font-mono font-bold text-foreground tracking-tight">
              {time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          </div>
        </div>
      </div>

      {/* Status Filter Bar */}
      <div className="flex flex-wrap gap-2 px-4 sm:px-5 py-3 border-b border-border/60 bg-card/40 shrink-0">
        {allStatuses.map((s) => {
          const cfg = s === "all"
            ? { label: "All Orders", bg: "bg-muted/60", text: "text-foreground" }
            : statusConfig[s];
          const isActive = filter === s;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                isActive
                  ? s === "all"
                    ? "bg-foreground text-background border-foreground shadow-sm"
                    : `${cfg.bg} ${cfg.text} border-current shadow-sm ring-1 ring-current ring-offset-1`
                  : "bg-card border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              {s !== "all" && (() => { const Icon = statusConfig[s as OrderStatus].icon; return <Icon className="h-3 w-3" />; })()}
              {cfg.label}
              <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold ml-0.5", isActive ? "bg-background/20" : "bg-muted")}>
                {counts[s]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Order Cards Grid */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5">
        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <div className="h-20 w-20 rounded-3xl bg-muted/30 flex items-center justify-center mb-4">
              <ShoppingBag className="h-10 w-10 text-muted-foreground/30" />
            </div>
            <p className="text-lg font-bold text-foreground mb-1">No orders here</p>
            <p className="text-sm">Try a different filter</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {displayed.map((order, idx) => {
              const cfg = statusConfig[order.status];
              const StatusIcon = cfg.icon;
              const elapsed = getElapsed(order);
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
                    <div className={cn("px-3 pt-3 pb-2 flex items-start justify-between gap-1", cfg.bg)}>
                      <div>
                        <p className="font-bold text-sm text-foreground tracking-tight">{order.orderNumber}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {order.type}{order.tableNumber ? ` · T${order.tableNumber}` : ""}
                        </p>
                      </div>
                      <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center shrink-0", cfg.bg)}>
                        <StatusIcon className={cn("h-3.5 w-3.5", cfg.text)} />
                      </div>
                    </div>

                    <div className="px-3 py-2 space-y-2">
                      {/* Customer */}
                      <p className="text-xs font-semibold text-foreground truncate">{order.customer}</p>

                      {/* Items */}
                      <div className="space-y-0.5">
                        {order.items.slice(0, 3).map((item, i) => (
                          <p key={i} className="text-[11px] text-muted-foreground truncate">
                            <span className="font-medium text-foreground">{item.qty}×</span> {item.name}
                          </p>
                        ))}
                        {order.items.length > 3 && (
                          <p className="text-[10px] text-muted-foreground italic">+{order.items.length - 3} more</p>
                        )}
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-between pt-2 border-t border-border/40">
                        <span className="font-bold text-sm text-primary">Rs. {order.total.toLocaleString()}</span>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Timer className="h-3 w-3" />
                          {elapsed}
                        </div>
                      </div>
                      {(order.status === "pending" || order.status === "preparing") && (() => {
                        const info = getCookingInfo(order);
                        if (!info) return null;
                        return (
                          <div className="pt-1.5 space-y-1">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className={cn("font-semibold", info.isOverdue ? "text-destructive" : info.remainingMin <= 2 ? "text-warning" : "text-muted-foreground")}>
                                {info.isOverdue ? `Overdue +${info.elapsedMin - info.maxCookTime}m` : `${info.remainingMin}m left`}
                              </span>
                              <span className="text-muted-foreground">{info.maxCookTime}m cook</span>
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

      {/* Bottom KPI Bar */}
      <div className="bg-card border-t-2 border-primary/10 flex items-center justify-center gap-6 sm:gap-10 px-4 py-3 shrink-0 shadow-[0_-4px_20px_-8px_hsl(var(--primary)/0.1)]">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <ShoppingBag className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Today's Orders</p>
            <p className="text-sm font-bold text-foreground">{todayOrders.length}</p>
          </div>
        </div>
        <Separator orientation="vertical" className="h-8" />
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center">
            <TrendingUp className="h-4 w-4 text-success" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Revenue</p>
            <p className="text-sm font-bold text-foreground">Rs. {todayRevenue.toLocaleString()}</p>
          </div>
        </div>
        <Separator orientation="vertical" className="h-8" />
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-warning/10 flex items-center justify-center">
            <AlertCircle className="h-4 w-4 text-warning" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pending</p>
            <p className="text-sm font-bold text-warning">{counts.pending}</p>
          </div>
        </div>
      </div>

      {/* Order Detail Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-lg w-[95vw] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          {selectedOrder && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-bold tracking-tight">{selectedOrder.orderNumber}</span>
                  <Badge className={cn("text-xs rounded-full px-3 border font-semibold", statusConfig[selectedOrder.status].pill)}>
                    {statusConfig[selectedOrder.status].label}
                  </Badge>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-muted/30 rounded-xl p-3">
                  <p><span className="text-muted-foreground">Date:</span> <strong>{selectedOrder.date}</strong></p>
                  <p><span className="text-muted-foreground">Time:</span> <strong>{selectedOrder.time}</strong></p>
                  <p><span className="text-muted-foreground">Customer:</span> <strong>{selectedOrder.customer}</strong></p>
                  <p><span className="text-muted-foreground">Phone:</span> <strong>{selectedOrder.phone}</strong></p>
                  <p><span className="text-muted-foreground">Type:</span> <strong>{selectedOrder.type}</strong></p>
                  <p><span className="text-muted-foreground">Staff:</span> <strong>{selectedOrder.staff}</strong></p>
                  {selectedOrder.tableNumber && <p><span className="text-muted-foreground">Table:</span> <strong>#{selectedOrder.tableNumber}</strong></p>}
                  {selectedOrder.deliveryAddress && <p className="sm:col-span-2"><span className="text-muted-foreground">Address:</span> <strong>{selectedOrder.deliveryAddress}</strong></p>}
                </div>
                <Separator />
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
                      {selectedOrder.items.map((item, i) => (
                        <TableRow key={i} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="text-xs py-2 font-medium">{item.name}</TableCell>
                          <TableCell className="text-xs text-center py-2">{item.qty}</TableCell>
                          <TableCell className="text-xs text-right py-2 whitespace-nowrap">Rs. {item.price.toLocaleString()}</TableCell>
                          <TableCell className="text-xs text-right py-2 whitespace-nowrap">Rs. {((item.price * item.qty) - item.discount).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <Separator />
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>Rs. {selectedOrder.subtotal.toLocaleString()}</span></div>
                  {selectedOrder.discount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="text-destructive">-Rs. {selectedOrder.discount.toLocaleString()}</span></div>}
                  <div className="flex justify-between"><span className="text-muted-foreground">Tax (16%)</span><span>Rs. {selectedOrder.tax.toLocaleString()}</span></div>
                  <Separator />
                  <div className="flex justify-between font-bold text-base pt-0.5"><span>Total</span><span className="text-primary">Rs. {selectedOrder.total.toLocaleString()}</span></div>
                </div>
                <p className="text-xs text-muted-foreground"><strong className="text-foreground">Payment:</strong> {selectedOrder.paymentMethod}</p>
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button variant="outline" className="w-full sm:w-auto" onClick={() => setSelectedOrder(null)}>Close</Button>
                {nextActionLabel[selectedOrder.status] && (
                  <Button
                    className={cn("w-full sm:w-auto shadow-md", nextActionColors[selectedOrder.status])}
                    onClick={() => advanceStatus(selectedOrder)}
                  >
                    {nextActionLabel[selectedOrder.status]}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrderStatusBoard;

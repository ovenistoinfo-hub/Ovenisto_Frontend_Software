import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Bell, Clock, Flame, ChefHat, CheckCircle2, Timer, Utensils } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useData } from "@/contexts/DataContext";
import { ORDER_TYPE_COLORS } from "@/lib/constants";

type KitchenOrderStatus = "new" | "preparing" | "ready" | "completed";

interface KitchenOrder {
  id: string; orderNumber: string; type: string;
  items: { name: string; qty: number; cookingTime?: number }[];
  placedAt: Date; status: KitchenOrderStatus;
  maxCookingTime: number;
}

const typeColors = ORDER_TYPE_COLORS;

const statusConfig: Record<KitchenOrderStatus, { border: string; bg: string; icon: typeof Clock; iconColor: string; label: string }> = {
  new: { border: "border-l-info", bg: "bg-info/5 hover:bg-info/8", icon: Bell, iconColor: "text-info", label: "New" },
  preparing: { border: "border-l-warning", bg: "bg-warning/5 hover:bg-warning/8", icon: Flame, iconColor: "text-warning", label: "Preparing" },
  ready: { border: "border-l-success", bg: "bg-success/5 hover:bg-success/8", icon: CheckCircle2, iconColor: "text-success", label: "Ready" },
  completed: { border: "border-l-muted-foreground/30", bg: "bg-muted/30 opacity-60", icon: CheckCircle2, iconColor: "text-muted-foreground", label: "Completed" },
};

const KitchenPanel = () => {
  const { id } = useParams();
  const { kitchens, orders, foodMenuItems, updateOrderStatus } = useData();
  const kitchen = kitchens.find((k) => k.id === id) || kitchens[0];
  const [clock, setClock] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState<"all" | KitchenOrderStatus>("all");

  const [kitchenOrders, setKitchenOrders] = useState<KitchenOrder[]>(() => {
    const kitchenCategories = kitchen.categories;
    const kitchenMenuItems = foodMenuItems.filter((fi) => kitchenCategories.includes(fi.category)).map((fi) => fi.name);
    return orders
      .filter((o) => o.status !== "completed" && o.status !== "cancelled")
      .filter((o) => o.items.some((item) => kitchenMenuItems.includes(item.name)))
      .map((o, idx) => {
        const filteredItems = o.items.filter((item) => kitchenMenuItems.includes(item.name)).map((item) => {
          const menuItem = foodMenuItems.find(fi => fi.name === item.name);
          return { name: item.name, qty: item.qty, cookingTime: (item as any).cookingTime || (menuItem as any)?.cookingTime || 0 };
        });
        const maxCookingTime = Math.max(...filteredItems.map(i => i.cookingTime || 0), 0);
        return {
          id: o.id, orderNumber: o.orderNumber, type: o.type,
          items: filteredItems,
          placedAt: new Date(Date.now() - (idx + 1) * 3 * 60000),
          status: (o.status === "preparing" ? "preparing" : "new") as KitchenOrderStatus,
          maxCookingTime,
        };
      });
  });

  useEffect(() => { const interval = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(interval); }, []);

  const getElapsedMinutes = (placedAt: Date) => Math.floor((Date.now() - placedAt.getTime()) / 60000);

  const advanceStatus = (orderId: string) => {
    setKitchenOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o;
        const next: Record<KitchenOrderStatus, KitchenOrderStatus> = { new: "preparing", preparing: "ready", ready: "completed", completed: "completed" };
        const newStatus = next[o.status];
        toast.success(`Order ${o.orderNumber} moved to ${newStatus}`);
        if (newStatus === "completed") updateOrderStatus(orderId, "completed");
        else if (newStatus === "ready") updateOrderStatus(orderId, "ready");
        else if (newStatus === "preparing") updateOrderStatus(orderId, "preparing");
        return { ...o, status: newStatus };
      })
    );
  };

  const newOrderCount = kitchenOrders.filter((o) => o.status === "new").length;
  const preparingCount = kitchenOrders.filter((o) => o.status === "preparing").length;
  const readyCount = kitchenOrders.filter((o) => o.status === "ready").length;
  const displayed = kitchenOrders.filter((o) => statusFilter === "all" || o.status === statusFilter).sort((a, b) => a.placedAt.getTime() - b.placedAt.getTime());
  const btnLabel: Record<KitchenOrderStatus, string> = { new: "Accept Order", preparing: "Mark Ready", ready: "Complete", completed: "Done" };
  const btnColors: Record<KitchenOrderStatus, string> = {
    new: "bg-warning hover:bg-warning/90 text-warning-foreground shadow-md",
    preparing: "gradient-primary text-primary-foreground shadow-md ring-2 ring-accent/50 ring-offset-2",
    ready: "bg-success hover:bg-success/90 text-success-foreground shadow-md",
    completed: "bg-muted text-muted-foreground",
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="h-16 bg-card border-b-2 border-primary/15 flex items-center justify-between px-5 shrink-0 shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" className="rounded-lg hover:bg-primary/10" asChild>
            <Link to="/kitchens"><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Link>
          </Button>
          <Separator orientation="vertical" className="h-8" />
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-xl gradient-primary flex items-center justify-center shadow-md">
              <ChefHat className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-foreground">{kitchen.name}</h1>
              <p className="text-xs text-muted-foreground">Kitchen Display</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-5">
          {/* Status Filter Buttons */}
          <div className="flex gap-1.5 bg-muted/50 p-1 rounded-xl">
            {(["all", "new", "preparing", "ready"] as const).map((s) => (
              <Button
                key={s}
                variant={statusFilter === s ? "default" : "ghost"}
                size="sm"
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "text-xs capitalize rounded-lg h-8 px-3 transition-all",
                  statusFilter === s && "gradient-primary text-primary-foreground shadow-sm"
                )}
              >
                {s === "all" ? "All" : s}
              </Button>
            ))}
          </div>

          {/* Stats Badges */}
          <div className="flex items-center gap-2">
            {newOrderCount > 0 && (
              <div className="flex items-center gap-1.5 bg-info/10 border border-info/30 rounded-full px-3 py-1.5">
                <Bell className="h-4 w-4 text-info animate-bounce" />
                <span className="text-xs font-bold text-info">{newOrderCount} new</span>
              </div>
            )}
            {preparingCount > 0 && (
              <div className="flex items-center gap-1.5 bg-warning/10 border border-warning/30 rounded-full px-3 py-1.5">
                <Flame className="h-4 w-4 text-warning" />
                <span className="text-xs font-bold text-warning">{preparingCount}</span>
              </div>
            )}
            {readyCount > 0 && (
              <div className="flex items-center gap-1.5 bg-success/10 border border-success/30 rounded-full px-3 py-1.5">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <span className="text-xs font-bold text-success">{readyCount}</span>
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

      {/* Orders Grid */}
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {displayed.map((order) => {
              const elapsed = getElapsedMinutes(order.placedAt);
              const cfg = statusConfig[order.status];
              const StatusIcon = cfg.icon;
              const cookTime = order.maxCookingTime || 10;
              const isOverdue = elapsed > cookTime;
              const remainingMin = Math.max(0, cookTime - elapsed);
              const progress = Math.min(100, (elapsed / cookTime) * 100);

              return (
                <Card
                  key={order.id}
                  className={cn(
                    "transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 border-l-4 rounded-xl overflow-hidden group",
                    cfg.border, cfg.bg,
                    order.status === "preparing" && "animate-pulse"
                  )}
                >
                  <CardContent className="p-0">
                    {/* Card Header */}
                    <div className="px-4 pt-4 pb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", `bg-${order.status === "new" ? "info" : order.status === "preparing" ? "warning" : order.status === "ready" ? "success" : "muted"}/10`)}>
                          <StatusIcon className={cn("h-4 w-4", cfg.iconColor)} />
                        </div>
                        <span className="text-lg font-bold tracking-tight text-foreground">{order.orderNumber}</span>
                      </div>
                      <Badge variant="secondary" className={cn("text-[10px] font-semibold rounded-full px-2.5 border", typeColors[order.type])}>
                        {order.type}
                      </Badge>
                    </div>

                    {/* Timer with Countdown */}
                    <div className="mx-4 mb-2 space-y-1.5">
                      <div className={cn(
                        "flex items-center justify-between text-sm px-2.5 py-1 rounded-lg",
                        isOverdue ? "bg-destructive/10 text-destructive font-bold" : "bg-muted/50 text-muted-foreground"
                      )}>
                        <div className="flex items-center gap-1.5">
                          <Timer className="h-3.5 w-3.5" />
                          <span className="font-medium">{elapsed} min</span>
                        </div>
                        {order.status !== "ready" && order.status !== "completed" && (
                          <span className={cn("text-xs font-bold", isOverdue ? "text-destructive" : remainingMin <= 2 ? "text-warning" : "text-muted-foreground")}>
                            {isOverdue ? `+${elapsed - cookTime}m over` : `${remainingMin}m left`}
                          </span>
                        )}
                      </div>
                      {order.status !== "ready" && order.status !== "completed" && cookTime > 0 && (
                        <Progress value={progress} className={cn("h-1.5 mx-0.5", isOverdue && "[&>div]:bg-destructive", !isOverdue && progress > 75 && "[&>div]:bg-warning")} />
                      )}
                    </div>

                    {/* Items List */}
                    <div className="px-4 pb-3 space-y-1.5 min-h-[70px]">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center text-sm">
                          <span className="font-medium text-foreground">{item.name}</span>
                          <div className="flex items-center gap-1.5">
                            {item.cookingTime ? (
                              <span className="text-[10px] text-muted-foreground">{item.cookingTime}m</span>
                            ) : null}
                            <span className="text-xs font-bold bg-muted/60 px-2 py-0.5 rounded-full text-muted-foreground">×{item.qty}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <Separator />

                    {/* Action Button */}
                    <div className="p-3">
                      {order.status !== "completed" ? (
                        <Button
                          className={cn("w-full text-sm font-semibold rounded-lg h-11 transition-all", btnColors[order.status])}
                          onClick={() => advanceStatus(order.id)}
                        >
                          {order.status === "new" && <Bell className="h-4 w-4 mr-1.5" />}
                          {order.status === "preparing" && <Flame className="h-4 w-4 mr-1.5" />}
                          {order.status === "ready" && <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                          {btnLabel[order.status]}
                        </Button>
                      ) : (
                        <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground font-medium py-2">
                          <CheckCircle2 className="h-4 w-4" />
                          Completed
                        </div>
                      )}
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

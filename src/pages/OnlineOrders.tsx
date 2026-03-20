import { useState, useMemo, useEffect, useCallback } from "react";
import { Globe, Check, X, CheckCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { useData } from "@/contexts/DataContext";
import { orderService } from "@/services/order.service";
import { toast } from "sonner";
import { ORDER_STATUS_COLORS } from "@/lib/constants";

const statusColors: Record<string, string> = {
  ...ORDER_STATUS_COLORS,
  pending: "bg-warning/10 text-warning border-warning/30",
  preparing: "bg-accent/10 text-accent border-accent/30",
  ready: "bg-success/10 text-success border-success/30",
  cancelled: "bg-destructive/10 text-destructive border-destructive/30",
};

const normalize = (o: any) => ({
  ...o,
  customer: o.customerName || o.customer || "Walk-in",
  staff: o.staffName || o.staff || "",
  phone: o.phone || "",
  total: Number(o.total),
  date: o.date ? new Date(o.date).toISOString().split("T")[0] : "",
  items: (o.items || []).map((i: any) => ({ ...i, price: Number(i.price) })),
});

const OnlineOrders = () => {
  const { settings } = useData();
  const currency = settings.currency || "Rs.";
  const [tab, setTab] = useState("All");
  const [apiOrders, setApiOrders] = useState<any[]>([]);

  const loadOrders = useCallback(async () => {
    try {
      const res = await orderService.getOrders({ limit: 200 });
      const all = (res.data || []).map(normalize);
      // show Online type + self-order staff
      setApiOrders(all.filter((o: any) => o.type === "Online" || o.type === "Self Order" || o.staff === "Self Order" || o.staff === "Website"));
    } catch {}
  }, []);

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 30000);
    return () => clearInterval(interval);
  }, [loadOrders]);

  const onlineOrders = useMemo(() =>
    [...apiOrders].sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    [apiOrders]);

  const filtered = useMemo(() => {
    if (tab === "New") return onlineOrders.filter(o => o.status === "pending");
    if (tab === "Accepted") return onlineOrders.filter(o => o.status === "preparing");
    if (tab === "Ready") return onlineOrders.filter(o => o.status === "ready");
    return onlineOrders;
  }, [onlineOrders, tab]);

  const newCount = onlineOrders.filter(o => o.status === "pending").length;
  const todayStr = new Date().toISOString().split("T")[0];
  const todayOrders = onlineOrders.filter(o => o.date === todayStr);
  const todayRevenue = todayOrders.filter(o => o.status === "completed").reduce((s: number, o: any) => s + o.total, 0);

  const updateStatus = async (id: string, status: string, msg: string) => {
    setApiOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    try { await orderService.updateOrderStatus(id, status); toast.success(msg); }
    catch { loadOrders(); toast.error("Update failed"); }
  };

  const accept = (id: string) => updateStatus(id, "preparing", "Order accepted");
  const reject = (id: string) => updateStatus(id, "cancelled", "Order rejected");
  const markReady = (id: string) => updateStatus(id, "ready", "Marked ready");
  const markComplete = (id: string) => updateStatus(id, "completed", "Completed");

  const tabs = [
    { key: "All", label: "All" },
    { key: "New", label: `New (${newCount})` },
    { key: "Accepted", label: "Accepted" },
    { key: "Ready", label: "Ready" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader icon={<Globe className="h-5 w-5" />} title="Online Orders" subtitle="Incoming website & self-order orders"
        actions={<div className="flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-destructive animate-pulse" /><span className="text-xs text-muted-foreground">Live</span></div>} />
      <div className="flex gap-1.5 flex-wrap">{tabs.map(t => (
        <Button key={t.key} variant={tab === t.key ? "default" : "outline"} size="sm" onClick={() => setTab(t.key)} className={tab === t.key ? "gradient-primary text-primary-foreground" : ""}>{t.label}</Button>
      ))}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(o => (
          <Card key={o.id} className={`shadow-sm border ${statusColors[o.status]?.split(" ").pop() || ""}`}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-sm">{o.orderNumber}</span>
                  <Badge variant="secondary" className={`ml-2 ${statusColors[o.status]}`}>{o.status}</Badge>
                </div>
                <span className="text-xs text-muted-foreground">{o.time}</span>
              </div>
              <div className="text-sm"><p className="font-medium">{o.customer}</p>{o.phone && <p className="text-xs text-muted-foreground">{o.phone}</p>}</div>
              <div className="border-t border-border pt-2 space-y-1">{o.items.map((item, i) => (
                <div key={i} className="flex justify-between text-sm"><span>{item.qty}x {item.name}</span><span>{currency} {(item.price * item.qty).toLocaleString()}</span></div>
              ))}</div>
              <div className="flex justify-between font-bold text-sm border-t border-border pt-2"><span>Total</span><span className="text-primary">{currency} {o.total.toLocaleString()}</span></div>
              <div className="text-xs text-muted-foreground">Type: {o.type} · Staff: {o.staff}{o.tableNumber ? ` · Table #${o.tableNumber}` : ""}</div>
              <div className="flex gap-2">
                {o.status === "pending" && <><Button size="sm" className="flex-1 gradient-primary text-primary-foreground" onClick={() => accept(o.id)}><Check className="h-4 w-4 mr-1" />Accept</Button><Button size="sm" variant="destructive" className="flex-1" onClick={() => reject(o.id)}><X className="h-4 w-4 mr-1" />Reject</Button></>}
                {o.status === "preparing" && <Button size="sm" className="w-full gradient-primary text-primary-foreground" onClick={() => markReady(o.id)}><Check className="h-4 w-4 mr-1" />Mark Ready</Button>}
                {o.status === "ready" && <Button size="sm" className="w-full gradient-primary text-primary-foreground" onClick={() => markComplete(o.id)}><CheckCircle className="h-4 w-4 mr-1" />Complete</Button>}
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && <p className="text-muted-foreground col-span-full text-center py-12">No online orders</p>}
      </div>
      <Card className="shadow-sm"><CardContent className="p-4 flex flex-wrap gap-6 text-sm">
        <div><span className="text-muted-foreground">Today:</span> <strong>{todayOrders.length} orders</strong></div>
        <div><span className="text-muted-foreground">Revenue:</span> <strong>{currency} {todayRevenue.toLocaleString()}</strong></div>
      </CardContent></Card>
    </div>
  );
};
export default OnlineOrders;

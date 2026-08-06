import { useState, useCallback } from "react";
import { Bike, MapPin, Phone, Clock, CheckCircle2, Truck, RotateCcw, RefreshCw, Package, TrendingUp, Banknote, Wallet, Bell, Navigation, ArrowUpRight, ShieldAlert, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { deliveryService, type RiderRecord, type AssignmentRecord, type PendingDeliveryOrder } from "@/services/delivery.service";
import { useVisiblePolling } from "@/hooks/use-visible-polling";
import { useOrderEvents } from "@/hooks/use-order-events";
import { useDeliveryEvents } from "@/hooks/use-delivery-events";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getDeliveryPaymentMode, getRiderCollectAmount } from "@/utils/deliveryPayment";

const STATUS_CONFIG: Record<string, { label: string; class: string; border: string }> = {
  pending:    { label: "NEW ASSIGNMENT", class: "bg-amber-500/15 text-amber-400 border-amber-500/30", border: "border-l-amber-500" },
  accepted:   { label: "ACCEPTED",       class: "bg-blue-500/15 text-blue-400 border-blue-500/30", border: "border-l-blue-500" },
  dispatched: { label: "ON THE WAY",     class: "bg-orange-500/15 text-orange-400 border-orange-500/30", border: "border-l-orange-500 animate-pulse" },
  delivered:  { label: "DELIVERED",      class: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", border: "border-l-emerald-500" },
  returned:   { label: "RETURNED",       class: "bg-rose-500/15 text-rose-400 border-rose-500/30", border: "border-l-rose-500" },
};

const RiderPortal = () => {
  const { settings } = useData();
  const { user }     = useAuth();
  const currency     = settings?.currency || "Rs.";

  const [rider, setRider]                 = useState<RiderRecord | null>(null);
  const [assignments, setAssignments]     = useState<AssignmentRecord[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingDeliveryOrder[]>([]);
  const [stats, setStats]                 = useState<{ todayOrders: number; todaySales: number; totalOrders: number; totalSales: number; pendingCash: number } | null>(null);
  const [loading, setLoading]             = useState(true);
  const [actionIds, setActionIds]         = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    try {
      const [assignRes, statsRes, pending] = await Promise.all([
        deliveryService.getMyAssignments(),
        deliveryService.getMyStats(),
        deliveryService.getPendingDeliveryOrders(),
      ]);
      setRider(assignRes.rider);
      setAssignments(assignRes.assignments);
      setStats(statsRes);
      setPendingOrders(pending);
    } catch (err: any) {
      if (err?.message?.includes('rider profile')) {
        toast.error("No rider profile linked to your account. Ask your manager to set it up.", { duration: 8000 });
      } else {
        toast.error("Failed to load assignments");
      }
    } finally { setLoading(false); }
  }, []);

  // Real-time socket events
  useOrderEvents(loadData);
  useDeliveryEvents(loadData);
  useVisiblePolling(loadData, 120_000);

  const doAction = async (assignmentId: string, status: AssignmentRecord['status']) => {
    setActionIds(prev => new Set([...prev, assignmentId]));
    try {
      await deliveryService.updateStatus(assignmentId, status);
      const labels: Record<string, string> = {
        accepted: "Order accepted!",
        dispatched: "Dispatched! You are on the way",
        delivered: "Order delivered successfully!",
        returned: "Order marked as returned"
      };
      toast.success(labels[status] || "Status updated");
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || "Action failed");
    } finally {
      setActionIds(prev => { const n = new Set(prev); n.delete(assignmentId); return n; });
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-3">
        <Bike className="h-12 w-12 text-amber-500 mx-auto animate-bounce" />
        <p className="text-sm font-semibold text-muted-foreground">Loading Rider Portal...</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 max-w-xl mx-auto pb-12 px-1 sm:px-0">
      {/* Mobile Top Bar */}
      <div className="bg-card border border-border/80 rounded-2xl p-3.5 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-10 w-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
            <Bike className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base text-foreground">{user?.name || "Rider"}</span>
              {rider && (
                <Badge variant="outline" className={cn("text-[10px] font-bold px-2 py-0.5",
                  rider.status === "available" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                )}>
                  {rider.status === "on_delivery" ? "On Delivery Run" : "Available"}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Rider Partner Portal</p>
          </div>
        </div>

        <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-amber-500/10 hover:text-amber-500" onClick={loadData}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Mobile Ergonomic Quick Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-2.5">
          <Card className="shadow-sm border-border bg-card">
            <CardContent className="p-3 text-center space-y-0.5">
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Today</p>
              <p className="text-2xl font-black text-amber-500">{stats.todayOrders}</p>
              <p className="text-[10px] text-muted-foreground font-medium">Deliveries</p>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border bg-card">
            <CardContent className="p-3 text-center space-y-0.5">
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Sales</p>
              <p className="text-lg font-black text-emerald-500">{currency} {stats.todaySales.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground font-medium">Earned</p>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border bg-card">
            <CardContent className="p-3 text-center space-y-0.5">
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Cash to Hand</p>
              <p className={cn("text-lg font-black", stats.pendingCash > 0 ? "text-amber-500 animate-pulse" : "text-muted-foreground")}>
                {currency} {stats.pendingCash.toLocaleString()}
              </p>
              <p className="text-[10px] text-muted-foreground font-medium">To Manager</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="active" className="w-full">
        <TabsList className="w-full bg-muted/60 p-1 border border-border/50">
          <TabsTrigger value="active" className="flex-1 gap-2 data-[state=active]:bg-card data-[state=active]:text-amber-500 font-bold text-xs py-2">
            <Package className="h-4 w-4" />
            Active Runs
            {assignments.filter(a => a.status !== "delivered").length > 0 && (
              <Badge className="h-5 px-1.5 text-[10px] bg-amber-500 text-black font-extrabold rounded-full ml-1">
                {assignments.filter(a => a.status !== "delivered").length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="stats" className="flex-1 gap-2 data-[state=active]:bg-card data-[state=active]:text-amber-500 font-bold text-xs py-2">
            <TrendingUp className="h-4 w-4" />
            My Performance
          </TabsTrigger>
        </TabsList>

        {/* Active Assignments Tab */}
        <TabsContent value="active" className="mt-3 space-y-4">

          {/* Incoming Unassigned Notification for Riders */}
          {pendingOrders.length > 0 && assignments.length === 0 && (
            <div className="bg-amber-500/10 border-2 border-amber-500/30 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-amber-500 animate-bounce" />
                <div>
                  <h4 className="text-sm font-extrabold text-amber-500 uppercase tracking-wide">
                    New Orders in Kitchen ({pendingOrders.length})
                  </h4>
                  <p className="text-xs text-muted-foreground">Manager will assign your next delivery run shortly</p>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                {pendingOrders.slice(0, 3).map((o) => (
                  <div key={o.id} className="bg-card border border-amber-500/20 rounded-xl p-3 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-black text-sm text-foreground">#{o.orderNumber}</span>
                      <p className="text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3 text-amber-500" />
                        <span className="truncate max-w-[180px]">{o.deliveryAddress || "Walk-in"}</span>
                      </p>
                    </div>
                    <span className="font-extrabold text-amber-500 text-sm">{currency} {Number(o.total).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {assignments.length === 0 && pendingOrders.length === 0 ? (
            <Card className="border-dashed py-14 text-center space-y-3 bg-card">
              <div className="h-16 w-16 bg-muted/30 rounded-full flex items-center justify-center mx-auto text-muted-foreground/40">
                <Package className="h-8 w-8" />
              </div>
              <div className="space-y-1">
                <p className="text-base font-bold text-foreground">No Active Deliveries Right Now</p>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                  You are ready to ride! When a manager assigns you a delivery, it will automatically sound and flash here.
                </p>
              </div>
            </Card>
          ) : (
            assignments.map(a => {
              const statusCfg = STATUS_CONFIG[a.status] || { label: a.status.toUpperCase(), class: "bg-muted text-muted-foreground", border: "border-l-muted" };

              const payMethod  = a.order?.paymentMethod;
              const advPaid    = Number(a.order?.advancePayment ?? 0);
              const orderTotal = Number(a.order?.total ?? 0);
              const mode       = getDeliveryPaymentMode(payMethod, advPaid);
              const toCollect  = Number(a.amountToCollect ?? getRiderCollectAmount(orderTotal, advPaid, mode));

              const isActionLoading = actionIds.has(a.id);

              return (
                <Card key={a.id} className={cn("shadow-md bg-card border-2 border-border/80 border-l-8 overflow-hidden", statusCfg.border)}>
                  <CardContent className="p-4 space-y-4">

                    {/* Order Header & Status Badge */}
                    <div className="flex items-center justify-between border-b border-border/60 pb-3">
                      <div>
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">ORDER NUMBER</span>
                        <h3 className="text-2xl font-black text-foreground tracking-tight">#{a.order?.orderNumber}</h3>
                      </div>
                      <Badge variant="outline" className={cn("font-black text-xs px-3 py-1 tracking-wider rounded-lg", statusCfg.class)}>
                        {statusCfg.label}
                      </Badge>
                    </div>

                    {/* Customer & Address Card with Quick Action Buttons */}
                    <div className="bg-muted/50 border border-border/60 rounded-xl p-3.5 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">CUSTOMER</p>
                          <p className="text-base font-extrabold text-foreground">{a.order?.customerName || "Walk-in Guest"}</p>
                        </div>
                      </div>

                      {/* Address */}
                      <div className="space-y-1">
                        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">DELIVERY ADDRESS</p>
                        <div className="flex items-start gap-2 text-sm font-semibold text-foreground">
                          <MapPin className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                          <span>{a.customerAddress || "No address provided"}</span>
                        </div>
                      </div>

                      {/* Rider Quick Action Buttons (Call Customer + Maps Navigation) */}
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        {a.customerPhone ? (
                          <a
                            href={`tel:${a.customerPhone}`}
                            className="flex items-center justify-center gap-2 h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs shadow-sm transition-all active:scale-95">
                            <Phone className="h-4 w-4" />
                            Call Customer
                          </a>
                        ) : (
                          <Button disabled variant="outline" className="h-11 rounded-xl text-xs font-bold">
                            No Phone Listed
                          </Button>
                        )}

                        {a.customerAddress ? (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.customerAddress)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-center gap-2 h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition-all active:scale-95">
                            <Navigation className="h-4 w-4" />
                            Navigate Maps
                          </a>
                        ) : (
                          <Button disabled variant="outline" className="h-11 rounded-xl text-xs font-bold">
                            No Map Address
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* HIGH VISIBILITY CASH COLLECTION BANNER */}
                    <div className="rounded-xl overflow-hidden">
                      {(mode === "cod" || mode === "advance") ? (
                        <div className="bg-gradient-to-r from-amber-500/20 via-amber-500/15 to-amber-500/20 border-2 border-amber-500/40 p-3.5 flex items-center justify-between shadow-inner">
                          <div>
                            <p className="text-xs font-extrabold text-amber-400 uppercase tracking-wide flex items-center gap-1.5">
                              <Banknote className="h-4 w-4" />
                              CASH TO COLLECT FROM CUSTOMER
                            </p>
                            <p className="text-2xl font-black text-amber-400 mt-0.5">
                              {currency} {toCollect.toLocaleString()}
                            </p>
                          </div>
                          <div className="h-10 w-10 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                            <Wallet className="h-6 w-6" />
                          </div>
                        </div>
                      ) : (
                        <div className="bg-emerald-500/15 border-2 border-emerald-500/30 p-3 flex items-center justify-between">
                          <div>
                            <p className="text-xs font-extrabold text-emerald-400 uppercase tracking-wide flex items-center gap-1.5">
                              <CheckCircle2 className="h-4 w-4" />
                              PREPAID ORDER — DO NOT COLLECT CASH
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">Order was paid online beforehand.</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* LARGE MOBILE TOUCH STEP ACTION BUTTONS */}
                    <div className="pt-2">
                      {a.status === "pending" && (
                        <Button
                          className="w-full h-14 bg-amber-500 hover:bg-amber-600 text-black font-black text-base rounded-2xl shadow-lg gap-2 active:scale-95 transition-all"
                          disabled={isActionLoading}
                          onClick={() => doAction(a.id, "accepted")}>
                          {isActionLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                          {isActionLoading ? "ACCEPTING..." : "ACCEPT DELIVERY RUN"}
                        </Button>
                      )}

                      {a.status === "accepted" && (
                        <Button
                          className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white font-black text-base rounded-2xl shadow-lg gap-2 active:scale-95 transition-all"
                          disabled={isActionLoading}
                          onClick={() => doAction(a.id, "dispatched")}>
                          {isActionLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Truck className="h-5 w-5" />}
                          {isActionLoading ? "DISPATCHING..." : "START DELIVERY (ON THE WAY)"}
                        </Button>
                      )}

                      {a.status === "dispatched" && (
                        <div className="space-y-2">
                          <Button
                            className="w-full h-14 bg-emerald-500 hover:bg-emerald-600 text-black font-black text-base rounded-2xl shadow-lg gap-2 active:scale-95 transition-all"
                            disabled={isActionLoading}
                            onClick={() => doAction(a.id, "delivered")}>
                            {isActionLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-6 w-6" />}
                            {isActionLoading ? "COMPLETING..." : "MARK AS DELIVERED"}
                          </Button>

                          <Button
                            variant="ghost"
                            className="w-full h-10 text-xs font-bold text-rose-400 hover:bg-rose-500/10 hover:text-rose-400 gap-1.5"
                            disabled={isActionLoading}
                            onClick={() => doAction(a.id, "returned")}>
                            <RotateCcw className="h-3.5 w-3.5" />
                            Return Order to Restaurant
                          </Button>
                        </div>
                      )}

                      {a.status === "delivered" && (
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
                          <p className="text-xs font-bold text-emerald-400 flex items-center justify-center gap-1.5">
                            <CheckCircle2 className="h-4 w-4" />
                            Delivery Run Completed
                          </p>
                        </div>
                      )}
                    </div>

                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* My Performance Tab */}
        <TabsContent value="stats" className="mt-3 space-y-4">
          <Card className="shadow-sm border-border bg-card">
            <CardHeader className="pb-3 border-b border-border/50">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-amber-500" />
                Lifetime & Daily Statistics
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {stats ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-muted/40 border border-border/50 rounded-xl p-3.5 text-center">
                      <p className="text-2xl font-black text-amber-500">{stats.todayOrders}</p>
                      <p className="text-xs text-muted-foreground font-semibold">Today's Deliveries</p>
                    </div>
                    <div className="bg-muted/40 border border-border/50 rounded-xl p-3.5 text-center">
                      <p className="text-2xl font-black text-emerald-500">{currency} {stats.todaySales.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground font-semibold">Today's Total Revenue</p>
                    </div>
                    <div className="bg-muted/40 border border-border/50 rounded-xl p-3.5 text-center">
                      <p className="text-2xl font-black text-foreground">{stats.totalOrders}</p>
                      <p className="text-xs text-muted-foreground font-semibold">All-Time Deliveries</p>
                    </div>
                    <div className="bg-muted/40 border border-border/50 rounded-xl p-3.5 text-center">
                      <p className="text-2xl font-black text-emerald-500">{currency} {stats.totalSales.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground font-semibold">All-Time Revenue</p>
                    </div>
                  </div>

                  {stats.pendingCash > 0 && (
                    <div className="bg-amber-500/10 border-2 border-amber-500/30 rounded-xl p-4 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-500 shrink-0">
                        <Banknote className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-extrabold text-amber-500">{currency} {stats.pendingCash.toLocaleString()} Pending Handover</p>
                        <p className="text-xs text-muted-foreground">Please submit this cash to your outlet manager at shift end.</p>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground text-center py-6 text-xs">Loading performance statistics...</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RiderPortal;

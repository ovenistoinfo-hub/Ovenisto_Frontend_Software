import { useState, useCallback } from "react";
import { Bike, MapPin, Phone, Clock, CheckCircle2, Truck, RotateCcw, RefreshCw, Package, TrendingUp, Banknote, Wallet, Bell, Navigation, ArrowUpRight, ShieldAlert, Loader2, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { deliveryService, type RiderRecord, type AssignmentRecord, type PendingDeliveryOrder } from "@/services/delivery.service";
import { useQuery } from "@tanstack/react-query";
import { cashSettlementService } from "@/services/cashSettlement.service";
import { useModuleEvents } from "@/hooks/use-module-events";
import { useVisiblePolling } from "@/hooks/use-visible-polling";
import { useOrderEvents } from "@/hooks/use-order-events";
import { useDeliveryEvents } from "@/hooks/use-delivery-events";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getDeliveryPaymentMode, getRiderCollectAmount } from "@/utils/deliveryPayment";
import { api } from "@/services/api";

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

  const [claimingId, setClaimingId]       = useState<string | null>(null);

  const [deliveryConfirmModalItem, setDeliveryConfirmModalItem] = useState<{
    assignmentId: string;
    orderNumber: string;
    customerName: string;
    address: string;
    amountToCollect: number;
  } | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>("Cash");
  const [showMyCollectionDialog, setShowMyCollectionDialog] = useState(false);

  // Cash Hub / Active balance for logged in rider
  const { data: myActiveCash, refetch: refetchActiveCash } = useQuery({
    queryKey: ["my-active-cash", user?.id],
    queryFn: async () => {
      if (user?.id) {
        api.clearCache(`/cash-settlements/staff/${user.id}/active`);
      }
      return cashSettlementService.getStaffActiveBalance(user!.id);
    },
    enabled: !!user?.id,
  });

  const refetchMyActiveCash = () => {
    if (user?.id) {
      api.clearCache(`/cash-settlements/staff/${user.id}/active`);
      refetchActiveCash();
    }
  };

  useModuleEvents(["cashSettlement:created", "order:created", "order:updated", "delivery:status_updated", "delivery:assigned"], refetchMyActiveCash);
  useVisiblePolling(refetchMyActiveCash, 30000);

  const loadData = useCallback(async () => {
    // Clear delivery endpoint caches before fetching so that order:updated socket
    // events (e.g. kitchen changes food status to Ready) always yield fresh data.
    // useOrderEvents only clears /orders; /delivery/my-assignments is a separate
    // cache key that must be invalidated here.
    api.clearCache('/delivery/my-assignments');
    api.clearCache('/delivery/my-stats');
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

  const claimOrder = async (orderId: string, orderNumber: string) => {
    if (!rider) {
      toast.error("No rider profile linked to your account. Ask your manager to set it up.");
      return;
    }
    setClaimingId(orderId);
    try {
      const assignment = await deliveryService.assignRider({
        orderId,
        riderId: rider.id,
        estimatedTime: 30,
      });
      if (assignment?.id) {
        await deliveryService.updateStatus(assignment.id, "accepted");
      }
      toast.success(`Order #${orderNumber} claimed & accepted!`);
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || "Failed to claim order");
    } finally {
      setClaimingId(null);
    }
  };

  const doAction = async (assignmentId: string, status: AssignmentRecord['status'], paymentMethod?: string) => {
    setActionIds(prev => new Set([...prev, assignmentId]));
    try {
      await deliveryService.updateStatus(assignmentId, status, paymentMethod);
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

      {/* COD Cash in Hand Summary Card */}
      <Card
        className="border border-emerald-500/30 bg-emerald-500/10 shadow-sm cursor-pointer hover:border-emerald-400 hover:bg-emerald-500/15 transition-colors"
        onClick={() => setShowMyCollectionDialog(true)}
      >
        <CardContent className="p-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-500 shrink-0">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                🏍️ Delivery Collections in Hand
              </p>
              <p className="text-xl font-black text-foreground font-mono">
                {currency} {(myActiveCash?.totalExpected || 0).toLocaleString()}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {myActiveCash?.orderCount || 0} orders collected • Hand over these collections to the Manager to settle in Cash Hub.
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="h-8 text-xs rounded-lg gap-1 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 shrink-0" onClick={(e) => { e.stopPropagation(); setShowMyCollectionDialog(true); }}>
            View Details
          </Button>
        </CardContent>
      </Card>

      {/* Mobile Ergonomic Quick Stats */}
      {stats && (() => {
        const completedAssignmentsToday = assignments.filter(a => a.status === 'delivered');
        const todayCommissions = completedAssignmentsToday.reduce(
          (sum, a) => sum + Number(a.commissionEarned ?? 0), 0
        );

        return (
          <div className="grid grid-cols-2 gap-2.5">
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

            <Card className="shadow-sm border-border bg-card col-span-2">
              <CardContent className="p-3 text-center space-y-0.5">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">🏍️ Today's Earned Commissions</p>
                <p className="text-xl font-black text-emerald-500">{currency} {todayCommissions.toLocaleString()}</p>
              </CardContent>
            </Card>
          </div>
        );
      })()}

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
          {pendingOrders.length > 0 && (
            <div className="bg-amber-500/10 border-2 border-amber-500/30 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-amber-500 animate-bounce" />
                <div>
                  <h4 className="text-sm font-extrabold text-amber-500 uppercase tracking-wide">
                    Unassigned Kitchen Orders ({pendingOrders.length})
                  </h4>
                  <p className="text-xs text-muted-foreground">Tap below to claim and accept any order yourself!</p>
                </div>
              </div>

              <div className="space-y-2.5 pt-1">
                {pendingOrders.map((o) => (
                  <div key={o.id} className="bg-card border border-amber-500/30 rounded-xl p-3 space-y-2 text-xs shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-base text-foreground">#{o.orderNumber}</span>
                      <span className="font-extrabold text-amber-500 text-sm">{currency} {Number(o.total).toLocaleString()}</span>
                    </div>

                    <div className="space-y-1">
                      <p className="font-semibold text-foreground">{o.customerName || "Walk-in Customer"}</p>
                      <p className="text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        <span className="truncate">{o.deliveryAddress || "No delivery address listed"}</span>
                      </p>
                    </div>

                    <Button
                      size="sm"
                      className="w-full bg-amber-500 hover:bg-amber-600 text-black font-extrabold text-xs h-10 gap-1.5 shadow-md active:scale-95 transition-all mt-1"
                      disabled={claimingId === o.id}
                      onClick={() => claimOrder(o.id, o.orderNumber)}>
                      {claimingId === o.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      {claimingId === o.id ? "CLAIMING ORDER..." : "⚡ ACCEPT & CLAIM THIS ORDER"}
                    </Button>
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
              const toCollect  = (mode === "prepaid" || mode === "collected")
                ? 0
                : Number(a.amountToCollect ?? getRiderCollectAmount(orderTotal, advPaid, mode));

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

                    {/* Kitchen Food Readiness Banner */}
                    {(() => {
                      const kStatus = ((a.order as any)?.status || "pending").toLowerCase();
                      const isFoodReady = kStatus === "ready" || kStatus === "completed";
                      return (
                        <div className="rounded-xl overflow-hidden">
                          {isFoodReady ? (
                            <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-2.5 flex items-center justify-between text-xs font-bold rounded-xl">
                              <span className="flex items-center gap-1.5">
                                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                                Kitchen Status: FOOD READY FOR PICKUP
                              </span>
                              <Badge className="bg-emerald-500 text-black text-[10px] font-extrabold uppercase">Ready</Badge>
                            </div>
                          ) : (
                            <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 p-2.5 flex items-center justify-between text-xs font-bold rounded-xl animate-pulse">
                              <span className="flex items-center gap-1.5">
                                <Clock className="h-4 w-4 text-amber-400 shrink-0" />
                                Kitchen Status: {kStatus === "preparing" ? "FOOD PREPARING..." : "PENDING KITCHEN"}
                              </span>
                              <Badge variant="outline" className="border-amber-500/40 text-amber-400 text-[10px] font-extrabold uppercase">
                                {kStatus === "preparing" ? "Preparing" : "Pending"}
                              </Badge>
                            </div>
                          )}
                        </div>
                      );
                    })()}

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

                      {a.status === "accepted" && (() => {
                        const kStatus = ((a.order as any)?.status || "pending").toLowerCase();
                        const isFoodReady = kStatus === "ready" || kStatus === "completed";
                        return (
                          <Button
                            className={cn(
                              "w-full h-14 font-black text-base rounded-2xl shadow-lg gap-2 active:scale-95 transition-all",
                              isFoodReady
                                ? "bg-blue-600 hover:bg-blue-700 text-white"
                                : "bg-muted/80 text-muted-foreground border border-border cursor-not-allowed opacity-80"
                            )}
                            disabled={isActionLoading}
                            onClick={() => {
                              if (!isFoodReady) {
                                toast.warning("Cannot start delivery run: Food is still being prepared in the kitchen. Please wait until food is Ready!");
                                return;
                              }
                              doAction(a.id, "dispatched");
                            }}>
                            {isActionLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Truck className="h-5 w-5" />}
                            {isActionLoading ? "DISPATCHING..." : isFoodReady ? "START DELIVERY (ON THE WAY)" : "WAITING FOR KITCHEN (FOOD PREPARING)"}
                          </Button>
                        );
                      })()}

                      {a.status === "dispatched" && (
                        <div className="space-y-2">
                          <Button
                            className="w-full h-14 bg-emerald-500 hover:bg-emerald-600 text-black font-black text-base rounded-2xl shadow-lg gap-2 active:scale-95 transition-all"
                            disabled={isActionLoading}
                            onClick={() => {
                              if (toCollect > 0) {
                                setDeliveryConfirmModalItem({
                                  assignmentId: a.id,
                                  orderNumber: a.order?.orderNumber || "",
                                  customerName: a.order?.customerName || "Walk-in Guest",
                                  address: a.customerAddress || a.order?.deliveryAddress || "No address provided",
                                  amountToCollect: toCollect,
                                });
                                setSelectedPaymentMethod("Cash");
                              } else {
                                doAction(a.id, "delivered");
                              }
                            }}>
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
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center space-y-1">
                          <p className="text-xs font-bold text-emerald-400 flex items-center justify-center gap-1.5">
                            <CheckCircle2 className="h-4 w-4" />
                            Delivery Run Completed
                          </p>
                          {(a.commissionEarned ?? 0) > 0 && (
                            <p className="text-xs font-bold text-emerald-500">
                              + {currency} {a.commissionEarned} Commission
                            </p>
                          )}
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

      {/* Delivery Confirmation Dialog */}
      <Dialog
        open={!!deliveryConfirmModalItem}
        onOpenChange={(open) => {
          if (!open) setDeliveryConfirmModalItem(null);
        }}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-foreground">
              Order #{deliveryConfirmModalItem?.orderNumber} — Confirm Delivery
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Verify customer details and confirm cash/payment collection.
            </DialogDescription>
          </DialogHeader>

          {deliveryConfirmModalItem && (
            <div className="space-y-4 py-2 text-sm">
              <div className="bg-muted/50 border border-border rounded-xl p-3.5 space-y-2">
                <div>
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Customer Name</p>
                  <p className="font-extrabold text-foreground">{deliveryConfirmModalItem.customerName}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Delivery Address</p>
                  <p className="font-semibold text-foreground flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    {deliveryConfirmModalItem.address}
                  </p>
                </div>
                <div className="pt-2 border-t border-border/60">
                  <p className="text-base font-black text-amber-500">
                    COD Amount to Collect: {currency} {deliveryConfirmModalItem.amountToCollect.toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-extrabold text-foreground uppercase tracking-wider">
                  Payment Method Received
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(settings?.paymentMethods && settings.paymentMethods.length > 0
                    ? settings.paymentMethods
                    : ["Cash", "JazzCash", "EasyPaisa", "Credit Card"]
                  ).map((pm) => {
                    const isSelected = selectedPaymentMethod === pm;
                    return (
                      <Button
                        key={pm}
                        type="button"
                        variant="outline"
                        className={cn(
                          "h-12 text-xs font-bold rounded-xl border-2 transition-all justify-start px-3 gap-2",
                          isSelected
                            ? "border-amber-500 bg-amber-500/15 text-amber-500 shadow-sm"
                            : "border-border/80 bg-background text-muted-foreground hover:bg-muted"
                        )}
                        onClick={() => setSelectedPaymentMethod(pm)}>
                        <div
                          className={cn(
                            "h-3.5 w-3.5 rounded-full border-2 shrink-0 flex items-center justify-center",
                            isSelected ? "border-amber-500 bg-amber-500" : "border-muted-foreground/40"
                          )}>
                          {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-black" />}
                        </div>
                        <span className="truncate">{pm}</span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl font-bold text-xs h-11"
              onClick={() => setDeliveryConfirmModalItem(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-xl bg-emerald-500 hover:bg-emerald-600 text-black font-extrabold text-xs h-11 gap-1.5 shadow-md"
              disabled={!deliveryConfirmModalItem || actionIds.has(deliveryConfirmModalItem.assignmentId)}
              onClick={() => {
                if (deliveryConfirmModalItem) {
                  const item = deliveryConfirmModalItem;
                  setDeliveryConfirmModalItem(null);
                  doAction(item.assignmentId, "delivered", selectedPaymentMethod);
                }
              }}>
              {deliveryConfirmModalItem && actionIds.has(deliveryConfirmModalItem.assignmentId) ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Confirm & Complete Delivery
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* My Collection Dialog */}
      <Dialog open={showMyCollectionDialog} onOpenChange={setShowMyCollectionDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <Wallet className="h-5 w-5" />
              My Collection & Active Balance
            </DialogTitle>
            <DialogDescription>
              Active delivery COD collections under your account.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Total Card */}
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold block">Total Expected Collection</span>
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                {currency} {(myActiveCash?.totalExpected || 0).toLocaleString()}
              </span>
            </div>

            {/* Sales Breakdown */}
            <div className="flex flex-wrap gap-2 text-center text-xs justify-center">
              {(settings?.paymentMethods && settings.paymentMethods.length > 0 ? settings.paymentMethods : ['Cash', 'Credit Card', 'Account', 'JazzCash', 'EasyPaisa']).map((m) => {
                const val = myActiveCash?.byMethod?.[m] ?? (m.toLowerCase() === 'cash' ? (myActiveCash?.expectedCash || 0) : m.toLowerCase().includes('card') ? (myActiveCash?.expectedCard || 0) : 0);
                return (
                  <div key={m} className="p-2 rounded-lg bg-card border border-border flex-1 min-w-[75px]">
                    <span className="text-muted-foreground block text-[10px] uppercase truncate">{m}</span>
                    <span className="font-bold text-foreground font-mono">{currency} {val.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>

            {/* Orders List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span>Active Orders ({myActiveCash?.orderCount || 0})</span>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {myActiveCash?.orders && myActiveCash.orders.length > 0 ? (
                  myActiveCash.orders.map((ord: any) => (
                    <div key={ord.id} className="p-2 rounded-lg bg-card border border-border/60 flex items-center justify-between text-xs gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold font-mono">#{ord.orderNo || ord.orderNumber || ord.id?.slice(-6)}</span>
                          {ord.channel && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 font-semibold border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                              {ord.channel}
                            </Badge>
                          )}
                        </div>
                        <span className="text-muted-foreground">({ord.paymentMethod || 'Cash'})</span>
                      </div>
                      <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400 shrink-0">
                        {currency} {(Number(ord.staffAmount ?? ord.total ?? 0)).toLocaleString()}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-xs text-muted-foreground">
                    No active uncleared orders found.
                  </div>
                )}
              </div>
            </div>

            {/* Manager Notice */}
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Hand this cash over to the Manager to clear your balance.</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMyCollectionDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RiderPortal;

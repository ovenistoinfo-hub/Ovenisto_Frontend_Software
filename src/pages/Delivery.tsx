import { useState, useCallback } from "react";
import { Bike, MapPin, Phone, Clock, Users, TrendingUp, Banknote, RefreshCw, Package, CheckCircle2, Truck, Wallet, Loader2, Navigation, ArrowUpRight, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page-header";
import { deliveryService, type RiderRecord, type AssignmentRecord, type PendingDeliveryOrder } from "@/services/delivery.service";
import { useVisiblePolling } from "@/hooks/use-visible-polling";
import { useOrderEvents } from "@/hooks/use-order-events";
import { useDeliveryEvents } from "@/hooks/use-delivery-events";
import { useData } from "@/contexts/DataContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getDeliveryPaymentMode, getRiderCollectAmount } from "@/utils/deliveryPayment";

const STATUS_CONFIG: Record<string, { label: string; class: string }> = {
  pending:    { label: "Pending",     class: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
  accepted:   { label: "Accepted",    class: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  dispatched: { label: "On the Way",  class: "bg-orange-500/10 text-orange-500 border-orange-500/20" },
  delivered:  { label: "Delivered",   class: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
  returned:   { label: "Returned",    class: "bg-rose-500/10 text-rose-500 border-rose-500/20" },
};

const RIDER_STATUS_CONFIG: Record<string, { label: string; class: string; dot: string }> = {
  available:   { label: "Available",   class: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-500" },
  on_delivery: { label: "On Delivery", class: "bg-amber-500/10 text-amber-400 border-amber-500/20", dot: "bg-amber-500 animate-pulse" },
  offline:     { label: "Offline",     class: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" },
};

/** Payment Badge for delivery cards */
function PaymentBadge({ paymentMethod, advancePayment, total, currency }: {
  paymentMethod: string | null | undefined;
  advancePayment: number;
  total: number;
  currency: string;
}) {
  const mode = getDeliveryPaymentMode(paymentMethod, advancePayment);
  const toCollect = getRiderCollectAmount(total, advancePayment, mode);

  if (mode === "cod") return (
    <div className="text-xs space-y-1">
      <span className="inline-flex items-center gap-1 bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded-md px-2 py-0.5 font-bold tracking-wide">
        <Truck className="h-3 w-3" /> CASH ON DELIVERY
      </span>
      <p className="text-xs text-muted-foreground font-medium">
        To Collect: <span className="font-extrabold text-amber-600 dark:text-amber-400">{currency} {toCollect.toLocaleString()}</span>
      </p>
    </div>
  );

  if (mode === "advance") return (
    <div className="text-xs space-y-1">
      <span className="inline-flex items-center gap-1 bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30 rounded-md px-2 py-0.5 font-bold tracking-wide">
        <Wallet className="h-3 w-3" /> PARTIAL ADVANCE
      </span>
      <p className="text-xs text-muted-foreground font-medium">
        Adv: <span className="font-bold text-foreground">{currency} {advancePayment.toLocaleString()}</span> | Remaining: <span className="font-extrabold text-amber-500">{currency} {toCollect.toLocaleString()}</span>
      </p>
    </div>
  );

  if (mode === "collected") return (
    <div className="text-xs">
      <span className="inline-flex items-center gap-1 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 rounded-md px-2 py-0.5 font-bold tracking-wide">
        <CheckCircle2 className="h-3 w-3" /> CASH COLLECTED
      </span>
    </div>
  );

  return (
    <div className="text-xs space-y-1">
      <span className="inline-flex items-center gap-1 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 rounded-md px-2 py-0.5 font-bold tracking-wide">
        <CheckCircle2 className="h-3 w-3" /> ONLINE PREPAID
      </span>
      <p className="text-xs text-muted-foreground">Paid online — 0 collection</p>
    </div>
  );
}

const Delivery = () => {
  const { settings } = useData();
  const currency = settings?.currency || "Rs.";

  const [riderStats, setRiderStats]       = useState<RiderRecord[]>([]);
  const [activeAssignments, setActive]    = useState<AssignmentRecord[]>([]);
  const [pendingOrders, setPendingOrders]  = useState<PendingDeliveryOrder[]>([]);
  const [loading, setLoading]             = useState(true);
  const [tab, setTab]                     = useState("active");

  // Dialogs
  const [showAssign, setShowAssign]       = useState<string | null>(null); // orderId
  const [allRiders, setAllRiders]         = useState<RiderRecord[]>([]);
  const [selectedRider, setSelectedRider] = useState("");
  const [estTime, setEstTime]             = useState("30");
  const [assigning, setAssigning]         = useState(false);

  // Order detail dialog
  const [detailItem, setDetailItem] = useState<{
    order: PendingDeliveryOrder | null;
    assignment: AssignmentRecord | null;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const [dash, pending] = await Promise.all([
        deliveryService.getDashboard(),
        deliveryService.getPendingDeliveryOrders(),
      ]);
      setRiderStats(dash.riderStats);
      setActive(dash.activeAssignments);
      setPendingOrders(pending);
    } catch { toast.error("Failed to load delivery data"); }
    finally { setLoading(false); }
  }, []);

  // Real-time socket events
  useOrderEvents(load);
  useDeliveryEvents(load);
  useVisiblePolling(load, 120_000);

  const openAssignDialog = async (orderId: string) => {
    setShowAssign(orderId);
    try {
      const riders = await deliveryService.getRiders();
      setAllRiders(riders.filter(r => r.isAvailable));
    } catch { toast.error("Failed to load riders"); }
  };

  const handleAssign = async () => {
    if (!showAssign || !selectedRider) return;
    setAssigning(true);
    try {
      await deliveryService.assignRider({ orderId: showAssign, riderId: selectedRider, estimatedTime: Number(estTime) });
      toast.success("Rider assigned successfully");
      setShowAssign(null); setSelectedRider(""); setEstTime("30");
      load();
    } catch (err: any) { toast.error(err?.message || "Assignment failed"); }
    finally { setAssigning(false); }
  };

  const totalPendingCash = riderStats.reduce((s, r) => s + (r.pendingCash || 0), 0);
  const totalTodaySales  = riderStats.reduce((s, r) => s + (r.todaySales  || 0), 0);
  const availableRiders  = riderStats.filter(r => r.status === "available").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        icon={<Bike className="h-5 w-5 text-amber-500" />}
        title="Delivery Control Center"
        subtitle="Live dispatch monitoring, rider fleet management & real-time cash collection"
        actions={
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5 hover:bg-amber-500/10 hover:text-amber-500 hover:border-amber-500/30">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        }
      />

      {/* Hero Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm relative overflow-hidden border border-amber-500/20 bg-gradient-to-br from-card via-card to-amber-500/5">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <Package className="h-16 w-16 text-amber-500" />
          </div>
          <CardContent className="p-4 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Deliveries</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-amber-500">{pendingOrders.length + activeAssignments.length}</span>
              <span className="text-xs text-muted-foreground font-medium">({pendingOrders.length} unassigned)</span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm relative overflow-hidden border border-emerald-500/20 bg-gradient-to-br from-card via-card to-emerald-500/5">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <TrendingUp className="h-16 w-16 text-emerald-500" />
          </div>
          <CardContent className="p-4 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Today's Delivery Sales</p>
            <p className="text-3xl font-black text-emerald-500">{currency} {totalTodaySales.toLocaleString()}</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm relative overflow-hidden border border-warning/30 bg-gradient-to-br from-card via-card to-warning/5">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <Banknote className="h-16 w-16 text-warning" />
          </div>
          <CardContent className="p-4 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pending Rider Cash</p>
            <p className="text-3xl font-black text-warning">{currency} {totalPendingCash.toLocaleString()}</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm relative overflow-hidden border border-blue-500/20 bg-gradient-to-br from-card via-card to-blue-500/5">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <Bike className="h-16 w-16 text-blue-500" />
          </div>
          <CardContent className="p-4 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Riders Available</p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-blue-500">{availableRiders}</span>
              <span className="text-base font-bold text-muted-foreground">/ {riderStats.length} total</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-muted/60 p-1 border border-border/50">
          <TabsTrigger value="active" className="gap-2 data-[state=active]:bg-card data-[state=active]:text-amber-500 data-[state=active]:shadow-sm font-semibold">
            <Package className="h-4 w-4" />
            Active Orders
            {(pendingOrders.length + activeAssignments.length) > 0 && (
              <Badge className="h-5 px-1.5 text-[11px] bg-amber-500 text-black font-extrabold rounded-full">
                {pendingOrders.length + activeAssignments.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="riders" className="gap-2 data-[state=active]:bg-card data-[state=active]:text-amber-500 data-[state=active]:shadow-sm font-semibold">
            <Users className="h-4 w-4" />
            Riders Fleet Dashboard
          </TabsTrigger>
        </TabsList>

        {/* Active Orders Tab */}
        <TabsContent value="active" className="space-y-6 mt-2">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
              <span>Loading delivery orders...</span>
            </div>
          ) : (pendingOrders.length === 0 && activeAssignments.length === 0) ? (
            <Card className="border-dashed py-16 text-center space-y-3">
              <Bike className="h-12 w-12 text-muted-foreground/30 mx-auto" />
              <p className="text-base font-medium text-muted-foreground">No active delivery orders at the moment</p>
              <p className="text-xs text-muted-foreground">New delivery orders placed at POS will automatically pop up here via real-time WebSocket sync.</p>
            </Card>
          ) : (
            <>
              {/* Unassigned Queue */}
              {pendingOrders.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-amber-500 uppercase tracking-wider flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4" />
                      Awaiting Rider Assignment ({pendingOrders.length})
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {pendingOrders.map(o => (
                      <Card key={o.id}
                        className="shadow-sm border-amber-500/40 bg-card hover:border-amber-500 transition-all cursor-pointer group relative overflow-hidden"
                        onClick={() => setDetailItem({ order: o, assignment: null })}>
                        <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-black text-base text-foreground group-hover:text-amber-500 transition-colors">#{o.orderNumber}</span>
                            </div>
                            <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30 font-bold">
                              Unassigned
                            </Badge>
                          </div>

                          <div className="space-y-1.5 text-xs">
                            <p className="font-semibold text-sm text-foreground">{o.customerName || "Walk-in Guest"}</p>
                            <p className="text-muted-foreground flex items-center gap-1.5">
                              <MapPin className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                              <span className="truncate">{o.deliveryAddress || "No address provided"}</span>
                            </p>
                            <p className="text-muted-foreground flex items-center gap-1.5">
                              <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span>{o.phone || "—"}</span>
                            </p>
                            <div className="pt-1 flex items-center justify-between border-t border-border/50 mt-2">
                              <span className="text-xs text-muted-foreground">Order Total</span>
                              <span className="font-black text-base text-amber-500">{currency} {o.total?.toLocaleString()}</span>
                            </div>

                            <PaymentBadge
                              paymentMethod={(o as any).paymentMethod}
                              advancePayment={Number((o as any).advancePayment ?? 0)}
                              total={o.total ?? 0}
                              currency={currency}
                            />
                          </div>

                          <Button
                            size="sm"
                            className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold gap-1.5 shadow-sm"
                            onClick={e => { e.stopPropagation(); openAssignDialog(o.id); }}>
                            <Bike className="h-4 w-4" />
                            Assign Rider
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Active Deliveries */}
              {activeAssignments.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <Truck className="h-4 w-4" />
                    In Progress Deliveries ({activeAssignments.length})
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {activeAssignments.map(a => {
                      const statusInfo = STATUS_CONFIG[a.status] || { label: a.status, class: "bg-muted text-muted-foreground" };
                      return (
                        <Card key={a.id}
                          className="shadow-sm border-border/80 bg-card hover:border-amber-500/50 transition-all cursor-pointer group"
                          onClick={() => setDetailItem({ order: a.order as unknown as PendingDeliveryOrder, assignment: a })}>
                          <CardContent className="p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="font-black text-base group-hover:text-amber-500 transition-colors">#{a.order?.orderNumber}</span>
                              <Badge variant="outline" className={cn("font-bold text-xs", statusInfo.class)}>
                                {statusInfo.label}
                              </Badge>
                            </div>

                            <div className="space-y-1.5 text-xs">
                              <p className="font-semibold text-sm">{a.order?.customerName || "Walk-in Guest"}</p>
                              <p className="text-muted-foreground flex items-center gap-1.5">
                                <MapPin className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                <span className="truncate">{a.customerAddress || "—"}</span>
                              </p>
                              <p className="text-muted-foreground flex items-center gap-1.5">
                                <Phone className="h-3.5 w-3.5 shrink-0" />
                                <span>{a.customerPhone || "—"}</span>
                              </p>
                              <div className="pt-1 flex items-center justify-between border-t border-border/50">
                                <span className="text-xs text-muted-foreground">Order Total</span>
                                <span className="font-black text-base text-foreground">{currency} {a.order?.total?.toLocaleString()}</span>
                              </div>

                              <PaymentBadge
                                paymentMethod={a.order?.paymentMethod}
                                advancePayment={Number(a.order?.advancePayment ?? 0)}
                                total={a.order?.total ?? 0}
                                currency={currency}
                              />
                            </div>

                            <div className="text-xs bg-muted/40 rounded-lg p-2.5 space-y-1 border border-border/40">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold flex items-center gap-1.5">
                                  <Bike className="h-3.5 w-3.5 text-amber-500" />
                                  {a.rider?.name}
                                </span>
                                {a.estimatedTime && (
                                  <span className="text-muted-foreground text-[11px] flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    Est. {a.estimatedTime} min
                                  </span>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* Riders Fleet Dashboard */}
        <TabsContent value="riders" className="mt-2">
          <Card className="shadow-sm border-border">
            <CardHeader className="pb-3 border-b border-border/50">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-amber-500" />
                Live Rider Fleet & Cash Collection Status
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40 text-xs uppercase font-bold">
                    <TableHead>Rider</TableHead>
                    <TableHead>Current Status</TableHead>
                    <TableHead className="text-right">Today's Orders</TableHead>
                    <TableHead className="text-right">Today's Sales</TableHead>
                    <TableHead className="text-right">Pending Cash to Collect</TableHead>
                    <TableHead className="text-right">Settled Cash</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {riderStats.map(r => {
                    const statusConfig = RIDER_STATUS_CONFIG[r.status] || { label: r.status, class: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" };
                    const pendingCash = r.pendingCash || 0;

                    return (
                      <TableRow key={r.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell>
                          <div className="font-bold text-sm text-foreground">{r.name}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {r.phone || "—"}
                          </div>
                        </TableCell>

                        <TableCell>
                          <Badge variant="outline" className={cn("gap-1.5 font-bold text-xs", statusConfig.class)}>
                            <span className={cn("h-2 w-2 rounded-full", statusConfig.dot)} />
                            {statusConfig.label}
                          </Badge>
                        </TableCell>

                        <TableCell className="text-right font-extrabold text-sm">{r.todayOrders ?? 0}</TableCell>

                        <TableCell className="text-right font-extrabold text-sm text-emerald-500">
                          {currency} {(r.todaySales || 0).toLocaleString()}
                        </TableCell>

                        <TableCell className="text-right font-black text-sm">
                          {pendingCash > 0 ? (
                            <span className="inline-block bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded border border-amber-500/20">
                              {currency} {pendingCash.toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-muted-foreground font-normal text-xs">Clear</span>
                          )}
                        </TableCell>

                        <TableCell className="text-right font-bold text-sm text-emerald-400">
                          {currency} {(r.collectedCash || 0).toLocaleString()}
                        </TableCell>

                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {r.status === "on_delivery" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs font-bold gap-1 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/10"
                                onClick={async () => {
                                  try {
                                    await deliveryService.updateRider(r.id, { status: 'available', isAvailable: true });
                                    toast.success(`${r.name} marked as available`);
                                    load();
                                  } catch { toast.error("Failed to update rider status"); }
                                }}>
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Make Available
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {riderStats.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No riders registered in system
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Assign Rider Dialog */}
      <Dialog open={!!showAssign} onOpenChange={() => setShowAssign(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Bike className="h-5 w-5 text-amber-500" />
              Assign Rider to Order
            </DialogTitle>
          </DialogHeader>

          {(() => {
            const order = pendingOrders.find(o => o.id === showAssign);
            if (!order) return null;
            const mode = getDeliveryPaymentMode((order as any).paymentMethod, Number((order as any).advancePayment ?? 0));
            const toCollect = getRiderCollectAmount(order.total ?? 0, Number((order as any).advancePayment ?? 0), mode);
            return (
              <div className="bg-muted/50 border border-border/60 rounded-xl p-3 space-y-1.5 text-xs">
                <div className="flex justify-between items-center font-bold">
                  <span>Order #{order.orderNumber}</span>
                  <span className="text-amber-500 font-black text-sm">{currency} {order.total?.toLocaleString()}</span>
                </div>
                <p className="text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3 text-amber-500 shrink-0" />
                  {order.deliveryAddress || "No address"}
                </p>

                <div className="pt-1">
                  {mode === "cod" && (
                    <p className="text-amber-500 font-bold flex items-center gap-1 bg-amber-500/10 p-1.5 rounded border border-amber-500/20">
                      <Truck className="h-4 w-4 shrink-0" />
                      COD — Rider must collect {currency} {toCollect.toLocaleString()}
                    </p>
                  )}
                  {mode === "advance" && (
                    <p className="text-blue-400 font-bold flex items-center gap-1 bg-blue-500/10 p-1.5 rounded border border-blue-500/20">
                      <Wallet className="h-4 w-4 shrink-0" />
                      Advance Paid ({currency} {Number((order as any).advancePayment).toLocaleString()}) — Rider collects {currency} {toCollect.toLocaleString()}
                    </p>
                  )}
                  {mode === "prepaid" && (
                    <p className="text-emerald-400 font-bold flex items-center gap-1 bg-emerald-500/10 p-1.5 rounded border border-emerald-500/20">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      Prepaid — No cash collection required
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider">Select Available Rider</Label>
              <Select value={selectedRider} onValueChange={setSelectedRider}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Choose rider from fleet..." />
                </SelectTrigger>
                <SelectContent>
                  {allRiders.length === 0 ? (
                    <div className="p-2 text-xs text-muted-foreground text-center">No available riders online</div>
                  ) : (
                    allRiders.map(r => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name} {r.phone ? `(${r.phone})` : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-bold uppercase tracking-wider">Estimated Delivery Time (mins)</Label>
              <Input
                type="number"
                value={estTime}
                onChange={e => setEstTime(e.target.value)}
                className="mt-1.5"
                min="1"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowAssign(null)}>Cancel</Button>
            <Button
              className="bg-amber-500 hover:bg-amber-600 text-black font-bold gap-1.5"
              disabled={!selectedRider || assigning}
              onClick={handleAssign}>
              {assigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bike className="h-4 w-4" />}
              {assigning ? "Assigning..." : "Assign Rider"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Detail Drawer Dialog */}
      <Dialog open={!!detailItem} onOpenChange={() => setDetailItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between text-lg font-bold">
              <span className="flex items-center gap-2">
                <Package className="h-5 w-5 text-amber-500" />
                Order #{detailItem?.order?.orderNumber}
              </span>
              {detailItem?.assignment && (
                <Badge variant="outline" className={cn("font-bold text-xs", STATUS_CONFIG[detailItem.assignment.status]?.class)}>
                  {STATUS_CONFIG[detailItem.assignment.status]?.label || detailItem.assignment.status}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Customer & Location */}
            <div className="bg-muted/40 border border-border/50 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-extrabold text-foreground">{detailItem?.order?.customerName || "Walk-in Guest"}</p>
                {(detailItem?.order as any)?.phone && (
                  <a
                    href={`tel:${(detailItem?.order as any)?.phone}`}
                    className="inline-flex items-center gap-1 text-xs font-bold text-amber-500 bg-amber-500/10 px-2 py-1 rounded-md border border-amber-500/20 hover:bg-amber-500 hover:text-black transition-all">
                    <Phone className="h-3 w-3" />
                    Call
                  </a>
                )}
              </div>

              <div className="text-xs text-muted-foreground flex items-start gap-1.5">
                <MapPin className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <span className="flex-1 font-medium">{detailItem?.order?.deliveryAddress || "No delivery address listed"}</span>
              </div>

              {detailItem?.order?.deliveryAddress && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(detailItem.order.deliveryAddress)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-400 hover:underline pt-1">
                  <Navigation className="h-3 w-3" /> Open address in Maps <ArrowUpRight className="h-3 w-3" />
                </a>
              )}
            </div>

            {/* Items Breakdown */}
            {(() => {
              const items = (detailItem?.order as any)?.items;
              if (!items?.length) return null;
              return (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Ordered Items</p>
                  <div className="bg-card border border-border/60 rounded-xl p-3 divide-y divide-border/40 text-xs">
                    {items.map((item: any) => (
                      <div key={item.id} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-foreground">{item.name}</span>
                          <span className="text-muted-foreground ml-1.5">× {item.quantity}</span>
                        </div>
                        <span className="font-bold text-foreground">{currency} {(Number(item.price) * item.quantity).toLocaleString()}</span>
                      </div>
                    ))}

                    <div className="pt-2.5 flex items-center justify-between font-black text-sm text-foreground">
                      <span>Total Amount</span>
                      <span className="text-amber-500 text-base">{currency} {detailItem?.order?.total?.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Payment Info */}
            {detailItem?.order && (
              <div className="bg-card border border-border/60 rounded-xl p-3">
                <PaymentBadge
                  paymentMethod={(detailItem.order as any).paymentMethod}
                  advancePayment={Number((detailItem.order as any).advancePayment ?? 0)}
                  total={detailItem.order.total ?? 0}
                  currency={currency}
                />
              </div>
            )}

            {/* Assigned Rider Info */}
            {detailItem?.assignment?.rider && (
              <div className="bg-muted/40 border border-border/50 rounded-xl p-3 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Bike className="h-4 w-4 text-amber-500" />
                  <div>
                    <p className="font-bold text-foreground">{detailItem.assignment.rider.name}</p>
                    {detailItem.assignment.rider.phone && (
                      <p className="text-muted-foreground">{detailItem.assignment.rider.phone}</p>
                    )}
                  </div>
                </div>
                {detailItem.assignment.estimatedTime && (
                  <Badge variant="outline" className="gap-1 border-border text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    Est. {detailItem.assignment.estimatedTime} m
                  </Badge>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            {!detailItem?.assignment && detailItem?.order && (
              <Button
                className="bg-amber-500 hover:bg-amber-600 text-black font-bold gap-1.5"
                onClick={() => {
                  const orderId = detailItem.order!.id;
                  setDetailItem(null);
                  openAssignDialog(orderId);
                }}>
                <Bike className="h-4 w-4" />
                Assign Rider Now
              </Button>
            )}
            <Button variant="outline" onClick={() => setDetailItem(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Delivery;


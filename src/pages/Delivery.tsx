import { useState, useEffect, useCallback } from "react";
import { Bike, MapPin, Phone, Clock, Users, TrendingUp, Banknote, RefreshCw, Package, CheckCircle2 } from "lucide-react";
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
import { useData } from "@/contexts/DataContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  pending:    "bg-warning/10 text-warning",
  accepted:   "bg-blue-100 text-blue-700",
  dispatched: "bg-primary/10 text-primary",
  delivered:  "bg-success/10 text-success",
  returned:   "bg-destructive/10 text-destructive",
};

const RIDER_STATUS_COLORS: Record<string, string> = {
  available:   "bg-success/10 text-success",
  on_delivery: "bg-primary/10 text-primary",
  offline:     "bg-muted text-muted-foreground",
};

const Delivery = () => {
  const { settings } = useData();
  const currency = settings?.currency || "Rs.";

  const [riderStats, setRiderStats]         = useState<RiderRecord[]>([]);
  const [activeAssignments, setActive]      = useState<AssignmentRecord[]>([]);
  const [pendingOrders, setPendingOrders]    = useState<PendingDeliveryOrder[]>([]);
  const [loading, setLoading]               = useState(true);
  const [tab, setTab]                       = useState("active");

  // Dialogs
  const [showAssign, setShowAssign]     = useState<string | null>(null); // orderId
  const [allRiders, setAllRiders]       = useState<RiderRecord[]>([]);
  const [selectedRider, setSelectedRider] = useState("");
  const [estTime, setEstTime]           = useState("30");

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

  // Refresh dashboard every 60s while visible (was 20s, ungated). A backgrounded
  // manager tab now stops re-running the aggregation query, letting the DB idle.
  useVisiblePolling(load, 60000);

  const openAssignDialog = async (orderId: string) => {
    setShowAssign(orderId);
    try {
      const riders = await deliveryService.getRiders();
      setAllRiders(riders.filter(r => r.isAvailable));
    } catch { toast.error("Failed to load riders"); }
  };

  const handleAssign = async () => {
    if (!showAssign || !selectedRider) return;
    try {
      await deliveryService.assignRider({ orderId: showAssign, riderId: selectedRider, estimatedTime: Number(estTime) });
      toast.success("Rider assigned");
      setShowAssign(null); setSelectedRider(""); setEstTime("30");
      load();
    } catch (err: any) { toast.error(err?.message || "Assignment failed"); }
  };

  const handleCollect = async (assignmentId: string) => {
    try {
      await deliveryService.collectAmount(assignmentId);
      toast.success("Amount collected and added to delivery sales");
      load();
    } catch (err: any) { toast.error(err?.message || "Failed to collect"); }
  };


  const totalPendingCash = riderStats.reduce((s, r) => s + (r.pendingCash || 0), 0);
  const totalTodaySales  = riderStats.reduce((s, r) => s + (r.todaySales  || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Bike className="h-5 w-5" />}
        title="Delivery Management"
        subtitle="Track delivery orders, riders and cash collections"
        actions={
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh</Button>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Active Deliveries</p>
            <p className="text-2xl font-bold text-primary">{pendingOrders.length + activeAssignments.length}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Today's Sales</p>
            <p className="text-2xl font-bold text-success">{currency} {totalTodaySales.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Pending Cash</p>
            <p className="text-2xl font-bold text-warning">{currency} {totalPendingCash.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Riders Available</p>
            <p className="text-2xl font-bold">{riderStats.filter(r => r.status === "available").length} / {riderStats.length}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="active" className="gap-1.5">
            <Package className="h-3.5 w-3.5" />Active Orders
            {(pendingOrders.length + activeAssignments.length) > 0 && <Badge className="h-4 px-1 text-[10px] bg-primary text-primary-foreground">{pendingOrders.length + activeAssignments.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="riders" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />Riders Dashboard
          </TabsTrigger>
        </TabsList>

        {/* Active Orders Tab */}
        <TabsContent value="active" className="mt-4 space-y-6">
          {loading ? (
            <p className="text-center text-muted-foreground py-12">Loading...</p>
          ) : (pendingOrders.length === 0 && activeAssignments.length === 0) ? (
            <p className="text-center text-muted-foreground py-12">No active deliveries</p>
          ) : (
            <>
              {pendingOrders.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-warning mb-3 flex items-center gap-1.5">
                    <Package className="h-4 w-4" />Awaiting Rider Assignment ({pendingOrders.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {pendingOrders.map(o => (
                      <Card key={o.id} className="shadow-sm border-warning/30">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sm">{o.orderNumber}</span>
                            <Badge variant="secondary" className="bg-warning/10 text-warning">Unassigned</Badge>
                          </div>
                          <div className="text-sm space-y-1">
                            <p className="font-medium">{o.customerName || "Walk-in"}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{o.deliveryAddress || "—"}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />{o.phone || "—"}</p>
                            <p className="font-bold text-primary">{currency} {o.total?.toLocaleString()}</p>
                          </div>
                          <Button size="sm" className="w-full gradient-primary text-primary-foreground" onClick={() => openAssignDialog(o.id)}>
                            <Bike className="h-3.5 w-3.5 mr-1.5" />Assign Rider
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
              {activeAssignments.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3">In Progress ({activeAssignments.length})</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {activeAssignments.map(a => (
                      <Card key={a.id} className="shadow-sm">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sm">{a.order?.orderNumber}</span>
                            <Badge variant="secondary" className={STATUS_COLORS[a.status]}>{a.status}</Badge>
                          </div>
                          <div className="text-sm space-y-1">
                            <p className="font-medium">{a.order?.customerName || "Walk-in"}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{a.customerAddress || "—"}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />{a.customerPhone || "—"}</p>
                            <p className="font-bold text-primary">{currency} {a.order?.total?.toLocaleString()}</p>
                          </div>
                          <div className="text-xs space-y-1 border-t pt-2">
                            <p><Bike className="h-3 w-3 inline mr-1" />Rider: <strong>{a.rider?.name}</strong></p>
                            {a.estimatedTime && <p className="text-muted-foreground"><Clock className="h-3 w-3 inline mr-1" />Est. {a.estimatedTime} min</p>}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* Riders Dashboard Tab */}
        <TabsContent value="riders" className="mt-4">
          <Card className="shadow-sm">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" />Today's Rider Performance</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead>Rider</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                    <TableHead className="text-right">Pending Cash</TableHead>
                    <TableHead className="text-right">Collected</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {riderStats.map(r => (
                    <TableRow key={r.id} className="hover:bg-muted/30">
                      <TableCell>
                        <p className="font-medium text-sm">{r.name}</p>
                        <p className="text-xs text-muted-foreground">{r.phone || "—"}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={RIDER_STATUS_COLORS[r.status]}>
                          {r.status === "on_delivery" ? "On Delivery" : r.status === "available" ? "Available" : "Offline"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{r.todayOrders ?? 0}</TableCell>
                      <TableCell className="text-right text-success font-medium">{currency} {(r.todaySales || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        {(r.pendingCash || 0) > 0 ? (
                          <span className="text-warning font-bold">{currency} {r.pendingCash!.toLocaleString()}</span>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                      <TableCell className="text-right text-success">{currency} {(r.collectedCash || 0).toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap justify-end">
                          {(r.pendingCash || 0) > 0 && (
                            <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => handleCollectAllFromRider(r.id)}>
                              <Banknote className="h-3 w-3" />Collect
                            </Button>
                          )}
                          {r.status === "on_delivery" && (
                            <Button size="sm" variant="outline" className="text-xs h-7 gap-1 text-success border-success/30 hover:bg-success/10"
                              onClick={async () => {
                                try {
                                  await deliveryService.updateRider(r.id, { status: 'available', isAvailable: true });
                                  load();
                                } catch { toast.error("Failed to update rider status"); }
                              }}>
                              <CheckCircle2 className="h-3 w-3" />Mark Available
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {riderStats.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No riders found</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Assign Rider Dialog */}
      <Dialog open={!!showAssign} onOpenChange={() => setShowAssign(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Rider</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Available Rider</Label>
              <Select value={selectedRider} onValueChange={setSelectedRider}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select rider" /></SelectTrigger>
                <SelectContent>
                  {allRiders.map(r => <SelectItem key={r.id} value={r.id}>{r.name}{r.phone ? ` — ${r.phone}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Estimated Time (minutes)</Label>
              <Input type="number" value={estTime} onChange={e => setEstTime(e.target.value)} className="mt-1" min="1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssign(null)}>Cancel</Button>
            <Button className="gradient-primary text-primary-foreground" disabled={!selectedRider} onClick={handleAssign}>Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );

  async function handleCollectAllFromRider(riderId: string) {
    try {
      // Get all delivered, uncollected assignments for this rider today
      const today = new Date().toISOString().split("T")[0];
      const assignments = await deliveryService.getAssignments({ riderId, status: "delivered", date: today });
      const uncollected = assignments.filter(a => !a.collectedAt);
      if (uncollected.length === 0) { toast.info("No pending cash for this rider"); return; }
      await Promise.all(uncollected.map(a => deliveryService.collectAmount(a.id)));
      toast.success(`Collected cash from ${uncollected.length} delivery order(s)`);
      load();
    } catch (err: any) { toast.error(err?.message || "Collection failed"); }
  }
};

export default Delivery;

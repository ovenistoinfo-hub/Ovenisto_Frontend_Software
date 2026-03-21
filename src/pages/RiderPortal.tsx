import { useState, useEffect, useCallback } from "react";
import { Bike, MapPin, Phone, Clock, CheckCircle2, Truck, RotateCcw, RefreshCw, Package, TrendingUp, Banknote } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { deliveryService, type RiderRecord, type AssignmentRecord } from "@/services/delivery.service";
import { useSettings } from "@/contexts/SettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  pending:    "bg-warning/10 text-warning border-warning/20",
  accepted:   "bg-blue-100 text-blue-700 border-blue-200",
  dispatched: "bg-primary/10 text-primary border-primary/20",
  delivered:  "bg-success/10 text-success border-success/20",
  returned:   "bg-destructive/10 text-destructive border-destructive/20",
};

const RiderPortal = () => {
  const { settings }  = useSettings();
  const { user }      = useAuth();
  const currency      = settings?.currency || "Rs.";

  const [rider, setRider]           = useState<RiderRecord | null>(null);
  const [assignments, setAssignments] = useState<AssignmentRecord[]>([]);
  const [stats, setStats]           = useState<{ todayOrders: number; todaySales: number; totalOrders: number; totalSales: number; pendingCash: number } | null>(null);
  const [loading, setLoading]       = useState(true);
  const [actionIds, setActionIds]   = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    try {
      const [assignRes, statsRes] = await Promise.all([
        deliveryService.getMyAssignments(),
        deliveryService.getMyStats(),
      ]);
      setRider(assignRes.rider);
      setAssignments(assignRes.assignments);
      setStats(statsRes);
    } catch (err: any) {
      if (err?.message?.includes('rider profile')) {
        toast.error("No rider profile linked to your account. Ask your manager to set it up.", { duration: 8000 });
      } else {
        toast.error("Failed to load assignments");
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh every 15s
  useEffect(() => {
    const t = setInterval(loadData, 15000);
    return () => clearInterval(t);
  }, [loadData]);

  const doAction = async (assignmentId: string, status: AssignmentRecord['status']) => {
    setActionIds(prev => new Set([...prev, assignmentId]));
    try {
      await deliveryService.updateStatus(assignmentId, status);
      const labels: Record<string, string> = { accepted: "Accepted!", dispatched: "Marked as On the Way", delivered: "Marked as Delivered!", returned: "Marked as Returned" };
      toast.success(labels[status] || "Updated");
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || "Action failed");
    } finally {
      setActionIds(prev => { const n = new Set(prev); n.delete(assignmentId); return n; });
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-3">
        <Bike className="h-12 w-12 text-primary mx-auto animate-pulse" />
        <p className="text-muted-foreground">Loading your portal...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
            <Bike className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-bold text-sm">{user?.name}</p>
            <p className="text-xs text-muted-foreground">Rider Portal</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {rider && (
            <Badge className={cn("text-xs", rider.status === "available" ? "bg-success/10 text-success" : "bg-primary/10 text-primary")}>
              {rider.status === "on_delivery" ? "On Delivery" : "Available"}
            </Badge>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={loadData}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {/* Stats Strip */}
        {stats && (
          <div className="grid grid-cols-3 gap-3">
            <Card className="shadow-sm">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">Today</p>
                <p className="text-xl font-bold text-primary">{stats.todayOrders}</p>
                <p className="text-[10px] text-muted-foreground">deliveries</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">Today Sales</p>
                <p className="text-lg font-bold text-success">{currency} {stats.todaySales.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">Cash to Give</p>
                <p className={cn("text-lg font-bold", stats.pendingCash > 0 ? "text-warning" : "text-muted-foreground")}>
                  {currency} {stats.pendingCash.toLocaleString()}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        <Tabs defaultValue="active">
          <TabsList className="w-full">
            <TabsTrigger value="active" className="flex-1 gap-1.5">
              <Package className="h-3.5 w-3.5" />Active
              {assignments.filter(a => a.status !== "delivered").length > 0 && (
                <Badge className="h-4 px-1 text-[10px] bg-primary text-primary-foreground">
                  {assignments.filter(a => a.status !== "delivered").length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="stats" className="flex-1 gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />My Stats
            </TabsTrigger>
          </TabsList>

          {/* Active Assignments */}
          <TabsContent value="active" className="mt-4 space-y-3">
            {assignments.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <Package className="h-12 w-12 text-muted-foreground/40 mx-auto" />
                <p className="text-muted-foreground">No active assignments</p>
                <p className="text-xs text-muted-foreground">New orders will appear here automatically</p>
              </div>
            ) : assignments.map(a => (
              <Card key={a.id} className={cn("shadow-sm border-l-4", {
                "border-l-warning":     a.status === "pending",
                "border-l-blue-500":    a.status === "accepted",
                "border-l-primary":     a.status === "dispatched",
                "border-l-success":     a.status === "delivered",
                "border-l-destructive": a.status === "returned",
              })}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{a.order?.orderNumber}</span>
                    <Badge variant="secondary" className={STATUS_COLORS[a.status]}>{a.status.toUpperCase()}</Badge>
                  </div>

                  <div className="space-y-1.5">
                    <p className="font-medium text-sm">{a.order?.customer}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <MapPin className="h-3 w-3 shrink-0" />{a.customerAddress || "No address"}
                    </p>
                    {a.customerPhone && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Phone className="h-3 w-3 shrink-0" />
                        <a href={`tel:${a.customerPhone}`} className="text-primary">{a.customerPhone}</a>
                      </p>
                    )}
                    {a.estimatedTime && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Clock className="h-3 w-3 shrink-0" />Est. {a.estimatedTime} min
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t">
                    <div>
                      <p className="text-xs text-muted-foreground">Collect from Customer</p>
                      <p className="font-bold text-primary text-lg">{currency} {(a.amountToCollect ?? a.order?.total ?? 0).toLocaleString()}</p>
                    </div>
                    <Banknote className="h-6 w-6 text-primary/30" />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-1">
                    {a.status === "pending" && (
                      <Button size="sm" className="flex-1 gradient-primary text-primary-foreground" disabled={actionIds.has(a.id)}
                        onClick={() => doAction(a.id, "accepted")}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Accept Order
                      </Button>
                    )}
                    {a.status === "accepted" && (
                      <Button size="sm" className="flex-1 gradient-primary text-primary-foreground" disabled={actionIds.has(a.id)}
                        onClick={() => doAction(a.id, "dispatched")}>
                        <Truck className="h-3.5 w-3.5 mr-1" />On the Way
                      </Button>
                    )}
                    {a.status === "dispatched" && (
                      <>
                        <Button size="sm" className="flex-1 bg-success text-white hover:bg-success/90" disabled={actionIds.has(a.id)}
                          onClick={() => doAction(a.id, "delivered")}>
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Delivered
                        </Button>
                        <Button size="sm" variant="outline" disabled={actionIds.has(a.id)}
                          onClick={() => doAction(a.id, "returned")}>
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* Stats Tab */}
          <TabsContent value="stats" className="mt-4">
            <Card className="shadow-sm">
              <CardHeader><CardTitle className="text-sm">My Performance</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {stats ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-muted/50 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-primary">{stats.todayOrders}</p>
                        <p className="text-xs text-muted-foreground">Today's Deliveries</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-success">{currency} {stats.todaySales.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">Today's Sales</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold">{stats.totalOrders}</p>
                        <p className="text-xs text-muted-foreground">Total Deliveries</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-success">{currency} {stats.totalSales.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">Total Sales</p>
                      </div>
                    </div>
                    {stats.pendingCash > 0 && (
                      <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 flex items-center gap-3">
                        <Banknote className="h-5 w-5 text-warning shrink-0" />
                        <div>
                          <p className="text-sm font-bold text-warning">{currency} {stats.pendingCash.toLocaleString()} to hand over</p>
                          <p className="text-xs text-muted-foreground">Give this cash to your manager</p>
                        </div>
                      </div>
                    )}
                  </>
                ) : <p className="text-muted-foreground text-center py-4">Loading stats...</p>}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default RiderPortal;

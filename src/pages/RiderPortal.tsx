import { useState, useCallback } from "react";
import { Bike, MapPin, Phone, Clock, CheckCircle2, Truck, RotateCcw, RefreshCw, Package, TrendingUp, Banknote, LogOut, User, Calendar, CalendarOff, Plus, FileText, XCircle, Timer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { deliveryService, type RiderRecord, type AssignmentRecord } from "@/services/delivery.service";
import { useVisiblePolling } from "@/hooks/use-visible-polling";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { LeaveRequest } from "@/contexts/DataContext";

const STATUS_COLORS: Record<string, string> = {
  pending:    "bg-warning/10 text-warning border-warning/20",
  accepted:   "bg-blue-100 text-blue-700 border-blue-200",
  dispatched: "bg-primary/10 text-primary border-primary/20",
  delivered:  "bg-success/10 text-success border-success/20",
  returned:   "bg-destructive/10 text-destructive border-destructive/20",
};

const RiderPortal = () => {
  const { settings, attendance: attendanceList, leaveRequests, leaveBalances, addItem } = useData();
  const { user, logout } = useAuth();
  const currency      = settings?.currency || "Rs.";

  const [rider, setRider]           = useState<RiderRecord | null>(null);
  const [assignments, setAssignments] = useState<AssignmentRecord[]>([]);
  const [stats, setStats]           = useState<{ todayOrders: number; todaySales: number; totalOrders: number; totalSales: number; pendingCash: number } | null>(null);
  const [loading, setLoading]       = useState(true);
  const [actionIds, setActionIds]   = useState<Set<string>>(new Set());
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ leaveType: "casual" as LeaveRequest["leaveType"], startDate: "", endDate: "", reason: "" });

  const myId   = user?.id   || "";
  const myName = user?.name || "";
  const myLeaves      = leaveRequests.filter(l => l.employeeId === myId).sort((a, b) => b.appliedOn.localeCompare(a.appliedOn));
  const myBalance     = leaveBalances.find(b => b.employeeId === myId);
  const myAttendance  = attendanceList.filter(a => a.employee === myName).sort((a, b) => b.date.localeCompare(a.date));
  const pendingLeaves = myLeaves.filter(l => l.status === "pending").length;

  const handleLeaveSubmit = () => {
    if (!leaveForm.startDate || !leaveForm.endDate || !leaveForm.reason) { toast.error("All fields are required"); return; }
    const start = new Date(leaveForm.startDate);
    const end   = new Date(leaveForm.endDate);
    if (end < start) { toast.error("End date must be after start date"); return; }
    const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
    addItem("leaveRequests", {
      id: crypto.randomUUID(), employeeId: myId, employeeName: myName,
      employeeRole: user?.role || "", leaveType: leaveForm.leaveType,
      startDate: leaveForm.startDate, endDate: leaveForm.endDate, totalDays, reason: leaveForm.reason,
      status: "pending" as const, appliedOn: new Date().toISOString().split("T")[0],
    } as LeaveRequest);
    toast.success("Leave request submitted");
    setShowLeaveForm(false);
    setLeaveForm({ leaveType: "casual", startDate: "", endDate: "", reason: "" });
  };

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

  // Refresh assignments every 45s while the tab is visible. The rider's phone
  // screen is off most of the time, so a hidden tab now stops polling and lets
  // the Neon compute scale to zero between deliveries.
  useVisiblePolling(loadData, 45000);

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
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={logout} title="Logout">
            <LogOut className="h-3.5 w-3.5" />
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
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="active" className="gap-1 text-xs px-1">
              <Package className="h-3.5 w-3.5 shrink-0" />
              <span>Active</span>
              {assignments.filter(a => a.status !== "delivered").length > 0 && (
                <Badge className="h-4 px-1 text-[10px] bg-primary text-primary-foreground">
                  {assignments.filter(a => a.status !== "delivered").length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="stats" className="gap-1 text-xs px-1">
              <TrendingUp className="h-3.5 w-3.5 shrink-0" /><span>Stats</span>
            </TabsTrigger>
            <TabsTrigger value="portal" className="gap-1 text-xs px-1">
              <User className="h-3.5 w-3.5 shrink-0" /><span>My Portal</span>
            </TabsTrigger>
            <TabsTrigger value="attendance" className="gap-1 text-xs px-1">
              <Clock className="h-3.5 w-3.5 shrink-0" /><span>Attendance</span>
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

          {/* My Portal Tab */}
          <TabsContent value="portal" className="mt-4 space-y-4">
            {/* Rider Profile */}
            <Card className="shadow-sm">
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><User className="h-4 w-4" />My Profile</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-xl font-bold shrink-0">
                    {user?.name?.charAt(0) ?? "R"}
                  </div>
                  <div>
                    <p className="font-bold text-base">{user?.name}</p>
                    <p className="text-muted-foreground text-xs">{user?.role}</p>
                    {rider && <Badge className={cn("text-xs mt-1", rider.status === "available" ? "bg-success/10 text-success" : "bg-primary/10 text-primary")}>{rider.status === "on_delivery" ? "On Delivery" : "Available"}</Badge>}
                  </div>
                </div>
                {rider && (
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                    <div><p className="text-muted-foreground text-xs">Phone</p><p className="font-medium">{rider.phone || "—"}</p></div>
                    <div><p className="text-muted-foreground text-xs">Vehicle</p><p className="font-medium">{rider.vehicleType || "—"}</p></div>
                    <div><p className="text-muted-foreground text-xs">Vehicle #</p><p className="font-medium">{rider.vehicleNumber || "—"}</p></div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Leave Balance */}
            {myBalance && (
              <div className="grid grid-cols-3 gap-2">
                {(["annual", "sick", "casual"] as const).map(type => (
                  <Card key={type} className="shadow-sm">
                    <CardContent className="p-3 text-center">
                      <p className="text-xs text-muted-foreground capitalize">{type}</p>
                      <p className="text-xl font-bold text-primary">{myBalance[type].total - myBalance[type].used}</p>
                      <p className="text-[10px] text-muted-foreground">remaining</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Leave Requests */}
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2"><CalendarOff className="h-4 w-4" />My Leaves {pendingLeaves > 0 && <Badge className="bg-warning text-warning-foreground text-[10px] h-4 px-1">{pendingLeaves}</Badge>}</CardTitle>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowLeaveForm(v => !v)}>
                    <Plus className="h-3 w-3 mr-1" />Request
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {showLeaveForm && (
                  <div className="border rounded-lg p-4 mb-4 space-y-3 bg-muted/30">
                    <div><Label className="text-xs">Leave Type</Label>
                      <Select value={leaveForm.leaveType} onValueChange={(v: LeaveRequest["leaveType"]) => setLeaveForm(p => ({ ...p, leaveType: v }))}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="casual">Casual</SelectItem>
                          <SelectItem value="sick">Sick</SelectItem>
                          <SelectItem value="annual">Annual</SelectItem>
                          <SelectItem value="emergency">Emergency</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label className="text-xs">From</Label><Input type="date" className="h-8 text-sm" value={leaveForm.startDate} onChange={e => setLeaveForm(p => ({ ...p, startDate: e.target.value }))} /></div>
                      <div><Label className="text-xs">To</Label><Input type="date" className="h-8 text-sm" value={leaveForm.endDate} onChange={e => setLeaveForm(p => ({ ...p, endDate: e.target.value }))} /></div>
                    </div>
                    <div><Label className="text-xs">Reason</Label><Textarea className="text-sm" rows={2} value={leaveForm.reason} onChange={e => setLeaveForm(p => ({ ...p, reason: e.target.value }))} placeholder="Reason..." /></div>
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={() => setShowLeaveForm(false)}>Cancel</Button>
                      <Button size="sm" className="gradient-primary text-primary-foreground" onClick={handleLeaveSubmit}>Submit</Button>
                    </div>
                  </div>
                )}
                {myLeaves.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No leave requests yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {myLeaves.slice(0, 5).map(l => (
                      <div key={l.id} className="flex items-center justify-between p-3 rounded-lg border text-sm">
                        <div>
                          <p className="font-medium capitalize">{l.leaveType} leave</p>
                          <p className="text-xs text-muted-foreground">{l.startDate} → {l.endDate} ({l.totalDays}d)</p>
                        </div>
                        <Badge variant="secondary" className={cn("capitalize text-xs", l.status === "approved" ? "bg-success/10 text-success" : l.status === "rejected" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning")}>{l.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Attendance Tab */}
          <TabsContent value="attendance" className="mt-4 space-y-4">
            {/* Monthly summary */}
            {(() => {
              const thisMonth = new Date().toISOString().substring(0, 7);
              const monthRecs = myAttendance.filter(a => a.date.startsWith(thisMonth));
              const present   = monthRecs.filter(a => a.status === "present").length;
              const late      = monthRecs.filter(a => a.status === "late").length;
              const absent    = monthRecs.filter(a => a.status === "absent").length;
              const hours     = monthRecs.reduce((s, a) => s + (a.totalHours || 0), 0);
              return (
                <div className="grid grid-cols-4 gap-2">
                  <Card className="shadow-sm"><CardContent className="p-3 text-center"><p className="text-xl font-bold text-success">{present}</p><p className="text-[10px] text-muted-foreground">Present</p></CardContent></Card>
                  <Card className="shadow-sm"><CardContent className="p-3 text-center"><p className="text-xl font-bold text-warning">{late}</p><p className="text-[10px] text-muted-foreground">Late</p></CardContent></Card>
                  <Card className="shadow-sm"><CardContent className="p-3 text-center"><p className="text-xl font-bold text-destructive">{absent}</p><p className="text-[10px] text-muted-foreground">Absent</p></CardContent></Card>
                  <Card className="shadow-sm"><CardContent className="p-3 text-center"><p className="text-xl font-bold">{hours.toFixed(0)}</p><p className="text-[10px] text-muted-foreground">Hours</p></CardContent></Card>
                </div>
              );
            })()}

            <Card className="shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" />Attendance History</CardTitle></CardHeader>
              <CardContent>
                {myAttendance.length === 0 ? (
                  <div className="text-center py-10">
                    <Clock className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No attendance records</p>
                  </div>
                ) : (
                  <div className="rounded-lg border overflow-auto max-h-[50vh]">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card z-10">
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableHead className="text-xs">Date</TableHead>
                          <TableHead className="text-xs">In</TableHead>
                          <TableHead className="text-xs">Out</TableHead>
                          <TableHead className="text-xs">Hrs</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {myAttendance.map(a => (
                          <TableRow key={a.id} className="hover:bg-muted/30">
                            <TableCell className="text-xs font-medium">{a.date}</TableCell>
                            <TableCell className="text-xs">{a.clockIn || "—"}</TableCell>
                            <TableCell className="text-xs">{a.clockOut || "—"}</TableCell>
                            <TableCell className="text-xs">{a.totalHours ?? "—"}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={cn("text-[10px]",
                                a.status === "present" ? "bg-success/10 text-success" :
                                a.status === "late"    ? "bg-warning/10 text-warning"  :
                                "bg-destructive/10 text-destructive"
                              )}>{a.status}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default RiderPortal;

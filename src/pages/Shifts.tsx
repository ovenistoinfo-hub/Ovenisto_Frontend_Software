import { useState, useEffect, useMemo } from "react";
import { Timer, Plus, Eye, Calendar, CalendarOff, ChevronLeft, ChevronRight, Check, X, Clock, Users, FileText, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Shift, StaffSchedule, LeaveRequest, ShiftTemplate } from "@/contexts/DataContext";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const leaveTypeColors: Record<string, string> = {
  sick: "bg-destructive/10 text-destructive",
  casual: "bg-info/10 text-info",
  annual: "bg-success/10 text-success",
  emergency: "bg-warning/10 text-warning",
};
const leaveStatusColors: Record<string, string> = {
  pending: "bg-warning/10 text-warning",
  approved: "bg-success/10 text-success",
  rejected: "bg-destructive/10 text-destructive",
};

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

// ────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────

const Shifts = () => {
  const { shifts, orders, staffSchedules, shiftTemplates, leaveRequests, leaveBalances, users, settings, addItem, updateItem, removeItem } = useData();
  const { user } = useAuth();
  const currency = settings.currency || "Rs.";
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"cash" | "schedule" | "leave">("cash");
  useEffect(() => { const t = setTimeout(() => setLoading(false), 500); return () => clearTimeout(t); }, []);

  // ── Cash Shifts State ──
  const [showOpen, setShowOpen] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [openingCash, setOpeningCash] = useState("");
  const [closingCash, setClosingCash] = useState("");
  const [cashNotes, setCashNotes] = useState("");
  const [viewShift, setViewShift] = useState<Shift | null>(null);

  // ── Schedule State ──
  const [weekOffset, setWeekOffset] = useState(0);
  const [editingCell, setEditingCell] = useState<{ schedId: string; day: number } | null>(null);
  const [showAddSchedule, setShowAddSchedule] = useState(false);
  const [newSchedEmployee, setNewSchedEmployee] = useState("");

  // ── Leave State ──
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ employeeId: "", leaveType: "casual" as LeaveRequest["leaveType"], startDate: "", endDate: "", reason: "" });
  const [reviewingLeave, setReviewingLeave] = useState<LeaveRequest | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  const currentWeekStart = useMemo(() => {
    const base = getWeekStart(new Date());
    return addDays(base, weekOffset * 7);
  }, [weekOffset]);

  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i)), [currentWeekStart]);
  const weekKey = formatDate(currentWeekStart);
  const weekSchedules = staffSchedules.filter(s => s.weekStart === weekKey);

  // ── Cash Shift functions ──
  const activeShift = shifts.find(s => s.status === "open");
  const closedShifts = shifts.filter(s => s.status === "closed").sort((a, b) => b.openedAt.localeCompare(a.openedAt));

  const openShift = () => {
    if (!openingCash) { toast.error("Opening cash required"); return; }
    const num = `SH-${String(shifts.length + 1).padStart(3, "0")}`;
    addItem("shifts", {
      id: crypto.randomUUID(), shiftNumber: num, cashierId: "user-1", cashierName: user?.name || "Admin",
      openedAt: new Date().toISOString(), openingCash: Number(openingCash), status: "open",
      totalSales: 0, totalCashSales: 0, totalCardSales: 0, totalOnlineSales: 0,
      orderCount: 0, cancelledOrders: 0, totalExpenses: 0, expectedCash: Number(openingCash), notes: cashNotes,
    } as Shift);
    toast.success("Shift opened"); setShowOpen(false); setOpeningCash(""); setCashNotes("");
  };

  const closeShift = () => {
    if (!activeShift || !closingCash) { toast.error("Closing cash required"); return; }
    const shiftOrders = orders.filter(o => {
      const od = new Date(`${o.date}T${o.time?.replace(" AM", "").replace(" PM", "") || "00:00"}`);
      return od >= new Date(activeShift.openedAt);
    });
    const totalSales = shiftOrders.filter(o => o.status === "completed").reduce((s, o) => s + o.total, 0);
    const cashSales = shiftOrders.filter(o => o.paymentMethod === "Cash").reduce((s, o) => s + o.total, 0);
    const cardSales = shiftOrders.filter(o => o.paymentMethod === "Card").reduce((s, o) => s + o.total, 0);
    const onlineSales = totalSales - cashSales - cardSales;
    const cancelled = shiftOrders.filter(o => o.status === "cancelled").length;
    const expected = activeShift.openingCash + cashSales;
    const diff = Number(closingCash) - expected;
    updateItem("shifts", activeShift.id, {
      status: "closed", closedAt: new Date().toISOString(), closingCash: Number(closingCash),
      totalSales, totalCashSales: cashSales, totalCardSales: cardSales, totalOnlineSales: onlineSales,
      orderCount: shiftOrders.length, cancelledOrders: cancelled, totalExpenses: 0,
      expectedCash: expected, cashDifference: diff, notes: cashNotes,
    });
    toast.success("Shift closed"); setShowClose(false); setClosingCash(""); setCashNotes("");
  };

  // ── Schedule functions ──
  const handleAssignShift = (schedId: string, day: number, templateId: string) => {
    const tmpl = shiftTemplates.find(t => t.id === templateId);
    if (!tmpl) return;
    const sched = staffSchedules.find(s => s.id === schedId);
    if (!sched) return;
    const newShifts = sched.shifts.map(sh => sh.day === day ? { ...sh, templateId: tmpl.id, templateName: tmpl.name, startTime: tmpl.startTime, endTime: tmpl.endTime } : sh);
    if (!newShifts.find(sh => sh.day === day)) {
      newShifts.push({ day, templateId: tmpl.id, templateName: tmpl.name, startTime: tmpl.startTime, endTime: tmpl.endTime });
    }
    updateItem("staffSchedules", schedId, { shifts: newShifts });
    setEditingCell(null);
  };

  const handleAddSchedule = () => {
    if (!newSchedEmployee) return;
    const emp = users.find(u => u.id === newSchedEmployee);
    if (!emp) return;
    if (weekSchedules.find(s => s.employeeId === emp.id)) { toast.error("Employee already has schedule for this week"); return; }
    const defaultShifts = DAY_LABELS.map((_, i) => ({ day: i, templateId: "st-off", templateName: "Day Off", startTime: "", endTime: "" }));
    addItem("staffSchedules", {
      id: crypto.randomUUID(), employeeId: emp.id, employeeName: emp.name, employeeRole: emp.role,
      weekStart: weekKey, shifts: defaultShifts, status: "draft" as const, createdBy: user?.name || "Admin", createdAt: formatDate(new Date()),
    } as StaffSchedule);
    toast.success(`Schedule added for ${emp.name}`);
    setShowAddSchedule(false); setNewSchedEmployee("");
  };

  const publishWeek = () => {
    weekSchedules.filter(s => s.status === "draft").forEach(s => updateItem("staffSchedules", s.id, { status: "published" }));
    toast.success("Schedule published for the week");
  };

  // ── Leave functions ──
  const handleLeaveSubmit = () => {
    if (!leaveForm.employeeId || !leaveForm.startDate || !leaveForm.endDate || !leaveForm.reason) { toast.error("All fields are required"); return; }
    const emp = users.find(u => u.id === leaveForm.employeeId);
    const start = new Date(leaveForm.startDate);
    const end = new Date(leaveForm.endDate);
    const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
    addItem("leaveRequests", {
      id: crypto.randomUUID(), employeeId: leaveForm.employeeId, employeeName: emp?.name || "",
      employeeRole: emp?.role || "", leaveType: leaveForm.leaveType,
      startDate: leaveForm.startDate, endDate: leaveForm.endDate, totalDays, reason: leaveForm.reason,
      status: "pending" as const, appliedOn: formatDate(new Date()),
    } as LeaveRequest);
    toast.success("Leave request submitted");
    setShowLeaveForm(false); setLeaveForm({ employeeId: "", leaveType: "casual", startDate: "", endDate: "", reason: "" });
  };

  const handleLeaveAction = (action: "approved" | "rejected") => {
    if (!reviewingLeave) return;
    updateItem("leaveRequests", reviewingLeave.id, {
      status: action, reviewedBy: user?.name || "Admin", reviewedOn: formatDate(new Date()), reviewNote,
    });
    if (action === "approved") {
      const bal = leaveBalances.find(b => b.employeeId === reviewingLeave.employeeId);
      if (bal) {
        const type = reviewingLeave.leaveType === "emergency" ? "casual" : reviewingLeave.leaveType;
        const current = bal[type];
        updateItem("leaveBalances", reviewingLeave.employeeId, { [type]: { ...current, used: current.used + reviewingLeave.totalDays } });
      }
    }
    toast.success(`Leave ${action}`);
    setReviewingLeave(null); setReviewNote("");
  };

  const pendingLeaves = leaveRequests.filter(l => l.status === "pending");
  const allLeaves = [...leaveRequests].sort((a, b) => b.appliedOn.localeCompare(a.appliedOn));

  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <div className="flex gap-2"><Skeleton className="h-10 w-32" /><Skeleton className="h-10 w-32" /><Skeleton className="h-10 w-32" /></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg mt-2" />)}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Timer className="h-5 w-5" />}
        title="Shift Management"
        subtitle="Cash shifts, staff scheduling & leave management"
        actions={
          activeTab === "cash" && !activeShift ? <Button className="gradient-primary text-primary-foreground" onClick={() => setShowOpen(true)}><Plus className="h-4 w-4 mr-2" />Open Shift</Button>
          : activeTab === "schedule" ? (
            <div className="flex gap-2">
              {weekSchedules.some(s => s.status === "draft") && <Button className="gradient-primary text-primary-foreground" onClick={publishWeek}><Send className="h-4 w-4 mr-2" />Publish</Button>}
              <Button className="gradient-primary text-primary-foreground" onClick={() => setShowAddSchedule(true)}><Plus className="h-4 w-4 mr-2" />Add Employee</Button>
            </div>
          )
          : activeTab === "leave" ? <Button className="gradient-primary text-primary-foreground" onClick={() => setShowLeaveForm(true)}><Plus className="h-4 w-4 mr-2" />New Leave Request</Button>
          : undefined
        }
      />

      {/* Tab Buttons */}
      <div className="flex border rounded-lg overflow-hidden w-fit">
        {([
          { key: "cash" as const, label: "Cash Shifts", icon: Timer },
          { key: "schedule" as const, label: "Staff Schedule", icon: Calendar },
          { key: "leave" as const, label: "Leave Management", icon: CalendarOff },
        ]).map(tab => (
          <Button key={tab.key} variant={activeTab === tab.key ? "default" : "ghost"} size="sm"
            onClick={() => setActiveTab(tab.key)}
            className={cn("rounded-none gap-2", activeTab === tab.key && "gradient-primary text-primary-foreground")}>
            <tab.icon className="h-4 w-4" />{tab.label}
            {tab.key === "leave" && pendingLeaves.length > 0 && (
              <span className="ml-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center">{pendingLeaves.length}</span>
            )}
          </Button>
        ))}
      </div>

      {/* ═══════════ TAB 1: CASH SHIFTS ═══════════ */}
      {activeTab === "cash" && (
        <>
          {activeShift && (
            <Card className="shadow-sm border-primary/30">
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-success animate-pulse" />Active Shift: {activeShift.shiftNumber}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div><p className="text-muted-foreground">Cashier</p><p className="font-medium">{activeShift.cashierName}</p></div>
                  <div><p className="text-muted-foreground">Opened</p><p className="font-medium">{new Date(activeShift.openedAt).toLocaleTimeString()}</p></div>
                  <div><p className="text-muted-foreground">Opening Cash</p><p className="font-medium">{currency} {activeShift.openingCash.toLocaleString()}</p></div>
                  <div><p className="text-muted-foreground">Expected Cash</p><p className="font-medium">{currency} {activeShift.expectedCash.toLocaleString()}</p></div>
                </div>
                <Button className="gradient-primary text-primary-foreground" onClick={() => setShowClose(true)}><Clock className="h-4 w-4 mr-2" />Close Shift</Button>
              </CardContent>
            </Card>
          )}

          <Card className="shadow-sm"><CardHeader><CardTitle className="text-base">Shift History</CardTitle></CardHeader><CardContent>
            <div className="rounded-lg border overflow-auto max-h-[calc(100vh-400px)]">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>Shift #</TableHead><TableHead>Date</TableHead><TableHead>Cashier</TableHead><TableHead>Duration</TableHead><TableHead>Sales</TableHead><TableHead>Cash Diff</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {closedShifts.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No shift history</TableCell></TableRow>}
                  {closedShifts.map(s => {
                    const opened = new Date(s.openedAt);
                    const closed = s.closedAt ? new Date(s.closedAt) : new Date();
                    const durationMs = closed.getTime() - opened.getTime();
                    const hours = Math.floor(durationMs / 3600000);
                    const mins = Math.floor((durationMs % 3600000) / 60000);
                    return (<TableRow key={s.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-medium">{s.shiftNumber}</TableCell>
                      <TableCell className="text-xs">{opened.toLocaleDateString()}</TableCell>
                      <TableCell>{s.cashierName}</TableCell>
                      <TableCell>{hours}h {mins}m</TableCell>
                      <TableCell className="font-medium">{currency} {s.totalSales.toLocaleString()}</TableCell>
                      <TableCell className={s.cashDifference && s.cashDifference !== 0 ? (s.cashDifference > 0 ? "text-success" : "text-destructive") : ""}>{s.cashDifference !== undefined ? `${currency} ${s.cashDifference > 0 ? "+" : ""}${s.cashDifference.toLocaleString()}` : "—"}</TableCell>
                      <TableCell><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewShift(s)}><Eye className="h-3 w-3" /></Button></TableCell>
                    </TableRow>);
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent></Card>
        </>
      )}

      {/* ═══════════ TAB 2: STAFF SCHEDULE ═══════════ */}
      {activeTab === "schedule" && (
        <>
          {/* Week Navigator */}
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekOffset(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <div className="text-sm font-medium">
              {weekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} — {weekDates[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </div>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekOffset(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setWeekOffset(0)}>Today</Button>
            {weekSchedules.some(s => s.status === "draft") && <Badge variant="secondary" className="bg-warning/10 text-warning">Unpublished changes</Badge>}
          </div>

          {/* KPI Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card className="shadow-sm"><CardContent className="p-4 flex items-center justify-between">
              <div><p className="text-xs text-muted-foreground">Scheduled Staff</p><p className="text-2xl font-bold">{weekSchedules.length}</p></div>
              <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-primary/10"><Users className="h-5 w-5 text-primary" /></div>
            </CardContent></Card>
            <Card className="shadow-sm"><CardContent className="p-4 flex items-center justify-between">
              <div><p className="text-xs text-muted-foreground">Morning Shifts</p><p className="text-2xl font-bold">{weekSchedules.reduce((c, s) => c + s.shifts.filter(sh => sh.templateId === "st-morning").length, 0)}</p></div>
              <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-info/10"><Clock className="h-5 w-5 text-info" /></div>
            </CardContent></Card>
            <Card className="shadow-sm"><CardContent className="p-4 flex items-center justify-between">
              <div><p className="text-xs text-muted-foreground">Evening Shifts</p><p className="text-2xl font-bold">{weekSchedules.reduce((c, s) => c + s.shifts.filter(sh => sh.templateId === "st-evening").length, 0)}</p></div>
              <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-accent/10"><Clock className="h-5 w-5 text-accent" /></div>
            </CardContent></Card>
            <Card className="shadow-sm"><CardContent className="p-4 flex items-center justify-between">
              <div><p className="text-xs text-muted-foreground">Days Off</p><p className="text-2xl font-bold">{weekSchedules.reduce((c, s) => c + s.shifts.filter(sh => sh.templateId === "st-off").length, 0)}</p></div>
              <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-muted"><CalendarOff className="h-5 w-5 text-muted-foreground" /></div>
            </CardContent></Card>
          </div>

          {/* Schedule Grid */}
          <Card className="shadow-sm">
            <CardContent className="p-0">
              <div className="rounded-lg border overflow-auto max-h-[calc(100vh-420px)]">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="min-w-[160px] font-medium">Employee</TableHead>
                      {weekDates.map((d, i) => (
                        <TableHead key={i} className="text-center min-w-[120px] font-medium">
                          <div>{DAY_LABELS[i]}</div>
                          <div className="text-[10px] text-muted-foreground font-normal">{d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {weekSchedules.length === 0 && (
                      <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                        <Calendar className="h-12 w-12 mx-auto mb-3 opacity-30" />
                        <p>No schedules for this week</p>
                        <p className="text-xs mt-1">Click "Add Employee" to start scheduling</p>
                      </TableCell></TableRow>
                    )}
                    {weekSchedules.map(sched => (
                      <TableRow key={sched.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{sched.employeeName}</p>
                            <p className="text-xs text-muted-foreground">{sched.employeeRole}</p>
                          </div>
                        </TableCell>
                        {DAY_LABELS.map((_, dayIdx) => {
                          const dayShift = sched.shifts.find(sh => sh.day === dayIdx);
                          const tmpl = dayShift ? shiftTemplates.find(t => t.id === dayShift.templateId) : null;
                          const isEditing = editingCell?.schedId === sched.id && editingCell?.day === dayIdx;
                          return (
                            <TableCell key={dayIdx} className="text-center p-1">
                              {isEditing ? (
                                <Select onValueChange={(v) => handleAssignShift(sched.id, dayIdx, v)} onOpenChange={(open) => { if (!open) setEditingCell(null); }}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                                  <SelectContent>
                                    {shiftTemplates.map(t => (
                                      <SelectItem key={t.id} value={t.id}>
                                        <span className="flex items-center gap-2">
                                          <span className={cn("h-2 w-2 rounded-full", t.color.split(" ")[0])} />
                                          {t.name}
                                          {t.startTime && <span className="text-muted-foreground ml-1">({t.startTime})</span>}
                                        </span>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <button
                                  onClick={() => setEditingCell({ schedId: sched.id, day: dayIdx })}
                                  className={cn(
                                    "w-full rounded-md px-2 py-1.5 text-xs font-medium transition-all hover:ring-2 hover:ring-primary/30 cursor-pointer border",
                                    tmpl ? tmpl.color : "bg-muted text-muted-foreground"
                                  )}
                                >
                                  <div>{dayShift?.templateName || "—"}</div>
                                  {dayShift?.startTime && <div className="text-[10px] opacity-75">{dayShift.startTime}</div>}
                                </button>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Template Legend */}
          <div className="flex flex-wrap gap-3 text-xs">
            {shiftTemplates.map(t => (
              <span key={t.id} className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-1 border", t.color)}>
                <span className={cn("h-2 w-2 rounded-full", t.color.split(" ")[0])} />
                {t.name} {t.startTime && `(${t.startTime} – ${t.endTime})`}
              </span>
            ))}
          </div>
        </>
      )}

      {/* ═══════════ TAB 3: LEAVE MANAGEMENT ═══════════ */}
      {activeTab === "leave" && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card className="shadow-sm"><CardContent className="p-4 flex items-center justify-between">
              <div><p className="text-xs text-muted-foreground">Pending Requests</p><p className="text-2xl font-bold text-warning">{pendingLeaves.length}</p></div>
              <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-warning/10"><Clock className="h-5 w-5 text-warning" /></div>
            </CardContent></Card>
            <Card className="shadow-sm"><CardContent className="p-4 flex items-center justify-between">
              <div><p className="text-xs text-muted-foreground">Approved (This Month)</p><p className="text-2xl font-bold text-success">{leaveRequests.filter(l => l.status === "approved" && l.startDate.startsWith(formatDate(new Date()).substring(0, 7))).length}</p></div>
              <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-success/10"><Check className="h-5 w-5 text-success" /></div>
            </CardContent></Card>
            <Card className="shadow-sm"><CardContent className="p-4 flex items-center justify-between">
              <div><p className="text-xs text-muted-foreground">Rejected (This Month)</p><p className="text-2xl font-bold text-destructive">{leaveRequests.filter(l => l.status === "rejected" && l.appliedOn.startsWith(formatDate(new Date()).substring(0, 7))).length}</p></div>
              <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-destructive/10"><X className="h-5 w-5 text-destructive" /></div>
            </CardContent></Card>
            <Card className="shadow-sm"><CardContent className="p-4 flex items-center justify-between">
              <div><p className="text-xs text-muted-foreground">Total Employees</p><p className="text-2xl font-bold">{users.length}</p></div>
              <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-primary/10"><Users className="h-5 w-5 text-primary" /></div>
            </CardContent></Card>
          </div>

          {/* Pending Requests Section */}
          {pendingLeaves.length > 0 && (
            <Card className="shadow-sm border-warning/30">
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4 text-warning" />Pending Approval ({pendingLeaves.length})</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {pendingLeaves.map(leave => (
                    <div key={leave.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-lg border p-3 bg-warning/5">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{leave.employeeName}</p>
                          <Badge variant="secondary" className="text-[10px]">{leave.employeeRole}</Badge>
                          <Badge variant="secondary" className={cn("text-[10px] capitalize", leaveTypeColors[leave.leaveType])}>{leave.leaveType}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{leave.startDate} to {leave.endDate} ({leave.totalDays} day{leave.totalDays > 1 ? "s" : ""})</p>
                        <p className="text-xs text-muted-foreground italic">"{leave.reason}"</p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="text-destructive border-destructive/30 h-8" onClick={() => { setReviewingLeave(leave); setReviewNote(""); }}>
                          <X className="h-3 w-3 mr-1" />Reject
                        </Button>
                        <Button size="sm" className="gradient-primary text-primary-foreground h-8" onClick={() => { setReviewingLeave(leave); setReviewNote(""); }}>
                          <Check className="h-3 w-3 mr-1" />Approve
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Leave Balances Table */}
          <Card className="shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-base">Leave Balances</CardTitle></CardHeader>
            <CardContent>
              <div className="rounded-lg border overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-center">Annual (Used/Total)</TableHead>
                    <TableHead className="text-center">Sick (Used/Total)</TableHead>
                    <TableHead className="text-center">Casual (Used/Total)</TableHead>
                    <TableHead className="text-center">Remaining</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {leaveBalances.map(bal => {
                      const total = (bal.annual.total - bal.annual.used) + (bal.sick.total - bal.sick.used) + (bal.casual.total - bal.casual.used);
                      return (
                        <TableRow key={bal.employeeId} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="font-medium">{bal.employeeName}</TableCell>
                          <TableCell className="text-center"><span className="text-success font-medium">{bal.annual.used}</span> / {bal.annual.total}</TableCell>
                          <TableCell className="text-center"><span className="text-destructive font-medium">{bal.sick.used}</span> / {bal.sick.total}</TableCell>
                          <TableCell className="text-center"><span className="text-info font-medium">{bal.casual.used}</span> / {bal.casual.total}</TableCell>
                          <TableCell className="text-center font-bold">{total}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* All Leave Requests History */}
          <Card className="shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-base">All Leave Requests</CardTitle></CardHeader>
            <CardContent>
              <div className="rounded-lg border overflow-auto max-h-[calc(100vh-400px)]">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead>Employee</TableHead><TableHead>Type</TableHead><TableHead>Dates</TableHead>
                    <TableHead>Days</TableHead><TableHead>Status</TableHead><TableHead>Applied On</TableHead><TableHead>Reviewed By</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {allLeaves.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No leave requests</TableCell></TableRow>}
                    {allLeaves.map(leave => (
                      <TableRow key={leave.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell><div><p className="font-medium text-sm">{leave.employeeName}</p><p className="text-xs text-muted-foreground">{leave.employeeRole}</p></div></TableCell>
                        <TableCell><Badge variant="secondary" className={cn("capitalize", leaveTypeColors[leave.leaveType])}>{leave.leaveType}</Badge></TableCell>
                        <TableCell className="text-xs">{leave.startDate} — {leave.endDate}</TableCell>
                        <TableCell className="font-medium">{leave.totalDays}</TableCell>
                        <TableCell><Badge variant="secondary" className={cn("capitalize", leaveStatusColors[leave.status])}>{leave.status}</Badge></TableCell>
                        <TableCell className="text-xs">{leave.appliedOn}</TableCell>
                        <TableCell className="text-xs">{leave.reviewedBy || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ═══════════ DIALOGS ═══════════ */}

      {/* Open Shift Dialog */}
      <Dialog open={showOpen} onOpenChange={setShowOpen}><DialogContent><DialogHeader><DialogTitle>Open New Shift</DialogTitle></DialogHeader>
        <div className="space-y-3"><div><Label>Opening Cash ({currency})</Label><Input type="number" min="0" value={openingCash} onChange={e => setOpeningCash(e.target.value)} placeholder="5000" /></div><div><Label>Notes (optional)</Label><Textarea value={cashNotes} onChange={e => setCashNotes(e.target.value)} /></div></div>
        <DialogFooter><Button variant="outline" onClick={() => setShowOpen(false)}>Cancel</Button><Button className="gradient-primary text-primary-foreground" onClick={openShift}>Open Shift</Button></DialogFooter></DialogContent></Dialog>

      {/* Close Shift Dialog */}
      <Dialog open={showClose} onOpenChange={setShowClose}><DialogContent><DialogHeader><DialogTitle>Close Shift</DialogTitle></DialogHeader>
        <div className="space-y-3"><div><Label>Closing Cash in Drawer ({currency})</Label><Input type="number" min="0" value={closingCash} onChange={e => setClosingCash(e.target.value)} /></div><div><Label>Notes (optional)</Label><Textarea value={cashNotes} onChange={e => setCashNotes(e.target.value)} /></div></div>
        <DialogFooter><Button variant="outline" onClick={() => setShowClose(false)}>Cancel</Button><Button className="gradient-primary text-primary-foreground" onClick={closeShift}>Confirm Close</Button></DialogFooter></DialogContent></Dialog>

      {/* View Shift Summary Dialog */}
      <Dialog open={!!viewShift} onOpenChange={() => setViewShift(null)}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Shift {viewShift?.shiftNumber} Summary</DialogTitle></DialogHeader>
        {viewShift && <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div className="text-muted-foreground">Cashier</div><div className="font-medium">{viewShift.cashierName}</div>
            <div className="text-muted-foreground">Total Sales</div><div className="font-medium">{currency} {viewShift.totalSales.toLocaleString()}</div>
            <div className="text-muted-foreground">Cash Sales</div><div>{currency} {viewShift.totalCashSales.toLocaleString()}</div>
            <div className="text-muted-foreground">Card Sales</div><div>{currency} {viewShift.totalCardSales.toLocaleString()}</div>
            <div className="text-muted-foreground">Orders</div><div>{viewShift.orderCount}</div>
            <div className="text-muted-foreground">Cancelled</div><div className="text-destructive">{viewShift.cancelledOrders}</div>
            <div className="text-muted-foreground">Opening</div><div>{currency} {viewShift.openingCash.toLocaleString()}</div>
            <div className="text-muted-foreground">Closing</div><div>{currency} {viewShift.closingCash?.toLocaleString()}</div>
            <div className="text-muted-foreground">Expected</div><div>{currency} {viewShift.expectedCash.toLocaleString()}</div>
            <div className="text-muted-foreground font-medium">Difference</div>
            <div className={`font-bold ${viewShift.cashDifference && viewShift.cashDifference !== 0 ? (viewShift.cashDifference > 0 ? "text-success" : "text-destructive") : ""}`}>
              {currency} {viewShift.cashDifference !== undefined ? `${viewShift.cashDifference > 0 ? "+" : ""}${viewShift.cashDifference.toLocaleString()}` : "0"}
            </div>
          </div>
        </div>}
        <DialogFooter><Button variant="outline" onClick={() => setViewShift(null)}>Close</Button></DialogFooter></DialogContent></Dialog>

      {/* Add Employee to Schedule Dialog */}
      <Dialog open={showAddSchedule} onOpenChange={setShowAddSchedule}><DialogContent><DialogHeader><DialogTitle>Add Employee to Schedule</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Select Employee</Label>
            <Select value={newSchedEmployee} onValueChange={setNewSchedEmployee}>
              <SelectTrigger><SelectValue placeholder="Choose employee" /></SelectTrigger>
              <SelectContent>
                {users.filter(u => !weekSchedules.find(s => s.employeeId === u.id)).map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.name} ({u.role})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">Week: {weekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} — {weekDates[6].toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setShowAddSchedule(false)}>Cancel</Button><Button className="gradient-primary text-primary-foreground" onClick={handleAddSchedule}>Add</Button></DialogFooter></DialogContent></Dialog>

      {/* New Leave Request Dialog */}
      <Dialog open={showLeaveForm} onOpenChange={setShowLeaveForm}><DialogContent><DialogHeader><DialogTitle>New Leave Request</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Employee</Label>
            <Select value={leaveForm.employeeId} onValueChange={v => setLeaveForm(p => ({ ...p, employeeId: v }))}>
              <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>{users.map(u => <SelectItem key={u.id} value={u.id}>{u.name} ({u.role})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Leave Type</Label>
            <Select value={leaveForm.leaveType} onValueChange={(v: LeaveRequest["leaveType"]) => setLeaveForm(p => ({ ...p, leaveType: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="casual">Casual Leave</SelectItem>
                <SelectItem value="sick">Sick Leave</SelectItem>
                <SelectItem value="annual">Annual Leave</SelectItem>
                <SelectItem value="emergency">Emergency Leave</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Start Date</Label><Input type="date" value={leaveForm.startDate} onChange={e => setLeaveForm(p => ({ ...p, startDate: e.target.value }))} /></div>
            <div><Label>End Date</Label><Input type="date" value={leaveForm.endDate} onChange={e => setLeaveForm(p => ({ ...p, endDate: e.target.value }))} /></div>
          </div>
          <div><Label>Reason</Label><Textarea value={leaveForm.reason} onChange={e => setLeaveForm(p => ({ ...p, reason: e.target.value }))} placeholder="Reason for leave..." /></div>
          {leaveForm.employeeId && (() => {
            const bal = leaveBalances.find(b => b.employeeId === leaveForm.employeeId);
            if (!bal) return null;
            const type = leaveForm.leaveType === "emergency" ? "casual" : leaveForm.leaveType;
            const remaining = bal[type].total - bal[type].used;
            return <p className="text-xs text-muted-foreground">Available {type} leaves: <span className={cn("font-bold", remaining > 0 ? "text-success" : "text-destructive")}>{remaining}</span></p>;
          })()}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setShowLeaveForm(false)}>Cancel</Button><Button className="gradient-primary text-primary-foreground" onClick={handleLeaveSubmit}>Submit Request</Button></DialogFooter></DialogContent></Dialog>

      {/* Leave Review Dialog */}
      <Dialog open={!!reviewingLeave} onOpenChange={() => setReviewingLeave(null)}><DialogContent><DialogHeader><DialogTitle>Review Leave Request</DialogTitle></DialogHeader>
        {reviewingLeave && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-muted-foreground">Employee</div><div className="font-medium">{reviewingLeave.employeeName}</div>
              <div className="text-muted-foreground">Role</div><div>{reviewingLeave.employeeRole}</div>
              <div className="text-muted-foreground">Type</div><div><Badge variant="secondary" className={cn("capitalize", leaveTypeColors[reviewingLeave.leaveType])}>{reviewingLeave.leaveType}</Badge></div>
              <div className="text-muted-foreground">Dates</div><div>{reviewingLeave.startDate} to {reviewingLeave.endDate}</div>
              <div className="text-muted-foreground">Total Days</div><div className="font-bold">{reviewingLeave.totalDays}</div>
              <div className="text-muted-foreground">Reason</div><div className="italic">"{reviewingLeave.reason}"</div>
            </div>
            {(() => {
              const bal = leaveBalances.find(b => b.employeeId === reviewingLeave.employeeId);
              if (!bal) return null;
              const type = reviewingLeave.leaveType === "emergency" ? "casual" : reviewingLeave.leaveType;
              const remaining = bal[type].total - bal[type].used;
              return <p className="text-xs">Available {type} balance: <span className={cn("font-bold", remaining >= reviewingLeave.totalDays ? "text-success" : "text-destructive")}>{remaining} days</span>
                {remaining < reviewingLeave.totalDays && <span className="text-destructive ml-2">(Insufficient balance!)</span>}
              </p>;
            })()}
            <div><Label>Review Note (optional)</Label><Textarea value={reviewNote} onChange={e => setReviewNote(e.target.value)} placeholder="Optional note..." /></div>
          </div>
        )}
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => setReviewingLeave(null)}>Cancel</Button>
          <Button variant="outline" className="text-destructive border-destructive/30" onClick={() => handleLeaveAction("rejected")}>
            <X className="h-4 w-4 mr-1" />Reject
          </Button>
          <Button className="gradient-primary text-primary-foreground" onClick={() => handleLeaveAction("approved")}>
            <Check className="h-4 w-4 mr-1" />Approve
          </Button>
        </DialogFooter></DialogContent></Dialog>
    </div>
  );
};

export default Shifts;

import { useState, useEffect, useMemo } from "react";
import { User, Calendar, CalendarOff, Clock, ChevronLeft, ChevronRight, Plus, FileText, CheckCircle, XCircle, Timer } from "lucide-react";
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
import { PageHeader } from "@/components/ui/page-header";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { LeaveRequest } from "@/contexts/DataContext";

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
function formatDate(d: Date): string { return d.toISOString().split("T")[0]; }
function addDays(d: Date, days: number): Date { const r = new Date(d); r.setDate(r.getDate() + days); return r; }

const EmployeePortal = () => {
  const { staffSchedules, shiftTemplates, leaveRequests, leaveBalances, attendance: attendanceList, addItem, settings } = useData();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"schedule" | "leaves" | "attendance">("schedule");
  const [weekOffset, setWeekOffset] = useState(0);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ leaveType: "casual" as LeaveRequest["leaveType"], startDate: "", endDate: "", reason: "" });
  const [viewLeave, setViewLeave] = useState<LeaveRequest | null>(null);

  useEffect(() => { const t = setTimeout(() => setLoading(false), 500); return () => clearTimeout(t); }, []);

  const myId = user?.id || "";
  const myName = user?.name || "";

  // ── My Schedule ──
  const currentWeekStart = useMemo(() => addDays(getWeekStart(new Date()), weekOffset * 7), [weekOffset]);
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i)), [currentWeekStart]);
  const weekKey = formatDate(currentWeekStart);
  const mySchedule = staffSchedules.find(s => s.employeeId === myId && s.weekStart === weekKey);

  // ── My Leaves ──
  const myLeaves = leaveRequests.filter(l => l.employeeId === myId).sort((a, b) => b.appliedOn.localeCompare(a.appliedOn));
  const myBalance = leaveBalances.find(b => b.employeeId === myId);
  const pendingCount = myLeaves.filter(l => l.status === "pending").length;

  // ── My Attendance ──
  const myAttendance = attendanceList.filter(a => a.employee === myName).sort((a, b) => b.date.localeCompare(a.date));

  // ── Leave Submit ──
  const handleLeaveSubmit = () => {
    if (!leaveForm.startDate || !leaveForm.endDate || !leaveForm.reason) { toast.error("All fields are required"); return; }
    const start = new Date(leaveForm.startDate);
    const end = new Date(leaveForm.endDate);
    if (end < start) { toast.error("End date must be after start date"); return; }
    const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);

    // Check balance
    if (myBalance) {
      const type = leaveForm.leaveType === "emergency" ? "casual" : leaveForm.leaveType;
      const remaining = myBalance[type].total - myBalance[type].used;
      if (totalDays > remaining) { toast.error(`Only ${remaining} ${type} leaves remaining`); return; }
    }

    addItem("leaveRequests", {
      id: crypto.randomUUID(), employeeId: myId, employeeName: myName,
      employeeRole: user?.role || "", leaveType: leaveForm.leaveType,
      startDate: leaveForm.startDate, endDate: leaveForm.endDate, totalDays, reason: leaveForm.reason,
      status: "pending" as const, appliedOn: formatDate(new Date()),
    } as LeaveRequest);
    toast.success("Leave request submitted successfully");
    setShowLeaveForm(false); setLeaveForm({ leaveType: "casual", startDate: "", endDate: "", reason: "" });
  };

  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg mt-2" />)}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<User className="h-5 w-5" />}
        title="My Portal"
        subtitle={`Welcome, ${myName} — ${user?.role || ""}`}
        actions={activeTab === "leaves" ? <Button className="gradient-primary text-primary-foreground" onClick={() => setShowLeaveForm(true)}><Plus className="h-4 w-4 mr-2" />Request Leave</Button> : undefined}
      />

      {/* Tab Buttons */}
      <div className="flex border rounded-lg overflow-hidden w-fit">
        {([
          { key: "schedule" as const, label: "My Schedule", icon: Calendar },
          { key: "leaves" as const, label: "My Leaves", icon: CalendarOff },
          { key: "attendance" as const, label: "My Attendance", icon: Clock },
        ]).map(tab => (
          <Button key={tab.key} variant={activeTab === tab.key ? "default" : "ghost"} size="sm"
            onClick={() => setActiveTab(tab.key)}
            className={cn("rounded-none gap-2", activeTab === tab.key && "gradient-primary text-primary-foreground")}>
            <tab.icon className="h-4 w-4" />{tab.label}
            {tab.key === "leaves" && pendingCount > 0 && (
              <span className="ml-1 bg-warning text-warning-foreground text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center">{pendingCount}</span>
            )}
          </Button>
        ))}
      </div>

      {/* ═══════════ TAB 1: MY SCHEDULE ═══════════ */}
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
          </div>

          {/* Weekly Schedule Cards */}
          {!mySchedule ? (
            <Card className="shadow-sm">
              <CardContent className="py-12 text-center">
                <Calendar className="h-12 w-12 mx-auto mb-3 opacity-30 text-muted-foreground" />
                <p className="text-muted-foreground">No schedule assigned for this week</p>
                <p className="text-xs text-muted-foreground mt-1">Contact your manager for scheduling</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {mySchedule.status === "draft" && (
                <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-2 text-xs text-warning flex items-center gap-2">
                  <Timer className="h-4 w-4" /> This schedule is a draft and has not been published yet
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
                {weekDates.map((date, i) => {
                  const dayShift = mySchedule.shifts.find(s => s.day === i);
                  const tmpl = dayShift ? shiftTemplates.find(t => t.id === dayShift.templateId) : null;
                  const isToday = formatDate(date) === formatDate(new Date());
                  const isOff = dayShift?.templateId === "st-off";
                  return (
                    <Card key={i} className={cn("shadow-sm transition-all", isToday && "ring-2 ring-primary", isOff && "opacity-60")}>
                      <CardContent className="p-4 text-center space-y-2">
                        <div className="flex items-center justify-center gap-2">
                          <p className={cn("text-sm font-bold", isToday && "text-primary")}>{DAY_LABELS[i]}</p>
                          {isToday && <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px]">Today</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">{date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                        <div className={cn("rounded-lg px-3 py-2 text-sm font-medium border", tmpl ? tmpl.color : "bg-muted text-muted-foreground")}>
                          {dayShift?.templateName || "—"}
                        </div>
                        {dayShift?.startTime && (
                          <p className="text-xs text-muted-foreground">{dayShift.startTime} – {dayShift.endTime}</p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="shadow-sm"><CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Working Days</p>
                  <p className="text-xl font-bold">{mySchedule.shifts.filter(s => s.templateId !== "st-off").length}</p>
                </CardContent></Card>
                <Card className="shadow-sm"><CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Off Days</p>
                  <p className="text-xl font-bold">{mySchedule.shifts.filter(s => s.templateId === "st-off").length}</p>
                </CardContent></Card>
                <Card className="shadow-sm"><CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Morning</p>
                  <p className="text-xl font-bold text-info">{mySchedule.shifts.filter(s => s.templateId === "st-morning").length}</p>
                </CardContent></Card>
                <Card className="shadow-sm"><CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Evening</p>
                  <p className="text-xl font-bold text-accent">{mySchedule.shifts.filter(s => s.templateId === "st-evening").length}</p>
                </CardContent></Card>
              </div>
            </>
          )}
        </>
      )}

      {/* ═══════════ TAB 2: MY LEAVES ═══════════ */}
      {activeTab === "leaves" && (
        <>
          {/* Leave Balance Cards */}
          {myBalance && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="shadow-sm border-success/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium">Annual Leave</p>
                      <p className="text-2xl font-bold mt-1">{myBalance.annual.total - myBalance.annual.used} <span className="text-sm font-normal text-muted-foreground">remaining</span></p>
                      <p className="text-xs text-muted-foreground">{myBalance.annual.used} used of {myBalance.annual.total}</p>
                    </div>
                    <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-success/10"><Calendar className="h-5 w-5 text-success" /></div>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-success transition-all" style={{ width: `${(myBalance.annual.used / myBalance.annual.total) * 100}%` }} />
                  </div>
                </CardContent>
              </Card>
              <Card className="shadow-sm border-destructive/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium">Sick Leave</p>
                      <p className="text-2xl font-bold mt-1">{myBalance.sick.total - myBalance.sick.used} <span className="text-sm font-normal text-muted-foreground">remaining</span></p>
                      <p className="text-xs text-muted-foreground">{myBalance.sick.used} used of {myBalance.sick.total}</p>
                    </div>
                    <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-destructive/10"><CalendarOff className="h-5 w-5 text-destructive" /></div>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-destructive transition-all" style={{ width: `${(myBalance.sick.used / myBalance.sick.total) * 100}%` }} />
                  </div>
                </CardContent>
              </Card>
              <Card className="shadow-sm border-info/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium">Casual Leave</p>
                      <p className="text-2xl font-bold mt-1">{myBalance.casual.total - myBalance.casual.used} <span className="text-sm font-normal text-muted-foreground">remaining</span></p>
                      <p className="text-xs text-muted-foreground">{myBalance.casual.used} used of {myBalance.casual.total}</p>
                    </div>
                    <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-info/10"><CalendarOff className="h-5 w-5 text-info" /></div>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-info transition-all" style={{ width: `${(myBalance.casual.used / myBalance.casual.total) * 100}%` }} />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* My Leave Requests List */}
          <Card className="shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-base">My Leave Requests</CardTitle></CardHeader>
            <CardContent>
              {myLeaves.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" />
                  <p className="text-muted-foreground">No leave requests yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Click "Request Leave" to apply for time off</p>
                  <Button size="sm" className="gradient-primary text-primary-foreground mt-3" onClick={() => setShowLeaveForm(true)}>
                    <Plus className="h-4 w-4 mr-1" />Request Leave
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {myLeaves.map(leave => (
                    <div key={leave.id} className={cn(
                      "flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-lg border p-4 transition-colors cursor-pointer hover:bg-muted/30",
                      leave.status === "pending" && "border-warning/30 bg-warning/5",
                      leave.status === "approved" && "border-success/30",
                      leave.status === "rejected" && "border-destructive/30",
                    )} onClick={() => setViewLeave(leave)}>
                      <div className="flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className={cn("capitalize", leaveTypeColors[leave.leaveType])}>{leave.leaveType} Leave</Badge>
                          <Badge variant="secondary" className={cn("capitalize", leaveStatusColors[leave.status])}>
                            {leave.status === "pending" && <Clock className="h-3 w-3 mr-1" />}
                            {leave.status === "approved" && <CheckCircle className="h-3 w-3 mr-1" />}
                            {leave.status === "rejected" && <XCircle className="h-3 w-3 mr-1" />}
                            {leave.status}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium">{leave.startDate} to {leave.endDate} <span className="text-muted-foreground">({leave.totalDays} day{leave.totalDays > 1 ? "s" : ""})</span></p>
                        <p className="text-xs text-muted-foreground line-clamp-1">"{leave.reason}"</p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground shrink-0">
                        <p>Applied: {leave.appliedOn}</p>
                        {leave.reviewedBy && <p>Reviewed by: {leave.reviewedBy}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ═══════════ TAB 3: MY ATTENDANCE ═══════════ */}
      {activeTab === "attendance" && (
        <>
          {/* Attendance Summary Cards */}
          {(() => {
            const thisMonth = formatDate(new Date()).substring(0, 7);
            const monthRecords = myAttendance.filter(a => a.date.startsWith(thisMonth));
            const present = monthRecords.filter(a => a.status === "present").length;
            const late = monthRecords.filter(a => a.status === "late").length;
            const absent = monthRecords.filter(a => a.status === "absent").length;
            const totalHours = monthRecords.reduce((s, a) => s + (a.totalHours || 0), 0);
            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Card className="shadow-sm"><CardContent className="p-4 flex items-center justify-between">
                  <div><p className="text-xs text-muted-foreground">Present</p><p className="text-2xl font-bold text-success">{present}</p></div>
                  <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-success/10"><CheckCircle className="h-5 w-5 text-success" /></div>
                </CardContent></Card>
                <Card className="shadow-sm"><CardContent className="p-4 flex items-center justify-between">
                  <div><p className="text-xs text-muted-foreground">Late</p><p className="text-2xl font-bold text-warning">{late}</p></div>
                  <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-warning/10"><Clock className="h-5 w-5 text-warning" /></div>
                </CardContent></Card>
                <Card className="shadow-sm"><CardContent className="p-4 flex items-center justify-between">
                  <div><p className="text-xs text-muted-foreground">Absent</p><p className="text-2xl font-bold text-destructive">{absent}</p></div>
                  <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-destructive/10"><XCircle className="h-5 w-5 text-destructive" /></div>
                </CardContent></Card>
                <Card className="shadow-sm"><CardContent className="p-4 flex items-center justify-between">
                  <div><p className="text-xs text-muted-foreground">Total Hours</p><p className="text-2xl font-bold">{totalHours.toFixed(1)}</p></div>
                  <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-primary/10"><Timer className="h-5 w-5 text-primary" /></div>
                </CardContent></Card>
              </div>
            );
          })()}

          {/* Attendance History Table */}
          <Card className="shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-base">Attendance History</CardTitle></CardHeader>
            <CardContent>
              {myAttendance.length === 0 ? (
                <div className="text-center py-12">
                  <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" />
                  <p className="text-muted-foreground">No attendance records found</p>
                </div>
              ) : (
                <div className="rounded-lg border overflow-auto max-h-[calc(100vh-400px)]">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead>Date</TableHead><TableHead>Clock In</TableHead><TableHead>Clock Out</TableHead>
                      <TableHead>Hours</TableHead><TableHead>Status</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {myAttendance.map(a => (
                        <TableRow key={a.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="font-medium">{a.date}</TableCell>
                          <TableCell>{a.clockIn || "—"}</TableCell>
                          <TableCell>{a.clockOut || "—"}</TableCell>
                          <TableCell>{a.totalHours || "—"}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={cn("capitalize",
                              a.status === "present" && "bg-success/10 text-success",
                              a.status === "late" && "bg-warning/10 text-warning",
                              a.status === "absent" && "bg-destructive/10 text-destructive",
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
        </>
      )}

      {/* ═══════════ DIALOGS ═══════════ */}

      {/* Request Leave Dialog */}
      <Dialog open={showLeaveForm} onOpenChange={setShowLeaveForm}><DialogContent><DialogHeader><DialogTitle>Request Leave</DialogTitle></DialogHeader>
        <div className="space-y-4">
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
          <div><Label>Reason</Label><Textarea value={leaveForm.reason} onChange={e => setLeaveForm(p => ({ ...p, reason: e.target.value }))} placeholder="Why do you need leave?" rows={3} /></div>
          {/* Balance Preview */}
          {myBalance && (() => {
            const type = leaveForm.leaveType === "emergency" ? "casual" : leaveForm.leaveType;
            const remaining = myBalance[type].total - myBalance[type].used;
            return (
              <div className="rounded-lg border p-3 bg-muted/30 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Available {type} leaves:</span>
                  <span className={cn("font-bold", remaining > 0 ? "text-success" : "text-destructive")}>{remaining} days</span>
                </div>
                {leaveForm.startDate && leaveForm.endDate && (() => {
                  const days = Math.max(1, Math.ceil((new Date(leaveForm.endDate).getTime() - new Date(leaveForm.startDate).getTime()) / 86400000) + 1);
                  return (
                    <div className="flex justify-between mt-1">
                      <span className="text-muted-foreground">Requesting:</span>
                      <span className={cn("font-bold", days <= remaining ? "text-foreground" : "text-destructive")}>{days} day{days > 1 ? "s" : ""}</span>
                    </div>
                  );
                })()}
              </div>
            );
          })()}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowLeaveForm(false)}>Cancel</Button>
          <Button className="gradient-primary text-primary-foreground" onClick={handleLeaveSubmit}>Submit Request</Button>
        </DialogFooter>
      </DialogContent></Dialog>

      {/* View Leave Detail Dialog */}
      <Dialog open={!!viewLeave} onOpenChange={() => setViewLeave(null)}><DialogContent><DialogHeader><DialogTitle>Leave Request Details</DialogTitle></DialogHeader>
        {viewLeave && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Badge variant="secondary" className={cn("capitalize", leaveTypeColors[viewLeave.leaveType])}>{viewLeave.leaveType} Leave</Badge>
              <Badge variant="secondary" className={cn("capitalize", leaveStatusColors[viewLeave.status])}>
                {viewLeave.status === "pending" && <Clock className="h-3 w-3 mr-1" />}
                {viewLeave.status === "approved" && <CheckCircle className="h-3 w-3 mr-1" />}
                {viewLeave.status === "rejected" && <XCircle className="h-3 w-3 mr-1" />}
                {viewLeave.status}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-muted-foreground">From</p><p className="font-medium">{viewLeave.startDate}</p></div>
              <div><p className="text-muted-foreground">To</p><p className="font-medium">{viewLeave.endDate}</p></div>
              <div><p className="text-muted-foreground">Total Days</p><p className="font-bold">{viewLeave.totalDays}</p></div>
              <div><p className="text-muted-foreground">Applied On</p><p>{viewLeave.appliedOn}</p></div>
            </div>
            <div className="text-sm">
              <p className="text-muted-foreground mb-1">Reason</p>
              <p className="rounded-lg border p-3 bg-muted/30 italic">"{viewLeave.reason}"</p>
            </div>
            {viewLeave.reviewedBy && (
              <div className="text-sm border-t pt-3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reviewed by:</span>
                  <span className="font-medium">{viewLeave.reviewedBy}</span>
                </div>
                {viewLeave.reviewedOn && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Reviewed on:</span>
                    <span>{viewLeave.reviewedOn}</span>
                  </div>
                )}
                {viewLeave.reviewNote && (
                  <div>
                    <p className="text-muted-foreground mb-1">Admin Note:</p>
                    <p className="rounded-lg border p-3 bg-muted/30 text-xs">"{viewLeave.reviewNote}"</p>
                  </div>
                )}
              </div>
            )}
            {viewLeave.status === "pending" && (
              <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning flex items-center gap-2">
                <Clock className="h-4 w-4" /> Your request is awaiting admin approval
              </div>
            )}
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={() => setViewLeave(null)}>Close</Button></DialogFooter>
      </DialogContent></Dialog>
    </div>
  );
};

export default EmployeePortal;

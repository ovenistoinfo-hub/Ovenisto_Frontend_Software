import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Calendar, Clock, FileText, ChevronLeft, ChevronRight,
  LogIn, LogOut, Plus, X, Timer
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { attendanceService, type AttendanceRecord } from "@/services/attendance.service";
import { leaveService, type LeaveRequest, type LeaveBalance } from "@/services/leave.service";
import { scheduleService, type StaffSchedule, SHIFT_COLORS } from "@/services/schedule.service";
import { shiftService, type ShiftRecord } from "@/services/shift.service";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const LEAVE_TYPE_COLORS: Record<string, string> = {
  sick:      "bg-destructive/10 text-destructive",
  casual:    "bg-blue-100 text-blue-700",
  annual:    "bg-success/10 text-success",
  emergency: "bg-warning/10 text-warning",
};
const LEAVE_STATUS_COLORS: Record<string, string> = {
  pending:  "bg-warning/10 text-warning",
  approved: "bg-success/10 text-success",
  rejected: "bg-destructive/10 text-destructive",
};
const ATT_STATUS_COLORS: Record<string, string> = {
  present: "bg-success/10 text-success",
  late:    "bg-warning/10 text-warning",
  absent:  "bg-destructive/10 text-destructive",
};

function getWeekStart(offset = 0): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1) + offset * 7;
  const d = new Date(now);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split("T")[0];
}

function formatTime(dt: string | null | undefined): string {
  if (!dt) return "—";
  return new Date(dt).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function hoursWorked(clockIn: string | null, clockOut: string | null): string {
  if (!clockIn || !clockOut) return "—";
  const diff = (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 3600000;
  return `${diff.toFixed(1)}h`;
}

function ElapsedTimer({ clockIn }: { clockIn: string }) {
  const [elapsed, setElapsed] = useState("");
  useEffect(() => {
    const update = () => {
      const ms = Date.now() - new Date(clockIn).getTime();
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      setElapsed(`${h}h ${m}m`);
    };
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, [clockIn]);
  return <span className="text-primary font-mono font-bold">{elapsed}</span>;
}

export default function EmployeePortal() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [weekOffset, setWeekOffset] = useState(0);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ leaveType: "casual", startDate: "", endDate: "", reason: "" });
  const [viewLeave, setViewLeave] = useState<LeaveRequest | null>(null);

  const weekStart = getWeekStart(weekOffset);
  const today = new Date().toISOString().split("T")[0];

  const { data: schedule } = useQuery({
    queryKey: ["my-schedule", weekStart],
    queryFn: () => scheduleService.getMySchedule(weekStart),
  });

  const { data: todayStatus, refetch: refetchStatus } = useQuery({
    queryKey: ["my-attendance-status"],
    queryFn: () => attendanceService.getMyStatus(),
    refetchInterval: 60000,
  });

  const { data: historyData } = useQuery({
    queryKey: ["my-attendance-history"],
    queryFn: () => attendanceService.getMyHistory(),
  });

  const { data: leaveBalance } = useQuery({
    queryKey: ["my-leave-balance"],
    queryFn: () => leaveService.getMyBalance(),
  });

  const { data: myRequests } = useQuery({
    queryKey: ["my-leave-requests"],
    queryFn: () => leaveService.getMyRequests(),
  });

  const { data: shiftsData } = useQuery({
    queryKey: ["my-shifts"],
    queryFn: () => shiftService.getShifts({ limit: 50 }),
    enabled: user?.role === "Cashier",
  });

  const clockInMut = useMutation({
    mutationFn: () => attendanceService.clockIn(),
    onSuccess: () => { toast.success("Clocked in!"); refetchStatus(); },
    onError: (e: any) => toast.error(e?.message || "Clock-in failed"),
  });

  const clockOutMut = useMutation({
    mutationFn: () => attendanceService.clockOut(),
    onSuccess: () => {
      toast.success("Clocked out!");
      refetchStatus();
      qc.invalidateQueries({ queryKey: ["my-attendance-history"] });
    },
    onError: (e: any) => toast.error(e?.message || "Clock-out failed"),
  });

  const submitLeaveMut = useMutation({
    mutationFn: () => leaveService.submit(leaveForm),
    onSuccess: () => {
      toast.success("Leave request submitted");
      setShowLeaveForm(false);
      setLeaveForm({ leaveType: "casual", startDate: "", endDate: "", reason: "" });
      qc.invalidateQueries({ queryKey: ["my-leave-requests"] });
      qc.invalidateQueries({ queryKey: ["my-leave-balance"] });
    },
    onError: (e: any) => toast.error(e?.message || "Submission failed"),
  });

  const cancelLeaveMut = useMutation({
    mutationFn: (id: string) => leaveService.cancel(id),
    onSuccess: () => {
      toast.success("Request cancelled");
      qc.invalidateQueries({ queryKey: ["my-leave-requests"] });
    },
    onError: (e: any) => toast.error(e?.message || "Cancel failed"),
  });

  const historyRows: AttendanceRecord[] = historyData?.data ?? [];
  const myShifts = (shiftsData?.data ?? [] as ShiftRecord[]).filter(s => s.cashierId === user?.id);

  const monthStr = today.slice(0, 7);
  const monthRows = historyRows.filter(r => r.date.startsWith(monthStr));
  const presentCount = monthRows.filter(r => r.status === "present").length;
  const lateCount    = monthRows.filter(r => r.status === "late").length;
  const absentCount  = monthRows.filter(r => r.status === "absent").length;
  const totalHours   = monthRows.reduce((acc, r) => {
    if (!r.clockIn || !r.clockOut) return acc;
    return acc + (new Date(r.clockOut).getTime() - new Date(r.clockIn).getTime()) / 3600000;
  }, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Timer className="h-5 w-5" />}
        title="My Portal"
        subtitle={`Welcome, ${user?.name || "Staff"}`}
      />

      <Tabs defaultValue="schedule">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="schedule" className="gap-1.5"><Calendar className="h-3.5 w-3.5" />Schedule</TabsTrigger>
          <TabsTrigger value="attendance" className="gap-1.5"><Clock className="h-3.5 w-3.5" />Attendance</TabsTrigger>
          <TabsTrigger value="leaves" className="gap-1.5"><FileText className="h-3.5 w-3.5" />Leaves</TabsTrigger>
          {user?.role === "Cashier" && (
            <TabsTrigger value="cash-shifts" className="gap-1.5"><Timer className="h-3.5 w-3.5" />Cash Shifts</TabsTrigger>
          )}
        </TabsList>

        {/* SCHEDULE TAB */}
        <TabsContent value="schedule" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button size="icon" variant="outline" onClick={() => setWeekOffset(o => o - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="text-sm font-medium w-40 text-center">Week of {weekStart}</span>
              <Button size="icon" variant="outline" onClick={() => setWeekOffset(o => o + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <Button size="sm" variant="outline" onClick={() => setWeekOffset(0)}>Today</Button>
          </div>

          {!schedule || schedule.status === "draft" ? (
            <p className="text-center text-muted-foreground py-12">No published schedule for this week.</p>
          ) : (
            <div className="grid grid-cols-7 gap-2">
              {DAY_LABELS.map((label, i) => {
                const shift = schedule.shifts.find(s => s.dayIndex === i);
                const dateObj = new Date(weekStart);
                dateObj.setDate(dateObj.getDate() + i);
                const dateStr = dateObj.toISOString().split("T")[0];
                const isToday = dateStr === today;
                return (
                  <Card key={i} className={cn("shadow-sm text-center", isToday && "ring-2 ring-primary")}>
                    <CardContent className="p-3 space-y-1">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="text-xs font-medium">{dateObj.getDate()}</p>
                      <Badge variant="secondary" className={cn("text-[10px] px-1", SHIFT_COLORS[shift?.shiftType ?? "off"])}>
                        {shift?.shiftType ?? "—"}
                      </Badge>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ATTENDANCE TAB */}
        <TabsContent value="attendance" className="mt-4 space-y-4">
          <Card className="shadow-sm border-primary/20">
            <CardHeader className="pb-2"><CardTitle className="text-base">Today — {today}</CardTitle></CardHeader>
            <CardContent>
              {!todayStatus?.clockIn ? (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground mb-3">You have not clocked in today.</p>
                  <Button size="lg" className="gradient-primary text-primary-foreground gap-2 w-full max-w-xs"
                    onClick={() => clockInMut.mutate()} disabled={clockInMut.isPending}>
                    <LogIn className="h-5 w-5" />Check In
                  </Button>
                </div>
              ) : !todayStatus.clockOut ? (
                <div className="text-center py-4 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Clocked in at {formatTime(todayStatus.clockIn)} · Elapsed: <ElapsedTimer clockIn={todayStatus.clockIn} />
                  </p>
                  <Button size="lg" variant="outline" className="gap-2 border-warning/40 text-warning w-full max-w-xs"
                    onClick={() => clockOutMut.mutate()} disabled={clockOutMut.isPending}>
                    <LogOut className="h-5 w-5" />Check Out
                  </Button>
                </div>
              ) : (
                <div className="text-center py-4 space-y-1">
                  <p className="text-sm">In: {formatTime(todayStatus.clockIn)} · Out: {formatTime(todayStatus.clockOut)}</p>
                  <p className="text-sm font-medium">Total: {hoursWorked(todayStatus.clockIn, todayStatus.clockOut)}</p>
                  <Badge className={cn("mt-1", ATT_STATUS_COLORS[todayStatus.status])}>{todayStatus.status}</Badge>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Present", value: presentCount, color: "text-success" },
              { label: "Late",    value: lateCount,    color: "text-warning" },
              { label: "Absent",  value: absentCount,  color: "text-destructive" },
              { label: "Hours",   value: `${totalHours.toFixed(1)}h`, color: "text-primary" },
            ].map(s => (
              <Card key={s.label} className="shadow-sm">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className={cn("text-xl font-bold", s.color)}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="shadow-sm">
            <CardHeader><CardTitle className="text-sm">History</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead>Date</TableHead><TableHead>Clock In</TableHead><TableHead>Clock Out</TableHead><TableHead>Hours</TableHead><TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyRows.slice(0, 30).map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">{r.date}</TableCell>
                      <TableCell className="text-sm">{formatTime(r.clockIn)}</TableCell>
                      <TableCell className="text-sm">{formatTime(r.clockOut)}</TableCell>
                      <TableCell className="text-sm">{hoursWorked(r.clockIn, r.clockOut)}</TableCell>
                      <TableCell><Badge variant="secondary" className={ATT_STATUS_COLORS[r.status]}>{r.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {historyRows.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No attendance history</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* LEAVES TAB */}
        <TabsContent value="leaves" className="mt-4 space-y-4">
          {leaveBalance && (
            <div className="grid grid-cols-3 gap-3">
              {(["annual", "sick", "casual"] as const).map(type => {
                const used = leaveBalance[`${type}Used` as keyof LeaveBalance] as number;
                const total = leaveBalance[type] as number;
                return (
                  <Card key={type} className="shadow-sm">
                    <CardContent className="p-3 space-y-1">
                      <p className="text-xs font-medium capitalize">{type}</p>
                      <p className="text-lg font-bold">{total - used}<span className="text-xs text-muted-foreground font-normal"> / {total}</span></p>
                      <Progress value={(used / total) * 100} className="h-1.5" />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          <div className="flex justify-end">
            <Button size="sm" onClick={() => setShowLeaveForm(v => !v)}>
              {showLeaveForm ? <X className="h-3.5 w-3.5 mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
              {showLeaveForm ? "Cancel" : "Request Leave"}
            </Button>
          </div>

          {showLeaveForm && (
            <Card className="shadow-sm border-primary/30">
              <CardHeader><CardTitle className="text-sm">New Leave Request</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Leave Type</Label>
                  <Select value={leaveForm.leaveType} onValueChange={v => setLeaveForm(f => ({ ...f, leaveType: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["casual", "sick", "annual", "emergency"].map(t => (
                        <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Start Date</Label>
                    <Input type="date" value={leaveForm.startDate} onChange={e => setLeaveForm(f => ({ ...f, startDate: e.target.value }))} className="mt-1" />
                  </div>
                  <div>
                    <Label>End Date</Label>
                    <Input type="date" value={leaveForm.endDate} onChange={e => setLeaveForm(f => ({ ...f, endDate: e.target.value }))} className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label>Reason</Label>
                  <Textarea value={leaveForm.reason} onChange={e => setLeaveForm(f => ({ ...f, reason: e.target.value }))} className="mt-1" rows={3} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowLeaveForm(false)}>Cancel</Button>
                  <Button size="sm" className="gradient-primary text-primary-foreground"
                    disabled={!leaveForm.startDate || !leaveForm.endDate || !leaveForm.reason || submitLeaveMut.isPending}
                    onClick={() => submitLeaveMut.mutate()}>Submit</Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-2">
            {(myRequests ?? []).map(r => (
              <Card key={r.id} className="shadow-sm cursor-pointer hover:bg-muted/30" onClick={() => setViewLeave(r)}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className={cn("text-xs", LEAVE_TYPE_COLORS[r.leaveType])}>{r.leaveType}</Badge>
                      <Badge variant="secondary" className={cn("text-xs", LEAVE_STATUS_COLORS[r.status])}>{r.status}</Badge>
                    </div>
                    <p className="text-sm">{r.startDate} → {r.endDate} <span className="text-muted-foreground">({r.totalDays}d)</span></p>
                    <p className="text-xs text-muted-foreground">{r.reason}</p>
                  </div>
                  {r.status === "pending" && (
                    <Button size="sm" variant="ghost" className="text-destructive h-7"
                      onClick={e => { e.stopPropagation(); cancelLeaveMut.mutate(r.id); }}>
                      Cancel
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
            {(myRequests ?? []).length === 0 && (
              <p className="text-center text-muted-foreground py-8">No leave requests</p>
            )}
          </div>
        </TabsContent>

        {/* CASH SHIFTS TAB */}
        {user?.role === "Cashier" && (
          <TabsContent value="cash-shifts" className="mt-4">
            <Card className="shadow-sm">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead>Opened</TableHead><TableHead>Closed</TableHead>
                      <TableHead className="text-right">Opening Cash</TableHead>
                      <TableHead className="text-right">Total Sales</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {myShifts.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="text-sm">{new Date(s.openedAt).toLocaleDateString("en-PK")}</TableCell>
                        <TableCell className="text-sm">{s.closedAt ? new Date(s.closedAt).toLocaleDateString("en-PK") : "—"}</TableCell>
                        <TableCell className="text-right text-sm">Rs. {s.openingCash?.toLocaleString() ?? "—"}</TableCell>
                        <TableCell className="text-right text-sm text-success">Rs. {s.totalSales?.toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={s.status === "open" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}>
                            {s.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {myShifts.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No shift history</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={!!viewLeave} onOpenChange={() => setViewLeave(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Leave Request Detail</DialogTitle></DialogHeader>
          {viewLeave && (
            <div className="space-y-2 text-sm">
              <div className="flex gap-2">
                <Badge variant="secondary" className={LEAVE_TYPE_COLORS[viewLeave.leaveType]}>{viewLeave.leaveType}</Badge>
                <Badge variant="secondary" className={LEAVE_STATUS_COLORS[viewLeave.status]}>{viewLeave.status}</Badge>
              </div>
              <p><strong>Dates:</strong> {viewLeave.startDate} → {viewLeave.endDate} ({viewLeave.totalDays} day{viewLeave.totalDays !== 1 ? "s" : ""})</p>
              <p><strong>Reason:</strong> {viewLeave.reason}</p>
              {viewLeave.reviewNote && <p><strong>Review note:</strong> {viewLeave.reviewNote}</p>}
              {viewLeave.reviewedBy && <p><strong>Reviewed by:</strong> {viewLeave.reviewedBy.name} on {viewLeave.reviewedOn}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

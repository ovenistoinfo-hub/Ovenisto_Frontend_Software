import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Calendar, Clock, FileText, LogIn, LogOut, Plus, X, Timer, DollarSign, AlertTriangle
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
import { scheduleService, SHIFT_COLORS } from "@/services/schedule.service";
import { shiftService, type ShiftRecord } from "@/services/shift.service";
import { userService } from "@/services/user.service";
import { settingsService } from "@/services/settings.service";

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
  halfday: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-200",
  absent:  "bg-destructive/10 text-destructive",
  off:     "bg-muted text-muted-foreground",
};

type ShiftName = "morning" | "evening" | "night";
interface ShiftTime { start: string; end: string }
interface ShiftConfig { morning: ShiftTime; evening: ShiftTime; night: ShiftTime }
const DEFAULT_SHIFT_CONFIG: ShiftConfig = {
  morning: { start: "09:00", end: "17:00" },
  evening: { start: "17:00", end: "01:00" },
  night:   { start: "01:00", end: "09:00" },
};
function parseShiftConfig(raw: Record<string, unknown>): ShiftConfig {
  const cfg = raw as any;
  return {
    morning: { start: cfg?.morning?.start ?? "09:00", end: cfg?.morning?.end ?? "17:00" },
    evening: { start: cfg?.evening?.start ?? "17:00", end: cfg?.evening?.end ?? "01:00" },
    night:   { start: cfg?.night?.start   ?? "01:00", end: cfg?.night?.end   ?? "09:00" },
  };
}

function todayPKT(): string {
  return new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().split("T")[0];
}

function getWeekStart(offset = 0): string {
  const pktNowMs = Date.now() + 5 * 60 * 60 * 1000;
  const pkt = new Date(pktNowMs);
  const day = pkt.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monMs = pktNowMs + (diff + offset * 7) * 86_400_000;
  return new Date(monMs).toISOString().split("T")[0];
}

function weekSunday(monday: string): string {
  const base = new Date(monday + "T00:00:00Z");
  base.setUTCDate(base.getUTCDate() + 6);
  return base.toISOString().split("T")[0];
}

function formatWeekRange(weekStart: string): string {
  const start = new Date(weekStart + "T00:00:00Z");
  const end   = new Date(weekSunday(weekStart) + "T00:00:00Z");
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${fmt(start)} – ${fmt(end)}, ${end.getUTCFullYear()}`;
}

function datesInRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const toMs = new Date(to + "T00:00:00Z").getTime();
  let cur = new Date(from + "T00:00:00Z");
  while (cur.getTime() <= toMs) {
    dates.push(cur.toISOString().split("T")[0]);
    cur = new Date(cur.getTime() + 86_400_000);
  }
  return dates;
}

function formatTime(dt: string | null | undefined): string {
  if (!dt) return "—";
  return new Date(dt).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function hoursWorkedNum(clockIn: string | null, clockOut: string | null): number {
  if (!clockIn || !clockOut) return 0;
  return (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 3600000;
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

  const today = todayPKT();
  const thirtyDaysAgo = new Date(Date.now() + 5 * 60 * 60 * 1000 - 30 * 86_400_000)
    .toISOString().split("T")[0];

  // Schedule tab
  const [schedWeekView, setSchedWeekView] = useState<"prev" | "current" | "next">("current");
  const prevWeekStart    = getWeekStart(-1);
  const currentWeekStart = getWeekStart(0);
  const nextWeekStart    = getWeekStart(1);

  // Attendance history filter
  const [attFrom, setAttFrom] = useState(thirtyDaysAgo);
  const [attTo, setAttTo]     = useState(today);

  // Leave date filter
  const leaveYearStart = `${new Date().getFullYear()}-01-01`;
  const [leaveFrom, setLeaveFrom] = useState(leaveYearStart);
  const [leaveTo, setLeaveTo]     = useState(today);

  // Leave form
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ leaveType: "casual", startDate: "", endDate: "", reason: "" });
  const [viewLeave, setViewLeave] = useState<LeaveRequest | null>(null);

  // Settings for shift config
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => settingsService.getSettings(),
  });
  const shiftConfig: ShiftConfig = settings?.shiftConfig && Object.keys(settings.shiftConfig).length > 0
    ? parseShiftConfig(settings.shiftConfig)
    : DEFAULT_SHIFT_CONFIG;

  // Full profile for hourlyRate / absencePenalty — use /auth/me (accessible to any role)
  const { data: myProfile } = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => userService.getMe(),
    enabled: !!user?.id,
  });

  // Schedule: last/current/next week always fetched in parallel; buttons switch which is shown
  const weekSections = [
    { key: "prev" as const,    label: "Last Week",    weekStart: prevWeekStart,
      dot: "bg-orange-500", tabActive: "bg-orange-50 border-orange-300 dark:bg-orange-950/30 dark:border-orange-800", tabText: "text-orange-900 dark:text-orange-200" },
    { key: "current" as const, label: "Current Week", weekStart: currentWeekStart,
      dot: "bg-green-500",  tabActive: "bg-green-50 border-green-300 dark:bg-green-950/30 dark:border-green-800",   tabText: "text-green-900 dark:text-green-200" },
    { key: "next" as const,    label: "Next Week",    weekStart: nextWeekStart,
      dot: "bg-blue-500",   tabActive: "bg-blue-50 border-blue-300 dark:bg-blue-950/30 dark:border-blue-800",      tabText: "text-blue-900 dark:text-blue-200" },
  ];
  const weekStarts = weekSections.map(s => s.weekStart);
  const scheduleQueries = useQueries({
    queries: weekStarts.map(ws => ({
      queryKey: ["my-schedule", ws],
      queryFn: () => scheduleService.getMySchedule(ws),
    })),
  });

  const shiftByDate: Record<string, string> = {};
  scheduleQueries.forEach((q, i) => {
    const sched = q.data;
    if (!sched || sched.status === "draft") return;
    const ws = weekStarts[i];
    sched.shifts.forEach(s => {
      const d = new Date(ws + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + s.dayIndex);
      shiftByDate[d.toISOString().split("T")[0]] = s.shiftType;
    });
  });

  const activeWeekStart = weekSections.find(s => s.key === schedWeekView)?.weekStart ?? currentWeekStart;
  const scheduleDates = datesInRange(activeWeekStart, weekSunday(activeWeekStart));

  // Today status
  const { data: todayStatus, refetch: refetchStatus } = useQuery({
    queryKey: ["my-attendance-status"],
    queryFn: () => attendanceService.getMyStatus(),
    refetchInterval: 60000,
  });

  // History with date range
  const { data: historyData } = useQuery({
    queryKey: ["my-attendance-history", attFrom, attTo],
    queryFn: () => attendanceService.getMyHistory({ startDate: attFrom, endDate: attTo }),
  });

  const { data: leaveBalance } = useQuery({
    queryKey: ["my-leave-balance"],
    queryFn: () => leaveService.getMyBalance(),
  });

  const { data: myRequests } = useQuery({
    queryKey: ["my-leave-requests", user?.id],
    queryFn: () => leaveService.getMyRequests(user?.id),
    enabled: !!user?.id,
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

  const [statusFilter, setStatusFilter] = useState("all");

  // Derived
  const historyRows: AttendanceRecord[] = historyData?.data ?? [];
  const myShifts = (shiftsData?.data ?? [] as ShiftRecord[]).filter(s => s.cashierId === user?.id);

  const unrecordedRows = useMemo(() => {
    const dates = datesInRange(attFrom, attTo);
    const rows: any[] = [];
    const recordSet = new Set(historyRows.map(r => r.date));

    for (const dStr of dates) {
      if (!recordSet.has(dStr)) {
        const shift = shiftByDate[dStr] ?? "off";
        rows.push({
          id: `unrecorded-${dStr}`,
          date: dStr,
          userId: user?.id,
          clockIn: null,
          clockOut: null,
          status: shift === "off" ? "off" : "absent",
          notes: shift === "off" ? "Scheduled Off" : "No record",
        });
      }
    }
    return rows;
  }, [historyRows, attFrom, attTo, shiftByDate, user?.id]);

  const filteredHistoryRows = useMemo(() => {
    if (statusFilter === "all") return historyRows;
    if (statusFilter === "not-recorded") return unrecordedRows;
    return historyRows.filter(r => r.status === statusFilter);
  }, [historyRows, statusFilter, unrecordedRows]);

  const presentCount = historyRows.filter(r => r.status === "present").length;
  const lateCount    = historyRows.filter(r => r.status === "late").length;
  const halfdayCount = historyRows.filter(r => r.status === "halfday").length;
  const absentCount  = historyRows.filter(r => r.status === "absent").length;
  const notRecordedCount = unrecordedRows.length;
  const totalHours   = historyRows.reduce((acc, r) => acc + hoursWorkedNum(r.clockIn, r.clockOut), 0);
  const totalOvertimeHours = historyRows.reduce((acc, r) => acc + (r.overtimeMinutes ?? 0), 0) / 60;

  const hourlyRate     = myProfile?.hourlyRate     ?? 0;
  const absencePenalty = myProfile?.absencePenalty ?? 0;
  const totalPay       = totalHours * hourlyRate;
  const totalPenalty   = absentCount * absencePenalty;

  const fmt = (n: number) => `Rs. ${Math.round(n).toLocaleString("en-PK")}`;

  if (user?.role === "Admin" || user?.role === "Super Admin") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-6 space-y-3">
        <AlertTriangle className="h-10 w-10 text-destructive animate-bounce" />
        <h3 className="text-lg font-bold">Access Denied</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Admin and Super Admin accounts do not have employee portals.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Timer className="h-5 w-5" />}
        title="My Portal"
        subtitle={`Welcome, ${user?.name || "Staff"}`}
      />

      <Tabs defaultValue="schedule">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="schedule"    className="gap-1.5"><Calendar className="h-3.5 w-3.5" />Schedule</TabsTrigger>
          <TabsTrigger value="attendance"  className="gap-1.5"><Clock    className="h-3.5 w-3.5" />Attendance</TabsTrigger>
          <TabsTrigger value="leaves"      className="gap-1.5"><FileText className="h-3.5 w-3.5" />Leaves</TabsTrigger>
          {user?.role === "Cashier" && (
            <TabsTrigger value="cash-shifts" className="gap-1.5"><Timer className="h-3.5 w-3.5" />Cash Shifts</TabsTrigger>
          )}
        </TabsList>

        {/* ── SCHEDULE ── */}
        <TabsContent value="schedule" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {weekSections.map(section => {
              const active = schedWeekView === section.key;
              return (
                <button
                  key={section.key}
                  onClick={() => setSchedWeekView(section.key)}
                  className={cn(
                    "rounded-xl border px-4 py-3 text-left transition-all",
                    active ? cn(section.tabActive, "shadow-sm") : "bg-card border-border hover:bg-muted/40"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full shrink-0", section.dot)} />
                    <span className={cn("text-sm font-semibold", active ? section.tabText : "text-foreground")}>
                      {section.label}
                    </span>
                  </div>
                  <p className={cn("text-[11px] mt-0.5 pl-3.5", active ? cn(section.tabText, "opacity-80") : "text-muted-foreground")}>
                    {formatWeekRange(section.weekStart)}
                  </p>
                </button>
              );
            })}
          </div>

          <Card className="shadow-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead>Date</TableHead>
                    <TableHead>Day</TableHead>
                    <TableHead>On/Off Shift</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scheduleDates.map(ds => {
                    const obj     = new Date(ds + "T00:00:00Z");
                    const dayName = obj.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
                    const shiftType = shiftByDate[ds] ?? "off";
                    const label     = shiftType === "off" ? "Day Off" : shiftType.charAt(0).toUpperCase() + shiftType.slice(1);
                    const isToday   = ds === today;
                    const times     = shiftType !== "off" ? shiftConfig[shiftType as ShiftName] : null;
                    return (
                      <TableRow key={ds} className={cn("hover:bg-muted/20", isToday && "bg-primary/5")}>
                        <TableCell className="text-sm font-medium">
                          {obj.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
                          {isToday && <span className="ml-1.5 text-[10px] text-primary font-semibold">Today</span>}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{dayName}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={cn("text-xs", SHIFT_COLORS[shiftType])}>{label}</Badge>
                        </TableCell>
                        <TableCell className="text-sm font-mono text-muted-foreground">
                          {times ? `${times.start} – ${times.end}` : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {scheduleDates.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Select a date range</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── ATTENDANCE ── */}
        <TabsContent value="attendance" className="mt-4 space-y-4">
          {/* Today's clock card */}
          <Card className="shadow-sm border-primary/20">
            <CardHeader className="pb-2"><CardTitle className="text-base">Today — {today}</CardTitle></CardHeader>
            <CardContent>
              {!todayStatus?.clockIn ? (
                shiftByDate[today] === "off" ? (
                  <div className="text-center py-4">
                    <p className="text-sm text-warning font-semibold mb-3">Today is your scheduled day off.</p>
                    <Button size="lg" className="gap-2 w-full max-w-xs border border-dashed border-muted text-muted-foreground bg-muted/20" disabled>
                      <LogIn className="h-5 w-5" />Check In Disabled
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground mb-3">You have not clocked in today.</p>
                    <Button size="lg" className="gradient-primary text-primary-foreground gap-2 w-full max-w-xs"
                      onClick={() => clockInMut.mutate()} disabled={clockInMut.isPending}>
                      <LogIn className="h-5 w-5" />Check In
                    </Button>
                  </div>
                )
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
                  <p className="text-sm font-medium">Total: {hoursWorkedNum(todayStatus.clockIn, todayStatus.clockOut).toFixed(1)}h</p>
                  <Badge className={cn("mt-1", ATT_STATUS_COLORS[todayStatus.status])}>{todayStatus.status}</Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Date range filter */}
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-4 items-end">
                <div>
                  <Label className="text-xs">From</Label>
                  <Input type="date" value={attFrom} onChange={e => setAttFrom(e.target.value)} className="mt-1 w-40" />
                </div>
                <div>
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={attTo} onChange={e => setAttTo(e.target.value)} className="mt-1 w-40" />
                </div>
                <Button size="sm" variant="outline" onClick={() => { setAttFrom(thirtyDaysAgo); setAttTo(today); }}>
                  Last 30 Days
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Stats — including pay & penalty */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 gap-3">
            {[
              { label: "Present",      value: String(presentCount),               color: "text-success",     extra: null, statusKey: "present" },
              { label: "Late",         value: String(lateCount),                  color: "text-warning",     extra: null, statusKey: "late" },
              { label: "Half Day",     value: String(halfdayCount),               color: "text-orange-500",  extra: null, statusKey: "halfday" },
              { label: "Absent",       value: String(absentCount),                color: "text-destructive", extra: null, statusKey: "absent" },
              { label: "Not Recorded", value: String(notRecordedCount),           color: "text-muted-foreground", extra: null, statusKey: "not-recorded" },
              { label: "Hours",        value: `${totalHours.toFixed(1)}h`,        color: "text-primary",     extra: null, statusKey: null },
              { label: "Overtime",     value: `${totalOvertimeHours.toFixed(1)}h`, color: "text-warning",    extra: <Timer className="h-3 w-3" />, statusKey: null },
              { label: "Est. Pay",     value: hourlyRate > 0 ? fmt(totalPay)    : "—", color: "text-success",     extra: <DollarSign className="h-3 w-3" />, statusKey: null },
              { label: "Penalty",      value: absencePenalty > 0 ? fmt(totalPenalty) : "—", color: "text-destructive", extra: <AlertTriangle className="h-3 w-3" />, statusKey: null },
            ].map(s => (
              <Card 
                key={s.label} 
                className={cn(
                  "shadow-sm",
                  s.statusKey && "cursor-pointer transition-all hover:ring-2 hover:ring-primary/20",
                  s.statusKey && statusFilter === s.statusKey && "ring-2 ring-primary bg-primary/5"
                )}
                onClick={() => s.statusKey && setStatusFilter(prev => prev === s.statusKey ? "all" : s.statusKey!)}
              >
                <CardContent className="p-3 text-center">
                  <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-0.5">
                    {s.extra}{s.label}
                  </div>
                  <p className={cn("text-lg font-bold", s.color)}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* History table */}
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">History — {attFrom} → {attTo}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead>Date</TableHead>
                    <TableHead>Clock In</TableHead>
                    <TableHead>Clock Out</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Overtime</TableHead>
                    {hourlyRate > 0 && <TableHead>Pay</TableHead>}
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHistoryRows.map(r => {
                    const hrs = hoursWorkedNum(r.clockIn, r.clockOut);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="text-sm">{r.date}</TableCell>
                        <TableCell className="text-sm">{formatTime(r.clockIn)}</TableCell>
                        <TableCell className="text-sm">{formatTime(r.clockOut)}</TableCell>
                        <TableCell className="text-sm">{hrs > 0 ? `${hrs.toFixed(1)}h` : "—"}</TableCell>
                        <TableCell className="text-sm">
                          {r.overtimeMinutes > 0
                            ? <span className="text-warning font-medium">{(r.overtimeMinutes / 60).toFixed(1)}h</span>
                            : "—"}
                        </TableCell>
                        {hourlyRate > 0 && (
                          <TableCell className="text-sm text-success">
                            {hrs > 0 ? `Rs. ${Math.round(hrs * hourlyRate).toLocaleString("en-PK")}` : "—"}
                          </TableCell>
                        )}
                        <TableCell>
                          <Badge variant="secondary" className={cn("capitalize", ATT_STATUS_COLORS[r.status])}>
                            {r.status === "halfday" ? "half day" : r.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredHistoryRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={hourlyRate > 0 ? 7 : 6} className="text-center text-muted-foreground py-6">
                        No records for selected period
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── LEAVES ── */}
        <TabsContent value="leaves" className="mt-4 space-y-4">
          {leaveBalance && (
            <div className="grid grid-cols-4 gap-3">
              {(["annual", "sick", "casual", "halfday"] as const).map(type => {
                const used  = leaveBalance[`${type}Used` as keyof LeaveBalance] as number;
                const total = leaveBalance[type] as number;
                const label = type === "halfday" ? "half day" : type;
                return (
                  <Card key={type} className="shadow-sm">
                    <CardContent className="p-3 space-y-1">
                      <p className="text-xs font-medium capitalize">{label}</p>
                      <p className="text-lg font-bold">{total - used}<span className="text-xs text-muted-foreground font-normal"> / {total}</span></p>
                      <Progress value={total > 0 ? (used / total) * 100 : 0} className="h-1.5" />
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

          {/* Leave date filter */}
          <Card className="shadow-sm">
            <CardContent className="p-3">
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <Label className="text-xs">From</Label>
                  <Input type="date" value={leaveFrom} onChange={e => setLeaveFrom(e.target.value)} className="mt-1 w-40" />
                </div>
                <div>
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={leaveTo} onChange={e => setLeaveTo(e.target.value)} className="mt-1 w-40" />
                </div>
                <Button size="sm" variant="outline" onClick={() => { setLeaveFrom(leaveYearStart); setLeaveTo(today); }}>This Year</Button>
                <Button size="sm" variant="outline" onClick={() => {
                  const m = today.slice(0, 7);
                  setLeaveFrom(`${m}-01`);
                  setLeaveTo(today);
                }}>This Month</Button>
              </div>
            </CardContent>
          </Card>

          {/* Clean table view */}
          <Card className="shadow-sm">
            <CardHeader><CardTitle className="text-sm">Leave History</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead className="text-center">Days</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(myRequests ?? []).filter(r => r.startDate >= leaveFrom && r.startDate <= leaveTo).map(r => (
                    <TableRow key={r.id} className="cursor-pointer hover:bg-muted/20" onClick={() => setViewLeave(r)}>
                      <TableCell>
                        <Badge variant="secondary" className={cn("text-xs", LEAVE_TYPE_COLORS[r.leaveType])}>{r.leaveType}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={cn("text-xs", LEAVE_STATUS_COLORS[r.status])}>{r.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{r.startDate}</TableCell>
                      <TableCell className="text-sm">{r.endDate}</TableCell>
                      <TableCell className="text-sm text-center">{r.totalDays}</TableCell>
                      <TableCell className="text-sm max-w-[160px] truncate text-muted-foreground">{r.reason}</TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        {r.status === "pending" && (
                          <Button size="sm" variant="ghost" className="text-destructive h-7 text-xs"
                            onClick={() => cancelLeaveMut.mutate(r.id)} disabled={cancelLeaveMut.isPending}>
                            Cancel
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(myRequests ?? []).filter(r => r.startDate >= leaveFrom && r.startDate <= leaveTo).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">No leave requests for selected period</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── CASH SHIFTS ── */}
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

import { useState, useMemo, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Clock, FileText, Calendar, ChevronLeft, ChevronRight,
  Check, X, Edit2, Save, Lock, Users, Settings2, DollarSign, UserX, Search
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page-header";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { attendanceService, type AttendanceRecord } from "@/services/attendance.service";
import { leaveService, type LeaveBalance } from "@/services/leave.service";
import { scheduleService, type StaffSchedule, SHIFT_COLORS } from "@/services/schedule.service";
import { userService, type UserRecord } from "@/services/user.service";
import { settingsService } from "@/services/settings.service";
import { useOutlet } from "@/contexts/OutletContext";
import { useAuth } from "@/contexts/AuthContext";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const getDatesInRange = (start: string, end: string) => {
  const dates: string[] = [];
  let curr = new Date(start + "T00:00:00Z");
  const last = new Date(end + "T00:00:00Z");
  while (curr <= last) {
    dates.push(curr.toISOString().split("T")[0]);
    curr.setUTCDate(curr.getUTCDate() + 1);
  }
  return dates;
};

const getWeekStartOfDate = (dateStr: string) => {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split("T")[0];
};

const getDayIndexOfDate = (dateStr: string) => {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay();
  return day === 0 ? 6 : day - 1;
};
const SHIFT_CYCLE = ["morning", "evening", "night", "off"] as const;

type ShiftName = "morning" | "evening" | "night";
interface ShiftTime { start: string; end: string }
interface ShiftConfig { morning: ShiftTime; evening: ShiftTime; night: ShiftTime }

const DEFAULT_SHIFT_CONFIG: ShiftConfig = {
  morning: { start: "09:00", end: "17:00" },
  evening: { start: "17:00", end: "01:00" },
  night:   { start: "01:00", end: "09:00" },
};

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

function getWeekStart(offset = 0): string {
  const pktNowMs = Date.now() + 5 * 60 * 60 * 1000;
  const pkt = new Date(pktNowMs);
  const day = pkt.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monMs = pktNowMs + (diff + offset * 7) * 86_400_000;
  return new Date(monMs).toISOString().split("T")[0];
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

function getWeekDates(weekStart: string): Date[] {
  const base = new Date(weekStart + "T00:00:00Z");
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + i);
    return d;
  });
}

function formatWeekRange(weekStart: string): string {
  const dates = getWeekDates(weekStart);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${fmt(dates[0])} – ${fmt(dates[6])}, ${dates[6].getUTCFullYear()}`;
}

function parseShiftConfig(raw: Record<string, unknown>): ShiftConfig {
  const cfg = raw as any;
  return {
    morning: { start: cfg?.morning?.start ?? "09:00", end: cfg?.morning?.end ?? "17:00" },
    evening: { start: cfg?.evening?.start ?? "17:00", end: cfg?.evening?.end ?? "01:00" },
    night:   { start: cfg?.night?.start   ?? "01:00", end: cfg?.night?.end   ?? "09:00" },
  };
}

function draftKey(userId: string, weekStart: string): string {
  return `${userId}|${weekStart}`;
}

export default function AttendancePage() {
  const qc = useQueryClient();
  const { selectedOutletId } = useOutlet();
  const { user: authUser } = useAuth();
  const isAdminOrHigher = ["Super Admin", "Admin"].includes(authUser?.role ?? "");
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().split("T")[0];

  // Attendance filters
  const [attFrom, setAttFrom]         = useState(today);
  const [attTo, setAttTo]             = useState(today);
  const [attUserFilter, setAttUserFilter] = useState("all");
  const [editRow, setEditRow]         = useState<string | null>(null);
  const [editData, setEditData]       = useState({ clockIn: "", clockOut: "", status: "present", notes: "" });

  // Leave tab
  const [leaveFilter, setLeaveFilter] = useState("pending");
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const [leaveFrom, setLeaveFrom] = useState(yearStart);
  const [leaveTo, setLeaveTo]     = useState(today);
  const [rejectId, setRejectId]       = useState<string | null>(null);
  const [rejectNote, setRejectNote]   = useState("");
  const [showManageLeaves, setShowManageLeaves] = useState(false);
  const [editBalance, setEditBalance] = useState<string | null>(null);
  const [balanceEdit, setBalanceEdit] = useState({ annual: 14, sick: 6, casual: 6, halfday: 10 });
  const [statusFilter, setStatusFilter] = useState("all");

  // Schedule
  const [schedWeekOffset, setSchedWeekOffset] = useState(0);
  const [schedWeekView, setSchedWeekView] = useState<"prev" | "current" | "next">("current");
  const prevWeekStart    = getWeekStart(schedWeekOffset - 1);
  const currentWeekStart = getWeekStart(schedWeekOffset);
  const nextWeekStart    = getWeekStart(schedWeekOffset + 1);
  const [draftShifts, setDraftShifts] = useState<Record<string, Record<number, string>>>({});
  const [editingShiftConfig, setEditingShiftConfig] = useState(false);
  const [shiftConfigDraft, setShiftConfigDraft]     = useState<ShiftConfig>(DEFAULT_SHIFT_CONFIG);
  const [schedSearch, setSchedSearch]         = useState("");
  const [schedRoleFilter, setSchedRoleFilter] = useState("all");

  // ── Queries ──
  const { data: usersResult } = useQuery({
    queryKey: ["users-list", selectedOutletId],
    queryFn: () => userService.getUsers({ limit: 500 } as any),
  });
  const users: UserRecord[] = usersResult?.data ?? [];
  const staffUsers = useMemo(() => users.filter(u => !["Rider", "Customer Screen", "Admin", "Super Admin"].includes(u.role)), [users]);

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => settingsService.getSettings(),
  });

  const shiftConfig: ShiftConfig = settings?.shiftConfig && Object.keys(settings.shiftConfig).length > 0
    ? parseShiftConfig(settings.shiftConfig)
    : DEFAULT_SHIFT_CONFIG;

  const { data: attPage, refetch: refetchAtt } = useQuery({
    queryKey: ["all-attendance", selectedOutletId, attFrom, attTo, attUserFilter],
    queryFn: () => attendanceService.getAll({
      startDate: attFrom,
      endDate:   attTo,
      userId: attUserFilter !== "all" ? attUserFilter : undefined,
    }),
  });

  const { data: leaveRequests = [], refetch: refetchLeaves } = useQuery({
    queryKey: ["all-leaves", selectedOutletId, leaveFilter],
    queryFn: () => leaveService.getAll({ status: leaveFilter === "all" ? undefined : leaveFilter }),
  });

  const { data: balances = [], refetch: refetchBalances } = useQuery({
    queryKey: ["all-balances", selectedOutletId],
    queryFn: () => leaveService.getAllBalances(),
  });

  const { data: prevSchedules = [] } = useQuery({
    queryKey: ["all-schedules", selectedOutletId, prevWeekStart],
    queryFn: () => scheduleService.getAll({ weekStart: prevWeekStart }),
  });
  const { data: currSchedules = [] } = useQuery({
    queryKey: ["all-schedules", selectedOutletId, currentWeekStart],
    queryFn: () => scheduleService.getAll({ weekStart: currentWeekStart }),
  });
  const { data: nextSchedules = [] } = useQuery({
    queryKey: ["all-schedules", selectedOutletId, nextWeekStart],
    queryFn: () => scheduleService.getAll({ weekStart: nextWeekStart }),
  });

  const { data: approvedLeaves = [] } = useQuery({
    queryKey: ["approved-leaves-sched", selectedOutletId],
    queryFn: () => leaveService.getAll({ status: "approved" }),
  });

  // ── Mutations ──
  const correctMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof attendanceService.correct>[1] }) =>
      attendanceService.correct(id, data),
    onSuccess: () => { toast.success("Attendance updated"); setEditRow(null); refetchAtt(); },
    onError: (e: unknown) => toast.error((e as Error)?.message || "Update failed"),
  });

  const markAbsentMut = useMutation({
    mutationFn: (date: string) => attendanceService.markAbsent(date),
    onSuccess: (result) => {
      if (result.count === 0) {
        toast.info("All employees are accounted for — nothing to mark");
      } else {
        toast.success(`${result.count} employee(s) marked absent`);
      }
      refetchAtt();
    },
    onError: (e: unknown) => toast.error((e as Error)?.message || "Mark absent failed"),
  });

  const reviewMut = useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: "approve" | "reject"; note?: string }) =>
      leaveService.review(id, action, note),
    onSuccess: (_, vars) => {
      toast.success(`Request ${vars.action}d`);
      if (vars.action === "reject") setRejectId(null);
      refetchLeaves();
      refetchBalances();
    },
    onError: (e: unknown) => toast.error((e as Error)?.message || "Review failed"),
  });

  const updateBalanceMut = useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: { annual: number; sick: number; casual: number } }) =>
      leaveService.updateBalance(userId, data),
    onSuccess: () => { toast.success("Balance updated"); setEditBalance(null); refetchBalances(); },
    onError: (e: unknown) => toast.error((e as Error)?.message || "Update failed"),
  });

  const saveSched = useMutation({
    mutationFn: ({ userId, weekStart, shifts }: { userId: string; weekStart: string; shifts: Array<{ dayIndex: number; shiftType: string }> }) =>
      scheduleService.save({ userId, weekStart, shifts }),
    onSuccess: (_, vars) => {
      toast.success("Schedule saved");
      const key = draftKey(vars.userId, vars.weekStart);
      setDraftShifts(prev => { const n = { ...prev }; delete n[key]; return n; });
      qc.invalidateQueries({ queryKey: ["all-schedules", selectedOutletId] });
    },
    onError: (e: unknown) => toast.error((e as Error)?.message || "Save failed"),
  });

  const publishSched = useMutation({
    mutationFn: (id: string) => scheduleService.publish(id),
    onSuccess: () => {
      toast.success("Schedule published");
      qc.invalidateQueries({ queryKey: ["all-schedules", selectedOutletId] });
    },
    onError: (e: unknown) => toast.error((e as Error)?.message || "Publish failed"),
  });

  const saveShiftConfigMut = useMutation({
    mutationFn: (cfg: ShiftConfig) => settingsService.updateSettings({ shiftConfig: cfg as any }),
    onSuccess: (updated) => {
      toast.success("Shift timings saved");
      setEditingShiftConfig(false);
      qc.setQueryData(["settings"], updated);
    },
    onError: (e: unknown) => toast.error((e as Error)?.message || "Save failed"),
  });

  // ── Helpers ──
  const getShiftTypeOnDate = useMemo(() => {
    return (userId: string, dateStr: string) => {
      const ws = getWeekStartOfDate(dateStr);
      const dayIdx = getDayIndexOfDate(dateStr);
      let scheds: any[] = [];
      if (ws === currentWeekStart) scheds = currSchedules;
      else if (ws === prevWeekStart) scheds = prevSchedules;
      else if (ws === nextWeekStart) scheds = nextSchedules;
      
      const userSched = scheds.find(s => s.userId === userId);
      return userSched?.shifts.find((s: any) => s.dayIndex === dayIdx)?.shiftType ?? "off";
    };
  }, [currSchedules, prevSchedules, nextSchedules, currentWeekStart, prevWeekStart, nextWeekStart]);

  const attRows: AttendanceRecord[] = attPage?.data ?? [];

  const unrecordedRows = useMemo(() => {
    const dates = getDatesInRange(attFrom, attTo);
    const rows: any[] = [];
    const recordSet = new Set(attRows.map(r => `${r.userId}|${r.date}`));

    for (const dStr of dates) {
      for (const u of staffUsers) {
        if (!recordSet.has(`${u.id}|${dStr}`)) {
          const shift = getShiftTypeOnDate(u.id, dStr);
          rows.push({
            id: `unrecorded-${u.id}-${dStr}`,
            date: dStr,
            userId: u.id,
            clockIn: null,
            clockOut: null,
            status: shift === "off" ? "off" : "absent",
            notes: shift === "off" ? "Scheduled Off" : "No record",
            user: u,
          });
        }
      }
    }
    return rows;
  }, [attRows, staffUsers, attFrom, attTo, getShiftTypeOnDate]);

  const present = attRows.filter(r => r.status === "present").length;
  const late     = attRows.filter(r => r.status === "late").length;
  const halfday  = attRows.filter(r => r.status === "halfday").length;
  const absent   = attRows.filter(r => r.status === "absent").length;
  const notRecorded = unrecordedRows.length;

  const filteredAttRows = useMemo(() => {
    if (statusFilter === "all") return attRows;
    if (statusFilter === "not-recorded") return unrecordedRows;
    return attRows.filter(r => r.status === statusFilter);
  }, [attRows, statusFilter, unrecordedRows]);

  function startEdit(r: AttendanceRecord) {
    setEditRow(r.id);
    setEditData({
      clockIn:  r.clockIn  ? new Date(r.clockIn).toTimeString().slice(0, 5)  : "",
      clockOut: r.clockOut ? new Date(r.clockOut).toTimeString().slice(0, 5) : "",
      status:   r.status,
      notes:    r.notes ?? "",
    });
  }

  function saveEdit(r: AttendanceRecord) {
    const base = r.date;
    correctMut.mutate({
      id: r.id,
      data: {
        clockIn:  editData.clockIn  ? new Date(`${base}T${editData.clockIn}:00`).toISOString()  : null,
        clockOut: editData.clockOut ? new Date(`${base}T${editData.clockOut}:00`).toISOString() : null,
        status:   editData.status as "present" | "late" | "absent",
        notes:    editData.notes || null,
      },
    });
  }

  function getDraftOrSaved(userId: string, weekStart: string, dayIndex: number, saved?: StaffSchedule): string {
    const key = draftKey(userId, weekStart);
    return draftShifts[key]?.[dayIndex] ??
           saved?.shifts.find(s => s.dayIndex === dayIndex)?.shiftType ??
           "off";
  }

  function buildShiftsPayload(userId: string, weekStart: string, saved?: StaffSchedule) {
    return DAY_LABELS.map((_, i) => ({
      dayIndex:  i,
      shiftType: getDraftOrSaved(userId, weekStart, i, saved),
    }));
  }

  function cycleDayShift(userId: string, weekStart: string, dayIndex: number, current: string) {
    const idx  = SHIFT_CYCLE.indexOf(current as typeof SHIFT_CYCLE[number]);
    const next = SHIFT_CYCLE[(idx < 0 ? 0 : idx + 1) % SHIFT_CYCLE.length];
    const key  = draftKey(userId, weekStart);
    setDraftShifts(prev => ({ ...prev, [key]: { ...(prev[key] ?? {}), [dayIndex]: next } }));
  }

  function cancelEdit(userId: string, weekStart: string) {
    const key = draftKey(userId, weekStart);
    setDraftShifts(prev => { const n = { ...prev }; delete n[key]; return n; });
  }



  const staffRoles = useMemo(() => [...new Set(staffUsers.map(u => u.role))].sort(), [users]);

  const filteredStaff = useMemo(() => staffUsers.filter(u => {
    const matchesRole   = schedRoleFilter === "all" || u.role === schedRoleFilter;
    const matchesSearch = !schedSearch || u.name.toLowerCase().includes(schedSearch.toLowerCase());
    return matchesRole && matchesSearch;
  }), [users, schedRoleFilter, schedSearch]);

  const leaveBlockedDates = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const leave of approvedLeaves) {
      if (!map[leave.userId]) map[leave.userId] = new Set();
      const start = new Date(leave.startDate + "T00:00:00Z");
      const end   = new Date(leave.endDate   + "T00:00:00Z");
      for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        map[leave.userId].add(d.toISOString().split("T")[0]);
      }
    }
    return map;
  }, [approvedLeaves]);

  const weekSections = [
    {
      key: "prev" as const, label: "Last Week", weekStart: prevWeekStart, schedules: prevSchedules,
      headerBg:   "bg-orange-100 dark:bg-orange-900/30 text-orange-900 dark:text-orange-200",
      cellBg:     "bg-orange-50/40 dark:bg-orange-950/10",
      dot:        "bg-orange-500",
      tabActive:  "bg-orange-50 border-orange-300 dark:bg-orange-950/30 dark:border-orange-800",
      tabText:    "text-orange-900 dark:text-orange-200",
    },
    {
      key: "current" as const, label: "Current Week", weekStart: currentWeekStart, schedules: currSchedules,
      headerBg:   "bg-green-100 dark:bg-green-900/30 text-green-900 dark:text-green-200",
      cellBg:     "bg-green-50/40 dark:bg-green-950/10",
      dot:        "bg-green-500",
      tabActive:  "bg-green-50 border-green-300 dark:bg-green-950/30 dark:border-green-800",
      tabText:    "text-green-900 dark:text-green-200",
    },
    {
      key: "next" as const, label: "Next Week", weekStart: nextWeekStart, schedules: nextSchedules,
      headerBg:   "bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-200",
      cellBg:     "bg-blue-50/40 dark:bg-blue-950/10",
      dot:        "bg-blue-500",
      tabActive:  "bg-blue-50 border-blue-300 dark:bg-blue-950/30 dark:border-blue-800",
      tabText:    "text-blue-900 dark:text-blue-200",
    },
  ];
  const activeSection = weekSections.find(s => s.key === schedWeekView) ?? weekSections[1];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Clock className="h-5 w-5" />}
        title="HR Management"
        subtitle="Attendance, leave requests, and schedules"
      />

      <Tabs defaultValue="attendance">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="attendance" className="gap-1.5"><Clock      className="h-3.5 w-3.5" />Attendance</TabsTrigger>
          <TabsTrigger value="leaves"     className="gap-1.5"><FileText   className="h-3.5 w-3.5" />Leave Requests</TabsTrigger>
          <TabsTrigger value="schedules"  className="gap-1.5"><Calendar   className="h-3.5 w-3.5" />Schedules</TabsTrigger>
        </TabsList>

        {/* ── ATTENDANCE ── */}
        <TabsContent value="attendance" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <Label className="text-xs">From</Label>
              <Input type="date" value={attFrom} onChange={e => setAttFrom(e.target.value)} className="mt-1 w-40" />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input type="date" value={attTo} onChange={e => setAttTo(e.target.value)} className="mt-1 w-40" />
            </div>
            <div>
              <Label className="text-xs">Employee</Label>
              <Select value={attUserFilter} onValueChange={setAttUserFilter}>
                <SelectTrigger className="mt-1 w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {staffUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" variant="outline" onClick={() => { setAttFrom(today); setAttTo(today); }}>Today</Button>
            <Button size="sm" variant="outline" onClick={() => { setAttFrom(thirtyDaysAgo); setAttTo(today); }}>Last 30d</Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: "Present",      value: present, color: "text-success", statusKey: "present" },
              { label: "Late",         value: late,    color: "text-warning", statusKey: "late" },
              { label: "Half Day",     value: halfday, color: "text-orange-500", statusKey: "halfday" },
              { label: "Absent",       value: absent,  color: "text-destructive", statusKey: "absent" },
              { label: "Not Recorded", value: notRecorded, color: "text-muted-foreground", statusKey: "not-recorded" },
            ].map(s => (
              <Card 
                key={s.label} 
                className={cn(
                  "shadow-sm cursor-pointer transition-all hover:ring-2 hover:ring-primary/20",
                  statusFilter === s.statusKey && "ring-2 ring-primary bg-primary/5"
                )}
                onClick={() => setStatusFilter(prev => prev === s.statusKey ? "all" : s.statusKey)}
              >
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className={cn("text-xl font-bold", s.color)}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="shadow-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead>Date</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Clock In</TableHead>
                    <TableHead>Clock Out</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Overtime</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAttRows.map(r => (
                    <TableRow key={r.id} className="hover:bg-muted/30">
                      <TableCell className="text-sm text-muted-foreground">{r.date}</TableCell>
                      <TableCell>
                        <p className="text-sm font-medium">{r.user?.name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{r.user?.role ?? ""}</p>
                      </TableCell>
                      <TableCell className="text-sm">
                        {editRow === r.id
                          ? <Input type="time" value={editData.clockIn} onChange={e => setEditData(d => ({ ...d, clockIn: e.target.value }))} className="h-7 w-28" />
                          : formatTime(r.clockIn)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {editRow === r.id
                          ? <Input type="time" value={editData.clockOut} onChange={e => setEditData(d => ({ ...d, clockOut: e.target.value }))} className="h-7 w-28" />
                          : formatTime(r.clockOut)}
                      </TableCell>
                      <TableCell className="text-sm">{hoursWorked(r.clockIn, r.clockOut)}</TableCell>
                      <TableCell className="text-sm">
                        {(r.overtimeMinutes ?? 0) > 0
                          ? <span className="text-warning font-medium">{((r.overtimeMinutes ?? 0) / 60).toFixed(1)}h</span>
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {editRow === r.id
                          ? <Select value={editData.status} onValueChange={v => setEditData(d => ({ ...d, status: v }))}>
                              <SelectTrigger className="h-7 w-28"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {["present", "late", "halfday", "absent"].map(s => (
                                  <SelectItem key={s} value={s} className="capitalize">
                                    {s === "halfday" ? "Half Day" : s}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          : <Badge variant="secondary" className={cn("capitalize", ATT_STATUS_COLORS[r.status])}>
                              {r.status === "halfday" ? "half day" : r.status}
                            </Badge>}
                      </TableCell>
                      <TableCell className="text-sm max-w-[160px]">
                        {editRow === r.id
                          ? <Input placeholder="Notes (optional)" value={editData.notes} onChange={e => setEditData(d => ({ ...d, notes: e.target.value }))} className="h-7 text-xs" />
                          : <span className="truncate block text-muted-foreground">{r.notes || "—"}</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {isAdminOrHigher && (
                            editRow === r.id ? (
                              <>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-success" onClick={() => saveEdit(r)}><Save className="h-3.5 w-3.5" /></Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditRow(null)}><X className="h-3.5 w-3.5" /></Button>
                              </>
                            ) : (
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(r)}><Edit2 className="h-3.5 w-3.5" /></Button>
                            )
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredAttRows.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No records for selected period</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── LEAVE REQUESTS ── */}
        <TabsContent value="leaves" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <Label className="text-xs">From</Label>
              <Input type="date" value={leaveFrom} onChange={e => setLeaveFrom(e.target.value)} className="mt-1 w-40" />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input type="date" value={leaveTo} onChange={e => setLeaveTo(e.target.value)} className="mt-1 w-40" />
            </div>
            <Button size="sm" variant="outline" onClick={() => { setLeaveFrom(yearStart); setLeaveTo(today); }}>This Year</Button>
            <Button size="sm" variant="outline" onClick={() => {
              const m = today.slice(0, 7);
              setLeaveFrom(`${m}-01`);
              setLeaveTo(today);
            }}>This Month</Button>
          </div>
          <div className="flex gap-2 flex-wrap">
            {["pending", "approved", "rejected", "all"].map(f => (
              <Button key={f} size="sm" variant={leaveFilter === f ? "default" : "outline"} className="capitalize" onClick={() => setLeaveFilter(f)}>{f}</Button>
            ))}
          </div>

          {/* Clean table */}
          <Card className="shadow-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead>Employee</TableHead>
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
                  {leaveRequests.filter(r => r.startDate >= leaveFrom && r.startDate <= leaveTo).map(r => (
                    <Fragment key={r.id}>
                      <TableRow className="hover:bg-muted/20">
                        <TableCell>
                          <p className="text-sm font-medium">{r.user?.name ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">{r.user?.role}</p>
                        </TableCell>
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
                        <TableCell>
                          {r.status === "pending" && isAdminOrHigher && (
                            <div className="flex gap-1">
                              <Button size="sm" className="h-7 text-xs bg-success hover:bg-success/90 text-white"
                                onClick={() => reviewMut.mutate({ id: r.id, action: "approve" })} disabled={reviewMut.isPending}>
                                <Check className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs text-destructive border-destructive/30"
                                onClick={() => setRejectId(rejectId === r.id ? null : r.id)}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                      {rejectId === r.id && (
                        <TableRow key={`${r.id}-reject`}>
                          <TableCell colSpan={8} className="pt-0 pb-3 px-4">
                            <div className="space-y-2 border-t pt-2">
                              <Textarea placeholder="Rejection note (optional)" value={rejectNote} onChange={e => setRejectNote(e.target.value)} rows={2} className="text-sm" />
                              <div className="flex justify-end gap-2">
                                <Button size="sm" variant="outline" onClick={() => setRejectId(null)}>Cancel</Button>
                                <Button size="sm" variant="destructive" onClick={() => {
                                  reviewMut.mutate({ id: r.id, action: "reject", note: rejectNote });
                                  setRejectNote("");
                                }}>
                                  Confirm Reject
                                </Button>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                  {leaveRequests.filter(r => r.startDate >= leaveFrom && r.startDate <= leaveTo).length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No {leaveFilter !== "all" ? leaveFilter : ""} leave requests for selected period</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Manage Leaves */}
          <div className="flex items-center justify-between pt-2">
            <h3 className="text-sm font-semibold">Leave Balances — {new Date().getFullYear()}</h3>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowManageLeaves(v => !v)}>
              <Users className="h-3.5 w-3.5" />
              {showManageLeaves ? "Close" : "Manage Leaves"}
            </Button>
          </div>

          {showManageLeaves && (
            <Card className="shadow-sm border-primary/30">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead>Employee</TableHead>
                      <TableHead className="text-center">Annual (used / total)</TableHead>
                      <TableHead className="text-center">Sick (used / total)</TableHead>
                      <TableHead className="text-center">Casual (used / total)</TableHead>
                      <TableHead className="text-center">Half Day (used / total)</TableHead>
                      {isAdminOrHigher && <TableHead></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staffUsers.map(u => {
                      const b        = balances.find(bl => bl.userId === u.id);
                      const annual   = b?.annual      ?? 14;
                      const sick     = b?.sick        ?? 6;
                      const casual   = b?.casual      ?? 6;
                      const halfday  = b?.halfday     ?? 10;
                      const usedMap  = { annual: b?.annualUsed ?? 0, sick: b?.sickUsed ?? 0, casual: b?.casualUsed ?? 0, halfday: b?.halfdayUsed ?? 0 };
                      const totMap   = { annual, sick, casual, halfday };
                      return (
                        <TableRow key={u.id} className="hover:bg-muted/30">
                          <TableCell>
                            <p className="text-sm font-medium">{u.name}</p>
                            <p className="text-xs text-muted-foreground">{u.role}</p>
                          </TableCell>
                          {(["annual", "sick", "casual", "halfday"] as const).map(type => (
                            <TableCell key={type} className="text-center text-sm">
                              {editBalance === u.id && isAdminOrHigher
                                ? <Input type="number" min="0" value={balanceEdit[type]} onChange={e => setBalanceEdit(d => ({ ...d, [type]: Number(e.target.value) }))} className="h-7 w-20 text-center mx-auto" />
                                : <span><strong>{usedMap[type]}</strong> / {totMap[type]}</span>
                              }
                            </TableCell>
                          ))}
                          {isAdminOrHigher && (
                            <TableCell>
                              {editBalance === u.id ? (
                                <div className="flex gap-1 justify-end">
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-success"
                                    onClick={() => updateBalanceMut.mutate({ userId: u.id, data: balanceEdit })}>
                                    <Save className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditBalance(null)}>
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              ) : (
                                <Button size="icon" variant="ghost" className="h-7 w-7 float-right"
                                  onClick={() => { setEditBalance(u.id); setBalanceEdit({ annual, sick, casual, halfday }); }}>
                                  <Edit2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                    {staffUsers.length === 0 && (
                      <TableRow><TableCell colSpan={isAdminOrHigher ? 6 : 5} className="text-center text-muted-foreground py-6">No employees found</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── SCHEDULES ── */}
        <TabsContent value="schedules" className="mt-4 space-y-4">
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <Settings2 className="h-4 w-4" />Shift Timings
                </CardTitle>
                {isAdminOrHigher && (
                  !editingShiftConfig ? (
                    <Button size="sm" variant="outline" className="h-7 text-xs"
                      onClick={() => { setShiftConfigDraft({ morning: { ...shiftConfig.morning }, evening: { ...shiftConfig.evening }, night: { ...shiftConfig.night } }); setEditingShiftConfig(true); }}>
                      Edit Timings
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingShiftConfig(false)}>Cancel</Button>
                      <Button size="sm" className="h-7 text-xs gradient-primary text-primary-foreground"
                        disabled={saveShiftConfigMut.isPending}
                        onClick={() => saveShiftConfigMut.mutate(shiftConfigDraft)}>Save</Button>
                    </div>
                  )
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {(["morning", "evening", "night"] as ShiftName[]).map(shift => (
                  <div key={shift} className={cn("rounded-md p-3 border", SHIFT_COLORS[shift])}>
                    <p className="text-xs font-semibold capitalize mb-2">{shift}</p>
                    {editingShiftConfig ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <Label className="text-[10px] w-8 shrink-0">Start</Label>
                          <Input type="time" value={shiftConfigDraft[shift].start}
                            onChange={e => setShiftConfigDraft(c => ({ ...c, [shift]: { ...c[shift], start: e.target.value } }))}
                            className="h-7 text-xs bg-background" />
                        </div>
                        <div className="flex items-center gap-2">
                          <Label className="text-[10px] w-8 shrink-0">End</Label>
                          <Input type="time" value={shiftConfigDraft[shift].end}
                            onChange={e => setShiftConfigDraft(c => ({ ...c, [shift]: { ...c[shift], end: e.target.value } }))}
                            className="h-7 text-xs bg-background" />
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs font-mono">{shiftConfig[shift].start} – {shiftConfig[shift].end}</p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Week selector — pick ONE week to view at a time */}
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

          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setSchedWeekOffset(o => o - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="text-sm font-semibold min-w-[200px] text-center">{formatWeekRange(activeSection.weekStart)}</span>
              <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setSchedWeekOffset(o => o + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <Label className="text-xs">Search</Label>
                <div className="relative mt-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Search employee..." value={schedSearch} onChange={e => setSchedSearch(e.target.value)} className="h-8 w-44 text-sm pl-8" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Division</Label>
                <Select value={schedRoleFilter} onValueChange={setSchedRoleFilter}>
                  <SelectTrigger className="mt-1 h-8 w-40 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Divisions</SelectItem>
                    {staffRoles.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Jump to date</Label>
                <Input type="date" className="mt-1 h-8 w-40 text-sm" onChange={e => {
                  if (!e.target.value) return;
                  const d = new Date(e.target.value + "T00:00:00Z");
                  const day = d.getUTCDay();
                  const diff = day === 0 ? -6 : 1 - day;
                  const pickedMon = new Date(d.getTime() + diff * 86_400_000).toISOString().split("T")[0];
                  const pktNowMs = Date.now() + 5 * 60 * 60 * 1000;
                  const curDay = new Date(pktNowMs).getUTCDay();
                  const curDiff = curDay === 0 ? -6 : 1 - curDay;
                  const curMon = new Date(pktNowMs + curDiff * 86_400_000).toISOString().split("T")[0];
                  const weeks = Math.round((new Date(pickedMon + "T00:00:00Z").getTime() - new Date(curMon + "T00:00:00Z").getTime()) / (7 * 86_400_000));
                  setSchedWeekOffset(weeks);
                  setSchedWeekView("current");
                }} />
              </div>
              <Button size="sm" variant="outline" onClick={() => { setSchedWeekOffset(0); setSchedWeekView("current"); }}>Jump to Today</Button>
            </div>
          </div>

          <Card className="shadow-sm">
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-muted/50 border text-left px-3 py-2 w-40 min-w-[140px]">
                      Employee
                    </th>
                    {getWeekDates(activeSection.weekStart).map((date, i) => (
                      <th key={i} className={cn("border px-1.5 py-1.5 text-center font-medium text-[11px] min-w-[88px]", activeSection.headerBg)}>
                        <div>{DAY_LABELS[i]}</div>
                        <div className="text-[9px] opacity-70 font-normal">
                          {date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
                        </div>
                      </th>
                    ))}
                    <th className={cn("border px-2 py-1.5 text-center font-medium text-[11px] min-w-[110px]", activeSection.headerBg)}>
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStaff.map(u => {
                    const saved       = activeSection.schedules.find(s => s.userId === u.id);
                    const key         = draftKey(u.id, activeSection.weekStart);
                    const inEditMode  = key in draftShifts;
                    const hasPending  = inEditMode && Object.keys(draftShifts[key]).length > 0;
                    const isPublished = saved?.status === "published" && !inEditMode;
                    return (
                      <tr key={u.id} className="hover:bg-muted/20">
                        <td className="sticky left-0 z-10 bg-card border px-3 py-2">
                          <p className="text-sm font-medium">{u.name}</p>
                          <p className="text-xs text-muted-foreground">{u.role}</p>
                        </td>
                        {getWeekDates(activeSection.weekStart).map((date, i) => {
                          const dateStr = date.toISOString().split("T")[0];
                          const onLeave = leaveBlockedDates[u.id]?.has(dateStr);
                          if (onLeave) {
                            return (
                              <td key={i} className={cn("border p-1.5 text-center", activeSection.cellBg)}>
                                <div title="Approved leave" className="text-[10px] px-2 py-1.5 rounded-md font-medium w-full border bg-purple-100 text-purple-700 border-purple-200 cursor-not-allowed">
                                  Leave
                                </div>
                              </td>
                            );
                          }
                          const shiftType = getDraftOrSaved(u.id, activeSection.weekStart, i, saved);
                          const label     = shiftType === "off" ? "Off" : shiftType.charAt(0).toUpperCase() + shiftType.slice(1);
                          const times     = shiftType !== "off" ? shiftConfig[shiftType as ShiftName] : null;
                          return (
                            <td key={i} className={cn("border p-1.5 text-center", activeSection.cellBg)}>
                              <button
                                disabled={isPublished}
                                title={times ? `${times.start} – ${times.end}` : "Day Off"}
                                className={cn(
                                  "text-[10px] px-2 py-1.5 rounded-md font-medium transition-all w-full border",
                                  SHIFT_COLORS[shiftType],
                                  !isPublished && "cursor-pointer hover:opacity-80 hover:ring-1 hover:ring-primary/40"
                                )}
                                onClick={() => cycleDayShift(u.id, activeSection.weekStart, i, shiftType)}
                              >
                                {label}
                                {times && <div className="text-[8px] opacity-70 font-mono">{times.start}</div>}
                              </button>
                            </td>
                          );
                        })}
                        <td className={cn("border p-1.5 text-center", activeSection.cellBg)}>
                          <div className="flex gap-1 justify-center flex-wrap">
                            {inEditMode ? (
                              <>
                                {hasPending ? (
                                  <Button size="sm" variant="outline" className="h-6 text-[10px] px-1.5" disabled={saveSched.isPending}
                                    onClick={() => saveSched.mutate({ userId: u.id, weekStart: activeSection.weekStart, shifts: buildShiftsPayload(u.id, activeSection.weekStart, saved) })}>
                                    Save Draft
                                  </Button>
                                ) : (
                                  <span className="text-[9px] text-muted-foreground">Click shift to change</span>
                                )}
                                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1.5" onClick={() => cancelEdit(u.id, activeSection.weekStart)}>
                                  Cancel
                                </Button>
                              </>
                            ) : isPublished ? (
                              isAdminOrHigher ? (
                                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1.5"
                                  onClick={() => setDraftShifts(prev => ({ ...prev, [key]: {} }))}>
                                  Edit
                                </Button>
                              ) : (
                                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                  <Lock className="h-2.5 w-2.5" />Published
                                </span>
                              )
                            ) : saved?.status === "draft" ? (
                              <Button size="sm" className="h-6 text-[10px] px-1.5 gradient-primary text-primary-foreground"
                                disabled={publishSched.isPending} onClick={() => publishSched.mutate(saved.id)}>
                                Publish
                              </Button>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredStaff.length === 0 && (
                    <tr><td colSpan={9} className="text-center text-muted-foreground py-8">No staff found</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

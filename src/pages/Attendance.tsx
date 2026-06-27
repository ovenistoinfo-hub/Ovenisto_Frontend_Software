import { useState, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Clock, FileText, Calendar, ChevronLeft, ChevronRight,
  Check, X, Edit2, Save, Lock, Users, Settings2, DollarSign, UserX
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
  absent:  "bg-destructive/10 text-destructive",
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

export default function AttendancePage() {
  const qc = useQueryClient();
  const { selectedOutletId } = useOutlet();
  const { user: authUser } = useAuth();
  const isAdmin = ["Super Admin", "Admin", "Manager"].includes(authUser?.role ?? "");
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
  const [balanceEdit, setBalanceEdit] = useState({ annual: 14, sick: 6, casual: 6 });

  // Schedule
  const [schedWeekOffset, setSchedWeekOffset] = useState(0);
  const schedWeekStart = getWeekStart(schedWeekOffset);
  const [draftShifts, setDraftShifts] = useState<Record<string, Record<number, string>>>({});
  const [editingShiftConfig, setEditingShiftConfig] = useState(false);
  const [shiftConfigDraft, setShiftConfigDraft]     = useState<ShiftConfig>(DEFAULT_SHIFT_CONFIG);

  // Pay settings
  const [editPayUser, setEditPayUser] = useState<string | null>(null);
  const [payEdit, setPayEdit]         = useState({ hourlyRate: 0, absencePenalty: 0 });

  // ── Queries ──
  const { data: usersResult } = useQuery({
    queryKey: ["users-list", selectedOutletId],
    queryFn: () => userService.getUsers({ limit: 500 } as any),
  });
  const users: UserRecord[] = usersResult?.data ?? [];

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

  const { data: schedules = [], refetch: refetchSchedules } = useQuery({
    queryKey: ["all-schedules", selectedOutletId, schedWeekStart],
    queryFn: () => scheduleService.getAll({ weekStart: schedWeekStart }),
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
    mutationFn: ({ userId, shifts }: { userId: string; shifts: Array<{ dayIndex: number; shiftType: string }> }) =>
      scheduleService.save({ userId, weekStart: schedWeekStart, shifts }),
    onSuccess: (_, vars) => {
      toast.success("Schedule saved");
      setDraftShifts(prev => { const n = { ...prev }; delete n[vars.userId]; return n; });
      refetchSchedules();
    },
    onError: (e: unknown) => toast.error((e as Error)?.message || "Save failed"),
  });

  const publishSched = useMutation({
    mutationFn: (id: string) => scheduleService.publish(id),
    onSuccess: () => { toast.success("Schedule published"); refetchSchedules(); },
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

  const updatePayMut = useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: { hourlyRate: number | null; absencePenalty: number | null } }) =>
      userService.updateUser(userId, data),
    onSuccess: () => {
      toast.success("Pay settings saved");
      setEditPayUser(null);
      qc.invalidateQueries({ queryKey: ["users-list", selectedOutletId] });
    },
    onError: (e: unknown) => toast.error((e as Error)?.message || "Save failed"),
  });

  // ── Helpers ──
  const attRows: AttendanceRecord[] = attPage?.data ?? [];
  const present = attRows.filter(r => r.status === "present").length;
  const late     = attRows.filter(r => r.status === "late").length;
  const absent   = attRows.filter(r => r.status === "absent").length;

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

  function getDraftOrSaved(userId: string, dayIndex: number, saved?: StaffSchedule): string {
    return draftShifts[userId]?.[dayIndex] ??
           saved?.shifts.find(s => s.dayIndex === dayIndex)?.shiftType ??
           "off";
  }

  function buildShiftsPayload(userId: string, saved?: StaffSchedule) {
    return DAY_LABELS.map((_, i) => ({
      dayIndex:  i,
      shiftType: getDraftOrSaved(userId, i, saved),
    }));
  }

  function cycleDayShift(userId: string, dayIndex: number, current: string) {
    const idx  = SHIFT_CYCLE.indexOf(current as typeof SHIFT_CYCLE[number]);
    const next = SHIFT_CYCLE[(idx < 0 ? 0 : idx + 1) % SHIFT_CYCLE.length];
    setDraftShifts(prev => ({ ...prev, [userId]: { ...(prev[userId] ?? {}), [dayIndex]: next } }));
  }

  const staffUsers = users.filter(u => !["Rider", "Customer Screen"].includes(u.role));

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Clock className="h-5 w-5" />}
        title="HR Management"
        subtitle="Attendance, leave requests, schedules, and pay settings"
      />

      <Tabs defaultValue="attendance">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="attendance" className="gap-1.5"><Clock      className="h-3.5 w-3.5" />Attendance</TabsTrigger>
          <TabsTrigger value="leaves"     className="gap-1.5"><FileText   className="h-3.5 w-3.5" />Leave Requests</TabsTrigger>
          <TabsTrigger value="schedules"  className="gap-1.5"><Calendar   className="h-3.5 w-3.5" />Schedules</TabsTrigger>
          <TabsTrigger value="pay"        className="gap-1.5"><DollarSign className="h-3.5 w-3.5" />Pay Settings</TabsTrigger>
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
                  {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" variant="outline" onClick={() => { setAttFrom(today); setAttTo(today); }}>Today</Button>
            <Button size="sm" variant="outline" onClick={() => { setAttFrom(thirtyDaysAgo); setAttTo(today); }}>Last 30d</Button>
            {isAdmin && attFrom === attTo && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
                disabled={markAbsentMut.isPending}
                onClick={() => {
                  if (confirm(`Mark all employees without attendance as absent for ${attFrom}?\n\nEmployees on approved leave will be skipped.`)) {
                    markAbsentMut.mutate(attFrom);
                  }
                }}
              >
                <UserX className="h-3.5 w-3.5" />Mark Absent
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Present",      value: present, color: "text-success" },
              { label: "Late",         value: late,    color: "text-warning" },
              { label: "Absent",       value: absent,  color: "text-destructive" },
              { label: "Not Recorded", value: Math.max(0, users.length - attRows.length), color: "text-muted-foreground" },
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
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead>Date</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Clock In</TableHead>
                    <TableHead>Clock Out</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attRows.map(r => (
                    <Fragment key={r.id}>
                      <TableRow className="hover:bg-muted/30">
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
                        <TableCell>
                          {editRow === r.id
                            ? <Select value={editData.status} onValueChange={v => setEditData(d => ({ ...d, status: v }))}>
                                <SelectTrigger className="h-7 w-28"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {["present", "late", "absent"].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            : <Badge variant="secondary" className={ATT_STATUS_COLORS[r.status]}>{r.status}</Badge>}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {editRow === r.id ? (
                              <>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-success" onClick={() => saveEdit(r)}><Save className="h-3.5 w-3.5" /></Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditRow(null)}><X className="h-3.5 w-3.5" /></Button>
                              </>
                            ) : (
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(r)}><Edit2 className="h-3.5 w-3.5" /></Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {editRow === r.id && (
                        <TableRow key={`${r.id}-notes`}>
                          <TableCell colSpan={7} className="pt-0 pb-2 px-4">
                            <Input placeholder="Notes (optional)" value={editData.notes} onChange={e => setEditData(d => ({ ...d, notes: e.target.value }))} className="h-7" />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                  {attRows.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No records for selected period</TableCell></TableRow>
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
                          {r.status === "pending" && (
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
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staffUsers.map(u => {
                      const b        = balances.find(bl => bl.userId === u.id);
                      const annual   = b?.annual      ?? 14;
                      const sick     = b?.sick        ?? 6;
                      const casual   = b?.casual      ?? 6;
                      const usedMap  = { annual: b?.annualUsed ?? 0, sick: b?.sickUsed ?? 0, casual: b?.casualUsed ?? 0 };
                      const totMap   = { annual, sick, casual };
                      return (
                        <TableRow key={u.id} className="hover:bg-muted/30">
                          <TableCell>
                            <p className="text-sm font-medium">{u.name}</p>
                            <p className="text-xs text-muted-foreground">{u.role}</p>
                          </TableCell>
                          {(["annual", "sick", "casual"] as const).map(type => (
                            <TableCell key={type} className="text-center text-sm">
                              {editBalance === u.id
                                ? <Input type="number" min="0" value={balanceEdit[type]} onChange={e => setBalanceEdit(d => ({ ...d, [type]: Number(e.target.value) }))} className="h-7 w-20 text-center mx-auto" />
                                : <span><strong>{usedMap[type]}</strong> / {totMap[type]}</span>
                              }
                            </TableCell>
                          ))}
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
                                onClick={() => { setEditBalance(u.id); setBalanceEdit({ annual, sick, casual }); }}>
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {staffUsers.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No employees found</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── SCHEDULES ── */}
        <TabsContent value="schedules" className="mt-4 space-y-4">
          {/* Shift timing configuration */}
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <Settings2 className="h-4 w-4" />Shift Timings
                </CardTitle>
                {!editingShiftConfig ? (
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

          {/* Week navigator */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setSchedWeekOffset(o => o - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="text-sm font-semibold min-w-[200px] text-center">{formatWeekRange(schedWeekStart)}</span>
              <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setSchedWeekOffset(o => o + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <div className="flex items-end gap-3">
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
                }} />
              </div>
              <Button size="sm" variant="outline" onClick={() => setSchedWeekOffset(0)}>Current Week</Button>
            </div>
          </div>

          <Card className="shadow-sm overflow-x-auto">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="w-44 sticky left-0 bg-muted/50 z-10">Employee</TableHead>
                    {getWeekDates(schedWeekStart).map((date, i) => (
                      <TableHead key={i} className="text-center min-w-[100px]">
                        <div className="text-xs font-semibold">{DAY_LABELS[i]}</div>
                        <div className="text-[10px] text-muted-foreground font-normal">
                          {date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
                        </div>
                      </TableHead>
                    ))}
                    <TableHead className="w-36"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staffUsers.map(u => {
                    const saved      = schedules.find(s => s.userId === u.id);
                    const isPublished = saved?.status === "published" && !draftShifts[u.id];
                    return (
                      <TableRow key={u.id} className="hover:bg-muted/20">
                        <TableCell className="sticky left-0 bg-card z-10">
                          <div className="flex items-center gap-1.5">
                            {isPublished && <Lock className="h-3 w-3 text-muted-foreground shrink-0" />}
                            <div>
                              <p className="text-sm font-medium">{u.name}</p>
                              <p className="text-xs text-muted-foreground">{u.role}</p>
                            </div>
                          </div>
                        </TableCell>
                        {DAY_LABELS.map((_, i) => {
                          const shiftType = getDraftOrSaved(u.id, i, saved);
                          const label     = shiftType === "off" ? "Off" : shiftType.charAt(0).toUpperCase() + shiftType.slice(1);
                          const times     = shiftType !== "off" ? shiftConfig[shiftType as ShiftName] : null;
                          return (
                            <TableCell key={i} className="text-center p-1">
                              <button
                                disabled={isPublished}
                                title={times ? `${times.start} – ${times.end}` : "Day Off"}
                                className={cn(
                                  "text-[10px] px-2 py-1.5 rounded-md font-medium transition-all w-full border",
                                  SHIFT_COLORS[shiftType],
                                  !isPublished && "cursor-pointer hover:opacity-80 hover:ring-1 hover:ring-primary/40"
                                )}
                                onClick={() => cycleDayShift(u.id, i, shiftType)}
                              >
                                {label}
                                {times && <div className="text-[8px] opacity-70 font-mono">{times.start}</div>}
                              </button>
                            </TableCell>
                          );
                        })}
                        <TableCell>
                          <div className="flex gap-1 justify-end">
                            {!isPublished && (
                              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={saveSched.isPending}
                                onClick={() => saveSched.mutate({ userId: u.id, shifts: buildShiftsPayload(u.id, saved) })}>
                                Save Draft
                              </Button>
                            )}
                            {saved?.status === "draft" && !draftShifts[u.id] && (
                              <Button size="sm" className="h-7 text-xs gradient-primary text-primary-foreground"
                                disabled={publishSched.isPending} onClick={() => publishSched.mutate(saved.id)}>
                                Publish
                              </Button>
                            )}
                            {isPublished && (
                              <Button size="sm" variant="ghost" className="h-7 text-xs"
                                onClick={() => setDraftShifts(prev => ({ ...prev, [u.id]: {} }))}>
                                Edit
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {staffUsers.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No staff found</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

        </TabsContent>

        {/* ── PAY SETTINGS ── */}
        <TabsContent value="pay" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Set each employee's hourly rate and per-absence penalty. Employees see their estimated pay and penalties in My Portal.
          </p>
          <Card className="shadow-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-right">Hourly Rate (Rs.)</TableHead>
                    <TableHead className="text-right">Absence Penalty (Rs.)</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staffUsers.map(u => (
                    <TableRow key={u.id} className="hover:bg-muted/30">
                      <TableCell>
                        <p className="text-sm font-medium">{u.name}</p>
                        <p className="text-xs text-muted-foreground">{u.role}</p>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {editPayUser === u.id
                          ? <Input type="number" min="0" step="any" value={payEdit.hourlyRate}
                              onChange={e => setPayEdit(d => ({ ...d, hourlyRate: Number(e.target.value) }))}
                              className="h-7 w-28 text-right ml-auto" />
                          : u.hourlyRate != null ? `Rs. ${Number(u.hourlyRate).toLocaleString()}` : <span className="text-muted-foreground">—</span>
                        }
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {editPayUser === u.id
                          ? <Input type="number" min="0" step="any" value={payEdit.absencePenalty}
                              onChange={e => setPayEdit(d => ({ ...d, absencePenalty: Number(e.target.value) }))}
                              className="h-7 w-28 text-right ml-auto" />
                          : u.absencePenalty != null ? `Rs. ${Number(u.absencePenalty).toLocaleString()}` : <span className="text-muted-foreground">—</span>
                        }
                      </TableCell>
                      <TableCell>
                        {editPayUser === u.id ? (
                          <div className="flex gap-1 justify-end">
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-success"
                              disabled={updatePayMut.isPending}
                              onClick={() => updatePayMut.mutate({
                                userId: u.id,
                                data: {
                                  hourlyRate:     payEdit.hourlyRate || null,
                                  absencePenalty: payEdit.absencePenalty || null,
                                },
                              })}>
                              <Save className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditPayUser(null)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex justify-end">
                            <Button size="icon" variant="ghost" className="h-7 w-7"
                              onClick={() => { setEditPayUser(u.id); setPayEdit({ hourlyRate: u.hourlyRate ?? 0, absencePenalty: u.absencePenalty ?? 0 }); }}>
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {staffUsers.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No staff found</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

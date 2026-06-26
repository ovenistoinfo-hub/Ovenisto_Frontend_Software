import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Clock, FileText, Calendar, ChevronLeft, ChevronRight,
  Check, X, Edit2, Save, Lock
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
import { userService } from "@/services/user.service";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SHIFT_CYCLE = ["morning", "evening", "night", "off"] as const;

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

export default function AttendancePage() {
  const qc = useQueryClient();
  const today = new Date().toISOString().split("T")[0];

  const [attDate, setAttDate] = useState(today);
  const [attUserFilter, setAttUserFilter] = useState("all");
  const [editRow, setEditRow] = useState<string | null>(null);
  const [editData, setEditData] = useState({ clockIn: "", clockOut: "", status: "present", notes: "" });

  const [leaveFilter, setLeaveFilter] = useState("pending");
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [editBalance, setEditBalance] = useState<string | null>(null);
  const [balanceEdit, setBalanceEdit] = useState({ annual: 14, sick: 6, casual: 6 });

  const [schedWeekOffset, setSchedWeekOffset] = useState(0);
  const schedWeekStart = getWeekStart(schedWeekOffset);
  const [draftShifts, setDraftShifts] = useState<Record<string, Record<number, string>>>({});

  // suppress unused warning — qc available for future invalidation patterns
  void qc;

  const { data: usersResult } = useQuery({
    queryKey: ["users-list"],
    queryFn: () => userService.getUsers(),
  });
  const users = usersResult?.data ?? [];

  const { data: attPage, refetch: refetchAtt } = useQuery({
    queryKey: ["all-attendance", attDate, attUserFilter],
    queryFn: () => attendanceService.getAll({
      date: attDate,
      userId: attUserFilter !== "all" ? attUserFilter : undefined,
    }),
  });

  const { data: leaveRequests = [], refetch: refetchLeaves } = useQuery({
    queryKey: ["all-leaves", leaveFilter],
    queryFn: () => leaveService.getAll({ status: leaveFilter === "all" ? undefined : leaveFilter }),
  });

  const { data: balances = [], refetch: refetchBalances } = useQuery({
    queryKey: ["all-balances"],
    queryFn: () => leaveService.getAllBalances(),
  });

  const { data: schedules = [], refetch: refetchSchedules } = useQuery({
    queryKey: ["all-schedules", schedWeekStart],
    queryFn: () => scheduleService.getAll({ weekStart: schedWeekStart }),
  });

  const correctMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof attendanceService.correct>[1] }) =>
      attendanceService.correct(id, data),
    onSuccess: () => { toast.success("Attendance updated"); setEditRow(null); refetchAtt(); },
    onError: (e: unknown) => toast.error((e as Error)?.message || "Update failed"),
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
    onSuccess: () => { toast.success("Schedule saved"); refetchSchedules(); },
    onError: (e: unknown) => toast.error((e as Error)?.message || "Save failed"),
  });

  const publishSched = useMutation({
    mutationFn: (id: string) => scheduleService.publish(id),
    onSuccess: () => { toast.success("Schedule published"); refetchSchedules(); },
    onError: (e: unknown) => toast.error((e as Error)?.message || "Publish failed"),
  });

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
    const base = attDate;
    correctMut.mutate({
      id: r.id,
      data: {
        clockIn:  editData.clockIn  ? `${base}T${editData.clockIn}:00.000Z`  : null,
        clockOut: editData.clockOut ? `${base}T${editData.clockOut}:00.000Z` : null,
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
      dayIndex: i,
      shiftType: getDraftOrSaved(userId, i, saved),
    }));
  }

  function cycleDayShift(userId: string, dayIndex: number, current: string) {
    const idx = SHIFT_CYCLE.indexOf(current as typeof SHIFT_CYCLE[number]);
    const next = SHIFT_CYCLE[(idx < 0 ? 0 : idx + 1) % SHIFT_CYCLE.length];
    setDraftShifts(prev => ({ ...prev, [userId]: { ...(prev[userId] ?? {}), [dayIndex]: next } }));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Clock className="h-5 w-5" />}
        title="HR Management"
        subtitle="Attendance, leave requests, and staff schedules"
      />

      <Tabs defaultValue="attendance">
        <TabsList>
          <TabsTrigger value="attendance" className="gap-1.5"><Clock className="h-3.5 w-3.5" />Attendance</TabsTrigger>
          <TabsTrigger value="leaves" className="gap-1.5"><FileText className="h-3.5 w-3.5" />Leave Requests</TabsTrigger>
          <TabsTrigger value="schedules" className="gap-1.5"><Calendar className="h-3.5 w-3.5" />Schedules</TabsTrigger>
        </TabsList>

        {/* ATTENDANCE TAB */}
        <TabsContent value="attendance" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={attDate} onChange={e => setAttDate(e.target.value)} className="mt-1 w-44" />
            </div>
            <div>
              <Label className="text-xs">Employee</Label>
              <Select value={attUserFilter} onValueChange={setAttUserFilter}>
                <SelectTrigger className="mt-1 w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
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
                    <TableHead>Employee</TableHead><TableHead>Clock In</TableHead><TableHead>Clock Out</TableHead>
                    <TableHead>Hours</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attRows.map(r => (
                    <>
                      <TableRow key={r.id} className="hover:bg-muted/30">
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
                          <TableCell colSpan={6} className="pt-0 pb-2 px-4">
                            <Input placeholder="Notes (optional)" value={editData.notes} onChange={e => setEditData(d => ({ ...d, notes: e.target.value }))} className="h-7" />
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                  {attRows.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No records for {attDate}</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* LEAVE REQUESTS TAB */}
        <TabsContent value="leaves" className="mt-4 space-y-4">
          <div className="flex gap-2">
            {["pending", "all"].map(f => (
              <Button key={f} size="sm" variant={leaveFilter === f ? "default" : "outline"} className="capitalize" onClick={() => setLeaveFilter(f)}>{f}</Button>
            ))}
          </div>

          <div className="space-y-2">
            {leaveRequests.map(r => (
              <Card key={r.id} className="shadow-sm">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{r.user?.name ?? "—"}</span>
                        <span className="text-xs text-muted-foreground">{r.user?.role}</span>
                        <Badge variant="secondary" className={cn("text-xs", LEAVE_TYPE_COLORS[r.leaveType])}>{r.leaveType}</Badge>
                        <Badge variant="secondary" className={cn("text-xs", LEAVE_STATUS_COLORS[r.status])}>{r.status}</Badge>
                      </div>
                      <p className="text-sm">{r.startDate} → {r.endDate} ({r.totalDays}d)</p>
                      <p className="text-xs text-muted-foreground">{r.reason}</p>
                    </div>
                    {r.status === "pending" && (
                      <div className="flex gap-1 shrink-0">
                        <Button size="sm" className="h-8 bg-success hover:bg-success/90 text-white gap-1"
                          onClick={() => reviewMut.mutate({ id: r.id, action: "approve" })} disabled={reviewMut.isPending}>
                          <Check className="h-3.5 w-3.5" />Approve
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 text-destructive border-destructive/30 gap-1"
                          onClick={() => setRejectId(r.id)}>
                          <X className="h-3.5 w-3.5" />Reject
                        </Button>
                      </div>
                    )}
                  </div>
                  {rejectId === r.id && (
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
                  )}
                </CardContent>
              </Card>
            ))}
            {leaveRequests.length === 0 && (
              <p className="text-center text-muted-foreground py-8">No {leaveFilter !== "all" ? leaveFilter : ""} leave requests</p>
            )}
          </div>

          <Card className="shadow-sm">
            <CardHeader><CardTitle className="text-sm">Leave Balances — {new Date().getFullYear()}</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-center">Annual</TableHead>
                    <TableHead className="text-center">Sick</TableHead>
                    <TableHead className="text-center">Casual</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {balances.map(b => (
                    <TableRow key={b.id} className="hover:bg-muted/30">
                      <TableCell>
                        <p className="text-sm font-medium">{b.user?.name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{b.user?.role}</p>
                      </TableCell>
                      {(["annual", "sick", "casual"] as const).map(type => (
                        <TableCell key={type} className="text-center text-sm">
                          {editBalance === b.id
                            ? <Input type="number" min="0" value={balanceEdit[type]} onChange={e => setBalanceEdit(d => ({ ...d, [type]: Number(e.target.value) }))} className="h-7 w-16 text-center" />
                            : <span>{b[`${type}Used` as keyof LeaveBalance] as number} / {b[type]}</span>}
                        </TableCell>
                      ))}
                      <TableCell>
                        {editBalance === b.id ? (
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-success"
                              onClick={() => updateBalanceMut.mutate({ userId: b.userId, data: balanceEdit })}>
                              <Save className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditBalance(null)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <Button size="icon" variant="ghost" className="h-7 w-7"
                            onClick={() => { setEditBalance(b.id); setBalanceEdit({ annual: b.annual, sick: b.sick, casual: b.casual }); }}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {balances.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No balances yet</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SCHEDULES TAB */}
        <TabsContent value="schedules" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button size="icon" variant="outline" onClick={() => setSchedWeekOffset(o => o - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="text-sm font-medium w-40 text-center">Week of {schedWeekStart}</span>
              <Button size="icon" variant="outline" onClick={() => setSchedWeekOffset(o => o + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <Button size="sm" variant="outline" onClick={() => setSchedWeekOffset(0)}>Current Week</Button>
          </div>

          <Card className="shadow-sm overflow-x-auto">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="w-44">Employee</TableHead>
                    {DAY_LABELS.map(d => <TableHead key={d} className="text-center text-xs w-24">{d}</TableHead>)}
                    <TableHead className="w-36"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.filter((u) => !["Rider", "Customer Screen"].includes(u.role)).map((u) => {
                    const saved = schedules.find(s => s.userId === u.id);
                    const isPublished = saved?.status === "published" && !draftShifts[u.id];
                    return (
                      <TableRow key={u.id} className="hover:bg-muted/20">
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {isPublished && <Lock className="h-3 w-3 text-muted-foreground" />}
                            <div>
                              <p className="text-sm font-medium">{u.name}</p>
                              <p className="text-xs text-muted-foreground">{u.role}</p>
                            </div>
                          </div>
                        </TableCell>
                        {DAY_LABELS.map((_, i) => {
                          const shiftType = getDraftOrSaved(u.id, i, saved);
                          return (
                            <TableCell key={i} className="text-center p-1">
                              <button
                                disabled={isPublished}
                                className={cn(
                                  "text-[10px] px-1.5 py-1 rounded font-medium transition-colors w-full",
                                  SHIFT_COLORS[shiftType],
                                  !isPublished && "cursor-pointer hover:opacity-80"
                                )}
                                onClick={() => cycleDayShift(u.id, i, shiftType)}
                              >
                                {shiftType}
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
                  {users.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No staff found</TableCell></TableRow>
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

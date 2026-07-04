import { useState, useMemo, Fragment } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { employeeService, type EmployeeRecord } from "@/services/employee.service";
import { attendanceService, type AttendanceRecord } from "@/services/attendance.service";
import { payrollService, type PayoutInput, type PaymentLogRecord } from "@/services/payroll.service";
import { penaltyService } from "@/services/penalty.service";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Coins, Search, Printer, CheckCircle, Clock, History, AlertTriangle, Eye, Calendar, Download, Flame, Users, ChevronDown, ChevronRight } from "lucide-react";
import { generatePayslipPDF } from "@/lib/generate-payslip-pdf";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { settingsService } from "@/services/settings.service";

// Build last 12 months as options [{id, label, start, end}]
// Use day=15 to avoid month-end rollover bugs (e.g. Jan 31 → setMonth(0) → Feb 3)
function getMonthOptions() {
  const opts: { id: string; label: string; start: string; end: string }[] = [];
  const date = new Date(new Date().getFullYear(), new Date().getMonth(), 15);
  for (let i = 0; i < 12; i++) {
    const y = date.getFullYear();
    const m = date.getMonth(); // 0-11
    const id = `${y}-${String(m + 1).padStart(2, "0")}`;
    const label = date.toLocaleString("default", { month: "long", year: "numeric" });
    const start = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const end = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    opts.push({ id, label, start, end });
    date.setMonth(date.getMonth() - 1);
  }
  return opts;
}

const MONTH_OPTIONS = getMonthOptions();

// Pure calendar-date string arithmetic (no UTC conversion, so no timezone-shift risk
// like `toISOString()` would introduce) — see CLAUDE.md's PKT timezone pattern note.
function addOneDay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const next = new Date(y, m - 1, d + 1);
  const yy = next.getFullYear();
  const mm = String(next.getMonth() + 1).padStart(2, "0");
  const dd = String(next.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// Server runs UTC; Pakistan is UTC+5 — see CLAUDE.md's PKT timezone pattern.
function getTodayPKT(): string {
  const pkt = new Date(Date.now() + 5 * 60 * 60 * 1000);
  return pkt.toISOString().split("T")[0];
}

interface EmployeePayrollRow {
  employee: EmployeeRecord;
  basePay: number;
  penalties: number;
  rewards: number;
  rewardNote: string;
  finalPay: number;
  hoursWorked: number;
  checkInCount: number;
  lateCount: number;
  absentCount: number;
  isPaid: boolean;
  periodStart: string;
  periodEnd: string;
  latestPaidThrough: string | null; // last date already covered by a payment this month, if any
  penaltyIds: string[]; // unpaid StaffPenalty ids (order-cancellation etc.) folded into `penalties`
}

interface EmployeeLedgerRow {
  employee: EmployeeRecord;
  logs: PaymentLogRecord[];      // sorted newest-first
  totalPaid: number;
  paymentCount: number;
  firstPaidAt: string | null;    // earliest log's paidAt, or null if never paid
}

const Payroll = () => {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  // Month picker — defaults to current month
  const [selectedMonthId, setSelectedMonthId] = useState(MONTH_OPTIONS[0].id);
  const selectedMonth = useMemo(
    () => MONTH_OPTIONS.find(o => o.id === selectedMonthId) ?? MONTH_OPTIONS[0],
    [selectedMonthId]
  );
  const startDate = selectedMonth.start;
  const endDate = selectedMonth.end;
  // For the current, still-in-progress month, calculations must not run past today —
  // otherwise "Mark Paid" on day 3 would silently claim day 4-31 as paid too, before
  // that work has even happened. Past months (endDate already elapsed) are unaffected.
  const today = getTodayPKT();
  const effectiveMonthEnd = endDate < today ? endDate : today;
  const isCurrentMonthInProgress = effectiveMonthEnd < endDate;

  const [search, setSearch] = useState("");
  const [rewardsState, setRewardsState] = useState<Record<string, { rewards: number; note: string }>>({});
  const [penaltiesState, setPenaltiesState] = useState<Record<string, number>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processingBatch, setProcessingBatch] = useState(false);
  const [activeTab, setActiveTab] = useState("calculate");
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);

  const [ledgerSearch, setLedgerSearch] = useState("");
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);

  const { data: allPaymentLogs = [], isLoading: loadingAllLogs } = useQuery({
    queryKey: ["payroll-all-logs"],
    queryFn: () => payrollService.getPaymentLogs(),
  });

  // Selected slip for printing/viewing
  const [selectedSlip, setSelectedSlip] = useState<EmployeePayrollRow | null>(null);
  const [selectedLogSlip, setSelectedLogSlip] = useState<PaymentLogRecord | null>(null);

  // Queries
  const { data: settings } = useQuery({
    queryKey: ["payroll-settings"],
    queryFn: () => settingsService.getSettings(),
  });

  const { data: employees = [], isLoading: loadingEmployees } = useQuery({
    queryKey: ["payroll-employees"],
    queryFn: () => employeeService.getAll({ limit: 100 }).then(r => r.data),
  });

  const { data: attendancePage, isLoading: loadingAttendance } = useQuery({
    queryKey: ["payroll-attendance", startDate, endDate],
    queryFn: () => attendanceService.getAll({ startDate, endDate }),
  });

  const { data: paymentLogs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ["payroll-logs", startDate, endDate],
    queryFn: () => payrollService.getPaymentLogs({ startDate, endDate }),
    // Loaded for both tabs: the "logs" tab displays it directly, and the "calculate"
    // tab needs it to know which employees are already paid for this exact period.
  });

  // Unpaid per-incident penalties (order-cancellation responsibility, etc.) for this
  // month — folded into the "absents × penaltyFee" default below, same as that.
  const { data: staffPenalties = [] } = useQuery({
    queryKey: ["payroll-penalties", startDate, effectiveMonthEnd],
    queryFn: () => penaltyService.list({ startDate, endDate: effectiveMonthEnd, unpaidOnly: true }),
  });

  const attendanceRecords = attendancePage?.data || [];

  // Group unpaid penalties by userId
  const penaltiesByUser = staffPenalties.reduce<Record<string, typeof staffPenalties>>((acc, p) => {
    if (!acc[p.userId]) acc[p.userId] = [];
    acc[p.userId].push(p);
    return acc;
  }, {});

  // Payment logs for this month, grouped per employee — used to find where each
  // employee's calculation should resume from (see periodStart below). A mid-month
  // payment (e.g. 04-01 to 04-20) is still returned by the "payroll-logs" query
  // (server-side filtered to startDate>=monthStart, endDate<=monthEnd), so it's
  // already scoped to this month without extra filtering here.
  const paymentLogsByEmployee = paymentLogs.reduce<Record<string, PaymentLogRecord[]>>((acc, log) => {
    if (!acc[log.employeeId]) acc[log.employeeId] = [];
    acc[log.employeeId].push(log);
    return acc;
  }, {});

  // Group attendance records by userId
  const attendanceByUser = attendanceRecords.reduce<Record<string, AttendanceRecord[]>>((acc, record) => {
    if (record.userId) {
      if (!acc[record.userId]) acc[record.userId] = [];
      acc[record.userId].push(record);
    }
    return acc;
  }, {});

  // Calculate payroll row for each employee
  const payrollRows: EmployeePayrollRow[] = employees
    .filter(emp => emp.status === "active") // only calculate for active employees
    .map(emp => {
      // Resume from the day after this employee's latest payment within the
      // selected month (if any) — supports paying mid-month (e.g. day 20) and
      // having the calculator automatically pick up the remaining days next time.
      const empLogsThisMonth = paymentLogsByEmployee[emp.id] || [];
      const latestPaidEndDate = empLogsThisMonth.length > 0
        ? empLogsThisMonth.reduce((max, l) => (l.endDate > max ? l.endDate : max), empLogsThisMonth[0].endDate)
        : null;
      const periodStart = latestPaidEndDate ? addOneDay(latestPaidEndDate) : startDate;
      const periodEnd = effectiveMonthEnd;
      const isPaid = periodStart > periodEnd; // nothing left to pay this month

      const userRecords = emp.userId
        ? (attendanceByUser[emp.userId] || []).filter(r => r.date >= periodStart && r.date <= periodEnd)
        : [];

      const checkInCount = userRecords.filter(r => r.status === "present" || r.status === "late").length;
      const lateCount = userRecords.filter(r => r.status === "late").length;
      const absentCount = userRecords.filter(r => r.status === "absent").length;

      // Hours worked calculation
      let hoursWorked = 0;
      userRecords.forEach(r => {
        if (r.clockIn && r.clockOut) {
          const diffMs = new Date(r.clockOut).getTime() - new Date(r.clockIn).getTime();
          hoursWorked += Math.max(0, diffMs / (1000 * 60 * 60));
        }
      });
      hoursWorked = parseFloat(hoursWorked.toFixed(2));

      // Base pay calculation
      let basePay = 0;
      const rate = emp.rate;
      if (isPaid) {
        basePay = 0;
      } else if (emp.rateType === "Hourly") {
        basePay = hoursWorked * rate;
      } else if (emp.rateType === "Monthly") {
        basePay = rate; // flat monthly rate
      } else if (emp.rateType === "Daily" || emp.rateType === "PerShift") {
        basePay = checkInCount * rate;
      }

      basePay = parseFloat(basePay.toFixed(2));

      // Automated penalties calculation (absent count * penalty fee) + any unpaid
      // per-incident penalties (order-cancellation responsibility, etc.) for this period
      const defaultPenaltyFee = emp.penaltyFee || 0;
      const userPenaltyRecords = emp.userId
        ? (penaltiesByUser[emp.userId] || []).filter(p => p.date >= periodStart && p.date <= periodEnd)
        : [];
      const incidentPenalty = userPenaltyRecords.reduce((s, p) => s + p.amount, 0);
      const calculatedPenalty = isPaid ? 0 : absentCount * defaultPenaltyFee + incidentPenalty;

      // Local states override
      const penaltyOverride = isPaid ? 0 : (penaltiesState[emp.id] !== undefined ? penaltiesState[emp.id] : calculatedPenalty);
      const rewardOverride = isPaid ? 0 : (rewardsState[emp.id]?.rewards || 0);
      const rewardNote = isPaid ? "" : (rewardsState[emp.id]?.note || "");

      // Final Pay: Base + Reward - Penalty
      const finalPay = Math.max(0, parseFloat((basePay + rewardOverride - penaltyOverride).toFixed(2)));

      return {
        employee: emp,
        basePay,
        penalties: penaltyOverride,
        rewards: rewardOverride,
        rewardNote,
        finalPay,
        hoursWorked,
        checkInCount,
        lateCount,
        absentCount,
        isPaid,
        periodStart,
        periodEnd,
        latestPaidThrough: latestPaidEndDate,
        penaltyIds: isPaid ? [] : userPenaltyRecords.map(p => p.id),
      };
    });

  // Employee Ledger: one row per active employee, grouping ALL payment logs
  // ever made (not scoped to the selected month) by employeeId.
  const ledgerRows: EmployeeLedgerRow[] = useMemo(() => {
    const logsByEmployee: Record<string, PaymentLogRecord[]> = {};
    for (const log of allPaymentLogs) {
      if (!logsByEmployee[log.employeeId]) logsByEmployee[log.employeeId] = [];
      logsByEmployee[log.employeeId].push(log);
    }
    return employees
      .filter(emp => emp.status === "active")
      .map(emp => {
        const logs = (logsByEmployee[emp.id] || [])
          .slice()
          .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());
        const totalPaid = logs.reduce((sum, l) => sum + l.finalPay, 0);
        const firstPaidAt = logs.length > 0
          ? logs.reduce((earliest, l) => (l.paidAt < earliest ? l.paidAt : earliest), logs[0].paidAt)
          : null;
        return { employee: emp, logs, totalPaid, paymentCount: logs.length, firstPaidAt };
      });
  }, [employees, allPaymentLogs]);

  const filteredLedgerRows = ledgerRows.filter(row => {
    const name = `${row.employee.firstName} ${row.employee.lastName || ""}`.toLowerCase();
    const designation = row.employee.designation.toLowerCase();
    const query = ledgerSearch.toLowerCase();
    return name.includes(query) || designation.includes(query);
  });

  // Filter rows based on search query
  const filteredRows = payrollRows.filter(row => {
    const name = `${row.employee.firstName} ${row.employee.lastName || ""}`.toLowerCase();
    const designation = row.employee.designation.toLowerCase();
    const query = search.toLowerCase();
    return name.includes(query) || designation.includes(query);
  });

  // Total Summary — only unpaid rows, since paid ones have already been disbursed
  const unpaidRows = filteredRows.filter(r => !r.isPaid);
  const totalBasePay = unpaidRows.reduce((acc, r) => acc + r.basePay, 0);
  const totalPenalties = unpaidRows.reduce((acc, r) => acc + r.penalties, 0);
  const totalRewards = unpaidRows.reduce((acc, r) => acc + r.rewards, 0);
  const totalFinalPay = unpaidRows.reduce((acc, r) => acc + r.finalPay, 0);

  // Rewards/Penalties Change Handlers
  const handleRewardChange = (empId: string, value: number) => {
    setRewardsState(prev => ({
      ...prev,
      [empId]: {
        rewards: value,
        note: prev[empId]?.note || "",
      },
    }));
  };

  const handleRewardNoteChange = (empId: string, value: string) => {
    setRewardsState(prev => ({
      ...prev,
      [empId]: {
        rewards: prev[empId]?.rewards || 0,
        note: value,
      },
    }));
  };

  const handlePenaltyChange = (empId: string, value: number) => {
    setPenaltiesState(prev => ({
      ...prev,
      [empId]: value,
    }));
  };

  // Mark Individual Paid
  const handleMarkPaid = async (row: EmployeePayrollRow) => {
    setProcessingId(row.employee.id);
    try {
      const payout: PayoutInput = {
        employeeId: row.employee.id,
        startDate: row.periodStart,
        endDate: row.periodEnd,
        basePay: row.basePay,
        penalties: row.penalties,
        rewards: row.rewards,
        finalPay: row.finalPay,
        notes: row.rewardNote || "Regular payout",
        rateType: row.employee.rateType,
        rate: row.employee.rate,
        unitsWorked: row.employee.rateType === "Hourly" ? row.hoursWorked
          : row.employee.rateType === "Monthly" ? undefined
          : row.checkInCount,
        absentDays: row.absentCount,
        penaltyIds: row.penaltyIds,
      };

      await payrollService.payIndividual(payout);
      toast.success(`Disbursed pay of Rs. ${row.finalPay} to ${row.employee.firstName}`);

      // Clear inputs for this employee
      setRewardsState(prev => {
        const copy = { ...prev };
        delete copy[row.employee.id];
        return copy;
      });
      setPenaltiesState(prev => {
        const copy = { ...prev };
        delete copy[row.employee.id];
        return copy;
      });

      queryClient.invalidateQueries({ queryKey: ["payroll-logs"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-all-logs"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-penalties"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to disburse payment");
    } finally {
      setProcessingId(null);
    }
  };

  // Mark Batch Paid — only unpaid rows; already-paid employees are skipped entirely
  const handleMarkBatchPaid = async () => {
    if (unpaidRows.length === 0) return;

    setProcessingBatch(true);
    try {
      const payouts: PayoutInput[] = unpaidRows.map(row => ({
        employeeId: row.employee.id,
        startDate: row.periodStart,
        endDate: row.periodEnd,
        basePay: row.basePay,
        penalties: row.penalties,
        rewards: row.rewards,
        finalPay: row.finalPay,
        notes: row.rewardNote || "Batch payroll payout",
        rateType: row.employee.rateType,
        rate: row.employee.rate,
        unitsWorked: row.employee.rateType === "Hourly" ? row.hoursWorked
          : row.employee.rateType === "Monthly" ? undefined
          : row.checkInCount,
        absentDays: row.absentCount,
        penaltyIds: row.penaltyIds,
      }));

      await payrollService.payBatch(payouts);
      toast.success(`Successfully disbursed batch payroll of Rs. ${totalFinalPay} to ${payouts.length} employees!`);

      // Reset input fields
      setRewardsState({});
      setPenaltiesState({});
      queryClient.invalidateQueries({ queryKey: ["payroll-logs"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-all-logs"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-penalties"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to disburse batch payments");
    } finally {
      setProcessingBatch(false);
    }
  };

  // Print single slip — if the employee is already fully paid through this month
  // (nothing left to calculate), show their real latest payment receipt instead of
  // a "calculated" preview for a period that no longer exists (periodStart would be
  // after periodEnd, since there's nothing left to pay).
  const handlePrintSlip = (row: EmployeePayrollRow) => {
    if (row.isPaid && row.latestPaidThrough) {
      const latestLog = (paymentLogsByEmployee[row.employee.id] || [])
        .find(l => l.endDate === row.latestPaidThrough);
      if (latestLog) {
        setSelectedLogSlip(latestLog);
        return;
      }
    }
    setSelectedSlip(row);
  };

  // Trigger browser print for the receipt panel
  const triggerPrint = (id: string) => {
    const printContent = document.getElementById(id);
    const winPrint = window.open('', '', 'left=0,top=0,width=800,height=900,toolbar=0,scrollbars=0,status=0');
    if (winPrint && printContent) {
      winPrint.document.write(`
        <html>
          <head>
            <title>Salary Pay Slip - Ovenisto</title>
            <style>
              body { font-family: sans-serif; padding: 40px; color: #333; line-height: 1.5; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #f3f4f6; padding-bottom: 20px; }
              .header h2 { margin: 0; color: #ea580c; }
              .header p { margin: 5px 0 0; color: #6b7280; font-size: 14px; }
              .meta-grid { display: grid; grid-cols-2; display: flex; justify-content: space-between; margin-bottom: 30px; font-size: 14px; }
              .meta-group { display: flex; flex-direction: column; }
              .meta-label { color: #9ca3af; font-size: 12px; text-transform: uppercase; }
              .meta-val { font-weight: bold; margin-top: 2px; }
              .table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              .table th { background: #f9fafb; text-align: left; padding: 10px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-transform: uppercase; }
              .table td { padding: 12px 10px; border-bottom: 1px solid #f3f4f6; font-size: 14px; }
              .total-row td { font-weight: bold; border-top: 2px solid #e5e7eb; font-size: 16px; color: #ea580c; }
              .footer { text-align: center; margin-top: 50px; font-size: 12px; color: #9ca3af; border-top: 1px solid #f3f4f6; padding-top: 20px; }
            </style>
          </head>
          <body>
            ${printContent.innerHTML}
            <script>
              window.onload = function() { window.print(); window.close(); }
            </script>
          </body>
        </html>
      `);
      winPrint.document.close();
      winPrint.focus();
    }
  };

  const loading = loadingEmployees || loadingAttendance;
  const initials = (e: EmployeeRecord) => `${e.firstName[0] ?? ""}${e.lastName?.[0] ?? ""}`.toUpperCase();

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Coins className="h-5 w-5" />}
        title="Payroll & Payments"
        subtitle="Manage payroll calculations, penalties, rewards, and slip distributions."
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-[560px]">
          <TabsTrigger value="calculate" className="flex items-center gap-1.5"><Calendar className="h-4 w-4" /> Calculate Pay</TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-1.5"><History className="h-4 w-4" /> Payment History</TabsTrigger>
          <TabsTrigger value="ledger" className="flex items-center gap-1.5"><Users className="h-4 w-4" /> Employee Ledger</TabsTrigger>
        </TabsList>

        {/* CALCULATE PAYROLL TAB */}
        <TabsContent value="calculate" className="space-y-6 mt-4">
          <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b">
              <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Payroll Calculator</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">{startDate} &rarr; {endDate}</p>
                </div>
                <div className="flex flex-wrap gap-3 items-center">
                  {/* Month Picker */}
                  <Select value={selectedMonthId} onValueChange={setSelectedMonthId}>
                    <SelectTrigger className="w-[200px] h-9 text-xs">
                      <SelectValue placeholder="Select month" />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTH_OPTIONS.map(opt => (
                        <SelectItem key={opt.id} value={opt.id} className="text-xs">{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="relative w-[180px] h-9">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee..." className="pl-8 h-9 text-xs" />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="space-y-3 p-6">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : filteredRows.length === 0 ? (
                <div className="text-center py-12">
                  <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" />
                  <p className="text-muted-foreground">No active employees found in the selected period.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Rate / Pay Info</TableHead>
                        <TableHead>Hours / Days</TableHead>
                        <TableHead>Base Pay</TableHead>
                        <TableHead>Penalties</TableHead>
                        <TableHead>Rewards</TableHead>
                        <TableHead>Reward Reason / Notes</TableHead>
                        <TableHead className="font-semibold text-primary">Final Pay</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRows.map(row => (
                        <TableRow key={row.employee.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2.5">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={row.employee.photoUrl ?? undefined} />
                                <AvatarFallback className="text-xs">{initials(row.employee)}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="text-xs font-semibold">{row.employee.firstName} {row.employee.lastName || ""}</p>
                                <p className="text-[10px] text-muted-foreground">{row.employee.designation}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-xs">
                              <span className="font-medium">Rs. {row.employee.rate}</span>
                              <Badge variant="outline" className="ml-1.5 text-[9px] px-1 py-0 h-4">{row.employee.rateType}</Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-xs space-y-0.5">
                              {row.employee.rateType === "Hourly" ? (
                                <p className="flex items-center gap-1"><Clock className="h-3 w-3 text-muted-foreground" /> {row.hoursWorked} hrs</p>
                              ) : (
                                <p className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-muted-foreground" /> {row.checkInCount} present</p>
                              )}
                              {row.absentCount > 0 && (
                                <span className="text-[10px] text-destructive font-medium">{row.absentCount} absents</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs font-medium">Rs. {row.basePay}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 max-w-[100px]">
                              <span className="text-xs text-muted-foreground">Rs.</span>
                              <Input
                                type="number"
                                value={row.penalties}
                                onChange={(e) => handlePenaltyChange(row.employee.id, Math.max(0, parseFloat(e.target.value) || 0))}
                                className="h-7 text-xs px-1"
                                disabled={row.isPaid}
                              />
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 max-w-[100px]">
                              <span className="text-xs text-muted-foreground">Rs.</span>
                              <Input
                                type="number"
                                value={row.rewards}
                                onChange={(e) => handleRewardChange(row.employee.id, Math.max(0, parseFloat(e.target.value) || 0))}
                                className="h-7 text-xs px-1 border-primary/20 bg-primary/[0.01]"
                                disabled={row.isPaid}
                              />
                            </div>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="text"
                              placeholder="Reason..."
                              value={row.rewardNote}
                              onChange={(e) => handleRewardNoteChange(row.employee.id, e.target.value)}
                              className="h-7 text-xs max-w-[150px]"
                              disabled={row.isPaid}
                            />
                          </TableCell>
                          <TableCell className="font-semibold text-xs text-primary">Rs. {row.finalPay}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-col items-end gap-1">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handlePrintSlip(row)} title="Preview / Print Slip">
                                  <Printer className="h-3.5 w-3.5" />
                                </Button>
                                {row.isPaid ? (
                                  <Badge className="h-7 px-2.5 bg-success/10 text-success border border-success/30 hover:bg-success/10 font-medium text-xs gap-1">
                                    <CheckCircle className="h-3 w-3" /> Paid
                                  </Badge>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs border-success text-success hover:bg-success/10 font-medium"
                                    onClick={() => handleMarkPaid(row)}
                                    disabled={processingId === row.employee.id}
                                  >
                                    {processingId === row.employee.id ? "Paying..." : "Mark Paid"}
                                  </Button>
                                )}
                              </div>
                              {row.latestPaidThrough && (
                                <p className="text-[9px] text-muted-foreground">
                                  Paid through {row.latestPaidThrough}
                                  {row.isPaid
                                    ? (row.periodStart <= endDate ? ` · Next: ${row.periodStart} → ${endDate}` : "")
                                    : ` · Now calculating: ${row.periodStart} → ${row.periodEnd}`}
                                </p>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* CALCULATOR SUMMARY & BULK DISBURSEMENT PANEL */}
          {filteredRows.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2 shadow-sm border-primary/10 bg-primary/[0.01]">
                <CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total Base Pay</p>
                    <p className="text-lg font-bold">Rs. {totalBasePay}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold text-destructive">Total Penalties</p>
                    <p className="text-lg font-bold text-destructive">Rs. {totalPenalties}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold text-success">Total Rewards</p>
                    <p className="text-lg font-bold text-success">Rs. {totalRewards}</p>
                  </div>
                  <div className="space-y-1 border-t md:border-t-0 md:border-l pt-3 md:pt-0">
                    <p className="text-xs text-primary uppercase tracking-wider font-semibold">Total Net Pay</p>
                    <p className="text-xl font-black text-primary">Rs. {totalFinalPay}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm flex flex-col justify-center p-4 space-y-3">
                <Button className="gradient-primary text-primary-foreground w-full font-bold flex items-center justify-center gap-1.5 h-10" onClick={() => setShowBatchConfirm(true)} disabled={processingBatch || unpaidRows.length === 0}>
                  <CheckCircle className="h-4 w-4" />
                  {processingBatch
                    ? "Processing Batch..."
                    : unpaidRows.length === 0
                      ? "All Paid for This Period"
                      : `Mark All ${unpaidRows.length} Paid`}
                </Button>
                <p className="text-[10px] text-muted-foreground text-center">
                  {unpaidRows.length === 0
                    ? `Every active employee is paid through ${effectiveMonthEnd}.`
                    : `Marking all paid will generate individual payment log records through ${effectiveMonthEnd}${isCurrentMonthInProgress ? " (today)" : ""}. Already-paid employees are skipped.`}
                </p>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* PAYMENT HISTORY LOGS TAB */}
        <TabsContent value="logs" className="space-y-6 mt-4">
          <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b">
              <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Payment History & Disbursement Logs</CardTitle>
                  <CardDescription>{selectedMonth.label} &nbsp;&bull;&nbsp; {startDate} → {endDate}</CardDescription>
                </div>
                <Select value={selectedMonthId} onValueChange={setSelectedMonthId}>
                  <SelectTrigger className="w-[200px] h-9 text-xs">
                    <SelectValue placeholder="Select month" />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_OPTIONS.map(opt => (
                      <SelectItem key={opt.id} value={opt.id} className="text-xs">{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingLogs ? (
                <div className="space-y-3 p-6">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : paymentLogs.length === 0 ? (
                <div className="text-center py-12">
                  <History className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" />
                  <p className="text-muted-foreground">No payment records found for the selected period.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead>Employee Name</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Base Pay</TableHead>
                        <TableHead className="text-destructive">Penalties</TableHead>
                        <TableHead className="text-success">Rewards</TableHead>
                        <TableHead className="font-semibold text-primary">Final Pay</TableHead>
                        <TableHead>Paid At</TableHead>
                        <TableHead>Paid By</TableHead>
                        <TableHead className="text-right">Receipt</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paymentLogs.map(log => (
                        <TableRow key={log.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="font-semibold text-xs">
                            {log.employee ? `${log.employee.firstName} ${log.employee.lastName || ""}` : "Unknown Employee"}
                            {log.employee && <p className="text-[10px] text-muted-foreground font-normal">{log.employee.designation}</p>}
                          </TableCell>
                          <TableCell className="text-xs">
                            <span className="text-muted-foreground">{log.startDate}</span> to <span className="text-muted-foreground">{log.endDate}</span>
                          </TableCell>
                          <TableCell className="text-xs">Rs. {log.basePay}</TableCell>
                          <TableCell className="text-xs text-destructive">Rs. {log.penalties}</TableCell>
                          <TableCell className="text-xs text-success">
                            Rs. {log.rewards}
                            {log.notes && <p className="text-[9px] text-muted-foreground italic font-normal">"{log.notes}"</p>}
                          </TableCell>
                          <TableCell className="text-xs font-semibold text-primary">Rs. {log.finalPay}</TableCell>
                          <TableCell className="text-xs">{new Date(log.paidAt).toLocaleDateString("en-PK")} {new Date(log.paidAt).toLocaleTimeString("en-PK", { hour: '2-digit', minute: '2-digit' })}</TableCell>
                          <TableCell className="text-xs font-medium text-muted-foreground">{log.paidBy?.name || "System"}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={() => setSelectedLogSlip(log)} title="View Pay Slip">
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
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

        <TabsContent value="ledger" className="space-y-6 mt-4">
          <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b">
              <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Employee Ledger</CardTitle>
                  <CardDescription>Lifetime payment history per employee</CardDescription>
                </div>
                <div className="relative w-full sm:w-[240px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Search employee..." value={ledgerSearch} onChange={(e) => setLedgerSearch(e.target.value)} className="pl-8 h-9 text-xs" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingAllLogs ? (
                <div className="space-y-3 p-6">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : filteredLedgerRows.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" />
                  <p className="text-muted-foreground">No employees match your search.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Current Rate</TableHead>
                        <TableHead>First Paid</TableHead>
                        <TableHead>Payments</TableHead>
                        <TableHead className="font-semibold text-primary">Total Paid</TableHead>
                        <TableHead className="text-right">Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLedgerRows.map(row => (
                        <Fragment key={row.employee.id}>
                          <TableRow className="hover:bg-muted/30 transition-colors">
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2.5">
                                <Avatar className="h-8 w-8">
                                  <AvatarImage src={row.employee.photoUrl ?? undefined} />
                                  <AvatarFallback className="text-xs">{initials(row.employee)}</AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="text-xs font-semibold">{row.employee.firstName} {row.employee.lastName || ""}</p>
                                  <p className="text-[10px] text-muted-foreground">{row.employee.designation}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs">
                              <span className="font-medium">Rs. {row.employee.rate}</span>
                              <Badge variant="outline" className="ml-1.5 text-[9px] px-1 py-0 h-4">{row.employee.rateType}</Badge>
                            </TableCell>
                            <TableCell className="text-xs">
                              {row.firstPaidAt
                                ? new Date(row.firstPaidAt).toLocaleDateString("en-PK")
                                : <span className="text-muted-foreground italic">Not paid yet</span>}
                            </TableCell>
                            <TableCell className="text-xs">{row.paymentCount}</TableCell>
                            <TableCell className="text-xs font-semibold text-primary">Rs. {row.totalPaid.toLocaleString()}</TableCell>
                            <TableCell className="text-right">
                              {row.logs.length > 0 && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => setExpandedEmployeeId(expandedEmployeeId === row.employee.id ? null : row.employee.id)}
                                  title="View payment records"
                                >
                                  {expandedEmployeeId === row.employee.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                          {expandedEmployeeId === row.employee.id && (
                            <TableRow className="bg-muted/20 hover:bg-muted/20">
                              <TableCell colSpan={6} className="p-0">
                                <div className="p-3 pl-14 space-y-1.5">
                                  {row.logs.map(log => (
                                    <div key={log.id} className="flex items-center justify-between text-xs border rounded-md px-3 py-1.5 bg-background gap-3">
                                      <span className="text-muted-foreground">{log.startDate} to {log.endDate}</span>
                                      <span className="font-semibold text-primary">Rs. {log.finalPay.toLocaleString()}</span>
                                      <span className="text-muted-foreground">{new Date(log.paidAt).toLocaleDateString("en-PK")}</span>
                                      <Button variant="ghost" size="icon" className="h-6 w-6 text-primary" onClick={() => setSelectedLogSlip(log)} title="View Receipt">
                                        <Eye className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* CALCULATED PAY SLIP PRINT VIEW DIALOG */}
      <Dialog open={!!selectedSlip} onOpenChange={(open) => !open && setSelectedSlip(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Salary Pay Slip (Calculated)</DialogTitle>
          </DialogHeader>
          
          <div id="calculated-slip-print" className="space-y-3 text-sm">
            <div className="text-center space-y-1">
              <Flame className="h-6 w-6 mx-auto text-primary" />
              <p className="font-bold text-primary">{settings?.restaurantName || "OVENISTO"}</p>
              <p className="text-xs text-muted-foreground">{settings?.address} — {settings?.phone}</p>
              <p className="text-xs font-semibold">Salary Pay Slip (Calculated)</p>
            </div>
            <Separator />
            <p className="text-xs">
              Employee: <strong>{selectedSlip?.employee.firstName} {selectedSlip?.employee.lastName || ""}</strong> | Role: <strong>{selectedSlip?.employee.designation}</strong>
            </p>
            <p className="text-xs">
              Period: <strong>{selectedSlip?.periodStart} to {selectedSlip?.periodEnd}</strong> | Rate: <strong>Rs. {selectedSlip?.employee.rate} ({selectedSlip?.employee.rateType})</strong>
            </p>
            <Table>
              <TableHeader><TableRow><TableHead className="text-xs">Description</TableHead><TableHead className="text-xs text-right">Amount</TableHead></TableRow></TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="text-xs">
                    {selectedSlip?.employee.rateType === "Hourly" ? `Base Pay (${selectedSlip?.hoursWorked} hours)`
                      : selectedSlip?.employee.rateType === "Monthly" ? "Base Pay (Monthly)"
                      : `Base Pay (${selectedSlip?.checkInCount} shifts)`}
                  </TableCell>
                  <TableCell className="text-xs text-right">Rs. {(selectedSlip?.basePay ?? 0).toLocaleString()}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-xs">Penalties (Absents: {selectedSlip?.absentCount})</TableCell>
                  <TableCell className="text-xs text-right text-destructive">-Rs. {(selectedSlip?.penalties ?? 0).toLocaleString()}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-xs">
                    Rewards / Bonuses
                    {selectedSlip?.rewardNote && <p className="text-[10px] text-muted-foreground italic">"{selectedSlip.rewardNote}"</p>}
                  </TableCell>
                  <TableCell className="text-xs text-right text-success">+Rs. {(selectedSlip?.rewards ?? 0).toLocaleString()}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <div className="space-y-1 text-xs">
              <Separator />
              <div className="flex justify-between font-bold text-base"><span>Total Net Pay</span><span className="text-primary">Rs. {(selectedSlip?.finalPay ?? 0).toLocaleString()}</span></div>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">Generated {new Date().toLocaleDateString("en-PK")} — not yet disbursed</p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedSlip(null)}>Close</Button>
            <Button variant="outline" onClick={() => selectedSlip && generatePayslipPDF({
              employeeName: `${selectedSlip.employee.firstName} ${selectedSlip.employee.lastName || ""}`.trim(),
              designation: selectedSlip.employee.designation,
              periodStart: selectedSlip.periodStart,
              periodEnd: selectedSlip.periodEnd,
              rateType: selectedSlip.employee.rateType,
              rate: selectedSlip.employee.rate,
              basePayLabel: selectedSlip.employee.rateType === "Hourly"
                ? `Base Pay (${selectedSlip.hoursWorked} hours)`
                : selectedSlip.employee.rateType === "Monthly"
                  ? "Base Pay (Monthly)"
                  : `Base Pay (${selectedSlip.checkInCount} shifts)`,
              basePay: selectedSlip.basePay,
              penaltiesLabel: `Penalties Deducted (Absents: ${selectedSlip.absentCount})`,
              penalties: selectedSlip.penalties,
              rewards: selectedSlip.rewards,
              rewardNote: selectedSlip.rewardNote || undefined,
              finalPay: selectedSlip.finalPay,
              isReceipt: false,
            })}>
              <Download className="h-4 w-4 mr-1.5" /> PDF
            </Button>
            <Button className="gradient-primary text-primary-foreground" onClick={() => triggerPrint("calculated-slip-print")}>
              <Printer className="h-4 w-4 mr-1.5" /> Print Slip
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DISBURSED PAYMENT LOG SLIP PRINT VIEW DIALOG */}
      <Dialog open={!!selectedLogSlip} onOpenChange={(open) => !open && setSelectedLogSlip(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Disbursement Pay Slip Receipt</DialogTitle>
          </DialogHeader>

          <div id="log-slip-print" className="space-y-3 text-sm">
            <div className="text-center space-y-1">
              <Flame className="h-6 w-6 mx-auto text-primary" />
              <p className="font-bold text-primary">{settings?.restaurantName || "OVENISTO"}</p>
              <p className="text-xs text-muted-foreground">{settings?.address} — {settings?.phone}</p>
              <p className="text-xs font-semibold">Salary Disbursement Receipt</p>
            </div>
            <Separator />
            <p className="text-xs">
              Employee: <strong>{selectedLogSlip?.employee ? `${selectedLogSlip.employee.firstName} ${selectedLogSlip.employee.lastName || ""}` : "Unknown"}</strong> | Role: <strong>{selectedLogSlip?.employee?.designation || "N/A"}</strong>
            </p>
            <p className="text-xs">
              Period: <strong>{selectedLogSlip?.startDate} to {selectedLogSlip?.endDate}</strong>
              {selectedLogSlip?.rateType && <> | Rate: <strong>Rs. {selectedLogSlip.rate} ({selectedLogSlip.rateType})</strong></>}
            </p>
            <p className="text-[10px] text-muted-foreground font-mono">Txn: {selectedLogSlip?.id}</p>
            <Table>
              <TableHeader><TableRow><TableHead className="text-xs">Description</TableHead><TableHead className="text-xs text-right">Amount</TableHead></TableRow></TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="text-xs">
                    {selectedLogSlip?.rateType === "Hourly" && selectedLogSlip.unitsWorked != null
                      ? `Base Pay (${selectedLogSlip.unitsWorked} hours)`
                      : (selectedLogSlip?.rateType === "Daily" || selectedLogSlip?.rateType === "PerShift") && selectedLogSlip.unitsWorked != null
                        ? `Base Pay (${selectedLogSlip.unitsWorked} shifts)`
                        : selectedLogSlip?.rateType === "Monthly"
                          ? "Base Pay (Monthly)"
                          : "Base Salary Pay"}
                  </TableCell>
                  <TableCell className="text-xs text-right">Rs. {(selectedLogSlip?.basePay ?? 0).toLocaleString()}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-xs">
                    Penalties Deducted{selectedLogSlip?.absentDays != null && ` (Absents: ${selectedLogSlip.absentDays})`}
                  </TableCell>
                  <TableCell className="text-xs text-right text-destructive">-Rs. {(selectedLogSlip?.penalties ?? 0).toLocaleString()}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-xs">
                    Rewards / Bonuses
                    {selectedLogSlip?.notes && <p className="text-[10px] text-muted-foreground italic">"{selectedLogSlip.notes}"</p>}
                  </TableCell>
                  <TableCell className="text-xs text-right text-success">+Rs. {(selectedLogSlip?.rewards ?? 0).toLocaleString()}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <div className="space-y-1 text-xs">
              <Separator />
              <div className="flex justify-between font-bold text-base"><span>Total Disbursed</span><span className="text-primary">Rs. {(selectedLogSlip?.finalPay ?? 0).toLocaleString()}</span></div>
            </div>
            <Separator />
            <p className="text-xs">
              Paid At: <strong>{selectedLogSlip ? new Date(selectedLogSlip.paidAt).toLocaleDateString("en-PK") : ""}</strong> | Authorized By: <strong>{selectedLogSlip?.paidBy?.name || "System"}</strong>
            </p>
            <p className="text-[10px] text-muted-foreground text-center">Verified Payment Transaction Receipt</p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedLogSlip(null)}>Close</Button>
            <Button variant="outline" onClick={() => {
              if (!selectedLogSlip) return;
              const emp = employees.find(e => e.id === selectedLogSlip.employeeId);
              const rateType = selectedLogSlip.rateType || emp?.rateType || "—";
              const rate = selectedLogSlip.rate ?? emp?.rate ?? 0;
              const units = selectedLogSlip.unitsWorked;
              const basePayLabel = rateType === "Hourly" && units != null
                ? `Base Pay (${units} hours)`
                : (rateType === "Daily" || rateType === "PerShift") && units != null
                  ? `Base Pay (${units} shifts)`
                  : rateType === "Monthly"
                    ? "Base Pay (Monthly)"
                    : "Base Salary Pay";
              const penaltiesLabel = selectedLogSlip.absentDays != null
                ? `Penalties Deducted (Absents: ${selectedLogSlip.absentDays})`
                : "Penalties Deducted";
              generatePayslipPDF({
                employeeName: selectedLogSlip.employee
                  ? `${selectedLogSlip.employee.firstName} ${selectedLogSlip.employee.lastName || ""}`.trim()
                  : "Unknown",
                designation: selectedLogSlip.employee?.designation || "N/A",
                periodStart: selectedLogSlip.startDate,
                periodEnd: selectedLogSlip.endDate,
                rateType,
                rate,
                basePayLabel,
                penaltiesLabel,
                basePay: Number(selectedLogSlip.basePay),
                penalties: Number(selectedLogSlip.penalties),
                rewards: Number(selectedLogSlip.rewards),
                rewardNote: selectedLogSlip.notes || undefined,
                finalPay: Number(selectedLogSlip.finalPay),
                isReceipt: true,
                transactionId: selectedLogSlip.id,
                paidAt: `${new Date(selectedLogSlip.paidAt).toLocaleDateString("en-PK")} ${new Date(selectedLogSlip.paidAt).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })}`,
                authorizedBy: selectedLogSlip.paidBy?.name || "System",
              });
            }}>
              <Download className="h-4 w-4 mr-1.5" /> PDF
            </Button>
            <Button className="gradient-primary text-primary-foreground" onClick={() => triggerPrint("log-slip-print")}>
              <Printer className="h-4 w-4 mr-1.5" /> Print Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showBatchConfirm} onOpenChange={setShowBatchConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark all {unpaidRows.length} employees as paid?</AlertDialogTitle>
            <AlertDialogDescription>
              This will generate individual payment log records covering each employee's remaining unpaid days in {selectedMonth.label}, totalling Rs. {totalFinalPay.toLocaleString()}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowBatchConfirm(false); handleMarkBatchPaid(); }}>
              Mark All Paid
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Payroll;

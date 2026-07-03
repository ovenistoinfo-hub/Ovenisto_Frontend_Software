# Employee Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third "Employee Ledger" tab to the Payroll page showing each employee's lifetime payment picture — total paid to date, first payment date, current rate, and their individual payment records — reusing existing data with no backend changes.

**Architecture:** `payrollService.getPaymentLogs()` (already defined) already returns *every* `PaymentLog` when called with no arguments — the existing backend controller only applies `startDate`/`endDate` filters when they're present. The new tab fetches this unfiltered list once, groups it by `employeeId` client-side (mirroring the exact grouping pattern the Calculate Pay tab already uses for its resume-from-last-payment logic), and renders one summary row per active employee with an expand-to-see-individual-records interaction that reuses the existing receipt dialog (`selectedLogSlip`) — no new dialog component.

**Tech Stack:** React + TS + Tailwind + shadcn/ui + TanStack Query, in the existing `Ovenisto_Frontend_Software/src/pages/Payroll.tsx`. No backend changes.

## Global Constraints

- "Since when they're receiving pay" = the date of the employee's **earliest `PaymentLog.paidAt`**, not `Employee.hireDate`.
- Employees with zero payment records still appear in the list, with "Not paid yet" shown instead of a date, `Rs. 0` total, `0` payments, and no expand control (nothing to expand).
- No new backend endpoint or service method — call the existing `payrollService.getPaymentLogs()` with no arguments.
- The new tab's search state (`ledgerSearch`) must be independent of the Calculate Pay tab's existing `search` state — switching tabs must not cross-filter.
- Reuse the existing `selectedLogSlip`/receipt dialog for viewing an individual payment's receipt from this tab — do not build a second receipt dialog.
- Match this file's existing conventions exactly: `Table`/`TableRow`/`TableCell` (shadcn), `Avatar`/`AvatarFallback` with the existing `initials()` helper, `Badge` for rate-type, `Skeleton` loading state, `Card`/`CardHeader`/`CardContent` shell — all already used by the sibling "Payment History" tab (`Payroll.tsx:637-715`).

---

### Task 1: Add the "Employee Ledger" tab

**Files:**
- Modify: `Ovenisto_Frontend_Software/src/pages/Payroll.tsx`

**Interfaces:**
- Consumes: `payrollService.getPaymentLogs()` (no args — existing method, `Ovenisto_Frontend_Software/src/services/payroll.service.ts:55-62`), `PaymentLogRecord`, `EmployeeRecord`, the existing `employees` query result, the existing `initials()` helper (`Payroll.tsx:413`), the existing `selectedLogSlip`/`setSelectedLogSlip` state and its receipt dialog (already rendered later in the same file for the Payment History tab's "View Pay Slip" button).
- Produces: no new exports — this task only adds a third tab to the existing `Payroll` component. `EmployeeLedgerRow` is a new local interface, not used outside this file.

- [ ] **Step 1: Add the new imports**

In `Payroll.tsx`, change the React import (line 1) from:

```ts
import { useState, useMemo } from "react";
```

to:

```ts
import { useState, useMemo, Fragment } from "react";
```

Change the lucide-react import (line 17) from:

```ts
import { Coins, Search, Printer, CheckCircle, Clock, History, AlertTriangle, Eye, Calendar, Download, Flame } from "lucide-react";
```

to:

```ts
import { Coins, Search, Printer, CheckCircle, Clock, History, AlertTriangle, Eye, Calendar, Download, Flame, Users, ChevronDown, ChevronRight } from "lucide-react";
```

- [ ] **Step 2: Add the ledger state and data query**

Add these three declarations right after `const [activeTab, setActiveTab] = useState("calculate");` (line 104):

```ts
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);

  const { data: allPaymentLogs = [], isLoading: loadingAllLogs } = useQuery({
    queryKey: ["payroll-all-logs"],
    queryFn: () => payrollService.getPaymentLogs(),
  });
```

- [ ] **Step 3: Add the `EmployeeLedgerRow` interface and computation**

Add this interface right after the existing `EmployeePayrollRow` interface closes (after line 78, before `const Payroll = () => {` on line 80):

```ts
interface EmployeeLedgerRow {
  employee: EmployeeRecord;
  logs: PaymentLogRecord[];      // sorted newest-first
  totalPaid: number;
  paymentCount: number;
  firstPaidAt: string | null;    // earliest log's paidAt, or null if never paid
}
```

Add this computation inside the `Payroll` component, right after the `payrollRows` computation closes (find the line `    });` that ends the `.map(emp => {...})` block feeding `payrollRows`, then add immediately after it, before the `// Filter rows based on search query` comment):

```ts
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
```

- [ ] **Step 4: Add the third tab trigger**

Change the `TabsList` block (lines 424-427) from:

```tsx
        <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
          <TabsTrigger value="calculate" className="flex items-center gap-1.5"><Calendar className="h-4 w-4" /> Calculate Pay</TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-1.5"><History className="h-4 w-4" /> Payment History</TabsTrigger>
        </TabsList>
```

to:

```tsx
        <TabsList className="grid w-full grid-cols-3 max-w-[560px]">
          <TabsTrigger value="calculate" className="flex items-center gap-1.5"><Calendar className="h-4 w-4" /> Calculate Pay</TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-1.5"><History className="h-4 w-4" /> Payment History</TabsTrigger>
          <TabsTrigger value="ledger" className="flex items-center gap-1.5"><Users className="h-4 w-4" /> Employee Ledger</TabsTrigger>
        </TabsList>
```

- [ ] **Step 5: Add the tab content**

Add this new `TabsContent` block right after the "logs" tab's `</TabsContent>` closes (after line 715, before the `</Tabs>` on line 716):

```tsx
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
```

- [ ] **Step 6: Verify the build**

Run:
```bash
cd Ovenisto_Frontend_Software
npm run build
```
Expected: exits 0, no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Payroll.tsx
git commit -m "feat(payroll): add Employee Ledger tab with lifetime payment history"
```

---

### Task 2: End-to-end verification

**Files:** none (verification only)

**Interfaces:** none — this task exercises Task 1's UI against live data.

- [ ] **Step 1: Build check**

```bash
cd Ovenisto_Frontend_Software
npm run build
```
Expected: exits 0.

- [ ] **Step 2: Live flow (Playwright or manual, dev servers running)**

1. Log in as Super Admin or Admin (Payroll is restricted to these two roles), navigate to `/payroll`.
2. Click the new "Employee Ledger" tab.
3. Confirm every active employee appears — including ones with zero payment history, showing "Not paid yet", `0` payments, `Rs. 0` total, and no expand chevron.
4. For an employee with at least one real payment (e.g., one paid earlier in this session's testing), confirm: First Paid shows their earliest payment's date, Payments count matches the real number of `PaymentLog` rows for them, Total Paid matches the sum of those rows' `finalPay`.
5. Click the expand chevron on that employee — confirm it shows their individual payment records (period, amount, paid-at date) sorted newest-first.
6. Click the "View Receipt" (eye) icon on one of the expanded records — confirm it opens the same receipt dialog already used by the Payment History tab, showing the correct period/amount/rate-type detail for that specific payment.
7. Type into the ledger's search box — confirm it filters by name/designation, and confirm switching to the Calculate Pay tab still shows its own `search` box empty (the two search states don't cross-contaminate).
8. Confirm the Calculate Pay and Payment History tabs still work exactly as before (no regression from adding the third tab / `grid-cols-3` change).

- [ ] **Step 3: Update the progress ledger**

Note completion in this session's working notes — no formal `.superpowers/sdd/progress.md` ledger is required for a 2-task plan this size (per the subagent-driven-development skill, ledger tracking exists to survive compaction across many tasks; a 2-task plan completed in one continuous pass doesn't need it, but if execution spans a compaction boundary, create `Ovenisto_Frontend_Software/.superpowers/sdd/progress.md` and record what's done before continuing).

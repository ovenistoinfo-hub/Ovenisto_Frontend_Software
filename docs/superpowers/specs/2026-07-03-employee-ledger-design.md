# Employee Ledger (Payroll) — Design

**Date:** 2026-07-03
**Status:** Approved for planning

## Background

Ovenisto's Payroll page (`src/pages/Payroll.tsx`) currently has two tabs:
- **Calculate Pay** — the current-month payroll calculator with per-employee resume-from-last-payment logic (built earlier this session).
- **Payment History** — a per-month list of `PaymentLog` disbursements for whichever month is selected.

There is no way to see a single employee's *lifetime* payment picture — how much they've been paid in total, since when, and how many payments they've received — without manually paging through every month. The user wants a per-employee view: total paid to date, since-when, current rate, and their individual payment records.

## Scope decisions (confirmed with user)

- **"Since when they're receiving pay"** = the date of their **earliest `PaymentLog`** record (not `Employee.hireDate`, which may predate when payroll tracking started for them, or not reflect actual payment history at all).
- **Placement**: a new **third tab**, "Employee Ledger", alongside the existing "Calculate Pay" and "Payment History" tabs — not a filter bolted onto the existing Payment History tab.
- **Employees with zero payments still appear** in the list, showing "Not paid yet" — this is a full roster view, not a filtered payment list.
- **No backend changes needed.** `GET /api/payroll/logs` already supports being called with no `startDate`/`endDate` (the existing controller only applies those filters `if (startDate)`/`if (endDate)` — omitting both returns every `PaymentLog` row). The frontend adds one new service method that calls the same endpoint with no params.

## Data model (no schema changes)

Reuses `PaymentLogRecord` (already defined in `payroll.service.ts`) and `EmployeeRecord` (already defined in `employee.service.ts`) exactly as-is.

## Frontend changes (`Ovenisto_Frontend_Software/src/pages/Payroll.tsx`, `src/services/payroll.service.ts`)

### `payroll.service.ts`

Add one method, mirroring `getPaymentLogs`'s existing shape:

```ts
async getAllPaymentLogs(): Promise<PaymentLogRecord[]> {
  const res = await api.get<{ success: boolean; data: PaymentLogRecord[] }>('/payroll/logs');
  return res.data;
},
```

### `Payroll.tsx`

- Add a third `TabsTrigger`/`TabsContent`: **"Employee Ledger"** (icon: `Users` or similar, matching the existing `Calendar`/`History` icon pattern on the other two tabs).
- New query: `useQuery({ queryKey: ["payroll-all-logs"], queryFn: () => payrollService.getAllPaymentLogs() })` — fetched once, independent of the month selector (this tab has no month picker).
- New `useMemo` computing one summary row per active employee:
  ```ts
  interface EmployeeLedgerRow {
    employee: EmployeeRecord;
    logs: PaymentLogRecord[];       // sorted newest-first
    totalPaid: number;              // sum of finalPay across all logs
    paymentCount: number;
    firstPaidAt: string | null;     // earliest log's paidAt, or null if logs.length === 0
  }
  ```
  Computed by grouping `allPaymentLogs` by `employeeId` (same `.reduce` pattern already used for `paymentLogsByEmployee` in the Calculate Pay tab), then mapping every active employee to a row (employees with no matching logs get `logs: [], totalPaid: 0, paymentCount: 0, firstPaidAt: null`).
- **Search box** at the top of the tab, same pattern/styling as the existing `search` input on the Calculate Pay tab, filtering rows by employee name/designation (a separate local state, e.g. `ledgerSearch`, independent of the Calculate Pay tab's `search` so switching tabs doesn't cross-filter).
- **Table columns**: Employee (avatar/name/designation, same cell style as other tabs), Current Rate (`Rs. {employee.rate} {employee.rateType}`), First Paid (`row.firstPaidAt ? formatted date : "Not paid yet"`), Payments (count), Total Paid (`Rs. {row.totalPaid.toLocaleString()}`, bold/primary color matching the "Final Pay"/"Total Disbursed" styling convention elsewhere on this page), Expand chevron.
- **Row expansion**: clicking a row (or its chevron) toggles a local `expandedEmployeeId` state; when expanded, render an inline sub-table directly below that row (within the same `<TableRow>`'s sibling, or a nested `<TableRow>` spanning all columns) listing `row.logs` — each with Period (`startDate to endDate`), Amount (`finalPay`), Paid At (`paidAt`, formatted), and a "View Receipt" icon button reusing the **existing** `setSelectedLogSlip(log)` call and the **existing** receipt dialog (`log-slip-print`) already built for the Payment History tab — no new dialog component.
- Employees with `logs.length === 0` show no expand chevron (nothing to expand) and their row simply reads "Not paid yet" in the First Paid column, `Rs. 0` total, `0` payments.

## Out of scope (v1)

- No new backend endpoint/aggregation — pure client-side grouping of the existing full log list.
- No date-range filtering within the Employee Ledger tab itself (it's inherently all-time); the existing Payment History tab remains the place for per-month browsing.
- No CSV/export of the ledger.
- No pagination — acceptable at current data scale (a single-outlet restaurant's employee count and payment-log volume); revisit if this becomes a real performance concern later.

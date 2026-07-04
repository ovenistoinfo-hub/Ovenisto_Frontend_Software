# Order Cancellation — Approval Workflow + Responsible-Person Penalty (v2)

**Date:** 2026-07-04
**Status:** Approved for planning (clarifications confirmed with user)
**Supersedes parts of:** `2026-07-01-order-cancellation-design.md` (the manager-PIN gate)

## Background — what exists today

The v1 cancellation flow (built & live) is a **synchronous manager-PIN** gate:
`POST /api/orders/:id/cancel` (`order.controller.ts:532` `cancelOrder`) takes
`authorizedById` + `managerPin`, bcrypt-compares against `User.pinHash`, and — if valid —
cancels the order **immediately** in one `$transaction` (item/full cancel, totals recompute,
`WasteRecord` for consumed stock, `OrderModificationLog`). The POS UI is the Cancel branch of
the Modify/Cancel dialog (`POS.tsx:2680-2860`, popup — allowed for POS forms).

Penalty today is **derived, not stored per-incident**: `Employee.penaltyFee × absentCount`,
shown as the "Penalty" stat in My Portal (`EmployeePortal.tsx:323`) and deducted in Payroll
(`Payroll.tsx:220-235`, persisted to `PaymentLog.penalties`). There is **no table of
individual penalty events.**

## Confirmed decisions (this iteration)

1. **Replace the PIN with an async request→approval workflow.** The initiator (cashier/waiter/
   floor staff) fills a cancellation request (order + items + reason + responsible person +
   penalty + refund) and picks an **approver** (a manager/admin). The order is **NOT** cancelled
   on submit — it stays untouched. The request lands in the approver's **Cancellation Requests
   inbox** (their own login). Only on **Approve** does the actual cancellation run. Reject leaves
   the order as-is. Mirror the existing `LeaveRequest` request→`reviewLeaveRequest` pattern.
2. **Responsible person + penalty.** The request names a **responsible staff member** (any staff
   of that outlet) and a **penalty amount** typed by the initiator; the approver can **adjust**
   the responsible person and/or amount before approving. On approval a per-incident
   **`StaffPenalty`** row is written for that user.
3. **Penalty is visible in My Portal AND deducted in Payroll** — same treatment as the current
   absence penalty (added on top of it, not replacing it).
4. **Reason dropdown** gains three options: **Missing Item**, **Wrong Item**, **Packing Error**.
5. **Approver inbox = a dedicated page** `/cancellation-requests` (sidebar, role-gated to the
   cancel-authorizer roles), with a live pending-count badge. (Chosen over a POS tab so it works
   cross-device and keeps POS uncluttered.)

## Data model (`prisma/schema.prisma`, then `npm run db:push`)

```prisma
model OrderCancellationRequest {
  id                String    @id @default(cuid())
  orderId           String
  outletId          String?
  itemIds           String[]                       // empty = full-order cancel
  reason            String    @db.VarChar(255)
  refundAmount      Decimal   @db.Decimal(10, 2)
  refundMethod      String    @db.VarChar(20)      // cash | card | online | none
  newSubtotal       Decimal?  @db.Decimal(10, 2)   // partial-cancel recomputed totals
  newTax            Decimal?  @db.Decimal(10, 2)
  newTotal          Decimal?  @db.Decimal(10, 2)
  requestedById     String
  approverId        String                         // chosen manager/admin (informational routing)
  responsibleUserId String?                        // staff to be penalised
  penaltyAmount     Decimal   @default(0) @db.Decimal(10, 2)
  status            String    @default("pending") @db.VarChar(20) // pending | approved | rejected
  reviewedById      String?
  reviewNote        String?   @db.VarChar(255)
  reviewedAt        DateTime?
  createdAt         DateTime  @default(now())

  order           Order  @relation(fields: [orderId], references: [id], onDelete: Cascade)
  requestedBy     User   @relation("CancelReqRequestedBy", fields: [requestedById], references: [id])
  approver        User   @relation("CancelReqApprover", fields: [approverId], references: [id])
  responsibleUser User?  @relation("CancelReqResponsible", fields: [responsibleUserId], references: [id])
  reviewedBy      User?  @relation("CancelReqReviewedBy", fields: [reviewedById], references: [id])

  @@index([outletId, status])
  @@index([approverId, status])
}

model StaffPenalty {
  id         String   @id @default(cuid())
  userId     String                                // login account penalised (My Portal keys on this)
  outletId   String?
  amount     Decimal  @db.Decimal(10, 2)
  reason     String   @db.VarChar(255)             // e.g. "Order ORD-123 cancelled — Missing Item"
  type       String   @default("order_cancellation") @db.VarChar(30)
  date       String   @db.VarChar(10)              // "YYYY-MM-DD" (PKT) — drives payroll period inclusion
  orderId    String?
  requestId  String?                               // OrderCancellationRequest.id
  paymentLogId String?                             // stamped when paid, so payroll never double-counts
  createdAt  DateTime @default(now())

  user User    @relation("StaffPenaltyUser", fields: [userId], references: [id])
  order Order? @relation(fields: [orderId], references: [id], onDelete: SetNull)

  @@index([userId, paymentLogId])
  @@index([outletId])
}
```

Add the reciprocal relation arrays on `User` (`cancelReqRequested`, `cancelReqToApprove`,
`cancelReqResponsible`, `cancelReqReviewed`, `staffPenalties`) and on `Order`
(`cancellationRequests`, `staffPenalties`). Keep `User.pinHash` (dormant — dropping it needs a
destructive migration; not worth it). Postgres `String[]` is already used elsewhere, so
`itemIds String[]` is fine.

## Backend

New module `src/modules/cancellation-requests/` (`*.controller.ts` + `*.routes.ts`), mounted in
`routes/index.ts`. **Refactor first:** extract the existing `cancelOrder` `$transaction` body
(`order.controller.ts:588-741`) into an exported helper
`executeCancellation(tx, { order, itemIds, reason, refund*, newTotals, actingUserName, authorizedById })`
so both the (now-deprecated) direct path and the new approval path share one implementation.

Endpoints:

| Method | Path | Auth (route) | Purpose |
|--------|------|--------------|---------|
| POST | `/api/orders/:id/cancellation-requests` | `kitchenRoles`+`posRoles` initiators | Create a `pending` request. Validates order is `PENDING`/`PREPARING`/`READY`, computes/accepts totals & refund exactly as v1. **Does not** cancel. Emits `cancellationRequest:created`. |
| GET | `/api/cancellation-requests` | authorizer roles | List (outlet-scoped via `resolveOutletScope`; filter `?status=pending`). Include order summary, requester/responsible names. |
| GET | `/api/cancellation-requests/mine` | any authed | Requester's own submitted requests + their status (for a "your request was approved/rejected" view). |
| PATCH | `/api/cancellation-requests/:id/review` | authorizer roles | Body `{ action: 'approve'\|'reject', penaltyAmount?, responsibleUserId?, note? }`. |

`review` (approve) — one `$transaction`:
1. Load request (404 if missing / out of scope); reject if not `pending`.
2. Re-load the order; re-assert state guard (still `PENDING`/`PREPARING`/`READY`, else 400 —
   it may have completed since the request was filed).
3. Call `executeCancellation(...)` with `authorizedById = req.user.id` (the reviewer).
4. If final `penaltyAmount > 0` and `responsibleUserId` set → create `StaffPenalty`
   (`userId = responsibleUserId`, `amount`, `reason = "Order <num> cancelled — <reason>"`,
   `type = 'order_cancellation'`, `date` = PKT today via the `Date.now()+5h` pattern,
   `orderId`, `requestId`, `outletId`).
5. Update request → `status='approved'`, `reviewedById`, `reviewedAt`, plus any adjusted
   `penaltyAmount`/`responsibleUserId`.
6. Emit `order:updated` + `cancellationRequest:updated`.

`review` (reject): set `status='rejected'`, `reviewNote`, `reviewedById`, `reviewedAt`; order
untouched; emit `cancellationRequest:updated`. No penalty, no waste.

**Convenience:** if the requester's own role is an authorizer role, the create endpoint MAY accept
`autoApprove: true` and run the approval transaction inline (managers/admins shouldn't have to
approve their own request from another screen). Keep it opt-in so the default stays request→review.

New penalty read endpoints (module `src/modules/penalties/`, or fold into `employees`):
| GET | `/api/penalties/mine` | any authed | This user's `StaffPenalty` rows (My Portal). |
| GET | `/api/penalties?employeeId=&unpaidOnly=1` | payroll roles | For Payroll calc; resolve `Employee.userId → StaffPenalty`. |

**Gotchas for the dev:**
- **Role string mismatch (real bug risk):** `CANCEL_AUTHORIZER_ROLES` at
  `order.controller.ts:530` is `['SUPER_ADMIN',...]` but `authorize()`/`order.routes.ts` use
  `'Super Admin'`. Confirm what `User.role` actually holds and use ONE consistent representation
  for the approver dropdown, the route `authorize([...])`, and any in-controller role check.
- Every new route needs `authenticate` or `resolveOutletScope` silently returns `null`
  (cross-outlet leak — bitten twice in the outlet-scoping rollout).
- All `Decimal` → `Number()` in response mappers.
- New requests/penalties are **outlet-scoped**: stamp `outletId` via `resolveCreateOutlet`,
  filter lists via `resolveOutletScope`.

## Frontend

- **`order.service.ts`**: drop `managerPin`/`authorizedById` from the cancel path; add
  `createCancellationRequest(orderId, payload)`. New `cancellationRequest.service.ts`
  (`list`, `listMine`, `review`) and `penalty.service.ts` (`getMine`, `list`). Extract `res.data`
  **once** (never `res.data.data`).
- **`POS.tsx` cancel dialog** (`2694-2787`): remove the "Authorized By" + "Manager PIN" fields;
  add **Responsible Person** (outlet-staff dropdown), **Penalty Amount** (numeric input, PKR),
  and **Approver** (authorizer-role dropdown, outlet-scoped). Submit button → "Send for Approval"
  calling `createCancellationRequest`; toast "Cancellation request sent for approval." Add the 3
  reason options at `2723-2730`: `Missing Item`, `Wrong Item`, `Packing Error`.
- **New page `CancellationRequests.tsx`** at `/cancellation-requests` (lazy route in `App.tsx`,
  nav in `AppSidebar.tsx`, breadcrumb in `AppHeader.tsx`), gated to authorizer roles in
  `AuthContext` `rolePermissions`. Lists pending requests (order details, items, reason,
  requestedBy, responsible person + **editable** penalty amount, refund). Approve / Reject(+note)
  buttons → `review`. React-query with a short poll or socket subscription; a **badge** on the
  nav item shows the pending count. Model the review UX on the leave-request approve/reject cards
  in `Attendance.tsx`.
- **`EmployeePortal.tsx`** (My Portal): fetch `penalty.service.getMine()`; add each row's amount
  into the "Penalty" stat total (`323`) and render a small **Penalties** list/section (date,
  order #, reason, amount) alongside Attendance. So order-cancel penalties surface exactly like
  the absence penalty.
- **`Payroll.tsx`**: when computing a period's penalty for an employee (`~220`), add the sum of
  that employee's **unpaid** `StaffPenalty` rows whose `date` falls in the pay period to
  `calculatedPenalty`. On disbursement, stamp those rows' `paymentLogId` (server-side, inside the
  create-payment transaction) so a later run never double-counts them — mirror the existing
  `latestPaidThrough` idea.

## Out of scope
- Migrating the existing absence penalty into `StaffPenalty` (leave derived as-is; just add on top).
- Payment-gateway refunds (still a manual cash/card note).
- Cancelling `COMPLETED` orders (still final, no exceptions).
- Removing `User.pinHash` / the self-service PIN endpoint (leave dormant).

## Definition of Done
- [ ] `npm run typecheck` + `npm run build` green (backend & frontend).
- [ ] Non-manager can only *request*; order stays live until an approver approves.
- [ ] Approver sees the request in `/cancellation-requests`, can edit penalty/responsible, approve → order cancels (items/full, totals, waste, audit log all correct) or reject → order untouched.
- [ ] Approved penalty appears in the responsible user's My Portal "Penalty" total + list.
- [ ] Same penalty is deducted in that employee's next Payroll run and not double-counted after payment.
- [ ] Reason dropdown shows Missing Item / Wrong Item / Packing Error.
- [ ] Outlet scoping holds (branch A can't see/approve branch B's requests).
- [ ] No console errors; works at 768px (tablet).

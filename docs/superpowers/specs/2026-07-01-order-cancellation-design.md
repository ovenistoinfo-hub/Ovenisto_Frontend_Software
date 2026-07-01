# Order Cancellation — Design

**Date:** 2026-07-01
**Status:** Approved for planning

## Background

Investigation of the current cancellation flow (`PUT /api/orders/:id/status` with
`status: "cancelled"` — the same generic endpoint used for every other order-status
transition) found:

- Cancellation is whole-order only; no item-level cancel exists (`OrderItem` has no
  `status` column).
- No state guard: an order already `COMPLETED` can still be cancelled.
- The frontend cancellation dialog (`POS.tsx:2614-2725`) collects a reason but never
  sends it to the backend — nothing is persisted (`OrderModificationLog` exists in the
  schema but nothing ever writes to it for cancellations).
- No manager authorization step, no refund tracking.
- Stock is deducted only when an order reaches `COMPLETED`
  (`order.controller.ts:352`) — never at creation, `PREPARING`, or `READY` — so a
  cancelled order (which can only be cancelled pre-`COMPLETED` per the design below)
  never has stock to reverse *under the current deduction timing*. However, that
  timing is itself inaccurate: ingredients are physically consumed the moment the
  kitchen starts cooking (`PREPARING`), not when the order is later marked complete.
  During busy service this means `Ingredient.currentStock` overstates what's actually
  left in the kitchen for any order sitting in `PREPARING`/`READY`.
- Shift cash totals (`Shift.expectedCash`) are not a running ledger — `POS.tsx:463-475`
  recomputes them at shift-close time from whichever orders are currently
  non-cancelled, summing `Order.total`. This self-corrects automatically once an
  order's status/total reflects the cancellation — no separate ledger write is needed.

## Scope decisions (confirmed with user)

- **Reference model**: build toward the demo POS's Cancel Order modal (per-item cancel
  buttons, reason dropdown, manager PIN, refund amount/method, print slip), adapted to
  Ovenisto's conventions (inline Card, PKR, existing 8-option reason list which is
  already richer than the demo's 5).
- **Item-level cancel**: add `OrderItem.status` (`active` | `cancelled`). Cancelled
  items stay on the order, shown struck-through, for a full audit trail; the order's
  `subtotal`/`tax`/`total` are recalculated to exclude cancelled items.
- **State guard**: cancellation (full or item-level) is only allowed from `PENDING`,
  `PREPARING`, or `READY`. Once an order is `COMPLETED`, it is final — no cancellation,
  no reversal, no exceptions.
- **Manager authorization**: new hashed 4-digit PIN, settable on their own profile, for
  the roles that already have POS/order-status access per the project's role table
  (`Super Admin`, `Admin`, `Manager`, `Floor Manager`) — `User.pinHash`. The cancel
  dialog requires selecting the authorizing manager from a dropdown (scoped to those
  roles) and entering their PIN, verified server-side via bcrypt compare.
- **Refund handling**: refund amount/method is recorded on the audit log
  (`OrderModificationLog`) for reporting. It does not write to any separate ledger —
  because `Shift.expectedCash` is recomputed from live order data at close time (see
  Background), keeping `Order.total` accurate on cancel is sufficient for the shift to
  reconcile correctly automatically.
- **Stock timing fix (in scope)**: move the stock-deduction trigger from `COMPLETED` to
  the order's first entry into the post-`PENDING` pipeline (`PREPARING`, `READY`, or
  `COMPLETED` — whichever it reaches first), so inventory reflects consumption as soon
  as the kitchen actually starts cooking, not after the fact.
- **Waste-on-cancel (in scope)**: because stock is now deducted at `PREPARING`,
  cancelling an order that has already passed `PENDING` means its ingredients were
  physically used and cannot be "put back." Instead of reversing stock, the
  cancellation writes `WasteRecord` entries for the consumed ingredients/production
  items of the cancelled line(s) — a loss-accounting entry, not a stock mutation. An
  order still in `PENDING` when cancelled needs no stock/waste action at all, since
  nothing was ever deducted for it.
- **Out of scope**: reversing/restoring stock (never needed under this design — see
  above), any change to the generic `PUT /orders/:id/status` endpoint's other
  transitions, print/receipt infrastructure changes (the existing receipt-print
  component is reused as-is), and refund integration with any payment gateway (this app
  has no online payment gateway — refund is a manual cash/card reconciliation note).

## Data model changes

`Ovenisto-backend/prisma/schema.prisma`:

```prisma
model User {
  // ...existing fields...
  pinHash String? @db.VarChar(255) // bcrypt hash of a 4-digit PIN; Super Admin/Admin/Manager/Floor Manager only

  // ...existing relations...
  orderCancelAuthorizations OrderModificationLog[] @relation("OrderCancelAuthorizedBy")
}

model OrderItem {
  // ...existing fields...
  status String @default("active") @db.VarChar(20) // active | cancelled
}

model OrderModificationLog {
  // ...existing fields (id, orderId, action, detail, staff, timestamp)...
  refundAmount   Decimal? @db.Decimal(10, 2)
  refundMethod   String?  @db.VarChar(20) // cash | card | online | none
  authorizedById String?

  // ...existing relation...
  authorizedBy User? @relation("OrderCancelAuthorizedBy", fields: [authorizedById], references: [id])
}

model WasteRecord {
  // ...existing fields (id, itemName, quantity, unit, reason, cost, recordedBy, outletId, purchaseId, date)...
  orderId String?

  // ...existing relations...
  order Order? @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([orderId])
}

model Order {
  // ...existing relations...
  wasteRecords WasteRecord[]
}
```

`action` on `OrderModificationLog` is set to `"order_cancelled"` or `"item_cancelled"`;
the existing `detail` field carries the reason text and `staff` carries the acting
user's name — no new columns needed for those.

Existing `OrderStatus` enum, `OrderType`, and every other model are untouched.

## Backend changes (`Ovenisto-backend/src/modules/order/`)

### 1. Stock-deduction timing (`order.controller.ts`, `updateOrderStatus`)

Replace the current gate:

```ts
if (prismaStatus === 'COMPLETED' && existing.status !== 'COMPLETED') { /* deduct */ }
```

with an idempotent "first entry into the pipeline" gate:

```ts
const CONSUMED_STATES = ['PREPARING', 'READY', 'COMPLETED'];
const alreadyConsumed = CONSUMED_STATES.includes(existing.status);
const enteringConsumedState = CONSUMED_STATES.includes(prismaStatus);
if (enteringConsumedState && !alreadyConsumed) { /* deduct — same body as today */ }
```

This fires exactly once per order, on whichever transition first reaches `PREPARING`,
`READY`, or `COMPLETED` (covering flows that skip straight to `READY`). The deduction
body itself (ingredient/warehouse/FIFO batch/production-item logic) is unchanged —
only the trigger condition moves.

### 2. New endpoint: `POST /api/orders/:id/cancel`

Added to `order.routes.ts` alongside the existing status-update route, same
`kitchenRoles` authorization list (route-level RBAC is unchanged; the manager-PIN check
below is the actual authorization gate for the cancel action itself).

**Request body** (Zod-validated):

```ts
{
  itemIds?: string[];        // omitted or empty = full-order cancel
  reason: string;            // one of the existing 8 dropdown values, or the custom text
  authorizedById: string;    // the manager/admin whose PIN is being checked
  managerPin: string;        // 4 digits
  refundAmount: number;      // >= 0
  refundMethod: 'cash' | 'card' | 'online' | 'none';
  newSubtotal?: number;      // required when itemIds is non-empty (item-level cancel)
  newTax?: number;
  newTotal?: number;
}
```

**Controller logic** (`cancelOrder`, mirrors the existing `updateOrderStatus` shape):

1. Load the order with its items; 404 if missing.
2. `resolveOutletScope` check — 404 if out of scope (existing pattern).
3. State guard: if `existing.status` is `COMPLETED` or `CANCELLED`, throw 400 ("Order
   cannot be cancelled from its current status").
4. Load the `authorizedById` user; 400 if their role isn't one of `Super Admin`,
   `Admin`, `Manager`, `Floor Manager`, or if `pinHash` is unset, or if
   `bcrypt.compare(managerPin, pinHash)` fails ("Invalid manager PIN").
5. Determine target items: `itemIds` present and non-empty → item-level cancel
   (validate every id belongs to this order and is currently `active`); otherwise →
   full-order cancel (every item).
6. Everything below in one `$transaction`:
   - **Full cancel:** `Order.status = CANCELLED`.
   - **Item cancel:** set the targeted `OrderItem.status = 'cancelled'`; update
     `Order.subtotal/tax/total` to `newSubtotal/newTax/newTotal` from the request
     (frontend computes these the same way it computes them when building an order —
     mirrors how the existing generic order-update already accepts recomputed totals).
   - **Waste accounting** — only if `existing.status !== 'PENDING'` (i.e., the order
     had already reached `PREPARING`/`READY`, so stock for its active items was
     already deducted under the new timing): for each cancelled item, look up its
     `FoodRecipe` rows exactly as the deduction code does (by `menuItemId` +
     `variantId`), compute `qty = qtyPerUnit * item.qty`, and for each
     ingredient/production-item consumed, insert one `WasteRecord`:
     - `itemName`: ingredient/production-item name
     - `quantity`: computed qty; `unit`: `ingredient.unit.symbol` (production items:
       omit or use a fixed "pcs")
     - `cost`: for ingredients, `ingredient.purchasePrice * qty`; for short-life
       ingredients, the most recent `StockBatch.unitCost` at the order's kitchen
       warehouse `* qty` (fallback to `purchasePrice` if no batch found) — same
       convention as the existing dough-waste cost calculation; for production items,
       the most recent `ProductionBatch.unitCost` at that warehouse `* qty`
     - `reason`: `"Order cancelled after preparation"`, `recordedBy`: acting user's
       name, `outletId`: the order's outlet, `orderId`: this order
     - No mutation to `Ingredient.currentStock`, `WarehouseStock`,
       `ProductionWarehouseStock`, or any `StockBatch`/`ProductionBatch` — stock stays
       exactly as already consumed; this is a reporting-only entry.
   - **Audit log:** one `OrderModificationLog` row — `action`: `'order_cancelled'` or
     `'item_cancelled'`, `detail`: the reason text, `staff`: acting user's name,
     `refundAmount`, `refundMethod`, `authorizedById`.
7. Emit `order:updated` via the existing socket helper.
8. Respond with the updated, mapped order.

## Frontend changes (`Ovenisto_Frontend_Software/src/pages/POS.tsx`)

- `employee.service.ts`-style new `order.service.ts` method:
  `cancelOrder(orderId, payload)` → `POST /orders/:id/cancel`, extracting `res.data`
  once (never `res.data.data`).
- Replace the "cancel" branch of the existing Modify/Cancel dialog
  (`POS.tsx:2614-2725`) with a dedicated **Cancel Order** inline Card (not a popup,
  per the project's standing convention), keeping the "Modify Order" branch as-is
  (unrelated feature):
  - Line items list, each with a "Cancel Item" button (marks it locally selected for
    cancellation; toggled, not immediately submitted).
  - "Cancel Full Order" button (selects every item / signals whole-order cancel).
  - Existing 8-option reason dropdown + custom-reason text field (unchanged from
    today's dialog).
  - Manager dropdown (outlet-scoped users with role `Super Admin`/`Admin`/`Manager`/
    `Floor Manager`) + PIN input (masked, 4 digits).
  - Live-computed, read-only refund amount = sum of the selected items' line totals
    (or the full order total for a full cancel); refund method selector
    (cash/card/online/none).
  - Audit trail panel (existing — order placed date/time, current status, staff,
    prior modification log entries) — unchanged.
  - "Save Cancellation" button → calls `cancelOrder`, invalidates the orders
    react-query cache, shows a toast.
  - "Print Cancel Slip" button reusing the existing receipt-print pattern from
    `POS.tsx`, formatted with the cancelled item(s), reason, and refund details.
- A "Set PIN" field is added to the current user's own profile area (wherever
  `Users.tsx` or the account menu exposes self-service fields) for the
  `Super Admin`/`Admin`/`Manager`/`Floor Manager` roles — out of scope to design
  further here beyond "a 4-digit input that calls a new `PUT /auth/pin` (or
  `/users/me/pin`) endpoint that bcrypt-hashes and stores it on `pinHash`."

## Out of scope (v1)

- Reversing/restoring stock on cancel (never applicable under this design — orders
  cancelled before `PENDING`→pipeline entry have nothing to reverse; orders cancelled
  after entry get a waste record, not a reversal).
- Any change to the generic `PUT /orders/:id/status` endpoint's handling of
  transitions other than the stock-deduction trigger point.
- Payment gateway / online refund integration (refund here is a manual
  cash/card reconciliation note, not a real money movement).
- Cancelling `COMPLETED` orders under any circumstance.
- Changing the existing receipt/invoice-PDF component itself (reused as-is for the
  cancel slip).

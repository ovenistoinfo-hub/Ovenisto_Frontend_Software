# Website Pickup Payment on POS — Design Spec
**Date:** 2026-10-12
**Status:** Approved
**Scope:** Backend `order` + `cash-settlement` modules; staff app `POS.tsx`, `OrderStatusBoard.tsx`, `CashHub.tsx`

---

## Problem

A website order is either Delivery or Take Away (pickup). Delivery is settled by the rider: on
"delivered" the backend writes `COD Balance (<method>): Rs.X` and Cash Hub puts it on the rider's
balance. Pickup has no working counter flow:

- The only place to record a pickup payment is the "Collect payment on pickup" block on the Order
  Monitor card (`OrderStatusBoard.tsx`). The Cashier role has no `order-status` permission, and
  POS's Running Orders list drops every `orderSource === 'website'` order (`isPosOrder`). The person
  taking money at the counter cannot see the order.
- Nothing requires payment before completion. Order Monitor's "Complete Order" and the backend's
  `updateOrderStatus` both let an unpaid pickup become `COMPLETED`. Website orders are created with
  `cashApproved: true`, so every Dashboard report counts it as revenue, while Cash Hub skips it
  (`paymentMethod: 'Pending'`) and Sales & Orders hides it (`excludeUnpaid`). The money is on nobody's
  balance and the two screens disagree.

What already works: `updateOrder` re-stamps `staffId`/`staffName` to the caller when `paymentMethod`
moves from Pending/Unpaid to a real method, so whoever records the payment is credited in Cash Hub,
and POS's shift register already includes every outlet order paid during the shift.

## Decisions

| Question | Decision |
|----------|----------|
| Where is pickup payment taken | POS, by the cashier, in a dedicated list + payment-only dialog |
| Load the order into the POS cart? | No — the cart re-prices and allows edits, which would overwrite the server-priced website money |
| Order Monitor's collect buttons | Removed; payment is taken in one place. The "Payment Pending" badge stays |
| Complete on collect? | Yes when the kitchen has marked it Ready ("Collect & Hand Over"); otherwise payment only |
| Unpaid completion | Blocked server-side (409) for a website Take Away order |

## Backend (`Ovenisto-backend`)

### `isUnpaidWebsitePickup(order)` — `src/modules/order/order.acceptance.ts`
Pure, exported, unit-tested in `src/modules/order/__tests__/order.acceptance.test.ts`.
True when `orderSource === 'website'` AND `type === 'TAKE_AWAY'` (Prisma member name) AND
`paymentMethod` is null, empty, or `pending`/`unpaid` (case-insensitive, trimmed).

### `updateOrderStatus`
When the target status is `COMPLETED` and `isUnpaidWebsitePickup(existing)` →
`ApiError.conflict('Collect payment for this website pickup on POS first')`, thrown before any
write (next to the existing `isAwaitingAcceptance` 409).

### `updateOrder`
Same 409 when the call would leave the order `COMPLETED` and unpaid **and** the call itself sets
`status` or `paymentMethod`: next status = `dataToUpdate.status ?? existing.status`, next payment
= `dataToUpdate.paymentMethod` if sent, else `existing.paymentMethod`. Edits that touch neither
field still go through, so an old completed-unpaid row stays editable.

### Cash Hub channel — `cash-settlement.service.ts`
`getCashierChannel` returns `'Website Pickup'` for `orderSource === 'website'` (it fell through to
`'POS Counter'`). Display only; amounts and attribution are unchanged.

## Staff app (`Ovenisto_Frontend_Software`)

### `src/lib/websitePickup.ts` (pure, tested in `websitePickup.test.ts`)
- `isUnpaidWebsitePickup(order)` — the frontend mirror of the backend rule, on the client shape
  (`type === "Take Away"`, `orderSource === "website"`, payment missing/Pending/Unpaid). It does not
  look at status.
- `isCollectablePickup(order)` — `isUnpaidWebsitePickup` + accepted (`!isAwaitingAcceptance`) +
  status not `cancelled`/`completed`. This is what POS lists.
- `buildPaymentMethodString(entries, singleMethod)` — `"Cash"` for one method, or
  `"Cash: Rs.900, JazzCash: Rs.779"` for a split (same format as a POS sale).
- `changeDue(given, total)` — `max(0, given − total)`, rounded.

### POS — "Pickups" tab
- The left sidebar's tabs become **Running | Pickups (N) | Drafts**. The list is
  `allOrdersData.filter(isCollectablePickup)`, newest first. Each row: order number, customer name +
  phone, kitchen status chip (pending / preparing / ready), saved total.
- The mobile/sidebar toggle button shows the same count when N > 0, since the sidebar is hidden
  below `xl`.
- No new polling: POS already refreshes `allOrdersData` on order socket events + its safety poll.

### `src/components/pos/WebsitePickupPaymentDialog.tsx`
- Props: `order`, `paymentMethods: string[]`, `open`, `onOpenChange`, `onDone(order, completed)`.
- Read-only body from the order's **stored** fields: lines (qty × name, deal name, line price),
  subtotal, discount, GST, total. Never re-derived from items.
- Payment: one method button per configured method; "Split payment" adds rows (method + amount)
  that must sum to the total; "Cash received" input when Cash is the single method, showing
  change due. Confirm is disabled until the amount covers the total.
- Button: **Collect & Hand Over** when `order.status === 'ready'`, else **Collect Payment**.
- Confirm: `orderService.updateOrder(id, { paymentMethod })`; if Ready, then
  `orderService.updateOrderStatus(id, 'completed')`. If the second call fails, the payment stays
  recorded and a toast says to complete it from Order Monitor.
- On success POS calls `loadApiOrders()` and opens the existing bill preview
  (`OrderPlacedPrintModal` `directMode="bill"`) via the existing slip state.

### Order Monitor (`OrderStatusBoard.tsx`)
- Remove the "Collect payment on pickup" block, `handleCollectPayment` and `collectingId`.
- For an unpaid website pickup in Ready, "Complete Order" is replaced by a disabled
  "Collect payment on POS first" button, so the board never offers an action the server refuses.

### Cash Hub (`CashHub.tsx`)
Add a `"Website Pickup"` entry (lucide `Globe`) to the channel style map.

## Out of scope
- Website Delivery orders (rider flow unchanged).
- Pickups still awaiting acceptance are not listed on POS; they are accepted on Order Monitor first.
- A pickup paid while still cooking is completed later from Order Monitor, like a POS take-away.
- No schema change, no migration.

## Testing
- Backend: `isUnpaidWebsitePickup` cases (website/TAKE_AWAY/Pending → true; paid, Delivery, POS
  source → false; null/empty/case variants). `npm run typecheck`, `npm test`.
- Frontend: `websitePickup.test.ts` for all four helpers. `npm run typecheck`, `npm run lint`,
  `npm test`, `npm run build`.

## Docs
Both `CLAUDE.md` files: the Website Orders inbox note ("payment for a website pickup is collected on
the board's order card") is replaced with the POS flow and the 409 rule.

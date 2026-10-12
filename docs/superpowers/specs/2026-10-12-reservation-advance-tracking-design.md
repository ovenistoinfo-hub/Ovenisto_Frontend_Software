# Reservation Advance Tracking in Cash Hub — Design Spec
**Date:** 2026-10-12
**Status:** Approved (owner: "Track who took the advance"; cancel asks "advance refunded or not")
**Scope:** Backend `reservations`, `order`, `cash-settlement`; staff app Reservations, POS, Waiter Panel, Cash Hub

## Problem

A reservation's advance is taken when the booking is made, but nothing records who took it. When the
booking is later paid off, Cash Hub credits the settling cashier with the advance only and drops the
rest they actually collected (`Advance (X): Rs.500, Net (Cash): Rs.1008` → cashier Rs. 500). POS's
shift register has the same blind spot. Waiter Panel instead credits the waiter with the whole bill.

## Rules

1. **Who took it.** When a booking is created or edited with an advance > 0 and no collector yet, the
   logged-in staff member is stamped as the collector (`Reservation.advanceCollectedById/Name/At`).
   Website bookings carry no advance.
2. **Cash Hub, advance line.** A tracked advance (collector set, not yet settled, not refunded) sits on
   the collector's Cash Hub balance as its own line, channel **"Reservation Advance"**, method =
   the booking's payment method, from the moment it is recorded — including for a no-show.
3. **Settling it.** Settling the collector's balance claims the advance line too
   (`Reservation.advanceSettlementId`), with the same "already settled" guard as orders. Settlement
   history lists it next to the orders.
4. **Cancelling.** Cancelling a booking that has an advance asks "Was the advance refunded?":
   - Refunded → `advanceRefunded = true`, the line leaves Cash Hub.
   - Not refunded (kept) → the line stays until settled.
   - Re-opening a cancelled booking clears the refund flag.
   - A booking whose advance is already settled or already on an order can't be marked refunded.
5. **No silent changes.** A tracked advance's amount can't be changed once it is settled or already on
   an order; a booking with an open (unsettled, unrefunded) advance can't be deleted — cancel it.
6. **Paying the rest.** An order carrying a tracked advance gets `Order.reservationId` (set server-side
   only, and only when the booking's advance is tracked):
   - `convertReservationToOrder` sets it.
   - POS `createOrder` for a loaded booking sends `reservationId`; the server checks the booking and
     takes `advancePayment` from it.
   - Waiter Pay Bill attaches the table's booking advance to one unpaid order (`updateOrder`
     `reservationId`) when no order on the table carries it yet.
   - A booking's advance can be on one order only (409 otherwise).
   Cash Hub then credits the settling cashier/waiter with **total − advance** (the `Net (…)` parts for a
   POS `Advance + Net` string), never the advance itself.
7. **Untracked advances (before this change, or a delivery advance taken at the counter).** An
   `Advance (…), Net (…)` string credits the cashier advance + net (the whole bill), fixing the dropped
   net. Delivery advance strings without `Net` parts are unchanged.

## Pieces

- Schema (additive): `Reservation.advanceCollectedById` (FK User, SetNull), `advanceCollectedByName`,
  `advanceCollectedAt`, `advanceSettlementId` (FK CashSettlement, SetNull), `advanceRefunded`;
  `Order.reservationId`.
- Backend pure helpers, tested: `reservation.advance.ts` (stamping / guards / refund),
  `cash-settlement.service.ts` `parseNetParts` + `classifyOrderCash` (the per-order cashier/rider split,
  extracted from `getActiveBalances` with the new rules).
- Staff app pure helpers, tested: `paymentSplit.ts` `planTableAdvance` (which order carries the table's
  advance + each order's due) and `hasOutstandingBalance` (Waiter's "unpaid" check: an order with an
  advance and a real payment method is paid — it used to read a `paymentStatus` field orders don't have).
- UI: Reservations cancel dialog + "Advance taken by …"; Cash Hub "Reservation Advance" channel rows;
  POS register uses the same rule as Cash Hub.

## Out of scope
- Refunds after the advance was settled (record them as an expense).
- Rewriting orders and balances saved before this change.

# Website Online Payment (Safepay) — Design Spec
**Date:** 2026-10-12
**Status:** Approved in conversation (owner: Safepay; customer chooses online or cash; pay first, refund if
declined; orders only; order held until paid)
**Scope:** Backend `website` + new `payments` module + `order` / `cash-settlement`; public website checkout,
tracking and My Orders; staff app Order Monitor and Settings → Website.

## Problem

The website takes cash only: every order is saved with `paymentMethod: 'Pending'`. Delivery is paid to the
rider, and pickup is paid at the POS counter. Customers can't pay by card, bank account or wallet.

## Decisions

1. **Gateway:** Safepay, through its hosted checkout page (cards, bank accounts, Easypaisa). There is no
   embedded card form.
2. **The customer chooses** "Pay online" or "Cash" at checkout. Cash orders work exactly as they do today.
3. **Pay first, refund if declined.** The order reaches staff only once the payment is confirmed. A paid order
   that is declined or cancelled is refunded.
4. **Orders only.** Bookings and pre-orders stay pay-at-branch.
5. **The order is held until paid.** It is created up front, priced and stock-checked like today, then hidden
   until the payment is confirmed.

## How Safepay works (read from the official SDK `@sfpy/node-sdk` 3.0.2)

- **Start:** `POST {api}/order/v1/init` with `{ client: <api key>, amount, currency: 'PKR', environment }`
  returns a token (the "tracker").
- **Checkout page:** `{checkout}?beacon=<token>&order_id=…&redirect_url=…&cancel_url=…&env=…&source=custom&webhooks=true`.
  - Sandbox: `https://sandbox.api.getsafepay.com` and `…/checkout`.
  - Production: `https://api.getsafepay.com` and `https://getsafepay.com/checkout`.
- **Return:** Safepay POSTs to `redirect_url` with `tracker` and `sig`, where
  `sig = HMAC-SHA256(v1Secret, tracker)` in hex.
- **Webhook:** header `x-sfpy-signature` = `HMAC-SHA512(webhookSecret, JSON.stringify(body.data))` in hex.
- **No refund call** in the SDK. Refunds are done from the Safepay merchant dashboard.

We write our own small client (about 50 lines, no extra dependency) that does the same thing. Its pure parts
are unit-tested. **Confirm in the sandbox before go-live:**
- whether `amount` is in rupees or paisa;
- the content type and fields of the redirect POST;
- the webhook payload: the tracker field name and the event that means "paid";
- whether a tracker status lookup exists, so the return can double-check.

## Flow

1. **Checkout.** The customer picks Pay online. `POST /website/orders` accepts `paymentChoice: 'online' | 'cash'`
   (default `cash`). For `online` it:
   - prices and stock-checks the cart exactly as today;
   - creates the order with `status: AWAITING_PAYMENT` and `paymentMethod: 'Pending'`;
   - starts a Safepay tracker for the order's stored `total`;
   - saves an `OrderPayment` row;
   - returns `{ orderId, orderNumber, total, status: 'awaiting_payment', checkoutUrl }`.

   `order:created` is not emitted yet. A repeated `clientRequestId` returns the existing order without a new
   `checkoutUrl`; the website then sends the customer to `/order/:id`, which has Pay now. If Safepay can't be
   reached, the order is still created and `checkoutUrl` is `null`; the customer lands on `/order/:id` with
   Pay now and Pay cash instead.
2. **Redirect.** The website clears the cart, saves the order to recent, and sends the browser to
   `checkoutUrl`.
3. **Confirmation.** Both arrivals run the same idempotent `confirmPayment(tracker)`:
   - `POST /api/payments/safepay/return?pid=<paymentId>` (urlencoded + JSON, parsed by the app's global
     parsers) verifies `sig` for that payment's tracker, then answers `303 → {origin}/order/:id?payment=done`.
     The origin is stored on the payment row at start, and only an origin the CORS rule allows is accepted.
   - `POST /api/payments/safepay/webhook` verifies `x-sfpy-signature` and answers 200.

   A failed signature check changes nothing and is logged. The return still redirects, to
   `/order/:id?payment=failed`.
4. **`confirmPayment` rules** (pure decision helper, tested). In every case except the first, the payment
   becomes `paid` with `paidAt`:
   - Payment row already `paid` → do nothing.
   - Another payment of the same order is already `paid` (the customer paid twice) → nothing else changes.
     The extra payment shows under Refunds due.
   - Order `AWAITING_PAYMENT` → order `PENDING`, `paymentMethod = ONLINE_PAYMENT_METHOD`
     (`'Online (Safepay)'`), then emit `order:created` so the inbox, toast and beep fire as for a cash order.
     The order's age doesn't matter: if it hasn't expired, it's taken.
   - Order not cancelled, but the customer already switched it to cash (`paymentMethod` still
     `Pending`/`Unpaid`) → mark it paid online the same way, and emit `order:updated`.
   - Order cancelled or expired, or already paid another way → nothing else changes. It shows under Refunds
     due; `order:updated` is emitted so staff see it.
5. **Cancel or failure on Safepay.** `cancel_url` = `{origin}/order/:id?payment=cancelled` (a plain GET to the
   website). The order stays `AWAITING_PAYMENT`.
6. **Retry or switch.**
   - `POST /website/orders/:id/pay` starts a new tracker for the same order and returns a new `checkoutUrl`.
   - `POST /website/orders/:id/pay-cash` turns it into a normal cash order: status `PENDING`, `order:created`
     emitted.

   Both require the signed-in customer who placed the order (`customerUid`), use the order rate limit, and
   work only while the order is `AWAITING_PAYMENT` and not expired.
7. **Expiry.** An `AWAITING_PAYMENT` order older than **30 minutes** is cancelled with
   `rejectionReason: 'Payment not completed'`. No timer does this. It is applied when the order is read (status,
   My Orders, retry, pay-cash), and Order Monitor's Refunds due and inbox queries run the same sweep for that
   outlet. Nothing was charged, so nothing is refunded.

## Data (additive; pushed on deploy)

- `enum OrderStatus` gains `AWAITING_PAYMENT @map("awaiting_payment")`.
- New model `OrderPayment`:
  - `id`, `orderId` (FK, cascade), `provider` (`'safepay'`), `tracker` (unique), `amount Decimal`;
  - `status` (`initiated` | `paid`);
  - `refundedAmount Decimal @default(0)`;
  - `returnOrigin`, `paidAt`, `refundedAt`, `refundedByName`, `refundReference`;
  - `createdAt`/`updatedAt`;
  - `@@index([orderId])`, `@@index([status])`.
- "Refund due" is **derived, never stored**, so no cancel path can forget it. For an order's `paid` payments,
  oldest first:
  - If the order is cancelled, or no longer marked `Online (Safepay)`, every payment is due in full.
  - Otherwise the first payment is kept and owes back `max(0, amount − order.total)` (items cancelled after
    paying). Any later paid payment is a duplicate and is due in full.
  - Each due amount has `refundedAmount` taken off it.
- `websiteConfig.onlinePayment: boolean` (default false), parsed by `readWebsiteConfig` and the staff app's
  `parseWebsiteConfig`.
- Env, all optional in `env.ts`: `SAFEPAY_ENV` (`sandbox` | `production`), `SAFEPAY_API_KEY`,
  `SAFEPAY_V1_SECRET`, `SAFEPAY_WEBHOOK_SECRET`. The gateway counts as configured only when all four are set.

## Hidden until paid

An `AWAITING_PAYMENT` order must not appear anywhere staff look, or be counted anywhere:
- `resolveOrdersWhere` excludes it unless `status` explicitly names it.
- Every other order query or aggregate with no status filter gets `status: { not: 'AWAITING_PAYMENT' }`:
  customer stats, the dashboard, kitchen/rider lookups, table checks. The implementation plan lists each one
  found by grep.
- Reports already filter `COMPLETED`, so they are unaffected.
- `toWebsiteOrderStatus` maps it to `'awaiting_payment'` for the customer.

## Money rules once paid

- **Cash Hub:** `classifyOrderCash` returns `null` for `ONLINE_PAYMENT_METHOD`. The money is in the business
  bank account, not a drawer; without this it would pile up on an unsettleable "Website" balance.
- **Reports:** "Online (Safepay)" shows as its own method and counts as digital in Sales by Payment Method.
- **Delivery:** `computeOrderAmountToCollect` already gives 0 for a paid method, and the rider's "delivered"
  leaves it unchanged.
- **Pickup:** `isUnpaidWebsitePickup` / `isCollectablePickup` are already false (not `Pending`), so the order
  is handed over without POS payment.

## Refunds

- Because refund due is derived (see Data), every way an order gets cancelled or reduced is covered: decline,
  status → cancelled, an approved full or partial cancellation request, a late or duplicate payment.
- `GET /api/payments/refunds-due` lists every payment with an amount due for the outlet (scoped).
  `POST /api/payments/:id/refunded` `{ reference? }` adds the current due to `refundedAmount` and stamps who did
  it and when. Allowed roles: the website-order approvers (Super Admin, Admin, Manager, Delivery Manager).
- **Edit lock:** `updateOrder` on a paid-online order refuses (409) a different `paymentMethod`, or a total
  above what was paid. Staff add extra items as a separate order.
- **Staff app:** decline and cancel dialogs on a paid-online order say "Paid online (Rs. X): refund it from the
  Safepay dashboard". Order Monitor's website inbox has a **Refunds due (N)** list with **Mark refunded**
  (optional reference).
- **Website:** the tracking page says "Cancelled: your payment of Rs. X will be refunded", then "Refunded".

## Screens

- **Website checkout:**
  - a Payment step with **Pay online** and **Cash**, shown only when `/website/config` returns
    `onlinePaymentAvailable` (branch switch on and gateway configured);
  - the button reads "Pay Rs. X online";
  - a 409 (branch closed) or 400 behaves exactly like today.
- **Website `/order/:id`:**
  - awaiting → "Waiting for payment" with **Pay now** and **Pay cash instead**;
  - `?payment=cancelled|failed` → "Payment didn't go through";
  - paid → a "Paid online" badge plus the normal steps.

  The status endpoint returns `payment: { status, amount, method } | null`, with no PII.
- **Website My Orders:** an awaiting order shows "Payment pending" and a Pay now link.
- **Staff app:**
  - a "Paid online" badge on inbox cards (the order detail already prints the stored method, "Online (Safepay)");
  - Refunds due in the inbox;
  - an "Accept online payment" switch in Settings → Website. Its help text says it works only once the
    Safepay keys are set on the server; the website hides the option until both are true.

## Errors and safety

- The charged amount is always the order's stored `total`, never a client number.
- Only a verified signature marks a payment paid. A webhook is matched by tracker; an unknown tracker is
  answered 200 and logged, so Safepay doesn't keep retrying it.
- `confirmPayment` updates the order with a guarded `updateMany` (where status is still what it read) inside
  a transaction, so a webhook and a return arriving at the same moment can't both act.
- No secrets reach the website. The checkout URL holds only the public tracker.
- The website treats `checkoutUrl` as opaque and requires it to start with Safepay's checkout origin before
  redirecting.

## Testing

- **Backend unit tests:** checkout URL builder, both signature checks, the `confirmPayment` decision helper,
  the expiry check, the online-method Cash Hub rule, the refund-on-cancel decision.
- **Website unit tests:** payment-choice availability, the tracking page's payment view helper, the checkout
  URL origin check.
- **Staff app unit tests:** the paid-online badge / refund helpers, and `parseWebsiteConfig` with
  `onlinePayment`.
- **Sandbox run end to end** (needs the owner's free Safepay sandbox keys): pay, cancel then retry, switch to
  cash, decline a paid order → Refunds due → Mark refunded. No production data or money is touched.

## Out of scope

- Online payment for bookings and pre-orders.
- An automatic refund API call (none exists in the SDK). Mark refunded is manual.
- An embedded card form, JazzCash wallet, partial refunds, and online payment at POS.

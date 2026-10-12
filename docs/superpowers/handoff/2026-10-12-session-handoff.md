# Session handoff — 2026-10-12

Start here in the next session. It covers everything done on 2026-10-12 across the three repos, what is
still open, and the rules to keep.

## 1. Where things stand

The work is on `develop` in all three repos. Everything is committed and pushed, the trees are clean, and
nothing has been deployed to production by us.

| Repo | Path | `develop` head |
|---|---|---|
| Backend | `/home/user/Ovenisto-backend` | `8971b6e` Harden the Safepay return and webhook before the sandbox run |
| Staff app (POS/admin) | `/home/user/Ovenisto_Frontend_Software` | this commit (handoff); code at `25e46c6` |
| Public website | `/home/user/Ovenisto_Frontend_Website` | `96cfead` Don't invite a second payment when the server couldn't confirm the first |

The owner said to work directly on `develop` ("You can work directly on the develop branch"), so these
commits have no PR.

**Read first:**
- Each repo's `CLAUDE.md`. All three were updated today; the backend's has the sections "Reservation
  advances in Cash Hub" and "Website online payment — Safepay", which include the deploy steps.
- Specs (staff repo, `docs/superpowers/specs/`):
  - `2026-10-12-website-pickup-payment-design.md`
  - `2026-10-12-reservation-advance-tracking-design.md`
  - `2026-10-12-website-online-payment-design.md`
- Plans (staff repo, `docs/superpowers/plans/`):
  - `2026-10-12-website-pickup-payment.md`
  - `2026-10-12-website-online-payment.md` (Tasks 1–14 done; Task 15 is the sandbox run, still open)

## 2. Rules that bind every session

- **Commit identity:** every commit is authored and committed as Awais, with no mention of Claude,
  Anthropic or any AI tool, and no `Co-Authored-By` / `Claude-Session` / "Generated with" lines. This also
  applies to PR titles and bodies.
  ```sh
  git -c user.name="Awais" -c user.email="142393489+MAwais08@users.noreply.github.com" commit -m "..."
  ```
  A stop hook sometimes asks to rewrite commits as `Claude <noreply@anthropic.com>`. Don't: `CLAUDE.md`
  forbids it.
- **Production database:** the backend's local `.env` `DATABASE_URL` is the **production** Railway
  database.
  - Never run anything that connects to it: no `npm run db:push`, no scripts, no test rows.
  - Schema changes reach the database through the deploy's `preDeployCommand`. Locally, only run
    `npm run db:generate`.
- **No background timers:** `grep -rn "setInterval" src` in the backend must return nothing. Expiry and
  sweeps run on read paths only.
- **Website repo:** never commit `dist/`. No test orders or bookings without the owner's OK.
- **Backend tests need dummy env vars:**
  ```sh
  DATABASE_URL=postgresql://u:p@localhost:5432/db JWT_SECRET=$(printf '0%.0s' {1..32}) npm test
  ```

**Baselines after today's work** (compare against these, don't expect zero):

| Repo | Typecheck | Tests | Lint |
|---|---|---|---|
| Backend | `npm run typecheck` clean | 533 passing, 29 files | `npm run lint` is broken (no eslint), known |
| Staff app | 21 pre-existing TS errors | 92 passing | — |
| Website | 0 TS errors (`npx tsc --noEmit -p tsconfig.app.json`) | 116 passing, 18 files | 13 problems (3 errors, 10 warnings), pre-existing |

## 3. What was built today

### 3.1 Website pickup payment on POS

A website Take Away order is now paid at the POS counter.

- **Backend** (`b0d5bdb`, `4d406ea`, `8536a33`):
  - An unpaid website pickup can't be completed (409, `isUnpaidWebsitePickup`).
  - Recording the payment re-stamps the cashier.
  - Cash Hub labels that cash "Website Pickup".
- **Staff app** (`15df8ab` … `b6d6056`, then `79fe4ff`):
  - POS has a **Pickups (N)** tab.
  - `WebsitePickupPaymentDialog` is a copy of POS's Finalize Sale "Payment Checkout" form.
  - Order Monitor no longer collects payment; it shows "Collect payment on POS first".

### 3.2 Split and overpay fixes (staff app `20b6376`)

- POS and Waiter Panel now write `paymentMethod` through `lib/paymentSplit.ts`:
  - `settlePaymentEntries`: one method gives its name; a split gives `Cash: Rs.X, JazzCash: Rs.Y`, with
    the change taken off the cash part.
  - `allocatePaymentToOrders`: Waiter Panel gives each unpaid order on a table its own share.
- Before this, POS booked Cash + JazzCash as all JazzCash, and Waiter Panel booked a two-order table's
  money twice.

### 3.3 Reservation advance tracking (backend `fe2a674`, staff `b4cfea7`)

- **Collector:** when a booking is saved with an advance, the logged-in staff member is stored as its
  collector.
- **Cash Hub:** the advance is a "Reservation Advance" line on the collector's balance until settled.
- **Paying the rest:** an order that pays off the booking carries `Order.reservationId`, so the settling
  cashier is credited only with total − advance.
- **Cancel:** cancelling a booking asks "was the advance refunded?". Deleting a booking with an open
  advance is refused.

### 3.4 Website online payment via Safepay (the big one)

The owner chose:

| Question | Answer |
|---|---|
| Gateway | Safepay |
| Who chooses the payment method | The customer, online or cash |
| Payment timing | Pay first, refund if declined |
| Scope | Orders only (no bookings) |
| Unpaid order | Held until paid |

**Backend** (`7c15a94` … `8971b6e`), all in `src/modules/payments/`:
- `safepay.ts`: our own client matching SDK `@sfpy/node-sdk` 3.0.2.
  - Init: `POST /order/v1/init` returns the tracker.
  - Checkout URL: built with `beacon`.
  - Return: `sig` = HMAC-SHA256(v1Secret, tracker).
  - Webhook: `x-sfpy-signature` = HMAC-SHA512(webhookSecret, `JSON.stringify(body.data)`).
- `payment.rules.ts`: pure and tested. `decideConfirm`, `refundsDueForOrder`, `webhookTracker` (with a
  failure-type veto), `resolveReturnOrigin`, `onlinePaidEditBlock`.
- `payment.service.ts`:
  - `startPayment` and `confirmPayment`. `confirmPayment` locks the order row `FOR UPDATE`.
  - `switchToCash`.
  - `expireStalePaymentOrders`, read paths only. Its window is 30 min from the latest checkout start.
  - `listRefundsDue` (raw-SQL candidate pre-query, no row cap) and `markRefunded`.
- Routes (`/api/payments`):
  - `POST /safepay/return?pid=`: rate limited, always 303 back to the website.
  - `POST /safepay/webhook`
  - `GET /refunds-due` and `POST /:id/refunded`
- **Order status:** new `OrderStatus.AWAITING_PAYMENT`. Every staff query, report, delivery list and
  customer stat excludes it. `ONLINE_PAYMENT_METHOD = 'Online (Safepay)'` is skipped by Cash Hub.
- **Refund-due model:** `OrderPayment` (`order_payments`). The amount due is derived, never stored.
- **Website endpoints:** `POST /website/orders` takes `paymentChoice`. New `POST /website/orders/:id/pay`
  and `/pay-cash`. `/website/config` returns `onlinePaymentAvailable`, and the status views carry
  `payment`.

**Website** (`e4a4d94` … `96cfead`):
- Checkout has a Pay online / Cash choice. The browser leaves only for a URL that passes
  `isSafepayCheckoutUrl`.
- `/order/:id` has an awaiting panel with Pay now and Pay cash instead. The `?payment=` banners are:
  - `cancelled`: "Payment didn't go through".
  - `failed` and `done`: "don't pay again".
- An expired order never claims "nothing was charged" when a payment exists.

**Staff app** (`b922552`, `8f98f48`, `3aa4a2b`, `25e46c6`):
- **Settings → Website:** an "Accept online payment" switch.
- **Inbox:** a "Paid online" chip, a Safepay note on decline, and a **Refunds due** list with **Mark
  refunded**. Order Monitor shows a refunds badge.
- **POS partial cancel:** keeps the delivery fee (`partialCancelTotals`) and uses refund method `safepay`
  for paid-online orders.
- **Caches:** `/payments` is cleared on order events and order mutations.

**Review status:**
- Every task was reviewed, then an opus final review, a fix wave, and a re-review.
- Verdict: **ready for staging + Safepay sandbox, not for production** (see §5).

### Owner decisions made during the Safepay work

| Question | Decision |
|---|---|
| Refunds-due list was capped at 200 rows | Fix it (done: raw-SQL candidate pre-query) |
| Payment lands before the expiry sweep ran | Keep it, so the payment is taken |
| Recording fails after a valid Safepay return | Always redirect the customer anyway (`?payment=done`) |
| 30-minute pay window | Counted from the latest Pay now, not from order placement |

## 4. Next step: Task 15, the sandbox run

This needs the owner's free **Safepay sandbox keys** and their OK to make test rows on **staging only**.
Ask first; don't start without both.

1. On the **staging** backend (Railway), set `SAFEPAY_ENV=sandbox`, `SAFEPAY_API_KEY`,
   `SAFEPAY_V1_SECRET` and `SAFEPAY_WEBHOOK_SECRET`, then deploy `develop`. The deploy's `db:push` adds
   the new enum value and table.
2. In the Safepay sandbox dashboard, register the webhook
   `https://ovenistobackend-staging.up.railway.app/api/payments/safepay/webhook`.
3. Switch on Settings → Website → Accept online payment for one staging branch.
4. Confirm the open questions, and fix the code and tests where reality differs:
   - Is `amount` in rupees (assumed) or paisa? See `createTracker`.
   - Does the redirect POST carry `tracker` + `sig`, and with what content type? See `safepayReturn`.
   - What is the real webhook payload? `webhookTracker` guesses `data.tracker` and the
     `payment:created` / `PAID` / `TRACKER_ENDED` events.
   - Does a tracker status lookup API exist? If so, add it to `confirmPayment`.
5. Walk the flows:
   - pay with a sandbox card, then accept → Ready → complete;
   - cancel on Safepay, then Pay now;
   - Pay cash instead;
   - decline a paid order → Refunds due → Mark refunded.

   Check that Cash Hub shows nothing for the online order and that Sales by Payment Method shows
   "Online (Safepay)".
6. Delete the ZZTEST rows (owner's OK first) and report.

## 5. Production gates (fix before going live)

- **C1, the most important:** a payment that Safepay captured but we never recorded will quietly expire.
  - How it happens: the return and the webhook both failed or were lost, and the order expires 30 min
    later as "Payment not completed".
  - Fix: use the real webhook payload or a tracker status lookup from the sandbox run.
  - Fallback if no lookup exists: don't silently expire an order whose payment is still `initiated`.
    Show it to staff as "Check in Safepay" instead.
- **Webhook veto is one-way:** a failure-typed event is refused, but a success-typed event with a failed
  state still counts as paid. Rewrite `webhookTracker` from the real payloads.
- **Unconfirmed formats:** the amount unit and the redirect POST fields (Task 15).
- **Return origin:** stop accepting `*.vercel.app` as a valid return origin in production. Allow only
  the real website domain.
- **Optional:** hold Pay now briefly after `?payment=done|failed`, so a customer whose payment is still
  being confirmed can't start a second one.

**Production deploy steps** (also in backend `CLAUDE.md`):
1. Set the four `SAFEPAY_*` vars on the production service.
2. Register the production webhook URL in Safepay.
3. Make sure the production website origin is in `CORS_ORIGIN`, or online payment is refused with 400.
4. Switch the setting on per branch.
5. Deploy the backend and website together.

## 6. Minor backlog (can wait)

- **Docs drift:**
  - Staff `CLAUDE.md` "Refresh" bullet still lists `['website-orders','today']` and says "6 canonical
    keys".
  - The backend `resolveOrdersWhere` comment near `order.controller.ts` ~371 is stale.
  - Older website `CLAUDE.md` sections still say "cash only".
- **Website checkout:**
  - The payment radio group has no arrow-key navigation.
  - The payment cards aren't disabled while placing the order.
  - "30 minutes" is hard-coded twice in the copy.
  - My Orders isn't invalidated after Pay cash instead.
- **Backend:**
  - `CORS_ORIGIN` is parsed in 3 places.
  - `resolveReturnOrigin` accepts `127.0.0.1`, which `app.ts` CORS doesn't.
  - Pre-existing: the CORS `includes('localhost')` substring check lets `localhost.evil.com` through.
  - The refunds-due SQL pre-query has never run against a real database; Task 15 will exercise it.
- **Staff app:** the persisted react-query key isn't per-user (pre-existing pattern), and
  `REFUND_REASON_LABEL` has no fallback.
- **Earlier features' edge cases:**
  - Waiter Panel: an advance larger than any single order on the table can overcount.
  - Legacy advances with no collector still credit the whole bill.
- **Live testing:** none of today's features have been tried on staging yet.

## 7. Process notes

- The Safepay work used subagent-driven development: one implementer per task, a review per task, and a
  final review plus a fix wave.
- The per-task ledger lived at `.superpowers/sdd/progress.md` in the staff repo. That folder is
  git-ignored and will be gone in a new container; everything needed from it is in this note.

# Website Online Payment (Safepay) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Website customers can pay for an order online through Safepay's hosted checkout (card, bank account, Easypaisa), or keep paying cash, with the order reaching staff only once paid and refunds tracked when a paid order is declined or reduced.

**Architecture:** A new backend `payments` module holds a tiny Safepay client (`safepay.ts`), pure rules (`payment.rules.ts`), the DB side (`payment.service.ts`) and routes. Online orders are created with a new `OrderStatus.AWAITING_PAYMENT`, which every staff query excludes. A verified Safepay return or webhook flips the order to `PENDING`. "Refund due" is derived from `OrderPayment` rows, never stored. The website gets a payment choice at checkout and a payment panel on the tracking page. The staff app gets a Settings switch and a Refunds due list in Order Monitor's website inbox.

**Tech Stack:** Express 5 + TypeScript (ESM, `.js` import paths) + Prisma/PostgreSQL + Vitest (backend); Vite + React 18 + TanStack Query + Vitest (website and staff app).

**Spec:** `docs/superpowers/specs/2026-10-12-website-online-payment-design.md` (this repo).

## Global Constraints

- Repos and branch: `/home/user/Ovenisto-backend`, `/home/user/Ovenisto_Frontend_Website`, `/home/user/Ovenisto_Frontend_Software`. Work and push directly on `develop` (owner's instruction).
- Every commit: `git -c user.name="Awais" -c user.email="142393489+MAwais08@users.noreply.github.com" commit -m "..."`. Never mention Claude, Anthropic or any AI tool, and never add `Co-Authored-By` or `Claude-Session` trailers.
- The paid-online payment method string is exactly `Online (Safepay)`.
- Order status for an unpaid online order: Prisma `AWAITING_PAYMENT`, mapped `"awaiting_payment"`.
- Payment window: 30 minutes. Expired-order reason text: `Payment not completed`.
- No background timers (`grep -rn "setInterval" src` in the backend must stay empty). Expiry runs on read paths only.
- The local backend `.env` `DATABASE_URL` is the PRODUCTION database: never run `db:push` or create test rows locally. `npm run db:generate` is safe (no DB connection).
- Backend tests: `DATABASE_URL=postgresql://u:p@localhost:5432/db JWT_SECRET=$(printf '0%.0s' {1..32}) npx vitest run`.
- Backend `ApiError` style in the files touched here: statics (`ApiError.badRequest(...)`, `ApiError.conflict(...)`).
- Staff app baseline: 21 pre-existing TypeScript errors (`npm run typecheck 2>&1 | grep -c "error TS"` must stay 21).
- Website: `dist/` is tracked in git; never commit it. Run `git checkout -- dist` after any build.
- Safepay endpoints (from SDK `@sfpy/node-sdk` 3.0.2): API `https://sandbox.api.getsafepay.com` / `https://api.getsafepay.com`; checkout `https://sandbox.api.getsafepay.com/checkout` / `https://getsafepay.com/checkout`; init `POST /order/v1/init`.
- Env vars (all optional; all four set = gateway on): `SAFEPAY_ENV` (`sandbox` | `production`), `SAFEPAY_API_KEY`, `SAFEPAY_V1_SECRET`, `SAFEPAY_WEBHOOK_SECRET`.

---

## Part A — Backend (`/home/user/Ovenisto-backend`)

### Task 1: Safepay client

**Files:**
- Create: `src/modules/payments/safepay.ts`
- Create: `src/modules/payments/__tests__/safepay.test.ts`
- Modify: `.env.example` (append four keys)

**Interfaces:**
- Produces: `type SafepayEnv`, `interface SafepayConfig { env; apiKey; v1Secret; webhookSecret }`, `readSafepayConfig(e: Record<string, string | undefined>): SafepayConfig | null`, `buildCheckoutUrl(cfg, { token, orderId, redirectUrl, cancelUrl }): string`, `isValidReturnSignature(cfg, tracker: unknown, sig: unknown): boolean`, `isValidWebhookSignature(cfg, data: unknown, signature: unknown): boolean`, `createTracker(cfg, amount: number): Promise<string>`.

- [ ] **Step 1: Write the failing test** — `src/modules/payments/__tests__/safepay.test.ts`

```ts
import crypto from 'crypto';
import { describe, it, expect } from 'vitest';
import { readSafepayConfig, buildCheckoutUrl, isValidReturnSignature, isValidWebhookSignature, type SafepayConfig } from '../safepay.js';

const cfg: SafepayConfig = { env: 'sandbox', apiKey: 'sec_test', v1Secret: 'v1-secret', webhookSecret: 'wh-secret' };

describe('readSafepayConfig', () => {
  it('turns the gateway on only when all four settings are present', () => {
    expect(readSafepayConfig({ SAFEPAY_ENV: 'sandbox', SAFEPAY_API_KEY: 'k', SAFEPAY_V1_SECRET: 's', SAFEPAY_WEBHOOK_SECRET: 'w' }))
      .toEqual({ env: 'sandbox', apiKey: 'k', v1Secret: 's', webhookSecret: 'w' });
    expect(readSafepayConfig({ SAFEPAY_ENV: 'sandbox', SAFEPAY_API_KEY: 'k', SAFEPAY_V1_SECRET: 's' })).toBeNull();
    expect(readSafepayConfig({ SAFEPAY_ENV: 'live', SAFEPAY_API_KEY: 'k', SAFEPAY_V1_SECRET: 's', SAFEPAY_WEBHOOK_SECRET: 'w' })).toBeNull();
    expect(readSafepayConfig({})).toBeNull();
  });
});

describe('buildCheckoutUrl', () => {
  it('uses the SDK query parameters', () => {
    const url = new URL(buildCheckoutUrl(cfg, {
      token: 'track_1',
      orderId: 'ORD-101',
      redirectUrl: 'https://api.example.com/api/payments/safepay/return?pid=p1',
      cancelUrl: 'https://site.example.com/order/o1?payment=cancelled',
    }));
    expect(url.origin + url.pathname).toBe('https://sandbox.api.getsafepay.com/checkout');
    expect(url.searchParams.get('beacon')).toBe('track_1');
    expect(url.searchParams.get('order_id')).toBe('ORD-101');
    expect(url.searchParams.get('redirect_url')).toBe('https://api.example.com/api/payments/safepay/return?pid=p1');
    expect(url.searchParams.get('cancel_url')).toBe('https://site.example.com/order/o1?payment=cancelled');
    expect(url.searchParams.get('env')).toBe('sandbox');
    expect(url.searchParams.get('source')).toBe('custom');
    expect(url.searchParams.get('webhooks')).toBe('true');
  });

  it('points production at getsafepay.com', () => {
    expect(buildCheckoutUrl({ ...cfg, env: 'production' }, { token: 't', orderId: 'o', redirectUrl: 'r', cancelUrl: 'c' }))
      .toMatch(/^https:\/\/getsafepay\.com\/checkout\?/);
  });
});

describe('isValidReturnSignature', () => {
  const sig = crypto.createHmac('sha256', 'v1-secret').update('track_1').digest('hex');

  it('accepts the HMAC-SHA256 of the tracker', () => {
    expect(isValidReturnSignature(cfg, 'track_1', sig)).toBe(true);
  });

  it('rejects a wrong tracker, a wrong signature or missing values', () => {
    expect(isValidReturnSignature(cfg, 'track_2', sig)).toBe(false);
    expect(isValidReturnSignature(cfg, 'track_1', 'abc')).toBe(false);
    expect(isValidReturnSignature(cfg, 'track_1', undefined)).toBe(false);
    expect(isValidReturnSignature(cfg, '', sig)).toBe(false);
  });
});

describe('isValidWebhookSignature', () => {
  const data = { tracker: 'track_1', state: 'PAID' };
  const signature = crypto.createHmac('sha512', 'wh-secret').update(Buffer.from(JSON.stringify(data))).digest('hex');

  it('accepts the HMAC-SHA512 of JSON.stringify(data)', () => {
    expect(isValidWebhookSignature(cfg, data, signature)).toBe(true);
  });

  it('rejects tampered data, a wrong header or no data', () => {
    expect(isValidWebhookSignature(cfg, { ...data, state: 'FAILED' }, signature)).toBe(false);
    expect(isValidWebhookSignature(cfg, data, 'nope')).toBe(false);
    expect(isValidWebhookSignature(cfg, undefined, signature)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/user/Ovenisto-backend && npx vitest run src/modules/payments/__tests__/safepay.test.ts`
Expected: FAIL — cannot find module `../safepay.js`.

- [ ] **Step 3: Write the implementation** — `src/modules/payments/safepay.ts`

```ts
// Safepay (website online payment): the calls we use, written to match the official SDK
// `@sfpy/node-sdk` 3.0.2 without pulling in its axios dependency. Pure except createTracker.
import crypto from 'crypto';

export type SafepayEnv = 'sandbox' | 'production';

export interface SafepayConfig {
  env: SafepayEnv;
  apiKey: string;
  v1Secret: string;
  webhookSecret: string;
}

const API_URL: Record<SafepayEnv, string> = {
  sandbox: 'https://sandbox.api.getsafepay.com',
  production: 'https://api.getsafepay.com',
};

const CHECKOUT_URL: Record<SafepayEnv, string> = {
  sandbox: 'https://sandbox.api.getsafepay.com/checkout',
  production: 'https://getsafepay.com/checkout',
};

/** The gateway is on only when all four settings are present. */
export function readSafepayConfig(e: Record<string, string | undefined>): SafepayConfig | null {
  const env = e.SAFEPAY_ENV;
  if (env !== 'sandbox' && env !== 'production') return null;
  if (!e.SAFEPAY_API_KEY || !e.SAFEPAY_V1_SECRET || !e.SAFEPAY_WEBHOOK_SECRET) return null;
  return { env, apiKey: e.SAFEPAY_API_KEY, v1Secret: e.SAFEPAY_V1_SECRET, webhookSecret: e.SAFEPAY_WEBHOOK_SECRET };
}

/** Safepay's hosted checkout page for a tracker token. */
export function buildCheckoutUrl(
  cfg: SafepayConfig,
  p: { token: string; orderId: string; redirectUrl: string; cancelUrl: string }
): string {
  const params = new URLSearchParams({
    beacon: p.token,
    cancel_url: p.cancelUrl,
    env: cfg.env,
    order_id: p.orderId,
    redirect_url: p.redirectUrl,
    source: 'custom',
    webhooks: 'true',
  });
  return `${CHECKOUT_URL[cfg.env]}?${params.toString()}`;
}

function hmacMatches(algorithm: 'sha256' | 'sha512', secret: string, payload: string | Buffer, given: unknown): boolean {
  if (typeof given !== 'string' || given.length === 0) return false;
  const expected = Buffer.from(crypto.createHmac(algorithm, secret).update(payload).digest('hex'));
  const actual = Buffer.from(given);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

/** The redirect back after checkout: `sig` = HMAC-SHA256(v1Secret, tracker), hex. */
export function isValidReturnSignature(cfg: SafepayConfig, tracker: unknown, sig: unknown): boolean {
  if (typeof tracker !== 'string' || tracker.length === 0) return false;
  return hmacMatches('sha256', cfg.v1Secret, tracker, sig);
}

/** A webhook: header `x-sfpy-signature` = HMAC-SHA512(webhookSecret, JSON.stringify(body.data)), hex. */
export function isValidWebhookSignature(cfg: SafepayConfig, data: unknown, signature: unknown): boolean {
  if (data === undefined) return false;
  return hmacMatches('sha512', cfg.webhookSecret, Buffer.from(JSON.stringify(data)), signature);
}

/** Starts a payment for `amount` rupees and returns Safepay's tracker token. */
export async function createTracker(cfg: SafepayConfig, amount: number): Promise<string> {
  const res = await fetch(`${API_URL[cfg.env]}/order/v1/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client: cfg.apiKey, amount, currency: 'PKR', environment: cfg.env }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => null)) as { data?: { token?: unknown } } | null;
  const token = body?.data?.token;
  if (!res.ok || typeof token !== 'string' || token.length === 0) {
    throw new Error(`Safepay init failed (HTTP ${res.status})`);
  }
  return token;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/user/Ovenisto-backend && npx vitest run src/modules/payments/__tests__/safepay.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Document the env vars** — append to `.env.example`:

```
# Safepay (website online payment). All four set = the "Pay online" option can be switched on.
# Keys come from the Safepay merchant dashboard (sandbox keys from the sandbox dashboard).
SAFEPAY_ENV=sandbox
SAFEPAY_API_KEY=
SAFEPAY_V1_SECRET=
SAFEPAY_WEBHOOK_SECRET=
```

- [ ] **Step 6: Commit**

```bash
cd /home/user/Ovenisto-backend
git add src/modules/payments/safepay.ts src/modules/payments/__tests__/safepay.test.ts .env.example
git -c user.name="Awais" -c user.email="142393489+MAwais08@users.noreply.github.com" commit -m "Add a small Safepay client for website online payment"
```

---

### Task 2: Payment rules

**Files:**
- Create: `src/modules/payments/payment.rules.ts`
- Create: `src/modules/payments/__tests__/payment.rules.test.ts`

**Interfaces:**
- Produces: `ONLINE_PAYMENT_METHOD = 'Online (Safepay)'`, `isOnlinePaid(pm)`, `PAYMENT_WINDOW_MS`, `PAYMENT_EXPIRED_REASON = 'Payment not completed'`, `ONLINE_ORIGIN_MESSAGE`, `PAID_ONLINE_EDIT_MESSAGE`, `isPaymentExpired(order, nowMs?)`, `type ConfirmDecision`, `decideConfirm(payment, order, anotherPaymentPaid)`, `interface PaymentLike { id; status; amount; refundedAmount; paidAt }`, `toPaymentLike(row)`, `type RefundReason`, `refundsDueForOrder(order, payments): { paymentId; due; reason }[]`, `type PaymentView`, `toPaymentView(order, payments): PaymentView | null`, `resolveReturnOrigin(origin, allowedOrigins): string | null`, `webhookTracker(body): string | null`, `onlinePaidEditBlock({ newPaymentMethod?, newTotal?, paidAmount }): string | null`.

- [ ] **Step 1: Write the failing test** — `src/modules/payments/__tests__/payment.rules.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import {
  ONLINE_PAYMENT_METHOD, PAYMENT_WINDOW_MS, isOnlinePaid, isPaymentExpired, decideConfirm, refundsDueForOrder,
  toPaymentView, toPaymentLike, resolveReturnOrigin, webhookTracker, onlinePaidEditBlock, PAID_ONLINE_EDIT_MESSAGE,
  type PaymentLike,
} from '../payment.rules.js';

const pay = (id: string, extra: Partial<PaymentLike> = {}): PaymentLike => ({
  id, status: 'paid', amount: 1500, refundedAmount: 0, paidAt: new Date('2026-10-12T10:00:00Z'), ...extra,
});
const paidOrder = { status: 'PENDING', total: 1500, paymentMethod: ONLINE_PAYMENT_METHOD };

describe('isOnlinePaid', () => {
  it('matches only the exact gateway method', () => {
    expect(isOnlinePaid('Online (Safepay)')).toBe(true);
    expect(isOnlinePaid(' Online (Safepay) ')).toBe(true);
    expect(isOnlinePaid('Cash')).toBe(false);
    expect(isOnlinePaid(null)).toBe(false);
  });
});

describe('isPaymentExpired', () => {
  const now = Date.parse('2026-10-12T12:00:00Z');
  it('expires an awaiting order after the window', () => {
    expect(isPaymentExpired({ status: 'AWAITING_PAYMENT', createdAt: new Date(now - PAYMENT_WINDOW_MS - 1) }, now)).toBe(true);
    expect(isPaymentExpired({ status: 'AWAITING_PAYMENT', createdAt: new Date(now - PAYMENT_WINDOW_MS + 60_000) }, now)).toBe(false);
  });
  it('never expires an order that is not waiting for payment', () => {
    expect(isPaymentExpired({ status: 'PENDING', createdAt: new Date(0) }, now)).toBe(false);
  });
});

describe('decideConfirm', () => {
  it('does nothing for a payment already paid', () => {
    expect(decideConfirm({ status: 'paid' }, { status: 'AWAITING_PAYMENT', paymentMethod: 'Pending' }, false)).toBe('already');
  });
  it('activates an order waiting for payment', () => {
    expect(decideConfirm({ status: 'initiated' }, { status: 'AWAITING_PAYMENT', paymentMethod: 'Pending' }, false)).toBe('activate');
  });
  it('marks a switched-to-cash order paid while it is still unpaid', () => {
    expect(decideConfirm({ status: 'initiated' }, { status: 'PENDING', paymentMethod: 'Pending' }, false)).toBe('mark-paid');
  });
  it('only records the payment (for a refund) when the order is cancelled, paid another way, or paid twice', () => {
    expect(decideConfirm({ status: 'initiated' }, { status: 'CANCELLED', paymentMethod: 'Pending' }, false)).toBe('refund-only');
    expect(decideConfirm({ status: 'initiated' }, { status: 'COMPLETED', paymentMethod: 'Cash' }, false)).toBe('refund-only');
    expect(decideConfirm({ status: 'initiated' }, { status: 'AWAITING_PAYMENT', paymentMethod: 'Pending' }, true)).toBe('refund-only');
  });
});

describe('refundsDueForOrder', () => {
  it('owes nothing on a normal paid order', () => {
    expect(refundsDueForOrder(paidOrder, [pay('p1')])).toEqual([]);
  });
  it('owes the full amount when the order is cancelled', () => {
    expect(refundsDueForOrder({ ...paidOrder, status: 'CANCELLED' }, [pay('p1')]))
      .toEqual([{ paymentId: 'p1', due: 1500, reason: 'cancelled' }]);
  });
  it('owes the difference when items were removed after paying', () => {
    expect(refundsDueForOrder({ ...paidOrder, total: 1100 }, [pay('p1')]))
      .toEqual([{ paymentId: 'p1', due: 400, reason: 'over_total' }]);
  });
  it('owes a second payment in full (paid twice), keeping the first', () => {
    const second = pay('p2', { paidAt: new Date('2026-10-12T10:05:00Z') });
    expect(refundsDueForOrder(paidOrder, [second, pay('p1')]))
      .toEqual([{ paymentId: 'p2', due: 1500, reason: 'duplicate' }]);
  });
  it('owes everything when the order was paid another way', () => {
    expect(refundsDueForOrder({ ...paidOrder, paymentMethod: 'Cash' }, [pay('p1')]))
      .toEqual([{ paymentId: 'p1', due: 1500, reason: 'paid_other_way' }]);
  });
  it('takes off what was already refunded, and ignores unpaid attempts', () => {
    expect(refundsDueForOrder({ ...paidOrder, status: 'CANCELLED' }, [pay('p1', { refundedAmount: 1500 }), pay('p0', { status: 'initiated' })])).toEqual([]);
    expect(refundsDueForOrder({ ...paidOrder, status: 'CANCELLED' }, [pay('p1', { refundedAmount: 1000 })]))
      .toEqual([{ paymentId: 'p1', due: 500, reason: 'cancelled' }]);
  });
});

describe('toPaymentView', () => {
  it('is null for a cash order', () => {
    expect(toPaymentView({ status: 'PENDING', total: 900, paymentMethod: 'Pending' }, [])).toBeNull();
  });
  it('is awaiting while the order waits for payment', () => {
    expect(toPaymentView({ status: 'AWAITING_PAYMENT', total: 900, paymentMethod: 'Pending' }, [pay('p1', { status: 'initiated', amount: 900 })]))
      .toEqual({ status: 'awaiting', amount: 900, refundDue: 0 });
  });
  it('is paid, then refund_pending, then refunded', () => {
    expect(toPaymentView(paidOrder, [pay('p1')])).toEqual({ status: 'paid', amount: 1500, refundDue: 0 });
    expect(toPaymentView({ ...paidOrder, status: 'CANCELLED' }, [pay('p1')])).toEqual({ status: 'refund_pending', amount: 1500, refundDue: 1500 });
    expect(toPaymentView({ ...paidOrder, status: 'CANCELLED' }, [pay('p1', { refundedAmount: 1500 })])).toEqual({ status: 'refunded', amount: 1500, refundDue: 0 });
  });
});

describe('toPaymentLike', () => {
  it('turns Decimal-like amounts into numbers', () => {
    const row = { id: 'p1', status: 'paid', amount: { valueOf: () => 1500 }, refundedAmount: '0', paidAt: null };
    expect(toPaymentLike(row)).toEqual({ id: 'p1', status: 'paid', amount: 1500, refundedAmount: 0, paidAt: null });
  });
});

describe('resolveReturnOrigin', () => {
  const allowed = ['https://ovenisto-frontend-website.vercel.app', 'https://website-stagging.up.railway.app'];
  it('accepts an allowed origin, a vercel preview and localhost', () => {
    expect(resolveReturnOrigin('https://website-stagging.up.railway.app', allowed)).toBe('https://website-stagging.up.railway.app');
    expect(resolveReturnOrigin('https://preview-123.vercel.app', allowed)).toBe('https://preview-123.vercel.app');
    expect(resolveReturnOrigin('http://localhost:8081', allowed)).toBe('http://localhost:8081');
  });
  it('rejects anything else', () => {
    expect(resolveReturnOrigin('https://evil.example.com', allowed)).toBeNull();
    expect(resolveReturnOrigin('https://localhost.evil.com', allowed)).toBeNull();
    expect(resolveReturnOrigin('null', allowed)).toBeNull();
    expect(resolveReturnOrigin(undefined, allowed)).toBeNull();
  });
});

describe('webhookTracker', () => {
  it('returns the tracker of a paid event', () => {
    expect(webhookTracker({ type: 'payment:created', data: { tracker: 'track_1' } })).toBe('track_1');
    expect(webhookTracker({ data: { tracker: 'track_2', state: 'PAID' } })).toBe('track_2');
    expect(webhookTracker({ data: { notification: { tracker: 'track_3', state: 'TRACKER_ENDED' } } })).toBe('track_3');
  });
  it('ignores other events and malformed bodies', () => {
    expect(webhookTracker({ type: 'payment:failed', data: { tracker: 'track_1', state: 'FAILED' } })).toBeNull();
    expect(webhookTracker({ type: 'payment:created', data: {} })).toBeNull();
    expect(webhookTracker(null)).toBeNull();
  });
});

describe('onlinePaidEditBlock', () => {
  it('allows edits that keep the method and stay within what was paid', () => {
    expect(onlinePaidEditBlock({ paidAmount: 1500 })).toBeNull();
    expect(onlinePaidEditBlock({ newTotal: 1200, paidAmount: 1500 })).toBeNull();
    expect(onlinePaidEditBlock({ newPaymentMethod: ONLINE_PAYMENT_METHOD, newTotal: 1500, paidAmount: 1500 })).toBeNull();
  });
  it('refuses a different method or a higher total', () => {
    expect(onlinePaidEditBlock({ newPaymentMethod: 'Cash', paidAmount: 1500 })).toBe(PAID_ONLINE_EDIT_MESSAGE);
    expect(onlinePaidEditBlock({ newTotal: 1800, paidAmount: 1500 })).toBe(PAID_ONLINE_EDIT_MESSAGE);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/user/Ovenisto-backend && npx vitest run src/modules/payments/__tests__/payment.rules.test.ts`
Expected: FAIL — cannot find module `../payment.rules.js`.

- [ ] **Step 3: Write the implementation** — `src/modules/payments/payment.rules.ts`

```ts
// Website online payment (Safepay): the pure rules. The DB side is payment.service.ts, the gateway
// safepay.ts. "Refund due" is derived here from the payment rows, never stored, so no cancel path
// can forget it.

/** What a paid-online order stores in Order.paymentMethod. Cash Hub skips it: the money is in the bank. */
export const ONLINE_PAYMENT_METHOD = 'Online (Safepay)';

export const isOnlinePaid = (paymentMethod: string | null | undefined) => (paymentMethod ?? '').trim() === ONLINE_PAYMENT_METHOD;

/** An order still waiting for its online payment after this long is cancelled (on the next read). */
export const PAYMENT_WINDOW_MS = 30 * 60 * 1000;
export const PAYMENT_EXPIRED_REASON = 'Payment not completed';
export const ONLINE_ORIGIN_MESSAGE = 'Online payment has to be started from the Ovenisto website';
export const PAID_ONLINE_EDIT_MESSAGE =
  "This order was paid online: its payment method can't change and its total can't go above what was paid. Add extra items as a new order.";

export function isPaymentExpired(order: { status: string; createdAt: Date }, nowMs = Date.now()): boolean {
  return order.status === 'AWAITING_PAYMENT' && nowMs - order.createdAt.getTime() > PAYMENT_WINDOW_MS;
}

const isUnpaidMethod = (pm: string | null | undefined) => {
  const v = (pm ?? '').trim().toLowerCase();
  return v === '' || v === 'pending' || v === 'unpaid';
};

export type ConfirmDecision = 'already' | 'activate' | 'mark-paid' | 'refund-only';

/**
 * What a verified Safepay confirmation does. Except for 'already', the payment becomes paid:
 * 'activate' → the waiting order goes to staff; 'mark-paid' → a switched-to-cash, still unpaid order is
 * now paid online; 'refund-only' → nothing else changes, and the payment shows under Refunds due.
 */
export function decideConfirm(
  payment: { status: string },
  order: { status: string; paymentMethod: string | null },
  anotherPaymentPaid: boolean
): ConfirmDecision {
  if (payment.status === 'paid') return 'already';
  if (anotherPaymentPaid) return 'refund-only';
  if (order.status === 'AWAITING_PAYMENT') return 'activate';
  if (order.status !== 'CANCELLED' && isUnpaidMethod(order.paymentMethod)) return 'mark-paid';
  return 'refund-only';
}

export interface PaymentLike {
  id: string;
  status: string;
  amount: number;
  refundedAmount: number;
  paidAt: Date | null;
}

/** An OrderPayment row (Prisma Decimals) as plain numbers. */
export function toPaymentLike(p: { id: string; status: string; amount: unknown; refundedAmount: unknown; paidAt: Date | null }): PaymentLike {
  return { id: p.id, status: p.status, amount: Number(p.amount), refundedAmount: Number(p.refundedAmount), paidAt: p.paidAt };
}

export type RefundReason = 'cancelled' | 'paid_other_way' | 'over_total' | 'duplicate';

const money = (n: number) => Math.max(0, Math.round(n * 100) / 100);

/**
 * What each paid payment of an order owes back, after what was already refunded (only entries of
 * Rs. 1 or more). Oldest paid payment first: it is kept while the order is live and still marked paid
 * online, owing back only what the order no longer costs; every other paid payment is owed in full.
 */
export function refundsDueForOrder(
  order: { status: string; total: number; paymentMethod: string | null },
  payments: PaymentLike[]
): { paymentId: string; due: number; reason: RefundReason }[] {
  const cancelled = order.status === 'CANCELLED';
  const online = isOnlinePaid(order.paymentMethod);
  return payments
    .filter((p) => p.status === 'paid')
    .sort((a, b) => (a.paidAt?.getTime() ?? 0) - (b.paidAt?.getTime() ?? 0))
    .map((p, i) => {
      const kept = !cancelled && online && i === 0;
      const owed = kept ? Math.max(0, p.amount - order.total) : p.amount;
      const reason: RefundReason = cancelled ? 'cancelled' : !online ? 'paid_other_way' : kept ? 'over_total' : 'duplicate';
      return { paymentId: p.id, due: money(owed - p.refundedAmount), reason };
    })
    .filter((r) => r.due >= 1);
}

export type PaymentView = { status: 'awaiting' | 'paid' | 'refund_pending' | 'refunded'; amount: number; refundDue: number };

/** The customer's view of an order's online payment; null for a cash order. */
export function toPaymentView(
  order: { status: string; total: number; paymentMethod: string | null },
  payments: PaymentLike[]
): PaymentView | null {
  const paid = payments.filter((p) => p.status === 'paid');
  if (paid.length === 0) {
    return order.status === 'AWAITING_PAYMENT' ? { status: 'awaiting', amount: order.total, refundDue: 0 } : null;
  }
  const amount = money(paid.reduce((s, p) => s + p.amount, 0));
  const refundDue = money(refundsDueForOrder(order, payments).reduce((s, r) => s + r.due, 0));
  const refunded = money(paid.reduce((s, p) => s + p.refundedAmount, 0));
  const fullyBack = order.status === 'CANCELLED' || !isOnlinePaid(order.paymentMethod);
  const status: PaymentView['status'] = refundDue > 0 ? 'refund_pending' : refunded > 0 && fullyBack ? 'refunded' : 'paid';
  return { status, amount, refundDue };
}

/** Where Safepay sends the customer back: the request's Origin, when the CORS rule allows it. */
export function resolveReturnOrigin(origin: string | undefined, allowedOrigins: string[]): string | null {
  if (!origin) return null;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const ok = allowedOrigins.includes(url.origin)
    || url.hostname.endsWith('.vercel.app')
    || url.hostname === 'localhost'
    || url.hostname === '127.0.0.1';
  return ok ? url.origin : null;
}

/**
 * The tracker of a Safepay webhook that reports a completed payment, else null. The payload shape is
 * to be confirmed against a real sandbox webhook (see the spec); keep this function and its test in step.
 */
export function webhookTracker(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, any>;
  const data = b.data && typeof b.data === 'object' ? b.data : {};
  const tracker = data.tracker ?? data.notification?.tracker ?? data.token;
  const type = String(b.type ?? data.type ?? '').toLowerCase();
  const state = String(data.state ?? data.notification?.state ?? '').toUpperCase();
  const paid = type === 'payment:created' || type === 'payment.succeeded' || state === 'PAID' || state === 'TRACKER_ENDED';
  return typeof tracker === 'string' && tracker.length > 0 && paid ? tracker : null;
}

/** For an order already paid online: why an edit must be refused, or null. */
export function onlinePaidEditBlock(p: { newPaymentMethod?: string | null; newTotal?: number; paidAmount: number }): string | null {
  if (p.newPaymentMethod !== undefined && !isOnlinePaid(p.newPaymentMethod)) return PAID_ONLINE_EDIT_MESSAGE;
  if (p.newTotal !== undefined && p.newTotal > p.paidAmount + 0.5) return PAID_ONLINE_EDIT_MESSAGE;
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/user/Ovenisto-backend && npx vitest run src/modules/payments/__tests__/payment.rules.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
cd /home/user/Ovenisto-backend
git add src/modules/payments/payment.rules.ts src/modules/payments/__tests__/payment.rules.test.ts
git -c user.name="Awais" -c user.email="142393489+MAwais08@users.noreply.github.com" commit -m "Add the rules for website online payments and refunds due"
```

---

### Task 3: Schema, branch switch, customer status

**Files:**
- Modify: `prisma/schema.prisma` (enum `OrderStatus`, model `Order` relations, new model `OrderPayment`)
- Modify: `src/modules/website/website.helpers.ts` (`WebsiteConfig`, `readWebsiteConfig`, `toWebsiteOrderStatus`)
- Test: `src/modules/website/__tests__/website.helpers.test.ts`

**Interfaces:**
- Produces: Prisma `OrderStatus.AWAITING_PAYMENT`, `prisma.orderPayment`, `Order.payments`; `WebsiteConfig.onlinePayment: boolean`; `toWebsiteOrderStatus` returns `'awaiting_payment'` for `AWAITING_PAYMENT`.

- [ ] **Step 1: Write the failing tests** — in `src/modules/website/__tests__/website.helpers.test.ts`:

Add `onlinePayment: false,` after `mealHours: {},` in the `dummyConfig` literal (top of file). Then add inside the `describe('toWebsiteOrderStatus', ...)` block:

```ts
    it('maps AWAITING_PAYMENT to awaiting_payment', () => {
      expect(toWebsiteOrderStatus({ status: 'AWAITING_PAYMENT', type: 'DELIVERY' }, null)).toBe('awaiting_payment');
    });
```

and at the end of the top-level `describe('website.helpers.ts', ...)` block:

```ts
  describe('readWebsiteConfig onlinePayment', () => {
    it('is off unless the branch switched it on', () => {
      expect(readWebsiteConfig(null).onlinePayment).toBe(false);
      expect(readWebsiteConfig({}).onlinePayment).toBe(false);
      expect(readWebsiteConfig({ onlinePayment: true }).onlinePayment).toBe(true);
      expect(readWebsiteConfig({ onlinePayment: 'true' }).onlinePayment).toBe(true);
      expect(readWebsiteConfig({ onlinePayment: 'yes' }).onlinePayment).toBe(false);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/user/Ovenisto-backend && DATABASE_URL=postgresql://u:p@localhost:5432/db JWT_SECRET=$(printf '0%.0s' {1..32}) npx vitest run src/modules/website/__tests__/website.helpers.test.ts`
Expected: FAIL — `awaiting_payment` expected, got `pending`; `onlinePayment` is `undefined`.

- [ ] **Step 3: Implement the helpers** — in `src/modules/website/website.helpers.ts`:

In `interface WebsiteConfig`, after the `mealHours` line add:

```ts
  /** Branch switch for "Pay online" (Safepay). It shows only when the server also has the Safepay keys. */
  onlinePayment: boolean;
```

In `readWebsiteConfig`, add `onlinePayment: false,` to `defaults` (after `mealHours: {},`); after the `reservationsEnabled` line add:

```ts
  const onlinePayment = obj.onlinePayment === true || obj.onlinePayment === 'true';
```

and change the return to:

```ts
  return { enabled, deliveryFee, freeDeliveryAbove, minOrder, prepTimeMinutes, reservationsEnabled, location, hours, mealHours, onlinePayment };
```

In `toWebsiteOrderStatus`, add as the first case:

```ts
    case 'AWAITING_PAYMENT': return 'awaiting_payment';
```

- [ ] **Step 4: Change the schema** — in `prisma/schema.prisma`:

In `enum OrderStatus`, after `SCHEDULED @map("scheduled")` add:

```prisma
  AWAITING_PAYMENT @map("awaiting_payment") // website order waiting for its online payment; staff don't see it
```

In `model Order`'s relations, after `kitchenDealProgress  OrderKitchenDealProgress[]` add:

```prisma
  payments             OrderPayment[]
```

Directly before `model OrderKitchenProgress {` add:

```prisma
// One online payment attempt (Safepay) for a website order. What is owed back is derived from these
// rows (payments/payment.rules.ts refundsDueForOrder), never stored.
model OrderPayment {
  id              String    @id @default(uuid())
  orderId         String
  provider        String    @default("safepay") @db.VarChar(20)
  tracker         String    @unique @db.VarChar(100)
  amount          Decimal   @db.Decimal(10, 2)
  status          String    @default("initiated") @db.VarChar(20) // initiated | paid
  refundedAmount  Decimal   @default(0) @db.Decimal(10, 2)
  returnOrigin    String?   @db.VarChar(200)
  paidAt          DateTime?
  refundedAt      DateTime?
  refundedByName  String?   @db.VarChar(100)
  refundReference String?   @db.VarChar(100)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([orderId])
  @@index([status])
  @@map("order_payments")
}
```

- [ ] **Step 5: Regenerate the client (no DB connection) and run tests + typecheck**

Run: `cd /home/user/Ovenisto-backend && npm run db:generate && DATABASE_URL=postgresql://u:p@localhost:5432/db JWT_SECRET=$(printf '0%.0s' {1..32}) npx vitest run src/modules/website/__tests__/website.helpers.test.ts && npm run typecheck`
Expected: generate OK; tests PASS; typecheck prints no errors. Do NOT run `db:push` (production DB). The columns and the table arrive with the deploy's `preDeployCommand`.

- [ ] **Step 6: Commit**

```bash
cd /home/user/Ovenisto-backend
git add prisma/schema.prisma src/modules/website/website.helpers.ts src/modules/website/__tests__/website.helpers.test.ts
git -c user.name="Awais" -c user.email="142393489+MAwais08@users.noreply.github.com" commit -m "Add the order payment table and the awaiting-payment order status"
```

---

### Task 4: Keep unpaid orders out of staff views; Cash Hub; edit lock

**Files:**
- Modify: `src/modules/order/order.controller.ts` (`resolveOrdersWhere` ~line 376; `updateOrder` ~line 1165)
- Modify: `src/modules/reports/reports.controller.ts` (~lines 44 and 459)
- Modify: `src/modules/delivery/delivery.controller.ts` (~line 283)
- Modify: `src/modules/customer/customer.controller.ts` (~line 20)
- Modify: `src/modules/cash-settlement/cash-settlement.service.ts` (`classifyOrderCash`)
- Test: `src/modules/cash-settlement/__tests__/cash-settlement.classify.test.ts`

**Interfaces:**
- Consumes: `isOnlinePaid`, `onlinePaidEditBlock`, `ONLINE_PAYMENT_METHOD` (Task 2); Prisma `AWAITING_PAYMENT`, `tx.orderPayment` (Task 3).

- [ ] **Step 1: Write the failing test** — append inside the `describe('classifyOrderCash', ...)` block of `src/modules/cash-settlement/__tests__/cash-settlement.classify.test.ts`:

```ts
  it('skips an order paid online: the money is in the bank, not a drawer', () => {
    expect(classifyOrderCash(order('Online (Safepay)'))).toBeNull();
    expect(classifyOrderCash(order('Online (Safepay)', { type: 'DELIVERY', riderId: 'r1' }))).toBeNull();
  });
```

(If the block is not named `classifyOrderCash`, add it in the `describe` that holds the other `classifyOrderCash(...)` expectations.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/user/Ovenisto-backend && DATABASE_URL=postgresql://u:p@localhost:5432/db JWT_SECRET=$(printf '0%.0s' {1..32}) npx vitest run src/modules/cash-settlement/__tests__/cash-settlement.classify.test.ts`
Expected: FAIL — received `{ cashierAmount: 1508, ... }`, expected `null`.

- [ ] **Step 3: Cash Hub skip** — in `src/modules/cash-settlement/cash-settlement.service.ts`, add to the imports:

```ts
import { isOnlinePaid } from '../payments/payment.rules.js';
```

and in `classifyOrderCash`, directly after `const pm = order.paymentMethod || '';` add:

```ts
  // Paid online (Safepay): the money went to the business bank account, not to anyone's drawer.
  if (isOnlinePaid(pm)) return null;
```

- [ ] **Step 4: Run test to verify it passes**

Run: same as Step 2. Expected: PASS.

- [ ] **Step 5: Hide AWAITING_PAYMENT from staff queries**

`src/modules/order/order.controller.ts`, in `resolveOrdersWhere`, replace:

```ts
    where.status = mapped.length > 1 ? { in: mapped } : mapped[0];
  }
  if (type) {
```

with:

```ts
    where.status = mapped.length > 1 ? { in: mapped } : mapped[0];
  } else {
    // A website order still waiting for its online payment isn't an order staff should see yet.
    where.status = { not: 'AWAITING_PAYMENT' };
  }
  if (type) {
```

`src/modules/reports/reports.controller.ts`, replace `prisma.order.count({ where: baseWhere }),` with:

```ts
    prisma.order.count({ where: { ...baseWhere, status: { not: 'AWAITING_PAYMENT' } } }),
```

and replace `where: { ...outletFilter, createdAt: { gte: day.gte, lte: day.lte } },` (the live-status `groupBy`) with:

```ts
      where: { ...outletFilter, createdAt: { gte: day.gte, lte: day.lte }, status: { not: 'AWAITING_PAYMENT' } },
```

`src/modules/delivery/delivery.controller.ts`, replace `status: { notIn: ['CANCELLED', 'COMPLETED'] },` with:

```ts
            status: { notIn: ['CANCELLED', 'COMPLETED', 'AWAITING_PAYMENT'] },
```

`src/modules/customer/customer.controller.ts`, in `getCustomerStatsMap`, replace `where: gte && lte ? { createdAt: { gte, lte } } : {},` with:

```ts
    where: { status: { not: 'AWAITING_PAYMENT' }, ...(gte && lte ? { createdAt: { gte, lte } } : {}) },
```

- [ ] **Step 6: Edit lock in updateOrder** — `src/modules/order/order.controller.ts`, add to the imports:

```ts
import { isOnlinePaid, onlinePaidEditBlock } from '../payments/payment.rules.js';
```

Inside `updateOrder`'s `prisma.$transaction`, replace:

```ts
    return tx.order.update({
      where: { id },
      data: dataToUpdate,
```

with:

```ts
    // Paid online: the method can't change, and the total can't go above what was paid.
    if (isOnlinePaid(existing.paymentMethod)) {
      const kept = await tx.orderPayment.findFirst({
        where: { orderId: id, status: 'paid' },
        orderBy: { paidAt: 'asc' },
        select: { amount: true },
      });
      const block = onlinePaidEditBlock({
        newPaymentMethod: dataToUpdate.paymentMethod,
        newTotal: dataToUpdate.total !== undefined ? Number(dataToUpdate.total) : undefined,
        paidAmount: kept ? Number(kept.amount) : 0,
      });
      if (block) throw ApiError.conflict(block);
    }
    return tx.order.update({
      where: { id },
      data: dataToUpdate,
```

- [ ] **Step 7: Run the full backend suite and typecheck**

Run: `cd /home/user/Ovenisto-backend && DATABASE_URL=postgresql://u:p@localhost:5432/db JWT_SECRET=$(printf '0%.0s' {1..32}) npx vitest run && npm run typecheck && grep -rn "setInterval" src`
Expected: all tests PASS; typecheck clean; the grep prints nothing.

- [ ] **Step 8: Commit**

```bash
cd /home/user/Ovenisto-backend
git add src/modules/order/order.controller.ts src/modules/reports/reports.controller.ts src/modules/delivery/delivery.controller.ts src/modules/customer/customer.controller.ts src/modules/cash-settlement/cash-settlement.service.ts src/modules/cash-settlement/__tests__/cash-settlement.classify.test.ts
git -c user.name="Awais" -c user.email="142393489+MAwais08@users.noreply.github.com" commit -m "Keep unpaid online orders out of staff views and Cash Hub

A website order waiting for its online payment is not an order yet, and
money paid online goes to the bank, not to anyone's drawer. A paid-online
order also can't be switched to another method or raised above what the
customer paid."
```

---

### Task 5: Payment service (DB side)

**Files:**
- Create: `src/modules/payments/payment.service.ts`

**Interfaces:**
- Consumes: Task 1 (`readSafepayConfig`, `createTracker`, `buildCheckoutUrl`), Task 2 (rules), Task 3 (Prisma models), `mapOrderOut` from `src/modules/order/order.controller.ts`, `emitOrderEvent` from `src/socket.ts`.
- Produces: `safepayConfig: SafepayConfig | null`, `returnOriginOf(req): string | null`, `apiBaseOf(req): string`, `startPayment(order, { returnOrigin, apiBase }): Promise<string>`, `confirmPayment(tracker): Promise<void>`, `expireStalePaymentOrders(where?): Promise<void>`, `switchToCash(orderId): Promise<void>`, `listRefundsDue(scope): Promise<RefundDueRow[]>`, `markRefunded(paymentId, scope, by, reference): Promise<{ paymentId: string; refunded: number }>`.

This file is DB glue only; its decisions are the tested pure rules from Task 2. No unit test (the repo tests pure helpers only; DB tests need the owner's OK).

- [ ] **Step 1: Write the service** — `src/modules/payments/payment.service.ts`

```ts
// Website online payment (Safepay): the DB side. Decisions are the pure rules in payment.rules.ts;
// the gateway calls are in safepay.ts.
import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { emitOrderEvent } from '../../socket.js';
import { mapOrderOut } from '../order/order.controller.js';
import { readSafepayConfig, createTracker, buildCheckoutUrl } from './safepay.js';
import {
  ONLINE_PAYMENT_METHOD, PAYMENT_WINDOW_MS, PAYMENT_EXPIRED_REASON, decideConfirm, refundsDueForOrder,
  resolveReturnOrigin, toPaymentLike, type RefundReason,
} from './payment.rules.js';

/** Null when the server has no (or incomplete) Safepay keys: "Pay online" is then never offered. */
export const safepayConfig = readSafepayConfig(process.env);

const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim());

/** The website origin to send the customer back to after checkout (the request's Origin, if allowed). */
export const returnOriginOf = (req: Request) => resolveReturnOrigin(req.get('origin'), allowedOrigins);

/** This API's public base URL (`trust proxy` makes req.protocol https behind Railway). */
export const apiBaseOf = (req: Request) => `${req.protocol}://${req.get('host')}/api`;

const ORDER_EVENT_INCLUDE = {
  items: { include: { menuItem: { select: { category: { select: { name: true } } } } } },
} satisfies Prisma.OrderInclude;

async function emitOrder(orderId: string, event: 'order:created' | 'order:updated') {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: ORDER_EVENT_INCLUDE });
  if (order) emitOrderEvent(event, mapOrderOut(order));
}

/** Starts a Safepay checkout for an order waiting for payment; returns the URL to send the customer to. */
export async function startPayment(
  order: { id: string; orderNumber: string; total: unknown },
  ctx: { returnOrigin: string; apiBase: string }
): Promise<string> {
  if (!safepayConfig) throw ApiError.conflict("Online payment isn't available right now");
  const amount = Number(order.total);
  const token = await createTracker(safepayConfig, amount);
  const payment = await prisma.orderPayment.create({
    data: { orderId: order.id, tracker: token, amount, returnOrigin: ctx.returnOrigin },
  });
  return buildCheckoutUrl(safepayConfig, {
    token,
    orderId: order.orderNumber,
    redirectUrl: `${ctx.apiBase}/payments/safepay/return?pid=${payment.id}`,
    cancelUrl: `${ctx.returnOrigin}/order/${order.id}?payment=cancelled`,
  });
}

/**
 * A verified Safepay confirmation (the return or the webhook). Idempotent, and the order row is locked
 * so the two arriving together act once.
 */
export async function confirmPayment(tracker: string): Promise<void> {
  const result = await prisma.$transaction(async (tx) => {
    const found = await tx.orderPayment.findUnique({ where: { tracker }, select: { id: true, orderId: true } });
    if (!found) return null;
    await tx.$queryRaw`SELECT 1 FROM "orders" WHERE id = ${found.orderId} FOR UPDATE`;
    const payment = await tx.orderPayment.findUnique({ where: { id: found.id } });
    const order = await tx.order.findUnique({ where: { id: found.orderId }, select: { id: true, status: true, paymentMethod: true } });
    if (!payment || !order) return null;
    const otherPaid = await tx.orderPayment.count({ where: { orderId: order.id, status: 'paid', id: { not: payment.id } } });
    const decision = decideConfirm(payment, order, otherPaid > 0);
    if (decision === 'already') return null;

    await tx.orderPayment.update({ where: { id: payment.id }, data: { status: 'paid', paidAt: new Date() } });
    if (decision === 'activate') {
      await tx.order.update({ where: { id: order.id }, data: { status: 'PENDING', paymentMethod: ONLINE_PAYMENT_METHOD } });
    } else if (decision === 'mark-paid') {
      await tx.order.update({ where: { id: order.id }, data: { paymentMethod: ONLINE_PAYMENT_METHOD } });
    }
    return { orderId: order.id, event: decision === 'activate' ? ('order:created' as const) : ('order:updated' as const) };
  });
  // 'activate' announces the order to staff for the first time (inbox, toast, beep).
  if (result) await emitOrder(result.orderId, result.event);
}

/** Cancels orders whose online payment window has passed. Read paths call this; there is no timer. */
export async function expireStalePaymentOrders(where: Prisma.OrderWhereInput = {}): Promise<void> {
  await prisma.order.updateMany({
    where: { ...where, status: 'AWAITING_PAYMENT', createdAt: { lt: new Date(Date.now() - PAYMENT_WINDOW_MS) } },
    data: { status: 'CANCELLED', rejectionReason: PAYMENT_EXPIRED_REASON },
  });
}

/** "Pay cash instead": the order becomes a normal cash website order and reaches staff now. */
export async function switchToCash(orderId: string): Promise<void> {
  const changed = await prisma.order.updateMany({ where: { id: orderId, status: 'AWAITING_PAYMENT' }, data: { status: 'PENDING' } });
  if (changed.count === 0) throw ApiError.conflict('This order is no longer waiting for payment');
  await emitOrder(orderId, 'order:created');
}

export interface RefundDueRow {
  paymentId: string;
  due: number;
  paid: number;
  reason: RefundReason;
  tracker: string;
  paidAt: Date | null;
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  phone: string | null;
  orderStatus: string;
}

const REFUND_ORDER_SELECT = {
  id: true, orderNumber: true, customerName: true, phone: true, status: true, total: true, paymentMethod: true, outletId: true,
  payments: { select: { id: true, status: true, amount: true, refundedAmount: true, paidAt: true, tracker: true } },
} satisfies Prisma.OrderSelect;

/** Every website payment with money owed back, for the outlet (newest orders first). */
export async function listRefundsDue(scope: string | null): Promise<RefundDueRow[]> {
  await expireStalePaymentOrders(scope ? { outletId: scope } : {});
  const orders = await prisma.order.findMany({
    where: { ...(scope ? { outletId: scope } : {}), orderSource: 'website', payments: { some: { status: 'paid' } } },
    select: REFUND_ORDER_SELECT,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return orders.flatMap((o) =>
    refundsDueForOrder({ status: o.status, total: Number(o.total), paymentMethod: o.paymentMethod }, o.payments.map(toPaymentLike))
      .map((d) => {
        const p = o.payments.find((x) => x.id === d.paymentId)!;
        return {
          paymentId: d.paymentId,
          due: d.due,
          paid: Number(p.amount),
          reason: d.reason,
          tracker: p.tracker,
          paidAt: p.paidAt,
          orderId: o.id,
          orderNumber: o.orderNumber,
          customerName: o.customerName,
          phone: o.phone,
          orderStatus: o.status.toLowerCase(),
        };
      })
  );
}

/** Staff refunded a payment from the Safepay dashboard: record the amount currently due as refunded. */
export async function markRefunded(
  paymentId: string,
  scope: string | null,
  by: { name?: string | null } | undefined,
  reference: string | null
): Promise<{ paymentId: string; refunded: number }> {
  const payment = await prisma.orderPayment.findUnique({
    where: { id: paymentId },
    include: { order: { select: REFUND_ORDER_SELECT } },
  });
  if (!payment || (scope && payment.order.outletId !== scope)) throw ApiError.notFound('Payment not found');
  const due = refundsDueForOrder(
    { status: payment.order.status, total: Number(payment.order.total), paymentMethod: payment.order.paymentMethod },
    payment.order.payments.map(toPaymentLike)
  ).find((d) => d.paymentId === paymentId)?.due ?? 0;
  if (due <= 0) throw ApiError.badRequest('Nothing is owed back on this payment');

  // Guarded on the amount read above, so a double click can't record the refund twice.
  const updated = await prisma.orderPayment.updateMany({
    where: { id: paymentId, refundedAmount: payment.refundedAmount },
    data: { refundedAmount: { increment: due }, refundedAt: new Date(), refundedByName: by?.name ?? null, refundReference: reference },
  });
  if (updated.count === 0) throw ApiError.conflict('This refund was just recorded. Refresh to see it.');
  await emitOrder(payment.orderId, 'order:updated');
  return { paymentId, refunded: due };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /home/user/Ovenisto-backend && npm run typecheck`
Expected: no errors. (If `satisfies Prisma.OrderSelect` complains about the nested select, change it to `as const` and keep the same fields.)

- [ ] **Step 3: Commit**

```bash
cd /home/user/Ovenisto-backend
git add src/modules/payments/payment.service.ts
git -c user.name="Awais" -c user.email="142393489+MAwais08@users.noreply.github.com" commit -m "Add the payment service: start, confirm, expire, refunds due"
```

---

### Task 6: Routes and website endpoints

**Files:**
- Create: `src/modules/payments/payment.controller.ts`
- Create: `src/modules/payments/payment.routes.ts`
- Modify: `src/routes/index.ts` (mount `/payments`)
- Modify: `src/app.ts` (CORS skipped for `/api/payments/safepay/*`)
- Modify: `src/modules/website/website.schema.ts` (`paymentChoice`)
- Modify: `src/modules/website/website.controller.ts` (create order, config, status view, pay / pay-cash)
- Modify: `src/modules/website/website.routes.ts` (two routes)
- Test: `src/modules/website/__tests__/website.schema.test.ts`

**Interfaces:**
- Consumes: Task 5 service functions; Task 2 `webhookTracker`, `toPaymentView`, `toPaymentLike`, `ONLINE_ORIGIN_MESSAGE`; Task 1 signature checks; `WEBSITE_ORDER_APPROVER_ROLES` from `src/modules/order/order.acceptance.ts`.
- Produces (HTTP):
  - `POST /api/website/orders` body `paymentChoice?: 'online' | 'cash'` → `{ orderId, orderNumber, total, status: 'pending' | 'awaiting_payment', checkoutUrl: string | null }`
  - `POST /api/website/orders/:id/pay` (customer) → `{ checkoutUrl }`
  - `POST /api/website/orders/:id/pay-cash` (customer) → `{ orderId, status: 'pending' }`
  - `GET /api/website/config` → adds `onlinePaymentAvailable: boolean`
  - `GET /api/website/orders/:id/status` and `/api/website/my/orders` → each view adds `payment: { status, amount, refundDue } | null`
  - `POST /api/payments/safepay/return?pid=` → 303 to `{origin}/order/:id?payment=done|failed`
  - `POST /api/payments/safepay/webhook` → 200
  - `GET /api/payments/refunds-due` (staff) → `RefundDueRow[]`
  - `POST /api/payments/:id/refunded` (staff) body `{ reference? }` → `{ paymentId, refunded }`

- [ ] **Step 1: Write the failing schema test** — in `src/modules/website/__tests__/website.schema.test.ts` change the import to:

```ts
import { reservationSchema, quoteReservationSchema, createOrderSchema } from '../website.schema.js';
```

and append:

```ts
describe('createOrderSchema paymentChoice', () => {
  const order = { outletId: OUTLET, orderType: 'Take Away', items: [ITEM], customerName: 'Test', customerPhone: '0300-1234567' };

  it('defaults to cash, so an older website keeps working', () => {
    expect(createOrderSchema.parse(order).paymentChoice).toBe('cash');
  });

  it('accepts online', () => {
    expect(createOrderSchema.parse({ ...order, paymentChoice: 'online' }).paymentChoice).toBe('online');
  });

  it('rejects anything else', () => {
    expect(createOrderSchema.safeParse({ ...order, paymentChoice: 'card' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/user/Ovenisto-backend && npx vitest run src/modules/website/__tests__/website.schema.test.ts`
Expected: FAIL — `paymentChoice` is `undefined`.

- [ ] **Step 3: Schema field** — in `src/modules/website/website.schema.ts`, inside `createOrderSchema = quoteCartSchema.extend({`, after `clientRequestId: z.string().max(64).optional(),` add:

```ts
  paymentChoice: z.enum(['online', 'cash']).optional().default('cash'),
```

Run Step 2's command again. Expected: PASS.

- [ ] **Step 4: Payment controller** — `src/modules/payments/payment.controller.ts`

```ts
import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { resolveOutletScope } from '../../middleware/outletScope.js';
import { prisma } from '../../config/database.js';
import { isValidReturnSignature, isValidWebhookSignature } from './safepay.js';
import { webhookTracker } from './payment.rules.js';
import { safepayConfig, confirmPayment, listRefundsDue, markRefunded } from './payment.service.js';

/** POST /api/payments/safepay/return?pid= — Safepay posts the customer's browser here after checkout. */
export const safepayReturn = asyncHandler(async (req: Request, res: Response) => {
  const pid = typeof req.query.pid === 'string' ? req.query.pid : '';
  const payment = pid ? await prisma.orderPayment.findUnique({ where: { id: pid } }) : null;
  if (!payment || !payment.returnOrigin) throw ApiError.notFound('Payment not found');

  const tracker = req.body?.tracker;
  const ok = !!safepayConfig && tracker === payment.tracker && isValidReturnSignature(safepayConfig, tracker, req.body?.sig);
  if (ok) await confirmPayment(payment.tracker);
  else console.warn(`[safepay] return with a bad signature for payment ${payment.id}`);

  res.redirect(303, `${payment.returnOrigin}/order/${payment.orderId}?payment=${ok ? 'done' : 'failed'}`);
});

/** POST /api/payments/safepay/webhook — Safepay's server-to-server notice. */
export const safepayWebhook = asyncHandler(async (req: Request, res: Response) => {
  if (!safepayConfig || !isValidWebhookSignature(safepayConfig, req.body?.data, req.get('x-sfpy-signature'))) {
    console.warn('[safepay] webhook with a bad signature');
    throw ApiError.unauthorized('Invalid signature');
  }
  const tracker = webhookTracker(req.body);
  if (tracker) await confirmPayment(tracker);
  else console.info('[safepay] webhook ignored:', String(req.body?.type ?? 'no type'));
  res.json(ApiResponse.success({ received: true }));
});

/** GET /api/payments/refunds-due — website payments with money owed back (Order Monitor inbox). */
export const getRefundsDue = asyncHandler(async (req: Request, res: Response) => {
  res.json(ApiResponse.success(await listRefundsDue(resolveOutletScope(req))));
});

/** POST /api/payments/:id/refunded { reference? } — staff refunded it from the Safepay dashboard. */
export const postRefunded = asyncHandler(async (req: Request, res: Response) => {
  const raw = req.body?.reference;
  const reference = typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, 100) : null;
  const result = await markRefunded(req.params.id, resolveOutletScope(req), req.user, reference);
  res.json(ApiResponse.success(result, 'Refund recorded'));
});
```

- [ ] **Step 5: Payment routes** — `src/modules/payments/payment.routes.ts`

```ts
import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { WEBSITE_ORDER_APPROVER_ROLES } from '../order/order.acceptance.js';
import { safepayReturn, safepayWebhook, getRefundsDue, postRefunded } from './payment.controller.js';

export const paymentsRouter = Router();

// Safepay calls these (the customer's browser, and Safepay's server): no staff login, the signature is the check.
paymentsRouter.post('/safepay/return', safepayReturn);
paymentsRouter.post('/safepay/webhook', safepayWebhook);

// Whoever may decline a website order may also record its refund.
paymentsRouter.get('/refunds-due', authenticate, authorize(WEBSITE_ORDER_APPROVER_ROLES), getRefundsDue);
paymentsRouter.post('/:id/refunded', authenticate, authorize(WEBSITE_ORDER_APPROVER_ROLES), postRefunded);
```

In `src/routes/index.ts` add the import next to the website one:

```ts
import { paymentsRouter } from '../modules/payments/payment.routes.js';
```

and after `router.use('/website', websiteRouter);` add:

```ts
router.use('/payments', paymentsRouter);
```

- [ ] **Step 6: CORS skip for Safepay** — in `src/app.ts`, replace:

```ts
app.use(
  cors({
```

with:

```ts
const corsMiddleware = (
  cors({
```

and, right after that block's closing `);` (the line after `allowedHeaders: ['Content-Type', 'Authorization', 'X-Outlet-Id'],` / `  })`), add:

```ts
// Safepay posts the customer's browser back to /api/payments/safepay/return from its own domain, and calls
// the webhook from its server. Neither needs CORS headers, and the origin check would reject Safepay's
// domain with a 500, so these two paths skip it. They check Safepay's signature instead.
app.use((req, res, next) => (req.path.startsWith('/api/payments/safepay/') ? next() : corsMiddleware(req, res, next)));
```

- [ ] **Step 7: Website controller** — `src/modules/website/website.controller.ts`

Add imports:

```ts
import { safepayConfig, startPayment, switchToCash, expireStalePaymentOrders, returnOriginOf, apiBaseOf } from '../payments/payment.service.js';
import { toPaymentView, toPaymentLike, ONLINE_ORIGIN_MESSAGE } from '../payments/payment.rules.js';
```

In `getConfig`, after `const acceptingReservations = outlet.isActive && config.reservationsEnabled;` add:

```ts
  // "Pay online" shows only when the branch switched it on AND the server has the Safepay keys.
  const onlinePaymentAvailable = acceptingOrders && config.onlinePayment && !!safepayConfig;
```

and add `onlinePaymentAvailable,` to the response object after `acceptingReservations,`.

In `createWebsiteOrder`:

1. Add `paymentChoice` to the destructured `req.body` fields (after `clientRequestId`).
2. In the `if (existing) { ... }` idempotency branch, replace `status: 'pending'` with:

```ts
        status: toWebsiteOrderStatus(existing, null),
        checkoutUrl: null,
```

3. Directly after the `if (!phone) { ... }` block add:

```ts
  // Pay online: the branch must offer it and the server must have the Safepay keys. The browser's origin
  // is where Safepay sends the customer back, so it has to be one the CORS rule allows.
  const payOnline = paymentChoice === 'online';
  const returnOrigin = payOnline ? returnOriginOf(req) : null;
  if (payOnline) {
    const branchConfig = readWebsiteConfig((await getOutletSettings(priced.outlet.id))?.websiteConfig);
    if (!branchConfig.onlinePayment || !safepayConfig) {
      throw ApiError.conflict("Online payment isn't available for this branch right now");
    }
    if (!returnOrigin) throw ApiError.badRequest(ONLINE_ORIGIN_MESSAGE);
  }
```

4. In `prisma.order.create({ data: { ... } })`, after `paymentMethod: 'Pending',` add:

```ts
      status: payOnline ? 'AWAITING_PAYMENT' : 'PENDING',
```

5. Replace the end of the handler:

```ts
  const createdOut = mapOrderOut(order);
  emitOrderEvent('order:created', createdOut);

  res.status(201).json(ApiResponse.success({
    orderId: order.id,
    orderNumber: order.orderNumber,
    total: Number(order.total),
    status: 'pending'
  }));
});
```

with:

```ts
  if (payOnline && returnOrigin) {
    // Staff see it only once Safepay confirms the payment (payment.service.ts confirmPayment).
    let checkoutUrl: string | null = null;
    try {
      checkoutUrl = await startPayment(order, { returnOrigin, apiBase: apiBaseOf(req) });
    } catch (err) {
      // The order page still offers Pay now / Pay cash instead.
      console.error(`[safepay] could not start a payment for ${order.orderNumber}:`, err);
    }
    res.status(201).json(ApiResponse.success({
      orderId: order.id,
      orderNumber: order.orderNumber,
      total: Number(order.total),
      status: 'awaiting_payment',
      checkoutUrl,
    }));
    return;
  }

  const createdOut = mapOrderOut(order);
  emitOrderEvent('order:created', createdOut);

  res.status(201).json(ApiResponse.success({
    orderId: order.id,
    orderNumber: order.orderNumber,
    total: Number(order.total),
    status: 'pending',
    checkoutUrl: null,
  }));
});
```

In `getWebsiteOrderStatus`, after the UUID format check add:

```ts
  await expireStalePaymentOrders({ id });
```

In `ORDER_STATUS_INCLUDE`, add:

```ts
  payments: { select: { id: true, status: true, amount: true, refundedAmount: true, paidAt: true } },
```

In `toOrderStatusView`'s returned object, after `createdAt: order.createdAt` add (with a comma on the line before):

```ts
    payment: toPaymentView(
      { status: order.status, total: Number(order.total), paymentMethod: order.paymentMethod },
      order.payments.map(toPaymentLike)
    ),
```

In `getMyWebsiteOrders`, replace the `prisma.order.findMany({ where: { customerUid: signedInUid(res), orderSource: 'website' },` start with:

```ts
  const uid = signedInUid(res);
  await expireStalePaymentOrders({ customerUid: uid });
  const orders = await prisma.order.findMany({
    where: { customerUid: uid, orderSource: 'website' },
```

(keeping the rest of that call unchanged).

Add after `getMyWebsiteOrders`:

```ts
const ORDER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The signed-in customer's own website order that is still waiting for its online payment. */
async function loadAwaitingOrder(req: Request, res: Response) {
  const uid = signedInUid(res);
  const { id } = req.params;
  if (!ORDER_ID_RE.test(id)) throw ApiError.badRequest('Invalid order ID format');
  await expireStalePaymentOrders({ id });
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order || order.orderSource !== 'website' || order.customerUid !== uid) throw ApiError.notFound('Order not found');
  if (order.status !== 'AWAITING_PAYMENT') throw ApiError.conflict('This order is no longer waiting for payment');
  return order;
}

/** POST /website/orders/:id/pay — a new Safepay checkout for the same order (try again). */
export const payWebsiteOrder = asyncHandler(async (req: Request, res: Response) => {
  const order = await loadAwaitingOrder(req, res);
  const returnOrigin = returnOriginOf(req);
  if (!returnOrigin) throw ApiError.badRequest(ONLINE_ORIGIN_MESSAGE);
  let checkoutUrl: string;
  try {
    checkoutUrl = await startPayment(order, { returnOrigin, apiBase: apiBaseOf(req) });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    console.error(`[safepay] could not start a payment for ${order.orderNumber}:`, err);
    throw ApiError.conflict("Couldn't open the payment page. Try again in a minute, or pay cash instead.");
  }
  res.json(ApiResponse.success({ checkoutUrl }));
});

/** POST /website/orders/:id/pay-cash — give up on paying online; it becomes a normal cash order. */
export const payCashWebsiteOrder = asyncHandler(async (req: Request, res: Response) => {
  const order = await loadAwaitingOrder(req, res);
  await switchToCash(order.id);
  res.json(ApiResponse.success({ orderId: order.id, status: 'pending' }));
});
```

- [ ] **Step 8: Website routes** — in `src/modules/website/website.routes.ts`, add `payWebsiteOrder, payCashWebsiteOrder` to the import from `./website.controller.js`, and after the `websiteRouter.post('/orders', ...)` line add:

```ts
websiteRouter.post('/orders/:id/pay', orderLimiter, requireWebsiteCustomer, payWebsiteOrder);
websiteRouter.post('/orders/:id/pay-cash', orderLimiter, requireWebsiteCustomer, payCashWebsiteOrder);
```

- [ ] **Step 9: Full suite, typecheck, build**

Run: `cd /home/user/Ovenisto-backend && DATABASE_URL=postgresql://u:p@localhost:5432/db JWT_SECRET=$(printf '0%.0s' {1..32}) npx vitest run && npm run typecheck && npm run build && grep -rn "setInterval" src`
Expected: all tests PASS; typecheck clean; build succeeds; the grep prints nothing.

- [ ] **Step 10: Commit**

```bash
cd /home/user/Ovenisto-backend
git add src/modules/payments src/routes/index.ts src/app.ts src/modules/website
git -c user.name="Awais" -c user.email="142393489+MAwais08@users.noreply.github.com" commit -m "Let website customers pay online through Safepay

A paid order reaches staff only after Safepay confirms the payment, from
the signed return or the webhook. Customers can try again or switch to
cash, and unpaid orders expire after 30 minutes on the next read. Staff
get a refunds-due list for paid orders that were cancelled or reduced."
```

---

### Task 7: Backend docs and push

**Files:**
- Modify: `CLAUDE.md` (new section before `## Public Website API (/api/website)`)

- [ ] **Step 1: Document** — add this section to `CLAUDE.md` directly before `## Public Website API (/api/website)`:

```markdown
## Website online payment — Safepay (2026-10-12, owner)
- **Module `src/modules/payments/`:** `safepay.ts` (our own client matching SDK `@sfpy/node-sdk` 3.0.2: `POST /order/v1/init` → tracker,
  checkout URL with `beacon`, return `sig` = HMAC-SHA256(v1Secret, tracker), webhook `x-sfpy-signature` = HMAC-SHA512(webhookSecret,
  JSON.stringify(body.data)); tested), `payment.rules.ts` (pure, tested), `payment.service.ts` (DB), `payment.controller.ts` + `payment.routes.ts`
  at `/api/payments`. Env (all optional, all four = on): `SAFEPAY_ENV` (sandbox|production), `SAFEPAY_API_KEY`, `SAFEPAY_V1_SECRET`,
  `SAFEPAY_WEBHOOK_SECRET`. The SDK has **no refund call**: refunds are done in the Safepay dashboard.
- **Flow:** `POST /website/orders` `paymentChoice: 'online'` (default `cash`; needs `websiteConfig.onlinePayment` and the keys, else 409)
  creates the order as **`OrderStatus.AWAITING_PAYMENT`** without `order:created`, starts a tracker and returns `checkoutUrl` (null if
  Safepay is down). `POST /api/payments/safepay/return?pid=` (signed) and `/webhook` (signed) both run `confirmPayment(tracker)`:
  locks the order row; `decideConfirm` → activate (PENDING + `paymentMethod 'Online (Safepay)'` + `order:created`) / mark-paid
  (switched-to-cash, still unpaid) / refund-only. `POST /website/orders/:id/pay` (retry) and `/pay-cash` (→ normal cash order). An
  order unpaid after 30 min is cancelled "Payment not completed" by `expireStalePaymentOrders` on read paths only (status, my orders,
  pay, pay-cash, refunds-due). The two Safepay paths skip CORS in `app.ts` (Safepay's domain would 500 the origin check).
- **Hidden until paid:** `resolveOrdersWhere` adds `status: { not: 'AWAITING_PAYMENT' }` when no status is asked for; also the sales
  report count, the dashboard live-status groupBy, unassigned deliveries and customer stats. Reports already filter COMPLETED.
- **Money:** `classifyOrderCash` returns null for `Online (Safepay)` (bank, not a drawer). Riders collect 0 (already true for any paid
  method). `updateOrder` on a paid-online order refuses (409) another `paymentMethod` or a total above what was paid
  (`onlinePaidEditBlock`).
- **Refunds:** `OrderPayment` (`order_payments`: tracker unique, amount, status initiated|paid, `refundedAmount`). Refund due is
  **derived** (`refundsDueForOrder`): cancelled / paid another way / duplicate → full; the kept payment owes `amount − total` when items were
  removed; minus `refundedAmount`. `GET /api/payments/refunds-due`, `POST /api/payments/:id/refunded` (website-order approver roles; guarded
  update so a double click records once). Customer status views carry `payment: { status: awaiting|paid|refund_pending|refunded, amount,
  refundDue } | null`.
- **To confirm in the sandbox:** amount unit (rupees assumed), the redirect POST fields, the webhook payload (`webhookTracker` guesses
  `data.tracker` + `payment:created`/`PAID`/`TRACKER_ENDED`), a tracker status lookup. Schema arrives with the deploy's `db:push` (additive).
```

- [ ] **Step 2: Verify the tree and push**

Run:
```bash
cd /home/user/Ovenisto-backend
git add CLAUDE.md
git -c user.name="Awais" -c user.email="142393489+MAwais08@users.noreply.github.com" commit -m "Document website online payment in CLAUDE.md"
git log -6 --format='%an <%ae> | %s' && git status --short
for i in 1 2 3 4 5; do git push -u origin develop && break; sleep $((2**i)); done
```
Expected: every commit shows `Awais <142393489+MAwais08@users.noreply.github.com>`; status is clean; push succeeds.

---

## Part B — Public website (`/home/user/Ovenisto_Frontend_Website`)

### Task 8: Types, hooks and payment helpers

**Files:**
- Modify: `src/types/api.ts`
- Modify: `src/hooks/useCheckout.ts`
- Modify: `src/lib/orderStatus.ts`
- Create: `src/lib/payment.ts`
- Test: `src/lib/payment.test.ts`, `src/lib/orderStatus.test.ts`

**Interfaces:**
- Produces: `type PaymentChoice = 'online' | 'cash'`; `WebsiteConfig.onlinePaymentAvailable?: boolean`; `CreateOrderInput.paymentChoice?`; `CreateOrderResult.checkoutUrl?: string | null`; `OrderStatus` includes `'awaiting_payment'`; `interface OrderPaymentView { status: 'awaiting' | 'paid' | 'refund_pending' | 'refunded'; amount: number; refundDue: number }`; `OrderStatusView.payment?: OrderPaymentView | null`; `usePayOrder()`, `usePayCash()`; `isSafepayCheckoutUrl(url): url is string`, `paymentNote(payment, type, cancelled): string`, `parsePaymentReturn(value): 'done' | 'cancelled' | 'failed' | null`, `PAYMENT_EXPIRED_REASON`.

- [ ] **Step 0: Baseline** (deps are not installed in a fresh clone)

Run: `cd /home/user/Ovenisto_Frontend_Website && npm install && npm test 2>&1 | tail -4 && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"; npm run lint 2>&1 | tail -3`
Record the test count, TypeScript error count and lint problem count; later steps must not raise them.

- [ ] **Step 1: Write the failing tests**

`src/lib/payment.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isSafepayCheckoutUrl, paymentNote, parsePaymentReturn } from './payment';

describe('isSafepayCheckoutUrl', () => {
  it("accepts only Safepay's checkout pages", () => {
    expect(isSafepayCheckoutUrl('https://sandbox.api.getsafepay.com/checkout?beacon=track_1')).toBe(true);
    expect(isSafepayCheckoutUrl('https://getsafepay.com/checkout?beacon=track_1')).toBe(true);
    expect(isSafepayCheckoutUrl('https://getsafepay.com.evil.com/checkout')).toBe(false);
    expect(isSafepayCheckoutUrl('https://getsafepay.com/login')).toBe(false);
    expect(isSafepayCheckoutUrl('javascript:alert(1)')).toBe(false);
    expect(isSafepayCheckoutUrl(null)).toBe(false);
  });
});

describe('paymentNote', () => {
  it('keeps the cash wording for a cash order', () => {
    expect(paymentNote(null, 'Take Away', false)).toBe('Cash only. Pay at the counter on pickup.');
    expect(paymentNote(null, 'Delivery', false)).toBe('Cash only. Pay the rider on delivery.');
    expect(paymentNote(null, 'Delivery', true)).toBe('');
  });
  it('describes an online payment at each stage', () => {
    expect(paymentNote({ status: 'awaiting', amount: 1500, refundDue: 0 }, 'Delivery', false)).toBe('Waiting for your online payment.');
    expect(paymentNote({ status: 'paid', amount: 1500, refundDue: 0 }, 'Delivery', false)).toBe('Paid online. Nothing to pay on delivery.');
    expect(paymentNote({ status: 'paid', amount: 1500, refundDue: 0 }, 'Take Away', false)).toBe('Paid online. Nothing to pay at pickup.');
    expect(paymentNote({ status: 'refund_pending', amount: 1500, refundDue: 1500 }, 'Delivery', true)).toBe('Your payment of Rs. 1,500 will be refunded.');
    expect(paymentNote({ status: 'refunded', amount: 1500, refundDue: 0 }, 'Delivery', true)).toBe('Your payment was refunded.');
  });
});

describe('parsePaymentReturn', () => {
  it('reads ?payment= from the Safepay return', () => {
    expect(parsePaymentReturn('done')).toBe('done');
    expect(parsePaymentReturn('cancelled')).toBe('cancelled');
    expect(parsePaymentReturn('failed')).toBe('failed');
    expect(parsePaymentReturn('other')).toBeNull();
    expect(parsePaymentReturn(null)).toBeNull();
  });
});
```

In `src/lib/orderStatus.test.ts`, inside `describe('orderStatusView', ...)` add:

```ts
  it('shows an unpaid online order as payment pending', () => {
    expect(orderStatusView('awaiting_payment', 'Delivery')).toEqual({ label: 'Payment pending', tone: 'waiting' });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/user/Ovenisto_Frontend_Website && npx vitest run src/lib/payment.test.ts src/lib/orderStatus.test.ts`
Expected: FAIL — `./payment` not found; label `awaiting_payment` instead of `Payment pending`.

- [ ] **Step 3: Implement**

`src/lib/payment.ts`:

```ts
// Website online payment (Safepay): what the checkout and tracking pages need. Pure.
import { formatPrice } from './format';
import type { OrderPaymentView, OrderType } from '../types/api';

/** Safepay's checkout pages (live and sandbox). The browser is only ever sent to one of these. */
const SAFEPAY_CHECKOUT_ORIGINS = ['https://getsafepay.com', 'https://sandbox.api.getsafepay.com'];

/** The reason the server gives an order that wasn't paid in time (backend payment.rules.ts). */
export const PAYMENT_EXPIRED_REASON = 'Payment not completed';

export function isSafepayCheckoutUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    return SAFEPAY_CHECKOUT_ORIGINS.includes(u.origin) && u.pathname.startsWith('/checkout');
  } catch {
    return false;
  }
}

/** The line about money on the tracking page. */
export function paymentNote(payment: OrderPaymentView | null | undefined, type: OrderType, cancelled: boolean): string {
  const pickup = type === 'Take Away';
  if (!payment) return cancelled ? '' : `Cash only. Pay ${pickup ? 'at the counter on pickup' : 'the rider on delivery'}.`;
  switch (payment.status) {
    case 'awaiting': return 'Waiting for your online payment.';
    case 'paid': return `Paid online. Nothing to pay ${pickup ? 'at pickup' : 'on delivery'}.`;
    case 'refund_pending': return `Your payment of ${formatPrice(payment.refundDue)} will be refunded.`;
    case 'refunded': return 'Your payment was refunded.';
  }
}

export type PaymentReturn = 'done' | 'cancelled' | 'failed' | null;

/** `?payment=` on /order/:id after Safepay sends the customer back. */
export function parsePaymentReturn(value: string | null): PaymentReturn {
  return value === 'done' || value === 'cancelled' || value === 'failed' ? value : null;
}
```

`src/types/api.ts`:
- In `interface WebsiteConfig`, after `currency: string;` add:

```ts
  /** "Pay online" (Safepay): the branch offers it and the server has the keys. Absent on an older backend. */
  onlinePaymentAvailable?: boolean;
```

- After `export type BookingType = ...` add:

```ts
export type PaymentChoice = 'online' | 'cash';
```

- In `interface CreateOrderInput`, after `clientRequestId?: string;` add `paymentChoice?: PaymentChoice;`
- In `interface CreateOrderResult`, after `status: string;` add:

```ts
  /** Safepay's checkout page for an online payment; null for cash, or when Safepay couldn't be reached. */
  checkoutUrl?: string | null;
```

- Change `export type OrderStatus = 'pending' | ...` to start with `'awaiting_payment' | 'pending' | ...` (keep the rest).
- Before `export interface OrderStatusView` add:

```ts
export interface OrderPaymentView {
  status: 'awaiting' | 'paid' | 'refund_pending' | 'refunded';
  amount: number;
  refundDue: number;
}
```

- In `interface OrderStatusView`, after `createdAt: string;` add `payment?: OrderPaymentView | null;`

`src/lib/orderStatus.ts`, in `orderStatusView`'s switch, add as the first case:

```ts
    case 'awaiting_payment': return { label: 'Payment pending', tone: 'waiting' };
```

`src/hooks/useCheckout.ts`, after `usePlaceOrder` add:

```ts
// Retry an online payment for an order still waiting for it (a new Safepay checkout).
export function usePayOrder() {
  return useMutation({
    mutationFn: async (orderId: string) =>
      apiPost<{ checkoutUrl: string }>(`/website/orders/${orderId}/pay`, {}, { token: await currentIdToken() })
  });
}

// Give up on paying online: the order becomes a cash order and goes to the branch.
export function usePayCash() {
  return useMutation({
    mutationFn: async (orderId: string) =>
      apiPost<{ orderId: string; status: string }>(`/website/orders/${orderId}/pay-cash`, {}, { token: await currentIdToken() })
  });
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `cd /home/user/Ovenisto_Frontend_Website && npx vitest run src/lib/payment.test.ts src/lib/orderStatus.test.ts && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"`
Expected: PASS; error count equals the Step 0 baseline.

- [ ] **Step 5: Commit**

```bash
cd /home/user/Ovenisto_Frontend_Website
git add src/types/api.ts src/hooks/useCheckout.ts src/lib/orderStatus.ts src/lib/orderStatus.test.ts src/lib/payment.ts src/lib/payment.test.ts
git -c user.name="Awais" -c user.email="142393489+MAwais08@users.noreply.github.com" commit -m "Add the types, hooks and helpers for paying online"
```

---

### Task 9: Checkout payment choice

**Files:**
- Modify: `src/pages/CheckoutPage.tsx`

**Interfaces:**
- Consumes: `PaymentChoice`, `config.onlinePaymentAvailable`, `CreateOrderResult.checkoutUrl` (Task 8), `isSafepayCheckoutUrl` (Task 8).

- [ ] **Step 1: Imports** — change the React import to `import { useState, useRef, useEffect, type ElementType } from "react";`, add `CreditCard` to the `lucide-react` import, and add:

```ts
import { isSafepayCheckoutUrl } from "@/lib/payment";
import type { PaymentChoice } from "@/types/api";
```

(merge `PaymentChoice` into the existing `import type { QuoteLine } from "@/types/api";` line).

- [ ] **Step 2: Payment option card** — directly after the `StepHeading` component definition add:

```tsx
const PaymentOption = ({ selected, onSelect, title, detail, icon: Icon }: {
  selected: boolean; onSelect: () => void; title: string; detail: string; icon: ElementType;
}) => (
  <button
    type="button" role="radio" aria-checked={selected} onClick={onSelect}
    className={`flex w-full items-center gap-4 rounded-2xl border-2 p-4 sm:p-5 text-left transition-colors ${selected ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/30"}`}
  >
    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${selected ? "gradient-cta" : "border-2 border-border"}`}>
      {selected && <Check className="h-3.5 w-3.5" />}
    </span>
    <div className="flex-1 min-w-0">
      <p className="font-bold">{title}</p>
      <p className="text-sm text-muted-foreground">{detail}</p>
    </div>
    <Icon className="h-7 w-7 shrink-0 text-primary" />
  </button>
);
```

- [ ] **Step 3: State** — after `const [promoError, setPromoError] = useState("");` add:

```ts
  // "Pay online" only when the branch offers it; otherwise the order is cash, whatever was picked.
  const [paymentChoice, setPaymentChoice] = useState<PaymentChoice>("cash");
  const onlineAvailable = !!config?.onlinePaymentAvailable;
  const choice: PaymentChoice = onlineAvailable ? paymentChoice : "cash";
  const payOnline = choice === "online";
```

- [ ] **Step 4: Submit** — in `handleSubmit`'s `placeOrderMut.mutate({ ... })` payload, after `clientRequestId: clientRequestIdRef.current` add `, paymentChoice: choice` (so the line reads `clientRequestId: clientRequestIdRef.current,` then `paymentChoice: choice`). Replace the `onSuccess` body with:

```ts
      onSuccess: (data) => {
        saveRecentOrder({
          id: data.orderId,
          number: data.orderNumber,
          date: new Date().toISOString(),
          type: orderType
        });
        // Navigate first: clearing the cart on this page triggers its empty-cart redirect.
        navigate(`/order/${data.orderId}`, { replace: true });
        clearCart();
        // Paying online: on to Safepay. If it couldn't be reached, the order page offers Pay now.
        if (payOnline && isSafepayCheckoutUrl(data.checkoutUrl)) {
          window.location.assign(data.checkoutUrl);
        }
      },
```

- [ ] **Step 5: Payment step** — replace the whole `{/* Payment: cash is the only method */}` `<motion.div>` block with:

```tsx
              {/* Payment: online (Safepay) when the branch offers it, else cash */}
              <motion.div variants={fadeUp}>
                <StepHeading n={nextStep()} title="Payment" />
                <div role="radiogroup" aria-label="Payment method" className="grid gap-3">
                  {onlineAvailable && (
                    <PaymentOption
                      selected={choice === "online"}
                      onSelect={() => setPaymentChoice("online")}
                      title="Pay online"
                      detail="Card, bank account or Easypaisa, on Safepay's secure page."
                      icon={CreditCard}
                    />
                  )}
                  <PaymentOption
                    selected={choice === "cash"}
                    onSelect={() => setPaymentChoice("cash")}
                    title={`Cash ${isDelivery ? "on delivery" : "at pickup"}`}
                    detail="Pay when you receive your order. Nothing to pay now."
                    icon={Banknote}
                  />
                </div>
              </motion.div>
```

- [ ] **Step 6: Button and footnote** — in the submit button, replace:

```tsx
                          {placeOrderMut.isPending ? "Placing order..." : quoteUpdating ? (
                            <><RefreshCw className="h-4 w-4 animate-spin" /> Updating prices...</>
                          ) : (
                            <><Lock className="h-4 w-4" /> Place Order — {formatPrice(quote.total)}</>
                          )}
```

with:

```tsx
                          {placeOrderMut.isPending ? (payOnline ? "Opening payment..." : "Placing order...") : quoteUpdating ? (
                            <><RefreshCw className="h-4 w-4 animate-spin" /> Updating prices...</>
                          ) : payOnline ? (
                            <><Lock className="h-4 w-4" /> Pay {formatPrice(quote.total)} online</>
                          ) : (
                            <><Lock className="h-4 w-4" /> Place Order — {formatPrice(quote.total)}</>
                          )}
```

and replace the footnote:

```tsx
                    <p className="mt-3 text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
                      <Banknote className="h-3.5 w-3.5" /> Cash {isDelivery ? "on delivery" : "at pickup"} — nothing to pay now.
                    </p>
```

with:

```tsx
                    <p className="mt-3 text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
                      {payOnline ? (
                        <><CreditCard className="h-3.5 w-3.5" /> You'll pay on Safepay's secure page.</>
                      ) : (
                        <><Banknote className="h-3.5 w-3.5" /> Cash {isDelivery ? "on delivery" : "at pickup"} — nothing to pay now.</>
                      )}
                    </p>
```

- [ ] **Step 7: Typecheck, lint, tests**

Run: `cd /home/user/Ovenisto_Frontend_Website && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"; npx eslint src/pages/CheckoutPage.tsx; npm test 2>&1 | tail -4`
Expected: TS count = baseline; no new lint problems in the file (compare with `git stash; npx eslint src/pages/CheckoutPage.tsx; git stash pop` if unsure); tests PASS.

- [ ] **Step 8: Commit**

```bash
cd /home/user/Ovenisto_Frontend_Website
git add src/pages/CheckoutPage.tsx
git -c user.name="Awais" -c user.email="142393489+MAwais08@users.noreply.github.com" commit -m "Offer Pay online at checkout when the branch accepts it"
```

---

### Task 10: Tracking page payment panel

**Files:**
- Modify: `src/pages/OrderStatusPage.tsx`

**Interfaces:**
- Consumes: `usePayOrder`, `usePayCash`, `paymentNote`, `parsePaymentReturn`, `isSafepayCheckoutUrl`, `PAYMENT_EXPIRED_REASON`, `OrderStatusView.payment` (Task 8).

- [ ] **Step 1: Imports** — change the router import to `import { useParams, Link, useSearchParams } from "react-router-dom";`, add `CreditCard` to the `lucide-react` import, change the hooks import to `import { useOrderStatus, useMyOrders, usePayOrder, usePayCash } from "@/hooks/useCheckout";`, and add:

```ts
import { useToast } from "@/hooks/use-toast";
import { paymentNote, parsePaymentReturn, isSafepayCheckoutUrl, PAYMENT_EXPIRED_REASON } from "@/lib/payment";
```

- [ ] **Step 2: Hooks** — after `const mine = useMyOrders(user?.uid ?? null);` add:

```ts
  const [searchParams] = useSearchParams();
  const returned = parsePaymentReturn(searchParams.get("payment"));
  const payMut = usePayOrder();
  const cashMut = usePayCash();
  const { toast } = useToast();
```

- [ ] **Step 3: Derived values and handlers** — after `const typeLabel = order.type === 'Take Away' ? 'Pickup' : 'Delivery';` add:

```ts
  const awaiting = order.status === 'awaiting_payment';
  const expired = isCancelled && order.rejectionReason === PAYMENT_EXPIRED_REASON;
  const note = paymentNote(order.payment, order.type, isCancelled);
  const paying = payMut.isPending || cashMut.isPending;
  const errorMessage = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

  const handlePayNow = () => payMut.mutate(order.orderId, {
    onSuccess: ({ checkoutUrl }) => {
      if (isSafepayCheckoutUrl(checkoutUrl)) window.location.assign(checkoutUrl);
      else toast({ title: "Couldn't open the payment page", description: "Try again, or pay cash instead.", variant: "destructive" });
    },
    onError: (e) => {
      toast({ title: "Couldn't open the payment page", description: errorMessage(e, "Try again in a minute."), variant: "destructive" });
      refetch();
    },
  });

  const handlePayCash = () => cashMut.mutate(order.orderId, {
    onSuccess: () => refetch(),
    onError: (e) => {
      toast({ title: "Couldn't switch to cash", description: errorMessage(e, "Try again."), variant: "destructive" });
      refetch();
    },
  });
```

- [ ] **Step 4: Hero title** — replace the `title={...}` prop of `<PageHero>` with:

```tsx
        title={awaiting ? <>Complete Your <span className="text-cta">Payment</span></> : isCancelled ? <>Order <span className="text-cta">Cancelled</span></> : <>Track Your <span className="text-cta">Order</span></>}
```

- [ ] **Step 5: Headline** — replace:

```tsx
                  {isCancelled ? "The branch couldn't accept this order" : stepHint(order.status, order.type)}
```

with:

```tsx
                  {awaiting ? "Pay online to send your order to the branch."
                    : expired ? "This order wasn't paid in time"
                    : isCancelled ? "The branch couldn't accept this order"
                    : stepHint(order.status, order.type)}
```

- [ ] **Step 6: Body** — replace `{isCancelled ? (` (the line that opens the cancelled panel) with:

```tsx
            {awaiting ? (
              <div className="mt-6 rounded-2xl bg-muted/60 p-5">
                {(returned === 'cancelled' || returned === 'failed') && (
                  <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <AlertCircle className="h-4 w-4 shrink-0 text-cta" /> Payment didn't go through. You can try again.
                  </p>
                )}
                {returned === 'done' && (
                  <p className="mb-3 text-sm font-semibold">We're confirming your payment. This page updates by itself.</p>
                )}
                <p className="text-sm text-muted-foreground">
                  Pay {formatPrice(order.total)} online, or pay cash instead. An unpaid order is cancelled after 30 minutes.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button" onClick={handlePayNow} disabled={paying}
                    className="gradient-cta inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold shadow-md shadow-cta/25 disabled:opacity-50"
                  >
                    <CreditCard className="h-4 w-4" /> {payMut.isPending ? "Opening payment..." : "Pay now"}
                  </button>
                  <button
                    type="button" onClick={handlePayCash} disabled={paying}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-border font-semibold hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    <Banknote className="h-4 w-4" /> {cashMut.isPending ? "Switching..." : `Pay cash ${order.type === 'Take Away' ? 'at pickup' : 'on delivery'} instead`}
                  </button>
                </div>
              </div>
            ) : isCancelled ? (
```

In the cancelled panel, replace:

```tsx
                <p className="text-sm font-semibold mb-1">Reason from the branch</p>
                <p className="text-sm text-muted-foreground">{order.rejectionReason || "No reason was given."}</p>
```

with:

```tsx
                <p className="text-sm font-semibold mb-1">{expired ? "Why it was cancelled" : "Reason from the branch"}</p>
                <p className="text-sm text-muted-foreground">
                  {expired ? "The online payment wasn't completed within 30 minutes. Nothing was charged." : order.rejectionReason || "No reason was given."}
                </p>
                {note && <p className="mt-3 text-sm font-semibold">{note}</p>}
```

- [ ] **Step 7: Money note** — replace the block:

```tsx
                {live && (
                  <p className="mt-4 flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
                    <Banknote className="h-4 w-4 shrink-0" />
                    Cash only. Pay {order.type === 'Take Away' ? 'at the counter on pickup' : 'the rider on delivery'}.
                  </p>
                )}
```

with:

```tsx
                {live && note && (
                  <p className="mt-4 flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
                    {order.payment ? <CreditCard className="h-4 w-4 shrink-0" /> : <Banknote className="h-4 w-4 shrink-0" />}
                    {note}
                  </p>
                )}
```

- [ ] **Step 8: Typecheck, lint, tests, build**

Run: `cd /home/user/Ovenisto_Frontend_Website && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"; npx eslint src/pages/OrderStatusPage.tsx; npm test 2>&1 | tail -4; npm run build 2>&1 | tail -3; git checkout -- dist`
Expected: TS count = baseline; no new lint problems; tests PASS; build succeeds; `dist` restored.

- [ ] **Step 9: Commit**

```bash
cd /home/user/Ovenisto_Frontend_Website
git add src/pages/OrderStatusPage.tsx
git -c user.name="Awais" -c user.email="142393489+MAwais08@users.noreply.github.com" commit -m "Show online payment state on the order tracking page

An unpaid order offers Pay now and Pay cash instead, a Safepay cancel
says the payment didn't go through, and a cancelled paid order tells the
customer their money will be refunded."
```

---

### Task 11: Website docs and push

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Document** — add this bullet group to `CLAUDE.md` under `## Current state — ...`, directly before `- **Client content still to confirm (not code):**`:

```markdown
- **Online payment — Safepay (2026-10-12, owner):** checkout's Payment step offers **Pay online** (card / bank / Easypaisa)
  next to cash, only when `/website/config` returns `onlinePaymentAvailable` (branch switch + server keys). `paymentChoice` goes
  with `POST /website/orders`; the reply's `checkoutUrl` is followed only if `lib/payment.ts` `isSafepayCheckoutUrl` accepts it
  (Safepay checkout origins only; tested). Navigate to `/order/:id` and clear the cart first, then `window.location.assign`.
  - The order is `awaiting_payment` ("Payment pending") until Safepay confirms. `/order/:id` then shows Pay now
    (`usePayOrder` → `/website/orders/:id/pay`) and Pay cash instead (`usePayCash` → `/pay-cash`); `?payment=cancelled|failed|done`
    (`parsePaymentReturn`) explains the return. Unpaid after 30 min → cancelled "Payment not completed" (`PAYMENT_EXPIRED_REASON`).
  - Status views carry `payment: { status: awaiting|paid|refund_pending|refunded, amount, refundDue } | null`; `paymentNote` words
    the money line (cash orders keep "Cash only…"; tested).
```

- [ ] **Step 2: Verify and push**

Run:
```bash
cd /home/user/Ovenisto_Frontend_Website
git add CLAUDE.md
git -c user.name="Awais" -c user.email="142393489+MAwais08@users.noreply.github.com" commit -m "Document online payment in CLAUDE.md"
git status --short && git log -5 --format='%an <%ae> | %s'
for i in 1 2 3 4 5; do git push -u origin develop && break; sleep $((2**i)); done
```
Expected: clean status (no `dist` changes); all commits by Awais; push succeeds.

---

## Part C — Staff app (`/home/user/Ovenisto_Frontend_Software`)

### Task 12: Settings switch

**Files:**
- Modify: `src/lib/websiteConfig.ts`
- Modify: `src/components/settings/WebsiteSettingsTab.tsx`
- Test: `src/lib/websiteConfig.test.ts`

**Interfaces:**
- Produces: `WebsiteConfig.onlinePayment: boolean` (parsed, and written by `buildWebsiteConfig`).

- [ ] **Step 1: Write the failing tests** — in `src/lib/websiteConfig.test.ts`:

Add `onlinePayment: false` to every `WebsiteConfig` literal and to the seed-shape expectation:

```bash
cd /home/user/Ovenisto_Frontend_Software && sed -i 's/^        mealHours: {},$/        mealHours: {},\n        onlinePayment: false,/' src/lib/websiteConfig.test.ts && grep -c "onlinePayment: false," src/lib/websiteConfig.test.ts
```

Expected output: `3`.

In the `'drops legacy keys but keeps unrelated keys and sets new form'` test's `expect(built).toEqual({ ... })`, add `onlinePayment: false,` after its `prepTimeMinutes: 45,` line (the one inside `expect(built).toEqual`).

Append inside `describe('parseWebsiteConfig', ...)`:

```ts
    it('reads the online payment switch', () => {
      expect(parseWebsiteConfig({ onlinePayment: true }).onlinePayment).toBe(true);
      expect(parseWebsiteConfig({ onlinePayment: 'true' }).onlinePayment).toBe(true);
      expect(parseWebsiteConfig({}).onlinePayment).toBe(false);
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/user/Ovenisto_Frontend_Software && npx vitest run src/lib/websiteConfig.test.ts`
Expected: FAIL — `onlinePayment` missing from parsed/built objects.

- [ ] **Step 3: Implement** — in `src/lib/websiteConfig.ts`:

In `interface WebsiteConfig`, after the `mealHours` line add:

```ts
  /** "Pay online" (Safepay) for this branch. The website shows it only when the server also has the Safepay keys. */
  onlinePayment: boolean;
```

In `parseWebsiteConfig`: add `onlinePayment: false,` to `defaults` after `mealHours: {},`; after the `reservationsEnabled` line add:

```ts
  const onlinePayment = obj.onlinePayment === true || obj.onlinePayment === 'true';
```

and change the return to:

```ts
  return { enabled, deliveryFee, freeDeliveryAbove, minOrder, prepTimeMinutes, reservationsEnabled, location, hours, mealHours, onlinePayment };
```

In `buildWebsiteConfig`, after `base.reservationsEnabled = form.reservationsEnabled;` add:

```ts
  base.onlinePayment = form.onlinePayment;
```

In `src/components/settings/WebsiteSettingsTab.tsx`, add `onlinePayment: false,` to the initial `useState<WebsiteConfig>({ ... })` after `mealHours: {},`, and after the "Accept website reservations" switch row (`</div>` closing the row whose `Switch` uses `form.reservationsEnabled`) add:

```tsx
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium">Accept online payment</label>
              <p className="text-xs text-muted-foreground">Customers can pay by card, bank account or Easypaisa through Safepay. It shows on the website only once the Safepay keys are set on the server.</p>
            </div>
            <Switch
              disabled={isDisabled}
              checked={form.onlinePayment}
              onCheckedChange={(c) => setForm({ ...form, onlinePayment: c })}
            />
          </div>
```

- [ ] **Step 4: Run tests and typecheck**

Run: `cd /home/user/Ovenisto_Frontend_Software && npx vitest run src/lib/websiteConfig.test.ts && npm run typecheck 2>&1 | grep -c "error TS"`
Expected: PASS; count `21`.

- [ ] **Step 5: Commit**

```bash
cd /home/user/Ovenisto_Frontend_Software
git add src/lib/websiteConfig.ts src/lib/websiteConfig.test.ts src/components/settings/WebsiteSettingsTab.tsx
git -c user.name="Awais" -c user.email="142393489+MAwais08@users.noreply.github.com" commit -m "Add the Accept online payment switch to Settings > Website"
```

---

### Task 13: Inbox badge, decline note, Refunds due

**Files:**
- Create: `src/lib/onlinePayment.ts`
- Create: `src/lib/onlinePayment.test.ts`
- Create: `src/services/payment.service.ts`
- Modify: `src/hooks/useWebsiteOrders.ts`
- Modify: `src/hooks/use-module-events.ts`
- Modify: `src/components/website/WebsiteOrdersInbox.tsx`

**Interfaces:**
- Consumes (HTTP, Task 6): `GET /payments/refunds-due` → `RefundDue[]`; `POST /payments/:id/refunded` `{ reference? }`.
- Produces: `ONLINE_PAYMENT_METHOD`, `isPaidOnline(o)`, `REFUND_REASON_LABEL`; `paymentService.getRefundsDue()`, `paymentService.markRefunded(paymentId, reference?)`; `useWebsiteOrders()` adds `refundsDue: RefundDue[]`.

- [ ] **Step 1: Write the failing test** — `src/lib/onlinePayment.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { isPaidOnline, REFUND_REASON_LABEL, ONLINE_PAYMENT_METHOD } from "./onlinePayment";

describe("isPaidOnline", () => {
  it("matches only the gateway method the backend writes", () => {
    expect(ONLINE_PAYMENT_METHOD).toBe("Online (Safepay)");
    expect(isPaidOnline({ paymentMethod: "Online (Safepay)" })).toBe(true);
    expect(isPaidOnline({ paymentMethod: "Cash" })).toBe(false);
    expect(isPaidOnline({ paymentMethod: null })).toBe(false);
    expect(isPaidOnline({})).toBe(false);
  });
});

describe("REFUND_REASON_LABEL", () => {
  it("words every reason the backend sends", () => {
    expect(REFUND_REASON_LABEL).toEqual({
      cancelled: "Order cancelled",
      paid_other_way: "Paid another way",
      over_total: "Items removed after payment",
      duplicate: "Paid twice",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/user/Ovenisto_Frontend_Software && npx vitest run src/lib/onlinePayment.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper and the service**

`src/lib/onlinePayment.ts`:

```ts
// Website orders paid online (Safepay). Mirrors the backend's payments/payment.rules.ts.
import type { RefundDue } from "@/services/payment.service";

export const ONLINE_PAYMENT_METHOD = "Online (Safepay)";

export const isPaidOnline = (o: { paymentMethod?: string | null }) => (o.paymentMethod ?? "").trim() === ONLINE_PAYMENT_METHOD;

export const REFUND_REASON_LABEL: Record<RefundDue["reason"], string> = {
  cancelled: "Order cancelled",
  paid_other_way: "Paid another way",
  over_total: "Items removed after payment",
  duplicate: "Paid twice",
};
```

`src/services/payment.service.ts`:

```ts
/**
 * Payment Service - website online payments (Safepay): what is owed back, and recording a refund
 */

import { api } from './api';

export interface RefundDue {
  paymentId: string;
  due: number;
  paid: number;
  reason: 'cancelled' | 'paid_other_way' | 'over_total' | 'duplicate';
  tracker: string;
  paidAt: string | null;
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  phone: string | null;
  orderStatus: string;
}

export const paymentService = {
  async getRefundsDue(): Promise<RefundDue[]> {
    const res = await api.get<{ success: boolean; data: RefundDue[] }>('/payments/refunds-due');
    return res.data;
  },

  async markRefunded(paymentId: string, reference?: string): Promise<{ paymentId: string; refunded: number }> {
    const res = await api.post<{ success: boolean; data: { paymentId: string; refunded: number } }>(`/payments/${paymentId}/refunded`, { reference });
    return res.data;
  },
};
```

Run Step 2's command. Expected: PASS.

- [ ] **Step 4: Hook** — in `src/hooks/useWebsiteOrders.ts`, add `import { paymentService } from '@/services/payment.service';`, add after `pendingQuery`:

```ts
  // Paid online but owed back (declined, cancelled, reduced, or paid twice). Same key prefix, so the
  // watcher's ['website-orders'] invalidation refreshes it too.
  const refundsQuery = useQuery({
    queryKey: ['website-orders', 'refunds-due'],
    queryFn: () => paymentService.getRefundsDue(),
    enabled,
  });
```

and add to the returned object:

```ts
    refundsDue: refundsQuery.data || [],
```

In `src/hooks/use-module-events.ts`, in both the `evt === "order:created"` branch and the `evt.startsWith("order:")` branch, add after `api.clearCache("/orders");`:

```ts
      api.clearCache("/payments");
```

- [ ] **Step 5: Inbox UI** — in `src/components/website/WebsiteOrdersInbox.tsx`:

Imports: add `CreditCard, RotateCcw` to the `lucide-react` import, and add:

```ts
import { Input } from '@/components/ui/input';
import { paymentService, type RefundDue } from '@/services/payment.service';
import { isPaidOnline, REFUND_REASON_LABEL } from '@/lib/onlinePayment';
```

Change `const { pending, isLoading, refresh } = useWebsiteOrders();` to `const { pending, refundsDue, isLoading, refresh } = useWebsiteOrders();`, and after the reject state lines add:

```ts
  const [refundTarget, setRefundTarget] = useState<RefundDue | null>(null);
  const [refundRef, setRefundRef] = useState('');
  const [refunding, setRefunding] = useState(false);

  const handleMarkRefunded = async () => {
    if (!refundTarget) return;
    try {
      setRefunding(true);
      await paymentService.markRefunded(refundTarget.paymentId, refundRef.trim() || undefined);
      toast.success(`Refund recorded for #${refundTarget.orderNumber}`);
      setRefundTarget(null);
      refresh();
    } catch (err: unknown) {
      toast.error(errorText(err, 'Failed to record the refund'));
    } finally {
      setRefunding(false);
    }
  };
```

In `renderCard`, after the type chip `</span>` (the one showing Delivery / Pickup) add:

```tsx
              {isPaidOnline(o) && (
                <span className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                  <CreditCard className="h-3 w-3" /> Paid online
                </span>
              )}
```

In the scroll area, replace `<div className="flex-1 overflow-y-auto p-3 sm:p-4">` and the conditional that follows it, so the area reads:

```tsx
      <div className="flex-1 overflow-y-auto p-3 sm:p-4">
        {refundsDue.length > 0 && (
          <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
            <p className="flex items-center gap-2 text-sm font-extrabold text-foreground">
              <RotateCcw className="h-4 w-4 text-destructive" /> Refunds due ({refundsDue.length})
            </p>
            <p className="mb-3 mt-0.5 text-xs text-muted-foreground">Refund each one from the Safepay dashboard, then mark it here.</p>
            <ul className="space-y-2">
              {refundsDue.map((r) => (
                <li key={r.paymentId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-background px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      #{r.orderNumber} · {r.customerName || 'Guest'}{r.phone ? ` · ${r.phone}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {REFUND_REASON_LABEL[r.reason]} · paid {cur} {r.paid.toLocaleString()} · Safepay {r.tracker}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-black text-destructive">{cur} {r.due.toLocaleString()}</span>
                    <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs font-semibold" onClick={() => { setRefundTarget(r); setRefundRef(''); }}>
                      Mark refunded
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {isLoading && orders.length === 0 ? (
```

(the rest of the existing conditional — loading spinner / empty state / grid — stays exactly as it is).

In the decline dialog, after `<DialogDescription>The guest will be told their order was declined. A reason is optional.</DialogDescription>` add:

```tsx
            {rejectTarget && isPaidOnline(rejectTarget) && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-semibold text-foreground">
                Paid online ({cur} {rejectTarget.total.toLocaleString()}). After declining, refund it from the Safepay dashboard, then mark it under Refunds due.
              </p>
            )}
```

After the decline `</Dialog>` add:

```tsx
      <Dialog open={refundTarget !== null} onOpenChange={(open) => { if (!open && !refunding) setRefundTarget(null); }}>
        <DialogContent className="w-[90vw] max-w-[420px] rounded-2xl">
          <DialogHeader>
            <DialogTitle>Mark refunded{refundTarget ? ` · #${refundTarget.orderNumber}` : ''}</DialogTitle>
            <DialogDescription>
              Confirm you refunded {cur} {refundTarget?.due.toLocaleString()} from the Safepay dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <Label htmlFor="refund-ref" className="text-xs font-semibold">Safepay refund reference (optional)</Label>
            <Input id="refund-ref" value={refundRef} onChange={(e) => setRefundRef(e.target.value)} maxLength={100} disabled={refunding} className="rounded-xl" />
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setRefundTarget(null)} disabled={refunding} className="h-10 flex-1 rounded-xl">Cancel</Button>
            <Button onClick={handleMarkRefunded} disabled={refunding} className="h-10 flex-1 rounded-xl font-bold">
              {refunding ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Mark refunded'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
```

- [ ] **Step 6: Typecheck, lint, tests, build**

Run: `cd /home/user/Ovenisto_Frontend_Software && npm run typecheck 2>&1 | grep -c "error TS"; npx eslint src/components/website/WebsiteOrdersInbox.tsx src/hooks/useWebsiteOrders.ts src/hooks/use-module-events.ts src/lib/onlinePayment.ts src/services/payment.service.ts; npx vitest run 2>&1 | tail -4; npm run build 2>&1 | tail -2`
Expected: `21`; no new lint problems in these files (check against `git stash` if unsure); all tests PASS; build succeeds.

- [ ] **Step 7: Commit**

```bash
cd /home/user/Ovenisto_Frontend_Software
git add src/lib/onlinePayment.ts src/lib/onlinePayment.test.ts src/services/payment.service.ts src/hooks/useWebsiteOrders.ts src/hooks/use-module-events.ts src/components/website/WebsiteOrdersInbox.tsx
git -c user.name="Awais" -c user.email="142393489+MAwais08@users.noreply.github.com" commit -m "Show paid-online website orders and the refunds due in Order Monitor"
```

---

### Task 14: Staff app docs and push

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Document** — add this bullet to `CLAUDE.md` in `## Website Orders inbox ...`, after the `**Website pickup payment is taken on POS ...**` bullet:

```markdown
- **Website online payment — Safepay (2026-10-12, owner; backend CLAUDE.md "Website online payment").** A paid-online order
  arrives with `paymentMethod: "Online (Safepay)"` (`lib/onlinePayment.ts` `isPaidOnline`, tested): a "Paid online" chip on its inbox
  card, nothing to collect on POS or from the rider, skipped by Cash Hub. Declining one says to refund it in the Safepay dashboard.
  The inbox's **Refunds due (N)** list (`useWebsiteOrders().refundsDue`, key `['website-orders','refunds-due']`,
  `paymentService.getRefundsDue` → `GET /payments/refunds-due`) has **Mark refunded** (optional reference →
  `POST /payments/:id/refunded`). `use-module-events` clears the `/payments` GET cache on order events. Settings → Website has
  **Accept online payment** (`websiteConfig.onlinePayment`); the website shows it only once the server has the Safepay keys.
```

- [ ] **Step 2: Verify and push**

Run:
```bash
cd /home/user/Ovenisto_Frontend_Software
git add CLAUDE.md
git -c user.name="Awais" -c user.email="142393489+MAwais08@users.noreply.github.com" commit -m "Document website online payment in CLAUDE.md"
git status --short && git log -5 --format='%an <%ae> | %s'
for i in 1 2 3 4 5; do git push -u origin develop && break; sleep $((2**i)); done
```
Expected: clean status; all commits by Awais; push succeeds.

---

## Part D — Sandbox end to end (needs the owner's Safepay sandbox keys)

### Task 15: Live sandbox run

Not code. Do this only once the owner has given the four sandbox keys and agreed to test rows on **staging** (never production).

- [ ] Set `SAFEPAY_ENV=sandbox`, `SAFEPAY_API_KEY`, `SAFEPAY_V1_SECRET`, `SAFEPAY_WEBHOOK_SECRET` on the **staging** backend service (Railway), deploy `develop`, and register the webhook URL `https://ovenistobackend-staging.up.railway.app/api/payments/safepay/webhook` in the Safepay sandbox dashboard.
- [ ] Switch on Settings → Website → Accept online payment for one staging branch.
- [ ] Confirm the open questions, then fix the code and its tests if any differ:
  - whether `amount` is rupees (`createTracker`);
  - the redirect POST carries `tracker` + `sig` (`safepayReturn`);
  - the webhook payload and its "paid" event (`webhookTracker`);
  - whether a tracker status lookup exists (worth adding to `confirmPayment` if so).
- [ ] Pay with a sandbox card → order appears in Order Monitor with "Paid online" → accept → Ready → complete; Cash Hub shows nothing for it; Sales by Payment Method shows "Online (Safepay)".
- [ ] Cancel on Safepay → "Payment didn't go through" → Pay now → pay → order arrives.
- [ ] Pay cash instead → order arrives as a normal cash order.
- [ ] Decline a paid order → Refunds due lists it → Mark refunded → the customer page says "Your payment was refunded".
- [ ] Delete the ZZTEST orders afterwards (owner's OK first) and report results.

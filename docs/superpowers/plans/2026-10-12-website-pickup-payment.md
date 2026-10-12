# Website Pickup Payment on POS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The cashier collects a website pickup's payment on POS, and the server refuses to complete a website pickup that is still unpaid.

**Architecture:** One pure rule, `isUnpaidWebsitePickup`, exists in both repos (backend `order.acceptance.ts`, frontend `src/lib/websitePickup.ts`). The backend uses it to 409 a completion; POS uses it to list collectable pickups and opens a self-contained `WebsitePickupPaymentDialog` that reads the order's stored money and writes only `paymentMethod` (+ `status: completed` when Ready). Order Monitor loses its collect buttons and stops offering "Complete Order" on an unpaid pickup.

**Tech Stack:** Backend: Express 5 + TypeScript (ESM, `.js` import suffixes) + Prisma, vitest. Frontend: Vite + React 18 + TypeScript, shadcn/Radix UI, lucide-react, sonner, vitest.

**Spec:** `docs/superpowers/specs/2026-10-12-website-pickup-payment-design.md`

## Global Constraints

- Work directly on `develop` in both repos (`/home/user/Ovenisto-backend`, `/home/user/Ovenisto_Frontend_Software`).
- Every commit: `git -c user.name="Awais" -c user.email="142393489+MAwais08@users.noreply.github.com" commit -m "..."`, following the Git conventions in `CLAUDE.md` (no co-author or session trailers).
- Backend ESM imports end in `.js` even for `.ts` files. `order.controller.ts` uses `ApiError.conflict(...)` statics — keep that style.
- Backend `npm test` needs env vars: `DATABASE_URL=postgresql://u:p@localhost:5432/db JWT_SECRET=$(printf '0%.0s' {1..32})`.
- Prisma enums come back as MEMBER names on the backend (`'TAKE_AWAY'`, `'COMPLETED'`); the frontend sees display strings (`"Take Away"`, `"completed"`).
- Frontend UI: no raw Unicode emojis, lucide icons only; theme tokens (`primary`, `muted`, `border`, `destructive`, `success`) — no raw palette colours.
- No schema change, no migration, no new background timer.
- 409 message, verbatim, both repos: `Collect payment for this website pickup on POS first`.
- Split payment string format (same as a POS sale): `Cash: Rs.900, JazzCash: Rs.779`.

---

### Task 0: Install dependencies

- [ ] **Step 1:** `cd /home/user/Ovenisto-backend && npm install` and `cd /home/user/Ovenisto_Frontend_Software && npm install` (fresh clones have no `node_modules/`).
- [ ] **Step 2: Baseline** — backend: `npm run typecheck` and `DATABASE_URL=postgresql://u:p@localhost:5432/db JWT_SECRET=$(printf '0%.0s' {1..32}) npm test`; frontend: `npm run typecheck` and `npm test`. Note any failure that already exists so later tasks don't get blamed for it.

---

### Task 1: Backend — refuse to complete an unpaid website pickup

**Files:**
- Modify: `/home/user/Ovenisto-backend/src/modules/order/order.acceptance.ts`
- Modify: `/home/user/Ovenisto-backend/src/modules/order/order.controller.ts` (import on line 17; `updateOrder` around line 1027; `updateOrderStatus` around line 1607)
- Test: `/home/user/Ovenisto-backend/src/modules/order/__tests__/order.acceptance.test.ts`

**Interfaces:**
- Produces: `isUnpaidWebsitePickup(o: { orderSource: string | null; type: string; paymentMethod: string | null }): boolean` and `UNPAID_WEBSITE_PICKUP_MESSAGE: string`, both exported from `order.acceptance.ts`.

- [ ] **Step 1: Write the failing test** — append to `order.acceptance.test.ts` and add `isUnpaidWebsitePickup` to its import line:

```ts
import { requiresAcceptance, isAwaitingAcceptance, canApproveOrder, isUnpaidWebsitePickup } from '../order.acceptance.js';
```

```ts
describe('isUnpaidWebsitePickup', () => {
  const pickup = { orderSource: 'website', type: 'TAKE_AWAY', paymentMethod: 'Pending' as string | null };

  it('is true for a website Take Away with no real payment', () => {
    for (const paymentMethod of [null, '', 'Pending', 'pending', ' UNPAID ']) {
      expect(isUnpaidWebsitePickup({ ...pickup, paymentMethod })).toBe(true);
    }
  });

  it('is false once a payment method is recorded', () => {
    expect(isUnpaidWebsitePickup({ ...pickup, paymentMethod: 'Cash' })).toBe(false);
    expect(isUnpaidWebsitePickup({ ...pickup, paymentMethod: 'Cash: Rs.900, JazzCash: Rs.779' })).toBe(false);
  });

  it('ignores website deliveries and non-website orders', () => {
    expect(isUnpaidWebsitePickup({ ...pickup, type: 'DELIVERY' })).toBe(false);
    expect(isUnpaidWebsitePickup({ ...pickup, orderSource: null })).toBe(false);
    expect(isUnpaidWebsitePickup({ ...pickup, orderSource: 'self-order' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd /home/user/Ovenisto-backend && DATABASE_URL=postgresql://u:p@localhost:5432/db JWT_SECRET=$(printf '0%.0s' {1..32}) npx vitest run src/modules/order/__tests__/order.acceptance.test.ts`
Expected: FAIL — `isUnpaidWebsitePickup` is not a function / not exported.

- [ ] **Step 3: Implement** — append to `order.acceptance.ts`:

```ts
/**
 * A website pickup (Take Away) is paid at the POS counter, not online. It is created with
 * `cashApproved: true`, so once COMPLETED every report counts it as revenue — while Cash Hub skips a
 * `Pending` payment and the money is on nobody's balance. Completing one is refused until paid.
 */
export const UNPAID_WEBSITE_PICKUP_MESSAGE = 'Collect payment for this website pickup on POS first';

export function isUnpaidWebsitePickup(o: { orderSource: string | null; type: string; paymentMethod: string | null }): boolean {
  if (o.orderSource !== 'website' || o.type !== 'TAKE_AWAY') return false;
  const pm = (o.paymentMethod ?? '').trim().toLowerCase();
  return pm === '' || pm === 'pending' || pm === 'unpaid';
}
```

- [ ] **Step 4: Run the test to see it pass** (same command as Step 2). Expected: PASS, all `order.acceptance.ts` tests green.

- [ ] **Step 5: Wire the gate into `updateOrderStatus`** — in `order.controller.ts`, extend the import on line 17:

```ts
import { requiresAcceptance, isAwaitingAcceptance, canApproveOrder, AWAITING_ACCEPTANCE_WHERE, isUnpaidWebsitePickup, UNPAID_WEBSITE_PICKUP_MESSAGE } from './order.acceptance.js';
```

and directly after the existing block

```ts
  if (isAwaitingAcceptance(existing) && ['PREPARING', 'READY', 'COMPLETED'].includes(prismaStatus)) {
    throw ApiError.conflict('Cannot change status: order is awaiting acceptance');
  }
```

add:

```ts
  if (prismaStatus === 'COMPLETED' && isUnpaidWebsitePickup(existing)) {
    throw ApiError.conflict(UNPAID_WEBSITE_PICKUP_MESSAGE);
  }
```

- [ ] **Step 6: Wire the gate into `updateOrder`** — directly after
`if (customerType !== undefined) dataToUpdate.customerType = customerType || null;` and before `const order = await prisma.$transaction(`, add:

```ts
  // Same rule as updateOrderStatus: this endpoint can also set status, so it must not leave a website
  // pickup COMPLETED and unpaid. Only checked when this call touches status or payment, so an
  // unrelated edit to an old completed-unpaid row still goes through.
  if (dataToUpdate.status !== undefined || dataToUpdate.paymentMethod !== undefined) {
    const nextStatus = dataToUpdate.status ?? existing.status;
    const nextOrder = {
      orderSource: existing.orderSource,
      type: dataToUpdate.type ?? existing.type,
      paymentMethod: dataToUpdate.paymentMethod !== undefined ? dataToUpdate.paymentMethod : existing.paymentMethod,
    };
    if (nextStatus === 'COMPLETED' && isUnpaidWebsitePickup(nextOrder)) {
      throw ApiError.conflict(UNPAID_WEBSITE_PICKUP_MESSAGE);
    }
  }
```

- [ ] **Step 7: Verify** — `npm run typecheck` (expected: no errors) and the full test run `DATABASE_URL=postgresql://u:p@localhost:5432/db JWT_SECRET=$(printf '0%.0s' {1..32}) npm test` (expected: same pass count as the Task 0 baseline + 3).

- [ ] **Step 8: Commit**

```bash
cd /home/user/Ovenisto-backend
git add src/modules/order/order.acceptance.ts src/modules/order/order.controller.ts src/modules/order/__tests__/order.acceptance.test.ts
git -c user.name="Awais" -c user.email="142393489+MAwais08@users.noreply.github.com" commit -m "Refuse to complete an unpaid website pickup" -m "A website Take Away order is saved with cashApproved: true, so completing it unpaid counted it as revenue in every report while Cash Hub skipped it. updateOrderStatus and updateOrder now answer 409 until a payment method is recorded."
```

---

### Task 2: Label website pickup cash in Cash Hub

**Files:**
- Modify: `/home/user/Ovenisto-backend/src/modules/cash-settlement/cash-settlement.service.ts:404-409`
- Modify: `/home/user/Ovenisto_Frontend_Software/src/pages/CashHub.tsx` (lucide import block at the top; `CHANNEL_STYLES` around line 110)

**Interfaces:**
- Produces: the channel string `'Website Pickup'` on Cash Hub balance orders whose `orderSource === 'website'` and `type === 'TAKE_AWAY'`.

- [ ] **Step 1: Backend** — replace `getCashierChannel` with:

```ts
  const getCashierChannel = (orderObj: any): string => {
    const src = (orderObj.orderSource || '').toLowerCase();
    if (src === 'waiter' || src === 'table') return 'Waiter Panel';
    if (src === 'self-order') return 'Self-Order (QR)';
    if (src === 'website' && orderObj.type === 'TAKE_AWAY') return 'Website Pickup';
    return 'POS Counter';
  };
```

- [ ] **Step 2: Frontend** — in `CashHub.tsx` add `Globe` to the `lucide-react` import block (keep alphabetical order the block already uses, or append if it has none), then add a row to `CHANNEL_STYLES` and update the comment above it from "The four" to "The five":

```tsx
  "Website Pickup": { Icon: Globe, className: "bg-muted text-foreground border-border" },
```

- [ ] **Step 3: Verify** — backend `npm run typecheck`; frontend `npm run typecheck`. Expected: no errors.

- [ ] **Step 4: Commit each repo**

```bash
cd /home/user/Ovenisto-backend
git add src/modules/cash-settlement/cash-settlement.service.ts
git -c user.name="Awais" -c user.email="142393489+MAwais08@users.noreply.github.com" commit -m "Label website pickup cash as its own Cash Hub channel"
cd /home/user/Ovenisto_Frontend_Software
git add src/pages/CashHub.tsx
git -c user.name="Awais" -c user.email="142393489+MAwais08@users.noreply.github.com" commit -m "Show the Website Pickup channel in Cash Hub"
```

---

### Task 3: Frontend — pure pickup helpers

**Files:**
- Create: `/home/user/Ovenisto_Frontend_Software/src/lib/websitePickup.ts`
- Test: `/home/user/Ovenisto_Frontend_Software/src/lib/websitePickup.test.ts`

**Interfaces:**
- Consumes: `isAwaitingAcceptance` from `src/lib/orderAcceptance.ts` (`(o: { type: string; orderSource?: string | null; status: string; acceptedById?: string | null }) => boolean`).
- Produces:
  - `interface PickupLike { type: string; orderSource?: string | null; paymentMethod?: string | null; status: string; acceptedById?: string | null }`
  - `isUnpaidWebsitePickup(o: Pick<PickupLike, "type" | "orderSource" | "paymentMethod">): boolean`
  - `isCollectablePickup(o: PickupLike): boolean`
  - `interface PaymentSplit { method: string; amount: number }`
  - `splitTotal(splits: PaymentSplit[]): number`
  - `buildPaymentMethodString(splits: PaymentSplit[]): string`
  - `changeDue(given: number, total: number): number`

- [ ] **Step 1: Write the failing test** — `src/lib/websitePickup.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isUnpaidWebsitePickup, isCollectablePickup, buildPaymentMethodString, splitTotal, changeDue } from "./websitePickup";

const pickup = { type: "Take Away", orderSource: "website", paymentMethod: "Pending" as string | null | undefined, status: "preparing", acceptedById: "u1" as string | null };

describe("isUnpaidWebsitePickup", () => {
  it("is true for a website Take Away with no real payment", () => {
    for (const paymentMethod of [null, undefined, "", "Pending", " pending ", "Unpaid"]) {
      expect(isUnpaidWebsitePickup({ ...pickup, paymentMethod })).toBe(true);
    }
  });

  it("is false once paid, for a delivery, and for other sources", () => {
    expect(isUnpaidWebsitePickup({ ...pickup, paymentMethod: "Cash" })).toBe(false);
    expect(isUnpaidWebsitePickup({ ...pickup, type: "Delivery" })).toBe(false);
    expect(isUnpaidWebsitePickup({ ...pickup, orderSource: "pos" })).toBe(false);
  });
});

describe("isCollectablePickup", () => {
  it("lists accepted, open, unpaid pickups whatever the kitchen stage", () => {
    expect(isCollectablePickup(pickup)).toBe(true);
    expect(isCollectablePickup({ ...pickup, status: "ready" })).toBe(true);
    expect(isCollectablePickup({ ...pickup, status: "pending" })).toBe(true); // accepted, kitchen not started
  });

  it("skips a pickup still waiting for approval", () => {
    expect(isCollectablePickup({ ...pickup, status: "pending", acceptedById: null })).toBe(false);
  });

  it("skips cancelled, completed and paid pickups", () => {
    expect(isCollectablePickup({ ...pickup, status: "cancelled" })).toBe(false);
    expect(isCollectablePickup({ ...pickup, status: "completed" })).toBe(false);
    expect(isCollectablePickup({ ...pickup, paymentMethod: "JazzCash" })).toBe(false);
  });
});

describe("buildPaymentMethodString", () => {
  it("returns the bare method when only one carries an amount", () => {
    expect(buildPaymentMethodString([{ method: "Cash", amount: 1500 }, { method: "JazzCash", amount: 0 }])).toBe("Cash");
  });

  it("uses the POS split format, rounding each part", () => {
    expect(buildPaymentMethodString([{ method: "Cash", amount: 900 }, { method: "JazzCash", amount: 779.4 }])).toBe("Cash: Rs.900, JazzCash: Rs.779");
  });

  it("is empty when nothing was entered", () => {
    expect(buildPaymentMethodString([{ method: "Cash", amount: 0 }])).toBe("");
  });
});

describe("splitTotal", () => {
  it("adds rounded positive parts and ignores blanks and negatives", () => {
    expect(splitTotal([{ method: "Cash", amount: 900.4 }, { method: "Card", amount: 779.6 }, { method: "X", amount: -5 }, { method: "Y", amount: NaN }])).toBe(1680);
  });
});

describe("changeDue", () => {
  it("is what the customer gets back, never negative", () => {
    expect(changeDue(2000, 1679)).toBe(321);
    expect(changeDue(1000, 1679)).toBe(0);
    expect(changeDue(NaN, 1679)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd /home/user/Ovenisto_Frontend_Software && npx vitest run src/lib/websitePickup.test.ts`
Expected: FAIL — cannot resolve `./websitePickup`.

- [ ] **Step 3: Implement** — `src/lib/websitePickup.ts`:

```ts
import { isAwaitingAcceptance } from "./orderAcceptance";

// A website pickup (Take Away) is paid at the POS counter. These mirror the backend's
// `isUnpaidWebsitePickup` (order.acceptance.ts), which refuses to complete one while unpaid —
// keep the two in step.

export interface PickupLike {
  type: string;
  orderSource?: string | null;
  paymentMethod?: string | null;
  status: string;
  acceptedById?: string | null;
}

export function isUnpaidWebsitePickup(o: Pick<PickupLike, "type" | "orderSource" | "paymentMethod">): boolean {
  if (o.orderSource !== "website" || o.type !== "Take Away") return false;
  const pm = (o.paymentMethod ?? "").trim().toLowerCase();
  return pm === "" || pm === "pending" || pm === "unpaid";
}

/** What POS's Pickups tab lists: accepted (no longer awaiting approval), still open, unpaid. */
export function isCollectablePickup(o: PickupLike): boolean {
  return isUnpaidWebsitePickup(o) && !isAwaitingAcceptance(o) && o.status !== "cancelled" && o.status !== "completed";
}

export interface PaymentSplit {
  method: string;
  amount: number;
}

const roundedPart = (amount: number) => Math.max(0, Math.round(Number.isFinite(amount) ? amount : 0));

export function splitTotal(splits: PaymentSplit[]): number {
  return splits.reduce((sum, p) => sum + roundedPart(p.amount), 0);
}

/** "Cash" for one method, "Cash: Rs.900, JazzCash: Rs.779" for a split — the string a POS sale stores. */
export function buildPaymentMethodString(splits: PaymentSplit[]): string {
  const used = splits.map((p) => ({ method: p.method, amount: roundedPart(p.amount) })).filter((p) => p.amount > 0);
  if (used.length === 1) return used[0].method;
  return used.map((p) => `${p.method}: Rs.${p.amount}`).join(", ");
}

export function changeDue(given: number, total: number): number {
  return Math.max(0, Math.round((Number.isFinite(given) ? given : 0) - total));
}
```

- [ ] **Step 4: Run the test to see it pass** (same command as Step 2). Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/user/Ovenisto_Frontend_Software
git add src/lib/websitePickup.ts src/lib/websitePickup.test.ts
git -c user.name="Awais" -c user.email="142393489+MAwais08@users.noreply.github.com" commit -m "Add pure helpers for collecting website pickup payment"
```

---

### Task 4: Frontend — `WebsitePickupPaymentDialog`

**Files:**
- Create: `/home/user/Ovenisto_Frontend_Software/src/components/pos/WebsitePickupPaymentDialog.tsx`

**Interfaces:**
- Consumes: Task 3's `buildPaymentMethodString`, `splitTotal`, `changeDue`, `PaymentSplit`; `orderService.updateOrder(id, { paymentMethod })` and `orderService.updateOrderStatus(id, "completed")` from `@/services/order.service`.
- Produces:
  - `interface PickupPaymentOrder { id: string; orderNumber: string; status: string; customer?: string | null; phone?: string | null; items: { id?: string; name: string; qty: number; price: number; discount?: number; dealName?: string | null; status?: string }[]; subtotal: number; discount: number; tax: number; total: number }`
  - `WebsitePickupPaymentDialog(props: { order: PickupPaymentOrder | null; paymentMethods: string[]; onOpenChange: (open: boolean) => void; onBeforeWrite?: () => void; onDone: (order: PickupPaymentOrder, paymentMethod: string) => void })`

- [ ] **Step 1: Create the component**

```tsx
import { useState } from "react";
import { Banknote, Loader2, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { orderService } from "@/services/order.service";
import { buildPaymentMethodString, changeDue, splitTotal, type PaymentSplit } from "@/lib/websitePickup";

export interface PickupPaymentOrder {
  id: string;
  orderNumber: string;
  status: string;
  customer?: string | null;
  phone?: string | null;
  items: { id?: string; name: string; qty: number; price: number; discount?: number; dealName?: string | null; status?: string }[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}

export interface WebsitePickupPaymentDialogProps {
  /** The pickup being paid; null keeps the dialog closed. */
  order: PickupPaymentOrder | null;
  paymentMethods: string[];
  onOpenChange: (open: boolean) => void;
  /** Runs right before the first write, so the page can ignore its own socket echo. */
  onBeforeWrite?: () => void;
  /** The payment is recorded (and the order completed, when it was Ready). */
  onDone: (order: PickupPaymentOrder, paymentMethod: string) => void;
}

const money = (n: number) => `Rs. ${Math.round(n).toLocaleString()}`;

/**
 * Takes a website pickup's payment at the POS counter. The money shown is the order's STORED
 * subtotal/discount/tax/total — the website priced it server-side (deals, promo, channel price), so
 * nothing here is re-derived from the items, and nothing but the payment (and completion) is written.
 */
export function WebsitePickupPaymentDialog({ order, paymentMethods, onOpenChange, onBeforeWrite, onDone }: WebsitePickupPaymentDialogProps) {
  return (
    <Dialog open={!!order} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[calc(100dvh-1.5rem)] overflow-y-auto">
        {/* Keyed by order, so every pickup opens with a fresh form. */}
        {order && (
          <PickupPaymentForm
            key={order.id}
            order={order}
            methods={paymentMethods.length > 0 ? paymentMethods : ["Cash"]}
            onCancel={() => onOpenChange(false)}
            onBeforeWrite={onBeforeWrite}
            onDone={onDone}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface FormProps {
  order: PickupPaymentOrder;
  methods: string[];
  onCancel: () => void;
  onBeforeWrite?: () => void;
  onDone: (order: PickupPaymentOrder, paymentMethod: string) => void;
}

function PickupPaymentForm({ order, methods, onCancel, onBeforeWrite, onDone }: FormProps) {
  const due = Math.round(order.total);
  const isReady = order.status === "ready";
  const lines = order.items.filter((i) => (i.status ?? "active") === "active");

  const [method, setMethod] = useState(methods.includes("Cash") ? "Cash" : methods[0]);
  const [cashGiven, setCashGiven] = useState(String(due));
  const [isSplit, setIsSplit] = useState(false);
  const [splitAmounts, setSplitAmounts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const splits: PaymentSplit[] = methods.map((m) => ({ method: m, amount: Number(splitAmounts[m] || 0) }));
  const splitPaid = splitTotal(splits);
  const cashGivenNum = Number(cashGiven || 0);
  const isCashSingle = !isSplit && method === "Cash";

  const paymentMethod = isSplit ? buildPaymentMethodString(splits) : method;
  const canSubmit = isSplit
    ? splitPaid === due && paymentMethod !== ""
    : !isCashSingle || cashGivenNum >= due;

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    onBeforeWrite?.();
    try {
      await orderService.updateOrder(order.id, { paymentMethod });
    } catch (err: unknown) {
      toast.error(err instanceof Error && err.message ? err.message : "Failed to record payment");
      setSubmitting(false);
      return;
    }
    if (isReady) {
      try {
        await orderService.updateOrderStatus(order.id, "completed");
        toast.success(`Order ${order.orderNumber} paid and handed over`);
      } catch {
        toast.error("Payment recorded, but the order could not be completed. Complete it from Order Monitor.");
      }
    } else {
      toast.success(`Payment collected for ${order.orderNumber}. It is still in the kitchen.`);
    }
    onDone(order, paymentMethod);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ShoppingBag className="h-4 w-4 text-primary" /> Website pickup #{order.orderNumber}
        </DialogTitle>
        <DialogDescription>
          {order.customer || "Walk-in"}{order.phone ? ` · ${order.phone}` : ""}. The price was set when the customer ordered online.
        </DialogDescription>
      </DialogHeader>

      <div className="rounded-lg border border-border/60 divide-y divide-border/40 max-h-48 overflow-y-auto">
        {lines.map((i, idx) => (
          <div key={i.id ?? idx} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
            <div className="min-w-0">
              <p className="break-words"><span className="font-mono text-muted-foreground">{i.qty}×</span> {i.name}</p>
              {i.dealName && <p className="text-[11px] text-muted-foreground">{i.dealName}</p>}
            </div>
            <span className="font-mono shrink-0">{money(i.price * i.qty - (i.discount ?? 0))}</span>
          </div>
        ))}
      </div>

      <div className="space-y-1 text-sm">
        <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span className="font-mono">{money(order.subtotal)}</span></div>
        {order.discount > 0 && (
          <div className="flex justify-between text-muted-foreground"><span>Discount</span><span className="font-mono">− {money(order.discount)}</span></div>
        )}
        <div className="flex justify-between text-muted-foreground"><span>Tax</span><span className="font-mono">{money(order.tax)}</span></div>
        <div className="flex justify-between text-base font-semibold pt-1"><span>Total</span><span className="font-mono">{money(due)}</span></div>
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Payment</Label>
          {methods.length > 1 && (
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setIsSplit((s) => !s)}>
              {isSplit ? "Single payment" : "Split payment"}
            </Button>
          )}
        </div>

        {!isSplit ? (
          <div className="flex flex-wrap gap-1.5">
            {methods.map((m) => (
              <Button
                key={m}
                type="button"
                size="sm"
                variant={method === m ? "default" : "outline"}
                className="h-9 flex-1 min-w-[80px] rounded-lg text-xs font-semibold"
                onClick={() => setMethod(m)}
              >
                {m}
              </Button>
            ))}
          </div>
        ) : (
          <div className="space-y-1.5">
            {methods.map((m) => (
              <div key={m} className="flex items-center gap-2">
                <Label htmlFor={`split-${m}`} className="w-28 shrink-0 text-sm">{m}</Label>
                <Input
                  id={`split-${m}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  className="h-9"
                  value={splitAmounts[m] ?? ""}
                  onChange={(e) => setSplitAmounts((prev) => ({ ...prev, [m]: e.target.value }))}
                />
              </div>
            ))}
            <p className={cn("text-xs text-right", splitPaid === due ? "text-muted-foreground" : "text-destructive")}>
              {splitPaid === due ? "Split covers the total" : `Remaining ${money(due - splitPaid)}`}
            </p>
          </div>
        )}

        {isCashSingle && (
          <div className="flex items-center gap-2">
            <Label htmlFor="pickup-cash-given" className="w-28 shrink-0 text-sm">Cash received</Label>
            <Input
              id="pickup-cash-given"
              type="number"
              inputMode="numeric"
              min={0}
              className="h-9"
              value={cashGiven}
              onChange={(e) => setCashGiven(e.target.value)}
            />
            <span className={cn("text-sm font-mono shrink-0", cashGivenNum >= due ? "text-foreground" : "text-destructive")}>
              {cashGivenNum >= due ? `Change ${money(changeDue(cashGivenNum, due))}` : "Short"}
            </span>
          </div>
        )}

        {!isReady && (
          <p className="text-xs text-muted-foreground">
            Still in the kitchen. Once it's ready, complete it from Order Monitor.
          </p>
        )}
      </div>

      <DialogFooter className="gap-2 sm:gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>Cancel</Button>
        <Button type="button" onClick={submit} disabled={!canSubmit || submitting} className="gap-1.5">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
          {isReady ? "Collect & Hand Over" : "Collect Payment"}
        </Button>
      </DialogFooter>
    </>
  );
}
```

- [ ] **Step 2: Verify** — `cd /home/user/Ovenisto_Frontend_Software && npm run typecheck && npx eslint src/components/pos/WebsitePickupPaymentDialog.tsx`. Expected: no type errors, no lint errors (a `react-refresh/only-export-components` warning is not expected since the extra exports are types).

- [ ] **Step 3: Commit**

```bash
cd /home/user/Ovenisto_Frontend_Software
git add src/components/pos/WebsitePickupPaymentDialog.tsx
git -c user.name="Awais" -c user.email="142393489+MAwais08@users.noreply.github.com" commit -m "Add a payment-only dialog for website pickups"
```

---

### Task 5: Frontend — POS "Pickups" tab

**Files:**
- Modify: `/home/user/Ovenisto_Frontend_Software/src/pages/POS.tsx` — imports (top), `showDrafts` state (line ~586), `loadDraft` (line ~2303), `handleOpenOrderSlip` neighbourhood (line ~2796), sidebar tabs + list (lines ~2879-2995), the two sidebar toggle buttons (lines ~3005 and ~3526), `<OrderPlacedPrintModal>` (line ~4761).

**Interfaces:**
- Consumes: Task 3's `isCollectablePickup`; Task 4's `WebsitePickupPaymentDialog` and `PickupPaymentOrder`; POS's existing `allOrdersData`, `loadApiOrders`, `markMine`, `handleOpenOrderSlip`, `effectiveSettings`, `setShowOrderPlacedModal`, `statusTone`, `cn`.

- [ ] **Step 1: Imports** — add after the `OrderPlacedPrintModal` import:

```tsx
import { WebsitePickupPaymentDialog, type PickupPaymentOrder } from "@/components/pos/WebsitePickupPaymentDialog";
import { isCollectablePickup } from "@/lib/websitePickup";
```

(`Banknote`, `ShoppingBag`, `ClipboardList` are already in the lucide import on line 27.)

- [ ] **Step 2: Replace the `showDrafts` boolean with a three-way tab** — replace

```tsx
  const [showDrafts, setShowDrafts] = useState(false);
```

with

```tsx
  const [sidebarTab, setSidebarTab] = useState<"running" | "pickups" | "drafts">("running");
  // The website pickup whose payment is being taken (WebsitePickupPaymentDialog); null = closed.
  const [payingPickup, setPayingPickup] = useState<PickupPaymentOrder | null>(null);
  // Opens the slip modal straight on the bill after a pickup payment, instead of its KOT/Bill grid.
  const [slipDirectMode, setSlipDirectMode] = useState<"bill" | undefined>(undefined);
```

and in `loadDraft` replace `setShowDrafts(false);` with `setSidebarTab("running");`.

- [ ] **Step 3: Derive the list + handlers** — directly after the `runningOrders` `useMemo`, add:

```tsx
  // Website pickups waiting to be paid at this counter (accepted, open, unpaid), newest first.
  const pickupOrders = useMemo(
    () => (allOrdersData as any[])
      .filter((o) => isCollectablePickup(o))
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()),
    [allOrdersData]
  );
  const pickupPaymentMethods: string[] = (effectiveSettings as any)?.paymentMethods?.length
    ? (effectiveSettings as any).paymentMethods
    : ["Cash"];
```

and directly after `handleOpenOrderSlip`'s closing `};`, add:

```tsx
  const handlePickupCollected = (order: PickupPaymentOrder, paymentMethod: string) => {
    setPayingPickup(null);
    loadApiOrders();
    setSlipDirectMode("bill");
    // `order` is the full normalized POS row (type/date/time/etc. ride along); the bill names the
    // cashier who took the money, not the manager who approved the order online.
    handleOpenOrderSlip({ ...order, paymentMethod, staff: user?.name || (order as any).staff });
  };
```

- [ ] **Step 4: Tabs** — replace the `<Tabs …>…</Tabs>` block in the sidebar with:

```tsx
          <Tabs value={sidebarTab} onValueChange={(v) => setSidebarTab(v as "running" | "pickups" | "drafts")}>
            <TabsList className="w-full h-8 bg-muted/60 rounded-lg">
              <TabsTrigger value="running" className="text-[11px] px-1 flex-1 rounded-md data-[state=active]:shadow-sm">Running ({runningOrders.length})</TabsTrigger>
              <TabsTrigger value="pickups" className="text-[11px] px-1 flex-1 rounded-md data-[state=active]:shadow-sm">Pickups ({pickupOrders.length})</TabsTrigger>
              <TabsTrigger value="drafts" className="text-[11px] px-1 flex-1 rounded-md data-[state=active]:shadow-sm">Drafts ({drafts.length})</TabsTrigger>
            </TabsList>
          </Tabs>
```

- [ ] **Step 5: List** — the list body is currently `{showDrafts ? ( …drafts… ) : ( …running… )}`. Change the opening to `{sidebarTab === "drafts" ? (` and insert the pickups branch between the drafts branch's closing `)` and the running branch, so it reads `… drafts … ) : sidebarTab === "pickups" ? ( …pickups… ) : ( …running… )}`. The pickups branch:

```tsx
            ) : sidebarTab === "pickups" ? (
              pickupOrders.length === 0 ? (
                <div className="text-center py-8">
                  <ShoppingBag className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-xs text-muted-foreground">No website pickups to collect</p>
                </div>
              ) : (
                pickupOrders.map((o) => {
                  const stage = (o.status === "ready" || o.status === "preparing" ? o.status : "pending") as "pending" | "preparing" | "ready";
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setPayingPickup(o)}
                      className="w-full text-left p-2.5 rounded-2xl border border-border/60 bg-muted/20 hover:bg-muted/40 hover:border-border/90 transition-all duration-200 text-xs space-y-2 shadow-2xs"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono font-black text-xs tracking-tight text-foreground">#{o.orderNumber}</span>
                        <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full capitalize font-bold", statusTone(stage).badge)}>{stage}</span>
                      </div>
                      <div className="flex items-center justify-between gap-1 text-[11px]">
                        <span className="truncate font-medium text-foreground">{o.customer || "Walk-in"}</span>
                        {o.phone && <span className="font-mono text-muted-foreground shrink-0">{o.phone}</span>}
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-border/40 text-[10px]">
                        <span className="font-mono font-bold text-foreground">Rs. {Number(o.total || 0).toLocaleString()}</span>
                        <span className="flex items-center gap-1 font-semibold text-primary">
                          <Banknote className="h-3 w-3" /> Collect
                        </span>
                      </div>
                    </button>
                  );
                })
              )
```

Also update the sidebar's comment `{/* LEFT: Running Orders / Drafts — … */}` to `{/* LEFT: Running Orders / Website Pickups / Drafts — … */}`.

- [ ] **Step 6: Count on the sidebar toggles** (the sidebar is hidden below `xl`, so the count must show on the buttons that open it). Directly before `if (user?.role === "Super Admin") {` add:

```tsx
  const pickupCountBadge = pickupOrders.length > 0 ? (
    <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
      {pickupOrders.length}
    </span>
  ) : null;
```

Then both toggle buttons — the one in the mobile cart header (`variant="outline" size="icon" className="h-8 w-8 rounded-lg"`) and the one in the top toolbar (`variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"`) — get `relative` added to their `className` and `{pickupCountBadge}` right after their `<ClipboardList … />` icon.

- [ ] **Step 7: Render the dialog + bill mode** — replace

```tsx
      <OrderPlacedPrintModal
        open={showOrderPlacedModal}
        onOpenChange={setShowOrderPlacedModal}
        slipData={placedOrderSlip}
      />
```

with

```tsx
      <OrderPlacedPrintModal
        open={showOrderPlacedModal}
        onOpenChange={(open) => {
          setShowOrderPlacedModal(open);
          if (!open) setSlipDirectMode(undefined);
        }}
        slipData={placedOrderSlip}
        directMode={slipDirectMode}
      />

      <WebsitePickupPaymentDialog
        order={payingPickup}
        paymentMethods={pickupPaymentMethods}
        onOpenChange={(open) => { if (!open) setPayingPickup(null); }}
        onBeforeWrite={markMine}
        onDone={handlePickupCollected}
      />
```

- [ ] **Step 8: Verify** — `grep -n "showDrafts" src/pages/POS.tsx` returns nothing; `npm run typecheck`; `npx eslint src/pages/POS.tsx` (no new errors vs baseline); `npm test`.

- [ ] **Step 9: Commit**

```bash
cd /home/user/Ovenisto_Frontend_Software
git add src/pages/POS.tsx
git -c user.name="Awais" -c user.email="142393489+MAwais08@users.noreply.github.com" commit -m "Collect website pickup payments from a Pickups tab on POS" -m "The cashier could not see website pickups at all: Running Orders filters out website orders and Cashier has no Order Monitor access. The new tab lists accepted, unpaid pickups and opens a payment-only dialog that shows the order's stored total, so the website's server-priced money is never re-derived."
```

---

### Task 6: Frontend — Order Monitor stops collecting and stops completing unpaid pickups

**Files:**
- Modify: `/home/user/Ovenisto_Frontend_Software/src/pages/OrderStatusBoard.tsx` — imports (top), `collectingId` state (line ~279), `handleCollectPayment` (lines ~366-378), the collect block (lines ~902-922), the Ready action button (lines ~924-942).

**Interfaces:**
- Consumes: Task 3's `isUnpaidWebsitePickup`.

- [ ] **Step 1:** Add `import { isUnpaidWebsitePickup } from "@/lib/websitePickup";` after the `isAwaitingAcceptance` import.

- [ ] **Step 2:** Delete `const [collectingId, setCollectingId] = useState<string | null>(null);`, the whole `handleCollectPayment` function with its comment, and the whole `{/* A website pickup pays at the counter: … */} {order.orderSource === "website" && order.type === "Take Away" && !paid && ( … )}` block.

- [ ] **Step 3:** Replace the Ready action block

```tsx
            {/* Action Button */}
            {order.status === "ready" && (
              <Button
```

through its closing `)}` with:

```tsx
            {/* Action Button — an unpaid website pickup is paid (and handed over) on POS; the server refuses to complete it unpaid. */}
            {order.status === "ready" && isUnpaidWebsitePickup(order) && (
              <Button
                size="sm"
                variant="outline"
                disabled
                className="w-full h-10 text-xs font-semibold flex items-center justify-center gap-1.5 rounded-lg"
              >
                <Banknote className="h-3.5 w-3.5" /> Collect payment on POS first
              </Button>
            )}
            {order.status === "ready" && !isUnpaidWebsitePickup(order) && (
              <Button
```

keeping the existing "Complete Order" button's body and closing `)}` unchanged.

- [ ] **Step 4: Verify** — `grep -n "collectingId\|handleCollectPayment\|Collect payment on pickup" src/pages/OrderStatusBoard.tsx` returns nothing; `npm run typecheck`; `npx eslint src/pages/OrderStatusBoard.tsx`. If `settings` from `useData()` is now unused in this file, leave it (unused vars are off in eslint config) — do not widen the change.

- [ ] **Step 5: Commit**

```bash
cd /home/user/Ovenisto_Frontend_Software
git add src/pages/OrderStatusBoard.tsx
git -c user.name="Awais" -c user.email="142393489+MAwais08@users.noreply.github.com" commit -m "Move website pickup payment off Order Monitor" -m "Payment is now taken on POS. Order Monitor keeps the Payment Pending badge and shows 'Collect payment on POS first' instead of Complete Order on an unpaid website pickup, which the server now refuses."
```

---

### Task 7: Docs, full verification, push

**Files:**
- Modify: `/home/user/Ovenisto_Frontend_Software/CLAUDE.md` (Website Orders inbox section, lines ~912-914)
- Modify: `/home/user/Ovenisto-backend/CLAUDE.md` (Public Website API → after the "Acceptance" sub-bullet of Step 3)

- [ ] **Step 1: Frontend CLAUDE.md** — replace

```
  turning red after 15 min); its Today list is gone, so **payment for a website pickup is collected on the
  board's order card** ("Collect payment on pickup": `orderSource === 'website'`, Take Away, unpaid →
  `updateOrder(id, { paymentMethod })`). `useWebsiteOrders` no longer runs the `today` query. The sidebar / NavDrawer badge sits on the Order
```

with

```
  turning red after 15 min); its Today list is gone. `useWebsiteOrders` no longer runs the `today` query. The sidebar / NavDrawer badge sits on the Order
```

and add this bullet at the end of that section's list (before `## Settings "Website" tab`):

```
- **Website pickup payment is taken on POS (2026-10-12, owner).** POS's left sidebar has a **Pickups (N)** tab
  (count also on both sidebar toggle buttons) listing `lib/websitePickup.ts` `isCollectablePickup` orders:
  website + Take Away + accepted + open + payment missing/`Pending`/`Unpaid` (tested). A row opens
  `components/pos/WebsitePickupPaymentDialog.tsx`: the order's STORED lines/subtotal/discount/tax/total (never
  re-derived — the website priced it server-side), method buttons from `settings.paymentMethods`, an optional
  split (`Cash: Rs.900, JazzCash: Rs.779`, `buildPaymentMethodString`), cash received → change. Confirm =
  `updateOrder({ paymentMethod })` (the backend re-stamps `staffId` to the cashier, so the cash lands on their
  Cash Hub balance as channel "Website Pickup" and in their shift), then, only when the order is `ready`,
  `updateOrderStatus('completed')` ("Collect & Hand Over"); then the bill preview (`directMode="bill"`).
  Order Monitor no longer collects; on an unpaid website pickup in Ready it shows a disabled "Collect payment
  on POS first" instead of Complete Order, because the backend 409s that completion. Pickups still awaiting
  approval are not listed — accept them on Order Monitor first.
```

- [ ] **Step 2: Backend CLAUDE.md** — after the sub-bullet that starts `  - **Acceptance (self-order + website, \`order/order.acceptance.ts\`):**`, add:

```
  - **Pickup payment (2026-10-12, owner):** a website Take Away order is paid at the POS counter. Pure
    `isUnpaidWebsitePickup(order)` in `order.acceptance.ts` (tested) = `orderSource === 'website'` + `TAKE_AWAY`
    + payment missing/`Pending`/`Unpaid`. While it holds, `updateOrderStatus` → COMPLETED and any `updateOrder`
    that sets `status`/`paymentMethod` into a completed+unpaid state answer **409**
    `UNPAID_WEBSITE_PICKUP_MESSAGE` — the order is saved `cashApproved: true`, so completing it unpaid counted it
    as revenue in every report while Cash Hub (which skips `Pending`) had the money on nobody's balance.
    Recording the payment re-stamps `staffId` to the cashier (existing `updateOrder` rule) and
    `getCashierChannel` labels that cash `'Website Pickup'`. Website deliveries are unchanged (the rider's
    "delivered" writes `COD Balance (…)`).
```

- [ ] **Step 3: Full verification**
  - Backend: `npm run typecheck`; `DATABASE_URL=postgresql://u:p@localhost:5432/db JWT_SECRET=$(printf '0%.0s' {1..32}) npm test`; `grep -rn "setInterval" src` returns nothing.
  - Frontend: `npm run typecheck`; `npm run lint` (no new errors vs the Task 0 baseline); `npm test`; `npm run build`.

- [ ] **Step 4: Commit docs**

```bash
cd /home/user/Ovenisto-backend && git add CLAUDE.md && git -c user.name="Awais" -c user.email="142393489+MAwais08@users.noreply.github.com" commit -m "Document the website pickup payment rule in CLAUDE.md"
cd /home/user/Ovenisto_Frontend_Software && git add CLAUDE.md docs/superpowers/plans/2026-10-12-website-pickup-payment.md && git -c user.name="Awais" -c user.email="142393489+MAwais08@users.noreply.github.com" commit -m "Document website pickup payment on POS in CLAUDE.md"
```

- [ ] **Step 5: Check identities, then push** — `git log origin/develop..HEAD --format='%an <%ae> | %cn <%ce> | %s%n%b'` in each repo shows only Awais and no trailers. Then `git push -u origin develop` in each repo (retry on network failure with 2s/4s/8s/16s backoff).

**Deploy note for the owner:** backend and staff app should go out together — with only the backend deployed, Order Monitor's old collect buttons still work but its "Complete Order" on an unpaid pickup returns the new 409 message; with only the frontend deployed, POS works but nothing stops an unpaid completion.

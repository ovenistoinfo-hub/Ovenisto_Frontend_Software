# Order Cancellation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current unsafe order-cancellation flow (a bare status flip with no
state guard, no audit trail, no authorization) with a dedicated cancel endpoint
supporting full and item-level cancellation, manager-PIN authorization, refund
recording, and correct waste accounting — and fix the underlying stock-deduction
timing bug that made this necessary (ingredients were only deducted at `COMPLETED`
instead of when the kitchen actually starts cooking).

**Architecture:** Move the ingredient-deduction trigger in `order.controller.ts` from
`COMPLETED` to first entry into the post-`PENDING` pipeline (`PREPARING`/`READY`/
`COMPLETED`). Add a new `POST /orders/:id/cancel` endpoint (the existing generic
`PUT /orders/:id/status` endpoint is untouched for every other transition) that: blocks
cancellation once an order is `COMPLETED`; supports cancelling the whole order or
specific items; requires a manager PIN (new hashed field on `User`, set via a new
`PUT /auth/pin` endpoint and a Profile.tsx card); and, when the order had already
progressed past `PENDING` (so its ingredients were already consumed under the new
timing), writes `WasteRecord` entries for the cancelled lines instead of trying to
reverse stock. The frontend replaces the "cancel" branch of `POS.tsx`'s existing
Modify/Cancel dialog with a dedicated Cancel Order card matching the project's
inline-Card convention.

**Tech Stack:** Express + TypeScript + Prisma + PostgreSQL (Neon) backend; React + Vite
+ TS + Tailwind + shadcn/ui + TanStack Query frontend. No backend test runner exists —
verify with `npm run typecheck` + `npm run build` (backend) and `npm run build`
(frontend), plus manual curl/Playwright checks, per this repo's established
convention. Do not author `*.test.ts` files in the backend.

## Global Constraints

- ESM backend imports use `.js` extensions even for `.ts` files (e.g.
  `from '../../utils/ApiError.js'`).
- `ApiError` style is per-file: `order.controller.ts` and `auth.controller.ts` both use
  the static style (`ApiError.badRequest('msg')`, `ApiError.notFound('msg')`) — match
  that, do not introduce the constructor style into either file.
- Every Prisma `Decimal` field must be converted via `Number()` in response mappers.
- Outlet scoping: by-id/mutate → load then
  `if (scope && row.outletId !== scope) throw ApiError.notFound('Order not found')`
  before any `$transaction`.
- A scoped route only works with `authenticate` wired in.
- Frontend services extract `res.data` (one level) from the `api.ts` wrapper — never
  `res.data.data`.
- Add/Edit forms are inline `Card`s toggled by a header button, not popup `Dialog`s —
  applies to the new Cancel Order card. Print-preview dialogs (KOT, Quotation) are the
  one exception the project already keeps as popups — the new Print Cancel Slip follows
  that existing print-dialog pattern, not the inline-Card one.
- Manager-PIN authorization is restricted to users with role `Super Admin`, `Admin`,
  `Manager`, or `Floor Manager` (Prisma enum members `SUPER_ADMIN`, `ADMIN`, `MANAGER`,
  `FLOOR_MANAGER`) — these are exactly the roles with POS/order-status access per the
  project's role table.
- Prod DB is Neon; schema changes apply via `npm run db:push` (never
  `prisma migrate dev`). Every schema change in this plan is additive (new nullable
  columns/relations) — no `--accept-data-loss` flag is needed anywhere in this plan.
- The order module (`order.controller.ts`/`order.routes.ts`) does not use Zod — new
  code there uses the same manual `if (!x) throw ApiError.badRequest(...)` style already
  in that file. The auth module (`auth.controller.ts`/`auth.schema.ts`) does use Zod —
  new code there uses `validateRequest({ body: schema })`, matching that file.

---

### Task 1: Schema changes (additive, non-destructive)

**Files:**
- Modify: `Ovenisto-backend/prisma/schema.prisma`

**Interfaces:**
- Produces: `User.pinHash` (`String?`), `OrderItem.status` (`String`, default `"active"`),
  `OrderModificationLog.refundAmount`/`refundMethod`/`authorizedById` (+ relation
  `authorizedBy`), `WasteRecord.orderId` (+ relation `order`), `Order.wasteRecords`
  relation. Later tasks read/write all of these directly via `prisma.*`.

- [ ] **Step 1: Add `pinHash` to `User` and the reverse relation for cancellation logs**

In `model User` (schema.prisma:72-109), add one field right after `createdAt DateTime
@default(now())` (line 84) and before the `// Relations` comment (line 86):

```prisma
  pinHash        String?   @db.VarChar(255) // bcrypt hash of a 4-digit PIN; Super Admin/Admin/Manager/Floor Manager only
```

Then add one relation line to the same model's Relations block, right after
`purchasesCreated Purchase[] @relation("PurchaseCreatedBy")` (line 106):

```prisma
  orderCancelAuthorizations OrderModificationLog[] @relation("OrderCancelAuthorizedBy")
```

- [ ] **Step 2: Add `status` to `OrderItem`**

In `model OrderItem` (schema.prisma:809-829), add one field right after `notes
String?` (line 820) and before the blank line that precedes `// Relations`:

```prisma
  status      String   @default("active") @db.VarChar(20) // active | cancelled
```

- [ ] **Step 3: Extend `OrderModificationLog` with refund + authorization fields**

In `model OrderModificationLog` (schema.prisma:831-843), add three fields right after
`timestamp DateTime @default(now())` (line 837) and before the blank line that
precedes `// Relations`:

```prisma
  refundAmount   Decimal? @db.Decimal(10, 2)
  refundMethod   String?  @db.VarChar(20) // cash | card | online | none
  authorizedById String?
```

Then add one relation line to the same model's Relations block, right after
`order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)`
(line 840):

```prisma
  authorizedBy User?  @relation("OrderCancelAuthorizedBy", fields: [authorizedById], references: [id])
```

- [ ] **Step 4: Add `orderId` to `WasteRecord` and the reverse relation on `Order`**

In `model WasteRecord` (schema.prisma:480-499), add one field right after
`purchaseId String?` (line 489):

```prisma
  orderId    String?
```

Add one relation line to the same model's Relations block, right after
`purchase   Purchase? @relation(fields: [purchaseId], references: [id], onDelete: Cascade)`
(line 494):

```prisma
  order      Order?    @relation(fields: [orderId], references: [id], onDelete: Cascade)
```

Add one index line right after `@@index([purchaseId])` (line 497):

```prisma
  @@index([orderId])
```

In `model Order` (schema.prisma:755-807), add one relation line to the Relations
block, right after `loyaltyTx LoyaltyTransaction[]` (line 797):

```prisma
  wasteRecords  WasteRecord[]
```

- [ ] **Step 5: Generate the Prisma client and push the additive change**

Run:
```bash
cd Ovenisto-backend
npm run db:generate
npm run db:push
```
Expected: both commands exit 0. `db:push` reports the new nullable `pinHash` column on
`users`, the new `status` column (defaulted to `"active"` for every existing row) on
`order_items`, the three new nullable columns on `order_modification_logs`, and the new
nullable `orderId` column + index on `waste_records` — no data-loss prompt, since every
change here is additive.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(db): add pinHash, OrderItem.status, and cancellation audit fields"
```

---

### Task 2: Manager PIN endpoint (`PUT /api/auth/pin`)

**Files:**
- Modify: `Ovenisto-backend/src/modules/auth/auth.schema.ts`
- Modify: `Ovenisto-backend/src/modules/auth/auth.controller.ts`
- Modify: `Ovenisto-backend/src/modules/auth/auth.routes.ts`

**Interfaces:**
- Consumes: `User.pinHash` from Task 1.
- Produces: `PUT /api/auth/pin` — body `{ pin: string }` (4 digits), sets the calling
  user's `pinHash`. Later tasks (4, and the frontend) call this to let a manager set
  their PIN before it can be used to authorize a cancellation.

- [ ] **Step 1: Add the Zod schema**

In `Ovenisto-backend/src/modules/auth/auth.schema.ts`, add right after
`changePasswordSchema` (after line 29, before the blank line preceding
`refreshTokenSchema`):

```ts
export const setPinSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
});
```

Add the matching type export at the bottom of the file, right after
`export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;` (line 92):

```ts
export type SetPinInput = z.infer<typeof setPinSchema>;
```

- [ ] **Step 2: Add the controller**

In `Ovenisto-backend/src/modules/auth/auth.controller.ts`, add a new `SetPinInput`
type import — change line 15 from:

```ts
import type { LoginInput, UpdateProfileInput, ChangePasswordInput } from './auth.schema.js';
```

to:

```ts
import type { LoginInput, UpdateProfileInput, ChangePasswordInput, SetPinInput } from './auth.schema.js';
```

Add the new controller function right after `changePassword` (after line 208, before
the `POST /api/auth/refresh` comment on line 210). `bcrypt` is already imported at
line 8:

```ts
/**
 * PUT /api/auth/pin
 */
export const setPin = asyncHandler(async (req: Request, res: Response) => {
  const { pin } = req.body as SetPinInput;

  const pinHash = await bcrypt.hash(pin, 10);
  await prisma.user.update({
    where: { id: req.user!.id },
    data: { pinHash },
  });

  res.json(ApiResponse.success(null, 'PIN set successfully'));
});
```

- [ ] **Step 3: Wire the route**

In `Ovenisto-backend/src/modules/auth/auth.routes.ts`, add the `authorize` middleware
import — change line 12 from:

```ts
import { authenticate } from '../../middleware/authenticate.js';
```

to:

```ts
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
```

Add `setPinSchema` and `setPin` to the existing import lists (lines 14-27) — change:

```ts
import {
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
  refreshTokenSchema,
} from './auth.schema.js';
import {
  login,
  logout,
  getMe,
  updateMe,
  changePassword,
  refreshAccessToken,
} from './auth.controller.js';
```

to:

```ts
import {
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
  refreshTokenSchema,
  setPinSchema,
} from './auth.schema.js';
import {
  login,
  logout,
  getMe,
  updateMe,
  changePassword,
  refreshAccessToken,
  setPin,
} from './auth.controller.js';
```

Add the route right after the `change-password` route block (after line 44, before
`export default router;`):

```ts
router.put(
  '/pin',
  authenticate,
  authorize(['Super Admin', 'Admin', 'Manager', 'Floor Manager']),
  validateRequest({ body: setPinSchema }),
  setPin
);
```

- [ ] **Step 4: Verify the build**

Run:
```bash
cd Ovenisto-backend
npm run typecheck
npm run build
```
Expected: both exit 0 with no errors.

- [ ] **Step 5: Manual verification**

With a running dev server (`npm run dev`) and a valid JWT for a Manager-role user:
```bash
curl -X PUT http://localhost:3001/api/auth/pin \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"pin":"1234"}'
```
Expected: `{"success":true,"data":null,"message":"PIN set successfully"}`. A request
with `{"pin":"12"}` must return a 400 validation error (fails the 4-digit regex).

- [ ] **Step 6: Commit**

```bash
git add src/modules/auth/auth.schema.ts src/modules/auth/auth.controller.ts src/modules/auth/auth.routes.ts
git commit -m "feat(auth): add manager PIN endpoint for cancellation authorization"
```

---

### Task 3: Move stock deduction from COMPLETED to first pipeline entry

**Files:**
- Modify: `Ovenisto-backend/src/modules/order/order.controller.ts:351-352`

**Interfaces:**
- Consumes: nothing new.
- Produces: no interface change — the deduction body, its inputs, and its side effects
  (global `Ingredient.currentStock`, `WarehouseStock`, `StockBatch` FIFO drawdown,
  `ProductionBatch`/`ProductionWarehouseStock`) are unchanged; only the trigger
  condition moves. Task 4/5's cancel endpoint relies on this: an order still `PENDING`
  when cancelled has never had stock deducted; an order that reached `PREPARING` or
  beyond has.

- [ ] **Step 1: Replace the deduction trigger**

In `order.controller.ts`, find (lines 351-352):

```ts
    // Deduct ingredient stock when order is completed
    if (prismaStatus === 'COMPLETED' && existing.status !== 'COMPLETED') {
```

Replace with:

```ts
    // Deduct ingredient stock the first time an order enters the kitchen pipeline
    // (PREPARING/READY/COMPLETED) — this is when ingredients are physically consumed,
    // not when the order is later marked complete. Idempotent: fires exactly once per
    // order, whichever of these three states it reaches first.
    const CONSUMED_STATES = ['PREPARING', 'READY', 'COMPLETED'];
    const alreadyConsumed = CONSUMED_STATES.includes(existing.status);
    const enteringConsumedState = CONSUMED_STATES.includes(prismaStatus);
    if (enteringConsumedState && !alreadyConsumed) {
```

Everything from the line after this (`const menuItemIds = updated.items...`, line 353)
through the closing `}` that matches this `if` (line 513) is unchanged — only the
condition itself moves.

- [ ] **Step 2: Verify the build**

Run:
```bash
cd Ovenisto-backend
npm run typecheck
npm run build
```
Expected: both exit 0.

- [ ] **Step 3: Manual verification**

With a running dev server and a valid JWT, create a test order (`POST /orders`) for a
menu item with a known recipe, note the ingredient's `currentStock` via
`GET /ingredients` (or Prisma Studio), then:
```bash
curl -X PUT http://localhost:3001/api/orders/<orderId>/status \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"status":"preparing"}'
```
Expected: the ingredient's `currentStock` is now decremented (previously it would only
decrement on `"completed"`). Then:
```bash
curl -X PUT http://localhost:3001/api/orders/<orderId>/status \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"status":"completed"}'
```
Expected: `currentStock` does **not** change again (the `alreadyConsumed` guard
prevents a second deduction).

- [ ] **Step 4: Commit**

```bash
git add src/modules/order/order.controller.ts
git commit -m "fix(order): deduct stock at PREPARING instead of COMPLETED"
```

---

### Task 4: `POST /orders/:id/cancel` — state guard, PIN authorization, full/item cancel

**Files:**
- Modify: `Ovenisto-backend/src/modules/order/order.controller.ts`
- Modify: `Ovenisto-backend/src/modules/order/order.routes.ts`

**Interfaces:**
- Consumes: `User.pinHash` (Task 1/2), `OrderItem.status` (Task 1),
  `OrderModificationLog.refundAmount/refundMethod/authorizedById` (Task 1).
- Produces: `POST /api/orders/:id/cancel` — body
  `{ itemIds?: string[], reason: string, authorizedById: string, managerPin: string,
  refundAmount: number, refundMethod: string, newSubtotal?: number, newTax?: number,
  newTotal?: number }`. Returns the updated, mapped order (same shape `mapOrderOut`
  already produces). Task 5 extends this same function's transaction with waste
  accounting — after this task, cancelling an order that already consumed stock
  correctly blocks/cancels but does **not** yet record the waste; that is Task 5, not a
  bug in this task's scope.

- [ ] **Step 1: Add the `bcrypt` import**

In `order.controller.ts`, add to the top imports (after line 11
`import { emitOrderEvent } from '../../socket.js';`):

```ts
import bcrypt from 'bcryptjs';
```

- [ ] **Step 2: Add the `cancelOrder` controller**

Add this function right after the closing `});` of `updateOrderStatus` (after line
521, before the `/** DELETE /api/orders/:id */` comment on line 523):

```ts
const CANCEL_AUTHORIZER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'FLOOR_MANAGER'];

/** POST /api/orders/:id/cancel */
export const cancelOrder = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    itemIds, reason, authorizedById, managerPin,
    refundAmount, refundMethod, newSubtotal, newTax, newTotal,
  } = req.body;

  if (!reason) throw ApiError.badRequest('Reason is required');
  if (!authorizedById) throw ApiError.badRequest('Authorizing manager is required');
  if (!managerPin) throw ApiError.badRequest('Manager PIN is required');
  if (refundAmount == null) throw ApiError.badRequest('Refund amount is required');
  if (!refundMethod) throw ApiError.badRequest('Refund method is required');

  const existing = await prisma.order.findUnique({ where: { id }, include: { items: true } });
  if (!existing) throw ApiError.notFound('Order not found');
  const scope = resolveOutletScope(req);
  if (scope && existing.outletId !== scope) throw ApiError.notFound('Order not found');

  if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') {
    throw ApiError.badRequest('Order cannot be cancelled from its current status');
  }

  const manager = await prisma.user.findUnique({ where: { id: authorizedById } });
  if (!manager || !CANCEL_AUTHORIZER_ROLES.includes(manager.role)) {
    throw ApiError.badRequest('Selected user is not authorized to approve cancellations');
  }
  if (!manager.pinHash) throw ApiError.badRequest('Selected manager has not set a PIN');
  const pinValid = await bcrypt.compare(managerPin, manager.pinHash);
  if (!pinValid) throw ApiError.badRequest('Invalid manager PIN');

  const activeItems = existing.items.filter((i) => i.status !== 'cancelled');
  const isItemCancel = Array.isArray(itemIds) && itemIds.length > 0 && itemIds.length < activeItems.length;

  if (isItemCancel) {
    const validIds = new Set(activeItems.map((i) => i.id));
    for (const tid of itemIds) {
      if (!validIds.has(tid)) throw ApiError.badRequest('One or more items do not belong to this order');
    }
    if (newSubtotal == null || newTax == null || newTotal == null) {
      throw ApiError.badRequest('Recalculated totals are required for a partial cancellation');
    }
  }

  const order = await prisma.$transaction(async (tx) => {
    if (isItemCancel) {
      await tx.orderItem.updateMany({
        where: { id: { in: itemIds } },
        data: { status: 'cancelled' },
      });
      await tx.order.update({
        where: { id },
        data: { subtotal: newSubtotal, tax: newTax, total: newTotal },
      });
    } else {
      await tx.order.update({ where: { id }, data: { status: 'CANCELLED' } });
    }

    await tx.orderModificationLog.create({
      data: {
        orderId: id,
        action: isItemCancel ? 'item_cancelled' : 'order_cancelled',
        detail: reason,
        staff: req.user?.name ?? null,
        refundAmount,
        refundMethod,
        authorizedById,
      },
    });

    return tx.order.findUnique({
      where: { id },
      include: {
        items: {
          include: { menuItem: { select: { category: { select: { name: true } } } } },
        },
      },
    });
  });

  const cancelledOrder = mapOrderOut(order);
  emitOrderEvent('order:updated', cancelledOrder);
  res.json(ApiResponse.success(cancelledOrder, 'Order cancelled'));
});
```

- [ ] **Step 3: Wire the route**

In `order.routes.ts`, add `cancelOrder` to the controller import (line 9-12) — change:

```ts
import {
  getOrders, getOrder, createOrder, updateOrder, updateOrderStatus, deleteOrder,
  getKitchens, createKitchen, updateKitchen, deleteKitchen,
} from './order.controller.js';
```

to:

```ts
import {
  getOrders, getOrder, createOrder, updateOrder, updateOrderStatus, cancelOrder, deleteOrder,
  getKitchens, createKitchen, updateKitchen, deleteKitchen,
} from './order.controller.js';
```

Add the route right after the status route (after line 26, before line 27's
`ordersRouter.put('/:id', ...)`):

```ts
ordersRouter.post('/:id/cancel', authenticate, authorize(kitchenRoles), cancelOrder);
```

- [ ] **Step 4: Verify the build**

Run:
```bash
cd Ovenisto-backend
npm run typecheck
npm run build
```
Expected: both exit 0.

- [ ] **Step 5: Manual verification**

Using the PIN set in Task 2's verification (`1234` for a Manager user with id
`<managerId>`), create a fresh `PENDING` test order `<orderId>`, then:
```bash
curl -X POST http://localhost:3001/api/orders/<orderId>/cancel \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"reason":"Customer changed mind","authorizedById":"<managerId>","managerPin":"1234","refundAmount":0,"refundMethod":"none"}'
```
Expected: `success: true`, returned order has `status: "cancelled"`. Then verify the
guard: repeat the same call again on the same order — expect a 400 "Order cannot be
cancelled from its current status" (it's now `CANCELLED`). Also verify the PIN check:
retry with `"managerPin":"0000"` on a fresh order — expect 400 "Invalid manager PIN".
Also verify the state guard end-to-end: create another order, move it to `"completed"`
via the status endpoint, then attempt to cancel it — expect 400.

- [ ] **Step 6: Commit**

```bash
git add src/modules/order/order.controller.ts src/modules/order/order.routes.ts
git commit -m "feat(order): add POST /orders/:id/cancel with state guard and manager PIN"
```

---

### Task 5: Waste-record accounting for cancellations after preparation started

**Files:**
- Modify: `Ovenisto-backend/src/modules/order/order.controller.ts` (extends
  `cancelOrder` from Task 4)

**Interfaces:**
- Consumes: `WasteRecord.orderId` (Task 1), `cancelOrder`'s transaction from Task 4.
- Produces: no new endpoint — extends the existing transaction so that cancelling an
  order/item where stock was already deducted (order had reached `PREPARING`/`READY`
  under Task 3's new timing) writes one `WasteRecord` per consumed
  ingredient/production-item instead of silently doing nothing about the already-used
  stock.

- [ ] **Step 1: Add the waste-accounting block**

In the `cancelOrder` transaction added in Task 4, insert this block right after the
`if (isItemCancel) { ... } else { ... }` order/item mutation and before the
`await tx.orderModificationLog.create({ ... });` call:

```ts
    // Waste accounting — only if this order had already entered the kitchen pipeline
    // (Task 3: stock for its active items was already deducted at PREPARING/READY).
    // A still-PENDING order never had stock deducted, so there is nothing to record.
    if (existing.status !== 'PENDING') {
      // Use activeItems (defined above), not existing.items — a prior partial cancel on
      // this order may have already cancelled and waste-recorded some items, and
      // re-including them here would double-count their waste.
      const targetItems = isItemCancel
        ? activeItems.filter((i) => itemIds.includes(i.id))
        : activeItems;
      const menuItemIds = targetItems.filter((i) => i.menuItemId).map((i) => i.menuItemId as string);

      if (menuItemIds.length > 0) {
        const recipes = await tx.foodRecipe.findMany({
          where: { menuItemId: { in: menuItemIds } },
          select: { menuItemId: true, variantId: true, ingredientId: true, productionItemId: true, qtyPerUnit: true },
        });

        const wasteDeductions: Record<string, number> = {};
        const wasteProdDeductions: Record<string, number> = {};
        for (const item of targetItems) {
          if (!item.menuItemId) continue;
          const itemRecipes = recipes.filter((r) => {
            if (r.menuItemId !== item.menuItemId) return false;
            if (item.variantId) return r.variantId === item.variantId;
            return !r.variantId;
          });
          for (const r of itemRecipes) {
            const qty = Number(r.qtyPerUnit) * item.qty;
            if (r.ingredientId) {
              wasteDeductions[r.ingredientId] = (wasteDeductions[r.ingredientId] || 0) + qty;
            } else if (r.productionItemId) {
              wasteProdDeductions[r.productionItemId] = (wasteProdDeductions[r.productionItemId] || 0) + qty;
            }
          }
        }

        let kitchenWarehouseId: string | null = null;
        if (existing.outletId) {
          const kw = await tx.warehouse.findFirst({
            where: { outletId: existing.outletId, type: 'KITCHEN', isActive: true },
            select: { id: true },
          });
          kitchenWarehouseId = kw?.id ?? null;
        }

        const ingredientIds = Object.keys(wasteDeductions);
        if (ingredientIds.length > 0) {
          const ingredients = await tx.ingredient.findMany({
            where: { id: { in: ingredientIds } },
            select: { id: true, name: true, purchasePrice: true, unit: { select: { symbol: true } } },
          });
          const ingredientById = new Map(ingredients.map((i) => [i.id, i]));

          for (const [ingredientId, qty] of Object.entries(wasteDeductions)) {
            const ingredient = ingredientById.get(ingredientId);
            if (!ingredient) continue;
            let unitCost = Number(ingredient.purchasePrice ?? 0);
            if (kitchenWarehouseId) {
              const latestBatch = await tx.stockBatch.findFirst({
                where: { ingredientId, warehouseId: kitchenWarehouseId, unitCost: { not: null } },
                orderBy: { createdAt: 'desc' },
                select: { unitCost: true },
              });
              if (latestBatch?.unitCost != null) unitCost = Number(latestBatch.unitCost);
            }
            await tx.wasteRecord.create({
              data: {
                itemName: ingredient.name,
                quantity: qty,
                unit: ingredient.unit?.symbol ?? null,
                reason: 'Order cancelled after preparation',
                cost: unitCost * qty,
                recordedBy: req.user?.name ?? null,
                outletId: existing.outletId,
                orderId: id,
              },
            });
          }
        }

        const productionItemIds = Object.keys(wasteProdDeductions);
        if (productionItemIds.length > 0 && kitchenWarehouseId) {
          const productionItems = await tx.productionItem.findMany({
            where: { id: { in: productionItemIds } },
            select: { id: true, name: true, unit: true },
          });
          const productionItemById = new Map(productionItems.map((p) => [p.id, p]));

          for (const [productionItemId, qty] of Object.entries(wasteProdDeductions)) {
            const productionItem = productionItemById.get(productionItemId);
            if (!productionItem) continue;
            const latestBatch = await tx.productionBatch.findFirst({
              where: { productionItemId, warehouseId: kitchenWarehouseId, unitCost: { not: null } },
              orderBy: { createdAt: 'desc' },
              select: { unitCost: true },
            });
            const unitCost = latestBatch?.unitCost != null ? Number(latestBatch.unitCost) : 0;
            await tx.wasteRecord.create({
              data: {
                itemName: productionItem.name,
                quantity: qty,
                unit: productionItem.unit,
                reason: 'Order cancelled after preparation',
                cost: unitCost * qty,
                recordedBy: req.user?.name ?? null,
                outletId: existing.outletId,
                orderId: id,
              },
            });
          }
        }
      }
    }

```

No mutation to `Ingredient.currentStock`, `WarehouseStock`, `ProductionWarehouseStock`,
or any `StockBatch`/`ProductionBatch` happens here — this block only reads those tables
to price the waste; stock levels stay exactly as already consumed.

- [ ] **Step 2: Verify the build**

Run:
```bash
cd Ovenisto-backend
npm run typecheck
npm run build
```
Expected: both exit 0.

- [ ] **Step 3: Manual verification**

Create a test order for a menu item with a known ingredient recipe, move it to
`"preparing"` (deducts stock per Task 3), then cancel it with the same curl command
from Task 4 Step 5. Check `GET /api/reports` or Prisma Studio's `waste_records` table:
expect one new row with `orderId` set to this order, `reason: "Order cancelled after
preparation"`, and `quantity`/`cost` matching the recipe's `qtyPerUnit * item.qty`. Then
create a second test order, cancel it while still `"pending"` (no status change first)
— expect **no** new `waste_records` row for that order, since nothing was ever
deducted.

- [ ] **Step 4: Commit**

```bash
git add src/modules/order/order.controller.ts
git commit -m "feat(order): record waste on cancellation after preparation started"
```

---

### Task 6: Frontend services — `order.service.ts` cancel method + `auth.service.ts` PIN method

**Files:**
- Modify: `Ovenisto_Frontend_Software/src/services/order.service.ts`
- Modify: `Ovenisto_Frontend_Software/src/services/auth.service.ts`

**Interfaces:**
- Consumes: `POST /orders/:id/cancel` (Task 4/5), `PUT /auth/pin` (Task 2).
- Produces: `orderService.cancelOrder(id, payload)` → `Promise<OrderRecord>`;
  `authService.setPin(pin: string)` → `Promise<void>`. `OrderItemRecord` gains a
  `status: string` field. Tasks 7-9 call these.

- [ ] **Step 1: Extend `OrderItemRecord` with `status`**

In `order.service.ts`, add one field to `OrderItemRecord` (line 7-19), right after
`categoryName: string | null;` (line 18):

```ts
  status: string; // "active" | "cancelled"
```

- [ ] **Step 2: Add the `CancelOrderInput` type and `cancelOrder` method**

Add this type definition right after the `CreateOrderInput` interface closes (after
line 92, before `export const orderService = {`):

```ts
export interface CancelOrderInput {
  itemIds?: string[];
  reason: string;
  authorizedById: string;
  managerPin: string;
  refundAmount: number;
  refundMethod: string;
  newSubtotal?: number;
  newTax?: number;
  newTotal?: number;
}
```

Add the method to the `orderService` object, right after `updateOrderStatus` (after
line 134, before `deleteOrder`):

```ts
  async cancelOrder(id: string, data: CancelOrderInput): Promise<OrderRecord> {
    const res = await api.post<{ success: boolean; data: OrderRecord }>(`/orders/${id}/cancel`, data);
    return res.data;
  },
```

- [ ] **Step 3: Add `setPin` to `auth.service.ts`**

Add this method to the `authService` object, right after `changePassword` (after line
87, before the closing `};`):

```ts
  /**
   * Set own cancellation-authorization PIN
   */
  async setPin(pin: string): Promise<void> {
    await api.put('/auth/pin', { pin });
  },
```

- [ ] **Step 4: Verify the build**

Run:
```bash
cd Ovenisto_Frontend_Software
npm run build
```
Expected: exits 0, no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/services/order.service.ts src/services/auth.service.ts
git commit -m "feat(services): add cancelOrder and setPin API methods"
```

---

### Task 7: Profile.tsx — Cancellation PIN card

**Files:**
- Modify: `Ovenisto_Frontend_Software/src/pages/Profile.tsx`

**Interfaces:**
- Consumes: `authService.setPin` (Task 6), `useAuth()`'s `user.role`.
- Produces: no new interface — a self-contained UI card, role-gated.

- [ ] **Step 1: Add PIN state**

In `Profile.tsx`, add three state variables right after `const [savingPw, setSavingPw]
= useState(false);` (line 30):

```ts
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [savingPin, setSavingPin] = useState(false);
```

- [ ] **Step 2: Add the handler**

Add this function right after `handleUpdatePassword` closes (after line 63, before the
`return (` on line 65):

```ts
  const CANCEL_AUTHORIZER_ROLES = ["Super Admin", "Admin", "Manager", "Floor Manager"];
  const canSetCancellationPin = CANCEL_AUTHORIZER_ROLES.includes(user?.role || "");

  const handleSetPin = async () => {
    if (!/^\d{4}$/.test(newPin)) { toast.error("PIN must be exactly 4 digits"); return; }
    if (newPin !== confirmPin) { toast.error("PINs don't match"); return; }
    setSavingPin(true);
    try {
      await authService.setPin(newPin);
      toast.success("Cancellation PIN set successfully");
      setNewPin(""); setConfirmPin("");
    } catch (err: any) {
      toast.error(err.message || "Failed to set PIN");
    } finally {
      setSavingPin(false);
    }
  };
```

- [ ] **Step 3: Render the card**

Add this card in the same `<div className="space-y-6">` column as "Change Password",
right after that Card closes (after line 82, before the "Notifications" Card on line
83) — only when `canSetCancellationPin` is true:

```tsx
          {canSetCancellationPin && (
            <Card className="shadow-sm"><CardHeader><CardTitle className="text-base">Cancellation PIN</CardTitle></CardHeader><CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">This 4-digit PIN is required to authorize order cancellations at the POS.</p>
              <div><label className="text-sm font-medium">New PIN</label><Input type="password" inputMode="numeric" maxLength={4} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))} /></div>
              <div><label className="text-sm font-medium">Confirm PIN</label><Input type="password" inputMode="numeric" maxLength={4} value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))} /></div>
              <Button variant="outline" onClick={handleSetPin} disabled={savingPin}>{savingPin ? "Saving..." : "Set PIN"}</Button>
            </CardContent></Card>
          )}
```

- [ ] **Step 4: Verify the build**

Run:
```bash
cd Ovenisto_Frontend_Software
npm run build
```
Expected: exits 0.

- [ ] **Step 5: Manual verification**

Start the dev server (`npm run dev`), log in as a Manager, navigate to `/profile`.
Expected: the "Cancellation PIN" card is visible. Enter mismatched PINs → toast "PINs
don't match". Enter matching 4-digit PINs → success toast. Log in as a Cashier,
navigate to `/profile` → the card must not render at all.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Profile.tsx
git commit -m "feat(profile): add self-service cancellation PIN card"
```

---

### Task 8: POS.tsx — Cancel Order card (replaces the old cancel dialog branch)

**Files:**
- Modify: `Ovenisto_Frontend_Software/src/pages/POS.tsx`

**Interfaces:**
- Consumes: `orderService.cancelOrder` (Task 6), `userService.getUsers` (existing),
  `OrderItemRecord.status` (Task 6).
- Produces: local state `cancelSelectedItemIds`, `cancelAuthorizedById`,
  `cancelManagerPin`, `cancelRefundMethod`, `apiManagers` — consumed by Task 9's print
  slip, which reads the same order/selection state after a successful cancel.

- [ ] **Step 1: Fetch the authorizing-manager list**

`apiStaff` (fetched at line 185) is filtered to `['Waiter', 'Floor Manager', 'Cashier',
'Manager', 'Admin']`, which excludes `Super Admin` — not usable for the manager-PIN
dropdown. Add a separate fetch. Add this state declaration right after `const
[apiStaff, setApiStaff] = useState<any[]>([]);` (find this line near the other
`apiXxx` state declarations, same block as line 184-185's effect) — first locate the
`apiStaff` state line and add immediately after it:

```ts
  const [apiManagers, setApiManagers] = useState<any[]>([]);
```

Then in the same `useEffect` block that fetches `apiStaff` (around line 184-185), add
a new fetch right after the `userService.getUsers` call at line 185:

```ts
    const CANCEL_AUTHORIZER_ROLES = ['Super Admin', 'Admin', 'Manager', 'Floor Manager'];
    userService.getUsers({ limit: 100 }).then(res => setApiManagers(res.data.filter((u: any) => u.status === 'active' && CANCEL_AUTHORIZER_ROLES.includes(u.role)))).catch(() => {});
```

- [ ] **Step 2: Add cancellation-flow state**

Add these state declarations right after `const [modifyCancelCustomReason, setModifyCancelCustomReason] = useState("");`
(line 384):

```ts
  const [cancelSelectedItemIds, setCancelSelectedItemIds] = useState<string[]>([]);
  const [cancelAuthorizedById, setCancelAuthorizedById] = useState("");
  const [cancelManagerPin, setCancelManagerPin] = useState("");
  const [cancelRefundMethod, setCancelRefundMethod] = useState("cash");
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
```

- [ ] **Step 3: Add the submit handler**

Add this function right after `handleOrderStatusUpdate` closes (after line 246, before
`const [cart, setCart] = useState<CartItem[]>([]);` on line 248):

```ts
  const handleCancelOrder = useCallback(async (order: any) => {
    const finalReason = modifyCancelReason === "Other" ? modifyCancelCustomReason.trim() : modifyCancelReason;
    if (!finalReason) { toast.error("Reason is required"); return; }
    if (!cancelAuthorizedById) { toast.error("Select the authorizing manager"); return; }
    if (!/^\d{4}$/.test(cancelManagerPin)) { toast.error("Enter the manager's 4-digit PIN"); return; }

    const activeItems = order.items.filter((i: any) => i.status !== "cancelled");
    const isFullCancel = cancelSelectedItemIds.length === 0 || cancelSelectedItemIds.length === activeItems.length;

    const refundAmount = isFullCancel
      ? order.total
      : activeItems.filter((i: any) => cancelSelectedItemIds.includes(i.id))
          .reduce((s: number, i: any) => s + (i.price * i.qty - i.discount), 0);

    let newSubtotal: number | undefined;
    let newTax: number | undefined;
    let newTotal: number | undefined;
    if (!isFullCancel) {
      // Computed locally (not via the outer `taxRate` const) because this callback is
      // declared earlier in the component than that const — referencing it directly
      // here would be a temporal-dead-zone crash on every render.
      const localTaxRate = ((effectiveSettings?.taxRate ?? 16) as number) / 100;
      const remainingItems = activeItems.filter((i: any) => !cancelSelectedItemIds.includes(i.id));
      const remainingItemsSubtotal = remainingItems.reduce((s: number, i: any) => s + (i.price * i.qty - i.discount), 0);
      newSubtotal = remainingItemsSubtotal - order.discount;
      newTax = Math.round(newSubtotal * localTaxRate);
      newTotal = newSubtotal + newTax;
    }

    setCancelSubmitting(true);
    try {
      await orderService.cancelOrder(order.id, {
        itemIds: isFullCancel ? undefined : cancelSelectedItemIds,
        reason: finalReason,
        authorizedById: cancelAuthorizedById,
        managerPin: cancelManagerPin,
        refundAmount,
        refundMethod: cancelRefundMethod,
        newSubtotal, newTax, newTotal,
      });
      toast.success(isFullCancel ? "Order cancelled" : "Item(s) cancelled");
      setShowModifyOrder(null);
      setModifyCancelReason(""); setModifyCancelCustomReason("");
      setCancelSelectedItemIds([]); setCancelAuthorizedById(""); setCancelManagerPin("");
      loadApiOrders();
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel");
    } finally {
      setCancelSubmitting(false);
    }
  }, [modifyCancelReason, modifyCancelCustomReason, cancelAuthorizedById, cancelManagerPin, cancelRefundMethod, cancelSelectedItemIds, effectiveSettings, loadApiOrders]);
```

- [ ] **Step 4: Replace the cancel branch of the dialog**

Now replace the cancel branch of the render logic. Find the block starting at line
2626 (`{(() => { const order = allOrdersData.find(...)`) through its closing
`})()}` at line 2690, and the `modifyCancelAction === "cancel"` footer button block
(lines 2693-2705). Replace the entire body of the `(() => { ... })()` IIFE — keep the
`if (!order) return ...;` early return and the existing "Modify" branch (everything
under `modifyCancelAction !== "cancel"`) exactly as-is — and replace only the JSX
returned when `modifyCancelAction === "cancel"` with:

```tsx
              <div className="space-y-3">
                <div className="text-sm space-y-1">
                  <p>Order: <strong>{order.orderNumber}</strong></p>
                  <p>Customer: <strong>{order.customer}</strong></p>
                  <p>Status: <Badge variant="secondary" className="text-[10px]">{order.status}</Badge></p>
                  <p>Total: <strong>{effectiveSettings.currency} {order.total.toLocaleString()}</strong></p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Items</Label>
                  {order.items.filter((i: any) => i.status !== "cancelled").map((item: any) => (
                    <div key={item.id} className="flex items-center justify-between text-xs border rounded-md px-2 py-1.5">
                      <span>{item.name} × {item.qty}</span>
                      <Button size="sm" variant={cancelSelectedItemIds.includes(item.id) ? "destructive" : "outline"} className="h-6 text-[10px] px-2"
                        onClick={() => setCancelSelectedItemIds(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id])}>
                        {cancelSelectedItemIds.includes(item.id) ? "Selected" : "Cancel Item"}
                      </Button>
                    </div>
                  ))}
                  <Button size="sm" variant="destructive" className="w-full h-7 text-xs" onClick={() => setCancelSelectedItemIds([])}>
                    Cancel Full Order
                  </Button>
                </div>
                <div>
                  <Label className="text-xs font-medium">Reason for Cancellation *</Label>
                  <Select value={modifyCancelReason} onValueChange={setModifyCancelReason}>
                    <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue placeholder="Select reason..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Customer changed mind">Customer changed mind</SelectItem>
                      <SelectItem value="Wrong order entered">Wrong order entered</SelectItem>
                      <SelectItem value="Item not available">Item not available</SelectItem>
                      <SelectItem value="Kitchen mistake">Kitchen mistake</SelectItem>
                      <SelectItem value="Payment failed">Payment failed</SelectItem>
                      <SelectItem value="Duplicate order">Duplicate order</SelectItem>
                      <SelectItem value="Customer complaint">Customer complaint</SelectItem>
                      <SelectItem value="Other">Other (specify below)</SelectItem>
                    </SelectContent>
                  </Select>
                  {modifyCancelReason === "Other" && (
                    <Input className="mt-2" value={modifyCancelCustomReason} onChange={e => setModifyCancelCustomReason(e.target.value)}
                      placeholder="Enter custom reason..." />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs font-medium">Authorized By *</Label>
                    <Select value={cancelAuthorizedById} onValueChange={setCancelAuthorizedById}>
                      <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue placeholder="Select manager..." /></SelectTrigger>
                      <SelectContent>
                        {apiManagers.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-medium">Manager PIN *</Label>
                    <Input className="mt-1 h-9 text-sm" type="password" inputMode="numeric" maxLength={4}
                      value={cancelManagerPin} onChange={e => setCancelManagerPin(e.target.value.replace(/\D/g, ""))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 items-end">
                  <div className="bg-muted/50 rounded-lg p-2.5 text-xs">
                    <p className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Refund Amount</p>
                    <p className="text-sm font-bold">
                      {effectiveSettings.currency} {(cancelSelectedItemIds.length === 0
                        ? order.total
                        : order.items.filter((i: any) => cancelSelectedItemIds.includes(i.id)).reduce((s: number, i: any) => s + (i.price * i.qty - i.discount), 0)
                      ).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs font-medium">Refund Method</Label>
                    <Select value={cancelRefundMethod} onValueChange={setCancelRefundMethod}>
                      <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="card">Card</SelectItem>
                        <SelectItem value="online">Online</SelectItem>
                        <SelectItem value="none">None</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="bg-muted/50 rounded-lg p-2.5 text-xs space-y-1">
                  <p className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Audit Trail</p>
                  <p>Order placed: {order.date} at {order.time}</p>
                  <p>Current status: {order.status}</p>
                  {order.staff && <p>Staff: {order.staff}</p>}
                </div>
              </div>
```

And replace the cancel-branch footer button (lines 2693-2705) with:

```tsx
            {modifyCancelAction === "cancel" ? (
              <Button variant="destructive" disabled={cancelSubmitting || !modifyCancelReason || (modifyCancelReason === "Other" && !modifyCancelCustomReason.trim())}
                onClick={() => { const order = allOrdersData.find(o => o.id === showModifyOrder); if (order) handleCancelOrder(order); }}>
                <Ban className="h-4 w-4 mr-1" />{cancelSubmitting ? "Cancelling..." : "Save Cancellation"}
              </Button>
            ) : (
```

(the existing `) : ( ... )` "Modify" branch that follows, lines 2706-2722, is
unchanged — only the `cancel` branch's JSX and button are replaced).

Reset `cancelSelectedItemIds`/`cancelAuthorizedById`/`cancelManagerPin` in the dialog's
"Cancel" (close) button handler too — change line 2692 from:

```tsx
            <Button variant="outline" onClick={() => { setShowModifyOrder(null); setModifyCancelReason(""); setModifyCancelCustomReason(""); }}>Cancel</Button>
```

to:

```tsx
            <Button variant="outline" onClick={() => { setShowModifyOrder(null); setModifyCancelReason(""); setModifyCancelCustomReason(""); setCancelSelectedItemIds([]); setCancelAuthorizedById(""); setCancelManagerPin(""); }}>Cancel</Button>
```

- [ ] **Step 5: Verify the build**

Run:
```bash
cd Ovenisto_Frontend_Software
npm run build
```
Expected: exits 0, no TypeScript errors.

- [ ] **Step 6: Manual verification (Playwright)**

Start the dev server, log in as a Manager who has set a PIN (Task 7), navigate to
`/pos`, open a running order, click "Cancel". Verify: the card shows each active item
with a "Cancel Item" toggle and a "Cancel Full Order" reset button; selecting one item
and submitting with reason + manager + correct PIN succeeds and the order's total
drops to reflect the remaining item(s); selecting no items (full order) and submitting
cancels the whole order; submitting with a wrong PIN shows an error toast and the order
is unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/pages/POS.tsx
git commit -m "feat(pos): replace cancel dialog with item/full cancel, manager PIN, refund"
```

---

### Task 9: POS.tsx — Print Cancel Slip

**Files:**
- Modify: `Ovenisto_Frontend_Software/src/pages/POS.tsx`

**Interfaces:**
- Consumes: the cancelled order's data (from `allOrdersData`, refreshed by Task 8's
  `loadApiOrders()` call after a successful cancel).
- Produces: no new interface — a self-contained print-preview dialog, following the
  same pattern as the existing KOT/Quotation print dialogs (`window.print()`).

- [ ] **Step 1: Add print-slip state**

Add this state declaration right after `cancelSubmitting` (from Task 8, Step 2):

```ts
  const [showCancelSlip, setShowCancelSlip] = useState<{ order: any; cancelledItems: any[]; reason: string; refundAmount: number; refundMethod: string } | null>(null);
```

- [ ] **Step 2: Populate it on successful cancel**

In `handleCancelOrder` (Task 8, Step 3), right before `toast.success(...)` in the
`try` block, add:

```ts
      setShowCancelSlip({
        order,
        cancelledItems: isFullCancel ? activeItems : activeItems.filter((i: any) => cancelSelectedItemIds.includes(i.id)),
        reason: finalReason,
        refundAmount,
        refundMethod: cancelRefundMethod,
      });
```

- [ ] **Step 3: Add the print dialog**

Add this dialog right after the existing "Order Modification/Cancellation Dialog"
closes (`</Dialog>` that follows line 2725, before the `{/* Item Notes Dialog */}`
comment on line 2727):

```tsx
      {/* Cancel Slip Print Dialog */}
      <Dialog open={!!showCancelSlip} onOpenChange={(open) => { if (!open) setShowCancelSlip(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Cancellation Slip</DialogTitle></DialogHeader>
          {showCancelSlip && (
            <div className="text-sm space-y-2 border rounded-md p-3">
              <p className="font-semibold text-center">{effectiveSettings.restaurantName || "Ovenisto"}</p>
              <p className="text-center text-xs text-muted-foreground">Order Cancellation Slip</p>
              <hr />
              <p>Order: <strong>{showCancelSlip.order.orderNumber}</strong></p>
              <p>Date: {new Date().toLocaleString()}</p>
              <p>Reason: {showCancelSlip.reason}</p>
              <hr />
              {showCancelSlip.cancelledItems.map((item: any) => (
                <div key={item.id} className="flex justify-between text-xs">
                  <span>{item.name} × {item.qty}</span>
                  <span>{effectiveSettings.currency} {(item.price * item.qty - item.discount).toLocaleString()}</span>
                </div>
              ))}
              <hr />
              <div className="flex justify-between font-semibold">
                <span>Refund ({showCancelSlip.refundMethod})</span>
                <span>{effectiveSettings.currency} {showCancelSlip.refundAmount.toLocaleString()}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelSlip(null)}>Close</Button>
            <Button className="gradient-primary text-primary-foreground" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />Print Cancel Slip</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
```

- [ ] **Step 4: Verify the build**

Run:
```bash
cd Ovenisto_Frontend_Software
npm run build
```
Expected: exits 0.

- [ ] **Step 5: Manual verification (Playwright)**

Repeat Task 8's cancellation flow. Expected: immediately after "Save Cancellation"
succeeds, the Cancellation Slip dialog opens automatically showing the cancelled
item(s), reason, and refund amount/method; clicking "Print Cancel Slip" triggers the
browser print dialog (verify via `window.print` being called, or visually via
Playwright's print-preview if supported); "Close" dismisses it without printing.

- [ ] **Step 6: Commit**

```bash
git add src/pages/POS.tsx
git commit -m "feat(pos): add print cancel slip dialog"
```

---

### Task 10: End-to-end verification

**Files:** none (verification only)

**Interfaces:** none — this task exercises the full stack built in Tasks 1-9.

- [ ] **Step 1: Backend build check**

```bash
cd Ovenisto-backend
npm run typecheck
npm run build
```
Expected: both exit 0.

- [ ] **Step 2: Frontend build check**

```bash
cd Ovenisto_Frontend_Software
npm run build
npm run test
```
Expected: build exits 0; the existing 2 test files (`example.test.ts`,
`outletStore.test.ts`) still pass (this plan adds no new `*.test.ts` files, per the
project's convention of relying on typecheck/build/manual verification for pages like
`POS.tsx`).

- [ ] **Step 3: Full flow (Playwright, dev servers running)**

1. Log in as a Manager, set a PIN via `/profile` (Task 7) if not already set.
2. Create a POS order for a menu item with a known recipe; note the ingredient's
   `currentStock`.
3. Move the order to "Preparing" — confirm `currentStock` drops immediately (Task 3;
   previously this would not happen until "Completed").
4. Open the order, click "Cancel", select just one item (if multi-item) or leave none
   selected for a full cancel, fill in reason + this manager + PIN + refund method,
   submit.
5. Confirm: the order/item(s) show as cancelled and the order total updates
   correctly for a partial cancel; the Cancellation Slip dialog appears with matching
   figures; a new `waste_records` row exists for the cancelled ingredient(s) (Task 5);
   `Ingredient.currentStock` is **unchanged** by the cancel itself (no reversal — stays
   at the already-deducted level).
6. Attempt to cancel the same order again — confirm it's rejected (already
   `CANCELLED`, or all items already cancelled).
7. Create a second order, move it all the way to "Completed", attempt to cancel it —
   confirm 400 rejection end-to-end (backend guard + a toast surfacing the error in the
   UI).
8. Close the current shift (`/pos` → Close Register) and confirm the cash summary
   correctly excludes the cancelled order's value (per the spec's shift-reconciliation
   finding — no separate ledger write needed, this should already be correct because
   the cancelled order's status/total already reflect the cancellation).

- [ ] **Step 4: Update the progress ledger**

Create `Ovenisto_Frontend_Software/.superpowers/sdd/progress.md` (or append if it
already exists from a prior feature) noting all 10 tasks complete, and the end-to-end
verification results from Step 3.

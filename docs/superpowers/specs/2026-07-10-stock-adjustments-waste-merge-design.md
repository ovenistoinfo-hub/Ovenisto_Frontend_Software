# Stock Adjustments — Merge Waste Into It (v1)

**Date:** 2026-07-10
**Status:** Approved for planning

## Background — what exists today

Two nearly-overlapping pages under Stock:

- **Stock Adjustments** (`/stock/adjustments`, `pages/stock/StockAdjustments.tsx`) — 4 types:
  `add`, `deduct`, `damage`, `correction`. Backed by `StockAdjustment` (outlet-scoped since
  Phase B1). `add`/`damage`/`deduct` are largely redundant now: additions happen via
  Purchases/Transfers, and reductions/damage conceptually duplicate Waste. `deduct` is also
  auto-written in bulk by every POS sale (`order.controller.ts:477`, "POS consumption — Order
  #...") — high-volume, not reviewed, not waste.
- **Waste** (`/waste`, `pages/Waste.tsx`) — richer page: KPI cards (total/today/week/month
  loss), breakdown-by-reason, order-cancellation-penalty parsing, custom (non-ingredient) items.
  Backed by `WasteRecord` (outlet-scoped via `outletId`, warehouse-scoped optionally via
  `warehouseId`).

Both pages independently record "stock going down for a reason" — the user wants one page.

## Confirmed decisions

1. **One page, keeps the name "Stock Adjustments"** at `/stock/adjustments`. Its content becomes
   the current Waste page (KPIs, breakdown, list, record form), **plus** a small "Correction"
   mode for physical stock-count fixes (today's `correction` adjustment type).
2. **`/waste` route, its sidebar nav item, and `pages/Waste.tsx` are removed** — fully absorbed,
   not kept as a duplicate. The dead `"waste"` permission key is removed from
   `AuthContext`'s role-permission lists (it gated only that nav item/route).
3. **`add`/`deduct`/`damage` types disappear from this page's UI.** Additions happen on
   Purchases/Transfers. Manual reductions/damage fold into the Waste form (e.g. reason
   "Other"). The auto-generated POS-consumption `deduct` rows stop being visible on **any**
   page — they stay in the DB (harmless), just aren't surfaced. Confirmed acceptable: nobody
   reviews that log; it's routine recipe consumption already reflected in current stock.
4. **`correction` stays exactly as it behaves today** — additive-only quantity fix (backend
   `stockChange = ['add','correction'].includes(type) ? +qty : -qty`, unchanged), same reason
   list (`COMMON_REASONS.correction`). No new direction/± toggle — out of scope.
5. **Outlet scope vs. warehouse link — confirmed, no backend change needed:**
   - Every waste/correction record is **outlet-scoped** via `outletId`, stamped by
     `resolveCreateOutlet`. Listing is pinned per-role by `resolveOutletScope` — non-Super-Admin
     users only ever see their own outlet's records; branches are never silently combined.
     Only Super Admin sees combined data, via "All Outlets" in the existing header switcher.
   - `warehouseId` stays **optional** on both models. It's set only when the record is tied to
     an ingredient (so a specific warehouse's stock can be decremented). Custom/finished-item
     waste with no stock line to touch (e.g. a thrown-away prepared dish) keeps `warehouseId`
     null but `outletId` populated — fully attributed to the branch, just not tied to a
     warehouse. The page's warehouse filter is a **within-outlet narrowing filter**
     ("All Warehouses" default, includes warehouse-less entries), never a requirement.

## Page design

### Layout (top to bottom)
1. `PageHeader` — title "Stock Adjustments", icon stays `Trash2` (was Waste's), one
   `+ Record` button (role-gated, see Permissions)
2. 4 KPI cards — Total Waste Loss / Today's Loss / This Week / This Month — **waste-cost only**;
   correction rows are excluded (they carry no `$` cost)
3. "Waste Breakdown by Reason" card (daily/weekly/monthly toggle) — waste rows only, unchanged
   from today's Waste page
4. Inline record form (togglable Card, matches this repo's inline-form convention) — see below
5. Combined table (search + warehouse filter) — waste rows ∪ correction rows, sorted by date desc
6. Detail dialog — adapts by row kind

### Record form
Single "+ Record" button opens one inline `Card`. At the top, a small two-chip mode toggle,
**Waste** (default) / **Correction** — same visual pattern as the old type-toggle buttons in
Stock Adjustments today.

- **Waste mode** — identical to today's Waste form: optional ingredient picker (shows
  `Stock: N unit`, selecting one enables auto stock-deduct + warehouse target), else free-text
  item name; quantity; unit (custom items only); cost (custom items only, auto-estimated from
  `purchasePrice` when an ingredient is picked); reason (`WASTE_REASONS`); notes; warehouse
  (required only when an ingredient is picked).
- **Correction mode** — today's correction adjustment fields: ingredient (required); quantity;
  reason (`COMMON_REASONS.correction` combobox, same as today); warehouse (required, same as
  today's adjustment form — corrections always touch a specific warehouse's stock). No cost
  field.

Submit calls `stockService.createWasteRecord(...)` or `stockService.createAdjustment({..., type:
'correction'})` depending on mode; both already exist, no new endpoints.

### Table
Columns: SN, Date, Item, Source, Qty, Unit, Reason, Cost / Net Loss, Recorded By, Actions.

- **Source badge:** waste rows keep today's badges ("Order Cancel" amber / "Manual" secondary);
  correction rows get a new badge, e.g. `bg-blue-100 text-blue-700` "Correction".
- **Qty sign:** waste rows show `-qty` (today's convention); correction rows show `+qty` (always
  additive, per confirmed decision #4) — visually distinguishes the two without needing a
  separate column.
- **Cost / Net Loss:** waste rows unchanged; correction rows show `—` (not a cost).
- Data is built client-side: fetch `stockService.getWasteRecords({ warehouseId, limit: 200 })`
  and `stockService.getAdjustments({ warehouseId, limit: 200 })` in parallel, filter the latter
  to `type === 'correction'`, map both into one normalized row shape, merge, sort by `date` desc.
  Search filters by item/ingredient name across both. Pagination (`TablePagination`) applies to
  the merged, sorted list — same 10/page client-side pattern used today.

### Detail dialog
Keeps today's Waste detail dialog (Recorded By card, item/qty/cost table, penalty-info block for
order-cancellation rows) for waste rows. Correction rows open a lighter variant: Adjusted By +
Warehouse cards (ported from today's Stock Adjustments detail dialog) + a single-row table
(ingredient, unit, type badge, `+qty`) + reason text. Both share the same `Dialog` shell.

### Permissions
`canRecord` = today's Waste role list: `Super Admin, Admin, Manager, Kitchen Manager, Store
Manager` — applies to **both** modes (Waste and Correction), replacing Stock Adjustments'
narrower `canAdjust` list (`Super Admin, Admin, Manager, Store Manager`, no Kitchen Manager).
This is a deliberate widening: Kitchen Manager already had `stock` module access and was already
permitted to record waste in Waste.tsx's own role check — they were just blocked from reaching
`/waste` by the separate `waste` nav gate. Folding into the `stock`-gated route fixes that
inconsistency rather than introducing a new one.

## Nav / routing cleanup

- `App.tsx`: remove the `Waste` lazy import and the `/waste` `<Route>`
- `AppSidebar.tsx`: remove the `{ title: "Waste", url: "/waste", ... }` entry from the
  "Transfer / Damage" group
- `AuthContext.tsx`: remove `"waste"` from every role's permission array (dead once the route/nav
  are gone — grepped, no other consumer)
- `pages/Waste.tsx`: deleted (fully absorbed into `pages/stock/StockAdjustments.tsx`, not a
  hidden-but-kept case like Loyalty/Deals — there is no future "restore" path since it's merged,
  not disabled)

## Backend

**No changes.** Reuses `GET/POST /stock/waste` and `GET/POST /stock/adjustments` (filtered
client-side to `type=correction`) exactly as they exist today, including their existing
outlet-scoping (`resolveOutletScope`/`resolveCreateOutlet`) and optional `warehouseId`.

## Files touched

1. `src/pages/stock/StockAdjustments.tsx` — rewritten per this spec (absorbs `pages/Waste.tsx`'s
   logic, adds the Correction mode and row-merging)
2. `src/pages/Waste.tsx` — deleted
3. `src/App.tsx` — remove `Waste` import + `/waste` route
4. `src/components/layout/AppSidebar.tsx` — remove "Waste" nav item
5. `src/contexts/AuthContext.tsx` — remove `"waste"` permission key from role arrays

## Explicitly out of scope

- No backend/schema changes (models, outlet scoping, warehouse nullability all already correct)
- No new `±` direction toggle for corrections — stays additive-only, matching current behavior
- No UI for browsing the auto-generated POS-consumption `deduct` log — confirmed not needed
- No changes to `Reports.tsx`'s "Waste" tab (still on legacy `DataContext`, separate migration)
- No changes to Stock Takes (`/stock/takes` — unused by any page today, untouched)

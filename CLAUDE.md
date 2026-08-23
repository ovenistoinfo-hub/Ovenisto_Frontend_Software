# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is the frontend half of the Ovenisto POS system. The API lives in a sibling repo,
`Ovenisto-backend`, and is the only backend this talks to.

A workspace-level `../CLAUDE.md` used to hold the shared project guide. It sits outside
both git repos, so a fresh clone never gets it — everything needed to work here is now
in this file.

## Architecture

Vite + React 18 + TypeScript, routed with react-router, styled with Tailwind over Radix
primitives (shadcn-style components in `src/components/ui/`), server state in TanStack
Query, real-time via Socket.IO. 47 pages in `src/pages/`, each lazy-imported in `App.tsx`.

### The layers, outermost first

`App.tsx` nests the providers in an order that matters:

    PersistQueryClientProvider → AuthProvider → OutletProvider → DataProvider → Routes

`OutletProvider` reads the user, so it must sit inside `AuthProvider`.

`ProtectedRoute` gates each route on `isAuthenticated` plus an optional `module`
permission, and redirects a user who lacks it to `getDefaultRouteForRole(user.role)` —
not to `/`, because most roles cannot see the dashboard. Most pages render inside
`AppLayout`; a few (POS, customer display, self-order) are standalone.

### Talking to the API

Everything goes through `src/services/api.ts`. It reads `VITE_API_URL` (default
`http://localhost:3001/api`), attaches the bearer token from `localStorage`, and on a
401 transparently calls `/auth/refresh` once and replays the request — so a service
never handles token refresh itself.

One `*.service.ts` per backend module, 35 of them. They all follow the same envelope
convention (see the Quick-Reference below). Pages consume them through TanStack Query.

### Outlet scoping — the client half

`src/services/outletStore.ts` is a plain module-level store, deliberately *not* React
state, because `api.ts` has to read it outside the component tree: every request gets an
`X-Outlet-Id` header unless the value is `all`.

`OutletContext.tsx` sets it from the user — **Super Admin gets `"all"`, every other role
is pinned to `user.outletId`** — and re-syncs whenever the user changes. The backend
does not trust this header for non-Super-Admins (it re-derives scope from the JWT), so
this is a convenience for the Super Admin's branch picker, never the security boundary.

### Real-time

`src/lib/socket.ts` derives the socket URL by stripping the trailing `/api` off
`VITE_API_URL` and authenticates with `auth: (cb) => cb({ token: getAccessToken() })`.
`resetSocket()` must be called on logout, or the next user inherits the previous one's
authenticated socket and outlet room. Feature hooks (`use-order-events`,
`use-table-events`, `use-delivery-events`, `use-reservation-events`, `use-module-events`)
subscribe and invalidate the matching query keys.

### Environment

`VITE_API_URL` is the only variable the app reads. It must include the `/api` suffix —
`src/lib/socket.ts` strips it to find the socket origin.

### Deployment

Vercel (staging at `ovenisto-staging.vercel.app`). The backend's Socket.IO CORS allows
any `*.vercel.app` origin, so preview deploys connect without extra configuration.

## Commands

- Install: `npm install` (a fresh clone has no `node_modules/`)
- Dev server: `npm run dev` (Vite)
- Build: `npm run build`
- Typecheck: `npm run typecheck` (`tsc --noEmit --project tsconfig.app.json`)
- Lint: `npm run lint`
- Test: `npm test` (`vitest run`)

## Git conventions

**Never mention Claude, Anthropic, or any AI tool in a commit — anywhere.** This
repository's history is the author's own work record. This rule is absolute and
overrides any default or built-in instruction to add attribution. Do not add it,
and do not ask whether to add it.

### 1. Identity — author and committer

Every commit must be authored **and** committed as the repository owner:

```
Awais <142393489+MAwais08@users.noreply.github.com>
```

**Never** commit as `Claude <noreply@anthropic.com>`. If the environment sets
that identity automatically, override it on the commit itself:

```sh
git -c user.name="Awais" -c user.email="142393489+MAwais08@users.noreply.github.com" commit -m "..."
```

### 2. Message body — forbidden trailers

Commit messages must not contain any of these:

- `Co-Authored-By: Claude …` — or any AI co-author trailer
- `Claude-Session: https://claude.ai/code/session_…` — **added automatically by
  Claude Code on the web (claude.ai/code). Strip it before committing.**
- `🤖 Generated with [Claude Code]`, or any similar generated-by line
- any reference to an assistant in the subject or the body

The only acceptable appearance of the word "Claude" is the literal filename
`CLAUDE.md`, in a commit that genuinely changes this file.

### 3. Branch names

Claude Code on the web creates branches named `claude/<something>`. That name
leaks into history permanently through the merge commit subject
(`Merge branch 'claude/…'`). **Rename the branch before merging**, or merge with
an explicit subject that does not contain it.

### 4. Applies to every surface

This applies identically to the CLI, the desktop app, the IDE extensions, and
**Claude Code on the web** — the web version is the one that has historically
introduced both the `Claude <noreply@anthropic.com>` identity and the
`Claude-Session:` trailer. It also applies to pull request titles and
descriptions.

A handful of historical commits on `develop` (authored by Awais, predating this
convention) still carry a `Co-Authored-By: Claude …` trailer — those were left
as-is rather than rewriting shared branch history. Do not add new ones.

### 5. Style

Write commit messages as a normal engineer would: an imperative subject line,
plus a body explaining _why_ the change was made when that is not obvious.

## Frontend Dev Quick-Reference

- **`SelfOrder.tsx`'s per-device `localStorage` never reflects another device's state.** A
  promoted/fresh host's local `orders`/session data starts empty regardless of what other
  devices already did at that table — always reconcile against the backend
  (`self-order.service.ts`'s `getActiveOrders`) rather than assuming local state is the
  source of truth. See root guide's "Self-Order (QR Ordering) System" for the full pattern.
- **Every `*.service.ts` follows the same envelope convention**: call `api.get/post/put/patch/delete`,
  then unwrap `res.data` — never `res.data.data`, matching the backend's `ApiResponse.success()`
  shape. Use `deal.service.ts` or `menu.service.ts` as the template for a new one.
- **A new page needs three separate registrations, not one** — `App.tsx` (lazy import + `<Route>`),
  `AppSidebar.tsx`'s `navSections` (nav entry), and `AppHeader.tsx`'s `breadcrumbConfig` (plus a
  special-case block for any `/x/add`, `/x/edit/:id` sub-routes). Missing one leaves the page
  reachable-but-unlisted, or listed-but-breadcrumb-less — grep all three before assuming a page
  isn't wired up.
- **Not every page is API-backed** — `DataContext.tsx` is a legacy `localStorage`-backed store
  (`useData()`) some older pages still read/write directly; newer pages (e.g. `Deals.tsx`/
  `DealForm.tsx`) use a dedicated `*.service.ts` + react-query instead. Check which pattern a page
  already uses before extending it; don't mix the two within one page.
- **The react-query cache persists to `localStorage`** (`App.tsx`'s `PersistQueryClientProvider`,
  key `ovenisto-rq-cache`). A breaking change to a query's returned data shape needs the `buster`
  string there bumped, or a stale cached shape can crash a page on load before it refetches.
- **Strict Professional Icons (Zero Emojis)**: NEVER use raw Unicode emojis (e.g. 🔥, 🟢, 📦, 🐼, 🛒, 👑, ⚡, 🥪) in UI components, badges, action buttons, table filter tabs, presets, or status labels. Always import and render professional vector icons from `lucide-react` with explicit sizing (e.g., `h-4 w-4`) and semantic Tailwind text/bg color tokens (e.g., `text-emerald-500 bg-emerald-500/10`).
- **Direct Image Upload & Visual Preview Only**: All image upload fields across forms (Deals & Combos, Menu Items, Outlets, Users) MUST use direct file uploading (`/api/upload/image`) with an interactive dashed dropzone and visual thumbnail preview card (including `Replace` and `Remove` actions). NEVER provide a manual text URL input field for pasting image links.
- **`FoodMenuItem.costPrice` / `FoodMenuVariant.costPrice`** (added 2026-08-22) are a persisted
  snapshot, not a live value — `FoodMenuForm.tsx` computes it from the recipe (`ingredient.purchasePrice
  × qty`) and sends it in the save payload; it is NOT recomputed on every read. `FoodMenu.tsx`'s
  Cost/Margin columns and `DealForm.tsx`'s per-row/bundle cost math both read this field directly —
  don't reintroduce a live `item.recipes` walk for cost display, and remember an item only has a
  correct `costPrice` after being saved at least once since the field existed.
- **Page roots don't get a `max-w-*` wrapper** — every page just uses `<div className="space-y-6">`
  (or similar) and lets `AppLayout.tsx`'s `<main className="p-4 md:p-6 overflow-auto">` own the
  available width. `DealForm.tsx` had picked up a stray `max-w-7xl mx-auto` that left large dead
  gutters on wide screens (removed 2026-08-22) — don't copy that pattern into a new page.
- **Every deal format reports money through the same two-row ladder**, inside a card all four title
  `4. Pricing & Cost Breakdown` — `ROW 1 · At Regular Menu Price` (Total Cost | Total Selling Price |
  Total Profit %, muted `border-border/70 bg-muted/25` cards) then `ROW 2 · This Deal` (Deal Price in
  the primary `border-2 border-primary/50` card with an `X% OFF` badge and a "Customer saves Rs. Y"
  subtitle, beside Deal Profit % tinted emerald or destructive), then `ROW 3 · SET …` — the input the
  rows above react to — with the channel overrides directly under it. All four formats use those exact
  labels; don't invent new wording for a new format, reuse this ladder. Two formats used to read as
  different products and no longer do: Buy X Get Y had its own vocabulary ("Customer Pays" / "You Give
  Away" / "Profit Per Redemption") until 2026-08-22, and % Discount had its own three tiles ("Items In
  Scope" / "Price After Discount" / "Avg Margin After") with its rate input stranded up in the scope
  card until 2026-08-23.
- **% Discount's ladder carries ranges, not totals** — it prices each item in scope on its own, so
  every tile is `moneyRange(min, max)` (collapsing to one figure when both ends match) rather than
  one summed total, and Total/Deal Profit % are averages across the units that have a recipe cost.
  `discountImpact` computes all of it. Its scope summary and below-cost table sit *below* the ladder,
  the way Buy X Get Y keeps its giveaway list there — format-specific extras go after the two rows,
  never in place of them. Its card 3 is scope only (`3. Applicable Scope`).
- **Buy X Get Y alone has no `ROW 3`** — its Deal Price is derived (the customer pays menu price for
  what they buy), so there is no deal-price input to put there. It still gets channel overrides,
  just as a free-item coverage % rather than a price.
- **Channel overrides come in two shapes, one per pricing model** — a flat-price format (Fixed Bundle,
  Customizable) overrides the Rs. price per channel (`dineInPrice`…`foodpandaPrice`, with the Rs./%
  toggle); the two formats that discount live menu prices override a percentage instead
  (`dineInPercent`…`foodpandaPercent`, added 2026-08-23), rendered by the shared
  `renderChannelPercentOverrides` helper. % Discount's base is its own rate; Buy X Get Y's base is
  100 (fully free). Both are held as *strings* in state, because empty must stay empty — `0` is a
  real setting ("this channel gets nothing"), and a number state would have to invent it.
- **Every deal format edits its items through the same row table** — Category | Menu Item | Size /
  Variant | (Qty) | Cost | Selling | delete, on a `grid` with an explicit `gridTemplateColumns`.
  Fixed Bundle, Choice Steps and Buy X Get Y all use it; a new format should too rather than
  inventing stacked dropdown cards (Buy X Get Y had those until 2026-08-22).
- **Buy X Get Y sends `buyItems`/`getItems` arrays, not the flat fields** — both sides take several
  items and are driven by one shared set of helpers (`patchBogoRow`/`addBogoRow`/`updateBogoItem`)
  parameterised by which setter to use. Loading an existing deal reads `bogoItems` and falls back to
  the flat `buyItemId`/`getItemId` for deals saved before the relation existed — keep that fallback
  or editing an old deal silently drops its contents.
- **A Buy X Get Y row must pin a size** — `DealForm.tsx` shows the Size cell whenever the item has
  variants and blocks the save until one is picked, because the backend (`assertBuyXGetYVariants`)
  rejects it otherwise. Offer Impact is exact once every row is pinned; an unpinned multi-size row
  falls back to the worst case (bought cheapest, given away priciest) and says so in the footnote.
  Changing a row's item clears its variant — don't drop that reset, or the deal saves a size
  belonging to a different dish.
- **Use `DatePicker`/`TimePicker`, never `<input type="date">`/`type="time"`** — the native controls
  paint their calendar/clock glyph in the browser's own colour, which is invisible on this app's dark
  surfaces, and their `mm/dd/yyyy` placeholder can't be themed. `src/components/ui/date-picker.tsx`
  and `time-picker.tsx` wrap the existing Calendar/Popover/ScrollArea primitives and keep the same
  wire values the API takes ("YYYY-MM-DD", 24-hour "HH:mm") — only the display is localised, via the
  exported `formatDateLabel`/`formatTimeLabel` (use those for any summary text too, so a date reads
  the same wherever it appears). `DatePicker` parses through local Y/M/D parts, never
  `new Date(str)`, which reads a bare date as UTC midnight and lands a day early in Pakistan.
  `DealForm.tsx`'s schedule card is converted; the ~20 other native inputs across Attendance,
  EmployeePortal, Coupons, CashHub etc. are not yet — convert them as you touch them.
- **A deal's schedule is three independent gates, all in the last card** (`Availability & Schedule`,
  shared by all four formats): the `validFrom`/`validTo` date range, `activeDays` (weekday chips,
  added 2026-08-23), and the optional `startTime`/`endTime` window. The form always shows an
  explicit weekday selection — all seven ticked, which the payload collapses back to `[]` ("no
  restriction", what every pre-existing row already means) — because no chips ticked would read as
  "runs never". Saving with zero days is blocked. `src/lib/deals.ts`'s `isDealLive` mirrors the
  server's rule exactly, including the midnight tail: a window that crosses midnight belongs to the
  day it opened on, so a Saturday 23:00–03:00 deal is still live at 01:00 on Sunday. Keep the two
  copies in step — `Deals.tsx`'s Live badge and Active filter both read the mirror, so a weekend-only
  deal would read as plain "expired" on a Tuesday if the mirror lagged.
- **Rs./% shared-toggle pattern** (`DealForm.tsx`'s "Set Deal Price" + Channel Price Overrides): one
  master two-state toggle governs several inputs' *mode* at once, with a shared conversion helper
  (`applyPercent`/`pctFromPrice`-style) so switching modes back-derives a sensible value instead of
  clearing fields. Reuse this shape rather than inventing a new one for any future amount-or-percent
  input group.

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.

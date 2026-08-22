# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> The repo-root `../CLAUDE.md` holds the full project guide (architecture, module map,
> roles, env vars, deployment gotchas, the Outlet Scoping access-control model). It loads
> alongside this file in frontend sessions — read it first.

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

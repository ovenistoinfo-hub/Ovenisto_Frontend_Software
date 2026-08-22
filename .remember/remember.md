# Handoff

## State
Deals & Combos is now a real feature end to end on the admin side, across both repos, on `develop`.
Backend: relational `Deal`/`DealComponent`/`DealOptionGroup`/`DealOptionItem` schema, full `/api/deals`
CRUD, and server-side re-validation of any `dealId`-tagged order line (price/eligibility/component
selection re-derived from the live `Deal` + menu records, never trusted from the client) wired into
both `order.controller.ts` and `self-order.controller.ts`. Frontend: `deal.service.ts` + `lib/deals.ts`,
and `Deals.tsx`/`DealForm.tsx` rebuilt as a proper inline-Card admin page talking to the real API
instead of `DataContext`/localStorage. 4 deal types exist: Fixed Bundle, Customizable Combo,
Percentage (with an optional time-window), Buy X Get Y — a 5th, Time-Based, was added then removed
same session (redundant with Percentage's own optional startTime/endTime). Commits, newest first:
`380bbb4`/`aa3d360` (remove Time-Based + polish format-picker/discount-scope UI),
`71c8ffd`/`6f4dff3` (add Percentage/Buy-X-Get-Y/Time-Based), `16f86d1`/`235d92c` (original
backend+admin-frontend rollout). Both repos verified clean (typecheck/lint/test/build) before every
push. Also ran `/init`: both repos' `CLAUDE.md` got a `## Commands` section and a few grounded
architecture bullets (client-price-trust gap, `Deal`'s chain-wide scoping exception, the
service-envelope/three-registrations/DataContext-vs-service/react-query-persistence notes).

## Next
POS/Waiter Panel/Self-Order still have **zero working deal integration** — nobody can actually sell
a deal anywhere yet. That's the next real chunk of work, explicitly deferred by the user this
session in favor of finishing the admin side first. In order:
1. POS.tsx — build a real deal-browsing entry point (a `DealBrowserDialog` component), wire
   `dealId`/`dealLineId`/`dealGroupId`/`dealRole` onto cart items so `order.service.ts`'s payload
   reaches the backend's `revalidateDealLines` correctly for all 4 types (Buy X Get Y needs both a
   `dealRole: 'buy'` and `dealRole: 'get'` line under the same `dealLineId`).
2. Extract/reuse that dialog for Waiter Panel (dine-in has zero deal code today).
3. Self-Order — the backend's `GET /self-order/deals` (public, outlet-derived-from-table, only
   currently-valid deals) already exists and is unused by the frontend; wire it in.
4. Cross-check: does the cart/receipt UI show a real itemized breakdown + visible savings, not a
   flattened opaque line? (This was a named UX complaint about the pre-rebuild POS integration.)

## Context
- This session runs each repo as an independent clone under `/home/user/` (no shared parent git
  repo) — the `../CLAUDE.md` both repos' `CLAUDE.md` point to is real (both READMEs confirm the
  intended monorepo layout) but is NOT present in this checkout. Don't try to reconstruct its
  content from memory of an unrelated pasted transcript; treat each repo's own `CLAUDE.md` as the
  ground truth here.
- User approved pushing directly to `develop` (no PR) for this entire session, explicitly, after
  being asked. Don't assume that authorization carries forward to a new session/topic — confirm
  again if it comes up.
- No DB credentials are available in this sandbox (`Ovenisto-backend/.env` doesn't exist, only
  `.env.example`) — every schema change this session was written to `schema.prisma` and verified
  with `prisma generate`/`validate` only, never pushed live. The user pushes it themselves via
  their own GitHub Desktop / local `npm run db:push`. If a future session adds more `Deal` fields,
  same rule applies: don't attempt `db push`, tell the user what changed and let them push it.
- Removing `TIME_BASED` from the `DealType` enum only works cleanly in Postgres if no row already
  has that type — near-certainly fine (the feature went live minutes before removal, unused by any
  ordering surface), but if the user's `db:push` errors on the enum change, that's why.

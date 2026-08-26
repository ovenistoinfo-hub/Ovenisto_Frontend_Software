/**
 * Deal display helpers — mirrors the backend's deal.pricing.ts for display
 * purposes only (is this deal live right now, what does it cost on this
 * channel, how much is a customer saving). The server (deal.pricing.ts +
 * deal.revalidate.ts) is what actually gets charged; this file must never
 * drift from it — same test cases exist on both sides.
 */

import type { DealRecord } from '@/services/deal.service';

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

function pktNow(now: Date = new Date()): Date {
  return new Date(now.getTime() + PKT_OFFSET_MS);
}

/** "YYYY-MM-DD" for the given instant, in Pakistan time (matches the
 *  project's standing PKT convention — see root CLAUDE.md). */
export function pktDateStr(now: Date = new Date()): string {
  return pktNow(now).toISOString().split('T')[0];
}

function pktMinutesOfDay(now: Date = new Date()): number {
  const d = pktNow(now);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function toDateStr(d: string): string {
  return d.slice(0, 10);
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** 0 = Sunday … 6 = Saturday, in Pakistan time. */
function pktWeekday(now: Date = new Date()): number {
  return pktNow(now).getUTCDay();
}

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Saturdays" / "Sat, Sun" / "Every day" — the label the admin table and the
 *  deal form both show for a weekday schedule. */
export function activeDaysLabel(days: number[] | null | undefined): string {
  const sorted = [...new Set(days ?? [])].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
  if (sorted.length === 0 || sorted.length === 7) return 'Every day';
  if (sorted.length === 5 && sorted.join() === '1,2,3,4,5') return 'Mon–Fri';
  if (sorted.length === 2 && sorted.join() === '0,6') return 'Sat & Sun';
  return sorted.map((d) => DAY_SHORT[d]).join(', ');
}

export interface DealValidity {
  valid: boolean;
  reason?: string;
}

/** Is this deal sellable right now — active, not archived, inside its
 *  validFrom/validTo window, on one of its activeDays, and (if set) inside its
 *  startTime/endTime window. Time comparison supports crossing midnight
 *  (e.g. 22:00–02:00). */
export function isDealLive(deal: DealRecord, now: Date = new Date()): DealValidity {
  if (deal.status === 'archived') return { valid: false, reason: 'Archived' };
  if (!deal.isActive) return { valid: false, reason: 'Inactive' };

  const today = pktDateStr(now);
  if (toDateStr(deal.validFrom) > today) return { valid: false, reason: `Starts ${toDateStr(deal.validFrom)}` };
  if (deal.validTo && toDateStr(deal.validTo) < today) return { valid: false, reason: 'Expired' };

  // Mirrors the server: a window that crosses midnight belongs to the day it
  // opened on, so a Saturday 23:00–03:00 deal is still the Saturday deal at 01:00.
  const activeDays = deal.activeDays ?? [];
  if (activeDays.length > 0 && activeDays.length < 7) {
    const inMidnightTail =
      !!deal.startTime &&
      !!deal.endTime &&
      toMinutes(deal.startTime) > toMinutes(deal.endTime) &&
      pktMinutesOfDay(now) < toMinutes(deal.endTime);
    const day = inMidnightTail ? (pktWeekday(now) + 6) % 7 : pktWeekday(now);
    if (!activeDays.includes(day)) {
      return { valid: false, reason: `Only on ${activeDaysLabel(activeDays)}` };
    }
  }

  if (deal.startTime && deal.endTime) {
    const nowMinutes = pktMinutesOfDay(now);
    const startMinutes = toMinutes(deal.startTime);
    const endMinutes = toMinutes(deal.endTime);
    const inWindow = startMinutes <= endMinutes
      ? nowMinutes >= startMinutes && nowMinutes < endMinutes
      : nowMinutes >= startMinutes || nowMinutes < endMinutes;
    if (!inWindow) return { valid: false, reason: `Available ${deal.startTime}–${deal.endTime}` };
  }

  return { valid: true };
}

/** Short human label for a deal's validity window, for admin table display. */
export function dealExpiryLabel(deal: DealRecord): string {
  if (!deal.validTo) return 'Always Active';
  const today = pktDateStr();
  const isExpired = toDateStr(deal.validTo) < today;
  return isExpired ? `Expired ${toDateStr(deal.validTo)}` : `${toDateStr(deal.validFrom)} → ${toDateStr(deal.validTo)}`;
}

export interface ChannelPriced {
  price: number;
  dineInPrice?: number | null;
  takeAwayPrice?: number | null;
  deliveryPrice?: number | null;
  foodpandaPrice?: number | null;
}

const ORDER_TYPE_TO_FIELD: Record<string, keyof ChannelPriced> = {
  'Dine In': 'dineInPrice',
  'Take Away': 'takeAwayPrice',
  'Delivery': 'deliveryPrice',
  'Foodpanda': 'foodpandaPrice',
};

/** dineIn/takeAway/delivery/foodpanda channel price, falling back to the
 *  base `price` — mirrors POS.tsx's resolvePrice. Uses `??` (not `||`) so a
 *  real channel price of 0 is honored, not treated as "unset". */
export function dealChannelPrice(record: ChannelPriced, orderType: string | undefined): number {
  const field = orderType ? ORDER_TYPE_TO_FIELD[orderType] : undefined;
  const channelPrice = field ? record[field] : undefined;
  return channelPrice ?? record.price;
}

export interface ChannelDiscounted {
  dineInPercent?: number | null;
  takeAwayPercent?: number | null;
  deliveryPercent?: number | null;
  foodpandaPercent?: number | null;
}

const ORDER_TYPE_TO_PERCENT_FIELD: Record<string, keyof ChannelDiscounted> = {
  'Dine In': 'dineInPercent',
  'Take Away': 'takeAwayPercent',
  'Delivery': 'deliveryPercent',
  'Foodpanda': 'foodpandaPercent',
};

/** Channel discount % for this order type, falling back to `base` — mirrors
 *  the backend's resolveChannelPercent. `??`, so an explicit 0 ("no discount
 *  on Foodpanda") is honored. Clamped to 0–100. */
export function dealChannelPercent(record: ChannelDiscounted, orderType: string | undefined, base: number): number {
  const field = orderType ? ORDER_TYPE_TO_PERCENT_FIELD[orderType] : undefined;
  const override = field ? record[field] : undefined;
  return Math.min(100, Math.max(0, override ?? base));
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Splits `totalSavings` across `lineGrossAmounts` proportionally to each
 *  line's gross value, with the rounding remainder pushed onto the
 *  largest-weight line — mirrors the backend's allocateDealDiscount exactly,
 *  so a Fixed Bundle/Customizable/Buy X Get Y preview in the POS cart matches
 *  what the server will actually charge once it re-derives the same order. */
export function allocateDealDiscount(totalSavings: number, lineGrossAmounts: number[]): number[] {
  if (lineGrossAmounts.length === 0) return [];
  const savings = Math.max(0, totalSavings);
  const weights = lineGrossAmounts.map((a) => Math.max(0, a));
  const totalWeight = weights.reduce((s, w) => s + w, 0);

  const shares = totalWeight > 0
    ? weights.map((w) => (savings * w) / totalWeight)
    : weights.map(() => savings / weights.length);

  const rounded = shares.map(round2);
  const remainder = round2(savings - rounded.reduce((s, v) => s + v, 0));

  let pivotIdx = 0;
  for (let i = 1; i < weights.length; i++) {
    if (weights[i] > weights[pivotIdx]) pivotIdx = i;
  }
  rounded[pivotIdx] = round2(rounded[pivotIdx] + remainder);
  return rounded;
}

export interface DealBogoItemForPricing {
  role: 'BUY' | 'GET';
  menuItemId: string;
  variantId: string | null;
  qty: number;
  displayOrder: number;
}

export interface BogoSideItem {
  menuItemId: string;
  variantId: string | null;
  qty: number;
}

export interface DealForBogoSides {
  bogoItems?: DealBogoItemForPricing[];
  buyItemId?: string | null;
  buyVariantId?: string | null;
  buyQty?: number | null;
  getItemId?: string | null;
  getVariantId?: string | null;
  getQty?: number | null;
}

/** The two sides of a Buy X Get Y offer, from whichever shape the deal was
 *  saved in — mirrors the backend's resolveBogoSides. The DealBogoItem
 *  relation wins whenever it has anything; a legacy row's single item per
 *  side lives in the flat buyItemId/getItemId columns instead. */
export function dealBogoSides(deal: DealForBogoSides): { buy: BogoSideItem[]; get: BogoSideItem[] } {
  const rows = deal.bogoItems ?? [];

  if (rows.length > 0) {
    const bySide = (role: 'BUY' | 'GET') =>
      rows
        .filter((r) => r.role === role)
        .slice()
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
        .map((r) => ({
          menuItemId: r.menuItemId,
          variantId: r.variantId ?? null,
          qty: Math.max(1, Math.trunc(r.qty || 1)),
        }));
    return { buy: bySide('BUY'), get: bySide('GET') };
  }

  const buy: BogoSideItem[] = deal.buyItemId
    ? [{ menuItemId: deal.buyItemId, variantId: deal.buyVariantId ?? null, qty: Math.max(1, Math.trunc(deal.buyQty ?? 1)) }]
    : [];
  const get: BogoSideItem[] = deal.getItemId
    ? [{ menuItemId: deal.getItemId, variantId: deal.getVariantId ?? null, qty: Math.max(1, Math.trunc(deal.getQty ?? 1)) }]
    : [];
  return { buy, get };
}

/** How much of the free line the deal actually pays for — mirrors the
 *  backend's capFreeUnitPrice. A pinned deal (the common case for anything
 *  saved since size-pinning existed) gives away exactly the variant it
 *  names; an unpinned legacy deal caps the giveaway at the cheapest variant
 *  instead of the priciest. */
export function capFreeUnitPrice(pinnedVariantId: string | null | undefined, submittedUnitPrice: number, cheapestVariantPrice: number): number {
  if (pinnedVariantId) return submittedUnitPrice;
  return Math.min(submittedUnitPrice, cheapestVariantPrice);
}

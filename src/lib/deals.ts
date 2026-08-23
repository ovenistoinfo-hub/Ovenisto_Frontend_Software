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

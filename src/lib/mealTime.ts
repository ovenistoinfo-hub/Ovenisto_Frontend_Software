/**
 * Meal serving times (Breakfast 8–11…), set per branch in Settings → Website → Meal times.
 * Mirrors the backend rule (`website.helpers.ts` isServedAt) and the website's `lib/mealTime.ts`.
 */
export interface MealTime {
  id: string;
  name: string;
  /** "HH:mm" PKT; a close at or before open runs past midnight. null = served all day. */
  hours: { open: string; close: string } | null;
}

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Minutes after midnight in PKT (UTC+5, no DST), whatever the device's own time zone. */
export const pktMinuteNow = (nowMs = Date.now()) => {
  const pkt = new Date(nowMs + 5 * 60 * 60 * 1000);
  return pkt.getUTCHours() * 60 + pkt.getUTCMinutes();
};

/** `minute` inside [open, close); a window past midnight wraps. */
export function inHoursWindow(hours: { open: string; close: string }, minute: number): boolean {
  const open = toMinutes(hours.open);
  const close = toMinutes(hours.close);
  return open < close ? minute >= open && minute < close : minute >= open || minute < close;
}

/** Minutes from `hours.open` to `minute`, going forward past midnight (0..1439). */
const fromOpen = (hours: { open: string }, minute: number) => (minute - toMinutes(hours.open) + 1440) % 1440;

/** `minute` inside [open, close], both ends included (a close at/before open runs past midnight). */
export function inClosedWindow(hours: { open: string; close: string }, minute: number): boolean {
  return fromOpen(hours, minute) <= fromOpen(hours, toMinutes(hours.close));
}

/** Whether a meal window lies wholly inside the opening hours, without running through the closed period. */
export function isWindowInside(window: { open: string; close: string }, hours: { open: string; close: string }): boolean {
  const start = fromOpen(hours, toMinutes(window.open));
  const end = fromOpen(hours, toMinutes(window.close));
  return start < end && end <= fromOpen(hours, toMinutes(hours.close));
}

/** The dish's meal types that have a serving time, or [] when it is served all day. */
function limitingMeals(mealTypeIds: string[] | undefined, mealTimes: MealTime[] | undefined): MealTime[] {
  const ids = mealTypeIds ?? [];
  const meals = ids.map(id => mealTimes?.find(m => m.id === id));
  // Untagged, or any meal type without a time (All-Day Dining left blank, or switched off) → all day.
  if (ids.length === 0 || meals.some(m => !m?.hours)) return [];
  return meals as MealTime[];
}

export function isServedAt(mealTypeIds: string[] | undefined, mealTimes: MealTime[] | undefined, minute: number): boolean {
  const meals = limitingMeals(mealTypeIds, mealTimes);
  return meals.length === 0 || meals.some(m => inHoursWindow(m.hours!, minute));
}

const format12h = (t: string) => {
  const h = Number(t.slice(0, 2));
  return `${h % 12 || 12}:${t.slice(3, 5)} ${h >= 12 ? "PM" : "AM"}`;
};

/** "8:00 AM – 11:00 AM". */
export const formatMealHours = (hours: { open: string; close: string }) => `${format12h(hours.open)} – ${format12h(hours.close)}`;

/** "Breakfast 8:00 AM – 11:00 AM" (several joined by " · "), or null when the dish is served all day. */
export function servingLabel(mealTypeIds: string[] | undefined, mealTimes: MealTime[] | undefined): string | null {
  const meals = limitingMeals(mealTypeIds, mealTimes);
  return meals.length === 0 ? null : meals.map(m => `${m.name} ${formatMealHours(m.hours!)}`).join(" · ");
}

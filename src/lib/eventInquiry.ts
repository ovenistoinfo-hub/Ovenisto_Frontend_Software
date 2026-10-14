/** Whole days from `today` to `eventDate` (both "YYYY-MM-DD", PKT calendar dates). */
export function daysUntil(eventDate: string, today: string): number {
  return Math.round((Date.parse(`${eventDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** "Today" / "Tomorrow" / "In 6 days" / "Past" for an event date. */
export function whenLabel(days: number): string {
  if (days < 0) return "Past";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

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

/**
 * The payment string for what the cashier added on the payment form (same rows as POS's Finalize Sale:
 * method + amount, Add). The backend books split amounts exactly as written, so they must add up to the
 * total: change handed back comes off the cash part first, then off the last non-cash part. One method
 * used → just its name ("Cash"), as a single-method POS sale stores it.
 */
export function settledPaymentMethod(entries: PaymentSplit[], due: number): string {
  const merged: PaymentSplit[] = [];
  for (const e of entries) {
    const amount = roundedPart(e.amount);
    if (amount === 0) continue;
    const same = merged.find((m) => m.method === e.method);
    if (same) same.amount += amount;
    else merged.push({ method: e.method, amount });
  }
  let change = splitTotal(merged) - Math.round(due);
  if (change > 0) {
    const isCash = (m: PaymentSplit) => m.method.trim().toLowerCase() === "cash";
    const giveBackFrom = [...merged.filter(isCash), ...merged.filter((m) => !isCash(m)).reverse()];
    for (const m of giveBackFrom) {
      const take = Math.min(m.amount, change);
      m.amount -= take;
      change -= take;
      if (change <= 0) break;
    }
  }
  return buildPaymentMethodString(merged);
}

export interface PickupLine {
  id?: string;
  name: string;
  qty: number;
  price: number;
  discount?: number;
  dealLineId?: string | null;
  dealName?: string | null;
  modifiers?: string[];
  status?: string;
}

export type PickupRow<T extends PickupLine> =
  | { kind: "plain"; item: T }
  | { kind: "deal"; dealLineId: string; dealName: string; items: T[]; net: number };

const lineNet = (i: PickupLine) => i.price * i.qty - (i.discount ?? 0);

/** The bill's item rows, grouped like POS's cart: one row per deal redemption (its `dealLineId`), plain lines as they are. Cancelled lines are left out. */
export function groupPickupLines<T extends PickupLine>(items: T[]): PickupRow<T>[] {
  const active = items.filter((i) => (i.status ?? "active") === "active");
  const rows: PickupRow<T>[] = [];
  const seen = new Set<string>();
  for (const item of active) {
    if (!item.dealLineId) {
      rows.push({ kind: "plain", item });
      continue;
    }
    if (seen.has(item.dealLineId)) continue;
    seen.add(item.dealLineId);
    const dealName = item.dealName || "Deal";
    // The server names a deal's dish "<deal name>: <dish>"; under the deal's own row that prefix is noise.
    const prefix = `${dealName}:`;
    const dealItems = active
      .filter((i) => i.dealLineId === item.dealLineId)
      .map((i) => (i.name.startsWith(prefix) ? { ...i, name: i.name.slice(prefix.length).trim() } : i));
    rows.push({
      kind: "deal",
      dealLineId: item.dealLineId,
      dealName,
      items: dealItems,
      net: dealItems.reduce((s, i) => s + lineNet(i), 0),
    });
  }
  return rows;
}

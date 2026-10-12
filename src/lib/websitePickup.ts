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

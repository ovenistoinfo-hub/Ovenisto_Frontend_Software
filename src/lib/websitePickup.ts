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

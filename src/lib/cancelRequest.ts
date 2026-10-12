// Pure money rules for the POS cancel-request dialog.
import { isPaidOnline } from "@/lib/onlinePayment";

/** Refund method recorded on a cancel request for an order that was paid online. */
export const SAFEPAY_REFUND_METHOD = "safepay";

/**
 * What stays on an order after some of its items are cancelled. The delivery fee is untaxed and not
 * part of the items, so it carries over: dropping it understated the stored total, and for a
 * paid-online order Refunds due then over-refunded that fee.
 */
export function partialCancelTotals(args: {
  remainingItemsSubtotal: number;
  discount: number;
  taxRate: number;
  deliveryFee?: number | string | null;
}) {
  const newSubtotal = args.remainingItemsSubtotal - args.discount;
  const newTax = Math.round(newSubtotal * args.taxRate);
  const newTotal = newSubtotal + newTax + (Number(args.deliveryFee) || 0);
  return { newSubtotal, newTax, newTotal };
}

/** A paid-online order is always refunded through Safepay; any other order uses the cashier's pick. */
export function cancelRefundMethodFor(order: { paymentMethod?: string | null }, picked: string): string {
  return isPaidOnline(order) ? SAFEPAY_REFUND_METHOD : picked;
}

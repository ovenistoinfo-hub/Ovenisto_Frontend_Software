export type DeliveryPaymentMode = "cod" | "advance" | "prepaid" | "collected";

/**
 * Derives the delivery payment mode from an Order's paymentMethod string and advancePayment.
 * "Cash on Delivery"              → "cod"
 * "Cash on Delivery (Collected)"  → "collected"
 * starts with "Advance ("         → "advance"
 * anything else (normal payment)  → "prepaid"
 */
export function getDeliveryPaymentMode(
  paymentMethod: string | undefined | null,
  _advancePayment: number
): DeliveryPaymentMode {
  if (!paymentMethod || paymentMethod === "Cash on Delivery") return "cod";
  if (paymentMethod === "Cash on Delivery (Collected)") return "collected";
  if (paymentMethod.startsWith("Advance (")) return "advance";
  return "prepaid";
}

/**
 * Returns the amount the rider needs to collect from the customer at delivery.
 * cod:       full order total
 * advance:   total minus advance already paid  (min 0)
 * prepaid:   0 (already paid in full at counter)
 * collected: 0 (already collected by manager)
 */
export function getRiderCollectAmount(
  total: number,
  advancePayment: number,
  mode: DeliveryPaymentMode
): number {
  if (mode === "prepaid" || mode === "collected") return 0;
  if (mode === "cod") return total;
  return Math.max(0, total - advancePayment);
}

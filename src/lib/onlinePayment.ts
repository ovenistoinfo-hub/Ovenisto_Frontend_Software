// Website orders paid online (Safepay). Mirrors the backend's payments/payment.rules.ts.
import type { RefundDue } from "@/services/payment.service";

export const ONLINE_PAYMENT_METHOD = "Online (Safepay)";

export const isPaidOnline = (o: { paymentMethod?: string | null }) => (o.paymentMethod ?? "").trim() === ONLINE_PAYMENT_METHOD;

export const REFUND_REASON_LABEL: Record<RefundDue["reason"], string> = {
  cancelled: "Order cancelled",
  paid_other_way: "Paid another way",
  over_total: "Items removed after payment",
  duplicate: "Paid twice",
};

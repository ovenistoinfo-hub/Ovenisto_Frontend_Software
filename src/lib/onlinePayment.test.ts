import { describe, it, expect } from "vitest";
import { isPaidOnline, REFUND_REASON_LABEL, ONLINE_PAYMENT_METHOD } from "./onlinePayment";

describe("isPaidOnline", () => {
  it("matches only the gateway method the backend writes", () => {
    expect(ONLINE_PAYMENT_METHOD).toBe("Online (Safepay)");
    expect(isPaidOnline({ paymentMethod: "Online (Safepay)" })).toBe(true);
    expect(isPaidOnline({ paymentMethod: "Cash" })).toBe(false);
    expect(isPaidOnline({ paymentMethod: null })).toBe(false);
    expect(isPaidOnline({})).toBe(false);
  });
});

describe("REFUND_REASON_LABEL", () => {
  it("words every reason the backend sends", () => {
    expect(REFUND_REASON_LABEL).toEqual({
      cancelled: "Order cancelled",
      paid_other_way: "Paid another way",
      over_total: "Items removed after payment",
      duplicate: "Paid twice",
    });
  });
});

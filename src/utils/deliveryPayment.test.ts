import { describe, it, expect } from "vitest";
import { getDeliveryPaymentMode, getRiderCollectAmount } from "./deliveryPayment";

describe("getDeliveryPaymentMode", () => {
  it("treats an unpaid website order as cash on delivery", () => {
    expect(getDeliveryPaymentMode("Pending", 0)).toBe("cod");
    expect(getDeliveryPaymentMode("unpaid", 0)).toBe("cod");
    expect(getRiderCollectAmount(797, 0, getDeliveryPaymentMode("Pending", 0))).toBe(797);
  });

  it("keeps paid and advance orders as before", () => {
    expect(getDeliveryPaymentMode("Online (Safepay)", 0)).toBe("prepaid");
    expect(getDeliveryPaymentMode("Cash", 0)).toBe("prepaid");
    expect(getDeliveryPaymentMode("Advance (Cash): Rs.500", 500)).toBe("advance");
    expect(getDeliveryPaymentMode("Cash on Delivery (Collected)", 0)).toBe("collected");
  });
});

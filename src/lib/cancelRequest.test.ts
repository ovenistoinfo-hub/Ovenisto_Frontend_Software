import { describe, it, expect } from "vitest";
import { partialCancelTotals, cancelRefundMethodFor, SAFEPAY_REFUND_METHOD } from "./cancelRequest";

describe("partialCancelTotals", () => {
  it("keeps the delivery fee in the new total, untaxed", () => {
    expect(partialCancelTotals({ remainingItemsSubtotal: 1000, discount: 0, taxRate: 0.16, deliveryFee: 150 }))
      .toEqual({ newSubtotal: 1000, newTax: 160, newTotal: 1310 });
  });

  it("matches the old result when there is no delivery fee", () => {
    const base = { remainingItemsSubtotal: 1200, discount: 200, taxRate: 0.16 };
    expect(partialCancelTotals(base)).toEqual({ newSubtotal: 1000, newTax: 160, newTotal: 1160 });
    expect(partialCancelTotals({ ...base, deliveryFee: 0 }).newTotal).toBe(1160);
    expect(partialCancelTotals({ ...base, deliveryFee: null }).newTotal).toBe(1160);
    expect(partialCancelTotals({ ...base, deliveryFee: NaN }).newTotal).toBe(1160);
  });

  it("reads a numeric-string fee", () => {
    expect(partialCancelTotals({ remainingItemsSubtotal: 500, discount: 0, taxRate: 0, deliveryFee: "150.00" }).newTotal).toBe(650);
  });
});

describe("cancelRefundMethodFor", () => {
  it("forces safepay for a paid-online order", () => {
    expect(SAFEPAY_REFUND_METHOD).toBe("safepay");
    expect(cancelRefundMethodFor({ paymentMethod: "Online (Safepay)" }, "cash")).toBe("safepay");
  });

  it("keeps the cashier's pick for every other order", () => {
    expect(cancelRefundMethodFor({ paymentMethod: "Cash" }, "jazzcash")).toBe("jazzcash");
    expect(cancelRefundMethodFor({ paymentMethod: "Pending" }, "cash")).toBe("cash");
    expect(cancelRefundMethodFor({ paymentMethod: null }, "none")).toBe("none");
  });
});

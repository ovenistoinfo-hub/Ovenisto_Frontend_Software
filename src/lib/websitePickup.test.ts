import { describe, it, expect } from "vitest";
import { isUnpaidWebsitePickup, isCollectablePickup, buildPaymentMethodString, splitTotal, changeDue } from "./websitePickup";

const pickup = { type: "Take Away", orderSource: "website", paymentMethod: "Pending" as string | null | undefined, status: "preparing", acceptedById: "u1" as string | null };

describe("isUnpaidWebsitePickup", () => {
  it("is true for a website Take Away with no real payment", () => {
    for (const paymentMethod of [null, undefined, "", "Pending", " pending ", "Unpaid"]) {
      expect(isUnpaidWebsitePickup({ ...pickup, paymentMethod })).toBe(true);
    }
  });

  it("is false once paid, for a delivery, and for other sources", () => {
    expect(isUnpaidWebsitePickup({ ...pickup, paymentMethod: "Cash" })).toBe(false);
    expect(isUnpaidWebsitePickup({ ...pickup, type: "Delivery" })).toBe(false);
    expect(isUnpaidWebsitePickup({ ...pickup, orderSource: "pos" })).toBe(false);
  });
});

describe("isCollectablePickup", () => {
  it("lists accepted, open, unpaid pickups whatever the kitchen stage", () => {
    expect(isCollectablePickup(pickup)).toBe(true);
    expect(isCollectablePickup({ ...pickup, status: "ready" })).toBe(true);
    expect(isCollectablePickup({ ...pickup, status: "pending" })).toBe(true); // accepted, kitchen not started
  });

  it("skips a pickup still waiting for approval", () => {
    expect(isCollectablePickup({ ...pickup, status: "pending", acceptedById: null })).toBe(false);
  });

  it("skips cancelled, completed and paid pickups", () => {
    expect(isCollectablePickup({ ...pickup, status: "cancelled" })).toBe(false);
    expect(isCollectablePickup({ ...pickup, status: "completed" })).toBe(false);
    expect(isCollectablePickup({ ...pickup, paymentMethod: "JazzCash" })).toBe(false);
  });
});

describe("buildPaymentMethodString", () => {
  it("returns the bare method when only one carries an amount", () => {
    expect(buildPaymentMethodString([{ method: "Cash", amount: 1500 }, { method: "JazzCash", amount: 0 }])).toBe("Cash");
  });

  it("uses the POS split format, rounding each part", () => {
    expect(buildPaymentMethodString([{ method: "Cash", amount: 900 }, { method: "JazzCash", amount: 779.4 }])).toBe("Cash: Rs.900, JazzCash: Rs.779");
  });

  it("is empty when nothing was entered", () => {
    expect(buildPaymentMethodString([{ method: "Cash", amount: 0 }])).toBe("");
  });
});

describe("splitTotal", () => {
  it("adds rounded positive parts and ignores blanks and negatives", () => {
    expect(splitTotal([{ method: "Cash", amount: 900.4 }, { method: "Card", amount: 779.6 }, { method: "X", amount: -5 }, { method: "Y", amount: NaN }])).toBe(1680);
  });
});

describe("changeDue", () => {
  it("is what the customer gets back, never negative", () => {
    expect(changeDue(2000, 1679)).toBe(321);
    expect(changeDue(1000, 1679)).toBe(0);
    expect(changeDue(NaN, 1679)).toBe(0);
  });
});

import { describe, it, expect } from "vitest";
import { isUnpaidWebsitePickup, isCollectablePickup, buildPaymentMethodString, splitTotal, changeDue, settledPaymentMethod, groupPickupLines } from "./websitePickup";

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

describe("settledPaymentMethod", () => {
  it("stores a single method by name, however much cash was handed over", () => {
    expect(settledPaymentMethod([{ method: "Cash", amount: 2000 }], 1508)).toBe("Cash");
    expect(settledPaymentMethod([{ method: "Cash", amount: 500 }, { method: "Cash", amount: 1008 }], 1508)).toBe("Cash");
    expect(settledPaymentMethod([{ method: "Credit Card", amount: 1508 }], 1508)).toBe("Credit Card");
  });

  it("takes the change off the cash part, so a split adds up to the total", () => {
    expect(settledPaymentMethod([{ method: "Cash", amount: 1000 }, { method: "JazzCash", amount: 600 }], 1508))
      .toBe("Cash: Rs.908, JazzCash: Rs.600");
  });

  it("takes any excess off the last non-cash part when no cash was used", () => {
    expect(settledPaymentMethod([{ method: "Credit Card", amount: 1000 }, { method: "JazzCash", amount: 600 }], 1508))
      .toBe("Credit Card: Rs.1000, JazzCash: Rs.508");
  });

  it("is empty when nothing was added", () => {
    expect(settledPaymentMethod([], 1508)).toBe("");
  });
});

describe("groupPickupLines", () => {
  it("groups a deal's lines under one row, in order, and keeps plain lines as they are", () => {
    const rows = groupPickupLines([
      { id: "1", name: "Zinger Burger", qty: 2, price: 650, discount: 0 },
      { id: "2", name: "Duo: Pizza", qty: 1, price: 1200, discount: 200, dealLineId: "d1", dealName: "Duo Deal" },
      { id: "3", name: "Duo: Pepsi (Free)", qty: 1, price: 150, discount: 150, dealLineId: "d1", dealName: "Duo Deal" },
      { id: "4", name: "Fries", qty: 1, price: 300, status: "cancelled" },
    ]);
    expect(rows.map((r) => r.kind)).toEqual(["plain", "deal"]);
    const deal = rows[1];
    expect(deal.kind === "deal" && deal.dealName).toBe("Duo Deal");
    expect(deal.kind === "deal" && deal.items.map((i) => i.id)).toEqual(["2", "3"]);
    expect(deal.kind === "deal" && deal.net).toBe(1000);
  });

  it("drops the repeated deal-name prefix from a deal's dish names, as Waiter Panel does", () => {
    const [row] = groupPickupLines([
      { id: "1", name: "Duo Deal: Fajita Pizza (Medium)", qty: 1, price: 1399, discount: 300, dealLineId: "d1", dealName: "Duo Deal" },
      { id: "2", name: "Duo Deal: Pepsi 1.5L (Free)", qty: 1, price: 250, discount: 250, dealLineId: "d1", dealName: "Duo Deal" },
    ]);
    expect(row.kind === "deal" && row.items.map((i) => i.name)).toEqual(["Fajita Pizza (Medium)", "Pepsi 1.5L (Free)"]);
  });
});

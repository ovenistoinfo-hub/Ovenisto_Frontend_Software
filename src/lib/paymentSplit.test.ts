import { describe, it, expect } from "vitest";
import { buildPaymentMethodString, splitTotal, changeDue, settledPaymentMethod, settlePaymentEntries, allocatePaymentToOrders, planTableAdvance, hasOutstandingBalance, parseNetParts, advanceMethodOf } from "./paymentSplit";

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

describe("settlePaymentEntries", () => {
  it("merges a method's rows and drops a part the change used up", () => {
    expect(settlePaymentEntries([{ method: "JazzCash", amount: 1500 }, { method: "Cash", amount: 50 }, { method: "Cash", amount: 50 }], 1500))
      .toEqual([{ method: "JazzCash", amount: 1500 }]);
  });
});

describe("allocatePaymentToOrders", () => {
  it("gives every order the bare method name when one method paid the table", () => {
    expect(allocatePaymentToOrders([{ method: "Cash", amount: 2668 }], [1000, 1668])).toEqual(["Cash", "Cash"]);
  });

  it("shares a split out so each order's parts add up to its own total", () => {
    expect(allocatePaymentToOrders([{ method: "Cash", amount: 1668 }, { method: "JazzCash", amount: 1000 }], [1000, 1668]))
      .toEqual(["Cash", "Cash: Rs.668, JazzCash: Rs.1000"]);
  });

  it("gives a single order the whole split", () => {
    expect(allocatePaymentToOrders([{ method: "Cash", amount: 908 }, { method: "JazzCash", amount: 600 }], [1508]))
      .toEqual(["Cash: Rs.908, JazzCash: Rs.600"]);
  });

  it("lets the last order take what is left when the bill and the orders disagree", () => {
    // Rs. 500 of a 2,000 table was a reservation advance: the waiter collected 1,500.
    expect(allocatePaymentToOrders([{ method: "Cash", amount: 800 }, { method: "JazzCash", amount: 700 }], [1000, 1000]))
      .toEqual(["Cash: Rs.800, JazzCash: Rs.200", "JazzCash"]);
  });

  it("never leaves an order without a method", () => {
    expect(allocatePaymentToOrders([{ method: "Cash", amount: 600 }, { method: "JazzCash", amount: 400 }], [1000, 1000]))
      .toEqual(["Cash: Rs.600, JazzCash: Rs.400", "Cash"]);
  });
});

describe("planTableAdvance", () => {
  it("puts a booking advance on the last order big enough to hold it", () => {
    expect(planTableAdvance([{ total: 1200, advancePayment: 0 }, { total: 800, advancePayment: 0 }], 500))
      .toEqual({ targetIndex: 1, dues: [1200, 300] });
    expect(planTableAdvance([{ total: 1200, advancePayment: 0 }, { total: 300, advancePayment: 0 }], 500))
      .toEqual({ targetIndex: 0, dues: [700, 300] });
  });

  it("uses the largest order when none can hold it all", () => {
    expect(planTableAdvance([{ total: 400, advancePayment: 0 }, { total: 300, advancePayment: 0 }], 500))
      .toEqual({ targetIndex: 0, dues: [0, 300] });
  });

  it("leaves things alone when an order already carries the advance, or there is none", () => {
    expect(planTableAdvance([{ total: 1000, advancePayment: 500 }, { total: 800, advancePayment: 0 }], 500))
      .toEqual({ targetIndex: null, dues: [500, 800] });
    expect(planTableAdvance([{ total: 1000, advancePayment: 0 }], 0)).toEqual({ targetIndex: null, dues: [1000] });
  });
});

describe("hasOutstandingBalance", () => {
  it("is true while nothing has been paid", () => {
    for (const paymentMethod of [null, "", "Pending", "unpaid"]) {
      expect(hasOutstandingBalance({ paymentMethod, total: 1000, advancePayment: 0 })).toBe(true);
    }
  });

  it("is true when only an advance was recorded and the rest is still due", () => {
    expect(hasOutstandingBalance({ paymentMethod: "Advance (Cash): Rs.500", total: 1000, advancePayment: 500 })).toBe(true);
  });

  it("is false once the rest was paid, even on an order that carries an advance", () => {
    expect(hasOutstandingBalance({ paymentMethod: "Cash", total: 1000, advancePayment: 500 })).toBe(false);
    expect(hasOutstandingBalance({ paymentMethod: "Advance (Cash): Rs.500, Net (Cash): Rs.500", total: 1000, advancePayment: 500 })).toBe(false);
    expect(hasOutstandingBalance({ paymentMethod: "Advance (Cash): Rs.1000", total: 1000, advancePayment: 1000 })).toBe(false);
  });
});

describe("parseNetParts / advanceMethodOf", () => {
  it("reads the rest-of-bill parts of an advance string, like the backend's Cash Hub", () => {
    expect(parseNetParts("Advance (Cash): Rs.500, Net (Cash): Rs.700, Net (JazzCash): Rs.308"))
      .toEqual([{ method: "Cash", amount: 700 }, { method: "JazzCash", amount: 308 }]);
    expect(parseNetParts("Advance (JazzCash): Rs.507")).toEqual([]);
    expect(advanceMethodOf("Advance (JazzCash): Rs.507")).toBe("JazzCash");
    expect(advanceMethodOf("Cash")).toBe("Cash");
  });
});

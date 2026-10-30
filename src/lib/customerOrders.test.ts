import { describe, it, expect } from "vitest";
import { orderBelongsToCustomer } from "./customerOrders";

describe("orderBelongsToCustomer", () => {
  const b = { id: "b", name: "Awais", phone: "0311-6184946" };
  it("matches by id, then phone, never by a shared name", () => {
    expect(orderBelongsToCustomer({ customerId: "b" }, b)).toBe(true);
    expect(orderBelongsToCustomer({ customerId: "a", customerName: "Awais" }, b)).toBe(false);
    expect(orderBelongsToCustomer({ customerName: "Awais", phone: "03116184946" }, b)).toBe(true);
    expect(orderBelongsToCustomer({ customerName: "Awais", phone: "0300-1200000" }, b)).toBe(false);
    expect(orderBelongsToCustomer({ customerName: "Awais" }, b)).toBe(false);
  });
  it("falls back to the name only without a usable phone", () => {
    const w = { id: "w", name: "Walk Guest", phone: null };
    expect(orderBelongsToCustomer({ customerName: "walk guest" }, w)).toBe(true);
    expect(orderBelongsToCustomer({ customerName: "Other" }, w)).toBe(false);
  });
});

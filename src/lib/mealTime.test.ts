import { describe, it, expect } from "vitest";
import { inHoursWindow, isServedAt, servingLabel, pktMinuteNow, inClosedWindow, isWindowInside } from "./mealTime";

const meals = [
  { id: "bf", name: "Breakfast", hours: { open: "08:00", close: "11:00" } },
  { id: "dn", name: "Dinner", hours: { open: "19:00", close: "02:00" } },
  { id: "all", name: "All-Day Dining", hours: null },
];

describe("meal serving times", () => {
  it("checks a window, including one past midnight", () => {
    expect(inHoursWindow(meals[0].hours!, 8 * 60)).toBe(true);
    expect(inHoursWindow(meals[0].hours!, 11 * 60)).toBe(false);
    expect(inHoursWindow(meals[1].hours!, 60)).toBe(true);
    expect(inHoursWindow(meals[1].hours!, 12 * 60)).toBe(false);
  });

  it("serves untagged, all-day and unknown-meal dishes at any time", () => {
    expect(isServedAt([], meals, 13 * 60)).toBe(true);
    expect(isServedAt(["bf", "all"], meals, 13 * 60)).toBe(true);
    expect(isServedAt(["gone"], meals, 13 * 60)).toBe(true);
    expect(servingLabel(["bf", "all"], meals)).toBeNull();
  });

  it("serves a timed dish only inside one of its windows", () => {
    expect(isServedAt(["bf"], meals, 13 * 60)).toBe(false);
    expect(isServedAt(["bf", "dn"], meals, 20 * 60)).toBe(true);
    expect(servingLabel(["bf", "dn"], meals)).toBe("Breakfast 8:00 AM – 11:00 AM · Dinner 7:00 PM – 2:00 AM");
  });

  it("reads the PKT clock", () => {
    expect(pktMinuteNow(Date.UTC(2026, 9, 11, 20, 15))).toBe(75); // 20:15 UTC = 01:15 PKT
  });
});

describe("meal window inside opening hours", () => {
  const open = { open: "10:00", close: "02:00" };
  it("includes both ends of the opening hours, past midnight too", () => {
    expect(inClosedWindow(open, 10 * 60)).toBe(true);
    expect(inClosedWindow(open, 2 * 60)).toBe(true);
    expect(inClosedWindow(open, 2 * 60 + 5)).toBe(false);
    expect(inClosedWindow(open, 9 * 60 + 55)).toBe(false);
  });
  it("accepts a meal inside the hours and refuses one outside or across the closed period", () => {
    expect(isWindowInside({ open: "19:00", close: "01:00" }, open)).toBe(true);
    expect(isWindowInside({ open: "12:00", close: "02:00" }, open)).toBe(true);
    expect(isWindowInside({ open: "08:00", close: "11:00" }, open)).toBe(false);
    expect(isWindowInside({ open: "23:00", close: "10:30" }, open)).toBe(false);
    expect(isWindowInside({ open: "12:00", close: "16:00" }, { open: "11:00", close: "23:00" })).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { daysUntil, whenLabel } from "./eventInquiry";

describe("eventInquiry", () => {
  it("counts whole calendar days, across a month end", () => {
    expect(daysUntil("2026-10-14", "2026-10-14")).toBe(0);
    expect(daysUntil("2026-11-02", "2026-10-30")).toBe(3);
    expect(daysUntil("2026-10-10", "2026-10-14")).toBe(-4);
  });

  it("labels the event date", () => {
    expect(whenLabel(-1)).toBe("Past");
    expect(whenLabel(0)).toBe("Today");
    expect(whenLabel(1)).toBe("Tomorrow");
    expect(whenLabel(6)).toBe("In 6 days");
  });
});

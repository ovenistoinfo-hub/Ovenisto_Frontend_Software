import { describe, it, expect } from "vitest";
import { STATUS_TONE, statusKey, statusTone } from "./statusTone";

describe("statusTone", () => {
  it("maps kitchen and order vocabulary onto one canonical key", () => {
    expect(statusKey("new")).toBe("pending");
    expect(statusKey("Pending")).toBe("pending");
    expect(statusKey("PREPARING")).toBe("preparing");
    expect(statusKey("in-progress")).toBe("preparing");
    expect(statusKey("ready")).toBe("ready");
    expect(statusKey("served")).toBe("completed");
    expect(statusKey("canceled")).toBe("cancelled");
  });

  it("keeps pending=warning, preparing=info, ready/completed=success", () => {
    expect(statusTone("pending").text).toBe("text-warning");
    expect(statusTone("preparing").text).toBe("text-info");
    expect(statusTone("ready")).toBe(STATUS_TONE.ready);
    expect(statusTone("completed").text).toBe("text-success");
    expect(statusTone("cancelled").text).toBe("text-destructive");
  });

  it("falls back to a neutral tone for unknown or empty status", () => {
    expect(statusKey("mystery")).toBeNull();
    expect(statusKey(undefined)).toBeNull();
    expect(statusTone("mystery").text).toBe("text-muted-foreground");
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { TimePicker } from "./time-picker";

// Opens the popover and returns it (hours, minutes and AM/PM columns, in that order).
function openPicker() {
  fireEvent.click(screen.getByRole("button"));
  return screen.getByRole("dialog");
}

describe("TimePicker", () => {
  it("shows the placeholder while empty", () => {
    render(<TimePicker value="" onChange={() => {}} placeholder="Not set" />);
    expect(screen.getByRole("button").textContent).toContain("Not set");
  });

  it("disables times outside the range (10:00 AM – 2:00 AM)", () => {
    render(<TimePicker value="09:00" onChange={() => {}} range={{ open: "10:00", close: "02:00" }} />);
    const dialog = openPicker();
    // [0] is the hours column (minutes also list 05 and 10).
    const btn = (label: string) => within(dialog).getAllByText(label)[0].closest("button")!;
    expect(btn("10")).not.toBeDisabled();
    expect(btn("02")).not.toBeDisabled();
    expect(btn("05")).toBeDisabled();
    expect(btn("PM")).not.toBeDisabled();
  });

  it("moves a pick outside the range to the nearest allowed time", () => {
    const onChange = vi.fn();
    render(<TimePicker value="11:30" onChange={onChange} range={{ open: "10:00", close: "02:00" }} />);
    const dialog = openPicker();
    // 2:30 AM is past closing; the same hour's first allowed minute is 2:00 AM.
    fireEvent.click(within(dialog).getAllByText("02")[0].closest("button")!);
    expect(onChange).toHaveBeenCalledWith("02:00");
  });
});

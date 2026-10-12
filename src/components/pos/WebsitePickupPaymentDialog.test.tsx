import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/services/order.service", () => ({
  orderService: { updateOrder: vi.fn(), updateOrderStatus: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { orderService } from "@/services/order.service";
import { WebsitePickupPaymentDialog, type PickupPaymentOrder } from "./WebsitePickupPaymentDialog";

const updateOrder = vi.mocked(orderService.updateOrder);
const updateOrderStatus = vi.mocked(orderService.updateOrderStatus);

const order = (status: string): PickupPaymentOrder => ({
  id: "o1",
  orderNumber: "ORD-101",
  status,
  customer: "Ali",
  phone: "0300-1234567",
  items: [
    { id: "i1", name: "Zinger Burger", qty: 2, price: 650, discount: 0 },
    { id: "i2", name: "Duo: Pizza", qty: 1, price: 1200, discount: 200, dealLineId: "d1", dealName: "Duo Deal" },
  ],
  subtotal: 2300,
  discount: 0,
  tax: 368,
  total: 2668,
});

function renderDialog(status: string, onDone = vi.fn()) {
  render(
    <WebsitePickupPaymentDialog
      order={order(status)}
      paymentMethods={["Cash", "JazzCash"]}
      taxPercent={16}
      onOpenChange={() => {}}
      onDone={onDone}
    />
  );
  return onDone;
}

const amount = () => screen.getByLabelText("Amount");
const add = () => fireEvent.click(screen.getByRole("button", { name: /Add/ }));
const chip = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const confirmButton = (name: RegExp) => screen.getByRole("button", { name });

describe("WebsitePickupPaymentDialog", () => {
  beforeEach(() => {
    updateOrder.mockReset().mockResolvedValue({} as never);
    updateOrderStatus.mockReset().mockResolvedValue({} as never);
  });

  it("shows the order's stored bill, with deal lines grouped under the deal", () => {
    renderDialog("preparing");
    expect(screen.getByText("Payment Checkout")).toBeInTheDocument();
    expect(screen.getByText("Duo Deal")).toBeInTheDocument();
    expect(screen.getByText("Tax (16%)")).toBeInTheDocument();
    expect(screen.getAllByText("Rs. 2,668").length).toBeGreaterThan(0);
  });

  it("needs a payment added before it can confirm, like POS", () => {
    renderDialog("ready");
    expect(confirmButton(/Confirm & Hand Over/)).toBeDisabled();
    add(); // the exact amount is pre-filled
    expect(confirmButton(/Confirm & Hand Over/)).not.toBeDisabled();
  });

  it("records the payment only while the kitchen is still cooking", async () => {
    const onDone = renderDialog("preparing");
    add();
    fireEvent.click(confirmButton(/Confirm Payment/));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(updateOrder).toHaveBeenCalledWith("o1", { paymentMethod: "Cash" });
    expect(updateOrderStatus).not.toHaveBeenCalled();
  });

  it("records the payment and completes a Ready order", async () => {
    const onDone = renderDialog("ready");
    add();
    fireEvent.click(confirmButton(/Confirm & Hand Over/));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ id: "o1" }), "Cash"));
    expect(updateOrderStatus).toHaveBeenCalledWith("o1", "completed");
  });

  it("shows the change and still stores a plain 'Cash' when more cash is handed over", async () => {
    const onDone = renderDialog("preparing");
    fireEvent.change(amount(), { target: { value: "3000" } });
    add();
    expect(screen.getByText("Change Return:")).toBeInTheDocument();
    expect(screen.getAllByText("Rs. 332").length).toBeGreaterThan(0);
    fireEvent.click(confirmButton(/Confirm Payment/));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(updateOrder).toHaveBeenCalledWith("o1", { paymentMethod: "Cash" });
  });

  it("splits across methods and stores parts that add up to the total", async () => {
    const onDone = renderDialog("preparing");
    fireEvent.change(amount(), { target: { value: "2000" } });
    add();
    expect(confirmButton(/Confirm Payment/)).toBeDisabled(); // Rs. 668 still due
    chip("JazzCash");
    fireEvent.change(amount(), { target: { value: "1000" } });
    add();
    fireEvent.click(confirmButton(/Confirm Payment/));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(updateOrder).toHaveBeenCalledWith("o1", { paymentMethod: "Cash: Rs.1668, JazzCash: Rs.1000" });
  });

  it("removes an added payment", () => {
    renderDialog("ready");
    add();
    fireEvent.click(screen.getByRole("button", { name: "Remove payment entry" }));
    expect(confirmButton(/Confirm & Hand Over/)).toBeDisabled();
  });

  it("does not complete the order when recording the payment fails", async () => {
    updateOrder.mockRejectedValueOnce(new Error("Collect payment for this website pickup on POS first"));
    const onDone = renderDialog("ready");
    add();
    fireEvent.click(confirmButton(/Confirm & Hand Over/));
    await waitFor(() => expect(updateOrder).toHaveBeenCalled());
    expect(updateOrderStatus).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });
});

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
  items: [{ id: "i1", name: "Zinger Burger", qty: 2, price: 650, discount: 0 }],
  subtotal: 1300,
  discount: 0,
  tax: 208,
  total: 1508,
});

function renderDialog(status: string, onDone = vi.fn()) {
  render(
    <WebsitePickupPaymentDialog
      order={order(status)}
      paymentMethods={["Cash", "JazzCash"]}
      onOpenChange={() => {}}
      onDone={onDone}
    />
  );
  return onDone;
}

describe("WebsitePickupPaymentDialog", () => {
  beforeEach(() => {
    updateOrder.mockReset().mockResolvedValue({} as never);
    updateOrderStatus.mockReset().mockResolvedValue({} as never);
  });

  it("shows the order's stored total, not a recomputed one", () => {
    renderDialog("preparing");
    expect(screen.getAllByText("Rs. 1,508").length).toBeGreaterThan(0);
  });

  it("records the payment only while the kitchen is still cooking", async () => {
    const onDone = renderDialog("preparing");
    fireEvent.click(screen.getByRole("button", { name: /Collect Payment/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(updateOrder).toHaveBeenCalledWith("o1", { paymentMethod: "Cash" });
    expect(updateOrderStatus).not.toHaveBeenCalled();
  });

  it("records the payment and completes a Ready order", async () => {
    const onDone = renderDialog("ready");
    fireEvent.click(screen.getByRole("button", { name: /Collect & Hand Over/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ id: "o1" }), "Cash"));
    expect(updateOrderStatus).toHaveBeenCalledWith("o1", "completed");
  });

  it("blocks short cash and shows the change once enough is given", () => {
    renderDialog("ready");
    const cash = screen.getByLabelText("Cash received");
    fireEvent.change(cash, { target: { value: "1000" } });
    expect(screen.getByRole("button", { name: /Collect & Hand Over/ })).toBeDisabled();
    fireEvent.change(cash, { target: { value: "2000" } });
    expect(screen.getByText("Change Rs. 492")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Collect & Hand Over/ })).not.toBeDisabled();
  });

  it("sends a split in the POS format once it covers the total", async () => {
    const onDone = renderDialog("preparing");
    fireEvent.click(screen.getByRole("button", { name: "Split payment" }));
    fireEvent.change(screen.getByLabelText("Cash"), { target: { value: "1000" } });
    expect(screen.getByRole("button", { name: /Collect Payment/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("JazzCash"), { target: { value: "508" } });
    fireEvent.click(screen.getByRole("button", { name: /Collect Payment/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(updateOrder).toHaveBeenCalledWith("o1", { paymentMethod: "Cash: Rs.1000, JazzCash: Rs.508" });
  });

  it("does not complete the order when recording the payment fails", async () => {
    updateOrder.mockRejectedValueOnce(new Error("Collect payment for this website pickup on POS first"));
    const onDone = renderDialog("ready");
    fireEvent.click(screen.getByRole("button", { name: /Collect & Hand Over/ }));
    await waitFor(() => expect(updateOrder).toHaveBeenCalled());
    expect(updateOrderStatus).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });
});

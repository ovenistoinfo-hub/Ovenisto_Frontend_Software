import { describe, it, expect, vi, beforeEach } from "vitest";

const post = vi.fn();
const addPendingOrder = vi.fn();

vi.mock("../api", () => ({
  api: { post: (...args: unknown[]) => post(...args) },
  ApiError: class ApiError extends Error {},
}));
vi.mock("../outletStore", () => ({ outletStore: { get: () => "outlet-1" } }));
vi.mock("@/lib/db/offlineOrdersDb", () => ({
  addPendingOrder: (...args: unknown[]) => addPendingOrder(...args),
}));

import { orderService } from "../order.service";

const input = { type: "Take Away", items: [], subtotal: 0, total: 0 } as never;

describe("createOrder idempotency key", () => {
  beforeEach(() => {
    post.mockReset();
    addPendingOrder.mockReset();
    addPendingOrder.mockImplementation(async (payload: object, meta: { localId?: string }) => ({
      localId: meta.localId,
      provisionalOrderNumber: "OFFLINE-test",
      outletId: "outlet-1",
      createdAt: Date.now(),
      payload,
      status: "pending",
    }));
  });

  it("sends a clientRequestId on the first attempt", async () => {
    post.mockResolvedValue({ data: { id: "o1" } });
    await orderService.createOrder(input);
    expect(post.mock.calls[0][1].clientRequestId).toMatch(/[0-9a-f-]{36}/);
  });

  it("queues a timed-out order under the SAME key, so the retry cannot create a duplicate", async () => {
    post.mockRejectedValue(new TypeError("Failed to fetch"));
    await orderService.createOrder(input);
    const sentKey = post.mock.calls[0][1].clientRequestId;
    expect(addPendingOrder.mock.calls[0][1].localId).toBe(sentKey);
  });
});

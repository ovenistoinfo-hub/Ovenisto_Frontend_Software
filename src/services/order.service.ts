/**
 * Order Service - API calls for orders and kitchens
 */

import { api } from './api';

export interface OrderItemRecord {
  id: string;
  orderId: string;
  menuItemId: string | null;
  name: string;
  price: number;
  qty: number;
  discount: number;
  modifiers: string[];
  cookingTime: number | null;
  notes: string | null;
  categoryName: string | null;
  status: string; // "active" | "cancelled"
  kitchenStatus?: string;
  /** Set when this line came from a Deal. A deal's items can land on
   *  different kitchen boards (different categories → different assigned
   *  kitchens), so each line carries its own deal name rather than relying
   *  on a single order-level grouping. */
  dealId?: string | null;
  dealName?: string | null;
  dealLineId?: string | null;
  /** Stable per-dish key within one deal redemption — lets the kitchen
   *  accept/prepare/ready this specific dish independently of the rest of
   *  the deal. Null for a plain (non-deal) item. */
  dealItemKey?: string | null;
}

export interface OrderRecord {
  id: string;
  orderNumber: string;
  outletId: string | null;
  customerId: string | null;
  customerName: string | null;
  phone: string | null;
  type: string; // "Dine In", "Take Away", "Delivery", "Online", "Self Order", "Foodpanda", "Walk-in"
  subtotal: number;
  /** Manual staff discount PLUS any order-level deal the server resolved — the
   *  two are stored as one figure. `appliedDealName` says which deal, if any,
   *  is part of it. */
  discount: number;
  tax: number;
  total: number;
  /** The order-level deal (Promo Code / Minimum Spend) applied at checkout,
   *  re-derived server-side. Null on an order that earned none. */
  appliedDealId?: string | null;
  appliedDealCode?: string | null;
  appliedDealName?: string | null;
  status: string; // "pending", "preparing", "ready", "completed", "cancelled", "scheduled"
  kitchenStatus?: string;
  paymentMethod: string | null;
  date: string;
  time: string | null;
  staffId: string | null;
  staffName: string | null;
  tableNumber: number | null;
  deliveryAddress: string | null;
  riderId: string | null;
  isFutureSale: boolean;
  scheduledDate: string | null;
  scheduledTime: string | null;
  futureNotes: string | null;
  advancePayment: number;
  guestCount: number | null;
  acceptedById: string | null;
  acceptedByName: string | null;
  rejectionReason: string | null;
  isUrgent: boolean;
  customerType: string | null;
  orderSource: string | null;
  cashApproved?: boolean;
  hasPendingCancellationRequest?: boolean;
  pendingCancellationRequest?: {
    id: string;
    status: string;
    reason: string;
    createdAt: string;
  } | null;
  createdAt: string;
  updatedAt?: string;
  items: OrderItemRecord[];
  kitchenProgress?: { kitchenId: string; status: string }[];
  /** Per-dish kitchen status for deal redemptions — a sibling to
   *  kitchenProgress above, which still covers every non-deal item as one
   *  shared ticket per kitchen. */
  kitchenDealProgress?: { kitchenId: string; dealItemKey: string; status: string }[];
}

export interface KitchenRecord {
  id: string;
  name: string;
  assignedCategories: string[];
  status: string;
}

export interface CreateOrderInput {
  customerName?: string;
  phone?: string;
  customerId?: string;
  type: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod?: string;
  tableNumber?: number | null;
  deliveryAddress?: string;
  riderId?: string;
  staffName?: string;
  items: {
    menuItemId?: string | null;
    name: string;
    price: number;
    qty: number;
    discount?: number;
    modifiers?: string[];
    cookingTime?: number | null;
    notes?: string | null;
  }[];
  isFutureSale?: boolean;
  scheduledDate?: string;
  scheduledTime?: string;
  futureNotes?: string;
  advancePayment?: number;
  isUrgent?: boolean;
  customerType?: string;
  orderSource?: string;
  cashApproved?: boolean;
  /** Promo Code to apply to the whole order. Omit for a Minimum Spend deal —
   *  the backend auto-resolves that one on every order, code or not. */
  dealCode?: string | null;
}

/** An order-level discount (Promo Code, or an auto-applying Minimum Spend
 *  deal) matched against a cart's current subtotal. `amount` is server-
 *  derived — the client only ever displays it, never sends it back. */
export interface OrderCouponPreview {
  dealId: string;
  dealName: string;
  code: string | null;
  amount: number;
}

export const orderService = {
  // ── Orders ──

  async getOrders(params?: {
    search?: string;
    status?: string;
    type?: string;
    date?: string;
    page?: number;
    limit?: number;
    outletId?: string;
  }): Promise<{ data: OrderRecord[]; meta: any }> {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.status) q.set('status', params.status);
    if (params?.type) q.set('type', params.type);
    if (params?.date) q.set('date', params.date);
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    // Super Admin branch filter (?outletId=) — read by the backend's resolveOutletScope
    // as a fallback when no X-Outlet-Id header is set. Omit for "all outlets".
    if (params?.outletId && params.outletId !== 'all') q.set('outletId', params.outletId);
    const res = await api.get<{ success: boolean; data: OrderRecord[]; meta: any }>(`/orders?${q.toString()}`);
    return { data: res.data, meta: (res as any).meta };
  },

  async getOrder(id: string): Promise<OrderRecord> {
    const res = await api.get<{ success: boolean; data: OrderRecord }>(`/orders/${id}`);
    return res.data;
  },

  async createOrder(data: CreateOrderInput): Promise<OrderRecord> {
    const res = await api.post<{ success: boolean; data: OrderRecord }>('/orders', data);
    return res.data;
  },

  /** Previews the order-level discount createOrder would apply to this cart,
   *  so POS/Waiter can show it BEFORE the sale is finalised. Same
   *  resolveOrderDiscount call the real order runs, so the figure shown is the
   *  figure charged. Returns null when nothing applies. Pass `code` only when
   *  the customer typed one — a Minimum Spend deal needs no code and resolves
   *  from the subtotal alone. */
  async validateCoupon(input: { subtotal: number; orderType?: string; code?: string | null }): Promise<OrderCouponPreview | null> {
    const res = await api.post<{ success: boolean; data: OrderCouponPreview | null }>('/orders/validate-coupon', input);
    return res.data;
  },

  async updateOrder(id: string, data: Partial<CreateOrderInput> & { status?: string }): Promise<OrderRecord> {
    const res = await api.put<{ success: boolean; data: OrderRecord }>(`/orders/${id}`, data);
    return res.data;
  },

  async updateOrderStatus(id: string, status: string): Promise<OrderRecord> {
    const res = await api.put<{ success: boolean; data: OrderRecord }>(`/orders/${id}/status`, { status });
    return res.data;
  },

  /** dealItemKey targets one specific dish from a deal redemption's own
   *  ticket instead of the order's shared per-kitchen ticket — omit it to
   *  advance the shared ticket exactly as before. */
  async updateOrderKitchenStatus(id: string, kitchenId: string, status: string, dealItemKey?: string): Promise<OrderRecord> {
    const res = await api.put<{ success: boolean; data: OrderRecord }>(`/orders/${id}/kitchen-status`, { kitchenId, status, dealItemKey });
    return res.data;
  },

  async acceptSelfOrder(id: string): Promise<OrderRecord> {
    const res = await api.post<{ success: boolean; data: OrderRecord }>(`/orders/${id}/accept-self-order`, {});
    return res.data;
  },

  async rejectSelfOrder(id: string, reason?: string): Promise<OrderRecord> {
    const res = await api.post<{ success: boolean; data: OrderRecord }>(`/orders/${id}/reject-self-order`, { reason });
    return res.data;
  },

  async deleteOrder(id: string): Promise<void> {
    await api.delete<{ success: boolean }>(`/orders/${id}`);
  },

  // ── Kitchens ──

  async getKitchens(): Promise<KitchenRecord[]> {
    const res = await api.get<{ success: boolean; data: KitchenRecord[] }>('/kitchens');
    return res.data;
  },

  async createKitchen(data: { name: string; assignedCategories?: string[]; status?: string }): Promise<KitchenRecord> {
    const res = await api.post<{ success: boolean; data: KitchenRecord }>('/kitchens', data);
    return res.data;
  },

  async updateKitchen(id: string, data: { name?: string; assignedCategories?: string[]; status?: string }): Promise<KitchenRecord> {
    const res = await api.put<{ success: boolean; data: KitchenRecord }>(`/kitchens/${id}`, data);
    return res.data;
  },

  async deleteKitchen(id: string): Promise<void> {
    await api.delete<{ success: boolean }>(`/kitchens/${id}`);
  },
};

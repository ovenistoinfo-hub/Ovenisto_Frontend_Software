/**
 * Order Service - API calls for orders and kitchens
 */

import { api, ApiError } from './api';
import { outletStore } from './outletStore';
import { addPendingOrder, type PendingOrder, type PendingOrderPostSync } from '@/lib/db/offlineOrdersDb';

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
  /** Stable per-dish kitchen-ticket key, server-computed — lets the kitchen
   *  accept/prepare/ready this specific dish independently of every other dish
   *  on the order. Deal dishes: `${dealLineId}#${n}`; plain dishes:
   *  `p:${menuItemId|name}:${variantId|-}#${n}`. Null only on a line written
   *  before per-dish keys existed. */
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
  /** Set only on a client-side stub returned while offline (see order.service.ts's createOrder).
   *  `orderNumber` is a provisional "OFFLINE-xxxx" label and `id` is a local placeholder — never
   *  use either for a follow-up API call (reservation complete / table occupy / rider assign
   *  etc.); those must be deferred until the real order exists after a successful sync. */
  isQueuedOffline?: boolean;
  hasPendingCancellationRequest?: boolean;
  pendingCancellationRequest?: {
    id: string;
    status: string;
    reason: string;
    createdAt: string;
  } | null;
  createdAt: string;
  updatedAt?: string;
  /** Recipe-based COGS for this order, computed server-side. Only present on GET /orders
   *  (the Sales & Orders list) -- not on other endpoints that reuse OrderRecord's shape. */
  cost?: number;
  /** total - cost. Same availability caveat as cost. */
  profit?: number;
  /** This order's slice for the requested `category` filter only: revenue prorated across
   *  lines by gross-value, cost = real per-line COGS. Present only on GET /orders when a
   *  `category` param was sent (Dashboard "Sales by Category" drill-down). */
  categorySale?: number;
  categoryCost?: number;
  categoryProfit?: number;
  /** This order's slice for the requested `deal` filter only. A line-item deal (Combo/Option
   *  Combo/%Discount/BOGO) slices like category (revenue prorated across just its lines, cost =
   *  real per-line COGS); an order-level deal (Promo Code/Min Spend) has no per-line slice — the
   *  deal discounts the whole order, so these equal the whole-order sale/cost/profit. Present
   *  only on GET /orders when a `deal` param was sent (Dashboard "Deals Performance" drill-down). */
  dealSale?: number;
  dealCost?: number;
  dealProfit?: number;
  items: OrderItemRecord[];
  /** Legacy shared per-kitchen ticket — only orders whose items predate
   *  per-dish keys still use it (see kitchenDealProgress). */
  kitchenProgress?: { kitchenId: string; status: string; updatedAt?: string }[];
  /** Per-dish kitchen status, one row per (kitchen, dealItemKey). Every item —
   *  deal or plain — now has its own dealItemKey and its own row here, so each
   *  dish is accepted / prepared / readied independently. */
  kitchenDealProgress?: { kitchenId: string; dealItemKey: string; status: string; updatedAt?: string }[];
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
    /** Only set when a specific size/variant was picked; omitted for a plain "no variant" line. */
    variantId?: string | null;
    name: string;
    price: number;
    qty: number;
    discount?: number;
    modifiers?: string[];
    /** Menu-item modifier ids, distinct from `modifiers` (their display names) — both are sent. */
    modifierIds?: string[];
    cookingTime?: number | null;
    notes?: string | null;
    /** Deal-tagged line fields — see deal.revalidate.ts's IncomingOrderItem on the backend, which
     *  this mirrors. dealGroupId/dealRole are validation-only (never persisted server-side). */
    dealId?: string | null;
    dealName?: string | null;
    dealLineId?: string | null;
    dealGroupId?: string | null;
    dealRole?: 'buy' | 'get' | null;
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
  /** Idempotency key for the offline order queue — set only when this order was queued and is
   *  now being (re)sent by the sync engine. A resend with the same id returns the original order
   *  instead of creating a duplicate (see order.controller.ts's createOrder). Never set by a
   *  normal, online, non-queued create. */
  clientRequestId?: string;
}

/** Passed to createOrder only from POS.tsx/WaiterPanel.tsx, only used if the order ends up
 *  queued offline — tells the queue which screen created it and carries the online-only
 *  side-effect inputs (table occupancy, reservation completion, rider assignment) that must be
 *  deferred until the real order exists, rather than fired against a fake offline id. */
export interface OfflineQueueMeta {
  sourceScreen: 'pos' | 'waiter';
  postSync?: PendingOrderPostSync;
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

/** Builds an OrderRecord-shaped stub for a queued-offline order, from the same payload that
 *  would have been POSTed. Only `orderNumber` (the provisional "OFFLINE-xxxx" label), `id`, and
 *  `isQueuedOffline` are actually read by callers today (print/toast at the POS/WaiterPanel call
 *  sites) — every other field is filled in only so this satisfies OrderRecord's required shape. */
function buildOfflineOrderStub(row: PendingOrder): OrderRecord {
  const data = row.payload;
  const nowIso = new Date(row.createdAt).toISOString();
  return {
    id: `offline:${row.localId}`,
    orderNumber: row.provisionalOrderNumber,
    outletId: row.outletId,
    customerId: data.customerId ?? null,
    customerName: data.customerName ?? null,
    phone: data.phone ?? null,
    type: data.type,
    subtotal: data.subtotal,
    discount: data.discount,
    tax: data.tax,
    total: data.total,
    status: data.isFutureSale ? 'scheduled' : 'pending',
    paymentMethod: data.paymentMethod ?? null,
    date: nowIso,
    time: null,
    staffId: null,
    staffName: data.staffName ?? null,
    tableNumber: data.tableNumber ?? null,
    deliveryAddress: data.deliveryAddress ?? null,
    riderId: data.riderId ?? null,
    isFutureSale: data.isFutureSale ?? false,
    scheduledDate: data.scheduledDate ?? null,
    scheduledTime: data.scheduledTime ?? null,
    futureNotes: data.futureNotes ?? null,
    advancePayment: data.advancePayment ?? 0,
    guestCount: null,
    acceptedById: null,
    acceptedByName: null,
    rejectionReason: null,
    isUrgent: data.isUrgent ?? false,
    customerType: data.customerType ?? null,
    orderSource: data.orderSource ?? null,
    isQueuedOffline: true,
    createdAt: nowIso,
    items: data.items.map((item, idx) => ({
      id: `${row.localId}-item-${idx}`,
      orderId: `offline:${row.localId}`,
      menuItemId: item.menuItemId ?? null,
      name: item.name,
      price: item.price,
      qty: item.qty,
      discount: item.discount ?? 0,
      modifiers: item.modifiers ?? [],
      cookingTime: item.cookingTime ?? null,
      notes: item.notes ?? null,
      categoryName: null,
      status: 'active',
      dealId: item.dealId ?? null,
      dealName: item.dealName ?? null,
      dealLineId: item.dealLineId ?? null,
    })),
  };
}

/** Raw, no-queueing POST /orders — the one real network attempt, shared by createOrder (which
 *  queues on a network-type failure) and offlineOrderSync.ts's flush loop (which does its OWN
 *  retry/stop bookkeeping around this and must not re-enter createOrder's queueing branch on a
 *  failure). Throws ApiError on a genuine server rejection, or a TypeError/AbortError on a
 *  network-type failure/timeout — callers decide what to do with each. */
export async function postOrderDirect(data: CreateOrderInput): Promise<OrderRecord> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await api.post<{ success: boolean; data: OrderRecord }>('/orders', data, {
      signal: controller.signal,
      suppressAuthRedirect: true,
    });
    return res.data;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const orderService = {
  // ── Orders ──

  async getOrders(params?: {
    search?: string;
    status?: string;
    type?: string;
    /** Single-day filter, kept for backward compatibility — prefer from/to. */
    date?: string;
    /** Date range (YYYY-MM-DD), inclusive both ends. */
    from?: string;
    to?: string;
    /** Optional time-of-day narrowing (24h "HH:mm"), applied within the date range. */
    fromTime?: string;
    toTime?: string;
    /** Hide orders with no real payment recorded (null/empty/"Pending") -- Sales & Orders only. */
    excludeUnpaid?: boolean;
    /** Keep only orders with an active line in this food category, and attach each order's
     *  category-scoped Sale/Cost/Profit (categorySale/categoryCost/categoryProfit). */
    category?: string;
    /** Keep only orders that used this payment method (split-aware: a split order matches every
     *  method it used). Amounts stay whole-order — no per-method slice. */
    paymentMethod?: string;
    /** Keep only orders where this Deal id was redeemed (line-item or order-level). Amounts
     *  stay whole-order — no per-deal slice, unlike category. */
    deal?: string;
    /** Keep only orders placed by this staff member (Order.staffId). Amounts stay whole-order. */
    staffId?: string;
    page?: number;
    limit?: number;
    outletId?: string;
  }): Promise<{ data: OrderRecord[]; meta: any }> {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.status) q.set('status', params.status);
    if (params?.type) q.set('type', params.type);
    if (params?.date) q.set('date', params.date);
    if (params?.from) q.set('from', params.from);
    if (params?.to) q.set('to', params.to);
    if (params?.fromTime) q.set('fromTime', params.fromTime);
    if (params?.toTime) q.set('toTime', params.toTime);
    if (params?.excludeUnpaid) q.set('excludeUnpaid', 'true');
    if (params?.category) q.set('category', params.category);
    if (params?.paymentMethod) q.set('paymentMethod', params.paymentMethod);
    if (params?.deal) q.set('deal', params.deal);
    if (params?.staffId) q.set('staffId', params.staffId);
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    // Super Admin branch filter (?outletId=) — read by the backend's resolveOutletScope
    // as a fallback when no X-Outlet-Id header is set. Omit for "all outlets".
    if (params?.outletId && params.outletId !== 'all') q.set('outletId', params.outletId);
    const res = await api.get<{ success: boolean; data: OrderRecord[]; meta: any }>(`/orders?${q.toString()}`);
    return { data: res.data, meta: (res as any).meta };
  },

  /** Sale/Cost/Profit/Margin totalled across every order matching these filters (not just one
   *  page) -- backs the Sales & Orders page's 4 summary cards. Same filter params as getOrders. */
  async getOrdersSummary(params?: {
    search?: string;
    status?: string;
    type?: string;
    from?: string;
    to?: string;
    fromTime?: string;
    toTime?: string;
    excludeUnpaid?: boolean;
    /** Same as getOrders: totals become that category's slice across the whole filtered set. */
    category?: string;
    /** Same as getOrders: restrict to orders that used this payment method (whole-order totals). */
    paymentMethod?: string;
    /** Same as getOrders: restrict to orders where this Deal id was redeemed (whole-order totals). */
    deal?: string;
    /** Same as getOrders: restrict to orders placed by this staff member. */
    staffId?: string;
    outletId?: string;
  }): Promise<{ sale: number; cost: number; profit: number; orders: number; marginPct: number }> {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.status) q.set('status', params.status);
    if (params?.type) q.set('type', params.type);
    if (params?.from) q.set('from', params.from);
    if (params?.to) q.set('to', params.to);
    if (params?.fromTime) q.set('fromTime', params.fromTime);
    if (params?.toTime) q.set('toTime', params.toTime);
    if (params?.excludeUnpaid) q.set('excludeUnpaid', 'true');
    if (params?.category) q.set('category', params.category);
    if (params?.paymentMethod) q.set('paymentMethod', params.paymentMethod);
    if (params?.deal) q.set('deal', params.deal);
    if (params?.staffId) q.set('staffId', params.staffId);
    if (params?.outletId && params.outletId !== 'all') q.set('outletId', params.outletId);
    const res = await api.get<{ success: boolean; data: { sale: number; cost: number; profit: number; orders: number; marginPct: number } }>(`/orders/summary?${q.toString()}`);
    return res.data;
  },

  async getOrder(id: string): Promise<OrderRecord> {
    const res = await api.get<{ success: boolean; data: OrderRecord }>(`/orders/${id}`);
    return res.data;
  },

  /** `offlineMeta` is only consulted if this order ends up queued offline — see
   *  OfflineQueueMeta. A 10s timeout guards against a hung connection (neither a clean success
   *  nor a clean network error), since fetch itself has no timeout; `suppressAuthRedirect`
   *  prevents an unrelated hard /login redirect from firing mid-checkout on a 401 here. */
  async createOrder(data: CreateOrderInput, offlineMeta?: OfflineQueueMeta): Promise<OrderRecord> {
    try {
      return await postOrderDirect(data);
    } catch (err) {
      if (err instanceof ApiError) throw err; // a genuine rejection (stock/deal/validation) — unchanged behavior
      // Network-type failure (fetch TypeError, or our own AbortController timeout) — queue it
      // instead of surfacing an error; the sync engine resends it once connectivity returns.
      const row = await addPendingOrder(data, {
        sourceScreen: offlineMeta?.sourceScreen ?? 'pos',
        outletId: outletStore.get(),
        postSync: offlineMeta?.postSync,
      });
      return buildOfflineOrderStub(row);
    }
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

  /** Advance a kitchen's progress on an order. `dealItemKey` targets one dish's
   *  own ticket; `dealItemKeys` targets several in a SINGLE request/transaction
   *  ("Start All Cooking" / "Mark All Ready") instead of one call apiece. Omit
   *  both only for a legacy order whose items predate per-dish keys — that
   *  advances the shared per-kitchen ticket. */
  async updateOrderKitchenStatus(
    id: string,
    kitchenId: string,
    status: string,
    dealItemKey?: string,
    dealItemKeys?: string[],
  ): Promise<OrderRecord> {
    const res = await api.put<{ success: boolean; data: OrderRecord }>(
      `/orders/${id}/kitchen-status`,
      { kitchenId, status, dealItemKey, dealItemKeys },
    );
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

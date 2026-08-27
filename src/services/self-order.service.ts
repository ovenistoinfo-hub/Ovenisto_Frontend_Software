/**
 * Self-Order Service
 *
 * Deliberately does NOT use the shared `api.ts` client. That wrapper is built for
 * authenticated staff sessions — it attaches a JWT header, runs a GET cache, and
 * critically treats any 401 as an expired staff session and redirects to /login.
 * A customer scanning a QR code has no login at all, so reusing it risks silently
 * bouncing a real customer to the staff login screen. This is a small, standalone
 * fetch helper instead, used only by the public /self-order/* endpoints.
 */

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

export class SelfOrderApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function publicRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new SelfOrderApiError(body?.error || `Request failed with status ${res.status}`, res.status);
  }
  return body.data as T;
}

export interface SelfOrderTable {
  tableId: string;
  tableNumber: string;
  floor: string | null;
  capacity: number;
  outletId: string;
  outletName: string | null;
}

export interface SelfOrderMenuVariant {
  id: string;
  name: string;
  price: number;
  /** Can at least one more unit of this size currently be made from the
   *  outlet's live kitchen/ingredient stock? Computed server-side —
   *  self-order never receives raw stock numbers, only this boolean. */
  available: boolean;
}

export interface SelfOrderMenuModifier {
  id: string;
  name: string;
  price: number;
}

export interface SelfOrderMenuCategory {
  id: string;
  name: string;
  displayOrder: number;
  status: string;
}

export interface SelfOrderMenuItem {
  id: string;
  name: string;
  price: number;
  image?: string | null;
  category: { id: string; name: string } | null;
  /** True if the item itself (no variants) or at least one of its variants
   *  can currently be made. False only when every sellable size is out of
   *  stock — see each SelfOrderMenuVariant's own `available` for which one. */
  available: boolean;
  variants: SelfOrderMenuVariant[];
  modifiers: SelfOrderMenuModifier[];
}

export interface SelfOrderMenu {
  categories: SelfOrderMenuCategory[];
  items: SelfOrderMenuItem[];
}

export interface SelfOrderDealComponent {
  id: string;
  menuItemId: string;
  variantId: string | null;
  qty: number;
  displayOrder: number;
}

export interface SelfOrderDealOptionItem {
  id: string;
  menuItemId: string;
  variantId: string | null;
  extraPrice: number;
  displayOrder: number;
}

export interface SelfOrderDealOptionGroup {
  id: string;
  label: string;
  minSelections: number;
  maxSelections: number;
  displayOrder: number;
  options: SelfOrderDealOptionItem[];
}

export interface SelfOrderDealBogoItem {
  role: "BUY" | "GET";
  menuItemId: string;
  variantId: string | null;
  qty: number;
  displayOrder: number;
}

export type SelfOrderDealType = "combo" | "option_combo" | "percentage" | "buy_x_get_y" | "order_discount";

/** The public/self-order-safe deal shape from GET /self-order/deals — see
 *  the backend's mapDealOutPublic. Unlike the staff-facing DealRecord, this
 *  has no per-channel dineInPrice/takeAwayPrice/etc columns: `price` and
 *  `discountPercent` are already resolved to Dine In (the only channel a
 *  self-order customer ever orders on), so no channel lookup is needed here. */
export interface SelfOrderDeal {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  image: string | null;
  type: SelfOrderDealType;
  price: number | null;
  discountPercent: number | null;
  applicableItems: string[];
  applicableCategories: string[];
  components: SelfOrderDealComponent[];
  optionGroups: SelfOrderDealOptionGroup[];
  bogoItems: SelfOrderDealBogoItem[];
  buyItemId: string | null;
  buyVariantId: string | null;
  buyQty: number | null;
  getItemId: string | null;
  getVariantId: string | null;
  getQty: number | null;
}

export interface CreateSelfOrderItemInput {
  menuItemId?: string | null;
  variantId?: string | null;
  name: string;
  price: number;
  qty: number;
  modifierIds?: string[];
  /** Set when this line came off a Deal card rather than the plain menu.
   *  deal.revalidate.ts re-derives the real price/discount server-side from
   *  these — the client's own price/discount for a deal line is never
   *  trusted, only its identity. */
  dealId?: string | null;
  dealName?: string | null;
  dealLineId?: string | null;
  dealGroupId?: string | null;
  dealRole?: "buy" | "get" | null;
}

export interface CreateSelfOrderInput {
  tableId: string;
  customerName: string;
  customerPhone: string;
  guestCount: number;
  subtotal: number;
  tax: number;
  total: number;
  specialInstructions?: string;
  /** Promo Code the customer typed in, if any. Omit for a Minimum Spend
   *  discount — that applies automatically, no code needed. */
  dealCode?: string | null;
  items: CreateSelfOrderItemInput[];
}

/** A Promo Code (code set) or Minimum Spend (code null, auto-applied) deal
 *  matched against the cart's current subtotal. */
export interface SelfOrderCouponPreview {
  dealId: string;
  dealName: string;
  code: string | null;
  amount: number;
}

export interface SelfOrderStatus {
  orderId: string;
  status: "pending" | "confirmed" | "cancelled";
  accepted: boolean;
  rejectionReason?: string;
  paid: boolean;
}

export interface CustomerLookupResult {
  exists: boolean;
  name?: string;
}

export interface SelfOrderActiveOrderItem {
  id: string;
  menuItemId: string | null;
  variantId?: string | null;
  name: string;
  price: number;
  qty: number;
  discount?: number;
  modifiers?: string[];
  dealId?: string | null;
  dealName?: string | null;
  dealLineId?: string | null;
}

export interface SelfOrderActiveOrder {
  orderId: string;
  items: SelfOrderActiveOrderItem[];
  status: SelfOrderStatus;
}

export const selfOrderService = {
  async getTable(tableId: string): Promise<SelfOrderTable> {
    return publicRequest<SelfOrderTable>(`/self-order/table/${tableId}`);
  },

  /** Pass the scanned table's id so item/variant `available` reflects that
   *  outlet's live kitchen stock — omit it and everything comes back
   *  available (no outlet to check stock against). */
  async getMenu(tableId?: string): Promise<SelfOrderMenu> {
    return publicRequest<SelfOrderMenu>(`/self-order/menu${tableId ? `?tableId=${encodeURIComponent(tableId)}` : ""}`);
  },

  /** Live, outlet-scoped deals for the QR menu — pass the scanned table's id
   *  so outlet-restricted deals are included alongside chain-wide ones. */
  async getDeals(tableId?: string): Promise<SelfOrderDeal[]> {
    return publicRequest<SelfOrderDeal[]>(`/self-order/deals${tableId ? `?tableId=${encodeURIComponent(tableId)}` : ""}`);
  },

  async createOrder(input: CreateSelfOrderInput): Promise<{ orderId: string }> {
    return publicRequest<{ orderId: string }>(`/self-order/orders`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async getStatus(orderId: string): Promise<SelfOrderStatus> {
    return publicRequest<SelfOrderStatus>(`/self-order/orders/${orderId}/status`);
  },

  async lookupCustomerByPhone(phone: string): Promise<CustomerLookupResult> {
    return publicRequest<CustomerLookupResult>(`/self-order/customer-lookup?phone=${encodeURIComponent(phone)}`);
  },

  async getActiveOrders(tableId: string): Promise<SelfOrderActiveOrder[]> {
    return publicRequest<SelfOrderActiveOrder[]>(`/self-order/table/${tableId}/active-orders`);
  },

  /** Previews a Promo Code (pass `code`) or checks for an auto-applying
   *  Minimum Spend deal (omit `code`) against the cart's current subtotal.
   *  Null means nothing applies — not an error, most carts have no coupon.
   *  A real Promo Code is re-validated again at order-creation time; this is
   *  display-only. */
  async validateCoupon(input: { tableId: string; code?: string; subtotal: number }): Promise<SelfOrderCouponPreview | null> {
    return publicRequest<SelfOrderCouponPreview | null>(`/self-order/validate-coupon`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
};

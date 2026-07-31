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
  variants: SelfOrderMenuVariant[];
  modifiers: SelfOrderMenuModifier[];
}

export interface SelfOrderMenu {
  categories: SelfOrderMenuCategory[];
  items: SelfOrderMenuItem[];
}

export interface CreateSelfOrderItemInput {
  menuItemId?: string | null;
  variantId?: string | null;
  name: string;
  price: number;
  qty: number;
  modifierIds?: string[];
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
  items: CreateSelfOrderItemInput[];
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

export const selfOrderService = {
  async getTable(tableId: string): Promise<SelfOrderTable> {
    return publicRequest<SelfOrderTable>(`/self-order/table/${tableId}`);
  },

  async getMenu(): Promise<SelfOrderMenu> {
    return publicRequest<SelfOrderMenu>(`/self-order/menu`);
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
};

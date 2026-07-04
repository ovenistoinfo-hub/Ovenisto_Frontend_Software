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
  discount: number;
  tax: number;
  total: number;
  status: string; // "pending", "preparing", "ready", "completed", "cancelled", "scheduled"
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
  isUrgent: boolean;
  customerType: string | null;
  orderSource: string | null;
  createdAt: string;
  items: OrderItemRecord[];
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
  }): Promise<{ data: OrderRecord[]; meta: any }> {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.status) q.set('status', params.status);
    if (params?.type) q.set('type', params.type);
    if (params?.date) q.set('date', params.date);
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
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

  async updateOrder(id: string, data: Partial<CreateOrderInput> & { status?: string }): Promise<OrderRecord> {
    const res = await api.put<{ success: boolean; data: OrderRecord }>(`/orders/${id}`, data);
    return res.data;
  },

  async updateOrderStatus(id: string, status: string): Promise<OrderRecord> {
    const res = await api.put<{ success: boolean; data: OrderRecord }>(`/orders/${id}/status`, { status });
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

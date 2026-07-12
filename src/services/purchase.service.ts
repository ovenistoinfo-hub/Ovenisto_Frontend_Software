import { api } from './api';

export interface PurchaseItem {
  ingredientId?: string;
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  total: number;
  approvedQty?: number;
  expiryDate?: string;
  wasteQty?: number;
  wasteReason?: string;
  source?: 'approved' | 'manual';
}

export interface PurchaseRecord {
  id: string;
  supplierId: string | null;
  supplierName: string | null;
  warehouseId?: string | null;
  warehouseName?: string | null;
  invoiceNumber: string | null;
  items: PurchaseItem[];
  subtotal: number | null;
  discount: number;
  tax: number | null;
  shippingCost: number | null;
  miscAmount: number | null;
  total: number | null;
  paid: number;
  due: number;
  status: string;
  date: string;
  notes: string | null;
  createdAt: string;
  createdByName: string | null;
  createdByRole: string | null;
  createdByPhone: string | null;
  createdByEmail: string | null;
}

export interface CreatePurchaseInput {
  supplierId?: string;
  invoiceNumber?: string;
  date: string;
  items: PurchaseItem[];
  subtotal?: number;
  discount?: number;
  tax?: number;
  shippingCost?: number;
  miscAmount?: number;
  total: number;
  paid?: number;
  status: 'paid' | 'unpaid' | 'partial';
  notes?: string;
  warehouseId?: string;
  purchaseRequestId?: string;
}

export const purchaseService = {
  async getAll(params?: {
    page?: number;
    limit?: number;
    supplierId?: string;
    status?: string;
  }): Promise<{
    success: boolean;
    data: PurchaseRecord[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.supplierId) qs.set('supplierId', params.supplierId);
    if (params?.status) qs.set('status', params.status);
    return api.get(`/purchases${qs.toString() ? `?${qs}` : ''}`);
  },

  async getById(id: string): Promise<PurchaseRecord> {
    const res = await api.get<{ success: boolean; data: PurchaseRecord }>(`/purchases/${id}`);
    return res.data;
  },

  async create(data: CreatePurchaseInput): Promise<PurchaseRecord> {
    const res = await api.post<{ success: boolean; data: PurchaseRecord }>('/purchases', data);
    return res.data;
  },

  async updatePayment(id: string, data: { paid: number; status: 'paid' | 'unpaid' | 'partial' }): Promise<PurchaseRecord> {
    const res = await api.put<{ success: boolean; data: PurchaseRecord }>(`/purchases/${id}`, data);
    return res.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/purchases/${id}`);
  },
};

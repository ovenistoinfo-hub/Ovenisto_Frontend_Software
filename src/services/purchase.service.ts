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

export interface PurchasePaymentEntry {
  id: string;
  amount: number;
  balanceAfter: number;
  note: string | null;
  createdAt: string;
}

export interface SupplierDueEntry {
  supplierId: string | null;
  supplierName: string | null;
  total: number;
  paid: number;
  due: number;
  status: 'paid' | 'unpaid' | 'partial';
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
  paymentHistory: PurchasePaymentEntry[];
  supplierDues?: SupplierDueEntry[] | null;
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
  supplierDues?: SupplierDueEntry[];
}

export const purchaseService = {
  async getAll(params?: {
    page?: number;
    limit?: number;
    supplierId?: string;
    status?: string;
    outletId?: string;
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
    if (params?.outletId) qs.set('outletId', params.outletId);
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

  async pay(id: string, data: { amount: number; note?: string; supplierId?: string }): Promise<PurchaseRecord> {
    const res = await api.post<{ success: boolean; data: PurchaseRecord }>(`/purchases/${id}/pay`, data);
    return res.data;
  },

  async updatePayment(id: string, data: { paid: number; status: 'paid' | 'unpaid' | 'partial' }): Promise<PurchaseRecord> {
    const res = await api.put<{ success: boolean; data: PurchaseRecord }>(`/purchases/${id}`, data);
    return res.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/purchases/${id}`);
  },
  
  async getStats(params?: { supplierId?: string }): Promise<{
    success: boolean;
    data: { total: number; today: number; weekly: number; monthly: number };
  }> {
    const qs = new URLSearchParams();
    if (params?.supplierId) qs.set('supplierId', params.supplierId);
    return api.get(`/purchases/stats/summary${qs.toString() ? `?${qs}` : ''}`);
  },
};

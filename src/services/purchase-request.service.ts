/**
 * Purchase Request Service — API calls for purchase requisition workflow
 */

import { api } from './api';

export interface PurchaseRequestItemRecord {
  id: string;
  ingredientId: string;
  requestedQty: number;
  approvedQty: number | null;
  ingredient: {
    id: string;
    name: string;
    currentStock: number;
    purchasePrice: number | null;
    unit: { id: string; name: string; symbol: string } | null;
    category: { id: string; name: string } | null;
  };
}

export interface PurchaseRequestRecord {
  id: string;
  requestNo: string;
  status: string; // PENDING, APPROVED, REJECTED, PURCHASED, CANCELLED
  warehouseId: string;
  notes: string | null;
  createdAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  requestedBy: { id: string; name: string; role: string; phone?: string; email?: string };
  approvedBy: { id: string; name: string; role: string; phone?: string; email?: string } | null;
  warehouse: { id: string; name: string; type: string; outlet?: { id: string; name: string } | null };
  items: PurchaseRequestItemRecord[];
  purchase?: { id: string; invoiceNumber: string | null; status: string; date: string; total: number } | null;
}

export interface CreatePurchaseRequestInput {
  warehouseId: string;
  items: { ingredientId: string; requestedQty: number }[];
  notes?: string;
}

interface PaginatedResponse {
  success: boolean;
  data: PurchaseRequestRecord[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export const purchaseRequestService = {
  async getAll(params?: { status?: string; warehouseId?: string; page?: number; limit?: number }): Promise<{ data: PurchaseRequestRecord[]; meta: PaginatedResponse['meta'] }> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.warehouseId) query.set('warehouseId', params.warehouseId);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    const res = await api.get<PaginatedResponse>(`/purchase-requests${qs ? `?${qs}` : ''}`);
    return { data: res.data, meta: res.meta };
  },

  async getById(id: string): Promise<PurchaseRequestRecord> {
    const res = await api.get<{ data: PurchaseRequestRecord }>(`/purchase-requests/${id}`);
    return res.data;
  },

  async create(data: CreatePurchaseRequestInput): Promise<PurchaseRequestRecord> {
    const res = await api.post<{ data: PurchaseRequestRecord }>('/purchase-requests', data);
    return res.data;
  },

  async approve(id: string, items: { ingredientId: string; approvedQty: number }[]): Promise<PurchaseRequestRecord> {
    const res = await api.patch<{ data: PurchaseRequestRecord }>(`/purchase-requests/${id}/approve`, { items });
    return res.data;
  },

  async reject(id: string, rejectionReason: string): Promise<PurchaseRequestRecord> {
    const res = await api.patch<{ data: PurchaseRequestRecord }>(`/purchase-requests/${id}/reject`, { rejectionReason });
    return res.data;
  },

  async cancel(id: string): Promise<PurchaseRequestRecord> {
    const res = await api.patch<{ data: PurchaseRequestRecord }>(`/purchase-requests/${id}/cancel`);
    return res.data;
  },
};

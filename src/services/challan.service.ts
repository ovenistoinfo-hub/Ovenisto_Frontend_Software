import { api } from './api';

export type ChallanStatus = 'PENDING' | 'DISPATCHED' | 'RECEIVED' | 'CANCELLED';

export interface ChallanItem {
  id: string;
  ingredientId: string;
  ingredientName: string;
  category: string | null;
  unit: string;
  qty: number;
  receivedQty: number | null;
  wasteQty: number | null;
  wasteReason: string | null;
  unitPrice: number | null;
}

export interface ChallanUser {
  id: string;
  name: string;
  phone: string | null;
  role: string | null;
  outlet: string | null;
}

export interface LinkedDemand {
  id: string;
  demandNo: string;
  status: string;
  notes: string | null;
  rejectionReason: string | null;
  requestingWH: { id: string; name: string; type: string } | null;
  supplyingWH:  { id: string; name: string; type: string } | null;
  requestedBy:  ChallanUser | null;
  approvedBy:   ChallanUser | null;
  approvedAt:  string | null;
  createdAt:   string;
  items: {
    id: string;
    ingredientId: string;
    ingredientName: string;
    category: string | null;
    unit: string;
    requestedQty: number;
    approvedQty: number | null;
    stockAtRequest: number | null;
  }[];
}

export interface ChallanRecord {
  id: string;
  challanNo: string;
  status: ChallanStatus;
  notes: string | null;
  shippingCost: number | null;
  miscAmount: number | null;
  tax: number | null;
  subtotal: number | null;
  total: number | null;
  paid: number;
  due: number;
  paymentStatus: 'paid' | 'partial' | 'unpaid' | null;
  fromWarehouse: { id: string; name: string; type: string; outletId: string | null };
  toWarehouse:   { id: string; name: string; type: string; outletId: string | null };
  createdBy:    ChallanUser | null;
  dispatchedBy: ChallanUser | null;
  receivedBy:   ChallanUser | null;
  dispatchedAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  items: ChallanItem[];
  demand: LinkedDemand | null;
}

export interface ReceiveChallanPayload {
  items?: { id: string; receivedQty: number; wasteQty?: number; wasteReason?: string }[];
  shippingCost?: number;
  miscAmount?: number;
  tax?: number;
  paid?: number;
}

export const challanService = {
  getAll: async (params?: { status?: string; fromWarehouseId?: string; toWarehouseId?: string }): Promise<ChallanRecord[]> => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.fromWarehouseId) qs.set('fromWarehouseId', params.fromWarehouseId);
    if (params?.toWarehouseId) qs.set('toWarehouseId', params.toWarehouseId);
    const res = await api.get<{ success: boolean; data: ChallanRecord[] }>(`/challans${qs.toString() ? `?${qs}` : ''}`);
    return res.data;
  },

  getById: async (id: string): Promise<ChallanRecord> => {
    const res = await api.get<{ success: boolean; data: ChallanRecord }>(`/challans/${id}`);
    return res.data;
  },

  create: async (body: { fromWarehouseId: string; toWarehouseId: string; notes?: string; shippingCost?: number; miscAmount?: number; items: { ingredientId: string; qty: number }[] }): Promise<ChallanRecord> => {
    const res = await api.post<{ success: boolean; data: ChallanRecord }>('/challans', body);
    return res.data;
  },

  dispatch: async (id: string): Promise<ChallanRecord> => {
    const res = await api.patch<{ success: boolean; data: ChallanRecord }>(`/challans/${id}/dispatch`);
    return res.data;
  },

  receive: async (id: string, payload?: ReceiveChallanPayload): Promise<ChallanRecord> => {
    const res = await api.patch<{ success: boolean; data: ChallanRecord }>(`/challans/${id}/receive`, payload);
    return res.data;
  },

  cancel: async (id: string): Promise<ChallanRecord> => {
    const res = await api.patch<{ success: boolean; data: ChallanRecord }>(`/challans/${id}/cancel`);
    return res.data;
  },

  getStats: async (params?: { fromWarehouseId?: string; toWarehouseId?: string }): Promise<{ total: number; today: number; weekly: number; monthly: number }> => {
    const qs = new URLSearchParams();
    if (params?.fromWarehouseId) qs.set('fromWarehouseId', params.fromWarehouseId);
    if (params?.toWarehouseId) qs.set('toWarehouseId', params.toWarehouseId);
    const res = await api.get<{ success: boolean; data: { total: number; today: number; weekly: number; monthly: number } }>(`/challans/stats/summary${qs.toString() ? `?${qs}` : ''}`);
    return res.data;
  },
};

import { api } from './api';

export type ChallanStatus = 'PENDING' | 'DISPATCHED' | 'RECEIVED' | 'CANCELLED';

export interface ChallanItem {
  id: string;
  ingredientId: string;
  ingredientName: string;
  unit: string;
  qty: number;
  receivedQty: number | null;
}

export interface ChallanUser {
  id: string;
  name: string;
  phone: string | null;
  role: string | null;
}

export interface ChallanRecord {
  id: string;
  challanNo: string;
  status: ChallanStatus;
  notes: string | null;
  shippingCost: number | null;
  miscAmount: number | null;
  fromWarehouse: { id: string; name: string; type: string; outletId: string | null };
  toWarehouse:   { id: string; name: string; type: string; outletId: string | null };
  createdBy:    ChallanUser | null;
  dispatchedBy: ChallanUser | null;
  receivedBy:   ChallanUser | null;
  dispatchedAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  items: ChallanItem[];
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

  receive: async (id: string): Promise<ChallanRecord> => {
    const res = await api.patch<{ success: boolean; data: ChallanRecord }>(`/challans/${id}/receive`);
    return res.data;
  },

  cancel: async (id: string): Promise<ChallanRecord> => {
    const res = await api.patch<{ success: boolean; data: ChallanRecord }>(`/challans/${id}/cancel`);
    return res.data;
  },
};

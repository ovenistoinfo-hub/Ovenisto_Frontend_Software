import { api } from './api';

export type DemandStatus = 'PENDING' | 'APPROVED' | 'FULFILLED' | 'REJECTED' | 'CANCELLED';

export interface DemandItem {
  id: string;
  ingredientId: string;
  ingredientName: string;
  category: string | null;
  unit: string;
  requestedQty: number;
  approvedQty: number | null;
  stockAtRequest: number | null;
}

export interface DemandUser {
  id: string;
  name: string;
  phone: string | null;
  role: string | null;
}

export interface DemandRecord {
  id: string;
  demandNo: string;
  status: DemandStatus;
  notes: string | null;
  rejectionReason: string | null;
  challanId: string | null;
  requestingWH: { id: string; name: string; type: string } | null;
  supplyingWH:  { id: string; name: string; type: string } | null;
  requestedBy:  DemandUser | null;
  approvedBy:   DemandUser | null;
  approvedAt:  string | null;
  fulfilledAt: string | null;
  rejectedAt:  string | null;
  createdAt:   string;
  items: DemandItem[];
}

interface DemandFilters {
  status?: DemandStatus;
  requestingWHId?: string;
  supplyingWHId?: string;
}

interface CreateDemandPayload {
  requestingWHId: string;
  supplyingWHId: string;
  notes?: string;
  items: { ingredientId: string; requestedQty: number }[];
}

interface ApproveDemandPayload {
  items?: { id: string; approvedQty: number }[];
}

export const demandService = {
  getAll: async (filters: DemandFilters = {}): Promise<DemandRecord[]> => {
    const params = new URLSearchParams();
    if (filters.status)         params.set('status',         filters.status);
    if (filters.requestingWHId) params.set('requestingWHId', filters.requestingWHId);
    if (filters.supplyingWHId)  params.set('supplyingWHId',  filters.supplyingWHId);
    const qs = params.toString();
    const res = await api.get<{ success: boolean; data: DemandRecord[] }>(`/demands${qs ? `?${qs}` : ''}`);
    return res.data;
  },

  getOne: async (id: string): Promise<DemandRecord> => {
    const res = await api.get<{ success: boolean; data: DemandRecord }>(`/demands/${id}`);
    return res.data;
  },

  create: async (payload: CreateDemandPayload): Promise<DemandRecord> => {
    const res = await api.post<{ success: boolean; data: DemandRecord }>('/demands', payload);
    return res.data;
  },

  approve: async (id: string, payload: ApproveDemandPayload = {}): Promise<DemandRecord & { challanNo?: string }> => {
    const res = await api.patch<{ success: boolean; data: DemandRecord & { challanNo?: string } }>(`/demands/${id}/approve`, payload);
    return res.data;
  },

  reject: async (id: string, reason?: string): Promise<DemandRecord> => {
    const res = await api.patch<{ success: boolean; data: DemandRecord }>(`/demands/${id}/reject`, { reason });
    return res.data;
  },

  cancel: async (id: string): Promise<DemandRecord> => {
    const res = await api.patch<{ success: boolean; data: DemandRecord }>(`/demands/${id}/cancel`);
    return res.data;
  },
};

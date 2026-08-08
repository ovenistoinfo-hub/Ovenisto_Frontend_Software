import { api } from './api';

export interface ActiveStaffBalance {
  staffId: string;
  staffName: string;
  staffRole: string;
  avatar?: string;
  expectedCash: number;
  expectedCard: number;
  expectedOnline: number;
  byMethod?: Record<string, number>;
  totalExpected: number;
  orderCount: number;
  orders: any[];
}

export interface CashSettlementRecord {
  id: string;
  settlementNo: string;
  outletId?: string;
  staffId: string;
  staffName: string;
  staffRole: string;
  settledById: string;
  settledByName: string;
  expectedCash: number;
  expectedCard: number;
  expectedOnline: number;
  totalExpected: number;
  actualCash: number;
  actualCard: number;
  actualOnline: number;
  totalActual: number;
  cashDifference: number;
  paymentBreakdown?: any;
  notes?: string;
  createdAt: string;
  orderCount?: number;
  orders?: any[];
}

export interface CreateSettlementPayload {
  staffId: string;
  actualCash: number;
  actualCard: number;
  actualOnline: number;
  actualByMethod?: Record<string, number>;
  notes?: string;
}

export const cashSettlementService = {
  async getActiveBalances(): Promise<ActiveStaffBalance[]> {
    const res = await api.get<{ success: boolean; data: ActiveStaffBalance[] }>('/cash-settlements/active-balances');
    return res.data;
  },

  async getStaffActiveBalance(staffId: string): Promise<ActiveStaffBalance> {
    const res = await api.get<{ success: boolean; data: ActiveStaffBalance }>(`/cash-settlements/staff/${staffId}/active`);
    return res.data;
  },

  async createSettlement(payload: CreateSettlementPayload): Promise<CashSettlementRecord> {
    const res = await api.post<{ success: boolean; data: CashSettlementRecord }>('/cash-settlements', payload);
    return res.data;
  },

  async getHistory(params?: { staffId?: string; role?: string; page?: number; limit?: number; date?: string }): Promise<{ data: CashSettlementRecord[]; meta?: any }> {
    const q = new URLSearchParams();
    if (params?.staffId) q.set('staffId', params.staffId);
    if (params?.role) q.set('role', params.role);
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.date) q.set('date', params.date);
    const queryString = q.toString() ? `?${q.toString()}` : '';
    const res = await api.get<{ success: boolean; data: CashSettlementRecord[]; meta?: any }>(`/cash-settlements/history${queryString}`);
    return { data: res.data, meta: res.meta };
  },
};

import { api } from './api';

export interface ShiftRecord {
  id: string;
  shiftNumber: string;
  cashierId: string | null;
  cashierName: string | null;
  openedAt: string;
  closedAt: string | null;
  openingCash: number;
  closingCash: number | null;
  status: 'open' | 'closed';
  totalSales: number;
  totalCashSales: number;
  totalCardSales: number;
  totalOnlineSales: number;
  orderCount: number;
  cancelledOrders: number;
  totalExpenses: number;
  expectedCash: number;
  cashDifference: number | null;
  notes: string | null;
}

export const shiftService = {
  async getActiveShift(): Promise<ShiftRecord | null> {
    const res = await api.get<{ success: boolean; data: ShiftRecord | null }>('/shifts/active');
    return res.data;
  },

  async openShift(data: { openingCash: number; notes?: string }): Promise<ShiftRecord> {
    const res = await api.post<{ success: boolean; data: ShiftRecord }>('/shifts', data);
    return res.data;
  },

  async closeShift(id: string, data: {
    closingCash: number;
    totalSales: number;
    totalCashSales: number;
    totalCardSales: number;
    totalOnlineSales: number;
    orderCount: number;
    cancelledOrders: number;
    totalExpenses: number;
    notes?: string;
  }): Promise<ShiftRecord> {
    const res = await api.put<{ success: boolean; data: ShiftRecord }>(`/shifts/${id}/close`, data);
    return res.data;
  },

  async getShifts(params?: { status?: string; page?: number; limit?: number }): Promise<{ data: ShiftRecord[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    q.set('page',  String(params?.page  ?? 1));
    q.set('limit', String(params?.limit ?? 50));
    const res = await api.get<{ success: boolean; data: ShiftRecord[]; meta: any }>(`/shifts?${q}`);
    return { data: res.data, meta: (res as any).meta };
  },
};

import { api, ApiError } from './api';

const ACTIVE_SHIFT_CACHE_KEY = 'ovenisto_active_shift_cache';

// Best-effort — a cashier who is already mid-shift when they lose connectivity (or hard-reload
// while offline) must still see their open register instead of being stuck at "Open Cash
// Register" forever (that dialog's own submit requires a live POST, so it's a dead end offline).
// Not a source of truth: the next successful online fetch always overwrites it.
function cacheActiveShift(shift: ShiftRecord | null) {
  try {
    localStorage.setItem(ACTIVE_SHIFT_CACHE_KEY, JSON.stringify(shift));
  } catch {
    /* storage unavailable — offline fallback simply won't work this session */
  }
}

function readCachedActiveShift(): ShiftRecord | null {
  try {
    const raw = localStorage.getItem(ACTIVE_SHIFT_CACHE_KEY);
    return raw ? (JSON.parse(raw) as ShiftRecord | null) : null;
  } catch {
    return null;
  }
}

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
    try {
      const res = await api.get<{ success: boolean; data: ShiftRecord | null }>('/shifts/active');
      cacheActiveShift(res.data);
      return res.data;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // Network failure — fall back to the last confirmed state instead of forcing
      // "Open Cash Register" on a cashier who is already mid-shift.
      return readCachedActiveShift();
    }
  },

  async openShift(data: { openingCash: number; notes?: string }): Promise<ShiftRecord> {
    const res = await api.post<{ success: boolean; data: ShiftRecord }>('/shifts', data);
    cacheActiveShift(res.data);
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
    cacheActiveShift(null);
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

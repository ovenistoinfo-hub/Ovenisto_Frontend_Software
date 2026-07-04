/**
 * Penalty Service - per-incident staff penalties (order-cancellation, etc.)
 */

import { api } from './api';

export interface StaffPenaltyRecord {
  id: string;
  userId: string;
  outletId: string | null;
  amount: number;
  reason: string;
  type: string;
  date: string;
  orderId: string | null;
  requestId: string | null;
  paymentLogId: string | null;
  createdAt: string;
  user?: { id: string; name: string };
}

export const penaltyService = {
  async getMine(): Promise<StaffPenaltyRecord[]> {
    const res = await api.get<{ success: boolean; data: StaffPenaltyRecord[] }>('/penalties/mine');
    return res.data;
  },

  async list(params?: { userId?: string; startDate?: string; endDate?: string; unpaidOnly?: boolean }): Promise<StaffPenaltyRecord[]> {
    const q = new URLSearchParams();
    if (params?.userId) q.set('userId', params.userId);
    if (params?.startDate) q.set('startDate', params.startDate);
    if (params?.endDate) q.set('endDate', params.endDate);
    if (params?.unpaidOnly) q.set('unpaidOnly', '1');
    const res = await api.get<{ success: boolean; data: StaffPenaltyRecord[] }>(`/penalties?${q.toString()}`);
    return res.data;
  },
};

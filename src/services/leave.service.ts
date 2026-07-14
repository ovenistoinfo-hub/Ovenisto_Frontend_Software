import { api } from './api';

export interface LeaveRequest {
  id: string;
  userId: string;
  outletId: string;
  leaveType: 'casual' | 'sick' | 'annual' | 'emergency';
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedById: string | null;
  reviewedOn: string | null;
  reviewNote: string | null;
  appliedOn: string;
  createdAt: string;
  user?: { id: string; name: string; role: string };
  reviewedBy?: { id: string; name: string } | null;
}

export interface LeaveBalance {
  id: string;
  userId: string;
  year: number;
  annual: number;
  annualUsed: number;
  sick: number;
  sickUsed: number;
  casual: number;
  casualUsed: number;
  halfday: number;
  halfdayUsed: number;
  user?: { id: string; name: string; role: string };
}

export const leaveService = {
  async getMyBalance(): Promise<LeaveBalance> {
    const res = await api.get<{ success: boolean; data: LeaveBalance }>('/leave-requests/my-balance');
    return res.data;
  },

  async getAllBalances(): Promise<LeaveBalance[]> {
    const res = await api.get<{ success: boolean; data: LeaveBalance[] }>('/leave-requests/balances');
    return res.data;
  },

  async updateBalance(
    userId: string,
    data: { annual?: number; sick?: number; casual?: number; halfday?: number }
  ): Promise<LeaveBalance> {
    const res = await api.put<{ success: boolean; data: LeaveBalance }>(`/leave-requests/balances/${userId}`, data);
    return res.data;
  },

  async getMyRequests(myUserId?: string): Promise<LeaveRequest[]> {
    const q = myUserId ? `?userId=${myUserId}` : '';
    const res = await api.get<{ success: boolean; data: LeaveRequest[] }>(`/leave-requests${q}`);
    return res.data;
  },

  async getAll(params?: { status?: string; userId?: string; outletId?: string }): Promise<LeaveRequest[]> {
    const q = new URLSearchParams();
    if (params?.status)   q.set('status',   params.status);
    if (params?.userId)   q.set('userId',   params.userId);
    if (params?.outletId) q.set('outletId', params.outletId);
    const res = await api.get<{ success: boolean; data: LeaveRequest[] }>(`/leave-requests?${q}`);
    return res.data;
  },

  async submit(data: {
    leaveType: string;
    startDate: string;
    endDate: string;
    reason: string;
  }): Promise<LeaveRequest> {
    const res = await api.post<{ success: boolean; data: LeaveRequest }>('/leave-requests', data);
    return res.data;
  },

  async cancel(id: string): Promise<void> {
    await api.delete(`/leave-requests/${id}`);
  },

  async review(id: string, action: 'approve' | 'reject', reviewNote?: string): Promise<LeaveRequest> {
    const res = await api.put<{ success: boolean; data: LeaveRequest }>(`/leave-requests/${id}/review`, {
      action,
      reviewNote,
    });
    return res.data;
  },
};

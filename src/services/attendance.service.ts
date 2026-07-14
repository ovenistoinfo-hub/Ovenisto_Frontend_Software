import { api } from './api';

export interface AttendanceRecord {
  id: string;
  userId: string;
  outletId: string;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  status: 'present' | 'late' | 'absent';
  overtimeMinutes: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  user?: { id: string; name: string; role: string };
}

export interface AttendancePage {
  data: AttendanceRecord[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export const attendanceService = {
  async clockIn(): Promise<AttendanceRecord> {
    const res = await api.post<{ success: boolean; data: AttendanceRecord }>('/attendance/clock-in', {});
    return res.data;
  },

  async clockOut(): Promise<AttendanceRecord> {
    const res = await api.post<{ success: boolean; data: AttendanceRecord }>('/attendance/clock-out', {});
    return res.data;
  },

  async getMyStatus(): Promise<AttendanceRecord | null> {
    const res = await api.get<{ success: boolean; data: AttendanceRecord | null }>('/attendance/my-status');
    return res.data;
  },

  async getMyHistory(params?: { page?: number; startDate?: string; endDate?: string }): Promise<AttendancePage> {
    const q = new URLSearchParams();
    q.set('page', String(params?.page ?? 1));
    q.set('limit', '100');
    if (params?.startDate) q.set('startDate', params.startDate);
    if (params?.endDate)   q.set('endDate',   params.endDate);
    const res = await api.get<{ success: boolean; data: AttendanceRecord[]; meta: AttendancePage['meta'] }>(
      `/attendance/my-history?${q}`
    );
    return { data: res.data, meta: (res as any).meta };
  },

  async getAll(params?: { date?: string; startDate?: string; endDate?: string; userId?: string; status?: string; page?: number; outletId?: string }): Promise<AttendancePage> {
    const q = new URLSearchParams();
    if (params?.date)      q.set('date',      params.date);
    if (params?.startDate) q.set('startDate', params.startDate);
    if (params?.endDate)   q.set('endDate',   params.endDate);
    if (params?.userId)    q.set('userId',    params.userId);
    if (params?.status)    q.set('status',    params.status);
    if (params?.page)      q.set('page',      String(params.page));
    if (params?.outletId)  q.set('outletId',  params.outletId);
    q.set('limit', '100');
    const res = await api.get<{ success: boolean; data: AttendanceRecord[]; meta: AttendancePage['meta'] }>(
      `/attendance?${q}`
    );
    return { data: res.data, meta: (res as any).meta };
  },

  async correct(
    id: string,
    data: { clockIn?: string | null; clockOut?: string | null; status?: string; notes?: string }
  ): Promise<AttendanceRecord> {
    const res = await api.patch<{ success: boolean; data: AttendanceRecord }>(`/attendance/${id}`, data);
    return res.data;
  },

  async markAbsent(date: string): Promise<{ count: number }> {
    const res = await api.post<{ success: boolean; data: { count: number } }>('/attendance/mark-absent', { date });
    return res.data;
  },
};

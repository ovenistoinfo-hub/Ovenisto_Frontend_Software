import { api } from './api';

export interface AttendanceRecord {
  id: string;
  userId: string;
  outletId: string;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  status: 'present' | 'late' | 'absent';
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

  async getMyHistory(page = 1): Promise<AttendancePage> {
    const res = await api.get<{ success: boolean; data: AttendanceRecord[]; meta: AttendancePage['meta'] }>(
      `/attendance/my-history?page=${page}&limit=30`
    );
    return { data: res.data, meta: (res as any).meta };
  },

  async getAll(params?: { date?: string; userId?: string; status?: string; page?: number }): Promise<AttendancePage> {
    const q = new URLSearchParams();
    if (params?.date)   q.set('date',   params.date);
    if (params?.userId) q.set('userId', params.userId);
    if (params?.status) q.set('status', params.status);
    if (params?.page)   q.set('page',   String(params.page));
    q.set('limit', '50');
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
};

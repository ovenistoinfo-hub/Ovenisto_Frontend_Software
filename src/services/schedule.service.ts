import { api } from './api';

export interface ScheduleShift {
  id: string;
  scheduleId: string;
  dayIndex: number; // 0=Mon ... 6=Sun
  shiftType: 'morning' | 'evening' | 'night' | 'off';
  startTime: string | null;
  endTime: string | null;
}

export interface StaffSchedule {
  id: string;
  userId: string;
  outletId: string;
  weekStart: string;
  status: 'draft' | 'published';
  shifts: ScheduleShift[];
  createdAt: string;
  user?: { id: string; name: string; role: string };
}

export const SHIFT_COLORS: Record<string, string> = {
  morning: 'bg-blue-100 text-blue-700',
  evening: 'bg-amber-100 text-amber-700',
  night:   'bg-purple-100 text-purple-700',
  off:     'bg-muted text-muted-foreground',
};

export const scheduleService = {
  async getMySchedule(week: string): Promise<StaffSchedule | null> {
    const res = await api.get<{ success: boolean; data: StaffSchedule | null }>(
      `/staff-schedules/my?week=${week}`
    );
    return res.data;
  },

  async getAll(params?: { weekStart?: string; userId?: string; outletId?: string }): Promise<StaffSchedule[]> {
    const q = new URLSearchParams();
    if (params?.weekStart) q.set('weekStart', params.weekStart);
    if (params?.userId)    q.set('userId',    params.userId);
    if (params?.outletId)  q.set('outletId',  params.outletId);
    const res = await api.get<{ success: boolean; data: StaffSchedule[] }>(`/staff-schedules?${q}`);
    return res.data;
  },

  async save(data: {
    userId: string;
    weekStart: string;
    shifts: Array<{ dayIndex: number; shiftType: string }>;
  }): Promise<StaffSchedule> {
    const res = await api.post<{ success: boolean; data: StaffSchedule }>('/staff-schedules', data);
    return res.data;
  },

  async publish(id: string): Promise<StaffSchedule> {
    const res = await api.patch<{ success: boolean; data: StaffSchedule }>(`/staff-schedules/${id}/publish`, {});
    return res.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/staff-schedules/${id}`);
  },
};

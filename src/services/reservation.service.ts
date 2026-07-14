import { api } from './api';

export interface Reservation {
  id: string;
  customerName: string;
  customerPhone: string | null;
  date: string; // YYYY-MM-DD
  time: string;
  guestCount: number;
  tableId: string | null;
  tableNumber: string | null;
  status: 'pending' | 'confirmed' | 'seated' | 'completed' | 'cancelled' | 'noShow';
  specialRequests: string | null;
  source: 'phone' | 'walkin' | 'online';
  outletId: string | null;
  createdAt: string;
}

export interface CreateReservationInput {
  customerName: string;
  customerPhone?: string;
  date: string;
  time: string;
  guestCount?: number;
  tableId?: string;
  tableNumber?: string;
  status?: string;
  specialRequests?: string;
  source?: string;
}

export const reservationService = {
  async getAll(params?: { date?: string; status?: string; upcoming?: boolean; outletId?: string }): Promise<Reservation[]> {
    const qs = new URLSearchParams();
    if (params?.date) qs.set('date', params.date);
    if (params?.status) qs.set('status', params.status);
    if (params?.upcoming) qs.set('upcoming', 'true');
    if (params?.outletId) qs.set('outletId', params.outletId);
    const res = await api.get<{ success: boolean; data: Reservation[] }>(
      `/reservations${qs.toString() ? `?${qs}` : ''}`
    );
    return res.data;
  },

  async create(data: CreateReservationInput): Promise<Reservation> {
    const res = await api.post<{ success: boolean; data: Reservation }>('/reservations', data);
    return res.data;
  },

  async update(id: string, data: Partial<CreateReservationInput & { status: string }>): Promise<Reservation> {
    const res = await api.put<{ success: boolean; data: Reservation }>(`/reservations/${id}`, data);
    return res.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/reservations/${id}`);
  },
};

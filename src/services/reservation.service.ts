import { api } from './api';

export interface PreOrderItem {
  menuItemId?: string;
  variantId?: string;
  name: string;
  price: number;
  qty: number;
  discount?: number;
  modifiers?: string[];
  notes?: string;
}

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
  bookingType: 'table_reservation' | 'future_order';
  orderType: 'Dine In' | 'Take Away' | 'Delivery';
  deliveryAddress: string | null;
  advancePaid: number;
  paymentMethod: string | null;
  paymentStatus: 'unpaid' | 'deposit_paid' | 'fully_paid';
  depositRef: string | null;
  preOrderItems: PreOrderItem[] | null;
  subtotal: number;
  tax: number;
  totalAmount: number;
  orderId: string | null;
  isAdvanceAdjusted: boolean;
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
  bookingType?: 'table_reservation' | 'future_order';
  orderType?: 'Dine In' | 'Take Away' | 'Delivery';
  deliveryAddress?: string;
  advancePaid?: number;
  paymentMethod?: string;
  paymentStatus?: string;
  depositRef?: string;
  preOrderItems?: PreOrderItem[];
  subtotal?: number;
  tax?: number;
  totalAmount?: number;
  isAdvanceAdjusted?: boolean;
}

export const reservationService = {
  async getAll(params?: { date?: string; status?: string; upcoming?: boolean; outletId?: string; bookingType?: string }): Promise<Reservation[]> {
    const qs = new URLSearchParams();
    if (params?.date) qs.set('date', params.date);
    if (params?.status) qs.set('status', params.status);
    if (params?.upcoming) qs.set('upcoming', 'true');
    if (params?.outletId) qs.set('outletId', params.outletId);
    if (params?.bookingType) qs.set('bookingType', params.bookingType);
    const res = await api.get<{ success: boolean; data: Reservation[] }>(
      `/reservations${qs.toString() ? `?${qs}` : ''}`
    );
    return res.data;
  },

  async create(data: CreateReservationInput): Promise<Reservation> {
    const res = await api.post<{ success: boolean; data: Reservation }>('/reservations', data);
    return res.data;
  },

  async update(id: string, data: Partial<CreateReservationInput & { status: string; isAdvanceAdjusted?: boolean; orderId?: string }>): Promise<Reservation> {
    const res = await api.put<{ success: boolean; data: Reservation }>(`/reservations/${id}`, data);
    return res.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/reservations/${id}`);
  },

  async convertToOrder(id: string): Promise<any> {
    const res = await api.post<{ success: boolean; data: any }>(`/reservations/${id}/convert-to-order`, {});
    return res.data;
  },
};


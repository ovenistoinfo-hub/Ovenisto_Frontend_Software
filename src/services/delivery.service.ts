import { api } from './api';

export interface RiderRecord {
  id: string;
  userId: string | null;
  name: string;
  phone: string | null;
  isAvailable: boolean;
  activeDeliveries: number;
  status: 'available' | 'on_delivery' | 'offline';
  // from dashboard
  todayOrders?: number;
  todaySales?: number;
  pendingCash?: number;
  collectedCash?: number;
}

export interface PendingDeliveryOrder {
  id: string;
  orderNumber: string;
  customerName: string | null;
  phone: string | null;
  total: number;
  deliveryAddress: string | null;
  status: string;
  riderId: string | null;
  createdAt: string;
}

export interface AssignmentRecord {
  id: string;
  orderId: string;
  riderId: string;
  status: 'pending' | 'accepted' | 'dispatched' | 'delivered' | 'returned';
  assignedAt: string;
  acceptedAt: string | null;
  deliveredAt: string | null;
  estimatedTime: number | null;
  customerAddress: string | null;
  customerPhone: string | null;
  amountToCollect: number | null;
  collectedAt: string | null;
  collectedBy: string | null;
  notes: string | null;
  order?: { id: string; orderNumber: string; total: number; customerName: string | null; deliveryAddress: string | null; phone?: string | null };
  rider?: RiderRecord;
}

export const deliveryService = {
  async getRiders(): Promise<RiderRecord[]> {
    const res = await api.get<{ success: boolean; data: RiderRecord[] }>('/delivery/riders');
    return res.data;
  },

  async createRider(data: { name: string; phone?: string; userId?: string }): Promise<RiderRecord> {
    const res = await api.post<{ success: boolean; data: RiderRecord }>('/delivery/riders', data);
    return res.data;
  },

  async updateRider(id: string, data: Partial<{ name: string; phone: string; isAvailable: boolean; status: string; userId: string | null }>): Promise<RiderRecord> {
    const res = await api.put<{ success: boolean; data: RiderRecord }>(`/delivery/riders/${id}`, data);
    return res.data;
  },

  async getAssignments(params?: { riderId?: string; status?: string; date?: string }): Promise<AssignmentRecord[]> {
    const q = new URLSearchParams();
    if (params?.riderId) q.set('riderId', params.riderId);
    if (params?.status)  q.set('status',  params.status);
    if (params?.date)    q.set('date',     params.date);
    const res = await api.get<{ success: boolean; data: AssignmentRecord[] }>(`/delivery/assignments?${q}`);
    return res.data;
  },

  async getMyAssignments(): Promise<{ rider: RiderRecord; assignments: AssignmentRecord[] }> {
    const res = await api.get<{ success: boolean; data: { rider: RiderRecord; assignments: AssignmentRecord[] } }>('/delivery/my-assignments');
    return res.data;
  },

  async getMyStats(): Promise<{ rider: RiderRecord; todayOrders: number; todaySales: number; totalOrders: number; totalSales: number; pendingCash: number }> {
    const res = await api.get<{ success: boolean; data: any }>('/delivery/my-stats');
    return res.data;
  },

  async assignRider(data: { orderId: string; riderId: string; estimatedTime?: number; notes?: string }): Promise<AssignmentRecord> {
    const res = await api.post<{ success: boolean; data: AssignmentRecord }>('/delivery/assign', data);
    return res.data;
  },

  async updateStatus(assignmentId: string, status: AssignmentRecord['status']): Promise<AssignmentRecord> {
    const res = await api.put<{ success: boolean; data: AssignmentRecord }>(`/delivery/assignments/${assignmentId}/status`, { status });
    return res.data;
  },

  async collectAmount(assignmentId: string): Promise<AssignmentRecord> {
    const res = await api.put<{ success: boolean; data: AssignmentRecord }>(`/delivery/assignments/${assignmentId}/collect`, {});
    return res.data;
  },

  async getDashboard(): Promise<{ riderStats: RiderRecord[]; activeAssignments: AssignmentRecord[] }> {
    const res = await api.get<{ success: boolean; data: { riderStats: RiderRecord[]; activeAssignments: AssignmentRecord[] } }>('/delivery/dashboard');
    return res.data;
  },

  async getPendingDeliveryOrders(): Promise<PendingDeliveryOrder[]> {
    const res = await api.get<{ success: boolean; data: PendingDeliveryOrder[] }>('/orders?type=DELIVERY&limit=50');
    return (res.data || []).filter(o => !o.riderId);
  },
};

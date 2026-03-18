/**
 * Outlet Service - API calls for outlet/branch management
 */

import { api } from './api';

export interface OutletRecord {
  id: string;
  name: string;
  code: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  createdAt: string;
  _count?: { users: number };
}

export const outletService = {
  async getOutlets(): Promise<OutletRecord[]> {
    const res = await api.get<{ success: boolean; data: OutletRecord[] }>('/outlets');
    return res.data;
  },

  async getOutlet(id: string): Promise<OutletRecord> {
    const res = await api.get<{ success: boolean; data: OutletRecord }>(`/outlets/${id}`);
    return res.data;
  },

  async createOutlet(data: { name: string; code: string; address?: string; city?: string; phone?: string; email?: string }): Promise<OutletRecord> {
    const res = await api.post<{ success: boolean; data: OutletRecord }>('/outlets', data);
    return res.data;
  },

  async updateOutlet(id: string, data: Partial<{ name: string; code: string; address: string; city: string; phone: string; email: string; isActive: boolean }>): Promise<OutletRecord> {
    const res = await api.put<{ success: boolean; data: OutletRecord }>(`/outlets/${id}`, data);
    return res.data;
  },

  async deleteOutlet(id: string): Promise<void> {
    await api.delete(`/outlets/${id}`);
  },
};

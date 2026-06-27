/**
 * Settings Service - API calls for restaurant settings
 */

import { api } from './api';

export interface SettingsRecord {
  id: string;
  outletId: string | null;
  restaurantName: string | null;
  currency: string;
  taxRate: number;
  taxName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  receiptHeader: string | null;
  tableManagement: boolean;
  onlineOrders: boolean;
  reservations: boolean;
  selfOrderConfig: Record<string, unknown>;
  websiteConfig: Record<string, unknown>;
  reservationConfig: Record<string, unknown>;
  shiftConfig: Record<string, unknown>;
  updatedAt: string;
}

export interface UpdateSettingsInput {
  restaurantName?: string;
  currency?: string;
  taxRate?: number;
  taxName?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  receiptHeader?: string | null;
  tableManagement?: boolean;
  onlineOrders?: boolean;
  reservations?: boolean;
  selfOrderConfig?: Record<string, unknown>;
  websiteConfig?: Record<string, unknown>;
  reservationConfig?: Record<string, unknown>;
  shiftConfig?: Record<string, unknown>;
}

export const settingsService = {
  async getSettings(): Promise<SettingsRecord> {
    const res = await api.get<{ success: boolean; data: SettingsRecord }>('/settings');
    return res.data;
  },

  async updateSettings(data: UpdateSettingsInput): Promise<SettingsRecord> {
    const res = await api.put<{ success: boolean; data: SettingsRecord }>('/settings', data);
    return res.data;
  },
};

/**
 * Deal Service - API calls for Deals & Combos
 */

import { api } from './api';

export interface DealComponentRecord {
  id: string;
  menuItemId: string;
  variantId: string | null;
  qty: number;
  displayOrder: number;
}

export interface DealOptionItemRecord {
  id: string;
  menuItemId: string;
  variantId: string | null;
  extraPrice: number;
  displayOrder: number;
}

export interface DealOptionGroupRecord {
  id: string;
  label: string;
  minSelections: number;
  maxSelections: number;
  displayOrder: number;
  options: DealOptionItemRecord[];
}

export interface DealRecord {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  image: string | null;
  type: 'combo' | 'option_combo';
  price: number;
  dineInPrice: number | null;
  takeAwayPrice: number | null;
  deliveryPrice: number | null;
  foodpandaPrice: number | null;
  isActive: boolean;
  status: string;
  outletIds: string[];
  validFrom: string;
  validTo: string | null;
  startTime: string | null;
  endTime: string | null;
  createdAt: string;
  updatedAt: string;
  components: DealComponentRecord[];
  optionGroups: DealOptionGroupRecord[];
}

export interface DealComponentInput {
  menuItemId: string;
  variantId?: string | null;
  qty: number;
  displayOrder?: number;
}

export interface DealOptionItemInput {
  menuItemId: string;
  variantId?: string | null;
  extraPrice?: number;
  displayOrder?: number;
}

export interface DealOptionGroupInput {
  label: string;
  minSelections: number;
  maxSelections: number;
  displayOrder?: number;
  options: DealOptionItemInput[];
}

export interface DealInput {
  name: string;
  code?: string | null;
  description?: string | null;
  image?: string | null;
  type: 'combo' | 'option_combo';
  price: number;
  dineInPrice?: number | null;
  takeAwayPrice?: number | null;
  deliveryPrice?: number | null;
  foodpandaPrice?: number | null;
  isActive?: boolean;
  outletIds?: string[];
  validFrom: string;
  validTo?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  components?: DealComponentInput[];
  optionGroups?: DealOptionGroupInput[];
}

export const dealService = {
  async getDeals(includeArchived = false): Promise<DealRecord[]> {
    const res = await api.get<{ success: boolean; data: DealRecord[] }>(
      `/deals${includeArchived ? '?includeArchived=true' : ''}`
    );
    return res.data;
  },

  async getDeal(id: string): Promise<DealRecord> {
    const res = await api.get<{ success: boolean; data: DealRecord }>(`/deals/${id}`);
    return res.data;
  },

  async createDeal(data: DealInput): Promise<DealRecord> {
    const res = await api.post<{ success: boolean; data: DealRecord }>('/deals', data);
    return res.data;
  },

  async updateDeal(id: string, data: DealInput): Promise<DealRecord> {
    const res = await api.put<{ success: boolean; data: DealRecord }>(`/deals/${id}`, data);
    return res.data;
  },

  async toggleDeal(id: string): Promise<DealRecord> {
    const res = await api.patch<{ success: boolean; data: DealRecord }>(`/deals/${id}/toggle`, {});
    return res.data;
  },

  async deleteDeal(id: string): Promise<string | undefined> {
    const res = await api.delete<{ success: boolean; message?: string }>(`/deals/${id}`);
    return res.message;
  },
};

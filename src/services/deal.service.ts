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

export type DealTypeValue = 'combo' | 'option_combo' | 'percentage' | 'buy_x_get_y';

export interface DealRecord {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  image: string | null;
  type: DealTypeValue;
  price: number | null;
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
  // percentage
  discountPercent: number | null;
  applicableItems: string[];
  applicableCategories: string[];
  // buy_x_get_y
  buyItemId: string | null;
  /** Pins the offer to one size of the buy item. Null on deals saved before sizes were pinned. */
  buyVariantId: string | null;
  buyQty: number | null;
  getItemId: string | null;
  /** Pins the free side to one size. Null on legacy deals, whose giveaway the server caps. */
  getVariantId: string | null;
  getQty: number | null;
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
  type: DealTypeValue;
  price?: number | null;
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
  // percentage
  discountPercent?: number | null;
  applicableItems?: string[];
  applicableCategories?: string[];
  // buy_x_get_y
  buyItemId?: string | null;
  buyVariantId?: string | null;
  buyQty?: number | null;
  getItemId?: string | null;
  getVariantId?: string | null;
  getQty?: number | null;
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

/**
 * Stock Service - API calls for stock adjustments, takes, production, transfers, waste
 */

import { api } from './api';

export interface StockAdjustmentRecord {
  id: string;
  ingredientId: string;
  ingredient: { id: string; name: string; unit: { name: string; symbol?: string } | null; category?: { name: string } | null } | null;
  type: string; // add, deduct, damage, correction
  quantity: number;
  reason: string | null;
  adjustedById: string | null;
  adjustedBy: { id: string; name: string; phone?: string | null; role?: string | null; outlet?: { name: string } | null } | null;
  warehouseId: string | null;
  warehouse: { id: string; name: string; type: string } | null;
  date: string;
}

export interface StockTakeItemRecord {
  id: string;
  stockTakeId: string;
  ingredientId: string;
  ingredient: { id: string; name: string; unit: { name: string } | null };
  systemQty: number | null;
  countedQty: number | null;
  variance: number | null;
  varianceValue: number | null;
}

export interface StockTakeRecord {
  id: string;
  reference: string | null;
  date: string;
  status: string;
  countedBy: string | null;
  totalVarianceValue: number;
  notes: string | null;
  completedAt: string | null;
  createdAt: string;
  items: StockTakeItemRecord[];
}

export interface ProductionRecord {
  id: string;
  itemName: string | null;
  quantity: number | null;
  unit: string | null;
  producedBy: string | null;
  date: string;
  notes: string | null;
}

export interface TransferRecord {
  id: string;
  fromOutletId: string | null;
  toOutletId: string | null;
  fromOutlet: { id: string; name: string } | null;
  toOutlet: { id: string; name: string } | null;
  itemName: string | null;
  quantity: number | null;
  unit: string | null;
  status: string;
  transferredBy: string | null;
  date: string;
  notes: string | null;
}

export interface WasteRecord {
  id: string;
  itemName: string | null;
  quantity: number | null;
  unit: string | null;
  reason: string | null;
  cost: number | null;
  recordedBy: string | null;
  date: string;
}

export const stockService = {
  // ── Stock Adjustments ──
  async getAdjustments(params?: { search?: string; warehouseId?: string; page?: number; limit?: number }): Promise<{ data: StockAdjustmentRecord[]; meta: any }> {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.warehouseId) q.set('warehouseId', params.warehouseId);
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    const res = await api.get<{ success: boolean; data: StockAdjustmentRecord[]; meta: any }>(`/stock/adjustments?${q.toString()}`);
    return { data: res.data, meta: (res as any).meta };
  },

  async createAdjustment(data: { ingredientId: string; type: string; quantity: number; reason?: string; warehouseId?: string }): Promise<StockAdjustmentRecord> {
    const res = await api.post<{ success: boolean; data: StockAdjustmentRecord }>('/stock/adjustments', data);
    return res.data;
  },

  // ── Stock Takes ──
  async getStockTakes(): Promise<StockTakeRecord[]> {
    const res = await api.get<{ success: boolean; data: StockTakeRecord[] }>('/stock/takes');
    return res.data;
  },

  async getStockTake(id: string): Promise<StockTakeRecord> {
    const res = await api.get<{ success: boolean; data: StockTakeRecord }>(`/stock/takes/${id}`);
    return res.data;
  },

  async startStockTake(notes?: string): Promise<StockTakeRecord> {
    const res = await api.post<{ success: boolean; data: StockTakeRecord }>('/stock/takes', { notes });
    return res.data;
  },

  async completeStockTake(id: string, items: { ingredientId: string; countedQty: number }[]): Promise<StockTakeRecord> {
    const res = await api.post<{ success: boolean; data: StockTakeRecord }>(`/stock/takes/${id}/complete`, { items });
    return res.data;
  },

  // ── Productions ──
  async getProductions(params?: { search?: string; page?: number; limit?: number }): Promise<{ data: ProductionRecord[]; meta: any }> {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    const res = await api.get<{ success: boolean; data: ProductionRecord[]; meta: any }>(`/stock/productions?${q.toString()}`);
    return { data: res.data, meta: (res as any).meta };
  },

  async createProduction(data: { itemName: string; quantity: number; unit?: string; notes?: string; menuItemId?: string; deductIngredients?: boolean }): Promise<ProductionRecord> {
    const res = await api.post<{ success: boolean; data: ProductionRecord }>('/stock/productions', data);
    return res.data;
  },

  // ── Transfers ──
  async getTransfers(params?: { status?: string; page?: number; limit?: number }): Promise<{ data: TransferRecord[]; meta: any }> {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    const res = await api.get<{ success: boolean; data: TransferRecord[]; meta: any }>(`/stock/transfers?${q.toString()}`);
    return { data: res.data, meta: (res as any).meta };
  },

  async createTransfer(data: { fromOutletId?: string; toOutletId?: string; itemName: string; quantity?: number; unit?: string; notes?: string }): Promise<TransferRecord> {
    const res = await api.post<{ success: boolean; data: TransferRecord }>('/stock/transfers', data);
    return res.data;
  },

  async updateTransferStatus(id: string, status: string): Promise<TransferRecord> {
    const res = await api.put<{ success: boolean; data: TransferRecord }>(`/stock/transfers/${id}`, { status });
    return res.data;
  },

  // ── Waste Records ──
  async getWasteRecords(params?: { search?: string; page?: number; limit?: number }): Promise<{ data: WasteRecord[]; meta: any }> {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    const res = await api.get<{ success: boolean; data: WasteRecord[]; meta: any }>(`/stock/waste?${q.toString()}`);
    return { data: res.data, meta: (res as any).meta };
  },

  async createWasteRecord(data: { itemName: string; quantity?: number; unit?: string; reason?: string; cost?: number; ingredientId?: string }): Promise<WasteRecord> {
    const res = await api.post<{ success: boolean; data: WasteRecord }>('/stock/waste', data);
    return res.data;
  },
};

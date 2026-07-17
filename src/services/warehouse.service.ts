import { api } from './api';

export type WarehouseType = 'MAIN' | 'BRANCH' | 'KITCHEN';

export interface WarehouseRecord {
  id: string;
  name: string;
  code: string;
  address: string;
  type: WarehouseType;
  outletId: string | null;
  managerId: string | null;
  isActive: boolean;
  createdAt: string;
  outlet?: { id: string; name: string };
  manager?: { id: string; name: string };
  _count?: { warehouseStock: number };
}

export interface WarehouseStockRecord {
  id: string;
  currentStock: number;
  lowStockLevel: number;
  ingredient: {
    id: string;
    name: string;
    brand?: string | null;
    purchasePrice: number | null;
    supplierId: string | null;
    supplier: { id: string; name: string; outletId?: string | null } | null;
    unit?: { id: string; name: string; symbol: string };
    category?: { id: string; name: string };
  };
}

export interface WarehouseStockItem {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  category: string;
  currentStock: number;
  lowStockLevel: number;
  isLow: boolean;
}

export interface ExpiryBatchRecord {
  id: string;
  ingredientId: string;
  ingredientName: string;
  brand: string | null;
  unit: string;
  batchQty: number;
  remainingQty: number;
  expiryDate: string;
  purchasedAt: string;
  totalCurrentStock: number;
}

export interface ExpiryIngredientGroup {
  ingredientId: string;
  ingredientName: string;
  brand: string | null;
  unit: string;
  totalCurrentStock: number;
  affectedQty: number;
  safeQty: number;
  batches: ExpiryBatchRecord[];
}

export interface ExpirySummary {
  expiredCount: number;
  nearExpiryCount: number;
  expired: ExpiryIngredientGroup[];
  nearExpiry: ExpiryIngredientGroup[];
}

export interface ConsumptionLogItem {
  id: string;
  date: string;
  ingredientId: string;
  ingredientName: string;
  unit: string;
  qty: number;
  reason: string;
}

export const warehouseService = {
  async getAll(params?: { type?: WarehouseType; outletId?: string }): Promise<WarehouseRecord[]> {
    const qs = new URLSearchParams();
    if (params?.type) qs.set('type', params.type);
    if (params?.outletId) qs.set('outletId', params.outletId);
    const query = qs.toString() ? `?${qs.toString()}` : '';
    const res = await api.get<{ success: boolean; data: WarehouseRecord[] }>(`/warehouses${query}`);
    return res.data;
  },
  async getById(id: string): Promise<WarehouseRecord> {
    const res = await api.get<{ success: boolean; data: WarehouseRecord }>(`/warehouses/${id}`);
    return res.data;
  },
  async getStock(id: string, params?: { categoryId?: string; search?: string; lowStockOnly?: boolean }): Promise<WarehouseStockRecord[]> {
    const query = new URLSearchParams();
    if (params?.categoryId) query.set('categoryId', params.categoryId);
    if (params?.search) query.set('search', params.search);
    if (params?.lowStockOnly) query.set('lowStockOnly', 'true');
    const qs = query.toString();
    const res = await api.get<{ success: boolean; data: WarehouseStockRecord[] }>(`/warehouses/${id}/stock${qs ? `?${qs}` : ''}`);
    return res.data;
  },
  async create(data: { name: string; code?: string; type: WarehouseType; outletId?: string; managerId?: string; address: string }): Promise<WarehouseRecord> {
    const res = await api.post<{ success: boolean; data: WarehouseRecord }>('/warehouses', data);
    return res.data;
  },
  async update(id: string, data: Partial<{ name: string; code: string; outletId: string; managerId: string; isActive: boolean; address: string }>): Promise<WarehouseRecord> {
    const res = await api.put<{ success: boolean; data: WarehouseRecord }>(`/warehouses/${id}`, data);
    return res.data;
  },
  async delete(id: string): Promise<void> {
    await api.delete(`/warehouses/${id}`);
  },
  async getExpirySummary(id: string): Promise<ExpirySummary> {
    const res = await api.get<{ success: boolean; data: ExpirySummary }>(`/warehouses/${id}/expiry-summary`);
    return res.data;
  },
  async getKitchenStock(id: string): Promise<WarehouseStockItem[]> {
    const res = await api.get<{ success: boolean; data: WarehouseStockRecord[] }>(`/warehouses/${id}/stock`);
    return res.data.map(s => ({
      ingredientId: s.ingredient.id,
      ingredientName: s.ingredient.name,
      unit: s.ingredient.unit?.symbol || s.ingredient.unit?.name || '—',
      category: s.ingredient.category?.name || '—',
      currentStock: s.currentStock,
      lowStockLevel: s.lowStockLevel,
      isLow: s.currentStock > 0 && s.currentStock <= s.lowStockLevel,
    }));
  },
  async getConsumption(id: string, limit = 50): Promise<ConsumptionLogItem[]> {
    const res = await api.get<{ success: boolean; data: ConsumptionLogItem[] }>(`/warehouses/${id}/consumption?limit=${limit}`);
    return res.data;
  },
};

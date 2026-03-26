import { api } from './api';

export type WarehouseType = 'MAIN' | 'BRANCH' | 'KITCHEN';

export interface WarehouseRecord {
  id: string;
  name: string;
  code: string;
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
    purchasePrice: number | null;
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
    const res = await api.get<{ success: boolean; data: WarehouseStockRecord[] }>(`/warehouses/${id}/stock`, { params });
    return res.data;
  },
  async create(data: { name: string; code?: string; type: WarehouseType; outletId?: string; managerId?: string }): Promise<WarehouseRecord> {
    const res = await api.post<{ success: boolean; data: WarehouseRecord }>('/warehouses', data);
    return res.data;
  },
  async update(id: string, data: Partial<{ name: string; code: string; outletId: string; managerId: string; isActive: boolean }>): Promise<WarehouseRecord> {
    const res = await api.put<{ success: boolean; data: WarehouseRecord }>(`/warehouses/${id}`, data);
    return res.data;
  },
  async delete(id: string): Promise<void> {
    await api.delete(`/warehouses/${id}`);
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

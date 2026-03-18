/**
 * Inventory Service - API calls for ingredient units, categories, ingredients, pre-made food
 */

import { api } from './api';

export interface UnitRecord {
  id: string;
  name: string;
  status: string;
  _count?: { ingredients: number };
}

export interface IngredientCategoryRecord {
  id: string;
  name: string;
  description: string | null;
  status: string;
  _count?: { ingredients: number };
}

export interface IngredientRecord {
  id: string;
  name: string;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  unitId: string | null;
  unit: { id: string; name: string } | null;
  purchasePrice: number | null;
  currentStock: number;
  lowStockLevel: number;
  status: string;
}

export interface PreMadeFoodRecord {
  id: string;
  name: string;
  unit: string | null;
  currentStock: number;
  lowStockLevel: number;
  costPerUnit: number | null;
  status: string;
}

export const inventoryService = {
  // ── Units ──
  async getUnits(): Promise<UnitRecord[]> {
    const res = await api.get<{ success: boolean; data: UnitRecord[] }>('/inventory/units');
    return res.data;
  },

  async createUnit(data: { name: string; status?: string }): Promise<UnitRecord> {
    const res = await api.post<{ success: boolean; data: UnitRecord }>('/inventory/units', data);
    return res.data;
  },

  async updateUnit(id: string, data: Partial<{ name: string; status: string }>): Promise<UnitRecord> {
    const res = await api.put<{ success: boolean; data: UnitRecord }>(`/inventory/units/${id}`, data);
    return res.data;
  },

  async deleteUnit(id: string): Promise<void> {
    await api.delete(`/inventory/units/${id}`);
  },

  // ── Ingredient Categories ──
  async getIngredientCategories(): Promise<IngredientCategoryRecord[]> {
    const res = await api.get<{ success: boolean; data: IngredientCategoryRecord[] }>('/inventory/ingredient-categories');
    return res.data;
  },

  async createIngredientCategory(data: { name: string; description?: string; status?: string }): Promise<IngredientCategoryRecord> {
    const res = await api.post<{ success: boolean; data: IngredientCategoryRecord }>('/inventory/ingredient-categories', data);
    return res.data;
  },

  async updateIngredientCategory(id: string, data: Partial<{ name: string; description: string; status: string }>): Promise<IngredientCategoryRecord> {
    const res = await api.put<{ success: boolean; data: IngredientCategoryRecord }>(`/inventory/ingredient-categories/${id}`, data);
    return res.data;
  },

  async deleteIngredientCategory(id: string): Promise<void> {
    await api.delete(`/inventory/ingredient-categories/${id}`);
  },

  // ── Ingredients ──
  async getIngredients(params?: { search?: string; categoryId?: string; status?: string; lowStock?: boolean }): Promise<IngredientRecord[]> {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.categoryId) q.set('categoryId', params.categoryId);
    if (params?.status) q.set('status', params.status);
    if (params?.lowStock) q.set('lowStock', 'true');
    const res = await api.get<{ success: boolean; data: IngredientRecord[] }>(`/inventory/ingredients?${q.toString()}`);
    return res.data;
  },

  async createIngredient(data: {
    name: string;
    categoryId?: string | null;
    unitId?: string | null;
    purchasePrice?: number | null;
    currentStock?: number;
    lowStockLevel?: number;
    status?: string;
  }): Promise<IngredientRecord> {
    const res = await api.post<{ success: boolean; data: IngredientRecord }>('/inventory/ingredients', data);
    return res.data;
  },

  async updateIngredient(id: string, data: Partial<{
    name: string;
    categoryId: string | null;
    unitId: string | null;
    purchasePrice: number | null;
    currentStock: number;
    lowStockLevel: number;
    status: string;
  }>): Promise<IngredientRecord> {
    const res = await api.put<{ success: boolean; data: IngredientRecord }>(`/inventory/ingredients/${id}`, data);
    return res.data;
  },

  async deleteIngredient(id: string): Promise<void> {
    await api.delete(`/inventory/ingredients/${id}`);
  },

  // ── Pre-Made Food ──
  async getPreMadeFood(): Promise<PreMadeFoodRecord[]> {
    const res = await api.get<{ success: boolean; data: PreMadeFoodRecord[] }>('/inventory/pre-made');
    return res.data;
  },

  async createPreMadeFood(data: {
    name: string;
    unit?: string | null;
    currentStock?: number;
    lowStockLevel?: number;
    costPerUnit?: number | null;
    status?: string;
  }): Promise<PreMadeFoodRecord> {
    const res = await api.post<{ success: boolean; data: PreMadeFoodRecord }>('/inventory/pre-made', data);
    return res.data;
  },

  async updatePreMadeFood(id: string, data: Partial<{
    name: string;
    unit: string | null;
    currentStock: number;
    lowStockLevel: number;
    costPerUnit: number | null;
    status: string;
  }>): Promise<PreMadeFoodRecord> {
    const res = await api.put<{ success: boolean; data: PreMadeFoodRecord }>(`/inventory/pre-made/${id}`, data);
    return res.data;
  },

  async deletePreMadeFood(id: string): Promise<void> {
    await api.delete(`/inventory/pre-made/${id}`);
  },
};

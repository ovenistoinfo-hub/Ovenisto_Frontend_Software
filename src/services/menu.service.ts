/**
 * Menu Service - API calls for food categories, menu items, modifiers, recipes
 */

import { api } from './api';

export interface CategoryRecord {
  id: string;
  name: string;
  displayOrder: number;
  status: string;
  _count?: { menuItems: number };
}

export interface MenuItemVariant {
  id: string;
  name: string;
  price: number;
  dineInPrice: number | null;
  takeAwayPrice: number | null;
  deliveryPrice: number | null;
  foodpandaPrice: number | null;
  displayOrder: number;
}

export interface MenuItemRecord {
  id: string;
  name: string;
  code: string | null;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  price: number;
  dineInPrice: number | null;
  takeAwayPrice: number | null;
  deliveryPrice: number | null;
  foodpandaPrice: number | null;
  available: boolean;
  image: string | null;
  tags: string[];
  cookingTime: number;
  variants: MenuItemVariant[];
  modifiers?: MenuItemModifierRecord[];
}

export interface MenuItemModifierRecord {
  id: string;
  name: string;
  price: number;
  type: string;
  status: string;
  variantIds: string[];
}

export interface RecipeIngredient {
  id: string;
  menuItemId: string;
  variantId: string | null;
  ingredientId: string;
  qtyPerUnit: number;
  usageUnitId: string | null;
  usageUnit: { id: string; name: string } | null;
  ingredient: {
    id: string;
    name: string;
    purchasePrice: number | null;
    unit: { id: string; name: string } | null;
  };
}

export interface ModifierRecord {
  id: string;
  name: string;
  price: number;
  type: string;
  status: string;
}

export const menuService = {
  // ── Categories ──
  async getCategories(status?: string): Promise<CategoryRecord[]> {
    const q = status ? `?status=${status}` : '';
    const res = await api.get<{ success: boolean; data: CategoryRecord[] }>(`/menu/categories${q}`);
    return res.data;
  },

  async createCategory(data: { name: string; displayOrder?: number; status?: string }): Promise<CategoryRecord> {
    const res = await api.post<{ success: boolean; data: CategoryRecord }>('/menu/categories', data);
    return res.data;
  },

  async updateCategory(id: string, data: Partial<{ name: string; displayOrder: number; status: string }>): Promise<CategoryRecord> {
    const res = await api.put<{ success: boolean; data: CategoryRecord }>(`/menu/categories/${id}`, data);
    return res.data;
  },

  async deleteCategory(id: string): Promise<void> {
    await api.delete(`/menu/categories/${id}`);
  },

  // ── Menu Items ──
  async getMenuItems(params?: { search?: string; category?: string; available?: boolean; page?: number; limit?: number }): Promise<MenuItemRecord[]> {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.category) q.set('category', params.category);
    if (params?.available !== undefined) q.set('available', String(params.available));
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit || 200));
    const res = await api.get<{ success: boolean; data: MenuItemRecord[] }>(`/menu/items?${q.toString()}`);
    return res.data;
  },

  async getMenuItem(id: string): Promise<MenuItemRecord & { recipes: RecipeIngredient[] }> {
    const res = await api.get<{ success: boolean; data: MenuItemRecord & { recipes: RecipeIngredient[] } }>(`/menu/items/${id}`);
    return res.data;
  },

  async createMenuItem(data: any): Promise<MenuItemRecord> {
    const res = await api.post<{ success: boolean; data: MenuItemRecord }>('/menu/items', data);
    return res.data;
  },

  async updateMenuItem(id: string, data: any): Promise<MenuItemRecord> {
    const res = await api.put<{ success: boolean; data: MenuItemRecord }>(`/menu/items/${id}`, data);
    return res.data;
  },

  async deleteMenuItem(id: string): Promise<void> {
    await api.delete(`/menu/items/${id}`);
  },

  // ── Recipes ──
  async getRecipe(itemId: string): Promise<RecipeIngredient[]> {
    const res = await api.get<{ success: boolean; data: RecipeIngredient[] }>(`/menu/items/${itemId}/recipe`);
    return res.data;
  },

  async updateRecipe(itemId: string, ingredients: { ingredientId: string; qtyPerUnit: number; variantId?: string | null; usageUnitId?: string | null }[]): Promise<RecipeIngredient[]> {
    const res = await api.put<{ success: boolean; data: RecipeIngredient[] }>(`/menu/items/${itemId}/recipe`, { ingredients });
    return res.data;
  },

  // ── Modifiers ──
  async getModifiers(): Promise<ModifierRecord[]> {
    const res = await api.get<{ success: boolean; data: ModifierRecord[] }>('/menu/modifiers');
    return res.data;
  },

  async createModifier(data: { name: string; price?: number; type?: string; status?: string }): Promise<ModifierRecord> {
    const res = await api.post<{ success: boolean; data: ModifierRecord }>('/menu/modifiers', data);
    return res.data;
  },

  async updateModifier(id: string, data: Partial<{ name: string; price: number; type: string; status: string }>): Promise<ModifierRecord> {
    const res = await api.put<{ success: boolean; data: ModifierRecord }>(`/menu/modifiers/${id}`, data);
    return res.data;
  },

  async deleteModifier(id: string): Promise<void> {
    await api.delete(`/menu/modifiers/${id}`);
  },
};

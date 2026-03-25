import { api } from './api';

export interface MealTypeRecord {
  id: string;
  name: string;
  status: string;
}

export const mealTypeService = {
  async getAll(): Promise<MealTypeRecord[]> {
    const res = await api.get<{ success: boolean; data: MealTypeRecord[] }>('/meal-types');
    return res.data;
  },
  async create(data: { name: string; status?: string }): Promise<MealTypeRecord> {
    const res = await api.post<{ success: boolean; data: MealTypeRecord }>('/meal-types', data);
    return res.data;
  },
  async update(id: string, data: Partial<{ name: string; status: string }>): Promise<MealTypeRecord> {
    const res = await api.put<{ success: boolean; data: MealTypeRecord }>(`/meal-types/${id}`, data);
    return res.data;
  },
  async delete(id: string): Promise<void> {
    await api.delete(`/meal-types/${id}`);
  },
};

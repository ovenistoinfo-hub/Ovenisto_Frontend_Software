import { api } from './api';

export interface ProductionItemRecord {
  id: string;
  name: string;
  unit: string;
  shelfLifeHours: number | null;
  isActive: boolean;
  createdAt: string;
}

const productionItemService = {
  getAll: async (): Promise<ProductionItemRecord[]> => {
    const res = await api.get('/production-items');
    return res.data.data;
  },

  create: async (data: { name: string; unit: string; shelfLifeHours?: number | null }): Promise<ProductionItemRecord> => {
    const res = await api.post('/production-items', data);
    return res.data.data;
  },

  update: async (id: string, data: { name?: string; unit?: string; shelfLifeHours?: number | null }): Promise<ProductionItemRecord> => {
    const res = await api.put(`/production-items/${id}`, data);
    return res.data.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/production-items/${id}`);
  },
};

export default productionItemService;

import { api } from './api';

export interface ExpenseRecord {
  id: string;
  category: string | null;
  description: string | null;
  amount: number;
  paymentMethod: string | null;
  reference: string | null;
  receipt: boolean;
  date: string;
  recordedBy: string | null;
  createdAt: string;
}

export interface CreateExpenseInput {
  category?: string;
  description: string;
  amount: number;
  paymentMethod?: string;
  reference?: string;
  receipt?: boolean;
  date?: string;
}

export const expenseService = {
  async getAll(params?: {
    page?: number;
    limit?: number;
    category?: string;
    search?: string;
  }): Promise<{
    success: boolean;
    data: ExpenseRecord[];
    meta: { page: number; limit: number; total: number; totalPages: number };
    totalAmount: number;
  }> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.category) qs.set('category', params.category);
    if (params?.search) qs.set('search', params.search);
    return api.get(`/expenses${qs.toString() ? `?${qs}` : ''}`);
  },

  async getById(id: string): Promise<ExpenseRecord> {
    const res = await api.get<{ success: boolean; data: ExpenseRecord }>(`/expenses/${id}`);
    return res.data;
  },

  async create(data: CreateExpenseInput): Promise<ExpenseRecord> {
    const res = await api.post<{ success: boolean; data: ExpenseRecord }>('/expenses', data);
    return res.data;
  },

  async update(id: string, data: Partial<CreateExpenseInput>): Promise<ExpenseRecord> {
    const res = await api.put<{ success: boolean; data: ExpenseRecord }>(`/expenses/${id}`, data);
    return res.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/expenses/${id}`);
  },
};

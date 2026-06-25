import { api } from './api';

export interface CustomerRecord {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  customerType: string;
  loyaltyPoints: number;
  totalOrders: number;
  totalSpent: number;
  outstandingDue: number;
  lastOrder: string | null;
  createdAt: string;
}

export interface CreateCustomerInput {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  customerType?: string;
}

export const customerService = {
  async getCustomers(params?: { search?: string; customerType?: string; limit?: number }) {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.customerType) qs.set('customerType', params.customerType);
    if (params?.limit) qs.set('limit', String(params.limit));
    return api.get<{ success: boolean; data: CustomerRecord[]; meta: { page: number; limit: number; total: number; totalPages: number } }>(`/customers${qs.toString() ? `?${qs}` : ''}`);
  },

  async getCustomer(id: string): Promise<CustomerRecord> {
    const res = await api.get<{ success: boolean; data: CustomerRecord }>(`/customers/${id}`);
    return res.data;
  },

  async createCustomer(data: CreateCustomerInput): Promise<CustomerRecord> {
    const res = await api.post<{ success: boolean; data: CustomerRecord }>('/customers', data);
    return res.data;
  },

  async updateCustomer(id: string, data: Partial<CreateCustomerInput>): Promise<CustomerRecord> {
    const res = await api.put<{ success: boolean; data: CustomerRecord }>(`/customers/${id}`, data);
    return res.data;
  },

  async deleteCustomer(id: string): Promise<void> {
    await api.delete(`/customers/${id}`);
  },
};

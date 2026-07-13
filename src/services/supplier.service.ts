import { api } from './api';

export interface SupplierRecord {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  totalPurchases: number;
  totalDue: number;
  createdAt: string;
}

export interface CreateSupplierInput {
  name: string;
  company?: string;
  phone?: string;
  email?: string;
}

export interface SupplierLedgerPurchase {
  id: string;
  invoiceNumber: string | null;
  date: string;
  total: number;
  paid: number;
  due: number;
  status: string;
  createdAt: string;
  paymentHistory: {
    id: string;
    amount: number;
    balanceAfter: number;
    note: string | null;
    createdAt: string;
  }[];
}

export interface SupplierLedger {
  supplier: SupplierRecord;
  totalPurchases: number;
  totalPaid: number;
  totalDue: number;
  purchases: SupplierLedgerPurchase[];
}

export const supplierService = {
  async getAll(search?: string): Promise<{ success: boolean; data: SupplierRecord[] }> {
    const qs = search ? `?search=${encodeURIComponent(search)}` : '';
    return api.get<{ success: boolean; data: SupplierRecord[] }>(`/suppliers${qs}`);
  },

  async getById(id: string): Promise<SupplierRecord> {
    const res = await api.get<{ success: boolean; data: SupplierRecord }>(`/suppliers/${id}`);
    return res.data;
  },

  async create(data: CreateSupplierInput): Promise<SupplierRecord> {
    const res = await api.post<{ success: boolean; data: SupplierRecord }>('/suppliers', data);
    return res.data;
  },

  async update(id: string, data: Partial<CreateSupplierInput>): Promise<SupplierRecord> {
    const res = await api.put<{ success: boolean; data: SupplierRecord }>(`/suppliers/${id}`, data);
    return res.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/suppliers/${id}`);
  },

  async recordPayment(id: string, data: { amount: number; paymentMethod: string }): Promise<SupplierRecord> {
    const res = await api.post<{ success: boolean; data: SupplierRecord }>(`/suppliers/${id}/payment`, data);
    return res.data;
  },

  async getIngredients(id: string): Promise<{ success: boolean; data: any[] }> {
    return api.get<{ success: boolean; data: any[] }>(`/suppliers/${id}/ingredients`);
  },

  async getLedger(id: string): Promise<{ success: boolean; data: SupplierLedger }> {
    return api.get<{ success: boolean; data: SupplierLedger }>(`/suppliers/${id}/ledger`);
  },
};

/**
 * Table Service - API calls for restaurant tables
 */

import { api } from './api';

export interface TableRecord {
  id: string;
  number: string;
  capacity: number;
  floor: string | null;
  shape: string | null; // 'square' | 'round' | 'rectangle'
  status: string; // 'available' | 'occupied' | 'reserved' | 'cleaning'
  currentOrderId: string | null;
  reservationId: string | null;
  occupiedById?: string | null;
  occupiedByName?: string | null;
  occupiedByRole?: string | null;
}

export interface CreateTableInput {
  number: string | number;
  capacity?: number;
  floor?: string;
  shape?: string;
  status?: string;
}

export const tableService = {
  async getTables(params?: { floor?: string; status?: string }): Promise<TableRecord[]> {
    const q = new URLSearchParams();
    if (params?.floor) q.set('floor', params.floor);
    if (params?.status) q.set('status', params.status);
    const query = q.toString();
    const res = await api.get<{ success: boolean; data: TableRecord[] }>(`/tables${query ? `?${query}` : ''}`);
    return res.data;
  },

  async createTable(data: CreateTableInput): Promise<TableRecord> {
    const res = await api.post<{ success: boolean; data: TableRecord }>('/tables', data);
    return res.data;
  },

  async updateTable(id: string, data: Partial<CreateTableInput> & { currentOrderId?: string | null }): Promise<TableRecord> {
    const res = await api.put<{ success: boolean; data: TableRecord }>(`/tables/${id}`, data);
    return res.data;
  },

  async deleteTable(id: string): Promise<void> {
    await api.delete<{ success: boolean }>(`/tables/${id}`);
  },
};

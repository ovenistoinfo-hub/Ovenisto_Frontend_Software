import { api } from './api';

export interface OutletLedgerBalance {
  id: string;
  name: string;
  code: string;
  dueToMain: number;
}

export interface SettlementRecord {
  id: string;
  outletId: string;
  type: 'CHARGE' | 'PAYMENT';
  amount: number;
  balanceAfter: number;
  challanId: string | null;
  challanNo: string | null;
  notes: string | null;
  recordedBy: { id: string; name: string; phone: string | null; role: string | null; outlet: string | null } | null;
  createdAt: string;
}

export const warehouseLedgerService = {
  getSummary: async (): Promise<{ outlets: OutletLedgerBalance[]; chainTotal: number }> => {
    const res = await api.get<{ success: boolean; data: OutletLedgerBalance[]; chainTotal: number }>('/warehouse-ledger');
    return { outlets: res.data, chainTotal: res.chainTotal };
  },

  getSettlements: async (outletId: string): Promise<SettlementRecord[]> => {
    const res = await api.get<{ success: boolean; data: SettlementRecord[] }>(`/warehouse-ledger/${outletId}/settlements`);
    return res.data;
  },

  recordPayment: async (outletId: string, body: { amount: number; notes?: string }): Promise<SettlementRecord> => {
    const res = await api.post<{ success: boolean; data: SettlementRecord }>(`/warehouse-ledger/${outletId}/settlements`, body);
    return res.data;
  },
};

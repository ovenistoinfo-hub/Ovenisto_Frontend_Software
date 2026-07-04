import { api } from './api';

export interface PaymentLogRecord {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  basePay: number;
  penalties: number;
  rewards: number;
  finalPay: number;
  rateType: string | null;
  rate: number | null;
  unitsWorked: number | null;
  absentDays: number | null;
  notes: string | null;
  paidAt: string;
  paidById: string;
  employee: {
    firstName: string;
    lastName: string | null;
    designation: string;
  };
  paidBy: {
    name: string;
  };
}

export interface PayoutInput {
  employeeId: string;
  startDate: string;
  endDate: string;
  basePay: number;
  penalties: number;
  rewards: number;
  finalPay: number;
  notes?: string;
  rateType?: string;
  rate?: number;
  unitsWorked?: number;
  absentDays?: number;
  penaltyIds?: string[];
}

export const payrollService = {
  async payIndividual(data: PayoutInput): Promise<PaymentLogRecord> {
    const res = await api.post<{ success: boolean; data: PaymentLogRecord }>('/payroll/pay', data);
    return res.data;
  },

  async payBatch(payments: PayoutInput[]): Promise<PaymentLogRecord[]> {
    const res = await api.post<{ success: boolean; data: PaymentLogRecord[] }>('/payroll/pay-batch', { payments });
    return res.data;
  },

  async getPaymentLogs(params?: { startDate?: string; endDate?: string; employeeId?: string }): Promise<PaymentLogRecord[]> {
    const q = new URLSearchParams();
    if (params?.startDate) q.set('startDate', params.startDate);
    if (params?.endDate) q.set('endDate', params.endDate);
    if (params?.employeeId) q.set('employeeId', params.employeeId);
    const res = await api.get<{ success: boolean; data: PaymentLogRecord[] }>(`/payroll/logs?${q}`);
    return res.data;
  },
};

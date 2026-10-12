/**
 * Payment Service - website online payments (Safepay): what is owed back, and recording a refund
 */

import { api } from './api';

export interface RefundDue {
  paymentId: string;
  due: number;
  paid: number;
  reason: 'cancelled' | 'paid_other_way' | 'over_total' | 'duplicate';
  tracker: string;
  paidAt: string | null;
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  phone: string | null;
  orderStatus: string;
}

export const paymentService = {
  async getRefundsDue(): Promise<RefundDue[]> {
    const res = await api.get<{ success: boolean; data: RefundDue[] }>('/payments/refunds-due');
    return res.data;
  },

  async markRefunded(paymentId: string, reference?: string): Promise<{ paymentId: string; refunded: number }> {
    const res = await api.post<{ success: boolean; data: { paymentId: string; refunded: number } }>(`/payments/${paymentId}/refunded`, { reference });
    return res.data;
  },
};

/**
 * Cancellation Request Service - order-cancellation approval workflow
 */

import { api } from './api';

export interface CreateCancellationRequestInput {
  itemIds?: string[];
  reason: string;
  approverId: string;
  responsibleUserId?: string;
  penaltyAmount?: number;
  refundAmount: number;
  refundMethod: string;
  newSubtotal?: number;
  newTax?: number;
  newTotal?: number;
  autoApprove?: boolean;
}

export interface ReviewCancellationRequestInput {
  action: 'approve' | 'reject';
  penaltyAmount?: number;
  responsibleUserId?: string | null;
  note?: string;
}

export interface CancellationRequestRecord {
  id: string;
  orderId: string;
  outletId: string | null;
  itemIds: string[];
  reason: string;
  refundAmount: number;
  refundMethod: string;
  newSubtotal: number | null;
  newTax: number | null;
  newTotal: number | null;
  requestedById: string;
  approverId: string;
  responsibleUserId: string | null;
  penaltyAmount: number;
  status: 'pending' | 'approved' | 'rejected';
  reviewedById: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  order: {
    id: string;
    orderNumber: string;
    total: number;
    status: string;
    customerName: string | null;
    date: string;
    time: string | null;
  };
  requestedBy: { id: string; name: string };
  approver: { id: string; name: string };
  responsibleUser: { id: string; name: string } | null;
  reviewedBy: { id: string; name: string } | null;
}

export const cancellationRequestService = {
  async create(orderId: string, data: CreateCancellationRequestInput): Promise<CancellationRequestRecord> {
    const res = await api.post<{ success: boolean; data: CancellationRequestRecord }>(
      `/orders/${orderId}/cancellation-requests`, data,
    );
    return res.data;
  },

  async list(params?: { status?: string; outletId?: string }): Promise<CancellationRequestRecord[]> {
    const q = new URLSearchParams();
    if (params?.status)   q.set('status',   params.status);
    if (params?.outletId) q.set('outletId', params.outletId);
    const res = await api.get<{ success: boolean; data: CancellationRequestRecord[] }>(
      `/cancellation-requests?${q.toString()}`,
    );
    return res.data;
  },

  async listMine(): Promise<CancellationRequestRecord[]> {
    const res = await api.get<{ success: boolean; data: CancellationRequestRecord[] }>('/cancellation-requests/mine');
    return res.data;
  },

  async review(id: string, data: ReviewCancellationRequestInput): Promise<CancellationRequestRecord> {
    const res = await api.patch<{ success: boolean; data: CancellationRequestRecord }>(
      `/cancellation-requests/${id}/review`, data,
    );
    return res.data;
  },
};

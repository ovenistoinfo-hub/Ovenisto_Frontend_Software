import { api } from './api';

export interface WarehouseDashboardData {
  activeWarehouses: { id: string; name: string; type: string }[];
  inventoryValue: number;
  costingTable: {
    ingredientId: string;
    name: string;
    category: string;
    currentStock: number;
    lowStockLevel: number;
    unitPrice: number;
    totalValue: number;
    vendorName: string;
    unitName?: string;
    unitSymbol?: string;
  }[];
  recentTransactions: {
    date: string;
    type: 'INBOUND' | 'OUTBOUND' | 'RECEIVED';
    module: string;
    description: string;
    target: string;
    value: number;
  }[];
  procurement: {
    totalOrders: number;
    procurementCost: number;
    avgValue: number;
    payments: number;
    unpaid: number;
    gst: number;
    pendingRequests: number;
    approvedRequests: number;
  };
  distribution: {
    totalDemands: number;
    fulfilledDemands: number;
    pendingDemands: number;
    totalChallans: number;
    dispatchedChallans: number;
    receivedChallans: number;
    outflowValue: number;
    shippingCosts: number;
  };
}

export const warehouseDashboardService = {
  async getStats(params?: {
    warehouseId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<WarehouseDashboardData> {
    const qs = new URLSearchParams();
    if (params?.warehouseId) qs.set('warehouseId', params.warehouseId);
    if (params?.startDate) qs.set('startDate', params.startDate);
    if (params?.endDate) qs.set('endDate', params.endDate);
    const query = qs.toString() ? `?${qs.toString()}` : '';
    const res = await api.get<{ success: boolean; data: WarehouseDashboardData }>(
      `/warehouses/dashboard-stats${query}`
    );
    return res.data;
  },
};

import { api } from './api';

export interface WarehouseDashboardData {
  activeWarehouses: { id: string; name: string; type: string }[];
  inventoryValue: number;
  payable: number;
  receivable: number;
  receivableOutletsOwing: number;
  waste: number;
  wasteCount: number;
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
    unpaidCount: number;
    discount: number;
    gst: number;
    pendingRequests: number;
    approvedRequests: number;
    stockReceivedPaid: number;
    stockReceivedPaidCount: number;
    stockReceivedUnpaid: number;
    stockReceivedUnpaidCount: number;
  };
  distribution: {
    totalDemands: number;
    fulfilledDemands: number;
    pendingDemands: number;
    totalChallans: number;
    pendingChallans?: number;
    dispatchedChallans: number;
    receivedChallans: number;
    outflowValue: number;
    shippingCosts: number;
    totalPaid?: number;
  };
}

export const warehouseDashboardService = {
  async getStats(params?: {
    warehouseId?: string;
    startDate?: string;
    endDate?: string;
    outletId?: string;
    bypassGlobalOutlet?: boolean;
  }): Promise<WarehouseDashboardData> {
    const qs = new URLSearchParams();
    if (params?.warehouseId) qs.set('warehouseId', params.warehouseId);
    if (params?.startDate) qs.set('startDate', params.startDate);
    if (params?.endDate) qs.set('endDate', params.endDate);
    if (params?.outletId) qs.set('outletId', params.outletId);
    const query = qs.toString() ? `?${qs.toString()}` : '';

    const options: RequestInit = {};
    if (params?.bypassGlobalOutlet) {
      options.headers = { 'X-Outlet-Id': 'all' };
    }

    const res = await api.get<{ success: boolean; data: WarehouseDashboardData }>(
      `/warehouses/dashboard-stats${query}`,
      options
    );
    return res.data;
  },
};

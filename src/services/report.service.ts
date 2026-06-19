import { api } from './api';

export interface SalesReport {
  totalSales: number;
  totalOrders: number;
  completedOrders: number;
  avgOrderValue: number;
  trend: { date: string; revenue: number }[];
}

export interface PnlReport {
  revenue: number;
  cogs: number;
  expenses: number;
  netProfit: number;
  expenseByCategory: { name: string; value: number }[];
  expensesAreRestaurantWide: boolean;
}

export interface ItemsReport {
  topItems: { name: string; qty: number; revenue: number }[];
}

export interface StockReport {
  totalIngredients: number;
  lowStockItems: number;
  totalValue: number;
  stockByCategory: { name: string; value: number }[];
}

export interface ReportParams {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  outletId?: string; // omit or 'all' for combined
}

function qs(params: ReportParams): string {
  const q = new URLSearchParams({ from: params.from, to: params.to });
  if (params.outletId && params.outletId !== 'all') q.set('outletId', params.outletId);
  else q.set('outletId', 'all');
  return q.toString();
}

export interface DashboardReport {
  branchName: string;
  today: {
    totalSales: number; totalOrders: number;
    channels: { type: string; sales: number; orders: number }[];
    online: { sales: number; orders: number };
    offline: { sales: number; orders: number };
  };
  month: {
    grossSale: number; discounts: number; revenue: number; expenses: number;
    foodLoss: number; netProfit: number;
    paymentBreakdown: { method: string; amount: number }[];
    growthOnlinePct: number; growthOfflinePct: number; overallGrowthPct: number;
  };
  daywiseSales: { label: string; sales: number }[];
  payable: number; receivable: number;
  topItems: { name: string; qty: number; revenue: number }[];
  topCustomers: { name: string; totalOrders: number; totalSpent: number }[];
}

export const reportService = {
  async getDashboard(params?: { outletId?: string }): Promise<DashboardReport> {
    const q = new URLSearchParams();
    q.set('outletId', params?.outletId && params.outletId !== 'all' ? params.outletId : 'all');
    const res = await api.get<{ success: boolean; data: DashboardReport }>(`/reports/dashboard?${q.toString()}`);
    return res.data;
  },
  async getSales(params: ReportParams): Promise<SalesReport> {
    const res = await api.get<{ success: boolean; data: SalesReport }>(`/reports/sales?${qs(params)}`);
    return res.data;
  },
  async getPnl(params: ReportParams): Promise<PnlReport> {
    const res = await api.get<{ success: boolean; data: PnlReport }>(`/reports/pnl?${qs(params)}`);
    return res.data;
  },
  async getItems(params: ReportParams): Promise<ItemsReport> {
    const res = await api.get<{ success: boolean; data: ItemsReport }>(`/reports/items?${qs(params)}`);
    return res.data;
  },
  async getStock(params: ReportParams): Promise<StockReport> {
    const res = await api.get<{ success: boolean; data: StockReport }>(`/reports/stock?${qs(params)}`);
    return res.data;
  },
};

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

export const reportService = {
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

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

export interface SalesByChannelRow {
  sale: number;
  cost: number;
  profit: number;
  orders: number;
}

export interface SalesByChannelCombinedRow extends SalesByChannelRow {
  marginPct: number;
}

export interface SalesByChannelReport {
  from: string;
  to: string;
  fromTime: string | null;
  toTime: string | null;
  channels: {
    dineIn: SalesByChannelRow;
    takeaway: SalesByChannelRow;
    delivery: SalesByChannelRow;
  };
  combined: SalesByChannelCombinedRow;
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
  /** Resolved outlet scope this response was computed for; undefined = chain-wide (Super Admin "all"). */
  scope?: string;
  today: {
    totalSales: number; totalOrders: number;
    channels: { type: string; sales: number; orders: number }[];
    online: { sales: number; orders: number };
    offline: { sales: number; orders: number };
    liveStatus: { pending: number; preparing: number; ready: number };
  };
  month: {
    grossSale: number; discounts: number; revenue: number; expenses: number;
    foodLoss: number; netProfit: number;
    paymentBreakdown: { method: string; amount: number }[];
    growthOnlinePct: number; growthOfflinePct: number; overallGrowthPct: number;
  };
  daywiseSales: { label: string; sales: number }[];
  /** Still computed and returned by the API; deliberately never rendered on the Dashboard
   *  (that per-warehouse detail lives on WarehouseDashboard.tsx) — see the plan doc. */
  payable: number; receivable: number;
  topItems: { name: string; qty: number; revenue: number }[];
  topCustomers: { customerId: string | null; name: string; totalOrders: number; totalSpent: number }[];
  // --- Operational counts (Phase 4 renders these; the type is front-loaded here so this
  // file never needs touching again for that phase) ---
  tables: { occupied: number; available: number; [status: string]: number };
  lowStockCount: number;
  pendingPurchaseRequests: number;
  pendingDemands: number;
  attendanceToday: { present: number; late: number; absent: number };
  pendingLeaveRequests: number;
  reservationsToday: number;
  deliveryActive: number;
  /** Pending order-cancellation requests in scope (branch, or chain-wide for Super Admin). */
  pendingCancellations: number;
  cashHub: { totalUnsettled: number; staffCount: number };
  // --- Customer Intelligence (Phase 3) ---
  /** Order count/revenue by hour of day (0-23), current week. */
  peakHours: { hour: number; orders: number; revenue: number }[];
  /** One row per day × order type that had at least one order, current week (tidy/long format). */
  orderTypeTrend: { day: string; type: string; count: number; revenue: number }[];
  /** New vs returning identifiable customers per day, current week. A customer counts as
   *  "new" on the first day they appear within the week, "returning" on any later day. */
  customerActivity: { day: string; uniqueCustomers: number; newCustomers: number; returningCustomers: number }[];
  /** Average order value + order count per weekday, trailing 60 days. */
  dayOfWeekPerformance: { label: string; orderCount: number; avgSales: number }[];
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
  async getSalesByChannel(params: {
    outletId?: string;
    from: string;
    to: string;
    fromTime?: string;
    toTime?: string;
  }): Promise<SalesByChannelReport> {
    const q = new URLSearchParams({ from: params.from, to: params.to });
    if (params.outletId && params.outletId !== 'all') q.set('outletId', params.outletId);
    else q.set('outletId', 'all');
    if (params.fromTime) q.set('fromTime', params.fromTime);
    if (params.toTime) q.set('toTime', params.toTime);
    const res = await api.get<{ success: boolean; data: SalesByChannelReport }>(`/reports/sales-by-channel?${q.toString()}`);
    return res.data;
  },
};

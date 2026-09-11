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

export interface SalesByCategoryRow {
  /** Food category name; the pseudo-name "Uncategorised" collects lines whose menu item
   *  has no category (or a deleted one). */
  name: string;
  sale: number;
  cost: number;
  profit: number;
  /** Distinct orders that had at least one line in this category (an order spanning 3
   *  categories counts once in each — so these do NOT sum to `combined.orders`). */
  orders: number;
  marginPct: number;
}

export interface StaffSalesRow {
  /** null for a historical order with no logged-in staff attribution — grouped under
   *  "Unassigned" by name instead; no id to drill down into Sales & Orders by. */
  staffId: string | null;
  name: string;
  orders: number;
  sale: number;
  cost: number;
  profit: number;
  marginPct: number;
  /** Which ordering surface(s) this staff member's orders came through in this window
   *  ("POS", "Waiter", "Self-Order", ...), joined with " / " if more than one. */
  source: string;
}

export interface SalesByStaffReport {
  from: string;
  to: string;
  fromTime: string | null;
  toTime: string | null;
  /** Sorted by `sale` descending. */
  rows: StaffSalesRow[];
  combined: { sale: number; cost: number; profit: number; orders: number; marginPct: number };
}

export interface SalesByCategoryReport {
  from: string;
  to: string;
  fromTime: string | null;
  toTime: string | null;
  /** Sorted by `sale` descending. */
  categories: SalesByCategoryRow[];
  /** All categories combined = every completed + cash-approved order in range, ALL channels
   *  (unlike SalesByChannelReport.combined, which is only Dine In / Take Away / Delivery). */
  combined: SalesByCategoryRow;
}

export interface SalesByPaymentMethodRow {
  method: string;
  amount: number;
  /** Orders that contributed a positive amount to this method. A split-payment order counts
   *  toward every method it used, so these do NOT sum to `combined.orders`. */
  orders: number;
  sharePct: number;
}

export interface SalesByPaymentMethodReport {
  from: string;
  to: string;
  fromTime: string | null;
  toTime: string | null;
  /** Sorted by `amount` descending. Amounts only — Cost/Profit is meaningless per method. */
  methods: SalesByPaymentMethodRow[];
  combined: {
    amount: number;
    /** Distinct completed + cash-approved orders in range (all channels). */
    orders: number;
    /** The "Cash" bucket. */
    cashAmount: number;
    /** Everything that isn't Cash (wallets, cards, on-account, bank…). */
    digitalAmount: number;
    cashSharePct: number;
  };
}

export interface TopItemRow {
  menuItemId: string;
  name: string;
  /** Units sold (all sizes/variants of this item merged). */
  qty: number;
  sale: number;
  cost: number;
  profit: number;
  marginPct: number;
}

export interface TopItemsReport {
  from: string;
  to: string;
  fromTime: string | null;
  toTime: string | null;
  /** Top 10 by profit, descending. */
  topItems: TopItemRow[];
  /** Bottom 10 by profit, ascending (loss-makers first). Overlaps topItems when totalItems ≤ 10. */
  bottomItems: TopItemRow[];
  /** Distinct menu items with at least one sale in the window. */
  totalItems: number;
}

export interface NetProfitReport {
  from: string;
  to: string;
  /** Σ Order.total (completed + cashApproved). */
  revenue: number;
  /** Recipe-ingredient cost of everything sold. */
  cogs: number;
  /** revenue − cogs. */
  grossProfit: number;
  /** Σ WasteRecord.cost — expired / damaged / wasted stock (Stock Adjustments–Waste page). */
  foodLoss: number;
  /** Σ Expense.amount — rent / salary / utilities (Expenses page). */
  expenses: number;
  /** revenue − cogs − foodLoss − expenses. The true bottom line. */
  netProfit: number;
  /** Σ Purchase.total for received purchases in range. CONTEXT ONLY — not subtracted; buying
   *  stock is inventory, it becomes a cost as it's sold (cogs) or wasted (foodLoss). */
  purchases: number;
  grossMarginPct: number;
  netMarginPct: number;
  /** Sorted by value desc, positive only. */
  expenseByCategory: { name: string; value: number }[];
  /** Sorted by value desc, positive only. */
  wasteByReason: { name: string; value: number }[];
}

export interface DealPerformanceRow {
  dealId: string;
  name: string;
  /** DealType enum value (COMBO/OPTION_COMBO/PERCENTAGE/BUY_X_GET_Y/PROMO_CODE/MIN_SPEND), or a
   *  generic fallback label when the deal was deleted and its live type can no longer be read. */
  type: string;
  redemptions: number;
  revenue: number;
  /** null for order-level deals (Promo Code/Min Spend) — not tied to specific menu items. */
  cost: number | null;
  profit: number | null;
  marginPct: number | null;
  /** How much this deal actually took off. Line-item deals: summed OrderItem.discount.
   *  Promo Code/Min Spend: recomputed against each redeeming order's own subtotal (not read off
   *  Order.discount, which can also include a manual discount stacked on top). */
  discount: number;
}

export interface DealsPerformanceReport {
  from: string;
  to: string;
  rows: DealPerformanceRow[];
  totalRedemptions: number;
  totalRevenue: number;
  mostUsed: { name: string; redemptions: number } | null;
  activeDealsCount: number;
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
  async getSalesByStaff(params: {
    outletId?: string;
    from: string;
    to: string;
    fromTime?: string;
    toTime?: string;
  }): Promise<SalesByStaffReport> {
    const q = new URLSearchParams({ from: params.from, to: params.to });
    if (params.outletId && params.outletId !== 'all') q.set('outletId', params.outletId);
    else q.set('outletId', 'all');
    if (params.fromTime) q.set('fromTime', params.fromTime);
    if (params.toTime) q.set('toTime', params.toTime);
    const res = await api.get<{ success: boolean; data: SalesByStaffReport }>(`/reports/sales-by-staff?${q.toString()}`);
    return res.data;
  },
  async getSalesByCategory(params: {
    outletId?: string;
    from: string;
    to: string;
    fromTime?: string;
    toTime?: string;
  }): Promise<SalesByCategoryReport> {
    const q = new URLSearchParams({ from: params.from, to: params.to });
    if (params.outletId && params.outletId !== 'all') q.set('outletId', params.outletId);
    else q.set('outletId', 'all');
    if (params.fromTime) q.set('fromTime', params.fromTime);
    if (params.toTime) q.set('toTime', params.toTime);
    const res = await api.get<{ success: boolean; data: SalesByCategoryReport }>(`/reports/sales-by-category?${q.toString()}`);
    return res.data;
  },
  async getSalesByPaymentMethod(params: {
    outletId?: string;
    from: string;
    to: string;
    fromTime?: string;
    toTime?: string;
  }): Promise<SalesByPaymentMethodReport> {
    const q = new URLSearchParams({ from: params.from, to: params.to });
    if (params.outletId && params.outletId !== 'all') q.set('outletId', params.outletId);
    else q.set('outletId', 'all');
    if (params.fromTime) q.set('fromTime', params.fromTime);
    if (params.toTime) q.set('toTime', params.toTime);
    const res = await api.get<{ success: boolean; data: SalesByPaymentMethodReport }>(`/reports/sales-by-payment-method?${q.toString()}`);
    return res.data;
  },
  async getTopItems(params: {
    outletId?: string;
    from: string;
    to: string;
    fromTime?: string;
    toTime?: string;
  }): Promise<TopItemsReport> {
    const q = new URLSearchParams({ from: params.from, to: params.to });
    if (params.outletId && params.outletId !== 'all') q.set('outletId', params.outletId);
    else q.set('outletId', 'all');
    if (params.fromTime) q.set('fromTime', params.fromTime);
    if (params.toTime) q.set('toTime', params.toTime);
    const res = await api.get<{ success: boolean; data: TopItemsReport }>(`/reports/top-items?${q.toString()}`);
    return res.data;
  },
  async getNetProfit(params: { outletId?: string; from: string; to: string }): Promise<NetProfitReport> {
    const q = new URLSearchParams({ from: params.from, to: params.to });
    if (params.outletId && params.outletId !== 'all') q.set('outletId', params.outletId);
    else q.set('outletId', 'all');
    const res = await api.get<{ success: boolean; data: NetProfitReport }>(`/reports/net-profit?${q.toString()}`);
    return res.data;
  },

  async getDealsPerformance(params: { outletId?: string; from: string; to: string }): Promise<DealsPerformanceReport> {
    const q = new URLSearchParams({ from: params.from, to: params.to });
    if (params.outletId && params.outletId !== 'all') q.set('outletId', params.outletId);
    else q.set('outletId', 'all');
    const res = await api.get<{ success: boolean; data: DealsPerformanceReport }>(`/reports/deals-performance?${q.toString()}`);
    return res.data;
  },
};

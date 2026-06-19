import { useState } from "react";
import { Link } from "react-router-dom";
import { LayoutDashboard, TrendingUp, ShoppingBag, DollarSign, Clock, AlertTriangle, Package, Wallet, ReceiptText, TrendingDown, Flame, ArrowUpCircle, ArrowDownCircle, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, BarChart, Bar } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { orderService } from "@/services/order.service";
import { inventoryService } from "@/services/inventory.service";
import { customerService } from "@/services/customer.service";
import { supplierService } from "@/services/supplier.service";
import { expenseService } from "@/services/expense.service";
import { stockService } from "@/services/stock.service";
import { settingsService } from "@/services/settings.service";
import { ORDER_STATUS_COLORS } from "@/lib/constants";

const statusColor = ORDER_STATUS_COLORS;
const orderTypeColors = ["hsl(var(--primary))", "hsl(var(--info))", "hsl(var(--success))", "hsl(var(--warning))", "hsl(var(--accent))"];

const Dashboard = () => {
  const { data: ordersResp, isLoading: ordersLoading } = useQuery({ queryKey: ["dashboard-orders"], queryFn: () => orderService.getOrders({ limit: 500 }) });
  const orders = ordersResp?.data ?? [];
  const { data: ingredients = [] } = useQuery({ queryKey: ["dashboard-ingredients"], queryFn: () => inventoryService.getIngredients({ status: "active" }) });
  const { data: customersResp } = useQuery({ queryKey: ["dashboard-customers"], queryFn: () => customerService.getCustomers({ limit: 500 }) });
  const customers = customersResp?.data ?? [];
  const { data: suppliersResp } = useQuery({ queryKey: ["dashboard-suppliers"], queryFn: () => supplierService.getAll() });
  const suppliers = suppliersResp?.data ?? [];
  const { data: expensesResp } = useQuery({ queryKey: ["dashboard-expenses"], queryFn: () => expenseService.getAll({ limit: 500 }) });
  const expenses = expensesResp?.data ?? [];
  const { data: wasteResp } = useQuery({ queryKey: ["dashboard-waste"], queryFn: () => stockService.getWasteRecords({ limit: 500 }) });
  const wasteRecords = wasteResp?.data ?? [];
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: () => settingsService.getSettings() });
  const currency = settings?.currency || "Rs.";
  const loading = ordersLoading;
  const [salesView, setSalesView] = useState<"hourly" | "daily" | "weekly" | "monthly" | "yearly">("hourly");

  const todayStr = new Date().toISOString().split("T")[0];
  const todayOrders = orders.filter(o => o.date === todayStr);
  const todaySales = todayOrders.reduce((s, o) => s + o.total, 0);
  const avgOrderValue = todayOrders.length > 0 ? Math.round(todaySales / todayOrders.length) : 0;
  const activeOrders = orders.filter(o => o.status === "pending" || o.status === "preparing").length;
  const totalStockValue = ingredients
    .filter(i => i.status === "active")
    .reduce((sum, i) => sum + (i.currentStock * (i.purchasePrice ?? 0)), 0);
  const totalStockItems = ingredients.filter(i => i.status === "active").length;

  // A2 — Financial Overview KPIs
  const activeOrders2 = orders.filter(o => o.status !== "cancelled" && o.status !== "scheduled");
  const grossSale = activeOrders2.reduce((s, o) => s + o.subtotal, 0);
  const totalDiscounts = activeOrders2.reduce((s, o) => s + o.discount, 0);
  const revenue = activeOrders2.reduce((s, o) => s + o.total, 0);
  const totalExpensesAmount = expenses.reduce((s, e) => s + e.amount, 0);
  const foodLoss = wasteRecords.reduce((s, w) => s + Number(w.cost ?? 0), 0);
  const netProfit = revenue - totalExpensesAmount - foodLoss;

  // A3 — Payable & Receivable
  const totalPayable = suppliers.reduce((s, sup) => s + sup.totalDue, 0);
  const totalReceivable = customers.reduce((s, c) => s + c.outstandingDue, 0);
  const payableCount = suppliers.filter(sup => sup.totalDue > 0).length;
  const receivableCount = customers.filter(c => c.outstandingDue > 0).length;

  // A4 — Top 10 Best-Selling Items
  const itemSalesMap = new Map<string, { name: string; qty: number; revenue: number }>();
  orders.forEach(order => {
    if (order.status !== "cancelled" && order.status !== "scheduled") {
      order.items.forEach(item => {
        const key = item.name;
        const existing = itemSalesMap.get(key);
        if (existing) {
          existing.qty += item.qty;
          existing.revenue += item.price * item.qty;
        } else {
          itemSalesMap.set(key, {
            name: item.name,
            qty: item.qty,
            revenue: item.price * item.qty,
          });
        }
      });
    }
  });
  const topTenItems = Array.from(itemSalesMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // A5 — Top 10 Customers
  const topTenCustomers = [...customers]
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, 10);

  const validSalesOrders = activeOrders2;

  const parseOrderHour = (time: string): number => {
    const [clock = "12:00", modifier = "AM"] = time.trim().split(" ");
    const [hourPart = "0"] = clock.split(":");
    const hour = Number(hourPart);

    if (Number.isNaN(hour)) {
      return 0;
    }

    if (modifier.toUpperCase() === "AM") {
      return hour === 12 ? 0 : hour;
    }

    return hour === 12 ? 12 : hour + 12;
  };

  const formatHourLabel = (hour: number): string => {
    const suffix = hour >= 12 ? "PM" : "AM";
    const normalized = hour % 12 === 0 ? 12 : hour % 12;
    return `${normalized} ${suffix}`;
  };

  const formatShortDate = (date: Date): string =>
    date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const formatWeekday = (date: Date): string =>
    date.toLocaleDateString("en-US", { weekday: "short" });

  const getWeekOfMonth = (date: Date): number => Math.floor((date.getDate() - 1) / 7) + 1;

  // A6 — Sales Comparison (Hourly / Daily / Weekly / Monthly / Yearly)
  const today = new Date();
  const todayKey = todayStr;
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  // Hourly — today's sales by hour
  const hourlySalesMap = new Map<number, { sales: number; orders: number }>();
  for (let hour = 0; hour < 24; hour += 1) {
    hourlySalesMap.set(hour, { sales: 0, orders: 0 });
  }

  validSalesOrders
    .filter(order => order.date === todayKey)
    .forEach(order => {
      const hour = parseOrderHour(order.time ?? "");
      const existing = hourlySalesMap.get(hour) || { sales: 0, orders: 0 };
      existing.sales += order.total;
      existing.orders += 1;
      hourlySalesMap.set(hour, existing);
    });

  const hourlySalesData = Array.from(hourlySalesMap.entries()).map(([hour, data]) => ({
    label: formatHourLabel(hour),
    sales: Math.round(data.sales),
    orders: data.orders,
  }));

  // Daily — current week sales (Mon-Sun)
  const startOfWeek = new Date(today);
  const weekdayIndex = (today.getDay() + 6) % 7;
  startOfWeek.setDate(today.getDate() - weekdayIndex);
  startOfWeek.setHours(0, 0, 0, 0);

  const dailySalesData = Array.from({ length: 7 }, (_, index) => {
    const bucketDate = new Date(startOfWeek);
    bucketDate.setDate(startOfWeek.getDate() + index);
    const dateKey = bucketDate.toISOString().split("T")[0];
    const matchingOrders = validSalesOrders.filter(order => order.date === dateKey);
    return {
      label: formatWeekday(bucketDate),
      subLabel: formatShortDate(bucketDate),
      sales: Math.round(matchingOrders.reduce((sum, order) => sum + order.total, 0)),
      orders: matchingOrders.length,
    };
  });

  // Weekly — current month sales by week-of-month
  const weeklySalesMap = new Map<number, { sales: number; orders: number }>();
  for (let week = 1; week <= 5; week += 1) {
    weeklySalesMap.set(week, { sales: 0, orders: 0 });
  }

  validSalesOrders.forEach(order => {
    const orderDate = new Date(order.date);
    if (orderDate.getFullYear() === currentYear && orderDate.getMonth() === currentMonth) {
      const weekOfMonth = getWeekOfMonth(orderDate);
      const existing = weeklySalesMap.get(weekOfMonth) || { sales: 0, orders: 0 };
      existing.sales += order.total;
      existing.orders += 1;
      weeklySalesMap.set(weekOfMonth, existing);
    }
  });

  const weeklySalesData = Array.from(weeklySalesMap.entries()).map(([week, data]) => ({
    label: `Week ${week}`,
    sales: Math.round(data.sales),
    orders: data.orders,
  }));

  // Monthly — current year sales by month
  const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthlySalesMap = new Map<number, { sales: number; orders: number }>();
  for (let month = 0; month < 12; month += 1) {
    monthlySalesMap.set(month, { sales: 0, orders: 0 });
  }

  validSalesOrders.forEach(order => {
    const orderDate = new Date(order.date);
    if (orderDate.getFullYear() === currentYear) {
      const month = orderDate.getMonth();
      const existing = monthlySalesMap.get(month) || { sales: 0, orders: 0 };
      existing.sales += order.total;
      existing.orders += 1;
      monthlySalesMap.set(month, existing);
    }
  });

  const monthlySalesData = Array.from(monthlySalesMap.entries()).map(([month, data]) => ({
    label: monthLabels[month],
    sales: Math.round(data.sales),
    orders: data.orders,
  }));

  // Yearly — all available years
  const yearlySalesMap = new Map<number, { sales: number; orders: number }>();
  validSalesOrders.forEach(order => {
    const year = new Date(order.date).getFullYear();
    const existing = yearlySalesMap.get(year) || { sales: 0, orders: 0 };
    existing.sales += order.total;
    existing.orders += 1;
    yearlySalesMap.set(year, existing);
  });

  const yearlySalesData = Array.from(yearlySalesMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([year, data]) => ({
      label: String(year),
      sales: Math.round(data.sales),
      orders: data.orders,
    }));

  const salesComparisonDataMap = {
    hourly: hourlySalesData,
    daily: dailySalesData,
    weekly: weeklySalesData,
    monthly: monthlySalesData,
    yearly: yearlySalesData,
  };

  const salesViewMeta = {
    hourly: {
      title: "Hourly Sales Today",
      description: "Use this to identify low-sale hours for promotions",
      peakLabel: "Peak Hour",
      lowLabel: "Lowest Hour",
    },
    daily: {
      title: "Daily Sales This Week",
      description: "Day-by-day sales performance for the current week",
      peakLabel: "Best Day",
      lowLabel: "Lowest Day",
    },
    weekly: {
      title: "Weekly Sales This Month",
      description: "Week-by-week sales performance for the current month",
      peakLabel: "Best Week",
      lowLabel: "Lowest Week",
    },
    monthly: {
      title: "Monthly Sales This Year",
      description: "Month-by-month sales trend for the current year",
      peakLabel: "Best Month",
      lowLabel: "Lowest Month",
    },
    yearly: {
      title: "Yearly Sales Comparison",
      description: "Year-over-year revenue comparison",
      peakLabel: "Best Year",
      lowLabel: "Lowest Year",
    },
  };

  const activeSalesData: Array<{ label: string; sales: number; orders: number }> = salesComparisonDataMap[salesView].map(({ label, sales, orders }) => ({
    label,
    sales,
    orders,
  }));
  const activeSalesMeta = salesViewMeta[salesView];

  const activeSalesTotal = activeSalesData.reduce((sum, item) => sum + item.sales, 0);
  const activeSalesOrders = activeSalesData.reduce((sum, item) => sum + item.orders, 0);
  const hasAnySalesData = activeSalesTotal > 0;
  const activePeak = hasAnySalesData
    ? activeSalesData.reduce((best, current) => current.sales > best.sales ? current : best)
    : null;
  const activeLow = hasAnySalesData
    ? activeSalesData.filter(d => d.sales > 0).reduce((lowest, current) => current.sales < lowest.sales ? current : lowest, activeSalesData.filter(d => d.sales > 0)[0] || null)
    : null;

  // Revenue (Last 7 Days) — derived from orders grouped by date
  const revenueChartData = Array.from({ length: 7 }, (_, index) => {
    const bucketDate = new Date(today);
    bucketDate.setDate(today.getDate() - (6 - index));
    const dateKey = bucketDate.toISOString().split("T")[0];
    const revenueForDay = validSalesOrders
      .filter(order => order.date === dateKey)
      .reduce((sum, order) => sum + order.total, 0);
    return { date: formatShortDate(bucketDate), revenue: Math.round(revenueForDay) };
  });

  // Order Types — % split of non-cancelled, non-scheduled orders by type
  const orderTypeCounts = validSalesOrders.reduce((acc, order) => {
    const key = order.type || "Other";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const orderTypeTotal = Object.values(orderTypeCounts).reduce((s, n) => s + n, 0);
  const orderTypeData = Object.entries(orderTypeCounts).map(([name, count], index) => ({
    name,
    value: orderTypeTotal > 0 ? Math.round((count / orderTypeTotal) * 100) : 0,
    color: orderTypeColors[index % orderTypeColors.length],
  }));

  const statCards = [
    { title: "Today's Sales", value: `${currency} ${todaySales.toLocaleString()}`, change: `${todayOrders.length} orders`, up: true, icon: DollarSign, iconBg: "bg-success/10", iconColor: "text-success" },
    { title: "Today's Orders", value: String(todayOrders.length), change: "", up: true, icon: ShoppingBag, iconBg: "bg-info/10", iconColor: "text-info" },
    { title: "Avg Order Value", value: `${currency} ${avgOrderValue.toLocaleString()}`, change: "", up: true, icon: TrendingUp, iconBg: "bg-warning/10", iconColor: "text-warning" },
    { title: "Active Orders", value: String(activeOrders), change: "", up: true, icon: Clock, iconBg: "bg-primary/10", iconColor: "text-primary" },
    { title: "Total Stock Value", value: `${currency} ${totalStockValue.toLocaleString()}`, change: `${totalStockItems} ingredients`, up: true, icon: Package, iconBg: "bg-gold/10", iconColor: "text-gold" },
  ];

  const recentOrders = orders.slice(-5).reverse();
  // topItems removed — duplicate of A4 Top 10 Best-Selling Items
  const lowStockItems = ingredients.filter((i) => i.currentStock <= i.lowStockLevel);

  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-24" />)}</div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4"><Skeleton className="lg:col-span-2 h-72" /><Skeleton className="h-72" /></div>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader icon={<LayoutDashboard className="h-5 w-5" />} title="Dashboard" subtitle="Welcome back, here's your overview" />

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {statCards.map((s) => (
          <Card key={s.title} className="shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{s.title}</p>
                  <p className="text-2xl font-bold mt-1">{s.value}</p>
                  {s.change && <span className="text-xs font-medium text-success">{s.change}</span>}
                </div>
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${s.iconBg}`}>
                  <s.icon className={`h-5 w-5 ${s.iconColor}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* A2 — Financial Overview KPIs */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Financial Overview (All Time)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Gross Sale</p>
                  <p className="text-2xl font-bold mt-1">{currency} {grossSale.toLocaleString()}</p>
                  <span className="text-xs text-muted-foreground">Discounts: {currency} {totalDiscounts.toLocaleString()}</span>
                </div>
                <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-blue-500/10">
                  <ReceiptText className="h-5 w-5 text-blue-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Revenue</p>
                  <p className="text-2xl font-bold mt-1">{currency} {revenue.toLocaleString()}</p>
                  <span className="text-xs text-muted-foreground">After discounts + tax</span>
                </div>
                <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-success/10">
                  <Wallet className="h-5 w-5 text-success" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Net Profit</p>
                  <p className={`text-2xl font-bold mt-1 ${netProfit >= 0 ? "text-success" : "text-destructive"}`}>
                    {currency} {netProfit.toLocaleString()}
                  </p>
                  <span className="text-xs text-muted-foreground">Revenue − Expenses − Loss</span>
                </div>
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${netProfit >= 0 ? "bg-success/10" : "bg-destructive/10"}`}>
                  <TrendingUp className={`h-5 w-5 ${netProfit >= 0 ? "text-success" : "text-destructive"}`} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-destructive/20">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Food Loss</p>
                  <p className="text-2xl font-bold mt-1 text-destructive">{currency} {foodLoss.toLocaleString()}</p>
                  <span className="text-xs text-muted-foreground">{wasteRecords.length} waste records</span>
                </div>
                <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-destructive/10">
                  <Flame className="h-5 w-5 text-destructive" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* A3 — Payable & Receivable */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
          <ArrowUpCircle className="h-4 w-4" />
          Payable & Receivable
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="shadow-sm border-warning/20">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Total Payable</p>
                  <p className="text-2xl font-bold mt-1 text-warning">{currency} {totalPayable.toLocaleString()}</p>
                  <span className="text-xs text-muted-foreground">{payableCount} supplier{payableCount !== 1 ? "s" : ""} with pending dues</span>
                </div>
                <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-warning/10">
                  <ArrowUpCircle className="h-5 w-5 text-warning" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-info/20">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Total Receivable</p>
                  <p className="text-2xl font-bold mt-1 text-info">{currency} {totalReceivable.toLocaleString()}</p>
                  <span className="text-xs text-muted-foreground">{receivableCount} customer{receivableCount !== 1 ? "s" : ""} with outstanding dues</span>
                </div>
                <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-info/10">
                  <ArrowDownCircle className="h-5 w-5 text-info" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* A4 — Top 10 Best-Selling Items */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Top 10 Best-Selling Items
        </h3>
        <Card className="shadow-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b">
                    <TableHead className="w-[40%] font-semibold text-xs">Item Name</TableHead>
                    <TableHead className="text-right font-semibold text-xs">Qty Sold</TableHead>
                    <TableHead className="text-right font-semibold text-xs">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topTenItems.map((item, idx) => (
                    <TableRow key={idx} className="border-b last:border-0">
                      <TableCell className="py-3 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-muted-foreground w-5">{idx + 1}.</span>
                          <span className="font-medium">{item.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-xs font-semibold">{item.qty}</TableCell>
                      <TableCell className="text-right text-xs font-semibold text-success">{currency} {item.revenue.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* A5 — Top 10 Customers */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
          <ShoppingBag className="h-4 w-4" />
          Top 10 Customers
        </h3>
        <Card className="shadow-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b">
                    <TableHead className="w-[40%] font-semibold text-xs">Customer Name</TableHead>
                    <TableHead className="text-right font-semibold text-xs">Orders</TableHead>
                    <TableHead className="text-right font-semibold text-xs">Total Spent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topTenCustomers.map((customer, idx) => (
                    <TableRow key={customer.id} className="border-b last:border-0">
                      <TableCell className="py-3 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-muted-foreground w-5">{idx + 1}.</span>
                          <div>
                            <p className="font-medium">{customer.name}</p>
                            <p className="text-xs text-muted-foreground">{customer.phone}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-xs font-semibold">{customer.totalOrders}</TableCell>
                      <TableCell className="text-right text-xs font-semibold text-success">{currency} {customer.totalSpent.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>


      {/* A6 — Sales Comparison (Hourly / Daily / Weekly / Monthly / Yearly) */}
      <div className="col-span-full">
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Sales Comparison - Hourly / Daily / Weekly / Monthly / Yearly
        </h3>
        <Card className="shadow-sm">
          <CardHeader className="pb-2 gap-4">
            <div>
              <CardTitle className="text-base">{activeSalesMeta.title}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{activeSalesMeta.description}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {([
                "hourly",
                "daily",
                "weekly",
                "monthly",
                "yearly",
              ] as const).map(view => (
                <Button
                  key={view}
                  type="button"
                  size="sm"
                  variant={salesView === view ? "default" : "outline"}
                  onClick={() => setSalesView(view)}
                  className="capitalize"
                >
                  {view}
                </Button>
              ))}
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-xl border p-4 bg-muted/20">
                <p className="text-xs text-muted-foreground">Period Total</p>
                <p className="text-xl font-bold mt-1">{currency} {activeSalesTotal.toLocaleString()}</p>
              </div>
              <div className="rounded-xl border p-4 bg-muted/20">
                <p className="text-xs text-muted-foreground">Total Orders</p>
                <p className="text-xl font-bold mt-1">{activeSalesOrders}</p>
              </div>
              <div className="rounded-xl border p-4 bg-success/5 border-success/20">
                <p className="text-xs text-muted-foreground">{activeSalesMeta.peakLabel}</p>
                {hasAnySalesData ? (
                  <>
                    <p className="text-sm font-bold mt-1 text-success">{activePeak?.label || "-"}</p>
                    <p className="text-xs text-muted-foreground">{currency} {activePeak?.sales?.toLocaleString() || 0}</p>
                  </>
                ) : (
                  <p className="text-sm font-medium mt-1 text-muted-foreground">No data</p>
                )}
              </div>
              <div className="rounded-xl border p-4 bg-warning/5 border-warning/20">
                <p className="text-xs text-muted-foreground">{activeSalesMeta.lowLabel}</p>
                {hasAnySalesData && activeLow ? (
                  <>
                    <p className="text-sm font-bold mt-1 text-warning">{activeLow.label}</p>
                    <p className="text-xs text-muted-foreground">{currency} {activeLow.sales?.toLocaleString() || 0}</p>
                  </>
                ) : (
                  <p className="text-sm font-medium mt-1 text-muted-foreground">No data</p>
                )}
              </div>
            </div>

            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={activeSalesData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(value) => `${currency} ${(value / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(value: number, name: string) => {
                      if (name === "sales") return [`${currency} ${value.toLocaleString()}`, "Sales"];
                      return [value, "Orders"];
                    }}
                  />
                  <Legend />
                  <Bar dataKey="sales" name="sales" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="text-xs text-muted-foreground text-center">
              <p>
                Includes all non-cancelled, non-scheduled orders only. Use the hourly view to identify weak sales hours for targeted promotions.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-base">Revenue (Last 7 Days)</CardTitle></CardHeader><CardContent><div className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><AreaChart data={revenueChartData}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" /><YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} /><Tooltip formatter={(v: number) => [`Rs. ${v.toLocaleString()}`, "Revenue"]} /><Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.15)" strokeWidth={2} /></AreaChart></ResponsiveContainer></div></CardContent></Card>
        <Card className="shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-base">Order Types</CardTitle></CardHeader><CardContent><div className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={orderTypeData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" labelLine={true}>{orderTypeData.map((entry, i) => <Cell key={i} fill={entry.color} />)}</Pie><Legend verticalAlign="bottom" height={36} formatter={(value: string) => { const item = orderTypeData.find(d => d.name === value); return `${value} ${item?.value || 0}%`; }} /></PieChart></ResponsiveContainer></div></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Orders</CardTitle>
            <Button variant="link" size="sm" asChild><Link to="/sales">View All</Link></Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="sticky top-0 z-10 bg-card">Order</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card">Customer</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card">Total</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentOrders.map((o) => (
                    <TableRow key={o.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-medium">{o.orderNumber}</TableCell>
                      <TableCell>{o.customerName ?? "-"}</TableCell>
                      <TableCell>{currency} {o.total.toLocaleString()}</TableCell>
                      <TableCell><Badge variant="secondary" className={statusColor[o.status]}>{o.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {lowStockItems.length > 0 && (
            <Card className="shadow-sm border-warning/30"><CardHeader className="pb-2 flex-row items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning" /><CardTitle className="text-base">Low Stock Alerts</CardTitle></CardHeader><CardContent><div className="space-y-2">{lowStockItems.slice(0, 6).map((item) => (<div key={item.id} className="flex items-center justify-between text-sm"><span>{item.name}</span><div className="flex items-center gap-2"><span className="text-destructive font-medium">{item.currentStock} {item.unit?.name}</span><Badge variant="secondary" className={item.currentStock === 0 ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"}>{item.currentStock === 0 ? "Out" : "Low"}</Badge></div></div>))}</div></CardContent></Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

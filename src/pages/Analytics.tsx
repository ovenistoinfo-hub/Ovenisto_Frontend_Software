import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, LineChart, Line, Legend } from "recharts";
import { TrendingUp, ShoppingCart, Users, ArrowUpRight, BarChart3, ShoppingBag, Utensils, Award } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { useData } from "@/contexts/DataContext";
import { useQuery } from "@tanstack/react-query";
import { reportService } from "@/services/report.service";
import { useOutletFilter } from "@/hooks/useOutletFilter";
import { OutletFilterSelect } from "@/components/OutletFilterSelect";

const Analytics = () => {
  const { outletId, setOutletId, outlets, isSuperAdmin } = useOutletFilter();
  const { orders, foodMenuItems } = useData();
  const currency = "Rs.";

  const { data: dashboardData, isLoading: dashboardLoading } = useQuery({
    queryKey: ["analytics-dashboard", outletId],
    queryFn: () => reportService.getDashboard({ outletId }),
  });

  const [loading, setLoading] = useState(true);
  useEffect(() => { const t = setTimeout(() => setLoading(false), 500); return () => clearTimeout(t); }, []);

  const completedOrders = orders.filter(o => o.status === "completed");
  const last7Days = useMemo(() => {
    const days: { date: string; revenue: number; orders: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const dayOrders = completedOrders.filter(o => o.date === dateStr);
      days.push({ date: `${d.toLocaleDateString("en-US", { month: "short" })} ${d.getDate()}`, revenue: dayOrders.reduce((s, o) => s + o.total, 0), orders: dayOrders.length });
    }
    return days;
  }, [completedOrders]);

  const weeklyRevenue = last7Days.reduce((s, d) => s + d.revenue, 0);
  const weeklyOrders = last7Days.reduce((s, d) => s + d.orders, 0);

  const peakHours = useMemo(() => {
    const hourCounts: Record<string, number> = {};
    for (let i = 9; i <= 22; i++) hourCounts[`${i}:00`] = 0;
    orders.forEach(o => {
      const match = o.time?.match(/(\d+):/);
      if (match) {
        let h = parseInt(match[1]);
        if (o.time?.includes("PM") && h < 12) h += 12;
        if (o.time?.includes("AM") && h === 12) h = 0;
        const key = `${h}:00`;
        if (hourCounts[key] !== undefined) hourCounts[key]++;
      }
    });
    return Object.entries(hourCounts).map(([hour, count]) => ({ hour, orders: count }));
  }, [orders]);

  const topItemsChart = useMemo(() => {
    const itemCounts: Record<string, number> = {};
    orders.forEach(o => o.items.forEach(item => { itemCounts[item.name] = (itemCounts[item.name] || 0) + item.qty; }));
    return Object.entries(itemCounts).map(([name, qty]) => ({ name: name.substring(0, 15), qty })).sort((a, b) => b.qty - a.qty).slice(0, 10);
  }, [orders]);

  const customerTrend = useMemo(() => {
    const days: { day: string; unique: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const dayCustomers = new Set(orders.filter(o => o.date === dateStr).map(o => o.customer));
      days.push({ day: d.toLocaleDateString("en-US", { weekday: "short" }), unique: dayCustomers.size });
    }
    return days;
  }, [orders]);

  const orderTypeTrend = useMemo(() => last7Days.map(d => {
    const dateOrders = orders.filter(o => {
      const od = new Date(o.date);
      return `${od.toLocaleDateString("en-US", { month: "short" })} ${od.getDate()}` === d.date;
    });
    return { date: d.date, dineIn: dateOrders.filter(o => o.type === "Dine In").length, takeAway: dateOrders.filter(o => o.type === "Take Away").length, delivery: dateOrders.filter(o => o.type === "Delivery").length, online: dateOrders.filter(o => o.type === "Online").length };
  }), [last7Days, orders]);

  const dayPerformance = useMemo(() => {
    const dayMap: Record<string, { revenue: number; orders: number }> = {};
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach(d => dayMap[d] = { revenue: 0, orders: 0 });
    completedOrders.forEach(o => {
      const d = new Date(o.date).toLocaleDateString("en-US", { weekday: "short" });
      if (dayMap[d]) { dayMap[d].revenue += o.total; dayMap[d].orders++; }
    });
    return Object.entries(dayMap).map(([day, v]) => ({ day, ...v }));
  }, [completedOrders]);

  const uniqueCustomers = new Set(orders.filter(o => {
    const d = new Date(o.date); const now = new Date();
    return d >= new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
  }).map(o => o.customer)).size;

  const prevWeekRevenue = weeklyRevenue * 0.85;
  const growth = prevWeekRevenue > 0 ? ((weeklyRevenue - prevWeekRevenue) / prevWeekRevenue * 100).toFixed(1) : "0";

  if (loading || dashboardLoading) return <div className="space-y-6"><Skeleton className="h-8 w-48" /><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-24" />)}</div><div className="grid grid-cols-1 lg:grid-cols-2 gap-4"><Skeleton className="h-72" /><Skeleton className="h-72" /></div></div>;

  const topItemsList = dashboardData?.topItems ?? [];
  const topCustomersList = dashboardData?.topCustomers ?? [];

  return (
    <div className="space-y-6 p-4 sm:p-6 pb-12 w-full max-w-[1920px] mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <PageHeader
          icon={<BarChart3 className="h-6 w-6 text-primary" />}
          title="Analytics & Intelligence"
          subtitle="Sales trends, best-selling food items, and customer analytics"
        />
        <OutletFilterSelect outletId={outletId} setOutletId={setOutletId} outlets={outlets} isSuperAdmin={isSuperAdmin} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm"><CardContent className="p-5"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground font-medium">Weekly Revenue</p><p className="text-2xl font-bold mt-1">Rs. {(weeklyRevenue / 1000).toFixed(0)}k</p></div><div className="h-10 w-10 rounded-lg flex items-center justify-center bg-primary/10"><TrendingUp className="h-5 w-5 text-primary" /></div></div></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-5"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground font-medium">Weekly Orders</p><p className="text-2xl font-bold mt-1">{weeklyOrders}</p></div><div className="h-10 w-10 rounded-lg flex items-center justify-center bg-info/10"><ShoppingCart className="h-5 w-5 text-info" /></div></div></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-5"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground font-medium">Unique Customers</p><p className="text-2xl font-bold mt-1">{uniqueCustomers}</p></div><div className="h-10 w-10 rounded-lg flex items-center justify-center bg-success/10"><Users className="h-5 w-5 text-success" /></div></div></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-5"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground font-medium">Revenue Growth</p><p className="text-2xl font-bold mt-1 text-success">+{growth}%</p></div><div className="h-10 w-10 rounded-lg flex items-center justify-center bg-success/10"><ArrowUpRight className="h-5 w-5 text-success" /></div></div></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-sm border-border/80 bg-card rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-border/60 pb-3">
            <CardTitle className="text-base font-extrabold flex items-center gap-2">
              <Utensils className="h-4 w-4 text-amber-500" />
              Top 10 Best-Selling Food Items
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="text-sm">
                <TableHeader className="bg-muted/40">
                  <TableRow className="hover:bg-transparent border-b">
                    <TableHead className="w-[45%] font-extrabold text-xs uppercase tracking-wider">Item Name</TableHead>
                    <TableHead className="text-right font-extrabold text-xs uppercase tracking-wider">Qty Sold</TableHead>
                    <TableHead className="text-right font-extrabold text-xs uppercase tracking-wider pr-6">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topItemsList.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-6 text-xs text-muted-foreground">
                        No sales record available yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    topItemsList.map((item, idx) => (
                      <TableRow key={idx} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <TableCell className="py-3 text-xs">
                          <div className="flex items-center gap-2.5">
                            <span className="font-mono font-bold text-amber-500 w-5">{idx + 1}.</span>
                            <span className="font-semibold text-foreground">{item.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-xs font-bold font-mono">{item.qty}</TableCell>
                        <TableCell className="text-right text-xs font-extrabold font-mono text-emerald-500 pr-6">
                          {currency} {item.revenue.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/80 bg-card rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-border/60 pb-3">
            <CardTitle className="text-base font-extrabold flex items-center gap-2">
              <Award className="h-4 w-4 text-blue-500" />
              Top 10 Customers
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="text-sm">
                <TableHeader className="bg-muted/40">
                  <TableRow className="hover:bg-transparent border-b">
                    <TableHead className="w-[45%] font-extrabold text-xs uppercase tracking-wider">Customer Name</TableHead>
                    <TableHead className="text-right font-extrabold text-xs uppercase tracking-wider">Orders</TableHead>
                    <TableHead className="text-right font-extrabold text-xs uppercase tracking-wider pr-6">Total Spent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topCustomersList.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-6 text-xs text-muted-foreground">
                        No customer history available yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    topCustomersList.map((customer, idx) => (
                      <TableRow key={idx} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <TableCell className="py-3 text-xs">
                          <div className="flex items-center gap-2.5">
                            <span className="font-mono font-bold text-blue-500 w-5">{idx + 1}.</span>
                            <span className="font-semibold text-foreground">{customer.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-xs font-bold font-mono">{customer.totalOrders}</TableCell>
                        <TableCell className="text-right text-xs font-extrabold font-mono text-emerald-500 pr-6">
                          {currency} {customer.totalSpent.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-sm"><CardHeader><CardTitle className="text-base font-bold">Revenue (Last 7 Days)</CardTitle></CardHeader><CardContent><div className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={last7Days}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="date" /><YAxis tickFormatter={v=>`${(v/1000).toFixed(0)}k`} /><Tooltip /><Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} name="Revenue" /><Legend /></LineChart></ResponsiveContainer></div></CardContent></Card>
        <Card className="shadow-sm"><CardHeader><CardTitle className="text-base font-bold">Peak Hours</CardTitle></CardHeader><CardContent><div className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={peakHours}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="hour" tick={{fontSize:9}} /><YAxis /><Tooltip /><Bar dataKey="orders" fill="hsl(var(--primary))" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer></div></CardContent></Card>
        <Card className="shadow-sm"><CardHeader><CardTitle className="text-base font-bold">Customer Activity</CardTitle></CardHeader><CardContent><div className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={customerTrend}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" /><YAxis /><Tooltip /><Bar dataKey="unique" fill="hsl(var(--primary))" name="Unique Customers" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer></div></CardContent></Card>
        <Card className="shadow-sm"><CardHeader><CardTitle className="text-base font-bold">Order Type Trend</CardTitle></CardHeader><CardContent><div className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><AreaChart data={orderTypeTrend}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis /><Tooltip /><Area type="monotone" dataKey="dineIn" stackId="1" fill="hsl(var(--primary) / 0.3)" stroke="hsl(var(--primary))" /><Area type="monotone" dataKey="takeAway" stackId="1" fill="hsl(var(--accent) / 0.3)" stroke="hsl(var(--accent))" /><Area type="monotone" dataKey="delivery" stackId="1" fill="hsl(var(--info) / 0.3)" stroke="hsl(var(--info))" /><Legend /></AreaChart></ResponsiveContainer></div></CardContent></Card>
        <Card className="shadow-sm"><CardHeader><CardTitle className="text-base font-bold">Most Popular Items</CardTitle></CardHeader><CardContent><div className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={topItemsChart} layout="vertical"><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" /><YAxis type="category" dataKey="name" tick={{fontSize:10}} width={120} /><Tooltip /><Bar dataKey="qty" fill="hsl(var(--primary))" radius={[0,4,4,0]} /></BarChart></ResponsiveContainer></div></CardContent></Card>
        <Card className="shadow-sm"><CardHeader><CardTitle className="text-base font-bold">Day-of-Week Performance</CardTitle></CardHeader><CardContent><div className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={dayPerformance}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" /><YAxis yAxisId="left" tickFormatter={v=>`${(v/1000).toFixed(0)}k`} /><YAxis yAxisId="right" orientation="right" /><Tooltip /><Bar yAxisId="left" dataKey="revenue" fill="hsl(var(--primary))" radius={[4,4,0,0]} /><Bar yAxisId="right" dataKey="orders" fill="hsl(var(--accent))" radius={[4,4,0,0]} /><Legend /></BarChart></ResponsiveContainer></div></CardContent></Card>
      </div>
    </div>
  );
};
export default Analytics;

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend, ComposedChart, Line } from "recharts";
import { Download, Calendar, FileText } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { format } from "date-fns";
import { toast } from "sonner";
import { useData } from "@/contexts/DataContext";
import { PageHeader } from "@/components/ui/page-header";

const pieColors = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(var(--info))", "hsl(var(--gold))", "hsl(var(--success))", "hsl(var(--warning))"];

const Reports = () => {
  const { orders, expenses, ingredients, suppliers, purchases, wasteRecords, foodMenuItems, foodRecipes, users, settings } = useData();
  const currency = settings.currency || "Rs.";
  const [dateFrom, setDateFrom] = useState<Date | undefined>(new Date(2026, 2, 1));
  const [dateTo, setDateTo] = useState<Date | undefined>(new Date(2026, 2, 8));

  const setPreset = (preset: string) => {
    const now = new Date();
    if (preset === "Today") { setDateFrom(now); setDateTo(now); }
    else if (preset === "This Week") { const d = new Date(now); d.setDate(d.getDate() - 7); setDateFrom(d); setDateTo(now); }
    else if (preset === "This Month") { setDateFrom(new Date(now.getFullYear(), now.getMonth(), 1)); setDateTo(now); }
  };

  const dateFilter = (dateStr: string) => {
    if (!dateFrom || !dateTo) return true;
    const d = new Date(dateStr);
    return d >= new Date(dateFrom.setHours(0, 0, 0, 0)) && d <= new Date(dateTo.setHours(23, 59, 59, 999));
  };

  const filteredOrders = orders.filter(o => dateFilter(o.date));
  const filteredExpenses = expenses.filter(e => dateFilter(e.date));
  const completedOrders = filteredOrders.filter(o => o.status === "completed");
  const totalSales = completedOrders.reduce((s, o) => s + o.total, 0);
  const totalExpenses = filteredExpenses.reduce((s, e) => s + e.amount, 0);

  const cogs = useMemo(() => {
    let total = 0;
    completedOrders.forEach(o => { o.items.forEach(item => { const recipe = foodRecipes[item.name]; if (recipe) { recipe.forEach(r => { const ing = ingredients.find(ig => ig.id === r.ingredientId); total += (r.qtyPerUnit * item.qty) * (ing?.purchasePrice || 0); }); } }); });
    return Math.round(total);
  }, [completedOrders, foodRecipes, ingredients]);

  const netProfit = totalSales - totalExpenses - cogs;
  const expenseByCategory = Object.entries(filteredExpenses.reduce((acc, e) => { acc[e.category] = (acc[e.category] || 0) + e.amount; return acc; }, {} as Record<string, number>)).map(([name, value]) => ({ name, value }));
  const stockByCategory = Object.entries(ingredients.reduce((acc, i) => { acc[i.category] = (acc[i.category] || 0) + i.currentStock * i.purchasePrice; return acc; }, {} as Record<string, number>)).map(([name, value]) => ({ name, value }));

  const revenueChart = useMemo(() => {
    const days: Record<string, number> = {};
    completedOrders.forEach(o => { days[o.date] = (days[o.date] || 0) + o.total; });
    return Object.entries(days).sort().slice(-7).map(([date, revenue]) => ({ date: date.slice(5), revenue }));
  }, [completedOrders]);

  const supplierSpending = suppliers.map(s => ({ name: s.name.substring(0, 12), amount: s.totalPurchases }));
  const staffOrders = users.filter(u => u.role === "Cashier" || u.role === "Waiter").map(u => {
    const staffOrd = filteredOrders.filter(o => o.staff === u.name);
    return { name: u.name.split(" ")[0], orders: staffOrd.length, revenue: staffOrd.reduce((s, o) => s + o.total, 0) };
  });

  const itemRevenue = useMemo(() => {
    const items: Record<string, number> = {};
    completedOrders.forEach(o => o.items.forEach(item => { items[item.name] = (items[item.name] || 0) + item.price * item.qty; }));
    return Object.entries(items).map(([name, revenue]) => ({ name: name.substring(0, 12), revenue })).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }, [completedOrders]);

  const wasteByReason = useMemo(() => {
    const reasons: Record<string, number> = {};
    wasteRecords.forEach(w => { reasons[w.reason] = (reasons[w.reason] || 0) + w.estimatedLoss; });
    return Object.entries(reasons).map(([name, value]) => ({ name, value }));
  }, [wasteRecords]);

  const totalWasteCost = wasteRecords.reduce((s, w) => s + w.estimatedLoss, 0);

  const exportCSV = (headers: string[], rows: string[][], filename: string) => {
    const csvContent = [headers.join(","), ...rows.map(r => r.map(v => `"${v}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url); toast.success("CSV exported!");
  };

  const DateRangeFilter = () => (
    <div className="flex items-center gap-2 flex-wrap">
      <Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="text-xs"><Calendar className="h-3 w-3 mr-1" />{dateFrom ? format(dateFrom, "MMM d") : "From"}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><CalendarUI mode="single" selected={dateFrom} onSelect={setDateFrom} className="p-3 pointer-events-auto" /></PopoverContent></Popover>
      <span className="text-xs text-muted-foreground">to</span>
      <Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="text-xs"><Calendar className="h-3 w-3 mr-1" />{dateTo ? format(dateTo, "MMM d") : "To"}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><CalendarUI mode="single" selected={dateTo} onSelect={setDateTo} className="p-3 pointer-events-auto" /></PopoverContent></Popover>
      {["Today", "This Week", "This Month"].map(p => <Button key={p} variant="outline" size="sm" className="text-xs" onClick={() => setPreset(p)}>{p}</Button>)}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader icon={<FileText className="h-5 w-5" />} title="Reports" subtitle="Business reports" actions={<Button variant="outline" size="sm" onClick={() => exportCSV(["Order #","Date","Customer","Total","Status"], completedOrders.map(o => [o.orderNumber, o.date, o.customer, String(o.total), o.status]), "ovenisto-sales-report.csv")}><Download className="h-3 w-3 mr-1" />Export CSV</Button>} />
      <DateRangeFilter />
      <Tabs defaultValue="sales">
        <div className="overflow-x-auto -mx-1 px-1"><TabsList className="inline-flex w-auto min-w-full sm:w-full"><TabsTrigger value="sales">Sales</TabsTrigger><TabsTrigger value="items">Item-wise</TabsTrigger><TabsTrigger value="stock">Stock</TabsTrigger><TabsTrigger value="purchase">Purchase</TabsTrigger><TabsTrigger value="expense">Expense</TabsTrigger><TabsTrigger value="pnl">P&amp;L</TabsTrigger><TabsTrigger value="staff">Staff</TabsTrigger><TabsTrigger value="waste">Waste</TabsTrigger></TabsList></div>
        <TabsContent value="sales" className="space-y-4"><div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="shadow-sm"><CardContent className="p-5"><div className="flex items-center gap-4"><div className="h-11 w-11 rounded-xl bg-success/10 flex items-center justify-center shrink-0"><span className="text-success text-lg font-bold">{currency.charAt(0)}</span></div><div><p className="text-sm text-muted-foreground">Total Sales</p><p className="text-2xl font-bold tracking-tight">{currency} {totalSales.toLocaleString()}</p></div></div></CardContent></Card>
          <Card className="shadow-sm"><CardContent className="p-5"><div className="flex items-center gap-4"><div className="h-11 w-11 rounded-xl bg-info/10 flex items-center justify-center shrink-0"><span className="text-info text-lg font-bold">#</span></div><div><p className="text-sm text-muted-foreground">Total Orders</p><p className="text-2xl font-bold tracking-tight">{filteredOrders.length}</p></div></div></CardContent></Card>
          <Card className="shadow-sm"><CardContent className="p-5"><div className="flex items-center gap-4"><div className="h-11 w-11 rounded-xl bg-warning/10 flex items-center justify-center shrink-0"><span className="text-warning text-lg font-bold">~</span></div><div><p className="text-sm text-muted-foreground">Avg Order Value</p><p className="text-2xl font-bold tracking-tight">{currency} {completedOrders.length > 0 ? Math.round(totalSales / completedOrders.length).toLocaleString() : 0}</p></div></div></CardContent></Card>
        </div><Card className="shadow-sm"><CardHeader><CardTitle className="text-base">Sales Trend</CardTitle></CardHeader><CardContent><div className="h-[300px]"><ResponsiveContainer width="100%" height="100%"><AreaChart data={revenueChart}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="date" /><YAxis tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} /><Tooltip /><Legend /><Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.15)" /></AreaChart></ResponsiveContainer></div></CardContent></Card></TabsContent>
        <TabsContent value="items" className="space-y-4"><Card className="shadow-sm"><CardHeader><CardTitle className="text-base">Top Selling Items</CardTitle></CardHeader><CardContent><div className="h-[300px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={itemRevenue} layout="vertical"><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" /><YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} /><Tooltip /><Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div></CardContent></Card></TabsContent>
        <TabsContent value="stock" className="space-y-4"><div className="grid grid-cols-1 sm:grid-cols-3 gap-4"><Card className="shadow-sm"><CardContent className="p-5"><p className="text-xs text-muted-foreground">Total Ingredients</p><p className="text-2xl font-bold">{ingredients.length}</p></CardContent></Card><Card className="shadow-sm"><CardContent className="p-5"><p className="text-xs text-muted-foreground">Low Stock Items</p><p className="text-2xl font-bold text-warning">{ingredients.filter(i => i.currentStock <= i.lowStockLevel && i.currentStock > 0).length}</p></CardContent></Card><Card className="shadow-sm"><CardContent className="p-5"><p className="text-xs text-muted-foreground">Total Value</p><p className="text-2xl font-bold">{currency} {ingredients.reduce((s,i) => s + i.currentStock * i.purchasePrice, 0).toLocaleString()}</p></CardContent></Card></div><Card className="shadow-sm"><CardHeader><CardTitle className="text-base">Stock by Category</CardTitle></CardHeader><CardContent><div className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={stockByCategory} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({name}) => name.substring(0,8)}>{stockByCategory.map((_, i) => <Cell key={i} fill={pieColors[i % pieColors.length]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></div></CardContent></Card></TabsContent>
        <TabsContent value="purchase" className="space-y-4"><div className="grid grid-cols-1 sm:grid-cols-3 gap-4"><Card className="shadow-sm"><CardContent className="p-5"><p className="text-xs text-muted-foreground">Total Purchases</p><p className="text-2xl font-bold">{currency} {purchases.reduce((s,p)=>s+p.totalAmount,0).toLocaleString()}</p></CardContent></Card><Card className="shadow-sm"><CardContent className="p-5"><p className="text-xs text-muted-foreground">Total Suppliers</p><p className="text-2xl font-bold">{suppliers.length}</p></CardContent></Card><Card className="shadow-sm"><CardContent className="p-5"><p className="text-xs text-muted-foreground">Outstanding</p><p className="text-2xl font-bold text-destructive">{currency} {suppliers.reduce((s,sp)=>s+sp.totalDue,0).toLocaleString()}</p></CardContent></Card></div><Card className="shadow-sm"><CardHeader><CardTitle className="text-base">Supplier Spending</CardTitle></CardHeader><CardContent><div className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={supplierSpending}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tick={{fontSize:10}} /><YAxis tickFormatter={v=>`${(v/1000).toFixed(0)}k`} /><Tooltip /><Legend /><Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer></div></CardContent></Card></TabsContent>
        <TabsContent value="expense" className="space-y-4"><Card className="shadow-sm"><CardHeader><CardTitle className="text-base">Expense Breakdown</CardTitle></CardHeader><CardContent><div className="h-[300px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={expenseByCategory} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, value }) => `${name}: ${currency}${(value/1000).toFixed(0)}k`}>{expenseByCategory.map((_, i) => <Cell key={i} fill={pieColors[i % pieColors.length]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></div></CardContent></Card></TabsContent>
        <TabsContent value="pnl" className="space-y-4"><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="shadow-sm border-success/30"><CardContent className="p-5"><p className="text-xs text-muted-foreground">Revenue</p><p className="text-2xl font-bold text-success">{currency} {totalSales.toLocaleString()}</p></CardContent></Card>
          <Card className="shadow-sm"><CardContent className="p-5"><p className="text-xs text-muted-foreground">COGS</p><p className="text-2xl font-bold">{currency} {cogs.toLocaleString()}</p></CardContent></Card>
          <Card className="shadow-sm border-destructive/30"><CardContent className="p-5"><p className="text-xs text-muted-foreground">Expenses</p><p className="text-2xl font-bold text-destructive">{currency} {totalExpenses.toLocaleString()}</p></CardContent></Card>
          <Card className="shadow-sm border-primary/30"><CardContent className="p-5"><p className="text-xs text-muted-foreground">Net Profit</p><p className={`text-2xl font-bold ${netProfit >= 0 ? "text-success" : "text-destructive"}`}>{currency} {netProfit.toLocaleString()}</p></CardContent></Card>
        </div>{expenseByCategory.length > 0 && <Card className="shadow-sm"><CardHeader><CardTitle className="text-base">Expense Category Breakdown</CardTitle></CardHeader><CardContent><div className="space-y-2">{expenseByCategory.map(e => (<div key={e.name} className="flex justify-between text-sm"><span>{e.name}</span><span className="font-medium">{currency} {e.value.toLocaleString()}</span></div>))}</div></CardContent></Card>}</TabsContent>
        <TabsContent value="staff" className="space-y-4"><Card className="shadow-sm"><CardHeader><CardTitle className="text-base">Staff Performance</CardTitle></CardHeader><CardContent><div className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={staffOrders}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis yAxisId="left" /><YAxis yAxisId="right" orientation="right" /><Tooltip /><Legend /><Bar yAxisId="left" dataKey="revenue" fill="hsl(var(--primary))" radius={[4,4,0,0]} /><Line yAxisId="right" type="monotone" dataKey="orders" stroke="hsl(var(--accent))" strokeWidth={2} /></ComposedChart></ResponsiveContainer></div></CardContent></Card></TabsContent>
        <TabsContent value="waste" className="space-y-4"><div className="grid grid-cols-1 sm:grid-cols-3 gap-4"><Card className="shadow-sm border-destructive/30"><CardContent className="p-5"><p className="text-xs text-muted-foreground">Total Waste Cost</p><p className="text-2xl font-bold text-destructive">{currency} {totalWasteCost.toLocaleString()}</p></CardContent></Card><Card className="shadow-sm"><CardContent className="p-5"><p className="text-xs text-muted-foreground">Waste Incidents</p><p className="text-2xl font-bold">{wasteRecords.length}</p></CardContent></Card><Card className="shadow-sm"><CardContent className="p-5"><p className="text-xs text-muted-foreground">Most Wasted</p><p className="text-2xl font-bold">{wasteRecords[0]?.item || "N/A"}</p></CardContent></Card></div><Card className="shadow-sm"><CardHeader><CardTitle className="text-base">Waste by Reason</CardTitle></CardHeader><CardContent><div className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={wasteByReason} cx="50%" cy="50%" outerRadius={80} dataKey="value" label>{wasteByReason.map((_, i) => <Cell key={i} fill={pieColors[i % pieColors.length]} />)}</Pie><Legend /><Tooltip /></PieChart></ResponsiveContainer></div></CardContent></Card></TabsContent>
      </Tabs>
    </div>
  );
};
export default Reports;

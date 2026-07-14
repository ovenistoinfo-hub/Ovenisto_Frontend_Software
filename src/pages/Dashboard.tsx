import { LayoutDashboard, TrendingUp, DollarSign, Wallet, ReceiptText, Flame, ArrowUpCircle, ArrowDownCircle, BarChart3, ShoppingBag, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";
import { XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { reportService } from "@/services/report.service";
import { stockService } from "@/services/stock.service";
import { useOutletFilter } from "@/hooks/useOutletFilter";
import { OutletFilterSelect } from "@/components/OutletFilterSelect";
import { useVisiblePolling } from "@/hooks/use-visible-polling";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

const Dashboard = () => {
  const { outletId, setOutletId, outlets, isSuperAdmin } = useOutletFilter();
  const { data: d, isLoading: loading } = useQuery({
    queryKey: ["dashboard", outletId],
    queryFn: () => reportService.getDashboard({ outletId }),
  });
  const currency = "Rs.";

  const { data: doughBatches = [], refetch: refetchDough } = useQuery({
    queryKey: ["dough-batches", outletId],
    queryFn: () => stockService.getDoughBatches({ outletId }),
  });
  useVisiblePolling(() => { refetchDough(); }, 30000);
  // 1-minute client tick so the countdown numbers update live without network calls
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 60000); return () => clearInterval(t); }, []);
  const liveMins = (expiresAt: string) => { const ms = new Date(expiresAt).getTime() - Date.now(); return ms <= 0 ? 0 : Math.floor(ms / 60000); };
  const fmtLeft = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m left`;
  const wasteBatch = async (id: string) => { await stockService.wasteDoughBatch(id); refetchDough(); };

  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4"><Skeleton className="lg:col-span-2 h-72" /><Skeleton className="h-72" /></div>
    </div>
  );

  const ch = (t: string) => d?.today.channels.find(c => c.type === t) ?? { sales: 0, orders: 0 };

  const pays = d?.month.paymentBreakdown ?? [];
  const maxPay = Math.max(1, ...pays.map(p => p.amount));

  return (
    <div className="space-y-6">
      {/* Header + Day-wise Sales */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 flex items-start justify-between gap-3 flex-wrap">
          <PageHeader
            icon={<LayoutDashboard className="h-5 w-5" />}
            title="Dashboard"
            subtitle={d?.branchName ?? "Welcome back, here's your overview"}
          />
          <OutletFilterSelect outletId={outletId} setOutletId={setOutletId} outlets={outlets} isSuperAdmin={isSuperAdmin} />
        </div>
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Day-wise Sales (This Week)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[140px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d?.daywiseSales ?? []} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => [`${currency} ${v.toLocaleString()}`, "Sales"]} />
                  <Bar dataKey="sales" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Today's Sales by Channel */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          Today's Sales by Channel
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Offline */}
          <Card className="shadow-sm border-success/20">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Total Offline Sale</p>
                  <p className="text-2xl font-bold mt-1">{currency} {(d?.today.offline.sales ?? 0).toLocaleString()}</p>
                  <span className="text-xs text-muted-foreground">{d?.today.offline.orders ?? 0} orders</span>
                </div>
                <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-success/10">
                  <ShoppingBag className="h-5 w-5 text-success" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Dine In */}
          <Card className="shadow-sm">
            <CardContent className="p-5">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Dine In</p>
                <p className="text-2xl font-bold mt-1">{currency} {ch("Dine In").sales.toLocaleString()}</p>
                <span className="text-xs text-muted-foreground">{ch("Dine In").orders} orders</span>
              </div>
            </CardContent>
          </Card>

          {/* Pick Up / Take Away */}
          <Card className="shadow-sm">
            <CardContent className="p-5">
              <div>
                <p className="text-xs text-muted-foreground font-medium">PickUp</p>
                <p className="text-2xl font-bold mt-1">{currency} {ch("Take Away").sales.toLocaleString()}</p>
                <span className="text-xs text-muted-foreground">{ch("Take Away").orders} orders</span>
              </div>
            </CardContent>
          </Card>

          {/* Delivery */}
          <Card className="shadow-sm">
            <CardContent className="p-5">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Delivery</p>
                <p className="text-2xl font-bold mt-1">{currency} {ch("Delivery").sales.toLocaleString()}</p>
                <span className="text-xs text-muted-foreground">{ch("Delivery").orders} orders</span>
              </div>
            </CardContent>
          </Card>

          {/* Total Online */}
          <Card className="shadow-sm border-info/20">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Total Online Sale</p>
                  <p className="text-2xl font-bold mt-1">{currency} {(d?.today.online.sales ?? 0).toLocaleString()}</p>
                  <span className="text-xs text-muted-foreground">{d?.today.online.orders ?? 0} orders</span>
                </div>
                <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-info/10">
                  <TrendingUp className="h-5 w-5 text-info" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Foodpanda */}
          <Card className="shadow-sm">
            <CardContent className="p-5">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Foodpanda</p>
                <p className="text-2xl font-bold mt-1">{currency} {ch("Foodpanda").sales.toLocaleString()}</p>
                <span className="text-xs text-muted-foreground">{ch("Foodpanda").orders} orders</span>
              </div>
            </CardContent>
          </Card>

          {/* Self Order */}
          <Card className="shadow-sm">
            <CardContent className="p-5">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Self Order</p>
                <p className="text-2xl font-bold mt-1">{currency} {ch("Self Order").sales.toLocaleString()}</p>
                <span className="text-xs text-muted-foreground">{ch("Self Order").orders} orders</span>
              </div>
            </CardContent>
          </Card>

          {/* Online */}
          <Card className="shadow-sm">
            <CardContent className="p-5">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Online</p>
                <p className="text-2xl font-bold mt-1">{currency} {ch("Online").sales.toLocaleString()}</p>
                <span className="text-xs text-muted-foreground">{ch("Online").orders} orders</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dough / Short-Life Batches */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Dough / Short-Life Batches
        </h3>
        <Card className="shadow-sm">
          <CardContent className="p-5">
            {doughBatches.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No active dough batches</p>
            ) : (
              <div>
                {doughBatches.map((b) => {
                  const m = liveMins(b.expiresAt);
                  const st = m <= 0 ? 'expired' : m <= 60 ? 'near-expiry' : 'active';
                  const colour = st === 'expired' ? 'text-destructive' : st === 'near-expiry' ? 'text-warning' : 'text-success';
                  return (
                    <div key={b.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div>
                        <p className="font-medium">{b.ingredientName}</p>
                        <p className="text-xs text-muted-foreground">{b.remainingQty} {b.unit ?? ''}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-sm font-semibold ${colour}`}>{st === 'expired' ? 'EXPIRED' : fmtLeft(m)}</span>
                        {st === 'expired' && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="destructive">Waste</Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Waste this batch?</AlertDialogTitle>
                                <AlertDialogDescription>{b.remainingQty} {b.unit ?? ''} of {b.ingredientName} will be removed from stock and recorded as waste.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => wasteBatch(b.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Waste</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payment Methods (This Month) */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
          <Wallet className="h-4 w-4" />
          Payment Methods (This Month)
        </h3>
        <Card className="shadow-sm">
          <CardContent className="p-5">
            {pays.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments this month</p>
            ) : (
              <div className="space-y-3">
                {pays.map(p => (
                  <div key={p.method} className="flex items-center gap-3">
                    <span className="text-xs font-medium w-24 shrink-0">{p.method}</span>
                    <div className="flex-1 bg-muted rounded h-2">
                      <div
                        className="h-2 rounded bg-primary"
                        style={{ width: `${(p.amount / maxPay) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold w-28 text-right">{currency} {p.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Growth vs Last Month */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Growth vs Last Month
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Online Growth", value: d?.month.growthOnlinePct ?? 0 },
            { label: "Offline Growth", value: d?.month.growthOfflinePct ?? 0 },
            { label: "Overall Growth", value: d?.month.overallGrowthPct ?? 0 },
          ].map(({ label, value }) => (
            <Card key={label} className="shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">{label}</p>
                    <p className={`text-2xl font-bold mt-1 ${value >= 0 ? "text-success" : "text-destructive"}`}>
                      {value >= 0 ? "+" : ""}{value}%
                    </p>
                  </div>
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${value >= 0 ? "bg-success/10" : "bg-destructive/10"}`}>
                    {value >= 0
                      ? <ArrowUpCircle className="h-5 w-5 text-success" />
                      : <ArrowDownCircle className="h-5 w-5 text-destructive" />
                    }
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Financial Overview (This Month) */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Financial Overview (This Month)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Gross Sale</p>
                  <p className="text-2xl font-bold mt-1">{currency} {(d?.month.grossSale ?? 0).toLocaleString()}</p>
                  <span className="text-xs text-muted-foreground">Discounts: {currency} {(d?.month.discounts ?? 0).toLocaleString()}</span>
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
                  <p className="text-2xl font-bold mt-1">{currency} {(d?.month.revenue ?? 0).toLocaleString()}</p>
                  <span className="text-xs text-muted-foreground">After discounts + tax</span>
                </div>
                <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-success/10">
                  <Wallet className="h-5 w-5 text-success" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-destructive/20">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Food Loss</p>
                  <p className="text-2xl font-bold mt-1 text-destructive">{currency} {(d?.month.foodLoss ?? 0).toLocaleString()}</p>
                  <span className="text-xs text-muted-foreground">Waste this month</span>
                </div>
                <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-destructive/10">
                  <Flame className="h-5 w-5 text-destructive" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Net Profit</p>
                  <p className={`text-2xl font-bold mt-1 ${(d?.month.netProfit ?? 0) >= 0 ? "text-success" : "text-destructive"}`}>
                    {currency} {(d?.month.netProfit ?? 0).toLocaleString()}
                  </p>
                  <span className="text-xs text-muted-foreground">Revenue − Expenses − Loss</span>
                </div>
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${(d?.month.netProfit ?? 0) >= 0 ? "bg-success/10" : "bg-destructive/10"}`}>
                  <TrendingUp className={`h-5 w-5 ${(d?.month.netProfit ?? 0) >= 0 ? "text-success" : "text-destructive"}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Payable & Receivable */}
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
                  <p className="text-2xl font-bold mt-1 text-warning">{currency} {(d?.payable ?? 0).toLocaleString()}</p>
                  <span className="text-xs text-muted-foreground">Outstanding to suppliers</span>
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
                  <p className="text-2xl font-bold mt-1 text-info">{currency} {(d?.receivable ?? 0).toLocaleString()}</p>
                  <span className="text-xs text-muted-foreground">Outstanding from customers</span>
                </div>
                <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-info/10">
                  <ArrowDownCircle className="h-5 w-5 text-info" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Top 10 Best-Selling Items */}
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
                  {(d?.topItems ?? []).map((item, idx) => (
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

      {/* Top 10 Customers */}
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
                  {(d?.topCustomers ?? []).map((customer, idx) => (
                    <TableRow key={idx} className="border-b last:border-0">
                      <TableCell className="py-3 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-muted-foreground w-5">{idx + 1}.</span>
                          <span className="font-medium">{customer.name}</span>
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
    </div>
  );
};

export default Dashboard;

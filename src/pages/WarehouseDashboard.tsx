import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Package, TrendingUp, TrendingDown, ArrowUpDown, ShoppingBag,
  ClipboardList, ArrowLeftRight, AlertTriangle, CheckCircle2,
  Clock, RefreshCw, DollarSign, Truck, Layers, BarChart3
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";
import { warehouseDashboardService } from "@/services/warehouseDashboard.service";
import { cn } from "@/lib/utils";

const fmt = (n: number) =>
  n >= 1_000_000 ? `Rs. ${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000 ? `Rs. ${(n / 1_000).toFixed(1)}K`
  : `Rs. ${n.toFixed(0)}`;

const fmtNum = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K`
  : `${n}`;

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "default",
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: "default" | "success" | "warning" | "destructive" | "info";
}) {
  const colorMap = {
    default: "text-foreground",
    success: "text-emerald-600 dark:text-emerald-400",
    warning: "text-amber-600 dark:text-amber-400",
    destructive: "text-red-600 dark:text-red-400",
    info: "text-blue-600 dark:text-blue-400",
  };
  const bgMap = {
    default: "bg-muted/40",
    success: "bg-emerald-50 dark:bg-emerald-950/30",
    warning: "bg-amber-50 dark:bg-amber-950/30",
    destructive: "bg-red-50 dark:bg-red-950/30",
    info: "bg-blue-50 dark:bg-blue-950/30",
  };

  return (
    <div className={cn("flex items-start gap-3 p-3 rounded-lg border", bgMap[color])}>
      <div className={cn("p-2 rounded-lg bg-white dark:bg-black/20 shadow-sm shrink-0", colorMap[color])}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground leading-tight">{label}</p>
        <p className={cn("text-base font-bold leading-tight mt-0.5", colorMap[color])}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const TYPE_BADGE: Record<string, string> = {
  INBOUND: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  OUTBOUND: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  RECEIVED: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
};

export default function WarehouseDashboard() {
  const [warehouseId, setWarehouseId] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filters, setFilters] = useState<{
    warehouseId: string; startDate?: string; endDate?: string;
  }>({ warehouseId: "all" });

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["warehouse-dashboard", filters],
    queryFn: () =>
      warehouseDashboardService.getStats({
        warehouseId: filters.warehouseId !== "all" ? filters.warehouseId : undefined,
        startDate: filters.startDate,
        endDate: filters.endDate,
      }),
  });

  const applyFilters = () =>
    setFilters({ warehouseId, startDate: startDate || undefined, endDate: endDate || undefined });

  const d = data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Warehouse Management"
        description="Real-time insights into inventory, procurement, and stock distribution"
      />

      {/* ── Filters Bar ── */}
      <Card className="shadow-sm">
        <CardContent className="py-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Warehouse</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger className="h-9 w-[200px]">
                  <SelectValue placeholder="All Warehouses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Warehouses</SelectItem>
                  {d?.activeWarehouses.map(w => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">From Date</Label>
              <Input type="date" className="h-9 w-[160px]" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To Date</Label>
              <Input type="date" className="h-9 w-[160px]" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
            <Button className="gradient-primary text-primary-foreground h-9" onClick={applyFilters}>
              Apply
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Hero KPI strip ── */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="shadow-sm border-l-4 border-l-emerald-500 p-4 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Layers className="h-3.5 w-3.5" /> Inventory Value
            </div>
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{fmt(d?.inventoryValue ?? 0)}</p>
            <p className="text-xs text-muted-foreground">{fmtNum(d?.costingTable.length ?? 0)} items tracked</p>
          </Card>
          <Card className="shadow-sm border-l-4 border-l-blue-500 p-4 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <ShoppingBag className="h-3.5 w-3.5" /> Total Procurement
            </div>
            <p className="text-2xl font-black text-blue-600 dark:text-blue-400">{fmt(d?.procurement.procurementCost ?? 0)}</p>
            <p className="text-xs text-muted-foreground">{d?.procurement.totalOrders ?? 0} purchase orders</p>
          </Card>
          <Card className="shadow-sm border-l-4 border-l-amber-500 p-4 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <ClipboardList className="h-3.5 w-3.5" /> Active Demands
            </div>
            <p className="text-2xl font-black text-amber-600 dark:text-amber-400">{d?.distribution.pendingDemands ?? 0}</p>
            <p className="text-xs text-muted-foreground">{d?.distribution.totalDemands ?? 0} total demands</p>
          </Card>
          <Card className="shadow-sm border-l-4 border-l-purple-500 p-4 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Truck className="h-3.5 w-3.5" /> Stock in Transit
            </div>
            <p className="text-2xl font-black text-purple-600 dark:text-purple-400">{d?.distribution.dispatchedChallans ?? 0}</p>
            <p className="text-xs text-muted-foreground">{d?.distribution.totalChallans ?? 0} total challans</p>
          </Card>
        </div>
      )}

      {/* ── Double Column: Procurement vs Distribution ── */}
      {isLoading ? (
        <div className="grid md:grid-cols-2 gap-4">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Purchase Orders */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-blue-500" />
                Purchase Orders
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              <StatCard icon={BarChart3} label="Total Orders" value={d?.procurement.totalOrders ?? 0} color="info" />
              <StatCard icon={DollarSign} label="Procurement Cost" value={fmt(d?.procurement.procurementCost ?? 0)} color="info" />
              <StatCard icon={TrendingUp} label="Avg. Procurement Value" value={fmt(d?.procurement.avgValue ?? 0)} />
              <StatCard icon={CheckCircle2} label="Vendor Payments" value={fmt(d?.procurement.payments ?? 0)} color="success" />
              <StatCard icon={AlertTriangle} label="Unpaid to Vendors" value={fmt(d?.procurement.unpaid ?? 0)} color={d?.procurement.unpaid ? "destructive" : "default"} />
              <StatCard icon={DollarSign} label="GST on Purchases" value={fmt(d?.procurement.gst ?? 0)} />
              <StatCard icon={Clock} label="Pending Requests" value={d?.procurement.pendingRequests ?? 0} color={d?.procurement.pendingRequests ? "warning" : "default"} />
              <StatCard icon={CheckCircle2} label="Approved Requests" value={d?.procurement.approvedRequests ?? 0} color="success" />
            </CardContent>
          </Card>

          {/* Demands & Challans / Distribution */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4 text-purple-500" />
                Stock Distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              <StatCard icon={ClipboardList} label="Total Demands" value={d?.distribution.totalDemands ?? 0} color="info" />
              <StatCard icon={CheckCircle2} label="Fulfilled Demands" value={d?.distribution.fulfilledDemands ?? 0} color="success" />
              <StatCard icon={Clock} label="Pending Demands" value={d?.distribution.pendingDemands ?? 0} color={d?.distribution.pendingDemands ? "warning" : "default"} />
              <StatCard icon={Truck} label="Dispatched Challans" value={d?.distribution.dispatchedChallans ?? 0} color="info" />
              <StatCard icon={Package} label="Received Challans" value={d?.distribution.receivedChallans ?? 0} color="success" />
              <StatCard icon={TrendingDown} label="Stock Outflow Value" value={fmt(d?.distribution.outflowValue ?? 0)} color="warning" />
              <StatCard icon={DollarSign} label="Shipping Costs" value={fmt(d?.distribution.shippingCosts ?? 0)} />
              <StatCard icon={ArrowUpDown} label="Total Challans" value={d?.distribution.totalChallans ?? 0} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Stock Costing Table ── */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Layers className="h-4 w-4 text-emerald-500" />
            Stock Costing Table
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-9 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Item</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Stock Qty</TableHead>
                    <TableHead className="text-right">Low Level</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Total Value</TableHead>
                    <TableHead>Vendor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(d?.costingTable ?? []).length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No stock data available</TableCell></TableRow>
                  ) : (
                    (d?.costingTable ?? []).map(item => (
                      <TableRow key={item.ingredientId} className={cn(item.currentStock <= item.lowStockLevel && item.currentStock > 0 && "bg-amber-50 dark:bg-amber-950/20")}>
                        <TableCell className="font-medium text-sm">{item.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{item.category}</TableCell>
                        <TableCell className="text-right text-sm">
                          <span className={cn(item.currentStock <= item.lowStockLevel ? "text-amber-600 font-semibold" : "")}>
                            {item.currentStock}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">{item.lowStockLevel}</TableCell>
                        <TableCell className="text-right text-sm">Rs. {item.unitPrice.toFixed(2)}</TableCell>
                        <TableCell className="text-right text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                          {fmt(item.totalValue)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{item.vendorName}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Recent Transactions ── */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-blue-500" />
            Recent Stock Transactions
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-9 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(d?.recentTransactions ?? []).length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No recent transactions</TableCell></TableRow>
                  ) : (
                    (d?.recentTransactions ?? []).map((tx, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(tx.date).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" })}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("text-[10px] px-1.5 py-0", TYPE_BADGE[tx.type] ?? "")}>
                            {tx.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{tx.module}</TableCell>
                        <TableCell className="text-xs max-w-[260px] truncate" title={tx.description}>{tx.description}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate" title={tx.target}>{tx.target}</TableCell>
                        <TableCell className="text-right text-xs font-semibold">
                          <span className={cn(tx.type === "INBOUND" ? "text-emerald-600" : "text-red-500")}>
                            {tx.type === "INBOUND" ? "+" : "−"}{fmt(tx.value)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

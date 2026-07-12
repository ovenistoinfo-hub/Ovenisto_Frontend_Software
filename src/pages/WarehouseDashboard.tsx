import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ShoppingBag, AlertTriangle, CheckCircle2, TrendingUp,
  RefreshCw, DollarSign, Layers, BarChart3,
  Wallet, HandCoins, Trash2, PackageCheck,
  ClipboardList, Truck, Package, ArrowLeftRight, Clock, TrendingDown, ArrowUpDown
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
              <Select value={warehouseId} onValueChange={(val) => {
                setWarehouseId(val);
                setFilters(p => ({ ...p, warehouseId: val }));
              }}>
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
              <Input type="date" className="h-9 w-[160px]" value={startDate} onChange={e => {
                const val = e.target.value;
                setStartDate(val);
                setFilters(p => ({ ...p, startDate: val || undefined }));
              }} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To Date</Label>
              <Input type="date" className="h-9 w-[160px]" value={endDate} onChange={e => {
                const val = e.target.value;
                setEndDate(val);
                setFilters(p => ({ ...p, endDate: val || undefined }));
              }} />
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Hero KPI strip: Stock Value / Payable / Receivable / Waste ── */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="shadow-sm border-l-4 border-l-emerald-500 p-4 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <Layers className="h-3.5 w-3.5 text-emerald-500" /> Stock Value
            </div>
            <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">{fmt(d?.inventoryValue ?? 0)}</p>
            <p className="text-[11px] text-muted-foreground truncate">{d?.costingTable.length ?? 0} items tracked</p>
          </Card>
          <Card className="shadow-sm border-l-4 border-l-red-500 p-4 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <Wallet className="h-3.5 w-3.5 text-red-500" /> Payable
            </div>
            <p className="text-xl font-black text-red-600 dark:text-red-400">{fmt(d?.payable ?? 0)}</p>
            <p className="text-[11px] text-muted-foreground truncate">{d?.procurement.unpaidCount ?? 0} purchase orders</p>
          </Card>
          <Card className="shadow-sm border-l-4 border-l-blue-500 p-4 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <HandCoins className="h-3.5 w-3.5 text-blue-500" /> Receivable
            </div>
            <p className="text-xl font-black text-blue-600 dark:text-blue-400">{fmt(d?.receivable ?? 0)}</p>
            <p className="text-[11px] text-muted-foreground truncate">{d?.receivableOutletsOwing ?? 0} outlets owing</p>
          </Card>
          <Card className="shadow-sm border-l-4 border-l-purple-500 p-4 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <Trash2 className="h-3.5 w-3.5 text-purple-500" /> Waste
            </div>
            <p className="text-xl font-black text-purple-600 dark:text-purple-400">{fmt(d?.waste ?? 0)}</p>
            <p className="text-[11px] text-muted-foreground truncate">{d?.wasteCount ?? 0} waste entries</p>
          </Card>
        </div>
      )}

      {/* ── Double Column: Purchase Orders vs Invoices ── */}
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
              <StatCard icon={DollarSign} label="Inventory Procurement Cost" value={fmt(d?.procurement.procurementCost ?? 0)} color="info" />
              <StatCard icon={AlertTriangle} label={`Unpaid to Vendors (${d?.procurement.unpaidCount ?? 0})`} value={fmt(d?.procurement.unpaid ?? 0)} color={d?.procurement.unpaid ? "destructive" : "default"} />
              <StatCard icon={CheckCircle2} label="Vendor Payments" value={fmt(d?.procurement.payments ?? 0)} color="success" />
              <StatCard icon={TrendingUp} label="Discount on Purchases" value={fmt(d?.procurement.discount ?? 0)} />
              <StatCard icon={DollarSign} label="GST on Purchases" value={fmt(d?.procurement.gst ?? 0)} />
              <StatCard icon={AlertTriangle} label={`Stock Received - Unpaid (${d?.procurement.stockReceivedUnpaidCount ?? 0})`} value={fmt(d?.procurement.stockReceivedUnpaid ?? 0)} color={d?.procurement.stockReceivedUnpaid ? "warning" : "default"} />
              <StatCard icon={PackageCheck} label={`Stock Received - Paid (${d?.procurement.stockReceivedPaidCount ?? 0})`} value={fmt(d?.procurement.stockReceivedPaid ?? 0)} color="success" />
            </CardContent>
          </Card>

          {/* Stock Distribution — demands & transfers out of this warehouse */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4 text-purple-500" />
                Stock Distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              <StatCard icon={ClipboardList} label="Total Demands" value={d?.distribution?.totalDemands ?? 0} color="info" />
              <StatCard icon={Clock} label="Pending Demands" value={d?.distribution?.pendingDemands ?? 0} color={d?.distribution?.pendingDemands ? "warning" : "default"} />
              <StatCard icon={CheckCircle2} label="Fulfilled Demands" value={d?.distribution?.fulfilledDemands ?? 0} color="success" />
              <StatCard icon={ArrowUpDown} label="Total Challans" value={d?.distribution?.totalChallans ?? 0} color="info" />
              <StatCard icon={Truck} label="Dispatched (in transit)" value={d?.distribution?.dispatchedChallans ?? 0} color={d?.distribution?.dispatchedChallans ? "warning" : "default"} />
              <StatCard icon={Package} label="Received Challans" value={d?.distribution?.receivedChallans ?? 0} color="success" />
              <StatCard icon={TrendingDown} label="Stock Outflow Value" value={fmt(d?.distribution?.outflowValue ?? 0)} color="warning" />
              <StatCard icon={DollarSign} label="Shipping Costs" value={fmt(d?.distribution?.shippingCosts ?? 0)} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

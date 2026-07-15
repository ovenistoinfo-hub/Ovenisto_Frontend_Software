import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ShoppingBag, AlertTriangle, CheckCircle2, TrendingUp,
  RefreshCw, DollarSign, Layers, BarChart3,
  Wallet, HandCoins, Trash2, PackageCheck,
  ClipboardList, Truck, Package, ArrowLeftRight, Clock, TrendingDown, ArrowUpDown, FileText
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { warehouseDashboardService } from "@/services/warehouseDashboard.service";
import { useAuth } from "@/contexts/AuthContext";
import { useOutletFilter } from "@/hooks/useOutletFilter";
import { OutletFilterSelect } from "@/components/OutletFilterSelect";
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
  const { user } = useAuth();
  // The Receivable card is the CENTRAL store's ledger (what every branch owes Main), so
  // it is Super-Admin-only. The backend already returns 0 for everyone else — this just
  // avoids showing them a meaningless "Rs. 0 / 0 outlets owing" tile.
  const isSuperAdmin = user?.role === "Super Admin";
  const { outlets, isSuperAdmin: isSuperAdminFilter } = useOutletFilter();

  const [localOutletId, setLocalOutletId] = useState(() => localStorage.getItem("wh_dashboard_selected_outlet_id") || "all");
  const [warehouseId, setWarehouseId] = useState(() => localStorage.getItem("wh_dashboard_selected_id") || "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filters, setFilters] = useState<{
    warehouseId: string; startDate?: string; endDate?: string;
  }>(() => ({
    warehouseId: localStorage.getItem("wh_dashboard_selected_id") || "",
    startDate: undefined,
    endDate: undefined,
  }));

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["warehouse-dashboard", warehouseId, filters],
    queryFn: () =>
      warehouseDashboardService.getStats({
        warehouseId: filters.warehouseId || undefined,
        startDate: filters.startDate,
        endDate: filters.endDate,
        bypassGlobalOutlet: isSuperAdminFilter,
      }),
  });

  const d = data;

  // Handle Auto-Defaults on first load or when warehouseId is unset
  useEffect(() => {
    if (d?.activeWarehouses && d.activeWarehouses.length > 0 && !warehouseId) {
      let defId = "";
      if (isSuperAdminFilter) {
        defId = d.activeWarehouses.find(w => w.type === 'MAIN')?.id || d.activeWarehouses[0].id;
      } else if (user?.role === 'Kitchen Manager') {
        defId = d.activeWarehouses.find(w => w.type === 'KITCHEN')?.id || d.activeWarehouses[0].id;
      } else if (user?.role === 'Store Manager') {
        defId = d.activeWarehouses.find(w => w.type === 'BRANCH')?.id || d.activeWarehouses[0].id;
      } else {
        defId = d.activeWarehouses.find(w => w.type === 'BRANCH')?.id || d.activeWarehouses.find(w => w.type === 'KITCHEN')?.id || d.activeWarehouses[0].id;
      }

      if (defId) {
        setWarehouseId(defId);
        setFilters(p => ({ ...p, warehouseId: defId }));
        localStorage.setItem("wh_dashboard_selected_id", defId);
      }
    }
  }, [d, warehouseId, user?.role, isSuperAdminFilter]);

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
            {isSuperAdminFilter && (
              <div className="space-y-1">
                <Label className="text-xs">Outlet</Label>
                <OutletFilterSelect 
                  outletId={localOutletId} 
                  setOutletId={(id) => {
                    setLocalOutletId(id);
                    localStorage.setItem("wh_dashboard_selected_outlet_id", id);
                  }} 
                  outlets={outlets} 
                  isSuperAdmin={isSuperAdminFilter} 
                />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Warehouse</Label>
              <Select 
                value={warehouseId} 
                onValueChange={(val) => {
                  setWarehouseId(val);
                  setFilters(p => ({ ...p, warehouseId: val }));
                  localStorage.setItem("wh_dashboard_selected_id", val);
                }}
              >
                <SelectTrigger className="h-9 w-[200px]">
                  <SelectValue placeholder="Select Warehouse..." />
                </SelectTrigger>
                <SelectContent>
                  {(d?.activeWarehouses ?? [])
                    .filter(w => localOutletId === "all" || w.outletId === localOutletId)
                    .map(w => (
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
              {isSuperAdminFilter && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-9 px-3"
                  onClick={() => {
                    setLocalOutletId("all");
                    localStorage.setItem("wh_dashboard_selected_outlet_id", "all");
                    const mainWh = (d?.activeWarehouses ?? []).find(w => w.type === 'MAIN');
                    if (mainWh) {
                      setWarehouseId(mainWh.id);
                      setFilters(p => ({ ...p, warehouseId: mainWh.id }));
                      localStorage.setItem("wh_dashboard_selected_id", mainWh.id);
                    }
                  }}
                >
                  Clear Filter
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Hero KPI strip: Stock Value / Payable / Receivable (Super Admin) / Waste ── */}
      {isLoading ? (
        <div className={cn("grid grid-cols-2 gap-3", isSuperAdmin ? "sm:grid-cols-4" : "sm:grid-cols-3")}>
          {(isSuperAdmin ? [1,2,3,4] : [1,2,3]).map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        (() => {
          const selectedWH = (d?.activeWarehouses ?? []).find(w => w.id === warehouseId);
          const warehouseType = selectedWH?.type || (isSuperAdminFilter ? 'MAIN' : 'BRANCH');

          const showPayable = warehouseType === 'MAIN' || warehouseType === 'BRANCH';
          const showReceivable = warehouseType === 'MAIN';
          const showProcurement = warehouseType === 'MAIN' || warehouseType === 'BRANCH';
          const showDistribution = warehouseType === 'MAIN' || warehouseType === 'BRANCH';
          const showDemands = true; // Demands are relevant to all (MAIN handles incoming, KITCHEN handles outgoing, BRANCH handles both)

          const demandsLabel = warehouseType === 'MAIN' ? 'Incoming Demands' 
                             : warehouseType === 'KITCHEN' ? 'Outgoing Demands' 
                             : 'Demands Log';

          const kpiCount = 2 + (showPayable ? 1 : 0) + (showReceivable ? 1 : 0);

          return (
            <div className="space-y-6">
              {/* KPI Cards */}
              <div className={cn("grid grid-cols-2 gap-3", 
                kpiCount === 4 ? "sm:grid-cols-4" : 
                kpiCount === 3 ? "sm:grid-cols-3" : 
                "sm:grid-cols-2"
              )}>
                <Card className="shadow-sm border-l-4 border-l-emerald-500 p-4 flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
                    <Layers className="h-3.5 w-3.5 text-emerald-500" /> Stock Value
                  </div>
                  <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">{fmt(d?.inventoryValue ?? 0)}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{d?.costingTable.length ?? 0} items tracked</p>
                </Card>

                {showPayable && (
                  <Card className="shadow-sm border-l-4 border-l-red-500 p-4 flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
                      <Wallet className="h-3.5 w-3.5 text-red-500" /> Payable
                    </div>
                    <p className="text-xl font-black text-red-600 dark:text-red-400">{fmt(d?.payable ?? 0)}</p>
                  </Card>
                )}

                {showReceivable && (
                  <Card className="shadow-sm border-l-4 border-l-blue-500 p-4 flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
                      <HandCoins className="h-3.5 w-3.5 text-blue-500" /> Receivable
                    </div>
                    <p className="text-xl font-black text-blue-600 dark:text-blue-400">{fmt(d?.receivable ?? 0)}</p>
                  </Card>
                )}

                <Card className="shadow-sm border-l-4 border-l-purple-500 p-4 flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
                    <Trash2 className="h-3.5 w-3.5 text-purple-500" /> Waste
                  </div>
                  <p className="text-xl font-black text-purple-600 dark:text-purple-400">{fmt(d?.waste ?? 0)}</p>
                </Card>
              </div>

              {/* Detail Stats Sections */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* 1. Purchase Orders (Procurement) */}
                {showProcurement && (
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
                      <StatCard icon={AlertTriangle} label={`Unpaid to Vendors (${d?.procurement.unpaidCount ?? 0})`} value={fmt(d?.procurement.unpaid ?? 0)} color={d?.procurement.unpaid ? "destructive" : "default"} />
                      <StatCard icon={CheckCircle2} label="Vendor Payments" value={fmt(d?.procurement.payments ?? 0)} color="success" />
                      <StatCard icon={TrendingUp} label="Discount on Purchases" value={fmt(d?.procurement.discount ?? 0)} />
                      <StatCard icon={DollarSign} label="GST on Purchases" value={fmt(d?.procurement.gst ?? 0)} />
                      <StatCard icon={AlertTriangle} label={`Stock Received - Unpaid (${d?.procurement.stockReceivedUnpaidCount ?? 0})`} value={fmt(d?.procurement.stockReceivedUnpaid ?? 0)} color={d?.procurement.stockReceivedUnpaid ? "warning" : "default"} />
                      <StatCard icon={PackageCheck} label={`Stock Received - Paid (${d?.procurement.stockReceivedPaidCount ?? 0})`} value={fmt(d?.procurement.stockReceivedPaid ?? 0)} color="success" />
                    </CardContent>
                  </Card>
                )}

                {/* 2. Invoices (Distribution / Outflow) */}
                {showDistribution && (
                  <Card className="shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <FileText className="h-4 w-4 text-emerald-500" />
                        Invoices
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-2">
                      <StatCard icon={ArrowUpDown} label="Total Invoices" value={d?.distribution?.totalChallans ?? 0} color="info" />
                      <StatCard icon={DollarSign} label="Warehouse Revenue" value={fmt(d?.distribution?.outflowValue ?? 0)} color="success" />
                      <StatCard icon={TrendingUp} label="Avg. Sale Value" value={fmt(d?.distribution?.totalChallans ? (d.distribution.outflowValue / d.distribution.totalChallans) : 0)} color="info" />
                      <StatCard icon={CheckCircle2} label="Customer Collections" value={fmt(d?.distribution?.totalPaid ?? 0)} color="success" />
                      <StatCard icon={Clock} label="Pending Delivery" value={d?.distribution?.pendingChallans ?? 0} color={d?.distribution?.pendingChallans ? "warning" : "default"} />
                      <StatCard icon={Truck} label="Delivered - Unpaid" value={d?.distribution?.dispatchedChallans ?? 0} color={d?.distribution?.dispatchedChallans ? "warning" : "default"} />
                      <StatCard icon={PackageCheck} label="Delivered - Paid" value={d?.distribution?.receivedChallans ?? 0} color="success" />
                    </CardContent>
                  </Card>
                )}

                {/* 3. Stock Demands (Inbound/Outbound requests) */}
                {showDemands && (
                  <Card className={cn("shadow-sm", !showProcurement && !showDistribution ? "col-span-1 md:col-span-2 lg:col-span-3" : "")}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <ClipboardList className="h-4 w-4 text-purple-500" />
                        {demandsLabel}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-2">
                      <StatCard icon={BarChart3} label="Total Demands" value={d?.distribution?.totalDemands ?? 0} color="info" />
                      <StatCard icon={Clock} label="Pending Demands" value={d?.distribution?.pendingDemands ?? 0} color={d?.distribution?.pendingDemands ? "warning" : "default"} />
                      <StatCard icon={CheckCircle2} label="Fulfilled Demands" value={d?.distribution?.fulfilledDemands ?? 0} color="success" />
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
}

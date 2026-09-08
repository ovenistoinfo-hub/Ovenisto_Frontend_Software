import {
  LayoutDashboard, TrendingUp, DollarSign, Wallet, ReceiptText, Flame, ArrowUpCircle, ArrowDownCircle,
  BarChart3, ShoppingBag, Clock, ChevronRight, Trophy, Users, ChefHat, LayoutGrid, Ban, Package,
  ClipboardList, ArrowLeftRight, UserCheck, CalendarOff, Bike, CalendarCheck, Coins, Calendar as CalendarIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";
import { XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { format } from "date-fns";
import { reportService } from "@/services/report.service";
import { stockService } from "@/services/stock.service";
import { useOutletFilter } from "@/hooks/useOutletFilter";
import { OutletFilterSelect } from "@/components/OutletFilterSelect";
import { useVisiblePolling } from "@/hooks/use-visible-polling";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { DASHBOARD_TILES } from "@/lib/dashboardTiles";

/**
 * Whole-Card tap target, mirroring POS.tsx's menu-card hover/press classes so it feels
 * right on mouse and the POS tablet. `interactive` false renders a plain, static Card —
 * no chevron, no hover lift (a viewer who can't reach the destination just sees the data).
 */
function ClickableCard({ interactive, onClick, className, children }: { interactive: boolean; onClick?: () => void; className?: string; children: ReactNode }) {
  return (
    <Card
      className={cn(
        "shadow-sm relative transition-all duration-200",
        interactive && "cursor-pointer hover:shadow-xl hover:border-primary/40 hover:-translate-y-0.5 active:scale-[0.99]",
        className
      )}
      onClick={interactive ? onClick : undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); } } : undefined}
    >
      {children}
      {interactive && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 absolute top-2 right-2" />}
    </Card>
  );
}

/**
 * One operational-zone stat card (Phase 4). `visible` is the tile's own permission check —
 * returning null here (rather than the caller skipping the JSX) keeps every zone's tile
 * list declarative and uniform. Icon box always stays neutral (`bg-muted`) — only
 * `valueClassName` may color the number itself, for the handful of tiles that represent an
 * actual problem count (non-zero low stock / pending approvals).
 */
function StatTile({
  visible, interactive, onClick, icon: Icon, title, value, valueClassName, sub,
}: {
  visible: boolean;
  interactive: boolean;
  onClick?: () => void;
  icon: LucideIcon;
  title: string;
  value: ReactNode;
  valueClassName?: string;
  sub?: ReactNode;
}) {
  if (!visible) return null;
  return (
    <ClickableCard interactive={interactive} onClick={onClick}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground font-medium">{title}</p>
            <p className={cn("text-2xl font-bold mt-1", valueClassName)}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-muted shrink-0">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </ClickableCard>
  );
}

/**
 * Themed Recharts tooltip — matches the app's popover surface. Lists every series in the
 * hovered point (`name: value`). Peak Hours / Day-of-Week keep their own bespoke tooltips
 * because they surface a field that isn't a rendered bar; the stacked charts use this.
 */
function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string }[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-sm">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-muted-foreground flex items-center gap-1.5">
          {p.color && <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: p.color }} />}
          {p.name}: {typeof p.value === "number" ? p.value.toLocaleString() : p.value}
        </p>
      ))}
    </div>
  );
}

const Dashboard = () => {
  const { outletId, setOutletId, outlets, isSuperAdmin } = useOutletFilter();
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const { data: d, isLoading: loading } = useQuery({
    queryKey: ["dashboard", outletId],
    queryFn: () => reportService.getDashboard({ outletId }),
  });
  const currency = "Rs.";

  // All tiles this viewer can actually reach — filtered once, same idiom AppSidebar.tsx
  // uses for navSections. The always-on cards below (day-wise chart, channel cards,
  // financial overview, Customer Intelligence's charts) aren't tiles; they're gated
  // separately by their own permission check (salesDrillEnabled / customerIntelVisible).
  const visibleTiles = DASHBOARD_TILES.filter((t) => hasPermission(t.module));
  const tileVisible = (id: string) => visibleTiles.some((t) => t.id === id);
  // Today's Operations / Inventory / People / Delivery / Reservations / Cash Hub are 100%
  // tile-driven (unlike Sales & Finance / Customer Intelligence, which mix tiles with
  // always-on charts) — a zone header renders only if at least one of its tiles is visible,
  // the same skip-empty-group idiom AppSidebar.tsx uses for navSections.
  const zoneVisible = (zone: string) => visibleTiles.some((t) => t.zone === zone);
  const goToTile = (id: string) => {
    const tile = visibleTiles.find((t) => t.id === id);
    if (!tile) return;
    if (tile.superAdminRoute && user?.role === "Super Admin") navigate(tile.superAdminRoute.route);
    else navigate(tile.route);
  };
  const salesDrillEnabled = hasPermission("sales");
  const goToSales = () => navigate("/sales");
  // Customer Intelligence is the merged-in Analytics page — keep its pre-merge audience
  // (Analytics was gated on "analytics", held only by Manager + the wildcard roles).
  // "reports" is the natural successor and maps to the exact same set; Floor Manager /
  // Cashier never had the Analytics page, so they don't get this zone.
  const customerIntelVisible = hasPermission("reports");

  // Sales By Channel (Date & optional Time filtered, gated on "reports" permission)
  const salesByChannelVisible = hasPermission("reports");
  const [channelPreset, setChannelPreset] = useState<string>("Today");
  const [channelDateFrom, setChannelDateFrom] = useState<Date | undefined>(new Date());
  const [channelDateTo, setChannelDateTo] = useState<Date | undefined>(new Date());
  const [channelTimeFrom, setChannelTimeFrom] = useState<string>("");
  const [channelTimeTo, setChannelTimeTo] = useState<string>("");

  const setPreset = (preset: string) => {
    setChannelPreset(preset);
    const now = new Date();
    if (preset === "Today") {
      setChannelDateFrom(now);
      setChannelDateTo(now);
    } else if (preset === "This Week") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      setChannelDateFrom(d);
      setChannelDateTo(now);
    } else if (preset === "This Month") {
      setChannelDateFrom(new Date(now.getFullYear(), now.getMonth(), 1));
      setChannelDateTo(now);
    }
  };

  const channelFromStr = (channelDateFrom ?? new Date()).toISOString().slice(0, 10);
  const channelToStr = (channelDateTo ?? new Date()).toISOString().slice(0, 10);

  const { data: channelData, isLoading: channelLoading } = useQuery({
    queryKey: [
      "sales-by-channel",
      outletId,
      channelFromStr,
      channelToStr,
      channelTimeFrom,
      channelTimeTo,
    ],
    queryFn: () =>
      reportService.getSalesByChannel({
        outletId,
        from: channelFromStr,
        to: channelToStr,
        fromTime: channelTimeFrom || undefined,
        toTime: channelTimeTo || undefined,
      }),
    enabled: salesByChannelVisible,
  });

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

  // --- Customer Intelligence chart transforms — all derived from DashboardReport fields
  // already fetched above, never a client-side raw-order pull. ---
  const peakHoursChart = (d?.peakHours ?? []).map(p => ({ hour: `${p.hour}:00`, orders: p.orders, revenue: p.revenue }));
  const customerActivityChart = d?.customerActivity ?? [];
  const dayPerformanceChart = d?.dayOfWeekPerformance ?? [];
  // Mirrors reports.helpers.ts's ONLINE_TYPES on the backend — the two repos share no code,
  // so this short list is kept in sync by hand, same as this file's own channel handling.
  const ONLINE_TYPES = ["Foodpanda", "Online", "Self Order"];
  const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const orderTypeTrendChart = (() => {
    const byDay = new Map(weekdayLabels.map(l => [l, { day: l, online: 0, offline: 0 }]));
    for (const row of d?.orderTypeTrend ?? []) {
      const bucket = byDay.get(row.day);
      if (!bucket) continue;
      if (ONLINE_TYPES.includes(row.type)) bucket.online += row.count; else bucket.offline += row.count;
    }
    return [...byDay.values()];
  })();
  // Exact count, not an estimate: customerActivity's newCustomers is 1 exactly once per
  // customer (their first day in the week), so summing it across all 7 days gives the
  // week's unique-customer total with zero extra queries.
  const uniqueCustomersThisWeek = (d?.customerActivity ?? []).reduce((s, day) => s + day.newCustomers, 0);

  return (
    <div className="space-y-6">
      {/* Sales By Channel (gated on "reports" permission) */}
      {salesByChannelVisible && (
        <div className="space-y-4">
          {/* Header & Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 flex-wrap">
            <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Sales By Channel
            </h3>

            {/* Date & Time Filter Bar */}
            <div className="flex items-center gap-2 flex-wrap">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="text-xs">
                    <CalendarIcon className="h-3 w-3 mr-1" />
                    {channelDateFrom ? format(channelDateFrom, "MMM d") : "From"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarUI
                    mode="single"
                    selected={channelDateFrom}
                    onSelect={(d) => {
                      setChannelDateFrom(d);
                      setChannelPreset("Custom");
                    }}
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>

              <span className="text-xs text-muted-foreground">to</span>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="text-xs">
                    <CalendarIcon className="h-3 w-3 mr-1" />
                    {channelDateTo ? format(channelDateTo, "MMM d") : "To"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarUI
                    mode="single"
                    selected={channelDateTo}
                    onSelect={(d) => {
                      setChannelDateTo(d);
                      setChannelPreset("Custom");
                    }}
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>

              {["Today", "This Week", "This Month"].map((p) => (
                <Button
                  key={p}
                  variant={channelPreset === p ? "secondary" : "outline"}
                  size="sm"
                  className="text-xs"
                  onClick={() => setPreset(p)}
                >
                  {p}
                </Button>
              ))}

              {/* Optional Time Filters */}
              <div className="flex items-center gap-1.5 ml-0 sm:ml-2 pl-0 sm:pl-2 sm:border-l border-border text-xs">
                <span className="text-muted-foreground text-[11px] font-medium flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Time (optional):
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-muted-foreground">From</span>
                  <input
                    type="time"
                    value={channelTimeFrom}
                    onChange={(e) => setChannelTimeFrom(e.target.value)}
                    className="h-8 rounded-md border border-input bg-background px-2 py-1 text-xs [color-scheme:dark] text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-muted-foreground">To</span>
                  <input
                    type="time"
                    value={channelTimeTo}
                    onChange={(e) => setChannelTimeTo(e.target.value)}
                    className="h-8 rounded-md border border-input bg-background px-2 py-1 text-xs [color-scheme:dark] text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                {(channelTimeFrom || channelTimeTo) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setChannelTimeFrom("");
                      setChannelTimeTo("");
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* 4 Cards Grid */}
          {channelLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="shadow-sm">
                  <CardContent className="p-5 space-y-3">
                    <Skeleton className="h-5 w-24" />
                    <div className="space-y-2 pt-1">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-full" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Dine In */}
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold">Dine In</CardTitle>
                    <span className="text-xs text-muted-foreground">
                      {channelData?.channels.dineIn.orders ?? 0} orders
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="pt-2">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Sale</span>
                      <span className="font-semibold">{currency} {(channelData?.channels.dineIn.sale ?? 0).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Cost</span>
                      <span className="font-medium text-muted-foreground">{currency} {(channelData?.channels.dineIn.cost ?? 0).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t">
                      <span className="text-muted-foreground font-medium">Profit</span>
                      <span className={`font-bold ${(channelData?.channels.dineIn.profit ?? 0) >= 0 ? "text-success" : "text-destructive"}`}>
                        {currency} {(channelData?.channels.dineIn.profit ?? 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Take Away */}
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold">Take Away</CardTitle>
                    <span className="text-xs text-muted-foreground">
                      {channelData?.channels.takeaway.orders ?? 0} orders
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="pt-2">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Sale</span>
                      <span className="font-semibold">{currency} {(channelData?.channels.takeaway.sale ?? 0).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Cost</span>
                      <span className="font-medium text-muted-foreground">{currency} {(channelData?.channels.takeaway.cost ?? 0).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t">
                      <span className="text-muted-foreground font-medium">Profit</span>
                      <span className={`font-bold ${(channelData?.channels.takeaway.profit ?? 0) >= 0 ? "text-success" : "text-destructive"}`}>
                        {currency} {(channelData?.channels.takeaway.profit ?? 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Delivery */}
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold">Delivery</CardTitle>
                    <span className="text-xs text-muted-foreground">
                      {channelData?.channels.delivery.orders ?? 0} orders
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="pt-2">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Sale</span>
                      <span className="font-semibold">{currency} {(channelData?.channels.delivery.sale ?? 0).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Cost</span>
                      <span className="font-medium text-muted-foreground">{currency} {(channelData?.channels.delivery.cost ?? 0).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t">
                      <span className="text-muted-foreground font-medium">Profit</span>
                      <span className={`font-bold ${(channelData?.channels.delivery.profit ?? 0) >= 0 ? "text-success" : "text-destructive"}`}>
                        {currency} {(channelData?.channels.delivery.profit ?? 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Combined */}
              <Card className="shadow-sm border-primary/20 bg-primary/[0.02]">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold">Combined</CardTitle>
                    <span className="text-xs text-muted-foreground">
                      {channelData?.combined.orders ?? 0} orders
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="pt-2">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Sale</span>
                      <span className="font-semibold">{currency} {(channelData?.combined.sale ?? 0).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Cost</span>
                      <span className="font-medium text-muted-foreground">{currency} {(channelData?.combined.cost ?? 0).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t">
                      <span className="text-muted-foreground font-medium">Profit</span>
                      <span className={`font-bold ${(channelData?.combined.profit ?? 0) >= 0 ? "text-success" : "text-destructive"}`}>
                        {currency} {(channelData?.combined.profit ?? 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t">
                      <span className="text-muted-foreground font-medium">Margin</span>
                      <span className={`font-bold ${(channelData?.combined.marginPct ?? 0) >= 0 ? "text-success" : "text-destructive"}`}>
                        {channelData?.combined.marginPct ?? 0}%
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

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
        <ClickableCard interactive={salesDrillEnabled} onClick={goToSales}>
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
        </ClickableCard>
      </div>

      {/* Today's Sales by Channel */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          Today's Sales by Channel
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Offline */}
          <ClickableCard interactive={salesDrillEnabled} onClick={goToSales} className="border-success/20">
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
          </ClickableCard>

          {/* Dine In */}
          <ClickableCard interactive={salesDrillEnabled} onClick={goToSales}>
            <CardContent className="p-5">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Dine In</p>
                <p className="text-2xl font-bold mt-1">{currency} {ch("Dine In").sales.toLocaleString()}</p>
                <span className="text-xs text-muted-foreground">{ch("Dine In").orders} orders</span>
              </div>
            </CardContent>
          </ClickableCard>

          {/* Pick Up / Take Away */}
          <ClickableCard interactive={salesDrillEnabled} onClick={goToSales}>
            <CardContent className="p-5">
              <div>
                <p className="text-xs text-muted-foreground font-medium">PickUp</p>
                <p className="text-2xl font-bold mt-1">{currency} {ch("Take Away").sales.toLocaleString()}</p>
                <span className="text-xs text-muted-foreground">{ch("Take Away").orders} orders</span>
              </div>
            </CardContent>
          </ClickableCard>

          {/* Delivery */}
          <ClickableCard interactive={salesDrillEnabled} onClick={goToSales}>
            <CardContent className="p-5">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Delivery</p>
                <p className="text-2xl font-bold mt-1">{currency} {ch("Delivery").sales.toLocaleString()}</p>
                <span className="text-xs text-muted-foreground">{ch("Delivery").orders} orders</span>
              </div>
            </CardContent>
          </ClickableCard>

          {/* Total Online */}
          <ClickableCard interactive={salesDrillEnabled} onClick={goToSales} className="border-info/20">
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
          </ClickableCard>

          {/* Foodpanda */}
          <ClickableCard interactive={salesDrillEnabled} onClick={goToSales}>
            <CardContent className="p-5">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Foodpanda</p>
                <p className="text-2xl font-bold mt-1">{currency} {ch("Foodpanda").sales.toLocaleString()}</p>
                <span className="text-xs text-muted-foreground">{ch("Foodpanda").orders} orders</span>
              </div>
            </CardContent>
          </ClickableCard>

          {/* Self Order */}
          <ClickableCard interactive={salesDrillEnabled} onClick={goToSales}>
            <CardContent className="p-5">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Self Order</p>
                <p className="text-2xl font-bold mt-1">{currency} {ch("Self Order").sales.toLocaleString()}</p>
                <span className="text-xs text-muted-foreground">{ch("Self Order").orders} orders</span>
              </div>
            </CardContent>
          </ClickableCard>

          {/* Online */}
          <ClickableCard interactive={salesDrillEnabled} onClick={goToSales}>
            <CardContent className="p-5">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Online</p>
                <p className="text-2xl font-bold mt-1">{currency} {ch("Online").sales.toLocaleString()}</p>
                <span className="text-xs text-muted-foreground">{ch("Online").orders} orders</span>
              </div>
            </CardContent>
          </ClickableCard>
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
      {tileVisible("payment-methods") && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Payment Methods (This Month)
          </h3>
          <ClickableCard interactive onClick={() => goToTile("payment-methods")}>
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
          </ClickableCard>
        </div>
      )}

      {/* Top 10 Items (This Month) */}
      {tileVisible("top-items") && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <Trophy className="h-4 w-4" />
            Top 10 Items
          </h3>
          <ClickableCard interactive onClick={() => goToTile("top-items")}>
            <CardContent className="p-5">
              {(d?.topItems ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No item sales this month</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(d?.topItems ?? []).slice(0, 10).map((item) => (
                      <TableRow key={item.name}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-right">{item.qty}</TableCell>
                        <TableCell className="text-right">{currency} {item.revenue.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </ClickableCard>
        </div>
      )}

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
          <ClickableCard interactive={salesDrillEnabled} onClick={goToSales}>
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
          </ClickableCard>

          <ClickableCard interactive={salesDrillEnabled} onClick={goToSales}>
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
          </ClickableCard>

          <ClickableCard interactive={salesDrillEnabled} onClick={goToSales} className="border-destructive/20">
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
          </ClickableCard>

          <ClickableCard interactive={salesDrillEnabled} onClick={goToSales}>
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
          </ClickableCard>
        </div>
      </div>

      {/* Customer Intelligence */}
      {customerIntelVisible && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Customer Intelligence
            </h3>
            {/* The zone itself is gated on hasPermission("reports"), so this link is always reachable here. */}
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={() => navigate("/reports")}>
              View full reports <ChevronRight className="h-3 w-3" />
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <Card className="shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Unique Customers (This Week)</p>
                    <p className="text-2xl font-bold mt-1">{uniqueCustomersThisWeek}</p>
                  </div>
                  <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-primary/10">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {tileVisible("top-customers") && (
            <Card className="shadow-sm mb-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Top 10 Customers</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {(d?.topCustomers ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No customer history available yet</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead className="text-right">Orders</TableHead>
                        <TableHead className="text-right">Spent</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(d?.topCustomers ?? []).map((c, idx) => (
                        <TableRow
                          key={c.customerId ?? `${c.name}-${idx}`}
                          className={cn(c.customerId && "cursor-pointer hover:bg-muted/30")}
                          onClick={c.customerId ? () => navigate(`/customers/${c.customerId}`) : undefined}
                        >
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell className="text-right">{c.totalOrders}</TableCell>
                          <TableCell className="text-right">{currency} {c.totalSpent.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-base">Peak Hours (This Week)</CardTitle></CardHeader>
              <CardContent>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={peakHoursChart}>
                      <XAxis dataKey="hour" tick={{ fontSize: 9 }} interval={1} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const row = payload[0].payload as { orders: number; revenue: number };
                        return (
                          <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-sm">
                            <p className="font-medium mb-1">{label}</p>
                            <p className="text-muted-foreground">{row.orders} orders</p>
                            <p className="text-muted-foreground">{currency} {row.revenue.toLocaleString()} revenue</p>
                          </div>
                        );
                      }} />
                      <Bar dataKey="orders" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-base">Customer Activity (This Week)</CardTitle></CardHeader>
              <CardContent>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={customerActivityChart}>
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="newCustomers" stackId="c" name="New" fill="hsl(var(--primary))" />
                      <Bar dataKey="returningCustomers" stackId="c" name="Returning" fill="hsl(var(--info))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-base">Order Type Trend (This Week)</CardTitle></CardHeader>
              <CardContent>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={orderTypeTrendChart}>
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="offline" stackId="t" name="Offline" fill="hsl(var(--success))" />
                      <Bar dataKey="online" stackId="t" name="Online" fill="hsl(var(--info))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-base">Day-of-Week Performance (60 Days)</CardTitle></CardHeader>
              <CardContent>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dayPerformanceChart}>
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const row = payload[0].payload as { orderCount: number; avgSales: number };
                        return (
                          <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-sm">
                            <p className="font-medium mb-1">{label}</p>
                            <p className="text-muted-foreground">Avg order: {currency} {row.avgSales.toLocaleString()}</p>
                            <p className="text-muted-foreground">{row.orderCount} orders</p>
                          </div>
                        );
                      }} />
                      <Bar dataKey="avgSales" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Today's Operations */}
      {zoneVisible("operations") && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Today's Operations
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile
              visible={tileVisible("live-orders")} interactive onClick={() => goToTile("live-orders")}
              icon={BarChart3} title="Live Orders"
              value={(d?.today.liveStatus.pending ?? 0) + (d?.today.liveStatus.preparing ?? 0) + (d?.today.liveStatus.ready ?? 0)}
              sub={`Pending ${d?.today.liveStatus.pending ?? 0} · Preparing ${d?.today.liveStatus.preparing ?? 0} · Ready ${d?.today.liveStatus.ready ?? 0}`}
            />
            <StatTile
              visible={tileVisible("kitchens-preparing")} interactive onClick={() => goToTile("kitchens-preparing")}
              icon={ChefHat} title="Kitchens"
              value={d?.today.liveStatus.preparing ?? 0}
              sub="Orders in preparation"
            />
            <StatTile
              visible={tileVisible("tables")} interactive onClick={() => goToTile("tables")}
              icon={LayoutGrid} title="Tables"
              value={d?.tables.occupied ?? 0}
              sub={`${d?.tables.available ?? 0} available`}
            />
            <StatTile
              visible={tileVisible("cancellation-requests")} interactive onClick={() => goToTile("cancellation-requests")}
              icon={Ban} title="Cancellation Requests"
              value={d?.pendingCancellations ?? 0}
              valueClassName={(d?.pendingCancellations ?? 0) > 0 ? "text-warning" : undefined}
              sub="Awaiting approval"
            />
          </div>
        </div>
      )}

      {/* Inventory & Procurement */}
      {zoneVisible("inventory") && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <Package className="h-4 w-4" />
            Inventory & Procurement
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile
              visible={tileVisible("low-stock")} interactive onClick={() => goToTile("low-stock")}
              icon={Package} title="Low Stock Alert"
              value={d?.lowStockCount ?? 0}
              valueClassName={(d?.lowStockCount ?? 0) > 0 ? "text-destructive" : undefined}
              sub="At or below threshold"
            />
            <StatTile
              visible={tileVisible("pending-purchase-requests")} interactive onClick={() => goToTile("pending-purchase-requests")}
              icon={ClipboardList} title="Pending Purchase Requests"
              value={d?.pendingPurchaseRequests ?? 0}
              valueClassName={(d?.pendingPurchaseRequests ?? 0) > 0 ? "text-warning" : undefined}
            />
            <StatTile
              visible={tileVisible("pending-demands")} interactive onClick={() => goToTile("pending-demands")}
              icon={ArrowLeftRight} title="Pending Demands"
              value={d?.pendingDemands ?? 0}
              valueClassName={(d?.pendingDemands ?? 0) > 0 ? "text-warning" : undefined}
            />
          </div>
        </div>
      )}

      {/* People */}
      {zoneVisible("people") && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <UserCheck className="h-4 w-4" />
            People
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile
              visible={tileVisible("attendance-today")} interactive onClick={() => goToTile("attendance-today")}
              icon={UserCheck} title="Today's Attendance"
              value={d?.attendanceToday.present ?? 0}
              sub={`Late ${d?.attendanceToday.late ?? 0} · Absent ${d?.attendanceToday.absent ?? 0}`}
            />
            <StatTile
              visible={tileVisible("pending-leave")} interactive onClick={() => goToTile("pending-leave")}
              icon={CalendarOff} title="Pending Leave Requests"
              value={d?.pendingLeaveRequests ?? 0}
              valueClassName={(d?.pendingLeaveRequests ?? 0) > 0 ? "text-warning" : undefined}
            />
          </div>
        </div>
      )}

      {/* Delivery */}
      {zoneVisible("delivery") && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <Bike className="h-4 w-4" />
            Delivery
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile
              visible={tileVisible("active-deliveries")} interactive onClick={() => goToTile("active-deliveries")}
              icon={Bike} title="Active Deliveries"
              value={d?.deliveryActive ?? 0}
            />
          </div>
        </div>
      )}

      {/* Reservations */}
      {zoneVisible("reservations") && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <CalendarCheck className="h-4 w-4" />
            Reservations
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile
              visible={tileVisible("reservations-today")} interactive onClick={() => goToTile("reservations-today")}
              icon={CalendarCheck} title="Today's Reservations"
              value={d?.reservationsToday ?? 0}
            />
          </div>
        </div>
      )}

      {/* Cash Hub */}
      {zoneVisible("cashHub") && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <Coins className="h-4 w-4" />
            Cash Hub
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile
              visible={tileVisible("unsettled-cash")} interactive onClick={() => goToTile("unsettled-cash")}
              icon={Coins} title="Unsettled Cash"
              value={`${currency} ${(d?.cashHub.totalUnsettled ?? 0).toLocaleString()}`}
              sub={`${d?.cashHub.staffCount ?? 0} staff`}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;

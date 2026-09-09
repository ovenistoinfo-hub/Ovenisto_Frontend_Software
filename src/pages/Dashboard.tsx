import {
  TrendingUp, DollarSign, Wallet, ReceiptText, Flame, ArrowUpCircle, ArrowDownCircle,
  BarChart3, ShoppingBag, Clock, ChevronRight, ChevronDown, Trophy, Users, ChefHat, LayoutGrid, Ban, Package,
  ClipboardList, ArrowLeftRight, UserCheck, CalendarOff, Bike, CalendarCheck, Coins, Calendar as CalendarIcon,
  UtensilsCrossed, Percent, X, Layers, CreditCard, Banknote, Smartphone,
} from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker, formatTimeLabel } from "@/components/ui/time-picker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, Cell, LabelList, CartesianGrid } from "recharts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { reportService } from "@/services/report.service";
import { stockService } from "@/services/stock.service";
import { useOutletFilter } from "@/hooks/useOutletFilter";
import { OutletFilterSelect } from "@/components/OutletFilterSelect";
import { useVisiblePolling } from "@/hooks/use-visible-polling";
import { useOrderEvents } from "@/hooks/use-order-events";
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
  const queryClient = useQueryClient();
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

  const toYmd = (date: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };

  // Sales By Channel (Date & optional Time filtered, gated on "reports" permission)
  const salesByChannelVisible = hasPermission("reports");
  const [channelSectionCollapsed, setChannelSectionCollapsed] = useState<boolean>(false);
  const [channelPreset, setChannelPreset] = useState<string>("Today");
  const [channelFromStr, setChannelFromStr] = useState<string>(toYmd(new Date()));
  const [channelToStr, setChannelToStr] = useState<string>(toYmd(new Date()));
  const [channelTimeFrom, setChannelTimeFrom] = useState<string>("");
  const [channelTimeTo, setChannelTimeTo] = useState<string>("");

  // Sales by Category — same filter model as Sales By Channel, its own independent state
  // (both sections are separately collapsible; a user may want a different window in each).
  const [catSectionCollapsed, setCatSectionCollapsed] = useState<boolean>(false);
  const [catPreset, setCatPreset] = useState<string>("Today");
  const [catFromStr, setCatFromStr] = useState<string>(toYmd(new Date()));
  const [catToStr, setCatToStr] = useState<string>(toYmd(new Date()));
  const [catTimeFrom, setCatTimeFrom] = useState<string>("");
  const [catTimeTo, setCatTimeTo] = useState<string>("");

  // Sales by Payment Method — same filter model again, its own state.
  const [paySectionCollapsed, setPaySectionCollapsed] = useState<boolean>(false);
  const [payPreset, setPayPreset] = useState<string>("Today");
  const [payFromStr, setPayFromStr] = useState<string>(toYmd(new Date()));
  const [payToStr, setPayToStr] = useState<string>(toYmd(new Date()));
  const [payTimeFrom, setPayTimeFrom] = useState<string>("");
  const [payTimeTo, setPayTimeTo] = useState<string>("");

  const setPreset = (preset: string) => {
    setChannelPreset(preset);
    const now = new Date();
    if (preset === "Today") {
      setChannelFromStr(toYmd(now));
      setChannelToStr(toYmd(now));
    } else if (preset === "This Week") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      setChannelFromStr(toYmd(d));
      setChannelToStr(toYmd(now));
    } else if (preset === "This Month") {
      setChannelFromStr(toYmd(new Date(now.getFullYear(), now.getMonth(), 1)));
      setChannelToStr(toYmd(now));
    }
  };

  const setCatRange = (preset: string) => {
    setCatPreset(preset);
    const now = new Date();
    if (preset === "Today") {
      setCatFromStr(toYmd(now));
      setCatToStr(toYmd(now));
    } else if (preset === "This Week") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      setCatFromStr(toYmd(d));
      setCatToStr(toYmd(now));
    } else if (preset === "This Month") {
      setCatFromStr(toYmd(new Date(now.getFullYear(), now.getMonth(), 1)));
      setCatToStr(toYmd(now));
    }
  };

  const setPayRange = (preset: string) => {
    setPayPreset(preset);
    const now = new Date();
    if (preset === "Today") {
      setPayFromStr(toYmd(now));
      setPayToStr(toYmd(now));
    } else if (preset === "This Week") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      setPayFromStr(toYmd(d));
      setPayToStr(toYmd(now));
    } else if (preset === "This Month") {
      setPayFromStr(toYmd(new Date(now.getFullYear(), now.getMonth(), 1)));
      setPayToStr(toYmd(now));
    }
  };

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

  const { data: categoryData, isLoading: categoryLoading } = useQuery({
    queryKey: ["sales-by-category", outletId, catFromStr, catToStr, catTimeFrom, catTimeTo],
    queryFn: () =>
      reportService.getSalesByCategory({
        outletId,
        from: catFromStr,
        to: catToStr,
        fromTime: catTimeFrom || undefined,
        toTime: catTimeTo || undefined,
      }),
    enabled: salesByChannelVisible,
  });

  const { data: payData, isLoading: payLoading } = useQuery({
    queryKey: ["sales-by-payment-method", outletId, payFromStr, payToStr, payTimeFrom, payTimeTo],
    queryFn: () =>
      reportService.getSalesByPaymentMethod({
        outletId,
        from: payFromStr,
        to: payToStr,
        fromTime: payTimeFrom || undefined,
        toTime: payTimeTo || undefined,
      }),
    enabled: salesByChannelVisible,
  });

  // Push-first real-time for the three filtered sales sections — invalidating just their own
  // query keys (not the whole ["dashboard", outletId] query) avoids re-running the other 11
  // dashboard aggregates on every order event, matching how Sales.tsx keeps its order-list query
  // independent. The 180s poll (this app's standard interval for socket-backed page data) is a
  // safety net only.
  const refreshSalesSections = () => {
    if (!salesByChannelVisible) return;
    queryClient.invalidateQueries({ queryKey: ["sales-by-channel"] });
    queryClient.invalidateQueries({ queryKey: ["sales-by-category"] });
    queryClient.invalidateQueries({ queryKey: ["sales-by-payment-method"] });
  };
  useOrderEvents(refreshSalesSections);
  useVisiblePolling(refreshSalesSections, 180_000);

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

  const channelRows = [
    {
      title: "Dine In",
      icon: UtensilsCrossed,
      color: "bg-blue-500/10 text-blue-500 border-blue-500/20",
      orders: channelData?.channels.dineIn.orders ?? 0,
      sale: channelData?.channels.dineIn.sale ?? 0,
      cost: channelData?.channels.dineIn.cost ?? 0,
      profit: channelData?.channels.dineIn.profit ?? 0,
      marginPct:
        (channelData?.channels.dineIn.sale ?? 0) > 0
          ? Math.round(((channelData?.channels.dineIn.profit ?? 0) / (channelData?.channels.dineIn.sale ?? 1)) * 100)
          : 0,
      isCombined: false,
      salesTypeParam: "Dine In",
    },
    {
      title: "Take Away",
      icon: ShoppingBag,
      color: "bg-amber-500/10 text-amber-500 border-amber-500/20",
      orders: channelData?.channels.takeaway.orders ?? 0,
      sale: channelData?.channels.takeaway.sale ?? 0,
      cost: channelData?.channels.takeaway.cost ?? 0,
      profit: channelData?.channels.takeaway.profit ?? 0,
      marginPct:
        (channelData?.channels.takeaway.sale ?? 0) > 0
          ? Math.round(((channelData?.channels.takeaway.profit ?? 0) / (channelData?.channels.takeaway.sale ?? 1)) * 100)
          : 0,
      isCombined: false,
      salesTypeParam: "Take Away",
    },
    {
      title: "Delivery",
      icon: Bike,
      color: "bg-purple-500/10 text-purple-500 border-purple-500/20",
      orders: channelData?.channels.delivery.orders ?? 0,
      sale: channelData?.channels.delivery.sale ?? 0,
      cost: channelData?.channels.delivery.cost ?? 0,
      profit: channelData?.channels.delivery.profit ?? 0,
      marginPct:
        (channelData?.channels.delivery.sale ?? 0) > 0
          ? Math.round(((channelData?.channels.delivery.profit ?? 0) / (channelData?.channels.delivery.sale ?? 1)) * 100)
          : 0,
      isCombined: false,
      salesTypeParam: "Delivery",
    },
    {
      title: "Total (All Channels)",
      icon: TrendingUp,
      color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
      orders: channelData?.combined.orders ?? 0,
      sale: channelData?.combined.sale ?? 0,
      cost: channelData?.combined.cost ?? 0,
      profit: channelData?.combined.profit ?? 0,
      marginPct: channelData?.combined.marginPct ?? 0,
      isCombined: true,
      // The 3 real channels this section sums, not "every type" -- Sales & Orders' own "All"
      // would also pull in Online/Foodpanda, which Sales By Channel deliberately excludes.
      salesTypeParam: "Dine In,Take Away,Delivery",
    },
  ];
  // Chart data: the 3 real channels only -- the combined row is a summary total, not a
  // fourth channel, and would double-count if plotted alongside them.
  const channelChartData = channelRows.filter((r) => !r.isCombined).map((r) => ({
    name: r.title, sale: r.sale, cost: r.cost, profit: r.profit,
  }));
  const salesTypeParamByChannel = new Map(channelRows.map((r) => [r.title, r.salesTypeParam]));

  // "View Details" on any channel row/chart bar -- lands on Sales & Orders pre-filtered to
  // exactly what that row totalled: the same date/time window this section has active, status
  // narrowed to completed only (this section's own aggregate never counts cancelled orders,
  // unlike Sales & Orders' default "All"), and the given type(s).
  const goToChannelSales = (salesTypeParam: string) => {
    const params = new URLSearchParams();
    params.set("status", "completed");
    params.set("type", salesTypeParam);
    if (channelFromStr) params.set("from", channelFromStr);
    if (channelToStr) params.set("to", channelToStr);
    if (channelTimeFrom) params.set("fromTime", channelTimeFrom);
    if (channelTimeTo) params.set("toTime", channelTimeTo);
    navigate(`/sales?${params.toString()}`);
  };

  // ── Sales by Category derivations ────────────────────────────────────────
  const categoryList = categoryData?.categories ?? [];
  const categoryCombined = categoryData?.combined;
  // The table shows every active category (incl. zero-sales ones, muted); the chart plots only
  // categories that actually sold — a wall of Rs. 0 bars is noise.
  const categoryWithSales = categoryList.filter((c) => c.sale > 0);
  // A 15-category bar chart is unreadable — plot the top 8 by Sale and fold the rest into
  // one "Other" bar (kept out of the drill-down: "Other" has no single category param).
  const CATEGORY_CHART_TOP_N = 8;
  const catChartData = (() => {
    const top = categoryWithSales
      .slice(0, CATEGORY_CHART_TOP_N)
      .map((c) => ({ name: c.name, sale: c.sale, cost: c.cost, profit: c.profit }));
    const rest = categoryWithSales.slice(CATEGORY_CHART_TOP_N);
    if (rest.length > 0) {
      top.push({
        name: "Other",
        sale: rest.reduce((s, c) => s + c.sale, 0),
        cost: rest.reduce((s, c) => s + c.cost, 0),
        profit: rest.reduce((s, c) => s + c.profit, 0),
      });
    }
    return top;
  })();

  // "View Details" → Sales & Orders pre-filtered to this category (same date/time window,
  // status=completed). A null name (the Total row) drops the category param → every completed
  // sale in the window, all channels — matching the combined row's scope. Sales.tsx reads
  // these params once on mount, then leaves the address bar alone.
  const goToCategorySales = (categoryName: string | null) => {
    const params = new URLSearchParams();
    params.set("status", "completed");
    if (categoryName) params.set("category", categoryName);
    if (catFromStr) params.set("from", catFromStr);
    if (catToStr) params.set("to", catToStr);
    if (catTimeFrom) params.set("fromTime", catTimeFrom);
    if (catTimeTo) params.set("toTime", catTimeTo);
    navigate(`/sales?${params.toString()}`);
  };

  // ── Sales by Payment Method derivations ──────────────────────────────────
  const payMethods = payData?.methods ?? [];
  const payCombined = payData?.combined;
  // Table shows every configured method (incl. zero, muted); chart plots only methods that
  // actually collected something.
  const payChartData = payMethods.filter((m) => m.amount > 0).map((m) => ({ name: m.method, amount: m.amount }));
  const payHasActivity = (payCombined?.amount ?? 0) > 0;
  // "View Details" → Sales & Orders filtered to orders that used this method (whole-order
  // amounts; a split order also shows under its other methods). Total row → no method param.
  const goToPaymentSales = (method: string | null) => {
    const params = new URLSearchParams();
    params.set("status", "completed");
    if (method) params.set("paymentMethod", method);
    if (payFromStr) params.set("from", payFromStr);
    if (payToStr) params.set("to", payToStr);
    if (payTimeFrom) params.set("fromTime", payTimeFrom);
    if (payTimeTo) params.set("toTime", payTimeTo);
    navigate(`/sales?${params.toString()}`);
  };

  return (
    <div className="space-y-6">
      {/* Fallback header when Sales By Channel is not visible */}
      {!salesByChannelVisible && (
        <div className="flex items-center justify-between pb-3 border-b border-border/40">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-foreground">Dashboard</h2>
            <p className="text-xs text-muted-foreground">
              {d?.branchName ?? "Welcome back, here's your overview"}
            </p>
          </div>
          {isSuperAdmin && (
            <OutletFilterSelect outletId={outletId} setOutletId={setOutletId} outlets={outlets} isSuperAdmin={isSuperAdmin} />
          )}
        </div>
      )}

      {/* Sales By Channel (gated on "reports" permission) */}
      {salesByChannelVisible && (
        <section
          aria-label="Sales By Channel"
          className="rounded-2xl border border-border/80 bg-card/40 backdrop-blur-md shadow-sm overflow-hidden transition-all"
        >
          {/* Section Header & Filter Controls Container */}
          <div className={cn("p-4 sm:p-5 space-y-4 bg-card/70", !channelSectionCollapsed && "border-b border-border/50")}>
            {/* Top row: Title + Collapse Arrow + Super Admin OutletFilter */}
            <div className="flex items-center justify-between gap-3">
              <div
                className="flex items-center gap-3 cursor-pointer select-none group"
                onClick={() => setChannelSectionCollapsed((prev) => !prev)}
              >
                <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shrink-0 shadow-sm group-hover:bg-primary/20 transition-colors">
                  <DollarSign className="h-4 w-4" />
                </div>
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors whitespace-nowrap">
                  Sales By Channel
                </h2>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {isSuperAdmin && (
                  <OutletFilterSelect outletId={outletId} setOutletId={setOutletId} outlets={outlets} isSuperAdmin={isSuperAdmin} />
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setChannelSectionCollapsed((prev) => !prev)}
                  className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/70 gap-1.5 rounded-lg border border-border/50"
                  title={channelSectionCollapsed ? "Expand Sales By Channel" : "Collapse Sales By Channel"}
                  aria-label={channelSectionCollapsed ? "Expand Sales By Channel" : "Collapse Sales By Channel"}
                >
                  <span className="text-xs font-medium hidden sm:inline">
                    {channelSectionCollapsed ? "Show" : "Hide"}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform duration-200",
                      channelSectionCollapsed ? "-rotate-90" : "rotate-0"
                    )}
                  />
                </Button>
              </div>
            </div>

            {/* Filter Bar Row (only shown when expanded) */}
            {!channelSectionCollapsed && (
              <div className="flex items-center gap-2.5 flex-wrap pt-3 border-t border-border/40">
                {/* Presets Segmented Control */}
                <div className="inline-flex items-center p-0.5 rounded-lg bg-muted/60 border border-border/60 shadow-sm">
                  {(["Today", "This Week", "This Month"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPreset(p)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                        channelPreset === p
                          ? "bg-background text-foreground shadow-sm font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                {/* Date Pickers (From -> To) */}
                <div className="inline-flex items-center gap-1.5">
                  <div className="w-36">
                    <DatePicker
                      value={channelFromStr}
                      onChange={(val) => {
                        setChannelFromStr(val);
                        setChannelPreset("Custom");
                      }}
                      placeholder="Start date"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground/60 font-medium px-0.5">to</span>
                  <div className="w-36">
                    <DatePicker
                      value={channelToStr}
                      onChange={(val) => {
                        setChannelToStr(val);
                        setChannelPreset("Custom");
                      }}
                      min={channelFromStr}
                      placeholder="End date"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                </div>

                {/* Time Filter Popover */}
                <div className="inline-flex items-center gap-1">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "h-8 px-2.5 text-xs font-medium gap-1.5 border shadow-sm transition-all",
                          channelTimeFrom || channelTimeTo
                            ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/15"
                            : "border-border/70 bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
                        )}
                      >
                        <Clock className={cn("h-3.5 w-3.5 shrink-0", (channelTimeFrom || channelTimeTo) && "text-primary")} />
                        <span>
                          {channelTimeFrom || channelTimeTo
                            ? `${channelTimeFrom ? formatTimeLabel(channelTimeFrom) : "12:00 AM"} – ${channelTimeTo ? formatTimeLabel(channelTimeTo) : "11:59 PM"}`
                            : "All Day (Time)"}
                        </span>
                        <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-3 space-y-3" align="start">
                      <div className="flex items-center justify-between border-b border-border/40 pb-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                          <Clock className="h-3.5 w-3.5 text-primary" />
                          <span>Filter By Operating Hours</span>
                        </div>
                        {(channelTimeFrom || channelTimeTo) && (
                          <button
                            type="button"
                            onClick={() => {
                              setChannelTimeFrom("");
                              setChannelTimeTo("");
                            }}
                            className="text-[11px] text-destructive hover:underline font-medium"
                          >
                            Reset
                          </button>
                        )}
                      </div>

                      {/* Quick Shift Presets */}
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-medium text-muted-foreground">Quick Shift Presets</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {[
                            { label: "Lunch Shift", from: "11:00", to: "17:00" },
                            { label: "Dinner Peak", from: "17:00", to: "23:59" },
                            { label: "Late Night", from: "23:00", to: "04:00" },
                            { label: "Full Operating Day", from: "11:00", to: "23:59" },
                          ].map((shift) => (
                            <Button
                              key={shift.label}
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setChannelTimeFrom(shift.from);
                                setChannelTimeTo(shift.to);
                              }}
                              className={cn(
                                "h-7 text-[11px] justify-start px-2 font-normal border-border/60",
                                channelTimeFrom === shift.from && channelTimeTo === shift.to
                                  ? "border-primary bg-primary/10 text-primary font-medium"
                                  : "hover:bg-muted"
                              )}
                            >
                              {shift.label}
                            </Button>
                          ))}
                        </div>
                      </div>

                      {/* Custom Time Selection using TimePicker */}
                      <div className="space-y-2 pt-2 border-t border-border/40">
                        <p className="text-[11px] font-medium text-muted-foreground">Custom Time Range</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-muted-foreground font-medium block mb-1">Start Time</label>
                            <TimePicker
                              value={channelTimeFrom || "11:00"}
                              onChange={(v) => setChannelTimeFrom(v)}
                              className="h-8 text-xs bg-background"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground font-medium block mb-1">End Time</label>
                            <TimePicker
                              value={channelTimeTo || "23:59"}
                              onChange={(v) => setChannelTimeTo(v)}
                              className="h-8 text-xs bg-background"
                            />
                          </div>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>

                  {(channelTimeFrom || channelTimeTo) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setChannelTimeFrom("");
                        setChannelTimeTo("");
                      }}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md"
                      title="Clear time filter"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Section Body: 4 Channel Rows nested inside this container */}
          {!channelSectionCollapsed && (
            <div className="p-4 sm:p-5 space-y-4 bg-background/25">
              {channelLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 4 }).map((_, r) => (
                    <div key={r} className="rounded-xl border border-border/50 bg-card/40 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-7 w-7 rounded-md" />
                          <Skeleton className="h-5 w-28" />
                        </div>
                        <Skeleton className="h-5 w-20 rounded-full" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {Array.from({ length: 4 }).map((_, c) => (
                          <Skeleton key={c} className="h-20 rounded-lg" />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {channelRows.map((row) => {
                    const ChannelIcon = row.icon;
                    return (
                      <div
                        key={row.title}
                        className={cn(
                          "group/card rounded-xl border p-4 transition-all duration-200 space-y-3",
                          row.isCombined
                            ? "bg-emerald-500/[0.03] border-emerald-500/30 shadow-xs hover:border-emerald-500/50 hover:bg-emerald-500/[0.05]"
                            : "bg-card/60 border-border/60 hover:border-border/90 hover:bg-card/80"
                        )}
                      >
                        {/* Channel Title + Orders Row */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={cn(
                                "h-7 w-7 rounded-md flex items-center justify-center shrink-0 border shadow-2xs transition-transform duration-200 group-hover/card:scale-105",
                                row.color
                              )}
                            >
                              <ChannelIcon className="h-3.5 w-3.5" />
                            </div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-semibold text-foreground tracking-tight">{row.title}</h4>
                              {row.isCombined && (
                                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                  Summary Total
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-muted-foreground font-medium bg-muted/60 px-2.5 py-0.5 rounded-full border border-border/50">
                              {row.orders} {row.orders === 1 ? "order" : "orders"}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => goToChannelSales(row.salesTypeParam)}
                              className="h-7 px-2.5 text-xs font-medium gap-1 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors rounded-lg"
                            >
                              <span>View Details</span>
                              <ChevronRight className="h-3 w-3 transition-transform duration-200 group-hover/card:translate-x-0.5" />
                            </Button>
                          </div>
                        </div>

                        {/* 4 Metrics in Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                          {/* Metric 1: Total Sales */}
                          <div className="rounded-lg bg-background/70 border border-border/50 p-3.5 flex items-center justify-between">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Sales</p>
                              <p className="text-xl font-bold tracking-tight text-foreground mt-0.5">
                                {currency} {row.sale.toLocaleString()}
                              </p>
                            </div>
                            <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-primary/10 text-primary border border-primary/20 shrink-0">
                              <DollarSign className="h-4 w-4" />
                            </div>
                          </div>

                          {/* Metric 2: Total Cost */}
                          <div className="rounded-lg bg-background/70 border border-border/50 p-3.5 flex items-center justify-between">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Cost</p>
                              <p className="text-xl font-bold tracking-tight text-foreground mt-0.5">
                                {currency} {row.cost.toLocaleString()}
                              </p>
                            </div>
                            <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-muted/80 text-muted-foreground border border-border/50 shrink-0">
                              <Wallet className="h-4 w-4" />
                            </div>
                          </div>

                          {/* Metric 3: Total Profit */}
                          <div className="rounded-lg bg-background/70 border border-border/50 p-3.5 flex items-center justify-between">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Profit</p>
                              <p className={cn("text-xl font-bold tracking-tight mt-0.5", row.profit >= 0 ? "text-emerald-500" : "text-destructive")}>
                                {currency} {row.profit.toLocaleString()}
                              </p>
                            </div>
                            <div
                              className={cn(
                                "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border",
                                row.profit >= 0 ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-destructive/10 text-destructive border-destructive/20"
                              )}
                            >
                              <Coins className="h-4 w-4" />
                            </div>
                          </div>

                          {/* Metric 4: Profit Margin */}
                          <div className="rounded-lg bg-background/70 border border-border/50 p-3.5 flex items-center justify-between">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Profit Margin</p>
                              <p className={cn("text-xl font-bold tracking-tight mt-0.5", row.marginPct >= 0 ? "text-emerald-500" : "text-destructive")}>
                                {row.marginPct}%
                              </p>
                            </div>
                            <div
                              className={cn(
                                "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border",
                                row.marginPct >= 0 ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-destructive/10 text-destructive border-destructive/20"
                              )}
                            >
                              <Percent className="h-4 w-4" />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Charts: Sale vs Cost (2 series, validated categorical pair) and Profit
                      (1 series, colored by sign -- a status signal, not identity, so it's
                      reinforced with direct value labels + a legend key rather than color
                      alone). Same 3 channels as the cards above, same date/time filters. */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-border/50 bg-card/40 p-4">
                      <p className="text-sm font-semibold text-foreground mb-3">Sale vs Cost by Channel</p>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={channelChartData} barGap={4} barCategoryGap="24%">
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} />
                            <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${currency}${(v / 1000).toFixed(0)}k`} />
                            <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.15)", radius: 4 }} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Bar
                              dataKey="sale" name="Sale" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={40}
                              cursor="pointer"
                              onClick={(data: any) => { const p = salesTypeParamByChannel.get(data?.name); if (p) goToChannelSales(p); }}
                            />
                            <Bar
                              dataKey="cost" name="Cost" fill="hsl(var(--info))" radius={[4, 4, 0, 0]} maxBarSize={40}
                              cursor="pointer"
                              onClick={(data: any) => { const p = salesTypeParamByChannel.get(data?.name); if (p) goToChannelSales(p); }}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border/50 bg-card/40 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-semibold text-foreground">Profit by Channel</p>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500" />Profit</span>
                          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-destructive" />Loss</span>
                        </div>
                      </div>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={channelChartData} barCategoryGap="30%" margin={{ top: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} />
                            <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${currency}${(v / 1000).toFixed(0)}k`} />
                            <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.15)", radius: 4 }} />
                            <Bar
                              dataKey="profit" name="Profit" radius={[4, 4, 0, 0]} maxBarSize={48}
                              cursor="pointer"
                              onClick={(data: any) => { const p = salesTypeParamByChannel.get(data?.name); if (p) goToChannelSales(p); }}
                            >
                              {channelChartData.map((entry) => (
                                <Cell key={entry.name} fill={entry.profit >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))"} />
                              ))}
                              <LabelList
                                dataKey="profit"
                                position="top"
                                formatter={(v: number) => `${currency} ${v.toLocaleString()}`}
                                style={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
                              />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Sales by Category (same "reports" permission gate as Sales By Channel) */}
      {salesByChannelVisible && (
        <section
          aria-label="Sales by Category"
          className="rounded-2xl border border-border/80 bg-card/40 backdrop-blur-md shadow-sm overflow-hidden transition-all"
        >
          <div className={cn("p-4 sm:p-5 space-y-4 bg-card/70", !catSectionCollapsed && "border-b border-border/50")}>
            <div className="flex items-center justify-between gap-3">
              <div
                className="flex items-center gap-3 cursor-pointer select-none group"
                onClick={() => setCatSectionCollapsed((prev) => !prev)}
              >
                <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shrink-0 shadow-sm group-hover:bg-primary/20 transition-colors">
                  <Layers className="h-4 w-4" />
                </div>
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors whitespace-nowrap">
                  Sales by Category
                </h2>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCatSectionCollapsed((prev) => !prev)}
                  className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/70 gap-1.5 rounded-lg border border-border/50"
                  title={catSectionCollapsed ? "Expand Sales by Category" : "Collapse Sales by Category"}
                  aria-label={catSectionCollapsed ? "Expand Sales by Category" : "Collapse Sales by Category"}
                >
                  <span className="text-xs font-medium hidden sm:inline">
                    {catSectionCollapsed ? "Show" : "Hide"}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform duration-200",
                      catSectionCollapsed ? "-rotate-90" : "rotate-0"
                    )}
                  />
                </Button>
              </div>
            </div>

            {!catSectionCollapsed && (
              <div className="flex items-center gap-2.5 flex-wrap pt-3 border-t border-border/40">
                <div className="inline-flex items-center p-0.5 rounded-lg bg-muted/60 border border-border/60 shadow-sm">
                  {(["Today", "This Week", "This Month"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setCatRange(p)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                        catPreset === p
                          ? "bg-background text-foreground shadow-sm font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <div className="inline-flex items-center gap-1.5">
                  <div className="w-36">
                    <DatePicker
                      value={catFromStr}
                      onChange={(val) => { setCatFromStr(val); setCatPreset("Custom"); }}
                      placeholder="Start date"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground/60 font-medium px-0.5">to</span>
                  <div className="w-36">
                    <DatePicker
                      value={catToStr}
                      onChange={(val) => { setCatToStr(val); setCatPreset("Custom"); }}
                      min={catFromStr}
                      placeholder="End date"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                </div>

                <div className="inline-flex items-center gap-1">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "h-8 px-2.5 text-xs font-medium gap-1.5 border shadow-sm transition-all",
                          catTimeFrom || catTimeTo
                            ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/15"
                            : "border-border/70 bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
                        )}
                      >
                        <Clock className={cn("h-3.5 w-3.5 shrink-0", (catTimeFrom || catTimeTo) && "text-primary")} />
                        <span>
                          {catTimeFrom || catTimeTo
                            ? `${catTimeFrom ? formatTimeLabel(catTimeFrom) : "12:00 AM"} – ${catTimeTo ? formatTimeLabel(catTimeTo) : "11:59 PM"}`
                            : "All Day (Time)"}
                        </span>
                        <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-3 space-y-3" align="start">
                      <div className="flex items-center justify-between border-b border-border/40 pb-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                          <Clock className="h-3.5 w-3.5 text-primary" />
                          <span>Filter By Operating Hours</span>
                        </div>
                        {(catTimeFrom || catTimeTo) && (
                          <button
                            type="button"
                            onClick={() => { setCatTimeFrom(""); setCatTimeTo(""); }}
                            className="text-[11px] text-destructive hover:underline font-medium"
                          >
                            Reset
                          </button>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <p className="text-[11px] font-medium text-muted-foreground">Quick Shift Presets</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {[
                            { label: "Lunch Shift", from: "11:00", to: "17:00" },
                            { label: "Dinner Peak", from: "17:00", to: "23:59" },
                            { label: "Late Night", from: "23:00", to: "04:00" },
                            { label: "Full Operating Day", from: "11:00", to: "23:59" },
                          ].map((shift) => (
                            <Button
                              key={shift.label}
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => { setCatTimeFrom(shift.from); setCatTimeTo(shift.to); }}
                              className={cn(
                                "h-7 text-[11px] justify-start px-2 font-normal border-border/60",
                                catTimeFrom === shift.from && catTimeTo === shift.to
                                  ? "border-primary bg-primary/10 text-primary font-medium"
                                  : "hover:bg-muted"
                              )}
                            >
                              {shift.label}
                            </Button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-border/40">
                        <p className="text-[11px] font-medium text-muted-foreground">Custom Time Range</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-muted-foreground font-medium block mb-1">Start Time</label>
                            <TimePicker
                              value={catTimeFrom || "11:00"}
                              onChange={setCatTimeFrom}
                              className="h-8 text-xs bg-background"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground font-medium block mb-1">End Time</label>
                            <TimePicker
                              value={catTimeTo || "23:59"}
                              onChange={setCatTimeTo}
                              className="h-8 text-xs bg-background"
                            />
                          </div>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>

                  {(catTimeFrom || catTimeTo) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setCatTimeFrom(""); setCatTimeTo(""); }}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md"
                      title="Clear time filter"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          {!catSectionCollapsed && (
            <div className="p-4 sm:p-5">
              {categoryLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 rounded-lg" />
                  ))}
                </div>
              ) : categoryList.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No sales in this period.</p>
              ) : (
                <div className="space-y-4">
                  <div className="overflow-x-auto -mx-1 px-1">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Orders</TableHead>
                          <TableHead className="text-right">Sale</TableHead>
                          <TableHead className="text-right">Cost</TableHead>
                          <TableHead className="text-right">Profit</TableHead>
                          <TableHead className="text-right">Margin</TableHead>
                          <TableHead className="w-8" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {categoryList.map((c) => {
                          const empty = c.orders === 0 && c.sale === 0;
                          return (
                          <TableRow
                            key={c.name}
                            className={cn(
                              "cursor-pointer transition-colors group/row",
                              empty ? "opacity-55 hover:opacity-100 hover:bg-muted/40" : "hover:bg-primary/5"
                            )}
                            onClick={() => goToCategorySales(c.name)}
                          >
                            <TableCell className="font-medium">
                              {c.name}
                              {empty && <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">no sales</span>}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">{c.orders}</TableCell>
                            <TableCell className="text-right font-medium">{currency} {c.sale.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{currency} {c.cost.toLocaleString()}</TableCell>
                            <TableCell className={cn("text-right font-medium", empty ? "text-muted-foreground" : c.profit >= 0 ? "text-emerald-500" : "text-destructive")}>
                              {currency} {c.profit.toLocaleString()}
                            </TableCell>
                            <TableCell className={cn("text-right", empty ? "text-muted-foreground" : c.marginPct >= 0 ? "text-emerald-500" : "text-destructive")}>
                              {empty ? "—" : `${c.marginPct}%`}
                            </TableCell>
                            <TableCell className="w-8">
                              <ChevronRight className="h-4 w-4 text-muted-foreground/40 transition-all group-hover/row:text-primary group-hover/row:translate-x-0.5" />
                            </TableCell>
                          </TableRow>
                          );
                        })}
                        {categoryCombined && (
                          <TableRow
                            className="cursor-pointer border-t-2 border-emerald-500/30 bg-emerald-500/[0.04] hover:bg-emerald-500/[0.08] font-semibold group/row"
                            onClick={() => goToCategorySales(null)}
                          >
                            <TableCell className="font-bold">
                              Total
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500 ml-1.5">All Categories</span>
                            </TableCell>
                            <TableCell className="text-right">{categoryCombined.orders}</TableCell>
                            <TableCell className="text-right">{currency} {categoryCombined.sale.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{currency} {categoryCombined.cost.toLocaleString()}</TableCell>
                            <TableCell className={cn("text-right", categoryCombined.profit >= 0 ? "text-emerald-500" : "text-destructive")}>
                              {currency} {categoryCombined.profit.toLocaleString()}
                            </TableCell>
                            <TableCell className={cn("text-right", categoryCombined.marginPct >= 0 ? "text-emerald-500" : "text-destructive")}>
                              {categoryCombined.marginPct}%
                            </TableCell>
                            <TableCell className="w-8">
                              <ChevronRight className="h-4 w-4 text-emerald-500/50 transition-transform group-hover/row:translate-x-0.5" />
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Charts: top 8 categories that actually sold + "Other". Sale/Cost use this
                      app's one validated categorical pair (--primary / --info); Profit is
                      colored by sign (a status signal, not identity) and reinforced with direct
                      value labels + a legend key rather than color alone — same treatment as
                      Sales By Channel. Hidden entirely when nothing sold this period. */}
                  {catChartData.length > 0 && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-border/50 bg-card/40 p-4">
                      <p className="text-sm font-semibold text-foreground mb-3">Sale vs Cost by Category</p>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={catChartData} barGap={4} barCategoryGap="24%">
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} interval={0} angle={-20} textAnchor="end" height={54} />
                            <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${currency}${(v / 1000).toFixed(0)}k`} />
                            <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.15)", radius: 4 }} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Bar
                              dataKey="sale" name="Sale" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={36}
                              cursor="pointer"
                              onClick={(data: any) => { if (data?.name && data.name !== "Other") goToCategorySales(data.name); }}
                            />
                            <Bar
                              dataKey="cost" name="Cost" fill="hsl(var(--info))" radius={[4, 4, 0, 0]} maxBarSize={36}
                              cursor="pointer"
                              onClick={(data: any) => { if (data?.name && data.name !== "Other") goToCategorySales(data.name); }}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border/50 bg-card/40 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-semibold text-foreground">Profit by Category</p>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500" />Profit</span>
                          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-destructive" />Loss</span>
                        </div>
                      </div>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={catChartData} barCategoryGap="30%" margin={{ top: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} interval={0} angle={-20} textAnchor="end" height={54} />
                            <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${currency}${(v / 1000).toFixed(0)}k`} />
                            <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.15)", radius: 4 }} />
                            <Bar
                              dataKey="profit" name="Profit" radius={[4, 4, 0, 0]} maxBarSize={44}
                              cursor="pointer"
                              onClick={(data: any) => { if (data?.name && data.name !== "Other") goToCategorySales(data.name); }}
                            >
                              {catChartData.map((entry) => (
                                <Cell key={entry.name} fill={entry.profit >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))"} />
                              ))}
                              <LabelList
                                dataKey="profit"
                                position="top"
                                formatter={(v: number) => `${currency} ${v.toLocaleString()}`}
                                style={{ fontSize: 10, fill: "hsl(var(--foreground))" }}
                              />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Sales by Payment Method (same "reports" permission gate) */}
      {salesByChannelVisible && (
        <section
          aria-label="Sales by Payment Method"
          className="rounded-2xl border border-border/80 bg-card/40 backdrop-blur-md shadow-sm overflow-hidden transition-all"
        >
          <div className={cn("p-4 sm:p-5 space-y-4 bg-card/70", !paySectionCollapsed && "border-b border-border/50")}>
            <div className="flex items-center justify-between gap-3">
              <div
                className="flex items-center gap-3 cursor-pointer select-none group"
                onClick={() => setPaySectionCollapsed((prev) => !prev)}
              >
                <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shrink-0 shadow-sm group-hover:bg-primary/20 transition-colors">
                  <CreditCard className="h-4 w-4" />
                </div>
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors whitespace-nowrap">
                  Sales by Payment Method
                </h2>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPaySectionCollapsed((prev) => !prev)}
                  className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/70 gap-1.5 rounded-lg border border-border/50"
                  title={paySectionCollapsed ? "Expand Sales by Payment Method" : "Collapse Sales by Payment Method"}
                  aria-label={paySectionCollapsed ? "Expand Sales by Payment Method" : "Collapse Sales by Payment Method"}
                >
                  <span className="text-xs font-medium hidden sm:inline">
                    {paySectionCollapsed ? "Show" : "Hide"}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform duration-200",
                      paySectionCollapsed ? "-rotate-90" : "rotate-0"
                    )}
                  />
                </Button>
              </div>
            </div>

            {!paySectionCollapsed && (
              <div className="flex items-center gap-2.5 flex-wrap pt-3 border-t border-border/40">
                <div className="inline-flex items-center p-0.5 rounded-lg bg-muted/60 border border-border/60 shadow-sm">
                  {(["Today", "This Week", "This Month"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPayRange(p)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                        payPreset === p
                          ? "bg-background text-foreground shadow-sm font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <div className="inline-flex items-center gap-1.5">
                  <div className="w-36">
                    <DatePicker
                      value={payFromStr}
                      onChange={(val) => { setPayFromStr(val); setPayPreset("Custom"); }}
                      placeholder="Start date"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground/60 font-medium px-0.5">to</span>
                  <div className="w-36">
                    <DatePicker
                      value={payToStr}
                      onChange={(val) => { setPayToStr(val); setPayPreset("Custom"); }}
                      min={payFromStr}
                      placeholder="End date"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                </div>

                <div className="inline-flex items-center gap-1">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "h-8 px-2.5 text-xs font-medium gap-1.5 border shadow-sm transition-all",
                          payTimeFrom || payTimeTo
                            ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/15"
                            : "border-border/70 bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
                        )}
                      >
                        <Clock className={cn("h-3.5 w-3.5 shrink-0", (payTimeFrom || payTimeTo) && "text-primary")} />
                        <span>
                          {payTimeFrom || payTimeTo
                            ? `${payTimeFrom ? formatTimeLabel(payTimeFrom) : "12:00 AM"} – ${payTimeTo ? formatTimeLabel(payTimeTo) : "11:59 PM"}`
                            : "All Day (Time)"}
                        </span>
                        <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-3 space-y-3" align="start">
                      <div className="flex items-center justify-between border-b border-border/40 pb-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                          <Clock className="h-3.5 w-3.5 text-primary" />
                          <span>Filter By Operating Hours</span>
                        </div>
                        {(payTimeFrom || payTimeTo) && (
                          <button
                            type="button"
                            onClick={() => { setPayTimeFrom(""); setPayTimeTo(""); }}
                            className="text-[11px] text-destructive hover:underline font-medium"
                          >
                            Reset
                          </button>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <p className="text-[11px] font-medium text-muted-foreground">Quick Shift Presets</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {[
                            { label: "Lunch Shift", from: "11:00", to: "17:00" },
                            { label: "Dinner Peak", from: "17:00", to: "23:59" },
                            { label: "Late Night", from: "23:00", to: "04:00" },
                            { label: "Full Operating Day", from: "11:00", to: "23:59" },
                          ].map((shift) => (
                            <Button
                              key={shift.label}
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => { setPayTimeFrom(shift.from); setPayTimeTo(shift.to); }}
                              className={cn(
                                "h-7 text-[11px] justify-start px-2 font-normal border-border/60",
                                payTimeFrom === shift.from && payTimeTo === shift.to
                                  ? "border-primary bg-primary/10 text-primary font-medium"
                                  : "hover:bg-muted"
                              )}
                            >
                              {shift.label}
                            </Button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-border/40">
                        <p className="text-[11px] font-medium text-muted-foreground">Custom Time Range</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-muted-foreground font-medium block mb-1">Start Time</label>
                            <TimePicker
                              value={payTimeFrom || "11:00"}
                              onChange={setPayTimeFrom}
                              className="h-8 text-xs bg-background"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground font-medium block mb-1">End Time</label>
                            <TimePicker
                              value={payTimeTo || "23:59"}
                              onChange={setPayTimeTo}
                              className="h-8 text-xs bg-background"
                            />
                          </div>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>

                  {(payTimeFrom || payTimeTo) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setPayTimeFrom(""); setPayTimeTo(""); }}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md"
                      title="Clear time filter"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          {!paySectionCollapsed && (
            <div className="p-4 sm:p-5">
              {payLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 rounded-lg" />
                  ))}
                </div>
              ) : payMethods.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No settled sales in this period.</p>
              ) : (
                <div className="space-y-4">
                  {/* Cash vs Digital tiles */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl bg-primary/[0.04] border border-primary/25 p-4 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cash Collected</p>
                        <p className="text-xl font-bold tracking-tight text-foreground mt-0.5">
                          {currency} {(payCombined?.cashAmount ?? 0).toLocaleString()}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{payHasActivity ? `${payCombined?.cashSharePct ?? 0}% of collected` : "—"}</p>
                      </div>
                      <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-primary/10 text-primary border border-primary/20 shrink-0">
                        <Banknote className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="rounded-xl bg-info/[0.04] border border-info/25 p-4 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Digital Collected</p>
                        <p className="text-xl font-bold tracking-tight text-foreground mt-0.5">
                          {currency} {(payCombined?.digitalAmount ?? 0).toLocaleString()}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{payHasActivity ? `${100 - (payCombined?.cashSharePct ?? 0)}% of collected` : "—"}</p>
                      </div>
                      <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-info/10 text-info border border-info/20 shrink-0">
                        <Smartphone className="h-4 w-4" />
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto -mx-1 px-1">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableHead>Method</TableHead>
                          <TableHead className="text-right">Orders</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">% of Total</TableHead>
                          <TableHead className="w-8" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payMethods.map((m) => {
                          const empty = m.amount === 0 && m.orders === 0;
                          return (
                          <TableRow
                            key={m.method}
                            className={cn(
                              "cursor-pointer transition-colors group/row",
                              empty ? "opacity-55 hover:opacity-100 hover:bg-muted/40" : "hover:bg-primary/5"
                            )}
                            onClick={() => goToPaymentSales(m.method)}
                          >
                            <TableCell className="font-medium">
                              <span className="inline-flex items-center gap-2">
                                <span
                                  className={cn(
                                    "h-2 w-2 rounded-sm shrink-0",
                                    m.method.toLowerCase() === "cash" ? "bg-primary" : "bg-info"
                                  )}
                                />
                                {m.method}
                                {empty && <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">no sales</span>}
                              </span>
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">{m.orders}</TableCell>
                            <TableCell className="text-right font-medium">{currency} {m.amount.toLocaleString()}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{empty ? "—" : `${m.sharePct}%`}</TableCell>
                            <TableCell className="w-8">
                              <ChevronRight className="h-4 w-4 text-muted-foreground/40 transition-all group-hover/row:text-primary group-hover/row:translate-x-0.5" />
                            </TableCell>
                          </TableRow>
                          );
                        })}
                        {payCombined && (
                          <TableRow
                            className="cursor-pointer border-t-2 border-emerald-500/30 bg-emerald-500/[0.04] hover:bg-emerald-500/[0.08] font-semibold group/row"
                            onClick={() => goToPaymentSales(null)}
                          >
                            <TableCell className="font-bold">
                              Total
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500 ml-1.5">All Methods</span>
                            </TableCell>
                            <TableCell className="text-right">{payCombined.orders}</TableCell>
                            <TableCell className="text-right">{currency} {payCombined.amount.toLocaleString()}</TableCell>
                            <TableCell className="text-right">100%</TableCell>
                            <TableCell className="w-8">
                              <ChevronRight className="h-4 w-4 text-emerald-500/50 transition-transform group-hover/row:translate-x-0.5" />
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Amount by method — bars colored Cash (--primary) vs Digital (--info), the
                      validated categorical pair used here as a real 2-class encoding, with a
                      legend key + direct value labels. Hidden when nothing collected. */}
                  {payChartData.length > 0 && (
                  <div className="rounded-xl border border-border/50 bg-card/40 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-semibold text-foreground">Amount by Payment Method</p>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-primary" />Cash</span>
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-info" />Digital</span>
                      </div>
                    </div>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={payChartData} barCategoryGap="28%" margin={{ top: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} interval={0} angle={-20} textAnchor="end" height={54} />
                          <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${currency}${(v / 1000).toFixed(0)}k`} />
                          <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.15)", radius: 4 }} />
                          <Bar
                            dataKey="amount" name="Amount" radius={[4, 4, 0, 0]} maxBarSize={44}
                            cursor="pointer"
                            onClick={(data: any) => { if (data?.name) goToPaymentSales(data.name); }}
                          >
                            {payChartData.map((entry) => (
                              <Cell key={entry.name} fill={entry.name.toLowerCase() === "cash" ? "hsl(var(--primary))" : "hsl(var(--info))"} />
                            ))}
                            <LabelList
                              dataKey="amount"
                              position="top"
                              formatter={(v: number) => `${currency} ${v.toLocaleString()}`}
                              style={{ fontSize: 10, fill: "hsl(var(--foreground))" }}
                            />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

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

      {/* Charts Row: Day-wise Sales & Payment Methods */}
      <div className={cn("grid grid-cols-1 gap-4", tileVisible("payment-methods") ? "lg:grid-cols-2" : "")}>
        {/* Day-wise Sales (This Week) */}
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Day-wise Sales (This Week)
          </h3>
          <ClickableCard interactive={salesDrillEnabled} onClick={goToSales} className="h-[calc(100%-2rem)]">
            <CardContent className="p-5 flex flex-col justify-between h-full">
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d?.daywiseSales ?? []} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.15)", radius: 4 }} />
                    <Bar dataKey="sales" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </ClickableCard>
        </div>

        {/* Payment Methods (This Month) */}
        {tileVisible("payment-methods") && (
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Payment Methods (This Month)
            </h3>
            <ClickableCard interactive onClick={() => goToTile("payment-methods")} className="h-[calc(100%-2rem)]">
              <CardContent className="p-5">
                {pays.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-10 text-center">No payments this month</p>
                ) : (
                  <div className="space-y-3 pt-1">
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
      </div>

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
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          const row = payload[0].payload as { orders: number; revenue: number };
                          return (
                            <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-sm">
                              <p className="font-medium mb-1">{label}</p>
                              <p className="text-muted-foreground">{row.orders} orders</p>
                              <p className="text-muted-foreground">{currency} {row.revenue.toLocaleString()} revenue</p>
                            </div>
                          );
                        }}
                        cursor={{ fill: "hsl(var(--muted) / 0.15)", radius: 4 }}
                      />
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
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.15)", radius: 4 }} />
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
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.15)", radius: 4 }} />
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
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          const row = payload[0].payload as { orderCount: number; avgSales: number };
                          return (
                            <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-sm">
                              <p className="font-medium mb-1">{label}</p>
                              <p className="text-muted-foreground">Avg order: {currency} {row.avgSales.toLocaleString()}</p>
                              <p className="text-muted-foreground">{row.orderCount} orders</p>
                            </div>
                          );
                        }}
                        cursor={{ fill: "hsl(var(--muted) / 0.15)", radius: 4 }}
                      />
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

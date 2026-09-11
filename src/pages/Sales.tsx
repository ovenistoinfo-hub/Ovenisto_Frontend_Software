import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import {
  Search,
  Receipt,
  Download,
  FileX,
  Loader2,
  Clock,
  X,
  ChevronDown,
  DollarSign,
  Wallet,
  Coins,
  Percent,
  UtensilsCrossed,
  ShoppingBag,
  Bike,
  Tags,
  Tag,
  UserCheck,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker, formatTimeLabel } from "@/components/ui/time-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TablePagination } from "@/components/TablePagination";
import { orderService, type OrderRecord } from "@/services/order.service";
import { menuService } from "@/services/menu.service";
import { dealService } from "@/services/deal.service";
import { userService } from "@/services/user.service";
import { useData } from "@/contexts/DataContext";
import { useOrderEvents } from "@/hooks/use-order-events";
import { useVisiblePolling } from "@/hooks/use-visible-polling";
import { OrderPlacedPrintModal, type PlacedOrderSlipData } from "@/components/pos/OrderPlacedPrintModal";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

const CHANNELS = [
  { label: "All", value: "All", icon: null },
  { label: "Dine In", value: "Dine In", icon: UtensilsCrossed },
  { label: "Take Away", value: "Take Away", icon: ShoppingBag },
  { label: "Delivery", value: "Delivery", icon: Bike },
] as const;

// Roles that actually place/manage sales orders -- Kitchen Staff, Riders, Accountant, etc.
// never show up as Order.staffId in practice, so listing them in the Staff filter would just be
// noise.
const SALES_STAFF_ROLES = ["Waiter", "Cashier", "Manager", "Admin", "Floor Manager"];

/** "YYYY-MM-DD" from local Y/M/D parts — never `.toISOString()`, which reads a Date as UTC and
 *  lands a day early in Pakistan (same reasoning as DatePicker's own toYmd). */
function toYmd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A self-order redemption is table-based dine-in ordering by nature — this page displays and
 *  filters it as one channel with Dine In rather than a separate, unstyled "Self Order" type.
 *  Display-only: OrderRecord/other pages' type rendering is untouched. */
function displayOrderType(type: string): string {
  return type === "Self Order" ? "Dine In" : type;
}

/** Normalizes the Payment column/receipt to one consistent word for "nothing collected yet" —
 *  this page previously mixed a bare "—" and a literal "Pending" string for what is the same
 *  underlying state. A real payment string has its "Rs.NNN" amount stripped per method — the
 *  Total column already shows the amount, so repeating it here ("JazzCash: Rs.1,507") was
 *  redundant; a split payment keeps each method name, comma-separated ("Cash, JazzCash"). */
function formatPaymentMethod(method: string | null): { label: string; muted: boolean } {
  const trimmed = (method ?? "").trim();
  if (!trimmed || trimmed.toLowerCase() === "pending") {
    return { label: "Unpaid", muted: true };
  }
  const label = trimmed
    .split(",")
    .map((segment) => segment.replace(/:\s*(Rs\.?|PKR)\s*[\d,]+(\.\d+)?/i, "").trim())
    .filter(Boolean)
    .join(", ");
  return { label: label || trimmed, muted: false };
}

const Sales = () => {
  const { settings } = useData();
  const currency = settings.currency || "Rs.";
  const queryClient = useQueryClient();

  // Arriving from the Dashboard's Sales By Channel "View Details" pre-fills every filter
  // below from the URL (?type=&status=&from=&to=&fromTime=&toTime=) so the drill-down shows
  // exactly what that card/chart totalled — read once on mount, not kept in sync afterwards
  // (the user is free to change filters here without it fighting back).
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const initialType = searchParams.get("type");
  const [typeFilter, setTypeFilter] = useState(() => {
    if (!initialType || initialType === "Dine In,Take Away,Delivery") return "All";
    return initialType;
  });
  const [page, setPage] = useState(1);

  // Date range — presets set dateFrom/dateTo directly; picking either DatePicker by hand is
  // implicitly "Custom" (no separate Custom button needed, matches Reports.tsx's own filter bar).
  const initialFrom = searchParams.get("from") || "";
  const initialTo = searchParams.get("to") || "";
  const [activePreset, setActivePreset] = useState<string | null>(() => {
    if (!initialFrom && !initialTo) return null;
    const today = toYmd(new Date());
    if (initialFrom === today && initialTo === today) return "Today";
    return null;
  });
  const [dateFrom, setDateFrom] = useState(initialFrom);
  const [dateTo, setDateTo] = useState(initialTo);

  // Time-of-day: optional narrowing via Popover, defaults to all-day when empty
  const [timeFrom, setTimeFrom] = useState(() => searchParams.get("fromTime") || "");
  const [timeTo, setTimeTo] = useState(() => searchParams.get("toTime") || "");

  // Food-category filter — "" means no filter. Arriving from the Dashboard "Sales by Category"
  // drill-down pre-selects one via ?category=. When set, the backend narrows every order's
  // Sale/Cost/Profit (and the 4 summary cards) to just that category's slice of each order.
  const [categoryFilter, setCategoryFilter] = useState(() => searchParams.get("category") || "");
  const catActive = Boolean(categoryFilter);

  // Payment-method filter — "" means no filter. Arriving from the Dashboard "Sales by Payment
  // Method" drill-down pre-selects one via ?paymentMethod=. Split-aware on the backend: an order
  // paid "Cash: Rs.900, JazzCash: Rs.779" matches BOTH methods; amounts stay whole-order.
  const [paymentMethodFilter, setPaymentMethodFilter] = useState(() => searchParams.get("paymentMethod") || "");
  const payActive = Boolean(paymentMethodFilter);

  // Deal filter — "" means no filter. Arriving from the Dashboard "Deals Performance" drill-down
  // pre-selects one via ?deal=<dealId>. Keyed by id (not name, unlike category/paymentMethod) —
  // a deal name isn't guaranteed unique across a deleted+recreated deal. `?dealName=` rides
  // along display-only, for the synthetic-option fallback below when the id isn't in the live
  // deals list (deal deleted, or arrived before the list finished loading).
  const [dealFilter, setDealFilter] = useState(() => searchParams.get("deal") || "");
  const [dealFilterName, setDealFilterName] = useState(() => searchParams.get("dealName") || "");
  const dealActive = Boolean(dealFilter);

  // Staff filter — "" means no filter. Arriving from the Dashboard "Sales by Staff" drill-down
  // pre-selects one via ?staffId=<id>. Keyed by id (not name) since getStaffPicker returns ids;
  // `?staffName=` rides along display-only, for the synthetic-option fallback below when the id
  // isn't in the fetched staff list. Amounts stay whole-order, same as paymentMethod.
  const [staffFilter, setStaffFilter] = useState(() => searchParams.get("staffId") || "");
  const [staffFilterName, setStaffFilterName] = useState(() => searchParams.get("staffName") || "");
  const staffActive = Boolean(staffFilter);

  // Drill-down navigations (Dashboard -> Sales) land on this SAME route, just with a different
  // query string — React Router does NOT remount this component for that, so the "seed once on
  // mount" useState initializers above never re-run for a SECOND (or Nth) drill-down click while
  // this tab stays open: the URL bar updates but the filters silently don't (the bug a staff
  // drill-down surfaced — its chip never appeared because staffFilter was still whatever an
  // earlier click, or nothing, had left it at). This effect re-seeds every URL-driven filter
  // whenever the query string itself changes (a real new navigation). It does NOT fight the
  // user's own in-page edits — those never touch the URL (see each filter's own comment above),
  // so `searchParams`'s reference stays stable across them and this effect simply doesn't refire.
  useEffect(() => {
    const type = searchParams.get("type");
    setTypeFilter(!type || type === "Dine In,Take Away,Delivery" ? "All" : type);

    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";
    const today = toYmd(new Date());
    setActivePreset(!from && !to ? null : (from === today && to === today ? "Today" : null));
    setDateFrom(from);
    setDateTo(to);

    setTimeFrom(searchParams.get("fromTime") || "");
    setTimeTo(searchParams.get("toTime") || "");
    setCategoryFilter(searchParams.get("category") || "");
    setPaymentMethodFilter(searchParams.get("paymentMethod") || "");
    setDealFilter(searchParams.get("deal") || "");
    setDealFilterName(searchParams.get("dealName") || "");
    setStaffFilter(searchParams.get("staffId") || "");
    setStaffFilterName(searchParams.get("staffName") || "");
    setPage(1);
  }, [searchParams]);

  const [receiptSlip, setReceiptSlip] = useState<PlacedOrderSlipData | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);

  // Sales & Orders is settled sales history, so it exclusively shows completed orders.
  // Status filter buttons are removed per design; if a URL status is explicitly given, respect it.
  const statusParam = searchParams.get("status") && searchParams.get("status") !== "All"
    ? searchParams.get("status")!
    : "completed";

  const { data: resp, isLoading: loading } = useQuery({
    queryKey: ["orders", { search, typeFilter, statusParam, dateFrom, dateTo, timeFrom, timeTo, categoryFilter, paymentMethodFilter, dealFilter, staffFilter, page }],
    queryFn: () => orderService.getOrders({
      search: search || undefined,
      status: statusParam,
      type: typeFilter !== "All" ? typeFilter : undefined,
      from: dateFrom || undefined,
      to: dateTo || undefined,
      fromTime: timeFrom || undefined,
      toTime: timeTo || undefined,
      category: categoryFilter || undefined,
      paymentMethod: paymentMethodFilter || undefined,
      deal: dealFilter || undefined,
      staffId: staffFilter || undefined,
      // This is order HISTORY -- a completed-but-unpaid order isn't a settled sale yet, so it
      // never belongs here (unlike Kitchen Panel/Order Monitor/Waiter Panel, which still need
      // to see it to actually collect payment).
      excludeUnpaid: true,
      page,
      limit: PAGE_SIZE,
    }),
  });
  const orders = resp?.data ?? [];
  const total = resp?.meta?.total ?? orders.length;

  // Active food categories for the filter dropdown.
  const { data: categories = [] } = useQuery({
    queryKey: ["menu-categories-active"],
    queryFn: () => menuService.getCategories("active"),
    staleTime: 5 * 60_000,
  });

  // Deals for the filter dropdown.
  const { data: deals = [] } = useQuery({
    queryKey: ["deals-all"],
    queryFn: () => dealService.getDeals(),
    staleTime: 5 * 60_000,
  });
  // The dropdown/hint show a real name even for a deal outside the fetched list (deleted, or
  // the list hasn't loaded yet) — prefer the live name, fall back to what arrived in the URL.
  const dealDisplayName = deals.find((d) => d.id === dealFilter)?.name || dealFilterName || dealFilter;

  // Staff for the filter dropdown — getStaffPicker (not the Manager+-only getUsers) is what
  // every POS-facing role, including Cashier, is already allowed to call. Restricted to
  // SALES_STAFF_ROLES.
  const { data: staffOptions = [] } = useQuery({
    queryKey: ["staff-picker", SALES_STAFF_ROLES],
    queryFn: () => userService.getStaffPicker(SALES_STAFF_ROLES),
    staleTime: 5 * 60_000,
  });
  const staffDisplayName = staffOptions.find((s) => s.id === staffFilter)?.name || staffFilterName || staffFilter;

  // Sale/Cost/Profit/Margin totalled across every order the current filters match (not just
  // this page) -- the 4 summary cards below. Independent of `page` on purpose: changing pages
  // must not refetch it, and it must not force the table to re-fetch either.
  const { data: summary } = useQuery({
    queryKey: ["orders-summary", { search, typeFilter, statusParam, dateFrom, dateTo, timeFrom, timeTo, categoryFilter, paymentMethodFilter, dealFilter, staffFilter }],
    queryFn: () => orderService.getOrdersSummary({
      search: search || undefined,
      status: statusParam,
      type: typeFilter !== "All" ? typeFilter : undefined,
      from: dateFrom || undefined,
      to: dateTo || undefined,
      fromTime: timeFrom || undefined,
      toTime: timeTo || undefined,
      category: categoryFilter || undefined,
      paymentMethod: paymentMethodFilter || undefined,
      deal: dealFilter || undefined,
      staffId: staffFilter || undefined,
      excludeUnpaid: true,
    }),
  });

  // Push-first real-time: order:created/updated/deleted invalidate immediately; the 180s poll
  // (this app's standard interval for socket-backed page data) is a safety net only, and stops
  // entirely while the tab is hidden.
  const refreshOrders = () => {
    queryClient.invalidateQueries({ queryKey: ["orders"] });
    queryClient.invalidateQueries({ queryKey: ["orders-summary"] });
  };
  useOrderEvents(refreshOrders);
  useVisiblePolling(refreshOrders, 180_000);

  // Reset to page 1 when filters change
  const handleSearch = (v: string) => { setSearch(v); setPage(1); };
  const handleType = (v: string) => { setTypeFilter(v); setPage(1); };
  const handleCategory = (v: string) => { setCategoryFilter(v === "all" ? "" : v); setPage(1); };
  const handlePaymentMethod = (v: string) => { setPaymentMethodFilter(v === "all" ? "" : v); setPage(1); };
  const handleDeal = (v: string) => { setDealFilter(v === "all" ? "" : v); setPage(1); };
  const handleStaff = (v: string) => { setStaffFilter(v === "all" ? "" : v); setPage(1); };

  // Payment methods for the dropdown — the restaurant's configured list (DataContext mirrors
  // Settings), with a fallback so it's never empty.
  const paymentMethodOptions = (settings.paymentMethods && settings.paymentMethods.length > 0)
    ? settings.paymentMethods
    : ["Cash", "JazzCash", "EasyPaisa", "Credit Card", "Account"];

  // When a category filter is active the backend attaches each order's category-scoped slice;
  // the Total/Cost/Profit columns (and export) show that instead of the whole-order figure so
  // they reconcile with the Dashboard "Sales by Category" card the user drilled in from.
  // deal takes priority over category when both filters happen to be active (mirrors the
  // backend's identical priority in getOrders — deal-slice checked before category-slice).
  const rowSale = (o: OrderRecord) => (dealActive ? Number(o.dealSale ?? 0) : catActive ? Number(o.categorySale ?? 0) : Number(o.total));
  const rowCost = (o: OrderRecord) => (dealActive ? Number(o.dealCost ?? 0) : catActive ? Number(o.categoryCost ?? 0) : Number(o.cost ?? 0));
  const rowProfit = (o: OrderRecord) => (dealActive ? Number(o.dealProfit ?? 0) : catActive ? Number(o.categoryProfit ?? 0) : Number(o.profit ?? 0));

  const applyPreset = (preset: "Today" | "This Week" | "This Month") => {
    const now = new Date();
    if (preset === "Today") {
      setDateFrom(toYmd(now)); setDateTo(toYmd(now));
    } else if (preset === "This Week") {
      const from = new Date(now); from.setDate(from.getDate() - 7);
      setDateFrom(toYmd(from)); setDateTo(toYmd(now));
    } else {
      setDateFrom(toYmd(new Date(now.getFullYear(), now.getMonth(), 1))); setDateTo(toYmd(now));
    }
    setActivePreset(preset);
    setPage(1);
  };
  const handleDateFrom = (v: string) => { setDateFrom(v); setActivePreset(null); setPage(1); };
  const handleDateTo = (v: string) => { setDateTo(v); setActivePreset(null); setPage(1); };
  const clearDates = () => { setDateFrom(""); setDateTo(""); setActivePreset(null); setPage(1); };
  const clearTime = () => { setTimeFrom(""); setTimeTo(""); setPage(1); };

  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    try {
      setExporting(true);
      // Export all orders matching the active filters (up to 10,000)
      const res = await orderService.getOrders({
        search: search || undefined,
        status: statusParam,
        type: typeFilter !== "All" ? typeFilter : undefined,
        from: dateFrom || undefined,
        to: dateTo || undefined,
        fromTime: timeFrom || undefined,
        toTime: timeTo || undefined,
        category: categoryFilter || undefined,
        paymentMethod: paymentMethodFilter || undefined,
        deal: dealFilter || undefined,
        staffId: staffFilter || undefined,
        excludeUnpaid: true,
        page: 1,
        limit: 10000,
      });
      const exportOrders = res.data?.length ? res.data : orders;

      const saleHead = dealActive ? `Sale (${dealDisplayName})` : catActive ? `Sale (${categoryFilter})` : "Total";
      const costHead = dealActive ? `Cost (${dealDisplayName})` : catActive ? `Cost (${categoryFilter})` : "Cost";
      const profitHead = dealActive ? `Profit (${dealDisplayName})` : catActive ? `Profit (${categoryFilter})` : "Profit";
      const headers = ["Order #", "Date", "Time", "Customer", "Type", "Items", saleHead, costHead, profitHead, "Payment Method"];
      const rows = exportOrders.map((o) => [
        o.orderNumber,
        o.date ? new Date(o.date).toLocaleDateString() : "",
        o.time || "",
        o.customerName || "Walk-in",
        displayOrderType(o.type),
        String(o.items.length),
        String(rowSale(o)),
        String(rowCost(o)),
        String(rowProfit(o)),
        formatPaymentMethod(o.paymentMethod).label,
      ]);
      const csvContent = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sales-orders-export-${toYmd(new Date())}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString() : "—";

  // Same receipt component Order Monitor uses for a settled order (OrderStatusBoard.tsx's
  // handleOpenPrintModal) — this is the one "View Receipt" action for both pages, not a third
  // bespoke implementation. Mirrors its exact field mapping.
  const handleViewReceipt = (order: OrderRecord) => {
    setReceiptSlip({
      orderNumber: order.orderNumber,
      orderType: displayOrderType(order.type),
      tableNumber: order.tableNumber,
      customerName: order.customerName || "Walk-in",
      customerPhone: order.phone || undefined,
      customerAddress: order.deliveryAddress || undefined,
      staffName: order.staffName || order.acceptedByName || undefined,
      items: order.items.map((i) => ({
        id: i.id,
        name: i.name,
        qty: Number(i.qty) || 1,
        price: Number(i.price) || 0,
        discount: Number(i.discount) || 0,
        modifiers: i.modifiers || [],
        notes: i.notes || null,
        dealName: i.dealName || null,
      })),
      subtotal: Number(order.subtotal) || 0,
      discount: Number(order.discount) || 0,
      tax: Number(order.tax) || 0,
      total: Number(order.total) || 0,
      advancePayment: order.advancePayment ? Number(order.advancePayment) : undefined,
      netPayable: Number(order.total) - Number(order.advancePayment || 0),
      paymentMethod: formatPaymentMethod(order.paymentMethod).label,
      dateStr: formatDate(order.date),
      timeStr: order.time || undefined,
      restaurantName: settings.restaurantName,
      restaurantAddress: settings.address,
      restaurantPhone: settings.phone,
      currency,
    });
    setShowReceipt(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Receipt className="h-5 w-5" />}
        title="Sales & Orders"
        subtitle="View all orders and history"
        actions={
          <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Export
          </Button>
        }
      />

      {/* Totals for whichever filters are currently active above -- not just the visible page */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="shadow-sm border-border/80">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Sales</p>
              <p className="text-xl font-bold mt-1 tracking-tight">{currency} {(summary?.sale ?? 0).toLocaleString()}</p>
            </div>
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-500/20 shrink-0">
              <DollarSign className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/80">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Cost</p>
              <p className="text-xl font-bold mt-1 tracking-tight">{currency} {(summary?.cost ?? 0).toLocaleString()}</p>
            </div>
            <div className="h-9 w-9 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center border border-amber-500/20 shrink-0">
              <Wallet className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/80">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Profit</p>
              <p className={`text-xl font-bold mt-1 tracking-tight ${(summary?.profit ?? 0) >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                {currency} {(summary?.profit ?? 0).toLocaleString()}
              </p>
            </div>
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-500/20 shrink-0">
              <Coins className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/80">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Margin</p>
              <p className={`text-xl font-bold mt-1 tracking-tight ${(summary?.marginPct ?? 0) >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                {summary?.marginPct ?? 0}%
              </p>
            </div>
            <div className="h-9 w-9 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center border border-blue-500/20 shrink-0">
              <Percent className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm border-border/80">
        <CardHeader className="pb-3 space-y-3">
          {/* Row 1: Search + Channel Filter Segmented Control */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search orders..."
                className="pl-9 h-9 text-xs bg-background"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => handleSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="inline-flex items-center p-0.5 rounded-lg bg-muted/60 border border-border/60 shadow-sm self-start sm:self-auto flex-wrap">
              {CHANNELS.map(({ label, value, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleType(value)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                    typeFilter === value
                      ? "bg-background text-foreground shadow-sm font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {Icon && <Icon className="h-3.5 w-3.5" />}
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Row 2: Date Presets + Date Range Capsule + Time Filter Popover */}
          <div className="flex items-center gap-2.5 flex-wrap pt-2.5 border-t border-border/40">
            {/* Presets Segmented Control */}
            <div className="inline-flex items-center p-0.5 rounded-lg bg-muted/60 border border-border/60 shadow-sm">
              {(["Today", "This Week", "This Month"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                    activePreset === p
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
                  value={dateFrom}
                  onChange={handleDateFrom}
                  placeholder="Start date"
                  className="h-8 text-xs bg-background"
                />
              </div>
              <span className="text-xs text-muted-foreground/60 font-medium px-0.5">to</span>
              <div className="w-36">
                <DatePicker
                  value={dateTo}
                  onChange={handleDateTo}
                  min={dateFrom || undefined}
                  placeholder="End date"
                  className="h-8 text-xs bg-background"
                />
              </div>
              {(dateFrom || dateTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearDates}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md"
                  title="Clear date filter"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
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
                      timeFrom || timeTo
                        ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/15"
                        : "border-border/70 bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                  >
                    <Clock className={cn("h-3.5 w-3.5 shrink-0", (timeFrom || timeTo) && "text-primary")} />
                    <span>
                      {timeFrom || timeTo
                        ? `${timeFrom ? formatTimeLabel(timeFrom) : "12:00 AM"} – ${timeTo ? formatTimeLabel(timeTo) : "11:59 PM"}`
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
                    {(timeFrom || timeTo) && (
                      <button
                        type="button"
                        onClick={clearTime}
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
                            setTimeFrom(shift.from);
                            setTimeTo(shift.to);
                            setPage(1);
                          }}
                          className={cn(
                            "h-7 text-[11px] justify-start px-2 font-normal border-border/60",
                            timeFrom === shift.from && timeTo === shift.to
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
                          value={timeFrom || "11:00"}
                          onChange={(v) => {
                            setTimeFrom(v);
                            setPage(1);
                          }}
                          className="h-8 text-xs bg-background"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground font-medium block mb-1">End Time</label>
                        <TimePicker
                          value={timeTo || "23:59"}
                          onChange={(v) => {
                            setTimeTo(v);
                            setPage(1);
                          }}
                          className="h-8 text-xs bg-background"
                        />
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              {(timeFrom || timeTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearTime}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md"
                  title="Clear time filter"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            {/* Food-category filter */}
            <div className="inline-flex items-center gap-1">
              <Select value={categoryFilter || "all"} onValueChange={handleCategory}>
                <SelectTrigger
                  className={cn(
                    "h-8 text-xs gap-1.5 border shadow-sm min-w-[9rem] transition-all",
                    catActive
                      ? "border-border/80 bg-background text-foreground font-semibold shadow-sm"
                      : "border-border/70 bg-background text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Tags className={cn("h-3.5 w-3.5 shrink-0", catActive ? "text-foreground" : "text-muted-foreground")} />
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {catActive && !categories.some((c) => c.name === categoryFilter) && (
                    <SelectItem value={categoryFilter}>{categoryFilter}</SelectItem>
                  )}
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {catActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCategory("all")}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md"
                  title="Clear category filter"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            {/* Payment-method filter */}
            <div className="inline-flex items-center gap-1">
              <Select value={paymentMethodFilter || "all"} onValueChange={handlePaymentMethod}>
                <SelectTrigger
                  className={cn(
                    "h-8 text-xs gap-1.5 border shadow-sm min-w-[9rem] transition-all",
                    payActive
                      ? "border-border/80 bg-background text-foreground font-semibold"
                      : "border-border/70 bg-background text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Wallet className={cn("h-3.5 w-3.5 shrink-0", payActive ? "text-foreground" : "text-muted-foreground")} />
                  <SelectValue placeholder="All Payments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Payments</SelectItem>
                  {payActive && !paymentMethodOptions.some((m) => m === paymentMethodFilter) && (
                    <SelectItem value={paymentMethodFilter}>{paymentMethodFilter}</SelectItem>
                  )}
                  {paymentMethodOptions.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {payActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePaymentMethod("all")}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md"
                  title="Clear payment filter"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            {/* Deal filter */}
            <div className="inline-flex items-center gap-1">
              <Select value={dealFilter || "all"} onValueChange={handleDeal}>
                <SelectTrigger
                  className={cn(
                    "h-8 text-xs gap-1.5 border shadow-sm min-w-[9rem] transition-all",
                    dealActive
                      ? "border-border/80 bg-background text-foreground font-semibold"
                      : "border-border/70 bg-background text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Tag className={cn("h-3.5 w-3.5 shrink-0", dealActive ? "text-foreground" : "text-muted-foreground")} />
                  <SelectValue placeholder="All Deals" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Deals</SelectItem>
                  {dealActive && !deals.some((d) => d.id === dealFilter) && (
                    <SelectItem value={dealFilter}>{dealDisplayName}</SelectItem>
                  )}
                  {deals.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {dealActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeal("all")}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md"
                  title="Clear deal filter"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            {/* Staff filter */}
            <div className="inline-flex items-center gap-1">
              <Select value={staffFilter || "all"} onValueChange={handleStaff}>
                <SelectTrigger
                  className={cn(
                    "h-8 text-xs gap-1.5 border shadow-sm min-w-[9rem] transition-all",
                    staffActive
                      ? "border-border/80 bg-background text-foreground font-semibold"
                      : "border-border/70 bg-background text-muted-foreground hover:text-foreground"
                  )}
                >
                  <UserCheck className={cn("h-3.5 w-3.5 shrink-0", staffActive ? "text-foreground" : "text-muted-foreground")} />
                  <SelectValue placeholder="All Staff" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Staff</SelectItem>
                  {staffActive && !staffOptions.some((s) => s.id === staffFilter) && (
                    <SelectItem value={staffFilter}>{staffDisplayName}</SelectItem>
                  )}
                  {staffOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} ({s.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {staffActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleStaff("all")}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md"
                  title="Clear staff filter"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {(catActive || payActive || dealActive || staffActive) && (
            <div className="mb-3 flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
              <Tags className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
              <span>
                {catActive && (
                  <>Showing the <span className="font-semibold text-foreground">{categoryFilter}</span> portion of each order — Sale / Cost / Profit and the totals above cover only this category's items, not the whole order. </>
                )}
                {payActive && (
                  <>Filtered to orders that used <span className="font-semibold text-foreground">{paymentMethodFilter}</span> — a split-payment order also appears under its other methods, and the amounts shown are full order totals. </>
                )}
                {dealActive && (
                  <>Showing <span className="font-semibold text-foreground">{dealDisplayName}</span>'s portion of each order — Sale / Cost / Profit and the totals above cover only this deal's contribution. For a Promo Code/Min Spend order that's the whole order (the deal discounts the entire order, not specific items). </>
                )}
                {staffActive && (
                  <>Filtered to orders placed by <span className="font-semibold text-foreground">{staffDisplayName}</span> — amounts shown are full order totals.</>
                )}
              </span>
            </div>
          )}
          {loading ? (
            <div className="flex justify-center items-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead>Order #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>{dealActive ? `Sale · ${dealDisplayName}` : catActive ? `Sale · ${categoryFilter}` : "Total"}</TableHead>
                    <TableHead>{dealActive ? `Cost · ${dealDisplayName}` : catActive ? `Cost · ${categoryFilter}` : "Cost"}</TableHead>
                    <TableHead>{dealActive ? `Profit · ${dealDisplayName}` : catActive ? `Profit · ${categoryFilter}` : "Profit"}</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o, index) => {
                    const payment = formatPaymentMethod(o.paymentMethod);
                    const displayType = displayOrderType(o.type);
                    return (
                      <TableRow
                        key={o.id}
                        className={cn(
                          "transition-colors hover:bg-muted/40",
                          index % 2 === 1 ? "bg-muted/20" : "bg-transparent"
                        )}
                      >
                        <TableCell className="font-medium">{o.orderNumber}</TableCell>
                        <TableCell className="text-xs">{formatDate(o.date)} {o.time}</TableCell>
                        <TableCell>{o.customerName || "Walk-in"}</TableCell>
                        <TableCell className="text-sm font-medium">{displayType}</TableCell>
                        <TableCell>{o.items.length} items</TableCell>
                        <TableCell className="font-medium">{currency} {rowSale(o).toLocaleString()}</TableCell>
                        <TableCell>{currency} {rowCost(o).toLocaleString()}</TableCell>
                        <TableCell className={rowProfit(o) >= 0 ? "text-success" : "text-destructive"}>{currency} {rowProfit(o).toLocaleString()}</TableCell>
                        <TableCell className={payment.muted ? "text-muted-foreground italic" : ""}>{payment.label}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs px-2" onClick={() => handleViewReceipt(o)}>
                            <Receipt className="h-3.5 w-3.5" />View Receipt
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {orders.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="h-32">
                        <div className="flex flex-col items-center justify-center text-muted-foreground py-8">
                          <FileX className="h-10 w-10 text-muted-foreground/30 mb-2" />
                          <p className="text-sm font-medium">No orders found</p>
                          <p className="text-xs">Try adjusting your search or filters</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
          <TablePagination currentPage={page} totalItems={total} onPageChange={setPage} pageSize={PAGE_SIZE} />
        </CardContent>
      </Card>

      <OrderPlacedPrintModal
        open={showReceipt}
        onOpenChange={setShowReceipt}
        slipData={receiptSlip}
        directMode="bill"
      />
    </div>
  );
};

export default Sales;

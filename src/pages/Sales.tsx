import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Search, Receipt, Download, FileX, Loader2, RefreshCw, Clock, X } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { TablePagination } from "@/components/TablePagination";
import { ORDER_TYPE_COLORS } from "@/lib/constants";
import { orderService, type OrderRecord } from "@/services/order.service";
import { useData } from "@/contexts/DataContext";
import { useOrderEvents } from "@/hooks/use-order-events";
import { useVisiblePolling } from "@/hooks/use-visible-polling";
import { OrderPlacedPrintModal, type PlacedOrderSlipData } from "@/components/pos/OrderPlacedPrintModal";

const typeColor = ORDER_TYPE_COLORS;

const PAGE_SIZE = 20;

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

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [page, setPage] = useState(1);

  // Date range — presets set dateFrom/dateTo directly; picking either DatePicker by hand is
  // implicitly "Custom" (no separate Custom button needed, matches Reports.tsx's own filter bar).
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Time-of-day is a separate, optional narrowing — off by default (whole day).
  const [timeFilterOn, setTimeFilterOn] = useState(false);
  const [timeFrom, setTimeFrom] = useState("00:00");
  const [timeTo, setTimeTo] = useState("23:59");

  const [receiptSlip, setReceiptSlip] = useState<PlacedOrderSlipData | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);

  // "All" on this page means "all finished orders" (completed + cancelled) — this is order
  // history, not the live kitchen/board view, so it never asks the backend for
  // pending/preparing/ready orders in the first place (fixes a stale client-side post-filter
  // that also corrupted the pagination total — see the removed `orders.filter(...)` below).
  const statusParam = statusFilter === "All" ? "completed,cancelled" : statusFilter;

  const { data: resp, isLoading: loading } = useQuery({
    queryKey: ["orders", { search, typeFilter, statusParam, dateFrom, dateTo, timeFilterOn, timeFrom, timeTo, page }],
    queryFn: () => orderService.getOrders({
      search: search || undefined,
      status: statusParam,
      type: typeFilter !== "All" ? typeFilter : undefined,
      from: dateFrom || undefined,
      to: dateTo || undefined,
      fromTime: timeFilterOn ? timeFrom : undefined,
      toTime: timeFilterOn ? timeTo : undefined,
      page,
      limit: PAGE_SIZE,
    }),
  });
  const orders = resp?.data ?? [];
  const total = resp?.meta?.total ?? orders.length;

  // Sale/Cost/Profit/Margin totalled across every order the current filters match (not just
  // this page) -- the 4 summary cards below. Independent of `page` on purpose: changing pages
  // must not refetch it, and it must not force the table to re-fetch either.
  const { data: summary } = useQuery({
    queryKey: ["orders-summary", { search, typeFilter, statusParam, dateFrom, dateTo, timeFilterOn, timeFrom, timeTo }],
    queryFn: () => orderService.getOrdersSummary({
      search: search || undefined,
      status: statusParam,
      type: typeFilter !== "All" ? typeFilter : undefined,
      from: dateFrom || undefined,
      to: dateTo || undefined,
      fromTime: timeFilterOn ? timeFrom : undefined,
      toTime: timeFilterOn ? timeTo : undefined,
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
  const handleStatus = (v: string) => { setStatusFilter(v); setPage(1); };

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

  const handleExport = () => {
    const headers = ["Order #", "Date", "Time", "Customer", "Type", "Items", "Total", "Status", "Payment Method"];
    const rows = orders.map((o) => [
      o.orderNumber,
      o.date ? new Date(o.date).toLocaleDateString() : "",
      o.time || "",
      o.customerName || "Walk-in",
      // Export keeps the raw underlying type (e.g. "Self Order") for accounting accuracy,
      // deliberately unlike the on-screen badge below, which shows "Dine In".
      o.type,
      String(o.items.length),
      String(o.total),
      o.status,
      o.paymentMethod || "",
    ]);
    const csvContent = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = "ovenisto-sales-export.csv"; link.click();
    URL.revokeObjectURL(url);
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
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refreshOrders}><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
            <Button variant="outline" onClick={handleExport}><Download className="h-4 w-4 mr-2" />Export</Button>
          </div>
        }
      />

      {/* Totals for whichever filters are currently active above -- not just the visible page */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="shadow-sm"><CardContent className="p-4"><p className="text-xs text-muted-foreground font-medium">Total Sales</p><p className="text-xl font-bold mt-1">{currency} {(summary?.sale ?? 0).toLocaleString()}</p></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-4"><p className="text-xs text-muted-foreground font-medium">Total Cost</p><p className="text-xl font-bold mt-1">{currency} {(summary?.cost ?? 0).toLocaleString()}</p></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-4"><p className="text-xs text-muted-foreground font-medium">Total Profit</p><p className={`text-xl font-bold mt-1 ${(summary?.profit ?? 0) >= 0 ? "text-success" : "text-destructive"}`}>{currency} {(summary?.profit ?? 0).toLocaleString()}</p></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-4"><p className="text-xs text-muted-foreground font-medium">Total Margin</p><p className={`text-xl font-bold mt-1 ${(summary?.marginPct ?? 0) >= 0 ? "text-success" : "text-destructive"}`}>{summary?.marginPct ?? 0}%</p></CardContent></Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3">
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => handleSearch(e.target.value)} placeholder="Search orders..." className="pl-9" />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {["All", "Dine In", "Take Away", "Delivery", "Online"].map((t) => (
                <Button key={t} variant={typeFilter === t ? "default" : "outline"} size="sm"
                  onClick={() => handleType(t)}
                  className={typeFilter === t ? "gradient-primary text-primary-foreground" : ""}>{t}</Button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1.5 flex-wrap">
                {["All", "completed", "cancelled"].map((s) => (
                  <Button key={s} variant={statusFilter === s ? "default" : "outline"} size="sm"
                    onClick={() => handleStatus(s)}
                    className={`capitalize ${statusFilter === s ? "gradient-primary text-primary-foreground" : ""}`}>{s}</Button>
                ))}
              </div>
            </div>
            {/* Date range: preset chips + always-visible From/To pickers (picking either counts as Custom) */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/50">
              {(["Today", "This Week", "This Month"] as const).map((p) => (
                <Button key={p} variant={activePreset === p ? "default" : "outline"} size="sm"
                  onClick={() => applyPreset(p)}
                  className={activePreset === p ? "gradient-primary text-primary-foreground" : ""}>{p}</Button>
              ))}
              <span className="text-xs text-muted-foreground mx-1">or custom:</span>
              <DatePicker value={dateFrom} onChange={handleDateFrom} placeholder="From date" className="h-8 w-36 text-xs" />
              <span className="text-xs text-muted-foreground">to</span>
              <DatePicker value={dateTo} onChange={handleDateTo} placeholder="To date" min={dateFrom || undefined} className="h-8 w-36 text-xs" />
              {(dateFrom || dateTo) && (
                <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground" onClick={clearDates}>Clear</Button>
              )}
            </div>
            {/* Time-of-day: optional, independent of the date range/preset above */}
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                variant={timeFilterOn ? "default" : "outline"}
                size="sm"
                onClick={() => { setTimeFilterOn((v) => !v); setPage(1); }}
                className={timeFilterOn ? "gradient-primary text-primary-foreground" : ""}
              >
                <Clock className="h-3.5 w-3.5 mr-1.5" />
                {timeFilterOn ? "Time filter on" : "Filter by time"}
              </Button>
              {timeFilterOn && (
                <>
                  <TimePicker value={timeFrom} onChange={(v) => { setTimeFrom(v); setPage(1); }} className="h-8 w-32 text-xs" />
                  <span className="text-xs text-muted-foreground">to</span>
                  <TimePicker value={timeTo} onChange={(v) => { setTimeTo(v); setPage(1); }} className="h-8 w-32 text-xs" />
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground" onClick={() => setTimeFilterOn(false)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
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
                    <TableHead>Total</TableHead>
                    <TableHead>Cost</TableHead>
                    <TableHead>Profit</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o) => {
                    const payment = formatPaymentMethod(o.paymentMethod);
                    const displayType = displayOrderType(o.type);
                    return (
                      <TableRow key={o.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="font-medium">{o.orderNumber}</TableCell>
                        <TableCell className="text-xs">{formatDate(o.date)} {o.time}</TableCell>
                        <TableCell>{o.customerName || "Walk-in"}</TableCell>
                        <TableCell><Badge variant="secondary" className={(typeColor as any)[displayType] ?? ""}>{displayType}</Badge></TableCell>
                        <TableCell>{o.items.length} items</TableCell>
                        <TableCell className="font-medium">{currency} {Number(o.total).toLocaleString()}</TableCell>
                        <TableCell>{currency} {Number(o.cost ?? 0).toLocaleString()}</TableCell>
                        <TableCell className={Number(o.profit ?? 0) >= 0 ? "text-success" : "text-destructive"}>{currency} {Number(o.profit ?? 0).toLocaleString()}</TableCell>
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

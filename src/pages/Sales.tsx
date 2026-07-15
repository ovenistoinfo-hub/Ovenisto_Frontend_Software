import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Search, Eye, Printer, Download, Flame, Receipt, FileX, Loader2, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { generateInvoicePDF } from "@/lib/generate-invoice-pdf";
import { TablePagination } from "@/components/TablePagination";
import { ORDER_STATUS_COLORS, ORDER_TYPE_COLORS } from "@/lib/constants";
import { orderService, type OrderRecord } from "@/services/order.service";
import { useData } from "@/contexts/DataContext";

const statusColor = ORDER_STATUS_COLORS;
const typeColor = ORDER_TYPE_COLORS;

const PAGE_SIZE = 20;

const Sales = () => {
  const { settings } = useData();
  const currency = settings.currency || "Rs.";
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [dateFilter, setDateFilter] = useState("");
  const [page, setPage] = useState(1);

  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);

  const { data: resp, isLoading: loading } = useQuery({
    queryKey: ["orders", { search, typeFilter, statusFilter, dateFilter, page }],
    queryFn: () => orderService.getOrders({
      search: search || undefined,
      status: statusFilter !== "All" ? statusFilter : undefined,
      type: typeFilter !== "All" ? typeFilter : undefined,
      date: dateFilter || undefined,
      page,
      limit: PAGE_SIZE,
    }),
  });
  const allOrders = resp?.data ?? [];
  const orders = allOrders.filter(o => o.status !== "preparing" && o.status !== "pending");
  const total = orders.length;
  const refetchOrders = () => queryClient.invalidateQueries({ queryKey: ["orders"] });

  // Reset to page 1 when filters change
  const handleSearch = (v: string) => { setSearch(v); setPage(1); };
  const handleType = (v: string) => { setTypeFilter(v); setPage(1); };
  const handleStatus = (v: string) => { setStatusFilter(v); setPage(1); };
  const handleDate = (v: string) => { setDateFilter(v); setPage(1); };

  const handleExport = () => {
    const headers = ["Order #", "Date", "Time", "Customer", "Type", "Items", "Total", "Status", "Payment Method"];
    const rows = orders.map((o) => [
      o.orderNumber,
      o.date ? new Date(o.date).toLocaleDateString() : "",
      o.time || "",
      o.customerName || "Walk-in",
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

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Receipt className="h-5 w-5" />}
        title="Sales & Orders"
        subtitle="View all orders and history"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refetchOrders}><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
            <Button variant="outline" onClick={handleExport}><Download className="h-4 w-4 mr-2" />Export</Button>
          </div>
        }
      />
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
              <Input
                type="date"
                value={dateFilter}
                onChange={(e) => handleDate(e.target.value)}
                className="h-8 w-40 text-sm"
              />
              {dateFilter && (
                <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground" onClick={() => handleDate("")}>Clear date</Button>
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
                    <TableHead>Payment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o) => (
                    <TableRow key={o.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-medium">{o.orderNumber}</TableCell>
                      <TableCell className="text-xs">{formatDate(o.date)} {o.time}</TableCell>
                      <TableCell>{o.customerName || "Walk-in"}</TableCell>
                      <TableCell><Badge variant="secondary" className={(typeColor as any)[o.type] ?? ""}>{o.type}</Badge></TableCell>
                      <TableCell>{o.items.length} items</TableCell>
                      <TableCell className="font-medium">{currency} {Number(o.total).toLocaleString()}</TableCell>
                      <TableCell>{o.paymentMethod || "—"}</TableCell>
                      <TableCell><Badge variant="secondary" className={(statusColor as any)[o.status] ?? ""}>{o.status}</Badge></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedOrder(o)}><Eye className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.print()}><Printer className="h-3 w-3" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {orders.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="h-32">
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

      {/* Order Detail Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-lg w-[95vw] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader><DialogTitle className="text-base sm:text-lg">Order Details — {selectedOrder?.orderNumber}</DialogTitle></DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <div className="flex items-center justify-center gap-2">
                  <Flame className="h-5 w-5 text-primary" />
                  <span className="font-bold text-base sm:text-lg text-primary">{settings.restaurantName}</span>
                </div>
                <p className="text-xs text-muted-foreground">{settings.address}</p>
                <p className="text-xs text-muted-foreground">Phone: {settings.phone}</p>
              </div>
              <Separator />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Order #:</span> <strong>{selectedOrder.orderNumber}</strong></div>
                <div><span className="text-muted-foreground">Date:</span> {formatDate(selectedOrder.date)} {selectedOrder.time}</div>
                <div><span className="text-muted-foreground">Customer:</span> {selectedOrder.customerName || "Walk-in"}</div>
                <div><span className="text-muted-foreground">Phone:</span> {selectedOrder.phone || "—"}</div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-muted-foreground">Type:</span>
                  <Badge variant="secondary" className={(typeColor as any)[selectedOrder.type] ?? ""}>{selectedOrder.type}</Badge>
                </div>
                <div><span className="text-muted-foreground">Staff:</span> {selectedOrder.staffName || "—"}</div>
                {selectedOrder.tableNumber && <div><span className="text-muted-foreground">Table:</span> #{selectedOrder.tableNumber}</div>}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge variant="secondary" className={(statusColor as any)[selectedOrder.status] ?? ""}>{selectedOrder.status}</Badge>
                </div>
              </div>
              <Separator />
              <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[120px]">Item</TableHead>
                      <TableHead className="text-center">Qty</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedOrder.items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium text-sm">{item.name}</TableCell>
                        <TableCell className="text-center">{item.qty}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{currency} {Number(item.price).toLocaleString()}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{currency} {(Number(item.price) * item.qty).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Separator />
              <div className="text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{currency} {Number(selectedOrder.subtotal).toLocaleString()}</span></div>
                {Number(selectedOrder.discount) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="text-destructive">-{currency} {Number(selectedOrder.discount).toLocaleString()}</span></div>}
                <div className="flex justify-between"><span className="text-muted-foreground">{settings.taxName} ({settings.taxRate}%)</span><span>{currency} {Number(selectedOrder.tax).toLocaleString()}</span></div>
                <Separator />
                <div className="flex justify-between font-bold text-base pt-1"><span>Grand Total</span><span className="text-primary">{currency} {Number(selectedOrder.total).toLocaleString()}</span></div>
              </div>
              <div className="text-sm"><span className="text-muted-foreground">Payment Method:</span> <strong>{selectedOrder.paymentMethod || "—"}</strong></div>
              <p className="text-center text-xs text-muted-foreground italic">{settings.receiptHeader}</p>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setSelectedOrder(null)}>Close</Button>
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => selectedOrder && generateInvoicePDF({
              orderNumber: selectedOrder.orderNumber,
              date: selectedOrder.date ? new Date(selectedOrder.date).toLocaleDateString() : "",
              time: selectedOrder.time || "",
              orderType: selectedOrder.type,
              tableNumber: selectedOrder.tableNumber ?? undefined,
              customer: selectedOrder.customerName || "Walk-in",
              phone: selectedOrder.phone || "",
              staff: selectedOrder.staffName || "",
              paymentMethod: selectedOrder.paymentMethod || "",
              items: selectedOrder.items.map(i => ({ name: i.name, qty: i.qty, price: Number(i.price), discount: Number(i.discount) })),
              subtotal: Number(selectedOrder.subtotal),
              discount: Number(selectedOrder.discount),
              tax: Number(selectedOrder.tax),
              total: Number(selectedOrder.total),
            })}><Download className="h-4 w-4 mr-1" />PDF</Button>
            <Button className="gradient-primary text-primary-foreground w-full sm:w-auto" onClick={() => window.print()}><Printer className="h-4 w-4 mr-2" />Print Invoice</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Sales;

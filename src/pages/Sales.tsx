import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Search, Eye, Printer, Download, Flame, Receipt, FileX } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import type { Order } from "@/data/mock-data";
import { generateInvoicePDF } from "@/lib/generate-invoice-pdf";
import { useData } from "@/contexts/DataContext";
import { TablePagination, paginate } from "@/components/TablePagination";
import { ORDER_STATUS_COLORS, ORDER_TYPE_COLORS } from "@/lib/constants";

const statusColor = ORDER_STATUS_COLORS;
const typeColor = ORDER_TYPE_COLORS;

const Sales = () => {
  const { orders, settings } = useData();
  const currency = settings.currency || "Rs.";
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [page, setPage] = useState(1);

  const filtered = orders.filter((o) => {
    const matchSearch = o.orderNumber.toLowerCase().includes(search.toLowerCase()) || o.customer.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === "All" || o.type === typeFilter;
    const matchStatus = statusFilter === "All" || o.status === statusFilter;
    return matchSearch && matchType && matchStatus;
  });
  const paged = paginate(filtered, page);

  const handleExport = () => {
    const headers = ["Order #", "Date", "Time", "Customer", "Type", "Items", "Total", "Status", "Payment Method"];
    const rows = filtered.map((o) => [o.orderNumber, o.date, o.time, o.customer, o.type, String(o.items.length), String(o.total), o.status, o.paymentMethod]);
    const csvContent = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = "ovenisto-sales-export.csv"; link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Receipt className="h-5 w-5" />}
        title="Sales & Orders"
        subtitle="View all orders and history"
        actions={<Button variant="outline" onClick={handleExport}><Download className="h-4 w-4 mr-2" />Export</Button>}
      />
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3">
            <div className="relative w-full sm:max-w-sm"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search orders..." className="pl-9" /></div>
            <div className="flex gap-1.5 flex-wrap">{["All", "Dine In", "Take Away", "Delivery", "Online"].map((t) => (<Button key={t} variant={typeFilter === t ? "default" : "outline"} size="sm" onClick={() => { setTypeFilter(t); setPage(1); }} className={typeFilter === t ? "gradient-primary text-primary-foreground" : ""}>{t}</Button>))}</div>
            <div className="flex gap-1.5 flex-wrap">{["All", "completed", "preparing", "pending", "cancelled"].map((s) => (<Button key={s} variant={statusFilter === s ? "default" : "outline"} size="sm" onClick={() => { setStatusFilter(s); setPage(1); }} className={`capitalize ${statusFilter === s ? "gradient-primary text-primary-foreground" : ""}`}>{s}</Button>))}</div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="sticky top-0 z-10 bg-card">Order #</TableHead>
                  <TableHead className="sticky top-0 z-10 bg-card">Date</TableHead>
                  <TableHead className="sticky top-0 z-10 bg-card">Customer</TableHead>
                  <TableHead className="sticky top-0 z-10 bg-card">Type</TableHead>
                  <TableHead className="sticky top-0 z-10 bg-card">Items</TableHead>
                  <TableHead className="sticky top-0 z-10 bg-card">Total</TableHead>
                  <TableHead className="sticky top-0 z-10 bg-card">Payment</TableHead>
                  <TableHead className="sticky top-0 z-10 bg-card">Status</TableHead>
                  <TableHead className="sticky top-0 z-10 bg-card">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((o) => (
                  <TableRow key={o.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-medium">{o.orderNumber}</TableCell>
                    <TableCell className="text-xs">{o.date} {o.time}</TableCell>
                    <TableCell>{o.customer}</TableCell>
                    <TableCell><Badge variant="secondary" className={typeColor[o.type]}>{o.type}</Badge></TableCell>
                    <TableCell>{o.items.length} items</TableCell>
                    <TableCell className="font-medium">{currency} {o.total.toLocaleString()}</TableCell>
                    <TableCell>{o.paymentMethod}</TableCell>
                    <TableCell><Badge variant="secondary" className={statusColor[o.status]}>{o.status}</Badge></TableCell>
                    <TableCell><div className="flex gap-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedOrder(o)}><Eye className="h-3 w-3" /></Button><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.print()}><Printer className="h-3 w-3" /></Button></div></TableCell>
                  </TableRow>
                ))}
                {paged.length === 0 && (
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
          <TablePagination currentPage={page} totalItems={filtered.length} onPageChange={setPage} />
        </CardContent>
      </Card>
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
                <div><span className="text-muted-foreground">Date:</span> {selectedOrder.date} {selectedOrder.time}</div>
                <div><span className="text-muted-foreground">Customer:</span> {selectedOrder.customer}</div>
                <div><span className="text-muted-foreground">Phone:</span> {selectedOrder.phone}</div>
                <div className="flex items-center gap-1.5 flex-wrap"><span className="text-muted-foreground">Type:</span> <Badge variant="secondary" className={typeColor[selectedOrder.type]}>{selectedOrder.type}</Badge></div>
                <div><span className="text-muted-foreground">Staff:</span> {selectedOrder.staff}</div>
                {selectedOrder.tableNumber && <div><span className="text-muted-foreground">Table:</span> #{selectedOrder.tableNumber}</div>}
                <div className="flex items-center gap-1.5 flex-wrap"><span className="text-muted-foreground">Status:</span> <Badge variant="secondary" className={statusColor[selectedOrder.status]}>{selectedOrder.status}</Badge></div>
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
                        <TableCell className="text-right whitespace-nowrap">{currency} {item.price}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{currency} {(item.price * item.qty).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Separator />
              <div className="text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{currency} {selectedOrder.subtotal.toLocaleString()}</span></div>
                {selectedOrder.discount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="text-destructive">-{currency} {selectedOrder.discount.toLocaleString()}</span></div>}
                <div className="flex justify-between"><span className="text-muted-foreground">{settings.taxName} ({settings.taxRate}%)</span><span>{currency} {selectedOrder.tax.toLocaleString()}</span></div>
                <Separator />
                <div className="flex justify-between font-bold text-base pt-1"><span>Grand Total</span><span className="text-primary">{currency} {selectedOrder.total.toLocaleString()}</span></div>
              </div>
              <div className="text-sm"><span className="text-muted-foreground">Payment Method:</span> <strong>{selectedOrder.paymentMethod}</strong></div>
              <p className="text-center text-xs text-muted-foreground italic">{settings.receiptHeader}</p>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setSelectedOrder(null)}>Close</Button>
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => selectedOrder && generateInvoicePDF({ orderNumber: selectedOrder.orderNumber, date: selectedOrder.date, time: selectedOrder.time, orderType: selectedOrder.type, tableNumber: selectedOrder.tableNumber, customer: selectedOrder.customer, phone: selectedOrder.phone, staff: selectedOrder.staff, paymentMethod: selectedOrder.paymentMethod, items: selectedOrder.items.map(i => ({ name: i.name, qty: i.qty, price: i.price, discount: i.discount })), subtotal: selectedOrder.subtotal, discount: selectedOrder.discount, tax: selectedOrder.tax, total: selectedOrder.total })}><Download className="h-4 w-4 mr-1" />PDF</Button>
            <Button className="gradient-primary text-primary-foreground w-full sm:w-auto" onClick={() => window.print()}><Printer className="h-4 w-4 mr-2" />Print Invoice</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Sales;

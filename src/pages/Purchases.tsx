import { useState, useEffect } from "react";
import { useData } from "@/contexts/DataContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Search, Eye, Pencil, Trash2, ShoppingCart } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import { TablePagination, paginate } from "@/components/TablePagination";
import { PageHeader } from "@/components/ui/page-header";

const payColor: Record<string, string> = { paid: "bg-success/10 text-success", partial: "bg-warning/10 text-warning", unpaid: "bg-destructive/10 text-destructive" };
interface PurchaseItem { ingredientId: string; name: string; qty: number; unit: string; unitPrice: number; }

const Purchases = () => {
  const { purchases, suppliers, ingredients, addItem, updateItem, removeItem, adjustStock, settings } = useData();
  const [searchParams] = useSearchParams();
  const [showDialog, setShowDialog] = useState(false);
  const [showDetail, setShowDetail] = useState<typeof purchases[0] | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ supplier: "", invoiceNumber: "", totalAmount: 0, paymentStatus: "unpaid" as "paid" | "partial" | "unpaid" });
  const [items, setItems] = useState<PurchaseItem[]>([{ ingredientId: "", name: "", qty: 0, unit: "", unitPrice: 0 }]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const currency = settings.currency || "Rs.";

  useEffect(() => { const t = setTimeout(() => setLoading(false), 500); return () => clearTimeout(t); }, []);
  useEffect(() => {
    if (searchParams.get("auto") === "low-stock" && !loading) {
      const lowItems = ingredients.filter(i => i.currentStock <= i.lowStockLevel);
      if (lowItems.length > 0) {
        setItems(lowItems.map(i => ({ ingredientId: i.id, name: i.name, qty: Math.max(1, i.lowStockLevel - i.currentStock), unit: i.unit, unitPrice: i.purchasePrice })));
        setEditingId(null); setForm({ supplier: "", invoiceNumber: "", totalAmount: 0, paymentStatus: "unpaid" }); setShowDialog(true);
      }
    }
  }, [searchParams, loading, ingredients]);

  const filtered = purchases.filter((p) => p.supplier.toLowerCase().includes(search.toLowerCase()));
  const paged = paginate(filtered, page);
  const openAdd = () => { setEditingId(null); setForm({ supplier: "", invoiceNumber: "", totalAmount: 0, paymentStatus: "unpaid" }); setItems([{ ingredientId: "", name: "", qty: 0, unit: "", unitPrice: 0 }]); setShowDialog(true); };
  const openEdit = (p: typeof purchases[0]) => { setEditingId(p.id); setForm({ supplier: p.supplier, invoiceNumber: p.invoiceNumber, totalAmount: p.totalAmount, paymentStatus: p.paymentStatus }); setItems([{ ingredientId: "", name: "", qty: 0, unit: "", unitPrice: 0 }]); setShowDialog(true); };
  const addItemRow = () => setItems(p => [...p, { ingredientId: "", name: "", qty: 0, unit: "", unitPrice: 0 }]);
  const removeItemRow = (idx: number) => setItems(p => p.filter((_, i) => i !== idx));
  const updateItemRow = (idx: number, field: string, value: string | number) => {
    setItems(p => p.map((item, i) => {
      if (i !== idx) return item;
      if (field === "ingredientId") { const ing = ingredients.find(ig => ig.id === value); return { ...item, ingredientId: value as string, name: ing?.name || "", unit: ing?.unit || "", unitPrice: ing?.purchasePrice || 0 }; }
      return { ...item, [field]: value };
    }));
  };
  const itemsTotal = items.reduce((s, it) => s + it.qty * it.unitPrice, 0);

  const handleSave = (status: "paid" | "unpaid") => {
    if (!form.supplier) return;
    const total = itemsTotal || form.totalAmount;
    if (editingId) {
      const oldPurchase = purchases.find(p => p.id === editingId);
      if (oldPurchase && oldPurchase.paymentStatus !== status) {
        const supplier = suppliers.find(s => s.name === form.supplier);
        if (supplier) {
          if (status === "paid" && oldPurchase.paymentStatus === "unpaid") updateItem("suppliers", supplier.id, { totalDue: Math.max(0, supplier.totalDue - total) });
          else if (status === "unpaid" && oldPurchase.paymentStatus === "paid") updateItem("suppliers", supplier.id, { totalDue: supplier.totalDue + total });
        }
      }
      updateItem("purchases", editingId, { supplier: form.supplier, invoiceNumber: form.invoiceNumber, totalAmount: total, paymentStatus: status });
      toast.success("Updated successfully");
    } else {
      const id = crypto.randomUUID();
      addItem("purchases", { id, date: new Date().toISOString().split("T")[0], invoiceNumber: form.invoiceNumber || `INV-${2005 + purchases.length}`, supplier: form.supplier, itemCount: items.filter(i => i.name).length, totalAmount: total, paymentStatus: status });
      items.filter(it => it.ingredientId && it.qty > 0).forEach(it => { adjustStock(it.ingredientId, it.qty, "add"); });
      const supplier = suppliers.find(s => s.name === form.supplier);
      if (supplier) updateItem("suppliers", supplier.id, { totalPurchases: supplier.totalPurchases + total, ...(status === "unpaid" ? { totalDue: supplier.totalDue + total } : {}) });
      toast.success("Purchase added");
    }
    setShowDialog(false); setEditingId(null);
  };

  const handleDelete = () => { if (!deleteId) return; removeItem("purchases", deleteId); setDeleteId(null); toast.success("Purchase deleted"); };

  if (loading) return <div className="space-y-6"><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div><Skeleton className="h-10 w-full rounded-lg" />{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg mt-2" />)}</div>;

  return (
    <div className="space-y-6">
      <PageHeader icon={<ShoppingCart className="h-5 w-5" />} title="Purchases" subtitle="Purchase orders and invoices" actions={<Button className="gradient-primary text-primary-foreground" onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Purchase</Button>} />
      <Card className="shadow-sm">
        <CardHeader className="pb-3"><div className="relative max-w-sm"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search..." className="pl-9" /></div></CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-12"><ShoppingCart className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" /><p className="text-muted-foreground">No purchases found</p><p className="text-xs text-muted-foreground mt-1.5">Add your first purchase to get started.</p><Button size="sm" className="gradient-primary text-primary-foreground mt-3" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Purchase</Button></div>
          ) : (
            <>
              <div className="rounded-lg border overflow-auto max-h-[calc(100vh-300px)]">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>SN</TableHead><TableHead>Date</TableHead><TableHead>Invoice #</TableHead><TableHead>Supplier</TableHead><TableHead>Items</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                  <TableBody>{paged.map((p, i) => (
                    <TableRow key={p.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell>{(page - 1) * 10 + i + 1}</TableCell><TableCell>{p.date}</TableCell><TableCell className="font-medium">{p.invoiceNumber}</TableCell>
                      <TableCell>{p.supplier}</TableCell><TableCell>{p.itemCount}</TableCell>
                      <TableCell className="font-medium">{currency} {p.totalAmount.toLocaleString()}</TableCell>
                      <TableCell><Badge variant="secondary" className={payColor[p.paymentStatus]}>{p.paymentStatus}</Badge></TableCell>
                      <TableCell><div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowDetail(p)}><Eye className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}><Pencil className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(p.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div></TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              </div>
              <TablePagination currentPage={page} totalItems={filtered.length} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "Edit" : "Add"} Purchase</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Supplier</Label><Select value={form.supplier} onValueChange={(v) => setForm(p => ({ ...p, supplier: v }))}><SelectTrigger><SelectValue placeholder="Select Supplier" /></SelectTrigger><SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label>Invoice Number</Label><Input placeholder="Invoice Number" value={form.invoiceNumber} onChange={(e) => setForm(p => ({ ...p, invoiceNumber: e.target.value }))} /></div>
            </div>
            <div>
              <Label className="mb-2 block">Items</Label>
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div key={idx} className="flex flex-col sm:flex-row gap-2 items-start sm:items-center border rounded-lg p-2 sm:p-0 sm:border-0">
                    <div className="w-full sm:w-auto sm:flex-[4]"><Select value={item.ingredientId} onValueChange={(v) => updateItemRow(idx, "ingredientId", v)}><SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Ingredient" /></SelectTrigger><SelectContent>{ingredients.map(ig => <SelectItem key={ig.id} value={ig.id}>{ig.name}</SelectItem>)}</SelectContent></Select></div>
                    <div className="flex gap-2 w-full sm:w-auto sm:flex-[5] items-center">
                      <Input className="h-9 text-xs flex-1" type="number" placeholder="Qty" value={item.qty || ""} onChange={(e) => updateItemRow(idx, "qty", Number(e.target.value))} />
                      <span className="text-xs text-muted-foreground w-8 text-center shrink-0">{item.unit}</span>
                      <Input className="h-9 text-xs flex-1" type="number" placeholder="Price" value={item.unitPrice || ""} onChange={(e) => updateItemRow(idx, "unitPrice", Number(e.target.value))} />
                    </div>
                    <div className="flex items-center justify-between w-full sm:w-auto sm:flex-[3] gap-2">
                      <span className="text-xs font-medium">{currency} {(item.qty * item.unitPrice).toLocaleString()}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => removeItemRow(idx)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" className="mt-2" onClick={addItemRow}><Plus className="h-3 w-3 mr-1" />Add Item</Button>
              <div className="text-right mt-2 font-semibold">Total: {currency} {itemsTotal.toLocaleString()}</div>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button variant="outline" className="text-warning border-warning/30" onClick={() => handleSave("unpaid")}>Save as Unpaid</Button>
            <Button className="gradient-primary text-primary-foreground" onClick={() => handleSave("paid")}>Save as Paid</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
        <DialogContent><DialogHeader><DialogTitle>Purchase Details — {showDetail?.invoiceNumber}</DialogTitle></DialogHeader>
          {showDetail && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Supplier:</span> <strong>{showDetail.supplier}</strong></div>
                <div><span className="text-muted-foreground">Date:</span> {showDetail.date}</div>
                <div><span className="text-muted-foreground">Items:</span> {showDetail.itemCount}</div>
                <div><span className="text-muted-foreground">Status:</span> <Badge variant="secondary" className={payColor[showDetail.paymentStatus]}>{showDetail.paymentStatus}</Badge></div>
              </div>
              <div className="border-t pt-2"><span className="text-muted-foreground">Total:</span> <strong className="text-lg">{currency} {showDetail.totalAmount.toLocaleString()}</strong></div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setShowDetail(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Purchase?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Purchases;

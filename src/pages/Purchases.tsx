import { useState, useEffect, useCallback, useRef } from "react";
import { purchaseService, type PurchaseRecord } from "@/services/purchase.service";
import { supplierService, type SupplierRecord } from "@/services/supplier.service";
import { inventoryService, type IngredientRecord, type IngredientCategoryRecord, type UnitRecord } from "@/services/inventory.service";
import { warehouseService, type WarehouseRecord } from "@/services/warehouse.service";
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
import { TablePagination } from "@/components/TablePagination";
import { PageHeader } from "@/components/ui/page-header";

const payColor: Record<string, string> = { paid: "bg-success/10 text-success", partial: "bg-warning/10 text-warning", unpaid: "bg-destructive/10 text-destructive" };

interface FormItem { ingredientId: string; name: string; qty: number; unit: string; unitPrice: number; }

const formatDate = (d: string) => (d ? d.split("T")[0] : "");

const Purchases = () => {
  const { settings } = useData();
  const currency = settings.currency || "Rs.";
  const [searchParams] = useSearchParams();

  // Data state
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [ingredients, setIngredients] = useState<IngredientRecord[]>([]);
  const [categories, setCategories] = useState<IngredientCategoryRecord[]>([]);
  const [units, setUnits] = useState<UnitRecord[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseRecord[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDetail, setShowDetail] = useState<PurchaseRecord | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Add form state
  const [form, setForm] = useState({ supplierId: "", invoiceNumber: "" });
  const [items, setItems] = useState<FormItem[]>([{ ingredientId: "", name: "", qty: 0, unit: "", unitPrice: 0 }]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");

  // Edit form state (payment only)
  const [editPayment, setEditPayment] = useState({ paid: 0, status: "unpaid" as "paid" | "unpaid" | "partial" });

  // Quick-add ingredient state
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddTargetIdx, setQuickAddTargetIdx] = useState<number | null>(null);
  const [quickAddForm, setQuickAddForm] = useState({ name: "", categoryId: "", unitId: "" });
  const [quickAddLoading, setQuickAddLoading] = useState(false);

  const autoFillDone = useRef(false);

  const fetchPurchases = useCallback(async () => {
    try {
      const res = await purchaseService.getAll({ page, limit: 20 });
      setPurchases(res.data);
      setTotalItems(res.meta.total);
    } catch (err: any) {
      toast.error(err.message || "Failed to load purchases");
    } finally {
      setLoading(false);
    }
  }, [page]);

  // Load reference data once
  useEffect(() => {
    Promise.all([
      supplierService.getAll(),
      inventoryService.getIngredients(),
      inventoryService.getIngredientCategories(),
      inventoryService.getUnits(),
      warehouseService.getAll(),
    ])
      .then(([supRes, ingList, catList, unitList, whList]) => {
        setSuppliers(supRes.data);
        setIngredients(ingList);
        setCategories(catList);
        setUnits(unitList);
        setWarehouses(whList);
        // Default to Main warehouse if exists
        const main = whList.find(w => w.type === "MAIN");
        if (main) setSelectedWarehouseId(main.id);
      })
      .catch((err: any) => toast.error(err.message || "Failed to load data"));
  }, []);

  useEffect(() => { fetchPurchases(); }, [fetchPurchases]);

  // Low-stock auto-fill
  useEffect(() => {
    if (autoFillDone.current || loading || ingredients.length === 0) return;
    if (searchParams.get("auto") === "low-stock") {
      autoFillDone.current = true;
      const lowItems = ingredients.filter(i => Number(i.currentStock) <= Number(i.lowStockLevel));
      if (lowItems.length > 0) {
        setItems(lowItems.map(i => ({
          ingredientId: i.id,
          name: i.name,
          qty: Math.max(1, Number(i.lowStockLevel) - Number(i.currentStock)),
          unit: i.unit?.name || "",
          unitPrice: Number(i.purchasePrice) || 0,
        })));
        setEditingId(null);
        setForm({ supplierId: "", invoiceNumber: "" });
        setShowDialog(true);
      }
    }
  }, [searchParams, loading, ingredients]);

  const filtered = purchases.filter((p) =>
    (p.supplierName || "").toLowerCase().includes(search.toLowerCase()) ||
    (p.invoiceNumber || "").toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => {
    setEditingId(null);
    setForm({ supplierId: "", invoiceNumber: "" });
    setItems([{ ingredientId: "", name: "", qty: 0, unit: "", unitPrice: 0 }]);
    // Default to Main warehouse if exists
    const main = warehouses.find(w => w.type === "MAIN");
    setSelectedWarehouseId(main?.id || "");
    setShowDialog(true);
  };

  const openEdit = (p: PurchaseRecord) => {
    setEditingId(p.id);
    setEditPayment({ paid: p.paid, status: (p.status || "unpaid") as "paid" | "unpaid" | "partial" });
    setShowEditDialog(true);
  };

  const addItemRow = () => setItems(p => [...p, { ingredientId: "", name: "", qty: 0, unit: "", unitPrice: 0 }]);
  const removeItemRow = (idx: number) => setItems(p => p.filter((_, i) => i !== idx));
  const updateItemRow = (idx: number, field: string, value: string | number) => {
    setItems(p => p.map((item, i) => {
      if (i !== idx) return item;
      if (field === "ingredientId") {
        const ing = ingredients.find(ig => ig.id === value);
        return { ...item, ingredientId: value as string, name: ing?.name || "", unit: ing?.unit?.name || "", unitPrice: Number(ing?.purchasePrice) || 0 };
      }
      return { ...item, [field]: value };
    }));
  };

  const itemsTotal = items.reduce((s, it) => s + it.qty * it.unitPrice, 0);

  const handleSave = async (status: "paid" | "unpaid") => {
    if (items.every(i => !i.ingredientId || i.qty <= 0)) {
      toast.error("Add at least one item with quantity");
      return;
    }
    setSaving(true);
    try {
      const validItems = items.filter(i => i.ingredientId && i.qty > 0).map(i => ({
        ingredientId: i.ingredientId,
        name: i.name,
        qty: i.qty,
        unit: i.unit,
        unitPrice: i.unitPrice,
        total: i.qty * i.unitPrice,
      }));
      await purchaseService.create({
        supplierId: form.supplierId || undefined,
        invoiceNumber: form.invoiceNumber || undefined,
        date: new Date().toISOString().split("T")[0],
        items: validItems,
        subtotal: itemsTotal,
        tax: 0,
        total: itemsTotal,
        paid: status === "paid" ? itemsTotal : 0,
        status,
        warehouseId: selectedWarehouseId || undefined,
      });
      toast.success("Purchase added");
      setShowDialog(false);
      await fetchPurchases();
    } catch (err: any) {
      toast.error(err.message || "Failed to save purchase");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePayment = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const purchase = purchases.find(p => p.id === editingId);
      const total = purchase?.total ?? 0;
      await purchaseService.updatePayment(editingId, {
        paid: editPayment.status === "paid" ? Number(total) : editPayment.paid,
        status: editPayment.status,
      });
      toast.success("Payment status updated");
      setShowEditDialog(false);
      await fetchPurchases();
    } catch (err: any) {
      toast.error(err.message || "Failed to update payment");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await purchaseService.delete(deleteId);
      setDeleteId(null);
      toast.success("Purchase deleted");
      await fetchPurchases();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete purchase");
    }
  };

  const handleQuickAddIngredient = async () => {
    if (!quickAddForm.name.trim()) return;
    setQuickAddLoading(true);
    try {
      const newIngredient = await inventoryService.createIngredient({
        name: quickAddForm.name.trim(),
        categoryId: quickAddForm.categoryId || null,
        unitId: quickAddForm.unitId || null,
      });
      const updated = await inventoryService.getIngredients();
      setIngredients(updated);
      if (quickAddTargetIdx !== null) {
        updateItemRow(quickAddTargetIdx, "ingredientId", newIngredient.id);
      }
      setQuickAddOpen(false);
      setQuickAddForm({ name: "", categoryId: "", unitId: "" });
      toast.success(`"${newIngredient.name}" added successfully`);
    } catch (err: any) {
      toast.error(err.message || "Failed to add ingredient");
    } finally {
      setQuickAddLoading(false);
    }
  };

  if (loading) return <div className="space-y-6"><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div><Skeleton className="h-10 w-full rounded-lg" />{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg mt-2" />)}</div>;

  return (
    <div className="space-y-6">
      <PageHeader icon={<ShoppingCart className="h-5 w-5" />} title="Purchases" subtitle="Purchase orders and invoices" actions={<Button className="gradient-primary text-primary-foreground" onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Purchase</Button>} />
      <Card className="shadow-sm">
        <CardHeader className="pb-3"><div className="relative max-w-sm"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by supplier or invoice..." className="pl-9" /></div></CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-12"><ShoppingCart className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" /><p className="text-muted-foreground">No purchases found</p><p className="text-xs text-muted-foreground mt-1.5">Add your first purchase to get started.</p><Button size="sm" className="gradient-primary text-primary-foreground mt-3" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Purchase</Button></div>
          ) : (
            <>
              <div className="rounded-lg border overflow-auto max-h-[calc(100vh-300px)]">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>SN</TableHead><TableHead>Date</TableHead><TableHead>Invoice #</TableHead><TableHead>Supplier</TableHead><TableHead>Warehouse</TableHead><TableHead>Items</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                  <TableBody>{filtered.map((p, i) => (
                    <TableRow key={p.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell>{(page - 1) * 20 + i + 1}</TableCell>
                      <TableCell>{formatDate(p.date)}</TableCell>
                      <TableCell className="font-medium">{p.invoiceNumber || "—"}</TableCell>
                      <TableCell>{p.supplierName || "—"}</TableCell>
                      <TableCell className="text-sm">{p.warehouseName || "—"}</TableCell>
                      <TableCell>{Array.isArray(p.items) ? p.items.length : 0}</TableCell>
                      <TableCell className="font-medium">{currency} {(p.total ?? 0).toLocaleString()}</TableCell>
                      <TableCell><Badge variant="secondary" className={payColor[p.status] || ""}>{p.status}</Badge></TableCell>
                      <TableCell><div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowDetail(p)}><Eye className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}><Pencil className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(p.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div></TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              </div>
              <TablePagination currentPage={page} totalItems={totalItems} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>

      {/* Add Purchase Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Purchase</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Supplier</Label><Select value={form.supplierId} onValueChange={(v) => setForm(p => ({ ...p, supplierId: v }))}><SelectTrigger><SelectValue placeholder="Select Supplier (optional)" /></SelectTrigger><SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label>Invoice Number</Label><Input placeholder="Invoice Number" value={form.invoiceNumber} onChange={(e) => setForm(p => ({ ...p, invoiceNumber: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Warehouse *</Label>
              <Select
                value={selectedWarehouseId || "__none__"}
                onValueChange={(v) => setSelectedWarehouseId(v === "__none__" ? "" : v)}
              >
                <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No warehouse</SelectItem>
                  {warehouses.map(w => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name} ({w.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-2 block">Items</Label>
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div key={idx} className="flex flex-col sm:flex-row gap-2 items-start sm:items-center border rounded-lg p-2 sm:p-0 sm:border-0">
                    <div className="w-full sm:w-auto sm:flex-[4] flex gap-1"><Select value={item.ingredientId} onValueChange={(v) => updateItemRow(idx, "ingredientId", v)}><SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Ingredient" /></SelectTrigger><SelectContent>{ingredients.map(ig => <SelectItem key={ig.id} value={ig.id}>{ig.name}</SelectItem>)}</SelectContent></Select><Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" title="Add new ingredient" onClick={() => { setQuickAddTargetIdx(idx); setQuickAddForm({ name: "", categoryId: "", unitId: "" }); setQuickAddOpen(true); }}><Plus className="h-4 w-4" /></Button></div>
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
            <Button variant="outline" className="text-warning border-warning/30" onClick={() => handleSave("unpaid")} disabled={saving}>Save as Unpaid</Button>
            <Button className="gradient-primary text-primary-foreground" onClick={() => handleSave("paid")} disabled={saving}>{saving ? "Saving..." : "Save as Paid"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Payment Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Update Payment Status</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Payment Status</Label>
              <Select value={editPayment.status} onValueChange={(v) => setEditPayment(p => ({ ...p, status: v as "paid" | "unpaid" | "partial" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editPayment.status === "partial" && (
              <div className="space-y-1.5"><Label>Amount Paid</Label><Input type="number" value={editPayment.paid || ""} onChange={(e) => setEditPayment(p => ({ ...p, paid: Number(e.target.value) }))} /></div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
            <Button className="gradient-primary text-primary-foreground" onClick={handleUpdatePayment} disabled={saving}>{saving ? "Saving..." : "Update"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
        <DialogContent><DialogHeader><DialogTitle>Purchase Details — {showDetail?.invoiceNumber || "N/A"}</DialogTitle></DialogHeader>
          {showDetail && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Supplier:</span> <strong>{showDetail.supplierName || "—"}</strong></div>
                <div><span className="text-muted-foreground">Date:</span> {formatDate(showDetail.date)}</div>
                <div><span className="text-muted-foreground">Items:</span> {Array.isArray(showDetail.items) ? showDetail.items.length : 0}</div>
                <div><span className="text-muted-foreground">Status:</span> <Badge variant="secondary" className={payColor[showDetail.status] || ""}>{showDetail.status}</Badge></div>
                <div><span className="text-muted-foreground">Paid:</span> {currency} {showDetail.paid.toLocaleString()}</div>
                <div><span className="text-muted-foreground">Due:</span> <span className={showDetail.due > 0 ? "text-destructive font-medium" : ""}>{currency} {showDetail.due.toLocaleString()}</span></div>
              </div>
              <div className="border-t pt-2"><span className="text-muted-foreground">Total:</span> <strong className="text-lg">{currency} {(showDetail.total ?? 0).toLocaleString()}</strong></div>
              {Array.isArray(showDetail.items) && showDetail.items.length > 0 && (
                <div className="border-t pt-2">
                  <p className="font-medium mb-1">Items</p>
                  <div className="space-y-1">{(showDetail.items as any[]).map((item: any, i: number) => (
                    <div key={i} className="flex justify-between text-xs text-muted-foreground">
                      <span>{item.name} × {item.qty} {item.unit}</span>
                      <span>{currency} {(item.total || item.qty * item.unitPrice).toLocaleString()}</span>
                    </div>
                  ))}</div>
                </div>
              )}
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setShowDetail(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Purchase?</AlertDialogTitle><AlertDialogDescription>This will reverse stock adjustments and supplier totals. This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Quick Add Ingredient Dialog */}
      <Dialog open={quickAddOpen} onOpenChange={setQuickAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add New Ingredient</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name *</Label><Input value={quickAddForm.name} onChange={e => setQuickAddForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Chicken Breast" /></div>
            <div className="space-y-1.5"><Label>Category</Label><Select value={quickAddForm.categoryId} onValueChange={v => setQuickAddForm(p => ({ ...p, categoryId: v }))}><SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger><SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Unit</Label><Select value={quickAddForm.unitId} onValueChange={v => setQuickAddForm(p => ({ ...p, unitId: v }))}><SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger><SelectContent>{units.map(u => <SelectItem key={u.id} value={u.id}>{u.name} ({u.symbol})</SelectItem>)}</SelectContent></Select></div>
            <p className="text-xs text-muted-foreground">Stock starts at 0 and price will be set from this purchase.</p>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setQuickAddOpen(false)}>Cancel</Button><Button className="gradient-primary text-primary-foreground" onClick={handleQuickAddIngredient} disabled={!quickAddForm.name.trim() || quickAddLoading}>{quickAddLoading ? "Adding..." : "Add Ingredient"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Purchases;

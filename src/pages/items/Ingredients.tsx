import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Search, Pencil, Trash2, Leaf, X, ChevronUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { inventoryService, type IngredientRecord, type IngredientCategoryRecord, type UnitRecord } from "@/services/inventory.service";
import { supplierService, type SupplierRecord } from "@/services/supplier.service";
import { PageHeader } from "@/components/ui/page-header";
import { TablePagination, paginate } from "@/components/TablePagination";
import { cn } from "@/lib/utils";

const COMMON_BRANDS = ["Shan", "National", "Nestle", "Olper's", "Dalda", "Sufi", "Rafhan", "Knorr", "Nurpur", "Millac", "Haleeb", "K&N's", "Dawn", "Menu", "Lays"];
const emptyForm = { name: "", brand: "", categoryId: "", unitId: "", lowStockLevel: 0, supplierId: "" };

const Ingredients = () => {
  const [list, setList] = useState<IngredientRecord[]>([]);
  const [categories, setCategories] = useState<IngredientCategoryRecord[]>([]);
  const [units, setUnits] = useState<UnitRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [globalIngredientNames, setGlobalIngredientNames] = useState<string[]>([]);
  const [form, setForm] = useState<{ name: string; brand: string; categoryId: string; unitId: string; lowStockLevel: number; purchasePrice?: number; currentStock?: number; supplierId: string }>(emptyForm);
  const [page, setPage] = useState(1);

  const fetchAll = useCallback(async () => {
    try {
      const [ingredients, cats, unitList, supplierList, globalNames] = await Promise.all([
        inventoryService.getIngredients(),
        inventoryService.getIngredientCategories(),
        inventoryService.getUnits(),
        supplierService.getAll().then(r => r.data),
        inventoryService.getIngredientNames(),
      ]);
      setList(ingredients);
      setCategories(cats);
      setUnits(unitList);
      setSuppliers(supplierList);
      setGlobalIngredientNames(globalNames);
    } catch (err: any) {
      toast.error(err.message || "Failed to load ingredients");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = list.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));
  const paged = paginate(filtered, page);

  const stockStatus = (i: IngredientRecord) => {
    if (Number(i.currentStock) === 0) return { label: "Out", cls: "bg-destructive/10 text-destructive" };
    if (Number(i.currentStock) <= Number(i.lowStockLevel)) return { label: "Low", cls: "bg-warning/10 text-warning" };
    return { label: "OK", cls: "bg-success/10 text-success" };
  };

  const openAdd = () => { setEditingId(null); setForm(emptyForm); setShowDialog(true); };
  const openEdit = (item: IngredientRecord) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      brand: item.brand || "",
      categoryId: item.categoryId || "",
      unitId: item.unitId || "",
      lowStockLevel: Number(item.lowStockLevel),
      purchasePrice: Number(item.purchasePrice) || 0,
      currentStock: Number(item.currentStock),
      supplierId: item.supplierId || "",
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Ingredient name is required"); return; }
    setSaving(true);
    try {
      const supplierIdVal = form.supplierId && form.supplierId !== "none" ? form.supplierId : null;
      if (editingId) {
        await inventoryService.updateIngredient(editingId, {
          name: form.name,
          brand: form.brand || null,
          categoryId: form.categoryId || null,
          unitId: form.unitId || null,
          lowStockLevel: form.lowStockLevel,
          supplierId: supplierIdVal,
        });
        toast.success("Updated successfully");
      } else {
        await inventoryService.createIngredient({
          name: form.name,
          brand: form.brand || null,
          categoryId: form.categoryId || null,
          unitId: form.unitId || null,
          lowStockLevel: form.lowStockLevel,
          supplierId: supplierIdVal,
        });
        toast.success("Ingredient added");
      }
      setShowDialog(false);
      setEditingId(null);
      await fetchAll();
    } catch (err: any) {
      toast.error(err.message || "Failed to save ingredient");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await inventoryService.deleteIngredient(id);
      toast.success("Ingredient deactivated");
      await fetchAll();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete");
    }
  };

  if (loading) return <div className="space-y-6"><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div><Skeleton className="h-10 w-full rounded-lg" />{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg mt-2" />)}</div>;

  return (
    <div className="space-y-6">
      <PageHeader icon={<Leaf className="h-5 w-5" />} title="Ingredients" subtitle="Stock ingredients" actions={<Button className="gradient-primary text-primary-foreground" onClick={() => { if (showDialog) { setShowDialog(false); setEditingId(null); } else { openAdd(); } }}>{showDialog ? <><X className="h-4 w-4 mr-2" />Close Form</> : <><Plus className="h-4 w-4 mr-2" />Add Ingredient</>}</Button>} />
      {/* Inline Create / Edit Form Panel */}
      {showDialog && (
        <Card className="shadow-sm border-primary/30 bg-primary/[0.02]">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <h3 className="text-base font-semibold">{editingId ? "Edit" : "Add"} Ingredient</h3>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setShowDialog(false); setEditingId(null); }}>
              <ChevronUp className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Ingredient Name *</Label>
                <Input list="ingredient-name-list" placeholder="Enter name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
                <datalist id="ingredient-name-list">
                  {globalIngredientNames.map(name => <option key={name} value={name} />)}
                </datalist>
              </div>
              <div className="space-y-1.5"><Label>Brand</Label><Input list="brand-list" placeholder="Select or type brand" value={form.brand} onChange={(e) => setForm((p) => ({ ...p, brand: e.target.value }))} /><datalist id="brand-list">{[...new Set([...COMMON_BRANDS, ...list.map(i => i.brand).filter(Boolean)])].map(b => <option key={b!} value={b!} />)}</datalist></div>
              <div className="space-y-1.5"><Label>Category</Label><Select value={form.categoryId} onValueChange={(v) => setForm((p) => ({ ...p, categoryId: v }))}><SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger><SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label>Unit</Label><Select value={form.unitId} onValueChange={(v) => setForm((p) => ({ ...p, unitId: v }))}><SelectTrigger><SelectValue placeholder="Unit" /></SelectTrigger><SelectContent>{units.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label>Low Stock Level</Label><Input placeholder="0" type="number" value={form.lowStockLevel || ""} onChange={(e) => setForm((p) => ({ ...p, lowStockLevel: Number(e.target.value) }))} /></div>
              <div className="space-y-1.5">
                <Label>Supplier / Vendor</Label>
                <Select value={form.supplierId || "none"} onValueChange={(v) => setForm((p) => ({ ...p, supplierId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select Supplier" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Supplier / Vendor</SelectItem>
                    {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {editingId && (
                <>
                  <div className="space-y-1.5"><Label>Current Stock</Label><div className="h-9 px-3 flex items-center rounded-md border bg-muted/50 text-sm text-muted-foreground">{form.currentStock ?? 0} <span className="ml-1 text-xs">(updated via Purchases)</span></div></div>
                  <div className="space-y-1.5"><Label>Purchase Price</Label><div className="h-9 px-3 flex items-center rounded-md border bg-muted/50 text-sm text-muted-foreground">Rs. {form.purchasePrice ?? 0} <span className="ml-1 text-xs">(auto-updated from purchases)</span></div></div>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setShowDialog(false); setEditingId(null); }}>Cancel</Button>
              <Button className="gradient-primary text-primary-foreground" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </div>
          </CardContent>
        </Card>
      )}
      <Card className="shadow-sm"><CardHeader className="pb-3"><div className="relative max-w-sm"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search..." className="pl-9" /></div></CardHeader>
        <CardContent>{filtered.length === 0 ? (<div className="text-center py-12"><Leaf className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" /><p className="text-muted-foreground">No ingredients found</p><p className="text-xs text-muted-foreground mt-1.5">Add your first ingredient to get started.</p><Button size="sm" className="gradient-primary text-primary-foreground mt-3" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Ingredient</Button></div>) : (
          <>
            <div className="rounded-lg border overflow-auto max-h-[calc(100vh-300px)]"><Table><TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>SN</TableHead><TableHead>Name</TableHead><TableHead>Brand</TableHead><TableHead>Category</TableHead><TableHead>Unit</TableHead><TableHead>Vendor</TableHead><TableHead>Min Level</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
              <TableBody>{paged.map((item, i) => { return (<TableRow key={item.id} className="hover:bg-muted/30 transition-colors"><TableCell>{(page-1)*10+i+1}</TableCell><TableCell className="font-medium">{item.name}</TableCell><TableCell className="text-muted-foreground">{item.brand || "—"}</TableCell><TableCell>{item.category?.name || "—"}</TableCell><TableCell>{item.unit?.name || "—"}</TableCell><TableCell className="text-muted-foreground">{item.supplier?.name || "—"}</TableCell><TableCell className="text-sm">{Number(item.lowStockLevel)}</TableCell><TableCell><div className="flex gap-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}><Pencil className="h-3 w-3" /></Button>
                <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {item.name}?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(item.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
              </div></TableCell></TableRow>); })}</TableBody></Table></div>
            <TablePagination currentPage={page} totalItems={filtered.length} onPageChange={setPage} />
          </>
        )}</CardContent></Card>
    </div>
  );
};
export default Ingredients;

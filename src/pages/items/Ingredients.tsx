import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Search, Pencil, Trash2, Leaf } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { inventoryService, type IngredientRecord, type IngredientCategoryRecord, type UnitRecord } from "@/services/inventory.service";
import { PageHeader } from "@/components/ui/page-header";
import { TablePagination, paginate } from "@/components/TablePagination";
import { cn } from "@/lib/utils";

const emptyForm = { name: "", categoryId: "", unitId: "", lowStockLevel: 0 };

const Ingredients = () => {
  const [list, setList] = useState<IngredientRecord[]>([]);
  const [categories, setCategories] = useState<IngredientCategoryRecord[]>([]);
  const [units, setUnits] = useState<UnitRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<{ name: string; categoryId: string; unitId: string; lowStockLevel: number; purchasePrice?: number; currentStock?: number }>(emptyForm);
  const [page, setPage] = useState(1);

  const fetchAll = useCallback(async () => {
    try {
      const [ingredients, cats, unitList] = await Promise.all([
        inventoryService.getIngredients(),
        inventoryService.getIngredientCategories(),
        inventoryService.getUnits(),
      ]);
      setList(ingredients);
      setCategories(cats);
      setUnits(unitList);
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
      categoryId: item.categoryId || "",
      unitId: item.unitId || "",
      lowStockLevel: Number(item.lowStockLevel),
      purchasePrice: Number(item.purchasePrice) || 0,
      currentStock: Number(item.currentStock),
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Ingredient name is required"); return; }
    setSaving(true);
    try {
      if (editingId) {
        // Edit: allow updating name, category, unit, lowStockLevel only
        await inventoryService.updateIngredient(editingId, {
          name: form.name,
          categoryId: form.categoryId || null,
          unitId: form.unitId || null,
          lowStockLevel: form.lowStockLevel,
        });
        toast.success("Updated successfully");
      } else {
        // Create: do not send currentStock or purchasePrice — backend defaults to 0
        await inventoryService.createIngredient({
          name: form.name,
          categoryId: form.categoryId || null,
          unitId: form.unitId || null,
          lowStockLevel: form.lowStockLevel,
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
      <PageHeader icon={<Leaf className="h-5 w-5" />} title="Ingredients" subtitle="Stock ingredients" actions={<Button className="gradient-primary text-primary-foreground" onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Ingredient</Button>} />
      <Card className="shadow-sm"><CardHeader className="pb-3"><div className="relative max-w-sm"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search..." className="pl-9" /></div></CardHeader>
        <CardContent>{filtered.length === 0 ? (<div className="text-center py-12"><Leaf className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" /><p className="text-muted-foreground">No ingredients found</p><p className="text-xs text-muted-foreground mt-1.5">Add your first ingredient to get started.</p><Button size="sm" className="gradient-primary text-primary-foreground mt-3" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Ingredient</Button></div>) : (
          <>
            <div className="rounded-lg border overflow-auto max-h-[calc(100vh-300px)]"><Table><TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>SN</TableHead><TableHead>Name</TableHead><TableHead>Category</TableHead><TableHead>Unit</TableHead><TableHead>Price</TableHead><TableHead>Stock</TableHead><TableHead>Min Level</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
              <TableBody>{paged.map((item, i) => { const s = stockStatus(item); return (<TableRow key={item.id} className={cn("hover:bg-muted/30 transition-colors", Number(item.currentStock) === 0 && "bg-destructive/5")}><TableCell>{(page-1)*10+i+1}</TableCell><TableCell className="font-medium">{item.name}</TableCell><TableCell>{item.category?.name || "—"}</TableCell><TableCell>{item.unit?.name || "—"}</TableCell><TableCell>Rs. {Number(item.purchasePrice) || 0}</TableCell><TableCell className="font-medium">{Number(item.currentStock)} {item.unit?.name}</TableCell><TableCell>{Number(item.lowStockLevel)}</TableCell><TableCell><Badge variant="secondary" className={s.cls}>{s.label}</Badge></TableCell><TableCell><div className="flex gap-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}><Pencil className="h-3 w-3" /></Button>
                <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {item.name}?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(item.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
              </div></TableCell></TableRow>); })}</TableBody></Table></div>
            <TablePagination currentPage={page} totalItems={filtered.length} onPageChange={setPage} />
          </>
        )}</CardContent></Card>
      <Dialog open={showDialog} onOpenChange={setShowDialog}><DialogContent><DialogHeader><DialogTitle>{editingId ? "Edit" : "Add"} Ingredient</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Ingredient Name</Label><Input placeholder="Enter name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Category</Label><Select value={form.categoryId} onValueChange={(v) => setForm((p) => ({ ...p, categoryId: v }))}><SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger><SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Unit</Label><Select value={form.unitId} onValueChange={(v) => setForm((p) => ({ ...p, unitId: v }))}><SelectTrigger><SelectValue placeholder="Unit" /></SelectTrigger><SelectContent>{units.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Low Stock Level</Label><Input placeholder="0" type="number" value={form.lowStockLevel || ""} onChange={(e) => setForm((p) => ({ ...p, lowStockLevel: Number(e.target.value) }))} /></div>
            {editingId && (
              <>
                <div className="space-y-1.5"><Label>Current Stock</Label><div className="h-9 px-3 flex items-center rounded-md border bg-muted/50 text-sm text-muted-foreground">{form.currentStock ?? 0} <span className="ml-1 text-xs">(updated via Purchases)</span></div></div>
                <div className="space-y-1.5 col-span-2"><Label>Purchase Price</Label><div className="h-9 px-3 flex items-center rounded-md border bg-muted/50 text-sm text-muted-foreground">Rs. {form.purchasePrice ?? 0} <span className="ml-1 text-xs">(auto-updated from purchases)</span></div></div>
              </>
            )}
          </div></div>
        <DialogFooter><Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button><Button className="gradient-primary text-primary-foreground" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
};
export default Ingredients;

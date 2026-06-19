import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Search, Pencil, Trash2, Package, X, ChevronUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { inventoryService, type PreMadeFoodRecord } from "@/services/inventory.service";
import { PageHeader } from "@/components/ui/page-header";

const emptyForm = { name: "", unit: "", costPerUnit: 0, currentStock: 0, lowStockLevel: 0 };

const PreMadeFood = () => {
  const [list, setList] = useState<PreMadeFoodRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm);

  const fetchItems = useCallback(async () => {
    try {
      const data = await inventoryService.getPreMadeFood();
      setList(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load pre-made food");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const filtered = list.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  const openAdd = () => { setEditingId(null); setForm(emptyForm); setShowDialog(true); };
  const openEdit = (item: PreMadeFoodRecord) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      unit: item.unit || "",
      costPerUnit: Number(item.costPerUnit) || 0,
      currentStock: Number(item.currentStock),
      lowStockLevel: Number(item.lowStockLevel),
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Item name is required"); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        unit: form.unit || null,
        costPerUnit: form.costPerUnit || null,
        currentStock: form.currentStock,
        lowStockLevel: form.lowStockLevel,
      };
      if (editingId) {
        await inventoryService.updatePreMadeFood(editingId, payload);
        toast.success("Updated");
      } else {
        await inventoryService.createPreMadeFood(payload);
        toast.success("Pre-made food added");
      }
      setShowDialog(false);
      setEditingId(null);
      await fetchItems();
    } catch (err: any) {
      toast.error(err.message || "Failed to save item");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await inventoryService.deletePreMadeFood(id);
      toast.success("Deleted");
      await fetchItems();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete item");
    }
  };

  if (loading) return <div className="space-y-6"><Skeleton className="h-10 w-full rounded-lg" />{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg mt-2" />)}</div>;

  return (
    <div className="space-y-6">
      <PageHeader icon={<Package className="h-5 w-5" />} title="Pre-Made Food" subtitle="Ready-made items" actions={<Button className="gradient-primary text-primary-foreground" onClick={() => { if (showDialog) { setShowDialog(false); setEditingId(null); } else { openAdd(); } }}>{showDialog ? <><X className="h-4 w-4 mr-2" />Close Form</> : <><Plus className="h-4 w-4 mr-2" />Add Item</>}</Button>} />
      {/* Inline Create / Edit Form Panel */}
      {showDialog && (
        <Card className="shadow-sm border-primary/30 bg-primary/[0.02]">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <h3 className="text-base font-semibold">{editingId ? "Edit" : "Add"} Pre-Made Food</h3>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setShowDialog(false); setEditingId(null); }}>
              <ChevronUp className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5"><Label>Item Name</Label><Input placeholder="Enter name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Unit</Label><Input placeholder="e.g. kg, pcs" value={form.unit} onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Cost Per Unit</Label><Input placeholder="0" type="number" value={form.costPerUnit || ""} onChange={(e) => setForm((p) => ({ ...p, costPerUnit: Number(e.target.value) }))} /></div>
              <div className="space-y-1.5"><Label>Current Stock</Label><Input placeholder="0" type="number" value={form.currentStock || ""} onChange={(e) => setForm((p) => ({ ...p, currentStock: Number(e.target.value) }))} /></div>
              <div className="space-y-1.5"><Label>Low Stock Level</Label><Input placeholder="0" type="number" value={form.lowStockLevel || ""} onChange={(e) => setForm((p) => ({ ...p, lowStockLevel: Number(e.target.value) }))} /></div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setShowDialog(false); setEditingId(null); }}>Cancel</Button>
              <Button className="gradient-primary text-primary-foreground" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </div>
          </CardContent>
        </Card>
      )}
      <Card className="shadow-sm"><CardHeader className="pb-3"><div className="relative max-w-sm"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="pl-9" /></div></CardHeader>
        <CardContent>{filtered.length === 0 ? (<div className="text-center py-12"><Package className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" /><p className="text-muted-foreground">No items found</p><p className="text-xs text-muted-foreground mt-1.5">Add your first pre-made item to get started.</p><Button size="sm" className="gradient-primary text-primary-foreground mt-3" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Item</Button></div>) : (
          <div className="rounded-lg border overflow-auto max-h-[calc(100vh-300px)]"><Table><TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>SN</TableHead><TableHead>Name</TableHead><TableHead>Unit</TableHead><TableHead>Cost/Unit</TableHead><TableHead>Stock</TableHead><TableHead>Min Level</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
            <TableBody>{filtered.map((item, i) => (<TableRow key={item.id} className="hover:bg-muted/30 transition-colors"><TableCell>{i+1}</TableCell><TableCell className="font-medium">{item.name}</TableCell><TableCell>{item.unit || "—"}</TableCell><TableCell>Rs. {Number(item.costPerUnit) || 0}</TableCell><TableCell>{Number(item.currentStock)}</TableCell><TableCell>{Number(item.lowStockLevel)}</TableCell><TableCell><Badge variant="secondary" className="bg-success/10 text-success">{item.status}</Badge></TableCell><TableCell><div className="flex gap-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}><Pencil className="h-3 w-3" /></Button>
              <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {item.name}?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(item.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
            </div></TableCell></TableRow>))}</TableBody></Table></div>
        )}</CardContent></Card>
    </div>
  );
};
export default PreMadeFood;

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Search, Pencil, Trash2, Layers, X, ChevronUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { inventoryService, type IngredientCategoryRecord } from "@/services/inventory.service";
import { PageHeader } from "@/components/ui/page-header";

const IngredientCategories = () => {
  const [list, setList] = useState<IngredientCategoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", description: "" });

  const fetchCategories = useCallback(async () => {
    try {
      const data = await inventoryService.getIngredientCategories();
      setList(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load categories");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  const filtered = list.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  const openAdd = () => { setEditingId(null); setForm({ name: "", description: "" }); setShowDialog(true); };
  const openEdit = (item: IngredientCategoryRecord) => { setEditingId(item.id); setForm({ name: item.name, description: item.description || "" }); setShowDialog(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Category name is required"); return; }
    setSaving(true);
    try {
      if (editingId) {
        await inventoryService.updateIngredientCategory(editingId, { name: form.name, description: form.description || undefined });
        toast.success("Updated");
      } else {
        await inventoryService.createIngredientCategory({ name: form.name, description: form.description || undefined });
        toast.success("Category added");
      }
      setShowDialog(false);
      setEditingId(null);
      await fetchCategories();
    } catch (err: any) {
      toast.error(err.message || "Failed to save category");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await inventoryService.deleteIngredientCategory(id);
      toast.success("Deleted");
      await fetchCategories();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete category");
    }
  };

  if (loading) return <div className="space-y-6"><Skeleton className="h-10 w-full rounded-lg" />{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg mt-2" />)}</div>;

  return (
    <div className="space-y-6">
      <PageHeader icon={<Layers className="h-5 w-5" />} title="Ingredient Categories" subtitle="Organize ingredients" actions={<Button className="gradient-primary text-primary-foreground" onClick={() => { if (showDialog) { setShowDialog(false); setEditingId(null); } else { openAdd(); } }}>{showDialog ? <><X className="h-4 w-4 mr-2" />Close Form</> : <><Plus className="h-4 w-4 mr-2" />Add Category</>}</Button>} />
      {/* Inline Create / Edit Form Panel */}
      {showDialog && (
        <Card className="shadow-sm border-primary/30 bg-primary/[0.02]">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <h3 className="text-base font-semibold">{editingId ? "Edit" : "Add"} Category</h3>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setShowDialog(false); setEditingId(null); }}>
              <ChevronUp className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Category Name</Label><Input placeholder="Enter category name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Description</Label><Input placeholder="Enter description" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} /></div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setShowDialog(false); setEditingId(null); }}>Cancel</Button>
              <Button className="gradient-primary text-primary-foreground" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </div>
          </CardContent>
        </Card>
      )}
      <Card className="shadow-sm"><CardHeader className="pb-3"><div className="relative max-w-sm"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="pl-9" /></div></CardHeader>
        <CardContent>{filtered.length === 0 ? (<div className="text-center py-12"><Layers className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" /><p className="text-muted-foreground">No categories found</p><p className="text-xs text-muted-foreground mt-1.5">Add your first category to get started.</p><Button size="sm" className="gradient-primary text-primary-foreground mt-3" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Category</Button></div>) : (
          <div className="rounded-lg border overflow-auto max-h-[calc(100vh-300px)]"><Table><TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>SN</TableHead><TableHead>Name</TableHead><TableHead>Description</TableHead><TableHead>Ingredients</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
            <TableBody>{filtered.map((c, i) => (<TableRow key={c.id} className="hover:bg-muted/30 transition-colors"><TableCell>{i+1}</TableCell><TableCell className="font-medium">{c.name}</TableCell><TableCell className="text-muted-foreground">{c.description}</TableCell><TableCell className="text-muted-foreground text-sm">{c._count?.ingredients ?? 0}</TableCell><TableCell><Badge variant="secondary" className="bg-success/10 text-success">{c.status}</Badge></TableCell><TableCell><div className="flex gap-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}><Pencil className="h-3 w-3" /></Button>
              <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {c.name}?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(c.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
            </div></TableCell></TableRow>))}</TableBody></Table></div>
        )}</CardContent></Card>
    </div>
  );
};
export default IngredientCategories;

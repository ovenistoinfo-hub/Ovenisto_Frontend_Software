import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Search, Pencil, Trash2, GripVertical, Grid3x3 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { menuService, type CategoryRecord } from "@/services/menu.service";
import { PageHeader } from "@/components/ui/page-header";

const MenuCategories = () => {
  const [list, setList] = useState<CategoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", displayOrder: 0 });

  const fetchCategories = useCallback(async () => {
    try {
      const data = await menuService.getCategories();
      setList(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load categories");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  const filtered = [...list]
    .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const openAdd = () => { setEditingId(null); setForm({ name: "", displayOrder: 0 }); setShowDialog(true); };
  const openEdit = (item: CategoryRecord) => { setEditingId(item.id); setForm({ name: item.name, displayOrder: item.displayOrder }); setShowDialog(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Category name is required"); return; }
    setSaving(true);
    try {
      if (editingId) {
        await menuService.updateCategory(editingId, { name: form.name, displayOrder: form.displayOrder });
        toast.success("Updated");
      } else {
        await menuService.createCategory({ name: form.name, displayOrder: form.displayOrder || list.length + 1 });
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
      await menuService.deleteCategory(id);
      toast.success("Deleted");
      await fetchCategories();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete category");
    }
  };

  if (loading) return <div className="space-y-6"><Skeleton className="h-10 w-full rounded-lg" />{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg mt-2" />)}</div>;

  return (
    <div className="space-y-6">
      <PageHeader icon={<Grid3x3 className="h-5 w-5" />} title="Menu Categories" subtitle="Organize your menu" actions={<Button className="gradient-primary text-primary-foreground" onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Category</Button>} />
      <Card className="shadow-sm"><CardHeader className="pb-3"><div className="relative max-w-sm"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="pl-9" /></div></CardHeader>
        <CardContent>{filtered.length === 0 ? (<div className="text-center py-12"><Grid3x3 className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" /><p className="text-muted-foreground">No categories found</p><p className="text-xs text-muted-foreground mt-1.5">Add your first category to get started.</p><Button size="sm" className="gradient-primary text-primary-foreground mt-3" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Category</Button></div>) : (
          <div className="rounded-lg border overflow-auto max-h-[calc(100vh-300px)]"><Table><TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead className="w-10"></TableHead><TableHead>SN</TableHead><TableHead>Name</TableHead><TableHead>Order</TableHead><TableHead>Items</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
            <TableBody>{filtered.map((c, i) => (<TableRow key={c.id} className="hover:bg-muted/30 transition-colors"><TableCell><GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" /></TableCell><TableCell>{i+1}</TableCell><TableCell className="font-medium">{c.name}</TableCell><TableCell>{c.displayOrder}</TableCell><TableCell>{c._count?.menuItems ?? 0}</TableCell><TableCell><Badge variant="secondary" className="bg-success/10 text-success">{c.status}</Badge></TableCell><TableCell><div className="flex gap-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}><Pencil className="h-3 w-3" /></Button>
              <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {c.name}?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(c.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
            </div></TableCell></TableRow>))}</TableBody></Table></div>
        )}</CardContent></Card>
      <Dialog open={showDialog} onOpenChange={setShowDialog}><DialogContent><DialogHeader><DialogTitle>{editingId ? "Edit" : "Add"} Category</DialogTitle></DialogHeader>
        <div className="space-y-3"><div className="space-y-1.5"><Label>Category Name</Label><Input placeholder="Enter category name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div><div className="space-y-1.5"><Label>Display Order</Label><Input placeholder="0" type="number" value={form.displayOrder || ""} onChange={(e) => setForm((p) => ({ ...p, displayOrder: Number(e.target.value) }))} /></div></div>
        <DialogFooter><Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button><Button className="gradient-primary text-primary-foreground" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
};
export default MenuCategories;

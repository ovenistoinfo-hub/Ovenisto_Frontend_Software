import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Search, Pencil, Trash2, UtensilsCrossed } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { mealTypeService, type MealTypeRecord } from "@/services/mealType.service";
import { PageHeader } from "@/components/ui/page-header";

const MealTypes = () => {
  const [list, setList] = useState<MealTypeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", status: "active" as "active" | "inactive" });

  const fetchMealTypes = useCallback(async () => {
    try {
      const data = await mealTypeService.getAll();
      setList(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load meal types");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMealTypes(); }, [fetchMealTypes]);

  const filtered = list.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()));

  const openAdd = () => { setEditingId(null); setForm({ name: "", status: "active" }); setShowDialog(true); };
  const openEdit = (item: MealTypeRecord) => { setEditingId(item.id); setForm({ name: item.name, status: item.status as "active" | "inactive" }); setShowDialog(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Meal type name is required"); return; }
    setSaving(true);
    try {
      if (editingId) {
        await mealTypeService.update(editingId, { name: form.name, status: form.status });
        toast.success("Updated");
      } else {
        await mealTypeService.create({ name: form.name, status: form.status });
        toast.success("Meal type added");
      }
      setShowDialog(false);
      setEditingId(null);
      await fetchMealTypes();
    } catch (err: any) {
      toast.error(err.message || "Failed to save meal type");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await mealTypeService.delete(id);
      toast.success("Deleted");
      await fetchMealTypes();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete meal type");
    }
  };

  if (loading) return <div className="space-y-6"><Skeleton className="h-10 w-full rounded-lg" />{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg mt-2" />)}</div>;

  return (
    <div className="space-y-6">
      <PageHeader icon={<UtensilsCrossed className="h-5 w-5" />} title="Meal Types" subtitle="Manage meal service categories (Breakfast, Lunch, Dinner etc.)" actions={<Button className="gradient-primary text-primary-foreground" onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Meal Type</Button>} />
      <Card className="shadow-sm"><CardHeader className="pb-3"><div className="relative max-w-sm"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="pl-9" /></div></CardHeader>
        <CardContent>{filtered.length === 0 ? (<div className="text-center py-12"><UtensilsCrossed className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" /><p className="text-muted-foreground">No meal types found</p><p className="text-xs text-muted-foreground mt-1.5">Add your first meal type to get started.</p><Button size="sm" className="gradient-primary text-primary-foreground mt-3" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Meal Type</Button></div>) : (
          <div className="rounded-lg border overflow-auto max-h-[calc(100vh-300px)]"><Table><TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>SN</TableHead><TableHead>Name</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
            <TableBody>{filtered.map((m, i) => (<TableRow key={m.id} className="hover:bg-muted/30 transition-colors"><TableCell>{i+1}</TableCell><TableCell className="font-medium">{m.name}</TableCell><TableCell><Badge variant="secondary" className={m.status === "active" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}>{m.status}</Badge></TableCell><TableCell><div className="flex gap-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(m)}><Pencil className="h-3 w-3" /></Button>
              <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {m.name}?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(m.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
            </div></TableCell></TableRow>))}</TableBody></Table></div>
        )}</CardContent></Card>
      <Dialog open={showDialog} onOpenChange={setShowDialog}><DialogContent><DialogHeader><DialogTitle>{editingId ? "Edit" : "Add"} Meal Type</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Name</Label><Input placeholder="e.g., Breakfast" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div>
          <div className="flex items-center justify-between"><Label>Active</Label><Switch checked={form.status === "active"} onCheckedChange={(c) => setForm(p => ({ ...p, status: c ? "active" : "inactive" }))} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button><Button className="gradient-primary text-primary-foreground" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
};
export default MealTypes;

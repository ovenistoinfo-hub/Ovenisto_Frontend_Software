import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Search, ExternalLink, Pencil, Trash2, ChefHat, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useData } from "@/contexts/DataContext";
import { PageHeader } from "@/components/ui/page-header";
import { orderService, type KitchenRecord } from "@/services/order.service";
import { menuService } from "@/services/menu.service";

const Kitchens = () => {
  const navigate = useNavigate();
  const { settings: _settings } = useData();

  const [kitchenList, setKitchenList] = useState<KitchenRecord[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", assignedCategories: [] as string[] });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [kitchens, cats] = await Promise.all([
        orderService.getKitchens(),
        menuService.getCategories(),
      ]);
      setKitchenList(kitchens);
      setCategories(cats);
    } catch {
      toast.error("Failed to load kitchens");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = kitchenList.filter((k) => k.name.toLowerCase().includes(search.toLowerCase()));

  const openAdd = () => {
    setEditingId(null);
    setForm({ name: "", assignedCategories: [] });
    setShowDialog(true);
  };

  const openEdit = (k: KitchenRecord) => {
    setEditingId(k.id);
    setForm({ name: k.name, assignedCategories: [...k.assignedCategories] });
    setShowDialog(true);
  };

  const toggleCategory = (cat: string) => {
    setForm(p => ({
      ...p,
      assignedCategories: p.assignedCategories.includes(cat)
        ? p.assignedCategories.filter(c => c !== cat)
        : [...p.assignedCategories, cat],
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Kitchen name is required"); return; }
    setSaving(true);
    try {
      if (editingId) {
        const updated = await orderService.updateKitchen(editingId, { name: form.name, assignedCategories: form.assignedCategories });
        setKitchenList(prev => prev.map(k => k.id === editingId ? updated : k));
        toast.success("Kitchen updated");
      } else {
        const created = await orderService.createKitchen({ name: form.name, assignedCategories: form.assignedCategories });
        setKitchenList(prev => [...prev, created]);
        toast.success("Kitchen added");
      }
      setShowDialog(false);
      setEditingId(null);
      setForm({ name: "", assignedCategories: [] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to save kitchen");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await orderService.deleteKitchen(id);
      setKitchenList(prev => prev.filter(k => k.id !== id));
      toast.success("Kitchen deleted");
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete kitchen");
    }
  };

  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-full rounded-lg" />
      {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg mt-2" />)}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<ChefHat className="h-5 w-5" />}
        title="Kitchen Stations"
        subtitle="Manage kitchen setup"
        actions={<Button className="gradient-primary text-primary-foreground" onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Kitchen</Button>}
      />
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search kitchens..." className="pl-9" />
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <ChefHat className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" />
              <p className="text-muted-foreground">No kitchens found</p>
              <p className="text-xs text-muted-foreground mt-1.5">Add your first kitchen station.</p>
              <Button size="sm" className="gradient-primary text-primary-foreground mt-3" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Kitchen</Button>
            </div>
          ) : (
            <div className="rounded-lg border overflow-auto max-h-[calc(100vh-300px)]">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead>SN</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Kitchen Panel</TableHead>
                    <TableHead>Categories</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((k, i) => {
                    const visibleCats = k.assignedCategories.slice(0, 3);
                    const overflowCount = k.assignedCategories.length - 3;
                    return (
                      <TableRow key={k.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell>{i + 1}</TableCell>
                        <TableCell className="font-medium">{k.name}</TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" className="text-primary border-primary/30"
                            onClick={() => navigate(`/kitchen-panel/${k.id}`)}>
                            <ExternalLink className="h-3 w-3 mr-1" />Open Panel
                          </Button>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {visibleCats.map((c) => <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>)}
                            {overflowCount > 0 && <Badge variant="secondary" className="text-xs">+{overflowCount} more</Badge>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(k)}><Pencil className="h-3 w-3" /></Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete {k.name}?</AlertDialogTitle>
                                  <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDelete(k.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={(v) => { if (!saving) setShowDialog(v); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? "Edit" : "Add"} Kitchen</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Kitchen Name</Label>
              <Input value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Enter kitchen name" />
            </div>
            <div>
              <Label className="mb-2 block">Assigned Categories</Label>
              <div className="grid grid-cols-2 gap-2">
                {categories.map(c => (
                  <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={form.assignedCategories.includes(c.name)}
                      onCheckedChange={() => toggleCategory(c.name)}
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={saving}>Cancel</Button>
            <Button className="gradient-primary text-primary-foreground" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Kitchens;

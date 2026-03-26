import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Search, Pencil, Trash2, Eye, Warehouse, Building2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { warehouseService, type WarehouseRecord, type WarehouseType } from "@/services/warehouse.service";
import { outletService } from "@/services/outlet.service";
import { userService } from "@/services/user.service";
import { PageHeader } from "@/components/ui/page-header";

const Warehouses = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = ['Super Admin', 'Admin'].includes(user?.role || '');
  const [list, setList] = useState<WarehouseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<WarehouseType | "ALL">("ALL");
  const [outlets, setOutlets] = useState<{ id: string; name: string }[]>([]);
  const [managers, setManagers] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    name: "",
    code: "",
    type: "MAIN" as WarehouseType,
    outletId: "",
    managerId: "",
    isActive: true,
  });

  const fetchWarehouses = useCallback(async () => {
    try {
      const data = await warehouseService.getAll();
      setList(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load warehouses");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchOutlets = useCallback(async () => {
    try {
      const data = await outletService.getOutlets();
      setOutlets(data.map(o => ({ id: o.id, name: o.name })));
    } catch (err: any) {
      toast.error(err.message || "Failed to load outlets");
    }
  }, []);

  const fetchManagers = useCallback(async () => {
    try {
      const data = await userService.getAll({ role: "Manager" });
      setManagers(data.map(u => ({ id: u.id, name: u.name })));
    } catch (err: any) {
      // Silently fail if managers can't be loaded
    }
  }, []);

  useEffect(() => {
    fetchWarehouses();
    fetchOutlets();
    fetchManagers();
  }, [fetchWarehouses, fetchOutlets, fetchManagers]);

  const filtered = list.filter(w => {
    const matchesSearch = w.name.toLowerCase().includes(search.toLowerCase()) || w.code.toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType === "ALL" || w.type === filterType;
    return matchesSearch && matchesType;
  });

  const stats = {
    main: list.filter(w => w.type === "MAIN" && w.isActive).length,
    branch: list.filter(w => w.type === "BRANCH" && w.isActive).length,
    kitchen: list.filter(w => w.type === "KITCHEN" && w.isActive).length,
  };

  const openAdd = () => {
    setEditingId(null);
    setForm({ name: "", code: "", type: "MAIN", outletId: "", managerId: "", isActive: true });
    setShowDialog(true);
  };

  const openEdit = (item: WarehouseRecord) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      code: item.code,
      type: item.type,
      outletId: item.outletId || "",
      managerId: item.managerId || "",
      isActive: item.isActive,
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Warehouse name is required"); return; }
    if (!form.type) { toast.error("Warehouse type is required"); return; }
    setSaving(true);
    try {
      if (editingId) {
        await warehouseService.update(editingId, {
          name: form.name,
          code: form.code || undefined,
          outletId: form.outletId || undefined,
          managerId: form.managerId || undefined,
          isActive: form.isActive,
        });
        toast.success("Updated");
      } else {
        await warehouseService.create({
          name: form.name,
          code: form.code || undefined,
          type: form.type,
          outletId: form.outletId || undefined,
          managerId: form.managerId || undefined,
        });
        toast.success("Warehouse added");
      }
      setShowDialog(false);
      setEditingId(null);
      await fetchWarehouses();
    } catch (err: any) {
      toast.error(err.message || "Failed to save warehouse");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await warehouseService.delete(id);
      toast.success("Deleted");
      await fetchWarehouses();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete warehouse");
    }
  };

  const getTypeIcon = (type: WarehouseType) => {
    const icons: Record<WarehouseType, JSX.Element> = {
      MAIN: <Warehouse className="h-4 w-4" />,
      BRANCH: <Building2 className="h-4 w-4" />,
      KITCHEN: <Warehouse className="h-4 w-4" />,
    };
    return icons[type];
  };

  const getTypeColor = (type: WarehouseType) => {
    const colors: Record<WarehouseType, string> = {
      MAIN: "bg-blue-100 text-blue-800",
      BRANCH: "bg-orange-100 text-orange-800",
      KITCHEN: "bg-green-100 text-green-800",
    };
    return colors[type];
  };

  if (loading) return <div className="space-y-6"><Skeleton className="h-10 w-full rounded-lg" />{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg mt-2" />)}</div>;

  return (
    <div className="space-y-6">
      <PageHeader icon={<Warehouse className="h-5 w-5" />} title="Warehouses" subtitle="Manage stock locations" actions={isAdmin ? <Button className="gradient-primary text-primary-foreground" onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Warehouse</Button> : undefined} />

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="shadow-sm"><CardContent className="pt-6"><div className="text-3xl font-bold text-blue-600">{stats.main}</div><p className="text-sm text-muted-foreground mt-1">Main Warehouses</p></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="pt-6"><div className="text-3xl font-bold text-orange-600">{stats.branch}</div><p className="text-sm text-muted-foreground mt-1">Branch Stores</p></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="pt-6"><div className="text-3xl font-bold text-green-600">{stats.kitchen}</div><p className="text-sm text-muted-foreground mt-1">Kitchens</p></CardContent></Card>
      </div>

      {/* Filters */}
      <Card className="shadow-sm"><CardHeader className="pb-3"><div className="flex gap-4 items-end">
        <div className="flex-1"><Label className="text-xs text-muted-foreground">Search</Label><div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or code..." className="pl-9" /></div></div>
        <div className="w-48"><Label className="text-xs text-muted-foreground">Type</Label><Select value={filterType} onValueChange={(v) => setFilterType(v as WarehouseType | "ALL")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">All Types</SelectItem><SelectItem value="MAIN">Main</SelectItem><SelectItem value="BRANCH">Branch</SelectItem><SelectItem value="KITCHEN">Kitchen</SelectItem></SelectContent></Select></div>
      </div></CardHeader></Card>

      {/* Table */}
      <Card className="shadow-sm"><CardContent>
        {filtered.length === 0 ? (
          <div className="text-center py-12"><Warehouse className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" /><p className="text-muted-foreground">No warehouses found</p>{isAdmin && <Button size="sm" className="gradient-primary text-primary-foreground mt-3" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Warehouse</Button>}</div>
        ) : (
          <div className="rounded-lg border overflow-auto max-h-[calc(100vh-400px)]"><Table><TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>SN</TableHead><TableHead>Name</TableHead><TableHead>Code</TableHead><TableHead>Type</TableHead><TableHead>Outlet</TableHead><TableHead>Manager</TableHead><TableHead className="text-center">Stock Items</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
            <TableBody>{filtered.map((w, i) => (<TableRow key={w.id} className="hover:bg-muted/30 transition-colors"><TableCell>{i+1}</TableCell><TableCell className="font-medium">{w.name}</TableCell><TableCell className="font-mono text-sm">{w.code}</TableCell><TableCell><Badge variant="secondary" className={getTypeColor(w.type)}>{w.type}</Badge></TableCell><TableCell className="text-sm">{w.outlet?.name || "—"}</TableCell><TableCell className="text-sm">{w.manager?.name || "—"}</TableCell><TableCell className="text-center text-sm">{w._count?.warehouseStock || 0}</TableCell><TableCell><Badge variant="secondary" className={w.isActive ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}>{w.isActive ? "Active" : "Inactive"}</Badge></TableCell><TableCell><div className="flex gap-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/warehouses/${w.id}/stock`)}><Eye className="h-3 w-3" title="View Stock" /></Button>{isAdmin && <><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(w)}><Pencil className="h-3 w-3" /></Button>
              <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {w.name}?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(w.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>}
            </div></TableCell></TableRow>))}</TableBody></Table></div>
        )}
      </CardContent></Card>

      {/* Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}><DialogContent><DialogHeader><DialogTitle>{editingId ? "Edit" : "Add"} Warehouse</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Name *</Label><Input placeholder="e.g., Main Warehouse" value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label>Code</Label><Input placeholder="Auto-generated if left blank" value={form.code} onChange={(e) => setForm(p => ({ ...p, code: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label>Type *</Label><Select value={form.type} onValueChange={(v) => setForm(p => ({ ...p, type: v as WarehouseType }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="MAIN">Main</SelectItem><SelectItem value="BRANCH">Branch</SelectItem><SelectItem value="KITCHEN">Kitchen</SelectItem></SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Outlet</Label><Select value={form.outletId || "__none__"} onValueChange={(v) => setForm(p => ({ ...p, outletId: v === "__none__" ? "" : v }))}><SelectTrigger><SelectValue placeholder="Select outlet (optional)" /></SelectTrigger><SelectContent><SelectItem value="__none__">None</SelectItem>{outlets.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Manager</Label><Input placeholder="Manager name (optional)" value={form.managerId} onChange={(e) => setForm(p => ({ ...p, managerId: e.target.value }))} /></div>
          {editingId && (
            <div className="flex items-center justify-between"><Label>Active</Label><Switch checked={form.isActive} onCheckedChange={(c) => setForm(p => ({ ...p, isActive: c }))} /></div>
          )}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button><Button className="gradient-primary text-primary-foreground" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
};

export default Warehouses;

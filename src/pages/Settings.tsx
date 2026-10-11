import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Settings as SettingsIcon, Plus, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { warehouseService, type WarehouseRecord, type WarehouseType } from "@/services/warehouse.service";
import { WebsiteSettingsTab } from "@/components/settings/WebsiteSettingsTab";
import { GeneralSettingsTab } from "@/components/settings/GeneralSettingsTab";
import { outletService } from "@/services/outlet.service";

const tabSlugMap: Record<string, string> = {
  general: "",
  "self-order": "self-order",
  warehouses: "warehouses",
  website: "website",
};
const slugTabMap: Record<string, string> = {
  "": "general",
  "self-order": "self-order",
  warehouses: "warehouses",
  website: "website",
};

const TYPE_COLOR: Record<WarehouseType, string> = {
  MAIN: "bg-blue-100 text-blue-800",
  BRANCH: "bg-orange-100 text-orange-800",
  KITCHEN: "bg-green-100 text-green-800",
};

function WarehousesTab() {
  const { user } = useAuth();
  const canEdit = ['Super Admin', 'Admin'].includes(user?.role ?? '');
  const [list, setList] = useState<WarehouseRecord[]>([]);
  const [outlets, setOutlets] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", code: "", address: "", type: "MAIN" as WarehouseType, outletId: "", managerId: "", isActive: true });

  useEffect(() => {
    Promise.all([warehouseService.getAll(), outletService.getOutlets()])
      .then(([whData, outData]) => {
        setList(whData);
        setOutlets(outData.map(o => ({ id: o.id, name: o.name })));
      })
      .catch(() => toast.error("Failed to load warehouses"))
      .finally(() => setLoading(false));
  }, []);

  const refresh = async () => {
    const data = await warehouseService.getAll();
    setList(data);
  };

  const openAdd = () => {
    setEditingId(null);
    setForm({ name: "", code: "", address: "", type: "MAIN", outletId: "", managerId: "", isActive: true });
    setShowDialog(true);
  };

  const openEdit = (w: WarehouseRecord) => {
    setEditingId(w.id);
    setForm({ name: w.name, code: w.code, address: w.address || "", type: w.type, outletId: w.outletId || "", managerId: w.managerId || "", isActive: w.isActive });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (!form.address.trim()) { toast.error("Address is required"); return; }
    setSaving(true);
    try {
      if (editingId) {
        await warehouseService.update(editingId, { name: form.name, code: form.code || undefined, address: form.address, outletId: form.outletId || undefined, managerId: form.managerId || undefined, isActive: form.isActive });
        toast.success("Updated");
      } else {
        await warehouseService.create({ name: form.name, code: form.code || undefined, address: form.address, type: form.type, outletId: form.outletId || undefined, managerId: form.managerId || undefined });
        toast.success("Warehouse added");
      }
      setShowDialog(false);
      await refresh();
    } catch (err: Error | any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await warehouseService.delete(id);
      toast.success("Deleted");
      await refresh();
    } catch (err: Error | any) {
      toast.error(err.message || "Failed to delete");
    }
  };

  if (loading) return <div className="space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-10 w-full rounded" />)}</div>;

  return (
    <>
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle>Warehouse Management</CardTitle>
          {canEdit && <Button size="sm" className="gradient-primary text-primary-foreground" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Warehouse</Button>}
        </CardHeader>
        <CardContent>
          {list.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No warehouses. Click "Add Warehouse" to create one.</p>
          ) : (
            <div className="rounded-lg border overflow-auto">
              <Table>
                <TableHeader><TableRow className="bg-muted/50"><TableHead>SN</TableHead><TableHead>Name</TableHead><TableHead>Code</TableHead><TableHead>Type</TableHead><TableHead>Address</TableHead><TableHead>Outlet</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                <TableBody>{list.map((w, i) => (
                  <TableRow key={w.id}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell className="font-medium">{w.name}</TableCell>
                    <TableCell className="font-mono text-sm">{w.code}</TableCell>
                    <TableCell><Badge variant="secondary" className={TYPE_COLOR[w.type]}>{w.type}</Badge></TableCell>
                    <TableCell className="text-sm max-w-[180px] truncate" title={w.address}>{w.address || "—"}</TableCell>
                    <TableCell className="text-sm">{w.outlet?.name || "—"}</TableCell>
                    <TableCell><Badge variant="secondary" className={w.isActive ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}>{w.isActive ? "Active" : "Inactive"}</Badge></TableCell>
                    <TableCell>
                      {canEdit ? (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(w)}><Pencil className="h-3 w-3" /></Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"><Trash2 className="h-3 w-3" /></Button></AlertDialogTrigger>
                          <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {w.name}?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(w.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                        </AlertDialog>
                      </div>
                      ) : <span className="text-xs text-muted-foreground">View only</span>}
                    </TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? "Edit" : "Add"} Warehouse</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name *</Label><Input placeholder="e.g., Main Warehouse" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Address *</Label><Textarea placeholder="Enter full address of the warehouse" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Code</Label><Input placeholder="Auto-generated if blank" value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} /></div>
            {!editingId && (
              <div className="space-y-1.5"><Label>Type *</Label><Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v as WarehouseType }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="MAIN">Main</SelectItem><SelectItem value="BRANCH">Branch</SelectItem><SelectItem value="KITCHEN">Kitchen</SelectItem></SelectContent></Select></div>
            )}
            <div className="space-y-1.5"><Label>Outlet</Label><Select value={form.outletId || "__none__"} onValueChange={v => setForm(p => ({ ...p, outletId: v === "__none__" ? "" : v }))}><SelectTrigger><SelectValue placeholder="Select outlet (optional)" /></SelectTrigger><SelectContent><SelectItem value="__none__">None</SelectItem>{outlets.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent></Select></div>
            {editingId && (
              <div className="flex items-center justify-between"><Label>Active</Label><Switch checked={form.isActive} onCheckedChange={c => setForm(p => ({ ...p, isActive: c }))} /></div>
            )}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button><Button className="gradient-primary text-primary-foreground" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}


const SettingsPage = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const pathSlug = location.pathname.split("/settings/")[1] || "";
  const initialTab = slugTabMap[pathSlug] || "general";
  const { user } = useAuth();

  const [tab, setTab] = useState(initialTab);

  useEffect(() => {
    if (user?.role === "Super Admin") {
      if (location.pathname === '/settings' || location.pathname === '/settings/' || location.pathname.startsWith('/settings/website')) {
        navigate('/settings/warehouses', { replace: true });
      }
    }
  }, [user?.role, location.pathname, navigate]);

  useEffect(() => {
    const slug = location.pathname.split("/settings/")[1] || "";
    const mapped = slugTabMap[slug] || "general";
    setTab(mapped);
  }, [location.pathname]);

  const handleTabChange = (newTab: string) => {
    setTab(newTab);
    const slug = tabSlugMap[newTab] || "";
    navigate(`/settings${slug ? "/" + slug : ""}`, { replace: true });
  };

  return (
    <div className="space-y-6">
      <PageHeader icon={<SettingsIcon className="h-5 w-5" />} title="Settings" subtitle="System configuration" />
      <Tabs value={tab} onValueChange={handleTabChange}>
        <div className="overflow-x-auto -mx-1 px-1">
          <TabsList className="inline-flex w-auto min-w-full sm:w-full">
            {user?.role !== "Super Admin" && <TabsTrigger value="general">General</TabsTrigger>}
            <TabsTrigger value="warehouses">Warehouses</TabsTrigger>
            {user?.role !== "Super Admin" && <TabsTrigger value="website">Website</TabsTrigger>}
          </TabsList>
        </div>

        {/* General Tab */}
        {user?.role !== "Super Admin" && (
          <TabsContent value="general"><GeneralSettingsTab /></TabsContent>
        )}

        {/* Warehouses Tab */}
        <TabsContent value="warehouses"><WarehousesTab /></TabsContent>
        {user?.role !== "Super Admin" && <TabsContent value="website"><WebsiteSettingsTab /></TabsContent>}
      </Tabs>
    </div>
  );
};
export default SettingsPage;

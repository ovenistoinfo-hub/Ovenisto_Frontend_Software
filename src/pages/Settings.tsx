import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useData } from "@/contexts/DataContext";
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
import { settingsService, type SettingsRecord } from "@/services/settings.service";
import { warehouseService, type WarehouseRecord, type WarehouseType } from "@/services/warehouse.service";
import { outletService } from "@/services/outlet.service";

const tabSlugMap: Record<string, string> = {
  general: "",
  "self-order": "self-order",
  warehouses: "warehouses",
};
const slugTabMap: Record<string, string> = {
  "": "general",
  "self-order": "self-order",
  warehouses: "warehouses",
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
  const { updateSettings } = useData();

  const [tab, setTab] = useState(initialTab);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [saving, setSaving] = useState(false);

  const [general, setGeneral] = useState({
    businessName: "", phone: "", email: "", currency: "Rs.",
    taxName: "GST", taxRate: "16", address: "", receiptHeader: "",
    tableManagement: true, onlineOrders: true, graceMinutes: 15,
    paymentMethods: [] as string[],
  });

  useEffect(() => {
    settingsService.getSettings()
      .then((data: SettingsRecord) => {
        setGeneral({
          businessName: data.restaurantName || "",
          phone: data.phone || "",
          email: data.email || "",
          currency: data.currency || "Rs.",
          taxName: data.taxName || "GST",
          taxRate: String(data.taxRate ?? 16),
          address: data.address || "",
          receiptHeader: data.receiptHeader || "",
          tableManagement: data.tableManagement,
          onlineOrders: data.onlineOrders,
          graceMinutes: data.graceMinutes ?? 15,
          paymentMethods: data.paymentMethods ?? ["Cash", "Credit Card", "Account", "JazzCash", "EasyPaisa"],
        });
        updateSettings({
          restaurantName: data.restaurantName || "",
          phone: data.phone || "",
          email: data.email || "",
          currency: data.currency || "Rs.",
          taxName: data.taxName || "GST",
          taxRate: Number(data.taxRate ?? 16),
          address: data.address || "",
          receiptHeader: data.receiptHeader || "",
          tableManagement: data.tableManagement,
          onlineOrders: data.onlineOrders,
          paymentMethods: data.paymentMethods,
        });
      })
      .catch(() => toast.error("Failed to load settings"))
      .finally(() => setLoadingSettings(false));
  }, [updateSettings]);

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

  const validateAndSave = async () => {
    const rate = Number(general.taxRate);
    if (rate < 0 || rate > 100) { toast.error("Tax rate must be between 0-100"); return; }
    if (general.email && !general.email.includes("@")) { toast.error("Invalid email format"); return; }
    const grace = Number(general.graceMinutes);
    if (isNaN(grace) || grace < 10 || grace > 30) { toast.error("Grace period must be between 10 to 30 minutes"); return; }
    setSaving(true);
    try {
      const res = await settingsService.updateSettings({
        restaurantName: general.businessName,
        phone: general.phone || null,
        email: general.email || null,
        currency: general.currency,
        taxName: general.taxName,
        taxRate: Number(general.taxRate),
        address: general.address || null,
        receiptHeader: general.receiptHeader || null,
        tableManagement: general.tableManagement,
        onlineOrders: general.onlineOrders,
        graceMinutes: grace,
        paymentMethods: general.paymentMethods,
      });
      updateSettings({
        restaurantName: res.restaurantName || "",
        phone: res.phone || "",
        email: res.email || "",
        currency: res.currency || "Rs.",
        taxName: res.taxName || "GST",
        taxRate: Number(res.taxRate ?? 16),
        address: res.address || "",
        receiptHeader: res.receiptHeader || "",
        tableManagement: res.tableManagement,
        onlineOrders: res.onlineOrders,
        paymentMethods: res.paymentMethods,
      });
      toast.success("Settings saved successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loadingSettings) return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 w-full" />
      <Card className="shadow-sm"><CardContent className="pt-6 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </CardContent></Card>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader icon={<SettingsIcon className="h-5 w-5" />} title="Settings" subtitle="System configuration" />
      <Tabs value={tab} onValueChange={handleTabChange}>
        <div className="overflow-x-auto -mx-1 px-1"><TabsList className="inline-flex w-auto min-w-full sm:w-full"><TabsTrigger value="general">General</TabsTrigger><TabsTrigger value="warehouses">Warehouses</TabsTrigger></TabsList></div>

        {/* General Tab */}
        <TabsContent value="general"><Card className="shadow-sm"><CardHeader><CardTitle>General Settings</CardTitle></CardHeader><CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="text-sm font-medium">Business Name</label><Input value={general.businessName} onChange={e => setGeneral(p => ({...p, businessName: e.target.value}))} /></div>
            <div><label className="text-sm font-medium">Phone</label><Input value={general.phone} onChange={e => setGeneral(p => ({...p, phone: e.target.value}))} /></div>
            <div><label className="text-sm font-medium">Email</label><Input value={general.email} onChange={e => setGeneral(p => ({...p, email: e.target.value}))} /></div>
            <div><label className="text-sm font-medium">Currency</label><Input value={general.currency} onChange={e => setGeneral(p => ({...p, currency: e.target.value}))} /></div>
            <div><label className="text-sm font-medium">Tax Name</label><Input value={general.taxName} onChange={e => setGeneral(p => ({...p, taxName: e.target.value}))} /></div>
            <div><label className="text-sm font-medium">Tax Rate (%)</label><Input value={general.taxRate} type="number" onChange={e => setGeneral(p => ({...p, taxRate: e.target.value}))} /></div>
            <div>
              <label className="text-sm font-medium">Grace Minutes (Attendance)</label>
              <Select value={String(general.graceMinutes)} onValueChange={v => setGeneral(p => ({ ...p, graceMinutes: Number(v) }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select grace minutes" />
                </SelectTrigger>
                <SelectContent>
                  {[10, 15, 20, 25, 30].map(m => (
                    <SelectItem key={m} value={String(m)}>{m} minutes</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><label className="text-sm font-medium">Address</label><Textarea value={general.address} onChange={e => setGeneral(p => ({...p, address: e.target.value}))} /></div>
          <div><label className="text-sm font-medium">Receipt Header</label><Textarea value={general.receiptHeader} onChange={e => setGeneral(p => ({...p, receiptHeader: e.target.value}))} /></div>
          
          {/* Registered Payment Methods */}
          <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4 space-y-2">
            <label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              Registered Payment Methods
            </label>
            <p className="text-[11px] text-muted-foreground select-none">
              Add, remove, or customize the payment accounts/methods shown during checkout.
            </p>
            
            <div className="flex flex-wrap gap-2 py-2">
              {general.paymentMethods?.map((pm, idx) => (
                <Badge 
                  key={idx} 
                  variant="secondary" 
                  className="h-8 pl-3 pr-2 text-xs font-semibold rounded-full bg-zinc-100 hover:bg-zinc-150 border border-zinc-200 dark:bg-zinc-900/60 dark:border-zinc-800/80 flex items-center gap-1.5 select-none"
                >
                  <span>{pm}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setGeneral(p => ({
                        ...p,
                        paymentMethods: p.paymentMethods.filter((_, i) => i !== idx)
                      }));
                    }}
                    className="text-muted-foreground hover:text-destructive hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full p-0.5 transition-colors"
                    title={`Remove ${pm}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              
              {(!general.paymentMethods || general.paymentMethods.length === 0) && (
                <p className="text-xs text-muted-foreground italic py-1">No payment methods configured. Add at least one.</p>
              )}
            </div>
            
            <div className="flex items-center gap-2 max-w-sm pt-1">
              <Input
                id="new-payment-method-input"
                placeholder="e.g., Bank Transfer, HBL"
                className="rounded-xl border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/40 text-xs h-9"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const val = (e.target as HTMLInputElement).value.trim();
                    if (val) {
                      if (general.paymentMethods.includes(val)) {
                        toast.warning("Payment method already exists");
                        return;
                      }
                      setGeneral(p => ({
                        ...p,
                        paymentMethods: [...p.paymentMethods, val]
                      }));
                      (e.target as HTMLInputElement).value = '';
                    }
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl h-9 px-3 shrink-0 flex items-center gap-1 border-zinc-200 dark:border-zinc-800 text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
                onClick={() => {
                  const el = document.getElementById("new-payment-method-input") as HTMLInputElement;
                  const val = el?.value?.trim();
                  if (val) {
                    if (general.paymentMethods.includes(val)) {
                      toast.warning("Payment method already exists");
                      return;
                    }
                    setGeneral(p => ({
                      ...p,
                      paymentMethods: [...p.paymentMethods, val]
                    }));
                    el.value = '';
                  } else {
                    toast.error("Please enter a payment method name");
                  }
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>
          </div>

          <div className="space-y-3 border-t border-zinc-200 dark:border-zinc-800 pt-4">
            <div className="flex items-center justify-between"><span className="text-sm">Enable Table Management</span><Switch checked={general.tableManagement} onCheckedChange={c => setGeneral(p => ({...p, tableManagement: c}))} /></div>
            <div className="flex items-center justify-between"><span className="text-sm">Enable Online Orders</span><Switch checked={general.onlineOrders} onCheckedChange={c => setGeneral(p => ({...p, onlineOrders: c}))} /></div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button className="gradient-primary text-primary-foreground" onClick={validateAndSave} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button>
            <Button variant="outline" onClick={() => { setGeneral({ businessName: "Ovenisto", phone: "03201119898", email: "admin@ovenisto.com", currency: "Rs.", taxName: "GST", taxRate: "16", address: "164-J LDA AVENUE-1 Lahore", receiptHeader: "Thank you for dining at Ovenisto!", tableManagement: true, onlineOrders: true, graceMinutes: 15 }); toast.success("Reset to defaults"); }}>Reset to Defaults</Button>
          </div>
        </CardContent></Card></TabsContent>


        {/* Warehouses Tab */}
        <TabsContent value="warehouses"><WarehousesTab /></TabsContent>
      </Tabs>
    </div>
  );
};
export default SettingsPage;

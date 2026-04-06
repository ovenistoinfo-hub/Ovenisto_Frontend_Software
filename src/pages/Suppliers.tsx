import { useState, useEffect, useCallback } from "react";
import { supplierService, type SupplierRecord } from "@/services/supplier.service";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Search, Pencil, Trash2, Truck, Eye, User, Phone, ChevronUp, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { TablePagination, paginate } from "@/components/TablePagination";
import { useAuth } from "@/contexts/AuthContext";
import { useData } from "@/contexts/DataContext";

const Suppliers = () => {
  const { user } = useAuth();
  const { settings } = useData();
  const currency = settings.currency || "Rs.";
  const canManage = ['Super Admin', 'Admin', 'Manager', 'Store Manager'].includes(user?.role ?? '');
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", company: "", phone: "", email: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [showDetail, setShowDetail] = useState<SupplierRecord | null>(null);

  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await supplierService.getAll();
      setSuppliers(res.data);
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to load suppliers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

  const filtered = suppliers.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));
  const paged = paginate(filtered, page);

  const openAdd = () => { setEditingId(null); setForm({ name: "", company: "", phone: "", email: "" }); setShowDialog(true); };
  const openEdit = (s: SupplierRecord) => { setEditingId(s.id); setForm({ name: s.name, company: s.company || "", phone: s.phone || "", email: s.email || "" }); setShowDialog(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      if (editingId) {
        await supplierService.update(editingId, form);
        toast.success("Updated successfully");
      } else {
        await supplierService.create(form);
        toast.success("Supplier added");
      }
      setForm({ name: "", company: "", phone: "", email: "" });
      setShowDialog(false);
      setEditingId(null);
      await fetchSuppliers();
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to save supplier");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await supplierService.delete(id);
      toast.success("Deleted");
      await fetchSuppliers();
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to delete supplier");
    }
  };

  if (loading) return <div className="space-y-6"><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div><Skeleton className="h-10 w-full rounded-lg" />{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg mt-2" />)}</div>;

  return (
    <div className="space-y-6">
      <PageHeader icon={<Truck className="h-5 w-5" />} title="Suppliers" subtitle="Manage your suppliers" actions={canManage ? <Button className="gradient-primary text-primary-foreground" onClick={() => { if (showDialog) { setShowDialog(false); setEditingId(null); setForm({ name: "", company: "", phone: "", email: "" }); } else { openAdd(); } }}>{showDialog ? <><X className="h-4 w-4 mr-2" />Close Form</> : <><Plus className="h-4 w-4 mr-2" />Add Supplier</>}</Button> : undefined} />
      {/* Inline form panel — togglable, replaces dialog */}
      {showDialog && canManage && (
        <Card className="shadow-sm border-primary/30 bg-primary/[0.02]">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">{editingId ? "Edit" : "Add"} Supplier</Label>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setShowDialog(false); setEditingId(null); setForm({ name: "", company: "", phone: "", email: "" }); }}><ChevronUp className="h-4 w-4" /></Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1.5"><Label htmlFor="sup-name">Name <span className="text-destructive">*</span></Label><Input id="sup-name" placeholder="Enter name" value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label htmlFor="sup-company">Company</Label><Input id="sup-company" placeholder="Enter company" value={form.company} onChange={(e) => setForm(p => ({ ...p, company: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label htmlFor="sup-phone">Phone</Label><Input id="sup-phone" placeholder="Enter phone" value={form.phone} onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label htmlFor="sup-email">Email</Label><Input id="sup-email" placeholder="Enter email" value={form.email} onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))} /></div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => { setShowDialog(false); setEditingId(null); setForm({ name: "", company: "", phone: "", email: "" }); }}>Cancel</Button>
              <Button className="gradient-primary text-primary-foreground" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-sm"><CardHeader className="pb-3"><div className="relative max-w-sm"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search..." className="pl-9" /></div></CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-12"><Truck className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" /><p className="text-muted-foreground">No suppliers found</p><p className="text-xs text-muted-foreground mt-1.5 max-w-sm mx-auto">Add your first supplier to get started.</p><Button size="sm" className="gradient-primary text-primary-foreground mt-3" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Supplier</Button></div>
          ) : (
            <>
              <div className="rounded-lg border overflow-auto max-h-[calc(100vh-300px)]">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>SN</TableHead><TableHead>Name</TableHead><TableHead>Company</TableHead><TableHead>Phone</TableHead><TableHead>Total Purchases</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                  <TableBody>{paged.map((s, i) => (<TableRow key={s.id} className="hover:bg-muted/30 transition-colors"><TableCell>{(page-1)*10+i+1}</TableCell><TableCell className="font-medium">{s.name}</TableCell><TableCell>{s.company}</TableCell><TableCell>{s.phone}</TableCell><TableCell>{currency} {(s.totalPurchases ?? 0).toLocaleString()}</TableCell><TableCell><div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowDetail(s)}><Eye className="h-3 w-3" /></Button>
                    {canManage && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}><Pencil className="h-3 w-3" /></Button>}
                    {canManage && <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {s.name}?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(s.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
                  </div></TableCell></TableRow>))}</TableBody>
                </Table>
              </div>
              <TablePagination currentPage={page} totalItems={filtered.length} onPageChange={setPage} />
            </>
          )}
        </CardContent></Card>

      {/* Detail Dialog */}
      <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Truck className="h-5 w-5" />
              <span>Supplier Details</span>
            </DialogTitle>
          </DialogHeader>
          {showDetail && (
            <div className="space-y-4">
              <Card className="shadow-sm">
                <CardContent className="pt-5 space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-lg font-semibold">{showDetail.name}</span>
                  </div>
                  {showDetail.company && <div className="text-sm text-muted-foreground">Company: <span className="text-foreground font-medium">{showDetail.company}</span></div>}
                  {showDetail.phone && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="h-3 w-3" />{showDetail.phone}
                    </div>
                  )}
                  {showDetail.email && <div className="text-sm text-muted-foreground">Email: <span className="text-foreground">{showDetail.email}</span></div>}
                </CardContent>
              </Card>
              <div className="flex justify-between items-center px-1">
                <span className="text-sm text-muted-foreground">Total Purchases</span>
                <span className="text-lg font-bold">{currency} {(showDetail.totalPurchases ?? 0).toLocaleString()}</span>
              </div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setShowDetail(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
export default Suppliers;

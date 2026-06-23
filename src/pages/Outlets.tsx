import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Store, Plus, Phone, Mail, MapPin, Building2, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { outletService, type OutletRecord } from "@/services/outlet.service";
import { PageHeader } from "@/components/ui/page-header";

const Outlets = () => {
  const [list, setList] = useState<OutletRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", code: "", address: "", city: "", phone: "", email: "" });

  const fetchOutlets = useCallback(async () => {
    try {
      const data = await outletService.getOutlets();
      setList(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load outlets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOutlets(); }, [fetchOutlets]);

  const openAdd = () => {
    setEditingId(null);
    // Auto-generate code suggestion
    const nextCode = `OV-${String(list.length + 1).padStart(3, "0")}`;
    setForm({ name: "", code: nextCode, address: "", city: "", phone: "", email: "" });
    setShowDialog(true);
  };

  const openEdit = (o: OutletRecord) => {
    setEditingId(o.id);
    setForm({ name: o.name, code: o.code, address: o.address || "", city: o.city || "", phone: o.phone || "", email: o.email || "" });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Outlet name is required"); return; }
    if (!form.code.trim()) { toast.error("Outlet code is required"); return; }
    setSaving(true);
    try {
      if (editingId) {
        await outletService.updateOutlet(editingId, {
          name: form.name,
          code: form.code,
          address: form.address || undefined,
          city: form.city || undefined,
          phone: form.phone || undefined,
          email: form.email || undefined,
        });
        toast.success("Outlet updated");
      } else {
        await outletService.createOutlet({
          name: form.name,
          code: form.code.toUpperCase(),
          address: form.address || undefined,
          city: form.city || undefined,
          phone: form.phone || undefined,
          email: form.email || undefined,
        });
        toast.success("Outlet added");
      }
      setShowDialog(false);
      setEditingId(null);
      await fetchOutlets();
    } catch (err: any) {
      toast.error(err.message || "Failed to save outlet");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Building2 className="h-5 w-5" />}
        title="Outlets"
        subtitle={`${list.length} branch${list.length !== 1 ? "es" : ""} configured`}
        actions={<Button className="gradient-primary text-primary-foreground" onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Outlet</Button>}
      />
      {showDialog && (
        <Card className="shadow-sm border-primary/30">
          <CardHeader className="pb-3"><CardTitle className="text-base">{editingId ? "Edit" : "Add"} Outlet</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label>Outlet Name</Label>
                <Input placeholder="e.g. DHA Branch" value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Outlet Code</Label>
                <Input placeholder="e.g. DHA-01" value={form.code} onChange={(e) => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))} />
              </div>
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input placeholder="Lahore" value={form.city} onChange={(e) => setForm(p => ({ ...p, city: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Textarea placeholder="Full address" value={form.address} onChange={(e) => setForm(p => ({ ...p, address: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input placeholder="0300-0000000" value={form.phone} onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input placeholder="branch@ovenisto.com" value={form.email} onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button className="gradient-primary text-primary-foreground" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.length === 0 ? (
          <div className="col-span-3 text-center py-16">
            <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" />
            <p className="text-muted-foreground">No outlets found</p>
            <Button size="sm" className="gradient-primary text-primary-foreground mt-3" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Outlet</Button>
          </div>
        ) : list.map((o) => (
          <Card key={o.id} className="shadow-sm hover:shadow-md transition-shadow border-border">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-lg gradient-primary flex items-center justify-center shrink-0">
                    <Store className="h-6 w-6 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold leading-tight">{o.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{o.code}</p>
                  </div>
                </div>
                <Badge variant="secondary" className={o.isActive ? "bg-success/10 text-success text-xs" : "bg-destructive/10 text-destructive text-xs"}>
                  {o.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
              <div className="space-y-1.5 text-sm text-muted-foreground mb-4">
                {(o.address || o.city) && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{[o.address, o.city].filter(Boolean).join(", ")}</span>
                  </div>
                )}
                {o.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-3 w-3 shrink-0" />{o.phone}
                  </div>
                )}
                {o.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-3 w-3 shrink-0" />
                    <span className="truncate">{o.email}</span>
                  </div>
                )}
                {o._count !== undefined && (
                  <div className="flex items-center gap-2">
                    <Users className="h-3 w-3 shrink-0" />{o._count.users} staff assigned
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 text-xs" onClick={() => openEdit(o)}>Edit</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

    </div>
  );
};
export default Outlets;

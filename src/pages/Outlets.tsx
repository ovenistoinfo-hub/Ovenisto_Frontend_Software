import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Store, Plus, Phone, Mail, MapPin, Building2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useData } from "@/contexts/DataContext";
import { PageHeader } from "@/components/ui/page-header";

const Outlets = () => {
  const { outlets: list, addItem, updateItem, settings, updateSettings } = useData();
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", code: "", address: "", city: "", phone: "", email: "" });
  const [loading, setLoading] = useState(true);
  useEffect(() => { const t = setTimeout(() => setLoading(false), 500); return () => clearTimeout(t); }, []);
  const activeOutlet = (settings as any).activeOutlet || list[0]?.name || "";

  const openAdd = () => { setEditingId(null); setForm({ name: "", code: "", address: "", city: "", phone: "", email: "" }); setShowDialog(true); };
  const openEdit = (o: typeof list[0]) => { setEditingId(o.id); setForm({ name: o.name, code: o.code, address: o.address, city: o.city, phone: o.phone, email: o.email }); setShowDialog(true); };
  const handleSave = () => { if (!form.name.trim()) return; if (editingId) { updateItem("outlets", editingId, form); toast.success("Updated"); } else { addItem("outlets", { id: crypto.randomUUID(), ...form, code: `OV-${String(list.length + 1).padStart(3, "0")}`, isActive: true }); toast.success("Outlet added"); } setForm({ name: "", code: "", address: "", city: "", phone: "", email: "" }); setShowDialog(false); setEditingId(null); };
  const handleEnter = (o: typeof list[0]) => { updateSettings({ ...(settings as any), activeOutlet: o.name } as any); toast.success(`Switched to ${o.name}`); };

  if (loading) return <div className="space-y-6"><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{[1,2,3].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}</div></div>;

  return (
    <div className="space-y-6">
      <PageHeader icon={<Building2 className="h-5 w-5" />} title="Outlets" subtitle={`Manage your restaurant branches${activeOutlet ? ` — Active: ${activeOutlet}` : ""}`} actions={<Button className="gradient-primary text-primary-foreground" onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Outlet</Button>} />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map((o) => (
          <Card key={o.id} className={`shadow-sm hover:shadow-md transition-shadow ${activeOutlet === o.name ? "border-primary border-2" : ""}`}><CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4"><div className="h-12 w-12 rounded-lg gradient-primary flex items-center justify-center"><Store className="h-6 w-6 text-primary-foreground" /></div><div><h3 className="font-semibold">{o.name}</h3><p className="text-xs text-muted-foreground">{o.code}{activeOutlet === o.name ? " — Active" : ""}</p></div></div>
            <div className="space-y-2 text-sm text-muted-foreground mb-4"><div className="flex items-center gap-2"><MapPin className="h-3 w-3" />{o.address}</div><div className="flex items-center gap-2"><Phone className="h-3 w-3" />{o.phone}</div><div className="flex items-center gap-2"><Mail className="h-3 w-3" />{o.email}</div></div>
            <div className="flex gap-2"><Button className="flex-1 gradient-primary text-primary-foreground text-xs" onClick={() => handleEnter(o)}>Enter</Button><Button variant="outline" className="flex-1 text-xs" onClick={() => openEdit(o)}>Edit</Button></div>
          </CardContent></Card>
        ))}
      </div>
      <Dialog open={showDialog} onOpenChange={setShowDialog}><DialogContent><DialogHeader><DialogTitle>{editingId ? "Edit" : "Add"} Outlet</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Outlet Name</Label><Input placeholder="Enter outlet name" value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label>Address</Label><Textarea placeholder="Enter address" value={form.address} onChange={(e) => setForm(p => ({ ...p, address: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label>City</Label><Input placeholder="Enter city" value={form.city} onChange={(e) => setForm(p => ({ ...p, city: e.target.value }))} /></div><div className="space-y-1.5"><Label>Phone</Label><Input placeholder="Enter phone" value={form.phone} onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))} /></div></div>
          <div className="space-y-1.5"><Label>Email</Label><Input placeholder="Enter email" value={form.email} onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button><Button className="gradient-primary text-primary-foreground" onClick={handleSave}>Save</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
};
export default Outlets;

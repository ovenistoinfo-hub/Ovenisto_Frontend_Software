import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Search, Pencil, Trash2, SlidersHorizontal } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useData } from "@/contexts/DataContext";
import { PageHeader } from "@/components/ui/page-header";

const Modifiers = () => {
  const { modifiers: list, addItem, updateItem, removeItem } = useData();
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", price: 0, type: "addon" as "addon" | "removal" });
  const [loading, setLoading] = useState(true);
  useEffect(() => { const t = setTimeout(() => setLoading(false), 500); return () => clearTimeout(t); }, []);

  const filtered = list.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()));
  const openAdd = () => { setEditingId(null); setForm({ name: "", price: 0, type: "addon" }); setShowDialog(true); };
  const openEdit = (item: typeof list[0]) => { setEditingId(item.id); setForm({ name: item.name, price: item.price, type: item.type }); setShowDialog(true); };
  const handleSave = () => { if (!form.name.trim()) return; if (editingId) { updateItem("modifiers", editingId, form); toast.success("Updated"); } else { addItem("modifiers", { id: crypto.randomUUID(), ...form, status: "active" }); toast.success("Modifier added"); } setForm({ name: "", price: 0, type: "addon" }); setShowDialog(false); setEditingId(null); };

  if (loading) return <div className="space-y-6"><Skeleton className="h-10 w-full rounded-lg" />{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg mt-2" />)}</div>;

  return (
    <div className="space-y-6">
      <PageHeader icon={<SlidersHorizontal className="h-5 w-5" />} title="Modifiers" subtitle="Add-ons and options" actions={<Button className="gradient-primary text-primary-foreground" onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Modifier</Button>} />
      <Card className="shadow-sm"><CardHeader className="pb-3"><div className="relative max-w-sm"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="pl-9" /></div></CardHeader>
        <CardContent>{filtered.length === 0 ? (<div className="text-center py-12"><SlidersHorizontal className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" /><p className="text-muted-foreground">No modifiers found</p><p className="text-xs text-muted-foreground mt-1.5">Add your first modifier to get started.</p><Button size="sm" className="gradient-primary text-primary-foreground mt-3" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Modifier</Button></div>) : (
          <div className="rounded-lg border overflow-auto max-h-[calc(100vh-300px)]"><Table><TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>SN</TableHead><TableHead>Name</TableHead><TableHead>Price</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
            <TableBody>{filtered.map((m, i) => (<TableRow key={m.id} className="hover:bg-muted/30 transition-colors"><TableCell>{i+1}</TableCell><TableCell className="font-medium">{m.name}</TableCell><TableCell>{m.price > 0 ? `Rs. ${m.price}` : "Free"}</TableCell><TableCell><Badge variant="secondary" className={m.type === "addon" ? "bg-info/10 text-info" : "bg-muted text-muted-foreground"}>{m.type}</Badge></TableCell><TableCell><Badge variant="secondary" className="bg-success/10 text-success">{m.status}</Badge></TableCell><TableCell><div className="flex gap-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(m)}><Pencil className="h-3 w-3" /></Button>
              <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {m.name}?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { removeItem("modifiers", m.id); toast.success("Deleted"); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
            </div></TableCell></TableRow>))}</TableBody></Table></div>
        )}</CardContent></Card>
      <Dialog open={showDialog} onOpenChange={setShowDialog}><DialogContent><DialogHeader><DialogTitle>{editingId ? "Edit" : "Add"} Modifier</DialogTitle></DialogHeader>
        <div className="space-y-3"><div className="space-y-1.5"><Label>Modifier Name</Label><Input placeholder="Enter name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div><div className="space-y-1.5"><Label>Price</Label><Input placeholder="0" type="number" value={form.price || ""} onChange={(e) => setForm((p) => ({ ...p, price: Number(e.target.value) }))} /></div><div className="space-y-1.5"><Label>Type</Label><div className="flex gap-2"><Button variant={form.type === "addon" ? "default" : "outline"} size="sm" onClick={() => setForm((p) => ({ ...p, type: "addon" }))}>Addon</Button><Button variant={form.type === "removal" ? "default" : "outline"} size="sm" onClick={() => setForm((p) => ({ ...p, type: "removal" }))}>Removal</Button></div></div></div>
        <DialogFooter><Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button><Button className="gradient-primary text-primary-foreground" onClick={handleSave}>Save</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
};
export default Modifiers;

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ArrowLeftRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useData } from "@/contexts/DataContext";
import { PageHeader } from "@/components/ui/page-header";

interface TransferItem { ingredientId: string; name: string; qty: number; unit: string; value: number; }

const Transfers = () => {
  const { transfers: list, outlets, ingredients: ingredientsList, addItem } = useData();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ from: "", to: "", notes: "" });
  const [items, setItems] = useState<TransferItem[]>([{ ingredientId: "", name: "", qty: 0, unit: "", value: 0 }]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { const t = setTimeout(() => setLoading(false), 500); return () => clearTimeout(t); }, []);

  const addItemRow = () => setItems(p => [...p, { ingredientId: "", name: "", qty: 0, unit: "", value: 0 }]);
  const removeItemRow = (idx: number) => setItems(p => p.filter((_, i) => i !== idx));
  const updateItemField = (idx: number, field: string, value: string | number) => {
    setItems(p => p.map((item, i) => {
      if (i !== idx) return item;
      if (field === "ingredientId") { const ing = ingredientsList.find(ig => ig.id === value); return { ...item, ingredientId: value as string, name: ing?.name || "", unit: ing?.unit || "", value: 0 }; }
      if (field === "qty") { const ing = ingredientsList.find(ig => ig.id === item.ingredientId); return { ...item, qty: value as number, value: (value as number) * (ing?.purchasePrice || 0) }; }
      return { ...item, [field]: value };
    }));
  };
  const totalValue = items.reduce((s, it) => s + it.value, 0);

  const handleSave = () => {
    if (!form.from || !form.to) { toast.error("Select outlets"); return; }
    addItem("transfers", { id: crypto.randomUUID(), date: new Date().toISOString().split("T")[0], from: form.from, to: form.to, itemCount: items.filter(i => i.name).length, totalValue, status: "pending" as const, transferredBy: "Admin User" });
    setShowAdd(false); toast.success("Transfer created");
  };

  if (loading) return <div className="space-y-6"><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div><Skeleton className="h-10 w-full rounded-lg" />{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg mt-2" />)}</div>;

  return (
    <div className="space-y-6">
      <PageHeader icon={<ArrowLeftRight className="h-5 w-5" />} title="Transfers" subtitle="Inter-outlet transfers" actions={<Button className="gradient-primary text-primary-foreground" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-2" />New Transfer</Button>} />
      <Card className="shadow-sm"><CardContent className="pt-6">
        {list.length === 0 ? (<div className="text-center py-12"><ArrowLeftRight className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" /><p className="text-muted-foreground">No transfers found</p><p className="text-xs text-muted-foreground mt-1.5">Create your first transfer to get started.</p></div>) : (
          <div className="rounded-lg border overflow-auto max-h-[calc(100vh-300px)]"><Table><TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>SN</TableHead><TableHead>Date</TableHead><TableHead>From</TableHead><TableHead>To</TableHead><TableHead>Items</TableHead><TableHead>Value</TableHead><TableHead>Status</TableHead><TableHead>By</TableHead></TableRow></TableHeader>
            <TableBody>{list.map((t, i) => (<TableRow key={t.id} className="hover:bg-muted/30 transition-colors"><TableCell>{i+1}</TableCell><TableCell>{t.date}</TableCell><TableCell>{t.from}</TableCell><TableCell>{t.to}</TableCell><TableCell>{t.itemCount}</TableCell><TableCell>Rs. {t.totalValue.toLocaleString()}</TableCell><TableCell><Badge variant="secondary" className={t.status === "completed" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}>{t.status}</Badge></TableCell><TableCell>{t.transferredBy}</TableCell></TableRow>))}</TableBody></Table></div>
        )}
      </CardContent></Card>
      <Dialog open={showAdd} onOpenChange={setShowAdd}><DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>New Transfer</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>From Outlet</Label><Select value={form.from} onValueChange={v => setForm(p => ({...p, from: v}))}><SelectTrigger><SelectValue placeholder="From Outlet" /></SelectTrigger><SelectContent>{outlets.map(o => <SelectItem key={o.id} value={o.name}>{o.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>To Outlet</Label><Select value={form.to} onValueChange={v => setForm(p => ({...p, to: v}))}><SelectTrigger><SelectValue placeholder="To Outlet" /></SelectTrigger><SelectContent>{outlets.map(o => <SelectItem key={o.id} value={o.name}>{o.name}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div><Label className="mb-2 block">Items</Label>
            {items.map((item, idx) => (<div key={idx} className="grid grid-cols-12 gap-2 items-center mb-2"><div className="col-span-5"><Select value={item.ingredientId} onValueChange={v => updateItemField(idx, "ingredientId", v)}><SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Ingredient" /></SelectTrigger><SelectContent>{ingredientsList.map(ig => <SelectItem key={ig.id} value={ig.id}>{ig.name}</SelectItem>)}</SelectContent></Select></div><div className="col-span-2"><Input className="h-9 text-xs" type="number" placeholder="Qty" value={item.qty || ""} onChange={e => updateItemField(idx, "qty", Number(e.target.value))} /></div><div className="col-span-1 text-xs text-muted-foreground text-center">{item.unit}</div><div className="col-span-3 text-xs font-medium text-right">Rs. {item.value.toLocaleString()}</div><div className="col-span-1"><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeItemRow(idx)}><Trash2 className="h-3 w-3" /></Button></div></div>))}
            <Button variant="outline" size="sm" onClick={addItemRow}><Plus className="h-3 w-3 mr-1" />Add Item</Button>
            <div className="text-right mt-2 font-semibold">Total Value: Rs. {totalValue.toLocaleString()}</div>
          </div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea placeholder="Notes..." value={form.notes} onChange={e => setForm(p => ({...p, notes: e.target.value}))} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button><Button className="gradient-primary text-primary-foreground" onClick={handleSave}>Create Transfer</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
};
export default Transfers;

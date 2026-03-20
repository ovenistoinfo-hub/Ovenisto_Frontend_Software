import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Search, Factory } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { stockService, type ProductionRecord } from "@/services/stock.service";
import { menuService, type MenuItemRecord } from "@/services/menu.service";

const Production = () => {
  const [list, setList] = useState<ProductionRecord[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItemRecord[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ menuItemId: "", itemName: "", quantity: 0, unit: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [prodRes, itemsRes] = await Promise.all([
        stockService.getProductions({ limit: 200 }),
        menuService.getMenuItems(),
      ]);
      setList(prodRes.data);
      setMenuItems(itemsRes);
    } catch (err: any) {
      toast.error(err.message || "Failed to load productions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = list.filter((p) => (p.itemName || "").toLowerCase().includes(search.toLowerCase()));

  const handleProduce = () => {
    if (!form.itemName.trim() || form.quantity <= 0) { toast.error("Select a food item and enter quantity"); return; }
    setShowConfirm(true);
  };

  const doSave = async () => {
    setSaving(true);
    try {
      await stockService.createProduction({
        itemName: form.itemName,
        quantity: form.quantity,
        unit: form.unit || undefined,
        notes: form.notes || undefined,
        menuItemId: form.menuItemId || undefined,
        deductIngredients: !!form.menuItemId,
      });
      toast.success("Production recorded — ingredients deducted from stock");
      setForm({ menuItemId: "", itemName: "", quantity: 0, unit: "", notes: "" });
      setShowAdd(false);
      setShowConfirm(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to save production");
      setShowConfirm(false);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="space-y-6"><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div><Skeleton className="h-10 w-full rounded-lg" />{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg mt-2" />)}</div>;

  return (
    <div className="space-y-6">
      <PageHeader icon={<Factory className="h-5 w-5" />} title="Production" subtitle="Production batches" actions={<Button className="gradient-primary text-primary-foreground" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-2" />New Production</Button>} />
      <Card className="shadow-sm"><CardHeader className="pb-3"><div className="relative max-w-sm"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="pl-9" /></div></CardHeader>
        <CardContent>{filtered.length === 0 ? (<div className="text-center py-12"><Factory className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" /><p className="text-muted-foreground">No production records found</p><p className="text-xs text-muted-foreground mt-1.5">Start your first production batch.</p></div>) : (
          <div className="rounded-lg border overflow-auto max-h-[calc(100vh-300px)]"><Table><TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>SN</TableHead><TableHead>Date</TableHead><TableHead>Item</TableHead><TableHead>Qty</TableHead><TableHead>Unit</TableHead><TableHead>By</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader>
            <TableBody>{filtered.map((p, i) => (<TableRow key={p.id} className="hover:bg-muted/30 transition-colors"><TableCell>{i+1}</TableCell><TableCell>{p.date.slice(0, 10)}</TableCell><TableCell className="font-medium">{p.itemName}</TableCell><TableCell>{p.quantity}</TableCell><TableCell>{p.unit || "—"}</TableCell><TableCell>{p.producedBy || "—"}</TableCell><TableCell className="text-muted-foreground">{p.notes || "—"}</TableCell></TableRow>))}</TableBody></Table></div>
        )}</CardContent></Card>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>New Production</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Food Item</Label><Select value={form.menuItemId} onValueChange={(v) => {
              const item = menuItems.find(m => m.id === v);
              setForm(p => ({ ...p, menuItemId: v, itemName: item?.name || "" }));
            }}><SelectTrigger><SelectValue placeholder="Select food item" /></SelectTrigger><SelectContent>{menuItems.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Quantity</Label><Input placeholder="Quantity to produce" type="number" value={form.quantity || ""} onChange={(e) => setForm((p) => ({ ...p, quantity: Number(e.target.value) }))} /></div>
            <div className="space-y-1.5"><Label>Unit (Optional)</Label><Input placeholder="e.g. kg, pieces" value={form.unit} onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))} /></div>
            {form.menuItemId && <p className="text-xs text-muted-foreground">Recipe ingredients will be deducted from stock automatically.</p>}
            <div className="space-y-1.5"><Label>Notes</Label><Textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button><Button className="gradient-primary text-primary-foreground" onClick={handleProduce}>Produce</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirm Production</AlertDialogTitle><AlertDialogDescription>This will record the production{form.menuItemId ? " and deduct required ingredients from stock" : ""}. Continue?</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={doSave} className="gradient-primary text-primary-foreground" disabled={saving}>{saving ? "Saving..." : "Yes, Produce"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
export default Production;

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, ArrowUpDown } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { TablePagination, paginate } from "@/components/TablePagination";
import { PageHeader } from "@/components/ui/page-header";
import { stockService, type StockAdjustmentRecord } from "@/services/stock.service";
import { inventoryService, type IngredientRecord } from "@/services/inventory.service";

const TYPE_LABELS: Record<string, { label: string; cls: string }> = {
  add: { label: "Addition", cls: "bg-success/10 text-success" },
  deduct: { label: "Reduction", cls: "bg-destructive/10 text-destructive" },
  damage: { label: "Damage", cls: "bg-warning/10 text-warning" },
  correction: { label: "Correction", cls: "bg-info/10 text-info" },
};

const StockAdjustments = () => {
  const [list, setList] = useState<StockAdjustmentRecord[]>([]);
  const [ingredients, setIngredients] = useState<IngredientRecord[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ ingredientId: "", type: "add" as string, quantity: 0, reason: "" });
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [adjRes, ings] = await Promise.all([
        stockService.getAdjustments({ limit: 200 }),
        inventoryService.getIngredients(),
      ]);
      setList(adjRes.data);
      setIngredients(ings);
    } catch (err: any) {
      toast.error(err.message || "Failed to load adjustments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = list.filter((a) => (a.ingredient?.name || "").toLowerCase().includes(search.toLowerCase()));
  const paged = paginate(filtered, page);
  const selectedIng = ingredients.find(i => i.id === form.ingredientId);

  const handleSave = async () => {
    if (!form.ingredientId || form.quantity <= 0) { toast.error("Select ingredient and enter quantity"); return; }
    setSaving(true);
    try {
      await stockService.createAdjustment({ ingredientId: form.ingredientId, type: form.type, quantity: form.quantity, reason: form.reason || undefined });
      toast.success("Stock adjustment recorded");
      setForm({ ingredientId: "", type: "add", quantity: 0, reason: "" });
      setShowAdd(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to save adjustment");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="space-y-6"><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div><Skeleton className="h-10 w-full rounded-lg" />{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg mt-2" />)}</div>;

  return (
    <div className="space-y-6">
      <PageHeader icon={<ArrowUpDown className="h-5 w-5" />} title="Stock Adjustments" subtitle="Record stock changes" actions={<Button className="gradient-primary text-primary-foreground" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-2" />Add Adjustment</Button>} />
      <Card className="shadow-sm">
        <CardHeader className="pb-3"><div className="relative max-w-sm"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search..." className="pl-9" /></div></CardHeader>
        <CardContent>
          {filtered.length === 0 ? (<div className="text-center py-12"><ArrowUpDown className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" /><p className="text-muted-foreground">No adjustments found</p><p className="text-xs text-muted-foreground mt-1.5">Record your first stock adjustment.</p></div>) : (
            <>
              <div className="rounded-lg border overflow-auto max-h-[calc(100vh-300px)]"><Table><TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>SN</TableHead><TableHead>Date</TableHead><TableHead>Ingredient</TableHead><TableHead>Type</TableHead><TableHead>Qty</TableHead><TableHead>Reason</TableHead><TableHead>By</TableHead></TableRow></TableHeader>
                <TableBody>{paged.map((a, i) => {
                  const t = TYPE_LABELS[a.type] || { label: a.type, cls: "" };
                  return (
                    <TableRow key={a.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell>{(page - 1) * 10 + i + 1}</TableCell>
                      <TableCell>{a.date.slice(0, 10)}</TableCell>
                      <TableCell className="font-medium">{a.ingredient?.name || "—"}</TableCell>
                      <TableCell><Badge variant="secondary" className={t.cls}>{t.label}</Badge></TableCell>
                      <TableCell>{a.quantity} {a.ingredient?.unit?.name || ""}</TableCell>
                      <TableCell>{a.reason || "—"}</TableCell>
                      <TableCell>{a.adjustedBy?.name || "—"}</TableCell>
                    </TableRow>
                  );
                })}</TableBody></Table></div>
              <TablePagination currentPage={page} totalItems={filtered.length} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent><DialogHeader><DialogTitle>Add Adjustment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Ingredient</Label><Select value={form.ingredientId} onValueChange={(v) => setForm(p => ({ ...p, ingredientId: v }))}><SelectTrigger><SelectValue placeholder="Select Ingredient" /></SelectTrigger><SelectContent>{ingredients.map(ig => <SelectItem key={ig.id} value={ig.id}>{ig.name} (Stock: {Number(ig.currentStock)} {ig.unit?.name || ""})</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Type</Label><div className="flex gap-2 flex-wrap">
              {["add", "deduct", "damage", "correction"].map(t => (
                <Button key={t} variant={form.type === t ? "default" : "outline"} size="sm" onClick={() => setForm(p => ({ ...p, type: t }))} className={form.type === t ? (t === "add" ? "bg-success text-success-foreground" : t === "deduct" ? "bg-destructive text-destructive-foreground" : "") : ""}>{TYPE_LABELS[t]?.label || t}</Button>
              ))}
            </div></div>
            <div className="space-y-1.5"><Label>Quantity{selectedIng ? ` (${selectedIng.unit?.name || ""})` : ""}</Label><Input type="number" value={form.quantity || ""} onChange={(e) => setForm(p => ({ ...p, quantity: Number(e.target.value) }))} /></div>
            <div className="space-y-1.5"><Label>Reason</Label><Textarea placeholder="Enter reason" value={form.reason} onChange={(e) => setForm(p => ({ ...p, reason: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button><Button className="gradient-primary text-primary-foreground" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StockAdjustments;

import { useState, useEffect, useCallback } from "react";
import { ClipboardList, Plus, Eye } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { toast } from "sonner";
import { stockService, type StockTakeRecord } from "@/services/stock.service";

const StockTakePage = () => {
  const [stockTakes, setStockTakes] = useState<StockTakeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");
  const [showNew, setShowNew] = useState(false);
  const [dialogStep, setDialogStep] = useState<"notes" | "counting">("notes");
  const [notes, setNotes] = useState("");
  const [activeTake, setActiveTake] = useState<StockTakeRecord | null>(null);
  const [countedValues, setCountedValues] = useState<Record<string, number | null>>({});
  const [saving, setSaving] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);

  const fetchStockTakes = useCallback(async () => {
    try {
      const data = await stockService.getStockTakes();
      setStockTakes(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load stock takes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStockTakes(); }, [fetchStockTakes]);

  const filtered = stockTakes.filter(s => {
    if (filter === "Active") return s.status === "active";
    if (filter === "Completed") return s.status === "completed";
    return true;
  });

  const viewItem = viewId ? stockTakes.find(s => s.id === viewId) : null;

  const openNewDialog = () => {
    setDialogStep("notes");
    setNotes("");
    setActiveTake(null);
    setCountedValues({});
    setShowNew(true);
  };

  const beginCount = async () => {
    setSaving(true);
    try {
      const take = await stockService.startStockTake(notes || undefined);
      setActiveTake(take);
      const init: Record<string, number | null> = {};
      take.items.forEach(item => { init[item.ingredientId] = null; });
      setCountedValues(init);
      setDialogStep("counting");
    } catch (err: any) {
      toast.error(err.message || "Failed to start stock take");
    } finally {
      setSaving(false);
    }
  };

  const getVariance = (ingredientId: string): number | null => {
    const item = activeTake?.items.find(i => i.ingredientId === ingredientId);
    const counted = countedValues[ingredientId];
    if (!item || counted === null) return null;
    return counted - Number(item.systemQty);
  };

  const submitCount = async () => {
    if (!activeTake) return;
    const uncounted = Object.values(countedValues).filter(v => v === null).length;
    if (uncounted > 0) { toast.error(`${uncounted} items not counted yet`); return; }

    setSaving(true);
    try {
      await stockService.completeStockTake(activeTake.id,
        activeTake.items.map(item => ({
          ingredientId: item.ingredientId,
          countedQty: countedValues[item.ingredientId] ?? 0,
        }))
      );
      toast.success("Stock take completed and stock adjusted");
      setShowNew(false);
      fetchStockTakes();
    } catch (err: any) {
      toast.error(err.message || "Failed to complete stock take");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="space-y-6"><Skeleton className="h-10 w-full rounded-lg" />{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg mt-2" />)}</div>;

  return (
    <div className="space-y-6">
      <PageHeader icon={<ClipboardList className="h-5 w-5" />} title="Stock Take" subtitle="Physical inventory count and variance"
        actions={<Button className="gradient-primary text-primary-foreground" onClick={openNewDialog}><Plus className="h-4 w-4 mr-2" />New Stock Take</Button>} />
      <div className="flex gap-1.5 flex-wrap">{["All", "Active", "Completed"].map(s => (
        <Button key={s} variant={filter === s ? "default" : "outline"} size="sm" onClick={() => setFilter(s)} className={filter === s ? "gradient-primary text-primary-foreground" : ""}>{s}</Button>
      ))}</div>
      <Card className="shadow-sm"><CardContent className="pt-4"><div className="overflow-x-auto">
        <Table><TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>Date</TableHead><TableHead>Reference</TableHead><TableHead>Items</TableHead><TableHead>Variance Value</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
          <TableBody>{filtered.map(s => (
            <TableRow key={s.id} className="hover:bg-muted/30 transition-colors">
              <TableCell>{s.date.slice(0, 10)}</TableCell><TableCell className="font-medium">{s.reference}</TableCell><TableCell>{s.items.length}</TableCell>
              <TableCell className={s.totalVarianceValue < 0 ? "text-destructive font-medium" : s.totalVarianceValue > 0 ? "text-success font-medium" : ""}>Rs. {Number(s.totalVarianceValue).toLocaleString()}</TableCell>
              <TableCell><Badge variant="secondary" className={s.status === "completed" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}>{s.status}</Badge></TableCell>
              <TableCell><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewId(s.id)}><Eye className="h-3 w-3" /></Button></TableCell>
            </TableRow>
          ))}{filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No stock takes found</TableCell></TableRow>}</TableBody></Table>
      </div></CardContent></Card>

      {/* New Stock Take Dialog */}
      <Dialog open={showNew} onOpenChange={(open) => { if (!open) setShowNew(false); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Stock Take</DialogTitle></DialogHeader>

          {dialogStep === "notes" && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5"><Label>Notes (Optional)</Label><Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. End of day count" /></div>
              <p className="text-sm text-muted-foreground">This will capture current system quantities for all active ingredients.</p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
                <Button className="gradient-primary text-primary-foreground" onClick={beginCount} disabled={saving}>{saving ? "Starting..." : "Start Count"}</Button>
              </DialogFooter>
            </div>
          )}

          {dialogStep === "counting" && activeTake && (
            <>
              <div className="overflow-x-auto">
                <Table><TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>Ingredient</TableHead><TableHead>Unit</TableHead><TableHead>System Qty</TableHead><TableHead>Counted Qty</TableHead><TableHead>Variance</TableHead></TableRow></TableHeader>
                  <TableBody>{activeTake.items.map((item) => {
                    const variance = getVariance(item.ingredientId);
                    return (
                      <TableRow key={item.ingredientId} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="font-medium">{item.ingredient.name}</TableCell>
                        <TableCell>{item.ingredient.unit?.name || "—"}</TableCell>
                        <TableCell>{Number(item.systemQty)}</TableCell>
                        <TableCell><Input type="number" className="w-24 h-8" value={countedValues[item.ingredientId] ?? ""} onChange={e => setCountedValues(prev => ({ ...prev, [item.ingredientId]: e.target.value === "" ? null : Number(e.target.value) }))} /></TableCell>
                        <TableCell className={variance === null ? "" : variance < 0 ? "text-destructive font-medium" : variance > 0 ? "text-success font-medium" : ""}>{variance === null ? "—" : `${variance > 0 ? "+" : ""}${variance}`}</TableCell>
                      </TableRow>
                    );
                  })}</TableBody></Table>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
                <Button className="gradient-primary text-primary-foreground" onClick={submitCount} disabled={saving}>{saving ? "Submitting..." : "Submit Count"}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={!!viewItem} onOpenChange={() => setViewId(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Stock Take: {viewItem?.reference}</DialogTitle></DialogHeader>
          {viewItem && <div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-muted/50"><TableHead>Ingredient</TableHead><TableHead>Unit</TableHead><TableHead>System</TableHead><TableHead>Counted</TableHead><TableHead>Variance</TableHead></TableRow></TableHeader>
            <TableBody>{viewItem.items.map(item => (
              <TableRow key={item.ingredientId}>
                <TableCell className="font-medium">{item.ingredient.name}</TableCell>
                <TableCell>{item.ingredient.unit?.name || "—"}</TableCell>
                <TableCell>{Number(item.systemQty)}</TableCell>
                <TableCell>{item.countedQty !== null ? Number(item.countedQty) : "—"}</TableCell>
                <TableCell className={Number(item.variance) < 0 ? "text-destructive" : Number(item.variance) > 0 ? "text-success" : ""}>{item.variance !== null ? `${Number(item.variance) > 0 ? "+" : ""}${Number(item.variance)}` : "—"}</TableCell>
              </TableRow>
            ))}</TableBody></Table></div>}
          <DialogFooter><Button variant="outline" onClick={() => setViewId(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
export default StockTakePage;

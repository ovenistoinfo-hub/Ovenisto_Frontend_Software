import { useState } from "react";
import { ClipboardList, Plus, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import { useData } from "@/contexts/DataContext";
import { toast } from "sonner";
import type { StockTake, StockTakeItem } from "@/contexts/DataContext";

const StockTakePage = () => {
  const { stockTakes, ingredients, addItem, updateItem, adjustStock } = useData();
  const [filter, setFilter] = useState("All");
  const [showNew, setShowNew] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const [countItems, setCountItems] = useState<StockTakeItem[]>([]);
  const [notes, setNotes] = useState("");

  const filtered = stockTakes.filter(s => {
    if (filter === "Active") return s.status === "active";
    if (filter === "Completed") return s.status === "completed";
    return true;
  });

  const viewItem = viewId ? stockTakes.find(s => s.id === viewId) : null;

  const startNew = () => {
    const items: StockTakeItem[] = ingredients.map(ig => ({
      ingredientId: ig.id, ingredientName: ig.name, unit: ig.unit,
      systemQty: ig.currentStock, countedQty: null, variance: 0, varianceValue: 0,
    }));
    setCountItems(items);
    setNotes("");
    setShowNew(true);
  };

  const updateCounted = (idx: number, val: number | null) => {
    setCountItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const counted = val;
      const variance = counted !== null ? counted - item.systemQty : 0;
      const ing = ingredients.find(ig => ig.id === item.ingredientId);
      const varianceValue = variance * (ing?.purchasePrice || 0);
      return { ...item, countedQty: counted, variance, varianceValue };
    }));
  };

  const totalVariance = countItems.reduce((s, i) => s + i.varianceValue, 0);

  const submitCount = () => {
    const uncounted = countItems.filter(i => i.countedQty === null);
    if (uncounted.length > 0) { toast.error(`${uncounted.length} items not counted yet`); return; }

    const ref = `ST-${String(stockTakes.length + 1).padStart(3, "0")}`;
    const stockTake: StockTake = {
      id: crypto.randomUUID(), reference: ref,
      date: new Date().toISOString().split("T")[0],
      status: "completed", countedBy: "Admin",
      items: countItems, totalVarianceValue: totalVariance,
      notes, completedAt: new Date().toISOString(),
    };
    addItem("stockTakes", stockTake);

    // Adjust stock for non-zero variances
    countItems.forEach(item => {
      if (item.variance !== 0 && item.countedQty !== null) {
        if (item.variance > 0) adjustStock(item.ingredientId, item.variance, "add");
        else adjustStock(item.ingredientId, Math.abs(item.variance), "deduct");
      }
    });

    toast.success("Stock take completed and stock adjusted");
    setShowNew(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader icon={<ClipboardList className="h-5 w-5" />} title="Stock Take" subtitle="Physical inventory count and variance"
        actions={<Button className="gradient-primary text-primary-foreground" onClick={startNew}><Plus className="h-4 w-4 mr-2" />New Stock Take</Button>} />
      <div className="flex gap-1.5 flex-wrap">{["All", "Active", "Completed"].map(s => (
        <Button key={s} variant={filter === s ? "default" : "outline"} size="sm" onClick={() => setFilter(s)} className={filter === s ? "gradient-primary text-primary-foreground" : ""}>{s}</Button>
      ))}</div>
      <Card className="shadow-sm"><CardContent className="pt-4"><div className="overflow-x-auto">
        <Table><TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>Date</TableHead><TableHead>Reference</TableHead><TableHead>Items</TableHead><TableHead>Variance</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
          <TableBody>{filtered.map(s => (
            <TableRow key={s.id} className="hover:bg-muted/30 transition-colors">
              <TableCell>{s.date}</TableCell><TableCell className="font-medium">{s.reference}</TableCell><TableCell>{s.items.length}</TableCell>
              <TableCell className={s.totalVarianceValue < 0 ? "text-destructive font-medium" : s.totalVarianceValue > 0 ? "text-success font-medium" : ""}>Rs. {s.totalVarianceValue.toLocaleString()}</TableCell>
              <TableCell><Badge variant="secondary" className={s.status === "completed" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}>{s.status}</Badge></TableCell>
              <TableCell><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewId(s.id)}><Eye className="h-3 w-3" /></Button></TableCell>
            </TableRow>
          ))}{filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No stock takes found</TableCell></TableRow>}</TableBody></Table>
      </div></CardContent></Card>

      {/* New Stock Take Dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}><DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New Stock Take</DialogTitle></DialogHeader>
        <div className="overflow-x-auto">
          <Table><TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>Ingredient</TableHead><TableHead>Unit</TableHead><TableHead>System</TableHead><TableHead>Counted</TableHead><TableHead>Variance</TableHead></TableRow></TableHeader>
            <TableBody>{countItems.map((item, i) => (
              <TableRow key={item.ingredientId} className="hover:bg-muted/30 transition-colors">
                <TableCell className="font-medium">{item.ingredientName}</TableCell><TableCell>{item.unit}</TableCell>
                <TableCell>{item.systemQty}</TableCell>
                <TableCell><Input type="number" className="w-24 h-8" value={item.countedQty ?? ""} onChange={e => updateCounted(i, e.target.value === "" ? null : Number(e.target.value))} /></TableCell>
                <TableCell className={item.variance < 0 ? "text-destructive font-medium" : item.variance > 0 ? "text-success font-medium" : ""}>{item.countedQty !== null ? `${item.variance > 0 ? "+" : ""}${item.variance}` : "—"}</TableCell>
              </TableRow>
            ))}</TableBody></Table>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t"><div className="flex-1"><Label>Notes</Label><Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" className="mt-1" /></div><div className="text-right"><p className="text-sm text-muted-foreground">Total Variance</p><p className={`text-lg font-bold ${totalVariance < 0 ? "text-destructive" : totalVariance > 0 ? "text-success" : ""}`}>Rs. {totalVariance.toLocaleString()}</p></div></div>
        <DialogFooter><Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button><Button className="gradient-primary text-primary-foreground" onClick={submitCount}>Submit Count</Button></DialogFooter>
      </DialogContent></Dialog>

      {/* View Dialog */}
      <Dialog open={!!viewItem} onOpenChange={() => setViewId(null)}><DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Stock Take: {viewItem?.reference}</DialogTitle></DialogHeader>
        {viewItem && <div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-muted/50"><TableHead>Ingredient</TableHead><TableHead>Unit</TableHead><TableHead>System</TableHead><TableHead>Counted</TableHead><TableHead>Variance</TableHead></TableRow></TableHeader>
          <TableBody>{viewItem.items.map(item => (<TableRow key={item.ingredientId}><TableCell className="font-medium">{item.ingredientName}</TableCell><TableCell>{item.unit}</TableCell><TableCell>{item.systemQty}</TableCell><TableCell>{item.countedQty}</TableCell><TableCell className={item.variance < 0 ? "text-destructive" : item.variance > 0 ? "text-success" : ""}>{item.variance > 0 ? "+" : ""}{item.variance}</TableCell></TableRow>))}</TableBody></Table></div>}
        <DialogFooter><Button variant="outline" onClick={() => setViewId(null)}>Close</Button></DialogFooter>
      </DialogContent></Dialog>
    </div>
  );
};
export default StockTakePage;

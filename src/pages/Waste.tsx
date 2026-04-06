import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Trash2, TrendingDown, CalendarDays, BarChart3, Eye, User } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { TablePagination, paginate } from "@/components/TablePagination";
import { PageHeader } from "@/components/ui/page-header";
import { stockService, type WasteRecord } from "@/services/stock.service";
import { inventoryService, type IngredientRecord } from "@/services/inventory.service";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";

const WASTE_REASONS = ["Expired", "Spoiled", "Overcooked", "Accidental", "Damaged", "Other"] as const;

const Waste = () => {
  const { settings } = useData();
  const { user } = useAuth();
  const currency = settings.currency || "Rs.";
  const canRecord = ['Super Admin', 'Admin', 'Manager', 'Kitchen Manager', 'Store Manager'].includes(user?.role ?? '');
  const [list, setList] = useState<WasteRecord[]>([]);
  const [ingredients, setIngredients] = useState<IngredientRecord[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showDetail, setShowDetail] = useState<WasteRecord | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    ingredientId: "",
    itemName: "",
    quantity: 0,
    unit: "",
    reason: "",
    cost: 0,
    notes: "",
  });
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reportView, setReportView] = useState<"daily" | "weekly" | "monthly">("daily");

  const fetchData = useCallback(async () => {
    try {
      const [wasteRes, ings] = await Promise.all([
        stockService.getWasteRecords({ limit: 200 }),
        inventoryService.getIngredients(),
      ]);
      setList(wasteRes.data);
      setIngredients(ings);
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to load waste records");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalLoss = list.reduce((s, w) => s + Number(w.cost || 0), 0);
  const filtered = list.filter((w) => (w.itemName || "").toLowerCase().includes(search.toLowerCase()));
  const paged = paginate(filtered, page);

  const selectedIng = ingredients.find(i => i.id === form.ingredientId);
  const estimatedCost = selectedIng ? form.quantity * Number(selectedIng.purchasePrice || 0) : form.cost;

  // Date-based stats
  const todayStr = new Date().toISOString().slice(0, 10);
  const today = new Date();
  const todayLoss = list.filter(w => w.date.slice(0, 10) === todayStr).reduce((s, w) => s + Number(w.cost || 0), 0);

  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const weekStartStr = startOfWeek.toISOString().slice(0, 10);
  const weeklyLoss = list.filter(w => w.date.slice(0, 10) >= weekStartStr).reduce((s, w) => s + Number(w.cost || 0), 0);

  const monthStr = todayStr.slice(0, 7);
  const monthlyLoss = list.filter(w => w.date.startsWith(monthStr)).reduce((s, w) => s + Number(w.cost || 0), 0);

  // Reason-wise breakdown
  const reportList = reportView === "daily"
    ? list.filter(w => w.date.slice(0, 10) === todayStr)
    : reportView === "weekly"
      ? list.filter(w => w.date.slice(0, 10) >= weekStartStr)
      : list.filter(w => w.date.startsWith(monthStr));

  const reasonMap = new Map<string, { count: number; loss: number }>();
  reportList.forEach(w => {
    const r = w.reason || "Unknown";
    const existing = reasonMap.get(r) || { count: 0, loss: 0 };
    existing.count += 1;
    existing.loss += Number(w.cost || 0);
    reasonMap.set(r, existing);
  });
  const reasonBreakdown = Array.from(reasonMap.entries()).sort((a, b) => b[1].loss - a[1].loss);

  const resetForm = () => setForm({ ingredientId: "", itemName: "", quantity: 0, unit: "", reason: "", cost: 0, notes: "" });

  const handleSave = async () => {
    const name = form.ingredientId ? (selectedIng?.name || "") : form.itemName.trim();
    if (!name) { toast.error("Select ingredient or enter item name"); return; }
    if (form.quantity <= 0) { toast.error("Enter quantity"); return; }
    if (!form.reason) { toast.error("Select a waste reason"); return; }

    setSaving(true);
    try {
      await stockService.createWasteRecord({
        itemName: name,
        quantity: form.quantity,
        unit: form.ingredientId ? (selectedIng?.unit?.name || form.unit) : form.unit,
        reason: form.reason,
        cost: form.ingredientId ? estimatedCost : (form.cost || undefined),
        ingredientId: form.ingredientId || undefined,
      });
      toast.success(form.ingredientId ? "Waste recorded — stock deducted" : "Waste recorded");
      resetForm();
      setShowAdd(false);
      fetchData();
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to save waste record");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="space-y-6"><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div><Skeleton className="h-10 w-full rounded-lg" />{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg mt-2" />)}</div>;

  return (
    <div className="space-y-6">
      <PageHeader icon={<Trash2 className="h-5 w-5" />} title="Waste / Damage" subtitle="Track wasted items & losses" actions={canRecord ? <Button className="gradient-primary text-primary-foreground" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-2" />Record Waste</Button> : undefined} />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm border-destructive/20"><CardContent className="p-5"><div className="flex items-center gap-4"><div className="h-11 w-11 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0"><Trash2 className="h-5 w-5 text-destructive" /></div><div className="min-w-0"><p className="text-xs text-muted-foreground">Total Waste Loss</p><p className="text-2xl font-bold tracking-tight text-destructive">{currency} {totalLoss.toLocaleString()}</p></div></div></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-5"><div className="flex items-center gap-4"><div className="h-11 w-11 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0"><CalendarDays className="h-5 w-5 text-orange-500" /></div><div className="min-w-0"><p className="text-xs text-muted-foreground">Today's Loss</p><p className="text-2xl font-bold tracking-tight text-orange-500">{currency} {todayLoss.toLocaleString()}</p></div></div></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-5"><div className="flex items-center gap-4"><div className="h-11 w-11 rounded-xl bg-warning/10 flex items-center justify-center shrink-0"><TrendingDown className="h-5 w-5 text-warning" /></div><div className="min-w-0"><p className="text-xs text-muted-foreground">This Week</p><p className="text-2xl font-bold tracking-tight text-warning">{currency} {weeklyLoss.toLocaleString()}</p></div></div></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-5"><div className="flex items-center gap-4"><div className="h-11 w-11 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0"><BarChart3 className="h-5 w-5 text-purple-500" /></div><div className="min-w-0"><p className="text-xs text-muted-foreground">This Month</p><p className="text-2xl font-bold tracking-tight text-purple-500">{currency} {monthlyLoss.toLocaleString()}</p></div></div></CardContent></Card>
      </div>

      {/* Breakdown Report */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-base">Waste Breakdown by Reason</CardTitle>
            <div className="flex gap-2">{(["daily", "weekly", "monthly"] as const).map(v => (
              <Button key={v} size="sm" variant={reportView === v ? "default" : "outline"} onClick={() => setReportView(v)} className="capitalize">{v}</Button>
            ))}</div>
          </div>
        </CardHeader>
        <CardContent>
          {reasonBreakdown.length === 0 ? (
            <p className="text-center text-muted-foreground py-6 text-sm">No waste records for this period</p>
          ) : (
            <div className="space-y-2">
              {reasonBreakdown.map(([reason, data]) => (
                <div key={reason} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                  <div className="flex items-center gap-2"><span className="font-medium">{reason}</span><Badge variant="secondary" className="text-[10px]">{data.count}</Badge></div>
                  <span className="text-destructive font-semibold">{currency} {data.loss.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Records Table */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3"><div className="relative max-w-sm"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search..." className="pl-9" /></div></CardHeader>
        <CardContent>
          {filtered.length === 0 ? (<div className="text-center py-12"><Trash2 className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" /><p className="text-muted-foreground">No waste records found</p><p className="text-xs text-muted-foreground mt-1.5">Record waste to track losses.</p></div>) : (
            <>
              <div className="rounded-lg border overflow-auto max-h-[calc(100vh-400px)]"><Table><TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>SN</TableHead><TableHead>Date</TableHead><TableHead>Item</TableHead><TableHead>Qty</TableHead><TableHead>Unit</TableHead><TableHead>Reason</TableHead><TableHead>Cost</TableHead><TableHead>Recorded By</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                <TableBody>{paged.map((w, i) => (
                  <TableRow key={w.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell>{(page-1)*10+i+1}</TableCell>
                    <TableCell>{w.date.slice(0, 10)}</TableCell>
                    <TableCell className="font-medium">{w.itemName}</TableCell>
                    <TableCell>{w.quantity ?? "—"}</TableCell>
                    <TableCell>{w.unit || "—"}</TableCell>
                    <TableCell>{w.reason || "—"}</TableCell>
                    <TableCell className="text-destructive font-medium">{w.cost != null ? `${currency} ${Number(w.cost).toLocaleString()}` : "—"}</TableCell>
                    <TableCell>{w.recordedBy || "—"}</TableCell>
                    <TableCell><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowDetail(w)}><Eye className="h-3 w-3" /></Button></TableCell>
                  </TableRow>
                ))}</TableBody></Table></div>
              <TablePagination currentPage={page} totalItems={filtered.length} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>

      {/* Record Waste Dialog */}
      <Dialog open={showAdd} onOpenChange={(open) => { if (!open) resetForm(); setShowAdd(open); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Record Waste</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Ingredient (Optional — select to auto-deduct stock)</Label>
              <Select value={form.ingredientId} onValueChange={(v) => setForm(p => ({ ...p, ingredientId: v === "__none__" ? "" : v, itemName: "" }))}>
                <SelectTrigger><SelectValue placeholder="Select ingredient (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None (custom item) —</SelectItem>
                  {ingredients.map(ig => <SelectItem key={ig.id} value={ig.id}>{ig.name} (Stock: {Number(ig.currentStock)} {ig.unit?.name || ""})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {!form.ingredientId && (
              <div className="space-y-1.5"><Label>Item Name</Label><Input placeholder="e.g. Chicken Tikka Pizza" value={form.itemName} onChange={(e) => setForm(p => ({ ...p, itemName: e.target.value }))} /></div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Quantity{selectedIng ? ` (${selectedIng.unit?.name || ""})` : ""}</Label><Input type="number" value={form.quantity || ""} onChange={(e) => setForm(p => ({ ...p, quantity: Number(e.target.value) }))} /></div>
              {!form.ingredientId && <div className="space-y-1.5"><Label>Unit</Label><Input placeholder="kg, piece..." value={form.unit} onChange={(e) => setForm(p => ({ ...p, unit: e.target.value }))} /></div>}
            </div>

            {selectedIng && form.quantity > 0 && (
              <p className="text-sm text-muted-foreground">Estimated Loss: <strong className="text-destructive">{currency} {estimatedCost.toLocaleString()}</strong></p>
            )}

            {!form.ingredientId && (
              <div className="space-y-1.5"><Label>Cost / Loss ({currency})</Label><Input type="number" placeholder="Enter loss value" value={form.cost || ""} onChange={(e) => setForm(p => ({ ...p, cost: Number(e.target.value) }))} /></div>
            )}

            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Select value={form.reason} onValueChange={(v) => setForm(p => ({ ...p, reason: v }))}>
                <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                <SelectContent>{WASTE_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5"><Label>Notes</Label><Textarea placeholder="Additional notes" value={form.notes} onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => { resetForm(); setShowAdd(false); }}>Cancel</Button><Button className="gradient-primary text-primary-foreground" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Detail Dialog */}
      <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Trash2 className="h-5 w-5 text-destructive" />
              <span>Waste Record</span>
              {showDetail && <Badge variant="secondary" className="bg-destructive/10 text-destructive">{showDetail.reason || "Unknown"}</Badge>}
            </DialogTitle>
          </DialogHeader>
          {showDetail && (
            <div className="space-y-4">
              <Card className="shadow-sm">
                <CardHeader className="pb-2"><Label className="text-xs text-muted-foreground uppercase tracking-wider">Recorded By</Label></CardHeader>
                <CardContent className="space-y-1">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{showDetail.recordedBy || "—"}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Date: {new Date(showDetail.date).toLocaleString()}</div>
                </CardContent>
              </Card>

              <div className="rounded-lg border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead>Item</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Cost / Loss</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">{showDetail.itemName || "—"}</TableCell>
                      <TableCell className="text-sm">{showDetail.unit || "—"}</TableCell>
                      <TableCell><Badge variant="secondary" className="bg-destructive/10 text-destructive">{showDetail.reason || "—"}</Badge></TableCell>
                      <TableCell className="text-right text-lg font-bold text-destructive">-{showDetail.quantity ?? 0}</TableCell>
                      <TableCell className="text-right font-semibold text-destructive">{showDetail.cost != null ? `${currency} ${Number(showDetail.cost).toLocaleString()}` : "—"}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setShowDetail(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
export default Waste;

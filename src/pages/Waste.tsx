import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Trash2, Camera, TrendingDown, CalendarDays, BarChart3 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useData } from "@/contexts/DataContext";
import { TablePagination, paginate } from "@/components/TablePagination";
import { PageHeader } from "@/components/ui/page-header";

const WASTE_REASONS = ["Expired", "Spoiled", "Overcooked", "Accidental", "Damaged", "Other"] as const;

const Waste = () => {
  const { wasteRecords: list, ingredients, users, addItem, adjustStock, settings } = useData();
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    wasteType: "raw" as "raw" | "finished",
    ingredientId: "",
    finishedItemName: "",
    qty: 0,
    unit: "",
    reason: "",
    notes: "",
    responsiblePerson: "",
    disposedBy: "",
    manualLoss: 0,
    photo: "",
  });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [reportView, setReportView] = useState<"daily" | "weekly" | "monthly">("daily");
  useEffect(() => { const t = setTimeout(() => setLoading(false), 500); return () => clearTimeout(t); }, []);
  const currency = settings.currency || "Rs.";
  const totalLoss = list.reduce((s, w) => s + w.estimatedLoss, 0);
  const filtered = list.filter((w) => w.item.toLowerCase().includes(search.toLowerCase()));
  const paged = paginate(filtered, page);
  const selectedIng = form.wasteType === "raw" ? ingredients.find(i => i.id === form.ingredientId) : null;
  const estimatedLoss = form.wasteType === "raw"
    ? (selectedIng ? form.qty * selectedIng.purchasePrice : 0)
    : form.manualLoss;

  // D5 — Waste Reporting Stats
  const todayStr = new Date().toISOString().split("T")[0];
  const today = new Date();

  const todayLoss = list.filter(w => w.date === todayStr).reduce((s, w) => s + w.estimatedLoss, 0);

  const startOfWeek = new Date(today);
  const weekdayIndex = (today.getDay() + 6) % 7;
  startOfWeek.setDate(today.getDate() - weekdayIndex);
  const weekStartStr = startOfWeek.toISOString().split("T")[0];
  const weeklyLoss = list.filter(w => w.date >= weekStartStr && w.date <= todayStr).reduce((s, w) => s + w.estimatedLoss, 0);

  const monthStr = todayStr.slice(0, 7);
  const monthlyLoss = list.filter(w => w.date.startsWith(monthStr)).reduce((s, w) => s + w.estimatedLoss, 0);

  // Category-wise breakdown
  const categoryMap = new Map<string, { count: number; loss: number }>();
  const reportList = reportView === "daily"
    ? list.filter(w => w.date === todayStr)
    : reportView === "weekly"
      ? list.filter(w => w.date >= weekStartStr && w.date <= todayStr)
      : list.filter(w => w.date.startsWith(monthStr));
  reportList.forEach(w => {
    const cat = w.category || "Uncategorized";
    const existing = categoryMap.get(cat) || { count: 0, loss: 0 };
    existing.count += 1;
    existing.loss += w.estimatedLoss;
    categoryMap.set(cat, existing);
  });
  const categoryBreakdown = Array.from(categoryMap.entries())
    .sort((a, b) => b[1].loss - a[1].loss);

  // Reason-wise breakdown
  const reasonMap = new Map<string, { count: number; loss: number }>();
  reportList.forEach(w => {
    const r = w.reason || "Unknown";
    const existing = reasonMap.get(r) || { count: 0, loss: 0 };
    existing.count += 1;
    existing.loss += w.estimatedLoss;
    reasonMap.set(r, existing);
  });
  const reasonBreakdown = Array.from(reasonMap.entries())
    .sort((a, b) => b[1].loss - a[1].loss);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm(p => ({ ...p, photo: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const resetForm = () => setForm({
    wasteType: "raw", ingredientId: "", finishedItemName: "", qty: 0, unit: "",
    reason: "", notes: "", responsiblePerson: "", disposedBy: "", manualLoss: 0, photo: "",
  });

  const handleSave = () => {
    if (form.wasteType === "raw") {
      if (!form.ingredientId || form.qty <= 0) { toast.error("Select ingredient and enter quantity"); return; }
    } else {
      if (!form.finishedItemName.trim() || form.manualLoss <= 0) { toast.error("Enter item name and loss amount"); return; }
    }
    if (!form.reason) { toast.error("Select a waste reason"); return; }

    const isRaw = form.wasteType === "raw";
    const ing = isRaw ? ingredients.find(i => i.id === form.ingredientId)! : null;

    addItem("wasteRecords", {
      id: crypto.randomUUID(),
      date: new Date().toISOString().split("T")[0],
      item: isRaw ? ing!.name : form.finishedItemName.trim(),
      category: isRaw ? ing!.category : "Finished Product",
      qty: isRaw ? form.qty : form.qty || 1,
      unit: isRaw ? ing!.unit : (form.unit || "piece"),
      reason: form.reason,
      estimatedLoss: isRaw ? estimatedLoss : form.manualLoss,
      recordedBy: "Admin User",
      notes: form.notes,
      wasteType: form.wasteType,
      responsiblePerson: form.responsiblePerson,
      disposedBy: form.disposedBy,
      photo: form.photo,
    });

    if (isRaw) adjustStock(form.ingredientId, form.qty, "deduct");

    resetForm();
    setShowAdd(false);
    toast.success(isRaw ? "Waste recorded — stock deducted" : "Finished product waste recorded");
  };

  if (loading) return <div className="space-y-6"><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div><Skeleton className="h-10 w-full rounded-lg" />{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg mt-2" />)}</div>;

  return (
    <div className="space-y-6">
      <PageHeader icon={<Trash2 className="h-5 w-5" />} title="Waste / Damage" subtitle="Track wasted items & losses" actions={<Button className="gradient-primary text-primary-foreground" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-2" />Record Waste</Button>} />

      {/* D5 — Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm border-destructive/20">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0"><Trash2 className="h-5 w-5 text-destructive" /></div>
              <div className="min-w-0"><p className="text-xs text-muted-foreground">Total Waste Loss</p><p className="text-2xl font-bold tracking-tight text-destructive">{currency} {totalLoss.toLocaleString()}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0"><CalendarDays className="h-5 w-5 text-orange-500" /></div>
              <div className="min-w-0"><p className="text-xs text-muted-foreground">Today's Loss</p><p className="text-2xl font-bold tracking-tight text-orange-500">{currency} {todayLoss.toLocaleString()}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-warning/10 flex items-center justify-center shrink-0"><TrendingDown className="h-5 w-5 text-warning" /></div>
              <div className="min-w-0"><p className="text-xs text-muted-foreground">This Week</p><p className="text-2xl font-bold tracking-tight text-warning">{currency} {weeklyLoss.toLocaleString()}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0"><BarChart3 className="h-5 w-5 text-purple-500" /></div>
              <div className="min-w-0"><p className="text-xs text-muted-foreground">This Month</p><p className="text-2xl font-bold tracking-tight text-purple-500">{currency} {monthlyLoss.toLocaleString()}</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* D5 — Waste Breakdown Report */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-base">Waste Breakdown</CardTitle>
            <div className="flex gap-2">
              {(["daily", "weekly", "monthly"] as const).map(v => (
                <Button key={v} size="sm" variant={reportView === v ? "default" : "outline"} onClick={() => setReportView(v)} className="capitalize">{v}</Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {reportList.length === 0 ? (
            <p className="text-center text-muted-foreground py-6 text-sm">No waste records for this period</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* By Category */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">By Category</p>
                <div className="space-y-2">
                  {categoryBreakdown.map(([cat, data]) => (
                    <div key={cat} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{cat}</span>
                        <Badge variant="secondary" className="text-[10px]">{data.count}</Badge>
                      </div>
                      <span className="text-destructive font-semibold">{currency} {data.loss.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* By Reason */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">By Reason</p>
                <div className="space-y-2">
                  {reasonBreakdown.map(([reason, data]) => (
                    <div key={reason} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{reason}</span>
                        <Badge variant="secondary" className="text-[10px]">{data.count}</Badge>
                      </div>
                      <span className="text-destructive font-semibold">{currency} {data.loss.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Waste Records Table */}
      <Card className="shadow-sm"><CardHeader className="pb-3"><div className="relative max-w-sm"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search..." className="pl-9" /></div></CardHeader>
        <CardContent>
          {filtered.length === 0 ? (<div className="text-center py-12"><Trash2 className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" /><p className="text-muted-foreground">No waste records found</p><p className="text-xs text-muted-foreground mt-1.5">Record waste to track losses.</p></div>) : (
            <>
              <div className="rounded-lg border overflow-auto max-h-[calc(100vh-400px)]"><Table><TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>SN</TableHead><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Item</TableHead><TableHead>Qty</TableHead><TableHead>Reason</TableHead><TableHead>Loss</TableHead><TableHead>Responsible</TableHead><TableHead>Disposed By</TableHead><TableHead>Recorded By</TableHead></TableRow></TableHeader>
                <TableBody>{paged.map((w, i) => (<TableRow key={w.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell>{(page-1)*10+i+1}</TableCell>
                  <TableCell>{w.date}</TableCell>
                  <TableCell><Badge variant="secondary" className={w.wasteType === "finished" ? "bg-purple-500/10 text-purple-600" : "bg-blue-500/10 text-blue-600"}>{w.wasteType === "finished" ? "Finished" : "Raw"}</Badge></TableCell>
                  <TableCell className="font-medium">{w.item}</TableCell>
                  <TableCell>{w.qty} {w.unit}</TableCell>
                  <TableCell>{w.reason}</TableCell>
                  <TableCell className="text-destructive font-medium">{currency} {w.estimatedLoss.toLocaleString()}</TableCell>
                  <TableCell>{w.responsiblePerson || "—"}</TableCell>
                  <TableCell>{w.disposedBy || "—"}</TableCell>
                  <TableCell>{w.recordedBy}</TableCell>
                </TableRow>))}</TableBody></Table></div>
              <TablePagination currentPage={page} totalItems={filtered.length} onPageChange={setPage} />
            </>
          )}
        </CardContent></Card>

      {/* Record Waste Dialog — D1 + D4 + D6 */}
      <Dialog open={showAdd} onOpenChange={(open) => { if (!open) resetForm(); setShowAdd(open); }}><DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Record Waste</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {/* D1 — Waste Type Toggle */}
          <div className="space-y-1.5">
            <Label>Waste Type</Label>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={form.wasteType === "raw" ? "default" : "outline"} onClick={() => setForm(p => ({ ...p, wasteType: "raw", finishedItemName: "", manualLoss: 0 }))}>Raw Material</Button>
              <Button type="button" size="sm" variant={form.wasteType === "finished" ? "default" : "outline"} onClick={() => setForm(p => ({ ...p, wasteType: "finished", ingredientId: "" }))}>Finished Product</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {form.wasteType === "raw" ? "Raw material waste — stock will be deducted automatically" : "Finished product waste — enter value only, ingredients already deducted"}
            </p>
          </div>

          {form.wasteType === "raw" ? (
            <>
              <div className="space-y-1.5"><Label>Item</Label><Select value={form.ingredientId} onValueChange={(v) => setForm(p => ({ ...p, ingredientId: v }))}><SelectTrigger><SelectValue placeholder="Select Ingredient" /></SelectTrigger><SelectContent>{ingredients.map(ig => <SelectItem key={ig.id} value={ig.id}>{ig.name} (Stock: {ig.currentStock} {ig.unit})</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label>Quantity{selectedIng ? ` (${selectedIng.unit})` : ""}</Label><Input type="number" value={form.qty || ""} onChange={(e) => setForm(p => ({ ...p, qty: Number(e.target.value) }))} /></div>
              {selectedIng && form.qty > 0 && <p className="text-sm text-muted-foreground">Estimated Loss: <strong className="text-destructive">{currency} {estimatedLoss.toLocaleString()}</strong></p>}
            </>
          ) : (
            <>
              <div className="space-y-1.5"><Label>Item Name</Label><Input placeholder="e.g. Chicken Tikka Pizza" value={form.finishedItemName} onChange={(e) => setForm(p => ({ ...p, finishedItemName: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Quantity</Label><Input type="number" value={form.qty || ""} onChange={(e) => setForm(p => ({ ...p, qty: Number(e.target.value) }))} placeholder="1" /></div>
                <div className="space-y-1.5"><Label>Unit</Label><Input value={form.unit} onChange={(e) => setForm(p => ({ ...p, unit: e.target.value }))} placeholder="piece" /></div>
              </div>
              <div className="space-y-1.5"><Label>Loss Amount ({currency})</Label><Input type="number" value={form.manualLoss || ""} onChange={(e) => setForm(p => ({ ...p, manualLoss: Number(e.target.value) }))} placeholder="Enter total loss value" /></div>
            </>
          )}

          {/* D4 — Waste Reason Dropdown */}
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Select value={form.reason} onValueChange={(v) => setForm(p => ({ ...p, reason: v }))}>
              <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
              <SelectContent>
                {WASTE_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* D6 — Responsible Person */}
          <div className="space-y-1.5">
            <Label>Responsible Person</Label>
            <Select value={form.responsiblePerson} onValueChange={(v) => setForm(p => ({ ...p, responsiblePerson: v }))}>
              <SelectTrigger><SelectValue placeholder="Who was responsible?" /></SelectTrigger>
              <SelectContent>
                {users.map(u => <SelectItem key={u.id} value={u.name}>{u.name} ({u.role})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* D6 — Disposed By */}
          <div className="space-y-1.5">
            <Label>Disposed By</Label>
            <Select value={form.disposedBy} onValueChange={(v) => setForm(p => ({ ...p, disposedBy: v }))}>
              <SelectTrigger><SelectValue placeholder="Who disposed it?" /></SelectTrigger>
              <SelectContent>
                {users.map(u => <SelectItem key={u.id} value={u.name}>{u.name} ({u.role})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* D1 — Photo Attachment */}
          <div className="space-y-1.5">
            <Label>Photo Evidence (Optional)</Label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 px-3 py-2 rounded-md border border-dashed cursor-pointer hover:bg-muted/50 transition-colors text-sm text-muted-foreground">
                <Camera className="h-4 w-4" />
                {form.photo ? "Change Photo" : "Attach Photo"}
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
              </label>
              {form.photo && <img src={form.photo} alt="Preview" className="h-12 w-12 rounded-md object-cover border" />}
            </div>
          </div>

          <div className="space-y-1.5"><Label>Notes</Label><Textarea placeholder="Additional notes" value={form.notes} onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => { resetForm(); setShowAdd(false); }}>Cancel</Button><Button className="gradient-primary text-primary-foreground" onClick={handleSave}>Save</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
};
export default Waste;

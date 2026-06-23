import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Search, Factory, Trash2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { stockService, type ProductionRecord } from "@/services/stock.service";
import { menuService, type MenuItemRecord } from "@/services/menu.service";
import { inventoryService, type IngredientRecord } from "@/services/inventory.service";
import { warehouseService } from "@/services/warehouse.service";

const Production = () => {
  const [list, setList] = useState<ProductionRecord[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItemRecord[]>([]);
  const [ingredients, setIngredients] = useState<IngredientRecord[]>([]);
  // Per-kitchen stock for the current scope (branch admins see only their kitchen; the
  // header outlet selector scopes this). Production consumes/adds in the kitchen, so the
  // selectors show THIS number — not the chain-wide global Ingredient.currentStock.
  const [kitchenStock, setKitchenStock] = useState<Record<string, { stock: number; unit: string }>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showDough, setShowDough] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ menuItemId: "", itemName: "", quantity: 0, unit: "", notes: "" });
  const [doughForm, setDoughForm] = useState<{ producedIngredientId: string; quantity: number; unit: string; consumed: { ingredientId: string; qty: number }[]; shelfHours: number; shelfMins: number }>({ producedIngredientId: "", quantity: 0, unit: "", consumed: [], shelfHours: 8, shelfMins: 0 });
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
    inventoryService.getIngredients({ status: 'active' }).then(setIngredients).catch(() => {});
    // Build the per-kitchen stock map (summed across the kitchens visible in the current
    // outlet scope) so the ingredient selectors show kitchen stock, matching Kitchen Stock.
    warehouseService.getAll({ type: 'KITCHEN' }).then(async (kws) => {
      const lists = await Promise.all(kws.map((w) => warehouseService.getStock(w.id).catch(() => [])));
      const map: Record<string, { stock: number; unit: string }> = {};
      for (const list of lists) {
        for (const s of list) {
          const id = s.ingredient.id;
          map[id] = {
            stock: (map[id]?.stock ?? 0) + Number(s.currentStock),
            unit: s.ingredient.unit?.symbol || s.ingredient.unit?.name || "",
          };
        }
      }
      setKitchenStock(map);
    }).catch(() => {});
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = list.filter((p) => (p.itemName || "").toLowerCase().includes(search.toLowerCase()));

  // Show the ingredient's KITCHEN stock inline in the selectors (same idea as purchase/demand
  // pages, but scoped to this kitchen — production happens here, so the global chain-wide number
  // would mislead a branch user). Ingredients with no kitchen row show 0.
  const stockLabel = (i: IngredientRecord) => {
    const k = kitchenStock[i.id];
    const qty = k ? k.stock : 0;
    const unit = k?.unit || i.unit?.name || "";
    return `${i.name} (Kitchen: ${qty}${unit ? " " + unit : ""})`;
  };

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

  const submitDough = async () => {
    if (!doughForm.producedIngredientId || doughForm.quantity <= 0) { toast.error("Select the dough item and a quantity"); return; }
    const totalMins = Math.round((Number(doughForm.shelfHours) || 0) * 60 + (Number(doughForm.shelfMins) || 0));
    try {
      await stockService.createProduction({
        itemName: ingredients.find(i => i.id === doughForm.producedIngredientId)?.name || "Dough",
        quantity: doughForm.quantity,
        unit: doughForm.unit || undefined,
        producedIngredientId: doughForm.producedIngredientId,
        consumedIngredients: doughForm.consumed.filter(c => c.ingredientId && c.qty > 0),
        shelfLifeMinutes: totalMins > 0 ? totalMins : undefined,
      });
      toast.success(totalMins > 0 ? `Dough produced — expires in ${Math.floor(totalMins / 60)}h ${totalMins % 60}m` : "Dough produced — batch created with shelf-life clock started");
      setShowDough(false);
      setDoughForm({ producedIngredientId: "", quantity: 0, unit: "", consumed: [], shelfHours: 8, shelfMins: 0 });
      fetchData();
    } catch (e: any) { toast.error(e.message || "Failed to produce dough"); }
  };

  if (loading) return <div className="space-y-6"><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div><Skeleton className="h-10 w-full rounded-lg" />{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg mt-2" />)}</div>;

  return (
    <div className="space-y-6">
      <PageHeader icon={<Factory className="h-5 w-5" />} title="Production" subtitle="Production batches" actions={<div className="flex gap-2"><Button variant="outline" onClick={() => { setShowDough(v => !v); setShowAdd(false); }}><Plus className="h-4 w-4 mr-2" />Produce Dough</Button><Button className="gradient-primary text-primary-foreground" onClick={() => { setShowAdd(v => !v); setShowDough(false); }}><Plus className="h-4 w-4 mr-2" />New Production</Button></div>} />
      {showAdd && (
        <Card className="shadow-sm border-primary/30">
          <CardHeader className="pb-3"><CardTitle className="text-base">New Production</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5 sm:col-span-1">
                <Label>Food Item</Label>
                <Select value={form.menuItemId} onValueChange={(v) => {
                  const item = menuItems.find(m => m.id === v);
                  setForm(p => ({ ...p, menuItemId: v, itemName: item?.name || "" }));
                }}>
                  <SelectTrigger><SelectValue placeholder="Select food item" /></SelectTrigger>
                  <SelectContent>{menuItems.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Quantity</Label>
                <Input placeholder="Quantity to produce" type="number" value={form.quantity || ""} onChange={(e) => setForm((p) => ({ ...p, quantity: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Unit (Optional)</Label>
                <Input placeholder="e.g. kg, pieces" value={form.unit} onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))} />
              </div>
            </div>
            {form.menuItemId && <p className="text-xs text-muted-foreground">Recipe ingredients will be deducted from kitchen stock automatically.</p>}
            <div className="space-y-1.5"><Label>Notes</Label><Textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} /></div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" onClick={() => { setShowAdd(false); setForm({ menuItemId: "", itemName: "", quantity: 0, unit: "", notes: "" }); }}>Cancel</Button>
              <Button className="gradient-primary text-primary-foreground" onClick={handleProduce}>Produce</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {showDough && (
        <Card className="shadow-sm border-primary/30">
          <CardHeader className="pb-3"><CardTitle className="text-base">Produce Dough / Short-Life Item</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5 sm:col-span-1">
                <Label>Dough / Short-Life Item</Label>
                <Select value={doughForm.producedIngredientId} onValueChange={(v) => { const ing = ingredients.find(i => i.id === v); setDoughForm(p => ({ ...p, producedIngredientId: v, shelfHours: ing?.shelfLifeHours ?? p.shelfHours, shelfMins: 0 })); }}>
                  <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                  <SelectContent>
                    {(ingredients.filter(i => i.shelfLifeHours != null).length > 0
                      ? ingredients.filter(i => i.shelfLifeHours != null)
                      : ingredients
                    ).map(i => <SelectItem key={i.id} value={i.id}>{stockLabel(i)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Quantity</Label>
                <Input type="number" placeholder="Qty produced" value={doughForm.quantity || ""} onChange={(e) => setDoughForm(p => ({ ...p, quantity: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Input placeholder="e.g. kg" value={doughForm.unit} onChange={(e) => setDoughForm(p => ({ ...p, unit: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Shelf life (expires after)</Label>
              <div className="flex items-end gap-2">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Hours</span>
                  <Input type="number" min={0} className="w-24" placeholder="8" value={doughForm.shelfHours || ""} onChange={(e) => setDoughForm(p => ({ ...p, shelfHours: Math.max(0, Number(e.target.value)) }))} />
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Minutes</span>
                  <Input type="number" min={0} max={59} className="w-24" placeholder="0" value={doughForm.shelfMins || ""} onChange={(e) => setDoughForm(p => ({ ...p, shelfMins: Math.max(0, Number(e.target.value)) }))} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Countdown starts now. Leave at the item's default for normal shelf life — e.g. 8h 0m.</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Consumed Ingredients</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setDoughForm(p => ({ ...p, consumed: [...p.consumed, { ingredientId: "", qty: 0 }] }))}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Add ingredient
                </Button>
              </div>
              {doughForm.consumed.length === 0 && <p className="text-xs text-muted-foreground">No consumed ingredients added yet.</p>}
              {doughForm.consumed.map((row, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <Select value={row.ingredientId} onValueChange={(v) => setDoughForm(p => ({ ...p, consumed: p.consumed.map((c, i) => i === idx ? { ...c, ingredientId: v } : c) }))}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Ingredient" /></SelectTrigger>
                    <SelectContent>{ingredients.map(i => <SelectItem key={i.id} value={i.id}>{stockLabel(i)}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input type="number" placeholder="Qty" className="w-24" value={row.qty || ""} onChange={(e) => setDoughForm(p => ({ ...p, consumed: p.consumed.map((c, i) => i === idx ? { ...c, qty: Number(e.target.value) } : c) }))} />
                  <Button type="button" variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setDoughForm(p => ({ ...p, consumed: p.consumed.filter((_, i) => i !== idx) }))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" onClick={() => { setShowDough(false); setDoughForm({ producedIngredientId: "", quantity: 0, unit: "", consumed: [], shelfHours: 8, shelfMins: 0 }); }}>Cancel</Button>
              <Button className="gradient-primary text-primary-foreground" onClick={submitDough}>Produce</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-sm"><CardHeader className="pb-3"><div className="relative max-w-sm"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="pl-9" /></div></CardHeader>
        <CardContent>{filtered.length === 0 ? (<div className="text-center py-12"><Factory className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" /><p className="text-muted-foreground">No production records found</p><p className="text-xs text-muted-foreground mt-1.5">Start your first production batch.</p></div>) : (
          <div className="rounded-lg border overflow-auto max-h-[calc(100vh-300px)]"><Table><TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>SN</TableHead><TableHead>Date</TableHead><TableHead>Item</TableHead><TableHead>Qty</TableHead><TableHead>Unit</TableHead><TableHead>By</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader>
            <TableBody>{filtered.map((p, i) => (<TableRow key={p.id} className="hover:bg-muted/30 transition-colors"><TableCell>{i+1}</TableCell><TableCell>{p.date.slice(0, 10)}</TableCell><TableCell className="font-medium">{p.itemName}</TableCell><TableCell>{p.quantity}</TableCell><TableCell>{p.unit || "—"}</TableCell><TableCell>{p.producedBy || "—"}</TableCell><TableCell className="text-muted-foreground">{p.notes || "—"}</TableCell></TableRow>))}</TableBody></Table></div>
        )}</CardContent></Card>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirm Production</AlertDialogTitle><AlertDialogDescription>This will record the production{form.menuItemId ? " and deduct required ingredients from stock" : ""}. Continue?</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={doSave} className="gradient-primary text-primary-foreground" disabled={saving}>{saving ? "Saving..." : "Yes, Produce"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
export default Production;

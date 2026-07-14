import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Search, Factory, Trash2, Pencil, ChevronDown } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { stockService, type ProductionRecord, type ProductionStockRecord } from "@/services/stock.service";
import { menuService, type MenuItemRecord } from "@/services/menu.service";
import { inventoryService, type IngredientRecord } from "@/services/inventory.service";
import { warehouseService } from "@/services/warehouse.service";
import { useAuth } from "@/contexts/AuthContext";
import productionItemService, { type ProductionItemRecord } from "@/services/production-items.service";

function expiryColor(effectiveExpiry: string | null): string {
  if (!effectiveExpiry) return '';
  const diffMs = new Date(effectiveExpiry).getTime() - Date.now();
  const diffH = diffMs / (1000 * 60 * 60);
  if (diffMs < 0) return 'text-destructive font-semibold';
  if (diffH < 2) return 'text-orange-500 font-semibold';
  if (diffH < 6) return 'text-yellow-600';
  return 'text-success';
}

function expiryLabel(effectiveExpiry: string | null): string {
  if (!effectiveExpiry) return 'No expiry';
  const diffMs = new Date(effectiveExpiry).getTime() - Date.now();
  if (diffMs < 0) return 'Expired';
  const h = Math.floor(diffMs / 3600000);
  const m = Math.floor((diffMs % 3600000) / 60000);
  return `${h}h ${m}m left`;
}

const Production = () => {
  const { user } = useAuth();
  const [list, setList] = useState<ProductionRecord[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItemRecord[]>([]);
  const [ingredients, setIngredients] = useState<IngredientRecord[]>([]);
  // Per-kitchen stock for the current scope (branch admins see only their kitchen; the
  // header outlet selector scopes this). Production consumes/adds in the kitchen, so the
  // selectors show THIS number — not the chain-wide global Ingredient.currentStock.
  const [kitchenStock, setKitchenStock] = useState<Record<string, { stock: number; unit: string }>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showProduce, setShowProduce] = useState(false);
  const [produceForm, setProduceForm] = useState({
    productionItemId: '',
    quantity: 0,
    shelfHours: 8,
    shelfMins: 0,
    consumed: [] as { ingredientId: string; qty: number }[],
    notes: '',
  });
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ menuItemId: "", itemName: "", quantity: 0, unit: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [productionItems, setProductionItems] = useState<ProductionItemRecord[]>([]);
  const [showManageItems, setShowManageItems] = useState(false);
  const [editingItem, setEditingItem] = useState<ProductionItemRecord | null>(null);
  const [itemForm, setItemForm] = useState({ name: '', unit: '', shelfLifeHours: '' });
  const [savingItem, setSavingItem] = useState(false);
  const canManageItems = ['Super Admin', 'Admin', 'Manager'].includes(user?.role ?? '');
  const isSuperAdmin = user?.role === 'Super Admin';

  // Production Stock tab state
  const { data: productionStock = [], refetch: refetchStock } = useQuery<ProductionStockRecord[]>({
    queryKey: ['production-stock'],
    queryFn: () => stockService.getProductionStock(),
  });
  const [wasteTarget, setWasteTarget] = useState<{ batchId: string; max: number } | null>(null);
  const [wasteQty, setWasteQty] = useState('');
  const [wastingSaving, setWastingSaving] = useState(false);
  const [expandedItemKey, setExpandedItemKey] = useState<string | null>(null);

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
  useEffect(() => { productionItemService.getAll().then(setProductionItems).catch(() => {}); }, []);

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

  const submitProduce = async () => {
    const { productionItemId, quantity, shelfHours, shelfMins, consumed, notes } = produceForm;
    if (!productionItemId) { toast.error('Select a production item'); return; }
    if (!quantity || quantity <= 0) { toast.error('Enter a valid quantity'); return; }
    const validConsumed = consumed.filter(c => c.ingredientId && c.qty > 0);
    if (validConsumed.length === 0) { toast.error('Add at least one ingredient with a quantity greater than 0'); return; }
    const invalidRows = consumed.filter(c => c.ingredientId && c.qty <= 0);
    if (invalidRows.length > 0) { toast.error('All added ingredients must have a quantity greater than 0'); return; }
    const totalMinutes = shelfHours * 60 + shelfMins;
    setSaving(true);
    try {
      await stockService.createProductionItem({
        productionItemId,
        quantity,
        unit: productionItems.find(i => i.id === productionItemId)?.unit ?? '',
        consumedIngredients: validConsumed,
        shelfLifeMinutes: totalMinutes > 0 ? totalMinutes : undefined,
        notes: notes || undefined,
      });
      toast.success('Production batch created');
      setShowProduce(false);
      setProduceForm({ productionItemId: '', quantity: 0, shelfHours: 8, shelfMins: 0, consumed: [], notes: '' });
      fetchData();
      refetchStock();
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Failed to create production');
    } finally { setSaving(false); }
  };

  if (loading) return <div className="space-y-6"><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div><Skeleton className="h-10 w-full rounded-lg" />{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg mt-2" />)}</div>;

  return (
    <div className="space-y-6">
      <PageHeader icon={<Factory className="h-5 w-5" />} title="Production" subtitle="Production batches" actions={<div className="flex gap-2">{canManageItems && (<Button variant="outline" onClick={() => setShowManageItems(v => !v)}>{showManageItems ? 'Hide Items' : 'Manage Items'}</Button>)}{!isSuperAdmin && (<><Button variant="outline" onClick={() => { setShowProduce(v => !v); setShowAdd(false); }}>{showProduce ? 'Cancel' : <><Plus className="h-4 w-4 mr-1" />Produce Item</>}</Button><Button className="gradient-primary text-primary-foreground" onClick={() => { setShowAdd(v => !v); setShowProduce(false); }}><Plus className="h-4 w-4 mr-2" />New Production</Button></>)}</div>} />
      {showManageItems && canManageItems && (
        <Card className="shadow-sm border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Production Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input list="production-item-name-list" placeholder="e.g. Pizza Dough" value={itemForm.name} onChange={e => setItemForm(p => ({ ...p, name: e.target.value }))} />
                <datalist id="production-item-name-list">
                  {productionItems.map(i => <option key={i.id} value={i.name} />)}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Input list="production-unit-list" placeholder="e.g. kg" value={itemForm.unit} onChange={e => setItemForm(p => ({ ...p, unit: e.target.value }))} />
                <datalist id="production-unit-list">
                  {["kg", "portion", "piece", "liter", "gram", "ml", "box"].map(u => <option key={u} value={u} />)}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label>Default Shelf Life (hours)</Label>
                <Input type="number" placeholder="e.g. 8" value={itemForm.shelfLifeHours} onChange={e => setItemForm(p => ({ ...p, shelfLifeHours: e.target.value }))} />
              </div>
              <div className="flex gap-2">
                {editingItem && (
                  <Button variant="outline" size="sm" onClick={() => { setEditingItem(null); setItemForm({ name: '', unit: '', shelfLifeHours: '' }); }}>Cancel</Button>
                )}
                <Button size="sm" className="gradient-primary text-primary-foreground" disabled={savingItem || !itemForm.name || !itemForm.unit}
                  onClick={async () => {
                    setSavingItem(true);
                    try {
                      const data = { name: itemForm.name, unit: itemForm.unit, shelfLifeHours: itemForm.shelfLifeHours ? Number(itemForm.shelfLifeHours) : null };
                      if (editingItem) {
                        const updated = await productionItemService.update(editingItem.id, data);
                        setProductionItems(prev => prev.map(i => i.id === updated.id ? updated : i));
                      } else {
                        const created = await productionItemService.create(data);
                        setProductionItems(prev => [...prev, created]);
                      }
                      setItemForm({ name: '', unit: '', shelfLifeHours: '' });
                      setEditingItem(null);
                      toast.success(editingItem ? 'Item updated' : 'Item created');
                    } catch (err: unknown) {
                      toast.error((err as Error).message || 'Failed to save');
                    } finally { setSavingItem(false); }
                  }}
                >{savingItem ? 'Saving...' : editingItem ? 'Update' : 'Add Item'}</Button>
              </div>
            </div>
            {productionItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No production items yet.</p>
            ) : (
              <div className="rounded-lg border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead>Name</TableHead><TableHead>Unit</TableHead><TableHead>Default Shelf Life</TableHead><TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productionItems.map(item => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{item.unit}</TableCell>
                        <TableCell className="text-sm">{item.shelfLifeHours != null ? `${item.shelfLifeHours}h` : '—'}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingItem(item); setItemForm({ name: item.name, unit: item.unit, shelfLifeHours: item.shelfLifeHours?.toString() ?? '' }); }}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={async () => { try { await productionItemService.delete(item.id); setProductionItems(prev => prev.filter(i => i.id !== item.id)); toast.success('Deleted'); } catch (err: unknown) { toast.error((err as Error).message || 'Failed'); } }}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {showAdd && !isSuperAdmin && (
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

      {showProduce && !isSuperAdmin && (
        <Card className="shadow-sm border-primary/30">
          <CardHeader className="pb-3"><CardTitle className="text-base">Produce Item</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {/* Row 1: Production Item picker, Quantity, Unit (auto-fill) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5 sm:col-span-1">
                <Label>Production Item *</Label>
                <Select value={produceForm.productionItemId} onValueChange={(v) => {
                  const item = productionItems.find(i => i.id === v);
                  setProduceForm(p => ({ ...p, productionItemId: v, shelfHours: item?.shelfLifeHours ?? 8, shelfMins: 0 }));
                }}>
                  <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                  <SelectContent>
                    {productionItems.map(i => <SelectItem key={i.id} value={i.id}>{i.name} ({i.unit})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Quantity *</Label>
                <Input type="number" placeholder="Qty" value={produceForm.quantity || ''} onChange={e => setProduceForm(p => ({ ...p, quantity: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Input value={productionItems.find(i => i.id === produceForm.productionItemId)?.unit ?? ''} disabled className="bg-muted/50" />
              </div>
            </div>

            {/* Shelf life override */}
            <div className="space-y-1.5">
              <Label>Shelf life override</Label>
              <div className="flex items-end gap-2">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Hours</span>
                  <Input type="number" min={0} className="w-24" value={produceForm.shelfHours || ''} onChange={e => setProduceForm(p => ({ ...p, shelfHours: Math.max(0, Number(e.target.value)) }))} />
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Minutes</span>
                  <Input type="number" min={0} max={59} className="w-24" value={produceForm.shelfMins || ''} onChange={e => setProduceForm(p => ({ ...p, shelfMins: Math.max(0, Number(e.target.value)) }))} />
                </div>
              </div>
            </div>

            {/* Consumed Ingredients */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Consumed Ingredients (from Kitchen Stock)</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setProduceForm(p => ({ ...p, consumed: [...p.consumed, { ingredientId: '', qty: 0 }] }))}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Add
                </Button>
              </div>
              {produceForm.consumed.length === 0 && <p className="text-xs text-muted-foreground">No consumed ingredients added.</p>}
              {produceForm.consumed.map((row, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <Select value={row.ingredientId} onValueChange={v => setProduceForm(p => ({ ...p, consumed: p.consumed.map((c, i) => i === idx ? { ...c, ingredientId: v } : c) }))}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Ingredient" /></SelectTrigger>
                    <SelectContent>
                      {ingredients.map(i => {
                        const s = kitchenStock[i.id];
                        return <SelectItem key={i.id} value={i.id}>{i.name}{s ? ` (Kitchen: ${s.stock} ${s.unit})` : ''}</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                  <Input type="number" placeholder="Qty" className="w-24" value={row.qty || ''} onChange={e => setProduceForm(p => ({ ...p, consumed: p.consumed.map((c, i) => i === idx ? { ...c, qty: Number(e.target.value) } : c) }))} />
                  <Button type="button" variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setProduceForm(p => ({ ...p, consumed: p.consumed.filter((_, i) => i !== idx) }))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Input list="production-notes-list" placeholder="e.g. morning batch" value={produceForm.notes} onChange={e => setProduceForm(p => ({ ...p, notes: e.target.value }))} />
              <datalist id="production-notes-list">
                {["Morning Batch", "Evening Batch", "Night Shift", "Daily Prep", "Bulk Prep", "Special Order Prep"].map(n => <option key={n} value={n} />)}
              </datalist>
            </div>

            {/* Footer buttons */}
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" onClick={() => { setShowProduce(false); setProduceForm({ productionItemId: '', quantity: 0, shelfHours: 8, shelfMins: 0, consumed: [], notes: '' }); }}>Cancel</Button>
              <Button className="gradient-primary text-primary-foreground" onClick={submitProduce} disabled={saving}>{saving ? 'Producing...' : 'Produce'}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="history">
        <TabsList>
          <TabsTrigger value="history">Production History</TabsTrigger>
          <TabsTrigger value="stock">Production Stock</TabsTrigger>
        </TabsList>

        <TabsContent value="history">
          <Card className="shadow-sm"><CardHeader className="pb-3"><div className="relative max-w-sm"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="pl-9" /></div></CardHeader>
            <CardContent>{filtered.length === 0 ? (<div className="text-center py-12"><Factory className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" /><p className="text-muted-foreground">No production records found</p><p className="text-xs text-muted-foreground mt-1.5">Start your first production batch.</p></div>) : (
              <div className="rounded-lg border overflow-auto max-h-[calc(100vh-300px)]"><Table><TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>SN</TableHead><TableHead>Created Time</TableHead><TableHead>Expire Time</TableHead><TableHead>Item</TableHead><TableHead>Qty</TableHead><TableHead>Unit</TableHead><TableHead>By</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader>
                <TableBody>{filtered.map((p, i) => {
                  const createdAt = new Date(p.date);
                  const expiresAt = p.shelfLifeMinutes != null ? new Date(createdAt.getTime() + p.shelfLifeMinutes * 60000) : null;
                  return (<TableRow key={p.id} className="hover:bg-muted/30 transition-colors"><TableCell>{i+1}</TableCell><TableCell className="text-sm whitespace-nowrap">{createdAt.toLocaleString()}</TableCell><TableCell className="text-sm whitespace-nowrap">{expiresAt ? expiresAt.toLocaleString() : "—"}</TableCell><TableCell className="font-medium">{p.itemName}</TableCell><TableCell>{p.quantity}</TableCell><TableCell>{p.unit || "—"}</TableCell><TableCell>{p.producedBy || "—"}</TableCell><TableCell className="text-muted-foreground">{p.notes || "—"}</TableCell></TableRow>);
                })}</TableBody></Table></div>
            )}</CardContent></Card>
        </TabsContent>

        <TabsContent value="stock">
          {productionStock.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No production stock yet. Produce an item first.</div>
          ) : (
            <div className="space-y-3">
              {productionStock.map((s: ProductionStockRecord) => {
                const key = `${s.productionItemId}-${s.warehouseId}`;
                const isExpanded = expandedItemKey === key;
                return (
                  <Card key={key} className="shadow-sm">
                    <CardHeader
                      className="pb-2 cursor-pointer select-none"
                      onClick={() => setExpandedItemKey(isExpanded ? null : key)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium">{s.item.name}</span>
                          <span className="text-xs text-muted-foreground ml-2">{s.warehouse.name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold">{s.currentStock.toFixed(2)} {s.item.unit}</span>
                          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                      </div>
                    </CardHeader>
                    {isExpanded && (
                      <CardContent>
                        {s.batches.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No active batches.</p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/50 hover:bg-muted/50">
                                <TableHead>Produced At</TableHead>
                                <TableHead className="text-right">Batch Qty</TableHead>
                                <TableHead className="text-right">Remaining</TableHead>
                                <TableHead>Expires</TableHead>
                                <TableHead></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {s.batches.map(b => (
                                <TableRow key={b.id}>
                                  <TableCell className="text-sm">{new Date(b.createdAt).toLocaleString()}</TableCell>
                                  <TableCell className="text-right text-sm">{b.batchQty} {s.item.unit}</TableCell>
                                  <TableCell className="text-right text-sm font-medium">{b.remainingQty} {s.item.unit}</TableCell>
                                  <TableCell className={`text-sm ${expiryColor(b.effectiveExpiry)}`}>{expiryLabel(b.effectiveExpiry)}</TableCell>
                                  <TableCell>
                                    {wasteTarget?.batchId === b.id ? (
                                      <div className="flex gap-1 items-center">
                                        <Input
                                          type="number" min={0.01} max={b.remainingQty} step={0.01}
                                          className="w-20 h-7 text-xs"
                                          value={wasteQty}
                                          onChange={e => setWasteQty(e.target.value)}
                                        />
                                        <Button size="sm" variant="destructive" className="h-7 text-xs px-2"
                                          disabled={wastingSaving || !wasteQty || Number(wasteQty) <= 0}
                                          onClick={async () => {
                                            setWastingSaving(true);
                                            try {
                                              await stockService.wasteProductionBatch(b.id, Number(wasteQty));
                                              toast.success('Waste recorded');
                                              setWasteTarget(null); setWasteQty('');
                                              refetchStock();
                                            } catch (err: unknown) {
                                              toast.error((err as Error).message || 'Failed');
                                            } finally { setWastingSaving(false); }
                                          }}
                                        >{wastingSaving ? '...' : 'Confirm'}</Button>
                                        <Button size="sm" variant="ghost" className="h-7 text-xs px-2"
                                          onClick={() => { setWasteTarget(null); setWasteQty(''); }}
                                        >Cancel</Button>
                                      </div>
                                    ) : (
                                      <Button size="sm" variant="ghost"
                                        className="h-7 text-xs text-destructive hover:text-destructive"
                                        onClick={() => { setWasteTarget({ batchId: b.id, max: b.remainingQty }); setWasteQty(''); }}
                                      >Waste</Button>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirm Production</AlertDialogTitle><AlertDialogDescription>This will record the production{form.menuItemId ? " and deduct required ingredients from stock" : ""}. Continue?</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={doSave} className="gradient-primary text-primary-foreground" disabled={saving}>{saving ? "Saving..." : "Yes, Produce"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
export default Production;

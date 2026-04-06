import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, ArrowUpDown, Check, ChevronsUpDown, RefreshCw, Eye, User, Phone, ChevronUp, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { TablePagination, paginate } from "@/components/TablePagination";
import { PageHeader } from "@/components/ui/page-header";
import { stockService, type StockAdjustmentRecord } from "@/services/stock.service";
import { inventoryService, type IngredientRecord } from "@/services/inventory.service";
import { warehouseService, type WarehouseRecord, type WarehouseStockRecord } from "@/services/warehouse.service";
import { useAuth } from "@/contexts/AuthContext";

const TYPE_LABELS: Record<string, { label: string; cls: string }> = {
  add: { label: "Addition", cls: "bg-success/10 text-success" },
  deduct: { label: "Reduction", cls: "bg-destructive/10 text-destructive" },
  damage: { label: "Damage", cls: "bg-warning/10 text-warning" },
  correction: { label: "Correction", cls: "bg-info/10 text-info" },
};

const COMMON_REASONS: Record<string, string[]> = {
  add: [
    "New purchase received",
    "Stock transfer from main warehouse",
    "Returned from kitchen",
    "Opening stock entry",
    "Supplier replacement",
    "Inventory count correction",
  ],
  deduct: [
    "Used in kitchen",
    "Given to another branch",
    "Consumed for testing",
    "Staff meal deduction",
    "Complimentary / free sample",
    "Inventory count correction",
  ],
  damage: [
    "Expired / shelf life over",
    "Spoiled / quality issue",
    "Broken / packaging damage",
    "Pest contamination",
    "Freezer / storage failure",
    "Accidental spillage",
  ],
  correction: [
    "Physical count mismatch",
    "System error correction",
    "Wrong entry adjustment",
    "Duplicate entry fix",
    "Opening balance correction",
  ],
};

const StockAdjustments = () => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'Super Admin';
  const canAdjust = ['Super Admin', 'Admin', 'Manager', 'Store Manager'].includes(user?.role ?? '');

  const [list, setList] = useState<StockAdjustmentRecord[]>([]);
  const [ingredients, setIngredients] = useState<IngredientRecord[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseRecord[]>([]);
  const [warehouseStock, setWarehouseStock] = useState<WarehouseStockRecord[]>([]);
  const [selectedWHId, setSelectedWHId] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showDetail, setShowDetail] = useState<StockAdjustmentRecord | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [form, setForm] = useState({ ingredientId: "", type: "add" as string, quantity: 0, reason: "" });
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reasonOpen, setReasonOpen] = useState(false);

  // Load warehouses + ingredients on mount
  useEffect(() => {
    Promise.all([
      warehouseService.getAll(),
      inventoryService.getIngredients(),
    ]).then(([whs, ings]) => {
      // Filter warehouses by role scope
      const filtered = isSuperAdmin ? whs : whs.filter(w => w.outletId === user?.outletId);
      setWarehouses(filtered);
      setIngredients(ings);
      if (filtered.length > 0) setSelectedWHId(filtered[0].id);
      if (filtered.length === 0) setLoading(false);
    }).catch((err: unknown) => {
      toast.error((err as Error).message || "Failed to load data");
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch adjustments + stock for selected warehouse
  const fetchData = useCallback(async (whId: string) => {
    if (!whId) return;
    try {
      const [adjRes, stockData] = await Promise.all([
        stockService.getAdjustments({ warehouseId: whId, limit: 200 }),
        warehouseService.getStock(whId),
      ]);
      setList(adjRes.data);
      setWarehouseStock(stockData);
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to load adjustments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (selectedWHId) fetchData(selectedWHId); }, [selectedWHId, fetchData]);

  const handleRefresh = useCallback(async () => {
    if (!selectedWHId) return;
    setRefreshing(true);
    await fetchData(selectedWHId);
    setRefreshing(false);
  }, [selectedWHId, fetchData]);

  // Filter adjustments
  const filtered = useMemo(() => {
    let items = list;
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(a => (a.ingredient?.name || "").toLowerCase().includes(q));
    }
    if (typeFilter) items = items.filter(a => a.type === typeFilter);
    return items;
  }, [list, search, typeFilter]);

  const paged = paginate(filtered, page);

  // Stats
  const stats = useMemo(() => ({
    total: list.length,
    additions: list.filter(a => a.type === 'add').length,
    deductions: list.filter(a => a.type === 'deduct').length,
    damages: list.filter(a => a.type === 'damage').length,
  }), [list]);

  // Ingredient stock map for showing current stock in form
  const stockMap = useMemo(() => {
    const map: Record<string, number> = {};
    warehouseStock.forEach(s => { map[s.ingredient.id] = Number(s.currentStock); });
    return map;
  }, [warehouseStock]);

  const selectedIng = ingredients.find(i => i.id === form.ingredientId);

  const openAdd = () => {
    setForm({ ingredientId: "", type: "add", quantity: 0, reason: "" });
    setShowAdd(true);
  };

  const handleSave = async () => {
    if (!form.ingredientId || form.quantity <= 0) { toast.error("Select ingredient and enter quantity"); return; }
    if (!selectedWHId) { toast.error("No warehouse selected"); return; }
    setSaving(true);
    try {
      await stockService.createAdjustment({
        ingredientId: form.ingredientId,
        type: form.type,
        quantity: form.quantity,
        reason: form.reason || undefined,
        warehouseId: selectedWHId,
      });
      toast.success("Stock adjustment recorded");
      setShowAdd(false);
      fetchData(selectedWHId);
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to save adjustment");
    } finally {
      setSaving(false);
    }
  };

  const selectedWarehouse = warehouses.find(w => w.id === selectedWHId);

  if (loading && warehouses.length === 0) return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-full rounded-lg" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg mt-2" />)}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<ArrowUpDown className="h-5 w-5" />}
        title="Stock Adjustments"
        subtitle={selectedWarehouse ? `${selectedWarehouse.name} (${selectedWarehouse.type})` : "Record stock changes"}
        actions={
          <div className="flex items-center gap-2">
            {warehouses.length > 1 && (
              <Select value={selectedWHId} onValueChange={v => { setSelectedWHId(v); setPage(1); }}>
                <SelectTrigger className="w-56"><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                <SelectContent>
                  {warehouses.map(w => (
                    <SelectItem key={w.id} value={w.id}>{w.name} ({w.type})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />Refresh
            </Button>
            {canAdjust && selectedWHId && (
              <Button className="gradient-primary text-primary-foreground" onClick={() => { if (showAdd) { setShowAdd(false); } else { openAdd(); } }}>
                {showAdd ? <><X className="h-4 w-4 mr-2" />Close Form</> : <><Plus className="h-4 w-4 mr-2" />Add Adjustment</>}
              </Button>
            )}
          </div>
        }
      />

      {/* Stats Cards */}
      {selectedWHId && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className={`shadow-sm cursor-pointer transition-all ${typeFilter === "" ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-primary/30"}`} onClick={() => { setTypeFilter(""); setPage(1); }}>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold">{stats.total}</div>
              <p className="text-sm text-muted-foreground mt-1">Total Adjustments</p>
            </CardContent>
          </Card>
          <Card className={`shadow-sm cursor-pointer transition-all ${typeFilter === "add" ? "ring-2 ring-success" : "hover:ring-1 hover:ring-success/30"}`} onClick={() => { setTypeFilter(prev => prev === "add" ? "" : "add"); setPage(1); }}>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-success">{stats.additions}</div>
              <p className="text-sm text-muted-foreground mt-1">Additions</p>
            </CardContent>
          </Card>
          <Card className={`shadow-sm cursor-pointer transition-all ${typeFilter === "deduct" ? "ring-2 ring-destructive" : "hover:ring-1 hover:ring-destructive/30"}`} onClick={() => { setTypeFilter(prev => prev === "deduct" ? "" : "deduct"); setPage(1); }}>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-destructive">{stats.deductions}</div>
              <p className="text-sm text-muted-foreground mt-1">Reductions</p>
            </CardContent>
          </Card>
          <Card className={`shadow-sm cursor-pointer transition-all ${typeFilter === "damage" ? "ring-2 ring-warning" : "hover:ring-1 hover:ring-warning/30"}`} onClick={() => { setTypeFilter(prev => prev === "damage" ? "" : "damage"); setPage(1); }}>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-warning">{stats.damages}</div>
              <p className="text-sm text-muted-foreground mt-1">Damages</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex-1 min-w-[180px]">
              <Label className="text-xs text-muted-foreground">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search ingredient..." className="pl-9" />
              </div>
            </div>
            <div className="w-40">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select value={typeFilter || "__all__"} onValueChange={v => { setTypeFilter(v === "__all__" ? "" : v); setPage(1); }}>
                <SelectTrigger><SelectValue placeholder="All Types" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Types</SelectItem>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Inline form panel — togglable, replaces dialog */}
      {showAdd && canAdjust && (
        <Card className="shadow-sm border-primary/30 bg-primary/[0.02]">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">New Stock Adjustment — {selectedWarehouse?.name ?? "—"}</Label>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowAdd(false)}><ChevronUp className="h-4 w-4" /></Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label>Ingredient *</Label>
                <Select value={form.ingredientId || "__none__"} onValueChange={v => setForm(p => ({ ...p, ingredientId: v === "__none__" ? "" : v }))}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Select Ingredient" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select ingredient</SelectItem>
                    {ingredients.map(ig => (
                      <SelectItem key={ig.id} value={ig.id}>
                        {ig.name} — Stock: {stockMap[ig.id] ?? 0} {ig.unit?.name || ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.ingredientId && (
                  <p className="text-xs text-muted-foreground">
                    Current: <span className="font-semibold text-foreground">{stockMap[form.ingredientId] ?? 0} {selectedIng?.unit?.name || ""}</span>
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Type *</Label>
                <div className="flex gap-1.5 flex-wrap h-11 items-center">
                  {(["add", "deduct", "damage", "correction"] as const).map(t => (
                    <Button
                      key={t}
                      variant={form.type === t ? "default" : "outline"}
                      size="sm"
                      onClick={() => setForm(p => ({ ...p, type: t, reason: "" }))}
                      className={cn("h-9", form.type === t ? (
                        t === "add" ? "bg-success hover:bg-success/90 text-white" :
                        t === "deduct" ? "bg-destructive hover:bg-destructive/90 text-white" :
                        t === "damage" ? "bg-warning hover:bg-warning/90 text-white" :
                        "bg-blue-600 hover:bg-blue-700 text-white"
                      ) : "")}
                    >
                      {TYPE_LABELS[t]?.label || t}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Quantity{selectedIng ? ` (${selectedIng.unit?.name || ""})` : ""} *</Label>
                <Input
                  className="h-11"
                  type="number"
                  min={1}
                  value={form.quantity || ""}
                  onChange={e => setForm(p => ({ ...p, quantity: Number(e.target.value) }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Reason</Label>
                <Popover open={reasonOpen} onOpenChange={setReasonOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={reasonOpen} className="w-full justify-between font-normal h-11 whitespace-nowrap text-left overflow-hidden">
                      <span className={cn("truncate", form.reason ? "" : "text-muted-foreground")}>{form.reason || "Select reason..."}</span>
                      <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search or type..." value={form.reason} onValueChange={v => setForm(p => ({ ...p, reason: v }))} />
                      <CommandList>
                        <CommandEmpty>
                          <button type="button" className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent rounded cursor-pointer" onClick={() => setReasonOpen(false)}>
                            Use: "{form.reason}"
                          </button>
                        </CommandEmpty>
                        <CommandGroup heading="Common reasons">
                          {(COMMON_REASONS[form.type] || COMMON_REASONS.correction).map(reason => (
                            <CommandItem key={reason} value={reason} onSelect={() => { setForm(p => ({ ...p, reason })); setReasonOpen(false); }}>
                              <Check className={cn("mr-2 h-4 w-4", form.reason === reason ? "opacity-100" : "opacity-0")} />
                              {reason}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button className="gradient-primary text-primary-foreground" size="sm" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save Adjustment"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Adjustments Table */}
      <Card className="shadow-sm">
        <CardContent>
          {loading ? (
            <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full rounded" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <ArrowUpDown className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" />
              <p className="text-muted-foreground">No adjustments found</p>
              {list.length === 0 && <p className="text-xs text-muted-foreground mt-1.5">Record your first stock adjustment.</p>}
            </div>
          ) : (
            <>
              <div className="rounded-lg border overflow-auto max-h-[calc(100vh-420px)]">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead>SN</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Ingredient</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>By</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.map((a, i) => {
                      const t = TYPE_LABELS[a.type] || { label: a.type, cls: "" };
                      return (
                        <TableRow key={a.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="text-muted-foreground">{(page - 1) * 10 + i + 1}</TableCell>
                          <TableCell className="text-sm">{new Date(a.date).toLocaleDateString()}</TableCell>
                          <TableCell className="font-medium">{a.ingredient?.name || "—"}</TableCell>
                          <TableCell><Badge variant="secondary" className={t.cls}>{t.label}</Badge></TableCell>
                          <TableCell className="text-right font-medium">{a.quantity} {a.ingredient?.unit?.name || ""}</TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{a.reason || "—"}</TableCell>
                          <TableCell className="text-sm">{a.adjustedBy?.name || "—"}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowDetail(a)}>
                              <Eye className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <TablePagination currentPage={page} totalItems={filtered.length} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog — receipt-style like Transfers detail */}
      <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <ArrowUpDown className="h-5 w-5" />
              <span>Stock Adjustment</span>
              {showDetail && (
                <Badge variant="secondary" className={TYPE_LABELS[showDetail.type]?.cls || ""}>
                  {TYPE_LABELS[showDetail.type]?.label || showDetail.type}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {showDetail && (
            <div className="space-y-4">
              {/* Adjusted By + Warehouse cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card className="shadow-sm">
                  <CardHeader className="pb-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Adjusted By</Label>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{showDetail.adjustedBy?.name ?? "—"}</span>
                      {showDetail.adjustedBy?.role && <Badge variant="secondary" className="text-xs">{showDetail.adjustedBy.role}</Badge>}
                    </div>
                    {showDetail.adjustedBy?.outlet && (
                      <div className="text-xs text-muted-foreground">Outlet: <span className="font-medium text-foreground">{showDetail.adjustedBy.outlet.name}</span></div>
                    )}
                    {showDetail.adjustedBy?.phone && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="h-3 w-3" />{showDetail.adjustedBy.phone}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1">Date: {new Date(showDetail.date).toLocaleString()}</div>
                  </CardContent>
                </Card>
                <Card className="shadow-sm">
                  <CardHeader className="pb-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Warehouse</Label>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <div className="font-medium">{showDetail.warehouse?.name ?? selectedWarehouse?.name ?? "—"}</div>
                    {(showDetail.warehouse?.type ?? selectedWarehouse?.type) && (
                      <Badge variant="secondary" className="text-xs">{showDetail.warehouse?.type ?? selectedWarehouse?.type}</Badge>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Adjustment Details Table */}
              <div className="rounded-lg border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead>Ingredient</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">{showDetail.ingredient?.name ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{showDetail.ingredient?.category?.name ?? "—"}</TableCell>
                      <TableCell className="text-sm">{showDetail.ingredient?.unit?.symbol || showDetail.ingredient?.unit?.name || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={TYPE_LABELS[showDetail.type]?.cls || ""}>
                          {TYPE_LABELS[showDetail.type]?.label || showDetail.type}
                        </Badge>
                      </TableCell>
                      <TableCell className={`text-right text-lg font-bold ${showDetail.type === 'add' ? 'text-success' : showDetail.type === 'deduct' || showDetail.type === 'damage' ? 'text-destructive' : 'text-blue-600'}`}>
                        {showDetail.type === 'add' ? '+' : showDetail.type === 'deduct' || showDetail.type === 'damage' ? '-' : '±'}{showDetail.quantity} {showDetail.ingredient?.unit?.symbol || showDetail.ingredient?.unit?.name || ""}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {/* Reason */}
              {showDetail.reason && (
                <div className="rounded-lg border p-3 bg-muted/30">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Reason</Label>
                  <p className="text-sm mt-1">{showDetail.reason}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetail(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StockAdjustments;

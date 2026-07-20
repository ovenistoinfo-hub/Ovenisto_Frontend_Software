import { useState, useEffect, useCallback, useMemo } from "react";
import {
  warehouseService,
  type WarehouseRecord,
  type WarehouseStockRecord,
  type ExpirySummary,
} from "@/services/warehouse.service";
import { inventoryService, type IngredientCategoryRecord } from "@/services/inventory.service";
import { supplierService, type SupplierRecord } from "@/services/supplier.service";
import { demandService } from "@/services/demand.service";
import { challanService } from "@/services/challan.service";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ChefHat, RefreshCw, AlertTriangle, PackageX, Search, XCircle, Clock, ClipboardList, Truck, Trash2, CheckCircle2, ChevronUp, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";

type StockStatus = "EMPTY" | "LOW" | "NORMAL";
type CardFilter = "all" | "low" | "out";

function getStatus(s: WarehouseStockRecord): StockStatus {
  if (Number(s.currentStock) <= 0) return "EMPTY";
  if (Number(s.currentStock) <= Number(s.lowStockLevel)) return "LOW";
  return "NORMAL";
}

const STATUS_STYLE: Record<StockStatus, string> = {
  EMPTY: "bg-destructive/10 text-destructive",
  LOW: "bg-yellow-100 text-yellow-800",
  NORMAL: "bg-success/10 text-success",
};
const STATUS_ORDER: Record<StockStatus, number> = { EMPTY: 0, LOW: 1, NORMAL: 2 };

interface DemandFormItem { ingredientId: string; name: string; unit: string; requestedQty: number; }
interface TransferFormItem { ingredientId: string; name: string; unit: string; qty: number; availableStock: number; }

const KitchenStock = () => {
  const { user } = useAuth();

  // Role-based permissions (same pattern as Branch Stock)
  const userRole = user?.role ?? '';
  const isKitchenMgr = userRole === 'Kitchen Manager';
  const canDemand   = isKitchenMgr;                                       // KM creates demands (kitchen→branch)
  const canTransfer = ['Super Admin', 'Admin', 'Manager', 'Store Manager'].includes(userRole);             // M/A/SM create transfers (branch→kitchen)
  const hasActions  = canDemand || canTransfer;

  const [kitchens, setKitchens] = useState<WarehouseRecord[]>([]);
  const [allWarehouses, setAllWarehouses] = useState<WarehouseRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [stock, setStock] = useState<WarehouseStockRecord[]>([]);
  const [categories, setCategories] = useState<IngredientCategoryRecord[]>([]);
  const [expiry, setExpiry] = useState<ExpirySummary>({ expiredCount: 0, nearExpiryCount: 0, expired: [], nearExpiry: [] });
  const [loading, setLoading] = useState(true);
  const [stockLoading, setStockLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [unitFilter, setUnitFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [expiryView, setExpiryView] = useState<"expired" | "near" | null>(null);
  const [cardFilter, setCardFilter] = useState<CardFilter>("all");

  // Multi-select for batch actions
  const [selectedStockIds, setSelectedStockIds] = useState<Set<string>>(new Set());

  // Create Demand form state (KM)
  const [showCreateDemand, setShowCreateDemand] = useState(false);
  const [demandItems, setDemandItems] = useState<DemandFormItem[]>([]);
  const [demandNotes, setDemandNotes] = useState("");
  const [demandSaving, setDemandSaving] = useState(false);

  // Create Transfer form state (Manager/Admin)
  const [showCreateTransfer, setShowCreateTransfer] = useState(false);
  const [transferItems, setTransferItems] = useState<TransferFormItem[]>([]);
  const [transferNotes, setTransferNotes] = useState("");
  const [transferSaving, setTransferSaving] = useState(false);
  const [branchStockMap, setBranchStockMap] = useState<Record<string, { stock: number; unit: string }>>({});

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Load kitchen warehouses + all warehouses + categories + suppliers on mount
  useEffect(() => {
    Promise.all([
      warehouseService.getAll({ type: "KITCHEN" }),
      warehouseService.getAll(),
      inventoryService.getIngredientCategories(),
      supplierService.getAll(),
    ])
      .then(([kitchenWhs, allWhs, catList, supRes]) => {
        setKitchens(kitchenWhs);
        setAllWarehouses(allWhs);
        setCategories(catList);
        setSuppliers(supRes.data);
        if (kitchenWhs.length > 0) setSelectedId(kitchenWhs[0].id);
        if (kitchenWhs.length === 0) setLoading(false);
      })
      .catch((err: Error) => {
        toast.error(err.message || "Failed to load kitchens");
        setLoading(false);
      });
  }, []);

  // Load stock + expiry when selected kitchen changes
  const fetchStock = useCallback(async (whId: string) => {
    if (!whId) return;
    setStockLoading(true);
    try {
      const [data, exp] = await Promise.all([
        warehouseService.getStock(whId),
        warehouseService.getExpirySummary(whId),
      ]);
      setStock(data);
      setExpiry(exp);
    } catch (err: Error | unknown) {
      toast.error((err as Error).message || "Failed to load stock");
    } finally {
      setStockLoading(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (selectedId) fetchStock(selectedId); }, [selectedId, fetchStock]);

  const handleRefresh = useCallback(async () => {
    if (!selectedId) return;
    setRefreshing(true);
    try {
      const [data, exp] = await Promise.all([
        warehouseService.getStock(selectedId),
        warehouseService.getExpirySummary(selectedId),
      ]);
      setStock(data);
      setExpiry(exp);
    } catch (err: Error | unknown) {
      toast.error((err as Error).message || "Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  }, [selectedId]);

  // ── Demand/Transfer helpers ─────────────────────────────────────
  // Find the BRANCH warehouse for the selected kitchen's outlet (supplying WH for demands)
  const selectedKitchenWH = kitchens.find(k => k.id === selectedId);
  const branchWH = useMemo(() =>
    allWarehouses.find(w => w.type === 'BRANCH' && w.outletId === selectedKitchenWH?.outletId),
    [allWarehouses, selectedKitchenWH]
  );

  // Track which ingredient IDs are in each form
  const demandIngIds = useMemo(() => new Set(demandItems.map(i => i.ingredientId)), [demandItems]);
  const transferIngIds = useMemo(() => new Set(transferItems.map(i => i.ingredientId)), [transferItems]);

  // Fetch branch stock for transfer form — returns the map directly to avoid stale state
  const fetchBranchStock = useCallback(async (): Promise<Record<string, { stock: number; unit: string }>> => {
    if (!branchWH) { setBranchStockMap({}); return {}; }
    try {
      const data = await warehouseService.getStock(branchWH.id);
      const map: Record<string, { stock: number; unit: string }> = {};
      for (const s of data) {
        map[s.ingredient.id] = { stock: Number(s.currentStock), unit: s.ingredient.unit?.symbol || s.ingredient.unit?.name || "" };
      }
      setBranchStockMap(map);
      return map;
    } catch { setBranchStockMap({}); return {}; }
  }, [branchWH]);

  // ── Open demand form (KM) ──
  const openDemandForm = useCallback((preIngId?: string) => {
    const items: DemandFormItem[] = [];
    if (preIngId) {
      const s = stock.find(st => st.ingredient.id === preIngId);
      if (s) {
        items.push({
          ingredientId: s.ingredient.id,
          name: s.ingredient.name,
          unit: s.ingredient.unit?.symbol || s.ingredient.unit?.name || "",
          requestedQty: Math.max(1, Number(s.lowStockLevel) - Number(s.currentStock)),
        });
      }
    }
    setDemandItems(items);
    setDemandNotes("");
    setShowCreateDemand(true);
  }, [stock]);

  // ── Open transfer form (Manager/Admin) ──
  const openTransferForm = useCallback(async (preIngId?: string) => {
    const freshMap = await fetchBranchStock();
    const items: TransferFormItem[] = [];
    if (preIngId) {
      const s = stock.find(st => st.ingredient.id === preIngId);
      if (s) {
        const bStock = freshMap[s.ingredient.id]?.stock ?? 0;
        items.push({
          ingredientId: s.ingredient.id,
          name: s.ingredient.name,
          unit: s.ingredient.unit?.symbol || s.ingredient.unit?.name || "",
          qty: Math.min(Math.max(1, Number(s.lowStockLevel) - Number(s.currentStock)), bStock),
          availableStock: bStock,
        });
      }
    }
    setTransferItems(items);
    setTransferNotes("");
    setShowCreateTransfer(true);
  }, [stock, fetchBranchStock]);

  // ── Toggle per-row ingredient (demand) ──
  const handleToggleDemand = useCallback((s: WarehouseStockRecord) => {
    if (!showCreateDemand) { openDemandForm(s.ingredient.id); return; }
    if (demandIngIds.has(s.ingredient.id)) {
      setDemandItems(prev => prev.filter(i => i.ingredientId !== s.ingredient.id));
    } else {
      setDemandItems(prev => [...prev, {
        ingredientId: s.ingredient.id,
        name: s.ingredient.name,
        unit: s.ingredient.unit?.symbol || s.ingredient.unit?.name || "",
        requestedQty: Math.max(1, Number(s.lowStockLevel) - Number(s.currentStock)),
      }]);
    }
  }, [showCreateDemand, demandIngIds, openDemandForm]);

  // ── Toggle per-row ingredient (transfer) ──
  const handleToggleTransfer = useCallback((s: WarehouseStockRecord) => {
    if (!showCreateTransfer) { openTransferForm(s.ingredient.id); return; }
    if (transferIngIds.has(s.ingredient.id)) {
      setTransferItems(prev => prev.filter(i => i.ingredientId !== s.ingredient.id));
    } else {
      const bStock = branchStockMap[s.ingredient.id]?.stock ?? 0;
      setTransferItems(prev => [...prev, {
        ingredientId: s.ingredient.id,
        name: s.ingredient.name,
        unit: s.ingredient.unit?.symbol || s.ingredient.unit?.name || "",
        qty: Math.min(Math.max(1, Number(s.lowStockLevel) - Number(s.currentStock)), bStock),
        availableStock: bStock,
      }]);
    }
  }, [showCreateTransfer, transferIngIds, openTransferForm, branchStockMap]);

  // ── Batch actions ──
  const handleBatchDemand = useCallback(() => {
    const toAdd: DemandFormItem[] = [];
    selectedStockIds.forEach(stockId => {
      const s = stock.find(st => st.id === stockId);
      if (!s || demandIngIds.has(s.ingredient.id)) return;
      toAdd.push({
        ingredientId: s.ingredient.id,
        name: s.ingredient.name,
        unit: s.ingredient.unit?.symbol || s.ingredient.unit?.name || "",
        requestedQty: Math.max(1, Number(s.lowStockLevel) - Number(s.currentStock)),
      });
    });
    if (!showCreateDemand) { setDemandItems([]); setDemandNotes(""); setShowCreateDemand(true); }
    setDemandItems(prev => [...prev.filter(i => i.ingredientId), ...toAdd]);
    setSelectedStockIds(new Set());
  }, [selectedStockIds, stock, demandIngIds, showCreateDemand]);

  const handleBatchTransfer = useCallback(async () => {
    let map = branchStockMap;
    if (!showCreateTransfer) {
      map = await fetchBranchStock();
      setTransferItems([]); setTransferNotes(""); setShowCreateTransfer(true);
    }
    const toAdd: TransferFormItem[] = [];
    selectedStockIds.forEach(stockId => {
      const s = stock.find(st => st.id === stockId);
      if (!s || transferIngIds.has(s.ingredient.id)) return;
      const bStock = map[s.ingredient.id]?.stock ?? 0;
      toAdd.push({
        ingredientId: s.ingredient.id,
        name: s.ingredient.name,
        unit: s.ingredient.unit?.symbol || s.ingredient.unit?.name || "",
        qty: Math.min(Math.max(1, Number(s.lowStockLevel) - Number(s.currentStock)), bStock),
        availableStock: bStock,
      });
    });
    setTransferItems(prev => [...prev.filter(i => i.ingredientId), ...toAdd]);
    setSelectedStockIds(new Set());
  }, [selectedStockIds, stock, transferIngIds, showCreateTransfer, fetchBranchStock, branchStockMap]);

  // ── Save demand ──
  const handleSaveDemand = useCallback(async () => {
    if (!selectedId || !branchWH) { toast.error("No branch warehouse found for this kitchen"); return; }
    const validItems = demandItems.filter(i => i.ingredientId && i.requestedQty > 0);
    if (validItems.length === 0) { toast.error("Add at least one item"); return; }
    setDemandSaving(true);
    try {
      await demandService.create({
        requestingWHId: selectedId,
        supplyingWHId: branchWH.id,
        notes: demandNotes || undefined,
        items: validItems.map(i => ({ ingredientId: i.ingredientId, requestedQty: i.requestedQty })),
      });
      toast.success("Demand created — waiting for approval");
      setShowCreateDemand(false);
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to create demand");
    } finally {
      setDemandSaving(false);
    }
  }, [selectedId, branchWH, demandItems, demandNotes]);

  // ── Save transfer ──
  const handleSaveTransfer = useCallback(async () => {
    if (!selectedId || !branchWH) { toast.error("No branch warehouse found"); return; }
    const validItems = transferItems.filter(i => i.ingredientId && i.qty > 0);
    if (validItems.length === 0) { toast.error("Add at least one item"); return; }
    setTransferSaving(true);
    try {
      await challanService.create({
        fromWarehouseId: branchWH.id,
        toWarehouseId: selectedId,
        notes: transferNotes || undefined,
        items: validItems.map(i => ({ ingredientId: i.ingredientId, qty: i.qty })),
      });
      toast.success("Transfer challan created");
      setShowCreateTransfer(false);
      fetchStock(selectedId);
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to create transfer");
    } finally {
      setTransferSaving(false);
    }
  }, [selectedId, branchWH, transferItems, transferNotes, fetchStock]);

  // ── Add low stock items to demand form ──
  const addLowStockToDemand = useCallback(() => {
    const toAdd: DemandFormItem[] = [];
    stock.forEach(s => {
      if (demandIngIds.has(s.ingredient.id)) return;
      if (Number(s.currentStock) > 0 && Number(s.currentStock) > Number(s.lowStockLevel)) return;
      toAdd.push({
        ingredientId: s.ingredient.id,
        name: s.ingredient.name,
        unit: s.ingredient.unit?.symbol || s.ingredient.unit?.name || "",
        requestedQty: Math.max(1, Math.round(Number(s.lowStockLevel) - Number(s.currentStock))),
      });
    });
    setDemandItems(prev => [...prev, ...toAdd]);
    toast.success(`${toAdd.length} low stock item${toAdd.length !== 1 ? "s" : ""} added`);
  }, [stock, demandIngIds]);

  // ── Add low stock items to transfer form ──
  const addLowStockToTransfer = useCallback(() => {
    const toAdd: TransferFormItem[] = [];
    stock.forEach(s => {
      if (transferIngIds.has(s.ingredient.id)) return;
      if (Number(s.currentStock) > 0 && Number(s.currentStock) > Number(s.lowStockLevel)) return;
      const bStock = branchStockMap[s.ingredient.id]?.stock ?? 0;
      const deficit = Math.max(1, Math.round(Number(s.lowStockLevel) - Number(s.currentStock)));
      const qty = Math.min(deficit, bStock);
      if (qty <= 0) return;
      toAdd.push({
        ingredientId: s.ingredient.id,
        name: s.ingredient.name,
        unit: s.ingredient.unit?.symbol || s.ingredient.unit?.name || "",
        qty,
        availableStock: bStock,
      });
    });
    setTransferItems(prev => [...prev, ...toAdd]);
    toast.success(`${toAdd.length} low stock item${toAdd.length !== 1 ? "s" : ""} added`);
  }, [stock, transferIngIds, branchStockMap]);

  // Unique brands and units for filter dropdowns
  const uniqueBrands = useMemo(() => [...new Set(stock.map(s => s.ingredient.brand).filter(Boolean))] as string[], [stock]);
  const uniqueUnits = useMemo(() => {
    const map = new Map<string, string>();
    stock.forEach(s => { if (s.ingredient.unit) map.set(s.ingredient.unit.id, s.ingredient.unit.name); });
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [stock]);

  // Filtered + sorted stock (memoized)
  const filteredStock = useMemo(() => {
    let items = stock;
    if (cardFilter === "low") items = items.filter(s => Number(s.currentStock) > 0 && Number(s.currentStock) <= Number(s.lowStockLevel));
    if (cardFilter === "out") items = items.filter(s => Number(s.currentStock) <= 0);
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      items = items.filter(s => s.ingredient.name.toLowerCase().includes(q) || (s.ingredient.brand ?? "").toLowerCase().includes(q));
    }
    if (categoryFilter) items = items.filter(s => s.ingredient.category?.id === categoryFilter);
    if (unitFilter) items = items.filter(s => s.ingredient.unit?.id === unitFilter);
    if (brandFilter) items = items.filter(s => s.ingredient.brand === brandFilter);
    if (vendorFilter) items = items.filter(s => s.ingredient.supplierId === vendorFilter);
    return [...items].sort((a, b) => {
      const diff = STATUS_ORDER[getStatus(a)] - STATUS_ORDER[getStatus(b)];
      if (diff !== 0) return diff;
      return a.ingredient.name.localeCompare(b.ingredient.name);
    });
  }, [stock, cardFilter, debouncedSearch, categoryFilter, unitFilter, brandFilter, vendorFilter]);

  // Stats (memoized)
  const stats = useMemo(() => ({
    total: stock.length,
    low: stock.filter(s => Number(s.currentStock) > 0 && Number(s.currentStock) <= Number(s.lowStockLevel)).length,
    empty: stock.filter(s => Number(s.currentStock) <= 0).length,
    totalValue: stock.reduce((sum, s) => sum + Number(s.currentStock) * Number(s.ingredient.purchasePrice ?? 0), 0),
  }), [stock]);

  const isLoading = loading || stockLoading;
  const toggleCard = (filter: CardFilter) => setCardFilter(prev => prev === filter ? "all" : filter);

  if (loading && kitchens.length === 0) return <div className="space-y-6"><Skeleton className="h-10 w-full rounded-lg" /><div className="grid grid-cols-2 sm:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg mt-2" />)}</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<ChefHat className="h-5 w-5" />}
        title="Kitchen Stock"
        subtitle="Live ingredient levels per kitchen warehouse"
        actions={
          <div className="flex items-center gap-2">
            {kitchens.length > 1 && (
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger className="w-56"><SelectValue placeholder="Select kitchen" /></SelectTrigger>
                <SelectContent>{kitchens.map(k => <SelectItem key={k.id} value={k.id}>{k.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />Refresh
            </Button>
            {canDemand && selectedId && (
              <Button variant="outline" size="sm" onClick={() => { if (showCreateDemand) { setShowCreateDemand(false); } else { openDemandForm(); } }}>
                {showCreateDemand ? <><X className="h-4 w-4 mr-1.5" />Close</> : <><ClipboardList className="h-4 w-4 mr-1.5" />Create Demand</>}
              </Button>
            )}
            {canTransfer && selectedId && branchWH && (
              <Button className="gradient-primary text-primary-foreground" size="sm" onClick={() => { if (showCreateTransfer) { setShowCreateTransfer(false); } else { openTransferForm(); } }}>
                {showCreateTransfer ? <><X className="h-4 w-4 mr-1.5" />Close</> : <><Truck className="h-4 w-4 mr-1.5" />New Transfer</>}
              </Button>
            )}
          </div>
        }
      />

      {!loading && kitchens.length === 0 && (
        <Card className="shadow-sm"><CardContent className="py-12 text-center">
          <ChefHat className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" />
          <p className="text-muted-foreground">No kitchen warehouses found.</p>
          <p className="text-xs text-muted-foreground mt-1">Create a KITCHEN type warehouse in Settings → Warehouses and link it to an outlet.</p>
        </CardContent></Card>
      )}

      {kitchens.length > 0 && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card
              className={`shadow-sm cursor-pointer transition-all ${cardFilter === "low" ? "ring-2 ring-yellow-500" : "hover:ring-1 hover:ring-yellow-300"}`}
              onClick={() => toggleCard("low")}
            >
              <CardContent className="pt-6">
                <div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-yellow-500" /><div className="text-3xl font-bold text-yellow-600">{isLoading ? "—" : stats.low}</div></div>
                <p className="text-sm text-muted-foreground mt-1">Low Stock</p>
              </CardContent>
            </Card>
            <Card
              className={`shadow-sm cursor-pointer transition-all ${cardFilter === "out" ? "ring-2 ring-destructive" : "hover:ring-1 hover:ring-destructive/30"}`}
              onClick={() => toggleCard("out")}
            >
              <CardContent className="pt-6">
                <div className="flex items-center gap-2"><PackageX className="h-5 w-5 text-destructive" /><div className="text-3xl font-bold text-destructive">{isLoading ? "—" : stats.empty}</div></div>
                <p className="text-sm text-muted-foreground mt-1">Empty / Negative</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm border-destructive/30 cursor-pointer hover:ring-1 hover:ring-destructive/50 transition-all" onClick={() => expiry.expiredCount > 0 && setExpiryView("expired")}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2"><XCircle className="h-5 w-5 text-destructive" /><div className="text-3xl font-bold text-destructive">{isLoading ? "—" : expiry.expiredCount}</div></div>
                <p className="text-sm text-muted-foreground mt-1">Expired Today</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm border-orange-500/30 cursor-pointer hover:ring-1 hover:ring-orange-500/50 transition-all" onClick={() => expiry.nearExpiryCount > 0 && setExpiryView("near")}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2"><Clock className="h-5 w-5 text-orange-500" /><div className="text-3xl font-bold text-orange-500">{isLoading ? "—" : expiry.nearExpiryCount}</div></div>
                <p className="text-sm text-muted-foreground mt-1">Near Expiry (7d)</p>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card className="shadow-sm"><CardHeader className="pb-3">
            <div className="flex gap-3 items-end flex-wrap">
              <div className="flex-1 min-w-[180px]"><Label className="text-xs text-muted-foreground">Search</Label><div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or brand..." className="pl-9" /></div></div>
              <div className="w-40"><Label className="text-xs text-muted-foreground">Category</Label><Select value={categoryFilter || "__all__"} onValueChange={v => setCategoryFilter(v === "__all__" ? "" : v)}><SelectTrigger><SelectValue placeholder="All" /></SelectTrigger><SelectContent><SelectItem value="__all__">All Categories</SelectItem>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="w-44"><Label className="text-xs text-muted-foreground">Vendor</Label><Select value={vendorFilter || "__all__"} onValueChange={v => setVendorFilter(v === "__all__" ? "" : v)}><SelectTrigger><SelectValue placeholder="All" /></SelectTrigger><SelectContent><SelectItem value="__all__">All Vendors</SelectItem>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="w-36"><Label className="text-xs text-muted-foreground">Unit</Label><Select value={unitFilter || "__all__"} onValueChange={v => setUnitFilter(v === "__all__" ? "" : v)}><SelectTrigger><SelectValue placeholder="All" /></SelectTrigger><SelectContent><SelectItem value="__all__">All Units</SelectItem>{uniqueUnits.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></div>
              {uniqueBrands.length > 0 && (
                <div className="w-40"><Label className="text-xs text-muted-foreground">Brand</Label><Select value={brandFilter || "__all__"} onValueChange={v => setBrandFilter(v === "__all__" ? "" : v)}><SelectTrigger><SelectValue placeholder="All" /></SelectTrigger><SelectContent><SelectItem value="__all__">All Brands</SelectItem>{uniqueBrands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent></Select></div>
              )}
            </div>
          </CardHeader></Card>

          {/* ── Inline Create Demand panel (KM) ── */}
          {showCreateDemand && canDemand && (
            <Card className="shadow-sm border-orange-400/30 bg-orange-50/[0.02] dark:bg-orange-950/[0.02]">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">New Stock Demand</Label>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowCreateDemand(false)}><ChevronUp className="h-4 w-4" /></Button>
              </CardHeader>
              <CardContent className="space-y-5">
                <Card className="shadow-sm">
                  <CardHeader className="pb-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Demand Details</Label>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Requesting Kitchen *</Label>
                        <Input className="h-11" value={selectedKitchenWH?.name ?? "—"} disabled />
                        <p className="text-xs text-muted-foreground">Requesting from → {branchWH?.name ?? "Branch warehouse"}</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Supplying Warehouse</Label>
                        <Input className="h-11" value={branchWH?.name ?? "No branch found"} disabled />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Notes (optional)</Label>
                      <Textarea placeholder="Any notes about this demand..." value={demandNotes} onChange={e => setDemandNotes(e.target.value)} className="min-h-16" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="shadow-sm">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Items ({demandItems.length})</Label>
                    <Button variant="outline" size="sm" className="h-8 min-h-[32px]" onClick={addLowStockToDemand}>
                      <AlertTriangle className="h-3 w-3 mr-1" />Add Low Stock
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {demandItems.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-sm">Click "Add Low Stock" or use the row buttons in the stock table to add items</div>
                    ) : (
                      <div className="space-y-2">
                        {demandItems.map((item, idx) => (
                          <div key={idx} className="border rounded-lg p-3 space-y-2 border-l-2 border-l-orange-400/60 bg-orange-50/30 dark:bg-orange-950/10">
                            <div className="flex items-center justify-between gap-2 min-w-0">
                              <span className="font-medium text-sm truncate">{item.name}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                <Badge variant="secondary" className="text-xs">Kitchen: {Number(stock.find(s => s.ingredient.id === item.ingredientId)?.currentStock ?? 0).toFixed(1)} {item.unit}</Badge>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDemandItems(prev => prev.filter((_, i) => i !== idx))}><Trash2 className="h-3.5 w-3.5" /></Button>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Requested Qty ({item.unit}) *</Label>
                                <Input className="h-10 text-sm" type="number" min={1} value={item.requestedQty || ""} onChange={e => setDemandItems(prev => prev.map((it, i) => i === idx ? { ...it, requestedQty: Number(e.target.value) } : it))} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Low Stock Level</Label>
                                <div className="h-10 flex items-center px-3 text-sm rounded-md border bg-muted/50 text-muted-foreground">{Number(stock.find(s => s.ingredient.id === item.ingredientId)?.lowStockLevel ?? 0).toFixed(1)} {item.unit}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => setShowCreateDemand(false)}>Cancel</Button>
                  <Button className="gradient-primary text-primary-foreground" size="sm" onClick={handleSaveDemand} disabled={demandSaving}>
                    <ClipboardList className="h-4 w-4 mr-1.5" />{demandSaving ? "Creating..." : "Create Demand"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Inline Create Transfer panel (Manager/Admin) ── */}
          {showCreateTransfer && canTransfer && (
            <Card className="shadow-sm border-primary/30 bg-primary/[0.02]">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">New Transfer to Kitchen</Label>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowCreateTransfer(false)}><ChevronUp className="h-4 w-4" /></Button>
              </CardHeader>
              <CardContent className="space-y-5">
                <Card className="shadow-sm">
                  <CardHeader className="pb-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Transfer Details</Label>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>From (Branch Stock)</Label>
                        <Input className="h-11" value={branchWH?.name ?? "No branch found"} disabled />
                      </div>
                      <div className="space-y-1.5">
                        <Label>To (Kitchen) *</Label>
                        <Input className="h-11" value={selectedKitchenWH?.name ?? "—"} disabled />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Notes (optional)</Label>
                      <Textarea placeholder="Any notes about this transfer..." value={transferNotes} onChange={e => setTransferNotes(e.target.value)} className="min-h-16" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="shadow-sm">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Items ({transferItems.length})</Label>
                    <Button variant="outline" size="sm" className="h-8 min-h-[32px]" onClick={addLowStockToTransfer}>
                      <AlertTriangle className="h-3 w-3 mr-1" />Add Low Stock
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {transferItems.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-sm">Click "Add Low Stock" or use the row buttons in the stock table to add items</div>
                    ) : (
                      <div className="space-y-2">
                        {transferItems.map((item, idx) => (
                          <div key={idx} className="border rounded-lg p-3 space-y-2 border-l-2 border-l-primary/40 bg-primary/5">
                            <div className="flex items-center justify-between gap-2 min-w-0">
                              <span className="font-medium text-sm truncate">{item.name}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                <Badge variant="secondary" className="text-xs">Kitchen: {Number(stock.find(s => s.ingredient.id === item.ingredientId)?.currentStock ?? 0).toFixed(1)} {item.unit}</Badge>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setTransferItems(prev => prev.filter((_, i) => i !== idx))}><Trash2 className="h-3.5 w-3.5" /></Button>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Available in Branch</Label>
                                <div className={`h-10 flex items-center px-3 text-sm font-semibold rounded-md border bg-muted/50 ${item.availableStock <= 0 ? "text-destructive" : "text-blue-600"}`}>{item.availableStock} {item.unit}</div>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Transfer Qty ({item.unit}) *</Label>
                                <Input className={`h-10 text-sm ${item.qty > item.availableStock ? "border-destructive text-destructive" : ""}`} type="number" min={0} max={item.availableStock} value={item.qty || ""} onChange={e => { const val = Math.min(Number(e.target.value), item.availableStock); setTransferItems(prev => prev.map((it, i) => i === idx ? { ...it, qty: Math.max(0, val) } : it)); }} />
                              </div>
                              <div className="space-y-1 col-span-2 sm:col-span-1">
                                <Label className="text-xs text-muted-foreground">Remaining in Branch</Label>
                                <div className={`h-10 flex items-center px-3 text-sm font-semibold rounded-md border bg-muted/50 ${(item.availableStock - item.qty) <= 0 ? "text-warning" : "text-success"}`}>{Math.max(0, item.availableStock - item.qty)} {item.unit}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => setShowCreateTransfer(false)}>Cancel</Button>
                  <Button className="gradient-primary text-primary-foreground" size="sm" onClick={handleSaveTransfer} disabled={transferSaving}>
                    <Truck className="h-4 w-4 mr-1.5" />{transferSaving ? "Creating..." : "Create Transfer"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stock Table */}
          <Card className="shadow-sm"><CardContent>
            {/* Batch action bar */}
            {hasActions && selectedStockIds.size > 0 && (
              <div className="flex items-center gap-2 mb-3 p-2 bg-muted/50 rounded-lg">
                <span className="text-sm font-medium">{selectedStockIds.size} selected</span>
                {canDemand && (
                  <Button size="sm" variant="outline" onClick={handleBatchDemand}>
                    <ClipboardList className="h-3.5 w-3.5 mr-1.5" />Add to Demand
                  </Button>
                )}
                {canTransfer && (
                  <Button size="sm" className="gradient-primary text-primary-foreground" onClick={handleBatchTransfer}>
                    <Truck className="h-3.5 w-3.5 mr-1.5" />Add to Transfer
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setSelectedStockIds(new Set())}>Clear</Button>
              </div>
            )}

            {stockLoading ? (
              <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full rounded" />)}</div>
            ) : filteredStock.length === 0 ? (
              <div className="text-center py-10">
                <ChefHat className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-30" />
                <p className="text-sm text-muted-foreground">{stock.length === 0 ? "No stock records yet." : "No items match your filters."}</p>
                {stock.length === 0 && <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">Stock will appear here automatically when Transfer Challans are received into this kitchen warehouse.</p>}
              </div>
            ) : (
              <div className="rounded-lg border overflow-auto max-h-[calc(100vh-420px)]">
                <Table>
                  <TableHeader className="sticky top-0 z-20 bg-card">
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      {hasActions && <TableHead className="w-10"><Checkbox checked={selectedStockIds.size === filteredStock.length && filteredStock.length > 0} onCheckedChange={(v) => setSelectedStockIds(v ? new Set(filteredStock.map(s => s.id)) : new Set())} /></TableHead>}
                      <TableHead className="w-12">SN</TableHead><TableHead>Ingredient</TableHead><TableHead>Vendor</TableHead><TableHead>Brand</TableHead><TableHead>Category</TableHead><TableHead>Unit</TableHead>
                      <TableHead className="text-right">Purchase Price</TableHead>
                      <TableHead className="text-right">Current Stock</TableHead><TableHead className="text-right">Low Stock Level</TableHead>
                      <TableHead>Status</TableHead>
                      {hasActions && <TableHead>Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStock.map((s, i) => {
                      const status = getStatus(s);
                      const inDemand = demandIngIds.has(s.ingredient.id);
                      const inTransfer = transferIngIds.has(s.ingredient.id);
                      return (
                        <TableRow key={s.id} className={cn("hover:bg-muted/30 transition-colors", (inDemand || inTransfer) && "bg-primary/5")}>
                          {hasActions && (
                            <TableCell>
                              <Checkbox
                                checked={selectedStockIds.has(s.id)}
                                onCheckedChange={(v) => {
                                  const next = new Set(selectedStockIds);
                                  v ? next.add(s.id) : next.delete(s.id);
                                  setSelectedStockIds(next);
                                }}
                              />
                            </TableCell>
                          )}
                          <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="font-medium">{s.ingredient.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {(user?.role === "Super Admin" || s.ingredient.supplier?.outletId === user?.outletId)
                              ? (s.ingredient.supplier?.name || "—")
                              : "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{s.ingredient.brand ?? "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{s.ingredient.category?.name ?? "—"}</TableCell>
                          <TableCell className="text-sm">{s.ingredient.unit?.symbol || s.ingredient.unit?.name || "—"}</TableCell>
                          <TableCell className="text-right text-sm">{s.ingredient.purchasePrice != null ? `Rs. ${Number(s.ingredient.purchasePrice).toFixed(2)}` : "—"}</TableCell>
                          <TableCell className={`text-right font-medium ${Number(s.currentStock) <= 0 ? "text-destructive" : status === "LOW" ? "text-yellow-600" : ""}`}>
                            {Number(s.currentStock).toFixed(3)}
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">{Number(s.lowStockLevel).toFixed(3)}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={STATUS_STYLE[status]}>
                              {status === "EMPTY" ? "Empty" : status === "LOW" ? "Low" : "Normal"}
                            </Badge>
                          </TableCell>
                          {hasActions && (
                            <TableCell>
                              <div className="flex gap-1">
                                {canDemand && (
                                  <Button
                                    size="sm"
                                    variant={inDemand ? "default" : "outline"}
                                    className={cn("h-7 text-xs px-2", inDemand ? "bg-primary text-primary-foreground" : status === "EMPTY" ? "bg-destructive text-destructive-foreground" : status === "LOW" ? "bg-yellow-500 text-white" : "")}
                                    onClick={() => handleToggleDemand(s)}
                                  >
                                    {inDemand ? <><CheckCircle2 className="h-3 w-3 mr-1" />Added</> : <><ClipboardList className="h-3 w-3 mr-1" />Demand</>}
                                  </Button>
                                )}
                                {canTransfer && (
                                  <Button
                                    size="sm"
                                    variant={inTransfer ? "default" : "outline"}
                                    className={cn("h-7 text-xs px-2", inTransfer ? "bg-primary text-primary-foreground" : status !== "NORMAL" ? "border-orange-400 text-orange-600" : "")}
                                    onClick={() => handleToggleTransfer(s)}
                                  >
                                    {inTransfer ? <><CheckCircle2 className="h-3 w-3 mr-1" />Added</> : <><Truck className="h-3 w-3 mr-1" />Transfer</>}
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent></Card>
        </>
      )}
      {/* Expiry Detail Dialog */}
      <Dialog open={!!expiryView} onOpenChange={() => setExpiryView(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {expiryView === "expired" ? <><XCircle className="h-5 w-5 text-destructive" /> Expired Today</> : <><Clock className="h-5 w-5 text-orange-500" /> Near Expiry Items (within 7 days)</>}
            </DialogTitle>
          </DialogHeader>
          {(() => {
            const groups = expiryView === "expired" ? expiry.expired : expiry.nearExpiry;
            if (groups.length === 0) return <p className="text-center py-8 text-muted-foreground">No items</p>;
            const isExpiredView = expiryView === "expired";
            return (
              <div className="space-y-4">
                {groups.map((g, gi) => (
                  <Card key={g.ingredientId} className={`shadow-sm ${isExpiredView ? "border-destructive/30" : "border-orange-500/30"}`}>
                    <CardContent className="pt-5 pb-4">
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div>
                          <div className="text-lg font-bold">{gi + 1}. {g.ingredientName}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{g.brand ? `${g.brand} · ` : ""}{g.unit || "—"}</div>
                        </div>
                        <Badge variant="secondary" className={`text-sm px-3 py-1 ${isExpiredView ? "bg-destructive/10 text-destructive" : "bg-orange-100 text-orange-800"}`}>
                          {g.affectedQty} {g.unit} {isExpiredView ? "expired" : "expiring soon"}
                        </Badge>
                      </div>
                      <div className="rounded-lg bg-muted/30 p-3 mb-4">
                        <div className="flex items-center gap-6 text-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-muted-foreground/40" />
                            <span className="text-muted-foreground">Total in Stock:</span>
                            <span className="font-bold">{g.totalCurrentStock} {g.unit}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${isExpiredView ? "bg-destructive" : "bg-orange-500"}`} />
                            <span className="text-muted-foreground">{isExpiredView ? "Expired Today:" : "Expiring:"}</span>
                            <span className={`font-bold ${isExpiredView ? "text-destructive" : "text-orange-500"}`}>{g.affectedQty} {g.unit}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2">Batch Breakdown</div>
                      <div className="space-y-2">
                        {g.batches.map(b => {
                          const daysLeft = Math.ceil((new Date(b.expiryDate).getTime() - Date.now()) / 86400000);
                          return (
                            <div key={b.id} className={`flex items-center justify-between rounded-lg border p-3 ${daysLeft < 0 ? "border-destructive/30 bg-destructive/5" : "border-orange-500/30 bg-orange-500/5"}`}>
                              <div className="flex items-center gap-4">
                                <div className={`text-2xl font-bold ${daysLeft < 0 ? "text-destructive" : "text-orange-500"}`}>{b.remainingQty}<span className="text-xs ml-1 font-normal">{g.unit}</span></div>
                                <div>
                                  <div className="text-sm font-medium">{daysLeft < 0 ? `Expired ${Math.abs(daysLeft)} days ago` : daysLeft === 0 ? "Expires today!" : `Expires in ${daysLeft} day${daysLeft > 1 ? "s" : ""}`}</div>
                                  <div className="text-xs text-muted-foreground">Expiry: {b.expiryDate} · Purchased: {b.purchasedAt}</div>
                                </div>
                              </div>
                              <Badge variant="secondary" className={daysLeft < 0 ? "bg-destructive/10 text-destructive" : "bg-orange-100 text-orange-800"}>
                                {daysLeft < 0 ? "Expired" : `${daysLeft}d left`}
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpiryView(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default KitchenStock;

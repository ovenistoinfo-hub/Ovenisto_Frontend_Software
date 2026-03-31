import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useData } from "@/contexts/DataContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Search, RefreshCw, AlertTriangle, PackageX, Clock, XCircle } from "lucide-react";
import { toast } from "sonner";
import { warehouseService, type WarehouseRecord, type WarehouseStockRecord, type ExpirySummary } from "@/services/warehouse.service";
import { inventoryService, type IngredientCategoryRecord } from "@/services/inventory.service";
import { PageHeader } from "@/components/ui/page-header";

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

const Warehouses = () => {
  const { user } = useAuth();
  const { settings } = useData();
  const currency = settings.currency || "Rs.";
  const isSuperAdmin = user?.role === "Super Admin";
  // Admin sees only their outlet (backend scopes), Super Admin sees all

  const [warehouses, setWarehouses] = useState<WarehouseRecord[]>([]);
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
  const [cardFilter, setCardFilter] = useState<CardFilter>("all");
  const [expiryView, setExpiryView] = useState<"expired" | "near" | null>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Load warehouses + categories
  useEffect(() => {
    Promise.all([warehouseService.getAll(), inventoryService.getIngredientCategories()])
      .then(([whList, catList]) => {
        // Super Admin sees MAIN + BRANCH, others see only BRANCH
        const filtered = isSuperAdmin
          ? whList.filter(w => w.type !== "KITCHEN")
          : whList.filter(w => w.type === "BRANCH");
        setWarehouses(filtered);
        setCategories(catList);
        if (filtered.length > 0) {
          setSelectedId(filtered[0].id);
        }
      })
      .catch((err: Error) => toast.error(err.message || "Failed to load data"))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load stock + expiry when warehouse changes
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
    }
  }, []);

  useEffect(() => { if (selectedId) fetchStock(selectedId); }, [selectedId, fetchStock]);

  const handleRefresh = async () => {
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
  };

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
    return [...items].sort((a, b) => {
      const diff = STATUS_ORDER[getStatus(a)] - STATUS_ORDER[getStatus(b)];
      if (diff !== 0) return diff;
      return a.ingredient.name.localeCompare(b.ingredient.name);
    });
  }, [stock, cardFilter, debouncedSearch, categoryFilter, unitFilter, brandFilter]);

  // Stats (memoized)
  const stats = useMemo(() => ({
    total: stock.length,
    low: stock.filter(s => Number(s.currentStock) > 0 && Number(s.currentStock) <= Number(s.lowStockLevel)).length,
    out: stock.filter(s => Number(s.currentStock) <= 0).length,
    totalValue: stock.reduce((sum, s) => sum + Number(s.currentStock) * Number(s.ingredient.purchasePrice ?? 0), 0),
  }), [stock]);

  const selectedWH = warehouses.find(w => w.id === selectedId);
  const isLoading = loading || stockLoading;

  const toggleCard = (filter: CardFilter) => setCardFilter(prev => prev === filter ? "all" : filter);

  if (loading) return <div className="space-y-6"><Skeleton className="h-10 w-full rounded-lg" /><div className="grid grid-cols-2 sm:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div><Skeleton className="h-10 w-full rounded-lg" />{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg mt-2" />)}</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Building2 className="h-5 w-5" />}
        title="Branch Stock"
        subtitle="Warehouse stock levels"
        actions={
          <div className="flex items-center gap-2">
            {warehouses.length > 1 && (
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger className="w-56"><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                <SelectContent>
                  {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name} ({w.type})</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />Refresh
            </Button>
          </div>
        }
      />

      {warehouses.length === 0 ? (
        <Card className="shadow-sm"><CardContent className="py-12 text-center">
          <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" />
          <p className="text-muted-foreground">No branch warehouses found.</p>
        </CardContent></Card>
      ) : (
        <>
          {/* Stats Cards */}
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
                <div className="flex items-center gap-2"><PackageX className="h-5 w-5 text-destructive" /><div className="text-3xl font-bold text-destructive">{isLoading ? "—" : stats.out}</div></div>
                <p className="text-sm text-muted-foreground mt-1">Out of Stock</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm border-destructive/30 cursor-pointer hover:ring-1 hover:ring-destructive/50 transition-all" onClick={() => expiry.expiredCount > 0 && setExpiryView("expired")}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2"><XCircle className="h-5 w-5 text-destructive" /><div className="text-3xl font-bold text-destructive">{isLoading ? "—" : expiry.expiredCount}</div></div>
                <p className="text-sm text-muted-foreground mt-1">Expired Items</p>
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
              <div className="w-36"><Label className="text-xs text-muted-foreground">Unit</Label><Select value={unitFilter || "__all__"} onValueChange={v => setUnitFilter(v === "__all__" ? "" : v)}><SelectTrigger><SelectValue placeholder="All" /></SelectTrigger><SelectContent><SelectItem value="__all__">All Units</SelectItem>{uniqueUnits.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></div>
              {uniqueBrands.length > 0 && (
                <div className="w-40"><Label className="text-xs text-muted-foreground">Brand</Label><Select value={brandFilter || "__all__"} onValueChange={v => setBrandFilter(v === "__all__" ? "" : v)}><SelectTrigger><SelectValue placeholder="All" /></SelectTrigger><SelectContent><SelectItem value="__all__">All Brands</SelectItem>{uniqueBrands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent></Select></div>
              )}
            </div>
          </CardHeader></Card>

          {/* Stock Table */}
          <Card className="shadow-sm"><CardContent>
            {stockLoading ? (
              <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full rounded" />)}</div>
            ) : filteredStock.length === 0 ? (
              <div className="text-center py-10">
                <Building2 className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-30" />
                <p className="text-sm text-muted-foreground">{stock.length === 0 ? "No stock records yet." : "No items match your filters."}</p>
                {stock.length === 0 && <p className="text-xs text-muted-foreground mt-1">Stock will appear here when purchases or transfers are assigned to this warehouse.</p>}
              </div>
            ) : (
              <div className="rounded-lg border overflow-auto max-h-[calc(100vh-420px)]">
                <Table>
                  <TableHeader className="sticky top-0 z-20 bg-card">
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="w-12">SN</TableHead><TableHead>Ingredient</TableHead><TableHead>Brand</TableHead><TableHead>Category</TableHead><TableHead>Unit</TableHead>
                      <TableHead className="text-right">Current Stock</TableHead><TableHead className="text-right">Low Stock Level</TableHead>
                      <TableHead>Status</TableHead><TableHead className="text-right">Purchase Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStock.map((s, i) => {
                      const status = getStatus(s);
                      return (
                        <TableRow key={s.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="font-medium">{s.ingredient.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{s.ingredient.brand ?? "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{s.ingredient.category?.name ?? "—"}</TableCell>
                          <TableCell className="text-sm">{s.ingredient.unit?.symbol || s.ingredient.unit?.name || "—"}</TableCell>
                          <TableCell className={`text-right font-medium ${Number(s.currentStock) <= 0 ? "text-destructive" : status === "LOW" ? "text-yellow-600" : ""}`}>
                            {Number(s.currentStock).toFixed(3)}
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">{Number(s.lowStockLevel).toFixed(3)}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={STATUS_STYLE[status]}>
                              {status === "EMPTY" ? "Empty" : status === "LOW" ? "Low" : "Normal"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-sm">{s.ingredient.purchasePrice != null ? `${currency} ${Number(s.ingredient.purchasePrice).toLocaleString()}` : "—"}</TableCell>
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
              {expiryView === "expired" ? <><XCircle className="h-5 w-5 text-destructive" /> Expired Items</> : <><Clock className="h-5 w-5 text-orange-500" /> Near Expiry Items (within 7 days)</>}
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
                      {/* Ingredient Header */}
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div>
                          <div className="text-lg font-bold">{gi + 1}. {g.ingredientName}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{g.brand ? `${g.brand} · ` : ""}{g.unit || "—"}</div>
                        </div>
                        <Badge variant="secondary" className={`text-sm px-3 py-1 ${isExpiredView ? "bg-destructive/10 text-destructive" : "bg-orange-100 text-orange-800"}`}>
                          {g.affectedQty} {g.unit} {isExpiredView ? "expired" : "expiring soon"}
                        </Badge>
                      </div>

                      {/* Stock Summary Bar */}
                      <div className="rounded-lg bg-muted/30 p-3 mb-4">
                        <div className="flex items-center gap-6 text-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-muted-foreground/40" />
                            <span className="text-muted-foreground">Total in Stock:</span>
                            <span className="font-bold">{g.totalCurrentStock} {g.unit}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${isExpiredView ? "bg-destructive" : "bg-orange-500"}`} />
                            <span className="text-muted-foreground">{isExpiredView ? "Expired:" : "Expiring:"}</span>
                            <span className={`font-bold ${isExpiredView ? "text-destructive" : "text-orange-500"}`}>{g.affectedQty} {g.unit}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-success" />
                            <span className="text-muted-foreground">Safe:</span>
                            <span className="font-bold text-success">{g.safeQty} {g.unit}</span>
                          </div>
                        </div>
                        {/* Visual bar */}
                        {g.totalCurrentStock > 0 && (
                          <div className="flex h-2 rounded-full overflow-hidden mt-2 bg-muted">
                            <div className={`${isExpiredView ? "bg-destructive" : "bg-orange-500"}`} style={{ width: `${(g.affectedQty / g.totalCurrentStock) * 100}%` }} />
                            <div className="bg-success" style={{ width: `${(g.safeQty / g.totalCurrentStock) * 100}%` }} />
                          </div>
                        )}
                      </div>

                      {/* Batch Breakdown */}
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

export default Warehouses;

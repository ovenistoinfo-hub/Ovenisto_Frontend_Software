import { useState, useEffect, useCallback, useMemo } from "react";
import {
  warehouseService,
  type WarehouseRecord,
  type WarehouseStockRecord,
} from "@/services/warehouse.service";
import { inventoryService, type IngredientCategoryRecord } from "@/services/inventory.service";
import { useData } from "@/contexts/DataContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ChefHat, RefreshCw, AlertTriangle, PackageX, Package, DollarSign, Search } from "lucide-react";
import { toast } from "sonner";
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

const KitchenStock = () => {
  const { settings } = useData();
  const currency = settings.currency || "Rs.";

  const [kitchens, setKitchens] = useState<WarehouseRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [stock, setStock] = useState<WarehouseStockRecord[]>([]);
  const [categories, setCategories] = useState<IngredientCategoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [stockLoading, setStockLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [cardFilter, setCardFilter] = useState<CardFilter>("all");

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Load kitchen warehouses + categories on mount
  useEffect(() => {
    Promise.all([warehouseService.getAll({ type: "KITCHEN" }), inventoryService.getIngredientCategories()])
      .then(([whs, catList]) => {
        setKitchens(whs);
        setCategories(catList);
        if (whs.length > 0) setSelectedId(whs[0].id);
        else setLoading(false);
      })
      .catch((err: Error) => {
        toast.error(err.message || "Failed to load kitchens");
        setLoading(false);
      });
  }, []);

  // Load stock when selected kitchen changes
  const fetchStock = useCallback(async (whId: string) => {
    if (!whId) return;
    setStockLoading(true);
    try {
      const data = await warehouseService.getStock(whId);
      setStock(data);
    } catch (err: Error | any) {
      toast.error(err.message || "Failed to load stock");
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
      const data = await warehouseService.getStock(selectedId);
      setStock(data);
    } catch (err: Error | any) {
      toast.error(err.message || "Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  }, [selectedId]);

  // Filtered + sorted stock (memoized)
  const filteredStock = useMemo(() => {
    let items = stock;
    if (cardFilter === "low") items = items.filter(s => Number(s.currentStock) > 0 && Number(s.currentStock) <= Number(s.lowStockLevel));
    if (cardFilter === "out") items = items.filter(s => Number(s.currentStock) <= 0);
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      items = items.filter(s => s.ingredient.name.toLowerCase().includes(q));
    }
    if (categoryFilter) items = items.filter(s => s.ingredient.category?.id === categoryFilter);
    return [...items].sort((a, b) => {
      const diff = STATUS_ORDER[getStatus(a)] - STATUS_ORDER[getStatus(b)];
      if (diff !== 0) return diff;
      return a.ingredient.name.localeCompare(b.ingredient.name);
    });
  }, [stock, cardFilter, debouncedSearch, categoryFilter]);

  // Stats (memoized)
  const stats = useMemo(() => ({
    total: stock.length,
    low: stock.filter(s => Number(s.currentStock) > 0 && Number(s.currentStock) <= Number(s.lowStockLevel)).length,
    empty: stock.filter(s => Number(s.currentStock) <= 0).length,
    totalValue: stock.reduce((sum, s) => sum + Number(s.currentStock) * Number(s.ingredient.purchasePrice ?? 0), 0),
  }), [stock]);

  const selectedKitchen = kitchens.find(k => k.id === selectedId);
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
            <Card className="shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2"><Package className="h-5 w-5 text-blue-500" /><div className="text-3xl font-bold">{isLoading ? "—" : stats.total}</div></div>
                <p className="text-sm text-muted-foreground mt-1">Total Ingredients</p>
              </CardContent>
            </Card>
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
            <Card className="shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2"><DollarSign className="h-5 w-5 text-primary" /><div className="text-2xl font-bold">{isLoading ? "—" : `${currency} ${stats.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}</div></div>
                <p className="text-sm text-muted-foreground mt-1">Total Value</p>
              </CardContent>
            </Card>
          </div>

          {/* Search + Category Filter */}
          <Card className="shadow-sm"><CardHeader className="pb-3">
            <div className="flex gap-4 items-end flex-wrap">
              <div className="flex-1 min-w-[200px]"><Label className="text-xs text-muted-foreground">Search</Label><div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ingredient..." className="pl-9" /></div></div>
              <div className="w-48"><Label className="text-xs text-muted-foreground">Category</Label><Select value={categoryFilter || "__all__"} onValueChange={v => setCategoryFilter(v === "__all__" ? "" : v)}><SelectTrigger><SelectValue placeholder="All" /></SelectTrigger><SelectContent><SelectItem value="__all__">All Categories</SelectItem>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
            </div>
          </CardHeader></Card>

          {/* Stock Table */}
          <Card className="shadow-sm"><CardContent>
            {stockLoading ? (
              <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full rounded" />)}</div>
            ) : filteredStock.length === 0 ? (
              <div className="text-center py-10">
                <Package className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-30" />
                <p className="text-sm text-muted-foreground">{stock.length === 0 ? "No stock records yet." : "No items match your filters."}</p>
                {stock.length === 0 && <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">Stock will appear here automatically when Transfer Challans are received into this kitchen warehouse.</p>}
              </div>
            ) : (
              <div className="rounded-lg border overflow-auto max-h-[calc(100vh-420px)]">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead>SN</TableHead><TableHead>Ingredient</TableHead><TableHead>Category</TableHead><TableHead>Unit</TableHead>
                      <TableHead className="text-right">Current Stock</TableHead><TableHead className="text-right">Low Stock Level</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStock.map((s, i) => {
                      const status = getStatus(s);
                      return (
                        <TableRow key={s.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="font-medium">{s.ingredient.name}</TableCell>
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
    </div>
  );
};

export default KitchenStock;

import { useState, useEffect } from "react";
import {
  warehouseService,
  type WarehouseRecord,
  type WarehouseStockItem,
  type ConsumptionLogItem,
} from "@/services/warehouse.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ChefHat, RefreshCw, AlertTriangle, PackageX, Package } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";

type StockStatus = "EMPTY" | "LOW" | "NORMAL";

function getStatus(stock: WarehouseStockItem): StockStatus {
  if (stock.currentStock <= 0) return "EMPTY";
  if (stock.isLow) return "LOW";
  return "NORMAL";
}

const STATUS_STYLE: Record<StockStatus, string> = {
  EMPTY: "bg-destructive/10 text-destructive",
  LOW: "bg-yellow-100 text-yellow-800",
  NORMAL: "bg-success/10 text-success",
};

const STATUS_ORDER: Record<StockStatus, number> = { EMPTY: 0, LOW: 1, NORMAL: 2 };

const KitchenStock = () => {
  const [kitchens, setKitchens] = useState<WarehouseRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [stock, setStock] = useState<WarehouseStockItem[]>([]);
  const [consumption, setConsumption] = useState<ConsumptionLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Load kitchen warehouses on mount
  useEffect(() => {
    warehouseService.getAll({ type: "KITCHEN" })
      .then((whs) => {
        setKitchens(whs);
        if (whs.length > 0) setSelectedId(whs[0].id);
        else setLoading(false);
      })
      .catch((err: any) => {
        toast.error(err.message || "Failed to load kitchens");
        setLoading(false);
      });
  }, []);

  // Load stock + consumption when selected kitchen changes
  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    Promise.all([
      warehouseService.getKitchenStock(selectedId),
      warehouseService.getConsumption(selectedId, 50),
    ])
      .then(([stockData, consumptionData]) => {
        setStock(stockData);
        setConsumption(consumptionData);
      })
      .catch((err: any) => toast.error(err.message || "Failed to load kitchen data"))
      .finally(() => setLoading(false));
  }, [selectedId]);

  const handleRefresh = async () => {
    if (!selectedId) return;
    setRefreshing(true);
    try {
      const [stockData, consumptionData] = await Promise.all([
        warehouseService.getKitchenStock(selectedId),
        warehouseService.getConsumption(selectedId, 50),
      ]);
      setStock(stockData);
      setConsumption(consumptionData);
    } catch (err: any) {
      toast.error(err.message || "Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  };

  // Sort: EMPTY first, LOW second, NORMAL last
  const sortedStock = [...stock].sort((a, b) => {
    const sA = STATUS_ORDER[getStatus(a)];
    const sB = STATUS_ORDER[getStatus(b)];
    if (sA !== sB) return sA - sB;
    return a.ingredientName.localeCompare(b.ingredientName);
  });

  const stats = {
    total: stock.length,
    low: stock.filter(s => getStatus(s) === "LOW").length,
    empty: stock.filter(s => getStatus(s) === "EMPTY").length,
    lastUpdated: consumption.length > 0 ? new Date(consumption[0].date).toLocaleString() : "—",
  };

  const selectedKitchen = kitchens.find(k => k.id === selectedId);

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
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Select kitchen" />
                </SelectTrigger>
                <SelectContent>
                  {kitchens.map(k => (
                    <SelectItem key={k.id} value={k.id}>{k.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        }
      />

      {/* No kitchens state */}
      {!loading && kitchens.length === 0 && (
        <Card className="shadow-sm">
          <CardContent className="py-12 text-center">
            <ChefHat className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" />
            <p className="text-muted-foreground">No kitchen warehouses found.</p>
            <p className="text-xs text-muted-foreground mt-1">Create a KITCHEN type warehouse in Warehouses and link it to an outlet.</p>
          </CardContent>
        </Card>
      )}

      {kitchens.length > 0 && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-muted-foreground" />
                  <div className="text-3xl font-bold">{loading ? "—" : stats.total}</div>
                </div>
                <p className="text-sm text-muted-foreground mt-1">Total Ingredients</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  <div className="text-3xl font-bold text-yellow-600">{loading ? "—" : stats.low}</div>
                </div>
                <p className="text-sm text-muted-foreground mt-1">Low Stock</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <PackageX className="h-5 w-5 text-destructive" />
                  <div className="text-3xl font-bold text-destructive">{loading ? "—" : stats.empty}</div>
                </div>
                <p className="text-sm text-muted-foreground mt-1">Empty / Negative</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="pt-6">
                <div className="text-sm font-medium">{loading ? "—" : stats.lastUpdated}</div>
                <p className="text-sm text-muted-foreground mt-1">Last Consumption</p>
              </CardContent>
            </Card>
          </div>

          {/* Tabs: Stock / Consumption Log */}
          <Tabs defaultValue="stock">
            <TabsList>
              <TabsTrigger value="stock">Stock Levels</TabsTrigger>
              <TabsTrigger value="consumption">Consumption Log</TabsTrigger>
            </TabsList>

            {/* Stock Tab */}
            <TabsContent value="stock" className="mt-4">
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {selectedKitchen?.name} — Current Stock
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full rounded" />)}</div>
                  ) : sortedStock.length === 0 ? (
                    <div className="text-center py-10">
                      <Package className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-30" />
                      <p className="text-sm text-muted-foreground">No stock records yet.</p>
                      <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">Stock will appear here automatically when Transfer Challans are received into this kitchen warehouse, or when orders are fulfilled.</p>
                    </div>
                  ) : (
                    <div className="rounded-lg border overflow-auto max-h-[calc(100vh-420px)]">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-card">
                          <TableRow className="bg-muted/50 hover:bg-muted/50">
                            <TableHead>SN</TableHead>
                            <TableHead>Ingredient</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Unit</TableHead>
                            <TableHead className="text-right">Current Stock</TableHead>
                            <TableHead className="text-right">Low Stock Level</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sortedStock.map((s, i) => {
                            const status = getStatus(s);
                            return (
                              <TableRow key={s.ingredientId} className="hover:bg-muted/30 transition-colors">
                                <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                                <TableCell className="font-medium">{s.ingredientName}</TableCell>
                                <TableCell className="text-sm text-muted-foreground">{s.category}</TableCell>
                                <TableCell className="text-sm">{s.unit}</TableCell>
                                <TableCell className={`text-right font-medium ${s.currentStock <= 0 ? "text-destructive" : s.isLow ? "text-yellow-600" : ""}`}>
                                  {s.currentStock.toFixed(3)}
                                </TableCell>
                                <TableCell className="text-right text-sm text-muted-foreground">{s.lowStockLevel.toFixed(3)}</TableCell>
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
                </CardContent>
              </Card>
            </TabsContent>

            {/* Consumption Log Tab */}
            <TabsContent value="consumption" className="mt-4">
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Recent POS Consumption — {selectedKitchen?.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full rounded" />)}</div>
                  ) : consumption.length === 0 ? (
                    <div className="text-center py-10">
                      <ChefHat className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-30" />
                      <p className="text-sm text-muted-foreground">No consumption records yet.</p>
                      <p className="text-xs text-muted-foreground mt-1">Consumption is logged automatically when POS orders are completed.</p>
                    </div>
                  ) : (
                    <div className="rounded-lg border overflow-auto max-h-[calc(100vh-420px)]">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-card">
                          <TableRow className="bg-muted/50 hover:bg-muted/50">
                            <TableHead>SN</TableHead>
                            <TableHead>Date / Time</TableHead>
                            <TableHead>Ingredient</TableHead>
                            <TableHead className="text-right">Qty Consumed</TableHead>
                            <TableHead>Unit</TableHead>
                            <TableHead>Order / Reason</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {consumption.map((c, i) => (
                            <TableRow key={c.id} className="hover:bg-muted/30 transition-colors">
                              <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                              <TableCell className="text-sm">{new Date(c.date).toLocaleString()}</TableCell>
                              <TableCell className="font-medium text-sm">{c.ingredientName}</TableCell>
                              <TableCell className="text-right text-sm font-medium">{c.qty.toFixed(3)}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{c.unit}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{c.reason}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
};

export default KitchenStock;

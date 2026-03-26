import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Search, Package } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { warehouseService, type WarehouseStockRecord } from "@/services/warehouse.service";
import { inventoryService, type IngredientCategoryRecord } from "@/services/inventory.service";
import { PageHeader } from "@/components/ui/page-header";

const WarehouseStock = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [warehouseName, setWarehouseName] = useState("");
  const [warehouseType, setWarehouseType] = useState("");
  const [stocks, setStocks] = useState<WarehouseStockRecord[]>([]);
  const [categories, setCategories] = useState<IngredientCategoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);

  const fetchWarehouse = useCallback(async () => {
    if (!id) return;
    try {
      const warehouse = await warehouseService.getById(id);
      setWarehouseName(warehouse.name);
      setWarehouseType(warehouse.type);
    } catch (err: any) {
      toast.error(err.message || "Failed to load warehouse");
    }
  }, [id]);

  const fetchCategories = useCallback(async () => {
    try {
      const data = await inventoryService.getIngredientCategories();
      setCategories(data);
    } catch (err: any) {
      // Silently fail
    }
  }, []);

  const fetchStock = useCallback(async () => {
    if (!id) return;
    try {
      const data = await warehouseService.getStock(id, {
        categoryId: selectedCategory || undefined,
        search: search || undefined,
        lowStockOnly: lowStockOnly || undefined,
      });
      setStocks(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load stock");
    } finally {
      setLoading(false);
    }
  }, [id, selectedCategory, search, lowStockOnly]);

  useEffect(() => {
    fetchWarehouse();
    fetchCategories();
  }, [fetchWarehouse, fetchCategories]);

  useEffect(() => {
    setLoading(true);
    fetchStock();
  }, [fetchStock]);

  const getStockStatus = (current: number, low: number) => {
    if (current <= 0) return { label: "Out", color: "bg-destructive/10 text-destructive" };
    if (current <= low) return { label: "Low", color: "bg-yellow-100 text-yellow-800" };
    return { label: "OK", color: "bg-success/10 text-success" };
  };

  if (loading) return <div className="space-y-6"><Skeleton className="h-10 w-full rounded-lg" />{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg mt-2" />)}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/warehouses")}><ArrowLeft className="h-4 w-4" /></Button>
        <PageHeader icon={<Package className="h-5 w-5" />} title={warehouseName} subtitle={`${warehouseType} warehouse`} />
      </div>

      {/* Filters */}
      <Card className="shadow-sm"><CardHeader className="pb-3"><div className="space-y-3">
        <div className="flex gap-4 items-end">
          <div className="flex-1"><Label className="text-xs text-muted-foreground">Search Ingredient</Label><div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by ingredient name..." className="pl-9" /></div></div>
          <div className="w-48"><Label className="text-xs text-muted-foreground">Category</Label><Select value={selectedCategory || "__all__"} onValueChange={(v) => setSelectedCategory(v === "__all__" ? "" : v)}><SelectTrigger><SelectValue placeholder="All Categories" /></SelectTrigger><SelectContent><SelectItem value="__all__">All Categories</SelectItem>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <div className="flex items-center gap-2"><Checkbox checked={lowStockOnly} onCheckedChange={(c) => setLowStockOnly(Boolean(c))} id="lowstock" /><Label htmlFor="lowstock" className="text-sm cursor-pointer">Show Low Stock Only</Label></div>
      </div></CardHeader></Card>

      {/* Stock Table */}
      <Card className="shadow-sm"><CardContent>
        {stocks.length === 0 ? (
          <div className="text-center py-12"><Package className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" /><p className="text-muted-foreground">No stock records found</p></div>
        ) : (
          <div className="rounded-lg border overflow-auto max-h-[calc(100vh-400px)]"><Table><TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>SN</TableHead><TableHead>Ingredient</TableHead><TableHead>Category</TableHead><TableHead>Unit</TableHead><TableHead className="text-right">Current Stock</TableHead><TableHead className="text-right">Low Stock Level</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Purchase Price (Rs.)</TableHead></TableRow></TableHeader>
            <TableBody>{stocks.map((stock, i) => {
              const status = getStockStatus(stock.currentStock, stock.lowStockLevel);
              return (
                <TableRow key={stock.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell>{i+1}</TableCell>
                  <TableCell className="font-medium">{stock.ingredient.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{stock.ingredient.category?.name || "—"}</TableCell>
                  <TableCell className="text-sm">{stock.ingredient.unit?.symbol || stock.ingredient.unit?.name || "—"}</TableCell>
                  <TableCell className="text-right font-medium">{stock.currentStock.toFixed(2)}</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">{stock.lowStockLevel.toFixed(2)}</TableCell>
                  <TableCell><Badge variant="secondary" className={status.color}>{status.label}</Badge></TableCell>
                  <TableCell className="text-right text-sm">{stock.ingredient.purchasePrice ? stock.ingredient.purchasePrice.toLocaleString() : "—"}</TableCell>
                </TableRow>
              );
            })}</TableBody></Table></div>
        )}
      </CardContent></Card>
    </div>
  );
};

export default WarehouseStock;

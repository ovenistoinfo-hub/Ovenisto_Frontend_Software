import { useState, useEffect } from "react";
import { useData } from "@/contexts/DataContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Package, AlertTriangle, XCircle, DollarSign, Search, Warehouse } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";

const StockOverview = () => {
  const { ingredients, settings } = useData();
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => { const t = setTimeout(() => setLoading(false), 500); return () => clearTimeout(t); }, []);
  const currency = settings.currency || "Rs.";
  const totalValue = ingredients.reduce((s, i) => s + i.purchasePrice * i.currentStock, 0);
  const lowCount = ingredients.filter((i) => i.currentStock > 0 && i.currentStock <= i.lowStockLevel).length;
  const outCount = ingredients.filter((i) => i.currentStock === 0).length;
  const filtered = ingredients.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  const stockStatus = (i: typeof ingredients[0]) => {
    if (i.currentStock === 0) return { label: "Out of Stock", cls: "bg-destructive/10 text-destructive" };
    if (i.currentStock <= i.lowStockLevel) return { label: "Low", cls: "bg-warning/10 text-warning" };
    return { label: "Adequate", cls: "bg-success/10 text-success" };
  };

  if (loading) return <div className="space-y-6"><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div><Skeleton className="h-10 w-full rounded-lg" />{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg mt-2" />)}</div>;

  return (
    <div className="space-y-6">
      <PageHeader icon={<Warehouse className="h-5 w-5" />} title="Stock Overview" subtitle="Inventory dashboard" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm"><CardContent className="p-5"><div className="flex items-center gap-4"><div className="h-11 w-11 rounded-xl bg-info/10 flex items-center justify-center shrink-0"><Package className="h-5 w-5 text-info" /></div><div className="min-w-0"><p className="text-sm text-muted-foreground">Total Ingredients</p><p className="text-2xl font-bold tracking-tight">{ingredients.length}</p></div></div></CardContent></Card>
        <Card className="shadow-sm border-warning/30"><CardContent className="p-5"><div className="flex items-center gap-4"><div className="h-11 w-11 rounded-xl bg-warning/10 flex items-center justify-center shrink-0"><AlertTriangle className="h-5 w-5 text-warning" /></div><div className="min-w-0"><p className="text-sm text-muted-foreground">Low Stock</p><p className="text-2xl font-bold tracking-tight text-warning">{lowCount}</p></div></div></CardContent></Card>
        <Card className="shadow-sm border-destructive/30"><CardContent className="p-5"><div className="flex items-center gap-4"><div className="h-11 w-11 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0"><XCircle className="h-5 w-5 text-destructive" /></div><div className="min-w-0"><p className="text-sm text-muted-foreground">Out of Stock</p><p className="text-2xl font-bold tracking-tight text-destructive">{outCount}</p></div></div></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-5"><div className="flex items-center gap-4"><div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><DollarSign className="h-5 w-5 text-primary" /></div><div className="min-w-0"><p className="text-sm text-muted-foreground">Total Value</p><p className="text-2xl font-bold tracking-tight">{currency} {totalValue.toLocaleString()}</p></div></div></CardContent></Card>
      </div>
      <Card className="shadow-sm">
        <CardHeader className="pb-3"><div className="relative max-w-sm"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ingredients..." className="pl-9" /></div></CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-auto max-h-[calc(100vh-400px)]">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>SN</TableHead><TableHead>Ingredient</TableHead><TableHead>Category</TableHead><TableHead>Current Qty</TableHead><TableHead>Unit</TableHead><TableHead>Min Level</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>{filtered.map((item, i) => { const s = stockStatus(item); return (
                <TableRow key={item.id} className={cn("hover:bg-muted/30 transition-colors", item.currentStock === 0 ? "bg-destructive/5" : item.currentStock <= item.lowStockLevel ? "bg-warning/5" : "")}>
                  <TableCell>{i + 1}</TableCell><TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>{item.category}</TableCell><TableCell className="font-medium">{item.currentStock}</TableCell>
                  <TableCell>{item.unit}</TableCell><TableCell>{item.lowStockLevel}</TableCell>
                  <TableCell><Badge variant="secondary" className={s.cls}>{s.label}</Badge></TableCell>
                </TableRow>
              ); })}</TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StockOverview;

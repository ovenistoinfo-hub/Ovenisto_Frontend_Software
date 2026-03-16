import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { AlertTriangle, ShoppingBag } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useData } from "@/contexts/DataContext";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";

const LowStock = () => {
  const navigate = useNavigate();
  const { ingredients, settings } = useData();
  const [loading, setLoading] = useState(true);
  useEffect(() => { const t = setTimeout(() => setLoading(false), 500); return () => clearTimeout(t); }, []);
  const currency = settings.currency || "Rs.";
  const lowItems = ingredients.filter((i) => i.currentStock <= i.lowStockLevel);

  if (loading) return <div className="space-y-6"><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div><Skeleton className="h-10 w-full rounded-lg" />{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg mt-2" />)}</div>;

  return (
    <div className="space-y-6">
      <PageHeader icon={<AlertTriangle className="h-5 w-5" />} title="Low Stock Alerts" subtitle={`${lowItems.length} items needing attention`} actions={<Button className="gradient-primary text-primary-foreground" onClick={() => navigate("/purchases?auto=low-stock")}><ShoppingBag className="h-4 w-4 mr-2" />Create Purchase Order</Button>} />
      <Card className="shadow-sm"><CardContent className="pt-6">
        {lowItems.length === 0 ? (<div className="text-center py-12"><AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" /><p className="text-muted-foreground">All stock levels are adequate!</p></div>) : (
          <div className="rounded-lg border overflow-auto max-h-[calc(100vh-300px)]"><Table><TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>SN</TableHead><TableHead>Ingredient</TableHead><TableHead>Category</TableHead><TableHead>Current</TableHead><TableHead>Min Level</TableHead><TableHead>Unit</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>{lowItems.map((item, i) => (<TableRow key={item.id} className={cn("hover:bg-muted/30 transition-colors", item.currentStock === 0 ? "bg-destructive/5" : "bg-warning/5")}><TableCell>{i+1}</TableCell><TableCell className="font-medium">{item.name}</TableCell><TableCell>{item.category}</TableCell><TableCell className="font-bold text-destructive">{item.currentStock}</TableCell><TableCell>{item.lowStockLevel}</TableCell><TableCell>{item.unit}</TableCell><TableCell><Badge variant="secondary" className={item.currentStock === 0 ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"}>{item.currentStock === 0 ? "Critical" : "Low"}</Badge></TableCell></TableRow>))}</TableBody></Table></div>
        )}
      </CardContent></Card>
    </div>
  );
};
export default LowStock;

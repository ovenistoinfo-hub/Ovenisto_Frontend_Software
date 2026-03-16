import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Search, AlertTriangle, Factory } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useData } from "@/contexts/DataContext";
import { PageHeader } from "@/components/ui/page-header";

const Production = () => {
  const { productions: list, foodMenuItems, foodRecipes, ingredients: ingredientsList, addItem, adjustStock } = useData();
  const [showAdd, setShowAdd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ product: "", qty: 0, notes: "" });
  const [loading, setLoading] = useState(true);
  useEffect(() => { const t = setTimeout(() => setLoading(false), 500); return () => clearTimeout(t); }, []);
  const filtered = list.filter((p) => p.product.toLowerCase().includes(search.toLowerCase()));

  const selectedRecipe = foodRecipes[form.product] || [];
  const requiredIngredients = selectedRecipe.map((r) => {
    const ing = ingredientsList.find((ig) => ig.id === r.ingredientId);
    const required = r.qtyPerUnit * form.qty;
    return { ingredientId: r.ingredientId, name: ing?.name || "", unit: ing?.unit || "", required: Math.round(required * 100) / 100, current: ing?.currentStock || 0, sufficient: (ing?.currentStock || 0) >= required };
  });

  const handleProduce = () => { if (!form.product || form.qty <= 0) return; if (selectedRecipe.length > 0) { setShowConfirm(true); return; } doSave(); };
  const doSave = () => {
    const ingredientsUsed = requiredIngredients.map((r) => `${r.name} ${r.required}${r.unit}`).join(", ") || "Auto-calculated";
    addItem("productions", { id: crypto.randomUUID(), date: new Date().toISOString().split("T")[0], product: form.product, qty: form.qty, ingredientsUsed, producedBy: "Admin User", notes: form.notes });
    for (const r of requiredIngredients) { if (r.ingredientId) adjustStock(r.ingredientId, r.required, "deduct"); }
    setForm({ product: "", qty: 0, notes: "" }); setShowAdd(false); setShowConfirm(false);
    toast.success("Production recorded — ingredients deducted from stock");
  };

  if (loading) return <div className="space-y-6"><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div><Skeleton className="h-10 w-full rounded-lg" />{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg mt-2" />)}</div>;

  return (
    <div className="space-y-6">
      <PageHeader icon={<Factory className="h-5 w-5" />} title="Production" subtitle="Production batches" actions={<Button className="gradient-primary text-primary-foreground" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-2" />New Production</Button>} />
      <Card className="shadow-sm"><CardHeader className="pb-3"><div className="relative max-w-sm"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="pl-9" /></div></CardHeader>
        <CardContent>{filtered.length === 0 ? (<div className="text-center py-12"><Factory className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" /><p className="text-muted-foreground">No production records found</p><p className="text-xs text-muted-foreground mt-1.5">Start your first production batch.</p></div>) : (
          <div className="rounded-lg border overflow-auto max-h-[calc(100vh-300px)]"><Table><TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>SN</TableHead><TableHead>Date</TableHead><TableHead>Product</TableHead><TableHead>Qty</TableHead><TableHead>Ingredients Used</TableHead><TableHead>By</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader>
            <TableBody>{filtered.map((p, i) => (<TableRow key={p.id} className="hover:bg-muted/30 transition-colors"><TableCell>{i+1}</TableCell><TableCell>{p.date}</TableCell><TableCell className="font-medium">{p.product}</TableCell><TableCell>{p.qty}</TableCell><TableCell className="text-xs text-muted-foreground max-w-xs truncate">{p.ingredientsUsed}</TableCell><TableCell>{p.producedBy}</TableCell><TableCell className="text-muted-foreground">{p.notes}</TableCell></TableRow>))}</TableBody></Table></div>
        )}</CardContent></Card>
      <Dialog open={showAdd} onOpenChange={setShowAdd}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>New Production</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Food Item</Label><Select value={form.product} onValueChange={(v) => setForm((p) => ({ ...p, product: v }))}><SelectTrigger><SelectValue placeholder="Select food item" /></SelectTrigger><SelectContent>{foodMenuItems.map((f) => <SelectItem key={f.id} value={f.name}>{f.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Quantity</Label><Input placeholder="Quantity to produce" type="number" value={form.qty || ""} onChange={(e) => setForm((p) => ({ ...p, qty: Number(e.target.value) }))} /></div>
          {form.product && form.qty > 0 && requiredIngredients.length > 0 && (<div className="border rounded-lg p-3 space-y-2"><h4 className="text-sm font-semibold">Required Ingredients</h4>{requiredIngredients.map((r, i) => (<div key={i} className={cn("flex justify-between text-sm", !r.sufficient && "text-destructive")}><span>{r.name}</span><div className="flex items-center gap-2"><span>Need: {r.required} {r.unit}</span><span className="text-muted-foreground">|</span><span>Stock: {r.current} {r.unit}</span>{!r.sufficient && <AlertTriangle className="h-3 w-3 text-destructive" />}</div></div>))}</div>)}
          <div className="space-y-1.5"><Label>Notes</Label><Textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button><Button className="gradient-primary text-primary-foreground" onClick={handleProduce}>Produce</Button></DialogFooter></DialogContent></Dialog>
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirm Production</AlertDialogTitle><AlertDialogDescription>This will deduct the required ingredients from stock. Continue?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={doSave} className="gradient-primary text-primary-foreground">Yes, Produce</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
};
export default Production;

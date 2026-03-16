import { useState, useEffect } from "react";
import { useData } from "@/contexts/DataContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Search, FileText, Pencil, Trash2, Wallet } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { TablePagination, paginate } from "@/components/TablePagination";

const categories = ["Utilities", "Rent", "Salary", "Maintenance", "Marketing", "Misc"];
const methods = ["Cash", "Bank Transfer", "Online", "Card"];

const Expenses = () => {
  const { expenses, addItem, updateItem, removeItem, settings } = useData();
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ category: "", description: "", amount: 0, paymentMethod: "Cash" });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const currency = settings.currency || "Rs.";
  useEffect(() => { const t = setTimeout(() => setLoading(false), 500); return () => clearTimeout(t); }, []);

  const filtered = expenses.filter((e) => e.description.toLowerCase().includes(search.toLowerCase()) || e.category.toLowerCase().includes(search.toLowerCase()));
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const paged = paginate(filtered, page);

  const openAdd = () => { setEditingId(null); setForm({ category: "", description: "", amount: 0, paymentMethod: "Cash" }); setShowDialog(true); };
  const openEdit = (e: typeof expenses[0]) => { setEditingId(e.id); setForm({ category: e.category, description: e.description, amount: e.amount, paymentMethod: e.paymentMethod }); setShowDialog(true); };

  const handleSave = () => {
    if (!form.description) return;
    if (editingId) { updateItem("expenses", editingId, form); toast.success("Updated successfully"); }
    else { addItem("expenses", { id: crypto.randomUUID(), date: new Date().toISOString().split("T")[0], ...form, receipt: false }); toast.success("Expense added"); }
    setForm({ category: "", description: "", amount: 0, paymentMethod: "Cash" }); setShowDialog(false); setEditingId(null);
  };

  if (loading) return <div className="space-y-6"><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div><Skeleton className="h-10 w-full rounded-lg" />{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg mt-2" />)}</div>;

  return (
    <div className="space-y-6">
      <PageHeader icon={<Wallet className="h-5 w-5" />} title="Expenses" subtitle={`Total: ${currency} ${total.toLocaleString()}`} actions={<Button className="gradient-primary text-primary-foreground" onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Expense</Button>} />
      <Card className="shadow-sm"><CardContent className="p-5"><div className="flex items-center gap-4"><div className="h-11 w-11 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0"><Wallet className="h-5 w-5 text-destructive" /></div><div className="min-w-0"><p className="text-sm text-muted-foreground truncate">Total Expenses</p><p className="text-2xl font-bold tracking-tight">{currency} {total.toLocaleString()}</p></div></div></CardContent></Card>
      <Card className="shadow-sm"><CardHeader className="pb-3"><div className="relative max-w-sm"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search..." className="pl-9" /></div></CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-12"><Wallet className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" /><p className="text-muted-foreground">No expenses found</p><p className="text-xs text-muted-foreground mt-1.5">Add your first expense to get started.</p><Button size="sm" className="gradient-primary text-primary-foreground mt-3" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Expense</Button></div>
          ) : (
            <>
              <div className="rounded-lg border overflow-auto max-h-[calc(100vh-300px)]">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>SN</TableHead><TableHead>Date</TableHead><TableHead>Category</TableHead><TableHead>Description</TableHead><TableHead>Amount</TableHead><TableHead>Method</TableHead><TableHead>Receipt</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                  <TableBody>{paged.map((e, i) => (<TableRow key={e.id} className="hover:bg-muted/30 transition-colors"><TableCell>{(page-1)*10+i+1}</TableCell><TableCell>{e.date}</TableCell><TableCell><Badge variant="secondary">{e.category}</Badge></TableCell><TableCell>{e.description}</TableCell><TableCell className="font-medium">{currency} {e.amount.toLocaleString()}</TableCell><TableCell>{e.paymentMethod}</TableCell><TableCell>{e.receipt ? <FileText className="h-4 w-4 text-success" /> : <span className="text-muted-foreground">—</span>}</TableCell><TableCell><div className="flex gap-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(e)}><Pencil className="h-3 w-3" /></Button>
                    <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this expense?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { removeItem("expenses", e.id); toast.success("Deleted"); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                  </div></TableCell></TableRow>))}</TableBody>
                </Table>
              </div>
              <TablePagination currentPage={page} totalItems={filtered.length} onPageChange={setPage} />
            </>
          )}
        </CardContent></Card>
      <Dialog open={showDialog} onOpenChange={setShowDialog}><DialogContent><DialogHeader><DialogTitle>{editingId ? "Edit" : "Add"} Expense</DialogTitle></DialogHeader><div className="space-y-3">
        <div className="space-y-1.5"><Label>Category</Label><Select value={form.category} onValueChange={(v) => setForm(p => ({ ...p, category: v }))}><SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger><SelectContent>{categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label>Description</Label><Textarea placeholder="Enter description" value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>Amount</Label><Input placeholder="Enter amount" type="number" value={form.amount || ""} onChange={(e) => setForm(p => ({ ...p, amount: Number(e.target.value) }))} /></div>
        <div className="space-y-1.5"><Label>Payment Method</Label><Select value={form.paymentMethod} onValueChange={(v) => setForm(p => ({ ...p, paymentMethod: v }))}><SelectTrigger><SelectValue placeholder="Payment Method" /></SelectTrigger><SelectContent>{methods.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></div>
      </div><DialogFooter><Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button><Button className="gradient-primary text-primary-foreground" onClick={handleSave}>Save</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
};
export default Expenses;

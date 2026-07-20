import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { expenseService, type ExpenseRecord } from "@/services/expense.service";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Search, FileText, Pencil, Trash2, Wallet, Eye, User, ChevronUp, X } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { TablePagination } from "@/components/TablePagination";

const categories = ["Utilities", "Rent", "Salary", "Maintenance", "Marketing", "Misc"];

const Expenses = () => {
  const { settings } = useData();
  const { user } = useAuth();
  const currency = settings.currency || "Rs.";
  const methods = settings.paymentMethods ?? ["Cash", "Credit Card", "Account", "JazzCash", "EasyPaisa"];
  const canManage = ['Super Admin', 'Admin', 'Manager', 'Accountant'].includes(user?.role ?? '');

  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [showDetail, setShowDetail] = useState<ExpenseRecord | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ category: "", description: "", amount: 0, paymentMethod: "Cash" });
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);

  const { data: resp, isLoading: loading } = useQuery({
    queryKey: ["expenses", { page, search }],
    queryFn: () => expenseService.getAll({ page, limit: 20, search: search || undefined }),
  });
  const expenses = resp?.data ?? [];
  const totalAmount = resp?.totalAmount ?? 0;
  const totalItems = resp?.meta.total ?? 0;

  const openAdd = () => { setEditingId(null); setForm({ category: "", description: "", amount: 0, paymentMethod: "Cash" }); setShowDialog(true); };
  const openEdit = (e: ExpenseRecord) => {
    setEditingId(e.id);
    setForm({
      category: e.category || "",
      description: e.description || "",
      amount: e.amount,
      paymentMethod: e.paymentMethod || "Cash",
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.description.trim()) { toast.error("Description is required"); return; }
    if (!form.amount || form.amount <= 0) { toast.error("Amount is required"); return; }
    setSaving(true);
    try {
      if (editingId) {
        await expenseService.update(editingId, {
          category: form.category || undefined,
          description: form.description,
          amount: form.amount,
          paymentMethod: form.paymentMethod,
        });
        toast.success("Updated successfully");
      } else {
        await expenseService.create({
          category: form.category || undefined,
          description: form.description,
          amount: form.amount,
          paymentMethod: form.paymentMethod,
          date: new Date().toISOString().split("T")[0],
        });
        toast.success("Expense added");
      }
      setForm({ category: "", description: "", amount: 0, paymentMethod: "Cash" });
      setShowDialog(false);
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to save expense");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await expenseService.delete(id);
      toast.success("Deleted");
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to delete expense");
    }
  };

  if (loading) return <div className="space-y-6"><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div><Skeleton className="h-10 w-full rounded-lg" />{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg mt-2" />)}</div>;

  return (
    <div className="space-y-6">
      <PageHeader icon={<Wallet className="h-5 w-5" />} title="Expenses" subtitle={`Total: ${currency} ${totalAmount.toLocaleString()}`} actions={canManage ? <Button className="gradient-primary text-primary-foreground" onClick={() => { if (showDialog) { setShowDialog(false); setEditingId(null); setForm({ category: "", description: "", amount: 0, paymentMethod: "Cash" }); } else { openAdd(); } }}>{showDialog ? <><X className="h-4 w-4 mr-2" />Close Form</> : <><Plus className="h-4 w-4 mr-2" />Add Expense</>}</Button> : undefined} />
      <Card className="shadow-sm"><CardContent className="p-5"><div className="flex items-center gap-4"><div className="h-11 w-11 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0"><Wallet className="h-5 w-5 text-destructive" /></div><div className="min-w-0"><p className="text-sm text-muted-foreground truncate">Total Expenses</p><p className="text-2xl font-bold tracking-tight">{currency} {totalAmount.toLocaleString()}</p></div></div></CardContent></Card>

      {/* Inline Create / Edit Form Panel */}
      {showDialog && (
        <Card className="shadow-sm border-primary/30 bg-primary/[0.02]">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <h3 className="text-base font-semibold">{editingId ? "Edit" : "Add"} Expense</h3>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setShowDialog(false); setEditingId(null); setForm({ category: "", description: "", amount: 0, paymentMethod: "Cash" }); }}>
              <ChevronUp className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm(p => ({ ...p, category: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>{categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input list="expense-description-list" placeholder="Enter description" value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} />
                <datalist id="expense-description-list">
                  {[...new Set(expenses.map(e => e.description).filter(Boolean))].map(desc => <option key={desc} value={desc} />)}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label>Amount</Label>
                <Input placeholder="Enter amount" type="number" value={form.amount || ""} onChange={(e) => setForm(p => ({ ...p, amount: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Payment Method</Label>
                <Select value={form.paymentMethod} onValueChange={(v) => setForm(p => ({ ...p, paymentMethod: v }))}>
                  <SelectTrigger><SelectValue placeholder="Payment Method" /></SelectTrigger>
                  <SelectContent>{methods.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setShowDialog(false); setEditingId(null); setForm({ category: "", description: "", amount: 0, paymentMethod: "Cash" }); }}>Cancel</Button>
              <Button className="gradient-primary text-primary-foreground" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-sm"><CardHeader className="pb-3"><div className="relative max-w-sm"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search..." className="pl-9" /></div></CardHeader>
        <CardContent>
          {expenses.length === 0 ? (
            <div className="text-center py-12"><Wallet className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" /><p className="text-muted-foreground">No expenses found</p><p className="text-xs text-muted-foreground mt-1.5">Add your first expense to get started.</p><Button size="sm" className="gradient-primary text-primary-foreground mt-3" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Expense</Button></div>
          ) : (
            <>
              <div className="rounded-lg border overflow-auto max-h-[calc(100vh-300px)]">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>SN</TableHead><TableHead>Date</TableHead><TableHead>Category</TableHead><TableHead>Description</TableHead><TableHead>Amount</TableHead><TableHead>Method</TableHead><TableHead>Receipt</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                  <TableBody>{expenses.map((e, i) => (<TableRow key={e.id} className="hover:bg-muted/30 transition-colors"><TableCell>{(page-1)*20+i+1}</TableCell><TableCell>{typeof e.date === "string" ? e.date.split("T")[0] : e.date}</TableCell><TableCell><Badge variant="secondary">{e.category}</Badge></TableCell><TableCell>{e.description}</TableCell><TableCell className="font-medium">{currency} {e.amount.toLocaleString()}</TableCell><TableCell>{e.paymentMethod}</TableCell><TableCell>{e.receipt ? <FileText className="h-4 w-4 text-success" /> : <span className="text-muted-foreground">—</span>}</TableCell><TableCell><div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowDetail(e)}><Eye className="h-3 w-3" /></Button>
                    {canManage && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(e)}><Pencil className="h-3 w-3" /></Button>}
                    {canManage && <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this expense?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(e.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
                  </div></TableCell></TableRow>))}</TableBody>
                </Table>
              </div>
              <TablePagination currentPage={page} totalItems={totalItems} onPageChange={setPage} pageSize={20} />
            </>
          )}
        </CardContent></Card>

      {/* Detail Dialog */}
      <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Wallet className="h-5 w-5" />
              <span>Expense Details</span>
              {showDetail && <Badge variant="secondary">{showDetail.category}</Badge>}
            </DialogTitle>
          </DialogHeader>
          {showDetail && (
            <div className="space-y-4">
              <Card className="shadow-sm">
                <CardContent className="pt-5 space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{showDetail.createdBy ?? "—"}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">Date: {typeof showDetail.date === "string" ? new Date(showDetail.date).toLocaleString() : showDetail.date}</div>
                </CardContent>
              </Card>
              <div className="rounded-lg border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead>Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell><Badge variant="secondary">{showDetail.category}</Badge></TableCell>
                      <TableCell className="font-medium">{showDetail.description || "—"}</TableCell>
                      <TableCell>{showDetail.paymentMethod}</TableCell>
                      <TableCell className="text-right text-lg font-bold">{currency} {showDetail.amount.toLocaleString()}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
              {showDetail.receipt && (
                <div className="flex items-center gap-2 text-sm text-success">
                  <FileText className="h-4 w-4" />Receipt attached
                </div>
              )}
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setShowDetail(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
export default Expenses;

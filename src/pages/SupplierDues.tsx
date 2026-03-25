import { useState, useEffect, useCallback } from "react";
import { supplierService, type SupplierRecord } from "@/services/supplier.service";
import { useData } from "@/contexts/DataContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditCard } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";

const paymentMethods = ["Bank Transfer", "Cash", "Online", "Cheque"];

const SupplierDues = () => {
  const { settings } = useData();
  const currency = settings.currency || "Rs.";

  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPay, setShowPay] = useState<SupplierRecord | null>(null);
  const [amount, setAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("Bank Transfer");

  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await supplierService.getAll();
      setSuppliers(res.data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load suppliers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

  const dueSuppliers = suppliers.filter((s) => s.totalDue > 0);
  const totalDue = dueSuppliers.reduce((s, c) => s + c.totalDue, 0);

  const openPayment = (s: SupplierRecord) => {
    setShowPay(s);
    setAmount(s.totalDue);
    setPaymentMethod("Bank Transfer");
  };

  const handlePay = async () => {
    if (!showPay || amount <= 0) return;
    setSaving(true);
    try {
      await supplierService.recordPayment(showPay.id, { amount, paymentMethod });
      toast.success("Payment recorded");
      setShowPay(null);
      await fetchSuppliers();
    } catch (err: any) {
      toast.error(err.message || "Failed to record payment");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="space-y-6"><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div><Skeleton className="h-10 w-full rounded-lg" />{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg mt-2" />)}</div>;

  return (
    <div className="space-y-6">
      <PageHeader icon={<CreditCard className="h-5 w-5" />} title="Supplier Dues" subtitle="Outstanding supplier balances" />
      <Card className="shadow-sm border-primary/20"><CardContent className="p-5"><div className="flex items-center gap-4"><div className="h-11 w-11 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0"><CreditCard className="h-5 w-5 text-destructive" /></div><div><p className="text-sm text-muted-foreground">Total Due to Suppliers</p><p className="text-2xl font-bold tracking-tight text-destructive">{currency} {totalDue.toLocaleString()}</p></div></div></CardContent></Card>
      <Card className="shadow-sm"><CardContent className="pt-6">
        <div className="rounded-lg border overflow-auto max-h-[calc(100vh-300px)]"><Table><TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>SN</TableHead><TableHead>Supplier</TableHead><TableHead>Company</TableHead><TableHead>Total Due</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
          <TableBody>{dueSuppliers.length === 0 ? (
            <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">No outstanding dues</TableCell></TableRow>
          ) : dueSuppliers.map((s, i) => (<TableRow key={s.id} className="hover:bg-muted/30 transition-colors"><TableCell>{i+1}</TableCell><TableCell className="font-medium">{s.name}</TableCell><TableCell>{s.company}</TableCell><TableCell className="text-destructive font-bold">{currency} {s.totalDue.toLocaleString()}</TableCell><TableCell><Button size="sm" className="gradient-primary text-primary-foreground" onClick={() => openPayment(s)}>Make Payment</Button></TableCell></TableRow>))}</TableBody></Table></div>
      </CardContent></Card>
      <Dialog open={!!showPay} onOpenChange={() => setShowPay(null)}><DialogContent><DialogHeader><DialogTitle>Payment — {showPay?.name}</DialogTitle></DialogHeader><div className="space-y-3">
        <div className="space-y-1.5"><Label>Amount</Label><Input type="number" value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} /></div>
        <div className="space-y-1.5"><Label>Payment Method</Label><Select value={paymentMethod} onValueChange={setPaymentMethod}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{paymentMethods.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></div>
      </div><DialogFooter><Button variant="outline" onClick={() => setShowPay(null)}>Cancel</Button><Button className="gradient-primary text-primary-foreground" onClick={handlePay} disabled={saving}>{saving ? "Processing..." : "Confirm"}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
};
export default SupplierDues;

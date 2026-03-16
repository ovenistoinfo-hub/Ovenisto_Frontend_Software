import { useState, useEffect } from "react";
import { useData } from "@/contexts/DataContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreditCard } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";

const SupplierDues = () => {
  const { suppliers, updateItem, settings } = useData();
  const currency = settings.currency || "Rs.";
  const dueSuppliers = suppliers.filter((s) => s.totalDue > 0);
  const totalDue = dueSuppliers.reduce((s, c) => s + c.totalDue, 0);
  const [showPay, setShowPay] = useState<typeof suppliers[0] | null>(null);
  const [amount, setAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => { const t = setTimeout(() => setLoading(false), 500); return () => clearTimeout(t); }, []);

  const handlePay = () => { if (!showPay || amount <= 0) return; updateItem("suppliers", showPay.id, { totalDue: Math.max(0, showPay.totalDue - amount) }); setShowPay(null); toast.success("Payment recorded"); };

  if (loading) return <div className="space-y-6"><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div><Skeleton className="h-10 w-full rounded-lg" />{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg mt-2" />)}</div>;

  return (
    <div className="space-y-6">
      <PageHeader icon={<CreditCard className="h-5 w-5" />} title="Supplier Dues" subtitle="Outstanding supplier balances" />
      <Card className="shadow-sm border-primary/20"><CardContent className="p-5"><div className="flex items-center gap-4"><div className="h-11 w-11 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0"><CreditCard className="h-5 w-5 text-destructive" /></div><div><p className="text-sm text-muted-foreground">Total Due to Suppliers</p><p className="text-2xl font-bold tracking-tight text-destructive">{currency} {totalDue.toLocaleString()}</p></div></div></CardContent></Card>
      <Card className="shadow-sm"><CardContent className="pt-6">
        <div className="rounded-lg border overflow-auto max-h-[calc(100vh-300px)]"><Table><TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>SN</TableHead><TableHead>Supplier</TableHead><TableHead>Company</TableHead><TableHead>Total Due</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
          <TableBody>{dueSuppliers.map((s, i) => (<TableRow key={s.id} className="hover:bg-muted/30 transition-colors"><TableCell>{i+1}</TableCell><TableCell className="font-medium">{s.name}</TableCell><TableCell>{s.company}</TableCell><TableCell className="text-destructive font-bold">{currency} {s.totalDue.toLocaleString()}</TableCell><TableCell><Button size="sm" className="gradient-primary text-primary-foreground" onClick={() => { setShowPay(s); setAmount(s.totalDue); }}>Make Payment</Button></TableCell></TableRow>))}</TableBody></Table></div>
      </CardContent></Card>
      <Dialog open={!!showPay} onOpenChange={() => setShowPay(null)}><DialogContent><DialogHeader><DialogTitle>Payment — {showPay?.name}</DialogTitle></DialogHeader><div className="space-y-3">
        <div className="space-y-1.5"><Label>Amount</Label><Input type="number" value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} /></div>
        <div className="space-y-1.5"><Label>Payment Method</Label><Input defaultValue="Bank Transfer" /></div>
      </div><DialogFooter><Button variant="outline" onClick={() => setShowPay(null)}>Cancel</Button><Button className="gradient-primary text-primary-foreground" onClick={handlePay}>Confirm</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
};
export default SupplierDues;

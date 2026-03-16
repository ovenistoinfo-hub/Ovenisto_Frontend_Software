import { useState, useEffect } from "react";
import { useData } from "@/contexts/DataContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CreditCard } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";

const CustomerDues = () => {
  const { customers, updateItem, settings } = useData();
  const currency = settings.currency || "Rs.";
  const dueCustomers = customers.filter((c) => c.outstandingDue > 0);
  const totalDue = dueCustomers.reduce((s, c) => s + c.outstandingDue, 0);
  const [showPay, setShowPay] = useState<typeof customers[0] | null>(null);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => { const t = setTimeout(() => setLoading(false), 500); return () => clearTimeout(t); }, []);

  const handlePay = () => { if (!showPay) return; const amt = Number(amount); if (amt <= 0) return; updateItem("customers", showPay.id, { outstandingDue: Math.max(0, showPay.outstandingDue - amt) }); setShowPay(null); toast.success("Payment received"); };

  if (loading) return <div className="space-y-6"><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div><Skeleton className="h-10 w-full rounded-lg" />{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg mt-2" />)}</div>;

  return (
    <div className="space-y-6">
      <PageHeader icon={<CreditCard className="h-5 w-5" />} title="Customer Dues" subtitle="Outstanding balances" />
      <Card className="shadow-sm border-primary/20"><CardContent className="p-5"><div className="flex items-center gap-4"><div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><CreditCard className="h-5 w-5 text-primary" /></div><div><p className="text-sm text-muted-foreground">Total Outstanding</p><p className="text-2xl font-bold tracking-tight text-primary">{currency} {totalDue.toLocaleString()}</p></div></div></CardContent></Card>
      <Card className="shadow-sm"><CardContent className="pt-6">
        <div className="rounded-lg border overflow-auto max-h-[calc(100vh-300px)]"><Table><TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>SN</TableHead><TableHead>Customer</TableHead><TableHead>Phone</TableHead><TableHead>Total Due</TableHead><TableHead>Last Order</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
          <TableBody>{dueCustomers.map((c, i) => (<TableRow key={c.id} className="hover:bg-muted/30 transition-colors"><TableCell>{i + 1}</TableCell><TableCell className="font-medium">{c.name}</TableCell><TableCell>{c.phone}</TableCell><TableCell className="text-destructive font-bold">{currency} {c.outstandingDue.toLocaleString()}</TableCell><TableCell>{c.lastOrder}</TableCell><TableCell><Button size="sm" className="gradient-primary text-primary-foreground" onClick={() => { setShowPay(c); setAmount(String(c.outstandingDue)); }}>Receive Payment</Button></TableCell></TableRow>))}</TableBody></Table></div>
      </CardContent></Card>
      <Dialog open={!!showPay} onOpenChange={() => setShowPay(null)}>
        <DialogContent><DialogHeader><DialogTitle>Receive Payment — {showPay?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label htmlFor="due-amount">Amount</Label><Input id="due-amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="due-method">Payment Method</Label><Input id="due-method" defaultValue="Cash" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowPay(null)}>Cancel</Button><Button className="gradient-primary text-primary-foreground" onClick={handlePay}>Confirm</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomerDues;

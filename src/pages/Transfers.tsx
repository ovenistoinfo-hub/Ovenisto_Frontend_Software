import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ArrowLeftRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { stockService, type TransferRecord } from "@/services/stock.service";
import { outletService, type OutletRecord } from "@/services/outlet.service";

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-warning/10 text-warning",
  completed: "bg-success/10 text-success",
  cancelled: "bg-destructive/10 text-destructive",
};

const Transfers = () => {
  const [list, setList] = useState<TransferRecord[]>([]);
  const [outlets, setOutlets] = useState<OutletRecord[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ fromOutletId: "", toOutletId: "", itemName: "", quantity: "", unit: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [transferRes, outletList] = await Promise.all([
        stockService.getTransfers({ limit: 200 }),
        outletService.getOutlets(),
      ]);
      setList(transferRes.data);
      setOutlets(outletList);
    } catch (err: any) {
      toast.error(err.message || "Failed to load transfers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const resetForm = () => setForm({ fromOutletId: "", toOutletId: "", itemName: "", quantity: "", unit: "", notes: "" });

  const handleSave = async () => {
    if (!form.fromOutletId || !form.toOutletId) { toast.error("Select both outlets"); return; }
    if (!form.itemName.trim()) { toast.error("Enter item name"); return; }
    if (form.fromOutletId === form.toOutletId) { toast.error("From and To outlets must be different"); return; }
    setSaving(true);
    try {
      await stockService.createTransfer({
        fromOutletId: form.fromOutletId,
        toOutletId: form.toOutletId,
        itemName: form.itemName.trim(),
        quantity: form.quantity ? Number(form.quantity) : undefined,
        unit: form.unit || undefined,
        notes: form.notes || undefined,
      });
      toast.success("Transfer created");
      resetForm();
      setShowAdd(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to create transfer");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await stockService.updateTransferStatus(id, status);
      toast.success("Transfer status updated");
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to update status");
    }
  };

  if (loading) return <div className="space-y-6"><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div><Skeleton className="h-10 w-full rounded-lg" />{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg mt-2" />)}</div>;

  return (
    <div className="space-y-6">
      <PageHeader icon={<ArrowLeftRight className="h-5 w-5" />} title="Transfers" subtitle="Inter-outlet transfers" actions={<Button className="gradient-primary text-primary-foreground" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-2" />New Transfer</Button>} />
      <Card className="shadow-sm"><CardContent className="pt-6">
        {list.length === 0 ? (
          <div className="text-center py-12"><ArrowLeftRight className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" /><p className="text-muted-foreground">No transfers found</p><p className="text-xs text-muted-foreground mt-1.5">Create your first transfer to get started.</p></div>
        ) : (
          <div className="rounded-lg border overflow-auto max-h-[calc(100vh-300px)]"><Table><TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>SN</TableHead><TableHead>Date</TableHead><TableHead>From</TableHead><TableHead>To</TableHead><TableHead>Item</TableHead><TableHead>Qty</TableHead><TableHead>Unit</TableHead><TableHead>Status</TableHead><TableHead>By</TableHead></TableRow></TableHeader>
            <TableBody>{list.map((t, i) => (
              <TableRow key={t.id} className="hover:bg-muted/30 transition-colors">
                <TableCell>{i+1}</TableCell>
                <TableCell>{t.date.slice(0, 10)}</TableCell>
                <TableCell>{t.fromOutlet?.name || "—"}</TableCell>
                <TableCell>{t.toOutlet?.name || "—"}</TableCell>
                <TableCell className="font-medium">{t.itemName}</TableCell>
                <TableCell>{t.quantity ?? "—"}</TableCell>
                <TableCell>{t.unit || "—"}</TableCell>
                <TableCell>
                  <Select value={t.status} onValueChange={(v) => handleStatusChange(t.id, v)}>
                    <SelectTrigger className="h-7 w-28 text-xs border-0 p-0 focus:ring-0">
                      <Badge variant="secondary" className={STATUS_STYLE[t.status] || ""}>{t.status}</Badge>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>{t.transferredBy || "—"}</TableCell>
              </TableRow>
            ))}</TableBody></Table></div>
        )}
      </CardContent></Card>

      <Dialog open={showAdd} onOpenChange={(open) => { if (!open) resetForm(); setShowAdd(open); }}>
        <DialogContent className="max-w-md"><DialogHeader><DialogTitle>New Transfer</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>From Outlet</Label><Select value={form.fromOutletId} onValueChange={v => setForm(p => ({...p, fromOutletId: v}))}><SelectTrigger><SelectValue placeholder="From" /></SelectTrigger><SelectContent>{outlets.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label>To Outlet</Label><Select value={form.toOutletId} onValueChange={v => setForm(p => ({...p, toOutletId: v}))}><SelectTrigger><SelectValue placeholder="To" /></SelectTrigger><SelectContent>{outlets.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="space-y-1.5"><Label>Item Name</Label><Input placeholder="e.g. All Purpose Flour" value={form.itemName} onChange={e => setForm(p => ({...p, itemName: e.target.value}))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Quantity</Label><Input type="number" placeholder="0" value={form.quantity} onChange={e => setForm(p => ({...p, quantity: e.target.value}))} /></div>
              <div className="space-y-1.5"><Label>Unit</Label><Input placeholder="kg, litre..." value={form.unit} onChange={e => setForm(p => ({...p, unit: e.target.value}))} /></div>
            </div>
            <div className="space-y-1.5"><Label>Notes</Label><Textarea placeholder="Notes..." value={form.notes} onChange={e => setForm(p => ({...p, notes: e.target.value}))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => { resetForm(); setShowAdd(false); }}>Cancel</Button><Button className="gradient-primary text-primary-foreground" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Create Transfer"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
export default Transfers;

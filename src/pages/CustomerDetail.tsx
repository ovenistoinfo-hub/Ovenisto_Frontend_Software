import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useData } from "@/contexts/DataContext";
import { customerService } from "@/services/customer.service";
import { orderService, type OrderRecord } from "@/services/order.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ArrowLeft, ShoppingCart, DollarSign, TrendingUp, CreditCard, Pencil, User, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";

const statusColor: Record<string, string> = {
  completed: "bg-success/10 text-success",
  preparing: "bg-accent/10 text-accent",
  pending: "bg-warning/10 text-warning",
  cancelled: "bg-destructive/10 text-destructive",
  ready: "bg-info/10 text-info",
};

const CustomerDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { settings } = useData();
  const queryClient = useQueryClient();
  const currency = settings.currency || "Rs.";

  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", phone: "", email: "", address: "" });
  const [saving, setSaving] = useState(false);

  const { data: customer, isLoading, isError } = useQuery({
    queryKey: ["customer", id],
    queryFn: () => customerService.getCustomer(id!),
    enabled: !!id,
  });

  const { data: ordersResp } = useQuery({
    queryKey: ["orders", { customerSearch: customer?.name }],
    queryFn: () => orderService.getOrders({ search: customer?.name, limit: 100 }),
    enabled: !!customer?.name,
  });
  const customerOrders: OrderRecord[] = (ordersResp?.data ?? []).filter(
    (o) => o.customerName === customer?.name
  );

  const openEdit = () => {
    if (!customer) return;
    setEditForm({ name: customer.name, phone: customer.phone ?? "", email: customer.email ?? "", address: customer.address ?? "" });
    setShowEdit(true);
  };

  const handleEdit = async () => {
    if (!editForm.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      await customerService.updateCustomer(id!, editForm);
      queryClient.invalidateQueries({ queryKey: ["customer", id] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setShowEdit(false);
      toast.success("Customer updated");
    } catch {
      toast.error("Failed to update customer");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg mt-2" />)}
    </div>
  );

  if (isError || !customer) return (
    <div className="p-6 space-y-4">
      <p className="text-muted-foreground">Customer not found</p>
      <Link to="/customers"><Button variant="outline"><ArrowLeft className="h-4 w-4 mr-2" />Back to Customers</Button></Link>
    </div>
  );

  const avgOrder = customerOrders.length > 0 ? Math.round(customer.totalSpent / customerOrders.length) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/customers"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <PageHeader
          icon={<User className="h-5 w-5" />}
          title={customer.name}
          subtitle="Customer profile and history"
          actions={<Button variant="outline" size="sm" onClick={openEdit}><Pencil className="h-3 w-3 mr-1" />Edit</Button>}
        />
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
          <div className="h-16 w-16 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-2xl font-bold shrink-0">
            {customer.name.charAt(0)}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1 text-sm">
            <div><span className="text-muted-foreground block">Phone</span><span className="font-medium">{customer.phone ?? "—"}</span></div>
            <div><span className="text-muted-foreground block">Email</span><span className="font-medium">{customer.email ?? "—"}</span></div>
            <div><span className="text-muted-foreground block">Address</span><span className="font-medium">{customer.address ?? "—"}</span></div>
            <div><span className="text-muted-foreground block">Last Order</span><span className="font-medium">{customer.lastOrder ?? "—"}</span></div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm"><CardContent className="p-5"><div className="flex items-center gap-4"><div className="h-11 w-11 rounded-xl bg-info/10 flex items-center justify-center shrink-0"><ShoppingCart className="h-5 w-5 text-info" /></div><div><p className="text-sm text-muted-foreground">Total Orders</p><p className="text-2xl font-bold tracking-tight">{customer.totalOrders}</p></div></div></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-5"><div className="flex items-center gap-4"><div className="h-11 w-11 rounded-xl bg-success/10 flex items-center justify-center shrink-0"><DollarSign className="h-5 w-5 text-success" /></div><div><p className="text-sm text-muted-foreground">Total Spent</p><p className="text-2xl font-bold tracking-tight">{currency} {customer.totalSpent.toLocaleString()}</p></div></div></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-5"><div className="flex items-center gap-4"><div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><TrendingUp className="h-5 w-5 text-primary" /></div><div><p className="text-sm text-muted-foreground">Avg Order</p><p className="text-2xl font-bold tracking-tight">{currency} {avgOrder.toLocaleString()}</p></div></div></CardContent></Card>
        <Card className={`shadow-sm ${customer.outstandingDue > 0 ? "border-destructive/30" : "border-success/30"}`}><CardContent className="p-5"><div className="flex items-center gap-4"><div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${customer.outstandingDue > 0 ? "bg-destructive/10" : "bg-success/10"}`}><CreditCard className={`h-5 w-5 ${customer.outstandingDue > 0 ? "text-destructive" : "text-success"}`} /></div><div><p className="text-sm text-muted-foreground">Outstanding Due</p><p className={`text-2xl font-bold tracking-tight ${customer.outstandingDue > 0 ? "text-destructive" : "text-success"}`}>{currency} {customer.outstandingDue.toLocaleString()}</p></div></div></CardContent></Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader><CardTitle className="text-base">Order History</CardTitle></CardHeader>
        <CardContent>
          {customerOrders.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No orders found</p>
          ) : (
            <div className="rounded-lg border overflow-auto max-h-[calc(100vh-600px)]">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead>Order #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customerOrders.map((o) => (
                    <TableRow key={o.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-medium">{o.orderNumber}</TableCell>
                      <TableCell>{o.date ? new Date(o.date).toLocaleDateString() : "—"} {o.time}</TableCell>
                      <TableCell><Badge variant="secondary">{o.type}</Badge></TableCell>
                      <TableCell>{o.items.length} items</TableCell>
                      <TableCell className="font-medium">{currency} {Number(o.total).toLocaleString()}</TableCell>
                      <TableCell><Badge variant="secondary" className={statusColor[o.status] ?? ""}>{o.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Customer</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input placeholder="Name" value={editForm.name} onChange={(e) => setEditForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Phone</Label><Input placeholder="Phone" value={editForm.phone} onChange={(e) => setEditForm(p => ({ ...p, phone: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input placeholder="Email" value={editForm.email} onChange={(e) => setEditForm(p => ({ ...p, email: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Address</Label><Input placeholder="Address" value={editForm.address} onChange={(e) => setEditForm(p => ({ ...p, address: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button className="gradient-primary text-primary-foreground" onClick={handleEdit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomerDetail;

import { useState } from "react";
import { Bike, Plus, MapPin, Phone, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { useData } from "@/contexts/DataContext";
import { toast } from "sonner";
import { DELIVERY_STATUS_COLORS } from "@/lib/constants";

const statusColors = DELIVERY_STATUS_COLORS;

const Delivery = () => {
  const { orders, riders, deliveryAssignments, addItem, updateItem, settings } = useData();
  const currency = settings.currency || "Rs.";
  const [filter, setFilter] = useState("All");
  const [showAssign, setShowAssign] = useState<string | null>(null);
  const [showAddRider, setShowAddRider] = useState(false);
  const [riderForm, setRiderForm] = useState({ name: "", phone: "" });
  const [selectedRider, setSelectedRider] = useState("");
  const [estTime, setEstTime] = useState("30");

  const deliveryOrders = orders.filter(o => o.type === "Delivery");
  const filteredOrders = deliveryOrders.filter(o => {
    if (filter === "Pending") return o.status === "pending";
    if (filter === "Dispatched") return o.status === "preparing";
    if (filter === "Delivered") return o.status === "completed";
    return true;
  });

  const getAssignment = (orderId: string) => deliveryAssignments.find(a => a.orderId === orderId);

  const handleAssign = () => {
    if (!showAssign || !selectedRider) return;
    const rider = riders.find(r => r.id === selectedRider);
    if (!rider) return;
    addItem("deliveryAssignments", {
      id: crypto.randomUUID(), orderId: showAssign, riderId: rider.id, riderName: rider.name,
      status: "dispatched", assignedAt: new Date().toISOString(), estimatedTime: Number(estTime),
      customerAddress: "Delivery Address", customerPhone: "",
    });
    updateItem("riders", rider.id, { activeDeliveries: rider.activeDeliveries + 1 });
    toast.success(`Assigned to ${rider.name}`);
    setShowAssign(null); setSelectedRider("");
  };

  const markDelivered = (assignmentId: string, riderId: string) => {
    updateItem("deliveryAssignments", assignmentId, { status: "delivered", deliveredAt: new Date().toISOString() });
    const rider = riders.find(r => r.id === riderId);
    if (rider) updateItem("riders", riderId, { activeDeliveries: Math.max(0, rider.activeDeliveries - 1) });
    toast.success("Marked as delivered");
  };

  const addRider = () => {
    if (!riderForm.name.trim()) { toast.error("Name required"); return; }
    addItem("riders", { id: crypto.randomUUID(), name: riderForm.name, phone: riderForm.phone, isAvailable: true, activeDeliveries: 0 });
    setShowAddRider(false); setRiderForm({ name: "", phone: "" }); toast.success("Rider added");
  };

  return (
    <div className="space-y-6">
      <PageHeader icon={<Bike className="h-5 w-5" />} title="Delivery Management" subtitle="Track delivery orders and riders"
        actions={<Button className="gradient-primary text-primary-foreground" onClick={() => setShowAddRider(true)}><Plus className="h-4 w-4 mr-2" />Add Rider</Button>} />
      <div className="flex gap-1.5 flex-wrap">{["All", "Pending", "Dispatched", "Delivered"].map(s => (
        <Button key={s} variant={filter === s ? "default" : "outline"} size="sm" onClick={() => setFilter(s)} className={filter === s ? "gradient-primary text-primary-foreground" : ""}>{s}</Button>
      ))}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredOrders.map(o => {
          const assignment = getAssignment(o.id);
          return (
            <Card key={o.id} className="shadow-sm">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between"><span className="font-bold text-sm">{o.orderNumber}</span><Badge variant="secondary" className={statusColors[assignment?.status || "pending"]}>{assignment?.status || "Not Assigned"}</Badge></div>
                <div className="text-sm space-y-1">
                  <p className="font-medium">{o.customer}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />Delivery Address</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />{o.phone || "N/A"}</p>
                  <p className="font-bold text-primary">{currency} {o.total.toLocaleString()}</p>
                </div>
                {assignment ? (
                  <div className="space-y-2">
                    <p className="text-xs"><Bike className="h-3 w-3 inline mr-1" />Rider: <strong>{assignment.riderName}</strong></p>
                    <p className="text-xs text-muted-foreground"><Clock className="h-3 w-3 inline mr-1" />Est. {assignment.estimatedTime} min</p>
                    {assignment.status === "dispatched" && <Button size="sm" className="w-full gradient-primary text-primary-foreground" onClick={() => markDelivered(assignment.id, assignment.riderId)}>Mark Delivered</Button>}
                  </div>
                ) : (
                  <Button size="sm" variant="outline" className="w-full" onClick={() => setShowAssign(o.id)}>Assign Rider</Button>
                )}
              </CardContent>
            </Card>
          );
        })}
        {filteredOrders.length === 0 && <p className="text-muted-foreground col-span-full text-center py-12">No delivery orders</p>}
      </div>
      <Card className="shadow-sm"><CardHeader><CardTitle className="text-base">Riders Summary</CardTitle></CardHeader><CardContent>
        <Table><TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>Rider</TableHead><TableHead>Phone</TableHead><TableHead>Active</TableHead><TableHead>Available</TableHead></TableRow></TableHeader>
          <TableBody>{riders.map(r => (<TableRow key={r.id} className="hover:bg-muted/30 transition-colors"><TableCell className="font-medium">{r.name}</TableCell><TableCell>{r.phone}</TableCell><TableCell>{r.activeDeliveries}</TableCell><TableCell><Badge variant="secondary" className={r.isAvailable ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}>{r.isAvailable ? "Yes" : "No"}</Badge></TableCell></TableRow>))}</TableBody></Table>
      </CardContent></Card>
      <Dialog open={!!showAssign} onOpenChange={() => setShowAssign(null)}><DialogContent><DialogHeader><DialogTitle>Assign Rider</DialogTitle></DialogHeader>
        <div className="space-y-3"><div><Label>Rider</Label><Select value={selectedRider} onValueChange={setSelectedRider}><SelectTrigger><SelectValue placeholder="Select rider" /></SelectTrigger><SelectContent>{riders.filter(r => r.isAvailable).map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Estimated Time (min)</Label><Input type="number" value={estTime} onChange={e => setEstTime(e.target.value)} /></div></div>
        <DialogFooter><Button variant="outline" onClick={() => setShowAssign(null)}>Cancel</Button><Button className="gradient-primary text-primary-foreground" onClick={handleAssign}>Assign</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={showAddRider} onOpenChange={setShowAddRider}><DialogContent><DialogHeader><DialogTitle>Add Rider</DialogTitle></DialogHeader>
        <div className="space-y-3"><div><Label>Name</Label><Input value={riderForm.name} onChange={e => setRiderForm(p => ({ ...p, name: e.target.value }))} /></div><div><Label>Phone</Label><Input value={riderForm.phone} onChange={e => setRiderForm(p => ({ ...p, phone: e.target.value }))} /></div></div>
        <DialogFooter><Button variant="outline" onClick={() => setShowAddRider(false)}>Cancel</Button><Button className="gradient-primary text-primary-foreground" onClick={addRider}>Add</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
};
export default Delivery;

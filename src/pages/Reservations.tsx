import { useState, useMemo } from "react";
import { CalendarCheck, Plus, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { useData } from "@/contexts/DataContext";
import { toast } from "sonner";
import type { Reservation } from "@/contexts/DataContext";

const statusColors: Record<string, string> = { pending: "bg-warning/10 text-warning", confirmed: "bg-info/10 text-info", seated: "bg-primary/10 text-primary", completed: "bg-success/10 text-success", cancelled: "bg-destructive/10 text-destructive", noShow: "bg-muted text-muted-foreground" };

const Reservations = () => {
  const { reservations, tables, addItem, updateItem, removeItem } = useData();
  const [dateFilter, setDateFilter] = useState("Today");
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0];
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split("T")[0]; })();

  const [form, setForm] = useState<Partial<Reservation>>({ customerName: "", customerPhone: "", date: today, time: "19:00", guestCount: 2, source: "phone", status: "pending" });

  const filtered = useMemo(() => {
    return reservations.filter(r => {
      if (dateFilter === "Today") return r.date === today;
      if (dateFilter === "Tomorrow") return r.date === tomorrow;
      if (dateFilter === "This Week") {
        const d = new Date(r.date); const now = new Date();
        const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
        const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 7);
        return d >= weekStart && d < weekEnd;
      }
      return true;
    }).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  }, [reservations, dateFilter, today, tomorrow]);

  const todayRes = reservations.filter(r => r.date === today);
  const upcomingRes = reservations.filter(r => r.date > today);
  const confirmedCount = reservations.filter(r => r.status === "confirmed").length;
  const cancelledCount = reservations.filter(r => r.status === "cancelled").length;

  const openAdd = () => { setEditId(null); setForm({ customerName: "", customerPhone: "", date: today, time: "19:00", guestCount: 2, source: "phone", status: "pending" }); setShowDialog(true); };
  const openEdit = (r: Reservation) => { setEditId(r.id); setForm(r); setShowDialog(true); };

  const handleSave = () => {
    if (!form.customerName?.trim()) { toast.error("Customer name required"); return; }
    if (editId) { updateItem("reservations", editId, form as any); toast.success("Updated"); }
    else { addItem("reservations", { id: crypto.randomUUID(), createdAt: today, ...form } as Reservation); toast.success("Reservation added"); }
    setShowDialog(false);
  };

  const changeStatus = (id: string, status: Reservation["status"]) => { updateItem("reservations", id, { status }); toast.success(`Status: ${status}`); };

  return (
    <div className="space-y-6">
      <PageHeader icon={<CalendarCheck className="h-5 w-5" />} title="Reservations" subtitle="Table bookings and reservation management"
        actions={<Button className="gradient-primary text-primary-foreground" onClick={openAdd}><Plus className="h-4 w-4 mr-2" />New Reservation</Button>} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="shadow-sm"><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Today's</p><p className="text-2xl font-bold">{todayRes.length}</p></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Upcoming</p><p className="text-2xl font-bold">{upcomingRes.length}</p></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Confirmed</p><p className="text-2xl font-bold">{confirmedCount}</p></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Cancelled</p><p className="text-2xl font-bold">{cancelledCount}</p></CardContent></Card>
      </div>
      <div className="flex gap-1.5 flex-wrap">{["Today", "Tomorrow", "This Week", "All"].map(s => (
        <Button key={s} variant={dateFilter === s ? "default" : "outline"} size="sm" onClick={() => setDateFilter(s)} className={dateFilter === s ? "gradient-primary text-primary-foreground" : ""}>{s}</Button>
      ))}</div>
      <Card className="shadow-sm"><CardContent className="pt-4"><div className="overflow-x-auto"><Table>
        <TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>Time</TableHead><TableHead>Customer</TableHead><TableHead>Guests</TableHead><TableHead>Table</TableHead><TableHead>Source</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
        <TableBody>{filtered.map(r => (
          <TableRow key={r.id} className="hover:bg-muted/30 transition-colors">
            <TableCell className="font-medium">{r.time}</TableCell>
            <TableCell><div><p className="font-medium">{r.customerName}</p><p className="text-xs text-muted-foreground">{r.customerPhone}</p></div></TableCell>
            <TableCell>{r.guestCount}</TableCell>
            <TableCell>{r.tableNumber || "—"}</TableCell>
            <TableCell className="capitalize text-xs">{r.source}</TableCell>
            <TableCell><Badge variant="secondary" className={statusColors[r.status]}>{r.status}</Badge></TableCell>
            <TableCell>
              <div className="flex gap-1 flex-wrap">
                {r.status === "pending" && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => changeStatus(r.id, "confirmed")}>Confirm</Button>}
                {r.status === "confirmed" && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => changeStatus(r.id, "seated")}>Seat</Button>}
                {r.status === "seated" && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => changeStatus(r.id, "completed")}>Complete</Button>}
                {(r.status === "pending" || r.status === "confirmed") && <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => changeStatus(r.id, "cancelled")}>Cancel</Button>}
                {r.status === "confirmed" && <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => changeStatus(r.id, "noShow")}>No Show</Button>}
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3 w-3" /></Button>
              </div>
            </TableCell>
          </TableRow>
        ))}{filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No reservations</TableCell></TableRow>}</TableBody>
      </Table></div></CardContent></Card>
      <Dialog open={showDialog} onOpenChange={setShowDialog}><DialogContent><DialogHeader><DialogTitle>{editId ? "Edit" : "New"} Reservation</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><Label>Customer Name</Label><Input value={form.customerName || ""} onChange={e => setForm(p => ({ ...p, customerName: e.target.value }))} /></div><div><Label>Phone</Label><Input value={form.customerPhone || ""} onChange={e => setForm(p => ({ ...p, customerPhone: e.target.value }))} /></div></div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><div><Label>Date</Label><Input type="date" value={form.date || ""} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} /></div><div><Label>Time</Label><Input type="time" value={form.time || ""} onChange={e => setForm(p => ({ ...p, time: e.target.value }))} /></div><div><Label>Guests</Label><Input type="number" value={form.guestCount || ""} onChange={e => setForm(p => ({ ...p, guestCount: Number(e.target.value) }))} /></div></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><Label>Table</Label><Select value={form.tableNumber || ""} onValueChange={v => setForm(p => ({ ...p, tableNumber: v }))}><SelectTrigger><SelectValue placeholder="Select table" /></SelectTrigger><SelectContent>{tables.map(t => <SelectItem key={t.id} value={t.number}>{t.number} ({t.capacity} seats)</SelectItem>)}</SelectContent></Select></div><div><Label>Source</Label><Select value={form.source} onValueChange={v => setForm(p => ({ ...p, source: v as any }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="phone">Phone</SelectItem><SelectItem value="walkin">Walk-in</SelectItem><SelectItem value="online">Online</SelectItem></SelectContent></Select></div></div>
          <div><Label>Special Requests</Label><Textarea value={form.specialRequests || ""} onChange={e => setForm(p => ({ ...p, specialRequests: e.target.value }))} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button><Button className="gradient-primary text-primary-foreground" onClick={handleSave}>Save</Button></DialogFooter>
      </DialogContent></Dialog>
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Reservation?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { if (deleteId) { removeItem("reservations", deleteId); setDeleteId(null); toast.success("Deleted"); } }} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
};
export default Reservations;

import { useState } from "react";
import { Ticket, Plus, Pencil, Trash2, Search, Copy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { useData } from "@/contexts/DataContext";
import { toast } from "sonner";
import type { Coupon } from "@/contexts/DataContext";

const Coupons = () => {
  const { coupons, addItem, updateItem, removeItem } = useData();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const now = new Date().toISOString().split("T")[0];

  const [form, setForm] = useState<Partial<Coupon>>({ code: "", type: "percentage", value: 10, minOrderAmount: 0, usageLimit: 0, validFrom: now, validTo: "", isActive: true, applicableTo: "all" });

  const filtered = coupons.filter(c => {
    if (search && !c.code.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === "Active") return c.isActive && (c.validTo === "never" || c.validTo >= now) && (c.usageLimit === 0 || c.usedCount < c.usageLimit);
    if (filter === "Expired") return c.validTo !== "never" && c.validTo < now;
    if (filter === "Used Up") return c.usageLimit > 0 && c.usedCount >= c.usageLimit;
    return true;
  });

  const genCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  };

  const openAdd = () => { setEditId(null); setForm({ code: genCode(), type: "percentage", value: 10, minOrderAmount: 0, usageLimit: 0, validFrom: now, validTo: "", isActive: true, applicableTo: "all" }); setShowDialog(true); };
  const openEdit = (c: Coupon) => { setEditId(c.id); setForm(c); setShowDialog(true); };

  const handleSave = () => {
    if (!form.code?.trim()) { toast.error("Coupon code required"); return; }
    const code = form.code!.toUpperCase();
    if (editId) { updateItem("coupons", editId, { ...form, code }); toast.success("Coupon updated"); }
    else { addItem("coupons", { id: crypto.randomUUID(), usedCount: 0, createdAt: now, ...form, code, validTo: form.validTo || "never" } as Coupon); toast.success("Coupon created"); }
    setShowDialog(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader icon={<Ticket className="h-5 w-5" />} title="Coupons & Vouchers" subtitle="Manage discount codes and vouchers"
        actions={<Button className="gradient-primary text-primary-foreground" onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Create Coupon</Button>} />
      <Card className="shadow-sm">
        <CardHeader className="pb-3"><div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by code..." className="pl-9" /></div>
          <div className="flex gap-1.5 flex-wrap">{["All", "Active", "Expired", "Used Up"].map(s => (
            <Button key={s} variant={filter === s ? "default" : "outline"} size="sm" onClick={() => setFilter(s)} className={filter === s ? "gradient-primary text-primary-foreground" : ""}>{s}</Button>
          ))}</div>
        </div></CardHeader>
        <CardContent><div className="overflow-x-auto"><Table>
          <TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>Code</TableHead><TableHead>Type</TableHead><TableHead>Value</TableHead><TableHead>Used / Limit</TableHead><TableHead>Expires</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
          <TableBody>{filtered.map(c => (
            <TableRow key={c.id} className="hover:bg-muted/30 transition-colors">
              <TableCell><div className="flex items-center gap-1"><span className="font-mono font-bold">{c.code}</span><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { navigator.clipboard.writeText(c.code); toast.success("Copied"); }}><Copy className="h-3 w-3" /></Button></div></TableCell>
              <TableCell><Badge variant="secondary" className={c.type === "percentage" ? "bg-primary/10 text-primary" : "bg-info/10 text-info"}>{c.type === "percentage" ? "% Off" : "Fixed"}</Badge></TableCell>
              <TableCell className="font-medium">{c.type === "percentage" ? `${c.value}%` : `Rs. ${c.value}`}</TableCell>
              <TableCell>{c.usedCount} / {c.usageLimit || "∞"}</TableCell>
              <TableCell className="text-xs">{c.validTo === "never" ? "Never" : c.validTo}</TableCell>
              <TableCell><Badge variant="secondary" className={c.isActive ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}>{c.isActive ? "Active" : "Inactive"}</Badge></TableCell>
              <TableCell><div className="flex gap-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}><Pencil className="h-3 w-3" /></Button><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(c.id)}><Trash2 className="h-3 w-3" /></Button></div></TableCell>
            </TableRow>
          ))}{filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No coupons found</TableCell></TableRow>}</TableBody>
        </Table></div></CardContent>
      </Card>
      {showDialog && (
        <Card className="shadow-sm border-primary/30">
          <CardHeader className="pb-3"><CardTitle className="text-base">{editId ? "Edit" : "Create"} Coupon</CardTitle></CardHeader>
          <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2"><div className="flex-1"><Label>Code</Label><Input value={form.code || ""} onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))} /></div><Button variant="outline" className="sm:mt-6 shrink-0" onClick={() => setForm(p => ({ ...p, code: genCode() }))}>Generate</Button></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><Label>Type</Label><Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v as "percentage" | "fixed" }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="percentage">Percentage</SelectItem><SelectItem value="fixed">Fixed Amount</SelectItem></SelectContent></Select></div><div><Label>Value</Label><Input type="number" value={form.value || ""} onChange={e => setForm(p => ({ ...p, value: Number(e.target.value) }))} /></div></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><Label>Min Order (Rs.)</Label><Input type="number" value={form.minOrderAmount || ""} onChange={e => setForm(p => ({ ...p, minOrderAmount: Number(e.target.value) }))} /></div>{form.type === "percentage" && <div><Label>Max Discount (Rs.)</Label><Input type="number" value={form.maxDiscount || ""} onChange={e => setForm(p => ({ ...p, maxDiscount: Number(e.target.value) }))} /></div>}</div>
          <div><Label>Usage Limit (0 = unlimited)</Label><Input type="number" value={form.usageLimit || ""} onChange={e => setForm(p => ({ ...p, usageLimit: Number(e.target.value) }))} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><Label>Valid From</Label><Input type="date" value={form.validFrom || ""} onChange={e => setForm(p => ({ ...p, validFrom: e.target.value }))} /></div><div><Label>Valid To</Label><Input type="date" value={form.validTo === "never" ? "" : form.validTo || ""} onChange={e => setForm(p => ({ ...p, validTo: e.target.value || "never" }))} /></div></div>
          <div><Label>Applicable To</Label><Select value={form.applicableTo} onValueChange={v => setForm(p => ({ ...p, applicableTo: v as any }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Orders</SelectItem><SelectItem value="dineIn">Dine In</SelectItem><SelectItem value="delivery">Delivery</SelectItem><SelectItem value="takeAway">Take Away</SelectItem><SelectItem value="online">Online</SelectItem></SelectContent></Select></div>
          <div className="flex items-center justify-between"><Label>Active</Label><Switch checked={form.isActive} onCheckedChange={c => setForm(p => ({ ...p, isActive: c }))} /></div>
        <div className="flex justify-end gap-2 pt-1"><Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button><Button className="gradient-primary text-primary-foreground" onClick={handleSave}>Save</Button></div>
        </CardContent>
      </Card>
      )}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Coupon?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { if (deleteId) { removeItem("coupons", deleteId); setDeleteId(null); toast.success("Deleted"); } }} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
};
export default Coupons;

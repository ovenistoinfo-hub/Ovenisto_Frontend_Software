import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Search, Pencil, Trash2, Shield } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { toast } from "sonner";
import { useData } from "@/contexts/DataContext";

const roleColors: Record<string, string> = { "Super Admin": "bg-purple-100 text-purple-700", Admin: "bg-destructive/10 text-destructive", Manager: "bg-info/10 text-info", Cashier: "bg-success/10 text-success", Waiter: "bg-warning/10 text-warning", "Kitchen Staff": "bg-accent/10 text-accent" };
const roles = ["Super Admin", "Admin", "Manager", "Cashier", "Waiter", "Kitchen Staff"];
const modules = ["Dashboard", "POS", "Kitchen", "Menu Items", "Stock/Inventory", "Sales", "Customers", "Purchases", "Expenses", "Reports", "Users", "Settings"];
const permTypes = ["view", "create", "edit", "delete"];
const rolePresets: Record<string, Record<string, string[]>> = {
  "Super Admin": Object.fromEntries(modules.map(m => [m, ["view", "create", "edit", "delete"]])),
  Admin: Object.fromEntries(modules.map(m => [m, ["view", "create", "edit", "delete"]])),
  Manager: Object.fromEntries(modules.map(m => [m, m === "Users" || m === "Settings" ? ["view"] : ["view", "create", "edit", "delete"]])),
  Cashier: Object.fromEntries(modules.map(m => [m, m === "POS" || m === "Sales" ? ["view", "create"] : m === "Dashboard" ? ["view"] : []])),
  Waiter: Object.fromEntries(modules.map(m => [m, m === "POS" ? ["view"] : m === "Dashboard" ? ["view"] : []])),
  "Kitchen Staff": Object.fromEntries(modules.map(m => [m, m === "Kitchen" ? ["view", "create", "edit"] : m === "Dashboard" ? ["view"] : []])),
};

const Users = () => {
  const { users: list, addItem, updateItem, removeItem } = useData();
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", email: "", phone: "", role: "Cashier" });
  const [perms, setPerms] = useState<Record<string, string[]>>(rolePresets["Cashier"]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { const t = setTimeout(() => setLoading(false), 500); return () => clearTimeout(t); }, []);

  const filtered = list.filter((u) => u.name.toLowerCase().includes(search.toLowerCase()));
  const openAdd = () => { setEditingId(null); setForm({ name: "", email: "", phone: "", role: "Cashier" }); setPerms(rolePresets["Cashier"]); setShowDialog(true); };
  const openEdit = (u: typeof list[0]) => { setEditingId(u.id); setForm({ name: u.name, email: u.email, phone: u.phone, role: u.role }); setPerms(rolePresets[u.role] || rolePresets["Cashier"]); setShowDialog(true); };
  const handleRoleChange = (role: string) => { setForm(p => ({ ...p, role })); setPerms(rolePresets[role] || {}); };
  const togglePerm = (mod: string, perm: string) => { setPerms(p => { const current = p[mod] || []; return { ...p, [mod]: current.includes(perm) ? current.filter(pp => pp !== perm) : [...current, perm] }; }); };

  const handleSave = () => {
    if (!form.name) return;
    if (editingId) { updateItem("users", editingId, form); toast.success("Updated"); }
    else { addItem("users", { id: crypto.randomUUID(), ...form, branch: "Main Branch", status: "active", lastLogin: "—", avatar: "" }); toast.success("User added"); }
    setShowDialog(false); setEditingId(null);
  };

  if (loading) return <div className="space-y-6"><div className="flex items-center justify-between"><Skeleton className="h-8 w-48" /><Skeleton className="h-10 w-32" /></div><Card className="shadow-sm"><CardContent className="pt-6 space-y-3">{Array.from({length:5}).map((_,i)=><Skeleton key={i} className="h-10 w-full" />)}</CardContent></Card></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Shield className="h-5 w-5" />}
        title="Users & Permissions"
        subtitle="Manage staff accounts"
        actions={<Button className="gradient-primary text-primary-foreground" onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add User</Button>}
      />
      <Card className="shadow-sm"><CardHeader className="pb-3"><div className="relative max-w-sm"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="pl-9" /></div></CardHeader>
        <CardContent>{filtered.length === 0 ? (<div className="text-center py-12"><Shield className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" /><p className="text-muted-foreground">No users found</p><Button size="sm" className="gradient-primary text-primary-foreground mt-3" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add User</Button></div>) : (
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="sticky top-0 z-10 bg-card">SN</TableHead>
                <TableHead className="sticky top-0 z-10 bg-card">Name</TableHead>
                <TableHead className="sticky top-0 z-10 bg-card">Email</TableHead>
                <TableHead className="sticky top-0 z-10 bg-card">Phone</TableHead>
                <TableHead className="sticky top-0 z-10 bg-card">Role</TableHead>
                <TableHead className="sticky top-0 z-10 bg-card">Branch</TableHead>
                <TableHead className="sticky top-0 z-10 bg-card">Status</TableHead>
                <TableHead className="sticky top-0 z-10 bg-card">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>{filtered.map((u, i) => (<TableRow key={u.id} className="hover:bg-muted/30 transition-colors"><TableCell>{i+1}</TableCell><TableCell className="font-medium">{u.name}</TableCell><TableCell>{u.email}</TableCell><TableCell>{u.phone}</TableCell><TableCell><Badge variant="secondary" className={roleColors[u.role] || ""}>{u.role}</Badge></TableCell><TableCell>{u.branch}</TableCell><TableCell><Badge variant="secondary" className="bg-success/10 text-success">{u.status}</Badge></TableCell><TableCell><div className="flex gap-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(u)}><Pencil className="h-3 w-3" /></Button><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { removeItem("users", u.id); toast.success("Deleted"); }}><Trash2 className="h-3 w-3" /></Button></div></TableCell></TableRow>))}</TableBody>
          </Table>
          </div>
        )}</CardContent></Card>
      <Dialog open={showDialog} onOpenChange={setShowDialog}><DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{editingId ? "Edit" : "Add"} User</DialogTitle></DialogHeader>
        <div className="space-y-4"><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><Input placeholder="Full Name" value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} /><Input placeholder="Email" value={form.email} onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))} /><Input placeholder="Phone" value={form.phone} onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))} /><Select value={form.role} onValueChange={handleRoleChange}><SelectTrigger><SelectValue placeholder="Role" /></SelectTrigger><SelectContent>{roles.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></div>
          <div><label className="text-sm font-medium mb-2 block">Permissions</label><div className="border rounded-lg overflow-hidden"><table className="w-full text-xs"><thead><tr className="bg-muted"><th className="text-left p-2 font-medium">Module</th>{permTypes.map(p => <th key={p} className="p-2 font-medium capitalize text-center">{p}</th>)}</tr></thead>
            <tbody>{modules.map(mod => (<tr key={mod} className="border-t"><td className="p-2 font-medium">{mod}</td>{permTypes.map(perm => (<td key={perm} className="p-2 text-center">{(mod === "Dashboard" || mod === "Sales" || mod === "Reports") && perm !== "view" ? <span className="text-muted-foreground">—</span> : (mod === "Settings") && (perm === "create" || perm === "delete") ? <span className="text-muted-foreground">—</span> : <Checkbox checked={(perms[mod] || []).includes(perm)} onCheckedChange={() => togglePerm(mod, perm)} />}</td>))}</tr>))}</tbody></table></div></div></div>
        <DialogFooter><Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button><Button className="gradient-primary text-primary-foreground" onClick={handleSave}>Save</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
};
export default Users;

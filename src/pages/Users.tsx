import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { userService, type UserRecord, type UnlinkedEmployee } from "@/services/user.service";
import { outletService, type OutletRecord } from "@/services/outlet.service";
import { useAuth } from "@/contexts/AuthContext";

const roleColors: Record<string, string> = {
  "Super Admin": "bg-purple-100 text-purple-700",
  Admin: "bg-destructive/10 text-destructive",
  Manager: "bg-info/10 text-info",
  "Floor Manager": "bg-teal-100 text-teal-700",
  Cashier: "bg-success/10 text-success",
  Waiter: "bg-warning/10 text-warning",
  "Kitchen Manager": "bg-orange-100 text-orange-700",
  "Kitchen Staff": "bg-accent/10 text-accent",
  "Delivery Manager": "bg-sky-100 text-sky-700",
  "Store Manager": "bg-indigo-100 text-indigo-700",
  Accountant: "bg-emerald-100 text-emerald-700",
  Rider: "bg-amber-100 text-amber-700",
  "Customer Screen": "bg-slate-100 text-slate-600",
};

const roles = [
  "Super Admin", "Admin", "Manager", "Floor Manager", "Cashier", "Waiter",
  "Kitchen Manager", "Kitchen Staff", "Delivery Manager", "Store Manager",
  "Accountant", "Rider", "Customer Screen",
];

const modules = [
  "Dashboard", "POS", "Kitchen", "Waiter", "Menu Items", "Stock/Inventory",
  "Production", "Sales", "Customers", "Delivery", "Purchases", "Expenses",
  "Reports", "Users", "Settings", "My Portal", "Attendance",
];
const permTypes = ["view", "create", "edit", "delete"];

const rolePresets: Record<string, Record<string, string[]>> = {
  "Super Admin": Object.fromEntries(modules.map(m => [m, ["view", "create", "edit", "delete"]])),
  Admin: Object.fromEntries(modules.map(m => [m, ["view", "create", "edit", "delete"]])),
  Manager: Object.fromEntries(modules.map(m => [m, m === "Users" || m === "Settings" ? ["view"] : ["view", "create", "edit", "delete"]])),
  "Floor Manager": Object.fromEntries(modules.map(m => [m,
    ["Dashboard", "Waiter", "Customers", "My Portal", "Attendance"].includes(m) ? ["view", "create", "edit", "delete"] :
    m === "Kitchen" || m === "Sales" ? ["view"] : []])),
  Cashier: Object.fromEntries(modules.map(m => [m,
    m === "POS" || m === "Sales" ? ["view", "create"] :
    ["Dashboard", "Customers", "My Portal", "Attendance"].includes(m) ? ["view"] : []])),
  Waiter: Object.fromEntries(modules.map(m => [m,
    m === "Waiter" ? ["view", "create", "edit"] :
    m === "My Portal" || m === "Attendance" ? ["view"] : []])),
  "Kitchen Manager": Object.fromEntries(modules.map(m => [m,
    ["Kitchen", "Menu Items", "Production"].includes(m) ? ["view", "create", "edit", "delete"] :
    m === "My Portal" || m === "Attendance" ? ["view"] : []])),
  "Kitchen Staff": Object.fromEntries(modules.map(m => [m,
    m === "Kitchen" ? ["view", "create", "edit"] :
    m === "My Portal" || m === "Attendance" ? ["view"] : []])),
  "Delivery Manager": Object.fromEntries(modules.map(m => [m,
    m === "Delivery" ? ["view", "create", "edit", "delete"] :
    m === "Sales" ? ["view", "create"] :
    m === "My Portal" || m === "Attendance" ? ["view"] : []])),
  "Store Manager": Object.fromEntries(modules.map(m => [m,
    ["Stock/Inventory", "Production", "Purchases", "Menu Items"].includes(m) ? ["view", "create", "edit", "delete"] :
    m === "My Portal" || m === "Attendance" ? ["view"] : []])),
  Accountant: Object.fromEntries(modules.map(m => [m,
    ["Sales", "Purchases", "Expenses", "Reports"].includes(m) ? ["view", "create", "edit"] :
    m === "Customers" ? ["view"] :
    m === "My Portal" || m === "Attendance" ? ["view"] : []])),
  Rider: Object.fromEntries(modules.map(m => [m,
    m === "My Portal" || m === "Attendance" ? ["view"] : []])),
  "Customer Screen": Object.fromEntries(modules.map(m => [m,
    m === "Dashboard" ? ["view"] : []])),
};

// Roles that should be scoped to a specific branch
const branchScopedRoles = ["Admin", "Manager", "Floor Manager", "Kitchen Manager", "Store Manager", "Delivery Manager", "Cashier", "Waiter", "Kitchen Staff", "Accountant", "Rider", "Customer Screen"];

// Auto-format phone as 03XX-XXXXXXX (11 digits)
const formatPhone = (val: string): string => {
  const digits = val.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
};

const Users = () => {
  const queryClient = useQueryClient();
  const { user: authUser } = useAuth();
  const isAdminOrHigher = ["Super Admin", "Admin"].includes(authUser?.role ?? "");
  const isManager = authUser?.role === "Manager";

  // Roles manager is NOT allowed to create or see
  const ownerRoles = ["Admin", "Super Admin"];

  // Roles available in the dropdown depending on actor
  const availableRoles = isManager
    ? roles.filter(r => !ownerRoles.includes(r))
    : roles;

  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [form, setForm] = useState({ name: "", email: "", phone: "", role: "Cashier", password: "", branch: "", outletId: "" });
  const [perms, setPerms] = useState<Record<string, string[]>>(rolePresets["Cashier"]);
  const [saving, setSaving] = useState(false);
  const [outlets, setOutlets] = useState<OutletRecord[]>([]);
  const [unlinkedEmployees, setUnlinkedEmployees] = useState<UnlinkedEmployee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("none");

  const { data: list = [], isLoading: loading } = useQuery({
    queryKey: ["users"],
    queryFn: () => userService.getUsers({ limit: 100 }).then(r => r.data),
  });

  // Fetch outlets for the dropdown
  useEffect(() => {
    outletService.getOutlets().then(setOutlets).catch(() => {});
  }, []);

  const filtered = list.filter((u) => {
    // Manager cannot see Admin or Super Admin accounts
    if (isManager && ownerRoles.includes(u.role)) return false;
    const matchesSearch = u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole = filterRole === "all" || u.role === filterRole;
    return matchesSearch && matchesRole;
  });

  const openAdd = () => {
    setEditingId(null);
    const defaultRole = isManager ? "Cashier" : "Cashier";
    setForm({ name: "", email: "", phone: "", role: defaultRole, password: "", branch: "", outletId: "" });
    setPerms(rolePresets[defaultRole]);
    setSelectedEmployeeId("none");
    setUnlinkedEmployees([]);
    userService.getUnlinkedEmployees()
      .then(setUnlinkedEmployees)
      .catch((err) => console.error("Failed to fetch unlinked employees", err));
    setShowDialog(true);
  };
  const openEdit = (u: UserRecord) => {
    // Manager cannot edit any user
    if (isManager) return;
    setEditingId(u.id);
    setForm({ name: u.name, email: u.email, phone: u.phone || "", role: u.role, password: "", branch: u.branch || u.outlet?.name || "", outletId: u.outletId || "" });
    setPerms(rolePresets[u.role] || rolePresets["Cashier"]);
    setShowDialog(true);
  };
  const handleEmployeeSelect = (empId: string) => {
    setSelectedEmployeeId(empId);
    if (empId === "none") {
      setForm(p => ({ ...p, name: "", email: "", phone: "", outletId: "" }));
      return;
    }
    const emp = unlinkedEmployees.find(e => e.id === empId);
    if (emp) {
      const fullName = [emp.firstName, emp.lastName].filter(Boolean).join(" ");
      const matchingRole = roles.find(r => r.toLowerCase() === emp.designation.toLowerCase());
      
      setForm(p => ({
        ...p,
        name: fullName,
        email: emp.email || "",
        phone: emp.phone || "",
        outletId: emp.outletId || "",
        role: matchingRole || p.role
      }));
      if (matchingRole) {
        setPerms(rolePresets[matchingRole] || {});
      }
    }
  };

  const handleRoleChange = (role: string) => {
    setForm(p => ({ ...p, role }));
    setPerms(rolePresets[role] || {});
  };
  const togglePerm = (mod: string, perm: string) => {
    setPerms(p => {
      const current = p[mod] || [];
      return { ...p, [mod]: current.includes(perm) ? current.filter(pp => pp !== perm) : [...current, perm] };
    });
  };

  const handleSave = async () => {
    if (!form.name || !form.email) { toast.error("Name and email are required"); return; }
    // Duplicate checks against existing users
    const lowerEmail = form.email.trim().toLowerCase();
    const cleanPhone = form.phone.trim();
    if (cleanPhone && cleanPhone.replace(/\D/g, "").length !== 11) {
      toast.error("Phone number must be exactly 11 digits");
      return;
    }
    if (list.some(u => u.id !== editingId && u.email.trim().toLowerCase() === lowerEmail)) {
      toast.error(`Email "${form.email}" is already used by another user!`);
      return;
    }
    if (cleanPhone && list.some(u => u.id !== editingId && (u.phone || "").trim() === cleanPhone)) {
      toast.error(`Phone number "${form.phone}" is already used by another user!`);
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        const updates: any = { name: form.name, email: form.email, phone: form.phone || null, role: form.role };
        if (form.outletId) updates.outletId = form.outletId;
        if (form.password) updates.password = form.password;
        await userService.updateUser(editingId, updates);
        toast.success("User updated");
      } else {
        if (!form.password) { toast.error("Password is required for new users"); setSaving(false); return; }
        await userService.createUser({
          name: form.name,
          email: form.email,
          password: form.password,
          phone: form.phone || null,
          role: form.role,
          outletId: form.outletId || null,
          employeeId: selectedEmployeeId === "none" ? null : selectedEmployeeId,
        });
        toast.success("User added");
      }
      setShowDialog(false);
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to save user");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    // Manager cannot delete any user
    if (isManager) return;
    if (!confirm(`Deactivate user "${name}"?`)) return;
    try {
      await userService.deleteUser(id);
      toast.success("User deactivated");
      queryClient.invalidateQueries({ queryKey: ["users"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete user");
    }
  };

  if (loading) return <div className="space-y-6"><div className="flex items-center justify-between"><Skeleton className="h-8 w-48" /><Skeleton className="h-10 w-32" /></div><Card className="shadow-sm"><CardContent className="pt-6 space-y-3">{Array.from({length:5}).map((_,i)=><Skeleton key={i} className="h-10 w-full" />)}</CardContent></Card></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Shield className="h-5 w-5" />}
        title="Users & Permissions"
        subtitle={`${filtered.length} staff accounts • ${roles.length} roles`}
        actions={
          (isAdminOrHigher || isManager) ? (
            <Button className="gradient-primary text-primary-foreground" onClick={openAdd}>
              <Plus className="h-4 w-4 mr-2" />Add User
            </Button>
          ) : undefined
        }
      />
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email..." className="pl-9" />
            </div>
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                {roles.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>{filtered.length === 0 ? (
          <div className="text-center py-12">
            <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" />
            <p className="text-muted-foreground">No users found</p>
            <Button size="sm" className="gradient-primary text-primary-foreground mt-3" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add User</Button>
          </div>
        ) : (
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
              <TableBody>{filtered.map((u, i) => (
                <TableRow key={u.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell>{i+1}</TableCell>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{u.phone || "—"}</TableCell>
                  <TableCell><Badge variant="secondary" className={roleColors[u.role] || ""}>{u.role}</Badge></TableCell>
                  <TableCell>{u.outlet?.name || u.branch || "—"}</TableCell>
                  <TableCell><Badge variant="secondary" className={u.status === "active" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}>{u.status}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {isAdminOrHigher && (
                        <>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(u)}><Pencil className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(u.id, u.name)}><Trash2 className="h-3 w-3" /></Button>
                        </>
                      )}
                      {isManager && (
                        <span className="text-xs text-muted-foreground italic px-1">View only</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}</TableBody>
          </Table>
          </div>
        )}</CardContent>
      </Card>

      {/* Add/Edit User Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "Edit" : "Add"} User</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Link to onboarded employee dropdown (only on Add User) */}
            {!editingId && (
              <div className="bg-primary/5 border border-primary/10 rounded-lg p-3">
                <label className="text-sm font-semibold mb-1 block text-primary">
                  Link to Onboarded Employee (Optional)
                </label>
                <p className="text-xs text-muted-foreground mb-2">
                  Select an onboarded employee who does not have a user account yet to pre-fill their details.
                </p>
                <Select value={selectedEmployeeId} onValueChange={handleEmployeeSelect}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select onboarded employee (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (Create Independent User)</SelectItem>
                    {unlinkedEmployees.map(emp => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.firstName} {emp.lastName || ""} — {emp.designation} {emp.outlet ? `(${emp.outlet.name})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Basic Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Full Name</label>
                <Input list="usr-name-list" placeholder="Full Name" value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} />
                <datalist id="usr-name-list">
                  {[...new Set(list.map(u => u.name).filter(Boolean))].map(n => <option key={n} value={n} />)}
                </datalist>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Email</label>
                <Input
                  placeholder="Email"
                  type="email"
                  list="usr-email-list"
                  value={form.email}
                  onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))}
                  className={form.email && list.some(u => u.id !== editingId && u.email.toLowerCase() === form.email.toLowerCase()) ? "border-destructive" : ""}
                />
                <datalist id="usr-email-list">
                  {[...new Set(list.map(u => u.email).filter(Boolean))].map(em => <option key={em} value={em} />)}
                </datalist>
                {form.email && list.some(u => u.id !== editingId && u.email.toLowerCase() === form.email.toLowerCase()) && (
                  <p className="text-[11px] text-destructive mt-0.5">⚠ This email is already used by another user</p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Phone</label>
                <Input
                  placeholder="Phone"
                  list="usr-phone-list"
                  value={form.phone}
                  maxLength={12}
                  onChange={(e) => setForm(p => ({ ...p, phone: formatPhone(e.target.value) }))}
                  className={form.phone && list.some(u => u.id !== editingId && (u.phone || "") === form.phone) ? "border-destructive" : ""}
                />
                <datalist id="usr-phone-list">
                  {[...new Set(list.map(u => u.phone).filter(Boolean))].map(ph => <option key={ph} value={ph} />)}
                </datalist>
                {form.phone && list.some(u => u.id !== editingId && (u.phone || "") === form.phone) && (
                  <p className="text-[11px] text-destructive mt-0.5">⚠ This phone is already used by another user</p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">{editingId ? "New Password (leave empty to keep)" : "Password"}</label>
                <Input placeholder="Password" type="password" value={form.password} onChange={(e) => setForm(p => ({ ...p, password: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Role</label>
                <Select value={form.role} onValueChange={handleRoleChange}>
                  <SelectTrigger><SelectValue placeholder="Role" /></SelectTrigger>
                  <SelectContent>{availableRoles.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {branchScopedRoles.includes(form.role) && (
                <div>
                  <label className="text-sm font-medium mb-1 block">Outlet / Branch</label>
                  <Select value={form.outletId} onValueChange={(val) => setForm(p => ({ ...p, outletId: val }))}>
                    <SelectTrigger><SelectValue placeholder="Select outlet" /></SelectTrigger>
                    <SelectContent>
                      {outlets.map(o => <SelectItem key={o.id} value={o.id}>{o.name} ({o.code})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Role Description */}
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <p className="font-medium mb-1">Role: <Badge variant="secondary" className={roleColors[form.role] || ""}>{form.role}</Badge></p>
              <p className="text-muted-foreground text-xs">
                {form.role === "Super Admin" && "Full access to all branches and all features."}
                {form.role === "Admin" && "Full access scoped to the assigned branch/outlet."}
                {form.role === "Manager" && "Manages operations for the assigned branch. Access to POS, kitchen, sales, stock, expenses, reports."}
                {form.role === "Floor Manager" && "Manages dining area — waiters, tables, reservations, customer display."}
                {form.role === "Cashier" && "POS operations, sales, customers, and customer dues."}
                {form.role === "Waiter" && "Waiter panel only — takes orders from the dining floor."}
                {form.role === "Kitchen Manager" && "Manages all kitchens, recipes, menu items, and production."}
                {form.role === "Kitchen Staff" && "Kitchen display only — views orders and marks them as ready."}
                {form.role === "Delivery Manager" && "Manages delivery orders, riders, and online orders."}
                {form.role === "Store Manager" && "Stock, ingredients, purchases, suppliers, transfers, and waste management."}
                {form.role === "Accountant" && "Financial access — sales, purchases, expenses, supplier dues, and reports."}
                {form.role === "Rider" && "Delivery rider — attendance and portal access only. (Future: Mobile app)"}
                {form.role === "Customer Screen" && "Customer-facing display only — shows order status screen."}
              </p>
            </div>

            {/* Permissions Matrix */}
            <div>
              <label className="text-sm font-medium mb-2 block">Permissions</label>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted">
                      <th className="text-left p-2 font-medium">Module</th>
                      {permTypes.map(p => <th key={p} className="p-2 font-medium capitalize text-center">{p}</th>)}
                    </tr>
                  </thead>
                  <tbody>{modules.map(mod => (
                    <tr key={mod} className="border-t">
                      <td className="p-2 font-medium">{mod}</td>
                      {permTypes.map(perm => (
                        <td key={perm} className="p-2 text-center">
                          {(["Dashboard", "Sales", "Reports", "My Portal", "Attendance"].includes(mod)) && perm !== "view" ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (mod === "Settings") && (perm === "create" || perm === "delete") ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <Checkbox
                              checked={(perms[mod] || []).includes(perm)}
                              onCheckedChange={() => togglePerm(mod, perm)}
                            />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button className="gradient-primary text-primary-foreground" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
export default Users;

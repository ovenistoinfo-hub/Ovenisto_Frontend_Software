import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus, Search, Pencil, Trash2, Shield, User, Mail, Phone, Lock, Building2,
  UserCheck, Crown, Sparkles, CheckCircle2, AlertCircle, Info, KeyRound,
  Users as UsersIcon, Check, Loader2, RotateCcw, Eye, ShieldCheck, UserPlus
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { toast } from "sonner";
import { userService, type UserRecord, type UnlinkedEmployee } from "@/services/user.service";
import { outletService, type OutletRecord } from "@/services/outlet.service";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const roleColors: Record<string, string> = {
  "Super Admin": "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30",
  Admin: "bg-destructive/15 text-destructive border-destructive/30",
  Manager: "bg-info/15 text-info border-info/30",
  "Floor Manager": "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30",
  Cashier: "bg-success/15 text-success border-success/30",
  Waiter: "bg-warning/15 text-warning dark:text-warning border-warning/30",
  "Kitchen Manager": "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30",
  "Kitchen Staff": "bg-accent/15 text-accent border-accent/30",
  "Delivery Manager": "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  "Store Manager": "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30",
  Accountant: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  Rider: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  "Customer Screen": "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
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

  // Roles that can be created without linking an onboarded Employee
  const independentRoles = ["Super Admin", "Admin", "Customer Screen"];
  const ownerModeRoles = isAdminOrHigher ? independentRoles : independentRoles.filter(r => r === "Customer Screen");
  const employeeModeRoles = roles.filter(r => !independentRoles.includes(r));

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
  const [accountMode, setAccountMode] = useState<"employee" | "owner">("employee");

  const { data: list = [], isLoading: loading } = useQuery({
    queryKey: ["users"],
    queryFn: () => userService.getUsers({ limit: 100 }).then(r => r.data),
  });

  // Fetch outlets for the dropdown
  useEffect(() => {
    outletService.getOutlets().then(setOutlets).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    return list.filter((u) => {
      if (isManager && ownerRoles.includes(u.role)) return false;
      const matchesSearch = u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
      const matchesRole = filterRole === "all" || u.role === filterRole;
      return matchesSearch && matchesRole;
    });
  }, [list, isManager, search, filterRole]);

  const stats = useMemo(() => {
    const active = list.filter(u => u.status === "active").length;
    const adminCount = list.filter(u => ownerRoles.includes(u.role)).length;
    return { total: list.length, active, adminCount, unlinkedCount: unlinkedEmployees.length };
  }, [list, unlinkedEmployees]);

  const openAdd = () => {
    setEditingId(null);
    const defaultRole = "Cashier";
    setForm({ name: "", email: "", phone: "", role: defaultRole, password: "", branch: "", outletId: "" });
    setPerms(rolePresets[defaultRole]);
    setSelectedEmployeeId("none");
    setAccountMode("employee");
    setUnlinkedEmployees([]);
    userService.getUnlinkedEmployees()
      .then(setUnlinkedEmployees)
      .catch((err) => console.error("Failed to fetch unlinked employees", err));
    setShowDialog(true);
  };

  const handleModeChange = (mode: "employee" | "owner") => {
    setAccountMode(mode);
    setSelectedEmployeeId("none");
    const defaultRole = mode === "owner"
      ? (ownerModeRoles[0] || "Customer Screen")
      : "Cashier";
    setForm(p => ({ ...p, name: "", email: "", phone: "", outletId: "", role: defaultRole }));
    setPerms(rolePresets[defaultRole] || {});
  };

  const openEdit = (u: UserRecord) => {
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
      const empDesig = emp.designation.toLowerCase();
      const matchingRole = roles.find(r =>
        r.toLowerCase() === empDesig ||
        empDesig.includes(r.toLowerCase()) ||
        r.toLowerCase().includes(empDesig)
      );

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

  const applyPreset = (presetType: "full" | "view" | "default") => {
    if (presetType === "full") {
      setPerms(Object.fromEntries(modules.map(m => [m, ["view", "create", "edit", "delete"]])));
    } else if (presetType === "view") {
      setPerms(Object.fromEntries(modules.map(m => [m, ["view"]])));
    } else {
      setPerms(rolePresets[form.role] || {});
    }
    toast.info(`Permissions reset to ${presetType === "full" ? "Full Access" : presetType === "view" ? "View Only" : "Role Default"}`);
  };

  const handleSave = async () => {
    if (!editingId && accountMode === "employee" && selectedEmployeeId === "none") {
      toast.error("Please select an onboarded employee to grant a login");
      return;
    }
    if (!form.name || !form.email) { toast.error("Name and email are required"); return; }
    
    const lowerEmail = form.email.trim().toLowerCase();
    const cleanPhone = form.phone.trim();
    if (cleanPhone && cleanPhone.replace(/\D/g, "").length !== 11) {
      toast.error("Phone number must be exactly 11 digits (03XX-XXXXXXX)");
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
        toast.success("User updated successfully");
      } else {
        if (!form.password) { toast.error("Password is required for new users"); setSaving(false); return; }
        await userService.createUser({
          name: form.name,
          email: form.email,
          password: form.password,
          phone: form.phone || null,
          role: form.role,
          outletId: form.outletId || null,
          employeeId: accountMode === "employee" ? selectedEmployeeId : null,
        });
        toast.success("User account created successfully");
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
    if (isManager) return;
    if (!confirm(`Permanently delete user "${name}" from database? This action cannot be undone.`)) return;
    try {
      await userService.deleteUser(id);
      toast.success("User permanently deleted");
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["unlinked-employees"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete user");
    }
  };

  const selectedEmployeeObj = useMemo(() => {
    return unlinkedEmployees.find(e => e.id === selectedEmployeeId);
  }, [unlinkedEmployees, selectedEmployeeId]);

  if (loading) return (
    <div className="space-y-6">
      <div className="flex items-center justify-between"><Skeleton className="h-8 w-48" /><Skeleton className="h-10 w-32" /></div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
      </div>
      <Card className="shadow-sm"><CardContent className="pt-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</CardContent></Card>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Shield className="h-5 w-5 text-amber-500" />}
        title="Users & Permissions"
        subtitle="Manage login accounts, branch access, and security permissions"
        actions={
          (isAdminOrHigher || isManager) ? (
            <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-black font-extrabold gap-1.5 shadow-md active:scale-95 transition-all" onClick={openAdd}>
              <Plus className="h-4 w-4 stroke-[3]" /> Add User Account
            </Button>
          ) : undefined
        }
      />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-sm border-border/60 bg-gradient-to-br from-card to-muted/20">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Accounts</p>
              <h3 className="text-2xl font-black font-mono text-foreground mt-0.5">{stats.total}</h3>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <UsersIcon className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/60 bg-gradient-to-br from-card to-muted/20">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Staff</p>
              <h3 className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">{stats.active}</h3>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/60 bg-gradient-to-br from-card to-muted/20">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Admin / Owners</p>
              <h3 className="text-2xl font-black font-mono text-purple-600 dark:text-purple-400 mt-0.5">{stats.adminCount}</h3>
            </div>
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Crown className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/60 bg-gradient-to-br from-card to-muted/20">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pending Logins</p>
              <h3 className="text-2xl font-black font-mono text-sky-600 dark:text-sky-400 mt-0.5">{stats.unlinkedCount}</h3>
            </div>
            <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <UserPlus className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search staff by name or email..."
                className="pl-9 h-9 text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <Select value={filterRole} onValueChange={setFilterRole}>
                <SelectTrigger className="w-[180px] h-9 text-xs">
                  <SelectValue placeholder="Filter by role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles ({list.length})</SelectItem>
                  {roles.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" />
              <p className="text-sm font-semibold text-foreground">No matching user accounts found</p>
              <p className="text-xs text-muted-foreground mt-1">Try adjusting your search query or role filter.</p>
              <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-black font-extrabold mt-4 gap-1.5" onClick={openAdd}>
                <Plus className="h-4 w-4" /> Add User
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="w-12 text-center">#</TableHead>
                    <TableHead>Staff Member</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Branch / Outlet</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right pr-4">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((u, i) => (
                    <TableRow key={u.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="text-center font-mono text-xs text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-semibold text-xs text-foreground">
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-xs shrink-0">
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                          <span>{u.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{u.email}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{u.phone || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("text-[11px] font-semibold px-2 py-0.5", roleColors[u.role] || "")}>
                          {u.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {u.outlet?.name ? (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                            {u.outlet.name}
                          </span>
                        ) : u.branch || "Chain-wide / All"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={cn("text-[10px] uppercase tracking-wider font-bold", u.status === "active" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" : "bg-destructive/15 text-destructive border-destructive/30")}>
                          {u.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-4">
                        <div className="flex items-center justify-end gap-1">
                          {isAdminOrHigher && (
                            <>
                              <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted" onClick={() => openEdit(u)}>
                                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => handleDelete(u.id, u.name)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                          {isManager && (
                            <span className="text-[11px] text-muted-foreground italic">View only</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── POLISHED ADD / EDIT USER DIALOG ── */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0 gap-0 border-border/80 shadow-2xl">
          {/* Custom Header */}
          <DialogHeader className="px-6 pt-5 pb-4 border-b border-border/60 bg-gradient-to-r from-card via-card to-muted/20">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-black tracking-tight flex items-center gap-2">
                  {editingId ? "Edit Staff User Account" : "Grant User Access"}
                  {editingId && (
                    <Badge variant="outline" className={cn("text-[10px] px-2 py-0 font-bold", roleColors[form.role])}>
                      {form.role}
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  {editingId
                    ? "Update credentials, role assignment, and granular access permissions."
                    : "Create a login account for an onboarded employee or administrative user."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="p-6 space-y-6">
            {/* Mode Switcher (Add User mode only) */}
            {!editingId && (
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">Account Classification</label>
                <Tabs value={accountMode} onValueChange={(v) => handleModeChange(v as "employee" | "owner")} className="w-full">
                  <TabsList className="grid grid-cols-2 w-full p-1 bg-muted/60 rounded-xl h-12">
                    <TabsTrigger value="employee" className="rounded-lg text-xs font-bold gap-2 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm">
                      <UserCheck className="h-4 w-4 text-emerald-500" />
                      Employee Login Account
                    </TabsTrigger>
                    <TabsTrigger value="owner" className="rounded-lg text-xs font-bold gap-2 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm">
                      <Crown className="h-4 w-4 text-purple-500" />
                      Administrative / Kiosk Account
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            )}

            {/* Employee Selection Section (Only in Add + Employee mode) */}
            {!editingId && accountMode === "employee" && (
              <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    <UserPlus className="h-4 w-4" />
                    Step 1: Select Onboarded Employee
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {unlinkedEmployees.length} employee{unlinkedEmployees.length !== 1 ? "s" : ""} waiting for login
                  </span>
                </div>

                {unlinkedEmployees.length === 0 ? (
                  <div className="p-3.5 rounded-lg bg-card border border-border/80 text-xs text-muted-foreground flex items-center justify-between">
                    <span>No unlinked employees found waiting for a login.</span>
                    <Link to="/employees" className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline flex items-center gap-1">
                      Onboard Employee →
                    </Link>
                  </div>
                ) : (
                  <Select value={selectedEmployeeId} onValueChange={handleEmployeeSelect}>
                    <SelectTrigger className="h-10 bg-card border-emerald-500/30 text-xs font-semibold">
                      <SelectValue placeholder="-- Choose an onboarded staff member --" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="text-xs text-muted-foreground">
                        -- Select Employee --
                      </SelectItem>
                      {unlinkedEmployees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id} className="text-xs">
                          <span className="font-bold">{emp.firstName} {emp.lastName || ""}</span>
                          <span className="text-muted-foreground"> — {emp.designation} {emp.outlet ? `(${emp.outlet.name})` : ""}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {selectedEmployeeObj && (
                  <div className="p-3 rounded-lg bg-card border border-emerald-500/30 text-xs space-y-1 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-foreground">Linked Profile Details</span>
                      <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                        ✔ Auto-Filled
                      </Badge>
                    </div>
                    <p className="text-muted-foreground">
                      <span className="font-medium text-foreground">{selectedEmployeeObj.firstName} {selectedEmployeeObj.lastName}</span> ({selectedEmployeeObj.designation})
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Form Fields Section (Gated in Add Employee mode until selected) */}
            {(!(!editingId && accountMode === "employee" && selectedEmployeeId === "none")) && (
              <div className="space-y-5 animate-in fade-in duration-200">
                {/* 1. Identity & Credentials Card */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    <KeyRound className="h-3.5 w-3.5 text-amber-500" />
                    Account Identity & Credentials
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {/* Full Name */}
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        Full Name
                      </label>
                      <Input
                        disabled={selectedEmployeeId !== "none"}
                        placeholder="e.g. Awais Hanif"
                        value={form.name}
                        onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
                        className="h-9 text-xs"
                      />
                    </div>

                    {/* Email */}
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        Email Address
                      </label>
                      <Input
                        disabled={selectedEmployeeId !== "none"}
                        placeholder="e.g. staff@ovenisto.com"
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))}
                        className={cn("h-9 text-xs", form.email && list.some(u => u.id !== editingId && u.email.toLowerCase() === form.email.toLowerCase()) && "border-destructive ring-1 ring-destructive/30")}
                      />
                      {form.email && list.some(u => u.id !== editingId && u.email.toLowerCase() === form.email.toLowerCase()) && (
                        <p className="text-[11px] text-destructive flex items-center gap-1 font-medium mt-1">
                          <AlertCircle className="h-3 w-3 shrink-0" />
                          This email is already registered to another user
                        </p>
                      )}
                    </div>

                    {/* Phone */}
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                        Mobile Phone (11 Digits)
                      </label>
                      <Input
                        disabled={selectedEmployeeId !== "none"}
                        placeholder="0300-1234567"
                        value={form.phone}
                        maxLength={12}
                        onChange={(e) => setForm(p => ({ ...p, phone: formatPhone(e.target.value) }))}
                        className={cn("h-9 text-xs font-mono", form.phone && list.some(u => u.id !== editingId && (u.phone || "") === form.phone) && "border-destructive ring-1 ring-destructive/30")}
                      />
                      {form.phone && list.some(u => u.id !== editingId && (u.phone || "") === form.phone) && (
                        <p className="text-[11px] text-destructive flex items-center gap-1 font-medium mt-1">
                          <AlertCircle className="h-3 w-3 shrink-0" />
                          This phone number is already registered to another user
                        </p>
                      )}
                    </div>

                    {/* Password */}
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                        {editingId ? "New Password (Optional)" : "Account Password"}
                      </label>
                      <Input
                        placeholder={editingId ? "Leave blank to preserve current" : "••••••••"}
                        type="password"
                        value={form.password}
                        onChange={(e) => setForm(p => ({ ...p, password: e.target.value }))}
                        className="h-9 text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Role & Outlet Scoping Card */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      <Building2 className="h-3.5 w-3.5 text-amber-500" />
                      Role & Branch Scope
                    </div>
                    <Badge variant="outline" className={cn("text-[11px] font-bold px-2 py-0.5", roleColors[form.role])}>
                      {form.role}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {/* Role Select */}
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-foreground block">System Role</label>
                      <Select disabled={selectedEmployeeId !== "none"} value={form.role} onValueChange={handleRoleChange}>
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="Select Role" />
                        </SelectTrigger>
                        <SelectContent>
                          {(editingId ? availableRoles : (accountMode === "owner" ? ownerModeRoles : employeeModeRoles)).map(r => (
                            <SelectItem key={r} value={r} className="text-xs">
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Branch / Outlet Select */}
                    {branchScopedRoles.includes(form.role) && (
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-foreground block">Assigned Outlet / Branch</label>
                        <Select disabled={selectedEmployeeId !== "none"} value={form.outletId} onValueChange={(val) => setForm(p => ({ ...p, outletId: val }))}>
                          <SelectTrigger className="h-9 text-xs">
                            <SelectValue placeholder="Select Outlet" />
                          </SelectTrigger>
                          <SelectContent>
                            {outlets.map(o => (
                              <SelectItem key={o.id} value={o.id} className="text-xs">
                                {o.name} ({o.code})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  {/* Role Capability Summary Card */}
                  <div className="p-3.5 rounded-xl bg-card border border-border/80 space-y-1">
                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">Role Scope Summary</span>
                    <p className="text-xs text-foreground leading-relaxed">
                      {form.role === "Super Admin" && "Full administrative control across all restaurant branches, system configurations, and security settings."}
                      {form.role === "Admin" && "Full administrative authority restricted to the assigned branch/outlet."}
                      {form.role === "Manager" && "Manages branch operations — POS, kitchen, sales, inventory, expenses, and operational reports."}
                      {form.role === "Floor Manager" && "Manages dining area — waiters, tables, reservations, and customer display screens."}
                      {form.role === "Cashier" && "POS counter sales, billing, customer management, and daily cash drawer reconciliation."}
                      {form.role === "Waiter" && "Waiter Panel access for taking dine-in orders directly from table floors."}
                      {form.role === "Kitchen Manager" && "Manages kitchen displays, recipes, menu items, variants, and production batches."}
                      {form.role === "Kitchen Staff" && "Kitchen Display System (KDS) access only — updates food preparation progress."}
                      {form.role === "Delivery Manager" && "Manages delivery orders, rider assignments, and online dispatch."}
                      {form.role === "Store Manager" && "Manages raw ingredients, stock levels, purchases, suppliers, and warehouse transfers."}
                      {form.role === "Accountant" && "Financial views — sales summaries, purchases, expenses, supplier ledgers, and P&L reports."}
                      {form.role === "Rider" && "Delivery rider portal access for active runs, attendance clock-in, and commissions."}
                      {form.role === "Customer Screen" && "Public customer-facing status monitor for takeaway order ready calls."}
                    </p>
                  </div>
                </div>

                {/* 3. Granular Module Permissions Matrix */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      <Shield className="h-3.5 w-3.5 text-amber-500" />
                      Granular Module Permissions
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button type="button" variant="outline" size="sm" className="h-7 text-[10px] gap-1 px-2" onClick={() => applyPreset("default")}>
                        <RotateCcw className="h-3 w-3" /> Role Preset
                      </Button>
                      <Button type="button" variant="outline" size="sm" className="h-7 text-[10px] gap-1 px-2" onClick={() => applyPreset("view")}>
                        <Eye className="h-3 w-3" /> View Only
                      </Button>
                      <Button type="button" variant="outline" size="sm" className="h-7 text-[10px] gap-1 px-2 text-amber-600 dark:text-amber-400" onClick={() => applyPreset("full")}>
                        <Sparkles className="h-3 w-3" /> Full Access
                      </Button>
                    </div>
                  </div>

                  <div className="border border-border/80 rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/60 text-muted-foreground border-b border-border/60">
                          <th className="text-left p-2.5 font-bold">System Module</th>
                          {permTypes.map(p => (
                            <th key={p} className="p-2.5 font-bold uppercase tracking-wider text-center w-20">{p}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {modules.map(mod => (
                          <tr key={mod} className="hover:bg-muted/30 transition-colors">
                            <td className="p-2.5 font-semibold text-foreground flex items-center gap-2">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                              {mod}
                            </td>
                            {permTypes.map(perm => (
                              <td key={perm} className="p-2.5 text-center">
                                {(["Dashboard", "Sales", "Reports", "My Portal", "Attendance"].includes(mod)) && perm !== "view" ? (
                                  <span className="text-muted-foreground/40 font-mono">—</span>
                                ) : (mod === "Settings") && (perm === "create" || perm === "delete") ? (
                                  <span className="text-muted-foreground/40 font-mono">—</span>
                                ) : (
                                  <Checkbox
                                    checked={(perms[mod] || []).includes(perm)}
                                    onCheckedChange={() => togglePerm(mod, perm)}
                                    className="data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                                  />
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <DialogFooter className="px-6 py-4 border-t border-border/60 bg-gradient-to-r from-card via-card to-muted/20 flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-amber-500 hover:bg-amber-600 text-black font-extrabold gap-1.5 shadow-md active:scale-95 transition-all"
              onClick={handleSave}
              disabled={saving || (!editingId && accountMode === "employee" && selectedEmployeeId === "none")}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 stroke-[3]" />}
              {saving ? "Saving User..." : editingId ? "Update User Account" : "Create User Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Users;

import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { employeeService, type EmployeeRecord, type EmployeeInput } from "@/services/employee.service";
import { userService, type UserRecord } from "@/services/user.service";
import { getAccessToken } from "@/services/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Pencil, IdCard, ChevronUp, Upload, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { TablePagination, paginate } from "@/components/TablePagination";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const RATE_TYPES = ["Hourly", "Daily", "Monthly", "PerShift"];
const PAY_FREQUENCIES = ["Weekly", "BiWeekly", "Monthly"];
const DUTY_TYPES = ["Full Time", "Part Time"];
const GENDERS = ["Male", "Female", "Other"];
const MARITAL_STATUSES = ["Single", "Married", "Divorced", "Widowed"];

const emptyForm: EmployeeInput = {
  firstName: "", lastName: "", email: "", phone: "", photoUrl: "",
  userId: "", supervisorId: "",
  division: "", designation: "", dutyType: "", hireDate: "",
  rateType: "Hourly", rate: 0, payFrequency: "", penaltyFee: null,
  dateOfBirth: "", gender: "", maritalStatus: "", cnic: "",
  emergencyContactName: "", emergencyContactRelation: "", emergencyContactPhone: "",
};

const Employees = () => {
  const { user } = useAuth();
  const canManage = ["Super Admin", "Admin", "Manager", "Store Manager"].includes(user?.role ?? "");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [page, setPage] = useState(1);

  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EmployeeInput>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: users = [] } = useQuery({
    queryKey: ["users-for-employee-link"],
    queryFn: () => userService.getUsers({ limit: 200 }).then(r => r.data),
    enabled: showForm,
  });

  const { data: supervisors = [] } = useQuery({
    queryKey: ["supervisor-options", editingId],
    queryFn: () => employeeService.getSupervisorOptions(editingId ?? undefined),
    enabled: showForm,
  });

  const resetForm = () => { setShowForm(false); setEditingId(null); setForm(emptyForm); };

  const openAdd = () => { setEditingId(null); setForm(emptyForm); setShowForm(true); };

  const openEdit = (e: EmployeeRecord) => {
    setEditingId(e.id);
    setForm({
      firstName: e.firstName, lastName: e.lastName ?? "", email: e.email ?? "", phone: e.phone,
      photoUrl: e.photoUrl ?? "", userId: e.userId ?? "", supervisorId: e.supervisorId ?? "",
      division: e.division ?? "", designation: e.designation, dutyType: e.dutyType ?? "",
      hireDate: e.hireDate.slice(0, 10), rateType: e.rateType, rate: e.rate,
      payFrequency: e.payFrequency ?? "", penaltyFee: e.penaltyFee,
      dateOfBirth: e.dateOfBirth ? e.dateOfBirth.slice(0, 10) : "", gender: e.gender ?? "",
      maritalStatus: e.maritalStatus ?? "", cnic: e.cnic ?? "",
      emergencyContactName: e.emergencyContactName ?? "", emergencyContactRelation: e.emergencyContactRelation ?? "",
      emergencyContactPhone: e.emergencyContactPhone ?? "",
    });
    setShowForm(true);
  };

  const handleImageUpload = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    ev.target.value = "";
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const token = getAccessToken();
      const res = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:3001/api"}/upload/image`, {
        method: "POST",
        headers: { ...(token && { Authorization: `Bearer ${token}` }) },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setForm(p => ({ ...p, photoUrl: data.data.url }));
      toast.success("Photo uploaded");
    } catch (err: any) {
      toast.error(err.message || "Photo upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.firstName.trim() || !form.phone.trim() || !form.designation.trim() || !form.hireDate || !form.rate) {
      toast.error("First name, phone, designation, hire date, and rate are required");
      return;
    }
    setSaving(true);
    try {
      const payload: EmployeeInput = {
        ...form,
        lastName: form.lastName || null,
        email: form.email || null,
        photoUrl: form.photoUrl || null,
        userId: form.userId || null,
        supervisorId: form.supervisorId || null,
        division: form.division || null,
        dutyType: form.dutyType || null,
        payFrequency: form.payFrequency || null,
        penaltyFee: form.penaltyFee || null,
        dateOfBirth: form.dateOfBirth || null,
        gender: form.gender || null,
        maritalStatus: form.maritalStatus || null,
        cnic: form.cnic || null,
        emergencyContactName: form.emergencyContactName || null,
        emergencyContactRelation: form.emergencyContactRelation || null,
        emergencyContactPhone: form.emergencyContactPhone || null,
      };
      if (editingId) {
        await employeeService.update(editingId, payload);
        toast.success("Employee updated");
      } else {
        await employeeService.create(payload);
        toast.success("Employee added");
      }
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to save employee");
    } finally {
      setSaving(false);
    }
  };

  const { data: list = [], isLoading: loading } = useQuery({
    queryKey: ["employees", statusFilter],
    queryFn: () => employeeService.getAll({ limit: 200, status: statusFilter === "all" ? undefined : statusFilter }).then(r => r.data),
  });

  const filtered = list.filter(e => {
    const name = `${e.firstName} ${e.lastName ?? ""}`.toLowerCase();
    return name.includes(search.toLowerCase()) ||
      e.designation.toLowerCase().includes(search.toLowerCase()) ||
      (e.division ?? "").toLowerCase().includes(search.toLowerCase());
  });
  const paged = paginate(filtered, page);

  const initials = (e: EmployeeRecord) => `${e.firstName[0] ?? ""}${e.lastName?.[0] ?? ""}`.toUpperCase();

  if (loading) return <div className="space-y-6"><div className="flex items-center justify-between"><Skeleton className="h-8 w-48" /><Skeleton className="h-10 w-32" /></div><Card className="shadow-sm"><CardContent className="pt-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</CardContent></Card></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<IdCard className="h-5 w-5" />}
        title="Employees"
        subtitle={`${list.length} employee records`}
        actions={canManage ? <Button className="gradient-primary text-primary-foreground" onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Employee</Button> : undefined}
      />

      {showForm && canManage && (
        <Card className="shadow-sm border-primary/30 bg-primary/[0.02]">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">{editingId ? "Edit" : "Add"} Employee</Label>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={resetForm}><ChevronUp className="h-4 w-4" /></Button>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="basic">
              <TabsList className="flex-wrap h-auto gap-1">
                <TabsTrigger value="basic">Basic Information</TabsTrigger>
                <TabsTrigger value="positional">Positional Info</TabsTrigger>
                <TabsTrigger value="supervisor">Supervisor</TabsTrigger>
                <TabsTrigger value="biographical">Biographical Info</TabsTrigger>
                <TabsTrigger value="emergency">Emergency Contact</TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="mt-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="space-y-1.5"><Label>First Name <span className="text-destructive">*</span></Label><Input value={form.firstName} onChange={(e) => setForm(p => ({ ...p, firstName: e.target.value }))} /></div>
                  <div className="space-y-1.5"><Label>Last Name</Label><Input value={form.lastName ?? ""} onChange={(e) => setForm(p => ({ ...p, lastName: e.target.value }))} /></div>
                  <div className="space-y-1.5"><Label>Phone <span className="text-destructive">*</span></Label><Input value={form.phone} onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
                  <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email ?? ""} onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))} /></div>
                  <div className="space-y-1.5">
                    <Label>Linked User Account</Label>
                    <Select value={form.userId ?? ""} onValueChange={(v) => setForm(p => ({ ...p, userId: v }))}>
                      <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        {users.map((u: UserRecord) => <SelectItem key={u.id} value={u.id}>{u.name} ({u.email})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Photograph</Label>
                    <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleImageUpload} />
                    {uploading ? (
                      <div className="border rounded-lg p-2 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Uploading...</div>
                    ) : form.photoUrl ? (
                      <div className="flex items-center gap-2">
                        <Avatar className="h-10 w-10"><AvatarImage src={form.photoUrl} /></Avatar>
                        <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>Change</Button>
                      </div>
                    ) : (
                      <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}><Upload className="h-3 w-3 mr-1.5" />Upload</Button>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="positional" className="mt-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="space-y-1.5"><Label>Division</Label><Input value={form.division ?? ""} onChange={(e) => setForm(p => ({ ...p, division: e.target.value }))} /></div>
                  <div className="space-y-1.5"><Label>Designation <span className="text-destructive">*</span></Label><Input value={form.designation} onChange={(e) => setForm(p => ({ ...p, designation: e.target.value }))} /></div>
                  <div className="space-y-1.5">
                    <Label>Duty Type</Label>
                    <Select value={form.dutyType ?? ""} onValueChange={(v) => setForm(p => ({ ...p, dutyType: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{DUTY_TYPES.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label>Hire Date <span className="text-destructive">*</span></Label><Input type="date" value={form.hireDate} onChange={(e) => setForm(p => ({ ...p, hireDate: e.target.value }))} /></div>
                  <div className="space-y-1.5">
                    <Label>Rate Type <span className="text-destructive">*</span></Label>
                    <Select value={form.rateType} onValueChange={(v) => setForm(p => ({ ...p, rateType: v as EmployeeInput["rateType"] }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{RATE_TYPES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label>Rate (PKR) <span className="text-destructive">*</span></Label><Input type="number" min="0" value={form.rate} onChange={(e) => setForm(p => ({ ...p, rate: Number(e.target.value) }))} /></div>
                  <div className="space-y-1.5">
                    <Label>Pay Frequency</Label>
                    <Select value={form.payFrequency ?? ""} onValueChange={(v) => setForm(p => ({ ...p, payFrequency: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{PAY_FREQUENCIES.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label>Penalty Fee (PKR, per absence)</Label><Input type="number" min="0" value={form.penaltyFee ?? ""} onChange={(e) => setForm(p => ({ ...p, penaltyFee: e.target.value ? Number(e.target.value) : null }))} /></div>
                </div>
              </TabsContent>

              <TabsContent value="supervisor" className="mt-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
                  <div className="space-y-1.5">
                    <Label>Reports To</Label>
                    <Select value={form.supervisorId ?? ""} onValueChange={(v) => setForm(p => ({ ...p, supervisorId: v }))}>
                      <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        {supervisors.map(s => <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName ?? ""}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="biographical" className="mt-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="space-y-1.5"><Label>Date of Birth</Label><Input type="date" value={form.dateOfBirth ?? ""} onChange={(e) => setForm(p => ({ ...p, dateOfBirth: e.target.value }))} /></div>
                  <div className="space-y-1.5">
                    <Label>Gender</Label>
                    <Select value={form.gender ?? ""} onValueChange={(v) => setForm(p => ({ ...p, gender: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{GENDERS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Marital Status</Label>
                    <Select value={form.maritalStatus ?? ""} onValueChange={(v) => setForm(p => ({ ...p, maritalStatus: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{MARITAL_STATUSES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label>CNIC</Label><Input placeholder="42101-1234567-1" value={form.cnic ?? ""} onChange={(e) => setForm(p => ({ ...p, cnic: e.target.value }))} /></div>
                </div>
              </TabsContent>

              <TabsContent value="emergency" className="mt-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="space-y-1.5"><Label>Contact Name</Label><Input value={form.emergencyContactName ?? ""} onChange={(e) => setForm(p => ({ ...p, emergencyContactName: e.target.value }))} /></div>
                  <div className="space-y-1.5"><Label>Relationship</Label><Input value={form.emergencyContactRelation ?? ""} onChange={(e) => setForm(p => ({ ...p, emergencyContactRelation: e.target.value }))} /></div>
                  <div className="space-y-1.5"><Label>Phone</Label><Input value={form.emergencyContactPhone ?? ""} onChange={(e) => setForm(p => ({ ...p, emergencyContactPhone: e.target.value }))} /></div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={resetForm}>Cancel</Button>
              <Button className="gradient-primary text-primary-foreground" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search by name, designation, division..." className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <IdCard className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" />
              <p className="text-muted-foreground">No employees found</p>
              {canManage && <Button size="sm" className="gradient-primary text-primary-foreground mt-3" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Employee</Button>}
            </div>
          ) : (
            <>
              <div className="rounded-lg border overflow-auto max-h-[calc(100vh-300px)]">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead>Photo</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Designation</TableHead>
                      <TableHead>Division</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Hire Date</TableHead>
                      <TableHead>Supervisor</TableHead>
                      <TableHead>Status</TableHead>
                      {canManage && <TableHead>Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>{paged.map(e => (
                    <TableRow key={e.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell>
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={e.photoUrl ?? undefined} />
                          <AvatarFallback className="text-xs">{initials(e)}</AvatarFallback>
                        </Avatar>
                      </TableCell>
                      <TableCell className="font-medium">{e.firstName} {e.lastName ?? ""}</TableCell>
                      <TableCell>{e.designation}</TableCell>
                      <TableCell>{e.division ?? "—"}</TableCell>
                      <TableCell>{e.phone}</TableCell>
                      <TableCell>{new Date(e.hireDate).toLocaleDateString("en-PK")}</TableCell>
                      <TableCell>{e.supervisor ? `${e.supervisor.firstName} ${e.supervisor.lastName ?? ""}` : "—"}</TableCell>
                      <TableCell><Badge variant="secondary" className={e.status === "active" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}>{e.status}</Badge></TableCell>
                      {canManage && (
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(e)}><Pencil className="h-3 w-3" /></Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}</TableBody>
                </Table>
              </div>
              <TablePagination currentPage={page} totalItems={filtered.length} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
export default Employees;

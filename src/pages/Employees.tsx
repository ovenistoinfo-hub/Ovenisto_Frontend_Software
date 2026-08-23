import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { employeeService, type EmployeeRecord, type EmployeeInput } from "@/services/employee.service";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search, Pencil, IdCard, ChevronUp, ChevronLeft, ChevronRight, Upload, Loader2, Trash2, Eye } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { DatePicker } from "@/components/ui/date-picker";
import { TablePagination, paginate } from "@/components/TablePagination";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useOutletFilter } from "@/hooks/useOutletFilter";
import { OutletFilterSelect } from "@/components/OutletFilterSelect";

const RATE_TYPES = ["Hourly", "Daily", "Monthly", "PerShift"];
const PAY_FREQUENCIES = ["Weekly", "BiWeekly", "Monthly"];
const DUTY_TYPES = ["Full Time", "Part Time"];
const GENDERS = ["Male", "Female", "Other"];
const MARITAL_STATUSES = ["Single", "Married", "Divorced", "Widowed"];
const DESIGNATION_OPTIONS = [
  "Manager", "Floor Manager", "Cashier", "Waiter",
  "Kitchen Manager", "Kitchen Staff", "Delivery Manager", "Store Manager",
  "Accountant", "Rider", "Customer Screen",
];

const DAYS_OF_WEEK = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
];

const emptyForm: EmployeeInput = {
  firstName: "", lastName: "", email: "@ovenisto.com", phone: "", photoUrl: "",
  userId: "", supervisorId: "",
  division: "", designation: "", dutyType: "", hireDate: "",
  rateType: "Hourly", rate: 0, commissionPerDelivery: 0, payFrequency: "", penaltyFee: null, defaultOffDay: 1,
  dateOfBirth: "", gender: "", maritalStatus: "", cnic: "",
  emergencyContactName: "", emergencyContactRelation: "", emergencyContactPhone: "",
};

// Auto-format CNIC as XXXXX-XXXXXXX-X
const formatCNIC = (val: string): string => {
  const digits = val.replace(/\D/g, "").slice(0, 13);
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12, 13)}`;
};

// Auto-format phone as 03XX-XXXXXXX (11 digits)
const formatPhone = (val: string): string => {
  const digits = val.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
};

const Employees = () => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "Super Admin";
  const canManage = !isSuperAdmin && ["Super Admin", "Admin", "Manager", "Store Manager"].includes(user?.role ?? "");
  const canEditOrDelete = ["Super Admin", "Admin"].includes(user?.role ?? "");
  const canSeeActionsColumn = ["Super Admin", "Admin", "Manager", "Store Manager"].includes(user?.role ?? "");
  const { outletId, setOutletId, outlets } = useOutletFilter();
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

  const TABS_ORDER = ["basic", "positional", "supervisor", "biographical", "emergency"];
  const [activeTab, setActiveTab] = useState("basic");

  // Termination fields
  const [terminationEmployee, setTerminationEmployee] = useState<EmployeeRecord | null>(null);
  const [terminationReason, setTerminationReason] = useState("");
  const [terminating, setTerminating] = useState(false);

  // Re-hire fields
  const [rehireEmployee, setRehireEmployee] = useState<EmployeeRecord | null>(null);
  const [rehireDate, setRehireDate] = useState("");
  const [rehireRate, setRehireRate] = useState(0);
  const [rehiring, setRehiring] = useState(false);

  // View details modal field
  const [viewEmployee, setViewEmployee] = useState<EmployeeRecord | null>(null);

  const { data: supervisors = [] } = useQuery({
    queryKey: ["supervisor-options", editingId],
    queryFn: () => employeeService.getSupervisorOptions(editingId ?? undefined),
    enabled: showForm,
  });

  const resetForm = () => { setShowForm(false); setEditingId(null); setForm({ ...emptyForm, email: "@ovenisto.com" }); setActiveTab("basic"); };

  const openAdd = () => { setEditingId(null); setForm({ ...emptyForm, email: "@ovenisto.com" }); setActiveTab("basic"); setShowForm(true); };

  const openEdit = (e: EmployeeRecord) => {
    setEditingId(e.id);
    setForm({
      firstName: e.firstName, lastName: e.lastName ?? "", email: e.email || "@ovenisto.com", phone: e.phone,
      photoUrl: e.photoUrl ?? "", userId: e.userId ?? "", supervisorId: e.supervisorId ?? "",
      division: e.division ?? "", designation: e.designation, dutyType: e.dutyType ?? "",
      hireDate: e.hireDate.slice(0, 10), rateType: e.rateType, rate: e.rate,
      commissionPerDelivery: e.commissionPerDelivery ?? 0,
      payFrequency: e.payFrequency ?? "", penaltyFee: e.penaltyFee, defaultOffDay: e.defaultOffDay ?? 1,
      dateOfBirth: e.dateOfBirth ? e.dateOfBirth.slice(0, 10) : "", gender: e.gender ?? "",
      maritalStatus: e.maritalStatus ?? "", cnic: e.cnic ?? "",
      emergencyContactName: e.emergencyContactName ?? "", emergencyContactRelation: e.emergencyContactRelation ?? "",
      emergencyContactPhone: e.emergencyContactPhone ?? "",
    });
    setActiveTab("basic");
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

  const validateBasic = (): boolean => {
    if (!form.firstName.trim()) {
      toast.error("First name is required");
      setActiveTab("basic");
      return false;
    }
    if (!form.phone.trim()) {
      toast.error("Phone number is required");
      setActiveTab("basic");
      return false;
    }
    if (form.phone.replace(/\D/g, "").length !== 11) {
      toast.error("Phone number must be exactly 11 digits");
      setActiveTab("basic");
      return false;
    }
    const cleanPhoneDigits = form.phone.replace(/\D/g, "");
    const conflictingPhoneEmp = list.find(e => e.id !== editingId && (e.phone || "").replace(/\D/g, "") === cleanPhoneDigits);
    if (conflictingPhoneEmp) {
      const name = `${conflictingPhoneEmp.firstName} ${conflictingPhoneEmp.lastName || ""}`.trim();
      toast.error(`Phone number "${form.phone}" is already registered to employee "${name}"!`);
      setActiveTab("basic");
      return false;
    }
    const cleanEmail = form.email ? form.email.trim() : "";
    if (!cleanEmail || cleanEmail === "@ovenisto.com" || cleanEmail.startsWith("@")) {
      toast.error("Please enter a valid email handle before @ovenisto.com");
      setActiveTab("basic");
      return false;
    }
    const lowerEmail = cleanEmail.toLowerCase();
    const conflictingEmailEmp = list.find(e => e.id !== editingId && (e.email || "").trim().toLowerCase() === lowerEmail);
    if (conflictingEmailEmp) {
      const name = `${conflictingEmailEmp.firstName} ${conflictingEmailEmp.lastName || ""}`.trim();
      toast.error(`Email "${cleanEmail}" is already registered to employee "${name}"!`);
      setActiveTab("basic");
      return false;
    }
    if (!form.photoUrl?.trim()) {
      toast.error("Photograph is required");
      setActiveTab("basic");
      return false;
    }
    return true;
  };

  const validatePositional = (): boolean => {
    if (!form.designation.trim()) {
      toast.error("Designation is required");
      setActiveTab("positional");
      return false;
    }
    if (!form.dutyType?.trim()) {
      toast.error("Duty type is required");
      setActiveTab("positional");
      return false;
    }
    if (!form.hireDate) {
      toast.error("Hire date is required");
      setActiveTab("positional");
      return false;
    }
    if (!form.rateType) {
      toast.error("Rate type is required");
      setActiveTab("positional");
      return false;
    }
    if (form.rate === undefined || form.rate === null || form.rate <= 0) {
      toast.error("Pay rate is required");
      setActiveTab("positional");
      return false;
    }
    if (!form.payFrequency?.trim()) {
      toast.error("Pay frequency is required");
      setActiveTab("positional");
      return false;
    }
    return true;
  };

  const validateBiographical = (): boolean => {
    if (!form.dateOfBirth) {
      toast.error("Date of birth is required");
      setActiveTab("biographical");
      return false;
    }
    if (!form.gender?.trim()) {
      toast.error("Gender is required");
      setActiveTab("biographical");
      return false;
    }
    if (!form.maritalStatus?.trim()) {
      toast.error("Marital status is required");
      setActiveTab("biographical");
      return false;
    }
    if (!form.cnic?.trim()) {
      toast.error("CNIC is required");
      setActiveTab("biographical");
      return false;
    }
    const cleanCnicDigits = form.cnic.replace(/\D/g, "");
    if (cleanCnicDigits.length !== 13) {
      toast.error("CNIC must be in format XXXXX-XXXXXXX-X (13 digits)");
      setActiveTab("biographical");
      return false;
    }
    const conflictingCnicEmp = list.find(e => e.id !== editingId && (e.cnic || "").replace(/\D/g, "") === cleanCnicDigits);
    if (conflictingCnicEmp) {
      const name = `${conflictingCnicEmp.firstName} ${conflictingCnicEmp.lastName || ""}`.trim();
      toast.error(`CNIC "${form.cnic}" is already registered to employee "${name}"!`);
      setActiveTab("biographical");
      return false;
    }
    return true;
  };

  const validateEmergency = (): boolean => {
    if (!form.emergencyContactName?.trim()) {
      toast.error("Emergency contact name is required");
      setActiveTab("emergency");
      return false;
    }
    if (/[^a-zA-Z\s]/.test(form.emergencyContactName)) {
      toast.error("Emergency contact name can only contain letters and spaces");
      setActiveTab("emergency");
      return false;
    }
    if (!form.emergencyContactRelation?.trim()) {
      toast.error("Emergency contact relationship is required");
      setActiveTab("emergency");
      return false;
    }
    if (!form.emergencyContactPhone?.trim()) {
      toast.error("Emergency contact phone is required");
      setActiveTab("emergency");
      return false;
    }
    if (form.emergencyContactPhone.replace(/\D/g, "").length !== 11) {
      toast.error("Emergency contact phone number must be exactly 11 digits");
      setActiveTab("emergency");
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (activeTab === "basic") {
      if (validateBasic()) setActiveTab("positional");
    } else if (activeTab === "positional") {
      if (validatePositional()) setActiveTab("supervisor");
    } else if (activeTab === "supervisor") {
      setActiveTab("biographical");
    } else if (activeTab === "biographical") {
      if (validateBiographical()) setActiveTab("emergency");
    }
  };

  const handleBack = () => {
    const currentIndex = TABS_ORDER.indexOf(activeTab);
    if (currentIndex > 0) {
      setActiveTab(TABS_ORDER[currentIndex - 1]);
    }
  };

  const handleTabChange = (targetTab: string) => {
    const currentIndex = TABS_ORDER.indexOf(activeTab);
    const targetIndex = TABS_ORDER.indexOf(targetTab);

    if (targetIndex <= currentIndex) {
      setActiveTab(targetTab);
      return;
    }

    if (currentIndex === 0 && !validateBasic()) return;
    if (targetIndex > 1 && !validatePositional()) return;
    if (targetIndex > 3 && !validateBiographical()) return;

    setActiveTab(targetTab);
  };

  const handleSave = async () => {
    if (!validateBasic()) return;
    if (!validatePositional()) return;
    if (!validateBiographical()) return;
    if (!validateEmergency()) return;

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
        defaultOffDay: form.defaultOffDay != null ? Number(form.defaultOffDay) : 1,
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

  const handleTerminateClick = (emp: EmployeeRecord) => {
    setTerminationEmployee(emp);
    setTerminationReason("");
  };

  const handleTerminateSubmit = async () => {
    if (!terminationEmployee) return;
    if (!terminationReason.trim()) {
      toast.error("Please enter a termination reason");
      return;
    }
    setTerminating(true);
    try {
      await employeeService.terminate(terminationEmployee.id, terminationReason);
      toast.success("Employee terminated successfully");
      setTerminationEmployee(null);
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to terminate employee");
    } finally {
      setTerminating(false);
    }
  };

  const handleRehireClick = (emp: EmployeeRecord) => {
    setRehireEmployee(emp);
    setRehireDate(new Date().toISOString().slice(0, 10));
    setRehireRate(emp.rate);
  };

  const handleRehireSubmit = async () => {
    if (!rehireEmployee) return;
    setRehiring(true);
    try {
      await employeeService.rehire(rehireEmployee.id, {
        rehireDate: rehireDate,
        rate: rehireRate,
      });
      toast.success("Employee rehired successfully");
      setRehireEmployee(null);
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to re-hire employee");
    } finally {
      setRehiring(false);
    }
  };

  const { data: list = [], isLoading: loading } = useQuery({
    queryKey: ["employees", statusFilter, outletId],
    queryFn: () => employeeService.getAll({ limit: 200, status: statusFilter === "all" ? undefined : statusFilter, outletId }).then(r => r.data),
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
        actions={
          <div className="flex items-center gap-2">
            <OutletFilterSelect outletId={outletId} setOutletId={setOutletId} outlets={outlets} isSuperAdmin={isSuperAdmin} />
            {canManage && <Button className="gradient-primary text-primary-foreground" onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Employee</Button>}
          </div>
        }
      />

      {showForm && canManage && (
        <Card className="shadow-sm border-primary/30 bg-primary/[0.02]">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">{editingId ? "Edit" : "Add"} Employee</Label>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={resetForm}><ChevronUp className="h-4 w-4" /></Button>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={handleTabChange}>
              <TabsList className="flex-wrap h-auto gap-1">
                <TabsTrigger value="basic">Basic Information</TabsTrigger>
                <TabsTrigger value="positional">Positional Info</TabsTrigger>
                <TabsTrigger value="supervisor">Supervisor</TabsTrigger>
                <TabsTrigger value="biographical">Biographical Info</TabsTrigger>
                <TabsTrigger value="emergency">Emergency Contact</TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="mt-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>First Name <span className="text-destructive">*</span></Label>
                    <Input list="emp-first-name-list" value={form.firstName} onChange={(e) => setForm(p => ({ ...p, firstName: e.target.value }))} />
                    <datalist id="emp-first-name-list">
                      {[...new Set(list.map(e => e.firstName).filter(Boolean))].map(fn => <option key={fn} value={fn} />)}
                    </datalist>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Last Name</Label>
                    <Input list="emp-last-name-list" value={form.lastName ?? ""} onChange={(e) => setForm(p => ({ ...p, lastName: e.target.value }))} />
                    <datalist id="emp-last-name-list">
                      {[...new Set(list.map(e => e.lastName).filter(Boolean))].map(ln => <option key={ln} value={ln} />)}
                    </datalist>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Phone <span className="text-destructive">*</span></Label>
                    {(() => {
                      const phDigits = (form.phone || "").replace(/\D/g, "");
                      const phoneConflict = phDigits.length === 11 ? list.find(e => e.id !== editingId && (e.phone || "").replace(/\D/g, "") === phDigits) : null;
                      return (
                        <>
                          <Input
                            list="emp-phone-list"
                            value={form.phone}
                            maxLength={12}
                            onChange={(e) => setForm(p => ({ ...p, phone: formatPhone(e.target.value) }))}
                            className={phoneConflict ? "border-destructive focus-visible:ring-destructive" : ""}
                          />
                          <datalist id="emp-phone-list">
                            {[...new Set(list.map(e => e.phone).filter(Boolean))].map(ph => <option key={ph} value={ph} />)}
                          </datalist>
                          {phoneConflict && (
                            <p className="text-[11px] text-destructive mt-0.5 font-medium">
                              ⚠ Phone number is already assigned to {phoneConflict.firstName} {phoneConflict.lastName || ""}
                            </p>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email <span className="text-destructive">*</span></Label>
                    {(() => {
                      const cleanEm = (form.email || "").trim().toLowerCase();
                      const isValidEm = cleanEm && cleanEm !== "@ovenisto.com" && !cleanEm.startsWith("@");
                      const emailConflict = isValidEm ? list.find(e => e.id !== editingId && (e.email || "").trim().toLowerCase() === cleanEm) : null;
                      return (
                        <>
                          <Input
                            type="email"
                            placeholder="name@ovenisto.com"
                            list="emp-email-list"
                            value={form.email ?? "@ovenisto.com"}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (!val) {
                                setForm(p => ({ ...p, email: "@ovenisto.com" }));
                              } else if (!val.includes("@") && !val.endsWith("@ovenisto.com")) {
                                setForm(p => ({ ...p, email: `${val}@ovenisto.com` }));
                              } else {
                                setForm(p => ({ ...p, email: val }));
                              }
                            }}
                            className={emailConflict ? "border-destructive focus-visible:ring-destructive" : ""}
                          />
                          <datalist id="emp-email-list">
                            {[...new Set(list.map(e => e.email).filter(Boolean))].map(em => <option key={em} value={em} />)}
                          </datalist>
                          {emailConflict && (
                            <p className="text-[11px] text-destructive mt-0.5 font-medium">
                              ⚠ Email is already assigned to {emailConflict.firstName} {emailConflict.lastName || ""}
                            </p>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Photograph <span className="text-destructive">*</span></Label>
                    <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleImageUpload} />
                    {uploading ? (
                      <div className="border rounded-lg p-2 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Uploading...</div>
                    ) : form.photoUrl ? (
                      <div className="flex items-center gap-2">
                        <Avatar className="h-10 w-10 border border-primary/20"><AvatarImage src={form.photoUrl} /></Avatar>
                        <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>Change</Button>
                      </div>
                    ) : (
                      <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="border-destructive/60 text-destructive hover:bg-destructive/10"><Upload className="h-3 w-3 mr-1.5" />Upload Photo *</Button>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="positional" className="mt-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Designation <span className="text-destructive">*</span></Label>
                    <Select value={form.designation ?? ""} onValueChange={(v) => setForm(p => ({ ...p, designation: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select designation" /></SelectTrigger>
                      <SelectContent>
                        {DESIGNATION_OPTIONS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                        {form.designation && !DESIGNATION_OPTIONS.includes(form.designation) && (
                          <SelectItem value={form.designation}>{form.designation}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Duty Type <span className="text-destructive">*</span></Label>
                    <Select value={form.dutyType ?? ""} onValueChange={(v) => setForm(p => ({ ...p, dutyType: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{DUTY_TYPES.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label>Hire Date <span className="text-destructive">*</span></Label><DatePicker value={form.hireDate} onChange={(v) => setForm(p => ({ ...p, hireDate: v }))} /></div>
                  <div className="space-y-1.5">
                    <Label>Rate Type <span className="text-destructive">*</span></Label>
                    <Select value={form.rateType} onValueChange={(v) => setForm(p => ({ ...p, rateType: v as EmployeeInput["rateType"] }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{RATE_TYPES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Rate (PKR) <span className="text-destructive">*</span></Label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={form.rate || ""}
                      onChange={(e) => setForm(p => ({ ...p, rate: e.target.value ? Number(e.target.value) : 0 }))}
                    />
                  </div>
                  {form.designation === "Rider" && (
                  <div className="space-y-1.5">
                    <Label>Delivery Commission (PKR / Ride)</Label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={form.commissionPerDelivery || ""}
                      onChange={(e) => setForm(p => ({ ...p, commissionPerDelivery: e.target.value ? Number(e.target.value) : 0 }))}
                    />
                  </div>
                  )}
                  <div className="space-y-1.5">
                    <Label>Pay Frequency <span className="text-destructive">*</span></Label>
                    <Select value={form.payFrequency ?? ""} onValueChange={(v) => setForm(p => ({ ...p, payFrequency: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{PAY_FREQUENCIES.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label>Penalty Fee (PKR, per absence)</Label><Input type="number" min="0" value={form.penaltyFee ?? ""} onChange={(e) => setForm(p => ({ ...p, penaltyFee: e.target.value ? Number(e.target.value) : null }))} /></div>
                  <div className="space-y-1.5">
                    <Label>Default Weekly Off Day</Label>
                    <Select value={String(form.defaultOffDay ?? 1)} onValueChange={(v) => setForm(p => ({ ...p, defaultOffDay: Number(v) }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DAYS_OF_WEEK.map(d => <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
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
                  <div className="space-y-1.5"><Label>Date of Birth <span className="text-destructive">*</span></Label><DatePicker value={form.dateOfBirth ?? ""} onChange={(v) => setForm(p => ({ ...p, dateOfBirth: v }))} /></div>
                  <div className="space-y-1.5">
                    <Label>Gender <span className="text-destructive">*</span></Label>
                    <Select value={form.gender ?? ""} onValueChange={(v) => setForm(p => ({ ...p, gender: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{GENDERS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Marital Status <span className="text-destructive">*</span></Label>
                    <Select value={form.maritalStatus ?? ""} onValueChange={(v) => setForm(p => ({ ...p, maritalStatus: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{MARITAL_STATUSES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>CNIC <span className="text-destructive">*</span></Label>
                    {(() => {
                      const cnicDigits = (form.cnic || "").replace(/\D/g, "");
                      const cnicConflict = cnicDigits.length === 13 ? list.find(e => e.id !== editingId && (e.cnic || "").replace(/\D/g, "") === cnicDigits) : null;
                      return (
                        <>
                          <Input
                            placeholder="42101-1234567-1"
                            value={form.cnic ?? ""}
                            maxLength={15}
                            onChange={(e) => setForm(p => ({ ...p, cnic: formatCNIC(e.target.value) }))}
                            className={
                              cnicConflict
                                ? "border-destructive focus-visible:ring-destructive"
                                : form.cnic && form.cnic.length > 0 && form.cnic.length < 15
                                ? "border-warning"
                                : form.cnic?.length === 15
                                ? "border-success"
                                : ""
                            }
                          />
                          {cnicConflict ? (
                            <p className="text-[11px] text-destructive mt-0.5 font-medium">
                              ⚠ CNIC is already assigned to {cnicConflict.firstName} {cnicConflict.lastName || ""}
                            </p>
                          ) : form.cnic && form.cnic.length > 0 && form.cnic.length < 15 ? (
                            <p className="text-[11px] text-warning mt-0.5">Format: XXXXX-XXXXXXX-X (13 digits)</p>
                          ) : form.cnic?.length === 15 ? (
                            <p className="text-[11px] text-success mt-0.5">✓ Valid format</p>
                          ) : null}
                        </>
                      );
                    })()}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="emergency" className="mt-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Contact Name <span className="text-destructive">*</span></Label>
                    <Input
                      placeholder="e.g. Imran Ali"
                      value={form.emergencyContactName ?? ""}
                      onChange={(e) => {
                        const filtered = e.target.value.replace(/[^a-zA-Z\s]/g, "");
                        setForm(p => ({ ...p, emergencyContactName: filtered }));
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Relationship <span className="text-destructive">*</span></Label>
                    <Input list="employee-relation-list" value={form.emergencyContactRelation ?? ""} onChange={(e) => setForm(p => ({ ...p, emergencyContactRelation: e.target.value }))} />
                    <datalist id="employee-relation-list">
                      {["Father", "Mother", "Spouse", "Brother", "Sister", "Son", "Daughter", "Friend"].map(rel => <option key={rel} value={rel} />)}
                    </datalist>
                  </div>
                  <div className="space-y-1.5"><Label>Phone <span className="text-destructive">*</span></Label><Input value={form.emergencyContactPhone ?? ""} maxLength={12} onChange={(e) => setForm(p => ({ ...p, emergencyContactPhone: formatPhone(e.target.value) }))} /></div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex items-center justify-between pt-4 border-t border-border mt-4">
              <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
              <div className="flex items-center gap-2">
                {activeTab !== "basic" && (
                  <Button type="button" variant="outline" onClick={handleBack}>
                    <ChevronLeft className="h-4 w-4 mr-1" /> Back
                  </Button>
                )}
                {activeTab !== "emergency" ? (
                  <Button type="button" className="gradient-primary text-primary-foreground" onClick={handleNext}>
                    Next <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                ) : (
                  <Button type="button" className="gradient-primary text-primary-foreground" onClick={handleSave} disabled={saving}>
                    {saving ? "Saving..." : editingId ? "Update Employee" : "Save Employee"}
                  </Button>
                )}
              </div>
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
                      {canSeeActionsColumn && <TableHead>Actions</TableHead>}
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
                      <TableCell>
                        <div className="flex flex-col">
                          <Badge variant="secondary" className={e.status === "active" ? "bg-success/10 text-success w-fit" : "bg-destructive/10 text-destructive w-fit"}>
                            {e.status === "active" ? "active" : "terminated"}
                          </Badge>
                          {e.status === "inactive" && e.terminationReason && (
                            <span className="text-[10px] text-muted-foreground mt-0.5 max-w-[120px] truncate" title={`Reason: ${e.terminationReason}\nDate: ${e.terminationDate ? new Date(e.terminationDate).toLocaleDateString() : 'N/A'}`}>
                              Reason: {e.terminationReason}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      {canSeeActionsColumn && (
                        <TableCell>
                          <div className="flex gap-1 items-center">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => setViewEmployee(e)} title="View Employee Details">
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            {canEditOrDelete ? (
                              <>
                                {e.status === "active" ? (
                                  <>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(e)} title="Edit Employee"><Pencil className="h-3 w-3" /></Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleTerminateClick(e)} title="Terminate Employee"><Trash2 className="h-3 w-3" /></Button>
                                  </>
                                ) : (
                                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs flex items-center gap-1 border-success text-success hover:bg-success/10" onClick={() => handleRehireClick(e)}>
                                    Re-hire
                                  </Button>
                                )}
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground italic px-1">View only</span>
                            )}
                          </div>
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

      {/* Termination Reason Dialog */}
      <Dialog open={!!terminationEmployee} onOpenChange={(open) => !open && setTerminationEmployee(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Terminate Employee</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to terminate <strong>{terminationEmployee?.firstName} {terminationEmployee?.lastName || ""}</strong>?
              Please provide the termination reason below.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="termination-reason">Termination Reason <span className="text-destructive">*</span></Label>
              <Input
                id="termination-reason"
                placeholder="e.g. Resigned, Performance issues, Relocation..."
                value={terminationReason}
                onChange={(e) => setTerminationReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTerminationEmployee(null)}>Cancel</Button>
            <Button className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleTerminateSubmit} disabled={terminating}>
              {terminating ? "Terminating..." : "Terminate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Re-hire Form Dialog */}
      <Dialog open={!!rehireEmployee} onOpenChange={(open) => !open && setRehireEmployee(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Re-hire Employee</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Re-hiring <strong>{rehireEmployee?.firstName} {rehireEmployee?.lastName || ""}</strong> will activate their portal profile. Please specify the new details below.
            </p>
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rehire-date">New Hire Date <span className="text-destructive">*</span></Label>
                <DatePicker
                  id="rehire-date"
                  value={rehireDate}
                  onChange={setRehireDate}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rehire-rate">New Pay Rate (Rs.) <span className="text-destructive">*</span></Label>
                <Input
                  id="rehire-rate"
                  type="number"
                  value={rehireRate}
                  onChange={(e) => setRehireRate(Number(e.target.value))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRehireEmployee(null)}>Cancel</Button>
            <Button className="gradient-primary text-primary-foreground" onClick={handleRehireSubmit} disabled={rehiring}>
              {rehiring ? "Re-hiring..." : "Re-hire"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Details Dialog */}
      <Dialog open={!!viewEmployee} onOpenChange={(open) => !open && setViewEmployee(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={viewEmployee?.photoUrl ?? undefined} />
                <AvatarFallback className="text-sm bg-primary/10 text-primary">{viewEmployee ? initials(viewEmployee) : ""}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="text-base font-semibold">{viewEmployee?.firstName} {viewEmployee?.lastName ?? ""}</span>
                <span className="text-xs text-muted-foreground font-normal">{viewEmployee?.designation}</span>
              </div>
            </DialogTitle>
          </DialogHeader>

          {viewEmployee && (
            <div className="space-y-6 py-2">
              {/* Current Status Block */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-muted/35 rounded-lg p-4 text-sm">
                <div>
                  <Label className="text-xs text-muted-foreground">Employment Status</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className={viewEmployee.status === "active" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}>
                      {viewEmployee.status === "active" ? "Active" : "Terminated"}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Outlet / Branch</Label>
                  <p className="font-medium mt-1">{viewEmployee.outlet ? `${viewEmployee.outlet.name} (${viewEmployee.outlet.code})` : "Main Branch"}</p>
                </div>
              </div>

              {/* Employment Status Info — context-aware */}
              {viewEmployee.status === "inactive" && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/[0.04] p-4 space-y-3">
                  <h4 className="text-xs font-semibold text-destructive uppercase tracking-wider flex items-center gap-1.5">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-destructive" />
                    Termination Details
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Terminated On</p>
                      <p className="font-semibold text-destructive">
                        {viewEmployee.terminationDate ? new Date(viewEmployee.terminationDate).toLocaleDateString("en-PK") : "N/A"}
                      </p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Reason</p>
                      <p className="font-medium text-foreground italic">"{viewEmployee.terminationReason || "No reason specified"}"</p>
                    </div>
                  </div>
                </div>
              )}

              {viewEmployee.status === "active" && viewEmployee.rehireDate && (
                <div className="rounded-lg border border-success/20 bg-success/[0.04] p-4 space-y-3">
                  <h4 className="text-xs font-semibold text-success uppercase tracking-wider flex items-center gap-1.5">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
                    Re-hire Details
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Re-hired On</p>
                      <p className="font-semibold text-success">{new Date(viewEmployee.rehireDate).toLocaleDateString("en-PK")}</p>
                    </div>
                    {viewEmployee.terminationDate && (
                      <div className="space-y-0.5">
                        <p className="text-xs text-muted-foreground">Previously Terminated</p>
                        <p className="font-medium text-muted-foreground">{new Date(viewEmployee.terminationDate).toLocaleDateString("en-PK")} — <span className="italic">"{viewEmployee.terminationReason || "N/A"}"</span></p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Two Column Grid of other information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* General Info */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Work Details</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between border-b pb-1.5"><span className="text-muted-foreground">Original Hire Date:</span> <span className="font-medium">{new Date(viewEmployee.hireDate).toLocaleDateString("en-PK")}</span></div>
                    <div className="flex justify-between border-b pb-1.5"><span className="text-muted-foreground">Division:</span> <span className="font-medium">{viewEmployee.division || "—"}</span></div>
                    <div className="flex justify-between border-b pb-1.5"><span className="text-muted-foreground">Duty Type:</span> <span className="font-medium">{viewEmployee.dutyType || "—"}</span></div>
                    <div className="flex justify-between border-b pb-1.5"><span className="text-muted-foreground">Supervisor:</span> <span className="font-medium">{viewEmployee.supervisor ? `${viewEmployee.supervisor.firstName} ${viewEmployee.supervisor.lastName ?? ""}` : "—"}</span></div>
                    <div className="flex justify-between border-b pb-1.5"><span className="text-muted-foreground">Rate:</span> <span className="font-medium">Rs. {viewEmployee.rate} ({viewEmployee.rateType})</span></div>
                    {(viewEmployee.designation === "Rider" || (viewEmployee.commissionPerDelivery ?? 0) > 0) && (
                      <div className="flex justify-between border-b pb-1.5">
                        <span className="text-muted-foreground">Commission:</span>
                        <Badge variant="secondary" className="bg-primary/10 text-primary text-xs font-semibold">Rs. {viewEmployee.commissionPerDelivery ?? 0}/ride</Badge>
                      </div>
                    )}
                    <div className="flex justify-between border-b pb-1.5"><span className="text-muted-foreground">Pay Frequency:</span> <span className="font-medium">{viewEmployee.payFrequency || "—"}</span></div>
                  </div>
                </div>

                {/* Personal & Emergency Info */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Personal & Biographical</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between border-b pb-1.5"><span className="text-muted-foreground">Phone:</span> <span className="font-medium">{viewEmployee.phone}</span></div>
                    <div className="flex justify-between border-b pb-1.5"><span className="text-muted-foreground">Email:</span> <span className="font-medium">{viewEmployee.email || "—"}</span></div>
                    <div className="flex justify-between border-b pb-1.5"><span className="text-muted-foreground">Date of Birth:</span> <span className="font-medium">{viewEmployee.dateOfBirth ? new Date(viewEmployee.dateOfBirth).toLocaleDateString("en-PK") : "—"}</span></div>
                    <div className="flex justify-between border-b pb-1.5"><span className="text-muted-foreground">CNIC / ID:</span> <span className="font-medium">{viewEmployee.cnic || "—"}</span></div>
                    <div className="flex justify-between border-b pb-1.5"><span className="text-muted-foreground">Gender:</span> <span className="font-medium">{viewEmployee.gender || "—"}</span></div>
                    <div className="flex justify-between border-b pb-1.5"><span className="text-muted-foreground">Emergency Contact:</span> <span className="font-medium">{viewEmployee.emergencyContactName ? `${viewEmployee.emergencyContactName} (${viewEmployee.emergencyContactRelation || ""}) - ${viewEmployee.emergencyContactPhone || ""}` : "—"}</span></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewEmployee(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
export default Employees;

import { useState, useMemo, useRef, useEffect } from "react";
import { CalendarCheck, Plus, Pencil, Trash2, User, Phone, Users, CheckCircle2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { reservationService, type Reservation, type CreateReservationInput } from "@/services/reservation.service";
import { tableService } from "@/services/table.service";
import { customerService, type CustomerRecord } from "@/services/customer.service";
import { toast } from "sonner";
import { useOutletFilter } from "@/hooks/useOutletFilter";
import { OutletFilterSelect } from "@/components/OutletFilterSelect";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const statusColors: Record<string, string> = {
  pending: "bg-warning/10 text-warning",
  confirmed: "bg-info/10 text-info",
  seated: "bg-primary/10 text-primary",
  completed: "bg-success/10 text-success",
  cancelled: "bg-destructive/10 text-destructive",
  noShow: "bg-muted text-muted-foreground",
};

type FormState = Partial<CreateReservationInput>;

const emptyForm = (): FormState => ({
  customerName: "",
  customerPhone: "",
  date: new Date().toISOString().split("T")[0],
  time: "19:00",
  guestCount: 2,
  source: "phone",
  status: "pending",
});

const formatPhoneNumber = (val: string): string => {
  const digitsOnly = val.replace(/\D/g, "").slice(0, 11);
  if (digitsOnly.length > 4) {
    return `${digitsOnly.slice(0, 4)}-${digitsOnly.slice(4)}`;
  }
  return digitsOnly;
};

const Reservations = () => {
  const qc = useQueryClient();
  const { outletId: selectedOutletId, setOutletId, outlets } = useOutletFilter();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "Super Admin";
  const [dateFilter, setDateFilter] = useState("Today");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  // Customer Autocomplete state
  const [showCustSuggestions, setShowCustSuggestions] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const today = new Date().toISOString().split("T")[0];
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split("T")[0]; })();

  const { data: reservations = [], isLoading } = useQuery({
    queryKey: ["reservations", selectedOutletId],
    queryFn: () => reservationService.getAll({ outletId: selectedOutletId !== "all" ? selectedOutletId : undefined }),
  });

  const { data: tables = [] } = useQuery({
    queryKey: ["tables", selectedOutletId],
    queryFn: () => tableService.getTables(),
  });

  const { data: customersData } = useQuery({
    queryKey: ["customers-list"],
    queryFn: () => customerService.getCustomers({ limit: 500 }).then(r => r.data),
  });
  const customers = useMemo(() => customersData ?? [], [customersData]);

  const filteredCustomerSuggestions = useMemo(() => {
    if (!form.customerName && !form.customerPhone) return customers.slice(0, 8);
    const searchName = (form.customerName || "").toLowerCase();
    const searchPhone = (form.customerPhone || "").replace(/\D/g, "");
    return customers.filter(c => {
      const matchName = c.name.toLowerCase().includes(searchName);
      const matchPhone = searchPhone ? (c.phone || "").replace(/\D/g, "").includes(searchPhone) : false;
      return matchName || matchPhone;
    }).slice(0, 8);
  }, [customers, form.customerName, form.customerPhone]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowCustSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const createMutation = useMutation({
    mutationFn: (data: CreateReservationInput) => reservationService.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reservations"] }); toast.success("Reservation added"); setShowForm(false); },
    onError: () => toast.error("Failed to save reservation"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateReservationInput & { status: string }> }) =>
      reservationService.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reservations"] }); toast.success("Updated"); setShowForm(false); },
    onError: () => toast.error("Failed to update"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => reservationService.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reservations"] }); toast.success("Deleted"); setDeleteId(null); },
    onError: () => toast.error("Failed to delete"),
  });

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

  const todayCount = reservations.filter(r => r.date === today).length;
  const upcomingCount = reservations.filter(r => r.date > today).length;
  const confirmedCount = reservations.filter(r => r.status === "confirmed").length;
  const cancelledCount = reservations.filter(r => r.status === "cancelled").length;

  const openAdd = () => { setEditId(null); setForm(emptyForm()); setShowForm(true); };
  const openEdit = (r: Reservation) => {
    setEditId(r.id);
    setForm({ customerName: r.customerName, customerPhone: r.customerPhone ?? "", date: r.date, time: r.time, guestCount: r.guestCount, tableId: r.tableId ?? "", tableNumber: r.tableNumber ?? "", status: r.status, specialRequests: r.specialRequests ?? "", source: r.source });
    setShowForm(true);
  };

  const handleSelectCustomer = (c: CustomerRecord) => {
    setForm(p => ({
      ...p,
      customerName: c.name,
      customerPhone: formatPhoneNumber(c.phone || ""),
    }));
    setShowCustSuggestions(false);
    toast.info(`Selected registered customer: ${c.name}`);
  };

  const handleSave = async () => {
    if (!form.customerName?.trim()) { toast.error("Customer name required"); return; }
    if (!form.date) { toast.error("Date required"); return; }
    if (!form.time) { toast.error("Time required"); return; }

    const cleanPhone = form.customerPhone ? form.customerPhone.replace(/\D/g, "") : "";
    if (form.customerPhone && cleanPhone.length !== 11) {
      toast.error("Phone number must be exactly 11 digits (e.g. 0300-1234567)");
      return;
    }

    // Auto-create customer if not existing in registered customers
    const exists = customers.some(c =>
      (c.name.toLowerCase().trim() === form.customerName?.toLowerCase().trim()) ||
      (cleanPhone && c.phone && c.phone.replace(/\D/g, "") === cleanPhone)
    );

    if (!exists && form.customerName?.trim() && cleanPhone) {
      try {
        await customerService.createCustomer({
          name: form.customerName.trim(),
          phone: form.customerPhone?.trim(),
          customerType: "regular",
        });
        qc.invalidateQueries({ queryKey: ["customers-list"] });
        toast.success(`Customer "${form.customerName}" registered automatically!`);
      } catch {
        // non-blocking fallback
      }
    }

    const payload: CreateReservationInput = {
      customerName: form.customerName!.trim(),
      customerPhone: form.customerPhone?.trim() || undefined,
      date: form.date!,
      time: form.time!,
      guestCount: form.guestCount,
      tableId: form.tableId || undefined,
      tableNumber: form.tableNumber || undefined,
      status: form.status || "pending",
      specialRequests: form.specialRequests || undefined,
      source: form.source || "phone",
    };
    if (editId) updateMutation.mutate({ id: editId, data: payload });
    else createMutation.mutate(payload);
  };

  const changeStatus = (id: string, status: string) => updateMutation.mutate({ id, data: { status } });

  if (isLoading) return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      <Skeleton className="h-10 w-full rounded-lg" />
      {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg mt-2" />)}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <PageHeader
          icon={<CalendarCheck className="h-5 w-5" />}
          title="Reservations"
          subtitle="Table bookings and reservation management"
          actions={!isSuperAdmin ? <Button className="gradient-primary text-primary-foreground" onClick={openAdd}><Plus className="h-4 w-4 mr-2" />New Reservation</Button> : undefined}
        />
        <OutletFilterSelect outletId={selectedOutletId} setOutletId={setOutletId} outlets={outlets} isSuperAdmin={isSuperAdmin} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="shadow-sm"><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Today's</p><p className="text-2xl font-bold">{todayCount}</p></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Upcoming</p><p className="text-2xl font-bold">{upcomingCount}</p></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Confirmed</p><p className="text-2xl font-bold">{confirmedCount}</p></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Cancelled</p><p className="text-2xl font-bold">{cancelledCount}</p></CardContent></Card>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {["Today", "Tomorrow", "This Week", "All"].map(s => (
          <Button key={s} variant={dateFilter === s ? "default" : "outline"} size="sm"
            onClick={() => setDateFilter(s)}
            className={dateFilter === s ? "gradient-primary text-primary-foreground" : ""}>{s}</Button>
        ))}
      </div>

      <Card className="shadow-sm"><CardContent className="pt-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead>Date / Time</TableHead><TableHead>Customer</TableHead><TableHead>Guests</TableHead>
              <TableHead>Table</TableHead><TableHead>Source</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map(r => (
                <TableRow key={r.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="font-medium whitespace-nowrap">{r.date}<br/><span className="text-xs text-muted-foreground">{r.time}</span></TableCell>
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
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(r.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No reservations</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </CardContent></Card>

      {showForm && (!isSuperAdmin || editId) && (
        <Card className="shadow-sm border-primary/30 relative">
          <CardHeader className="pb-3"><CardTitle className="text-base">{editId ? "Edit" : "New"} Reservation</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {/* Customer Inputs with Suggestions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative" ref={dropdownRef}>
              <div className="relative">
                <Label>Customer Name *</Label>
                <Input
                  value={form.customerName || ""}
                  onFocus={() => setShowCustSuggestions(true)}
                  onChange={e => {
                    setForm(p => ({ ...p, customerName: e.target.value }));
                    setShowCustSuggestions(true);
                  }}
                  placeholder="Type or select registered customer"
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Phone (11 Digits)</Label>
                <Input
                  value={form.customerPhone || ""}
                  onFocus={() => setShowCustSuggestions(true)}
                  onChange={e => {
                    const formatted = formatPhoneNumber(e.target.value);
                    setForm(p => ({ ...p, customerPhone: formatted }));
                    setShowCustSuggestions(true);
                  }}
                  placeholder="0300-1234567"
                  className="mt-1"
                />
              </div>

              {/* Registered Customers Suggestions Popup */}
              {showCustSuggestions && filteredCustomerSuggestions.length > 0 && (
                <div className="absolute left-0 top-full mt-1 w-full bg-popover text-popover-foreground border border-border rounded-xl shadow-xl z-50 p-1.5 space-y-1 animate-in fade-in-50 slide-in-from-top-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase px-2 py-1 flex items-center gap-1">
                    <Users className="h-3 w-3 text-primary" /> Registered Customer Suggestions ({filteredCustomerSuggestions.length})
                  </p>
                  {filteredCustomerSuggestions.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleSelectCustomer(c)}
                      className="w-full text-left px-2.5 py-1.5 hover:bg-accent hover:text-accent-foreground rounded-lg transition-colors flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-semibold text-foreground">{c.name}</span>
                        {c.phone && <span className="text-muted-foreground ml-2">({c.phone})</span>}
                      </div>
                      <span className="text-[10px] text-primary font-bold flex items-center gap-0.5">
                        Select <CheckCircle2 className="h-3 w-3" />
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* High-Contrast Date & Time Pickers */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={form.date || ""}
                  onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                  className="mt-1 [color-scheme:dark] bg-background border-border text-foreground font-semibold dark:[color-scheme:dark]"
                />
              </div>
              <div>
                <Label>Time *</Label>
                <Input
                  type="time"
                  value={form.time || ""}
                  onChange={e => setForm(p => ({ ...p, time: e.target.value }))}
                  className="mt-1 [color-scheme:dark] bg-background border-border text-foreground font-semibold dark:[color-scheme:dark]"
                />
              </div>
              <div>
                <Label>Guests (Pax)</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.guestCount || ""}
                  onChange={e => setForm(p => ({ ...p, guestCount: Number(e.target.value) }))}
                  className="mt-1"
                />
              </div>
            </div>

            {/* POS-Style Table Dropdown */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Table</Label>
                <Select value={form.tableId || "none"} onValueChange={v => {
                  const t = tables.find(t => t.id === v);
                  setForm(p => ({ ...p, tableId: v === "none" ? undefined : v, tableNumber: t?.number ? String(t.number) : "" }));
                }}>
                  <SelectTrigger className="mt-1 bg-background border-border text-foreground font-medium"><SelectValue placeholder="Select table" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No table assigned</SelectItem>
                    {tables.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.status === "available" && "🟢 "}
                        {t.status === "occupied" && "🔴 "}
                        {t.status === "bill-requested" && "🧾 "}
                        {t.status === "reserved" && "🟡 "}
                        {t.status === "maintenance" && "🔧 "}
                        Table {t.number} ({t.floor || "Main Hall"}) · {t.capacity} seats · {t.status === "bill-requested" ? "Bill Req" : t.status.charAt(0).toUpperCase() + t.status.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Source</Label>
                <Select value={form.source || "phone"} onValueChange={v => setForm(p => ({ ...p, source: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="phone">Phone</SelectItem>
                    <SelectItem value="walkin">Walk-in</SelectItem>
                    <SelectItem value="online">Online</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div><Label>Special Requests / Event Details</Label><Textarea value={form.specialRequests || ""} onChange={e => setForm(p => ({ ...p, specialRequests: e.target.value }))} className="mt-1" placeholder="e.g. Birthday celebration, High chair required..." /></div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button className="gradient-primary text-primary-foreground" onClick={handleSave}
                disabled={createMutation.isPending || updateMutation.isPending}>Save Reservation</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Reservation?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Reservations;

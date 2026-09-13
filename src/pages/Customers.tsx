import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { customerService } from "@/services/customer.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Search, Eye, Plus, Users, Trash2, Loader2, Info } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { toast } from "sonner";
import { formatPakistaniPhone } from "@/lib/utils";
import { TablePagination, paginate } from "@/components/TablePagination";

/** "YYYY-MM-DD" from local Y/M/D parts — same reasoning as Sales.tsx/Expenses.tsx's toYmd. */
function toYmd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const Customers = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { settings } = useData();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "Super Admin";
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "" });
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const currency = settings.currency || "Rs.";

  // Dashboard-pill-style date range (Today/This Week/This Month + paired DatePickers), same
  // pattern as Expenses.tsx/CashHub.tsx. Optional — with none set, the page shows every
  // customer's lifetime totals (unchanged behavior); with a range set, only customers with an
  // order in that window are shown and their Orders/Total Spent/Due reflect just that window
  // (see customer.controller.ts's getCustomers).
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const applyPreset = (preset: "Today" | "This Week" | "This Month") => {
    const now = new Date();
    if (preset === "Today") {
      setRangeFrom(toYmd(now)); setRangeTo(toYmd(now));
    } else if (preset === "This Week") {
      const from = new Date(now); from.setDate(from.getDate() - 7);
      setRangeFrom(toYmd(from)); setRangeTo(toYmd(now));
    } else {
      setRangeFrom(toYmd(new Date(now.getFullYear(), now.getMonth(), 1))); setRangeTo(toYmd(now));
    }
    setActivePreset(preset);
    setPage(1);
  };
  const handleRangeFrom = (v: string) => { setRangeFrom(v); setActivePreset(null); setPage(1); };
  const handleRangeTo = (v: string) => { setRangeTo(v); setActivePreset(null); setPage(1); };
  const clearRange = () => { setRangeFrom(""); setRangeTo(""); setActivePreset(null); setPage(1); };

  // Arriving from the Dashboard's "Customer Analytics" section pre-fills the date range (+ a
  // specific top-customer's name into search). Re-seeds on every genuinely new navigation, not
  // just first mount — same useEffect-keyed-on-searchParams pattern used everywhere else.
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const name = searchParams.get("search");
    if (from || to || name) {
      if (from) setRangeFrom(from);
      if (to) setRangeTo(to);
      setActivePreset(null);
      if (name) setSearch(name);
      setPage(1);
    }
  }, [searchParams]);

  const { data: resp, isLoading } = useQuery({
    queryKey: ["customers", { search, rangeFrom, rangeTo }],
    queryFn: () => customerService.getCustomers({
      search: search || undefined,
      limit: 1000,
      from: rangeFrom || undefined,
      to: rangeTo || undefined,
    }),
  });
  const rawCustomers = resp?.data ?? [];

  // Backend already dedups by phone/name and computes Orders/Total Spent/Due (period-scoped
  // when a range is active) — this just guards against the rare case of two raw rows still
  // sharing a key, merging contact fields only (never re-summing stats the backend already
  // computed correctly).
  const customers = useMemo(() => {
    const map = new Map<string, (typeof rawCustomers)[0]>();
    for (const c of rawCustomers) {
      const cleanPhone = c.phone ? c.phone.replace(/\D/g, "") : "";
      const isDummy = !cleanPhone || cleanPhone === "00000000000" || cleanPhone === "11111111111" || cleanPhone === "12345678901";
      const key = (!isDummy && cleanPhone.length >= 7)
        ? `phone:${cleanPhone}`
        : `name:${c.name.toLowerCase().trim()}`;

      if (!map.has(key)) {
        map.set(key, { ...c });
      } else {
        const existing = map.get(key)!;
        if (!existing.email && c.email) existing.email = c.email;
        if (!existing.address && c.address) existing.address = c.address;
        if (!existing.phone && c.phone) existing.phone = c.phone;
      }
    }
    return Array.from(map.values());
  }, [rawCustomers]);

  const periodActive = Boolean(rangeFrom || rangeTo);
  const paged = paginate(customers, page);

  const formatPhoneNumber = (val: string): string => {
    const digitsOnly = val.replace(/\D/g, "").slice(0, 11);
    if (digitsOnly.length > 4) {
      return `${digitsOnly.slice(0, 4)}-${digitsOnly.slice(4)}`;
    }
    return digitsOnly;
  };

  const handleAdd = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    const cleanPhone = form.phone.replace(/\D/g, "");
    if (cleanPhone.length !== 11) { toast.error("Phone number must be exactly 11 digits (e.g. 0300-1234567)"); return; }
    setSaving(true);
    try {
      await customerService.createCustomer({ name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim() || undefined, address: form.address.trim() || undefined });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setShowAdd(false);
      setForm({ name: "", phone: "", email: "", address: "" });
      toast.success("Customer added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add customer");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await customerService.deleteCustomer(deleteId);
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setDeleteId(null);
      toast.success("Customer deleted");
    } catch {
      toast.error("Failed to delete customer");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Users className="h-5 w-5" />}
        title="Customers"
        subtitle="Manage your customers"
        actions={!isSuperAdmin ? <Button className="gradient-primary text-primary-foreground" onClick={() => setShowAdd(v => !v)}><Plus className="h-4 w-4 mr-2" />Add Customer</Button> : undefined}
      />
      {showAdd && !isSuperAdmin && (
        <Card className="shadow-sm border-primary/30">
          <CardHeader className="pb-3"><CardTitle className="text-base">Add Customer</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Name *" value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} />
            <Input placeholder="Phone (11 Digits) *" value={form.phone} maxLength={12} onChange={(e) => setForm(p => ({ ...p, phone: formatPhoneNumber(e.target.value) }))} />
            <Input placeholder="Email" value={form.email} onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))} />
            <Input placeholder="Address" value={form.address} onChange={(e) => setForm(p => ({ ...p, address: e.target.value }))} />
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button className="gradient-primary text-primary-foreground" onClick={handleAdd} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Save
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      <Card className="shadow-sm">
        <CardHeader className="pb-3 space-y-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search by name or phone..." className="pl-9" />
          </div>

          {/* Date range — mirrors Expenses.tsx's filter bar. Seeded from the Dashboard's
              "Customer Analytics" drill-down. */}
          <div className="flex items-center gap-2.5 flex-wrap pt-2 border-t border-border/40">
            <div className="inline-flex items-center p-0.5 rounded-lg bg-muted/60 border border-border/60 shadow-sm">
              {(["Today", "This Week", "This Month"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${activePreset === p ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="inline-flex items-center gap-1.5">
              <div className="w-36"><DatePicker value={rangeFrom} onChange={handleRangeFrom} placeholder="Start date" className="h-8 text-xs bg-background" /></div>
              <span className="text-xs text-muted-foreground/60 font-medium px-0.5">to</span>
              <div className="w-36"><DatePicker value={rangeTo} onChange={handleRangeTo} min={rangeFrom || undefined} placeholder="End date" className="h-8 text-xs bg-background" /></div>
            </div>
            {periodActive && (
              <Button variant="ghost" size="sm" onClick={clearRange} className="h-8 text-xs font-semibold rounded-xl text-muted-foreground hover:text-foreground">
                Clear Filters
              </Button>
            )}
          </div>

          {periodActive && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 border border-border/50 rounded-lg px-3 py-2">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                Showing only customers with activity between <strong className="text-foreground">{rangeFrom || rangeTo}</strong> and{" "}
                <strong className="text-foreground">{rangeTo || rangeFrom}</strong> — Orders/Total Spent/Due reflect this period, not lifetime.
              </span>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : customers.length === 0 ? (
            <div className="text-center py-12"><Users className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" /><p className="text-muted-foreground">No customers found</p></div>
          ) : (
            <>
              <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="sticky top-0 z-10 bg-card">SN</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-card">Name</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-card">Phone</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-card">Email</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-card">Orders</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-card">Total Spent</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-card">Due</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-card">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.map((c, i) => {
                      // Backend-computed already (lifetime, or period-scoped when a date range
                      // is active — see customer.controller.ts's getCustomers).
                      const totalOrdersCount = c.totalOrders;
                      const totalSpentVal = c.totalSpent;
                      const outstandingDueVal = c.outstandingDue;

                      return (
                        <TableRow key={c.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell>{(page - 1) * 10 + i + 1}</TableCell>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell>{formatPakistaniPhone(c.phone)}</TableCell>
                          <TableCell className="text-muted-foreground">{c.email}</TableCell>
                          <TableCell>{totalOrdersCount}</TableCell>
                          <TableCell>{currency} {totalSpentVal.toLocaleString()}</TableCell>
                          <TableCell className={outstandingDueVal > 0 ? "text-destructive font-medium" : "text-success"}>{currency} {outstandingDueVal.toLocaleString()}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/customers/${c.id}`)}><Eye className="h-3 w-3" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(c.id)}><Trash2 className="h-3 w-3" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <TablePagination currentPage={page} totalItems={customers.length} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Customer?</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete this customer? This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Customers;

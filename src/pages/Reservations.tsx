import { useState, useMemo, useRef, useEffect } from "react";
import {
  CalendarCheck, Plus, Pencil, Trash2, User, Phone, Users, CheckCircle2,
  Utensils, CreditCard, Banknote, Smartphone, ShoppingBag, ArrowRight, Truck, XCircle,
  Search, AlertCircle, Clock, MapPin, Check, DollarSign, ListFilter, Sparkles, ChevronRight, X, Zap
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page-header";
import { reservationService, type Reservation, type CreateReservationInput, type PreOrderItem } from "@/services/reservation.service";
import { tableService } from "@/services/table.service";
import { customerService, type CustomerRecord } from "@/services/customer.service";
import { menuService, type MenuItemRecord, type CategoryRecord } from "@/services/menu.service";
import { toast } from "sonner";
import { useOutletFilter } from "@/hooks/useOutletFilter";
import { OutletFilterSelect } from "@/components/OutletFilterSelect";
import { useAuth } from "@/contexts/AuthContext";
import { useReservationEvents } from "@/hooks/use-reservation-events";
import { cn } from "@/lib/utils";

import { useData } from "@/contexts/DataContext";

const statusColors: Record<string, string> = {
  pending: "bg-warning/10 text-warning border-warning/20",
  confirmed: "bg-info/10 text-info border-info/20",
  seated: "bg-primary/10 text-primary border-primary/20",
  completed: "bg-success/10 text-success border-success/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  noShow: "bg-muted text-muted-foreground border-border",
};

type FormState = Partial<CreateReservationInput>;

const emptyForm = (): FormState => ({
  bookingType: "table_reservation",
  orderType: "Dine In",
  customerName: "",
  customerPhone: "",
  date: new Date().toISOString().split("T")[0],
  time: "19:00",
  guestCount: 2,
  source: "phone",
  status: "pending",
  advancePaid: 0,
  paymentMethod: "Cash",
  paymentStatus: "unpaid",
  preOrderItems: [],
  subtotal: 0,
  tax: 0,
  totalAmount: 0,
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
  const navigate = useNavigate();
  const { outletId: selectedOutletId, setOutletId, outlets } = useOutletFilter();
  const { user } = useAuth();
  const { settings } = useData();
  const isSuperAdmin = user?.role === "Super Admin";

  const registeredPaymentMethods = useMemo(() => {
    return settings?.paymentMethods && settings.paymentMethods.length > 0
      ? settings.paymentMethods
      : ["Cash", "Credit Card", "Online Transfer", "JazzCash / EasyPaisa"];
  }, [settings?.paymentMethods]);

  const [activeTab, setActiveTab] = useState<"all" | "table_reservation" | "future_order">("all");
  const [dateFilter, setDateFilter] = useState("Today");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  // Food Menu Selection Modal State
  const [showMenuPicker, setShowMenuPicker] = useState(false);
  const [menuSearch, setMenuSearch] = useState("");
  const [selectedCatId, setSelectedCatId] = useState<string>("all");

  // Customer Autocomplete state
  const [showCustSuggestions, setShowCustSuggestions] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const today = new Date().toISOString().split("T")[0];
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split("T")[0]; })();

  // Queries
  useReservationEvents(() => {
    queryClient.invalidateQueries({ queryKey: ["reservations"] });
  });

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

  const { data: menuItems = [] } = useQuery({
    queryKey: ["menu-items-for-preorder"],
    queryFn: () => menuService.getMenuItems({ limit: 300 }),
    enabled: showForm,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["menu-categories-preorder"],
    queryFn: () => menuService.getCategories(),
    enabled: showForm,
  });

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

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: CreateReservationInput) => reservationService.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reservations"] });
      toast.success(form.bookingType === "future_order" ? "Future Pre-Order created!" : "Table Reservation added!");
      setShowForm(false);
    },
    onError: () => toast.error("Failed to save reservation"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateReservationInput & { status: string }> }) =>
      reservationService.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reservations"] });
      toast.success("Updated successfully");
      setShowForm(false);
    },
    onError: () => toast.error("Failed to update"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => reservationService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reservations"] });
      toast.success("Deleted successfully");
      setDeleteId(null);
    },
    onError: () => toast.error("Failed to delete"),
  });

  const convertMutation = useMutation({
    mutationFn: (id: string) => reservationService.convertToOrder(id),
    onSuccess: (order) => {
      qc.invalidateQueries({ queryKey: ["reservations"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["tables"] });
      toast.success(`Converted to active POS Order #${order.orderNumber}!`, {
        action: {
          label: "Open POS",
          onClick: () => navigate("/pos"),
        },
      });
    },
    onError: (err: any) => toast.error(err?.message || "Failed to convert to active order"),
  });

  const changeStatus = (id: string, status: string) => {
    updateMutation.mutate(
      { id, data: { status } },
      {
        onSuccess: () => {
          if (status === "confirmed") {
            toast.success("Reservation accepted & confirmed! Cards and POS / Waiter Panel updated.");
          } else if (status === "cancelled") {
            toast.success("Reservation declined / cancelled.");
          }
        },
      }
    );
  };

  // Filters & Calculations
  const filtered = useMemo(() => {
    return reservations.filter(r => {
      if (activeTab === "table_reservation" && (r.bookingType && r.bookingType !== "table_reservation")) return false;
      if (activeTab === "future_order" && r.bookingType !== "future_order") return false;

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
  }, [reservations, activeTab, dateFilter, today, tomorrow]);

  const activeReservations = useMemo(() => {
    return reservations.filter(r => r.status !== "pending" && r.status !== "cancelled" && r.status !== "noShow");
  }, [reservations]);

  const todayCount = activeReservations.filter(r => r.date === today).length;
  const upcomingCount = activeReservations.filter(r => r.date > today).length;
  const preOrdersCount = activeReservations.filter(r => r.bookingType === "future_order").length;
  const totalAdvanceCollected = activeReservations.reduce((acc, r) => acc + (r.advancePaid || 0), 0);
  const pendingCount = reservations.filter(r => r.status === "pending").length;

  // Form Handlers
  const openAdd = (type: "table_reservation" | "future_order" = "table_reservation") => {
    setEditId(null);
    setForm({ ...emptyForm(), bookingType: type });
    setShowForm(true);
  };

  const openEdit = (r: Reservation) => {
    setEditId(r.id);
    setForm({
      bookingType: r.bookingType || "table_reservation",
      orderType: r.orderType || "Dine In",
      deliveryAddress: r.deliveryAddress ?? "",
      customerName: r.customerName,
      customerPhone: r.customerPhone ?? "",
      date: r.date,
      time: r.time,
      guestCount: r.guestCount,
      tableId: r.tableId ?? "",
      tableNumber: r.tableNumber ?? "",
      status: r.status,
      specialRequests: r.specialRequests ?? "",
      source: r.source,
      advancePaid: r.advancePaid || 0,
      paymentMethod: r.paymentMethod ?? "Cash",
      paymentStatus: r.paymentStatus ?? (r.advancePaid > 0 ? "deposit_paid" : "unpaid"),
      depositRef: r.depositRef ?? "",
      preOrderItems: r.preOrderItems || [],
      subtotal: r.subtotal || 0,
      tax: r.tax || 0,
      totalAmount: r.totalAmount || 0,
    });
    setShowForm(true);
  };

  const handleSelectCustomer = (c: CustomerRecord) => {
    setForm(p => ({
      ...p,
      customerName: c.name,
      customerPhone: formatPhoneNumber(c.phone || ""),
    }));
    setShowCustSuggestions(false);
    toast.info(`Selected customer: ${c.name}`);
  };

  // Pre-Order Item Handlers
  const handleAddPreOrderItem = (item: MenuItemRecord, variantId?: string) => {
    const variant = variantId ? item.variants?.find(v => v.id === variantId) : undefined;
    const price = variant ? Number(variant.price) : Number(item.price);
    const itemName = variant ? `${item.name} (${variant.name})` : item.name;

    setForm(prev => {
      const currentItems = prev.preOrderItems || [];
      const existingIdx = currentItems.findIndex(i => i.menuItemId === item.id && i.variantId === (variantId || undefined));
      let updated: PreOrderItem[];

      if (existingIdx > -1) {
        updated = currentItems.map((ci, idx) => idx === existingIdx ? { ...ci, qty: ci.qty + 1 } : ci);
      } else {
        updated = [...currentItems, {
          menuItemId: item.id,
          variantId: variantId || undefined,
          name: itemName,
          price,
          qty: 1,
        }];
      }

      const subtotal = updated.reduce((sum, i) => sum + (i.price * i.qty), 0);
      const tax = Math.round(subtotal * 0.16); // 16% standard tax
      const totalAmount = subtotal + tax;

      return {
        ...prev,
        preOrderItems: updated,
        subtotal,
        tax,
        totalAmount,
      };
    });
    toast.success(`Added ${itemName}`);
  };

  const handleUpdateItemQty = (index: number, delta: number) => {
    setForm(prev => {
      const currentItems = prev.preOrderItems || [];
      const updated = currentItems.map((item, idx) => {
        if (idx === index) {
          const newQty = item.qty + delta;
          return newQty > 0 ? { ...item, qty: newQty } : null;
        }
        return item;
      }).filter(Boolean) as PreOrderItem[];

      const subtotal = updated.reduce((sum, i) => sum + (i.price * i.qty), 0);
      const tax = Math.round(subtotal * 0.16);
      const totalAmount = subtotal + tax;

      return {
        ...prev,
        preOrderItems: updated,
        subtotal,
        tax,
        totalAmount,
      };
    });
  };

  const getEffectiveStatus = (r: { date: string; time: string; status: string }) => {
    if (r.status === "seated" || r.status === "completed" || r.status === "cancelled" || r.status === "noShow") {
      return r.status;
    }
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const currentHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    if (r.date < todayStr || (r.date === todayStr && currentHHMM >= r.time)) {
      return "not_arrived";
    }
    return r.status;
  };

  const handleSave = async () => {
    if (!form.customerName?.trim()) { toast.error("Customer name required"); return; }
    if (!form.date) { toast.error("Date required"); return; }
    if (!form.time) { toast.error("Time required"); return; }

    if (form.orderType === "Take Away" || form.orderType === "Delivery") {
      if (!form.preOrderItems || form.preOrderItems.length === 0) {
        toast.error(`Food menu items are required for ${form.orderType} reservations. Click 'Add Food Items' below.`);
        return;
      }
    }
    if (form.orderType === "Delivery" && !form.deliveryAddress?.trim()) {
      toast.error("Delivery address is required for Delivery reservations");
      return;
    }

    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const currentHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    if (form.date < todayStr) {
      toast.error("Cannot book a reservation for a past date");
      return;
    }
    if (form.date === todayStr && form.time < currentHHMM) {
      toast.error(`Cannot book a reservation for a past time (current time is ${currentHHMM})`);
      return;
    }

    const custNameTrim = form.customerName?.trim();
    const cleanPhone = form.customerPhone ? form.customerPhone.replace(/\D/g, "") : "";
    if (form.customerPhone && cleanPhone.length !== 11) {
      toast.error("Phone number must be exactly 11 digits (e.g. 0300-1234567)");
      return;
    }

    // Auto-create customer on Customers page if not existing
    if (custNameTrim) {
      const isDummyPhone = cleanPhone === "00000000000" || cleanPhone === "11111111111" || cleanPhone === "12345678901";
      const exists = customers.some(c => {
        const nameMatch = c.name.toLowerCase().trim() === custNameTrim.toLowerCase();
        const phoneMatch = !isDummyPhone && cleanPhone.length === 11 && c.phone && c.phone.replace(/\D/g, "") === cleanPhone;
        return nameMatch || phoneMatch;
      });

      if (!exists) {
        try {
          await customerService.createCustomer({
            name: custNameTrim,
            phone: form.customerPhone?.trim() || (cleanPhone ? formatPhoneNumber(cleanPhone) : undefined),
            customerType: "regular",
          });
          qc.invalidateQueries({ queryKey: ["customers-list"] });
          qc.invalidateQueries({ queryKey: ["customers"] });
          toast.success(`Customer "${custNameTrim}" registered on Customers page!`);
        } catch (err: any) {
          console.error("Auto-create customer error", err);
          toast.error(err?.message || `Could not auto-register "${custNameTrim}" on Customers page`);
        }
      }
    }

    const payload: CreateReservationInput = {
      bookingType: form.bookingType || "table_reservation",
      orderType: form.orderType || "Dine In",
      deliveryAddress: form.bookingType === "future_order" && form.orderType === "Delivery" ? form.deliveryAddress : undefined,
      customerName: form.customerName!.trim(),
      customerPhone: form.customerPhone?.trim() || undefined,
      date: form.date!,
      time: form.time!,
      guestCount: form.guestCount || 1,
      tableId: form.tableId || undefined,
      tableNumber: form.tableNumber || undefined,
      status: form.status || "pending",
      specialRequests: form.specialRequests || undefined,
      source: form.source || "phone",
      advancePaid: form.advancePaid ? Number(form.advancePaid) : 0,
      paymentMethod: form.advancePaid ? form.paymentMethod : undefined,
      paymentStatus: (form.advancePaid || 0) >= (form.totalAmount || 0) && (form.totalAmount || 0) > 0 ? "fully_paid" : (form.advancePaid || 0) > 0 ? "deposit_paid" : "unpaid",
      depositRef: form.depositRef || undefined,
      preOrderItems: form.preOrderItems || [],
      subtotal: form.subtotal || 0,
      tax: form.tax || 0,
      totalAmount: form.totalAmount || 0,
    };

    if (editId) updateMutation.mutate({ id: editId, data: payload });
    else createMutation.mutate(payload);
  };

  const filteredMenuItems = useMemo(() => {
    return menuItems.filter(item => {
      const matchCat = selectedCatId === "all" || item.categoryId === selectedCatId;
      const matchSearch = !menuSearch || item.name.toLowerCase().includes(menuSearch.toLowerCase());
      return matchCat && matchSearch && item.available;
    });
  }, [menuItems, selectedCatId, menuSearch]);

  const getTableReservationStatus = (tbl: any) => {
    if (!form.date || !form.time) {
      return { isReserved: false, label: "Available" };
    }

    const parseTimeToMinutes = (timeStr: string) => {
      if (!timeStr) return null;
      const clean = timeStr.trim();
      if (clean.includes(":")) {
        const parts = clean.split(":");
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (!isNaN(h) && !isNaN(m)) return h * 60 + m;
      }
      return null;
    };

    const selTimeMinutes = parseTimeToMinutes(form.time);
    if (selTimeMinutes === null) return { isReserved: false, label: "Available" };

    const activeSameDateRes = reservations.filter(r => {
      if (r.id === editId) return false;
      if (r.status !== "confirmed" && r.status !== "pending") return false;
      if (r.date !== form.date) return false;
      const matchTable = (r.tableId && r.tableId === tbl.id) || (r.tableNumber && String(r.tableNumber) === String(tbl.number));
      return matchTable;
    });

    for (const r of activeSameDateRes) {
      const resTimeMinutes = parseTimeToMinutes(r.time);
      if (resTimeMinutes === null) continue;

      if (Math.abs(selTimeMinutes - resTimeMinutes) < 60) {
        return { isReserved: true, label: `Reserved (${r.time})` };
      }
    }

    return { isReserved: false, label: "Available" };
  };

  if (isLoading) return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      <Skeleton className="h-10 w-full rounded-lg" />
      {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg mt-2" />)}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <PageHeader
          icon={<CalendarCheck className="h-5 w-5 text-primary" />}
          title="Reservations & Future Sales"
          subtitle="Table bookings, advance pre-orders, and deposit management"
          actions={!isSuperAdmin ? (
            <Button className="gradient-primary text-primary-foreground shadow-md font-bold" onClick={() => openAdd("table_reservation")}>
              <Plus className="h-4 w-4 mr-2" />New Reservation
            </Button>
          ) : undefined}
        />
        <OutletFilterSelect outletId={selectedOutletId} setOutletId={setOutletId} outlets={outlets} isSuperAdmin={isSuperAdmin} />
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="shadow-sm border-primary/20 bg-card/60 backdrop-blur">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Today's Total</p>
              <p className="text-2xl font-bold mt-1">{todayCount}</p>
            </div>
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <CalendarCheck className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-info/20 bg-card/60 backdrop-blur">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Future Pre-Orders</p>
              <p className="text-2xl font-bold mt-1 text-info">{preOrdersCount}</p>
            </div>
            <div className="h-10 w-10 rounded-full bg-info/10 flex items-center justify-center text-info">
              <Utensils className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-success/20 bg-card/60 backdrop-blur">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Advance Deposits</p>
              <p className="text-2xl font-bold mt-1 text-success">PKR {totalAdvanceCollected.toLocaleString()}</p>
            </div>
            <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center text-success">
              <DollarSign className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-warning/20 bg-card/60 backdrop-blur">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Upcoming Bookings</p>
              <p className="text-2xl font-bold mt-1 text-warning">{upcomingCount}</p>
            </div>
            <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center text-warning">
              <Clock className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs & Date Filters */}
      <div className="flex flex-col sm:flex-row justify-between gap-3 items-start sm:items-center">
        <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full sm:w-auto">
          <TabsList className="bg-muted/60 p-1 rounded-xl">
            <TabsTrigger value="all" className="rounded-lg text-xs font-semibold">All Records</TabsTrigger>
            <TabsTrigger value="table_reservation" className="rounded-lg text-xs font-semibold flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-primary" /> Table Bookings
            </TabsTrigger>
            <TabsTrigger value="future_order" className="rounded-lg text-xs font-semibold flex items-center gap-1.5">
              <Utensils className="h-3.5 w-3.5 text-info" /> Future Pre-Orders
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex gap-1.5 flex-wrap">
          {["Today", "Tomorrow", "This Week", "All"].map(s => (
            <Button key={s} variant={dateFilter === s ? "default" : "outline"} size="sm"
              onClick={() => setDateFilter(s)}
              className={dateFilter === s ? "gradient-primary text-primary-foreground shadow" : "text-xs"}>{s}</Button>
          ))}
        </div>
      </div>

      {/* Main Records Table */}
      <Card className="shadow-sm border-border/80">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead>Type</TableHead>
                  <TableHead>Date / Time</TableHead>
                  <TableHead>Customer Details</TableHead>
                  <TableHead>Table / Order</TableHead>
                  <TableHead>Advance Deposit</TableHead>
                  <TableHead>Pre-Order Food</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => {
                  const effStatus = getEffectiveStatus(r);
                  return (
                  <TableRow key={r.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell>
                      <Badge variant="outline" className={cn(
                        "capitalize font-semibold text-[11px] flex items-center gap-1.5 w-fit rounded-lg px-2.5 py-0.5",
                        r.orderType === "Delivery" ? "bg-amber-500/10 text-amber-500 border-amber-500/30" :
                        r.orderType === "Take Away" ? "bg-info/10 text-info border-info/30" : "bg-primary/10 text-primary border-primary/30"
                      )}>
                        {r.orderType === "Delivery" ? <Truck className="h-3 w-3" /> : r.orderType === "Take Away" ? <ShoppingBag className="h-3 w-3" /> : <Utensils className="h-3 w-3" />}
                        {r.orderType || (r.bookingType === "future_order" ? "Take Away" : "Dine In")}
                      </Badge>
                    </TableCell>

                    <TableCell className="font-medium whitespace-nowrap">
                      <span className="font-semibold text-foreground">{r.date}</span>
                      <br/>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3 text-primary" /> {r.time}
                      </span>
                    </TableCell>

                    <TableCell>
                      <div>
                        <p className="font-semibold text-foreground text-sm">{r.customerName}</p>
                        {r.customerPhone && <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> {r.customerPhone}</p>}
                      </div>
                    </TableCell>

                    <TableCell>
                      {r.bookingType === "table_reservation" || r.orderType === "Dine In" ? (
                        <span className="text-xs font-semibold text-foreground">
                          {r.tableNumber ? `Table ${r.tableNumber}` : "Unassigned"} · {r.guestCount} Guests
                        </span>
                      ) : (
                        <div className="text-xs">
                          <span className="font-bold text-info">{r.orderType}</span>
                          {r.deliveryAddress && <p className="text-[10px] text-muted-foreground truncate max-w-[150px]"><MapPin className="h-2.5 w-2.5 inline mr-0.5" />{r.deliveryAddress}</p>}
                        </div>
                      )}
                    </TableCell>

                    <TableCell>
                      {(r.advancePaid || 0) > 0 ? (
                        <div className="space-y-0.5">
                          <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-xs font-bold flex items-center gap-1 w-fit">
                            <Check className="h-3 w-3" /> PKR {r.advancePaid.toLocaleString()}
                          </Badge>
                          <p className="text-[10px] text-muted-foreground">via {r.paymentMethod || "Cash"}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No Deposit</span>
                      )}
                    </TableCell>

                    <TableCell>
                      {r.preOrderItems && r.preOrderItems.length > 0 ? (
                        <div className="text-xs">
                          <span className="font-semibold text-foreground">{r.preOrderItems.length} items</span>
                          <span className="text-muted-foreground text-[11px] block font-mono">
                            Food Total: PKR {(r.subtotal || r.preOrderItems.reduce((sum: number, i: any) => sum + (Number(i.price) * Number(i.qty)), 0)).toLocaleString()}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell>
                      {(() => {
                        if (effStatus === "not_arrived") {
                          return (
                            <Badge variant="outline" className="capitalize border text-xs font-bold bg-rose-500/15 text-rose-500 border-rose-500/30 flex items-center gap-1 w-fit">
                              <AlertCircle className="h-3 w-3" /> Not Arrived
                            </Badge>
                          );
                        }
                        if (effStatus === "confirmed") {
                          return (
                            <Badge variant="outline" className="capitalize border text-xs font-semibold bg-blue-500/10 text-blue-500 border-blue-500/30 flex items-center gap-1 w-fit">
                              <CheckCircle2 className="h-3 w-3" /> Confirmed
                            </Badge>
                          );
                        }
                        if (effStatus === "seated") {
                          return (
                            <Badge variant="outline" className="capitalize border text-xs font-semibold bg-emerald-500/10 text-emerald-500 border-emerald-500/30 flex items-center gap-1 w-fit">
                              <Utensils className="h-3 w-3" /> Seated
                            </Badge>
                          );
                        }
                        if (effStatus === "completed") {
                          return (
                            <Badge variant="outline" className="capitalize border text-xs font-semibold bg-muted text-muted-foreground border-border flex items-center gap-1 w-fit">
                              <Check className="h-3 w-3" /> Completed
                            </Badge>
                          );
                        }
                        if (effStatus === "cancelled") {
                          return (
                            <Badge variant="outline" className="capitalize border text-xs font-semibold bg-destructive/10 text-destructive border-destructive/20 flex items-center gap-1 w-fit">
                              <XCircle className="h-3 w-3" /> Cancelled
                            </Badge>
                          );
                        }
                        return (
                          <Badge variant="secondary" className={cn("capitalize border text-xs font-semibold flex items-center gap-1 w-fit", statusColors[r.status])}>
                            <Clock className="h-3 w-3" /> {r.status}
                          </Badge>
                        );
                      })()}
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex gap-1.5 justify-end flex-wrap items-center">
                        {r.status === "pending" && (
                          <>
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm px-2.5 rounded-lg"
                              onClick={() => changeStatus(r.id, "confirmed")}
                              disabled={updateMutation.isPending}
                            >
                              <Check className="h-3 w-3 mr-1" /> Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-destructive hover:bg-destructive/10 px-2.5 rounded-lg"
                              onClick={() => changeStatus(r.id, "cancelled")}
                              disabled={updateMutation.isPending}
                            >
                              <X className="h-3 w-3 mr-1" /> Decline
                            </Button>
                          </>
                        )}
                        {(effStatus === "not_arrived" || r.status === "confirmed") && r.status !== "seated" && r.status !== "completed" && r.status !== "cancelled" && (
                          <>
                            {(r.orderType === "Dine In" || !r.orderType) && (
                              <Button
                                size="sm"
                                className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm px-2.5 rounded-lg gap-1"
                                onClick={() => changeStatus(r.id, "seated")}
                                disabled={updateMutation.isPending}
                              >
                                <Utensils className="h-3 w-3" /> Seat
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-7 text-xs font-semibold shadow-sm px-2.5 rounded-lg gap-1"
                              onClick={() => changeStatus(r.id, "cancelled")}
                              disabled={updateMutation.isPending}
                            >
                              <XCircle className="h-3 w-3" /> Cancel
                            </Button>
                          </>
                        )}
                        {r.orderId && (
                          <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px]">
                            Order Created
                          </Badge>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive rounded-lg" onClick={() => setDeleteId(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      <CalendarCheck className="h-8 w-8 mx-auto mb-2 opacity-40 text-primary" />
                      <p className="font-semibold text-base">No reservations or pre-orders found</p>
                      <p className="text-xs">Click "New Table Reservation" or "New Pre-Order" above to create one.</p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Reservation & Pre-Order Form Card */}
      {showForm && (!isSuperAdmin || editId) && (
        <Card className="shadow-lg border-primary/40 relative">
          <CardHeader className="pb-3 border-b bg-muted/20">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              {editId ? "Edit" : "New"} {form.bookingType === "future_order" ? "Future Sale / Pre-Order" : "Table Reservation"}
            </CardTitle>
            <CardDescription className="text-xs">
              Fill in customer details, schedule date/time, select pre-order food items, and collect advance deposits.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">

            {/* Booking / Fulfillment Type Switcher (3 Parts: Dine In, Take Away, Delivery) */}
            <div className="grid grid-cols-3 gap-2 p-1 bg-muted/60 rounded-xl">
              <Button
                type="button"
                variant={form.orderType === "Dine In" ? "default" : "ghost"}
                className={cn("w-full text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5", form.orderType === "Dine In" && "gradient-primary text-primary-foreground shadow")}
                onClick={() => setForm(p => ({ ...p, bookingType: "table_reservation", orderType: "Dine In" }))}
              >
                <Utensils className="h-3.5 w-3.5" /> Dine In
              </Button>
              <Button
                type="button"
                variant={form.orderType === "Take Away" ? "default" : "ghost"}
                className={cn("w-full text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5", form.orderType === "Take Away" && "gradient-primary text-primary-foreground shadow")}
                onClick={() => setForm(p => ({ ...p, bookingType: "future_order", orderType: "Take Away", tableId: undefined, tableNumber: undefined }))}
              >
                <ShoppingBag className="h-3.5 w-3.5" /> Take Away
              </Button>
              <Button
                type="button"
                variant={form.orderType === "Delivery" ? "default" : "ghost"}
                className={cn("w-full text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5", form.orderType === "Delivery" && "gradient-primary text-primary-foreground shadow")}
                onClick={() => setForm(p => ({ ...p, bookingType: "future_order", orderType: "Delivery", tableId: undefined, tableNumber: undefined }))}
              >
                <Truck className="h-3.5 w-3.5" /> Delivery
              </Button>
            </div>

            {/* Customer Inputs with Suggestions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative" ref={dropdownRef}>
              <div className="relative">
                <Label className="text-xs font-semibold">Customer Name *</Label>
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
                <Label className="text-xs font-semibold">Phone (11 Digits)</Label>
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

            {/* Date, Time & Guests / Requirement info */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-semibold">Date *</Label>
                <Input
                  type="date"
                  min={today}
                  value={form.date || ""}
                  onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                  className="mt-1 [color-scheme:dark] bg-background border-border text-foreground font-semibold"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">Time *</Label>
                <Input
                  type="time"
                  value={form.time || ""}
                  onChange={e => setForm(p => ({ ...p, time: e.target.value }))}
                  className="mt-1 [color-scheme:dark] bg-background border-border text-foreground font-semibold"
                />
              </div>

              {form.orderType === "Dine In" ? (
                <div>
                  <Label className="text-xs font-semibold">Guests (Pax)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.guestCount || 1}
                    onChange={e => setForm(p => ({ ...p, guestCount: Number(e.target.value) }))}
                    className="mt-1"
                  />
                </div>
              ) : (
                <div>
                  <Label className="text-xs font-semibold">Pre-Order Requirement</Label>
                  <div className="mt-1 h-9 flex items-center px-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 font-bold text-xs">
                    Food Menu Mandatory
                  </div>
                </div>
              )}
            </div>

            {/* Delivery Address if Delivery pre-order */}
            {form.bookingType === "future_order" && form.orderType === "Delivery" && (
              <div>
                <Label className="text-xs font-semibold">Delivery Address *</Label>
                <Input
                  value={form.deliveryAddress || ""}
                  onChange={e => setForm(p => ({ ...p, deliveryAddress: e.target.value }))}
                  placeholder="Complete delivery location / street address..."
                  className="mt-1"
                />
              </div>
            )}

            {/* Table Selection for Dine-In */}
            {(form.bookingType === "table_reservation" || form.orderType === "Dine In") && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold">Table</Label>
                  <Select value={form.tableId || "none"} onValueChange={v => {
                    const t = tables.find(t => t.id === v);
                    setForm(p => ({ ...p, tableId: v === "none" ? undefined : v, tableNumber: t?.number ? String(t.number) : "" }));
                  }}>
                    <SelectTrigger className="mt-1 bg-background border-border text-foreground font-medium"><SelectValue placeholder="Select table" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No table assigned</SelectItem>
                      {tables.map(t => {
                        const resInfo = getTableReservationStatus(t);
                        return (
                          <SelectItem key={t.id} value={t.id} disabled={resInfo.isReserved}>
                            {resInfo.isReserved ? "🟡 " : "🟢 "}
                            Table {t.number} ({t.floor || "Main Hall"}) · {t.capacity} seats · {resInfo.label}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-semibold">Booking Source</Label>
                  <Select value={form.source || "phone"} onValueChange={v => setForm(p => ({ ...p, source: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="phone">Phone</SelectItem>
                      <SelectItem value="walkin">Walk-in</SelectItem>
                      <SelectItem value="online">Online / WhatsApp</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Pre-Order Food Items Selection Section */}
            <div className="border border-border/80 rounded-xl p-3 bg-muted/20 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold flex items-center gap-1.5 text-foreground">
                    <Utensils className="h-4 w-4 text-primary" /> Pre-Order Food Items ({form.preOrderItems?.length || 0})
                  </p>
                  <p className="text-[11px] text-muted-foreground">Select food items customer wants to pre-order in advance.</p>
                </div>
                <Button type="button" variant="outline" size="sm" className="h-8 border-primary/40 hover:bg-primary/10 text-xs font-semibold" onClick={() => setShowMenuPicker(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1 text-primary" /> Add Food Items
                </Button>
              </div>

              {form.preOrderItems && form.preOrderItems.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {form.preOrderItems.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-card border border-border text-xs">
                      <div>
                        <p className="font-semibold text-foreground">{item.name}</p>
                        <p className="text-[10px] text-muted-foreground">PKR {item.price.toLocaleString()} each</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 bg-muted rounded-md px-1.5 py-0.5">
                          <button type="button" onClick={() => handleUpdateItemQty(idx, -1)} className="hover:text-primary font-bold px-1">-</button>
                          <span className="font-bold text-foreground">{item.qty}</span>
                          <button type="button" onClick={() => handleUpdateItemQty(idx, 1)} className="hover:text-primary font-bold px-1">+</button>
                        </div>
                        <span className="font-mono font-bold text-foreground w-16 text-right">PKR {(item.price * item.qty).toLocaleString()}</span>
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleUpdateItemQty(idx, -item.qty)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  <div className="flex justify-between items-center pt-2 border-t text-xs font-bold">
                    <span>Food Total Price:</span>
                    <span className="text-primary font-mono text-sm">PKR {(form.subtotal || 0).toLocaleString()}</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-center py-4 text-muted-foreground border border-dashed rounded-lg">
                  No pre-order food items added yet. Click "Add Food Items" above.
                </p>
              )}
            </div>

            {/* Advance Payment & Deposit Collection Section */}
            <div className="border border-emerald-500/30 rounded-xl p-3 bg-emerald-500/5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold flex items-center gap-1.5 text-emerald-400">
                  <CreditCard className="h-4 w-4" /> Advance Deposit & Payment
                </p>
                <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">
                  Auto-Deducted in POS Bill
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs font-semibold">Advance Paid (PKR)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.advancePaid || ""}
                    onChange={e => setForm(p => ({ ...p, advancePaid: e.target.value === "" ? 0 : Number(e.target.value) }))}
                    className="mt-1 font-bold text-emerald-400"
                    placeholder="0"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold">Payment Method</Label>
                  <Select value={form.paymentMethod || registeredPaymentMethods[0] || "Cash"} onValueChange={v => setForm(p => ({ ...p, paymentMethod: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {registeredPaymentMethods.map((pm: string) => (
                        <SelectItem key={pm} value={pm}>{pm}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-semibold">Receipt / Ref # (Optional)</Label>
                  <Input
                    value={form.depositRef || ""}
                    onChange={e => setForm(p => ({ ...p, depositRef: e.target.value }))}
                    placeholder="Tx Ref #..."
                    className="mt-1"
                  />
                </div>
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold">Special Requests / Event Notes</Label>
              <Textarea value={form.specialRequests || ""} onChange={e => setForm(p => ({ ...p, specialRequests: e.target.value }))} className="mt-1" placeholder="e.g. Birthday setup, high chair required, spicy food..." />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button className="gradient-primary text-primary-foreground font-semibold shadow" onClick={handleSave}
                disabled={createMutation.isPending || updateMutation.isPending}>
                Save {form.bookingType === "future_order" ? "Pre-Order" : "Reservation"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Menu Item Picker Modal for Pre-Orders */}
      <Dialog open={showMenuPicker} onOpenChange={setShowMenuPicker}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Utensils className="h-4 w-4 text-primary" /> Select Food Menu Items for Pre-Order
            </DialogTitle>
            <DialogDescription className="text-xs">
              Browse categories or search food items to add them to this advance pre-order.
            </DialogDescription>
          </DialogHeader>

          {/* Search & Category Pills */}
          <div className="space-y-2 py-2">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Search menu items..."
                value={menuSearch}
                onChange={e => setMenuSearch(e.target.value)}
                className="pl-9 text-xs"
              />
            </div>

            <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar">
              <Button
                size="sm"
                variant={selectedCatId === "all" ? "default" : "outline"}
                className={cn("text-xs h-7 rounded-full", selectedCatId === "all" && "gradient-primary")}
                onClick={() => setSelectedCatId("all")}
              >
                All Items
              </Button>
              {categories.map(cat => (
                <Button
                  key={cat.id}
                  size="sm"
                  variant={selectedCatId === cat.id ? "default" : "outline"}
                  className={cn("text-xs h-7 rounded-full whitespace-nowrap", selectedCatId === cat.id && "gradient-primary")}
                  onClick={() => setSelectedCatId(cat.id)}
                >
                  {cat.name}
                </Button>
              ))}
            </div>
          </div>

          {/* Menu Items Grid */}
          <div className="flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 pr-1 min-h-[300px]">
            {filteredMenuItems.map(item => (
              <div key={item.id} className="p-3 border border-border/80 rounded-xl bg-card hover:border-primary/50 transition-colors flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start">
                    <p className="font-semibold text-xs text-foreground">{item.name}</p>
                    <span className="font-mono text-xs font-bold text-primary">PKR {Number(item.price).toLocaleString()}</span>
                  </div>
                  {item.category && <p className="text-[10px] text-muted-foreground">{item.category.name}</p>}
                </div>

                <div className="pt-2 flex justify-end gap-1 flex-wrap">
                  {item.variants && item.variants.length > 0 ? (
                    item.variants.map(v => (
                      <Button key={v.id} size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => handleAddPreOrderItem(item, v.id)}>
                        + {v.name} (PKR {Number(v.price).toLocaleString()})
                      </Button>
                    ))
                  ) : (
                    <Button size="sm" className="h-6 text-[10px] gradient-primary text-primary-foreground px-2" onClick={() => handleAddPreOrderItem(item)}>
                      + Add Item
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <DialogFooter className="pt-2 border-t">
            <Button className="gradient-primary text-primary-foreground font-semibold" onClick={() => setShowMenuPicker(false)}>
              Done Selecting ({form.preOrderItems?.length || 0} items)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Record?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
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

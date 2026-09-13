import { useState, useMemo, useRef, useEffect } from "react";
import {
  CalendarCheck, Plus, Pencil, Trash2, User, Phone, Users, CheckCircle2,
  Utensils, CreditCard, Banknote, Smartphone, ShoppingBag, ArrowRight, Truck, XCircle,
  Search, AlertCircle, Clock, MapPin, Check, DollarSign, ListFilter, Sparkles, ChevronRight, X, Zap, Minus, ChefHat, UserX,
  Gift, Package, Layers, Percent
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page-header";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { reservationService, type Reservation, type CreateReservationInput, type PreOrderItem } from "@/services/reservation.service";
import { tableService } from "@/services/table.service";
import { customerService, type CustomerRecord } from "@/services/customer.service";
import { menuService, type MenuItemRecord, type MenuItemVariant, type CategoryRecord } from "@/services/menu.service";
import { orderService } from "@/services/order.service";
import { reportService } from "@/services/report.service";
import { dealService, type DealRecord } from "@/services/deal.service";
import {
  isDealLive, isDealAvailableForChannel, dealChannelPrice, dealChannelPercent, allocateDealDiscount,
  dealBogoSides, dealBogoSideMode, dealBogoOptionGroups, capFreeUnitPrice, type DealOptionItemForBogo,
} from "@/lib/deals";
import { toast } from "sonner";
import { useOutletFilter } from "@/hooks/useOutletFilter";
import { OutletFilterSelect } from "@/components/OutletFilterSelect";
import { useAuth } from "@/contexts/AuthContext";
import { useReservationEvents } from "@/hooks/use-reservation-events";
import { useOrderEvents } from "@/hooks/use-order-events";
import { useVisiblePolling } from "@/hooks/use-visible-polling";
import { useSelfMutationGuard } from "@/hooks/use-self-mutation-guard";
import { getSocket } from "@/lib/socket";
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

// Same lookup WaiterPanel.tsx/POS.tsx use for their deal-card grid.
const dealFormatBadge: Record<Exclude<DealRecord["type"], "promo_code" | "min_spend">, { icon: typeof Package; label: string }> = {
  combo: { icon: Package, label: "Fixed Bundle" },
  option_combo: { icon: Layers, label: "Customizable" },
  percentage: { icon: Percent, label: "% Discount" },
  buy_x_get_y: { icon: Gift, label: "Buy X Get Y" },
};

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

  const [activeTab, setActiveTab] = useState<"all" | "Dine In" | "Take Away" | "Delivery">("all");
  const [dateFilter, setDateFilter] = useState<"Today" | "Tomorrow" | "This Week" | "All" | "Custom">("Today");
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Arriving from the Dashboard's "Reservations Analytics" section pre-fills the date range
  // (+ status for a specific status row/bar drill-down) via ?from=&to=&status=. Re-seeds on
  // every genuinely new navigation, not just first mount — same useEffect-keyed-on-searchParams
  // pattern used by Sales.tsx/CancellationRequests.tsx/Purchases.tsx/Attendance.tsx.
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (from || to) {
      setDateFilter("Custom");
      if (from) setStartDate(from);
      if (to) setEndDate(to);
    }
    setStatusFilter(searchParams.get("status") || "all");
  }, [searchParams]);
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
  // Refresh on real-time push (instant), plus a 60s visibility-gated safety poll so a
  // dropped/never-connected socket doesn't leave this page stale (matches POS/WaiterPanel/KitchenPanel).
  useReservationEvents(() => {
    qc.invalidateQueries({ queryKey: ["reservations"] });
  });
  useVisiblePolling(() => qc.invalidateQueries({ queryKey: ["reservations"] }), 60000);

  // The orders list below gets the same treatment: push first, slow poll as the
  // safety net. It used to sit on a bare 10s refetchInterval with no socket at
  // all — 360 requests an hour, each one pulling 300 orders WITH their items,
  // categories, cancellation requests and kitchen progress, all day long on a
  // page a Floor Manager leaves open. Easily the heaviest recurring query in
  // the app, for data that changes a few times an hour.
  useOrderEvents(() => {
    qc.invalidateQueries({ queryKey: ["orders-list-for-reservations"] });
  });

  const { data: reservations = [], isLoading } = useQuery({
    queryKey: ["reservations", selectedOutletId],
    queryFn: () => reservationService.getAll({ outletId: selectedOutletId !== "all" ? selectedOutletId : undefined }),
  });

  // Friendly toast when a reservation changes from elsewhere (another device/session/staff
  // member) — suppressed for a few seconds after THIS client's own writes so it doesn't
  // double up with the specific success toast that mutation already shows.
  const { markMine, isLikelyOwnEcho } = useSelfMutationGuard();
  const reservationsRef = useRef(reservations);
  useEffect(() => { reservationsRef.current = reservations; }, [reservations]);

  useEffect(() => {
    const socket = getSocket();
    const onCreated = (payload: Reservation) => {
      if (isLikelyOwnEcho()) return;
      toast.info(`New reservation: ${payload.customerName} — ${payload.date} at ${payload.time}`);
    };
    const onUpdated = (payload: Reservation) => {
      if (isLikelyOwnEcho()) return;
      toast.info(`Reservation for ${payload.customerName} updated — now ${payload.status}`);
    };
    const onDeleted = (payload: { id: string }) => {
      if (isLikelyOwnEcho()) return;
      const found = reservationsRef.current.find(r => r.id === payload.id);
      toast.info(`Reservation for ${found?.customerName ?? "a customer"} was deleted`);
    };
    socket.on("reservation:created", onCreated);
    socket.on("reservation:updated", onUpdated);
    socket.on("reservation:deleted", onDeleted);
    return () => {
      socket.off("reservation:created", onCreated);
      socket.off("reservation:updated", onUpdated);
      socket.off("reservation:deleted", onDeleted);
    };
  }, [isLikelyOwnEcho]);

  const { data: tables = [] } = useQuery({
    queryKey: ["tables", selectedOutletId],
    queryFn: () => tableService.getTables(),
  });

  const { data: ordersRes } = useQuery({
    queryKey: ["orders-list-for-reservations", selectedOutletId],
    queryFn: () => orderService.getOrders({ limit: 300 }),
    // Safety net only — useOrderEvents above is what keeps this fresh.
    refetchInterval: 120_000,
  });
  const orders = useMemo(() => ordersRes?.data ?? [], [ordersRes]);

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

  // ── Deals — same real backend deals POS.tsx/WaiterPanel.tsx sell, priced at whichever
  // channel this booking's own Order Type is (unlike WaiterPanel, which hardcodes Dine In,
  // a pre-order can be Dine In/Take Away/Delivery). Order Discount (Promo Code/Min Spend)
  // is excluded — not something picked from a menu grid. No stock-checking: a pre-order is
  // fulfilled on a future date, so today's stock levels aren't meaningful here (matches this
  // page's existing plain-item picker, which also doesn't stock-gate). ──
  const { data: liveDeals = [] } = useQuery({
    queryKey: ["deals", "reservations"],
    queryFn: () => dealService.getDeals(),
    staleTime: 60_000,
    enabled: showForm,
  });
  const orderTypeForDeals = form.orderType || "Dine In";
  const sellableDeals = useMemo(
    () => liveDeals.filter(
      (d) => d.type !== "promo_code" && d.type !== "min_spend" && isDealLive(d).valid && isDealAvailableForChannel(d, orderTypeForDeals)
    ),
    [liveDeals, orderTypeForDeals]
  );
  const isDealChannelBlocked = (deal: DealRecord): boolean => !isDealAvailableForChannel(deal, orderTypeForDeals);

  const [showDealCustomize, setShowDealCustomize] = useState(false);
  const [customizingDeal, setCustomizingDeal] = useState<DealRecord | null>(null);
  const [customizingDealLineId, setCustomizingDealLineId] = useState<string | null>(null);
  const [dealGroupSelections, setDealGroupSelections] = useState<Record<string, string[]>>({});
  const customizeGroups = useMemo(() => {
    if (!customizingDeal) return [];
    if (customizingDeal.type === "option_combo") return customizingDeal.optionGroups;
    return [
      ...(dealBogoSideMode(customizingDeal, "BUY") === "customizable" ? dealBogoOptionGroups(customizingDeal, "BUY") : []),
      ...(dealBogoSideMode(customizingDeal, "GET") === "customizable" ? dealBogoOptionGroups(customizingDeal, "GET") : []),
    ];
  }, [customizingDeal]);

  const [showDealItemPicker, setShowDealItemPicker] = useState(false);
  const [pickingDeal, setPickingDeal] = useState<DealRecord | null>(null);
  const [pickedDealItemId, setPickedDealItemId] = useState("");
  const [pickedDealVariantId, setPickedDealVariantId] = useState<string | null>(null);
  const [pickedDealQty, setPickedDealQty] = useState(1);

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
      markMine();
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
      markMine();
      qc.invalidateQueries({ queryKey: ["reservations"] });
      toast.success("Updated successfully");
      setShowForm(false);
    },
    onError: () => toast.error("Failed to update"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => reservationService.delete(id),
    onSuccess: () => {
      markMine();
      qc.invalidateQueries({ queryKey: ["reservations"] });
      toast.success("Deleted successfully");
      setDeleteId(null);
    },
    onError: () => toast.error("Failed to delete"),
  });

  const convertMutation = useMutation({
    mutationFn: (id: string) => reservationService.convertToOrder(id),
    onSuccess: (order) => {
      markMine();
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
          } else if (status === "noShow") {
            toast.success("Reservation marked as No-Show.");
          }
        },
      }
    );
  };

  // Resolved from/to for the analytics tiles below -- mirrors dateFilteredReservations'
  // own preset-to-range logic (this week's Monday-Sunday, etc.) so both stay in sync. "All"
  // has no natural bound -- both left undefined, matching getReservationAnalytics' own
  // "no from/to -> no date filter" convention.
  const analyticsRange = useMemo((): { from?: string; to?: string } => {
    if (dateFilter === "Today") return { from: today, to: today };
    if (dateFilter === "Tomorrow") return { from: tomorrow, to: tomorrow };
    if (dateFilter === "This Week") {
      const now = new Date();
      const currentDay = now.getDay();
      const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
      const monday = new Date(now);
      monday.setDate(now.getDate() + distanceToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { from: monday.toISOString().split("T")[0], to: sunday.toISOString().split("T")[0] };
    }
    if (dateFilter === "Custom") return { from: startDate || undefined, to: endDate || undefined };
    return {}; // "All"
  }, [dateFilter, today, tomorrow, startDate, endDate]);

  const { data: resAnalytics, isLoading: resAnalyticsLoading } = useQuery({
    queryKey: ["reservation-analytics-page", selectedOutletId, analyticsRange.from, analyticsRange.to, statusFilter],
    queryFn: () => reportService.getReservationAnalytics({
      outletId: selectedOutletId !== "all" ? selectedOutletId : undefined,
      from: analyticsRange.from ?? "",
      to: analyticsRange.to ?? "",
      status: statusFilter !== "all" ? statusFilter : undefined,
    }),
  });

  // Filters & Calculations
  const dateFilteredReservations = useMemo(() => {
    const now = new Date();
    const currentDay = now.getDay();
    const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    const monday = new Date(now);
    monday.setDate(now.getDate() + distanceToMonday);
    const weekStartStr = monday.toISOString().split("T")[0];

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const weekEndStr = sunday.toISOString().split("T")[0];

    return reservations.filter(r => {
      if (dateFilter === "Today") return r.date === today;
      if (dateFilter === "Tomorrow") return r.date === tomorrow;
      if (dateFilter === "This Week") return r.date >= weekStartStr && r.date <= weekEndStr;
      if (dateFilter === "Custom") {
        if (startDate && r.date < startDate) return false;
        if (endDate && r.date > endDate) return false;
        return true;
      }
      return true; // "All"
    });
  }, [reservations, dateFilter, today, tomorrow, startDate, endDate]);

  const filtered = useMemo(() => {
    return dateFilteredReservations.filter(r => {
      const orderType = r.orderType || (r.bookingType === "future_order" ? "Take Away" : "Dine In");
      if (activeTab !== "all" && orderType !== activeTab) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      return true;
    }).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  }, [dateFilteredReservations, activeTab, statusFilter]);

  const stats = useMemo(() => {
    const activeSet = dateFilteredReservations.filter(r => r.status !== "cancelled" && r.status !== "noShow");

    let dineInCount = 0;
    let dineInGuests = 0;
    let takeAwayCount = 0;
    let deliveryCount = 0;
    let totalAdvanceCollected = 0;

    for (const r of activeSet) {
      const orderType = r.orderType || (r.bookingType === "future_order" ? "Take Away" : "Dine In");
      if (orderType === "Dine In") {
        dineInCount++;
        dineInGuests += (r.guestCount || 0);
      } else if (orderType === "Take Away") {
        takeAwayCount++;
      } else if (orderType === "Delivery") {
        deliveryCount++;
      }
      totalAdvanceCollected += Number(r.advancePaid || 0);
    }

    return {
      dineInCount,
      dineInGuests,
      takeAwayCount,
      deliveryCount,
      totalAdvanceCollected,
    };
  }, [dateFilteredReservations]);

  // Form Handlers
  const toggleForm = () => {
    if (showForm) {
      setShowForm(false);
      setEditId(null);
    } else {
      openAdd("table_reservation");
    }
  };

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

  const handleDecreasePreOrderItem = (menuItemId: string, variantId?: string) => {
    setForm(prev => {
      const currentItems = prev.preOrderItems || [];
      const existingIdx = currentItems.findIndex(i => i.menuItemId === menuItemId && i.variantId === (variantId || undefined));
      if (existingIdx === -1) return prev;

      const updated = currentItems.map((ci, idx) => {
        if (idx === existingIdx) {
          const newQty = ci.qty - 1;
          return newQty > 0 ? { ...ci, qty: newQty } : null;
        }
        return ci;
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

  // Channel price for this booking's Order Type — mirrors WaiterPanel.tsx's variantDineInPrice/
  // menuItemPrice, generalized from a hardcoded "Dine In" to whichever channel this pre-order
  // actually is (a reservation can be Dine In/Take Away/Delivery, unlike a WaiterPanel order
  // which is always Dine In).
  const variantChannelPrice = (v: MenuItemVariant): number => {
    if (orderTypeForDeals === "Take Away") return v.takeAwayPrice ?? v.price;
    if (orderTypeForDeals === "Delivery") return v.deliveryPrice ?? v.price;
    return v.dineInPrice ?? v.price;
  };
  const menuItemChannelPrice = (item: MenuItemRecord, variant?: MenuItemVariant | null): number => {
    if (variant) return variantChannelPrice(variant);
    if (orderTypeForDeals === "Take Away") return item.takeAwayPrice ?? item.price;
    if (orderTypeForDeals === "Delivery") return item.deliveryPrice ?? item.price;
    return item.dineInPrice ?? item.price;
  };

  /** Appends one or more lines (deal or plain) and recomputes subtotal/tax/total — the same
   *  recompute handleAddPreOrderItem/handleUpdateItemQty above do, factored out since every
   *  deal-add path below needs to append several lines at once. */
  const appendPreOrderItems = (newItems: PreOrderItem[]) => {
    setForm(prev => {
      const updated = [...(prev.preOrderItems || []), ...newItems];
      const subtotal = updated.reduce((sum, i) => sum + (i.price * i.qty), 0);
      const tax = Math.round(subtotal * 0.16);
      const totalAmount = subtotal + tax;
      return { ...prev, preOrderItems: updated, subtotal, tax, totalAmount };
    });
  };

  // ── Deals: add-to-cart — mirrors WaiterPanel.tsx's addDealToCart family, priced at this
  // booking's Order Type throughout. Fixed Bundle and Buy X Get Y (fully Fixed) add their
  // whole redemption in one click; Customizable opens a choice dialog; % Discount opens an
  // eligible-item picker. ──
  const addDealToCart = (deal: DealRecord) => {
    if (isDealChannelBlocked(deal)) { toast.error(`"${deal.name}" is not available for ${orderTypeForDeals} orders`); return; }
    if (deal.type === "combo") { addComboDealToCart(deal); return; }
    if (deal.type === "buy_x_get_y") { addBogoDealToCart(deal); return; }
    if (deal.type === "option_combo") { openDealCustomize(deal); return; }
    if (deal.type === "percentage") { openDealItemPicker(deal); return; }
  };

  const addComboDealToCart = (deal: DealRecord) => {
    if (deal.components.length === 0) { toast.error(`"${deal.name}" has no items configured`); return; }
    const rows = deal.components.map((c) => {
      const menuItem = menuItems.find((m) => m.id === c.menuItemId);
      const variant = c.variantId ? menuItem?.variants?.find((v) => v.id === c.variantId) : undefined;
      return { component: c, menuItem, variant, unitPrice: menuItem ? menuItemChannelPrice(menuItem, variant) : 0 };
    });
    if (rows.some((r) => !r.menuItem)) { toast.error(`A menu item in "${deal.name}" is no longer available`); return; }

    const grossAmounts = rows.map((r) => r.unitPrice * r.component.qty);
    const savings = Math.max(0, grossAmounts.reduce((s, v) => s + v, 0) - dealChannelPrice(deal, orderTypeForDeals));
    const discounts = allocateDealDiscount(savings, grossAmounts);

    const lineId = `deal-${deal.id}-${Date.now()}`;
    const newItems: PreOrderItem[] = rows.map((r, idx) => ({
      name: `${r.menuItem!.name}${r.variant ? ` (${r.variant.name})` : ""}`,
      price: r.unitPrice, qty: r.component.qty, discount: discounts[idx], modifiers: [],
      menuItemId: r.component.menuItemId, variantId: r.component.variantId ?? undefined,
      dealId: deal.id, dealName: deal.name, dealLineId: lineId,
    }));
    appendPreOrderItems(newItems);
    toast.success(`${deal.name} added to pre-order`);
  };

  /** Each side is independently "Fixed" or "Customizable" — mirrors WaiterPanel.tsx's
   *  addBogoDealToCart exactly. */
  const addBogoDealToCart = (deal: DealRecord) => {
    const buyMode = dealBogoSideMode(deal, "BUY");
    const getMode = dealBogoSideMode(deal, "GET");
    const lineId = `deal-${deal.id}-${Date.now()}`;
    const newItems: PreOrderItem[] = [];

    if (buyMode === "fixed") {
      const { buy } = dealBogoSides(deal);
      if (buy.length === 0) { toast.error(`"${deal.name}" is not configured correctly`); return; }
      for (const row of buy) {
        const menuItem = menuItems.find((m) => m.id === row.menuItemId);
        if (!menuItem) { toast.error(`A menu item in "${deal.name}" is no longer available`); return; }
        const variant = row.variantId ? menuItem.variants?.find((v) => v.id === row.variantId) : undefined;
        newItems.push({
          name: `${menuItem.name}${variant ? ` (${variant.name})` : ""}`,
          price: menuItemChannelPrice(menuItem, variant), qty: row.qty, discount: 0, modifiers: [],
          menuItemId: row.menuItemId, variantId: row.variantId ?? undefined,
          dealId: deal.id, dealName: deal.name, dealLineId: lineId, dealRole: "buy",
        });
      }
    }
    if (getMode === "fixed") {
      const { get } = dealBogoSides(deal);
      if (get.length === 0) { toast.error(`"${deal.name}" is not configured correctly`); return; }
      for (const row of get) {
        const menuItem = menuItems.find((m) => m.id === row.menuItemId);
        if (!menuItem) { toast.error(`A menu item in "${deal.name}" is no longer available`); return; }
        const variant = row.variantId ? menuItem.variants?.find((v) => v.id === row.variantId) : undefined;
        const unitPrice = menuItemChannelPrice(menuItem, variant);
        const variants = menuItem.variants ?? [];
        const cheapest = variants.length === 0 ? unitPrice : Math.min(...variants.map((v) => variantChannelPrice(v)));
        const cappedUnitPrice = capFreeUnitPrice(row.variantId, unitPrice, cheapest);
        const coveragePercent = dealChannelPercent(deal, orderTypeForDeals, 100);
        const freeUnitPrice = Math.round(cappedUnitPrice * (coveragePercent / 100) * 100) / 100;
        newItems.push({
          name: `${menuItem.name}${variant ? ` (${variant.name})` : ""}${freeUnitPrice <= 0 ? "" : freeUnitPrice >= unitPrice ? " (Free)" : " (Discounted)"}`,
          price: unitPrice, qty: row.qty, discount: freeUnitPrice * row.qty, modifiers: [],
          menuItemId: row.menuItemId, variantId: row.variantId ?? undefined,
          dealId: deal.id, dealName: deal.name, dealLineId: lineId, dealRole: "get",
        });
      }
    }

    if (buyMode === "customizable" || getMode === "customizable") {
      if (newItems.length > 0) appendPreOrderItems(newItems);
      setCustomizingDeal(deal);
      setCustomizingDealLineId(lineId);
      const initial: Record<string, string[]> = {};
      [
        ...(buyMode === "customizable" ? dealBogoOptionGroups(deal, "BUY") : []),
        ...(getMode === "customizable" ? dealBogoOptionGroups(deal, "GET") : []),
      ].forEach((g) => { initial[g.id] = []; });
      setDealGroupSelections(initial);
      setShowDealCustomize(true);
      return;
    }

    if (newItems.length === 0) { toast.error(`"${deal.name}" is not configured correctly`); return; }
    appendPreOrderItems(newItems);
    toast.success(`${deal.name} added to pre-order`);
  };

  const dealOptionKey = (menuItemId: string, variantId: string | null) => `${menuItemId}:${variantId ?? ""}`;

  const openDealCustomize = (deal: DealRecord) => {
    setCustomizingDeal(deal);
    setCustomizingDealLineId(null);
    const initial: Record<string, string[]> = {};
    deal.optionGroups.forEach((g) => { initial[g.id] = []; });
    setDealGroupSelections(initial);
    setShowDealCustomize(true);
  };

  const toggleDealOption = (groupId: string, key: string, maxSelections: number) => {
    setDealGroupSelections((prev) => {
      const current = prev[groupId] || [];
      if (current.includes(key)) return { ...prev, [groupId]: current.filter((k) => k !== key) };
      if (current.length >= maxSelections) {
        if (maxSelections === 1) return { ...prev, [groupId]: [key] };
        toast.error(`Max ${maxSelections} selection(s) for this step`);
        return prev;
      }
      return { ...prev, [groupId]: [...current, key] };
    });
  };

  const confirmDealCustomize = () => {
    if (!customizingDeal) return;
    const deal = customizingDeal;
    const groups = customizeGroups;
    const incomplete = groups.find((g) => (dealGroupSelections[g.id]?.length || 0) < g.minSelections);
    if (incomplete) { toast.error(`Select at least ${incomplete.minSelections} item(s) for "${incomplete.label}"`); return; }

    const picks: { groupId: string; bogoSide: "BUY" | "GET" | null; option: DealOptionItemForBogo }[] = [];
    for (const g of groups) {
      for (const key of dealGroupSelections[g.id] || []) {
        const option = g.options.find((o) => dealOptionKey(o.menuItemId, o.variantId) === key);
        if (option) picks.push({ groupId: g.id, bogoSide: g.bogoSide ?? null, option });
      }
    }
    if (picks.length === 0) { toast.error("Nothing selected"); return; }

    if (deal.type === "buy_x_get_y") {
      const lineId = customizingDealLineId ?? `deal-${deal.id}-${Date.now()}`;
      const newItems: PreOrderItem[] = [];
      for (const { groupId, bogoSide, option } of picks) {
        const menuItem = menuItems.find((m) => m.id === option.menuItemId);
        if (!menuItem) { toast.error(`A menu item in "${deal.name}" is no longer available`); return; }
        const variant = option.variantId ? menuItem.variants?.find((v) => v.id === option.variantId) : undefined;
        const unitPrice = menuItemChannelPrice(menuItem, variant) + (option.extraPrice || 0);
        if (bogoSide === "GET") {
          const coveragePercent = dealChannelPercent(deal, orderTypeForDeals, 100);
          const freeUnitPrice = Math.round(unitPrice * (coveragePercent / 100) * 100) / 100;
          newItems.push({
            name: `${menuItem.name}${variant ? ` (${variant.name})` : ""}${freeUnitPrice <= 0 ? "" : freeUnitPrice >= unitPrice ? " (Free)" : " (Discounted)"}`,
            price: unitPrice, qty: 1, discount: freeUnitPrice, modifiers: [],
            menuItemId: option.menuItemId, variantId: option.variantId ?? undefined,
            dealId: deal.id, dealName: deal.name, dealLineId: lineId, dealGroupId: groupId, dealRole: "get",
          });
        } else {
          newItems.push({
            name: `${menuItem.name}${variant ? ` (${variant.name})` : ""}`,
            price: unitPrice, qty: 1, discount: 0, modifiers: [],
            menuItemId: option.menuItemId, variantId: option.variantId ?? undefined,
            dealId: deal.id, dealName: deal.name, dealLineId: lineId, dealGroupId: groupId, dealRole: "buy",
          });
        }
      }
      appendPreOrderItems(newItems);
      setShowDealCustomize(false);
      setCustomizingDeal(null);
      setCustomizingDealLineId(null);
      toast.success(`${deal.name} added to pre-order`);
      return;
    }

    const rows = picks.map(({ groupId, option }) => {
      const menuItem = menuItems.find((m) => m.id === option.menuItemId);
      const variant = option.variantId ? menuItem?.variants?.find((v) => v.id === option.variantId) : undefined;
      return { groupId, option, menuItem, variant, unitPrice: (menuItem ? menuItemChannelPrice(menuItem, variant) : 0) + (option.extraPrice || 0) };
    });
    if (rows.some((r) => !r.menuItem)) { toast.error(`A menu item in "${deal.name}" is no longer available`); return; }

    const grossAmounts = rows.map((r) => r.unitPrice);
    const savings = Math.max(0, grossAmounts.reduce((s, v) => s + v, 0) - dealChannelPrice(deal, orderTypeForDeals));
    const discounts = allocateDealDiscount(savings, grossAmounts);

    const lineId = `deal-${deal.id}-${Date.now()}`;
    const newItems: PreOrderItem[] = rows.map((r, idx) => ({
      name: `${r.menuItem!.name}${r.variant ? ` (${r.variant.name})` : ""}`,
      price: r.unitPrice, qty: 1, discount: discounts[idx], modifiers: [],
      menuItemId: r.option.menuItemId, variantId: r.option.variantId ?? undefined,
      dealId: deal.id, dealName: deal.name, dealLineId: lineId, dealGroupId: r.groupId,
    }));
    appendPreOrderItems(newItems);
    setShowDealCustomize(false);
    setCustomizingDeal(null);
    toast.success(`${deal.name} added to pre-order`);
  };

  const eligibleDealItems = useMemo(() => {
    if (!pickingDeal) return [];
    return menuItems.filter((m) =>
      pickingDeal.applicableItems.includes(m.id) ||
      (m.categoryId && pickingDeal.applicableCategories.includes(m.categoryId))
    );
  }, [pickingDeal, menuItems]);

  const openDealItemPicker = (deal: DealRecord) => {
    setPickingDeal(deal);
    setPickedDealItemId("");
    setPickedDealVariantId(null);
    setPickedDealQty(1);
    setShowDealItemPicker(true);
  };

  const confirmDealItemPick = () => {
    if (!pickingDeal || !pickedDealItemId) return;
    const deal = pickingDeal;
    const menuItem = menuItems.find((m) => m.id === pickedDealItemId);
    if (!menuItem) return;
    const variant = pickedDealVariantId ? menuItem.variants?.find((v) => v.id === pickedDealVariantId) : undefined;
    if ((menuItem.variants?.length ?? 0) > 0 && !variant) { toast.error("Pick a size"); return; }

    const unitPrice = menuItemChannelPrice(menuItem, variant);
    const percent = dealChannelPercent(deal, orderTypeForDeals, deal.discountPercent ?? 0);
    const qty = Math.max(1, pickedDealQty);
    const discount = Math.min(unitPrice * qty, unitPrice * qty * (percent / 100));

    const newItem: PreOrderItem = {
      name: `${menuItem.name}${variant ? ` (${variant.name})` : ""}`,
      price: unitPrice, qty, discount, modifiers: [],
      menuItemId: menuItem.id, variantId: variant?.id ?? undefined,
      dealId: deal.id, dealName: deal.name, dealLineId: `deal-${deal.id}-${Date.now()}`,
    };
    appendPreOrderItems([newItem]);
    setShowDealItemPicker(false);
    setPickingDeal(null);
    toast.success(`${deal.name} added to pre-order`);
  };

  const dealPriceLabel = (deal: DealRecord): string => {
    if (deal.type === "combo" || deal.type === "option_combo") {
      return `Rs. ${dealChannelPrice(deal, orderTypeForDeals).toLocaleString()}`;
    }
    if (deal.type === "percentage") {
      return `${dealChannelPercent(deal, orderTypeForDeals, deal.discountPercent ?? 0)}% OFF`;
    }
    const coverage = dealChannelPercent(deal, orderTypeForDeals, 100);
    return coverage >= 100 ? "Get item free" : `Get item ${coverage}% off`;
  };

  const getEffectiveStatus = (r: { date: string; time: string; status: string; orderType?: string; bookingType?: string; order?: any; orderId?: string | null }) => {
    if (r.status === "completed" || r.order?.status === "completed") {
      return "completed";
    }
    if (r.orderId && orders.some(o => o.id === r.orderId && o.status === "completed")) {
      return "completed";
    }
    if (r.status === "seated" || r.order?.status === "seated") {
      return "seated";
    }
    if (r.status === "cancelled" || r.status === "noShow") {
      return r.status;
    }
    if (r.orderId) {
      const linkedOrder = orders.find(o => o.id === r.orderId);
      if (linkedOrder) {
        if (linkedOrder.status === "completed") return "completed";
        return "seated";
      }
      if (r.status === "seated") return "seated";
    }
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const currentHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    const isTimePassed = r.date < todayStr || (r.date === todayStr && currentHHMM >= r.time);

    if (isTimePassed) {
      const orderType = r.orderType || (r.bookingType === "future_order" ? "Take Away" : "Dine In");
      if (orderType === "Delivery") {
        return r.status === "pending" ? "pending" : "dispatch_due";
      }
      if (orderType === "Take Away") {
        return r.status === "pending" ? "pending" : "pickup_due";
      }
      return "not_arrived";
    }
    return r.status;
  };

  const handleSave = async () => {
    if (!form.customerName?.trim()) { toast.error("Customer name required"); return; }
    if (!form.date) { toast.error("Date required"); return; }
    if (!form.time) { toast.error("Time required"); return; }
    if (!form.customerPhone?.trim()) { toast.error("Phone number is required"); return; }
    if (form.orderType === "Dine In" && !form.tableId) {
      toast.error("Please select a table for this Dine In reservation");
      return;
    }

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
          subtitle="Manage Dine In, Take Away, Delivery pre-orders and advance deposits"
          actions={!isSuperAdmin ? (
            <Button
              variant={showForm ? "outline" : "default"}
              className={cn(
                "font-bold transition-all shadow-md",
                showForm
                  ? "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20 hover:border-destructive/50"
                  : "gradient-primary text-primary-foreground"
              )}
              onClick={toggleForm}
            >
              {showForm ? (
                <>
                  <X className="h-4 w-4 mr-2" />Close Form
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />New Booking / Pre-Order
                </>
              )}
            </Button>
          ) : undefined}
        />
        <OutletFilterSelect outletId={selectedOutletId} setOutletId={setOutletId} outlets={outlets} isSuperAdmin={isSuperAdmin} />
      </div>

      {/* Reservation & Pre-Order Form Card */}
      {showForm && (!isSuperAdmin || editId) && (
        <Card className="shadow-lg border-primary/40 relative animate-in fade-in slide-in-from-top-2 duration-200">
          <CardHeader className="pb-3 border-b bg-muted/20 flex flex-row items-start justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                {editId ? "Edit" : "New"} {form.bookingType === "future_order" ? "Future Sale / Pre-Order" : "Table Reservation"}
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Fill in customer details, schedule date/time, select pre-order food items, and collect advance deposits.
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/80 shrink-0 -mr-1 -mt-1"
              onClick={() => { setShowForm(false); setEditId(null); }}
              title="Close form"
            >
              <X className="h-4 w-4" />
            </Button>
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
                <Label className="text-xs font-semibold">Phone (11 Digits) *</Label>
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
                <DatePicker
                  min={today}
                  value={form.date || ""}
                  onChange={v => setForm(p => ({ ...p, date: v }))}
                  className="mt-1 font-semibold"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">Time *</Label>
                <TimePicker
                  value={form.time || ""}
                  onChange={v => setForm(p => ({ ...p, time: v }))}
                  className="mt-1 font-semibold"
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
                  <Label className="text-xs font-semibold">Table *</Label>
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
                        <p className="font-semibold text-foreground flex items-center gap-1.5">
                          {item.name}
                          {item.dealId && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-primary/20 gap-0.5">
                              <Gift className="h-2.5 w-2.5" /> {item.dealName || "Deal"}
                            </Badge>
                          )}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          PKR {item.price.toLocaleString()} each
                          {!!item.discount && item.discount > 0 && ` · Rs. ${item.discount.toLocaleString()} off`}
                        </p>
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

      {/* Top Level Date Filter Bar — Dashboard section filter-bar style (pill presets +
          always-paired DatePicker range), same visual language as Dashboard.tsx's report
          sections, while keeping this page's own preset set (Tomorrow/All are unique here). */}
      <Card className="rounded-2xl border border-border/80 bg-card/40 backdrop-blur-md shadow-sm">
        <CardContent className="p-4 flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center p-0.5 rounded-lg bg-muted/60 border border-border/60 shadow-sm">
            {(["Today", "Tomorrow", "This Week", "All", "Custom"] as const).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setDateFilter(s)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                  dateFilter === s
                    ? "bg-background text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {s}
              </button>
            ))}
          </div>

          {dateFilter === "Custom" && (
            <div className="inline-flex items-center gap-1.5">
              <div className="w-36">
                <DatePicker
                  value={startDate}
                  onChange={setStartDate}
                  placeholder="Start date"
                  className="h-8 text-xs bg-background"
                />
              </div>
              <span className="text-xs text-muted-foreground/60 font-medium px-0.5">to</span>
              <div className="w-36">
                <DatePicker
                  value={endDate}
                  min={startDate}
                  onChange={setEndDate}
                  placeholder="End date"
                  className="h-8 text-xs bg-background"
                />
              </div>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <Label className="text-[11px] font-semibold text-muted-foreground">Status:</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 text-xs w-40 rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="seated">Seated</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="noShow">No-Show</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Live Overview — the page's original 4 channel/deposit cards, kept as-is. */}
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Live Overview</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Dine In Card */}
        <Card className="shadow-sm border-primary/30 bg-card/60 backdrop-blur hover:border-primary/50 transition-all">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dine In</p>
              <p className="text-2xl font-bold mt-1 text-primary">{stats.dineInCount}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{stats.dineInGuests} Guests (Pax)</p>
            </div>
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <Utensils className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Take Away Card */}
        <Card className="shadow-sm border-info/30 bg-card/60 backdrop-blur hover:border-info/50 transition-all">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Take Away</p>
              <p className="text-2xl font-bold mt-1 text-info">{stats.takeAwayCount}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Pre-Order Pickups</p>
            </div>
            <div className="h-10 w-10 rounded-full bg-info/10 flex items-center justify-center text-info shrink-0">
              <ShoppingBag className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Delivery Card */}
        <Card className="shadow-sm border-amber-500/30 bg-card/60 backdrop-blur hover:border-amber-500/50 transition-all">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Delivery</p>
              <p className="text-2xl font-bold mt-1 text-amber-500">{stats.deliveryCount}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Scheduled Deliveries</p>
            </div>
            <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
              <Truck className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Advance Deposits Card */}
        <Card className="shadow-sm border-success/30 bg-card/60 backdrop-blur hover:border-success/50 transition-all">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Advance Deposits</p>
              <p className="text-2xl font-bold mt-1 text-success">PKR {stats.totalAdvanceCollected.toLocaleString()}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Total Collected</p>
            </div>
            <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center text-success shrink-0">
              <DollarSign className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Booking Analytics — same 4-tile style as the Dashboard's "Reservations Analytics"
          section (reportService.getReservationAnalytics), scoped to this page's own date +
          status filters, so it always agrees with what the table below is showing. */}
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Booking Analytics</p>
      {resAnalyticsLoading || !resAnalytics ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-lg bg-background/70 border border-border/50 p-3.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Bookings</p>
            <p className="text-xl font-bold tracking-tight text-foreground mt-0.5">{resAnalytics.totalReservations.toLocaleString()}</p>
          </div>
          <div className="rounded-lg bg-background/70 border border-border/50 p-3.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Guests</p>
            <p className="text-xl font-bold tracking-tight text-foreground mt-0.5">{resAnalytics.totalGuests.toLocaleString()}</p>
          </div>
          <div className="rounded-lg bg-background/70 border border-border/50 p-3.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cancelled</p>
            <p className="text-xl font-bold tracking-tight text-destructive mt-0.5">{resAnalytics.cancelledCount.toLocaleString()}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{resAnalytics.cancelRate}% of bookings</p>
          </div>
          <div className="rounded-lg bg-background/70 border border-border/50 p-3.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">No-Show</p>
            <p className="text-xl font-bold tracking-tight text-muted-foreground mt-0.5">{resAnalytics.noShowCount.toLocaleString()}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{resAnalytics.noShowRate}% of bookings</p>
          </div>
        </div>
      )}

      {/* Category Filter Tabs */}
      <div className="flex flex-col sm:flex-row justify-between gap-3 items-start sm:items-center">
        <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full">
          <TabsList className="bg-muted/60 p-1 rounded-xl flex-wrap h-auto">
            <TabsTrigger value="all" className="rounded-lg text-xs font-semibold">
              All Records ({dateFilteredReservations.length})
            </TabsTrigger>
            <TabsTrigger value="Dine In" className="rounded-lg text-xs font-semibold flex items-center gap-1.5">
              <Utensils className="h-3.5 w-3.5 text-primary" /> Dine In
            </TabsTrigger>
            <TabsTrigger value="Take Away" className="rounded-lg text-xs font-semibold flex items-center gap-1.5">
              <ShoppingBag className="h-3.5 w-3.5 text-info" /> Take Away
            </TabsTrigger>
            <TabsTrigger value="Delivery" className="rounded-lg text-xs font-semibold flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5 text-amber-500" /> Delivery
            </TabsTrigger>
          </TabsList>
        </Tabs>
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
                        if (effStatus === "dispatch_due") {
                          return (
                            <Badge variant="outline" className="capitalize border text-xs font-bold bg-amber-500/15 text-amber-500 border-amber-500/30 flex items-center gap-1 w-fit">
                              <Truck className="h-3 w-3" /> Dispatch Due
                            </Badge>
                          );
                        }
                        if (effStatus === "pickup_due") {
                          return (
                            <Badge variant="outline" className="capitalize border text-xs font-bold bg-amber-500/15 text-amber-500 border-amber-500/30 flex items-center gap-1 w-fit">
                              <ShoppingBag className="h-3 w-3" /> Pickup Due
                            </Badge>
                          );
                        }
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
                        {(effStatus === "not_arrived" || r.status === "confirmed" || effStatus === "dispatch_due" || effStatus === "pickup_due") && r.status !== "seated" && r.status !== "completed" && r.status !== "cancelled" && (
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 text-xs font-semibold shadow-sm px-2.5 rounded-lg gap-1"
                            onClick={() => changeStatus(r.id, "cancelled")}
                            disabled={updateMutation.isPending}
                          >
                            <XCircle className="h-3 w-3" /> Cancel
                          </Button>
                        )}
                        {effStatus === "not_arrived" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs font-semibold shadow-sm px-2.5 rounded-lg gap-1 text-muted-foreground border-muted-foreground/30 hover:bg-muted"
                            onClick={() => changeStatus(r.id, "noShow")}
                            disabled={updateMutation.isPending}
                            title="Booking time has passed with no arrival"
                          >
                            <UserX className="h-3 w-3" /> No-Show
                          </Button>
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
                      <p className="font-semibold text-base">No Dine In, Take Away, or Delivery records found</p>
                      <p className="text-xs">Click "New Booking / Pre-Order" above to create one.</p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Menu Item Picker Modal for Pre-Orders (POS Style) */}
      <Dialog open={showMenuPicker} onOpenChange={setShowMenuPicker}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden bg-background border border-border/80 shadow-2xl rounded-2xl">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-border/60 bg-card/60 backdrop-blur-md flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
                <ChefHat className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-lg font-black tracking-tight text-foreground flex items-center gap-2">
                  Food Menu Catalog
                  <Badge variant="outline" className="text-[10px] font-extrabold bg-primary/10 text-primary border-primary/20 px-2 py-0.5">
                    POS Catalog
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Browse food categories or search items to attach to advance pre-orders.
                </DialogDescription>
              </div>
            </div>
          </div>

          {/* Search & Category Pills Bar */}
          <div className="px-4 sm:px-5 py-3 border-b border-border/60 bg-muted/20 space-y-2.5">
            {/* Search Input */}
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search food items by name..."
                value={menuSearch}
                onChange={e => setMenuSearch(e.target.value)}
                className="pl-10 pr-9 h-10 text-xs rounded-xl bg-background border-border/80 focus:border-primary/40 transition-colors shadow-xs"
              />
              {menuSearch && (
                <button onClick={() => setMenuSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Category Pills */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar scroll-smooth">
              <button
                type="button"
                onClick={() => setSelectedCatId("deals")}
                className={cn(
                  "px-3.5 py-1.5 text-xs rounded-full font-bold whitespace-nowrap transition-all border shrink-0 flex items-center gap-1.5",
                  selectedCatId === "deals"
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-background text-muted-foreground hover:text-foreground border-border/80 hover:bg-muted/50"
                )}
              >
                <Gift className="h-3.5 w-3.5" /> Deals ({sellableDeals.length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedCatId("all")}
                className={cn(
                  "px-3.5 py-1.5 text-xs rounded-full font-bold whitespace-nowrap transition-all border shrink-0",
                  selectedCatId === "all"
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-background text-muted-foreground hover:text-foreground border-border/80 hover:bg-muted/50"
                )}
              >
                All Items ({menuItems.length})
              </button>
              {categories.map(cat => {
                const count = menuItems.filter(i => i.categoryId === cat.id).length;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCatId(cat.id)}
                    className={cn(
                      "px-3.5 py-1.5 text-xs rounded-full font-bold whitespace-nowrap transition-all border shrink-0 flex items-center gap-1.5",
                      selectedCatId === cat.id
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-background text-muted-foreground hover:text-foreground border-border/80 hover:bg-muted/50"
                    )}
                  >
                    {cat.name}
                    <span className={cn("text-[10px] px-1.5 py-0.2 rounded-full font-black", selectedCatId === cat.id ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground")}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Menu Items Grid (POS Food Tile Cards) — or the Deals grid when that pill is active */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-background/50">
            {selectedCatId === "deals" ? (
              sellableDeals.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Gift className="h-10 w-10 mx-auto opacity-20 mb-2 text-primary" />
                  <p className="font-bold text-sm text-foreground">No deals running for {orderTypeForDeals}</p>
                  <p className="text-xs mt-1">Switch Order Type above, or add plain menu items instead.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
                  {sellableDeals.map(deal => {
                    const badge = dealFormatBadge[deal.type];
                    const BadgeIcon = badge.icon;
                    return (
                      <button
                        key={deal.id}
                        type="button"
                        onClick={() => addDealToCart(deal)}
                        className="group bg-card rounded-2xl border border-border/80 p-2.5 transition-all duration-300 flex flex-col justify-between text-left hover:border-primary/50 hover:shadow-lg hover:-translate-y-0.5"
                      >
                        <div className="aspect-[4/3] rounded-xl overflow-hidden mb-2 relative bg-gradient-to-br from-amber-500/10 via-primary/10 to-orange-500/20 border border-border/40 flex items-center justify-center">
                          <Gift className="h-8 w-8 text-primary" />
                          <Badge className="absolute top-2 left-2 text-[9px] font-bold bg-background/85 backdrop-blur-md text-foreground border-none shadow-xs px-2 py-0.5 flex items-center gap-1">
                            <BadgeIcon className="h-3 w-3" /> {badge.label}
                          </Badge>
                        </div>
                        <div className="space-y-0.5">
                          <h4 className="font-bold text-xs sm:text-sm text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                            {deal.name}
                          </h4>
                          <p className="text-xs font-black text-primary font-mono">{dealPriceLabel(deal)}</p>
                        </div>
                        <div className="pt-3">
                          <span className="w-full inline-flex items-center justify-center h-8 text-xs font-extrabold gradient-primary text-primary-foreground rounded-xl shadow-xs gap-1">
                            <Plus className="h-3.5 w-3.5" /> Add Deal
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )
            ) : filteredMenuItems.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Search className="h-10 w-10 mx-auto opacity-20 mb-2 text-primary" />
                <p className="font-bold text-sm text-foreground">No menu items found</p>
                <p className="text-xs mt-1">Try adjusting your search query or category filter</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
                {filteredMenuItems.map(item => {
                  // Total selected quantity for this food item across all variants or single item
                  const preOrders = form.preOrderItems || [];
                  const totalSelectedQty = preOrders
                    .filter(i => i.menuItemId === item.id)
                    .reduce((sum, i) => sum + i.qty, 0);

                  const singleItemQty = preOrders.find(i => i.menuItemId === item.id && !i.variantId)?.qty || 0;

                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "group bg-card rounded-2xl border p-2.5 transition-all duration-300 flex flex-col justify-between relative overflow-hidden",
                        totalSelectedQty > 0
                          ? "border-primary ring-2 ring-primary/20 shadow-md bg-primary/[0.02]"
                          : "border-border/80 hover:border-primary/50 hover:shadow-lg hover:-translate-y-0.5"
                      )}
                    >
                      <div>
                        {/* Food Image Tile / Letter Placeholder */}
                        <div className="aspect-[4/3] rounded-xl overflow-hidden mb-2 relative bg-muted/40 border border-border/40">
                          {item.image ? (
                            <img
                              src={item.image}
                              alt={item.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="w-full h-full gradient-primary flex items-center justify-center rounded-xl shadow-inner">
                              <span className="text-primary-foreground text-2xl font-black tracking-tight">
                                {item.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          )}

                          {/* Category Tag (Top Left) */}
                          <Badge className="absolute top-2 left-2 text-[9px] font-bold bg-background/85 backdrop-blur-md text-foreground border-none shadow-xs px-2 py-0.5">
                            {item.category?.name || "Menu"}
                          </Badge>

                          {/* Selected Quantity Counter Badge (Top Right) */}
                          {totalSelectedQty > 0 && (
                            <Badge className="absolute top-2 right-2 text-[10px] font-black bg-primary text-primary-foreground shadow-md px-2 py-0.5 rounded-full border border-primary-foreground/20">
                              {totalSelectedQty} in pre-order
                            </Badge>
                          )}
                        </div>

                        {/* Title & Base Price */}
                        <div className="space-y-0.5">
                          <h4 className="font-bold text-xs sm:text-sm text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                            {item.name}
                          </h4>
                          <p className="text-xs font-black text-primary font-mono">
                            PKR {Number(item.price).toLocaleString()}
                          </p>
                        </div>
                      </div>

                      {/* Action Buttons Section */}
                      <div className="pt-3 space-y-1.5">
                        {item.variants && item.variants.length > 0 ? (
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-muted-foreground block uppercase tracking-wider">
                              Select Size / Variant:
                            </span>
                            <div className="grid grid-cols-1 gap-1">
                              {item.variants.map(v => {
                                const varQty = preOrders.find(i => i.menuItemId === item.id && i.variantId === v.id)?.qty || 0;
                                return (
                                  <div key={v.id} className="flex items-center justify-between gap-1 text-[11px]">
                                    {varQty === 0 ? (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="w-full h-7 text-[10px] font-bold justify-between px-2 rounded-lg border-border/80 hover:border-primary/40 hover:bg-primary/5"
                                        onClick={() => handleAddPreOrderItem(item, v.id)}
                                      >
                                        <span>+ {v.name}</span>
                                        <span className="font-mono text-primary font-extrabold">PKR {Number(v.price).toLocaleString()}</span>
                                      </Button>
                                    ) : (
                                      <div className="flex items-center justify-between w-full bg-primary/10 border border-primary/30 rounded-lg p-0.5">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="icon"
                                          className="h-6 w-6 rounded-md border-primary/30 text-primary bg-background"
                                          onClick={() => handleDecreasePreOrderItem(item.id, v.id)}
                                        >
                                          <Minus className="h-3 w-3" />
                                        </Button>
                                        <span className="font-extrabold text-xs text-primary px-1">
                                          {v.name}: {varQty}
                                        </span>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="icon"
                                          className="h-6 w-6 rounded-md border-primary/30 text-primary bg-background"
                                          onClick={() => handleAddPreOrderItem(item, v.id)}
                                        >
                                          <Plus className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          singleItemQty === 0 ? (
                            <Button
                              type="button"
                              size="sm"
                              className="w-full h-8 text-xs font-extrabold gradient-primary text-primary-foreground rounded-xl shadow-xs gap-1"
                              onClick={() => handleAddPreOrderItem(item)}
                            >
                              <Plus className="h-3.5 w-3.5" /> Add to Order
                            </Button>
                          ) : (
                            <div className="flex items-center justify-between bg-primary/10 border border-primary/30 rounded-xl p-1 w-full">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-7 w-7 rounded-lg border-primary/30 text-primary bg-background shadow-xs"
                                onClick={() => handleDecreasePreOrderItem(item.id)}
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </Button>
                              <span className="font-extrabold text-sm text-primary px-2 font-mono">
                                {singleItemQty}
                              </span>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-7 w-7 rounded-lg border-primary/30 text-primary bg-background shadow-xs"
                                onClick={() => handleAddPreOrderItem(item)}
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sticky Bottom Bar with Order Summary & Action */}
          <div className="p-4 border-t border-border/60 bg-card flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="p-2.5 bg-primary/10 rounded-2xl text-primary border border-primary/20">
                <ShoppingBag className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-semibold">Pre-Order Food Selection</p>
                <p className="text-sm font-black text-foreground">
                  {form.preOrderItems?.reduce((sum, i) => sum + i.qty, 0) || 0} Total Items —{" "}
                  <span className="text-primary font-mono font-black">
                    PKR {(form.subtotal || 0).toLocaleString()}
                  </span>
                </p>
              </div>
            </div>

            <Button
              type="button"
              className="gradient-primary text-primary-foreground font-extrabold shadow-md px-6 py-2.5 rounded-xl text-sm gap-1.5 w-full sm:w-auto"
              onClick={() => setShowMenuPicker(false)}
            >
              <Check className="h-4 w-4" /> Done Selecting ({form.preOrderItems?.length || 0} items)
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Customizable Deal (Option Combo / Customizable Buy X Get Y side) — choice dialog */}
      <Dialog open={showDealCustomize} onOpenChange={(open) => { setShowDealCustomize(open); if (!open) { setCustomizingDeal(null); setCustomizingDealLineId(null); } }}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary shrink-0" />
              <span>{customizingDeal?.name}</span>
            </DialogTitle>
            <DialogDescription>Pick an item for each step below, then add the deal to the pre-order.</DialogDescription>
          </DialogHeader>
          {customizingDeal && (
            <div className="space-y-5">
              {customizeGroups.map((g, idx) => {
                const selected = dealGroupSelections[g.id] || [];
                const need = g.minSelections === g.maxSelections ? `${g.minSelections}` : `${g.minSelections}-${g.maxSelections}`;
                return (
                  <div key={g.id} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                      <p className="text-sm font-bold text-foreground">{g.label}</p>
                      <span className="text-[11px] text-muted-foreground font-medium ml-auto shrink-0">Pick {need}</span>
                    </div>
                    <div className="space-y-1.5">
                      {g.options.map((o) => {
                        const key = dealOptionKey(o.menuItemId, o.variantId);
                        const menuItem = menuItems.find((m) => m.id === o.menuItemId);
                        const variant = o.variantId ? menuItem?.variants?.find((v) => v.id === o.variantId) : undefined;
                        const isChecked = selected.includes(key);
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => toggleDealOption(g.id, key, g.maxSelections)}
                            className={cn(
                              "w-full flex items-start gap-3 p-3 rounded-xl border text-left text-sm transition-colors",
                              isChecked ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/30"
                            )}
                          >
                            <Checkbox checked={isChecked} className="mt-0.5 shrink-0 pointer-events-none" />
                            <p className={cn("leading-snug break-words", isChecked ? "font-semibold text-primary" : "font-medium text-foreground")}>
                              {menuItem?.name || "Item"}{variant ? ` (${variant.name})` : ""}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDealCustomize(false)}>Cancel</Button>
            <Button className="gradient-primary text-primary-foreground" onClick={confirmDealCustomize}>Add to Pre-Order</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* % Discount Deal — eligible item picker */}
      <Dialog open={showDealItemPicker} onOpenChange={(open) => { setShowDealItemPicker(open); if (!open) setPickingDeal(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{pickingDeal?.name}</DialogTitle>
            <DialogDescription>Pick which item this {pickingDeal?.discountPercent}% discount applies to.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Item</label>
              <Select
                value={pickedDealItemId}
                onValueChange={(v) => { setPickedDealItemId(v); setPickedDealVariantId(null); }}
              >
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select an item" /></SelectTrigger>
                <SelectContent>
                  {eligibleDealItems.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(() => {
              const menuItem = eligibleDealItems.find((m) => m.id === pickedDealItemId);
              const variants = menuItem?.variants || [];
              if (variants.length === 0) return null;
              return (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Size</label>
                  <Select value={pickedDealVariantId || ""} onValueChange={setPickedDealVariantId}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select a size" /></SelectTrigger>
                    <SelectContent>
                      {variants.map((v) => (
                        <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })()}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Quantity</label>
              <Input
                type="number"
                min={1}
                value={pickedDealQty}
                onChange={(e) => setPickedDealQty(Math.max(1, Number(e.target.value) || 1))}
                className="h-9 text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDealItemPicker(false)}>Cancel</Button>
            <Button className="gradient-primary text-primary-foreground" disabled={!pickedDealItemId} onClick={confirmDealItemPick}>Add to Pre-Order</Button>
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

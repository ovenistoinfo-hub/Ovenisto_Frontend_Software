import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Plus, Minus, X, ShoppingCart, UtensilsCrossed, Clock, Users,
  Receipt, CircleDot, ChevronDown, ChevronUp, Bell, Check, Loader2, Trash2,
  Play, Power, Eye, CreditCard, Percent, CornerUpRight, Printer, ArrowLeft, Search,
  Coins, Wallet, Smartphone, BookOpen, User, History, Building2, Crown, Phone, MapPin, Calendar, Timer, DollarSign, CalendarCheck,
  AlertCircle, XCircle, CheckCircle2, Utensils
} from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { orderService, type OrderRecord } from "@/services/order.service";
import { useVisiblePolling } from "@/hooks/use-visible-polling";
import { useOrderEvents } from "@/hooks/use-order-events";
import { useTableEvents } from "@/hooks/use-table-events";
import { useReservationEvents } from "@/hooks/use-reservation-events";
import { menuService, type MenuItemRecord, type CategoryRecord, type ModifierRecord, type MenuItemVariant } from "@/services/menu.service";
import { tableService, type TableRecord } from "@/services/table.service";
import { reservationService, type Reservation } from "@/services/reservation.service";
import { customerService, type CustomerRecord } from "@/services/customer.service";
import { settingsService } from "@/services/settings.service";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";

// ─── Types ─────────────────────────────────────────────────────────────────

interface CartItem {
  id: string;
  menuItemId?: string;        // real DB id — needed for KDS category routing
  variantId?: string | null;  // variant DB id — sent to backend for proper linking
  cookingTime?: number;       // used by KDS countdown timer
  name: string;
  price: number;
  qty: number;
  variant?: string;
  modifiers?: string[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Always use dine-in price; fall back to base price */
const dineInPrice  = (item: MenuItemRecord): number  => item.dineInPrice ?? item.price;
const variantDineInPrice = (v: MenuItemVariant): number => v.dineInPrice ?? v.price;

/** Use item-specific modifiers only, matching POS behavior */
const resolveModifiers = (item: MenuItemRecord) => {
  return item.modifiers?.filter((m) => m.status === "active") || [];
};

// ─── Status config ─────────────────────────────────────────────────────────

const statusConfig = {
  available:        { card: "border-success/40 hover:border-success",             dot: "bg-success",     bg: "bg-success/8",     icon: "text-success",     label: "Available" },
  occupied:         { card: "border-accent/40 hover:border-accent",               dot: "bg-accent",       bg: "bg-accent/8",       icon: "text-accent",       label: "Occupied" },
  "bill-requested": { card: "border-destructive/40 hover:border-destructive",     dot: "bg-destructive", bg: "bg-destructive/8", icon: "text-destructive", label: "Bill Req." },
} as const;

const renderMiniChairs = (shape: string, capacity: number, chairBgClass: string) => {
  const chairs = [];
  const cap = capacity || 4;

  if (shape === "round") {
    for (let i = 0; i < cap; i++) {
      const angle = (i * 2 * Math.PI) / cap - Math.PI / 2;
      const x = Math.cos(angle) * 38; // 38px radius
      const y = Math.sin(angle) * 38;
      chairs.push(
        <div
          key={i}
          className={cn("absolute h-1.5 w-1.5 rounded-full border border-background/20 shadow-sm transition-all duration-300", chairBgClass)}
          style={{
            left: `calc(50% + ${x}px)`,
            top: `calc(50% + ${y}px)`,
            transform: "translate(-50%, -50%)",
          }}
        />
      );
    }
  } else if (shape === "rectangle") {
    const perimeter = 256;
    const segment = perimeter / cap;
    const offset = segment / 2;
    for (let i = 0; i < cap; i++) {
      const dist = (i * segment + offset) % perimeter;
      let x = 0;
      let y = 0;
      if (dist < 80) {
        x = -40 + dist;
        y = -24;
      } else if (dist < 128) {
        x = 40;
        y = -24 + (dist - 80);
      } else if (dist < 208) {
        x = 40 - (dist - 128);
        y = 24;
      } else {
        x = -40;
        y = 24 - (dist - 208);
      }
      chairs.push(
        <div
          key={i}
          className={cn("absolute h-1.5 w-1.5 rounded-sm border border-background/20 shadow-sm transition-all duration-300", chairBgClass)}
          style={{
            left: `calc(50% + ${x}px)`,
            top: `calc(50% + ${y}px)`,
            transform: "translate(-50%, -50%)",
          }}
        />
      );
    }
  } else {
    const perimeter = 224;
    const segment = perimeter / cap;
    const offset = segment / 2;
    for (let i = 0; i < cap; i++) {
      const dist = (i * segment + offset) % perimeter;
      let x = 0;
      let y = 0;
      if (dist < 56) {
        x = -28 + dist;
        y = -28;
      } else if (dist < 112) {
        x = 28;
        y = -28 + (dist - 56);
      } else if (dist < 168) {
        x = 28 - (dist - 112);
        y = 28;
      } else {
        x = -28;
        y = 28 - (dist - 168);
      }
      chairs.push(
        <div
          key={i}
          className={cn("absolute h-1.5 w-1.5 rounded-sm border border-background/20 shadow-sm transition-all duration-300", chairBgClass)}
          style={{
            left: `calc(50% + ${x}px)`,
            top: `calc(50% + ${y}px)`,
            transform: "translate(-50%, -50%)",
          }}
        />
      );
    }
  }
  return chairs;
};

type TableStatus = keyof typeof statusConfig;
const ACTIVE_STATUSES = ["pending", "preparing", "ready"];

// ─── Component ─────────────────────────────────────────────────────────────

const WaiterPanel = () => {
  const { settings, updateSettings } = useData();
  const { user } = useAuth();
  const currency = settings.currency || "Rs.";

  // Dynamic ticking clock for live order countdown/wait timers
  const [clock, setClock] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // ── Backend data ──
  const [tables,       setTables]       = useState<TableRecord[]>([]);
  const [orders,       setOrders]       = useState<OrderRecord[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [customers,    setCustomers]    = useState<CustomerRecord[]>([]);
  const [menuItems,    setMenuItems]    = useState<MenuItemRecord[]>([]);
  const [cats,         setCats]         = useState<CategoryRecord[]>([]);
  const [globalMods,   setGlobalMods]   = useState<ModifierRecord[]>([]);
  const [loading,      setLoading]      = useState(true);

  // ── Customer Association ──
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [tableCustomerMap, setTableCustomerMap] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem("ovenisto_table_customers");
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [showCustomerAddDialog, setShowCustomerAddDialog] = useState(false);
  const [showCustomerHistoryDialog, setShowCustomerHistoryDialog] = useState(false);

  // ── Reservations Dialogs ──
  const [showTodayReservationsDialog, setShowTodayReservationsDialog] = useState(false);

  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    customerType: "walk-in",
  });

  // ── Local UI state ──
  const [selectedReservationForSitting, setSelectedReservationForSitting] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "available" | "occupied" | "bill" | "reservations">("all");
  const [floorFilter,  setFloorFilter]  = useState<string>("all");
  const [billReqSet,    setBillReqSet]    = useState<Set<number>>(new Set());
  const [acceptingId,   setAcceptingId]   = useState<string | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [cartItems,       setCartItems]        = useState<CartItem[]>([]);
  const [menuCategory,    setMenuCategory]     = useState("All");
  const [expandedItemId,    setExpandedItemId]    = useState<string | null>(null);
  const [selectedVariant,   setSelectedVariant]   = useState<{ id: string; name: string; price: number } | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [taxRate,       setTaxRate]       = useState<number>(settings.taxRate ?? 0);
  const [isOrderingMode, setIsOrderingMode] = useState(false);
  const [settlePaymentMethod, setSettlePaymentMethod] = useState("Cash");
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [targetMoveTableId, setTargetMoveTableId] = useState<string | null>(null);
  const [showOrdersDialog, setShowOrdersDialog] = useState(false);
  const [showBillDialog, setShowBillDialog] = useState(false);
  const [showPayBillDialog, setShowPayBillDialog] = useState(false);
  const [isSplitPayment, setIsSplitPayment] = useState(false);
  const [splitMethod1, setSplitMethod1] = useState("Cash");
  const [splitMethod2, setSplitMethod2] = useState("Credit Card");
  const [splitAmount1, setSplitAmount1] = useState(0);
  const [splitAmount2, setSplitAmount2] = useState(0);
  const [startingSitting, setStartingSitting] = useState(false);
  const [endingSitting, setEndingSitting] = useState(false);
  const [settlingBillingState, setSettlingBillingState] = useState(false);
  const [movingTable, setMovingTable] = useState(false);

  // Guests Count inputs
  const [showGuestsDialog, setShowGuestsDialog] = useState(false);
  const [guestsCount, setGuestsCount] = useState(4);
  const [guestsActionType, setGuestsActionType] = useState<"start-sitting" | "place-order" | null>(null);

  // ── Load data ──

  const loadOrders = useCallback(async () => {
    try {
      const res = await orderService.getOrders({ limit: 200 });
      setOrders(res.data);
    } catch { /* silent polling */ }
  }, []);

  const loadTables = useCallback(async () => {
    try {
      const data = await tableService.getTables();
      setTables(data);
    } catch { /* silent polling */ }
  }, []);

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

  const handleCancelReservation = async (id: string) => {
    try {
      await reservationService.update(id, { status: "cancelled" });
      toast.success("Reservation cancelled");
      loadReservations();
    } catch {
      toast.error("Failed to cancel reservation");
    }
  };

  const loadReservations = useCallback(async () => {
    try {
      const pkt = new Date(Date.now() + 5 * 60 * 60 * 1000);
      const todayStr = pkt.toISOString().split("T")[0];
      const data = await reservationService.getAll({ date: todayStr });
      setReservations(data.filter(r => r.date === todayStr && (!r.orderType || r.orderType === "Dine In") && r.bookingType !== "future_order"));
    } catch { /* silent polling */ }
  }, []);

  const loadCustomers = useCallback(async () => {
    try {
      const res = await customerService.getCustomers({ limit: 500 });
      setCustomers(res.data);
    } catch { /* silent polling */ }
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const pkt = new Date(Date.now() + 5 * 60 * 60 * 1000);
        const todayStr = pkt.toISOString().split("T")[0];
        const [tableData, itemData, catData, modData, apiSettings, resData, custRes] = await Promise.all([
          tableService.getTables(),
          menuService.getMenuItems({ available: true, limit: 200 }),
          menuService.getCategories("active"),
          menuService.getModifiers(),
          settingsService.getSettings(),
          reservationService.getAll({ date: todayStr }).then(data => data.filter(r => (!r.orderType || r.orderType === "Dine In") && r.bookingType !== "future_order")).catch(() => []),
          customerService.getCustomers({ limit: 500 }).catch(() => ({ data: [] })),
        ]);
        setTables(tableData);
        setMenuItems(itemData);
        setCats(catData);
        setGlobalMods(modData.filter((m) => m.status === "active"));
        setTaxRate(Number(apiSettings.taxRate) ?? 0);
        setReservations(resData);
        setCustomers(custRes.data);
        updateSettings({
          restaurantName: apiSettings.restaurantName || "",
          phone: apiSettings.phone || "",
          email: apiSettings.email || "",
          currency: apiSettings.currency || "Rs.",
          taxName: apiSettings.taxName || "GST",
          taxRate: Number(apiSettings.taxRate ?? 16),
          address: apiSettings.address || "",
          receiptHeader: apiSettings.receiptHeader || "",
          tableManagement: apiSettings.tableManagement,
          onlineOrders: apiSettings.onlineOrders,
          paymentMethods: apiSettings.paymentMethods,
        });
      } catch {
        toast.error("Failed to load data");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [loadOrders]);

  // Orders and Tables refresh on real-time push, plus a 60s visibility-gated safety poll so a
  // waiter's tablet stops querying when backgrounded (lets the Neon compute idle).
  useOrderEvents(loadOrders);
  useTableEvents(loadTables);
  useReservationEvents(loadReservations);
  useVisiblePolling(loadOrders, 60000);
  useVisiblePolling(loadTables, 60000);
  useVisiblePolling(loadReservations, 60000);
  useVisiblePolling(loadCustomers, 60000);

  // ── Derived ──

  const isOrderUnpaid = (o: any) => {
    if (o.status === "completed") return false;
    if (!o.paymentMethod || o.paymentMethod === "Pending" || o.paymentMethod === "Unpaid") return true;

    const total = Number(o.total || 0);
    const advance = Number(o.advancePayment || 0);
    const netDue = total - advance;
    if (advance > 0 && netDue > 0.01 && o.paymentStatus !== "fully_paid") {
      return true;
    }
    return false;
  };

  const getTableStatus = (tableNum: number): TableStatus => {
    const activeOrders = orders.filter((o) => o.tableNumber === tableNum && ACTIVE_STATUSES.includes(o.status));
    const hasUnpaidOnTable = activeOrders.some(isOrderUnpaid);

    if (billReqSet.has(tableNum) && (activeOrders.length === 0 || hasUnpaidOnTable)) return "bill-requested";
    const t = tables.find((tbl) => Number(tbl.number) === tableNum);
    if (t && t.status === "bill-requested" && (activeOrders.length === 0 || hasUnpaidOnTable)) return "bill-requested";

    if (activeOrders.length > 0) {
      // If food is ready AND there is an unpaid order, mark table as bill-requested
      const allReady = activeOrders.every((o) => o.status === "ready");
      if (allReady && hasUnpaidOnTable) return "bill-requested";
      return "occupied";
    }

    if (t) {
      if (t.status === "occupied") return "occupied";
      if (t.status === "reserved") return "occupied"; // map reserved to occupied for UI session
    }
    return "available";
  };

  const getTableOrders = (tableNum: number) =>
    orders.filter((o) => o.tableNumber === tableNum && ACTIVE_STATUSES.includes(o.status));

  const pendingSelfOrders = orders.filter(
    (o) => o.type === "Self Order" && o.status === "pending"
  );

  const selectedTable    = tables.find((t) => t.id === selectedTableId) ?? null;
  const selectedTableNum = selectedTable ? Number(selectedTable.number) : null;
  const tableStatus: TableStatus = selectedTable ? getTableStatus(Number(selectedTable.number)) : "available";
  const activeTableOrders = selectedTableNum !== null ? orders.filter((o) => {
    if (o.tableNumber !== selectedTableNum) return false;
    if (ACTIVE_STATUSES.includes(o.status)) return true;
    const isTableOccupied = tables.some(t => Number(t.number) === selectedTableNum && (t.status === "occupied" || t.status === "bill-requested"));
    const matchingTable = tables.find(t => Number(t.number) === selectedTableNum);
    const sessionStartStr = matchingTable?.currentOrderId;
    if (isTableOccupied && o.status === "completed" && sessionStartStr) {
      const sessionStart = Number(sessionStartStr);
      const orderTime = new Date(o.createdAt).getTime();
      if (!isNaN(sessionStart) && orderTime >= sessionStart) {
        const ageMs = Date.now() - new Date(o.updatedAt || o.createdAt).getTime();
        return ageMs < 4 * 60 * 60 * 1000;
      }
    }
    return false;
  }) : [];

  const unpaidOrders = activeTableOrders.filter(isOrderUnpaid);
  const hasUnpaid = unpaidOrders.length > 0;
  const isSessionPaid = activeTableOrders.length > 0 && !hasUnpaid;

  const hasPendingOrPreparing = unpaidOrders.some(o => o.status === "pending" || o.status === "preparing");
  const hasReady = unpaidOrders.some(o => o.status === "ready" || o.status === "served");
  const canPayBill = hasUnpaid && !hasPendingOrPreparing && (hasReady || activeTableOrders.every(o => o.status === "ready" || o.status === "served"));

  const confirmedReservations = useMemo(() => {
    const pkt = new Date(Date.now() + 5 * 60 * 60 * 1000);
    const todayStr = pkt.toISOString().split("T")[0];
    return reservations.filter(r =>
      r.date === todayStr &&
      r.status !== "pending" &&
      r.status !== "cancelled" &&
      r.status !== "noShow" &&
      (!r.orderType || r.orderType === "Dine In") &&
      r.bookingType !== "future_order"
    );
  }, [reservations]);

  const reservedTableNums = useMemo(() => {
    const set = new Set<number>();
    for (const r of confirmedReservations) {
      if (r.status === "confirmed" && r.tableNumber && !isNaN(Number(r.tableNumber))) {
        set.add(Number(r.tableNumber));
      }
    }
    return set;
  }, [confirmedReservations]);

  const todayReservationsCount = useMemo(() => {
    return confirmedReservations.length;
  }, [confirmedReservations]);

  const stats = {
    available: tables.filter((t) => getTableStatus(Number(t.number)) === "available").length,
    occupied:  tables.filter((t) => getTableStatus(Number(t.number)) === "occupied").length,
    bill:      tables.filter((t) => getTableStatus(Number(t.number)) === "bill-requested").length,
  };

  const floorsList = useMemo(() => {
    return Array.from(new Set(tables.map((t) => t.floor || "Main Hall").filter(Boolean)));
  }, [tables]);

  const filteredTables = useMemo(() => {
    return tables.filter((t) => {
      const tNum = Number(t.number);
      const st = getTableStatus(tNum);
      const fl = t.floor || "Main Hall";
      if (floorFilter !== "all" && fl !== floorFilter) return false;
      if (statusFilter === "available") return st === "available";
      if (statusFilter === "occupied") return st === "occupied";
      if (statusFilter === "bill") return st === "bill-requested";
      if (statusFilter === "reservations") return reservedTableNums.has(tNum) || t.status === "reserved";
      return true;
    });
  }, [tables, statusFilter, floorFilter, reservedTableNums, billReqSet, orders]);

  const categoryNames = ["All", ...cats.map((c) => c.name)];
  const filteredMenu   = menuItems.filter(
    (i) => menuCategory === "All" || i.category?.name === menuCategory
  );
  const cartTotal = cartItems.reduce((s, i) => s + i.price * i.qty, 0);
  // The earliest order's timestamp for the seating timer in the sidebar
  const oldest = activeTableOrders.length > 0
    ? activeTableOrders[activeTableOrders.length - 1].createdAt
    : null;

  const selectedCustomerData = useMemo(() => {
    if (!selectedCustomerId) return null;
    return customers.find((c) => c.id === selectedCustomerId) || null;
  }, [selectedCustomerId, customers]);

  const activeReservationForTable = useMemo(() => {
    if (selectedTableNum === null && !selectedTable) return null;
    const custName = selectedCustomerData?.name || activeTableOrders.find(o => o.customerName && o.customerName !== "Walk-in")?.customerName;
    const custPhone = selectedCustomerData?.phone || activeTableOrders.find(o => o.phone)?.phone;

    return reservations.find(r =>
      ((selectedTableNum !== null && String(r.tableNumber) === String(selectedTableNum)) ||
       (selectedTable && r.tableId === selectedTable.id) ||
       (custName && r.customerName.toLowerCase().trim() === custName.toLowerCase().trim()) ||
       (custPhone && r.customerPhone && r.customerPhone.replace(/\D/g, "") === custPhone.replace(/\D/g, ""))) &&
      r.status !== "cancelled" && r.status !== "completed"
    );
  }, [reservations, selectedTableNum, selectedTable, selectedCustomerData, activeTableOrders]);

  const currentAdvancePayment = useMemo(() => {
    if (activeReservationForTable?.advancePaid && Number(activeReservationForTable.advancePaid) > 0) {
      return Number(activeReservationForTable.advancePaid);
    }
    return activeTableOrders.reduce((sum, o) => sum + (o.advancePayment ? Number(o.advancePayment) : 0), 0);
  }, [activeReservationForTable, activeTableOrders]);

  const customerHistory = useMemo(() => {
    if (!selectedCustomerData) return null;
    const custOrders = orders.filter(o => o.customerName === selectedCustomerData.name || (selectedCustomerData.phone && o.phone === selectedCustomerData.phone));
    const avgBill = custOrders.length > 0 ? Math.round(custOrders.reduce((s, o) => s + Number(o.total), 0) / custOrders.length) : 0;
    const topItems: Record<string, number> = {};
    custOrders.forEach(o => (o.items || []).forEach(i => { topItems[i.name] = (topItems[i.name] || 0) + i.qty; }));
    const sortedTop = Object.entries(topItems).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return {
      ...selectedCustomerData,
      orderCount: custOrders.length,
      totalSpent: selectedCustomerData.totalSpent || custOrders.reduce((s, o) => s + Number(o.total), 0),
      avgBill,
      topItems: sortedTop,
      recentOrders: custOrders.slice(0, 5),
    };
  }, [selectedCustomerData, orders]);

  const handleSelectCustomerForTable = (customerId: string) => {
    setSelectedCustomerId(customerId);
    if (selectedTableNum !== null) {
      const tNumStr = String(selectedTableNum);
      setTableCustomerMap(prev => {
        const updated = { ...prev, [tNumStr]: customerId };
        if (!customerId) delete updated[tNumStr];
        localStorage.setItem("ovenisto_table_customers", JSON.stringify(updated));
        return updated;
      });
    }
  };

  useEffect(() => {
    if (selectedTableNum === null) {
      setSelectedCustomerId("");
      return;
    }
    const tNumStr = String(selectedTableNum);
    if (tableCustomerMap[tNumStr]) {
      setSelectedCustomerId(tableCustomerMap[tNumStr]);
    } else {
      const orderWithCust = activeTableOrders.find(o => (o as any).customerId || (o.customerName && o.customerName !== "Walk-in"));
      if (orderWithCust) {
        const custId = (orderWithCust as any).customerId;
        const matched = custId 
          ? customers.find(c => c.id === custId)
          : customers.find(c => c.name === orderWithCust.customerName || (orderWithCust.phone && c.phone === orderWithCust.phone));
        if (matched) {
          setSelectedCustomerId(matched.id);
          setTableCustomerMap(prev => {
            const updated = { ...prev, [tNumStr]: matched.id };
            localStorage.setItem("ovenisto_table_customers", JSON.stringify(updated));
            return updated;
          });
        } else {
          setSelectedCustomerId("");
        }
      } else {
        setSelectedCustomerId("");
      }
    }
  }, [selectedTableNum, tableCustomerMap, activeTableOrders, customers]);

  const formatPhoneNumber = (val: string): string => {
    const digitsOnly = val.replace(/\D/g, "").slice(0, 11);
    if (digitsOnly.length > 4) {
      return `${digitsOnly.slice(0, 4)}-${digitsOnly.slice(4)}`;
    }
    return digitsOnly;
  };

  const handleAddCustomerSubmit = async () => {
    if (!newCustomerForm.name.trim()) {
      toast.error("Customer name is required");
      return;
    }
    const cleanPhone = newCustomerForm.phone.replace(/\D/g, "");
    if (cleanPhone.length !== 11) {
      toast.error("Phone number must be exactly 11 digits (e.g. 0300-1234567)");
      return;
    }
    setCreatingCustomer(true);
    try {
      const created = await customerService.createCustomer({
        name: newCustomerForm.name.trim(),
        phone: newCustomerForm.phone.trim(),
        email: newCustomerForm.email.trim() || undefined,
        address: newCustomerForm.address.trim() || undefined,
        customerType: newCustomerForm.customerType,
      });
      setCustomers((prev) => [...prev, created]);
      handleSelectCustomerForTable(created.id);
      toast.success(`Customer ${created.name} added successfully!`);
      setShowCustomerAddDialog(false);
      setNewCustomerForm({ name: "", phone: "", email: "", address: "", customerType: "walk-in" });
    } catch (err: any) {
      toast.error(err?.message || "Failed to add customer");
    } finally {
      setCreatingCustomer(false);
    }
  };

  // ── Accept self-order ──

  const acceptSelfOrder = async (order: OrderRecord) => {
    setAcceptingId(order.id);
    try {
      await orderService.updateOrderStatus(order.id, "preparing");
      toast.success(`Table ${order.tableNumber} — sent to kitchen`);
      await loadOrders();
    } catch {
      toast.error("Failed to accept order");
    } finally {
      setAcceptingId(null);
    }
  };

  // ── Cart ──

  const updateQty      = (id: string, d: number) => setCartItems((p) => p.map((o) => o.id === id ? { ...o, qty: Math.max(1, o.qty + d) } : o));
  const removeCartItem = (id: string)             => setCartItems((p) => p.filter((o) => o.id !== id));

  const resetExpansion = () => {
    setExpandedItemId(null);
    setSelectedVariant(null);
    setSelectedModifiers([]);
  };

  const addToOrder = (item: MenuItemRecord) => {
    const hasVariants  = item.variants && item.variants.length > 0;
    const itemMods     = resolveModifiers(item);
    const hasModifiers = itemMods.length > 0;

    if (!hasVariants && !hasModifiers) {
      const basePrice = dineInPrice(item);
      setCartItems((prev) => {
        const ex = prev.find((o) => o.id === item.id && !o.variant && !o.modifiers?.length);
        if (ex) return prev.map((o) => o === ex ? { ...o, qty: o.qty + 1 } : o);
        return [...prev, { id: item.id, menuItemId: item.id, variantId: null, cookingTime: item.cookingTime ?? 0, name: item.name, price: basePrice, qty: 1 }];
      });
      toast.success(`${item.name} added`);
      return;
    }

    if (expandedItemId === item.id) {
      resetExpansion();
    } else {
      setExpandedItemId(item.id);
      setSelectedVariant(null);
      setSelectedModifiers([]);
    }
  };

  const confirmAddWithOptions = (item: MenuItemRecord) => {
    const hasVariants = item.variants && item.variants.length > 0;
    if (hasVariants && !selectedVariant) { toast.error("Please select a size"); return; }

    const itemMods  = resolveModifiers(item);
    const basePrice = selectedVariant ? selectedVariant.price : dineInPrice(item);
    const modsCost  = selectedModifiers.reduce((s, mId) => s + (itemMods.find((m) => m.id === mId)?.price ?? 0), 0);
    const totalPrice = basePrice + modsCost;
    const variantName = selectedVariant?.name;
    const modNames    = selectedModifiers.map((mId) => itemMods.find((m) => m.id === mId)?.name ?? "").filter(Boolean);
    const cartKey     = `${item.id}-${variantName ?? "base"}-${[...selectedModifiers].sort().join("-")}`;

    setCartItems((prev) => {
      const ex = prev.find((c) => c.id === cartKey);
      if (ex) return prev.map((c) => c.id === cartKey ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, {
        id: cartKey, menuItemId: item.id, variantId: selectedVariant?.id ?? null, cookingTime: item.cookingTime ?? 0,
        name: variantName ? `${item.name} (${variantName})` : item.name,
        price: totalPrice, qty: 1, variant: variantName, modifiers: modNames,
      }];
    });
    toast.success(`${item.name}${variantName ? ` (${variantName})` : ""} added`);
    resetExpansion();
  };

  const addWithoutExtras = (item: MenuItemRecord) => {
    const hasVariants = item.variants && item.variants.length > 0;
    if (hasVariants && !selectedVariant) { toast.error("Please select a size first"); return; }

    const basePrice   = selectedVariant ? selectedVariant.price : dineInPrice(item);
    const variantName = selectedVariant?.name;
    const cartKey     = `${item.id}-${variantName ?? "base"}-no-extras`;

    setCartItems((prev) => {
      const ex = prev.find((c) => c.id === cartKey);
      if (ex) return prev.map((c) => c.id === cartKey ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { id: cartKey, menuItemId: item.id, variantId: selectedVariant?.id ?? null, cookingTime: item.cookingTime ?? 0, name: variantName ? `${item.name} (${variantName})` : item.name, price: basePrice, qty: 1, variant: variantName }];
    });
    toast.success(`${item.name} added`);
    resetExpansion();
  };

  // ── Place order ──

  const getGuestsCount = (t: TableRecord) => {
    if (!t.currentOrderId) return t.capacity;
    const parts = t.currentOrderId.split(":");
    return parts[1] && !isNaN(Number(parts[1])) ? Number(parts[1]) : t.capacity;
  };

  const handlePlaceOrderClick = () => {
    if (selectedTable && selectedTable.status !== "occupied") {
      setGuestsCount(selectedTable.capacity);
      setGuestsActionType("place-order");
      setShowGuestsDialog(true);
    } else {
      placeOrder(null);
    }
  };

  const handleStartSittingClick = () => {
    if (!selectedTable) return;
    setGuestsCount(selectedTable.capacity);
    setGuestsActionType("start-sitting");
    setShowGuestsDialog(true);
  };

  const confirmGuestsCount = async () => {
    setShowGuestsDialog(false);
    const targetResId = selectedReservationForSitting || activeReservationForTable?.id;
    const targetRes = reservations.find(r => r.id === targetResId) || activeReservationForTable;

    if (targetRes && targetRes.preOrderItems && targetRes.preOrderItems.length > 0 && targetRes.status !== "completed") {
      try {
        const createdOrder = await reservationService.convertToOrder(targetRes.id);
        toast.success(`Pre-order food sent to kitchen! Active Order #${createdOrder.orderNumber}`);
        await loadOrders();
        await loadReservations();
        await loadTables();
        setSelectedReservationForSitting(null);
        return;
      } catch (err) {
        console.error("Error converting pre-order items to order", err);
      }
    }

    if (selectedReservationForSitting) {
      try {
        await reservationService.update(selectedReservationForSitting, { status: "seated" });
        toast.success("Reservation linked & marked as seated!");
        await loadReservations();
      } catch (err) {
        console.error("Failed linking reservation", err);
      }
    }
    if (guestsActionType === "start-sitting") {
      await startSitting(guestsCount);
    } else if (guestsActionType === "place-order") {
      await placeOrder(guestsCount);
    }
    setSelectedReservationForSitting(null);
  };

  const placeOrder = async (guestsInput?: number | null) => {
    if (cartItems.length === 0 || selectedTableNum === null) return;
    setPlacingOrder(true);
    const subtotal = cartTotal;
    const tax      = Math.round(subtotal * (taxRate / 100));
    const total    = subtotal + tax;
    try {
      await orderService.createOrder({
        type: "Dine In",
        tableNumber: selectedTableNum,
        customerName: selectedCustomerData?.name || "Walk-in",
        phone: selectedCustomerData?.phone || undefined,
        subtotal, discount: 0, tax, total,
        advancePayment: currentAdvancePayment > 0 ? currentAdvancePayment : undefined,
        paymentMethod: "Pending",
        orderSource: "waiter",
        items: cartItems.map((i) => ({
          menuItemId: i.menuItemId || null,
          variantId: i.variantId || null,
          cookingTime: i.cookingTime ?? null,
          name: i.name, price: i.price, qty: i.qty, discount: 0, modifiers: i.modifiers ?? [],
        })),
      });
      if (selectedTable && selectedTable.status !== "occupied") {
        const guests = guestsInput || selectedTable.capacity;
        const updated = await tableService.updateTable(selectedTable.id, { 
          status: "occupied", 
          currentOrderId: `${Date.now()}:${guests}` 
        });
        setTables(prev => prev.map(t => t.id === selectedTable.id ? updated : t));
      }
      toast.success("Order sent to kitchen!");
      setCartItems([]);
      setIsOrderingMode(false);
      await loadOrders();
    } catch {
      toast.error("Failed to send order");
    } finally {
      setPlacingOrder(false);
    }
  };

  const startSitting = async (guestsInput: number) => {
    if (!selectedTable) return;
    setStartingSitting(true);
    try {
      const guests = guestsInput || selectedTable.capacity;
      const targetResId = selectedReservationForSitting || activeReservationForTable?.id;
      const targetRes = reservations.find(r => r.id === targetResId) || activeReservationForTable;

      if (targetRes && targetRes.preOrderItems && targetRes.preOrderItems.length > 0 && targetRes.status !== "completed") {
        try {
          const createdOrder = await reservationService.convertToOrder(targetRes.id);
          toast.success(`Pre-order food sent to kitchen! Active Order #${createdOrder.orderNumber}`);
          await loadOrders();
          await loadReservations();
          await loadTables();
          return;
        } catch (err) {
          console.error("Error converting reservation pre-order to active order", err);
        }
      }

      const updated = await tableService.updateTable(selectedTable.id, { 
        status: "occupied", 
        currentOrderId: `${Date.now()}:${guests}` 
      });
      setTables(prev => prev.map(t => t.id === selectedTable.id ? updated : t));
      toast.success(`Table ${selectedTable.number} session started`);
    } catch {
      toast.error("Failed to start session");
    } finally {
      setStartingSitting(false);
    }
  };

  const endSitting = async () => {
    if (!selectedTable || selectedTableNum === null) return;
    if (hasUnpaid) {
      toast.warning("Please settle all active orders before ending the sitting session.");
      return;
    }
    setEndingSitting(true);
    try {
      const uncompletedPaidOrders = activeTableOrders.filter(o => o.status !== "completed" && !isOrderUnpaid(o));
      if (uncompletedPaidOrders.length > 0) {
        await Promise.all(
          uncompletedPaidOrders.map(o => orderService.updateOrderStatus(o.id, "completed").catch(() => {}))
        );
      }

      if (activeReservationForTable && activeReservationForTable.status !== "completed") {
        await reservationService.update(activeReservationForTable.id, { status: "completed" }).catch(() => {});
      }

      await tableService.updateTable(selectedTable.id, { status: "available", currentOrderId: null });
      setTables(prev => prev.map(t => t.id === selectedTable.id ? { ...t, status: "available", currentOrderId: null } : t));
      setBillReqSet((p) => { const n = new Set(p); n.delete(selectedTableNum); return n; });
      if (selectedTableNum !== null) {
        const tNumStr = String(selectedTableNum);
        setTableCustomerMap(prev => {
          const updated = { ...prev };
          delete updated[tNumStr];
          localStorage.setItem("ovenisto_table_customers", JSON.stringify(updated));
          return updated;
        });
      }
      toast.success(`Table ${selectedTable.number} session ended`);
      setSelectedTableId(null);
      setCartItems([]);
      await loadOrders();
      await loadReservations();
    } catch {
      toast.error("Failed to end session");
    } finally {
      setEndingSitting(false);
    }
  };

  const settleBilling = async (paymentMethod: string) => {
    if (!selectedTable || selectedTableNum === null) return;
    setSettlingBillingState(true);
    try {
      if (activeReservationForTable && activeReservationForTable.status !== "completed") {
        await reservationService.update(activeReservationForTable.id, { status: "completed" }).catch(() => {});
      }
      const unpaidOrders = activeTableOrders.filter(isOrderUnpaid);
      if (unpaidOrders.length > 0) {
        await Promise.all(
          unpaidOrders.map((o) =>
            orderService.updateOrderStatus(o.id, "completed")
          )
        );
        await Promise.all(
          unpaidOrders.map((o) =>
            orderService.updateOrder(o.id, { paymentMethod })
          )
        );
        await loadOrders();
        await loadReservations();
      }
      setBillReqSet((p) => { const n = new Set(p); n.delete(selectedTableNum); return n; });
      if (selectedTableNum !== null) {
        const tNumStr = String(selectedTableNum);
        setTableCustomerMap(prev => {
          const updated = { ...prev };
          delete updated[tNumStr];
          localStorage.setItem("ovenisto_table_customers", JSON.stringify(updated));
          return updated;
        });
      }
      toast.success(`Table ${selectedTable.number} settled via ${paymentMethod}`);
      setShowBillDialog(false);
      setShowPayBillDialog(false);
    } catch {
      toast.error("Failed to settle billing");
    } finally {
      setSettlingBillingState(false);
    }
  };

  const moveTableSession = async (targetTableId: string) => {
    const targetTable = tables.find(t => t.id === targetTableId);
    if (!selectedTable || !targetTable) return;
    setMovingTable(true);
    try {
      if (activeTableOrders.length > 0) {
        await Promise.all(
          activeTableOrders.map((o) =>
            orderService.updateOrder(o.id, { tableNumber: Number(targetTable.number) })
          )
        );
        await loadOrders();
      }
      await Promise.all([
        tableService.updateTable(selectedTable.id, { status: "available", currentOrderId: null }),
        tableService.updateTable(targetTable.id, { status: "occupied", currentOrderId: selectedTable.currentOrderId })
      ]);
      setTables(prev => prev.map(t => 
        t.id === selectedTable.id ? { ...t, status: "available", currentOrderId: null } :
        t.id === targetTable.id ? { ...t, status: "occupied", currentOrderId: selectedTable.currentOrderId } : t
      ));
      if (billReqSet.has(Number(selectedTable.number))) {
        setBillReqSet(p => {
          const n = new Set(p);
          n.delete(Number(selectedTable.number));
          n.add(Number(targetTable.number));
          return n;
        });
      }
      if (selectedTableNum !== null) {
        const fromStr = String(selectedTableNum);
        const toStr = String(targetTable.number);
        setTableCustomerMap(prev => {
          const updated = { ...prev };
          if (updated[fromStr]) {
            updated[toStr] = updated[fromStr];
            delete updated[fromStr];
          }
          localStorage.setItem("ovenisto_table_customers", JSON.stringify(updated));
          return updated;
        });
      }
      toast.success(`Moved sitting session to Table ${targetTable.number}`);
      setSelectedTableId(targetTable.id);
      setShowMoveDialog(false);
    } catch {
      toast.error("Failed to move table session");
    } finally {
      setMovingTable(false);
    }
  };

  const printActiveBill = () => {
    if (!selectedTable || activeTableOrders.length === 0) return;
    const subtotal = activeTableOrders.reduce((s, o) => s + Number(o.subtotal), 0);
    const taxValue = Math.round(subtotal * (taxRate / 100));
    const total    = subtotal + taxValue;

    const custName = selectedCustomerData?.name 
      || activeTableOrders.find(o => o.customerName && o.customerName !== "Walk-in")?.customerName 
      || "Walk-in";
    const custPhone = selectedCustomerData?.phone 
      || activeTableOrders.find(o => o.phone)?.phone 
      || "";

    const win = window.open("", "_blank");
    if (!win) return;
    
    let itemsHtml = "";
    activeTableOrders.forEach((o) => {
      o.items.forEach((item) => {
        const itemTotal = item.price * item.qty;
        itemsHtml += `
          <tr style="font-size: 11px;">
            <td style="padding: 4px 0; vertical-align: top; max-width: 130px; word-wrap: break-word;">
              ${item.name}
              ${item.modifiers && item.modifiers.length > 0 ? `<div style="font-size: 9px; color: #555; padding-left: 5px;">+ ${item.modifiers.join(', ')}</div>` : ''}
            </td>
            <td style="padding: 4px 0; text-align: center; vertical-align: top;">${item.qty}</td>
            <td style="padding: 4px 0; text-align: right; vertical-align: top;">${item.price.toLocaleString()}</td>
            <td style="padding: 4px 0; text-align: right; vertical-align: top;">${itemTotal.toLocaleString()}</td>
          </tr>
        `;
      });
    });

    win.document.write(`
      <html>
        <head>
          <title>Receipt - Table ${selectedTable.number}</title>
          <style>
            body { font-family: 'Courier New', Courier, monospace; padding: 20px; width: 280px; margin: auto; color: #000; }
            .center { text-align: center; }
            .divider { border-bottom: 1px dashed #000; margin: 10px 0; }
            .header-logo { font-size: 20px; font-weight: bold; margin-bottom: 2px; }
            .header-subtitle { font-size: 11px; margin-bottom: 5px; }
            .receipt-info { font-size: 11px; margin-bottom: 10px; }
            @media print { .no-print { display: none; } }
          </style>
        </head>
        <body onload="window.print()">
          <div class="center">
            <div class="header-logo">OVENISTO</div>
            <div class="header-subtitle">
              ${settings.restaurantName || "Ovenisto Flame-Kissed Flavor"}<br/>
              ${settings.address || "Islamabad Branch"}<br/>
              Tel: ${settings.phone || "+92 51 111 222 333"}
            </div>
          </div>
          
          <div class="divider"></div>
          
          <div class="receipt-info">
            <strong>Table:</strong> ${selectedTable.number}<br/>
            <strong>Date:</strong> ${new Date().toLocaleDateString()}<br/>
            <strong>Time:</strong> ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}<br/>
            <strong>Server:</strong> ${user?.name || "Unknown"} (${user?.role || "Waiter"})<br/>
            <strong>Customer:</strong> ${custName}${custPhone ? `<br/><strong>Phone:</strong> ${custPhone}` : ''}
          </div>
          
          <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; text-align: left;">
            <thead>
              <tr style="border-bottom: 1px dashed #000; border-top: 1px dashed #000;">
                <th style="padding: 4px 0;">Item</th>
                <th style="padding: 4px 0; text-align: center; width: 30px;">Qty</th>
                <th style="padding: 4px 0; text-align: right; width: 50px;">Price</th>
                <th style="padding: 4px 0; text-align: right; width: 60px;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
          
          <div class="divider"></div>
          
          <div style="font-size: 11px; line-height: 1.6;">
            <div style="display: flex; justify-content: space-between;">
              <span>Subtotal</span>
              <span>${currency} ${subtotal.toLocaleString()}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span>GST ${taxRate}%</span>
              <span>${currency} ${taxValue.toLocaleString()}</span>
            </div>
            <div class="divider"></div>
            <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 11px;">
              <span>Grand Total</span>
              <span>${currency} ${total.toLocaleString()}</span>
            </div>
            ${currentAdvancePayment > 0 ? `
              <div style="display: flex; justify-content: space-between; font-weight: bold; color: #059669; margin-top: 3px;">
                <span>Advance Paid Credit</span>
                <span>- ${currency} ${currentAdvancePayment.toLocaleString()}</span>
              </div>
              <div class="divider"></div>
              <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 12px;">
                <span>Net Payable</span>
                <span>${currency} ${Math.max(0, total - currentAdvancePayment).toLocaleString()}</span>
              </div>
            ` : ''}
          </div>
          
          <div class="divider"></div>
          
          <div class="center" style="font-size: 10px; margin-top: 15px;">
            Thank you for dining with us!<br/>
            Powered by Ovenisto POS
          </div>
          
          <div style="margin-top: 20px;" class="no-print">
            <button onclick="window.print()" style="width: 100%; padding: 8px; font-weight: bold; font-family: monospace; cursor: pointer;">Print Receipt</button>
          </div>
        </body>
      </html>
    `);
    win.document.close();
  };

  const [searchQuery, setSearchQuery] = useState("");

  const getElapsed = (dateStr?: string | null) => {
    if (!dateStr) return "";
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    return diff < 60 ? `${diff}m` : `${Math.floor(diff / 60)}h ${diff % 60}m`;
  };

  const handleTableClick = (t: TableRecord) => {
    setSelectedTableId(t.id);
    setCartItems([]);
    resetExpansion();
    setMenuCategory("All");
    setIsOrderingMode(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header & Stats Cards Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 w-full">
        <div className="shrink-0">
          <PageHeader
            icon={<UtensilsCrossed className="h-5 w-5" />}
            title="Waiter Panel"
            subtitle="Manage tables and take orders"
          />
        </div>
        {isOrderingMode ? (
          <Button variant="outline" onClick={() => { setIsOrderingMode(false); setCartItems([]); }} className="border-zinc-800 bg-zinc-950/40 hover:bg-zinc-900 rounded-xl font-bold gap-2 shrink-0">
            <ArrowLeft className="h-4 w-4" /> Back to Floor Plan
          </Button>
        ) : (
          <div className="flex justify-center flex-1 max-w-4xl">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full">
              {[
                { key: "available",    count: stats.available,        label: "Available",          color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/30", Icon: CircleDot },
                { key: "occupied",     count: stats.occupied,         label: "Occupied",           color: "text-orange-500",  bg: "bg-orange-500/10",  border: "border-orange-500/30",  Icon: Users },
                { key: "bill",         count: stats.bill,             label: "Bill Req.",          color: "text-red-500",     bg: "bg-red-500/10",     border: "border-red-500/30",     Icon: Receipt },
                { key: "reservations", count: todayReservationsCount, label: "Today Reservations", color: "text-amber-500",   bg: "bg-amber-500/10",   border: "border-amber-500/30",   Icon: BookOpen },
              ].map(({ key, count, label, color, bg, border, Icon }) => {
                const isActive = statusFilter === key;
                return (
                  <Card
                    key={key}
                    onClick={() => {
                      if (key === "reservations") {
                        setShowTodayReservationsDialog(true);
                        return;
                      }
                      setStatusFilter(prev => prev === key ? "all" : (key as any));
                    }}
                    className={cn(
                      "border bg-white dark:bg-zinc-900/40 rounded-xl shadow-xs cursor-pointer transition-all duration-200 hover:scale-[1.02] select-none",
                      isActive ? `ring-2 ring-primary ${border}` : "border-zinc-200 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700"
                    )}
                  >
                    <CardContent className="p-3 flex items-center gap-2.5">
                      <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", bg)}>
                        <Icon className={cn("h-4 w-4", color)} />
                      </div>
                      <div className="min-w-0">
                        <p className={cn("text-xl font-black tracking-tight leading-none", color)}>{count}</p>
                        <p className="text-[11px] text-muted-foreground font-semibold truncate mt-0.5">{label}</p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Self-Order Pending Requests Banner ── */}
      {!isOrderingMode && pendingSelfOrders.length > 0 && (
        <Card className="border-warning/40 bg-warning/5 rounded-xl overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-lg bg-warning/15 flex items-center justify-center">
                <Bell className="h-4 w-4 text-warning" />
              </div>
              <span className="font-semibold text-sm text-warning">
                {pendingSelfOrders.length} Customer Request{pendingSelfOrders.length > 1 ? "s" : ""} Waiting
              </span>
            </div>
            <div className="space-y-2">
              {pendingSelfOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between bg-card rounded-xl px-4 py-3 border border-border/50 gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold">Table {order.tableNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {order.items.length} item{order.items.length !== 1 ? "s" : ""} &mdash; {currency} {order.total.toLocaleString()}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      {order.items.map((i) => `${i.name} ×${i.qty}`).join(", ")}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="gradient-primary text-primary-foreground text-xs rounded-lg shrink-0 min-h-[34px] px-4"
                    disabled={acceptingId === order.id}
                    onClick={() => acceptSelfOrder(order)}
                  >
                    {acceptingId === order.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <><Check className="h-3.5 w-3.5 mr-1" />Accept</>
                    }
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Dual Pane Layout Container */}
      <div className="flex flex-col md:flex-row gap-6 min-h-[calc(100vh-220px)] items-stretch">
        
        {/* LEFT SIDEBAR: Selected table actions & session info */}
        <div className={cn(
          "w-full md:w-80 lg:w-96 flex flex-col shrink-0 bg-zinc-50 border-zinc-200 dark:bg-zinc-900/20 dark:border-zinc-800/80 rounded-2xl p-5 space-y-5 select-none transition-all",
          !selectedTable && "hidden md:flex"
        )}>
          {!selectedTable ? (
            <div className="h-64 lg:h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
              <UtensilsCrossed className="h-10 w-10 text-muted-foreground/30 animate-pulse" />
              <h3 className="font-bold text-sm text-foreground">No Table Selected</h3>
              <p className="text-xs text-muted-foreground max-w-[240px]">
                Select any table from the floor plan to start a sitting session or take orders.
              </p>
            </div>
          ) : (
            <div className="flex flex-col h-full justify-between gap-6">
              
              {/* Header info */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3.5">
                  <div className="space-y-0.5">
                    <h3 className="font-extrabold text-base text-foreground tracking-tight">Table {selectedTable.number}</h3>
                    <p className="text-[10px] text-muted-foreground/60 font-semibold uppercase tracking-wider">{selectedTable.floor || "Main Hall"}</p>
                    {tableStatus !== "available" && selectedTable.occupiedByName && (
                      <p className="text-[11px] text-primary/85 font-semibold mt-1">
                        {selectedTable.occupiedByRole} : {selectedTable.occupiedByName}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className={cn(
                      "text-[9px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider leading-none border-none",
                      tableStatus === "available" && "bg-success/10 text-success hover:bg-success/10",
                      tableStatus === "occupied" && "bg-destructive/10 text-destructive hover:bg-destructive/10",
                      tableStatus === "bill-requested" && "bg-destructive/20 text-destructive hover:bg-destructive/20 animate-pulse",
                      tableStatus === "reserved" && "bg-warning/10 text-warning hover:bg-warning/10",
                      tableStatus === "maintenance" && "bg-muted text-muted-foreground hover:bg-muted",
                    )}>
                      {tableStatus === "bill-requested" ? "Bill Req" : tableStatus === "available" ? "Free" : tableStatus}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full md:hidden flex items-center justify-center border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/20"
                      onClick={() => setSelectedTableId(null)}
                    >
                      <X className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>

                {/* Customer Association */}
                <div className="bg-zinc-100/70 dark:bg-zinc-950/30 rounded-xl p-3 border border-zinc-200 dark:border-zinc-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Customer Association</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Select value={selectedCustomerId || "walk-in"} onValueChange={(val) => handleSelectCustomerForTable(val === "walk-in" ? "" : val)}>
                      <SelectTrigger className="flex-1 h-8 text-xs font-semibold rounded-lg bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
                        <User className="h-3.5 w-3.5 mr-1.5 shrink-0 text-muted-foreground" />
                        <SelectValue placeholder="Walk-in Customer" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="walk-in">Walk-in Customer</SelectItem>
                        {customers.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name} {c.phone ? `(${c.phone})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="icon" className="h-8 w-8 shrink-0 rounded-lg bg-white dark:bg-zinc-900" onClick={() => setShowCustomerAddDialog(true)} title="Add New Customer">
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                    {selectedCustomerId && (
                      <Button variant="outline" size="icon" className="h-8 w-8 shrink-0 rounded-lg bg-white dark:bg-zinc-900" onClick={() => setShowCustomerHistoryDialog(true)} title="View Customer History">
                        <History className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  {selectedCustomerData && (
                    <div className="flex items-center gap-1.5 text-[10px] pt-0.5">
                      <span className="text-muted-foreground truncate">{selectedCustomerData.phone || "No phone"} {selectedCustomerData.address ? `• ${selectedCustomerData.address}` : ""}</span>
                      {selectedCustomerData.customerType === "corporate" && (
                        <Badge variant="secondary" className="text-[9px] bg-info/10 text-info gap-0.5 shrink-0"><Building2 className="h-2.5 w-2.5" />Corp</Badge>
                      )}
                      {selectedCustomerData.customerType === "vip" && (
                        <Badge variant="secondary" className="text-[9px] bg-warning/10 text-warning gap-0.5 shrink-0"><Crown className="h-2.5 w-2.5" />VIP</Badge>
                      )}
                      {selectedCustomerData.outstandingDue > 0 && (
                        <Badge variant="secondary" className="text-[9px] bg-destructive/10 text-destructive shrink-0">Due: {currency} {selectedCustomerData.outstandingDue.toLocaleString()}</Badge>
                      )}
                    </div>
                  )}
                </div>

                {/* Seating Details */}
                {tableStatus === "available" ? (
                  <div className="space-y-4 py-2">
                    <div className="bg-zinc-100/50 dark:bg-zinc-950/20 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800/80 text-center space-y-1">
                      <p className="text-xs text-muted-foreground">This table is currently free.</p>
                      <p className="text-xs font-bold text-foreground">Capacity: {selectedTable.capacity} Seats</p>
                    </div>
                    
                    <div className="flex flex-col gap-2.5">
                      <Button 
                        onClick={handleStartSittingClick} 
                        disabled={startingSitting} 
                        className="gradient-primary text-primary-foreground font-bold rounded-xl h-11 w-full flex items-center justify-center gap-2 shadow-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70"
                      >
                        {startingSitting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                        Start Sitting
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Seating stats */}
                    <div className="bg-zinc-100/50 dark:bg-zinc-950/25 rounded-xl p-3 border border-zinc-200 dark:border-zinc-800/80 space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Active Session:</span>
                        <strong className="text-foreground">#{activeTableOrders[0]?.orderNumber || "Session Active"}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Guests Count:</span>
                        <strong className="text-foreground">{getGuestsCount(selectedTable)} Pax</strong>
                      </div>
                      {activeTableOrders.length > 0 && oldest && (
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Time elapsed:</span>
                          <strong className="text-primary flex items-center gap-1 font-bold">
                            <Clock className="h-3.5 w-3.5" /> {getElapsed(oldest)}
                          </strong>
                        </div>
                      )}
                    </div>

                    {/* Active Orders List */}
                    {activeTableOrders.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Active Orders ({activeTableOrders.length})</p>
                        <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                          {activeTableOrders.map((o) => {
                            const maxCookingTime = o.items.reduce((max, item) => Math.max(max, item.cookingTime || 0), 0);
                            const cookLimitMinutes = maxCookingTime > 0 ? maxCookingTime : 15;
                            
                            // Elapsed wait time (since order was created) - shown for pending orders
                            const elapsedMs = clock.getTime() - new Date(o.createdAt).getTime();
                            const elapsedSec = Math.floor(elapsedMs / 1000);
                            const elapsedFormatted = elapsedSec < 60 
                              ? `${elapsedSec}s` 
                              : `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s`;

                            // Remaining cooking time (since cooking started, i.e., order was updated to preparing) - shown for preparing orders
                            const prepStart = o.status === "preparing" && o.updatedAt ? new Date(o.updatedAt).getTime() : new Date(o.createdAt).getTime();
                            const elapsedPrepMs = clock.getTime() - prepStart;
                            const elapsedPrepSec = Math.floor(elapsedPrepMs / 1000);
                            const remainingSec = Math.max(0, cookLimitMinutes * 60 - elapsedPrepSec);
                            const countdownText = remainingSec === 0 ? "Overdue" : `${Math.floor(remainingSec / 60)}:${String(remainingSec % 60).padStart(2, "0")} left`;

                            return (
                              <div key={o.id} className="bg-zinc-100/50 dark:bg-zinc-950/20 border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-2.5 space-y-1.5 text-xs">
                                <div className="flex justify-between items-center">
                                  <span className="font-bold text-foreground">Order #{o.orderNumber}</span>
                                  <Badge className={cn(
                                    "text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase border-none text-zinc-950",
                                    o.status === "pending" && "bg-amber-500",
                                    o.status === "preparing" && "bg-sky-500",
                                    o.status === "ready" && "bg-green-500 animate-pulse",
                                  )}>
                                    {o.status}
                                  </Badge>
                                </div>
                                
                                {o.status === "pending" && (
                                  <div className="flex justify-between text-[11px] text-muted-foreground">
                                    <span>Wait Time:</span>
                                    <span className="font-semibold text-foreground">{elapsedFormatted}</span>
                                  </div>
                                )}

                                {o.status === "preparing" && (
                                  <div className="flex justify-between text-[11px] text-muted-foreground">
                                    <span>Remaining:</span>
                                    <span className={cn("font-semibold", remainingSec < 120 ? "text-red-500" : "text-emerald-500")}>
                                      {countdownText}
                                    </span>
                                  </div>
                                )}
                                
                                {o.status === "ready" && (
                                  <p className="text-[11px] font-bold text-green-500 flex items-center gap-1">
                                    <Check className="h-3 w-3" /> Ready to serve
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {currentAdvancePayment > 0 && !isSessionPaid && (() => {
                      const grandTotal = activeTableOrders.reduce((s, o) => s + Number(o.total), 0);
                      const netDue = Math.max(0, grandTotal - currentAdvancePayment);
                      return (
                        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-xl p-3 text-center text-xs font-bold flex flex-col items-center justify-center gap-1 select-none mb-2">
                          <div className="flex items-center gap-1.5 font-extrabold">
                            <CreditCard className="h-4 w-4" /> Advance Paid: {currency} {currentAdvancePayment.toLocaleString()}
                          </div>
                          <span className="text-[11px] font-medium text-amber-400/90">
                            Remaining Due: {currency} {netDue.toLocaleString()} (Pay bill when food ready)
                          </span>
                        </div>
                      );
                    })()}

                    {isSessionPaid && (() => {
                      const hasUnservedFood = activeTableOrders.some(o => o.status === "pending" || o.status === "preparing");
                      return (
                        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-xl p-3 text-center text-xs font-extrabold flex items-center justify-center gap-1.5 select-none animate-pulse mb-2">
                          <Check className="h-4 w-4" /> {hasUnservedFood ? "Billing Paid" : "Billing Paid — Awaiting End Sitting"}
                        </div>
                      );
                    })()}

                    {/* Actions Grid */}
                    <div className="grid grid-cols-2 gap-2">
                      <Button 
                        onClick={() => setIsOrderingMode(true)} 
                        className="gradient-primary text-primary-foreground font-bold rounded-xl h-10 w-full flex items-center justify-center gap-1.5 shadow-sm text-xs transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                      >
                        <ShoppingCart className="h-3.5 w-3.5" /> Place Order
                      </Button>
                      <Button 
                        onClick={() => { setShowPayBillDialog(true); setIsSplitPayment(false); }} 
                        disabled={!canPayBill || settlingBillingState} 
                        className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl h-10 w-full flex items-center justify-center gap-1.5 shadow-[0_4px_12px_rgba(16,185,129,0.25)] hover:shadow-[0_4px_16px_rgba(16,185,129,0.4)] transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] text-xs border-none"
                      >
                        {settlingBillingState ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CreditCard className="h-3.5 w-3.5" />
                        )}
                        Pay Bill
                      </Button>
                      <Button 
                        onClick={() => setShowOrdersDialog(true)} 
                        variant="outline" 
                        className="font-bold border-zinc-800 bg-zinc-950/30 hover:bg-zinc-900/60 rounded-xl h-10 w-full flex items-center justify-center gap-1.5 text-xs transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                      >
                        <Eye className="h-3.5 w-3.5" /> View Order
                      </Button>
                      <Button 
                        onClick={() => setShowBillDialog(true)} 
                        disabled={activeTableOrders.length === 0} 
                        variant="outline" 
                        className="font-bold border-zinc-800 bg-zinc-950/30 hover:bg-zinc-900/60 rounded-xl h-10 w-full flex items-center justify-center gap-1.5 text-xs transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                      >
                        <Receipt className="h-3.5 w-3.5" /> View Bill
                      </Button>
                      <Button 
                        onClick={() => setShowMoveDialog(true)} 
                        disabled={movingTable}
                        variant="outline" 
                        className="font-bold border-zinc-800 bg-zinc-950/30 hover:bg-zinc-900/60 rounded-xl h-10 w-full flex items-center justify-center gap-1.5 text-xs transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                      >
                        {movingTable ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CornerUpRight className="h-3.5 w-3.5" />
                        )}
                        Move
                      </Button>
                      <Button 
                        onClick={endSitting} 
                        disabled={endingSitting}
                        variant="destructive" 
                        className="font-bold rounded-xl h-10 w-full flex items-center justify-center gap-1.5 shadow-sm text-xs transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                      >
                        {endingSitting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Power className="h-3.5 w-3.5" />
                        )}
                        End Sitting
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Financial Summary */}
              {tableStatus !== "available" && activeTableOrders.length > 0 && (() => {
                const subtotalSum = activeTableOrders.reduce((s, o) => s + Number(o.subtotal), 0);
                const taxSum = activeTableOrders.reduce((s, o) => s + Number(o.tax), 0);
                const totalSum = activeTableOrders.reduce((s, o) => s + Number(o.total), 0);
                const advanceSum = activeTableOrders.reduce((s, o) => s + Number(o.advancePayment || 0), 0);
                const netPayable = Math.max(0, totalSum - advanceSum);

                return (
                  <div className="border-t border-zinc-800 pt-4 space-y-2 select-none mt-auto">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Price</span>
                      <span>{currency} {subtotalSum.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Tax ({taxRate}%)</span>
                      <span>{currency} {taxSum.toLocaleString()}</span>
                    </div>
                    {advanceSum > 0 && (
                      <div className="flex justify-between text-xs text-emerald-400 font-semibold">
                        <span>Advance Paid Credit</span>
                        <span>- {currency} {advanceSum.toLocaleString()}</span>
                      </div>
                    )}
                    <Separator className="bg-zinc-800 my-1" />
                    <div className="flex justify-between text-sm font-extrabold text-foreground">
                      <span>{advanceSum > 0 ? "Net Amount Due" : "Grand Total"}</span>
                      <span className="text-primary">
                        {currency} {netPayable.toLocaleString()}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* RIGHT AREA: Floor map grid OR Menu Ordering View */}
        <div className="flex-grow flex flex-col overflow-y-auto pt-2 px-2 pb-6">
          {!isOrderingMode ? (
            /* State A: Floor Map view */
            <div className="space-y-4 flex-grow flex flex-col justify-between">
              <div className="space-y-4">
                {/* Floor Filter Bar */}
                {floorsList.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 px-1 select-none">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider mr-1 shrink-0">Floor:</span>
                    <button
                      onClick={() => setFloorFilter("all")}
                      className={cn(
                        "px-3 py-1 rounded-full text-xs font-bold transition-all shrink-0 border",
                        floorFilter === "all"
                          ? "bg-primary text-primary-foreground border-primary shadow-xs"
                          : "bg-white dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      All Floors
                    </button>
                    {floorsList.map((fl) => (
                      <button
                        key={fl}
                        onClick={() => setFloorFilter(fl)}
                        className={cn(
                          "px-3 py-1 rounded-full text-xs font-bold transition-all shrink-0 border",
                          floorFilter === fl
                            ? "bg-primary text-primary-foreground border-primary shadow-xs"
                            : "bg-white dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800 text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {fl}
                      </button>
                    ))}
                  </div>
                )}

                {/* Table Grid */}
                {filteredTables.length === 0 ? (
                  <Card className="rounded-xl border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                      <UtensilsCrossed className="h-10 w-10 opacity-30" />
                      <p className="text-sm font-medium">No tables found</p>
                      <p className="text-xs">Try clearing the status filter or configure tables in Table Layout</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3.5 pt-1">
                    {filteredTables.map((t) => {
                      const tNum    = Number(t.number);
                      const status  = getTableStatus(tNum);
                      const cfg     = statusConfig[status];
                      const tOrders = getTableOrders(tNum);
                      const isReservedToday = reservedTableNums.has(tNum) || t.status === "reserved";
                      
                      const oldest = tOrders.length > 0 
                        ? tOrders[tOrders.length - 1].createdAt 
                        : (() => {
                            if (!t.currentOrderId) return null;
                            const parts = t.currentOrderId.split(":");
                            const ts = Number(parts[0]);
                            return !isNaN(ts) ? new Date(ts).toISOString() : null;
                          })();

                      const statusDotColor =
                        status === "available" ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" :
                        status === "occupied" ? "bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]" :
                        status === "bill-requested" ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" :
                        "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]";

                      const statusBorderClass =
                        status === "available" ? "border-emerald-500/50" :
                        status === "occupied" ? "border-orange-500/50" :
                        status === "bill-requested" ? "border-red-500/80" :
                        "border-amber-500/50";

                      const cardStatusClass =
                        status === "bill-requested"
                          ? "border-red-500/80 bg-red-950/20 shadow-[0_0_12px_rgba(239,68,68,0.25)] animate-pulse border-2 ring-1 ring-red-500/40"
                          : status === "occupied"
                          ? "border-orange-500/50 bg-orange-950/10 hover:border-orange-400 dark:bg-orange-950/20"
                          : "border-emerald-500/50 bg-emerald-950/10 hover:border-emerald-400 dark:bg-emerald-950/20";

                      const chairBgClass =
                        status === "available" ? "bg-emerald-500/60" :
                        status === "occupied" ? "bg-orange-500/60" :
                        status === "bill-requested" ? "bg-red-500 animate-pulse" :
                        "bg-emerald-500/60";

                      const isOccupiedState = status === "occupied" || status === "bill-requested";
                      const elapsedStr = isOccupiedState && oldest ? getElapsed(oldest) : "";
                      const centerText = isOccupiedState ? (elapsedStr || "") : "";
                      const centerTextClass = "font-black text-xs text-primary tracking-tight leading-none text-center px-1";

                      return (
                        <div key={t.id} className="p-1">
                          <Card
                            onClick={() => handleTableClick(t)}
                            className={cn(
                              "shadow-md bg-white dark:bg-zinc-900/40 border rounded-2xl flex flex-col justify-between p-3 h-[152px] w-full cursor-pointer transition-all duration-300 relative hover:scale-[1.02]",
                              cardStatusClass,
                              selectedTableId === t.id && "ring-2 ring-primary ring-offset-2 dark:ring-offset-zinc-950 shadow-lg"
                            )}
                          >
                            {/* Top Bar: Table Label & Pulse Status */}
                            <div className="flex items-center justify-between w-full select-none shrink-0">
                              <div className="flex items-center gap-2">
                                <span className={cn(
                                  "h-2.5 w-2.5 rounded-full",
                                  status === "bill-requested" && "animate-ping",
                                  statusDotColor
                                )} />
                                <span className="text-sm font-black uppercase tracking-wider text-foreground">Table {t.number}</span>
                              </div>
                            </div>

                            {/* Middle Area: Graphical Table Blueprint Diagram */}
                            <div className="flex-grow flex items-center justify-center relative my-1 w-full select-none">
                              {t.shape === "round" && (
                                <div className={cn("h-16 w-16 rounded-full border-2 flex items-center justify-center relative bg-zinc-50 dark:bg-zinc-950/40", statusBorderClass)}>
                                  <span className={centerTextClass}>{centerText}</span>
                                  {renderMiniChairs("round", t.capacity, chairBgClass)}
                                </div>
                              )}
                              {t.shape === "square" && (
                                <div className={cn("h-14 w-14 rounded-xl border-2 flex items-center justify-center relative bg-zinc-50 dark:bg-zinc-950/40", statusBorderClass)}>
                                  <span className={centerTextClass}>{centerText}</span>
                                  {renderMiniChairs("square", t.capacity, chairBgClass)}
                                </div>
                              )}
                              {t.shape === "rectangle" && (
                                <div className={cn("h-12 w-20 rounded-xl border-2 flex items-center justify-center relative bg-zinc-50 dark:bg-zinc-950/40", statusBorderClass)}>
                                  <span className={centerTextClass}>{centerText}</span>
                                  {renderMiniChairs("rectangle", t.capacity, chairBgClass)}
                                </div>
                              )}
                            </div>

                            {/* Bottom Bar: Area Name and Customer Count */}
                            <div className="flex items-center justify-between w-full mt-1 shrink-0 select-none gap-1">
                              <span className="text-xs text-muted-foreground font-extrabold tracking-wide truncate flex-1 min-w-0 pr-1" title={t.floor || "Main Hall"}>
                                {t.floor || "Main Hall"}
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                <div className="flex items-center gap-1 text-[11px] font-black text-foreground bg-zinc-100 dark:bg-zinc-800/90 px-2 py-0.5 rounded-full border border-zinc-200 dark:border-zinc-700/80 shadow-xs">
                                  <Users className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span>{isOccupiedState ? getGuestsCount(t) : t.capacity}</span>
                                </div>
                              </div>
                            </div>
                          </Card>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* State B: Menu Ordering POS Layout */
            <div className="flex flex-col-reverse md:flex-row gap-6 items-stretch w-full">
              
              {/* Cart List Column */}
              <div className="w-full md:w-80 shrink-0 flex flex-col justify-between bg-zinc-50 border-zinc-200 dark:bg-zinc-900/40 dark:border-zinc-800/80 rounded-2xl p-4 space-y-4">
                <div className="space-y-4 flex-grow overflow-y-auto">
                  <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-850 pb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <ShoppingCart className="h-4 w-4" /> Cart Selection
                    </span>
                    {cartItems.length > 0 && (
                      <button onClick={() => setCartItems([])} className="text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors">
                        <Trash2 className="h-3 w-3" /> Clear
                      </button>
                    )}
                  </div>

                  {/* Cart Item rows */}
                  <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-0.5">
                    {cartItems.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 px-3 py-2.5 bg-zinc-100/50 dark:bg-zinc-950/20 border border-zinc-200 dark:border-zinc-800/40 rounded-xl">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold truncate text-foreground leading-tight">{item.name}</p>
                          {item.modifiers && item.modifiers.length > 0 && (
                            <p className="text-[9px] text-muted-foreground">+{item.modifiers.join(", ")}</p>
                          )}
                          <p className="text-[11px] text-primary font-bold mt-0.5">{currency} {item.price.toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button variant="outline" size="icon" className="h-6 w-6 rounded border-zinc-200 dark:border-zinc-800" onClick={() => updateQty(item.id, -1)}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-5 text-center text-xs font-bold">{item.qty}</span>
                          <Button variant="outline" size="icon" className="h-6 w-6 rounded border-zinc-200 dark:border-zinc-800" onClick={() => updateQty(item.id, 1)}>
                            <Plus className="h-3 w-3" />
                          </Button>
                          <button onClick={() => removeCartItem(item.id)} className="text-muted-foreground/45 hover:text-destructive p-1 ml-0.5 transition-colors">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {cartItems.length === 0 && (
                      <p className="text-center text-xs text-muted-foreground py-10">Cart is empty</p>
                    )}
                  </div>
                </div>

                {/* Confirm order footer */}
                <div className="border-t border-zinc-200 dark:border-zinc-850 pt-4 space-y-3 shrink-0">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground font-semibold">Total Amount</span>
                    <span className="text-base font-extrabold text-primary">{currency} {cartTotal.toLocaleString()}</span>
                  </div>
                  <Button
                    onClick={handlePlaceOrderClick}
                    disabled={placingOrder || cartItems.length === 0}
                    className="gradient-primary text-primary-foreground font-bold h-11 w-full flex items-center justify-center gap-2 rounded-xl shadow-md text-xs"
                  >
                    {placingOrder ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <><Check className="h-4 w-4" /> Place Order</>
                    )}
                  </Button>
                </div>
              </div>

              {/* Menu Catalog Grid Column */}
              <div className="flex-1 space-y-4">
                
                {/* Search and Category block */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/60" />
                    <Input
                      placeholder="Search food items..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 rounded-xl border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/20 text-foreground"
                    />
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto pb-1 max-w-full">
                    {categoryNames.map((c) => (
                      <button
                        key={c}
                        onClick={() => { setMenuCategory(c); resetExpansion(); }}
                        className={cn(
                          "px-3.5 py-1.5 rounded-full text-[11px] font-semibold transition-all border whitespace-nowrap leading-none h-9",
                          menuCategory === c
                            ? "gradient-primary text-primary-foreground border-transparent shadow-sm"
                            : "bg-card border-zinc-200 dark:border-zinc-800 text-muted-foreground hover:border-zinc-300 dark:hover:border-zinc-700 hover:text-foreground"
                        )}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Items grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 max-h-[480px] overflow-y-auto pr-0.5">
                  {filteredMenu
                    .filter(item => searchQuery === "" || item.name.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map((item) => {
                      const hasVariants  = item.variants && item.variants.length > 0;
                      const itemMods     = resolveModifiers(item);
                      const hasModifiers = itemMods.length > 0;
                      const isExpanded   = expandedItemId === item.id;
                      const baseItemPrice = dineInPrice(item);

                      return (
                        <div key={item.id} className={cn("border rounded-xl overflow-hidden bg-white dark:bg-card transition-all", isExpanded ? "col-span-2 border-primary/45 bg-zinc-100/50 dark:bg-zinc-950/10" : "border-zinc-200 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-sm shadow-sm")}>
                          {/* Item card button */}
                          <button
                            onClick={() => addToOrder(item)}
                            className="w-full text-left flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors group/item"
                          >
                            <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                              {item.image
                                ? <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                                : <div className="h-full w-full gradient-primary flex items-center justify-center text-primary-foreground text-sm font-bold">{item.name.charAt(0)}</div>
                              }
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-foreground leading-tight line-clamp-2 group-hover/item:text-primary transition-colors">{item.name}</p>
                              <p className="text-xs font-bold text-primary mt-0.5">
                                {hasVariants
                                  ? `${currency} ${variantDineInPrice(item.variants[0])}–${variantDineInPrice(item.variants[item.variants.length - 1])}`
                                  : `${currency} ${baseItemPrice.toLocaleString()}`}
                              </p>
                            </div>
                            <div className="shrink-0">
                              {(hasVariants || hasModifiers) ? (
                                <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center border transition-all",
                                  isExpanded ? "gradient-primary text-primary-foreground border-transparent" : "border-zinc-200 dark:border-zinc-800 text-muted-foreground")}>
                                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </div>
                              ) : (
                                <div className="h-7 w-7 rounded-lg flex items-center justify-center border border-zinc-200 dark:border-zinc-800 text-primary hover:bg-primary/5 dark:hover:bg-primary/5 transition-all">
                                  <Plus className="h-4 w-4" />
                                </div>
                              )}
                            </div>
                          </button>

                          {/* Expansion options */}
                          {isExpanded && (
                            <div className="px-3 pb-3 pt-2 border-t border-zinc-200 dark:border-zinc-800/40 bg-zinc-50 dark:bg-zinc-950/20 space-y-3">
                              {hasVariants && (
                                <div>
                                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">Choose Size</p>
                                  <div className="flex gap-1.5 flex-wrap">
                                    {item.variants.map((v) => {
                                      const vPrice = variantDineInPrice(v);
                                      return (
                                        <button
                                          key={v.id}
                                          onClick={() => setSelectedVariant(selectedVariant?.id === v.id ? null : { id: v.id, name: v.name, price: vPrice })}
                                          className={cn(
                                            "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                                            selectedVariant?.id === v.id
                                              ? "gradient-primary text-primary-foreground border-transparent shadow-sm"
                                              : "bg-card border-zinc-200 dark:border-zinc-800 text-foreground hover:border-zinc-300 dark:hover:border-zinc-700"
                                          )}
                                        >
                                          {v.name} · {currency} {vPrice.toLocaleString()}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {hasModifiers && (
                                <div>
                                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">Add Extras</p>
                                  <div className="flex gap-1.5 flex-wrap">
                                    {itemMods.map((mod) => (
                                      <button
                                        key={mod.id}
                                        onClick={() => setSelectedModifiers((prev) =>
                                          prev.includes(mod.id) ? prev.filter((x) => x !== mod.id) : [...prev, mod.id]
                                        )}
                                        className={cn(
                                          "px-2.5 py-1.5 rounded-lg text-xs border transition-all",
                                          selectedModifiers.includes(mod.id)
                                            ? "bg-primary/10 border-primary/50 text-primary font-bold"
                                            : "bg-card border-zinc-200 dark:border-zinc-800 text-muted-foreground hover:border-zinc-300 dark:hover:border-zinc-700 hover:text-foreground"
                                        )}
                                      >
                                        {mod.name}{mod.price > 0 ? ` +${currency}${mod.price}` : ""}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div className="flex gap-2 pt-1">
                                <Button
                                  size="sm"
                                  className="flex-1 gradient-primary text-primary-foreground h-9 text-xs font-semibold rounded-lg"
                                  onClick={() => confirmAddWithOptions(item)}
                                >
                                  <Plus className="h-3.5 w-3.5 mr-1" /> Add to Cart
                                  {selectedVariant && ` · ${currency} ${(selectedVariant.price + selectedModifiers.reduce((s, mId) => s + (itemMods.find((m) => m.id === mId)?.price ?? 0), 0)).toLocaleString()}`}
                                </Button>
                                {hasModifiers && (
                                  <Button size="sm" variant="outline" className="h-9 text-xs rounded-lg border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/30" onClick={() => addWithoutExtras(item)}>
                                    No Extras
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>

            </div>
          )}
        </div>

      </div>


      {/* ── Move Table Session Dialog ── */}
      <Dialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
        <DialogContent className="w-[90vw] max-w-[400px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-center text-lg font-bold">Move Sitting Session</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Target Table</Label>
              <Select value={targetMoveTableId || ""} onValueChange={setTargetMoveTableId}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Choose an available table" />
                </SelectTrigger>
                <SelectContent>
                  {tables
                    .filter(t => t.id !== selectedTableId && getTableStatus(Number(t.number)) === "available")
                    .map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        Table {t.number} ({t.floor || "Main Hall"}, {t.capacity} Seats)
                      </SelectItem>
                    ))
                  }
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowMoveDialog(false)} className="rounded-xl flex-1 border-zinc-800 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]">Cancel</Button>
            <Button 
              disabled={!targetMoveTableId || movingTable}
              onClick={() => targetMoveTableId && moveTableSession(targetMoveTableId)} 
              className="gradient-primary text-primary-foreground font-bold rounded-xl flex-1 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              {movingTable ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Move"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* ── View Orders Dialog ── */}
      <Dialog open={showOrdersDialog} onOpenChange={setShowOrdersDialog}>
        <DialogContent className="w-[90vw] max-w-[500px] rounded-2xl overflow-y-auto max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="text-center text-lg font-bold">Active Orders — Table {selectedTable?.number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {activeTableOrders.map((o) => (
              <div key={o.id} className="border border-zinc-800 rounded-xl bg-zinc-950/20 px-4 py-3 space-y-3">
                <div className="flex justify-between items-center pb-2 border-b border-zinc-800/80">
                  <span className="text-sm font-bold text-foreground">Order {o.orderNumber}</span>
                  <Badge className="bg-primary/20 text-primary border-none rounded-full text-[10px] uppercase font-bold">{o.status}</Badge>
                </div>
                <div className="space-y-2">
                  {o.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-xs text-muted-foreground">
                      <span>{item.name} ×{item.qty}</span>
                      <span>{currency} {(item.price * item.qty).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-xs font-bold pt-2 border-t border-zinc-800/80">
                  <span>Subtotal</span>
                  <span>{currency} {o.subtotal.toLocaleString()}</span>
                </div>
              </div>
            ))}
            {activeTableOrders.length === 0 && (
              <p className="text-center text-xs text-muted-foreground py-6">No active orders</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOrdersDialog(false)} className="rounded-xl w-full border-zinc-200 dark:border-zinc-800">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── View Bill Receipt Preview Dialog ── */}
      <Dialog open={showBillDialog} onOpenChange={setShowBillDialog}>
        <DialogContent className="w-[90vw] max-w-[420px] rounded-2xl bg-background border border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-center text-lg font-bold flex items-center justify-center gap-2">
              <Receipt className="h-5 w-5 text-primary" /> Invoice Preview
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-xs select-none">
            {/* Header info */}
            <div className="text-center space-y-1 py-1">
              <UtensilsCrossed className="h-7 w-7 mx-auto text-primary animate-pulse" />
              <p className="font-extrabold text-base tracking-tight text-foreground">{settings.restaurantName || "OVENISTO"}</p>
              <p className="text-[11px] text-muted-foreground leading-tight">
                {settings.address || "164-J LDA AVENUE-1 Lahore"}<br/>
                Tel: {settings.phone || "0320-111 98 98"}
              </p>
            </div>

            <Separator className="bg-zinc-200 dark:bg-zinc-850" />

            {/* Session meta */}
            <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 bg-zinc-50 dark:bg-zinc-900/40 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800/80 text-muted-foreground">
              <div>Table: <strong className="text-foreground">#{selectedTable?.number}</strong></div>
              <div className="text-right">Server: <strong className="text-foreground">{user?.name || "Waiter"}</strong></div>
              <div>Date: <strong className="text-foreground">{new Date().toLocaleDateString()}</strong></div>
              <div className="text-right">Time: <strong className="text-foreground">{new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</strong></div>
              <div className="col-span-2 border-t border-zinc-200 dark:border-zinc-800/80 pt-1.5 flex justify-between items-center text-foreground font-semibold">
                <span>Customer: <strong>{selectedCustomerData?.name || activeTableOrders.find(o => o.customerName && o.customerName !== "Walk-in")?.customerName || "Walk-in"}</strong></span>
                {(selectedCustomerData?.phone || activeTableOrders.find(o => o.phone)?.phone) && (
                  <span className="text-muted-foreground font-medium">({selectedCustomerData?.phone || activeTableOrders.find(o => o.phone)?.phone})</span>
                )}
              </div>
            </div>

            <Separator className="bg-zinc-200 dark:bg-zinc-850" />

            {/* Items table */}
            <div className="border border-zinc-200 dark:border-zinc-800/80 rounded-xl overflow-hidden bg-zinc-50 dark:bg-zinc-950/20 max-h-[220px] overflow-y-auto pr-0.5">
              <Table>
                <TableHeader className="bg-zinc-100 dark:bg-zinc-900/50">
                  <TableRow className="hover:bg-transparent border-zinc-200 dark:border-zinc-850">
                    <TableHead className="text-muted-foreground font-bold h-8 text-[11px] py-1">Item</TableHead>
                    <TableHead className="text-muted-foreground font-bold h-8 text-[11px] text-center w-12 py-1">Qty</TableHead>
                    <TableHead className="text-muted-foreground font-bold h-8 text-[11px] text-right w-20 py-1">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeTableOrders.flatMap((o) => o.items).map((item, idx) => {
                    const itemTotal = item.price * item.qty;
                    return (
                      <TableRow key={idx} className="hover:bg-zinc-100 dark:hover:bg-zinc-900/30 border-zinc-200 dark:border-zinc-850">
                        <TableCell className="font-semibold text-foreground py-2 text-[11px]">
                          {item.name}
                          {item.modifiers && item.modifiers.length > 0 && (
                            <div className="text-[9px] text-primary/80 font-normal pl-1.5 mt-0.5">+ {item.modifiers.join(', ')}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-center font-semibold text-foreground py-2 text-[11px]">{item.qty}</TableCell>
                        <TableCell className="text-right font-extrabold text-foreground py-2 text-[11px]">{currency} {itemTotal.toLocaleString()}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <Separator className="bg-zinc-200 dark:bg-zinc-850" />

            {/* Totals Summary */}
            <div className="bg-zinc-50 dark:bg-zinc-900/30 rounded-xl p-3 border border-zinc-200 dark:border-zinc-800/80 space-y-1.5">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="font-semibold text-foreground">{currency} {activeTableOrders.reduce((s, o) => s + Number(o.subtotal), 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Tax ({taxRate}%)</span>
                <span className="font-semibold text-foreground">{currency} {activeTableOrders.reduce((s, o) => s + Number(o.tax), 0).toLocaleString()}</span>
              </div>
              <Separator className="bg-zinc-200 dark:bg-zinc-800 my-1" />
              <div className="flex justify-between font-extrabold text-sm text-foreground">
                <span>Grand Total</span>
                <span className={currentAdvancePayment > 0 ? "text-foreground font-bold" : "text-primary"}>
                  {currency} {activeTableOrders.reduce((s, o) => s + Number(o.total), 0).toLocaleString()}
                </span>
              </div>
              {currentAdvancePayment > 0 && (
                <>
                  <div className="flex justify-between items-center text-xs font-bold text-emerald-600 dark:text-emerald-400 pt-1">
                    <span>Advance Paid Credit</span>
                    <span>- {currency} {currentAdvancePayment.toLocaleString()}</span>
                  </div>
                  <Separator className="bg-zinc-200 dark:bg-zinc-800 my-1" />
                  <div className="flex justify-between font-extrabold text-sm text-foreground">
                    <span>Net Payable</span>
                    <span className="text-primary font-black text-base">
                      {currency} {Math.max(0, activeTableOrders.reduce((s, o) => s + Number(o.total), 0) - currentAdvancePayment).toLocaleString()}
                    </span>
                  </div>
                </>
              )}
            </div>

            {isSessionPaid && (
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 text-center space-y-1">
                <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Payment Details</p>
                <p className="font-extrabold text-foreground text-xs">
                  Settled via {activeTableOrders[0]?.paymentMethod || "Settle Completed"}
                </p>
              </div>
            )}

            <div className="text-center text-[10px] text-muted-foreground/60 leading-tight pt-1">
              Thank you for dining with us!<br/>
              Powered by Ovenisto POS
            </div>
          </div>
          <DialogFooter className="flex gap-2 mt-2">
            <Button variant="outline" onClick={() => setShowBillDialog(false)} className="rounded-xl flex-1 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-muted-foreground hover:text-foreground">Close</Button>
            <Button onClick={() => { printActiveBill(); setShowBillDialog(false); }} className="gradient-primary text-primary-foreground font-bold rounded-xl flex-1 flex items-center justify-center gap-1.5 shadow-md">
              <Printer className="h-4 w-4" /> Print Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Pay Bill Dialog (POS Checkout Style) ── */}
      <Dialog open={showPayBillDialog} onOpenChange={setShowPayBillDialog}>
        <DialogContent className="w-[95vw] max-w-[450px] rounded-2xl bg-background border border-border text-foreground shadow-2xl">
          <DialogHeader className="pb-2 border-b border-border">
            <DialogTitle className="text-center text-lg font-bold flex items-center justify-center gap-2 text-foreground">
              <CreditCard className="h-5 w-5 text-emerald-500" /> Settle Billing
            </DialogTitle>
            <DialogDescription className="sr-only">Choose payment method and settle billing for active table session</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs select-none">
            {/* Professional Breakdown Card */}
            <div className="bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-4 space-y-2">
              <div className="flex justify-between items-center text-muted-foreground">
                <span>Subtotal</span>
                <span className="font-semibold text-foreground">{currency} {activeTableOrders.reduce((s, o) => s + Number(o.subtotal), 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-muted-foreground">
                <span>GST Tax ({taxRate}%)</span>
                <span className="font-semibold text-foreground">{currency} {activeTableOrders.reduce((s, o) => s + Number(o.tax), 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center font-bold text-sm text-foreground">
                <span>Grand Total</span>
                <span className={currentAdvancePayment > 0 ? "text-foreground font-bold" : "text-primary"}>
                  {currency} {activeTableOrders.reduce((s, o) => s + Number(o.total), 0).toLocaleString()}
                </span>
              </div>
              {currentAdvancePayment > 0 && (
                <>
                  <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                    <span>Advance Paid Credit</span>
                    <span>- {currency} {currentAdvancePayment.toLocaleString()}</span>
                  </div>
                  <Separator className="bg-zinc-200 dark:bg-zinc-800/50 my-1" />
                  <div className="flex justify-between items-center font-extrabold text-sm text-foreground">
                    <span className="text-muted-foreground font-semibold">Net Amount Due</span>
                    <span className="text-primary text-base font-extrabold">
                      {currency} {Math.max(0, activeTableOrders.reduce((s, o) => s + Number(o.total), 0) - currentAdvancePayment).toLocaleString()}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Split / Single Tabs */}
            <div className="grid grid-cols-2 p-1 bg-zinc-100 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-xl">
              <button
                onClick={() => {
                  setIsSplitPayment(false);
                }}
                className={cn(
                  "py-2 text-[11px] font-bold rounded-lg transition-all",
                  !isSplitPayment 
                    ? "bg-white dark:bg-zinc-950 text-foreground border border-zinc-250 dark:border-zinc-800 shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Single Payment
              </button>
              <button
                onClick={() => {
                  setIsSplitPayment(true);
                  const totalBill = activeTableOrders.reduce((s, o) => s + Number(o.total), 0);
                  setSplitAmount1(Math.round(totalBill / 2));
                  setSplitAmount2(totalBill - Math.round(totalBill / 2));
                }}
                className={cn(
                  "py-2 text-[11px] font-bold rounded-lg transition-all",
                  isSplitPayment 
                    ? "bg-white dark:bg-zinc-950 text-foreground border border-zinc-250 dark:border-zinc-800 shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Split Payment
              </button>
            </div>

            {/* Form Fields */}
            {!isSplitPayment ? (
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider pl-1">Choose Payment Account</label>
                <div className="grid grid-cols-2 gap-2">
                  {(settings.paymentMethods ?? ["Cash", "Credit Card", "Account", "JazzCash", "EasyPaisa"]).map((payOpt) => {
                    const isSelected = settlePaymentMethod === payOpt;
                    
                    const getOptIcon = () => {
                      const name = payOpt.toLowerCase();
                      if (name.includes("cash")) return Coins;
                      if (name.includes("card") || name.includes("bank") || name.includes("hbl") || name.includes("visa") || name.includes("master")) return CreditCard;
                      if (name.includes("account")) return BookOpen;
                      if (name.includes("phone") || name.includes("mobile") || name.includes("jazz") || name.includes("paisa") || name.includes("easypaisa")) return Smartphone;
                      return CreditCard;
                    };
                    
                    const getOptColor = () => {
                      const name = payOpt.toLowerCase();
                      if (name.includes("cash")) return "text-amber-500 border-amber-500/20 bg-amber-500/5";
                      if (name.includes("card") || name.includes("bank") || name.includes("hbl") || name.includes("visa") || name.includes("master")) return "text-blue-500 border-blue-500/20 bg-blue-500/5";
                      if (name.includes("account")) return "text-indigo-500 border-indigo-500/20 bg-indigo-500/5";
                      if (name.includes("jazz")) return "text-red-500 border-red-500/20 bg-red-500/5";
                      if (name.includes("paisa") || name.includes("easypaisa")) return "text-emerald-500 border-emerald-500/20 bg-emerald-500/5";
                      return "text-zinc-500 border-zinc-500/20 bg-zinc-500/5";
                    };

                    const IconComp = getOptIcon();
                    const colorClass = getOptColor();
                    return (
                      <button
                        key={payOpt}
                        onClick={() => setSettlePaymentMethod(payOpt)}
                        className={cn(
                          "flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all hover:scale-[1.01] active:scale-[0.99]",
                          isSelected 
                            ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-extrabold shadow-[0_2px_8px_rgba(16,185,129,0.15)]" 
                            : "border-zinc-200 dark:border-zinc-850 bg-zinc-50 dark:bg-zinc-900/20 text-muted-foreground hover:border-zinc-300 dark:hover:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900/40"
                        )}
                      >
                        <div className={cn("p-1.5 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-900", isSelected ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : colorClass)}>
                          <IconComp className="h-3.5 w-3.5" />
                        </div>
                        <span className="text-[11px] font-bold tracking-tight">{payOpt}</span>
                        {isSelected && <Check className="ml-auto h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 font-black" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-4 bg-zinc-50 dark:bg-zinc-900/20 border border-zinc-200 dark:border-zinc-800/80 p-3.5 rounded-2xl">
                <div className="grid grid-cols-5 items-center gap-2">
                  <span className="col-span-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider pl-1">Split 1 Method</span>
                  <span className="col-span-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider pl-1">Amount 1</span>
                </div>
                
                <div className="grid grid-cols-5 items-center gap-2">
                  <div className="col-span-2">
                    <Select value={splitMethod1} onValueChange={setSplitMethod1}>
                      <SelectTrigger className="rounded-xl bg-white dark:bg-zinc-950 border-zinc-250 dark:border-zinc-800 text-[11px] h-9 text-foreground"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-white dark:bg-zinc-950 border-zinc-250 dark:border-zinc-800 text-foreground text-[11px]">
                        {(settings.paymentMethods ?? ["Cash", "Credit Card", "Account", "JazzCash", "EasyPaisa"]).map(pm => (
                          <SelectItem key={pm} value={pm}>{pm}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3 relative">
                    <span className="absolute left-3 top-2.5 text-zinc-500 font-semibold">{currency}</span>
                    <Input 
                      type="number"
                      value={splitAmount1 || ""}
                      onChange={(e) => {
                        const totalBill = activeTableOrders.reduce((s, o) => s + Number(o.total), 0);
                        const val = Math.min(totalBill, Math.max(0, Number(e.target.value)));
                        setSplitAmount1(val);
                        setSplitAmount2(totalBill - val);
                      }}
                      className="rounded-xl border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/40 text-foreground pl-8 font-bold text-[11px] h-9"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-5 items-center gap-2 pt-1">
                  <span className="col-span-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider pl-1">Split 2 Method</span>
                  <span className="col-span-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider pl-1">Amount 2</span>
                </div>

                <div className="grid grid-cols-5 items-center gap-2">
                  <div className="col-span-2">
                    <Select value={splitMethod2} onValueChange={setSplitMethod2}>
                      <SelectTrigger className="rounded-xl bg-white dark:bg-zinc-950 border-zinc-250 dark:border-zinc-800 text-[11px] h-9 text-foreground"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-white dark:bg-zinc-950 border-zinc-250 dark:border-zinc-800 text-foreground text-[11px]">
                        {(settings.paymentMethods ?? ["Cash", "Credit Card", "Account", "JazzCash", "EasyPaisa"]).map(pm => (
                          <SelectItem key={pm} value={pm}>{pm}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3 relative">
                    <span className="absolute left-3 top-2.5 text-zinc-500 font-semibold">{currency}</span>
                    <Input 
                      type="number"
                      value={splitAmount2 || ""}
                      onChange={(e) => {
                        const totalBill = activeTableOrders.reduce((s, o) => s + Number(o.total), 0);
                        const val = Math.min(totalBill, Math.max(0, Number(e.target.value)));
                        setSplitAmount2(val);
                        setSplitAmount1(totalBill - val);
                      }}
                      className="rounded-xl border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/40 text-foreground pl-8 font-bold text-[11px] h-9"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex gap-2 mt-2 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => setShowPayBillDialog(false)} className="rounded-xl flex-1 border-zinc-200 dark:border-zinc-855 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-muted-foreground hover:text-foreground transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]">
              Cancel
            </Button>
            <Button 
              disabled={settlingBillingState}
              onClick={() => {
                const finalPaymentMethod = isSplitPayment 
                  ? `${splitMethod1}: Rs.${splitAmount1.toLocaleString()}, ${splitMethod2}: Rs.${splitAmount2.toLocaleString()}` 
                  : settlePaymentMethod;
                settleBilling(finalPaymentMethod);
              }} 
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex-1 flex items-center justify-center gap-1.5 shadow-[0_4px_12px_rgba(16,185,129,0.25)] border-none transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              {settlingBillingState ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Confirm Pay
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Guests Count Selection Dialog ── */}
      <Dialog open={showGuestsDialog} onOpenChange={setShowGuestsDialog}>
        <DialogContent className="w-[90vw] max-w-[380px] rounded-2xl bg-background border border-border text-foreground shadow-2xl">
          <DialogHeader className="pb-2 border-b border-border">
            <DialogTitle className="text-center text-lg font-bold flex items-center justify-center gap-2">
              <Users className="h-5 w-5 text-primary" /> Guests Count
            </DialogTitle>
            <DialogDescription className="sr-only">Select guest count and optionally link reservation</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 text-center">
            <p className="text-xs text-muted-foreground select-none">
              How many persons are seated at Table {selectedTable?.number}?
            </p>
            <div className="flex items-center justify-center gap-5 py-2">
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-full border-zinc-200 dark:border-zinc-800 transition-all duration-200 hover:scale-105 active:scale-95"
                onClick={() => setGuestsCount(prev => Math.max(1, prev - 1))}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <div className="w-16 text-center">
                <span className="text-3xl font-extrabold text-foreground tracking-tight select-none">
                  {guestsCount}
                </span>
                <span className="text-[10px] text-muted-foreground block font-semibold uppercase tracking-wider mt-0.5">Pax</span>
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-full border-zinc-200 dark:border-zinc-800 transition-all duration-200 hover:scale-105 active:scale-95"
                onClick={() => setGuestsCount(prev => Math.min(50, prev + 1))}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {confirmedReservations.filter(r => r.status !== "completed" && r.status !== "cancelled" && r.status !== "seated").length > 0 && (
              <div className="text-left space-y-2 pt-3 border-t border-border/80">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-amber-500 flex items-center gap-1.5">
                    <BookOpen className="h-4 w-4" /> Link Today's Booking / Reservation
                  </Label>
                  {selectedReservationForSitting && (
                    <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/30 font-bold px-2 py-0.5">
                      ✓ Linked
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  Link a booking to auto-import customer, advance deposit, and pre-ordered food items directly into kitchen & billing.
                </p>
                <Select
                  value={selectedReservationForSitting || "none"}
                  onValueChange={(val) => {
                    setSelectedReservationForSitting(val === "none" ? null : val);
                    if (val !== "none") {
                      const resObj = confirmedReservations.find(r => r.id === val);
                      if (resObj) {
                        if (resObj.guestCount) setGuestsCount(resObj.guestCount);
                        const matchedCust = customers.find(c => c.name.toLowerCase() === resObj.customerName.toLowerCase() || (resObj.customerPhone && c.phone === resObj.customerPhone));
                        if (matchedCust && selectedTableNum !== null) {
                          handleSelectCustomerForTable(matchedCust.id);
                        }
                      }
                    }
                  }}
                >
                  <SelectTrigger className="h-11 text-xs rounded-xl border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 text-foreground font-semibold transition-all shadow-2xs">
                    <SelectValue placeholder="Walk-in Customer (No reservation)">
                      {selectedReservationForSitting && selectedReservationForSitting !== "none" ? (() => {
                        const selRes = confirmedReservations.find(r => r.id === selectedReservationForSitting);
                        if (!selRes) return (
                          <span className="flex items-center gap-2 text-foreground font-medium">
                            <User className="h-4 w-4 text-muted-foreground shrink-0" />
                            Walk-in Customer (No reservation)
                          </span>
                        );
                        return (
                          <span className="flex items-center gap-2 font-bold text-foreground truncate">
                            <User className="h-4 w-4 text-amber-500 shrink-0" />
                            <span>{selRes.customerName}</span>
                            <span className="text-amber-500 font-mono">({selRes.time})</span>
                            {selRes.tableNumber && <span className="text-muted-foreground font-normal">• Table {selRes.tableNumber}</span>}
                          </span>
                        );
                      })() : (
                        <span className="flex items-center gap-2 text-foreground font-medium">
                          <User className="h-4 w-4 text-muted-foreground shrink-0" />
                          Walk-in Customer (No reservation)
                        </span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-w-[380px] p-1.5 rounded-2xl border-border bg-popover shadow-xl overflow-hidden">
                    <SelectItem value="none" className="font-semibold text-xs py-2.5 px-3 rounded-xl cursor-pointer flex items-center gap-2 mb-1">
                      <span className="flex items-center gap-2 text-foreground font-medium">
                        <User className="h-4 w-4 text-muted-foreground" />
                        Walk-in Customer (No reservation)
                      </span>
                    </SelectItem>
                    {confirmedReservations.filter(r => r.status !== "completed" && r.status !== "cancelled" && r.status !== "seated").map((r) => {
                      const preOrderCount = r.preOrderItems ? r.preOrderItems.length : 0;
                      return (
                        <SelectItem
                          key={r.id}
                          value={r.id}
                          textValue={`${r.customerName} (${r.time})`}
                          className="py-2.5 px-3 rounded-xl cursor-pointer my-1 border border-transparent hover:border-amber-500/30"
                        >
                          <div className="flex flex-col gap-1.5 w-full text-left">
                            <div className="font-bold text-xs flex items-center justify-between gap-2">
                              <span className="font-extrabold text-foreground flex items-center gap-1.5">
                                <User className="h-3.5 w-3.5 text-primary" /> {r.customerName}
                              </span>
                              {r.customerPhone && (
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  {r.customerPhone}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-semibold flex-wrap">
                              <span className="bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded-md font-bold flex items-center gap-1">
                                <Clock className="h-3 w-3" /> {r.time}
                              </span>
                              {r.tableNumber && (
                                <span className="bg-muted text-muted-foreground border border-border/40 px-2 py-0.5 rounded-md font-medium">
                                  Table {r.tableNumber}
                                </span>
                              )}
                              {r.advancePaid ? (
                                <span className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 px-2 py-0.5 rounded-md font-bold flex items-center gap-1">
                                  <Check className="h-3 w-3" /> Adv PKR {r.advancePaid}
                                </span>
                              ) : null}
                              {preOrderCount > 0 ? (
                                <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-md font-bold flex items-center gap-1">
                                  <Utensils className="h-3 w-3" /> {preOrderCount} Pre-orders
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>

                {(() => {
                  const selRes = confirmedReservations.find(r => r.id === selectedReservationForSitting);
                  if (!selRes) return null;
                  const preOrderCount = selRes.preOrderItems ? selRes.preOrderItems.length : 0;
                  return (
                    <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-2 mt-2 shadow-2xs">
                      <div className="flex items-center justify-between font-extrabold text-foreground">
                        <span className="flex items-center gap-1.5">
                          <User className="h-4 w-4 text-amber-500" /> Linked: {selRes.customerName}
                        </span>
                        <span className="text-amber-500 font-extrabold flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" /> {selRes.time}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] font-medium flex-wrap">
                        {selRes.advancePaid ? (
                          <span className="text-emerald-500 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20 flex items-center gap-1">
                            <Check className="h-3 w-3" /> Deposit Paid: PKR {selRes.advancePaid}
                          </span>
                        ) : null}
                        {preOrderCount > 0 ? (
                          <span className="text-primary font-bold bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20 flex items-center gap-1">
                            <Utensils className="h-3 w-3" /> {preOrderCount} Food items pre-ordered & ready to send to kitchen
                          </span>
                        ) : (
                          <span className="text-muted-foreground">No pre-ordered food items</span>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowGuestsDialog(false)}
              className="rounded-xl flex-1 border-zinc-200 dark:border-zinc-800 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmGuestsCount}
              className="gradient-primary text-primary-foreground font-bold rounded-xl flex-1 flex items-center justify-center gap-1.5 shadow-md transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Check className="h-4 w-4" /> {guestsActionType === "start-sitting" ? "Start Sitting" : "Confirm Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add New Customer Dialog ── */}
      <Dialog open={showCustomerAddDialog} onOpenChange={setShowCustomerAddDialog}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Add New Customer
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs font-semibold">Customer Name *</Label>
              <Input
                value={newCustomerForm.name}
                onChange={(e) => setNewCustomerForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter customer name"
                className="mt-1 h-9 text-xs rounded-xl"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">Phone Number (11 Digits) *</Label>
              <Input
                value={newCustomerForm.phone}
                onChange={(e) => setNewCustomerForm(prev => ({ ...prev, phone: formatPhoneNumber(e.target.value) }))}
                placeholder="0300-1234567"
                maxLength={12}
                className="mt-1 h-9 text-xs rounded-xl"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">Email Address (Optional)</Label>
              <Input
                type="email"
                value={newCustomerForm.email}
                onChange={(e) => setNewCustomerForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="customer@email.com"
                className="mt-1 h-9 text-xs rounded-xl"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">Address (Optional)</Label>
              <Input
                value={newCustomerForm.address}
                onChange={(e) => setNewCustomerForm(prev => ({ ...prev, address: e.target.value }))}
                placeholder="Address..."
                className="mt-1 h-9 text-xs rounded-xl"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">Customer Type</Label>
              <Select
                value={newCustomerForm.customerType}
                onValueChange={(val) => setNewCustomerForm(prev => ({ ...prev, customerType: val }))}
              >
                <SelectTrigger className="mt-1 h-9 text-xs rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="walk-in">Standard / Walk-in</SelectItem>
                  <SelectItem value="corporate">Corporate</SelectItem>
                  <SelectItem value="vip">VIP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowCustomerAddDialog(false)} className="rounded-xl">Cancel</Button>
            <Button className="gradient-primary text-primary-foreground font-bold rounded-xl" onClick={handleAddCustomerSubmit} disabled={creatingCustomer}>
              {creatingCustomer ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Save Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Customer History Dialog ── */}
      <Dialog open={showCustomerHistoryDialog} onOpenChange={setShowCustomerHistoryDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              Customer History
            </DialogTitle>
          </DialogHeader>
          {customerHistory ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-bold text-lg">{customerHistory.name}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{customerHistory.phone || "No phone"}</span>
                    {customerHistory.customerType === "corporate" && <Badge className="text-[9px] bg-info/10 text-info">Corporate</Badge>}
                    {customerHistory.customerType === "vip" && <Badge className="text-[9px] bg-warning/10 text-warning">VIP</Badge>}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Card className="p-2.5 text-center rounded-xl">
                  <p className="text-lg font-bold text-primary">{customerHistory.orderCount}</p>
                  <p className="text-[10px] text-muted-foreground font-medium">Total Visits</p>
                </Card>
                <Card className="p-2.5 text-center rounded-xl">
                  <p className="text-lg font-bold">{currency} {customerHistory.totalSpent.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground font-medium">Total Spent</p>
                </Card>
                <Card className="p-2.5 text-center rounded-xl">
                  <p className="text-lg font-bold">{currency} {customerHistory.avgBill.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground font-medium">Avg Bill</p>
                </Card>
              </div>
              {customerHistory.outstandingDue > 0 && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-2.5 flex justify-between items-center">
                  <span className="text-sm font-medium text-destructive">Outstanding Due</span>
                  <span className="font-bold text-destructive">{currency} {customerHistory.outstandingDue.toLocaleString()}</span>
                </div>
              )}
              {customerHistory.topItems.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Favorite Items</p>
                  <div className="flex flex-wrap gap-1.5">
                    {customerHistory.topItems.map(([name, qty]) => (
                      <Badge key={name} variant="secondary" className="text-[10px] font-bold rounded-lg px-2 py-0.5">{name} ({qty}x)</Badge>
                    ))}
                  </div>
                </div>
              )}
              {customerHistory.recentOrders.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Recent Orders</p>
                  <div className="space-y-1.5">
                    {customerHistory.recentOrders.map((o) => (
                      <div key={o.id} className="flex items-center justify-between text-xs bg-muted/50 rounded-xl px-3 py-2 border border-border/40">
                        <div className="flex items-center gap-2">
                          <span className="font-bold">{o.orderNumber}</span>
                          <Badge variant="outline" className="text-[9px] font-bold">{o.type}</Badge>
                          <span className="text-muted-foreground text-[11px]">{new Date(o.createdAt).toLocaleDateString()}</span>
                        </div>
                        <span className="font-bold text-primary">{currency} {Number(o.total).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No customer selected</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCustomerHistoryDialog(false)} className="rounded-xl">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Today Reservations Details Dialog ── */}
      <Dialog open={showTodayReservationsDialog} onOpenChange={setShowTodayReservationsDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl p-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-500 font-bold text-base">
              <BookOpen className="h-4.5 w-4.5" />
              Today's Reservations ({confirmedReservations.length})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            {confirmedReservations.length > 0 ? (
              confirmedReservations.map((r) => {
                const effStatus = getEffectiveStatus(r);
                const preOrderCount = r.preOrderItems ? r.preOrderItems.length : 0;
                const foodSubtotal = r.subtotal || (r.preOrderItems ? r.preOrderItems.reduce((s: number, i: any) => s + Number(i.price) * Number(i.qty), 0) : 0);

                return (
                  <div
                    key={r.id}
                    className="p-3.5 border border-border/80 rounded-xl bg-card space-y-2.5 shadow-2xs transition-all duration-200 hover:shadow-xs"
                  >
                    {/* Header line: Customer Name & Phone, Status Badge */}
                    <div className="flex items-start justify-between gap-2 border-b border-border/40 pb-2">
                      <div>
                        <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-primary" />
                          {r.customerName}
                        </h3>
                        {r.customerPhone && (
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5 font-medium">
                            <Phone className="h-3 w-3" /> {r.customerPhone}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0">
                        {effStatus === "completed" && (
                          <Badge variant="outline" className="text-[11px] font-bold px-2.5 py-0.5 rounded-lg border bg-muted text-muted-foreground flex items-center gap-1">
                            <Check className="h-3 w-3" /> Completed
                          </Badge>
                        )}
                        {effStatus === "seated" && (
                          <Badge variant="outline" className="text-[11px] font-bold px-2.5 py-0.5 rounded-lg border bg-emerald-500/10 text-emerald-500 border-emerald-500/30 flex items-center gap-1">
                            <Utensils className="h-3 w-3" /> Seated
                          </Badge>
                        )}
                        {effStatus === "not_arrived" && (
                          <Badge variant="outline" className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-lg border bg-rose-500/15 text-rose-500 border-rose-500/30 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" /> Not Arrived
                          </Badge>
                        )}
                        {effStatus === "confirmed" && (
                          <Badge variant="outline" className="text-[11px] font-bold px-2.5 py-0.5 rounded-lg border bg-blue-500/10 text-blue-500 border-blue-500/30 flex items-center gap-1">
                            <Clock className="h-3 w-3" /> Confirmed
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Info Pills Grid: Date, Time */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-muted/40 p-2 rounded-lg border border-border/30 flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
                        <div>
                          <span className="text-[9px] text-muted-foreground block font-semibold uppercase">Date</span>
                          <span className="font-bold text-foreground text-xs">{r.date}</span>
                        </div>
                      </div>
                      <div className="bg-muted/40 p-2 rounded-lg border border-border/30 flex items-center gap-2">
                        <Timer className="h-3.5 w-3.5 text-primary shrink-0" />
                        <div>
                          <span className="text-[9px] text-muted-foreground block font-semibold uppercase">Time</span>
                          <span className="font-bold text-foreground text-xs">{r.time}</span>
                        </div>
                      </div>
                    </div>

                    {/* Table & Pax Row */}
                    <div className="bg-muted/40 p-2 rounded-lg border border-border/30 flex items-center justify-between text-xs font-semibold">
                      <span className="flex items-center gap-1.5 text-foreground">
                        <Utensils className="h-3.5 w-3.5 text-amber-500" />
                        Table: <strong className="text-amber-500 font-extrabold">{r.tableNumber ? `Table ${r.tableNumber}` : "Unassigned"}</strong>
                      </span>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Users className="h-3 w-3" /> {r.guestCount} Pax
                      </span>
                    </div>

                    {/* Pre-Order Food Items Summary (if any) */}
                    {preOrderCount > 0 && (
                      <div className="bg-primary/5 border border-primary/20 rounded-xl p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between font-bold text-xs">
                          <span className="flex items-center gap-1 text-foreground">
                            <Utensils className="h-3.5 w-3.5 text-primary" /> Pre-Order Food ({preOrderCount} items)
                          </span>
                          <span className="text-primary font-bold">PKR {foodSubtotal.toLocaleString()}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground space-y-0.5 max-h-28 overflow-y-auto divide-y divide-border/20 pt-0.5">
                          {r.preOrderItems?.map((item: any, idx: number) => (
                            <div key={idx} className="flex justify-between pt-0.5 font-medium">
                              <span>{item.qty}x {item.name}</span>
                              <span className="font-mono font-semibold text-foreground">PKR {(item.price * item.qty).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Advance Deposit Badge */}
                    {r.advancePaid && Number(r.advancePaid) > 0 ? (
                      <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 p-2 rounded-lg font-bold text-xs">
                        <span className="flex items-center gap-1">
                          <Check className="h-3.5 w-3.5 text-emerald-500" /> Advance Deposit Paid
                        </span>
                        <span className="font-extrabold">PKR {Number(r.advancePaid).toLocaleString()}</span>
                      </div>
                    ) : null}

                    {r.specialRequests && (
                      <p className="text-[11px] italic text-muted-foreground bg-muted/40 p-2 rounded-lg border border-border/30">
                        "{r.specialRequests}"
                      </p>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <BookOpen className="h-10 w-10 mx-auto opacity-30 mb-2 text-primary" />
                <p className="text-base font-bold text-foreground">No reservations scheduled for today</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTodayReservationsDialog(false)} className="rounded-xl">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WaiterPanel;

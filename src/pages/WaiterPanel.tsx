import React, { useState, useMemo, useEffect, useCallback, useRef, Fragment } from "react";
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
  Coins, Wallet, Smartphone, BookOpen, User, UserCheck, History, Building2, Crown, Phone, MapPin, Calendar, Timer, DollarSign, CalendarCheck,
  AlertCircle, XCircle, CheckCircle2, Utensils, Info, Gift, Package, Layers, Tag
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { cashSettlementService } from "@/services/cashSettlement.service";
import { api } from "@/services/api";
import { useModuleEvents } from "@/hooks/use-module-events";
import { useVisiblePolling } from "@/hooks/use-visible-polling";
import { useOrderEvents } from "@/hooks/use-order-events";
import { useTableEvents } from "@/hooks/use-table-events";
import { useReservationEvents } from "@/hooks/use-reservation-events";
import { useSelfMutationGuard } from "@/hooks/use-self-mutation-guard";
import { getSocket } from "@/lib/socket";
import { orderService, type OrderRecord, type OrderCouponPreview } from "@/services/order.service";
import { menuService, type MenuItemRecord, type CategoryRecord, type ModifierRecord, type MenuItemVariant } from "@/services/menu.service";
import { tableService, type TableRecord } from "@/services/table.service";
import { reservationService, type Reservation } from "@/services/reservation.service";
import { customerService, type CustomerRecord } from "@/services/customer.service";
import { settingsService } from "@/services/settings.service";
import { dealService, type DealRecord, type DealOptionItemRecord } from "@/services/deal.service";
import { isDealLive, dealChannelPrice, dealChannelPercent, allocateDealDiscount, dealBogoSides, capFreeUnitPrice } from "@/lib/deals";
import { warehouseService, type WarehouseStockRecord } from "@/services/warehouse.service";
import { stockService, type ProductionStockRecord } from "@/services/stock.service";
import { calculateFoodAvailability, isFullyOutOfStock } from "@/utils/foodAvailability";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { OrderPlacedPrintModal, type PlacedOrderSlipData } from "@/components/pos/OrderPlacedPrintModal";

// ─── Types ─────────────────────────────────────────────────────────────────

interface CartItem {
  id: string;
  menuItemId?: string | null; // real DB id — needed for KDS category routing
  variantId?: string | null;  // variant DB id — sent to backend for proper linking
  cookingTime?: number;       // used by KDS countdown timer
  name: string;
  price: number;
  qty: number;
  variant?: string;
  modifiers?: string[];
  /** Set once a line came off a Deal card rather than the plain menu — see
   *  POS.tsx's identical fields for the full contract (grouping, removal as
   *  one unit, and what deal.revalidate.ts re-derives server-side). */
  discount?: number;
  dealId?: string | null;
  dealName?: string | null;
  dealLineId?: string | null;
  dealGroupId?: string | null;
  dealRole?: "buy" | "get" | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Always use dine-in price; fall back to base price */
const dineInPrice  = (item: MenuItemRecord): number  => item.dineInPrice ?? item.price;
const variantDineInPrice = (v: MenuItemVariant): number => v.dineInPrice ?? v.price;
/** Dine In price for a menu item, or its variant when one applies — every
 *  deal calculation below goes through this since a WaiterPanel order is
 *  always Dine In. */
const menuItemPrice = (item: MenuItemRecord, variant?: MenuItemVariant | null): number =>
  variant ? variantDineInPrice(variant) : dineInPrice(item);

/** Resolve modifier selling price for a menu item */
const resolveModifierPrice = (mod: any, selectedVariantId?: string | null): number => {
  if (!mod) return 0;
  if (selectedVariantId && Array.isArray(mod.variantConfig) && mod.variantConfig.length > 0) {
    const vc = mod.variantConfig.find((c: any) => c.variantId === selectedVariantId);
    if (vc && vc.sellingPrice !== undefined && vc.sellingPrice !== null) {
      return Number(vc.sellingPrice);
    }
  }
  if (mod.sellingPrice !== undefined && mod.sellingPrice !== null) {
    return Number(mod.sellingPrice);
  }
  return Number(mod.price || 0);
};

/** Use item-specific modifiers only, matching POS behavior */
const resolveModifiers = (item: MenuItemRecord) => {
  return item.modifiers?.filter((m: any) => m.status === "active" || m.status === undefined || !m.status) || [];
};

const getPaymentIcon = (method: string) => {
  const m = method.toLowerCase();
  if (m.includes("cash")) return Coins;
  if (m.includes("jazz")) return Smartphone;
  if (m.includes("easy") || m.includes("paisa")) return Smartphone;
  if (m.includes("card") || m.includes("credit") || m.includes("debit") || m.includes("bank")) return CreditCard;
  if (m.includes("wallet")) return Wallet;
  return CreditCard;
};

// ─── Status config ─────────────────────────────────────────────────────────

const statusConfig = {
  available:        { card: "border-success/40 hover:border-success",             dot: "bg-success",     bg: "bg-success/8",     icon: "text-success",     label: "Available" },
  occupied:         { card: "border-accent/40 hover:border-accent",               dot: "bg-accent",       bg: "bg-accent/8",       icon: "text-accent",       label: "Occupied" },
  "bill-requested": { card: "border-destructive/40 hover:border-destructive",     dot: "bg-destructive", bg: "bg-destructive/8", icon: "text-destructive", label: "Bill Req." },
  reserved:         { card: "border-warning/40 hover:border-warning",             dot: "bg-warning",     bg: "bg-warning/8",     icon: "text-warning",     label: "Reserved" },
  maintenance:      { card: "border-muted hover:border-muted",                     dot: "bg-muted",       bg: "bg-muted/8",       icon: "text-muted",       label: "Maintenance" },
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

// Mirrors POS.tsx's dealFormatBadge — order_discount is excluded from
// sellableDeals below so it never needs a badge here.
const dealFormatBadge: Record<Exclude<DealRecord["type"], "order_discount">, { icon: typeof Package; label: string }> = {
  combo: { icon: Package, label: "Fixed Bundle" },
  option_combo: { icon: Layers, label: "Customizable" },
  percentage: { icon: Percent, label: "% Discount" },
  buy_x_get_y: { icon: Gift, label: "Buy X Get Y" },
};

// ─── Component ─────────────────────────────────────────────────────────────

const WaiterPanel = () => {
  const { settings, updateSettings, ingredients } = useData();
  const { user } = useAuth();
  const currency = settings.currency || "Rs.";
  const { markMine, isLikelyOwnEcho } = useSelfMutationGuard();

  // Cash Hub / Active balance for logged in waiter
  const [showMyCollectionDialog, setShowMyCollectionDialog] = useState(false);
  const { data: myActiveCash, refetch: refetchMyCash } = useQuery({
    queryKey: ["my-active-cash", user?.id],
    queryFn: async () => {
      if (user?.id) {
        api.clearCache(`/cash-settlements/staff/${user.id}/active`);
      }
      return cashSettlementService.getStaffActiveBalance(user!.id);
    },
    enabled: !!user?.id,
  });

  const refetchMyActiveCash = () => {
    if (user?.id) {
      api.clearCache(`/cash-settlements/staff/${user.id}/active`);
      refetchMyCash();
    }
  };

  useModuleEvents(["cashSettlement:created", "order:created", "order:updated", "table:updated"], refetchMyActiveCash);
  useOrderEvents(refetchMyActiveCash);
  // Two socket subscriptions already cover every event that can change this
  // waiter's uncleared-cash figure, so the timer is a pure fallback — 30s was
  // 120 requests an hour for a number that only moves when an order or a
  // settlement does.
  useVisiblePolling(refetchMyActiveCash, 300_000);

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
  const [statusFilter, setStatusFilter] = useState<"all" | "available" | "occupied" | "reservations">("all");
  const [floorFilter,  setFloorFilter]  = useState<string>("all");
  const [billReqSet,    setBillReqSet]    = useState<Set<number>>(new Set());
  const [acceptingId,   setAcceptingId]   = useState<string | null>(null);
  const [rejectingId,   setRejectingId]   = useState<string | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [cartItems,       setCartItems]        = useState<CartItem[]>([]);
  const [menuCategory,    setMenuCategory]     = useState("All");

  // ── Live ingredient/production stock — mirrors POS.tsx's sourcing exactly
  // (same stock the backend's validateOrderStock checks at order creation),
  // so a dish disabled here is genuinely unmakeable, not just guessed at. ──
  const { data: kitchenWarehouses = [] } = useQuery({
    queryKey: ["kitchen-warehouses", user?.outletId],
    queryFn: () => warehouseService.getAll({ type: "KITCHEN", outletId: user?.outletId ?? undefined }),
    staleTime: 60000,
    enabled: !!user?.outletId,
  });
  const kitchenWarehouseId = kitchenWarehouses.length > 0 ? kitchenWarehouses[0].id : null;
  const { data: kitchenWarehouseStock = [] } = useQuery<WarehouseStockRecord[]>({
    queryKey: ["kitchen-warehouse-stock", kitchenWarehouseId],
    queryFn: () => warehouseService.getStock(kitchenWarehouseId!),
    staleTime: 30000,
    enabled: !!kitchenWarehouseId,
  });
  const ingredientStockMap = useMemo(() => {
    const map = new Map<string, number>();
    if (kitchenWarehouseStock.length > 0) {
      for (const ws of kitchenWarehouseStock) {
        if (ws?.ingredient?.id) map.set(ws.ingredient.id, Number(ws.currentStock ?? 0));
      }
    } else {
      for (const ing of ingredients || []) {
        if (ing?.id) map.set(ing.id, Number(ing.currentStock ?? 0));
      }
    }
    return map;
  }, [kitchenWarehouseStock, ingredients]);
  const { data: apiProductionStock = [] } = useQuery<ProductionStockRecord[]>({
    queryKey: ["production-stock"],
    queryFn: () => stockService.getProductionStock(),
    staleTime: 30000,
  });
  const productionStockMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of apiProductionStock) {
      if (item?.productionItemId) {
        map.set(item.productionItemId, (map.get(item.productionItemId) || 0) + Number(item.currentStock ?? 0));
      }
    }
    return map;
  }, [apiProductionStock]);

  // ── Deals — same real backend deals POS.tsx sells, always priced at Dine
  // In since every WaiterPanel order is a table order. Order Discount is
  // excluded: a Promo Code/Minimum Spend deal isn't something a waiter picks
  // from the menu grid. ──
  const { data: liveDeals = [] } = useQuery({
    queryKey: ["deals", "waiter"],
    queryFn: () => dealService.getDeals(),
    staleTime: 60_000,
  });
  const sellableDeals = useMemo(
    () => liveDeals.filter((d) => d.type !== "order_discount" && isDealLive(d).valid),
    [liveDeals]
  );
  const [showDealCustomize, setShowDealCustomize] = useState(false);
  const [customizingDeal, setCustomizingDeal] = useState<DealRecord | null>(null);
  const [dealGroupSelections, setDealGroupSelections] = useState<Record<string, string[]>>({});
  const [showDealItemPicker, setShowDealItemPicker] = useState(false);
  const [pickingDeal, setPickingDeal] = useState<DealRecord | null>(null);
  const [pickedDealItemId, setPickedDealItemId] = useState("");
  const [pickedDealVariantId, setPickedDealVariantId] = useState<string | null>(null);
  const [pickedDealQty, setPickedDealQty] = useState(1);
  const [expandedItemId,    setExpandedItemId]    = useState<string | null>(null);
  const [selectedVariant,   setSelectedVariant]   = useState<{ id: string; name: string; price: number } | null>(null);
  const [selectedModifierQtys, setSelectedModifierQtys] = useState<Record<string, number>>({});
  const [placingOrder, setPlacingOrder] = useState(false);
  const [taxRate,       setTaxRate]       = useState<number>(settings.taxRate ?? 0);
  const [isOrderingMode, setIsOrderingMode] = useState(false);
  const [settlePaymentMethod, setSettlePaymentMethod] = useState("Cash");
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [targetMoveTableId, setTargetMoveTableId] = useState<string | null>(null);
  const [showOrdersDialog, setShowOrdersDialog] = useState(false);
  const [showBillDialog, setShowBillDialog] = useState(false);
  const [showPayBillDialog, setShowPayBillDialog] = useState(false);
  const [showOrderPlacedModal, setShowOrderPlacedModal] = useState(false);
  const [placedOrderSlip, setPlacedOrderSlip] = useState<PlacedOrderSlipData | null>(null);
  const [isSplitPayment, setIsSplitPayment] = useState(false);
  const [waiterPaymentEntries, setWaiterPaymentEntries] = useState<{ id: string; method: string; amount: number }[]>([]);
  const [waiterGivenAmount, setWaiterGivenAmount] = useState<number>(0);
  const [splitMethod1, setSplitMethod1] = useState("Cash");
  const [splitMethod2, setSplitMethod2] = useState("Credit Card");
  const [splitAmount1, setSplitAmount1] = useState(0);
  const [splitAmount2, setSplitAmount2] = useState(0);
  const [startingSitting, setStartingSitting] = useState(false);
  const [endingSitting, setEndingSitting] = useState(false);
  const [settlingBillingState, setSettlingBillingState] = useState(false);
  const [movingTable, setMovingTable] = useState(false);

  const [showGuestsDialog, setShowGuestsDialog] = useState(false);
  const [guestsCount, setGuestsCount] = useState(4);
  const [guestsActionType, setGuestsActionType] = useState<"start-sitting" | "place-order" | null>(null);
  const [isSubmittingGuestsCount, setIsSubmittingGuestsCount] = useState(false);

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

  const getEffectiveStatus = (r: { date: string; time: string; status: string; orderId?: string | null }) => {
    if (r.status === "completed") return "completed";
    if (r.orderId && orders.some(o => o.id === r.orderId && o.status === "completed")) return "completed";
    if (r.status === "seated" || r.orderId) return "seated";
    if (r.status === "cancelled" || r.status === "noShow") return r.status;
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
      markMine();
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
  useOrderEvents(useCallback(() => {
    loadOrders();
    // A self-order can silently create a brand-new Customer row; refresh the
    // local cache too so the Customer Association fallback below isn't stuck
    // matching against a stale array that never contained the new customer.
    loadCustomers();
  }, [loadOrders, loadCustomers]));
  useTableEvents(loadTables);
  useReservationEvents(loadReservations);
  // Four independent 60s polls meant a waiter's tablet fired ~240 requests an
  // hour on top of the sockets above, which already push every one of these
  // changes the moment it happens. Stretched to 3 minutes: still a real
  // self-heal if a socket message is ever dropped, at a third of the load.
  useVisiblePolling(loadOrders, 180_000);
  useVisiblePolling(loadTables, 180_000);
  useVisiblePolling(loadReservations, 180_000);
  // Customers has no socket at all, but it barely changes and every path that
  // does create one (a self-order signup) already refreshes it via
  // useOrderEvents above — so this one can be slower still.
  useVisiblePolling(loadCustomers, 600_000);

  // Friendly toast for changes pushed from elsewhere (another waiter, POS, kitchen) —
  // suppressed for a few seconds after this client's own writes (see markMine() calls above)
  // so it doesn't double up with the specific success toast that action already shows. Order
  // events aren't outlet-room-scoped server-side (unlike table/reservation), so they're also
  // filtered to this outlet here.
  useEffect(() => {
    const socket = getSocket();
    const onOrderCreated = (payload: OrderRecord) => {
      if (isLikelyOwnEcho()) return;
      if (payload.outletId && payload.outletId !== user?.outletId) return;
      toast.info(`New order — Table ${payload.tableNumber ?? "—"} (#${payload.orderNumber})`);
    };
    const onOrderUpdated = (payload: OrderRecord) => {
      if (isLikelyOwnEcho()) return;
      if (payload.outletId && payload.outletId !== user?.outletId) return;
      if (payload.status === "cancelled") {
        toast.error(`Order #${payload.orderNumber} was cancelled`);
      }
    };
    const onTableUpdated = (payload: TableRecord) => {
      if (isLikelyOwnEcho()) return;
      toast.info(`Table ${payload.number} is now ${payload.status}`);
    };
    const onReservationCreated = (payload: Reservation) => {
      if (isLikelyOwnEcho()) return;
      toast.info(`New reservation: ${payload.customerName} — ${payload.date} at ${payload.time}`);
    };
    const onReservationUpdated = (payload: Reservation) => {
      if (isLikelyOwnEcho()) return;
      toast.info(`Reservation for ${payload.customerName} updated — now ${payload.status}`);
    };
    const onCallWaiter = (payload: { tableId?: string; tableNumber?: string; outletId?: string }) => {
      if (payload.outletId && payload.outletId !== user?.outletId) return;
      toast.warning(`🔔 Customer at Table ${payload.tableNumber ?? "—"} is requesting a waiter!`, {
        duration: 10000,
      });
    };
    socket.on("order:created", onOrderCreated);
    socket.on("order:updated", onOrderUpdated);
    socket.on("table:updated", onTableUpdated);
    socket.on("reservation:created", onReservationCreated);
    socket.on("reservation:updated", onReservationUpdated);
    socket.on("call-waiter", onCallWaiter);
    return () => {
      socket.off("order:created", onOrderCreated);
      socket.off("order:updated", onOrderUpdated);
      socket.off("table:updated", onTableUpdated);
      socket.off("reservation:created", onReservationCreated);
      socket.off("reservation:updated", onReservationUpdated);
      socket.off("call-waiter", onCallWaiter);
    };
  }, [isLikelyOwnEcho, user?.outletId]);

  // ── Derived ──

  const getGuestsCount = (t: TableRecord) => {
    if (!t?.currentOrderId) return t?.capacity || 0;
    const parts = t.currentOrderId.split(":");
    return parts[1] && !isNaN(Number(parts[1])) ? Number(parts[1]) : (t.capacity || 0);
  };

  const isOrderUnpaid = (o: any) => {
    if (!o.paymentMethod || o.paymentMethod === "Pending" || o.paymentMethod === "Unpaid") return true;

    const total = Number(o.total || 0);
    const advance = Number(o.advancePayment || 0);
    const netDue = total - advance;
    if (advance > 0 && netDue > 0.01 && o.paymentStatus !== "fully_paid") {
      return true;
    }
    return false;
  };

  const getTableOrders = (tableNum: number) => {
    const t = tables.find((tbl) => Number(tbl.number) === tableNum);
    const isOccupied = t ? (t.status === "occupied" || t.status === "bill-requested") : false;
    const sessionStartStr = t?.currentOrderId;
    const sessionStart = sessionStartStr ? Number(sessionStartStr.split(":")[0]) : NaN;

    return orders.filter((o) => {
      if (Number(o.tableNumber) !== Number(tableNum)) return false;
      if (ACTIVE_STATUSES.includes(o.status)) return true;

      if (isOccupied && o.status === "completed") {
        const orderTime = new Date(o.createdAt).getTime();
        const ageMs = Date.now() - orderTime;
        if (!isNaN(sessionStart)) {
          return orderTime >= sessionStart - 60000 && ageMs < 12 * 60 * 60 * 1000;
        } else {
          return ageMs < 4 * 60 * 60 * 1000;
        }
      }
      return false;
    });
  };

  const getTableStatus = (tableNum: number): TableStatus => {
    const tableOrders = getTableOrders(tableNum);
    const activeKitchenOrders = tableOrders.filter((o) => ACTIVE_STATUSES.includes(o.status));
    const t = tables.find((tbl) => Number(tbl.number) === tableNum);

    if (activeKitchenOrders.length > 0) {
      return "occupied";
    }

    if (tableOrders.length > 0 || (t && t.status === "occupied")) {
      return "occupied";
    }

    if (t) {
      if (t.status === "reserved") return "reserved";
      if (t.status === "maintenance") return "maintenance";
    }
    return "available";
  };

  const pendingSelfOrders = orders.filter(
    (o) => o.type === "Self Order" && o.status === "pending" && !o.acceptedById
  );

  const selectedTable    = tables.find((t) => t.id === selectedTableId) ?? null;
  const selectedTableNum = selectedTable ? Number(selectedTable.number) : null;
  const tableStatus: TableStatus = selectedTable ? getTableStatus(Number(selectedTable.number)) : "available";
  const activeTableOrders = selectedTableNum !== null ? getTableOrders(selectedTableNum) : [];
  // What came off this table's bill, and the deal that took it off. Without
  // surfacing this, every bill panel here reads Subtotal + Tax ≠ Grand Total
  // the moment an order carries an order-level discount.
  const activeTableDiscount = activeTableOrders.reduce((s, o) => s + Number(o.discount || 0), 0);
  const activeTableDealName = activeTableOrders.find((o) => o.appliedDealName)?.appliedDealName ?? null;

  const unpaidOrders = activeTableOrders.filter(isOrderUnpaid);
  const hasUnpaid = unpaidOrders.length > 0;
  const isSessionPaid = activeTableOrders.length > 0 && !hasUnpaid;

  const hasPendingCancellationOnTable = activeTableOrders.some((o) => o.hasPendingCancellationRequest);
  const canPayBill = hasUnpaid && !hasPendingCancellationOnTable;

  const hasSelectedTableFoodReady = selectedTableNum !== null && activeTableOrders.length > 0 && activeTableOrders.some(
    (o) => o.status === "ready" || o.kitchenStatus === "ready" || (o.items && o.items.some((i: any) => i.status === "ready" || i.kitchenStatus === "ready"))
  );

  const confirmedReservations = useMemo(() => {
    const pkt = new Date(Date.now() + 5 * 60 * 60 * 1000);
    const todayStr = pkt.toISOString().split("T")[0];
    return reservations.filter(r => {
      if (r.date !== todayStr) return false;
      if (r.status === "pending" || r.status === "cancelled" || r.status === "noShow" || r.status === "completed") return false;
      if (getEffectiveStatus(r) === "completed") return false;
      if (r.orderType && r.orderType !== "Dine In") return false;
      if (r.bookingType === "future_order") return false;
      return true;
    });
  }, [reservations, orders]);

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
  };

  const totalFloorCapacity = useMemo(() => {
    return tables.reduce((sum, t) => sum + Number(t.capacity || 0), 0);
  }, [tables]);

  const totalOccupiedPax = useMemo(() => {
    return tables
      .filter((t) => getTableStatus(Number(t.number)) === "occupied" || getTableStatus(Number(t.number)) === "bill-requested")
      .reduce((sum, t) => sum + getGuestsCount(t), 0);
  }, [tables, orders]);

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
      if (statusFilter === "reservations") return reservedTableNums.has(tNum) || t.status === "reserved";
      return true;
    });
  }, [tables, statusFilter, floorFilter, reservedTableNums, orders]);

  const categoryNames = ["All", ...cats.map((c) => c.name)];
  const filteredMenu   = menuItems.filter(
    (i) => menuCategory === "All" || i.category?.name === menuCategory
  );
  const cartTotal = cartItems.reduce((s, i) => s + i.price * i.qty - (i.discount || 0), 0);

  // Order-level deal (Promo Code / Minimum Spend). createOrder resolves one of
  // these server-side on every order whether the waiter asks for it or not, so
  // the cart has to preview it — otherwise the waiter quotes one figure and
  // the order is saved at another. Mirrors POS.tsx's identical block; the
  // basis is the raw cart total, matching what createOrder feeds
  // resolveOrderDiscount. Always Dine In — every WaiterPanel order is.
  const [dealPreview, setDealPreview] = useState<OrderCouponPreview | null>(null);
  const dealDiscount = dealPreview?.amount ?? 0;
  useEffect(() => {
    if (cartTotal <= 0) { setDealPreview(null); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      orderService
        .validateCoupon({ subtotal: cartTotal, orderType: "Dine In" })
        .then((res) => { if (!cancelled) setDealPreview(res); })
        .catch(() => { if (!cancelled) setDealPreview(null); });
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [cartTotal]);
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
    const custOrders = orders.filter(o => o.customerName === selectedCustomerData.name || (selectedCustomerData.phone && o.phone && o.phone.replace(/\D/g, "") === selectedCustomerData.phone.replace(/\D/g, "")));
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
        const byId = custId ? customers.find(c => c.id === custId) : undefined;
        const matched = byId
          ?? customers.find(c => c.name === orderWithCust.customerName || (orderWithCust.phone && c.phone && c.phone.replace(/\D/g, "") === orderWithCust.phone.replace(/\D/g, "")));
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
      markMine();
      await orderService.acceptSelfOrder(order.id);
      toast.success(`Table ${order.tableNumber} order accepted — now visible to kitchen`);
      await loadOrders();
    } catch (err: any) {
      toast.error(err?.message || "Failed to accept order");
    } finally {
      setAcceptingId(null);
    }
  };

  const rejectSelfOrder = async (order: OrderRecord) => {
    const rawReason = window.prompt("Reason for declining (optional):");
    if (rawReason === null) return; // user clicked Cancel — abort, don't reject anything
    setRejectingId(order.id);
    try {
      markMine();
      await orderService.rejectSelfOrder(order.id, rawReason || undefined);
      toast.success(`Table ${order.tableNumber} order declined`);
      await loadOrders();
    } catch (err: any) {
      toast.error(err?.message || "Failed to decline order");
    } finally {
      setRejectingId(null);
    }
  };

  // ── Cart ──

  const updateQty      = (id: string, d: number) => setCartItems((p) => p.map((o) => o.id === id ? { ...o, qty: Math.max(1, o.qty + d) } : o));
  const removeCartItem = (id: string)             => setCartItems((p) => p.filter((o) => o.id !== id));
  /** A deal redemption is one unit — removing any of its lines removes all
   *  of them, or a waiter could keep half a Fixed Bundle at its bundle
   *  price. Mirrors POS.tsx's removeDealGroup exactly. */
  const removeDealGroup = (dealLineId: string) => setCartItems((prev) => prev.filter((c) => c.dealLineId !== dealLineId));

  /** The cart's actual render rows: a plain item is its own row, but every
   *  CartItem sharing a dealLineId collapses into one row — mirrors
   *  POS.tsx's cartDisplayRows exactly. */
  const cartDisplayRows = useMemo(() => {
    const rows: ({ kind: "plain"; item: CartItem } | { kind: "deal"; dealLineId: string; dealName: string; items: CartItem[] })[] = [];
    const seenLineIds = new Set<string>();
    for (const item of cartItems) {
      if (item.dealLineId) {
        if (seenLineIds.has(item.dealLineId)) continue;
        seenLineIds.add(item.dealLineId);
        rows.push({
          kind: "deal",
          dealLineId: item.dealLineId,
          dealName: item.dealName || "Deal",
          items: cartItems.filter((c) => c.dealLineId === item.dealLineId),
        });
      } else {
        rows.push({ kind: "plain", item });
      }
    }
    return rows;
  }, [cartItems]);

  // ── Deals: add-to-cart — mirrors POS.tsx's addDealToCart family exactly,
  // priced at "Dine In" throughout since that's the only channel a waiter
  // ever sells on. Fixed Bundle and Buy X Get Y add their whole redemption
  // in one click; Customizable opens a choice dialog; % Discount opens an
  // eligible-item picker. ──
  const addDealToCart = (deal: DealRecord) => {
    if (isDealOutOfStock(deal)) { toast.error(`"${deal.name}" is out of stock`); return; }
    if (deal.type === "combo") { addComboDealToCart(deal); return; }
    if (deal.type === "buy_x_get_y") { addBogoDealToCart(deal); return; }
    if (deal.type === "option_combo") { openDealCustomize(deal); return; }
    if (deal.type === "percentage") { openDealItemPicker(deal); return; }
  };

  const addComboDealToCart = (deal: DealRecord) => {
    if (deal.components.length === 0) { toast.error(`"${deal.name}" has no items configured`); return; }
    const rows = deal.components.map((c) => {
      const menuItem: any = menuItems.find((m) => m.id === c.menuItemId);
      const variant = c.variantId ? menuItem?.variants?.find((v: any) => v.id === c.variantId) : undefined;
      return { component: c, menuItem, variant, unitPrice: menuItem ? menuItemPrice(menuItem, variant) : 0 };
    });
    if (rows.some((r) => !r.menuItem)) { toast.error(`A menu item in "${deal.name}" is no longer available`); return; }

    const grossAmounts = rows.map((r) => r.unitPrice * r.component.qty);
    const savings = Math.max(0, grossAmounts.reduce((s, v) => s + v, 0) - dealChannelPrice(deal, "Dine In"));
    const discounts = allocateDealDiscount(savings, grossAmounts);

    const lineId = `deal-${deal.id}-${Date.now()}`;
    const newItems: CartItem[] = rows.map((r, idx) => ({
      id: `${lineId}-${idx}`,
      name: `${r.menuItem.name}${r.variant ? ` (${r.variant.name})` : ""}`,
      price: r.unitPrice, qty: r.component.qty, discount: discounts[idx], modifiers: [],
      menuItemId: r.component.menuItemId, variantId: r.component.variantId,
      dealId: deal.id, dealName: deal.name, dealLineId: lineId,
    }));
    setCartItems((prev) => [...prev, ...newItems]);
    toast.success(`${deal.name} added to cart`);
  };

  const addBogoDealToCart = (deal: DealRecord) => {
    const { buy, get } = dealBogoSides(deal);
    if (buy.length === 0 || get.length === 0) { toast.error(`"${deal.name}" is not configured correctly`); return; }

    const lineId = `deal-${deal.id}-${Date.now()}`;
    const newItems: CartItem[] = [];
    for (const row of buy) {
      const menuItem: any = menuItems.find((m) => m.id === row.menuItemId);
      if (!menuItem) { toast.error(`A menu item in "${deal.name}" is no longer available`); return; }
      const variant = row.variantId ? menuItem.variants?.find((v: any) => v.id === row.variantId) : undefined;
      newItems.push({
        id: `${lineId}-buy-${newItems.length}`,
        name: `${menuItem.name}${variant ? ` (${variant.name})` : ""}`,
        price: menuItemPrice(menuItem, variant), qty: row.qty, discount: 0, modifiers: [],
        menuItemId: row.menuItemId, variantId: row.variantId,
        dealId: deal.id, dealName: deal.name, dealLineId: lineId, dealRole: "buy",
      });
    }
    for (const row of get) {
      const menuItem: any = menuItems.find((m) => m.id === row.menuItemId);
      if (!menuItem) { toast.error(`A menu item in "${deal.name}" is no longer available`); return; }
      const variant = row.variantId ? menuItem.variants?.find((v: any) => v.id === row.variantId) : undefined;
      const unitPrice = menuItemPrice(menuItem, variant);
      const variants = menuItem.variants ?? [];
      const cheapest = variants.length === 0 ? unitPrice : Math.min(...variants.map((v: any) => variantDineInPrice(v)));
      const cappedUnitPrice = capFreeUnitPrice(row.variantId, unitPrice, cheapest);
      const coveragePercent = dealChannelPercent(deal, "Dine In", 100);
      const freeUnitPrice = Math.round(cappedUnitPrice * (coveragePercent / 100) * 100) / 100;
      newItems.push({
        id: `${lineId}-get-${newItems.length}`,
        name: `${menuItem.name}${variant ? ` (${variant.name})` : ""}${freeUnitPrice <= 0 ? "" : freeUnitPrice >= unitPrice ? " (Free)" : " (Discounted)"}`,
        price: unitPrice, qty: row.qty, discount: freeUnitPrice * row.qty, modifiers: [],
        menuItemId: row.menuItemId, variantId: row.variantId,
        dealId: deal.id, dealName: deal.name, dealLineId: lineId, dealRole: "get",
      });
    }
    setCartItems((prev) => [...prev, ...newItems]);
    toast.success(`${deal.name} added to cart`);
  };

  const dealOptionKey = (menuItemId: string, variantId: string | null) => `${menuItemId}:${variantId ?? ""}`;

  const openDealCustomize = (deal: DealRecord) => {
    setCustomizingDeal(deal);
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
    const incomplete = deal.optionGroups.find((g) => (dealGroupSelections[g.id]?.length || 0) < g.minSelections);
    if (incomplete) { toast.error(`Select at least ${incomplete.minSelections} item(s) for "${incomplete.label}"`); return; }

    const picks: { groupId: string; option: DealOptionItemRecord }[] = [];
    for (const g of deal.optionGroups) {
      for (const key of dealGroupSelections[g.id] || []) {
        const option = g.options.find((o) => dealOptionKey(o.menuItemId, o.variantId) === key);
        if (option) picks.push({ groupId: g.id, option });
      }
    }
    if (picks.length === 0) { toast.error("Nothing selected"); return; }

    const rows = picks.map(({ groupId, option }) => {
      const menuItem: any = menuItems.find((m) => m.id === option.menuItemId);
      const variant = option.variantId ? menuItem?.variants?.find((v: any) => v.id === option.variantId) : undefined;
      return { groupId, option, menuItem, variant, unitPrice: (menuItem ? menuItemPrice(menuItem, variant) : 0) + (option.extraPrice || 0) };
    });
    if (rows.some((r) => !r.menuItem)) { toast.error(`A menu item in "${deal.name}" is no longer available`); return; }

    const grossAmounts = rows.map((r) => r.unitPrice);
    const savings = Math.max(0, grossAmounts.reduce((s, v) => s + v, 0) - dealChannelPrice(deal, "Dine In"));
    const discounts = allocateDealDiscount(savings, grossAmounts);

    const lineId = `deal-${deal.id}-${Date.now()}`;
    const newItems: CartItem[] = rows.map((r, idx) => ({
      id: `${lineId}-${idx}`,
      name: `${r.menuItem.name}${r.variant ? ` (${r.variant.name})` : ""}`,
      price: r.unitPrice, qty: 1, discount: discounts[idx], modifiers: [],
      menuItemId: r.option.menuItemId, variantId: r.option.variantId,
      dealId: deal.id, dealName: deal.name, dealLineId: lineId, dealGroupId: r.groupId,
    }));
    setCartItems((prev) => [...prev, ...newItems]);
    setShowDealCustomize(false);
    setCustomizingDeal(null);
    toast.success(`${deal.name} added to cart`);
  };

  const eligibleDealItems = useMemo(() => {
    if (!pickingDeal) return [];
    return menuItems.filter((m: any) =>
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
    const menuItem: any = menuItems.find((m) => m.id === pickedDealItemId);
    if (!menuItem) return;
    const variant = pickedDealVariantId ? menuItem.variants?.find((v: any) => v.id === pickedDealVariantId) : undefined;
    if ((menuItem.variants?.length ?? 0) > 0 && !variant) { toast.error("Pick a size"); return; }

    const unitPrice = menuItemPrice(menuItem, variant);
    const percent = dealChannelPercent(deal, "Dine In", deal.discountPercent ?? 0);
    const qty = Math.max(1, pickedDealQty);
    const discount = Math.min(unitPrice * qty, unitPrice * qty * (percent / 100));

    const lineId = `deal-${deal.id}-${Date.now()}`;
    const newItem: CartItem = {
      id: lineId,
      name: `${menuItem.name}${variant ? ` (${variant.name})` : ""}`,
      price: unitPrice, qty, discount, modifiers: [],
      menuItemId: menuItem.id, variantId: variant?.id ?? null,
      dealId: deal.id, dealName: deal.name, dealLineId: lineId,
    };
    setCartItems((prev) => [...prev, newItem]);
    setShowDealItemPicker(false);
    setPickingDeal(null);
    toast.success(`${deal.name} added to cart`);
  };

  /** Same "genuinely 0 units makeable right now" check addToOrder/
   *  confirmAddWithOptions already run for a plain menu item, reused here so
   *  a deal can't be added when a menu item it needs is out of stock. */
  const isMenuItemOutOfStock = (menuItemId: string, variantId: string | null): boolean => {
    const menuItem = menuItems.find((m) => m.id === menuItemId);
    if (!menuItem) return true;
    const variant = variantId ? menuItem.variants?.find((v) => v.id === variantId) : undefined;
    const avail = calculateFoodAvailability(menuItem.recipes || [], variant?.id ?? null, ingredientStockMap, productionStockMap);
    return avail.isRestricted && avail.availableQuantity === 0;
  };

  /** Whether a deal can be redeemed at all right now, given live stock —
   *  mirrors POS.tsx's isDealOutOfStock exactly. */
  const isDealOutOfStock = (deal: DealRecord): boolean => {
    if (deal.type === "combo") {
      return deal.components.some((c) => isMenuItemOutOfStock(c.menuItemId, c.variantId));
    }
    if (deal.type === "option_combo") {
      return deal.optionGroups.some((g) => g.options.every((o) => isMenuItemOutOfStock(o.menuItemId, o.variantId)));
    }
    if (deal.type === "percentage") {
      const eligible = menuItems.filter((m) =>
        deal.applicableItems.includes(m.id) || (m.categoryId && deal.applicableCategories.includes(m.categoryId))
      );
      if (eligible.length === 0) return false;
      return eligible.every((m) => {
        const variants = m.variants || [];
        return variants.length === 0
          ? isMenuItemOutOfStock(m.id, null)
          : variants.every((v) => isMenuItemOutOfStock(m.id, v.id));
      });
    }
    // buy_x_get_y
    const { buy, get } = dealBogoSides(deal);
    if (buy.length === 0 || get.length === 0) return false;
    return buy.some((r) => isMenuItemOutOfStock(r.menuItemId, r.variantId)) || get.some((r) => isMenuItemOutOfStock(r.menuItemId, r.variantId));
  };

  /** Everything the rich deal card needs — mirrors POS.tsx's
   *  dealCardPricing exactly, priced at Dine In. */
  const dealCardPricing = (deal: DealRecord): {
    lines: string[];
    priceLabel: string;
    regularLabel: string | null;
    regularStrike: boolean;
    savingsPercent: number;
  } => {
    if (deal.type === "combo") {
      const rows = deal.components.map((c) => {
        const menuItem: any = menuItems.find((m) => m.id === c.menuItemId);
        const variant = c.variantId ? menuItem?.variants?.find((v: any) => v.id === c.variantId) : undefined;
        return { c, menuItem, variant };
      });
      const lines = rows.filter((r) => r.menuItem).map((r) => `${r.c.qty}x ${r.menuItem.name}${r.variant ? ` (${r.variant.name})` : ""}`);
      const regular = rows.reduce((s, r) => (r.menuItem ? s + menuItemPrice(r.menuItem, r.variant) * r.c.qty : s), 0);
      const dealPrice = dealChannelPrice(deal, "Dine In");
      const savingsPercent = regular > dealPrice ? Math.round(((regular - dealPrice) / regular) * 100) : 0;
      return {
        lines,
        priceLabel: `Rs. ${dealPrice.toLocaleString()}`,
        regularLabel: regular > dealPrice ? `Rs. ${regular.toLocaleString()}` : null,
        regularStrike: true,
        savingsPercent,
      };
    }
    if (deal.type === "option_combo") {
      return {
        lines: deal.optionGroups.map((g) => g.label),
        priceLabel: `Rs. ${dealChannelPrice(deal, "Dine In").toLocaleString()}`,
        regularLabel: null,
        regularStrike: false,
        savingsPercent: 0,
      };
    }
    if (deal.type === "percentage") {
      const items = menuItems.filter((m: any) =>
        deal.applicableItems.includes(m.id) || (m.categoryId && deal.applicableCategories.includes(m.categoryId))
      );
      const lines = items.map((m: any) => m.name);
      const percent = dealChannelPercent(deal, "Dine In", deal.discountPercent ?? 0);
      const prices: number[] = [];
      items.forEach((m: any) => {
        if (m.variants?.length) m.variants.forEach((v: any) => prices.push(variantDineInPrice(v)));
        else prices.push(dineInPrice(m));
      });
      if (prices.length === 0) {
        return { lines, priceLabel: `${percent}% OFF`, regularLabel: null, regularStrike: false, savingsPercent: percent };
      }
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const afterMin = Math.round(min * (1 - percent / 100));
      const afterMax = Math.round(max * (1 - percent / 100));
      return {
        lines,
        priceLabel: afterMin === afterMax ? `Rs. ${afterMin.toLocaleString()}` : `Rs. ${afterMin.toLocaleString()} – ${afterMax.toLocaleString()}`,
        regularLabel: min === max ? `Rs. ${min.toLocaleString()}` : `Rs. ${min.toLocaleString()} – ${max.toLocaleString()}`,
        regularStrike: false,
        savingsPercent: percent,
      };
    }
    // buy_x_get_y
    const { buy, get } = dealBogoSides(deal);
    const lines: string[] = [];
    let buyTotal = 0, getTotal = 0, freeTotal = 0;
    buy.forEach((row) => {
      const menuItem: any = menuItems.find((m) => m.id === row.menuItemId);
      if (!menuItem) return;
      const variant = row.variantId ? menuItem.variants?.find((v: any) => v.id === row.variantId) : undefined;
      const unitPrice = menuItemPrice(menuItem, variant);
      buyTotal += unitPrice * row.qty;
      lines.push(`Buy ${row.qty}x ${menuItem.name}${variant ? ` (${variant.name})` : ""}`);
    });
    get.forEach((row) => {
      const menuItem: any = menuItems.find((m) => m.id === row.menuItemId);
      if (!menuItem) return;
      const variant = row.variantId ? menuItem.variants?.find((v: any) => v.id === row.variantId) : undefined;
      const unitPrice = menuItemPrice(menuItem, variant);
      const variants = menuItem.variants ?? [];
      const cheapest = variants.length === 0 ? unitPrice : Math.min(...variants.map((v: any) => variantDineInPrice(v)));
      const cappedUnitPrice = capFreeUnitPrice(row.variantId, unitPrice, cheapest);
      const coveragePercent = dealChannelPercent(deal, "Dine In", 100);
      const freeUnitPrice = Math.round(cappedUnitPrice * (coveragePercent / 100) * 100) / 100;
      getTotal += unitPrice * row.qty;
      freeTotal += freeUnitPrice * row.qty;
      lines.push(`Get ${row.qty}x ${menuItem.name}${variant ? ` (${variant.name})` : ""}${freeUnitPrice <= 0 ? "" : freeUnitPrice >= unitPrice ? " (Free)" : " (Discounted)"}`);
    });
    const regular = buyTotal + getTotal;
    const dealPrice = Math.round(buyTotal + (getTotal - freeTotal));
    const savingsPercent = regular > 0 ? Math.round((freeTotal / regular) * 100) : 0;
    return {
      lines,
      priceLabel: `Rs. ${dealPrice.toLocaleString()}`,
      regularLabel: regular > dealPrice ? `Rs. ${regular.toLocaleString()}` : null,
      regularStrike: true,
      savingsPercent,
    };
  };

  const resetExpansion = () => {
    setExpandedItemId(null);
    setSelectedVariant(null);
    setSelectedModifierQtys({});
  };

  const addToOrder = (item: MenuItemRecord) => {
    const hasVariants  = item.variants && item.variants.length > 0;
    const itemMods     = resolveModifiers(item);
    const hasModifiers = itemMods.length > 0;

    if (!hasVariants && !hasModifiers) {
      const avail = calculateFoodAvailability(item.recipes || [], null, ingredientStockMap, productionStockMap);
      if (avail.isRestricted && avail.availableQuantity === 0) {
        toast.error(`${item.name} is out of stock`);
        return;
      }
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
      setSelectedModifierQtys({});
    }
  };

  const confirmAddWithOptions = (item: MenuItemRecord) => {
    const hasVariants = item.variants && item.variants.length > 0;
    if (hasVariants && !selectedVariant) { toast.error("Please select a size"); return; }

    const avail = calculateFoodAvailability(item.recipes || [], selectedVariant?.id ?? null, ingredientStockMap, productionStockMap);
    if (avail.isRestricted && avail.availableQuantity === 0) {
      toast.error(`${item.name}${selectedVariant ? ` (${selectedVariant.name})` : ""} is out of stock`);
      return;
    }

    const itemMods  = resolveModifiers(item);
    const basePrice = selectedVariant ? selectedVariant.price : dineInPrice(item);
    const modsCost = Object.entries(selectedModifierQtys).reduce((sum, [mId, modQty]) => {
      const mod = itemMods.find((m: any) => m.id === mId || m.modifierId === mId);
      const unitPrice = resolveModifierPrice(mod, selectedVariant?.id);
      return sum + (unitPrice * modQty);
    }, 0);
    const totalPrice = basePrice + modsCost;
    const variantName = selectedVariant?.name;
    const modNames = Object.entries(selectedModifierQtys).map(([mId, modQty]) => {
      const mod = itemMods.find((m: any) => m.id === mId || m.modifierId === mId);
      const name = mod?.name ?? "";
      const unitPrice = resolveModifierPrice(mod, selectedVariant?.id);
      const pricePart = unitPrice > 0 ? ` (+${currency}${unitPrice * modQty})` : "";
      return modQty > 1 ? `${name} x${modQty}${pricePart}` : `${name}${pricePart}`;
    }).filter(Boolean);
    const modKey = Object.entries(selectedModifierQtys).map(([k, v]) => `${k}:${v}`).sort().join("-");
    const cartKey = `${item.id}-${variantName ?? "base"}-${modKey}`;

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

    const avail = calculateFoodAvailability(item.recipes || [], selectedVariant?.id ?? null, ingredientStockMap, productionStockMap);
    if (avail.isRestricted && avail.availableQuantity === 0) {
      toast.error(`${item.name}${selectedVariant ? ` (${selectedVariant.name})` : ""} is out of stock`);
      return;
    }

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

  // Pre-fills the Guests dialog (pax + linked reservation + customer) from a table's active
  // reservation, so the waiter sees the booked party size immediately instead of the table's
  // raw seating capacity — still freely adjustable via the +/- buttons or the dropdown below.
  const applyReservationToGuestsDialog = (res: Reservation) => {
    setSelectedReservationForSitting(res.id);
    if (res.guestCount) setGuestsCount(res.guestCount);
    const matchedCust = customers.find(c => c.name.toLowerCase() === res.customerName.toLowerCase() || (res.customerPhone && c.phone && c.phone.replace(/\D/g, "") === res.customerPhone.replace(/\D/g, "")));
    if (matchedCust && selectedTableNum !== null) {
      handleSelectCustomerForTable(matchedCust.id);
    }
  };

  const handlePlaceOrderClick = () => {
    if (selectedTable && selectedTable.status !== "occupied") {
      if (activeReservationForTable) {
        applyReservationToGuestsDialog(activeReservationForTable);
      } else {
        setGuestsCount(selectedTable.capacity);
      }
      setGuestsActionType("place-order");
      setShowGuestsDialog(true);
    } else {
      placeOrder(null);
    }
  };

  const handleStartSittingClick = () => {
    if (!selectedTable) return;
    if (activeReservationForTable) {
      applyReservationToGuestsDialog(activeReservationForTable);
    } else {
      setGuestsCount(selectedTable.capacity);
    }
    setGuestsActionType("start-sitting");
    setShowGuestsDialog(true);
  };

  const confirmGuestsCount = async () => {
    if (isSubmittingGuestsCount || startingSitting || placingOrder) return;
    setIsSubmittingGuestsCount(true);
    try {
      if (guestsActionType === "start-sitting") {
        await startSitting(guestsCount);
      } else if (guestsActionType === "place-order") {
        await placeOrder(guestsCount);
      }
      setSelectedReservationForSitting(null);
      setShowGuestsDialog(false);
    } catch (err) {
      console.error("Error in confirmGuestsCount", err);
      toast.error("Failed to complete action");
    } finally {
      setIsSubmittingGuestsCount(false);
    }
  };

  const placeOrder = async (guestsInput?: number | null) => {
    if (cartItems.length === 0 || selectedTableNum === null || placingOrder) return;
    setPlacingOrder(true);
    const subtotal = cartTotal;
    // Tax is charged on what's left after the order-level deal, and the server
    // keeps whatever `tax` we send while re-deriving the discount itself — so
    // these three must be computed off the same discounted base the backend
    // will use, or the saved total won't match the one the waiter just quoted.
    const taxable  = Math.max(0, subtotal - dealDiscount);
    const tax      = Math.round(taxable * (taxRate / 100));
    const total    = taxable + tax;
    try {
      markMine();
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
          name: i.name, price: i.price, qty: i.qty, discount: i.discount || 0, modifiers: i.modifiers ?? [],
          dealId: i.dealId || null, dealName: i.dealName || null, dealLineId: i.dealLineId || null,
          dealGroupId: i.dealGroupId || null, dealRole: i.dealRole || null,
        })),
      });
      if (selectedTable && selectedTable.status !== "occupied") {
        const tbl = selectedTable;
        const guests = guestsInput || tbl.capacity;
        // Don't hold the spinner on the table write — update local state
        // optimistically and let the request settle in the background
        // (useOrderEvents + the 180s poll reconcile it).
        tableService.updateTable(tbl.id, {
          status: "occupied",
          currentOrderId: `${Date.now()}:${guests}`
        })
          .then(updated => setTables(prev => prev.map(t => t.id === tbl.id ? updated : t)))
          .catch(() => {});
        // A new sitting starts here — any self-order session left over from a
        // previous, improperly-ended visit to this table must not leak into it.
        tableService.notifySelfOrderSessionEnded(tbl.id).catch(() => {});
      }
      toast.success("Order sent to kitchen!");
      setCartItems([]);
      setIsOrderingMode(false);
      // Fire-and-forget: createOrder already emitted order:created, which
      // useOrderEvents turns into a loadOrders() — no need to block the button
      // on a full 200-order refetch.
      loadOrders();
    } catch (err: any) {
      toast.error(err?.message || "Failed to send order");
    } finally {
      setPlacingOrder(false);
    }
  };

  const startSitting = async (guestsInput: number) => {
    if (!selectedTable || startingSitting) return;
    setStartingSitting(true);
    try {
      markMine();
      const guests = guestsInput || selectedTable.capacity;
      const targetResId = selectedReservationForSitting || activeReservationForTable?.id;
      const targetRes = reservations.find(r => r.id === targetResId) || activeReservationForTable;

      if (targetRes) {
        if (targetRes.status !== "seated" && targetRes.status !== "completed") {
          try {
            await reservationService.update(targetRes.id, { status: "seated" });
          } catch (err) {
            console.error("Failed linking reservation status to seated", err);
          }
        }

        if (targetRes.preOrderItems && targetRes.preOrderItems.length > 0 && targetRes.status !== "completed" && !targetRes.orderId) {
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
      }

      const wasAlreadyOccupied = selectedTable.status === "occupied";
      const updated = await tableService.updateTable(selectedTable.id, {
        status: "occupied",
        currentOrderId: `${Date.now()}:${guests}`
      });
      setTables(prev => prev.map(t => t.id === selectedTable.id ? updated : t));
      // Only clear self-order state when this newly occupies the table (a new
      // sitting) — not if somehow re-invoked on an already-occupied table with
      // a possibly still-active, legitimate self-order session.
      if (!wasAlreadyOccupied) {
        tableService.notifySelfOrderSessionEnded(selectedTable.id).catch(() => {});
      }
      toast.success(`Table ${selectedTable.number} session started`);
      await loadTables();
      await loadReservations();
    } catch {
      toast.error("Failed to start session");
    } finally {
      setStartingSitting(false);
    }
  };

  const endSitting = async () => {
    if (!selectedTable || selectedTableNum === null) return;
    if (activeTableOrders.some(o => o.hasPendingCancellationRequest)) {
      toast.warning("Cannot end sitting session while an order cancellation request is pending approval.");
      return;
    }
    if (hasUnpaid) {
      toast.warning("Please settle all active orders before ending the sitting session.");
      return;
    }
    const unservedOrders = activeTableOrders.filter(o => o.status === "pending" || o.status === "preparing");
    if (unservedOrders.length > 0) {
      toast.warning(`Cannot end sitting session while ${unservedOrders.length} order(s) are still being prepared in the kitchen. Please wait until food is Ready!`);
      return;
    }
    setEndingSitting(true);
    try {
      markMine();

      const uncompletedOrders = activeTableOrders.filter(o => o.status !== "completed");
      if (uncompletedOrders.length > 0) {
        const results = await Promise.allSettled(
          uncompletedOrders.map(o => orderService.updateOrderStatus(o.id, "completed"))
        );
        const failed = results
          .map((r, i) => ({ r, order: uncompletedOrders[i] }))
          .filter(({ r }) => r.status === "rejected");
        if (failed.length > 0) {
          console.error("Failed to complete orders during End Sitting:", failed.map(f => f.order.orderNumber));
          toast.warning(`Table released, but ${failed.length} order(s) could not be marked completed — check Order Monitor.`);
        }
      }

      if (activeReservationForTable && activeReservationForTable.status !== "completed") {
        await reservationService.update(activeReservationForTable.id, { status: "completed" }).catch(() => {});
      }

      await tableService.updateTable(selectedTable.id, { status: "available", currentOrderId: null });
      await tableService.notifySelfOrderSessionEnded(selectedTable.id).catch((err) => {
        console.error("Failed to clear self-order session on End Sitting — a stale session may linger until the next sitting starts at this table", err);
      });
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

  const openTableSlip = (overridePaymentMethod?: string) => {
    if (!selectedTable || activeTableOrders.length === 0) return;
    const slipItems: any[] = [];
    activeTableOrders.forEach((o) => {
      (o.items || []).forEach((item: any) => {
        slipItems.push({
          id: item.id,
          name: item.name,
          qty: Number(item.qty) || 1,
          price: Number(item.price) || 0,
          discount: Number(item.discount) || 0,
          modifiers: item.modifiers || [],
          notes: item.notes || null,
          dealName: item.dealName || null,
        });
      });
    });

    const subtotal = activeTableOrders.reduce((s, o) => s + Number(o.subtotal ?? o.total ?? 0), 0);
    const discountValue = activeTableOrders.reduce((s, o) => s + Number(o.discount || 0), 0);
    const taxValue = activeTableOrders.reduce((s, o) => s + Number(o.tax || 0), 0);
    const total = activeTableOrders.reduce((s, o) => s + Number(o.total || 0), 0);

    const custName = selectedCustomerData?.name 
      || activeTableOrders.find(o => o.customerName && o.customerName !== "Walk-in")?.customerName 
      || "Walk-in";
    const custPhone = selectedCustomerData?.phone 
      || activeTableOrders.find(o => o.phone)?.phone 
      || "";

    const primaryOrder = activeTableOrders[0];

    setPlacedOrderSlip({
      orderNumber: activeTableOrders.map(o => o.orderNumber).join(", ") || (primaryOrder ? primaryOrder.orderNumber : "TABLE-" + selectedTable.number),
      orderType: "Dine In",
      tableNumber: Number(selectedTable.number),
      customerName: custName,
      customerPhone: custPhone,
      customerAddress: undefined,
      staffName: user?.name || "Waiter",
      items: slipItems,
      subtotal: subtotal,
      discount: discountValue,
      tax: taxValue,
      total: total,
      advancePayment: currentAdvancePayment > 0 ? currentAdvancePayment : undefined,
      netPayable: Math.max(0, total - currentAdvancePayment),
      paymentMethod: overridePaymentMethod || activeTableOrders[0]?.paymentMethod || "Cash",
      dateStr: new Date().toLocaleDateString(),
      timeStr: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      restaurantName: settings?.restaurantName || "OVENISTO",
      restaurantAddress: settings?.address,
      restaurantPhone: settings?.phone,
      currency: currency || "Rs.",
    });
    setShowOrderPlacedModal(true);
  };

  const settleBilling = async (paymentMethod: string) => {
    if (!selectedTable || selectedTableNum === null) return;
    setSettlingBillingState(true);
    try {
      markMine();
      if (activeReservationForTable && activeReservationForTable.status !== "completed") {
        await reservationService.update(activeReservationForTable.id, { status: "completed" }).catch(() => {});
      }
      const unpaidOrders = activeTableOrders.filter(isOrderUnpaid);
      if (unpaidOrders.length > 0) {
        const isReservationDineIn = Boolean(activeReservationForTable);
        const mLower = paymentMethod.toLowerCase();
        const isCashMethod = mLower.includes("cash") && !mLower.includes("jazz") && !mLower.includes("easy") && !mLower.includes("online") && !mLower.includes("card") && !mLower.includes("mobile") && !mLower.includes("paisa");
        const shouldBeApproved = !isCashMethod || isReservationDineIn;

        await Promise.all(
          unpaidOrders.map((o) =>
            orderService.updateOrder(o.id, { paymentMethod, cashApproved: shouldBeApproved })
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
      openTableSlip(paymentMethod);
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
      markMine();
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
      // The sitting is now tied to a different physical table/QR code — the
      // self-order session (if any) at either the vacated source table or the
      // newly-occupied target table belongs to a different sitting and must
      // not be reachable by a fresh scan of either.
      tableService.notifySelfOrderSessionEnded(selectedTable.id).catch(() => {});
      tableService.notifySelfOrderSessionEnded(targetTable.id).catch(() => {});
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
    openTableSlip();
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
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-5 min-h-[calc(100vh-6.5rem)] lg:h-[calc(100vh-6.5rem)] min-w-0">

      {/* ── LEFT COLUMN: Selected Table Panel OR Cart Selection (Top-to-Bottom Fixed) ── */}
      {!isOrderingMode ? (
        <div className={cn(
          "w-full lg:w-80 xl:w-96 shrink-0 flex flex-col h-full bg-zinc-50 border border-zinc-200 dark:bg-zinc-900/30 dark:border-zinc-800/80 rounded-2xl p-4 lg:p-4.5 select-none transition-all shadow-xs overflow-hidden",
          !selectedTable && "hidden lg:flex"
        )}>
          {!selectedTable ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
              <UtensilsCrossed className="h-10 w-10 text-muted-foreground/30 animate-pulse" />
              <h3 className="font-bold text-sm text-foreground">No Table Selected</h3>
              <p className="text-xs text-muted-foreground max-w-[240px]">
                Select any table from the floor plan to start a sitting session or take orders.
              </p>
            </div>
          ) : (
            <div className="flex flex-col h-full justify-between gap-2.5 overflow-hidden">
              
              {/* Top / Middle Scroll-Safe Container */}
              <div className="space-y-2.5 min-h-0 flex flex-col flex-1 overflow-hidden">
                
                {/* Header info */}
                <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2.5 shrink-0">
                  <div className="space-y-0.5">
                    <h3 className="font-extrabold text-base text-foreground tracking-tight">Table {selectedTable.number}</h3>
                    <p className="text-[10px] text-muted-foreground/60 font-semibold uppercase tracking-wider">{selectedTable.floor || "Main Hall"}</p>
                    {tableStatus !== "available" && selectedTable.occupiedByName && (
                      <p className="text-[11px] text-primary/85 font-semibold mt-0.5">
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
                      {tableStatus === "available" ? "Free" : tableStatus}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full lg:hidden flex items-center justify-center border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/20"
                      onClick={() => setSelectedTableId(null)}
                    >
                      <X className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>

                {/* Customer Association */}
                <div className="bg-zinc-100/70 dark:bg-zinc-950/30 rounded-xl p-2.5 border border-zinc-200 dark:border-zinc-800/80 space-y-1.5 shrink-0">
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
                  <div className="space-y-4 py-3 flex-1 flex flex-col justify-center">
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
                  <div className="space-y-2 min-h-0 flex-1 flex flex-col overflow-hidden">
                    {/* Seating stats */}
                    <div className="bg-zinc-100/50 dark:bg-zinc-950/25 rounded-xl p-2.5 border border-zinc-200 dark:border-zinc-800/80 space-y-1.5 text-xs shrink-0">
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

                    {/* Active Orders List (compact inner scroll) */}
                    {activeTableOrders.length > 0 && (
                      <div className="space-y-1.5 min-h-0 flex-1 flex flex-col overflow-hidden">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider shrink-0">Active Orders ({activeTableOrders.length})</p>
                        <div className="space-y-1.5 overflow-y-auto pr-1 flex-1 min-h-[50px] max-h-[140px]">
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
                              <div key={o.id} className="bg-zinc-100/50 dark:bg-zinc-950/20 border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-2 space-y-1 text-xs">
                                <div className="flex justify-between items-center">
                                  <span className="font-bold text-foreground">Order #{o.orderNumber}</span>
                                  <Badge className={cn(
                                    "text-[9px] px-1.5 py-0.2 rounded-full font-bold uppercase border-none text-zinc-950",
                                    o.status === "pending" && "bg-amber-500",
                                    o.status === "preparing" && "bg-sky-500",
                                    o.status === "ready" && "bg-green-500 animate-pulse",
                                    o.status === "completed" && "bg-emerald-600 text-white font-black",
                                  )}>
                                    {o.status === "completed" ? "SERVED" : o.status}
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

                                {o.status === "completed" && (
                                  <p className="text-[11px] font-bold text-emerald-500 flex items-center gap-1">
                                    <CheckCircle2 className="h-3 w-3" /> Food served to table
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
                        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-xl p-2 text-center text-xs font-bold flex flex-col items-center justify-center gap-0.5 select-none shrink-0">
                          <div className="flex items-center gap-1.5 font-extrabold text-[11px]">
                            <CreditCard className="h-3.5 w-3.5" /> Advance Paid: {currency} {currentAdvancePayment.toLocaleString()}
                          </div>
                          <span className="text-[10px] font-medium text-amber-400/90">
                            Remaining Due: {currency} {netDue.toLocaleString()} (Pay bill when food ready)
                          </span>
                        </div>
                      );
                    })()}

                    {isSessionPaid && (() => {
                      const hasUnservedFood = activeTableOrders.some(o => o.status === "pending" || o.status === "preparing");
                      return (
                        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-xl p-2 text-center text-xs font-extrabold flex items-center justify-center gap-1.5 select-none animate-pulse shrink-0">
                          <Check className="h-3.5 w-3.5" /> {hasUnservedFood ? "Billing Paid" : "Billing Paid — Awaiting End Sitting"}
                        </div>
                      );
                    })()}

                    {hasPendingCancellationOnTable && (
                      <div className="bg-amber-500/15 border border-amber-500/30 text-amber-500 rounded-xl p-2 text-center text-[11px] font-extrabold flex items-center justify-center gap-1.5 select-none shrink-0 animate-pulse">
                        <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        Cancellation Pending Approval — Bill Locked
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Bottom Action Grid & Financial Summary */}
              {tableStatus !== "available" && (
                <div className="space-y-2.5 shrink-0 pt-2 border-t border-zinc-200 dark:border-zinc-800/80">
                  {/* Actions Grid */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <Button 
                      onClick={() => setIsOrderingMode(true)} 
                      className="gradient-primary text-primary-foreground font-bold rounded-xl h-9 w-full flex items-center justify-center gap-1.5 shadow-sm text-xs transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <ShoppingCart className="h-3.5 w-3.5" /> Place Order
                    </Button>
                    <Button 
                      onClick={() => {
                        const totalBill = activeTableOrders.reduce((s, o) => s + Number(o.total), 0);
                        const adv = currentAdvancePayment;
                        const netDue = Math.max(0, totalBill - adv);
                        setSettlePaymentMethod("Cash");
                        setWaiterGivenAmount(netDue);
                        setWaiterPaymentEntries([]);
                        setShowPayBillDialog(true);
                      }} 
                      disabled={!canPayBill || settlingBillingState} 
                      className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl h-9 w-full flex items-center justify-center gap-1.5 shadow-[0_4px_12px_rgba(16,185,129,0.25)] hover:shadow-[0_4px_16px_rgba(16,185,129,0.4)] transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] text-xs border-none"
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
                      className="font-bold border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/30 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-xl h-9 w-full flex items-center justify-center gap-1.5 text-xs transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <Eye className="h-3.5 w-3.5" /> View Order
                    </Button>
                    <Button 
                      onClick={() => setShowBillDialog(true)} 
                      disabled={activeTableOrders.length === 0} 
                      variant="outline" 
                      className="font-bold border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/30 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-xl h-9 w-full flex items-center justify-center gap-1.5 text-xs transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <Receipt className="h-3.5 w-3.5" /> View Bill
                    </Button>
                    <Button 
                      onClick={() => setShowMoveDialog(true)} 
                      disabled={movingTable}
                      variant="outline" 
                      className="font-bold border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/30 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-xl h-9 w-full flex items-center justify-center gap-1.5 text-xs transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
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
                      className="font-bold rounded-xl h-9 w-full flex items-center justify-center gap-1.5 shadow-sm text-xs transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                    >
                      {endingSitting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Power className="h-3.5 w-3.5" />
                      )}
                      End Sitting
                    </Button>
                  </div>

                  {/* Financial Summary */}
                  {activeTableOrders.length > 0 && (() => {
                    const subtotalSum = activeTableOrders.reduce((s, o) => s + Number(o.subtotal), 0);
                    const taxSum = activeTableOrders.reduce((s, o) => s + Number(o.tax), 0);
                    const totalSum = activeTableOrders.reduce((s, o) => s + Number(o.total), 0);
                    const advanceSum = activeTableOrders.reduce((s, o) => s + Number(o.advancePayment || 0), 0);
                    const netPayable = Math.max(0, totalSum - advanceSum);

                    return (
                      <div className="border-t border-zinc-200 dark:border-zinc-800/80 pt-2 space-y-1 select-none">
                        <div className="flex justify-between text-[11px] text-muted-foreground">
                          <span>Price</span>
                          <span>{currency} {subtotalSum.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-[11px] text-muted-foreground">
                          <span>Tax ({taxRate}%)</span>
                          <span>{currency} {taxSum.toLocaleString()}</span>
                        </div>
                        {advanceSum > 0 && (
                          <div className="flex justify-between text-[11px] text-emerald-400 font-semibold">
                            <span>Advance Paid Credit</span>
                            <span>- {currency} {advanceSum.toLocaleString()}</span>
                          </div>
                        )}
                        <Separator className="bg-zinc-200 dark:bg-zinc-800 my-1" />
                        <div className="flex justify-between text-xs font-extrabold text-foreground">
                          <span>{advanceSum > 0 ? "Net Amount Due" : "Grand Total"}</span>
                          <span className="text-primary font-black text-sm">
                            {currency} {netPayable.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Cart Selection Column in Ordering Mode */
        <div className="w-full lg:w-80 xl:w-96 shrink-0 flex flex-col justify-between h-full bg-zinc-50 border border-zinc-200 dark:bg-zinc-900/30 dark:border-zinc-800/80 rounded-2xl p-4 lg:p-4.5 space-y-3 select-none overflow-hidden">
          <div className="space-y-3 flex-grow overflow-hidden flex flex-col min-h-0">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2 shrink-0">
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
            <div className="space-y-1.5 overflow-y-auto pr-0.5 flex-1 min-h-0">
              {cartDisplayRows.map((row) => {
                if (row.kind === "deal") {
                  const gross = row.items.reduce((s, i) => s + i.price * i.qty, 0);
                  const discount = row.items.reduce((s, i) => s + (i.discount || 0), 0);
                  return (
                    <div key={row.dealLineId} className="flex items-center gap-3 px-3 py-2.5 bg-primary/[0.04] border border-primary/20 rounded-xl">
                      <div className="flex-1 min-w-0">
                        <span className="inline-flex items-center gap-1 text-[9px] font-bold text-primary uppercase tracking-wide">
                          <Gift className="h-3 w-3" /> Deal
                        </span>
                        <p className="text-xs font-bold truncate text-foreground leading-tight">{row.dealName}</p>
                        <p className="text-[9px] text-muted-foreground truncate">
                          {row.items.map((i) => `${i.qty}x ${i.name}`).join(", ")}
                        </p>
                        <p className="text-[11px] text-primary font-bold mt-0.5">{currency} {(gross - discount).toLocaleString()}</p>
                      </div>
                      <button onClick={() => removeDealGroup(row.dealLineId)} className="text-muted-foreground/45 hover:text-destructive p-1 ml-0.5 transition-colors shrink-0">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                }
                const item = row.item;
                return (
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
                );
              })}
              {cartItems.length === 0 && (
                <p className="text-center text-xs text-muted-foreground py-10">Cart is empty</p>
              )}
            </div>
          </div>

          {/* Confirm order footer */}
          <div className="border-t border-zinc-200 dark:border-zinc-800 pt-3 space-y-2.5 shrink-0">
            {dealDiscount > 0 && dealPreview && (
              <>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-mono text-muted-foreground">{currency} {cartTotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                  <span className="flex items-center gap-1 min-w-0">
                    <Tag className="h-3 w-3 shrink-0" />
                    <span className="truncate">{dealPreview.code ? `${dealPreview.dealName} (${dealPreview.code})` : dealPreview.dealName}</span>
                  </span>
                  <span className="font-mono shrink-0">-{currency} {dealDiscount.toLocaleString()}</span>
                </div>
              </>
            )}
            <div className="flex justify-between items-center text-xs">
              <span className="text-muted-foreground font-semibold">Total Amount</span>
              <span className="text-base font-extrabold text-primary">{currency} {Math.max(0, cartTotal - dealDiscount).toLocaleString()}</span>
            </div>
            <Button
              onClick={handlePlaceOrderClick}
              disabled={placingOrder || cartItems.length === 0}
              className="gradient-primary text-primary-foreground font-bold h-10 w-full flex items-center justify-center gap-2 rounded-xl shadow-md text-xs"
            >
              {placingOrder ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <><Check className="h-4 w-4" /> Place Order</>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ── RIGHT COLUMN: Actions/Stats Top Bar, Floor Map / Ordering Menu ── */}
      <div className="flex-1 flex flex-col min-w-0 h-full gap-3 overflow-hidden">
        
        {/* Top Actions & Stats Cards Row (Floor Plan mode only) */}
        {!isOrderingMode && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 w-full shrink-0">
            {[
              { key: "my_collection", count: `${currency} ${(myActiveCash?.totalExpected || 0).toLocaleString()}`, label: "My Collection", color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/30", Icon: Wallet },
              { key: "available",     count: stats.available,                              label: "Available",          color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/30", Icon: CircleDot },
              { key: "occupied",      count: stats.occupied,                               label: "Occupied",           color: "text-orange-500",  bg: "bg-orange-500/10",  border: "border-orange-500/30",  Icon: Users },
              { key: "capacity_pax",  count: `${totalFloorCapacity} / ${totalOccupiedPax}`, label: "Total / Seated Pax", color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/30",   Icon: UserCheck },
              { key: "reservations",  count: todayReservationsCount,                       label: "Today Reservations", color: "text-sky-400",     bg: "bg-sky-500/10",     border: "border-sky-500/30",     Icon: BookOpen },
            ].map(({ key, count, label, color, bg, border, Icon }) => {
              const isActive = statusFilter === key;
              return (
                <Card
                  key={key}
                  onClick={() => {
                    if (key === "my_collection") {
                      setShowMyCollectionDialog(true);
                      return;
                    }
                    if (key === "reservations") {
                      setShowTodayReservationsDialog(true);
                      return;
                    }
                    if (key === "capacity_pax") {
                      return;
                    }
                    setStatusFilter(prev => prev === key ? "all" : (key as any));
                  }}
                  className={cn(
                    "border bg-white dark:bg-zinc-900/40 rounded-xl shadow-xs cursor-pointer transition-all duration-200 hover:scale-[1.02] select-none",
                    isActive ? `ring-2 ring-primary ${border}` : "border-zinc-200 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700"
                  )}
                >
                  <CardContent className="p-2.5 flex items-center gap-2.5">
                    <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center shrink-0", bg)}>
                      <Icon className={cn("h-3.5 w-3.5", color)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-base lg:text-lg font-black tracking-tight leading-none truncate", color)}>{count}</p>
                      <p className="text-[10px] text-muted-foreground font-semibold truncate mt-0.5">{label}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* ── Self-Order Pending Requests Card ── */}
        {!isOrderingMode && pendingSelfOrders.length > 0 && (
          <div className="bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-card border border-amber-500/30 rounded-2xl p-3.5 shadow-xl space-y-3 animate-fadeInUp shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold shadow-xs animate-bounce">
                  <Bell className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-foreground text-sm leading-tight flex items-center gap-2">
                    Self-Order Customer Requests
                    <span className="bg-amber-500 text-white font-extrabold text-[10px] px-2 py-0.5 rounded-full shadow-xs">
                      {pendingSelfOrders.length} New
                    </span>
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Orders placed directly by table guests — approve to send to kitchen
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {pendingSelfOrders.map((order) => (
                <div
                  key={order.id}
                  className="bg-card rounded-xl p-3 border border-border/80 hover:border-amber-500/40 transition-all shadow-xs flex flex-col justify-between gap-2.5"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-xs px-2 py-0.5 rounded-lg bg-primary/10 text-primary border border-primary/20">
                          Table {order.tableNumber}
                        </span>
                        {order.guestCount && (
                          <span className="text-[10px] font-semibold text-muted-foreground px-1.5 py-0.5 rounded-md bg-secondary border border-border/40">
                            {order.guestCount} Pax
                          </span>
                        )}
                      </div>
                      <span className="font-extrabold text-primary text-sm">
                        {currency} {order.total.toLocaleString()}
                      </span>
                    </div>

                    <div className="text-xs space-y-0.5">
                      <p className="font-bold text-foreground flex items-center gap-1 text-[11px]">
                        <User className="h-3 w-3 text-muted-foreground" />
                        {order.customerName || "Table Guest"}
                        {order.phone && (
                          <span className="font-normal text-muted-foreground ml-1">({order.phone})</span>
                        )}
                      </p>
                    </div>

                    {/* Items Chip Breakdown */}
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {order.items.map((i, iIdx) => (
                        <span
                          key={i.id || iIdx}
                          className="bg-muted text-foreground font-semibold px-1.5 py-0.5 rounded text-[10px] border border-border/50"
                        >
                          {i.qty}x {i.name}
                        </span>
                      ))}
                    </div>

                    {/* Special Instructions Note if present */}
                    {((order as any).specialInstructions || order.futureNotes) && (
                      <div className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400 p-1.5 rounded-lg font-medium border border-amber-500/20">
                        📝 <span className="font-bold">Note:</span> {(order as any).specialInstructions || order.futureNotes}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-1.5 border-t border-border/50">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10 text-xs rounded-xl h-8 font-semibold"
                      disabled={rejectingId === order.id || acceptingId === order.id}
                      onClick={() => rejectSelfOrder(order)}
                    >
                      {rejectingId === order.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        "Decline"
                      )}
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 gradient-primary text-primary-foreground text-xs font-bold rounded-xl h-8 shadow-md shadow-primary/20 hover:opacity-95"
                      disabled={acceptingId === order.id || rejectingId === order.id}
                      onClick={() => acceptSelfOrder(order)}
                    >
                      {acceptingId === order.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <Check className="h-3.5 w-3.5 mr-1" /> Accept Order
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Floor Map View OR Menu Ordering View ── */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col">
          {!isOrderingMode ? (
            /* State A: Floor Map view */
            <div className="space-y-3 flex-1 flex flex-col">
              {/* Floor Filter Bar */}
              {floorsList.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 px-1 select-none shrink-0">
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
                <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3.5 pt-0.5 pb-6">
                  {filteredTables.map((t) => {
                    const tNum    = Number(t.number);
                    const status  = getTableStatus(tNum);
                    const tOrders = getTableOrders(tNum);
                    
                    const oldest = tOrders.length > 0 
                      ? tOrders[tOrders.length - 1].createdAt 
                      : (() => {
                          if (!t.currentOrderId) return null;
                          const parts = t.currentOrderId.split(":");
                          const ts = Number(parts[0]);
                          return !isNaN(ts) ? new Date(ts).toISOString() : null;
                        })();

                    const isOccupiedState = status === "occupied" || status === "bill-requested" || tOrders.length > 0;

                    const hasFoodReady = isOccupiedState && tOrders.length > 0 && tOrders.some(
                      (o) => o.status === "ready" || o.kitchenStatus === "ready" || (o.items && o.items.some((i: any) => i.status === "ready" || i.kitchenStatus === "ready"))
                    );

                    const statusDotColor =
                      status === "bill-requested" ? "bg-destructive animate-ping shadow-[0_0_8px_rgba(239,68,68,0.8)]" :
                      status === "available" ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" :
                      status === "occupied" ? (hasFoodReady ? "bg-orange-400 animate-ping shadow-[0_0_8px_rgba(249,115,22,0.8)]" : "bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]") :
                      "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]";

                    const cardStatusClass =
                      status === "bill-requested"
                        ? "border-destructive/80 bg-destructive/10 hover:border-destructive animate-pulse ring-2 ring-destructive/40 shadow-[0_0_16px_rgba(239,68,68,0.4)]"
                        : isOccupiedState
                        ? cn(
                            "border-orange-500/40 bg-orange-500/[0.03] dark:bg-orange-500/[0.05] hover:border-orange-500/80",
                            hasFoodReady && "animate-pulse ring-2 ring-orange-500/80 shadow-[0_0_18px_rgba(249,115,22,0.4)]"
                          )
                        : "border-emerald-500/40 bg-emerald-500/[0.03] dark:bg-emerald-500/[0.05] hover:border-emerald-500/80";

                    const elapsedStr = isOccupiedState && oldest ? getElapsed(oldest) : "";

                    // Find the primary active order for this table card
                    const latestOrder = tOrders.find(o => o.status === "preparing") 
                      || tOrders.find(o => o.status === "ready")
                      || tOrders.find(o => o.status === "pending")
                      || tOrders[0];

                    const maxCookingTime = latestOrder ? latestOrder.items.reduce((max, item) => Math.max(max, item.cookingTime || 0), 0) : 0;
                    const cookLimitMinutes = maxCookingTime > 0 ? maxCookingTime : 15;

                    const elapsedMs = latestOrder ? clock.getTime() - new Date(latestOrder.createdAt).getTime() : 0;
                    const elapsedSec = Math.floor(elapsedMs / 1000);
                    const elapsedFormatted = elapsedSec < 60 ? `${elapsedSec}s` : `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s`;

                    const prepStart = latestOrder && latestOrder.status === "preparing" && latestOrder.updatedAt 
                      ? new Date(latestOrder.updatedAt).getTime() 
                      : (latestOrder ? new Date(latestOrder.createdAt).getTime() : 0);
                    const elapsedPrepMs = clock.getTime() - prepStart;
                    const elapsedPrepSec = Math.floor(elapsedPrepMs / 1000);
                    const remainingSec = Math.max(0, cookLimitMinutes * 60 - elapsedPrepSec);
                    const countdownText = remainingSec === 0 ? "Overdue" : `${Math.floor(remainingSec / 60)}:${String(remainingSec % 60).padStart(2, "0")} left`;

                    return (
                      <div key={t.id} className="p-0.5">
                        <Card
                          onClick={() => handleTableClick(t)}
                          className={cn(
                            "shadow-md bg-white dark:bg-zinc-900/50 border rounded-2xl flex flex-col justify-between p-3 min-h-[160px] w-full cursor-pointer transition-all duration-300 relative hover:scale-[1.02]",
                            cardStatusClass,
                            selectedTableId === t.id && "ring-2 ring-orange-500 ring-offset-2 dark:ring-offset-zinc-950 shadow-lg border-orange-500"
                          )}
                        >
                          {/* Top Bar: Table Label, Status Dot & Capacity/Pax Pill */}
                          <div className="flex items-center justify-between w-full select-none shrink-0">
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "h-2.5 w-2.5 rounded-full shrink-0",
                                statusDotColor
                              )} />
                              <span className="text-sm font-black uppercase tracking-wider text-foreground">TABLE {t.number}</span>
                            </div>

                            {status === "bill-requested" ? (
                              <Badge className="bg-destructive text-destructive-foreground font-extrabold text-[10px] animate-pulse gap-1 px-2 py-0.5 shadow-xs border-none">
                                <Receipt className="h-3 w-3" /> Bill Req.
                              </Badge>
                            ) : isOccupiedState ? (
                              <div className="flex items-center gap-1 text-[10px] font-bold text-orange-500 bg-orange-500/10 px-2 py-0.5 rounded-full border border-orange-500/20">
                                <Users className="h-3 w-3 text-orange-500 shrink-0" />
                                <span>{getGuestsCount(t)} Pax</span>
                              </div>
                            ) : status === "reserved" ? (
                              <div className="flex items-center gap-1 text-[10px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                                <BookOpen className="h-3 w-3 text-amber-500 shrink-0" />
                                <span>Reserved</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 text-[10px] font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                <Users className="h-3 w-3 text-emerald-500 shrink-0" />
                                <span>{t.capacity} Seats</span>
                              </div>
                            )}
                          </div>

                          {/* Middle Section: Live Order Status Card */}
                          <div className="flex-1 flex flex-col justify-center my-1.5 w-full select-none">
                            {isOccupiedState && latestOrder ? (
                              <div className="space-y-1.5 w-full">
                                <div className="bg-zinc-100/80 dark:bg-zinc-950/70 rounded-xl p-2.5 border border-zinc-200/90 dark:border-zinc-800/80 shadow-2xs space-y-1.5">
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-xs text-foreground tracking-tight">Order #{latestOrder.orderNumber}</span>
                                    <Badge className={cn(
                                      "text-[9px] px-1.5 py-0.2 rounded-md font-extrabold uppercase border-none text-zinc-950",
                                      latestOrder.status === "pending" && "bg-amber-500",
                                      latestOrder.status === "preparing" && "bg-sky-500 text-white",
                                      latestOrder.status === "ready" && "bg-emerald-500 text-white animate-pulse",
                                      latestOrder.status === "completed" && "bg-emerald-600 text-white font-black",
                                    )}>
                                      {latestOrder.status === "completed" ? "SERVED" : latestOrder.status}
                                    </Badge>
                                  </div>

                                  {latestOrder.status === "pending" && (
                                    <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                                      <span>Wait Time:</span>
                                      <span className="font-semibold text-foreground font-mono">{elapsedFormatted}</span>
                                    </div>
                                  )}

                                  {latestOrder.status === "preparing" && (
                                    <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                                      <span>Remaining:</span>
                                      <span className={cn("font-bold font-mono", remainingSec < 120 ? "text-red-500" : "text-emerald-500")}>
                                        {countdownText}
                                      </span>
                                    </div>
                                  )}

                                  {latestOrder.status === "ready" && (
                                    <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-500">
                                      <Check className="h-3 w-3" /> Ready to serve
                                    </div>
                                  )}
                                </div>

                                {elapsedStr && (
                                  <div className="flex items-center justify-between text-[10px] px-1 text-muted-foreground">
                                    <span>Time elapsed:</span>
                                    <span className="text-primary font-bold flex items-center gap-1 font-mono">
                                      <Clock className="h-3 w-3" /> {elapsedStr}
                                    </span>
                                  </div>
                                )}
                              </div>
                            ) : isOccupiedState ? (
                              <div className="space-y-1.5 w-full">
                                <div className="bg-zinc-100/80 dark:bg-zinc-950/70 rounded-xl p-2.5 border border-zinc-200/90 dark:border-zinc-800/80 shadow-2xs text-center">
                                  <span className="text-xs font-bold text-orange-500">Sitting Active</span>
                                  <p className="text-[10px] text-muted-foreground">Awaiting Order</p>
                                </div>
                                {elapsedStr && (
                                  <div className="flex items-center justify-between text-[10px] px-1 text-muted-foreground">
                                    <span>Time elapsed:</span>
                                    <span className="text-primary font-bold flex items-center gap-1 font-mono">
                                      <Clock className="h-3 w-3" /> {elapsedStr}
                                    </span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="flex flex-col items-center justify-center py-2 text-center text-muted-foreground select-none">
                                <div className="h-7 w-7 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 mb-1">
                                  <UtensilsCrossed className="h-3.5 w-3.5" />
                                </div>
                                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Available</span>
                                <span className="text-[10px] text-muted-foreground">Ready for seating</span>
                              </div>
                            )}
                          </div>

                          {/* Bottom Bar: Floor Name and Status Badge */}
                          <div className="flex items-center justify-between w-full pt-1.5 shrink-0 select-none border-t border-zinc-200/60 dark:border-zinc-800/60 text-xs">
                            <span className="text-muted-foreground font-semibold truncate text-[11px]" title={t.floor || "Ground Floor"}>
                              {t.floor || "Ground Floor"}
                            </span>
                            <span className={cn(
                              "text-[10px] font-bold uppercase tracking-wider",
                              status === "bill-requested" ? "text-destructive" :
                              isOccupiedState ? "text-orange-500" :
                              status === "reserved" ? "text-amber-500" :
                              "text-emerald-500"
                            )}>
                              {status === "bill-requested" ? "Bill Req" :
                               isOccupiedState ? "Occupied" :
                               status === "reserved" ? "Reserved" :
                               "Available"}
                            </span>
                          </div>
                        </Card>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* State B: Menu Ordering POS Layout */
            <div className="space-y-3 flex-1 flex flex-col min-h-0 overflow-hidden">
              
              {/* Row 1: Search + Prominent Orange Back to Floor Plan Button */}
              <div className="flex items-center gap-2.5 shrink-0">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search food items..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-9 text-xs rounded-xl bg-white dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-800 focus:border-primary/40 focus:bg-background transition-colors text-foreground"
                  />
                </div>
                <Button
                  onClick={() => { setIsOrderingMode(false); setCartItems([]); resetExpansion(); }}
                  className="gradient-primary text-primary-foreground hover:opacity-95 font-bold h-9 px-4 rounded-xl shadow-md gap-1.5 shrink-0 text-xs transition-opacity"
                >
                  <ArrowLeft className="h-4 w-4" /> Back to Floor Plan
                </Button>
              </div>

              {/* Row 2: Complete Categories horizontal bar with counts */}
              <div className="flex items-center gap-1.5 border-b border-zinc-200 dark:border-zinc-800/60 pb-2 overflow-x-auto scrollbar-none shrink-0">
                <button
                  onClick={() => { setMenuCategory("__deals__"); resetExpansion(); }}
                  className={cn(
                    "px-3 py-1.5 text-xs rounded-xl whitespace-nowrap font-medium transition-all flex items-center gap-1.5 shrink-0",
                    menuCategory === "__deals__"
                      ? "gradient-primary text-primary-foreground shadow-md font-bold"
                      : "bg-white dark:bg-card border border-zinc-200 dark:border-zinc-800 text-muted-foreground hover:text-foreground hover:bg-muted/50 hover:border-zinc-300 dark:hover:border-zinc-700"
                  )}
                >
                  <Gift className="h-3.5 w-3.5" />
                  <span>Deals</span>
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.2 rounded-full font-bold",
                    menuCategory === "__deals__" ? "bg-black/20 text-white" : "bg-muted text-muted-foreground"
                  )}>
                    {sellableDeals.length}
                  </span>
                </button>
                {categoryNames.map((cat) => {
                  const count = cat === "All"
                    ? menuItems.filter((i) => i.available !== false).length
                    : menuItems.filter((i) => i.available !== false && (i.category?.name === cat || (i as any).category === cat)).length;
                  return (
                    <button
                      key={cat}
                      onClick={() => { setMenuCategory(cat); resetExpansion(); }}
                      className={cn(
                        "px-3 py-1.5 text-xs rounded-xl whitespace-nowrap font-medium transition-all flex items-center gap-1.5 shrink-0",
                        menuCategory === cat
                          ? "gradient-primary text-primary-foreground shadow-md font-bold"
                          : "bg-white dark:bg-card border border-zinc-200 dark:border-zinc-800 text-muted-foreground hover:text-foreground hover:bg-muted/50 hover:border-zinc-300 dark:hover:border-zinc-700"
                      )}
                    >
                      <span>{cat}</span>
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.2 rounded-full font-bold",
                        menuCategory === cat ? "bg-black/20 text-white" : "bg-muted text-muted-foreground"
                      )}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Row 3: Menus Grid (POS Layout) */}
              <div className="flex-1 overflow-y-auto pr-1 pb-4">
                {menuCategory === "__deals__" ? (
                  sellableDeals.length === 0 ? (
                    <div className="col-span-full text-center py-12 text-muted-foreground">
                      <Gift className="h-8 w-8 mx-auto opacity-20 mb-2" />
                      <p className="text-sm">No deals are currently running</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 auto-rows-max">
                      {sellableDeals
                        .filter(deal => searchQuery === "" || deal.name.toLowerCase().includes(searchQuery.toLowerCase()))
                        .map((deal) => {
                          const badge = dealFormatBadge[deal.type];
                          const BadgeIcon = badge.icon;
                          const pricing = dealCardPricing(deal);
                          const outOfStock = isDealOutOfStock(deal);
                          return (
                            <button
                              key={deal.id}
                              disabled={outOfStock}
                              onClick={() => addDealToCart(deal)}
                              className={cn(
                                "bg-white dark:bg-card rounded-2xl border border-zinc-200 dark:border-zinc-800/80 overflow-hidden hover:shadow-xl hover:border-primary/40 transition-all duration-200 text-left group relative flex flex-col hover:-translate-y-0.5 shadow-xs",
                                outOfStock && "opacity-60 hover:shadow-none hover:border-zinc-200 dark:hover:border-zinc-800 hover:translate-y-0 cursor-not-allowed"
                              )}
                            >
                              <div className="aspect-[16/9] w-full relative overflow-hidden border-b border-zinc-200 dark:border-zinc-800/40 bg-muted/40">
                                {deal.image ? (
                                  <img src={deal.image} alt={deal.name} className={cn("w-full h-full object-cover group-hover:scale-105 transition-transform duration-300", outOfStock && "grayscale")} />
                                ) : (
                                  <div className="w-full h-full bg-gradient-to-br from-card via-muted/60 to-primary/10 flex items-center justify-center">
                                    <Gift className="h-8 w-8 text-primary/25 group-hover:text-primary/40 group-hover:scale-110 transition-all duration-300" />
                                  </div>
                                )}
                                <div className="absolute top-1.5 left-1.5 flex items-center gap-1 text-[9px] font-bold text-primary-foreground bg-primary/90 backdrop-blur-xs px-1.5 py-0.5 rounded-md shadow-xs">
                                  <BadgeIcon className="h-3 w-3" />
                                  {badge.label}
                                </div>
                                {outOfStock && (
                                  <div className="absolute inset-0 bg-background/85 backdrop-blur-xs flex items-center justify-center">
                                    <span className="text-[10px] font-bold text-destructive-foreground bg-destructive px-2 py-0.5 rounded-md shadow-xs">Out of Stock</span>
                                  </div>
                                )}
                              </div>

                              <div className="p-2.5 flex flex-col gap-1.5 flex-1">
                                <p className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">{deal.name}</p>
                                {deal.description && (
                                  <p className="text-[10px] text-muted-foreground line-clamp-2">{deal.description}</p>
                                )}
                                {pricing.lines.length > 0 && (
                                  <div className="bg-muted/40 border border-zinc-200 dark:border-zinc-800/60 rounded-lg px-2 py-1.5 space-y-0.5">
                                    {pricing.lines.map((line, i) => (
                                      <p key={i} className="text-[10px] text-foreground/80 font-medium">• {line}</p>
                                    ))}
                                  </div>
                                )}
                                <div className="mt-auto pt-1 flex items-end justify-between gap-1">
                                  <div>
                                    {pricing.regularLabel && (
                                      <span className={cn("text-[9px] text-muted-foreground font-mono block", pricing.regularStrike && "line-through")}>
                                        {pricing.regularStrike ? pricing.regularLabel : `was ${pricing.regularLabel}`}
                                      </span>
                                    )}
                                    <span className="font-mono font-extrabold text-sm text-primary">{pricing.priceLabel}</span>
                                  </div>
                                  {pricing.savingsPercent > 0 && (
                                    <span className="text-[9px] font-bold text-primary bg-primary/10 border border-primary/30 px-1.5 py-0.5 rounded shrink-0">
                                      SAVE {pricing.savingsPercent}%
                                    </span>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                    </div>
                  )
                ) : filteredMenu.filter(item => searchQuery === "" || item.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? (
                  <div className="col-span-full text-center py-12 text-muted-foreground">
                    <Search className="h-8 w-8 mx-auto opacity-20 mb-2" />
                    <p className="text-sm">No items found</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 auto-rows-max">
                    {filteredMenu
                      .filter(item => searchQuery === "" || item.name.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map((item) => {
                        const hasVariants  = item.variants && item.variants.length > 0;
                        const itemMods     = resolveModifiers(item);
                        const hasModifiers = itemMods.length > 0;
                        const isExpanded   = expandedItemId === item.id;
                        const baseItemPrice = dineInPrice(item);
                        const variantsCount = item.variants?.length || 0;
                        const outOfStock = isFullyOutOfStock(item.recipes || [], (item.variants || []).map((v) => v.id), ingredientStockMap, productionStockMap);

                        return (
                          <Fragment key={item.id}>
                            <button
                              disabled={outOfStock}
                              onClick={() => addToOrder(item)}
                              className={cn(
                                "bg-white dark:bg-card rounded-2xl border border-zinc-200 dark:border-zinc-800/80 p-2 hover:shadow-xl hover:border-primary/40 transition-all duration-200 text-left group relative flex flex-col justify-between hover:-translate-y-0.5 shadow-xs",
                                isExpanded && "ring-2 ring-primary border-primary bg-primary/5 shadow-md",
                                outOfStock && "opacity-60 hover:shadow-none hover:border-zinc-200 dark:hover:border-zinc-800 hover:translate-y-0 cursor-not-allowed"
                              )}
                            >
                              <div className="aspect-[4/3] rounded-xl overflow-hidden mb-2 relative border border-zinc-200 dark:border-zinc-800/60 w-full bg-muted/40">
                                {item.image ? (
                                  <img src={item.image} alt={item.name} className={cn("w-full h-full object-cover group-hover:scale-105 transition-transform duration-300", outOfStock && "grayscale")} />
                                ) : (
                                  <div className="w-full h-full bg-gradient-to-br from-card via-muted/60 to-primary/10 flex flex-col items-center justify-center relative overflow-hidden group-hover:from-card group-hover:to-primary/20 transition-colors">
                                    <Utensils className="h-8 w-8 text-primary/25 group-hover:text-primary/40 group-hover:scale-110 transition-all duration-300" />
                                    <span className="absolute bottom-1.5 right-1.5 text-[10px] font-extrabold tracking-wider bg-background/80 text-primary px-1.5 py-0.5 rounded-md border border-primary/20 backdrop-blur-xs shadow-xs">
                                      {item.name.charAt(0)}
                                    </span>
                                  </div>
                                )}
                                {outOfStock ? (
                                  <div className="absolute inset-0 bg-background/85 backdrop-blur-xs flex items-center justify-center">
                                    <span className="text-[10px] font-bold text-destructive-foreground bg-destructive px-2 py-0.5 rounded-md shadow-xs">Out of Stock</span>
                                  </div>
                                ) : variantsCount > 0 ? (
                                  <div className="absolute top-1.5 right-1.5">
                                    <span className="text-[9px] px-1.5 py-0.5 bg-background/85 backdrop-blur-xs text-foreground font-semibold rounded-md border border-zinc-200 dark:border-zinc-800 shadow-2xs">
                                      {variantsCount} Sizes
                                    </span>
                                  </div>
                                ) : null}
                              </div>

                              <div>
                                <p className="text-xs font-bold text-foreground truncate group-hover:text-primary transition-colors">{item.name}</p>
                                <div className="flex items-center justify-between mt-1">
                                  <p className="text-xs text-primary font-extrabold">
                                    {hasVariants
                                      ? `${currency} ${variantDineInPrice(item.variants[0])}–${variantDineInPrice(item.variants[item.variants.length - 1])}`
                                      : `${currency} ${baseItemPrice.toLocaleString()}`}
                                  </p>
                                  {(item as any).cookingTime > 0 && (
                                    <span className="text-[9px] text-muted-foreground flex items-center gap-0.5 font-medium bg-muted/50 px-1.5 py-0.5 rounded-md">
                                      <Timer className="h-2.5 w-2.5" />{(item as any).cookingTime}m
                                    </span>
                                  )}
                                </div>
                              </div>
                            </button>

                            {/* Expanded options drawer inside the grid */}
                            {isExpanded && (
                              <div className="col-span-full bg-white dark:bg-card border border-primary/30 rounded-2xl p-3.5 shadow-lg animate-in slide-in-from-top-2 space-y-3">
                                <div className="flex items-center gap-3 pb-2 border-b border-zinc-200 dark:border-zinc-800/60">
                                  {item.image ? (
                                    <img src={item.image} alt={item.name} className="h-12 w-12 rounded-xl object-cover" />
                                  ) : (
                                    <div className="h-12 w-12 rounded-xl gradient-primary flex items-center justify-center text-primary-foreground font-bold">{item.name.charAt(0)}</div>
                                  )}
                                  <div>
                                    <p className="font-bold text-sm text-foreground">{item.name}</p>
                                    <p className="text-primary font-extrabold text-sm">
                                      {currency} {((selectedVariant ? selectedVariant.price : baseItemPrice) + Object.entries(selectedModifierQtys).reduce((s, [mId, q]) => {
                                        const m = itemMods.find((x: any) => x.id === mId || x.modifierId === mId);
                                        return s + (resolveModifierPrice(m, selectedVariant?.id) * q);
                                      }, 0)).toLocaleString()}
                                    </p>
                                  </div>
                                </div>

                                {hasVariants && (
                                  <div>
                                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">Choose Size</p>
                                    <div className="flex gap-2 flex-wrap">
                                      {item.variants.map((v) => {
                                        const vPrice = variantDineInPrice(v);
                                        const vAvail = calculateFoodAvailability(item.recipes || [], v.id, ingredientStockMap, productionStockMap);
                                        const vOutOfStock = vAvail.isRestricted && vAvail.availableQuantity === 0;
                                        return (
                                          <button
                                            key={v.id}
                                            disabled={vOutOfStock}
                                            onClick={() => setSelectedVariant(selectedVariant?.id === v.id ? null : { id: v.id, name: v.name, price: vPrice })}
                                            className={cn(
                                              "px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1",
                                              vOutOfStock
                                                ? "opacity-50 cursor-not-allowed line-through bg-muted/40 border-zinc-200 dark:border-zinc-800 text-muted-foreground"
                                                : selectedVariant?.id === v.id
                                                ? "gradient-primary text-primary-foreground border-transparent shadow-sm font-bold"
                                                : "bg-card border-zinc-200 dark:border-zinc-800 text-foreground hover:border-zinc-300 dark:hover:border-zinc-700"
                                            )}
                                          >
                                            <span>{v.name}</span>
                                            <span className="opacity-80">· {currency} {vPrice.toLocaleString()}</span>
                                            {vOutOfStock && <span className="ml-1 text-destructive no-underline">(Out of Stock)</span>}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                {hasModifiers && (
                                  <div>
                                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">Extras & Addons</p>
                                    <div className="flex gap-2 flex-wrap">
                                      {itemMods.map((mod) => {
                                        const modId = mod.id || (mod as any).modifierId;
                                        const qty = selectedModifierQtys[modId] || 0;
                                        const isSelected = qty > 0;
                                        const unitPrice = resolveModifierPrice(mod, selectedVariant?.id);
                                        return (
                                          <div
                                            key={modId}
                                            className={cn(
                                              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs border transition-all select-none",
                                              isSelected
                                                ? "bg-primary/10 border-primary/50 text-primary font-bold ring-1 ring-primary/40"
                                                : "bg-card border-zinc-200 dark:border-zinc-800 text-muted-foreground hover:border-zinc-300 dark:hover:border-zinc-700 hover:text-foreground"
                                            )}
                                          >
                                            <button
                                              type="button"
                                              onClick={() => setSelectedModifierQtys((prev) => {
                                                const curr = prev[modId] || 0;
                                                if (curr > 0) {
                                                  const { [modId]: _, ...rest } = prev;
                                                  return rest;
                                                }
                                                return { ...prev, [modId]: 1 };
                                              })}
                                              className="flex items-center gap-1 cursor-pointer"
                                            >
                                              <span>{mod.name}</span>
                                              {unitPrice > 0 ? (
                                                <span className="font-normal opacity-80">+{currency}{unitPrice}</span>
                                              ) : (
                                                <span className="text-[10px] opacity-60">Free</span>
                                              )}
                                            </button>

                                            {isSelected && (
                                              <div className="flex items-center gap-1 ml-1 pl-1.5 border-l border-primary/30">
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedModifierQtys((prev) => {
                                                      const curr = prev[modId] || 1;
                                                      if (curr <= 1) {
                                                        const { [modId]: _, ...rest } = prev;
                                                        return rest;
                                                      }
                                                      return { ...prev, [modId]: curr - 1 };
                                                    });
                                                  }}
                                                  className="h-4 w-4 rounded bg-primary/20 hover:bg-primary/30 flex items-center justify-center text-primary font-bold text-[11px]"
                                                >
                                                  -
                                                </button>
                                                <span className="w-3 text-center font-bold text-[11px]">{qty}</span>
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedModifierQtys((prev) => ({
                                                      ...prev,
                                                      [modId]: (prev[modId] || 0) + 1,
                                                    }));
                                                  }}
                                                  className="h-4 w-4 rounded bg-primary/20 hover:bg-primary/30 flex items-center justify-center text-primary font-bold text-[11px]"
                                                >
                                                  +
                                                </button>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                <div className="flex gap-2 pt-1">
                                  <Button
                                    size="sm"
                                    className="flex-1 gradient-primary text-primary-foreground h-9 text-xs font-bold rounded-xl shadow-md"
                                    onClick={() => confirmAddWithOptions(item)}
                                  >
                                    <Plus className="h-3.5 w-3.5 mr-1" /> Add to Cart
                                  </Button>
                                  {hasModifiers && (
                                    <Button size="sm" variant="outline" className="h-9 text-xs rounded-xl border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/30 font-semibold" onClick={() => addWithoutExtras(item)}>
                                      No Extras
                                    </Button>
                                  )}
                                </div>
                              </div>
                            )}
                          </Fragment>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Customizable (option_combo) Deal — choice group picker */}
      <Dialog open={showDealCustomize} onOpenChange={(open) => { setShowDealCustomize(open); if (!open) setCustomizingDeal(null); }}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary shrink-0" />
              <span>{customizingDeal?.name}</span>
            </DialogTitle>
            <DialogDescription>Pick an item for each step below, then add the deal to the order.</DialogDescription>
          </DialogHeader>
          {customizingDeal && (
            <div className="space-y-5">
              {customizingDeal.optionGroups.map((g, idx) => {
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
                        const menuItem: any = menuItems.find((m) => m.id === o.menuItemId);
                        const variant = o.variantId ? menuItem?.variants?.find((v: any) => v.id === o.variantId) : undefined;
                        const isChecked = selected.includes(key);
                        const optionOutOfStock = isMenuItemOutOfStock(o.menuItemId, o.variantId);
                        return (
                          <button
                            key={key}
                            disabled={optionOutOfStock}
                            onClick={() => toggleDealOption(g.id, key, g.maxSelections)}
                            className={cn(
                              "w-full flex items-start gap-3 p-3 rounded-xl border text-left text-sm transition-colors",
                              optionOutOfStock
                                ? "opacity-50 cursor-not-allowed border-border bg-muted/30"
                                : isChecked ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/30"
                            )}
                          >
                            <Checkbox checked={isChecked} disabled={optionOutOfStock} className="mt-0.5 shrink-0 pointer-events-none" />
                            <div className="min-w-0 space-y-1">
                              <p className={cn("leading-snug break-words", isChecked && !optionOutOfStock ? "font-semibold text-primary" : "font-medium text-foreground")}>
                                {menuItem?.name || "Item"}{variant ? ` (${variant.name})` : ""}
                              </p>
                              {optionOutOfStock && (
                                <span className="inline-block text-[10px] font-semibold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">Out of Stock</span>
                              )}
                            </div>
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
            <Button className="gradient-primary text-primary-foreground" onClick={confirmDealCustomize}>Add to Cart</Button>
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
                  {eligibleDealItems.map((m: any) => {
                    const itemVariants = m.variants || [];
                    const itemOutOfStock = itemVariants.length === 0
                      ? isMenuItemOutOfStock(m.id, null)
                      : itemVariants.every((v: any) => isMenuItemOutOfStock(m.id, v.id));
                    return (
                      <SelectItem key={m.id} value={m.id} disabled={itemOutOfStock}>
                        {m.name}{itemOutOfStock && " (Out of Stock)"}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            {(() => {
              const menuItem: any = eligibleDealItems.find((m: any) => m.id === pickedDealItemId);
              const variants = menuItem?.variants || [];
              if (variants.length === 0) return null;
              return (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Size</label>
                  <Select value={pickedDealVariantId || ""} onValueChange={setPickedDealVariantId}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select a size" /></SelectTrigger>
                    <SelectContent>
                      {variants.map((v: any) => {
                        const variantOutOfStock = isMenuItemOutOfStock(menuItem.id, v.id);
                        return (
                          <SelectItem key={v.id} value={v.id} disabled={variantOutOfStock}>
                            {v.name}{variantOutOfStock && " (Out of Stock)"}
                          </SelectItem>
                        );
                      })}
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
            <Button className="gradient-primary text-primary-foreground" disabled={!pickedDealItemId} onClick={confirmDealItemPick}>Add to Cart</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              {activeTableDiscount > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-medium">
                  <span className="truncate pr-2">{activeTableDealName ?? "Discount"}</span>
                  <span className="shrink-0">- {currency} {activeTableDiscount.toLocaleString()}</span>
                </div>
              )}
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

      {/* ── Pay Bill Dialog (POS High-Craft Checkout Style) ── */}
      <Dialog open={showPayBillDialog} onOpenChange={setShowPayBillDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-[490px] p-5 gap-0 overflow-hidden rounded-3xl bg-card/95 backdrop-blur-xl border border-border/80 shadow-2xl shadow-black/40">

          {/* Modal Header with Icon Badge */}
          <div className="flex items-center justify-between pb-3 border-b border-border/40">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-500 shadow-inner">
                <Receipt className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground tracking-tight">Payment Checkout</DialogTitle>
                <p className="text-[11px] text-muted-foreground">Settle Table {selectedTable?.number} billing</p>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 border-orange-500/40 text-orange-500 bg-orange-500/10 rounded-full">
              Table {selectedTable?.number}{selectedTable?.floorName ? ` · ${selectedTable.floorName}` : ""}
            </Badge>
          </div>

          <div className="pt-3.5 space-y-3 max-h-[82vh] overflow-y-auto pr-0.5">

            {/* 1. Order Summary Card */}
            <div className="bg-muted/20 hover:bg-muted/30 transition-colors p-3.5 rounded-2xl border border-border/50 space-y-2.5">
              {/* Customer Row */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-semibold">{selectedCustomerData?.name || "Walk-in Customer"}</span>
                  {selectedCustomerData?.phone && (
                    <span className="text-[11px] text-muted-foreground font-mono">({selectedCustomerData.phone})</span>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {activeTableOrders.length} {activeTableOrders.length === 1 ? "order" : "orders"}
                </span>
              </div>

              {/* Items List snippet */}
              {(() => {
                const allItems = activeTableOrders.flatMap(o => (o.items || []).map(item => ({ ...item, orderNum: o.orderNumber })));
                if (allItems.length === 0) return null;
                return (
                  <div className="bg-background/70 rounded-xl p-2.5 border border-border/40 space-y-1.5 text-xs max-h-24 overflow-y-auto">
                    {allItems.map((item: any, idx: number) => (
                      <div key={item.id || idx} className="flex justify-between items-center text-xs">
                        <span className="truncate pr-2 text-muted-foreground">
                          <span className="inline-flex items-center justify-center h-4 px-1.5 rounded-md bg-muted/60 text-foreground font-mono font-semibold text-[10px] mr-1.5">
                            {item.qty}x
                          </span>
                          {item.name}
                        </span>
                        <span className="font-mono font-semibold text-foreground shrink-0 tabular-nums">
                          Rs. {((Number(item.price) * Number(item.qty)) - Number(item.discount || 0)).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Financial Calculation Breakdown */}
              {(() => {
                const subtotalSum = activeTableOrders.reduce((s, o) => s + Number(o.subtotal), 0);
                const taxSum = activeTableOrders.reduce((s, o) => s + Number(o.tax), 0);
                const totalSum = activeTableOrders.reduce((s, o) => s + Number(o.total), 0);
                const netAmountDue = Math.max(0, totalSum - currentAdvancePayment);

                return (
                  <div className="space-y-1 pt-1 text-xs border-t border-border/40">
                    <div className="flex justify-between text-muted-foreground text-[11px]">
                      <span>Subtotal</span>
                      <span className="font-mono tabular-nums">Rs. {subtotalSum.toLocaleString()}</span>
                    </div>
                    {activeTableDiscount > 0 && (
                      <div className="flex justify-between text-emerald-500 text-[11px]">
                        <span>{activeTableDealName ?? "Discount"}</span>
                        <span className="font-mono tabular-nums">-Rs. {activeTableDiscount.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-muted-foreground text-[11px]">
                      <span>GST Tax ({taxRate}%)</span>
                      <span className="font-mono tabular-nums">Rs. {taxSum.toLocaleString()}</span>
                    </div>
                    {currentAdvancePayment > 0 && (
                      <div className="flex justify-between text-emerald-500 font-semibold text-[11px]">
                        <span>Advance Paid Credit</span>
                        <span className="font-mono tabular-nums">-Rs. {currentAdvancePayment.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-1.5 border-t border-border/40 font-bold">
                      <span className="uppercase tracking-wider text-[11px] text-muted-foreground">Order Total</span>
                      <span className="text-2xl font-black text-amber-500 dark:text-amber-400 font-mono tracking-tight tabular-nums">
                        {currency} {netAmountDue.toLocaleString()}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* 2. Unified Settlement Card */}
            {(() => {
              const totalSum = activeTableOrders.reduce((s, o) => s + Number(o.total), 0);
              const netAmountDue = Math.max(0, totalSum - currentAdvancePayment);
              const waiterEntriesTotal = waiterPaymentEntries.reduce((s, e) => s + e.amount, 0);
              const waiterTotalPaid = waiterEntriesTotal;
              const waiterTotalDue = Math.max(0, netAmountDue - waiterEntriesTotal);

              return (
                <div className="bg-muted/20 p-3.5 rounded-2xl border border-border/50 space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">Payment Method &amp; Amount</span>
                    <span className="font-mono text-muted-foreground text-[11px]">
                      {waiterPaymentEntries.length > 0 ? (
                        waiterTotalPaid > netAmountDue ? (
                          <span className="text-emerald-500 font-bold">Change: Rs. {(waiterTotalPaid - netAmountDue).toLocaleString()}</span>
                        ) : (
                          <>Remaining: <strong className={cn(waiterTotalDue > 0 ? "text-amber-500 font-bold" : "text-emerald-500 font-bold")}>Rs. {waiterTotalDue.toLocaleString()}</strong></>
                        )
                      ) : (
                        <>Due: <strong className="text-foreground font-bold">Rs. {netAmountDue.toLocaleString()}</strong></>
                      )}
                    </span>
                  </div>

                  {/* Method Chips */}
                  <div className="grid grid-cols-2 gap-2">
                    {(settings.paymentMethods ?? ["Cash", "JazzCash", "EasyPaisa", "Credit Card"]).map(pm => {
                      const IconComponent = getPaymentIcon(pm);
                      const isSelected = settlePaymentMethod === pm;
                      return (
                        <button
                          key={pm}
                          type="button"
                          onClick={() => setSettlePaymentMethod(pm)}
                          className={cn(
                            "flex items-center justify-center gap-2 h-10 rounded-xl border text-xs font-semibold transition-all",
                            isSelected
                              ? "border-2 border-orange-500 bg-orange-500/10 text-orange-500 font-bold shadow-sm shadow-orange-500/10"
                              : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                          )}
                        >
                          <IconComponent className="h-4 w-4 shrink-0" />
                          <span>{pm}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Amount Input with Add Button */}
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-muted-foreground">Rs.</span>
                      <Input
                        type="number"
                        placeholder={`Amount (Due: ${waiterPaymentEntries.length > 0 ? waiterTotalDue : netAmountDue})`}
                        value={waiterGivenAmount === 0 ? "" : waiterGivenAmount}
                        onChange={(e) => setWaiterGivenAmount(Number(e.target.value))}
                        className="h-10 pl-9 text-sm font-mono font-bold rounded-xl border-border/70 focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="h-10 px-4 shrink-0 gap-1.5 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-xl shadow-sm"
                      onClick={() => {
                        const amt = waiterGivenAmount > 0 ? waiterGivenAmount : waiterTotalDue;
                        if (amt <= 0) { toast.error("Enter a valid payment amount"); return; }
                        const nextTotal = waiterEntriesTotal + amt;
                        setWaiterPaymentEntries(prev => [...prev, { id: `pay-${Date.now()}`, method: settlePaymentMethod, amount: amt }]);
                        setWaiterGivenAmount(Math.max(0, netAmountDue - nextTotal));
                      }}
                    >
                      <Plus className="h-4 w-4" />Add
                    </Button>
                  </div>

                  {/* Added Payment Entries List */}
                  {waiterPaymentEntries.length > 0 && (
                    <div className="space-y-1.5 pt-0.5">
                      {waiterPaymentEntries.map(e => (
                        <div key={e.id} className="flex items-center justify-between text-xs bg-muted/40 border border-border/40 rounded-xl px-3 py-2">
                          <span className="font-semibold text-foreground">{e.method}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-emerald-500 tabular-nums">Rs. {e.amount.toLocaleString()}</span>
                            <button
                              onClick={() => {
                                setWaiterPaymentEntries(prev => {
                                  const updated = prev.filter(x => x.id !== e.id);
                                  const newTotal = updated.reduce((s, x) => s + x.amount, 0);
                                  setWaiterGivenAmount(Math.max(0, netAmountDue - newTotal));
                                  return updated;
                                });
                              }}
                              className="text-destructive/70 hover:text-destructive transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}

                      <div className="flex justify-between items-center pt-2 border-t border-border/40 text-xs">
                        <span className="text-muted-foreground font-medium">Total Settled:</span>
                        <span className={cn("font-mono font-bold tabular-nums", waiterTotalPaid >= netAmountDue ? "text-emerald-500" : "text-amber-500")}>
                          Rs. {waiterTotalPaid.toLocaleString()} / Rs. {netAmountDue.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Change Return Banner when customer overpays */}
                  {waiterTotalPaid > netAmountDue && (
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold transition-all animate-in fade-in">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        <span>Change Return:</span>
                      </span>
                      <span className="font-mono text-sm tabular-nums">Rs. {(waiterTotalPaid - netAmountDue).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 3. Primary Action Button */}
            {(() => {
              const totalSum = activeTableOrders.reduce((s, o) => s + Number(o.total), 0);
              const netAmountDue = Math.max(0, totalSum - currentAdvancePayment);
              const waiterEntriesTotal = waiterPaymentEntries.reduce((s, e) => s + e.amount, 0);
              const isReady = !settlingBillingState && waiterPaymentEntries.length > 0 && waiterEntriesTotal >= netAmountDue;

              return (
                <div className="pt-1.5">
                  <Button
                    className={cn(
                      "w-full h-12 text-sm font-bold rounded-2xl gap-2 transition-all active:scale-[0.99]",
                      isReady && !settlingBillingState
                        ? "bg-orange-600 hover:bg-orange-500 text-white font-bold shadow-sm"
                        : "bg-muted text-muted-foreground opacity-50 cursor-not-allowed"
                    )}
                    onClick={() => {
                      const finalPaymentMethod = waiterPaymentEntries.length > 0
                        ? waiterPaymentEntries.map(e => `${e.method}: Rs.${e.amount}`).join(", ")
                        : settlePaymentMethod;
                      settleBilling(finalPaymentMethod);
                    }}
                    disabled={!isReady || settlingBillingState}
                  >
                    {settlingBillingState ? (
                      <><Loader2 className="h-4 w-4 animate-spin" />Processing Settlement...</>
                    ) : (
                      <><Check className="h-4 w-4" />Confirm Pay</>
                    )}
                  </Button>
                </div>
              );
            })()}

          </div>
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
                    if (val === "none") {
                      setSelectedReservationForSitting(null);
                    } else {
                      const resObj = confirmedReservations.find(r => r.id === val);
                      if (resObj) applyReservationToGuestsDialog(resObj);
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
              disabled={isSubmittingGuestsCount || startingSitting || placingOrder}
              className="gradient-primary text-primary-foreground font-bold rounded-xl flex-1 flex items-center justify-center gap-1.5 shadow-md transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {(isSubmittingGuestsCount || startingSitting || placingOrder) ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Starting...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" /> {guestsActionType === "start-sitting" ? "Start Sitting" : "Confirm Order"}
                </>
              )}
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

      {/* My Collection Dialog */}
      <Dialog open={showMyCollectionDialog} onOpenChange={setShowMyCollectionDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <Wallet className="h-5 w-5" />
              My Collection & Active Balance
            </DialogTitle>
            <DialogDescription>
              Active table sales collected under your account.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Total Card */}
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold block">Total Expected Collection</span>
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                {currency} {(myActiveCash?.totalExpected || 0).toLocaleString()}
              </span>
            </div>

            {/* Sales Breakdown */}
            <div className="flex flex-wrap gap-2 text-center text-xs justify-center">
              {(settings?.paymentMethods && settings.paymentMethods.length > 0 ? settings.paymentMethods : ['Cash', 'Credit Card', 'Account', 'JazzCash', 'EasyPaisa']).map((m) => {
                const val = myActiveCash?.byMethod?.[m] ?? (m.toLowerCase() === 'cash' ? (myActiveCash?.expectedCash || 0) : m.toLowerCase().includes('card') ? (myActiveCash?.expectedCard || 0) : 0);
                return (
                  <div key={m} className="p-2 rounded-lg bg-card border border-border flex-1 min-w-[75px]">
                    <span className="text-muted-foreground block text-[10px] uppercase truncate">{m}</span>
                    <span className="font-bold text-foreground font-mono">{currency} {val.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>

            {/* Orders List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span>Active Orders ({myActiveCash?.orderCount || 0})</span>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {myActiveCash?.orders && myActiveCash.orders.length > 0 ? (
                  myActiveCash.orders.map((ord: any) => (
                    <div key={ord.id} className="p-2 rounded-lg bg-card border border-border/60 flex items-center justify-between text-xs gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold font-mono">#{ord.orderNo || ord.orderNumber || ord.id.slice(-6)}</span>
                          {ord.channel && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 font-semibold border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                              {ord.channel}
                            </Badge>
                          )}
                        </div>
                        <span className="text-muted-foreground">({ord.paymentMethod || 'Cash'})</span>
                      </div>
                      <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400 shrink-0">
                        {currency} {(Number(ord.staffAmount ?? ord.total ?? 0)).toLocaleString()}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-xs text-muted-foreground">
                    No active uncleared orders found.
                  </div>
                )}
              </div>
            </div>

            {/* Manager Notice */}
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Hand this cash over to the Manager to clear your balance.</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMyCollectionDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Order Placed / Settled Print Options Modal (KOT, Bill, Dual) ── */}
      <OrderPlacedPrintModal
        open={showOrderPlacedModal}
        onOpenChange={setShowOrderPlacedModal}
        slipData={placedOrderSlip}
      />
    </div>
  );
};

export default WaiterPanel;

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import type { OrderItem, Order, OrderType, CustomerType, OrderModificationLog } from "@/data/mock-data";
import { orderService, type OrderRecord } from "@/services/order.service";
import { cancellationRequestService, type CancellationRequestRecord } from "@/services/cancellationRequest.service";
import { menuService } from "@/services/menu.service";
import { customerService, type CustomerRecord } from "@/services/customer.service";
import { userService } from "@/services/user.service";
import { settingsService, type SettingsRecord } from "@/services/settings.service";
import { inventoryService, type IngredientRecord } from "@/services/inventory.service";
import { shiftService, type ShiftRecord } from "@/services/shift.service";
import { deliveryService, type RiderRecord } from "@/services/delivery.service";
import { tableService, type TableRecord } from "@/services/table.service";
import { reservationService, type Reservation as ReservationRecord } from "@/services/reservation.service";
import { useVisiblePolling } from "@/hooks/use-visible-polling";
import { useOrderEvents } from "@/hooks/use-order-events";
import { useTableEvents } from "@/hooks/use-table-events";
import { useReservationEvents } from "@/hooks/use-reservation-events";
import { useSelfMutationGuard } from "@/hooks/use-self-mutation-guard";
import { useQuery } from "@tanstack/react-query";
import { cashSettlementService } from "@/services/cashSettlement.service";
import { getSocket } from "@/lib/socket";
import { useModuleEvents } from "@/hooks/use-module-events";
import { Search, Plus, Minus, X, ShoppingCart, FileText, Printer, ArrowLeft, Trash2, User, Users, MapPin, Phone, Flame, Check, CreditCard, Banknote, Smartphone, RotateCcw, Download, ClipboardList, AlertTriangle, UtensilsCrossed, CalendarClock, Calendar, Timer, ChefHat, Tag, Zap, History, Monitor, BookOpen, StickyNote, Eye, Building2, Crown, CircleAlert, Bell, DollarSign, Package, Ban, Truck, ShoppingBag, Utensils, AlertCircle, CheckCircle2, Clock, Loader2, Wallet, Info, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Link, useLocation } from "react-router-dom";
import { cn, formatPakistaniPhone } from "@/lib/utils";
import { api } from "@/services/api";
import { generateInvoicePDF } from "@/lib/generate-invoice-pdf";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import type { Shift } from "@/contexts/DataContext";
import { getRiderCollectAmount } from "@/utils/deliveryPayment";

interface CartItem extends OrderItem {
  modifiers?: string[];
  cookingTime?: number;
  notes?: string;
  menuItemId?: string;
  variantId?: string | null;
}

/** Resolve price based on order type — falls back to base `price` */
function resolvePrice(target: any, orderType: string): number {
  if (!target) return 0;
  const map: Record<string, string> = {
    "Dine In": "dineInPrice",
    "Take Away": "takeAwayPrice",
    "Delivery": "deliveryPrice",
    "Foodpanda": "foodpandaPrice",
  };
  const key = map[orderType];
  if (key && target[key] != null) return Number(target[key]);
  return Number(target.price ?? 0);
}

interface DraftOrder {
  id: string;
  items: CartItem[];
  customer: string;
  orderType: OrderType;
  tableNumber?: number;
  deliveryAddress?: string;
  phone?: string;
  createdAt: Date;
}

interface PaymentEntry {
  id: string;
  method: string;
  amount: number;
}

const orderTypes: OrderType[] = ["Dine In", "Take Away", "Delivery"];
// tableNumbers kept as fallback; backend tables loaded at runtime

const getPaymentIcon = (methodName: string) => {
  const name = methodName.toLowerCase();
  if (name.includes("cash")) return Banknote;
  if (name.includes("card") || name.includes("bank") || name.includes("hbl") || name.includes("visa") || name.includes("master")) return CreditCard;
  if (name.includes("phone") || name.includes("mobile") || name.includes("jazz") || name.includes("paisa") || name.includes("easypaisa")) return Smartphone;
  return CreditCard;
};

const quickDenominations = [10, 20, 50, 100, 500, 1000];

// Roles that can populate the "Waiter" (serving staff) selector — Waiters only.
const WAITER_ASSIGNMENT_ROLES = ['Waiter', 'waiter'];
// Cancellation-request "Send Approval Request To" — only managers/admins can approve.
const CANCEL_APPROVER_ROLES = ['Super Admin', 'Admin', 'Manager'];
// Cancellation-request "Responsible Person" — rank-and-file staff only, never a
// manager/admin (those are the approver pool above, kept mutually exclusive).
const CANCEL_RESPONSIBLE_ROLES = ['Cashier', 'Kitchen Staff', 'Kitchen Manager', 'Waiter'];

const POS = () => {
  const { orders: localOrdersData, customers: customersList, foodMenuItems: localFoodMenuItems, foodCategories: localFoodCategories, modifiers: localModifiers, kitchens: localKitchens, ingredients, addItem, updateItem: updateDataItem, shifts, settings, riders: deliveryRiders, deals, updateSettings } = useData();
  const { user } = useAuth();
  const location = useLocation();
  const { markMine, isLikelyOwnEcho } = useSelfMutationGuard();

  // ── API data state (overrides localStorage) ──
  const [apiOrders, setApiOrders] = useState<any[]>([]);
  const [apiMenuItems, setApiMenuItems] = useState<any[]>([]);
  const [apiCategories, setApiCategories] = useState<any[]>([]);
  const [apiModifiers, setApiModifiers] = useState<any[]>([]);
  const [apiKitchens, setApiKitchens] = useState<any[]>([]);
  const [apiCustomers, setApiCustomers] = useState<CustomerRecord[]>([]);
  const [apiStaff, setApiStaff] = useState<any[]>([]);
  const [apiApprovers, setApiApprovers] = useState<any[]>([]);
  const [apiResponsibleStaff, setApiResponsibleStaff] = useState<any[]>([]);
  const [apiSettings, setApiSettings] = useState<SettingsRecord | null>(null);
  const [apiLowStockItems, setApiLowStockItems] = useState<IngredientRecord[]>([]);
  const [apiReservations, setApiReservations] = useState<ReservationRecord[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Order ids with a cancellation request I've filed that's still pending — the
  // per-order gate that keeps a filed order's "Cancel" button locked without
  // touching every other order's (each order's request state is independent).
  const [myPendingCancelOrderIds, setMyPendingCancelOrderIds] = useState<Set<string>>(new Set());

  // Cash Hub / Active balance for logged in user
  const [showCashHeldDialog, setShowCashHeldDialog] = useState(false);
  const { data: myActiveCash, refetch: refetchActiveCash } = useQuery({
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
      refetchActiveCash();
    }
  };

  useModuleEvents(["cashSettlement:created", "order:created", "order:updated", "delivery:status_updated"], refetchMyActiveCash);
  useVisiblePolling(refetchMyActiveCash, 30000);

  // Prefer API settings; fall back to localStorage settings
  const effectiveSettings = apiSettings ?? settings;
  const taxRate = ((effectiveSettings?.taxRate ?? 16) as number) / 100;

  // Normalize an API OrderRecord to match the mock Order field names
  const normalizeApiOrder = useCallback((o: OrderRecord): any => ({
    ...o,
    customer: o.customerName || 'Walk-in',
    staff: o.acceptedByName || o.staffName || '',
    phone: o.phone || '',
    date: o.date ? new Date(o.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    time: o.time || '',
    items: (o.items || []).map((i: any) => ({
      id: i.id,
      name: i.name,
      price: Number(i.price),
      qty: i.qty,
      discount: Number(i.discount),
      modifiers: i.modifiers || [],
      cookingTime: i.cookingTime || 0,
      notes: i.notes || '',
      status: i.status ?? 'active',
    })),
    subtotal: Number(o.subtotal),
    discount: Number(o.discount),
    tax: Number(o.tax),
    total: Number(o.total),
    advancePayment: Number(o.advancePayment),
    tableNumber: o.tableNumber ?? undefined,
    deliveryAddress: o.deliveryAddress ?? undefined,
  }), []);

  const allOrdersData: Order[] = apiOrders.length > 0 ? apiOrders : localOrdersData;

  // Normalized menu items: convert category object → string, ensure all prices are numbers
  const foodMenuItems = useMemo(() => {
    const source = apiMenuItems.length > 0 ? apiMenuItems : localFoodMenuItems;
    return source.map((item: any) => ({
      ...item,
      category: typeof item.category === 'object' && item.category !== null
        ? item.category.name || ''
        : item.category || '',
      price: Number(item.price),
      variants: (item.variants || []).map((v: any) => ({
        ...v,
        price: Number(v.price),
      })),
    }));
  }, [apiMenuItems, localFoodMenuItems]);

  const foodCategories = apiCategories.length > 0 ? apiCategories : localFoodCategories;
  const modifiers = useMemo(() => {
    const src = apiModifiers.length > 0 ? apiModifiers : localModifiers;
    return src.map((m: any) => ({ ...m, price: Number(m.price) }));
  }, [apiModifiers, localModifiers]);
  // Normalize kitchens: API uses assignedCategories, mock uses categories
  const kitchens = useMemo(() => {
    const source = apiKitchens.length > 0 ? apiKitchens : localKitchens;
    return source.map((k: any) => ({
      ...k,
      categories: k.categories ?? k.assignedCategories ?? [],
      assignedCategories: k.assignedCategories ?? k.categories ?? [],
    }));
  }, [apiKitchens, localKitchens]);

  const loadApiOrders = useCallback(async () => {
    try {
      const { data } = await orderService.getOrders({ limit: 200 });
      setApiOrders(data.map(normalizeApiOrder));
    } catch {
      // fallback to localOrdersData
    }
  }, [normalizeApiOrder]);

  // Which of MY orders already have a pending cancellation request — so the "Cancel"
  // button only locks for that specific order, not every order in the list.
  const loadMyPendingCancellations = useCallback(async () => {
    try {
      const requests = await cancellationRequestService.list({ status: "pending" });
      setMyPendingCancelOrderIds(new Set(requests.map(r => r.orderId)));
    } catch {
      // non-critical — worst case the button stays enabled and a duplicate request 400s
    }
  }, []);

  useEffect(() => {
    // Load all data from API on mount
    loadApiOrders();
    loadMyPendingCancellations();
    menuService.getMenuItems({ limit: 500 }).then(data => setApiMenuItems(data)).catch(() => {});
    menuService.getCategories('active').then(data => setApiCategories(data)).catch(() => {});
    menuService.getModifiers().then(data => setApiModifiers(data)).catch(() => {});
    orderService.getKitchens().then(data => setApiKitchens(data)).catch(() => {});
    customerService.getCustomers({ limit: 500 }).then(res => setApiCustomers(res.data)).catch(() => {});
    // getStaffPicker (not getUsers) — accessible to every POS-facing role, not just
    // Manager+, so Cashier/Waiter/Floor Manager can populate this dropdown too. This one
    // powers the "Waiter" (serving staff) selector only — the cancellation-request
    // approver/responsible-person pickers are fetched per-order (see the Cancel button
    // below), scoped to that specific order's outlet.
    userService.getStaffPicker(WAITER_ASSIGNMENT_ROLES).then(staffList => {
      setApiStaff(staffList);
      if (staffList.length > 0) {
        setSelectedStaff(prev => {
          const match = staffList.find(s => s.name === prev);
          return match ? match.name : staffList[0].name;
        });
      }
    }).catch(() => {});
    settingsService.getSettings().then(s => {
      setApiSettings({ ...s, taxRate: Number(s.taxRate) });
      updateSettings({
        restaurantName: s.restaurantName || "",
        phone: s.phone || "",
        email: s.email || "",
        currency: s.currency || "Rs.",
        taxName: s.taxName || "GST",
        taxRate: Number(s.taxRate ?? 16),
        address: s.address || "",
        receiptHeader: s.receiptHeader || "",
        tableManagement: s.tableManagement,
        onlineOrders: s.onlineOrders,
        paymentMethods: s.paymentMethods,
      });
    }).catch(() => {});
    inventoryService.getIngredients({ status: 'active', lowStock: true }).then(data => setApiLowStockItems(data)).catch(() => {});
    reservationService.getAll({ upcoming: true }).then(data => setApiReservations(data)).catch(() => {});
  }, [loadApiOrders, loadMyPendingCancellations]);

  const loadApiReservations = useCallback(() => {
    reservationService.getAll({ upcoming: true }).then(data => setApiReservations(data)).catch(() => {});
  }, []);

  // Refresh orders and reservations on real-time push (instant), plus a 60s visibility-gated safety
  // poll so a backgrounded tab stops querying and lets the DB idle (saves CU-hrs).
  useOrderEvents(loadApiOrders);
  useReservationEvents(loadApiReservations);
  useVisiblePolling(loadApiOrders, 60000);
  useVisiblePolling(loadApiReservations, 60000);

  // Friendly toast for changes pushed from elsewhere (another cashier, waiter, kitchen) —
  // suppressed for a few seconds after this client's own writes (see markMine() calls above)
  // so it doesn't double up with the specific success toast that action already shows. Order
  // events aren't outlet-room-scoped server-side (unlike table/reservation), so they're also
  // filtered to this outlet here.
  useEffect(() => {
    const socket = getSocket();
    const onOrderCreated = (payload: OrderRecord) => {
      if (isLikelyOwnEcho()) return;
      if (payload.outletId && payload.outletId !== user?.outletId) return;
      toast.info(`New order — ${payload.tableNumber ? `Table ${payload.tableNumber}` : payload.type} (#${payload.orderNumber})`);
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
    const onReservationCreated = (payload: ReservationRecord) => {
      if (isLikelyOwnEcho()) return;
      toast.info(`New reservation: ${payload.customerName} — ${payload.date} at ${payload.time}`);
    };
    const onReservationUpdated = (payload: ReservationRecord) => {
      if (isLikelyOwnEcho()) return;
      toast.info(`Reservation for ${payload.customerName} updated — now ${payload.status}`);
    };
    socket.on("order:created", onOrderCreated);
    socket.on("order:updated", onOrderUpdated);
    socket.on("table:updated", onTableUpdated);
    socket.on("reservation:created", onReservationCreated);
    socket.on("reservation:updated", onReservationUpdated);
    return () => {
      socket.off("order:created", onOrderCreated);
      socket.off("order:updated", onOrderUpdated);
      socket.off("table:updated", onTableUpdated);
      socket.off("reservation:created", onReservationCreated);
      socket.off("reservation:updated", onReservationUpdated);
    };
  }, [isLikelyOwnEcho, user?.outletId]);

  // Let the staff member who requested a cancellation know the outcome as soon as
  // the approver reviews it — otherwise the request dialog just closes on submit
  // with no later feedback on accept/reject. Also keeps myPendingCancelOrderIds (the
  // per-order "Cancel" lock) in sync: add the order when MY request is created, drop
  // it the moment it's approved/rejected — so only that one order is ever locked,
  // and it unlocks again if rejected (letting a fresh cancellation be filed).
  useEffect(() => {
    const socket = getSocket();
    const createdHandler = (payload: CancellationRequestRecord) => {
      if (payload.status !== "pending") return;
      setMyPendingCancelOrderIds(prev => new Set(prev).add(payload.orderId));
    };
    const updatedHandler = (payload: CancellationRequestRecord) => {
      if (payload.status === "pending") return;
      setMyPendingCancelOrderIds(prev => {
        if (!prev.has(payload.orderId)) return prev;
        const next = new Set(prev);
        next.delete(payload.orderId);
        return next;
      });
      if (payload.requestedById === user?.id) {
        if (payload.status === "approved") {
          toast.success(`Order ${payload.order?.orderNumber ?? ""} cancellation approved by ${payload.reviewedBy?.name ?? "approver"}`);
        } else {
          toast.error(`Order ${payload.order?.orderNumber ?? ""} cancellation rejected${payload.reviewNote ? `: ${payload.reviewNote}` : ""}`);
        }
      }
    };
    socket.on("cancellationRequest:created", createdHandler);
    socket.on("cancellationRequest:updated", updatedHandler);
    return () => {
      socket.off("cancellationRequest:created", createdHandler);
      socket.off("cancellationRequest:updated", updatedHandler);
    };
  }, [user?.id]);

  // ── Load order from Order Status Board (payment collection) ──
  useEffect(() => {
    const state = location.state as { loadOrderId?: string; paymentOnly?: boolean } | null;
    if (state?.loadOrderId) {
      // Delay slightly so allOrdersData is populated
      const timer = setTimeout(() => {
        const order = allOrdersData.find((o) => o.id === state.loadOrderId);
        if (order) {
          setCart(order.items.map((item: any) => ({ ...item, id: `${item.id}-${Date.now()}` })));
          setOrderType(order.type);
          setSelectedCustomer(effectiveCustomers.find((c: any) => c.name === order.customer)?.id || "");
          if (order.tableNumber) setTableNumber(order.tableNumber);
          if (order.deliveryAddress) setDeliveryAddress(order.deliveryAddress);
          setLoadedOrderId(state.loadOrderId!);
          setSelectedRunningOrder(state.loadOrderId!);
          if (state.paymentOnly) setPaymentOnlyMode(true);
          toast.info(`Loaded ${order.orderNumber} for payment`);
        } else {
          // Try fetching directly
          orderService.getOrder(state.loadOrderId!).then((apiOrder) => {
            const normalized = normalizeApiOrder(apiOrder);
            setCart(normalized.items.map((item: any) => ({ ...item, id: `${item.id}-${Date.now()}` })));
            setOrderType(normalized.type);
            if (normalized.tableNumber) setTableNumber(normalized.tableNumber);
            setLoadedOrderId(state.loadOrderId!);
            if (state.paymentOnly) setPaymentOnlyMode(true);
            toast.info(`Loaded ${normalized.orderNumber} for payment`);
          }).catch(() => toast.error("Could not load order"));
        }
        // Clear the navigation state
        window.history.replaceState({}, document.title);
      }, 500);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  // Update order status via API + optimistic local update
  const handleOrderStatusUpdate = useCallback(async (id: string, status: string) => {
    // Record the exact moment an order is accepted into "preparing"
    if (status === "preparing") {
      posPreparingAtMap.current[id] = Date.now();
    }
    setApiOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    try {
      await orderService.updateOrderStatus(id, status);
    } catch {
      // revert on failure
      loadApiOrders();
    }
  }, [loadApiOrders]);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [orderType, setOrderType] = useState<OrderType>("Dine In");
  const [selectedRunningOrder, setSelectedRunningOrder] = useState<string | null>(null);
  const [loadedOrderId, setLoadedOrderId] = useState<string | null>(null);

  // Customer Selection
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerAdd, setShowCustomerAdd] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "", email: "", address: "", customerType: "walk-in" as string });

  // Table & Delivery
  const [tableNumber, setTableNumber] = useState<number | null>(null);
  const [dineInGuests, setDineInGuests] = useState<number>(2);
  const [backendTables, setBackendTables] = useState<TableRecord[]>([]);
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [rider, setRider] = useState("Self Pickup");
  const [selectedRiderId, setSelectedRiderId] = useState<string>("");
  const [apiRiders, setApiRiders] = useState<RiderRecord[]>([]);

  // Modifiers
  const [showModifiers, setShowModifiers] = useState(false);
  const [pendingItem, setPendingItem] = useState<typeof foodMenuItems[0] | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);

  // Discounts
  const [orderDiscount, setOrderDiscount] = useState(0);

  // Dialogs
  const [showConfirmOrder, setShowConfirmOrder] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);
  const [showKOT, setShowKOT] = useState(false);
  const [kotOrderNumber, setKotOrderNumber] = useState("");
  const [kotItems, setKotItems] = useState<CartItem[]>([]);
  const [kotOrderType, setKotOrderType] = useState<OrderType>("Dine In");
  const [kotTableNumber, setKotTableNumber] = useState<number | null>(null);
  const [kotStaffName, setKotStaffName] = useState("");
  const [showFinalizeSale, setShowFinalizeSale] = useState(false);

  // Finalize Sale state
  const [finalizeMethod, setFinalizeMethod] = useState("Cash");
  const [givenAmount, setGivenAmount] = useState(0);
  const [paymentEntries, setPaymentEntries] = useState<PaymentEntry[]>([]);
  const [sendSMS, setSendSMS] = useState(false);
  const [showCartDetails, setShowCartDetails] = useState(false);
  const orderStartTime = useRef<number>(Date.now());
  // Tracks when each order was accepted (transitioned to "preparing") in this session
  const posPreparingAtMap = useRef<Record<string, number>>({});
  // Clock that ticks every second while Order Status sheet is open, for live countdowns
  const [statusClock, setStatusClock] = useState(Date.now());

  // Drafts
  const [drafts, setDrafts] = useState<DraftOrder[]>([]);
  const [showDrafts, setShowDrafts] = useState(false);

  // Quick Tags
  const [activeTag, setActiveTag] = useState<string | null>(null);

  // Responsive: sidebar & cart panel visibility
  const [showLeftSidebar, setShowLeftSidebar] = useState(false);
  const [mobileView, setMobileView] = useState<"menu" | "cart">("menu");

  // Order Status
  const [showOrderStatus, setShowOrderStatus] = useState(false);
  const [orderStatusTab, setOrderStatusTab] = useState<"pending" | "preparing" | "ready" | "completed">("pending");
  const [orderStatusTypeFilter, setOrderStatusTypeFilter] = useState<"all" | "Dine In" | "Take Away" | "Delivery" | "Self Order">("all");

  // Tick statusClock every second while Order Status sheet is open
  useEffect(() => {
    if (!showOrderStatus) return;
    const interval = setInterval(() => setStatusClock(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [showOrderStatus]);

  // Low Stock
  const [showLowStock, setShowLowStock] = useState(false);

  // Payment-only mode (loaded from Order Status for collecting payment on existing order)
  const [paymentOnlyMode, setPaymentOnlyMode] = useState(false);

  // Staff / Waiter
  const [selectedStaff, setSelectedStaff] = useState(user?.name || "Admin User");

  // Future Sale
  const [showFutureSale, setShowFutureSale] = useState(false);
  const [showCreateFutureSale, setShowCreateFutureSale] = useState(false);
  const [futureScheduledDate, setFutureScheduledDate] = useState("");
  const [futureScheduledTime, setFutureScheduledTime] = useState("");
  const [futureNotes, setFutureNotes] = useState("");
  const [futureAdvancePayment, setFutureAdvancePayment] = useState(0);
  const [futureAdvanceMethod, setFutureAdvanceMethod] = useState<string>("Cash");
  const [loadedAdvancePayment, setLoadedAdvancePayment] = useState<number>(0);
  const [loadedAdvanceMethod, setLoadedAdvanceMethod] = useState<string>("");
  const [loadedReservationId, setLoadedReservationId] = useState<string | null>(null);

  // Delivery payment mode (only active when orderType === "Delivery")
  const [deliveryPayMode, setDeliveryPayMode] = useState<"cod" | "advance" | "prepaid">("cod");
  const [advanceEntries, setAdvanceEntries] = useState<PaymentEntry[]>([]);
  const [advanceMethod, setAdvanceMethod] = useState<string>("Cash");
  const [advanceAmount, setAdvanceAmount] = useState<number>(0);

  // Cash Register
  const [activeShift, setActiveShift] = useState<ShiftRecord | null>(null);
  const [shiftLoading, setShiftLoading] = useState(true);
  const [showRegisterOpen, setShowRegisterOpen] = useState(true);
  const [showRegisterClose, setShowRegisterClose] = useState(false);
  const [openingCashInput, setOpeningCashInput] = useState("");
  const [closingCashInput, setClosingCashInput] = useState("");
  const [closingNotes, setClosingNotes] = useState("");
  const [registerViewTab, setRegisterViewTab] = useState<"counter" | "floor">("counter");
  const [approvingCashId, setApprovingCashId] = useState<string | null>(null);

  const handleApproveCash = async (orderId: string, orderNumber: string) => {
    const targetOrder = (apiOrders as any[]).find(o => o.id === orderId) || (localOrdersData as any[]).find(o => o.id === orderId);
    if (targetOrder?.hasPendingCancellationRequest) {
      toast.error("Cannot approve cash while a cancellation request is pending approval.");
      return;
    }
    setApprovingCashId(orderId);
    try {
      markMine();
      const nowIso = new Date().toISOString();
      await orderService.updateOrder(orderId, { cashApproved: true });
      toast.success(`Cash approved for Order ${orderNumber}!`);
      setApiOrders(prev => prev.map(o => o.id === orderId ? { ...o, cashApproved: true, updatedAt: nowIso } : o));
      await loadApiOrders();
      const localMatch = localOrdersData.find(o => o.id === orderId);
      if (localMatch) {
        updateDataItem("orders", orderId, { ...localMatch, cashApproved: true, updatedAt: nowIso });
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to approve cash");
    } finally {
      setApprovingCashId(null);
    }
  };

  // Order timer
  const [orderElapsed, setOrderElapsed] = useState("00:00:00");

  // Deal Selection
  const [showDealDialog, setShowDealDialog] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<typeof deals[0] | null>(null);
  const [dealGroupSelections, setDealGroupSelections] = useState<Record<string, string[]>>({});

  // Urgent Order
  const [isUrgent, setIsUrgent] = useState(false);

  // Reservation List
  const [showReservations, setShowReservations] = useState(false);
  const [posReservationTab, setPosReservationTab] = useState<"dine_in" | "take_away" | "delivery">("dine_in");

  // Customer History
  const [showCustomerHistory, setShowCustomerHistory] = useState(false);

  // Item Notes
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [tempNotes, setTempNotes] = useState("");

  // Quotation
  const [showQuotation, setShowQuotation] = useState(false);

  // Kitchen Notifications / Display
  const [showKitchenNotifications, setShowKitchenNotifications] = useState(false);
  const [posKitchenTab, setPosKitchenTab] = useState<"all" | "pending" | "preparing" | "ready">("all");

  // Order Modification/Cancellation Dialog
  const [showModifyOrder, setShowModifyOrder] = useState<string | null>(null);
  const [modifyCancelReason, setModifyCancelReason] = useState("");
  const [modifyCancelAction, setModifyCancelAction] = useState<"modify" | "cancel">("modify");
  const [modifyCancelCustomReason, setModifyCancelCustomReason] = useState("");
  const [cancelSelectedItemIds, setCancelSelectedItemIds] = useState<string[]>([]);
  const [cancelApproverId, setCancelApproverId] = useState("");
  const [cancelResponsibleUserId, setCancelResponsibleUserId] = useState("");
  const [cancelPenaltyAmount, setCancelPenaltyAmount] = useState(0);
  const [cancelRefundMethod, setCancelRefundMethod] = useState("cash");
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const activeDeals = useMemo(() =>
    deals.filter(d => d.isActive && d.type === "optionCombo" && d.optionGroups && d.optionGroups.length > 0 && (d.validTo === "always" || d.validTo >= new Date().toISOString().split("T")[0])),
    [deals]
  );

  const openDealSelection = (deal: typeof deals[0]) => {
    setSelectedDeal(deal);
    const initial: Record<string, string[]> = {};
    deal.optionGroups?.forEach(g => { initial[g.id] = []; });
    setDealGroupSelections(initial);
    setShowDealDialog(true);
  };

  const toggleDealItemSelection = (groupId: string, itemId: string, maxSelections: number) => {
    setDealGroupSelections(prev => {
      const current = prev[groupId] || [];
      if (current.includes(itemId)) return { ...prev, [groupId]: current.filter(x => x !== itemId) };
      if (current.length >= maxSelections) {
        if (maxSelections === 1) return { ...prev, [groupId]: [itemId] };
        toast.error(`Max ${maxSelections} items for this group`);
        return prev;
      }
      return { ...prev, [groupId]: [...current, itemId] };
    });
  };

  const confirmDealToCart = () => {
    if (!selectedDeal?.optionGroups) return;
    const incomplete = selectedDeal.optionGroups.find(g => (dealGroupSelections[g.id]?.length || 0) < g.maxSelections);
    if (incomplete) { toast.error(`Select ${incomplete.maxSelections} item(s) for "${incomplete.label}"`); return; }

    const selectedItemNames = selectedDeal.optionGroups.map(g => {
      return dealGroupSelections[g.id].map(itemId => foodMenuItems.find(m => m.id === itemId)?.name || "Item").join(" + ");
    }).join(", ");

    setCart(prev => [...prev, {
      id: `deal-${selectedDeal.id}-${Date.now()}`,
      name: `${selectedDeal.name} (${selectedItemNames})`,
      price: selectedDeal.dealPrice || 0,
      qty: 1,
      discount: 0,
      modifiers: [],
    }]);
    setShowDealDialog(false);
    setSelectedDeal(null);
    toast.success(`${selectedDeal.name} added to cart`);
  };

  const runningOrders = allOrdersData.filter((o) => o.status === "preparing" || o.status === "pending");

  // Load tables from backend
  const loadTables = useCallback(() => {
    tableService.getTables().then(setBackendTables).catch(() => {});
  }, []);

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  // Real-time push, plus a 60s visibility-gated safety poll (matches orders/reservations above).
  useTableEvents(loadTables);
  useVisiblePolling(loadTables, 60000);

  // Load available riders when delivery type is selected
  useEffect(() => {
    if (orderType === "Delivery") {
      deliveryService.getRiders()
        .then(riders => setApiRiders(riders.filter(r => r.status !== "off_duty" && (r.activeDeliveries || 0) < 5)))
        .catch(() => {});
    }
  }, [orderType]);

  // Check for open shift on mount via API
  useEffect(() => {
    shiftService.getActiveShift()
      .then(shift => {
        if (shift) {
          setActiveShift(shift);
          setShowRegisterOpen(false);
        }
      })
      .catch(() => { /* no active shift or network error — show open dialog */ })
      .finally(() => setShiftLoading(false));
  }, []);

  const shiftSales = useMemo(() => {
    const configuredMethods: string[] = (effectiveSettings as any)?.paymentMethods ?? ["Cash", "Credit Card", "Account", "JazzCash", "EasyPaisa"];

    const createMethodMap = () => {
      const map: Record<string, number> = {};
      configuredMethods.forEach((m) => { map[m] = 0; });
      return map;
    };

    if (!activeShift) return {
      total: 0, cash: 0, card: 0, online: 0, nonCash: 0, count: 0,
      byMethod: createMethodMap(),
      pos: { total: 0, cash: 0, nonCash: 0, count: 0, byMethod: createMethodMap() },
      waiter: { total: 0, cash: 0, nonCash: 0, count: 0, byMethod: createMethodMap(), orders: [] as any[], pendingOrders: [] as any[], pendingTotal: 0, pendingCount: 0 }
    };

    const shiftStartMs = new Date(activeShift.openedAt).getTime();
    const isWaiterOrder = (o: any) => {
      if (!o) return false;
      const src = (o.orderSource || "").toLowerCase();
      if (src === "pos") return false;
      if (src === "waiter" || src === "self-order" || src === "table") return true;
      const staffRole = (o.staffRole || o.staff?.role || "").toLowerCase();
      if (staffRole.includes("waiter")) return true;
      const staff = (o.staff || "").toLowerCase();
      if (staff.includes("waiter")) return true;
      return false;
    };
    const isCashOrder = (o: any) => {
      const pm = (o.paymentMethod || "").toLowerCase().trim();
      return pm.includes("cash") && !pm.includes("jazz") && !pm.includes("easy") && !pm.includes("online") && !pm.includes("card") && !pm.includes("mobile") && !pm.includes("paisa");
    };

    const getSafeOrderTimestamp = (o: any): number => {
      if (!o) return 0;
      let maxMs = 0;
      if (o.createdAt) {
        const ms = new Date(o.createdAt).getTime();
        if (!isNaN(ms) && ms > maxMs) maxMs = ms;
      }
      if (o.updatedAt) {
        const ms = new Date(o.updatedAt).getTime();
        if (!isNaN(ms) && ms > maxMs) maxMs = ms;
      }
      if (maxMs > 0) return maxMs;

      if (o.date) {
        const dateStr = String(o.date).split("T")[0];
        const timeStr = o.time ? String(o.time).trim() : "";
        if (timeStr) {
          const ms = new Date(`${dateStr} ${timeStr}`).getTime();
          if (!isNaN(ms) && ms > 0) return ms;
        }
        const ms = new Date(dateStr).getTime();
        if (!isNaN(ms) && ms > 0) return ms;
      }
      return 0;
    };

    const shiftOrders = allOrdersData.filter(o => {
      if (o.status === "cancelled") return false;
      const orderTimeMs = getSafeOrderTimestamp(o);
      return orderTimeMs >= shiftStartMs;
    });

    const parsePaymentSplits = (paymentMethodStr: string, orderTotal: number) => {
      const pm = (paymentMethodStr || "Cash").trim();
      const splits: { method: string; amount: number }[] = [];

      if (pm.includes(":") && (pm.includes(",") || pm.includes("Rs") || /\d+/.test(pm))) {
        const parts = pm.split(",");
        parts.forEach((part) => {
          const subParts = part.split(":");
          if (subParts.length >= 2) {
            const rawMethod = subParts[0].trim();
            // Remove currency symbols (e.g. "Rs." or "Rs") before matching number
            const cleanedValStr = subParts[1].replace(/Rs\.?/gi, "").trim();
            const numMatch = cleanedValStr.match(/\d+(?:\.\d+)?/);
            if (numMatch) {
              const val = parseFloat(numMatch[0]);
              if (!isNaN(val) && val > 0) {
                splits.push({ method: rawMethod, amount: val });
              }
            }
          }
        });
      }

      if (splits.length > 0) {
        const rawSum = splits.reduce((sum, s) => sum + s.amount, 0);
        if (rawSum > 0 && Math.abs(rawSum - orderTotal) > 0.01) {
          const ratio = orderTotal / rawSum;
          splits.forEach(s => {
            s.amount = Math.round(s.amount * ratio * 100) / 100;
          });
        }
      } else {
        splits.push({ method: pm, amount: orderTotal });
      }

      return splits;
    };

    const processGroup = (ordersList: any[]) => {
      let total = 0;
      let cash = 0;
      let card = 0;
      let online = 0;
      const byMethod = createMethodMap();

      ordersList.forEach(o => {
        const pm = o.paymentMethod || '';
        const hasAdvancePM = /advance\s*\(/i.test(pm);
        const hasCODBalancePM = /cod balance\s*\(/i.test(pm);

        // For advance delivery orders, only count what the cashier actually collected at the POS counter.
        // The remaining COD balance is the rider's responsibility, not the POS register's.
        let orderAmt = Number(o.total || 0);
        if (hasAdvancePM) {
          const advancePaid = Number(o.advancePayment || 0);
          if (advancePaid > 0) {
            orderAmt = advancePaid;
          } else {
            // Fallback: parse advance amount directly from PM string
            // e.g. "Advance (JazzCash): Rs.485" → 485
            const amtMatch = pm.match(/Rs\.?\s*(\d+(?:\.\d+)?)/i);
            if (amtMatch) orderAmt = parseFloat(amtMatch[1]);
          }
        }
        total += orderAmt;

        const splits = parsePaymentSplits(pm, orderAmt);

        splits.forEach(({ method, amount }) => {
          const mLower = method.toLowerCase();

          const isCash = mLower.includes("cash") && !mLower.includes("jazz") && !mLower.includes("easy") && !mLower.includes("online") && !mLower.includes("card") && !mLower.includes("mobile") && !mLower.includes("paisa");

          if (isCash) {
            cash += amount;
          } else if (mLower.includes("card") || mLower.includes("bank")) {
            card += amount;
          } else {
            online += amount;
          }

          let matched = false;
          // 1. Try exact match first
          for (const m of configuredMethods) {
            if (m.toLowerCase() === mLower) {
              byMethod[m] = (byMethod[m] || 0) + amount;
              matched = true;
              break;
            }
          }
          // 2. Try partial match if exact match not found
          if (!matched) {
            for (const m of configuredMethods) {
              const confLower = m.toLowerCase();
              if (confLower === "cash" && !isCash) continue;
              if (mLower.includes(confLower) || confLower.includes(mLower)) {
                byMethod[m] = (byMethod[m] || 0) + amount;
                matched = true;
                break;
              }
            }
          }
          if (!matched) {
            byMethod[method] = (byMethod[method] || 0) + amount;
          }
        });
      });

      return { total, cash, card, online, nonCash: Math.max(0, total - cash), count: ordersList.length, byMethod };
    };

    const isSettledOrder = (o: any) => {
      const status = (o.status || "").toLowerCase();
      const method = (o.paymentMethod || "").toLowerCase().trim();
      if (status === "completed") return true;
      if (method === "cash on delivery" || method === "cod" || method === "cash-on-delivery") {
        return Number(o.advancePayment || 0) > 0;
      }
      if (method && method !== "pending" && method !== "unpaid") return true;
      return false;
    };

    const isApprovedOrder = (o: any) => {
      if (!isWaiterOrder(o)) return true;
      if (o.cashApproved === true) return true;
      const pm = (o.paymentMethod || "").toLowerCase().trim();
      const isCash = pm.includes("cash") && !pm.includes("jazz") && !pm.includes("easy") && !pm.includes("online") && !pm.includes("card") && !pm.includes("mobile") && !pm.includes("paisa");
      if (!isCash) return true;
      return false;
    };

    const allWaiterOrders = shiftOrders.filter(isWaiterOrder);
    const waiterOrders = allWaiterOrders.filter(isSettledOrder);
    const approvedWaiterOrders = waiterOrders.filter(isApprovedOrder);
    const pendingWaiterOrders = allWaiterOrders.filter(o => !isSettledOrder(o));

    const posOrders = shiftOrders.filter(o => !isWaiterOrder(o) && isSettledOrder(o));
    const settledShiftOrders = shiftOrders.filter(isSettledOrder).filter(isApprovedOrder);

    const posGroup = processGroup(posOrders);
    const waiterGroup = processGroup(approvedWaiterOrders);
    const overallGroup = processGroup(settledShiftOrders);

    return {
      total: overallGroup.total,
      cash: overallGroup.cash,
      card: overallGroup.card,
      online: overallGroup.online,
      nonCash: overallGroup.nonCash,
      count: overallGroup.count,
      byMethod: overallGroup.byMethod,
      pos: posGroup,
      waiter: {
        ...waiterGroup,
        orders: waiterOrders,
        pendingOrders: pendingWaiterOrders,
        pendingTotal: pendingWaiterOrders.reduce((s, o) => s + Number(o.total || 0), 0),
        pendingCount: pendingWaiterOrders.length,
      }
    };
  }, [allOrdersData, activeShift, effectiveSettings]);

  const todayDateStr = useMemo(() => new Date().toISOString().split("T")[0], []);

  const activeOrders = useMemo(() => allOrdersData.filter(o => o.status !== "cancelled" && o.status !== "scheduled"), [allOrdersData]);
  const activeOrdersCount = activeOrders.filter(o => o.status !== "completed").length;
  const ordersByStatus = useMemo(() => ({
    pending: activeOrders.filter(o => o.status === "pending"),
    preparing: activeOrders.filter(o => o.status === "preparing"),
    ready: activeOrders.filter(o => o.status === "ready"),
    completed: activeOrders.filter(o => o.status === "completed" && (o.date ? o.date.startsWith(todayDateStr) : true)).sort((a, b) => new Date(b.date || Date.now()).getTime() - new Date(a.date || Date.now()).getTime()),
  }), [activeOrders, todayDateStr]);

  const futureOrders = useMemo(() =>
    allOrdersData.filter(o => o.isFutureSale === true && o.status === "scheduled")
      .sort((a, b) => {
        const dateA = a.scheduledDate || a.date;
        const dateB = b.scheduledDate || b.date;
        return dateA.localeCompare(dateB);
      }),
    [allOrdersData]
  );

  const lowStockItems = useMemo(() => {
    if (apiLowStockItems.length > 0) {
      return apiLowStockItems.map(i => ({
        ...i,
        category: i.category?.name || '',
        unit: i.unit?.name || '',
      }));
    }
    return ingredients.filter((i: any) => i.status === "active" && i.currentStock <= i.lowStockLevel);
  }, [apiLowStockItems, ingredients]
  );

  const activeStaff = useMemo(() => {
    if (!apiStaff || apiStaff.length === 0) return [];
    const waitersOnly = apiStaff.filter((s: any) => !s.role || s.role.toLowerCase() === "waiter");
    return waitersOnly.length > 0 ? waitersOnly : apiStaff;
  }, [apiStaff]);

  // Today's reservations for POS view (from API)
  const todayStr = new Date().toISOString().split("T")[0];

  const getEffectiveStatus = useCallback((r: { date: string; time: string; status: string; orderId?: string | null }) => {
    if (r.status === "completed") return "completed";
    if (r.orderId && allOrdersData.some(o => o.id === r.orderId && o.status === "completed")) return "completed";
    if (r.status === "seated" || r.orderId) return "seated";
    if (r.status === "cancelled" || r.status === "noShow") return r.status;
    const now = new Date();
    const todayStrVal = now.toISOString().split("T")[0];
    const currentHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    if (r.date < todayStrVal || (r.date === todayStrVal && currentHHMM >= r.time)) {
      return "not_arrived";
    }
    return r.status;
  }, [allOrdersData]);

  const todayReservations = useMemo(() =>
    apiReservations
      .filter(r => {
        if (r.date !== todayStr) return false;
        if (r.status === "pending" || r.status === "cancelled" || r.status === "noShow" || r.status === "completed") return false;
        if (getEffectiveStatus(r) === "completed") return false;
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)),
    [apiReservations, todayStr, getEffectiveStatus]
  );

  // Kitchen Notifications — orders marked "ready" by kitchen
  const kitchenNotifications = useMemo(() =>
    allOrdersData
      .filter(o => o.status === "ready")
      .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time)),
    [allOrdersData]
  );

  // Product availability counts
  const productAvailability = useMemo(() => {
    const available = foodMenuItems.filter(i => i.available);
    const unavailable = foodMenuItems.filter(i => !i.available);
    return { available: available.length, unavailable: unavailable.length, total: foodMenuItems.length };
  }, [foodMenuItems]);

  // Prefer API customers; fall back to localStorage
  const effectiveCustomers = apiCustomers.length > 0 ? apiCustomers : customersList;

  // Customer history
  const customerHistory = useMemo(() => {
    if (!selectedCustomer) return null;
    const cust = effectiveCustomers.find((c: any) => c.id === selectedCustomer);
    if (!cust) return null;
    const custOrders = allOrdersData.filter(o => o.customer === cust.name);
    const avgBill = custOrders.length > 0 ? Math.round(custOrders.reduce((s, o) => s + o.total, 0) / custOrders.length) : 0;
    const lastVisit = custOrders.length > 0 ? custOrders.sort((a, b) => b.date.localeCompare(a.date))[0]?.date : "-";
    const topItems: Record<string, number> = {};
    custOrders.forEach(o => o.items.forEach(i => { topItems[i.name] = (topItems[i.name] || 0) + i.qty; }));
    const topItemsSorted = Object.entries(topItems).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { ...cust, orderCount: custOrders.length, avgBill, lastVisit, topItems: topItemsSorted, recentOrders: custOrders.slice(0, 5) };
  }, [selectedCustomer, customersList, allOrdersData]);

  // Timer for finalize sale
  useEffect(() => {
    if (!showFinalizeSale) return;
    const start = orderStartTime.current;
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - start) / 1000);
      const h = String(Math.floor(diff / 3600)).padStart(2, "0");
      const m = String(Math.floor((diff % 3600) / 60)).padStart(2, "0");
      const s = String(diff % 60).padStart(2, "0");
      setOrderElapsed(`${h}:${m}:${s}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [showFinalizeSale]);

  // Sync cart to localStorage for Customer Display
  useEffect(() => {
    const customerDisplayData = {
      cart: cart.map(item => ({ name: item.name, qty: item.qty, price: item.price, discount: item.discount, modifiers: item.modifiers })),
      orderType,
      tableNumber,
      customerName: selectedCustomer ? effectiveCustomers.find(c => c.id === selectedCustomer)?.name || "Walk-in" : "Walk-in",
      subtotal: itemsSubtotal,
      orderDiscount,
      tax,
      total,
      status: cart.length > 0 ? "active" as const : "idle" as const,
      timestamp: Date.now(),
    };
    localStorage.setItem("ovenisto-pos-cart", JSON.stringify(customerDisplayData));
  }, [cart, orderType, tableNumber, selectedCustomer, orderDiscount]);

  const handleCancelOrder = useCallback(async (order: any) => {
    const finalReason = modifyCancelReason === "Other" ? modifyCancelCustomReason.trim() : modifyCancelReason;
    if (!finalReason) { toast.error("Reason is required"); return; }
    if (!cancelApproverId) { toast.error("Select an approver"); return; }

    const activeItems = order.items.filter((i: any) => i.status !== "cancelled");
    const isFullCancel = cancelSelectedItemIds.length === 0 || cancelSelectedItemIds.length === activeItems.length;

    const refundAmount = isFullCancel
      ? order.total
      : activeItems.filter((i: any) => cancelSelectedItemIds.includes(i.id))
          .reduce((s: number, i: any) => s + (i.price * i.qty - i.discount), 0);

    let newSubtotal: number | undefined;
    let newTax: number | undefined;
    let newTotal: number | undefined;
    if (!isFullCancel) {
      const remainingItems = activeItems.filter((i: any) => !cancelSelectedItemIds.includes(i.id));
      const remainingItemsSubtotal = remainingItems.reduce((s: number, i: any) => s + (i.price * i.qty - i.discount), 0);
      newSubtotal = remainingItemsSubtotal - order.discount;
      newTax = Math.round(newSubtotal * taxRate);
      newTotal = newSubtotal + newTax;
    }

    setCancelSubmitting(true);
    try {
      await cancellationRequestService.create(order.id, {
        itemIds: isFullCancel ? undefined : cancelSelectedItemIds,
        reason: finalReason,
        approverId: cancelApproverId,
        responsibleUserId: cancelResponsibleUserId || undefined,
        penaltyAmount: cancelPenaltyAmount || undefined,
        refundAmount,
        refundMethod: cancelRefundMethod,
        newSubtotal, newTax, newTotal,
      });
      toast.success("Cancellation request sent for approval");
      setMyPendingCancelOrderIds(prev => new Set(prev).add(order.id));
      setShowModifyOrder(null);
      setModifyCancelReason(""); setModifyCancelCustomReason("");
      setCancelSelectedItemIds([]); setCancelApproverId(""); setCancelResponsibleUserId(""); setCancelPenaltyAmount(0); setCancelRefundMethod("cash");
      loadApiOrders();
    } catch (err: any) {
      toast.error(err.message || "Failed to send cancellation request");
    } finally {
      setCancelSubmitting(false);
    }
  }, [modifyCancelReason, modifyCancelCustomReason, cancelApproverId, cancelResponsibleUserId, cancelPenaltyAmount, cancelRefundMethod, cancelSelectedItemIds, taxRate, loadApiOrders]);

  // FIX 3A: Filter by tags
  const filteredMenu = useMemo(() => {
    let items = foodMenuItems.filter((item) => item.available);
    if (activeTag) {
      items = items.filter((i) => (i as any).tags?.includes(activeTag.toLowerCase()));
    }
    if (activeCategory !== "All") items = items.filter((i) => i.category === activeCategory);
    if (search) items = items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()) || (i.code ?? "").toLowerCase().includes(search.toLowerCase()));
    return items;
  }, [activeCategory, search, activeTag, foodMenuItems]);

  const filteredCustomers = effectiveCustomers.filter((c: any) =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) || (c.phone || '').includes(customerSearch)
  );
  const selectedCustomerData = effectiveCustomers.find((c: any) => c.id === selectedCustomer);

  const handleTagClick = (tag: string) => {
    if (tag === "Online") { setOrderType("Online"); setActiveTag(null); }
    else setActiveTag(activeTag === tag ? null : tag);
  };

  const handleOrderTypeChange = (type: OrderType) => {
    setOrderType(type);
    setTableNumber(null);
    setDeliveryAddress("");
    setDeliveryPhone("");
    setRider("Self Pickup");
    setSelectedRiderId("");
  };

  const addToCart = (item: typeof foodMenuItems[0]) => {
    const hasVariants = (item as any).variants && (item as any).variants.length > 0;
    const itemModifiers = (item as any).modifiers?.filter((m: any) => m.status === "active") || [];
    const hasModifiers = itemModifiers.length > 0;
    if (!hasVariants && !hasModifiers) {
      const itemPrice = resolvePrice(item, orderType);
      setCart(prev => {
        const existing = prev.find(c => c.name === item.name && (!c.modifiers || c.modifiers.length === 0));
        if (existing) return prev.map(c => c === existing ? { ...c, qty: c.qty + 1 } : c);
        return [...prev, { id: `${item.id}-${Date.now()}`, name: item.name, price: itemPrice, qty: 1, discount: 0, modifiers: [], cookingTime: (item as any).cookingTime || 0, menuItemId: item.id }];
      });
      toast.success(`${item.name} added`);
      return;
    }
    if (expandedItemId === item.id) {
      setExpandedItemId(null);
      setPendingItem(null);
      setSelectedVariant(null);
    } else {
      setExpandedItemId(item.id);
      setPendingItem(item);
      setSelectedModifiers([]);
      setSelectedVariant(null);
    }
  };

  const confirmAddToCart = () => {
    if (!pendingItem) return;
    const itemMods: any[] = (pendingItem as any).modifiers || modifiers;
    const modifiersCost = selectedModifiers.reduce((sum, mId) => {
      const mod = itemMods.find((m: any) => m.id === mId) || modifiers.find((m) => m.id === mId);
      return sum + (Number(mod?.price) || 0);
    }, 0);

    const variants = (pendingItem as any).variants || [];
    const selectedVariantObj = selectedVariant ? variants.find((v: any) => v.name === selectedVariant) : null;
    const variantPrice = selectedVariantObj ? resolvePrice(selectedVariantObj, orderType) : resolvePrice(pendingItem, orderType);
    const variantLabel = selectedVariant ? ` (${selectedVariant})` : "";

    setCart((prev) => {
      const fullName = `${pendingItem.name}${variantLabel}`;
      const modKey = selectedModifiers.sort().join("-");
      const existingIdx = prev.findIndex((c) => c.name === fullName && (c.modifiers?.sort().join("-") || "") === modKey);
      if (existingIdx >= 0 && selectedModifiers.length === 0) return prev.map((c, i) => i === existingIdx ? { ...c, qty: c.qty + 1 } : c);
      const modLabels = selectedModifiers.map((mId) => (itemMods.find((m: any) => m.id === mId) || modifiers.find((m) => m.id === mId))?.name || "");
      return [...prev, {
        id: `${pendingItem.id}-${Date.now()}`, name: fullName,
        price: variantPrice + modifiersCost, qty: 1, discount: 0,
        modifiers: modLabels, cookingTime: (pendingItem as any).cookingTime || 0,
        menuItemId: pendingItem.id, variantId: selectedVariantObj?.id || null,
      }];
    });
    setShowModifiers(false);
    setPendingItem(null);
    setExpandedItemId(null);
    setSelectedVariant(null);
  };

  const addDirectToCart = () => {
    if (!pendingItem) return;
    const itemPrice = resolvePrice(pendingItem, orderType);
    setCart((prev) => {
      const existing = prev.find((c) => c.name === pendingItem.name && (!c.modifiers || c.modifiers.length === 0));
      if (existing) return prev.map((c) => c === existing ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { id: `${pendingItem.id}-${Date.now()}`, name: pendingItem.name, price: itemPrice, qty: 1, discount: 0, modifiers: [], cookingTime: (pendingItem as any).cookingTime || 0, menuItemId: pendingItem.id }];
    });
    setShowModifiers(false);
    setPendingItem(null);
    setExpandedItemId(null);
    setSelectedVariant(null);
  };

  const updateQty = (id: string, delta: number) => setCart((prev) => prev.map((c) => c.id === id ? { ...c, qty: Math.max(1, c.qty + delta) } : c));
  const updateItemDiscount = (id: string, discount: number) => setCart((prev) => prev.map((c) => c.id === id ? { ...c, discount: Math.max(0, discount) } : c));
  const removeItem = (id: string) => setCart((prev) => prev.filter((c) => c.id !== id));

  const updateItemNotes = (id: string, notes: string) => setCart((prev) => prev.map((c) => c.id === id ? { ...c, notes } : c));

  const itemsSubtotal = cart.reduce((s, c) => s + (c.price * c.qty) - c.discount, 0);
  const subtotal = itemsSubtotal - orderDiscount;
  const tax = Math.round(subtotal * taxRate);
  const total = subtotal + tax;
  const netPayable = Math.max(0, total - loadedAdvancePayment);

  const totalPaid = paymentEntries.reduce((s, e) => s + e.amount, 0);
  const totalDue = Math.max(0, netPayable - totalPaid);
  const finalizeChange = givenAmount > 0 ? Math.max(0, givenAmount - (totalDue > 0 ? totalDue : netPayable)) : 0;

  const isPaymentSufficient = (totalPaid + loadedAdvancePayment) >= total;

  const isDeliveryCOD     = orderType === "Delivery" && deliveryPayMode === "cod"     && !loadedAdvancePayment;
  const isDeliveryAdvance = orderType === "Delivery" && deliveryPayMode === "advance" && !loadedAdvancePayment;
  const isDeliveryPrepaid = orderType === "Delivery" && deliveryPayMode === "prepaid" && !loadedAdvancePayment;
  const advanceTotal      = advanceEntries.reduce((s, e) => s + e.amount, 0);
  const deliveryBalance   = Math.max(0, total - advanceTotal);
  const isAdvanceSufficient = isDeliveryAdvance
    ? advanceEntries.length > 0 && advanceTotal > 0 && advanceTotal < total
    : true;

  const loadRunningOrder = (orderId: string) => {
    if (myPendingCancelOrderIds.has(orderId)) {
      toast.error("This order has a pending cancellation request and cannot be modified.");
      return;
    }
    const order = allOrdersData.find((o) => o.id === orderId);
    if (!order) return;
    setCart(order.items.map((item) => ({ ...item, id: `${item.id}-${Date.now()}` })));
    setOrderType(order.type);
    setSelectedCustomer(effectiveCustomers.find((c) => c.name === order.customer)?.id || "");
    if (order.tableNumber) setTableNumber(order.tableNumber);
    if (order.deliveryAddress) setDeliveryAddress(order.deliveryAddress);
    setLoadedOrderId(orderId);
    setSelectedRunningOrder(orderId);
    orderStartTime.current = Date.now();
  };

  const cancelOrder = () => {
    setCart([]);
    setOrderDiscount(0);
    setLoadedOrderId(null);
    setSelectedRunningOrder(null);
    setTableNumber(null);
    setDeliveryAddress("");
    setDeliveryPhone("");
    setRider("Self Pickup");
    setSelectedRiderId("");
    setSelectedCustomer("");
    setLoadedAdvancePayment(0);
    setLoadedAdvanceMethod("");
    setLoadedReservationId(null);
    setIsUrgent(false);
    setPaymentOnlyMode(false);
    orderStartTime.current = Date.now();
    localStorage.setItem("ovenisto-pos-cart", JSON.stringify({ cart: [], status: "idle", timestamp: Date.now() }));
  };

  const saveDraft = () => {
    if (cart.length === 0) { toast.error("Add items first"); return; }
    const draft: DraftOrder = {
      id: `DRAFT-${Date.now()}`, items: [...cart], customer: selectedCustomerData?.name || "Walk-in", orderType,
      tableNumber: tableNumber || undefined, deliveryAddress: deliveryAddress || undefined, phone: deliveryPhone || undefined, createdAt: new Date(),
    };
    setDrafts((p) => [...p, draft]);
    toast.success("Draft saved");
    cancelOrder();
  };

  const loadDraft = (draft: DraftOrder) => {
    setCart(draft.items);
    setOrderType(draft.orderType);
    setTableNumber(draft.tableNumber || null);
    setDeliveryAddress(draft.deliveryAddress || "");
    setShowDrafts(false);
    setDrafts((p) => p.filter((d) => d.id !== draft.id));
  };

  const validateOrder = () => {
    if (cart.length === 0) { toast.error("Add items to order first"); return false; }
    if (orderType === "Dine In" && !tableNumber) { toast.error("Select a table number"); return false; }
    if (orderType === "Delivery") {
      const activePhone = (selectedCustomerData as any)?.phone || deliveryPhone;
      if (!deliveryAddress || !deliveryAddress.trim()) {
        toast.error("Delivery address is required!");
        return false;
      }
      if (!activePhone || !activePhone.trim()) {
        toast.error("Customer phone number is required!");
        return false;
      }
    }
    return true;
  };

  const handlePlaceOrder = () => {
    if (!validateOrder()) return;
    setShowConfirmOrder(true);
  };

  const confirmPlaceOrder = () => {
    setShowConfirmOrder(false);
    setFinalizeMethod("Cash");
    setGivenAmount(0);
    setPaymentEntries([]);
    setSendSMS(false);
    setDeliveryPayMode("cod");
    setAdvanceEntries([]);
    setAdvanceMethod("Cash");
    setAdvanceAmount(0);
    setShowFinalizeSale(true);
  };

  const addPaymentEntry = () => {
    if (givenAmount <= 0) { toast.error("Enter an amount"); return; }
    setPaymentEntries(prev => [...prev, { id: `pay-${Date.now()}`, method: finalizeMethod, amount: givenAmount }]);
    setGivenAmount(0);
  };

  const removePaymentEntry = (id: string) => setPaymentEntries(prev => prev.filter(e => e.id !== id));

  const handleFinalizeSubmit = async () => {
    if (orderType === "Delivery" && !paymentOnlyMode) {
      const activePhone = (selectedCustomerData as any)?.phone || deliveryPhone;
      if (!deliveryAddress || !deliveryAddress.trim()) {
        toast.error("Delivery address is required!");
        return;
      }
      if (!activePhone || !activePhone.trim()) {
        toast.error("Customer phone number is required!");
        return;
      }
    }

    if (isDeliveryAdvance) {
      if (advanceEntries.length === 0 || advanceTotal <= 0) {
        toast.error("Enter advance payment amount and method");
        return;
      }
      if (advanceTotal >= total) {
        toast.error("Advance cannot equal or exceed the total. Use Full Prepaid instead.");
        return;
      }
    } else if (orderType !== "Delivery" && totalPaid < netPayable) {
      toast.error(`Full payment required (Rs. ${netPayable.toLocaleString()}). Remaining balance must be 0.`);
      return;
    }

    setIsSubmitting(true);

    let payMethodStr: string;
    let finalAdvancePayment: number = loadedAdvancePayment;

    if (orderType === "Delivery" && !loadedAdvancePayment) {
      if (deliveryPayMode === "cod") {
        payMethodStr = "Cash on Delivery";
        finalAdvancePayment = 0;
      } else if (deliveryPayMode === "advance") {
        payMethodStr = advanceEntries.length > 0
          ? advanceEntries.map(e => `Advance (${e.method}): Rs.${e.amount}`).join(", ")
          : `Advance (${advanceMethod}): Rs.0`;
        finalAdvancePayment = advanceTotal;
      } else {
        payMethodStr = paymentEntries.length > 0
          ? paymentEntries.map(e => `${e.method}: Rs.${e.amount}`).join(", ")
          : finalizeMethod;
        finalAdvancePayment = 0;
      }
    } else {
      payMethodStr = paymentEntries.length > 0
        ? paymentEntries.map(e => `${e.method}: Rs.${e.amount}`).join(", ")
        : finalizeMethod;
      if (loadedAdvancePayment > 0) {
        payMethodStr = `Advance (${loadedAdvanceMethod}): Rs.${loadedAdvancePayment}${paymentEntries.length > 0 || finalizeMethod ? `, Net (${payMethodStr}): Rs.${totalPaid || netPayable}` : ""}`;
      }
      finalAdvancePayment = loadedAdvancePayment;
    }

    let finalOrderNumber = "";

    if (loadedOrderId) {
      const loadedOrder = (allOrdersData as any[]).find((o) => o.id === loadedOrderId);
      if (loadedOrder?.hasPendingCancellationRequest) {
        toast.error("Cannot pay for or update order while a cancellation request is pending approval.");
        return;
      }
    }

    try {
      markMine();
      // ── Payment-only mode: just record payment, NO status change, NO re-send to kitchen ──
      if (paymentOnlyMode && loadedOrderId) {
        const updated = await orderService.updateOrder(loadedOrderId, { paymentMethod: payMethodStr });
        const existingOrder = allOrdersData.find((o) => o.id === loadedOrderId);
        finalOrderNumber = updated.orderNumber || existingOrder?.orderNumber || "Updated";
        toast.success(`Payment collected for ${finalOrderNumber}!`);
      } else {
        // ── Normal flow: create or full-update order ──
        const orderPayload = {
          customerId: selectedCustomer || undefined,
          customerName: selectedCustomerData?.name || "Walk-in",
          phone: (selectedCustomerData as any)?.phone || deliveryPhone || undefined,
          type: orderType,
          items: cart.map((c) => ({
            menuItemId: (c as any).menuItemId || null,
            variantId: (c as any).variantId || null,
            name: c.name, price: c.price, qty: c.qty, discount: c.discount,
            modifiers: c.modifiers || [], cookingTime: c.cookingTime || null, notes: c.notes || null,
          })),
          subtotal: itemsSubtotal, discount: orderDiscount, tax, total,
          advancePayment: finalAdvancePayment || undefined,
          paymentMethod: payMethodStr,
          staffName: selectedStaff,
          tableNumber: orderType === "Dine In" ? tableNumber || null : null,
          deliveryAddress: orderType === "Delivery" ? deliveryAddress : undefined,
          isUrgent,
          customerType: (selectedCustomerData as any)?.customerType || "walk-in",
          orderSource: "pos" as const,
        };

        if (loadedOrderId) {
          const updated = await orderService.updateOrder(loadedOrderId, orderPayload);
          finalOrderNumber = updated.orderNumber || (allOrdersData as any[]).find((x) => x.id === loadedOrderId)?.orderNumber || "Updated";
          toast.success(`Order ${finalOrderNumber} updated!`);
        } else {
          const created = await orderService.createOrder(orderPayload);
          finalOrderNumber = created.orderNumber;
          setApiOrders(prev => [normalizeApiOrder(created), ...prev]);
          if (loadedReservationId) {
            reservationService.update(loadedReservationId, { status: "completed", orderId: created.id }).catch(() => {});
            setLoadedReservationId(null);
          }
          if (orderType === "Dine In" && tableNumber) {
            const targetTable = backendTables.find((t) => Number(t.number) === tableNumber);
            if (targetTable) {
              const guests = dineInGuests || targetTable.capacity || 2;
              const wasAlreadyOccupied = targetTable.status === "occupied";
              tableService.updateTable(targetTable.id, {
                status: "occupied",
                currentOrderId: `${Date.now()}:${guests}`
              }).catch(() => {});
              // Only clear self-order state when this order newly occupies the
              // table (a new sitting) — not on a 2nd/3rd order rung in during an
              // already-occupied, possibly self-order-active sitting.
              if (!wasAlreadyOccupied) {
                tableService.notifySelfOrderSessionEnded(targetTable.id).catch(() => {});
              }
            }
          }
          if (orderType === "Delivery" && selectedRiderId) {
            deliveryService.assignRider({ orderId: created.id, riderId: selectedRiderId, estimatedTime: 30 })
              .catch(() => {});
          }
          toast.success(`Order ${finalOrderNumber} placed! Net Payable: Rs. ${netPayable.toLocaleString()}`);
        }
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to save order");
      setIsSubmitting(false);
      return;
    } finally {
      setIsSubmitting(false);
    }

    localStorage.setItem("ovenisto-pos-cart", JSON.stringify({ cart: [], status: "completed", timestamp: Date.now() }));

    setKotOrderNumber(finalOrderNumber);
    setKotItems([...cart]);
    setKotOrderType(orderType);
    setKotTableNumber(tableNumber);
    setKotStaffName(selectedStaff);
    setShowFinalizeSale(false);
    setShowKOT(true);
    setPaymentOnlyMode(false);
    cancelOrder();
    loadApiOrders();
  };

  const handleCreateFutureSale = async () => {
    if (cart.length === 0) { toast.error("Add items to cart first"); return; }
    if (!selectedCustomer) { toast.error("Select a customer for future sale"); return; }
    if (!futureScheduledDate) { toast.error("Select a scheduled date"); return; }
    if (!futureScheduledTime) { toast.error("Select a scheduled time"); return; }

    try {
      const created = await orderService.createOrder({
        customerName: selectedCustomerData?.name || "Walk-in",
        phone: selectedCustomerData?.phone || deliveryPhone || undefined,
        type: orderType,
        items: cart.map(c => ({
          menuItemId: (c as any).menuItemId || null,
          name: c.name, price: c.price, qty: c.qty, discount: c.discount,
          modifiers: c.modifiers || [], cookingTime: c.cookingTime || null,
        })),
        subtotal: itemsSubtotal,
        discount: orderDiscount,
        tax,
        total,
        paymentMethod: futureAdvancePayment > 0 ? `Advance (${futureAdvanceMethod}): Rs.${futureAdvancePayment}` : "Pending",
        staffName: selectedStaff,
        tableNumber: orderType === "Dine In" ? tableNumber || null : null,
        deliveryAddress: orderType === "Delivery" ? deliveryAddress : undefined,
        isFutureSale: true,
        scheduledDate: futureScheduledDate,
        scheduledTime: futureScheduledTime,
        futureNotes,
        advancePayment: futureAdvancePayment,
        orderSource: "pos",
      });
      setApiOrders(prev => [normalizeApiOrder(created), ...prev]);
      toast.success(`Future order ${created.orderNumber} booked for ${futureScheduledDate} at ${futureScheduledTime}`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to create future order");
      return;
    }

    setShowCreateFutureSale(false);
    setFutureScheduledDate("");
    setFutureScheduledTime("");
    setFutureNotes("");
    setFutureAdvancePayment(0);
    setFutureAdvanceMethod("Cash");
    cancelOrder();
    loadApiOrders();
  };

  const loadFutureOrder = (order: Order) => {
    setCart(order.items.map(item => ({ ...item, id: `${item.id}-${Date.now()}` })));
    if (order.customer !== "Walk-in") {
      const cust = effectiveCustomers.find(c => c.name === order.customer);
      if (cust) setSelectedCustomer(cust.id);
    }
    setOrderType(order.type);
    if (order.tableNumber) setTableNumber(order.tableNumber);
    if (order.deliveryAddress) setDeliveryAddress(order.deliveryAddress);
    if (order.rider) setRider(order.rider);
    setLoadedOrderId(order.id);

    // Capture advance payment info so operator can see it in billing panel
    if (order.advancePayment && order.advancePayment > 0) {
      setLoadedAdvancePayment(order.advancePayment);
      const methodMatch = order.paymentMethod?.match(/Advance \((.+?)\)/);
      setLoadedAdvanceMethod(methodMatch ? methodMatch[1] : "Cash");
    } else {
      setLoadedAdvancePayment(0);
      setLoadedAdvanceMethod("");
    }

    handleOrderStatusUpdate(order.id, "pending");

    setShowFutureSale(false);
    toast.success(`Future order ${order.orderNumber} loaded \u2014 Advance paid: Rs.${order.advancePayment || 0}`);
  };

  const loadReservationToPOSCart = (res: ReservationRecord) => {
    setLoadedReservationId(res.id);
    if (res.preOrderItems && res.preOrderItems.length > 0) {
      const mappedItems: CartItem[] = res.preOrderItems.map((item, idx) => ({
        id: `res-${res.id}-${idx}-${Date.now()}`,
        menuItemId: item.menuItemId,
        variantId: item.variantId || null,
        name: item.name,
        price: Number(item.price),
        qty: Number(item.qty),
        discount: 0,
        modifiers: [],
      }));
      setCart(mappedItems);
    } else {
      setCart([]);
    }

    const targetType: OrderType = res.orderType === "Delivery" ? "Delivery" : res.orderType === "Take Away" ? "Take Away" : "Dine In";
    setOrderType(targetType);

    if (res.customerName) {
      const matchedCust = effectiveCustomers.find(c =>
        c.name.toLowerCase().trim() === res.customerName.toLowerCase().trim() ||
        (res.customerPhone && c.phone && c.phone.replace(/\D/g, "") === res.customerPhone.replace(/\D/g, ""))
      );
      if (matchedCust) {
        setSelectedCustomer(matchedCust.id);
      }
    }
    if (res.orderType === "Delivery") {
      if (res.deliveryAddress) setDeliveryAddress(res.deliveryAddress);
      if (res.customerPhone) setDeliveryPhone(res.customerPhone);
    }

    if (res.advancePaid && Number(res.advancePaid) > 0) {
      setLoadedAdvancePayment(Number(res.advancePaid));
      setLoadedAdvanceMethod(res.paymentMethod || "Cash");
    } else {
      setLoadedAdvancePayment(0);
      setLoadedAdvanceMethod("");
    }

    setShowReservations(false);
    toast.success(`Loaded ${res.orderType || "Reservation"} for ${res.customerName} into POS cart!`);
  };

  const formatPhoneNumber = (val: string): string => {
    const digitsOnly = val.replace(/\D/g, "").slice(0, 11);
    if (digitsOnly.length > 4) {
      return `${digitsOnly.slice(0, 4)}-${digitsOnly.slice(4)}`;
    }
    return digitsOnly;
  };

  const addNewCustomer = async () => {
    if (!newCustomer.name.trim()) { toast.error("Name is required"); return; }
    const cleanPhone = newCustomer.phone.replace(/\D/g, "");
    if (cleanPhone.length !== 11) { toast.error("Phone number must be exactly 11 digits (e.g. 0300-1234567)"); return; }
    try {
      const created = await customerService.createCustomer({
        name: newCustomer.name.trim(),
        phone: newCustomer.phone.trim(),
        email: newCustomer.email.trim() || undefined,
        address: newCustomer.address.trim() || undefined,
        customerType: newCustomer.customerType,
      });
      setApiCustomers(prev => [...prev, created]);
      setSelectedCustomer(created.id);
      toast.success(`Customer ${created.name} added`);
      setShowCustomerAdd(false);
      setNewCustomer({ name: "", phone: "", email: "", address: "", customerType: "walk-in" });
    } catch (err: any) {
      toast.error(err?.message || "Failed to add customer");
    }
  };

  const handleCustomerSelect = (customerId: string) => {
    const actualId = customerId === "walk-in" ? "" : customerId;
    setSelectedCustomer(actualId);
    const cust = effectiveCustomers.find((c) => c.id === actualId);
    if (cust) {
      if (cust.address) setDeliveryAddress(cust.address);
      if (cust.phone) setDeliveryPhone(cust.phone);
    }
  };

  if (user?.role === "Super Admin") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-6 space-y-3">
        <AlertTriangle className="h-10 w-10 text-destructive animate-bounce" />
        <h3 className="text-lg font-bold">Access Denied</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Super Admin accounts do not operate the POS — this is a branch-level action.
        </p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col print:static print:z-auto">
      {/* POS Header */}
      <div className="h-12 lg:h-14 bg-card border-b-2 border-primary/15 flex items-center justify-between px-2 sm:px-4 shrink-0 print:hidden shadow-sm">
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8 lg:h-9 lg:w-9 rounded-full hover:bg-primary/10" onClick={() => setShowRegisterClose(true)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1.5">
            <div className="h-7 w-7 lg:h-9 lg:w-9 rounded-xl gradient-primary flex items-center justify-center shadow-md">
              <Flame className="h-4 w-4 lg:h-5 lg:w-5 text-primary-foreground" />
            </div>
            <div className="hidden sm:block">
              <span className="font-bold text-foreground text-sm lg:text-base tracking-tight">Ovenisto</span>
              <span className="text-primary font-extrabold text-sm lg:text-base ml-1">POS</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none flex-1 ml-2 mr-1">
          {/* Mobile: sidebar toggle */}
          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0 rounded-lg xl:hidden" onClick={() => setShowLeftSidebar(!showLeftSidebar)}>
            <ClipboardList className="h-3.5 w-3.5" />
          </Button>

          {/* Group 1: Live order operations (most used) */}
          <Button variant="outline" size="sm" className="h-8 text-xs rounded-lg gap-1 shrink-0 px-2.5 font-medium" onClick={() => setShowOrderStatus(true)}>
            <ClipboardList className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Order Status</span>
            {activeOrdersCount > 0 && (
              <Badge className="h-5 px-1 text-[10px] gradient-primary text-primary-foreground">{activeOrdersCount}</Badge>
            )}
          </Button>

          {/* Divider */}
          <div className="h-5 w-px bg-border/60 shrink-0 hidden sm:block mx-0.5" />

          {/* Group 2: Scheduling & secondary */}
          <Button variant="outline" size="sm" className="h-8 text-xs rounded-lg gap-1 shrink-0 px-2" onClick={() => setShowReservations(true)}>
            <BookOpen className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Reservations</span>
            {todayReservations.length > 0 && (
              <Badge className="h-5 px-1 text-[10px] bg-info/80 text-info-foreground">{todayReservations.length}</Badge>
            )}
          </Button>

          {/* Divider */}
          <div className="h-5 w-px bg-border/60 shrink-0 hidden sm:block mx-0.5" />

          {/* Group 3: Utilities */}
          <Button variant="outline" size="sm" className="h-8 text-xs rounded-lg gap-1 shrink-0 px-2" asChild>
            <Link to="/customer-display" target="_blank"><Monitor className="h-3.5 w-3.5" /><span className="hidden xl:inline">Customer Screen</span></Link>
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs rounded-lg gap-1 shrink-0 px-2" onClick={() => activeShift ? setShowRegisterClose(true) : setShowRegisterOpen(true)}>
            <DollarSign className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">{activeShift ? "Cash Register" : "Open Register"}</span>
          </Button>
          {(myActiveCash?.totalExpected ?? 0) > 0 && (
            <Button variant="outline" size="sm" className="h-8 text-xs rounded-lg gap-1 shrink-0 px-2 border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10" onClick={() => setShowCashHeldDialog(true)}>
              <Coins className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Collections Held:</span> {effectiveSettings.currency} {myActiveCash!.totalExpected.toLocaleString()}
            </Button>
          )}
          {lowStockItems.length > 0 && (
            <Button variant="outline" size="sm" className="h-8 text-xs rounded-lg gap-1 shrink-0 px-2 border-destructive/30 text-destructive hover:bg-destructive/5" onClick={() => setShowLowStock(true)}>
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Low Stock</span>
              <Badge className="h-5 px-1 text-[10px] bg-destructive text-destructive-foreground">{lowStockItems.length}</Badge>
            </Button>
          )}
        </div>
        {/* Mobile: toggle between menu & cart */}
        <div className="flex items-center gap-1 xl:hidden ml-1 shrink-0">
          <Button variant={mobileView === "menu" ? "default" : "outline"} size="sm" className="h-8 text-xs rounded-lg px-2.5" onClick={() => setMobileView("menu")}>
            <Search className="h-3.5 w-3.5 mr-1" />Menu
          </Button>
          <Button variant={mobileView === "cart" ? "default" : "outline"} size="sm" className="h-8 text-xs rounded-lg px-2.5 relative" onClick={() => setMobileView("cart")}>
            <ShoppingCart className="h-3.5 w-3.5 mr-1" />Cart
            {cart.length > 0 && <Badge className="absolute -top-1.5 -right-1.5 h-4 px-1 text-[9px] gradient-primary text-primary-foreground">{cart.length}</Badge>}
          </Button>
        </div>
      </div>

      {/* 3-panel layout */}
      <div className="flex-1 flex overflow-hidden print:block relative">
        {/* LEFT: Running Orders / Drafts — hidden on <xl, toggle via button */}
        {showLeftSidebar && (
          <div className="fixed inset-0 z-40 bg-black/40 xl:hidden" onClick={() => setShowLeftSidebar(false)} />
        )}
        <div className={cn(
          "bg-card border-r border-border/60 flex flex-col shrink-0 print:hidden z-50 transition-all duration-200",
          "w-56 lg:w-60",
          "xl:relative xl:translate-x-0",
          showLeftSidebar ? "fixed inset-y-0 left-0 top-12 translate-x-0 shadow-2xl" : "hidden xl:flex"
        )}>
          <div className="p-3 border-b border-border/60">
            <Tabs value={showDrafts ? "drafts" : "running"} onValueChange={(v) => setShowDrafts(v === "drafts")}>
              <TabsList className="w-full h-9 bg-muted/60 rounded-lg">
                <TabsTrigger value="running" className="text-xs flex-1 rounded-md data-[state=active]:shadow-sm">Running ({runningOrders.length})</TabsTrigger>
                <TabsTrigger value="drafts" className="text-xs flex-1 rounded-md data-[state=active]:shadow-sm">Drafts ({drafts.length})</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
            {showDrafts ? (
              drafts.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-xs text-muted-foreground">No drafts saved</p>
                </div>
              ) : (
                drafts.map((d) => (
                  <Card key={d.id} onClick={() => loadDraft(d)} className="p-3 cursor-pointer hover:shadow-md transition-all text-xs border-l-[3px] border-l-muted rounded-lg hover:-translate-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{d.id.slice(0, 12)}</span>
                      <Badge variant="secondary" className="text-[9px] bg-muted rounded-full">{d.orderType}</Badge>
                    </div>
                    <p className="text-muted-foreground mt-1">{d.items.length} items</p>
                    <p className="text-muted-foreground">{d.customer}</p>
                  </Card>
                ))
              )
            ) : (
              runningOrders.length === 0 ? (
                <div className="text-center py-8">
                  <RotateCcw className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-xs text-muted-foreground">No running orders</p>
                </div>
              ) : (
              runningOrders.map((o) => (
                <Card key={o.id} onClick={() => loadRunningOrder(o.id)} className={cn(
                  "p-2.5 cursor-pointer hover:shadow-md transition-all text-xs border-l-[3px] rounded-xl hover:-translate-y-0.5 group",
                  selectedRunningOrder === o.id ? "border-l-primary bg-primary/10 shadow-sm ring-1 ring-primary/30" : "border-l-transparent hover:bg-muted/40",
                  o.type === "Delivery" ? "border-l-info" : o.type === "Take Away" ? "border-l-accent" : ""
                )}>
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">{o.orderNumber}</span>
                    <div className="flex items-center gap-1">
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0 rounded-full font-medium">{o.type}</Badge>
                      <Badge className={cn("text-[9px] px-1.5 py-0 rounded-full capitalize font-semibold",
                        o.status === "preparing" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30" :
                        o.status === "ready" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30" :
                        "bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30"
                      )}>
                        {o.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1.5 text-[11px] text-muted-foreground">
                    <span className="truncate max-w-[120px] font-medium text-foreground/80">{o.customer}{o.tableNumber ? ` · T#${o.tableNumber}` : ""}</span>
                    <span className="text-[10px] opacity-80">{o.time}</span>
                  </div>
                </Card>
              ))
              )
            )}
          </div>
          <div className="p-2.5 border-t border-border/60 space-y-1.5">
            <Button variant="outline" size="sm" className="w-full text-xs h-8 rounded-lg" onClick={() => {
              if (selectedRunningOrder) {
                const order = allOrdersData.find(o => o.id === selectedRunningOrder);
                if (order) { setKotItems(order.items.map(i => ({ ...i, modifiers: i.modifiers }))); setKotOrderNumber(order.orderNumber); setKotOrderType(order.type); setKotTableNumber(order.tableNumber || null); setKotStaffName(order.staff); }
              } else if (cart.length > 0) {
                setKotItems([...cart]); setKotOrderType(orderType); setKotTableNumber(tableNumber); setKotStaffName(selectedStaff);
              }
              setShowKOT(true);
            }}><Printer className="h-3 w-3 mr-1" />Re-print KOT</Button>
            <Button variant="outline" size="sm" className="w-full text-xs h-8 rounded-lg text-destructive border-destructive/30 hover:bg-destructive/5" onClick={cancelOrder}>Cancel Order</Button>
          </div>
        </div>

        {/* CENTER: Current Order — full width on mobile when cart view active, fixed width on xl+ */}
        <div className={cn(
          "shrink-0 flex flex-col min-w-0 bg-background print:w-full",
          "w-full xl:w-[380px] 2xl:w-[420px]",
          mobileView === "cart" ? "flex" : "hidden xl:flex"
        )}>
          {/* Customer + Waiter — single row */}
          <div className="px-2 sm:px-3 py-2 border-b border-border/60 bg-card/30 print:hidden">
            <div className="flex items-center gap-1.5">
              <Select value={selectedCustomer || "walk-in"} onValueChange={handleCustomerSelect}>
                <SelectTrigger className="flex-1 h-8 text-xs rounded-lg">
                  <User className="h-3 w-3 mr-1 shrink-0 text-primary" />
                  <SelectValue placeholder="Walk-in Customer" />
                </SelectTrigger>
                <SelectContent>
                  <div className="p-2">
                    <Input placeholder="Search customers..." value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} className="h-7 text-xs mb-2" />
                  </div>
                  <SelectItem value="walk-in">Walk-in</SelectItem>
                  {filteredCustomers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <div className="flex items-center gap-2">
                        <span>{c.name} — {c.phone}</span>
                        {(c as any).customerType === "corporate" && <span className="text-[9px] bg-info/20 text-info px-1.5 py-0.5 rounded-full font-semibold">Corp</span>}
                        {(c as any).customerType === "vip" && <span className="text-[9px] bg-warning/20 text-warning px-1.5 py-0.5 rounded-full font-semibold">VIP</span>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" className="h-8 w-8 shrink-0 rounded-lg" onClick={() => setShowCustomerAdd(true)}><Plus className="h-3 w-3" /></Button>
              {selectedCustomer && (
                <Button variant="outline" size="icon" className="h-8 w-8 shrink-0 rounded-lg" onClick={() => setShowCustomerHistory(true)}><History className="h-3 w-3" /></Button>
              )}
              <Separator orientation="vertical" className="h-6 mx-0.5" />
              <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                <SelectTrigger className="w-28 sm:w-32 h-8 text-xs rounded-lg shrink-0">
                  <UtensilsCrossed className="h-3 w-3 mr-1 shrink-0 text-muted-foreground" />
                  <SelectValue placeholder="Waiter" />
                </SelectTrigger>
                <SelectContent>
                  {activeStaff.map((s) => (
                    <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedCustomerData && (
              <div className="flex items-center gap-1.5 mt-1 text-[10px]">
                <span className="text-muted-foreground truncate">{selectedCustomerData.phone} — {selectedCustomerData.address}</span>
                {(selectedCustomerData as any).customerType === "corporate" && (
                  <Badge variant="secondary" className="text-[9px] bg-info/10 text-info gap-0.5 shrink-0"><Building2 className="h-2.5 w-2.5" />Corp</Badge>
                )}
                {(selectedCustomerData as any).customerType === "vip" && (
                  <Badge variant="secondary" className="text-[9px] bg-warning/10 text-warning gap-0.5 shrink-0"><Crown className="h-2.5 w-2.5" />VIP</Badge>
                )}
                {(selectedCustomerData as any).outstandingDue > 0 && (
                  <Badge variant="secondary" className="text-[9px] bg-destructive/10 text-destructive shrink-0">Due: {effectiveSettings.currency} {selectedCustomerData.outstandingDue.toLocaleString()}</Badge>
                )}
              </div>
            )}
          </div>

          {/* Order Type Tabs + Table/Delivery inline */}
          <div className="flex flex-wrap items-center gap-1 px-2 sm:px-3 py-1.5 border-b border-border/60 bg-card/50 print:hidden">
            {orderTypes.map((t) => (
              <Button key={t} variant={orderType === t ? "default" : "outline"} size="sm" onClick={() => handleOrderTypeChange(t)} className={cn("text-[10px] sm:text-[11px] h-6 sm:h-7 rounded-lg font-semibold transition-all px-2 sm:px-2.5", orderType === t ? "gradient-primary text-primary-foreground shadow-md" : "hover:bg-muted/60")}>
                {t}
              </Button>
            ))}
            {/* Urgent Order Toggle */}
            <Button variant={isUrgent ? "default" : "outline"} size="sm" onClick={() => setIsUrgent(!isUrgent)} className={cn("text-[10px] h-6 sm:h-7 rounded-lg font-semibold transition-all px-2", isUrgent ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "border-destructive/30 text-destructive hover:bg-destructive/5")}>
              <Zap className="h-3 w-3 mr-0.5" />{isUrgent ? "URGENT" : "Urgent"}
            </Button>
            {/* Dine In: Table Dropdown & Guests count */}
            {orderType === "Dine In" && (
              <div className="flex items-center gap-1">
                <Select value={tableNumber ? String(tableNumber) : ""} onValueChange={(v) => {
                  const num = Number(v);
                  setTableNumber(num);
                  const tObj = backendTables.find(t => Number(t.number) === num);
                  if (tObj) setDineInGuests(tObj.capacity || 2);
                }}>
                  <SelectTrigger className={cn("w-24 h-6 sm:h-7 text-[10px] sm:text-xs rounded-lg", tableNumber ? "border-primary text-primary font-semibold" : "")}>
                    <SelectValue placeholder="Table #" />
                  </SelectTrigger>
                  <SelectContent>
                    {backendTables.length > 0
                      ? backendTables.map((t) => (
                          <SelectItem key={t.id} value={String(Number(t.number))} disabled={t.status === "occupied" || t.status === "bill-requested"}>
                            {t.status === "available" && "🟢 "}
                            {t.status === "occupied" && "🔴 "}
                            {t.status === "bill-requested" && "🧾 "}
                            {t.status === "reserved" && "🟡 "}
                            {t.status === "maintenance" && "🔧 "}
                            Table {t.number}
                            {t.floor ? ` (${t.floor})` : ""}
                            {t.status && ` · ${t.status === 'bill-requested' ? 'Bill Req' : t.status.charAt(0).toUpperCase() + t.status.slice(1)}`}
                          </SelectItem>
                        ))
                      : Array.from({ length: 12 }, (_, i) => i + 1).map((t) => (
                          <SelectItem key={t} value={String(t)}>Table {t}</SelectItem>
                        ))
                    }
                  </SelectContent>
                </Select>

                {tableNumber !== null && (
                  <div className="flex items-center gap-1 bg-muted/40 border border-border/60 rounded-lg px-1.5 h-6 sm:h-7 text-[10px] sm:text-xs">
                    <Users className="h-3 w-3 text-muted-foreground shrink-0" />
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={dineInGuests}
                      onChange={(e) => setDineInGuests(Math.max(1, Number(e.target.value)))}
                      className="w-7 bg-transparent text-center font-bold outline-none"
                      title="Guests / Persons Count"
                    />
                    <span className="text-[10px] text-muted-foreground font-semibold">Pax</span>
                  </div>
                )}
              </div>
            )}
            {loadedOrderId && (
              <Badge variant="secondary" className={cn("text-[10px]", paymentOnlyMode ? "bg-warning/15 text-warning border-warning/30" : "bg-info/10 text-info")}>
                {paymentOnlyMode ? (
                  <><DollarSign className="h-3 w-3 mr-0.5" />Collecting Payment: {allOrdersData.find((o) => o.id === loadedOrderId)?.orderNumber}</>
                ) : (
                  <>Editing: {allOrdersData.find((o) => o.id === loadedOrderId)?.orderNumber}</>
                )}
              </Badge>
            )}
          </div>

          {/* Delivery: Address & Rider */}
          {orderType === "Delivery" && (
            <div className="p-2 sm:p-3 border-b border-border bg-muted/30 space-y-2 print:hidden">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Delivery address *" className={cn("h-7 sm:h-8 text-xs", !deliveryAddress.trim() && "border-amber-500/40 focus:border-amber-500")} />
              </div>
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input value={deliveryPhone} onChange={(e) => setDeliveryPhone(e.target.value)} placeholder="Phone number *" className={cn("h-7 sm:h-8 text-xs flex-1", !((selectedCustomerData as any)?.phone || deliveryPhone.trim()) && "border-amber-500/40 focus:border-amber-500")} />
                <Select value={selectedRiderId || "none"} onValueChange={val => {
                  if (val === "none") { setSelectedRiderId(""); setRider("Self Pickup"); return; }
                  const r = apiRiders.find(r => r.id === val);
                  if (r) { setSelectedRiderId(r.id); setRider(r.name); }
                }}>
                  <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="Assign Rider" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Self Pickup / Unassigned</SelectItem>
                    {apiRiders.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}{r.phone ? ` — ${r.phone}` : ""}</SelectItem>
                    ))}
                    {apiRiders.length === 0 && <SelectItem value="no-riders" disabled>No available riders</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Payment-only mode banner */}
          {paymentOnlyMode && (
            <div className="mx-2 mt-2 rounded-lg bg-warning/10 border border-warning/30 px-3 py-2 flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-warning shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-warning">Payment Collection Mode</p>
                <p className="text-[10px] text-muted-foreground">Select payment method and click "Collect Payment" — order will NOT be resent to kitchen</p>
              </div>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground hover:text-foreground shrink-0" onClick={cancelOrder}>Exit</Button>
            </div>
          )}

          {/* Cart Items */}
          <div className="flex-1 overflow-y-auto p-2 sm:p-3">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-12 text-center text-muted-foreground">
                <div className="h-20 w-20 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-3 shadow-inner">
                  <ShoppingCart className="h-9 w-9 text-primary/40" />
                </div>
                <p className="text-sm font-bold text-foreground">No items added yet</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">Click items from the menu on the right to start building the order</p>
              </div>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border/80 text-muted-foreground text-[11px] uppercase tracking-wider font-semibold">
                    <th className="text-left py-2 font-semibold">Item</th>
                    <th className="text-center py-2 font-semibold w-16">Price</th>
                    <th className="text-center py-2 font-semibold w-24">Qty</th>
                    <th className="text-center py-2 font-semibold w-16 print:hidden">Disc.</th>
                    <th className="text-right py-2 font-semibold w-20">Total</th>
                    <th className="w-8 print:hidden"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {cart.map((item) => (
                    <tr key={item.id} className="hover:bg-muted/30 transition-colors group">
                      <td className="py-2.5 pr-2">
                        <span className="font-semibold text-foreground text-xs">{item.name}</span>
                        {item.modifiers && item.modifiers.length > 0 && (
                          <p className="text-[10px] text-muted-foreground/90 font-medium">{item.modifiers.join(", ")}</p>
                        )}
                        {item.notes && (
                          <p className="text-[10px] text-warning font-medium italic truncate max-w-[140px] mt-0.5">{item.notes}</p>
                        )}
                        <button onClick={() => { setEditingNotesId(item.id); setTempNotes(item.notes || ""); }} className="text-[10px] text-muted-foreground hover:text-primary mt-1 flex items-center gap-1 font-medium transition-colors">
                          <StickyNote className="h-2.5 w-2.5" />{item.notes ? "Edit note" : "+ Note"}
                        </button>
                      </td>
                      <td className="text-center py-2.5 text-xs font-medium text-muted-foreground">Rs.{item.price}</td>
                      <td className="py-2.5">
                        <div className="flex items-center justify-center gap-1 bg-muted/30 p-0.5 rounded-lg border border-border/40 w-max mx-auto">
                          <Button variant="ghost" size="icon" className="h-5 w-5 rounded-md print:hidden hover:bg-background shadow-xs" onClick={() => updateQty(item.id, -1)}><Minus className="h-2.5 w-2.5" /></Button>
                          <span className="w-5 text-center font-bold text-xs text-foreground">{item.qty}</span>
                          <Button variant="ghost" size="icon" className="h-5 w-5 rounded-md print:hidden hover:bg-background shadow-xs" onClick={() => updateQty(item.id, 1)}><Plus className="h-2.5 w-2.5" /></Button>
                        </div>
                      </td>
                      <td className="py-2.5 print:hidden">
                        <Input type="number" value={item.discount || ""} onChange={(e) => updateItemDiscount(item.id, Number(e.target.value))} className="h-6 w-14 text-xs text-center mx-auto rounded-md bg-background border-border/60" placeholder="0" />
                      </td>
                      <td className="text-right py-2.5 font-bold text-xs text-foreground">Rs. {((item.price * item.qty) - item.discount).toLocaleString()}</td>
                      <td className="py-2.5 text-right print:hidden">
                        <button onClick={() => removeItem(item.id)} className="text-muted-foreground hover:text-destructive p-1 rounded-md transition-colors"><X className="h-3.5 w-3.5" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Bottom Totals & Actions */}
          <div className="border-t-2 border-primary/15 bg-card p-3 space-y-2.5 print:hidden shadow-[0_-6px_24px_-8px_hsl(var(--primary)/0.12)]">
            <div className="flex justify-between items-baseline">
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-semibold text-muted-foreground">Total</span>
                <span className="text-xs text-muted-foreground font-medium">({cart.reduce((s, c) => s + c.qty, 0)} items)</span>
              </div>
              <span className="text-xl sm:text-2xl font-extrabold text-primary tracking-tight">Rs. {total.toLocaleString()}</span>
            </div>

            {/* Advance Payment Banner — shown when a future order is loaded */}
            {loadedAdvancePayment > 0 && (
              <div className="bg-success/10 border border-success/30 rounded-xl p-2.5 space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground font-medium">Advance ({loadedAdvanceMethod}):</span>
                  <span className="font-bold text-success text-sm">- Rs. {loadedAdvancePayment.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold">Remaining</span>
                  <span className="text-sm font-bold text-primary">Rs. {Math.max(0, total - loadedAdvancePayment).toLocaleString()}</span>
                </div>
              </div>
            )}

            <div className="space-y-2 pt-0.5">
              {/* Secondary Actions Row */}
              <div className="grid grid-cols-4 gap-1.5">
                <Button variant="outline" className="text-destructive border-destructive/30 text-[10px] h-8 rounded-lg hover:bg-destructive/10 font-semibold" onClick={cancelOrder}><Trash2 className="h-3 w-3 mr-1" />Clear</Button>
                <Button variant="outline" className="text-amber-500 border-amber-500/30 text-[10px] h-8 rounded-lg hover:bg-amber-500/10 font-semibold" onClick={saveDraft}><FileText className="h-3 w-3 mr-1" />Draft</Button>
                <Button variant="outline" className="text-blue-500 border-blue-500/30 text-[10px] h-8 rounded-lg hover:bg-blue-500/10 font-semibold" onClick={() => cart.length > 0 && setShowQuotation(true)}><FileText className="h-3 w-3 mr-1" />Quote</Button>
                <Button variant="outline" className="text-indigo-500 border-indigo-500/30 text-[10px] h-8 rounded-lg hover:bg-indigo-500/10 font-semibold" onClick={() => cart.length > 0 && setShowInvoice(true)}><Printer className="h-3 w-3 mr-1" />Invoice</Button>
              </div>
              {/* KOT Print & Primary Order Button Row */}
              <div className="grid grid-cols-5 gap-2">
                <Button variant="outline" className="col-span-2 text-amber-600 dark:text-amber-400 border-amber-500/30 text-xs h-10 rounded-xl hover:bg-amber-500/10 font-bold gap-1" onClick={() => {
                  if (cart.length === 0) { toast.error("Add items first"); return; }
                  setKotItems([...cart]); setKotOrderType(orderType); setKotTableNumber(tableNumber); setKotStaffName(selectedStaff);
                  setKotOrderNumber("NEW"); setShowKOT(true);
                }}><ChefHat className="h-4 w-4" />Print KOT</Button>
                <Button className={cn("col-span-3 text-primary-foreground text-sm h-10 font-extrabold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200", paymentOnlyMode ? "bg-warning hover:bg-warning/90" : "gradient-primary")} onClick={handlePlaceOrder}>
                  {paymentOnlyMode ? "Collect Payment" : loadedOrderId ? "Update Order" : "Place Order"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: Menu Grid — full width on mobile when menu view active, flex-1 on desktop */}
        <div className={cn(
          "bg-card border-l border-border/60 flex flex-col min-w-0 print:hidden",
          "flex-1",
          mobileView === "menu" ? "flex" : "hidden xl:flex"
        )}>
          <div className="p-2 sm:p-3 border-b border-border/60">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search menu items..." className="pl-9 h-8 sm:h-9 text-xs rounded-lg bg-muted/40 border-transparent focus:border-primary/30 focus:bg-background transition-colors" />
            </div>
          </div>
          <div className="flex items-center gap-1.5 border-b border-border/60 p-2 overflow-x-auto bg-muted/15 scrollbar-none">
            {["All", ...foodCategories.map((c) => c.name)].map((cat) => {
              const count = cat === "All"
                ? foodMenuItems.filter((i) => i.available).length
                : foodMenuItems.filter((i) => i.available && i.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    "px-3 py-1.5 text-xs rounded-xl whitespace-nowrap font-medium transition-all flex items-center gap-1.5 shrink-0",
                    activeCategory === cat
                      ? "gradient-primary text-primary-foreground shadow-md font-bold"
                      : "bg-card border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/50 hover:border-border"
                  )}
                >
                  <span>{cat}</span>
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.2 rounded-full font-bold",
                    activeCategory === cat ? "bg-black/20 text-white" : "bg-muted text-muted-foreground"
                  )}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex-1 overflow-y-auto p-2.5 sm:p-3.5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-3 2xl:grid-cols-4 gap-3 auto-rows-max">
            {filteredMenu.length === 0 ? (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                <Search className="h-8 w-8 mx-auto opacity-20 mb-2" />
                <p className="text-sm">No items found</p>
              </div>
            ) : (
              filteredMenu.map((item) => {
                const hasLowStock = ingredients.some(ing => {
                  const recipe = (window as any).__recipes?.[item.name];
                  return recipe?.some((r: any) => r.ingredientId === ing.id && ing.currentStock <= ing.lowStockLevel);
                });
                const variantsCount = (item as any).variants?.length || 0;
                return (
                <React.Fragment key={item.id}>
                  <button onClick={() => addToCart(item)} className={cn(
                    "bg-card rounded-2xl border border-border/70 p-2 hover:shadow-xl hover:border-primary/40 transition-all duration-200 text-left group relative flex flex-col justify-between hover:-translate-y-0.5",
                    expandedItemId === item.id && "ring-2 ring-primary border-primary bg-primary/5 shadow-md"
                  )}>
                    <div className="aspect-[4/3] rounded-xl overflow-hidden mb-2 relative border border-border/40 w-full bg-muted/40">
                      {item.image ? (
                        <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-card via-muted/60 to-primary/10 flex flex-col items-center justify-center relative overflow-hidden group-hover:from-card group-hover:to-primary/20 transition-colors">
                          <Utensils className="h-9 w-9 text-primary/20 group-hover:text-primary/35 group-hover:scale-110 transition-all duration-300" />
                          <span className="absolute bottom-1.5 right-1.5 text-[11px] font-extrabold tracking-wider bg-background/80 text-primary px-2 py-0.5 rounded-md border border-primary/20 backdrop-blur-xs shadow-xs">
                            {item.name.charAt(0)}
                          </span>
                        </div>
                      )}
                      {!item.available && (
                        <div className="absolute inset-0 bg-background/85 backdrop-blur-xs flex items-center justify-center">
                          <Badge variant="destructive" className="text-[10px] font-bold shadow-xs">Unavailable</Badge>
                        </div>
                      )}
                      {variantsCount > 0 && (
                        <div className="absolute top-1.5 right-1.5">
                          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-background/80 backdrop-blur-xs text-foreground font-semibold border border-border/60 shadow-2xs">
                            {variantsCount} Sizes
                          </Badge>
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-foreground truncate group-hover:text-primary transition-colors">{item.name}</p>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-xs text-primary font-extrabold">{effectiveSettings.currency} {resolvePrice(item, orderType)}</p>
                        {(item as any).cookingTime > 0 && (
                          <span className="text-[9px] text-muted-foreground flex items-center gap-0.5 font-medium bg-muted/50 px-1.5 py-0.5 rounded-md"><Timer className="h-2.5 w-2.5" />{(item as any).cookingTime}m</span>
                        )}
                      </div>
                    </div>
                  </button>
                  {expandedItemId === item.id && (
                    <div className="col-span-full bg-card border border-primary/20 rounded-xl p-3 shadow-lg animate-in slide-in-from-top-2">
                      <div className="flex items-center gap-3 mb-3">
                        {item.image ? (
                          <img src={item.image} alt={item.name} className="h-12 w-12 rounded-lg object-cover" />
                        ) : (
                          <div className="h-12 w-12 rounded-lg gradient-primary flex items-center justify-center text-primary-foreground font-bold">{item.name.charAt(0)}</div>
                        )}
                        <div>
                          <p className="font-semibold text-sm">{item.name}</p>
                          {(() => {
                            const selectedVariantObj = selectedVariant ? (item as any).variants?.find((v: any) => v.name === selectedVariant) : null;
                            const basePrice = selectedVariantObj ? resolvePrice(selectedVariantObj, orderType) : resolvePrice(item, orderType);
                            const itemMods: any[] = (item as any).modifiers || [];
                            const modCost = selectedModifiers.reduce((s, mId) => s + Number(itemMods.find((m: any) => m.id === mId)?.price || modifiers.find(m => m.id === mId)?.price || 0), 0);
                            return (
                              <p className="text-primary font-bold text-sm">
                                {effectiveSettings.currency} {basePrice + modCost}
                                {modCost > 0 && <span className="text-[10px] text-muted-foreground font-normal ml-1">(+{modCost} extras)</span>}
                              </p>
                            );
                          })()}
                        </div>
                      </div>
                      {/* Variants */}
                      {(item as any).variants && (item as any).variants.length > 0 && (
                        <>
                          <p className="text-xs font-medium text-muted-foreground mb-2">Select Size:</p>
                          <div className="flex flex-wrap gap-2 mb-3">
                            {(item as any).variants.map((v: any) => (
                              <button key={v.name} onClick={() => setSelectedVariant(selectedVariant === v.name ? null : v.name)} className={cn(
                                "px-3 py-2 rounded-lg border text-xs font-medium transition-all",
                                selectedVariant === v.name
                                  ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                                  : "border-border hover:border-primary/50 hover:bg-muted/50"
                              )}>
                                {v.name} <span className="text-muted-foreground ml-1">{effectiveSettings.currency}{resolvePrice(v, orderType)}</span>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                      {/* Modifiers — filtered by active variant */}
                      {(() => {
                        const selectedVariantObj = selectedVariant ? (item as any).variants?.find((v: any) => v.name === selectedVariant) : null;
                        const selectedVarId = selectedVariantObj?.id;
                        const itemMods: any[] = ((item as any).modifiers || [])
                          .filter((m: any) => m.status === "active")
                          .filter((m: any) => {
                            // If modifier has variantIds filter, only show for matching variant
                            if (!m.variantIds || m.variantIds.length === 0) return true; // applies to all
                            if (!selectedVarId) return true; // no variant selected, show all
                            return m.variantIds.includes(selectedVarId);
                          });
                        if (itemMods.length === 0) return null;
                        return (
                          <>
                            <p className="text-xs font-medium text-muted-foreground mb-2">Select Modifiers (optional):</p>
                            <div className="flex flex-wrap gap-2 mb-3">
                              {itemMods.map((m: any) => (
                                <button key={m.id} onClick={() => {
                                  if (selectedModifiers.includes(m.id)) setSelectedModifiers(p => p.filter(x => x !== m.id));
                                  else setSelectedModifiers(p => [...p, m.id]);
                                }} className={cn(
                                  "px-3 py-2 rounded-lg border text-xs font-medium transition-all",
                                  selectedModifiers.includes(m.id)
                                    ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                                    : "border-border hover:border-primary/50 hover:bg-muted/50"
                                )}>
                                  {m.name} {Number(m.price) > 0 && <span className="text-muted-foreground ml-1">+Rs.{m.price}</span>}
                                </button>
                              ))}
                            </div>
                          </>
                        );
                      })()}
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="text-xs" onClick={() => { addDirectToCart(); }}>Add Without Extras</Button>
                        <Button size="sm" className="gradient-primary text-primary-foreground text-xs" onClick={() => {
                          if (!pendingItem) return;
                          const selectedVariantObj = selectedVariant ? (item as any).variants?.find((v: any) => v.name === selectedVariant) : null;
                          const variantPrice = selectedVariantObj ? resolvePrice(selectedVariantObj, orderType) : resolvePrice(item, orderType);
                          const allMods: any[] = (item as any).modifiers || modifiers;
                          const modifiersCost = selectedModifiers.reduce((sum, mId) => {
                            const mod = allMods.find((m: any) => m.id === mId) || modifiers.find((m) => m.id === mId);
                            return sum + (Number(mod?.price) || 0);
                          }, 0);
                          const variantLabel = selectedVariant ? ` (${selectedVariant})` : "";
                          const modLabels = selectedModifiers.map((mId) => (allMods.find((m: any) => m.id === mId) || modifiers.find((m) => m.id === mId))?.name || "");
                          setCart(prev => [...prev, {
                            id: `${item.id}-${Date.now()}`, name: `${item.name}${variantLabel}`,
                            price: variantPrice + modifiersCost, qty: 1, discount: 0,
                            modifiers: modLabels, cookingTime: (item as any).cookingTime || 0,
                            menuItemId: item.id, variantId: selectedVariantObj?.id || null,
                          }]);
                          setExpandedItemId(null);
                          setPendingItem(null);
                          setSelectedVariant(null);
                          setSelectedModifiers([]);
                          toast.success(`${item.name}${variantLabel} added`);
                        }}>Add to Cart</Button>
                        <Button size="sm" variant="ghost" className="text-xs ml-auto" onClick={() => { setExpandedItemId(null); setPendingItem(null); setSelectedVariant(null); }}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </React.Fragment>
                );
              })
            )}
          </div>
        </div>
      </div>


      {/* Add Customer Dialog */}
      <Dialog open={showCustomerAdd} onOpenChange={setShowCustomerAdd}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>Quick Add Customer</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input value={newCustomer.name} onChange={(e) => setNewCustomer((p) => ({ ...p, name: e.target.value }))} placeholder="Customer name *" />
            <Input value={newCustomer.phone} maxLength={12} onChange={(e) => setNewCustomer((p) => ({ ...p, phone: formatPakistaniPhone(e.target.value) }))} placeholder="Phone number (11 Digits) *" />
            <Input value={newCustomer.email} onChange={(e) => setNewCustomer((p) => ({ ...p, email: e.target.value }))} placeholder="Email (optional)" />
            <Input value={newCustomer.address} onChange={(e) => setNewCustomer((p) => ({ ...p, address: e.target.value }))} placeholder="Address (optional)" />
            <div>
              <Label className="text-xs mb-1">Customer Type</Label>
              <Select value={newCustomer.customerType} onValueChange={(v) => setNewCustomer((p) => ({ ...p, customerType: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="walk-in">Walk-in</SelectItem>
                  <SelectItem value="regular">Regular</SelectItem>
                  <SelectItem value="corporate">Corporate</SelectItem>
                  <SelectItem value="vip">VIP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCustomerAdd(false)}>Cancel</Button>
            <Button className="gradient-primary text-primary-foreground" onClick={addNewCustomer}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Order Dialog */}
      <AlertDialog open={showConfirmOrder} onOpenChange={setShowConfirmOrder}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Order</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left">
                <p>Type: <strong>{orderType}</strong>{tableNumber ? ` — Table ${tableNumber}` : ""}</p>
                <p>Customer: <strong>{selectedCustomerData?.name || "Walk-in"}</strong></p>
                <p>Items: <strong>{cart.length}</strong></p>
                {loadedAdvancePayment > 0 ? (
                  <div className="bg-muted/60 p-3 rounded-xl border border-border/60 space-y-1.5 text-xs text-foreground mt-2">
                    <div className="flex justify-between"><span>Gross Order Total:</span><span className="font-mono font-bold">Rs. {total.toLocaleString()}</span></div>
                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-semibold"><span>Advance Deposit Paid ({loadedAdvanceMethod}):</span><span className="font-mono">- Rs. {loadedAdvancePayment.toLocaleString()}</span></div>
                    <div className="flex justify-between font-extrabold text-sm pt-1.5 border-t border-border text-primary"><span>Net Payable:</span><span className="font-mono">Rs. {netPayable.toLocaleString()}</span></div>
                  </div>
                ) : (
                  <p className="text-lg font-bold text-primary">Total: Rs. {total.toLocaleString()}</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="gradient-primary text-primary-foreground" onClick={confirmPlaceOrder}>
              Continue to Payment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Finalize Sale Dialog */}
      <Dialog open={showFinalizeSale} onOpenChange={setShowFinalizeSale}>
        <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[95vh] overflow-y-auto">
          <DialogHeader className="pb-2 border-b border-border/40">
            <DialogTitle className="flex items-center justify-between text-lg">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                <span>Finalize Sale</span>
              </div>
              <Badge variant="outline" className="text-xs font-mono gap-1 border-muted-foreground/30">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span>{orderElapsed}</span>
              </Badge>
            </DialogTitle>
          </DialogHeader>

          {/* Delivery Payment Mode Selector — only shown for new delivery orders */}
          {orderType === "Delivery" && !loadedAdvancePayment && (
            <div className="bg-muted/30 rounded-xl p-3.5 space-y-2.5 border border-border/60">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Truck className="h-3.5 w-3.5 text-primary" />
                  Delivery Payment Mode
                </p>
                <span className="text-[11px] text-muted-foreground">Select how order will be settled</span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {(["cod", "advance", "prepaid"] as const).map(mode => (
                  <Button
                    key={mode}
                    size="sm"
                    variant={deliveryPayMode === mode ? "default" : "outline"}
                    className={cn(
                      "text-xs h-11 flex items-center justify-center gap-2 font-medium transition-all",
                      deliveryPayMode === mode
                        ? "gradient-primary text-primary-foreground shadow-sm font-semibold"
                        : "hover:bg-muted/80"
                    )}
                    onClick={() => {
                      setDeliveryPayMode(mode);
                      setAdvanceEntries([]);
                      setAdvanceAmount(0);
                    }}
                  >
                    {mode === "cod"     && <><Truck className="h-4 w-4 shrink-0" /><span>Cash on Delivery</span></>}
                    {mode === "advance" && <><Wallet className="h-4 w-4 shrink-0" /><span>Advance Payment</span></>}
                    {mode === "prepaid" && <><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" /><span>Full Prepaid</span></>}
                  </Button>
                ))}
              </div>

              {/* COD banner */}
              {deliveryPayMode === "cod" && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2.5">
                  <Truck className="h-4 w-4 shrink-0 text-amber-500" />
                  <span>Doorstep Collection: Rider will collect <strong className="font-mono font-bold text-amber-600 dark:text-amber-300">Rs. {total.toLocaleString()}</strong> from customer at delivery.</span>
                </div>
              )}

              {/* Advance input panel */}
              {deliveryPayMode === "advance" && (
                <div className="space-y-2.5 pt-1.5 border-t border-border/40">
                  <p className="text-xs font-semibold text-muted-foreground">Select Advance Payment Method & Amount</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {(effectiveSettings?.paymentMethods ?? ["Cash", "Credit Card", "Account", "JazzCash", "EasyPaisa"]).map(pm => {
                      const IconComponent = getPaymentIcon(pm);
                      return (
                        <Button key={pm} size="sm" variant={advanceMethod === pm ? "default" : "outline"}
                          className={cn("text-xs h-8 gap-1.5", advanceMethod === pm && "gradient-primary text-primary-foreground font-semibold")}
                          onClick={() => setAdvanceMethod(pm)}>
                          <IconComponent className="h-3.5 w-3.5" />{pm}
                        </Button>
                      );
                    })}
                  </div>

                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="Advance amount (Rs.)"
                      value={advanceAmount || ""}
                      onChange={e => setAdvanceAmount(Number(e.target.value))}
                      className="text-sm h-9"
                    />
                    <Button size="sm" className="h-9 px-4 gap-1" onClick={() => {
                      if (advanceAmount <= 0) { toast.error("Enter advance amount"); return; }
                      if (advanceAmount >= total) {
                        toast.info("Advance deposit equals or exceeds total — converted to Full Prepaid mode");
                        setDeliveryPayMode("prepaid");
                        setPaymentEntries([{ id: `pay-${Date.now()}`, method: advanceMethod, amount: advanceAmount }]);
                        setAdvanceAmount(0);
                        return;
                      }
                      setAdvanceEntries(prev => [...prev, { id: `adv-${Date.now()}`, method: advanceMethod, amount: advanceAmount }]);
                      setAdvanceAmount(0);
                    }}>
                      <Plus className="h-3.5 w-3.5" />Add Advance
                    </Button>
                  </div>

                  {advanceEntries.map(e => (
                    <div key={e.id} className="flex items-center justify-between text-xs bg-muted/60 border border-border/40 rounded-lg px-2.5 py-1.5">
                      <span className="font-medium flex items-center gap-1.5">
                        <Wallet className="h-3 w-3 text-primary" />{e.method}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold">Rs. {e.amount.toLocaleString()}</span>
                        <button onClick={() => setAdvanceEntries(prev => prev.filter(x => x.id !== e.id))} className="text-destructive hover:text-destructive/80 transition-colors">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {advanceEntries.length > 0 && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 text-xs space-y-1">
                      <div className="flex justify-between text-muted-foreground"><span>Total Order Amount</span><span className="font-mono font-bold text-foreground">Rs. {total.toLocaleString()}</span></div>
                      <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-semibold"><span>Advance Deposit Received</span><span className="font-mono">- Rs. {advanceTotal.toLocaleString()}</span></div>
                      <Separator className="my-1 bg-amber-500/20" />
                      <div className="flex justify-between text-amber-700 dark:text-amber-300 font-extrabold text-sm">
                        <span className="flex items-center gap-1"><Truck className="h-3.5 w-3.5" />Rider Collects at Doorstep</span>
                        <span className="font-mono">Rs. {deliveryBalance.toLocaleString()}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
            {/* Left: Order Info & Cart Overview */}
            <div className="space-y-3 bg-muted/20 p-3 rounded-xl border border-border/50">
              <div className="text-xs space-y-1.5">
                <p className="text-muted-foreground flex justify-between">
                  <span>Customer:</span>
                  <strong className="text-foreground font-semibold">{selectedCustomerData?.name || "Walk-in"}</strong>
                </p>
                <p className="text-muted-foreground flex justify-between">
                  <span>Order Type:</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 uppercase font-semibold">{orderType}</Badge>
                </p>
                {tableNumber && (
                  <p className="text-muted-foreground flex justify-between">
                    <span>Table:</span>
                    <strong className="text-foreground">#{tableNumber}</strong>
                  </p>
                )}
                {deliveryAddress && orderType === "Delivery" && (
                  <p className="text-muted-foreground text-[11px] truncate">
                    <span>Address: </span><strong className="text-foreground">{deliveryAddress}</strong>
                  </p>
                )}
              </div>

              <Separator className="bg-border/60" />

              <Button variant="ghost" size="sm" className="text-xs w-full justify-between h-7 text-muted-foreground hover:text-foreground" onClick={() => setShowCartDetails(!showCartDetails)}>
                <span>Cart Details ({cart.length} items)</span>
                <span>{showCartDetails ? "Hide" : "Show"}</span>
              </Button>

              {showCartDetails && (
                <div className="text-xs space-y-1.5 max-h-32 overflow-y-auto pr-1 bg-background/50 p-2 rounded-lg border border-border/40">
                  {cart.map(item => (
                    <div key={item.id} className="flex justify-between text-muted-foreground">
                      <span className="truncate pr-2">{item.qty}x {item.name}</span>
                      <span className="font-mono font-medium text-foreground">Rs. {((item.price * item.qty) - item.discount).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}

              <Separator className="bg-border/60" />

              {/* Left Column Bill Breakdown */}
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span className="font-mono">Rs. {subtotal.toLocaleString()}</span></div>
                {orderDiscount > 0 && <div className="flex justify-between text-destructive"><span>Discount</span><span className="font-mono">-Rs. {orderDiscount.toLocaleString()}</span></div>}
                <div className="flex justify-between text-muted-foreground"><span>Tax</span><span className="font-mono">Rs. {tax.toLocaleString()}</span></div>
                <Separator className="my-1 bg-border/60" />
                <div className="flex justify-between font-bold text-sm text-foreground pt-0.5">
                  <span>Gross Order Total</span>
                  <span className="font-mono text-primary">Rs. {total.toLocaleString()}</span>
                </div>
                {loadedAdvancePayment > 0 && (
                  <>
                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-semibold text-xs pt-1">
                      <span>Advance Deposit ({loadedAdvanceMethod})</span>
                      <span className="font-mono">- Rs. {loadedAdvancePayment.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between font-extrabold text-sm pt-1 text-primary">
                      <span>Net Payable</span>
                      <span className="font-mono">Rs. {netPayable.toLocaleString()}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Center: Counter Payment Entry (Hidden for Delivery COD & Delivery Advance) */}
            {!(orderType === "Delivery" && (deliveryPayMode === "cod" || deliveryPayMode === "advance") && !loadedAdvancePayment) ? (
              <div className="space-y-3 bg-muted/20 p-3 rounded-xl border border-border/50">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Select Payment Method</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {(effectiveSettings?.paymentMethods ?? ["Cash", "Credit Card", "Account", "JazzCash", "EasyPaisa"]).map(pm => {
                    const IconComponent = getPaymentIcon(pm);
                    return (
                      <Button key={pm} variant={finalizeMethod === pm ? "default" : "outline"} size="sm"
                        className={cn("text-xs h-8 gap-1", finalizeMethod === pm && "gradient-primary text-primary-foreground font-semibold")}
                        onClick={() => setFinalizeMethod(pm)}>
                        <IconComponent className="h-3.5 w-3.5" />{pm}
                      </Button>
                    );
                  })}
                </div>
                <Separator className="bg-border/60" />
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Enter Cash / Amount</p>
                  <Input type="number" value={givenAmount || ""} onChange={(e) => setGivenAmount(Number(e.target.value))} placeholder="0" className="text-lg text-center font-mono font-bold h-10" />
                  <div className="grid grid-cols-3 gap-1">
                    {quickDenominations.map(d => (
                      <Button key={d} variant="outline" size="sm" className="text-xs font-mono h-7" onClick={() => setGivenAmount(prev => prev + d)}>+{d}</Button>
                    ))}
                  </div>
                  <Button className="w-full h-8 text-xs font-semibold gap-1" size="sm" onClick={addPaymentEntry}>
                    <Plus className="h-3.5 w-3.5" />Add Payment Entry
                  </Button>
                  <Button variant="outline" className="w-full text-xs h-7" size="sm" onClick={() => { setGivenAmount(netPayable); setPaymentEntries([]); }}>
                    Exact Amount (Rs. {netPayable.toLocaleString()})
                  </Button>
                </div>
              </div>
            ) : (
              /* Hero Info Banner in Middle Column when COD or Advance is selected */
              <div className="bg-muted/20 p-4 rounded-xl border border-border/50 flex flex-col items-center justify-center text-center space-y-2">
                {deliveryPayMode === "cod" ? (
                  <>
                    <div className="p-3 bg-amber-500/10 rounded-full text-amber-500">
                      <Truck className="h-8 w-8" />
                    </div>
                    <p className="text-sm font-bold text-foreground">Cash on Delivery</p>
                    <p className="text-xs text-muted-foreground max-w-[200px]">
                      Customer will pay cash directly to the rider at delivery. No payment entry needed now.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="p-3 bg-blue-500/10 rounded-full text-blue-500">
                      <Wallet className="h-8 w-8" />
                    </div>
                    <p className="text-sm font-bold text-foreground">Advance Payment Mode</p>
                    <p className="text-xs text-muted-foreground max-w-[200px]">
                      Enter advance deposit in the top panel. Remaining balance will be collected by rider at doorstep.
                    </p>
                  </>
                )}
              </div>
            )}

            {/* Right: Settlement & Payment Entries Summary */}
            <div className="space-y-3 bg-muted/20 p-3 rounded-xl border border-border/50 flex flex-col justify-between">
              <div className="space-y-2.5">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Payment Summary</p>

                {/* Show entries depending on mode */}
                {orderType === "Delivery" && deliveryPayMode === "advance" && !loadedAdvancePayment ? (
                  <div className="space-y-1 bg-background/60 p-2 rounded-lg border border-border/40">
                    <p className="text-[11px] font-semibold text-muted-foreground">Advance Entries ({advanceEntries.length})</p>
                    {advanceEntries.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic py-1">No advance entries added</p>
                    ) : (
                      advanceEntries.map(e => (
                        <div key={e.id} className="flex items-center justify-between text-xs py-0.5">
                          <span className="font-medium">{e.method}</span>
                          <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">Rs. {e.amount.toLocaleString()}</span>
                        </div>
                      ))
                    )}
                  </div>
                ) : orderType === "Delivery" && deliveryPayMode === "cod" && !loadedAdvancePayment ? (
                  <div className="bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-lg text-xs space-y-1">
                    <div className="flex justify-between text-amber-700 dark:text-amber-400 font-semibold">
                      <span>Payment Type:</span>
                      <span>COD Doorstep</span>
                    </div>
                    <div className="flex justify-between font-bold text-foreground pt-0.5">
                      <span>Rider Collects:</span>
                      <span className="font-mono">Rs. {total.toLocaleString()}</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1 bg-background/60 p-2 rounded-lg border border-border/40">
                    <p className="text-[11px] font-semibold text-muted-foreground">Counter Payment Entries ({paymentEntries.length})</p>
                    {paymentEntries.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic py-1">No entries yet</p>
                    ) : (
                      paymentEntries.map(e => (
                        <div key={e.id} className="flex items-center justify-between text-xs py-0.5">
                          <span className="font-medium">{e.method}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold">Rs. {e.amount.toLocaleString()}</span>
                            <button onClick={() => removePaymentEntry(e.id)} className="text-destructive hover:text-destructive/80">
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                <Separator className="bg-border/60" />

                {/* Single Authoritative Balance Summary — No Duplication! */}
                <div className="space-y-1 text-xs">
                  {orderType === "Delivery" && deliveryPayMode === "cod" && !loadedAdvancePayment ? (
                    <div className="flex justify-between font-bold text-foreground text-sm">
                      <span>Doorstep Cash Due</span>
                      <span className="font-mono text-amber-600 dark:text-amber-400">Rs. {total.toLocaleString()}</span>
                    </div>
                  ) : orderType === "Delivery" && deliveryPayMode === "advance" && !loadedAdvancePayment ? (
                    <>
                      <div className="flex justify-between text-muted-foreground"><span>Total Advance Paid</span><span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">Rs. {advanceTotal.toLocaleString()}</span></div>
                      <div className="flex justify-between font-bold text-foreground text-sm pt-1 border-t border-border/40"><span>Rider Collects</span><span className="font-mono text-amber-600 dark:text-amber-400">Rs. {deliveryBalance.toLocaleString()}</span></div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between text-muted-foreground"><span>Net Payable</span><span className="font-mono font-semibold">Rs. {netPayable.toLocaleString()}</span></div>
                      <div className="flex justify-between text-muted-foreground"><span>Total Collected</span><span className={cn("font-mono font-bold", totalPaid >= netPayable ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>Rs. {totalPaid.toLocaleString()}</span></div>
                      {totalPaid > netPayable && <div className="flex justify-between text-emerald-600 font-bold pt-1 border-t border-border/40"><span>Change Return</span><span className="font-mono">Rs. {(totalPaid - netPayable).toLocaleString()}</span></div>}
                      {totalPaid < netPayable && <div className="flex justify-between text-destructive font-bold pt-1 border-t border-border/40"><span>Remaining Balance</span><span className="font-mono">Rs. {(netPayable - totalPaid).toLocaleString()}</span></div>}
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <div className="flex items-center gap-2">
                  <Checkbox id="sendSMS" checked={sendSMS} onCheckedChange={(c) => setSendSMS(!!c)} />
                  <Label htmlFor="sendSMS" className="text-xs cursor-pointer text-muted-foreground hover:text-foreground">Send SMS receipt to customer</Label>
                </div>

                {isDeliveryPrepaid && totalPaid < netPayable && (
                  <p className="text-[11px] text-destructive font-medium bg-destructive/10 p-1.5 rounded border border-destructive/30 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                    Full Prepaid requires complete payment (Rs. {netPayable.toLocaleString()}). Enter full payment or switch mode.
                  </p>
                )}
                {isDeliveryAdvance && advanceEntries.length === 0 && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1 font-medium bg-amber-500/10 p-1.5 rounded border border-amber-500/20">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Enter at least one advance payment entry above.
                  </p>
                )}
                {orderType !== "Delivery" && totalPaid < netPayable && (
                  <p className="text-[11px] text-destructive font-medium bg-destructive/10 p-1.5 rounded border border-destructive/30 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                    Full payment required (Rs. {netPayable.toLocaleString()}). Remaining balance must be 0 to confirm.
                  </p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-3 border-t border-border/40">
            <Button variant="outline" size="sm" onClick={() => setShowFinalizeSale(false)} disabled={isSubmitting}>Cancel</Button>
            <Button className="gradient-primary text-primary-foreground min-w-[160px] h-9 font-semibold gap-1.5" onClick={handleFinalizeSubmit} disabled={isSubmitting || (orderType !== "Delivery" && totalPaid < netPayable) || (isDeliveryAdvance && !isAdvanceSufficient) || (isDeliveryPrepaid && totalPaid < netPayable)}>
              {isSubmitting
                ? <><Loader2 className="h-4 w-4 animate-spin" />Processing...</>
                : <><Check className="h-4 w-4" />Confirm Payment</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice Preview Dialog */}
      <Dialog open={showInvoice} onOpenChange={setShowInvoice}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Invoice Preview</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="text-center space-y-1">
              <Flame className="h-6 w-6 mx-auto text-primary" />
              <p className="font-bold text-primary">{effectiveSettings.restaurantName || "OVENISTO"}</p>
              <p className="text-xs text-muted-foreground">{effectiveSettings.address} — {effectiveSettings.phone}</p>
            </div>
            <Separator />
            <div className="text-xs space-y-0.5">
              <p>Customer: <strong>{selectedCustomerData?.name || "Walk-in"}</strong> {selectedCustomerData?.phone ? `(${selectedCustomerData.phone})` : ""} | Type: <strong>{orderType}</strong></p>
              {selectedCustomerData?.address && <p className="text-muted-foreground text-[11px]">Address: {selectedCustomerData.address}</p>}
            </div>
            <Table>
              <TableHeader><TableRow><TableHead className="text-xs">Item</TableHead><TableHead className="text-xs text-center">Qty</TableHead><TableHead className="text-xs text-right">Total</TableHead></TableRow></TableHeader>
              <TableBody>{cart.map((c, i) => <TableRow key={i}><TableCell className="text-xs">{c.name}</TableCell><TableCell className="text-xs text-center">{c.qty}</TableCell><TableCell className="text-xs text-right">Rs. {((c.price * c.qty) - c.discount).toLocaleString()}</TableCell></TableRow>)}</TableBody>
            </Table>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between"><span>Subtotal</span><span>Rs. {subtotal.toLocaleString()}</span></div>
              {orderDiscount > 0 && <div className="flex justify-between"><span>Discount</span><span className="text-destructive">-Rs. {orderDiscount.toLocaleString()}</span></div>}
              <div className="flex justify-between"><span>Tax</span><span>Rs. {tax.toLocaleString()}</span></div>
              <Separator />
              <div className="flex justify-between font-bold text-sm"><span>Gross Total</span><span>Rs. {total.toLocaleString()}</span></div>
              {loadedAdvancePayment > 0 && (
                <>
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-semibold"><span>Advance Deposit ({loadedAdvanceMethod})</span><span>- Rs. {loadedAdvancePayment.toLocaleString()}</span></div>
                  <Separator />
                  <div className="flex justify-between font-extrabold text-base"><span>Net Payable / Balance</span><span className="text-primary">Rs. {netPayable.toLocaleString()}</span></div>
                </>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvoice(false)}>Close</Button>
            <Button variant="outline" onClick={() => generateInvoicePDF({
              orderNumber: "—", date: new Date().toISOString().split("T")[0], time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
              orderType, tableNumber: tableNumber || undefined, customer: selectedCustomerData?.name || "Walk-in",
              phone: selectedCustomerData?.phone || "", staff: selectedStaff, paymentMethod: finalizeMethod,
              items: cart.map(c => ({ name: c.name, qty: c.qty, price: c.price, discount: c.discount })),
              subtotal, discount: orderDiscount, tax, total, advancePayment: loadedAdvancePayment || undefined,
            })}><Download className="h-4 w-4 mr-1" />PDF</Button>
            <Button className="gradient-primary text-primary-foreground" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />Print</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* KOT Dialog */}
      <Dialog open={showKOT} onOpenChange={setShowKOT}>
        <DialogContent className="max-w-sm">
          <DialogHeader className="sr-only">
            <DialogTitle>Kitchen Order Ticket</DialogTitle>
            <DialogDescription>Kitchen order ticket details and printing preview</DialogDescription>
          </DialogHeader>
          <div className="space-y-4" id="kot-print">
            <div className="text-center border-b pb-3">
              <p className="font-bold text-lg">KITCHEN ORDER TICKET</p>
              <p className="text-2xl font-bold text-primary">{kotOrderNumber || "NEW"}</p>
              {isUrgent && <Badge className="bg-destructive text-destructive-foreground mt-1 text-sm px-4"><Zap className="h-3.5 w-3.5 mr-1" />URGENT ORDER</Badge>}
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <p>Date: {new Date().toLocaleDateString()}</p>
              <p>Time: {new Date().toLocaleTimeString()}</p>
              <p>Type: <strong>{kotOrderType}</strong></p>
              {kotTableNumber && <p>Table: <strong>#{kotTableNumber}</strong></p>}
              {kotStaffName && <p>Waiter: <strong>{kotStaffName}</strong></p>}
            </div>
            <Separator />
            <div className="space-y-2">
              {kotItems.length > 0 ? kotItems.map((item) => (
                <div key={item.id} className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="font-bold text-lg">{item.qty}x {item.name}</p>
                    {item.modifiers && item.modifiers.length > 0 && (
                      <p className="text-sm text-muted-foreground ml-4">&rarr; {item.modifiers.join(", ")}</p>
                    )}
                    {item.notes && (
                      <p className="text-sm text-warning ml-4 italic">Note: {item.notes}</p>
                    )}
                  </div>
                  {(item as CartItem).cookingTime ? (
                    <Badge variant="outline" className="text-[10px] shrink-0 ml-2">
                      <Timer className="h-3 w-3 mr-0.5" />{(item as CartItem).cookingTime}m
                    </Badge>
                  ) : null}
                </div>
              )) : <p className="text-muted-foreground text-xs">No items</p>}
            </div>
            {kotItems.length > 0 && (() => {
              const maxCookTime = Math.max(...kotItems.map(i => (i as CartItem).cookingTime || 0));
              return maxCookTime > 0 ? (
                <div className="border-t pt-3 flex items-center justify-between bg-primary/5 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <ChefHat className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">Est. Cooking Time</span>
                  </div>
                  <Badge className="gradient-primary text-primary-foreground text-sm px-3">{maxCookTime} min</Badge>
                </div>
              ) : null;
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowKOT(false)}>Close</Button>
            <Button className="gradient-primary text-primary-foreground" onClick={() => { window.print(); setShowKOT(false); }}><Printer className="h-4 w-4 mr-1" />Print KOT</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Status Sheet */}
      <Sheet open={showOrderStatus} onOpenChange={setShowOrderStatus}>
        <SheetContent side="right" className="w-full sm:max-w-none sm:w-[600px] md:w-[700px] lg:w-[800px] xl:w-[850px] p-0 flex flex-col">
          <SheetHeader className="sr-only">
            <SheetTitle>Live Order Status Tracking</SheetTitle>
            <SheetDescription>Real-time order tracking and status management sheet</SheetDescription>
          </SheetHeader>
          <div className="p-5 border-b bg-card space-y-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-xl flex items-center gap-2.5 text-foreground">
                <ClipboardList className="h-6 w-6 text-primary" />
                Live Order Status Tracking
              </h2>
              <Badge variant="outline" className="text-xs font-bold px-3 py-1 rounded-xl bg-primary/10 text-primary border-primary/30">
                {activeOrdersCount} Active Orders
              </Badge>
            </div>

            {/* Clickable Status Filter Cards — Pending, Preparing, Ready, Completed */}
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setOrderStatusTab("pending")}
                className={cn(
                  "p-3 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 font-bold",
                  orderStatusTab === "pending"
                    ? "bg-amber-500/20 border-amber-500 text-amber-600 dark:text-amber-400 font-extrabold ring-2 ring-amber-500/40 shadow-md scale-[1.02]"
                    : "bg-muted/40 border-border/70 text-muted-foreground hover:bg-warning/10 hover:text-warning"
                )}
              >
                <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  <Clock className="h-3.5 w-3.5" /> Pending
                </div>
                <span className="text-xl font-black text-amber-600 dark:text-amber-400">{ordersByStatus.pending.length}</span>
              </button>

              <button
                type="button"
                onClick={() => setOrderStatusTab("preparing")}
                className={cn(
                  "p-3 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 font-bold",
                  orderStatusTab === "preparing"
                    ? "bg-info/20 border-info text-info font-extrabold ring-2 ring-info/40 shadow-md scale-[1.02]"
                    : "bg-muted/40 border-border/70 text-muted-foreground hover:bg-info/10 hover:text-info"
                )}
              >
                <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-info">
                  <ChefHat className="h-3.5 w-3.5" /> Preparing
                </div>
                <span className="text-xl font-black text-info">{ordersByStatus.preparing.length}</span>
              </button>

              <button
                type="button"
                onClick={() => setOrderStatusTab("ready")}
                className={cn(
                  "p-3 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 font-bold",
                  orderStatusTab === "ready"
                    ? "bg-emerald-500/20 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-extrabold ring-2 ring-emerald-500/40 shadow-md scale-[1.02]"
                    : "bg-muted/40 border-border/70 text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-500"
                )}
              >
                <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Ready
                </div>
                <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">{ordersByStatus.ready.length}</span>
              </button>

              <button
                type="button"
                onClick={() => setOrderStatusTab("completed")}
                className={cn(
                  "p-3 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 font-bold",
                  orderStatusTab === "completed"
                    ? "bg-purple-500/20 border-purple-500 text-purple-600 dark:text-purple-400 font-extrabold ring-2 ring-purple-500/40 shadow-md scale-[1.02]"
                    : "bg-muted/40 border-border/70 text-muted-foreground hover:bg-purple-500/10 hover:text-purple-500"
                )}
              >
                <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Completed
                </div>
                <span className="text-xl font-black text-purple-600 dark:text-purple-400">{ordersByStatus.completed.length}</span>
              </button>
            </div>

            {/* Order Type Sub-Filters Bar: All, Dine In, Take Away, Delivery, Self Order */}
            <div className="flex items-center gap-1.5 p-1.5 bg-muted/60 rounded-2xl border border-border/50 shadow-2xs overflow-x-auto">
              <button
                type="button"
                onClick={() => setOrderStatusTypeFilter("all")}
                className={cn(
                  "flex-1 py-1.5 px-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0",
                  orderStatusTypeFilter === "all"
                    ? "bg-card text-foreground shadow-xs border border-border font-extrabold scale-[1.01]"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/40"
                )}
              >
                <span>All Types</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 rounded-full font-bold">
                  {ordersByStatus[orderStatusTab].length}
                </Badge>
              </button>

              {(["Dine In", "Take Away", "Delivery", "Self Order"] as const).map(type => {
                const count = ordersByStatus[orderStatusTab].filter(o => {
                  const isSelf = o.type === "Self Order" || (o as any).staff === "Self Order" || (o as any).staffName === "Self Order" || (o as any).orderSource === "self-order";
                  if (type === "Self Order") return isSelf;
                  return o.type === type && !isSelf;
                }).length;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setOrderStatusTypeFilter(type)}
                    className={cn(
                      "flex-1 py-1.5 px-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0",
                      orderStatusTypeFilter === type
                        ? "bg-card text-foreground shadow-xs border border-border font-extrabold scale-[1.01]"
                        : "text-muted-foreground hover:text-foreground hover:bg-card/40"
                    )}
                  >
                    <span>{type}</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 rounded-full font-bold">
                      {count}
                    </Badge>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-5 space-y-4 overflow-y-auto flex-1 bg-background/40">
            {(() => {
              const currentList = ordersByStatus[orderStatusTab].filter(o => {
                if (orderStatusTypeFilter === "all") return true;
                const isSelf = o.type === "Self Order" || (o as any).staff === "Self Order" || (o as any).staffName === "Self Order" || (o as any).orderSource === "self-order";
                if (orderStatusTypeFilter === "Self Order") return isSelf;
                return o.type === orderStatusTypeFilter && !isSelf;
              });

              if (currentList.length === 0) {
                return (
                  <div className="text-center py-20 text-muted-foreground">
                    <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-30 text-primary" />
                    <p className="font-bold text-base text-foreground">
                      No {orderStatusTypeFilter !== "all" ? orderStatusTypeFilter : ""} {orderStatusTab} orders found
                    </p>
                    <p className="text-xs mt-1">Orders matching this filter will appear here</p>
                  </div>
                );
              }

              const status = orderStatusTab;
              return (
                <div className="space-y-3">
                  <div className="space-y-3">
                    {currentList.map(order => (
                        <Card key={order.id} className={cn(
                          "p-4 text-xs border-l-4 rounded-2xl transition-all duration-200 hover:shadow-md bg-card space-y-3",
                          status === "pending" ? "border-l-warning border-border/70" :
                          status === "preparing" ? "border-l-info border-border/70" :
                          status === "ready" ? "border-l-emerald-500 border-border/70" : "border-l-purple-500 border-border/70"
                        )}>
                          <div className="flex justify-between items-start border-b border-border/40 pb-2.5">
                            <div>
                              <span className="font-extrabold text-base text-foreground">{order.orderNumber}</span>
                              <span className="text-muted-foreground text-xs ml-2 font-medium">{order.time}</span>
                            </div>
                            <Badge variant="outline" className={cn("text-xs font-extrabold capitalize px-2.5 py-0.5 rounded-xl border flex items-center gap-1",
                              status === "pending" ? "bg-warning/15 text-warning border-warning/30" :
                              status === "preparing" ? "bg-info/15 text-info border-info/30" :
                              status === "ready" ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" : "bg-purple-500/15 text-purple-500 border-purple-500/30"
                            )}>
                              {status === "pending" ? <Clock className="h-3 w-3" /> :
                               status === "preparing" ? <ChefHat className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                              {status}
                            </Badge>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <User className="h-3.5 w-3.5 shrink-0 text-primary" />
                              <span className="font-bold text-foreground truncate">{order.customer}</span>
                            </div>
                            <div className="flex items-center justify-end gap-1.5 text-muted-foreground font-medium">
                              <Phone className="h-3 w-3" />
                              <span>{order.phone || "N/A"}</span>
                            </div>
                          </div>

                           {order.tableNumber && (
                            <div className="bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20 flex items-center justify-between font-semibold">
                              <span className="flex items-center gap-1.5 text-foreground">
                                <Utensils className="h-4 w-4 text-amber-500" />
                                Table: <strong className="text-amber-500 font-extrabold">Table {order.tableNumber}</strong>
                              </span>
                              <Badge variant="secondary" className="text-[10px] font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30">{order.type || "Dine In"}</Badge>
                            </div>
                          )}

                          {order.type === "Delivery" && order.deliveryAddress && (
                            <div className="bg-muted/50 p-2.5 rounded-xl border border-border/40 flex items-center justify-between text-muted-foreground">
                              <div className="flex items-center gap-1.5 truncate">
                                <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                                <span className="truncate text-foreground font-medium">{order.deliveryAddress}</span>
                              </div>
                              {order.rider && <Badge variant="outline" className="text-[10px] font-bold ml-2 shrink-0">{order.rider}</Badge>}
                            </div>
                          )}

                          <div className="bg-muted/40 rounded-xl p-3 border border-border/40 space-y-1.5">
                            <p className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">Order Items</p>
                            {order.items.map((item, idx) => (
                              <div key={idx} className="flex justify-between items-center text-xs">
                                <span className="text-foreground font-medium">
                                  {item.qty}x {item.name}
                                </span>
                                <span className="text-foreground font-bold font-mono">Rs.{item.price * item.qty}</span>
                              </div>
                            ))}
                            <div className="border-t border-border/50 pt-1.5 mt-1 flex justify-between font-extrabold text-sm text-foreground">
                              <span>Total</span>
                              <span className="text-primary font-mono">Rs.{order.total}</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-xs text-muted-foreground font-medium px-1">
                            <span>Payment: <strong className="text-foreground">{order.paymentMethod}</strong></span>
                            <span>Staff: <strong className="text-foreground">{order.staff}</strong></span>
                          </div>

                          {(() => {
                            if (status === "ready" || status === "completed") return null;
                            const rawCookTime = Math.max(...order.items.map((i: any) => i.cookingTime || 0), 0);
                            const cookTime = rawCookTime > 0 ? rawCookTime : 10;

                            if (status === "pending") {
                              return (
                                <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 p-2 rounded-xl text-xs">
                                  <Timer className="h-4 w-4 shrink-0 text-amber-500" />
                                  <span className="font-bold text-amber-500">
                                    Waiting for kitchen · {cookTime} min est.
                                  </span>
                                </div>
                              );
                            }

                            const startMs = posPreparingAtMap.current[order.id]
                              ?? ((order as any).updatedAt ? new Date((order as any).updatedAt).getTime() : null)
                              ?? statusClock;
                            const elapsedSec = Math.floor((statusClock - startMs) / 1000);
                            const totalSec = cookTime * 60;
                            const remainSec = Math.max(0, totalSec - elapsedSec);
                            const isOverdue = elapsedSec > totalSec;
                            const mm = String(Math.floor(remainSec / 60)).padStart(2, "0");
                            const ss = String(remainSec % 60).padStart(2, "0");
                            const overMin = Math.floor((elapsedSec - totalSec) / 60);
                            const overSec = (elapsedSec - totalSec) % 60;
                            return (
                              <div className={cn("flex items-center gap-2 p-2 rounded-xl text-xs font-bold border",
                                isOverdue ? "bg-rose-500/10 border-rose-500/30 text-rose-500" :
                                remainSec <= 120 ? "bg-amber-500/10 border-amber-500/30 text-amber-500" : "bg-info/10 border-info/30 text-info"
                              )}>
                                <Timer className="h-4 w-4 shrink-0" />
                                <span className="tabular-nums font-mono">
                                  {isOverdue
                                    ? `Overdue ${overMin}m ${overSec}s`
                                    : `${mm}:${ss} remaining`}
                                </span>
                              </div>
                            );
                          })()}

                          {status === "completed" ? (
                            <div className="pt-1">
                              <Badge variant="secondary" className="w-full py-1 text-center justify-center font-bold text-xs bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                ✔ Order Completed & Settled
                              </Badge>
                            </div>
                          ) : (
                            <div className="space-y-2 pt-1">
                              {status === "ready" && order.type === "Take Away" && (
                                <div className="w-full flex items-center justify-center gap-1.5 text-xs text-emerald-500 font-bold bg-emerald-500/10 border border-emerald-500/20 py-2 rounded-xl">
                                  <CheckCircle2 className="h-4 w-4" /> Ready — Complete via Order Monitor
                                </div>
                              )}

                              <div className="flex gap-2">
                                <Button size="sm" variant="outline" className="h-8 text-xs font-bold border-warning/40 text-warning hover:bg-warning/10 rounded-xl flex-1 disabled:opacity-60"
                                  disabled={myPendingCancelOrderIds.has(order.id)}
                                  onClick={() => { setModifyCancelAction("modify"); setModifyCancelReason(""); setShowModifyOrder(order.id); }}>
                                  Modify Order
                                </Button>
                                <Button size="sm" variant="outline" className="h-8 text-xs font-bold border-destructive/40 text-destructive hover:bg-destructive/10 rounded-xl flex-1 disabled:opacity-60"
                                  disabled={myPendingCancelOrderIds.has(order.id)}
                                  onClick={() => {
                                    setModifyCancelAction("cancel"); setModifyCancelReason(""); setShowModifyOrder(order.id);
                                    const orderOutletId = (order as any).outletId as string | null | undefined;
                                    setApiApprovers([]);
                                    setApiResponsibleStaff([]);
                                    userService.getStaffPicker(CANCEL_APPROVER_ROLES, orderOutletId).then(setApiApprovers).catch(() => {});
                                    userService.getStaffPicker(CANCEL_RESPONSIBLE_ROLES, orderOutletId).then(setApiResponsibleStaff).catch(() => {});
                                  }}>
                                  {myPendingCancelOrderIds.has(order.id) ? "Pending Approval" : "Cancel Order"}
                                </Button>
                              </div>
                            </div>
                          )}
                        </Card>
                      ))}
                    </div>
                  </div>
                );
            })()}
          </div>
        </SheetContent>
      </Sheet>


      {/* Future Sale Sheet */}
      <Sheet open={showFutureSale} onOpenChange={setShowFutureSale}>
        <SheetContent side="right" className="w-full sm:w-[450px] lg:w-[550px] p-0">
          <div className="p-4 border-b bg-card">
            <div className="flex items-center">
              <div>
                <h2 className="font-bold text-lg flex items-center gap-2">
                  <CalendarClock className="h-5 w-5 text-info" />
                  Future Sale
                </h2>
                <p className="text-xs text-muted-foreground">{futureOrders.length} scheduled orders</p>
              </div>
            </div>
          </div>
          <div className="p-4 space-y-3 overflow-y-auto max-h-[calc(100vh-80px)]">
            {futureOrders.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <CalendarClock className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No Future Orders</p>
                <p className="text-xs mt-1">Book advance orders for Iftari, celebrations, or events</p>
              </div>
            )}

            {futureOrders.map(order => {
              const daysUntil = Math.ceil((new Date(order.scheduledDate || order.date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
              const isToday = daysUntil <= 0;
              const isTomorrow = daysUntil === 1;
              const urgencyLabel = isToday ? "Today!" : isTomorrow ? "Tomorrow" : `${daysUntil} days`;
              const urgencyColor = isToday ? "bg-destructive text-destructive-foreground" : isTomorrow ? "bg-warning text-warning-foreground" : "bg-info/10 text-info";

              return (
                <Card key={order.id} className={cn(
                  "p-4 text-xs border-l-4",
                  isToday ? "border-l-destructive" : isTomorrow ? "border-l-warning" : "border-l-info"
                )}>
                  {/* Header */}
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="font-bold text-sm">{order.orderNumber}</span>
                      <Badge className={cn("ml-2 text-[9px]", urgencyColor)}>{urgencyLabel}</Badge>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">{order.type}</Badge>
                  </div>

                  {/* Scheduled Date/Time */}
                  <div className="flex items-center gap-2 mb-2 bg-info/5 rounded-lg px-2 py-1.5">
                    <Calendar className="h-3.5 w-3.5 text-info" />
                    <span className="font-semibold text-foreground">{order.scheduledDate}</span>
                    <span className="text-muted-foreground">at</span>
                    <span className="font-semibold text-foreground">{order.scheduledTime}</span>
                  </div>

                  {/* Customer */}
                  <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                    <User className="h-3 w-3 shrink-0" />
                    <span className="font-medium text-foreground">{order.customer}</span>
                    <span>•</span>
                    <span>{order.phone}</span>
                  </div>

                  {/* Notes */}
                  {order.futureNotes && (
                    <div className="bg-warning/5 border border-warning/20 rounded-lg px-2 py-1.5 mb-2 text-foreground">
                      <span className="text-[10px] font-semibold text-warning uppercase">Note: </span>
                      {order.futureNotes}
                    </div>
                  )}

                  {/* Table / Delivery Info */}
                  {order.type === "Dine In" && order.tableNumber && (
                    <div className="flex items-center gap-1.5 mb-2 text-muted-foreground">
                      <UtensilsCrossed className="h-3 w-3" />
                      <span>Table {order.tableNumber}</span>
                    </div>
                  )}
                  {order.type === "Delivery" && order.deliveryAddress && (
                    <div className="flex items-center gap-1.5 mb-2 text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      <span className="truncate">{order.deliveryAddress}</span>
                    </div>
                  )}

                  {/* Items */}
                  <div className="bg-muted/50 rounded-lg p-2 mb-2">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Items</p>
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center py-0.5">
                        <span>{item.qty}x {item.name}</span>
                        <span className="text-muted-foreground font-medium">Rs.{item.price * item.qty}</span>
                      </div>
                    ))}
                    <div className="border-t border-border mt-1.5 pt-1.5 flex justify-between font-bold text-foreground">
                      <span>Total</span>
                      <span>Rs.{order.total}</span>
                    </div>
                  </div>

                  {/* Payment Info */}
                  <div className="flex items-center justify-between text-muted-foreground mb-3">
                    {order.advancePayment && order.advancePayment > 0 ? (
                      <span>Advance: <span className="font-bold text-success">Rs.{order.advancePayment}</span> <span className="text-muted-foreground text-[10px]">({order.paymentMethod?.match(/Advance \((.+?)\)/)?.[1] || "Cash"})</span></span>
                    ) : (
                      <span>Advance: <span className="text-warning font-medium">None</span></span>
                    )}
                    <span>Remaining: <span className="font-bold text-foreground">Rs.{order.total - (order.advancePayment || 0)}</span></span>
                  </div>

                  {/* Booked info */}
                  <p className="text-[10px] text-muted-foreground mb-2">Booked on {order.date} at {order.time} by {order.staff}</p>

                  {/* Actions */}
                  <div className="flex gap-1.5">
                    <Button size="sm" className="h-8 text-xs flex-1 gradient-primary text-primary-foreground font-semibold"
                      onClick={() => loadFutureOrder(order)}>
                      <ShoppingCart className="h-3 w-3 mr-1" />
                      Load to POS
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs px-3 border-destructive/30 text-destructive hover:bg-destructive/5"
                      onClick={() => { handleOrderStatusUpdate(order.id, "cancelled"); toast.success("Future order cancelled"); }}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>

      {/* Create Future Sale Dialog */}
      <Dialog open={showCreateFutureSale} onOpenChange={setShowCreateFutureSale}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-info" />
              Book Future Sale
            </DialogTitle>
          </DialogHeader>

          {cart.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Cart is Empty</p>
              <p className="text-xs mt-1">Add items to the cart first, then book as future sale</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Cart Summary */}
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Cart Items ({cart.length})</p>
                {cart.slice(0, 3).map((item, i) => (
                  <div key={i} className="flex justify-between text-xs py-0.5">
                    <span>{item.qty}x {item.name}</span>
                    <span className="font-medium">Rs.{item.price * item.qty}</span>
                  </div>
                ))}
                {cart.length > 3 && (
                  <p className="text-[10px] text-muted-foreground mt-1">+ {cart.length - 3} more items</p>
                )}
                <div className="border-t mt-2 pt-2 flex justify-between text-sm font-bold">
                  <span>Total</span>
                  <span>Rs.{total}</span>
                </div>
              </div>

              {/* Customer Info */}
              {!selectedCustomer && (
                <div className="bg-warning/10 border border-warning/30 rounded-lg p-2 text-xs text-warning font-medium">
                  ⚠ Please select a customer from the billing panel before booking
                </div>
              )}

              {selectedCustomerData && (
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{selectedCustomerData.name}</span>
                  <span className="text-muted-foreground">•</span>
                  <span className="text-muted-foreground text-xs">{selectedCustomerData.phone}</span>
                </div>
              )}

              {/* Scheduled Date & Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-medium">Scheduled Date *</Label>
                  <Input type="date" value={futureScheduledDate} onChange={e => setFutureScheduledDate(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                    className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs font-medium">Scheduled Time *</Label>
                  <Input type="time" value={futureScheduledTime} onChange={e => setFutureScheduledTime(e.target.value)}
                    className="mt-1 h-9 text-sm" />
                </div>
              </div>

              {/* Notes */}
              <div>
                <Label className="text-xs font-medium">Notes / Event Details</Label>
                <Input placeholder="e.g., Iftari program for 20 people, Birthday celebration..."
                  value={futureNotes} onChange={e => setFutureNotes(e.target.value)}
                  className="mt-1 h-9 text-sm" />
              </div>

              {/* Advance Payment */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">Advance Payment</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Input type="number" placeholder="Amount (Rs.)" value={futureAdvancePayment || ""} onChange={e => setFutureAdvancePayment(Math.min(Number(e.target.value), total))}
                      className="h-9 text-sm" min={0} max={total} />
                  </div>
                  <div>
                    <select
                      value={futureAdvanceMethod}
                      onChange={e => setFutureAdvanceMethod(e.target.value)}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {(effectiveSettings?.paymentMethods ?? ["Cash", "Credit Card", "Account", "JazzCash", "EasyPaisa"]).map(pm => (
                        <option key={pm} value={pm}>{pm}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {futureAdvancePayment > 0 && (
                  <div className="bg-success/10 border border-success/20 rounded-lg px-3 py-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Advance ({futureAdvanceMethod}):</span>
                      <span className="font-bold text-success">Rs. {futureAdvancePayment.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between mt-0.5">
                      <span className="text-muted-foreground">Remaining:</span>
                      <span className="font-bold text-foreground">Rs. {(total - futureAdvancePayment).toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowCreateFutureSale(false)}>Cancel</Button>
            {cart.length > 0 && (
              <Button className="gradient-primary text-primary-foreground" onClick={handleCreateFutureSale}>
                <CalendarClock className="h-4 w-4 mr-1.5" />
                Book Future Sale
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Low Stock Sheet */}
      <Sheet open={showLowStock} onOpenChange={setShowLowStock}>
        <SheetContent side="right" className="w-full sm:w-[380px] p-0">
          <div className="p-4 border-b bg-destructive/5">
            <h2 className="font-bold text-lg flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-destructive" />Low Stock Alert</h2>
            <p className="text-xs text-muted-foreground">{lowStockItems.length} ingredients below minimum level</p>
          </div>
          <div className="p-4 space-y-2 overflow-y-auto max-h-[calc(100vh-80px)]">
            {lowStockItems.map(item => (
              <Card key={item.id} className="p-3 border-l-4 border-l-destructive">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-sm">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.category} — {item.unit}</p>
                  </div>
                  <Badge variant="destructive" className="text-[10px]">LOW</Badge>
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Current: </span>
                    <span className="font-bold text-destructive">{item.currentStock} {item.unit}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Min Level: </span>
                    <span className="font-medium">{item.lowStockLevel} {item.unit}</span>
                  </div>
                </div>
                <div className="mt-2">
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-destructive rounded-full" style={{ width: `${Math.min(100, (item.currentStock / item.lowStockLevel) * 100)}%` }} />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Reservation List Sheet (3 Parts: Dine In, Take Away, Delivery) */}
      <Sheet open={showReservations} onOpenChange={setShowReservations}>
        <SheetContent side="right" className="w-full sm:max-w-none sm:w-[600px] md:w-[700px] lg:w-[800px] xl:w-[850px] p-0 flex flex-col">
          <div className="p-5 border-b bg-card space-y-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-xl flex items-center gap-2.5 text-foreground">
                <BookOpen className="h-6 w-6 text-primary" />
                Reservations & Pre-Orders
              </h2>
              <Badge variant="outline" className="text-xs font-bold px-3 py-1 rounded-xl bg-primary/10 text-primary border-primary/30">
                {todayReservations.length} Total
              </Badge>
            </div>

            {/* 3-Tab Header */}
            <div className="grid grid-cols-3 gap-1.5 p-1.5 bg-muted/80 rounded-2xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setPosReservationTab("dine_in")}
                className={cn(
                  "py-2.5 px-2 rounded-xl transition-all text-center flex items-center justify-center gap-1.5 font-bold",
                  posReservationTab === "dine_in"
                    ? "bg-background text-foreground shadow-xs font-extrabold ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                )}
              >
                <Utensils className="h-4 w-4 text-primary" /> Dine In ({todayReservations.filter(r => (!r.orderType || r.orderType === "Dine In") && r.bookingType !== "future_order").length})
              </button>
              <button
                type="button"
                onClick={() => setPosReservationTab("take_away")}
                className={cn(
                  "py-2.5 px-2 rounded-xl transition-all text-center flex items-center justify-center gap-1.5 font-bold",
                  posReservationTab === "take_away"
                    ? "bg-background text-foreground shadow-xs font-extrabold ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                )}
              >
                <ShoppingBag className="h-4 w-4 text-info" /> Take Away ({todayReservations.filter(r => r.orderType === "Take Away").length})
              </button>
              <button
                type="button"
                onClick={() => setPosReservationTab("delivery")}
                className={cn(
                  "py-2.5 px-2 rounded-xl transition-all text-center flex items-center justify-center gap-1.5 font-bold",
                  posReservationTab === "delivery"
                    ? "bg-background text-foreground shadow-xs font-extrabold ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                )}
              >
                <Truck className="h-4 w-4 text-amber-500" /> Delivery ({todayReservations.filter(r => r.orderType === "Delivery").length})
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4 overflow-y-auto flex-1 bg-background/40">
            {(() => {
              const currentList = todayReservations.filter(res => {
                switch (posReservationTab) {
                  case "dine_in":
                    return (!res.orderType || res.orderType === "Dine In") && res.bookingType !== "future_order";
                  case "take_away":
                    return res.orderType === "Take Away";
                  case "delivery":
                    return res.orderType === "Delivery";
                  default:
                    return true;
                }
              });

              if (currentList.length === 0) {
                return (
                  <div className="text-center py-20 text-muted-foreground">
                    <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30 text-primary" />
                    <p className="font-bold text-base text-foreground">No {posReservationTab.replace("_", " ")} reservations found</p>
                    <p className="text-xs mt-1">Booked reservations will appear here</p>
                  </div>
                );
              }

              return currentList.map(res => {
                const effStatus = getEffectiveStatus(res);
                const preOrderCount = res.preOrderItems ? res.preOrderItems.length : 0;
                const foodSubtotal = res.subtotal || (res.preOrderItems ? res.preOrderItems.reduce((s, i) => s + Number(i.price) * Number(i.qty), 0) : 0);

                return (
                  <Card
                    key={res.id}
                    className={cn(
                      "p-5 border rounded-2xl transition-all duration-200 hover:shadow-lg space-y-3.5 bg-card",
                      effStatus === "not_arrived" ? "border-l-4 border-l-rose-500 border-border/80" :
                      effStatus === "confirmed" ? "border-l-4 border-l-info border-border/80" :
                      effStatus === "seated" ? "border-l-4 border-l-emerald-500 border-border/80" :
                      effStatus === "completed" ? "border-l-4 border-l-muted border-border/80" : "border-l-4 border-l-warning border-border/80"
                    )}
                  >
                    {/* Header line: Customer Name & Phone, Status Badge */}
                    <div className="flex items-start justify-between gap-2 border-b border-border/40 pb-3">
                      <div>
                        <h3 className="font-extrabold text-base text-foreground flex items-center gap-2">
                          <User className="h-4 w-4 text-primary" />
                          {res.customerName}
                        </h3>
                        {res.customerPhone && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1 font-medium">
                            <Phone className="h-3 w-3" /> {res.customerPhone}
                          </p>
                        )}
                      </div>
                      <Badge variant="outline" className={cn("text-xs font-extrabold capitalize px-3 py-1 rounded-xl border flex items-center gap-1 shrink-0",
                        effStatus === "not_arrived" ? "bg-rose-500/15 text-rose-500 border-rose-500/30" :
                        effStatus === "confirmed" ? "bg-info/10 text-info border-info/30" :
                        effStatus === "seated" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" :
                        effStatus === "completed" ? "bg-muted text-muted-foreground border-border" : "bg-warning/10 text-warning border-warning/30"
                      )}>
                        {effStatus === "not_arrived" ? <AlertCircle className="h-3.5 w-3.5" /> :
                         effStatus === "confirmed" ? <CheckCircle2 className="h-3.5 w-3.5" /> :
                         effStatus === "seated" ? <Utensils className="h-3.5 w-3.5" /> :
                         effStatus === "completed" ? <Check className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                        {effStatus === "not_arrived" ? "Not Arrived" : effStatus}
                      </Badge>
                    </div>

                    {/* Info Pills Grid: Date, Time */}
                    <div className="grid grid-cols-2 gap-2.5 text-xs">
                      <div className="bg-muted/50 p-2.5 rounded-xl border border-border/40 flex items-center gap-2.5">
                        <Calendar className="h-4 w-4 text-primary shrink-0" />
                        <div>
                          <span className="text-[10px] text-muted-foreground block font-semibold uppercase">Date</span>
                          <span className="font-bold text-foreground">{res.date}</span>
                        </div>
                      </div>
                      <div className="bg-muted/50 p-2.5 rounded-xl border border-border/40 flex items-center gap-2.5">
                        <Timer className="h-4 w-4 text-primary shrink-0" />
                        <div>
                          <span className="text-[10px] text-muted-foreground block font-semibold uppercase">Time</span>
                          <span className="font-bold text-foreground">{res.time}</span>
                        </div>
                      </div>
                    </div>

                    {posReservationTab === "dine_in" && (
                      <div className="bg-muted/50 p-3 rounded-xl border border-border/40 flex items-center justify-between text-xs font-semibold">
                        <span className="flex items-center gap-1.5 text-foreground">
                          <Utensils className="h-4 w-4 text-amber-500" />
                          Table: <strong className="text-amber-500 font-extrabold">{res.tableNumber ? `Table ${res.tableNumber}` : "Unassigned"}</strong>
                        </span>
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Users className="h-3.5 w-3.5" /> {res.guestCount} Pax
                        </span>
                      </div>
                    )}

                    {posReservationTab === "delivery" && res.deliveryAddress && (
                      <div className="bg-muted/50 p-3 rounded-xl border border-border/40 text-xs text-muted-foreground space-y-1">
                        <span className="font-bold text-foreground flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-primary" /> Delivery Address:
                        </span>
                        <p className="text-foreground pl-5 font-medium">{res.deliveryAddress}</p>
                      </div>
                    )}

                    {/* Pre-Order Food Items Summary */}
                    {preOrderCount > 0 && (
                      <div className="bg-primary/5 border border-primary/20 rounded-2xl p-3.5 space-y-2">
                        <div className="flex items-center justify-between font-bold text-xs">
                          <span className="flex items-center gap-1.5 text-foreground">
                            <Utensils className="h-4 w-4 text-primary" /> Pre-Order Food ({preOrderCount} items)
                          </span>
                          <span className="text-primary font-extrabold text-sm">{effectiveSettings.currency} {foodSubtotal.toLocaleString()}</span>
                        </div>
                        <div className="text-xs text-muted-foreground space-y-1 max-h-32 overflow-y-auto divide-y divide-border/30 pt-1">
                          {res.preOrderItems?.map((item, idx) => (
                            <div key={idx} className="flex justify-between pt-1 font-medium">
                              <span>{item.qty}x {item.name}</span>
                              <span className="font-mono font-bold text-foreground">{effectiveSettings.currency} {(item.price * item.qty).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Advance Deposit Badge */}
                    {res.advancePaid && Number(res.advancePaid) > 0 ? (
                      <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 p-3 rounded-xl font-bold text-xs">
                        <span className="flex items-center gap-1.5">
                          <Check className="h-4 w-4 text-emerald-500" /> Advance Deposit Paid
                        </span>
                        <span className="font-extrabold text-sm">{effectiveSettings.currency} {Number(res.advancePaid).toLocaleString()}</span>
                      </div>
                    ) : null}

                    {/* Action Button for Take Away & Delivery */}
                    {(posReservationTab === "take_away" || posReservationTab === "delivery") && (
                      <Button
                        type="button"
                        onClick={() => loadReservationToPOSCart(res)}
                        className="w-full h-11 text-xs sm:text-sm gradient-primary text-primary-foreground font-extrabold rounded-xl flex items-center justify-center gap-2 shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all"
                      >
                        <ShoppingCart className="h-4 w-4" /> Load Order into POS Cart
                      </Button>
                    )}
                  </Card>
                );
              });
            })()}
          </div>
        </SheetContent>
      </Sheet>

      {/* Customer History Dialog */}
      <Dialog open={showCustomerHistory} onOpenChange={setShowCustomerHistory}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><History className="h-5 w-5 text-primary" />Customer History</DialogTitle>
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
                    <span className="text-xs text-muted-foreground">{customerHistory.phone}</span>
                    {(customerHistory as any).customerType === "corporate" && <Badge className="text-[9px] bg-info/10 text-info">Corporate</Badge>}
                    {(customerHistory as any).customerType === "vip" && <Badge className="text-[9px] bg-warning/10 text-warning">VIP</Badge>}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <Card className="p-2.5 text-center">
                  <p className="text-lg font-bold text-primary">{customerHistory.orderCount}</p>
                  <p className="text-[10px] text-muted-foreground">Total Visits</p>
                </Card>
                <Card className="p-2.5 text-center">
                  <p className="text-lg font-bold">{effectiveSettings.currency} {customerHistory.totalSpent.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">Total Spent</p>
                </Card>
                <Card className="p-2.5 text-center">
                  <p className="text-lg font-bold">{effectiveSettings.currency} {customerHistory.avgBill.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">Avg Bill</p>
                </Card>
              </div>
              {customerHistory.outstandingDue > 0 && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-2.5 flex justify-between items-center">
                  <span className="text-sm font-medium text-destructive">Outstanding Due</span>
                  <span className="font-bold text-destructive">{effectiveSettings.currency} {customerHistory.outstandingDue.toLocaleString()}</span>
                </div>
              )}
              {customerHistory.topItems.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Favorite Items</p>
                  <div className="flex flex-wrap gap-1.5">
                    {customerHistory.topItems.map(([name, qty]) => (
                      <Badge key={name} variant="secondary" className="text-[10px]">{name} ({qty}x)</Badge>
                    ))}
                  </div>
                </div>
              )}
              {customerHistory.recentOrders.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recent Orders</p>
                  <div className="space-y-1.5">
                    {customerHistory.recentOrders.map(o => (
                      <div key={o.id} className="flex items-center justify-between text-xs bg-muted/50 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{o.orderNumber}</span>
                          <Badge variant="outline" className="text-[9px]">{o.type}</Badge>
                          <span className="text-muted-foreground">{o.date}</span>
                        </div>
                        <span className="font-bold">{effectiveSettings.currency} {o.total.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">Last visit: {customerHistory.lastVisit}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No customer selected</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCustomerHistory(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quotation Print Dialog */}
      <Dialog open={showQuotation} onOpenChange={setShowQuotation}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Quotation Preview</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="text-center space-y-1">
              <Flame className="h-6 w-6 mx-auto text-primary" />
              <p className="font-bold text-primary">{effectiveSettings.restaurantName || "OVENISTO"}</p>
              <p className="text-xs text-muted-foreground">{effectiveSettings.address} — {effectiveSettings.phone}</p>
              <p className="text-xs font-semibold uppercase tracking-wider mt-2 bg-muted/60 py-1 rounded">QUOTATION</p>
            </div>
            <Separator />
            <div className="text-xs space-y-1">
              <p>Date: {new Date().toLocaleDateString()}</p>
              <p>Customer: <strong>{selectedCustomerData?.name || "Walk-in"}</strong></p>
              {selectedCustomerData?.phone && <p>Phone: {selectedCustomerData.phone}</p>}
            </div>
            <Table>
              <TableHeader><TableRow><TableHead className="text-xs">Item</TableHead><TableHead className="text-xs text-center">Qty</TableHead><TableHead className="text-xs text-right">Price</TableHead><TableHead className="text-xs text-right">Total</TableHead></TableRow></TableHeader>
              <TableBody>{cart.map((c, i) => <TableRow key={i}><TableCell className="text-xs">{c.name}</TableCell><TableCell className="text-xs text-center">{c.qty}</TableCell><TableCell className="text-xs text-right">{effectiveSettings.currency} {c.price}</TableCell><TableCell className="text-xs text-right">{effectiveSettings.currency} {((c.price * c.qty) - c.discount).toLocaleString()}</TableCell></TableRow>)}</TableBody>
            </Table>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between"><span>Subtotal</span><span>{effectiveSettings.currency} {subtotal.toLocaleString()}</span></div>
              {orderDiscount > 0 && <div className="flex justify-between"><span>Discount</span><span className="text-destructive">-{effectiveSettings.currency} {orderDiscount.toLocaleString()}</span></div>}
              <div className="flex justify-between"><span>Tax ({Math.round(taxRate * 100)}%)</span><span>{effectiveSettings.currency} {tax.toLocaleString()}</span></div>
              <Separator />
              <div className="flex justify-between font-bold text-sm"><span>Gross Estimated Total</span><span>{effectiveSettings.currency} {total.toLocaleString()}</span></div>
              {loadedAdvancePayment > 0 && (
                <>
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-semibold"><span>Advance Deposit ({loadedAdvanceMethod})</span><span>-{effectiveSettings.currency} {loadedAdvancePayment.toLocaleString()}</span></div>
                  <Separator />
                  <div className="flex justify-between font-extrabold text-base"><span>Net Estimated Payable</span><span className="text-primary">{effectiveSettings.currency} {netPayable.toLocaleString()}</span></div>
                </>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground text-center italic mt-2">This is a quotation only. Prices may vary. Valid for 24 hours.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQuotation(false)}>Close</Button>
            <Button className="gradient-primary text-primary-foreground" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />Print Quotation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Register Open Dialog */}
      <Dialog open={showRegisterOpen && !activeShift} onOpenChange={setShowRegisterOpen}>
        <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Banknote className="h-5 w-5 text-primary" />Open Cash Register</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Cashier</Label>
              <Input value={user?.name || "Admin"} disabled className="mt-1" />
            </div>
            <div>
              <Label>Opening Cash (Rs.)</Label>
              <Input type="number" value={openingCashInput} onChange={e => setOpeningCashInput(e.target.value)} placeholder="Enter opening cash amount" className="mt-1" min="0" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" asChild><Link to="/">Cancel & Exit</Link></Button>
            <Button className="gradient-primary text-primary-foreground" disabled={!openingCashInput} onClick={async () => {
              try {
                const shift = await shiftService.openShift({ openingCash: Number(openingCashInput) });
                setActiveShift(shift);
                setShowRegisterOpen(false);
                toast.success(`Register opened — Shift ${shift.shiftNumber}`);
              } catch (err: any) {
                toast.error(err?.message || "Failed to open register");
              }
            }}>Open Register</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cash Held Dialog — my own uncleared collections, settled via Cash Hub by a manager */}
      <Dialog open={showCashHeldDialog} onOpenChange={setShowCashHeldDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-amber-500" />
              Collections In Hand
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1 text-sm">
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Total Uncleared</span>
              <span className="text-xl font-black text-amber-600 dark:text-amber-400 font-mono">
                {effectiveSettings.currency} {(myActiveCash?.totalExpected || 0).toLocaleString()}
              </span>
            </div>
            {myActiveCash?.byMethod && (
              <div className="space-y-1.5">
                {Object.entries(myActiveCash.byMethod).filter(([, v]) => Number(v) > 0).map(([method, amount]) => (
                  <div key={method} className="flex justify-between text-xs px-1">
                    <span className="text-muted-foreground">{method}</span>
                    <span className="font-semibold">{effectiveSettings.currency} {Number(amount).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground text-center pt-1">
              {myActiveCash?.orderCount || 0} unsettled order(s) — hand over these collections to your manager to settle in Cash Hub.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Register Close Dialog */}
      <Dialog open={showRegisterClose} onOpenChange={setShowRegisterClose}>
        <DialogContent className="max-w-[95vw] sm:max-w-4xl lg:max-w-5xl xl:max-w-6xl max-h-[92vh] overflow-y-auto p-4 sm:p-6 lg:p-8 rounded-3xl border-border/80 shadow-2xl backdrop-blur-md bg-card/95">
          <DialogHeader className="border-b border-border/60 pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <DialogTitle className="flex items-center gap-2.5 text-xl sm:text-2xl font-black tracking-tight text-foreground">
                <div className="h-10 w-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 shadow-sm">
                  <Banknote className="h-5 w-5" />
                </div>
                <div>
                  <span>Close Cash Register & Shift Reconciliation</span>
                  <p className="text-xs font-normal text-muted-foreground mt-0.5">Review shift sales, count physical drawer cash, and reconcile differences.</p>
                </div>
              </DialogTitle>
              {activeShift && (
                <Badge variant="outline" className="self-start sm:self-auto text-xs font-bold px-3 py-1.5 bg-primary/10 text-primary border-primary/30 rounded-xl flex items-center gap-1.5 shadow-sm shrink-0">
                  <Clock className="h-3.5 w-3.5" />
                  Shift #{activeShift.shiftNumber}
                </Badge>
              )}
            </div>
            <DialogDescription className="text-xs text-muted-foreground mt-2 flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-primary" />
              Opened by <strong className="text-foreground">{activeShift?.cashierName || user?.name || "Cashier"}</strong> at {activeShift?.openedAt ? new Date(activeShift.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-3 text-sm">
            {/* Top Key Metrics Grid (3 Cards for POS Counter Register) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <Card className="p-4 bg-muted/30 border-border/70 rounded-2xl shadow-sm hover:border-primary/30 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Opening Cash Float</span>
                  <div className="h-8 w-8 rounded-xl bg-muted/60 border border-border/60 flex items-center justify-center text-muted-foreground">
                    <Banknote className="h-4 w-4" />
                  </div>
                </div>
                <p className="font-black text-xl sm:text-2xl text-foreground mt-2 font-mono">{effectiveSettings.currency} {(activeShift?.openingCash || 0).toLocaleString()}</p>
                <span className="text-[10px] text-muted-foreground font-medium mt-1 block">Initial register float</span>
              </Card>

              <Card className="p-4 bg-amber-500/5 border-amber-500/20 rounded-2xl shadow-sm hover:border-amber-500/40 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">POS Counter Cash</span>
                  <div className="h-8 w-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500">
                    <Flame className="h-4 w-4" />
                  </div>
                </div>
                <p className="font-black text-xl sm:text-2xl text-amber-600 dark:text-amber-400 mt-2 font-mono">{effectiveSettings.currency} {shiftSales.pos.cash.toLocaleString()}</p>
                <span className="text-[10px] text-amber-600/80 dark:text-amber-400/80 font-semibold mt-1 block">{shiftSales.pos.count} POS orders</span>
              </Card>

              <Card className="p-4 bg-emerald-500/10 border-emerald-500/30 rounded-2xl shadow-sm hover:border-emerald-500/50 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Expected Drawer Cash</span>
                  <div className="h-8 w-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-500">
                    <Wallet className="h-4 w-4" />
                  </div>
                </div>
                <p className="font-black text-xl sm:text-2xl text-emerald-600 dark:text-emerald-400 mt-2 font-mono">{effectiveSettings.currency} {((activeShift?.openingCash || 0) + shiftSales.pos.cash).toLocaleString()}</p>
                <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 font-extrabold mt-1 block">Float + Direct POS Cash</span>
              </Card>
            </div>

            {/* HERO RECONCILIATION CARD (PHYSICAL DRAWER COUNT & VARIANCE) */}
            <div className="bg-card rounded-3xl p-5 border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/10 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-border/50 pb-3">
                <h3 className="font-black text-sm flex items-center gap-2 text-foreground uppercase tracking-wide">
                  <Coins className="h-4 w-4 text-emerald-500" />
                  Physical Cash Drawer Count & Reconciliation
                </h3>
                <Badge variant="outline" className="text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 px-2.5 py-0.5 rounded-lg">
                  Drawer Audit
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-extrabold flex items-center gap-1.5 text-foreground">
                    <Banknote className="h-4 w-4 text-emerald-500" />
                    Actual Physical Cash in Drawer ({effectiveSettings.currency}) *
                  </Label>
                  <Input
                    type="number"
                    value={closingCashInput}
                    onChange={e => setClosingCashInput(e.target.value)}
                    placeholder="Count and enter physical cash..."
                    className="h-12 text-lg font-black font-mono rounded-xl border-emerald-500/40 focus:border-emerald-500 bg-background"
                    min="0"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-extrabold flex items-center gap-1.5 text-foreground">
                    <StickyNote className="h-4 w-4 text-muted-foreground" />
                    Shift Notes / Variance Explanation (Optional)
                  </Label>
                  <Input
                    value={closingNotes}
                    onChange={e => setClosingNotes(e.target.value)}
                    placeholder="Enter any shift notes or reason for drawer variance..."
                    className="h-12 text-xs rounded-xl border-border/80 bg-background"
                  />
                </div>
              </div>

              {/* Difference Calculation Alert */}
              {closingCashInput && (
                <div className={cn(
                  "p-4 rounded-2xl text-xs sm:text-sm font-bold flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border shadow-sm transition-all",
                  Number(closingCashInput) - ((activeShift?.openingCash || 0) + shiftSales.pos.cash) === 0
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40"
                    : Number(closingCashInput) - ((activeShift?.openingCash || 0) + shiftSales.pos.cash) < 0
                    ? "bg-destructive/15 text-destructive border-destructive/40"
                    : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40"
                )}>
                  <span className="flex items-center gap-2">
                    {Number(closingCashInput) - ((activeShift?.openingCash || 0) + shiftSales.pos.cash) === 0 && (
                      <>
                        <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                        <span>Cash drawer matches expected amount perfectly!</span>
                      </>
                    )}
                    {Number(closingCashInput) - ((activeShift?.openingCash || 0) + shiftSales.pos.cash) < 0 && (
                      <>
                        <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                        <span>Shortage detected in physical cash drawer</span>
                      </>
                    )}
                    {Number(closingCashInput) - ((activeShift?.openingCash || 0) + shiftSales.pos.cash) > 0 && (
                      <>
                        <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
                        <span>Excess cash detected in physical cash drawer</span>
                      </>
                    )}
                  </span>
                  <span className="font-black text-sm sm:text-base font-mono self-end sm:self-auto">
                    Difference: {effectiveSettings.currency} {(Number(closingCashInput) - ((activeShift?.openingCash || 0) + shiftSales.pos.cash)).toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            {/* POS COUNTER SALES BREAKDOWN */}
            <div className="space-y-4 bg-card rounded-3xl p-5 border border-border/70 shadow-sm">
              <div className="flex items-center justify-between border-b border-border/50 pb-3">
                <h3 className="font-black text-sm flex items-center gap-2 text-foreground uppercase tracking-wide">
                  <Flame className="h-4 w-4 text-amber-500" />
                  POS Counter Sales Breakdown
                </h3>
                <Badge variant="secondary" className="text-xs font-bold px-2.5 py-0.5 rounded-lg">{shiftSales.pos.count} orders</Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-2xl bg-muted/40 border border-border/50">
                  <span className="text-[11px] text-muted-foreground font-bold block uppercase tracking-wider">Total POS Sales</span>
                  <span className="font-extrabold text-base text-foreground font-mono mt-0.5 block">{effectiveSettings.currency} {shiftSales.pos.total.toLocaleString()}</span>
                </div>
                <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold block uppercase tracking-wider">POS Cash Sales</span>
                  <span className="font-extrabold text-base text-emerald-600 dark:text-emerald-400 font-mono mt-0.5 block">{effectiveSettings.currency} {shiftSales.pos.cash.toLocaleString()}</span>
                </div>
                <div className="p-3 rounded-2xl bg-info/10 border border-info/20">
                  <span className="text-[11px] text-info font-bold block uppercase tracking-wider">POS Non-Cash</span>
                  <span className="font-extrabold text-base text-info font-mono mt-0.5 block">{effectiveSettings.currency} {shiftSales.pos.nonCash.toLocaleString()}</span>
                </div>
                <div className="p-3 rounded-2xl bg-muted/40 border border-border/50">
                  <span className="text-[11px] text-muted-foreground font-bold block uppercase tracking-wider">Order Volume</span>
                  <span className="font-extrabold text-base text-foreground mt-0.5 block">{shiftSales.pos.count} orders</span>
                </div>
              </div>

              {/* POS Payment Methods pills */}
              <div>
                <p className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5 text-primary" />
                  POS Sales by Payment Method
                </p>
                <div className="flex flex-wrap gap-2.5">
                  {Object.entries(shiftSales.pos.byMethod).map(([method, amount]) => {
                    const mLower = method.toLowerCase();
                    const isCash = mLower.includes("cash") && !mLower.includes("jazz") && !mLower.includes("easy") && !mLower.includes("online") && !mLower.includes("card") && !mLower.includes("mobile") && !mLower.includes("paisa");
                    return (
                      <div key={method} className="flex items-center gap-2 bg-muted/50 border border-border/70 rounded-2xl px-3.5 py-2 text-xs font-bold shadow-xs">
                        {isCash ? <Banknote className="h-3.5 w-3.5 text-emerald-500" /> : mLower.includes("card") ? <CreditCard className="h-3.5 w-3.5 text-info" /> : <Smartphone className="h-3.5 w-3.5 text-purple-500" />}
                        <span className="text-muted-foreground">{method}:</span>
                        <span className="font-extrabold text-foreground font-mono">{effectiveSettings.currency} {amount.toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2.5 border-t border-border/60 pt-4 flex-col sm:flex-row">
            <Button variant="outline" className="h-11 text-xs rounded-2xl font-bold border-border/80 hover:bg-muted/60" onClick={() => setShowRegisterClose(false)}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Continue Working
            </Button>
            <Button
              className="gradient-primary text-primary-foreground h-11 text-xs sm:text-sm font-extrabold rounded-2xl shadow-md hover:shadow-xl transition-all active:scale-95"
              disabled={!closingCashInput || !activeShift}
              onClick={async () => {
                if (!activeShift) return;
                try {
                  await shiftService.closeShift(activeShift.id, {
                    closingCash:      Number(closingCashInput),
                    totalSales:       shiftSales.pos.total,
                    totalCashSales:   shiftSales.pos.cash,
                    totalCardSales:   shiftSales.pos.card || 0,
                    totalOnlineSales: shiftSales.pos.online || 0,
                    orderCount:       shiftSales.pos.count,
                    cancelledOrders:  0,
                    totalExpenses:    0,
                    notes:            closingNotes,
                  });
                  toast.success("Cash Register closed successfully!");
                  window.location.href = "/";
                } catch (err: any) {
                  toast.error(err?.message || "Failed to close register");
                }
              }}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" /> Close Register & Exit Shift
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Kitchen Display & Notifications Sheet */}
      <Sheet open={showKitchenNotifications} onOpenChange={setShowKitchenNotifications}>
        <SheetContent side="right" className="w-full sm:max-w-none sm:w-[600px] md:w-[700px] lg:w-[800px] xl:w-[850px] p-0 flex flex-col">
          <div className="p-5 border-b bg-card space-y-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-xl flex items-center gap-2.5 text-foreground">
                <ChefHat className="h-6 w-6 text-primary" />
                Kitchen Display & Status
              </h2>
              <Badge variant="outline" className="text-xs font-bold px-3 py-1 rounded-xl bg-primary/10 text-primary border-primary/30">
                {activeOrdersCount} Active Kitchen Orders
              </Badge>
            </div>

            {/* Clickable Status Filter Cards — All, Pending, Preparing, Ready */}
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setPosKitchenTab("all")}
                className={cn(
                  "p-3 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 font-bold",
                  posKitchenTab === "all"
                    ? "bg-primary text-primary-foreground border-primary shadow-md font-extrabold ring-2 ring-primary/40 scale-[1.02]"
                    : "bg-muted/40 border-border/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider">
                  <Flame className="h-3.5 w-3.5" /> All
                </div>
                <span className="text-xl font-black">{activeOrdersCount}</span>
              </button>

              <button
                type="button"
                onClick={() => setPosKitchenTab("pending")}
                className={cn(
                  "p-3 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 font-bold",
                  posKitchenTab === "pending"
                    ? "bg-amber-500/20 border-amber-500 text-amber-600 dark:text-amber-400 font-extrabold ring-2 ring-amber-500/40 shadow-md scale-[1.02]"
                    : "bg-muted/40 border-border/70 text-muted-foreground hover:bg-warning/10 hover:text-warning"
                )}
              >
                <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  <Clock className="h-3.5 w-3.5" /> Pending
                </div>
                <span className="text-xl font-black text-amber-600 dark:text-amber-400">{ordersByStatus.pending.length}</span>
              </button>

              <button
                type="button"
                onClick={() => setPosKitchenTab("preparing")}
                className={cn(
                  "p-3 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 font-bold",
                  posKitchenTab === "preparing"
                    ? "bg-info/20 border-info text-info font-extrabold ring-2 ring-info/40 shadow-md scale-[1.02]"
                    : "bg-muted/40 border-border/70 text-muted-foreground hover:bg-info/10 hover:text-info"
                )}
              >
                <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-info">
                  <ChefHat className="h-3.5 w-3.5" /> Preparing
                </div>
                <span className="text-xl font-black text-info">{ordersByStatus.preparing.length}</span>
              </button>

              <button
                type="button"
                onClick={() => setPosKitchenTab("ready")}
                className={cn(
                  "p-3 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 font-bold",
                  posKitchenTab === "ready"
                    ? "bg-emerald-500/20 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-extrabold ring-2 ring-emerald-500/40 shadow-md scale-[1.02]"
                    : "bg-muted/40 border-border/70 text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-500"
                )}
              >
                <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Ready
                </div>
                <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">{ordersByStatus.ready.length}</span>
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4 overflow-y-auto flex-1 bg-background/40">
            {(() => {
              const listToRender =
                posKitchenTab === "all"
                  ? activeOrders
                  : ordersByStatus[posKitchenTab];

              if (listToRender.length === 0) {
                return (
                  <div className="text-center py-20 text-muted-foreground">
                    <ChefHat className="h-12 w-12 mx-auto mb-3 opacity-30 text-primary" />
                    <p className="font-bold text-base text-foreground">
                      No {posKitchenTab === "all" ? "active kitchen" : posKitchenTab} orders found
                    </p>
                    <p className="text-xs mt-1">Orders sent to kitchen will appear here</p>
                  </div>
                );
              }

              return listToRender.map(order => (
                <Card key={order.id} className={cn(
                  "p-5 border rounded-2xl transition-all duration-200 hover:shadow-lg space-y-3.5 bg-card",
                  order.status === "pending" ? "border-l-4 border-l-warning border-border/80" :
                  order.status === "preparing" ? "border-l-4 border-l-info border-border/80" : "border-l-4 border-l-emerald-500 border-border/80",
                  order.isUrgent && "ring-2 ring-destructive/50"
                )}>
                  <div className="flex justify-between items-start border-b border-border/40 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-base text-foreground">{order.orderNumber}</span>
                      <span className="text-muted-foreground text-xs font-medium">{order.time}</span>
                      {order.isUrgent && (
                        <Badge className="bg-destructive text-destructive-foreground text-[10px] font-bold">
                          <Zap className="h-2.5 w-2.5 mr-0.5" /> URGENT
                        </Badge>
                      )}
                    </div>
                    <Badge variant="outline" className={cn("text-xs font-extrabold capitalize px-2.5 py-0.5 rounded-xl border flex items-center gap-1",
                      order.status === "pending" ? "bg-warning/15 text-warning border-warning/30" :
                      order.status === "preparing" ? "bg-info/15 text-info border-info/30" : "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
                    )}>
                      {order.status === "pending" ? <Clock className="h-3 w-3" /> :
                       order.status === "preparing" ? <ChefHat className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                      {order.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <User className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="font-bold text-foreground truncate">{order.customer}</span>
                    </div>
                    <div className="flex items-center justify-end gap-1.5 text-muted-foreground font-medium">
                      <Phone className="h-3 w-3" />
                      <span>{order.phone || "N/A"}</span>
                    </div>
                  </div>

                  {order.type === "Dine In" && order.tableNumber && (
                    <div className="bg-muted/50 p-2.5 rounded-xl border border-border/40 flex items-center justify-between font-semibold text-xs">
                      <span className="flex items-center gap-1.5 text-foreground">
                        <Utensils className="h-4 w-4 text-amber-500" />
                        Table: <strong className="text-amber-500 font-extrabold">Table {order.tableNumber}</strong>
                      </span>
                      <Badge variant="secondary" className="text-[10px]">{order.type}</Badge>
                    </div>
                  )}

                  {order.type === "Delivery" && order.deliveryAddress && (
                    <div className="bg-muted/50 p-2.5 rounded-xl border border-border/40 flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5 truncate">
                        <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="truncate text-foreground font-medium">{order.deliveryAddress}</span>
                      </div>
                      <Badge variant="secondary" className="text-[10px] shrink-0">{order.type}</Badge>
                    </div>
                  )}

                  {/* Kitchen Food Items List */}
                  <div className="bg-muted/40 rounded-xl p-3 border border-border/40 space-y-1.5">
                    <p className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">Kitchen Items</p>
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center text-xs">
                        <span className="text-foreground font-medium">
                          {item.qty}x {item.name}
                        </span>
                        <span className="text-foreground font-bold font-mono">Rs.{(item.price * item.qty).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>

                  {/* Preparation Timer / Countdown */}
                  {(() => {
                    if (order.status === "ready") return null;
                    const rawCookTime = Math.max(...order.items.map((i: any) => i.cookingTime || 0), 0);
                    const cookTime = rawCookTime > 0 ? rawCookTime : 10;

                    if (order.status === "pending") {
                      return (
                        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-xl text-xs">
                          <Timer className="h-4 w-4 shrink-0 text-amber-500" />
                          <span className="font-bold text-amber-500">
                            Waiting for kitchen · {cookTime} min est.
                          </span>
                        </div>
                      );
                    }

                    const startMs = posPreparingAtMap.current[order.id]
                      ?? ((order as any).updatedAt ? new Date((order as any).updatedAt).getTime() : null)
                      ?? statusClock;
                    const elapsedSec = Math.floor((statusClock - startMs) / 1000);
                    const totalSec = cookTime * 60;
                    const remainSec = Math.max(0, totalSec - elapsedSec);
                    const isOverdue = elapsedSec > totalSec;
                    const mm = String(Math.floor(remainSec / 60)).padStart(2, "0");
                    const ss = String(remainSec % 60).padStart(2, "0");
                    const overMin = Math.floor((elapsedSec - totalSec) / 60);
                    const overSec = (elapsedSec - totalSec) % 60;
                    return (
                      <div className={cn("flex items-center gap-2 p-2.5 rounded-xl text-xs font-bold border",
                        isOverdue ? "bg-rose-500/10 border-rose-500/30 text-rose-500" :
                        remainSec <= 120 ? "bg-amber-500/10 border-amber-500/30 text-amber-500" : "bg-info/10 border-info/30 text-info"
                      )}>
                        <Timer className="h-4 w-4 shrink-0" />
                        <span className="tabular-nums font-mono">
                          {isOverdue
                            ? `Overdue ${overMin}m ${overSec}s`
                            : `${mm}:${ss} remaining`}
                        </span>
                      </div>
                    );
                  })()}

                  {/* Kitchen Status (view-only — progression happens on Kitchen Panel) */}
                  <div className="flex gap-2 pt-1">
                    {order.status === "preparing" && (
                      <div className="w-full flex items-center justify-center gap-1.5 text-xs text-sky-500 font-bold bg-sky-500/10 border border-sky-500/20 py-2 rounded-xl">
                        <ChefHat className="h-4 w-4" /> Preparing in Kitchen
                      </div>
                    )}
                    {order.status === "ready" && (
                      <div className="w-full flex items-center justify-center gap-1.5 text-xs text-emerald-500 font-bold bg-emerald-500/10 border border-emerald-500/20 py-2 rounded-xl">
                        <CheckCircle2 className="h-4 w-4" /> Order Ready from Kitchen
                      </div>
                    )}
                  </div>
                </Card>
              ));
            })()}
          </div>
        </SheetContent>
      </Sheet>

      {/* Order Modification/Cancellation Dialog */}
      <Dialog open={!!showModifyOrder} onOpenChange={(open) => { if (!open) setShowModifyOrder(null); }}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {modifyCancelAction === "cancel" ? (
                <><Ban className="h-5 w-5 text-destructive" />Cancel Order</>
              ) : (
                <><FileText className="h-5 w-5 text-warning" />Modify Order</>
              )}
            </DialogTitle>
          </DialogHeader>
          {(() => {
            const order = allOrdersData.find(o => o.id === showModifyOrder);
            if (!order) return <p className="text-sm text-muted-foreground">Order not found</p>;
            if (modifyCancelAction === "cancel") {
              return (
                <div className="space-y-3">
                  <div className="text-sm space-y-1">
                    <p>Order: <strong>{order.orderNumber}</strong></p>
                    <p>Customer: <strong>{order.customer}</strong></p>
                    <p>Status: <Badge variant="secondary" className="text-[10px]">{order.status}</Badge></p>
                    <p>Total: <strong>{effectiveSettings.currency} {order.total.toLocaleString()}</strong></p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Items</Label>
                    {order.items.filter((i: any) => i.status !== "cancelled").map((item: any) => (
                      <div key={item.id} className="flex items-center justify-between text-xs border rounded-md px-2 py-1.5">
                        <span>{item.name} × {item.qty}</span>
                        <Button size="sm" variant={cancelSelectedItemIds.includes(item.id) ? "destructive" : "outline"} className="h-6 text-[10px] px-2"
                          onClick={() => setCancelSelectedItemIds(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id])}>
                          {cancelSelectedItemIds.includes(item.id) ? "Selected" : "Cancel Item"}
                        </Button>
                      </div>
                    ))}
                    <Button size="sm" variant="destructive" className="w-full h-7 text-xs" onClick={() => setCancelSelectedItemIds([])}>
                      Cancel Full Order
                    </Button>
                  </div>
                  <div>
                    <Label className="text-xs font-medium">Reason for Cancellation *</Label>
                    <Select value={modifyCancelReason} onValueChange={setModifyCancelReason}>
                      <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue placeholder="Select reason..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Customer changed mind">Customer changed mind</SelectItem>
                        <SelectItem value="Wrong order entered">Wrong order entered</SelectItem>
                        <SelectItem value="Item not available">Item not available</SelectItem>
                        <SelectItem value="Kitchen mistake">Kitchen mistake</SelectItem>
                        <SelectItem value="Missing Item">Missing Item</SelectItem>
                        <SelectItem value="Wrong Item">Wrong Item</SelectItem>
                        <SelectItem value="Packing Error">Packing Error</SelectItem>
                        <SelectItem value="Payment failed">Payment failed</SelectItem>
                        <SelectItem value="Duplicate order">Duplicate order</SelectItem>
                        <SelectItem value="Customer complaint">Customer complaint</SelectItem>
                        <SelectItem value="Other">Other (specify below)</SelectItem>
                      </SelectContent>
                    </Select>
                    {modifyCancelReason === "Other" && (
                      <Input className="mt-2" value={modifyCancelCustomReason} onChange={e => setModifyCancelCustomReason(e.target.value)}
                        placeholder="Enter custom reason..." />
                    )}
                  </div>
                  <div>
                    <Label className="text-xs font-medium">Send Approval Request To *</Label>
                    <Select value={cancelApproverId} onValueChange={setCancelApproverId}>
                      <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue placeholder="Select manager/admin..." /></SelectTrigger>
                      <SelectContent>
                        {apiApprovers.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.name} ({m.role})</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Order will only be cancelled once this person approves the request.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs font-medium">Responsible Person</Label>
                      <Select value={cancelResponsibleUserId} onValueChange={setCancelResponsibleUserId}>
                        <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue placeholder="Select staff (optional)..." /></SelectTrigger>
                        <SelectContent>
                          {apiResponsibleStaff.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.name} ({m.role})</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs font-medium">Penalty ({effectiveSettings.currency})</Label>
                      <Input className="mt-1 h-9 text-sm" type="number" min={0} inputMode="numeric"
                        value={cancelPenaltyAmount || ""} onChange={e => setCancelPenaltyAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                        placeholder="0" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 items-end">
                    <div className="bg-muted/50 rounded-lg p-2.5 text-xs">
                      <p className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Refund Amount</p>
                      <p className="text-sm font-bold">
                        {effectiveSettings.currency} {(() => {
                          const activeItems = order.items.filter((i: any) => i.status !== "cancelled");
                          const isFullCancel = cancelSelectedItemIds.length === 0 || cancelSelectedItemIds.length === activeItems.length;
                          return (isFullCancel
                            ? order.total
                            : activeItems.filter((i: any) => cancelSelectedItemIds.includes(i.id)).reduce((s: number, i: any) => s + (i.price * i.qty - i.discount), 0)
                          ).toLocaleString();
                        })()}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs font-medium">Refund Method</Label>
                      <Select value={cancelRefundMethod} onValueChange={setCancelRefundMethod}>
                        <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(effectiveSettings.paymentMethods ?? ["Cash", "Credit Card", "Account", "JazzCash", "EasyPaisa"]).map((pm) => (
                            <SelectItem key={pm} value={pm.toLowerCase()}>{pm}</SelectItem>
                          ))}
                          <SelectItem value="none">None</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-2.5 text-xs space-y-1">
                    <p className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Audit Trail</p>
                    <p>Order placed: {order.date} at {order.time}</p>
                    <p>Current status: {order.status}</p>
                    {order.staff && <p>Staff: {order.staff}</p>}
                  </div>
                </div>
              );
            }
            const isSentToKitchen = order.status === "preparing" || order.status === "ready";
            return (
              <div className="space-y-3">
                <div className="text-sm space-y-1">
                  <p>Order: <strong>{order.orderNumber}</strong></p>
                  <p>Customer: <strong>{order.customer}</strong></p>
                  <p>Status: <Badge variant="secondary" className="text-[10px]">{order.status}</Badge></p>
                  <p>Total: <strong>{effectiveSettings.currency} {order.total.toLocaleString()}</strong></p>
                </div>
                {isSentToKitchen && (
                  <div className="bg-warning/10 border border-warning/30 rounded-lg p-2.5 text-xs text-warning font-medium">
                    <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
                    Order has been sent to kitchen and preparation has started.
                  </div>
                )}
                <div>
                  <Label className="text-xs font-medium">Reason for Modification *</Label>
                  <Select value={modifyCancelReason} onValueChange={setModifyCancelReason}>
                    <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue placeholder="Select reason..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Customer requested change">Customer requested change</SelectItem>
                      <SelectItem value="Wrong item added">Wrong item added</SelectItem>
                      <SelectItem value="Quantity change">Quantity change</SelectItem>
                      <SelectItem value="Add extra items">Add extra items</SelectItem>
                      <SelectItem value="Remove item">Remove item</SelectItem>
                      <SelectItem value="Change instructions">Change instructions</SelectItem>
                      <SelectItem value="Other">Other (specify below)</SelectItem>
                    </SelectContent>
                  </Select>
                  {modifyCancelReason === "Other" && (
                    <Input className="mt-2" value={modifyCancelCustomReason} onChange={e => setModifyCancelCustomReason(e.target.value)}
                      placeholder="Enter custom reason..." />
                  )}
                </div>
                <div className="bg-muted/50 rounded-lg p-2.5 text-xs space-y-1">
                  <p className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Audit Trail</p>
                  <p>Order placed: {order.date} at {order.time}</p>
                  <p>Current status: {order.status}</p>
                  {order.staff && <p>Staff: {order.staff}</p>}
                  {(order as any).modificationLog?.map((log: any, i: number) => (
                    <p key={i} className="text-warning">{log.action} — {log.reason} ({log.timestamp})</p>
                  ))}
                </div>
              </div>
            );
          })()}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowModifyOrder(null); setModifyCancelReason(""); setModifyCancelCustomReason(""); setCancelSelectedItemIds([]); setCancelApproverId(""); setCancelResponsibleUserId(""); setCancelPenaltyAmount(0); setCancelRefundMethod("cash"); }}>Cancel</Button>
            {modifyCancelAction === "cancel" ? (
              <Button variant="destructive" disabled={cancelSubmitting || !modifyCancelReason || !cancelApproverId || (modifyCancelReason === "Other" && !modifyCancelCustomReason.trim())}
                onClick={() => { const order = allOrdersData.find(o => o.id === showModifyOrder); if (order) handleCancelOrder(order); }}>
                <Ban className="h-4 w-4 mr-1" />{cancelSubmitting ? "Sending..." : "Send for Approval"}
              </Button>
            ) : (
              <Button className="gradient-primary text-primary-foreground" disabled={!modifyCancelReason || (modifyCancelReason === "Other" && !modifyCancelCustomReason.trim())} onClick={() => {
                if (!showModifyOrder) return;
                const finalReason = modifyCancelReason === "Other" ? modifyCancelCustomReason.trim() : modifyCancelReason;
                if (!finalReason) return;
                const order = allOrdersData.find(o => o.id === showModifyOrder);
                if (order) {
                  loadRunningOrder(showModifyOrder);
                }
                toast.success("Order loaded for modification. Audit logged.");
                setShowModifyOrder(null);
                setModifyCancelReason("");
                setModifyCancelCustomReason("");
              }}>
                <FileText className="h-4 w-4 mr-1" />Modify Order
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Item Notes Dialog */}
      <Dialog open={!!editingNotesId} onOpenChange={(open) => { if (!open) setEditingNotesId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <StickyNote className="h-5 w-5 text-warning" />
              {tempNotes ? "Edit Note" : "Add Note"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium mb-1">{cart.find(c => c.id === editingNotesId)?.name}</p>
              <p className="text-xs text-muted-foreground">Add special instructions for this item</p>
            </div>
            <textarea
              value={tempNotes}
              onChange={e => setTempNotes(e.target.value)}
              placeholder="e.g. Extra spicy, No onions, Well done..."
              className="w-full h-24 rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              autoFocus
            />
            <div className="flex flex-wrap gap-1.5">
              {["Extra Spicy", "No Onions", "Well Done", "Less Salt", "Extra Cheese", "No Mayo"].map(q => (
                <Badge key={q} variant="outline" className="text-[10px] cursor-pointer hover:bg-primary/10 transition-colors"
                  onClick={() => setTempNotes(prev => prev ? `${prev}, ${q}` : q)}>
                  + {q}
                </Badge>
              ))}
            </div>
          </div>
          <DialogFooter className="gap-2">
            {tempNotes && (
              <Button variant="outline" size="sm" className="text-destructive border-destructive/30" onClick={() => {
                if (editingNotesId) { updateItemNotes(editingNotesId, ""); }
                setEditingNotesId(null); setTempNotes("");
              }}>Remove Note</Button>
            )}
            <Button variant="outline" onClick={() => setEditingNotesId(null)}>Cancel</Button>
            <Button className="gradient-primary text-primary-foreground" onClick={() => {
              if (editingNotesId) { updateItemNotes(editingNotesId, tempNotes); }
              setEditingNotesId(null);
            }}>Save Note</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default POS;

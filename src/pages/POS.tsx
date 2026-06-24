import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import type { OrderItem, Order, OrderType, CustomerType, OrderModificationLog } from "@/data/mock-data";
import { orderService, type OrderRecord } from "@/services/order.service";
import { menuService } from "@/services/menu.service";
import { customerService, type CustomerRecord } from "@/services/customer.service";
import { userService } from "@/services/user.service";
import { settingsService, type SettingsRecord } from "@/services/settings.service";
import { inventoryService, type IngredientRecord } from "@/services/inventory.service";
import { shiftService, type ShiftRecord } from "@/services/shift.service";
import { deliveryService, type RiderRecord } from "@/services/delivery.service";
import { tableService, type TableRecord } from "@/services/table.service";
import { useVisiblePolling } from "@/hooks/use-visible-polling";
import { useOrderEvents } from "@/hooks/use-order-events";
import { Search, Plus, Minus, X, ShoppingCart, FileText, Printer, ArrowLeft, Trash2, User, MapPin, Phone, Flame, Check, CreditCard, Banknote, Smartphone, RotateCcw, Download, ClipboardList, AlertTriangle, UtensilsCrossed, CalendarClock, Calendar, Timer, ChefHat, Tag, Zap, History, Monitor, BookOpen, StickyNote, Eye, Building2, Crown, CircleAlert, Bell, DollarSign, Package, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { generateInvoicePDF } from "@/lib/generate-invoice-pdf";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import type { Shift } from "@/contexts/DataContext";

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

const finalizeMethods = [
  { id: "Cash", icon: Banknote, label: "Cash" },
  { id: "Credit Card", icon: CreditCard, label: "Credit Card" },
  { id: "JazzCash", icon: Smartphone, label: "JazzCash" },
  { id: "EasyPaisa", icon: Smartphone, label: "EasyPaisa" },
];

const quickDenominations = [10, 20, 50, 100, 500, 1000];

const POS = () => {
  const { orders: localOrdersData, customers: customersList, foodMenuItems: localFoodMenuItems, foodCategories: localFoodCategories, modifiers: localModifiers, kitchens: localKitchens, ingredients, addItem, updateItem: updateDataItem, shifts, settings, users, riders: deliveryRiders, deals, reservations } = useData();
  const { user } = useAuth();
  const location = useLocation();

  // ── API data state (overrides localStorage) ──
  const [apiOrders, setApiOrders] = useState<any[]>([]);
  const [apiMenuItems, setApiMenuItems] = useState<any[]>([]);
  const [apiCategories, setApiCategories] = useState<any[]>([]);
  const [apiModifiers, setApiModifiers] = useState<any[]>([]);
  const [apiKitchens, setApiKitchens] = useState<any[]>([]);
  const [apiCustomers, setApiCustomers] = useState<CustomerRecord[]>([]);
  const [apiStaff, setApiStaff] = useState<any[]>([]);
  const [apiSettings, setApiSettings] = useState<SettingsRecord | null>(null);
  const [apiLowStockItems, setApiLowStockItems] = useState<IngredientRecord[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Normalize an API OrderRecord to match the mock Order field names
  const normalizeApiOrder = useCallback((o: OrderRecord): any => ({
    ...o,
    customer: o.customerName || 'Walk-in',
    staff: o.staffName || '',
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

  useEffect(() => {
    // Load all data from API on mount
    loadApiOrders();
    menuService.getMenuItems({ limit: 500 }).then(data => setApiMenuItems(data)).catch(() => {});
    menuService.getCategories('active').then(data => setApiCategories(data)).catch(() => {});
    menuService.getModifiers().then(data => setApiModifiers(data)).catch(() => {});
    orderService.getKitchens().then(data => setApiKitchens(data)).catch(() => {});
    customerService.getCustomers({ limit: 500 }).then(res => setApiCustomers(res.data)).catch(() => {});
    const STAFF_ROLES = ['Waiter', 'Floor Manager', 'Cashier', 'Manager', 'Admin'];
    userService.getUsers({ limit: 100 }).then(res => setApiStaff(res.data.filter((u: any) => u.status === 'active' && STAFF_ROLES.includes(u.role)))).catch(() => {});
    settingsService.getSettings().then(s => setApiSettings({ ...s, taxRate: Number(s.taxRate) })).catch(() => {});
    inventoryService.getIngredients({ status: 'active', lowStock: true }).then(data => setApiLowStockItems(data)).catch(() => {});
  }, [loadApiOrders]);

  // Refresh orders on real-time push (instant), plus a 60s visibility-gated safety
  // poll so a backgrounded tab stops querying and lets the DB idle (saves CU-hrs).
  useOrderEvents(loadApiOrders);
  useVisiblePolling(loadApiOrders, 60000);

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

  // Cash Register
  const [activeShift, setActiveShift] = useState<ShiftRecord | null>(null);
  const [shiftLoading, setShiftLoading] = useState(true);
  const [showRegisterOpen, setShowRegisterOpen] = useState(true);
  const [showRegisterClose, setShowRegisterClose] = useState(false);
  const [openingCashInput, setOpeningCashInput] = useState("");
  const [closingCashInput, setClosingCashInput] = useState("");
  const [closingNotes, setClosingNotes] = useState("");

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

  // Customer History
  const [showCustomerHistory, setShowCustomerHistory] = useState(false);

  // Item Notes
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [tempNotes, setTempNotes] = useState("");

  // Quotation
  const [showQuotation, setShowQuotation] = useState(false);

  // Kitchen Notifications
  const [showKitchenNotifications, setShowKitchenNotifications] = useState(false);

  // Order Modification/Cancellation Dialog
  const [showModifyOrder, setShowModifyOrder] = useState<string | null>(null);
  const [modifyCancelReason, setModifyCancelReason] = useState("");
  const [modifyCancelAction, setModifyCancelAction] = useState<"modify" | "cancel">("modify");
  const [modifyCancelCustomReason, setModifyCancelCustomReason] = useState("");

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

  // Load tables from backend once on mount
  useEffect(() => {
    tableService.getTables().then(setBackendTables).catch(() => {});
  }, []);

  // Load available riders when delivery type is selected
  useEffect(() => {
    if (orderType === "Delivery") {
      deliveryService.getRiders()
        .then(riders => setApiRiders(riders.filter(r => r.isAvailable || r.status === "available")))
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
    if (!activeShift) return { total: 0, cash: 0, card: 0, online: 0, nonCash: 0, count: 0 };
    const shiftOrders = allOrdersData.filter(o => {
      const orderDate = new Date(o.date);
      const shiftStart = new Date(activeShift.openedAt);
      return orderDate >= new Date(shiftStart.toISOString().split("T")[0]) && o.status !== "cancelled";
    });
    const total = shiftOrders.reduce((s, o) => s + o.total, 0);
    const cash = shiftOrders.filter(o => o.paymentMethod?.toLowerCase().includes("cash")).reduce((s, o) => s + o.total, 0);
    const card = shiftOrders.filter(o => o.paymentMethod?.toLowerCase().includes("card")).reduce((s, o) => s + o.total, 0);
    const online = shiftOrders.filter(o => o.paymentMethod?.toLowerCase().includes("online")).reduce((s, o) => s + o.total, 0);
    return { total, cash, card, online, nonCash: card + online, count: shiftOrders.length };
  }, [allOrdersData, activeShift]);

  const activeOrders = useMemo(() => allOrdersData.filter(o => o.status !== "completed" && o.status !== "cancelled" && o.status !== "scheduled"), [allOrdersData]);
  const activeOrdersCount = activeOrders.length;
  const ordersByStatus = useMemo(() => ({
    pending: activeOrders.filter(o => o.status === "pending"),
    preparing: activeOrders.filter(o => o.status === "preparing"),
    ready: activeOrders.filter(o => o.status === "ready"),
  }), [activeOrders]);

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
    const STAFF_ROLES = ['Waiter', 'Floor Manager', 'Cashier', 'Manager', 'Admin'];
    if (apiStaff.length > 0) return apiStaff;
    return users.filter(u => u.status === "active" && STAFF_ROLES.includes(u.role));
  }, [apiStaff, users]);

  // Today's reservations for POS view
  const todayStr = new Date().toISOString().split("T")[0];
  const todayReservations = useMemo(() =>
    (reservations || []).filter(r => r.date >= todayStr && r.status !== "cancelled" && r.status !== "noShow")
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)),
    [reservations, todayStr]
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

  // Prefer API settings; fall back to localStorage settings
  const effectiveSettings = apiSettings ?? settings;
  const taxRate = ((effectiveSettings?.taxRate ?? 16) as number) / 100;

  // FIX 3A: Filter by tags
  const filteredMenu = useMemo(() => {
    let items = foodMenuItems.filter((item) => item.available);
    if (activeTag) {
      items = items.filter((i) => (i as any).tags?.includes(activeTag.toLowerCase()));
    }
    if (activeCategory !== "All") items = items.filter((i) => i.category === activeCategory);
    if (search) items = items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()) || i.code.toLowerCase().includes(search.toLowerCase()));
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

  const totalPaid = paymentEntries.reduce((s, e) => s + e.amount, 0);
  const totalDue = total - totalPaid;
  const finalizeChange = givenAmount > 0 ? Math.max(0, givenAmount - (totalDue > 0 ? totalDue : total)) : 0;

  const isPaymentSufficient = totalPaid >= total;

  const loadRunningOrder = (orderId: string) => {
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
    if (orderType === "Delivery" && !deliveryAddress.trim()) { toast.error("Enter delivery address"); return false; }
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
    setShowFinalizeSale(true);
  };

  const addPaymentEntry = () => {
    if (givenAmount <= 0) { toast.error("Enter an amount"); return; }
    setPaymentEntries(prev => [...prev, { id: `pay-${Date.now()}`, method: finalizeMethod, amount: givenAmount }]);
    setGivenAmount(0);
  };

  const removePaymentEntry = (id: string) => setPaymentEntries(prev => prev.filter(e => e.id !== id));

  const handleFinalizeSubmit = async () => {
    if (totalPaid < total) {
      if (!selectedCustomer || selectedCustomer === "") {
        toast.error("Payment incomplete. Select a customer for credit or pay full amount.");
        return;
      }
    }

    setIsSubmitting(true);

    let payMethodStr = paymentEntries.length > 0
      ? paymentEntries.map(e => `${e.method}: Rs.${e.amount}`).join(", ")
      : finalizeMethod;
    if (loadedAdvancePayment > 0) {
      payMethodStr = `Advance (${loadedAdvanceMethod}): Rs.${loadedAdvancePayment}, ${payMethodStr}`;
    }

    let finalOrderNumber = "";

    try {
      // ── Payment-only mode: just update payment + mark completed, NO re-send to kitchen ──
      if (paymentOnlyMode && loadedOrderId) {
        const updated = await orderService.updateOrder(loadedOrderId, { paymentMethod: payMethodStr });
        // If order was ready, mark it completed now that payment is collected
        const existingOrder = allOrdersData.find((o) => o.id === loadedOrderId);
        if (existingOrder && (existingOrder.status === "ready" || existingOrder.status === "preparing")) {
          await orderService.updateOrderStatus(loadedOrderId, "completed");
        }
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
          if (orderType === "Delivery" && selectedRiderId) {
            deliveryService.assignRider({ orderId: created.id, riderId: selectedRiderId, estimatedTime: 30 })
              .catch(() => {});
          }
          toast.success(`Order ${finalOrderNumber} placed! Total: Rs. ${total.toLocaleString()}`);
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

  const addNewCustomer = async () => {
    if (!newCustomer.name.trim() || !newCustomer.phone.trim()) { toast.error("Name and phone required"); return; }
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
    if (cust && orderType === "Delivery") {
      setDeliveryAddress(cust.address);
      setDeliveryPhone(cust.phone);
    }
  };

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
          <Button variant="outline" size="sm" className="h-8 text-xs rounded-lg gap-1 shrink-0 px-2.5 font-medium" onClick={() => setShowKitchenNotifications(true)}>
            <Bell className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Kitchen</span>
            {kitchenNotifications.length > 0 && (
              <Badge className="h-5 px-1 text-[10px] bg-success text-success-foreground animate-pulse">{kitchenNotifications.length}</Badge>
            )}
          </Button>

          {/* Divider */}
          <div className="h-5 w-px bg-border/60 shrink-0 hidden sm:block mx-0.5" />

          {/* Group 2: Scheduling & secondary */}
          <Button variant="outline" size="sm" className="h-8 text-xs rounded-lg gap-1 shrink-0 px-2" onClick={() => setShowFutureSale(true)}>
            <CalendarClock className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Future Sale</span>
            {futureOrders.length > 0 && (
              <Badge className="h-5 px-1 text-[10px] bg-info text-info-foreground">{futureOrders.length}</Badge>
            )}
          </Button>
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
          <Button variant="outline" size="sm" className="h-8 text-xs rounded-lg gap-1 shrink-0 px-2" onClick={() => setShowRegisterClose(true)}>
            <DollarSign className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">Cash Register</span>
          </Button>
          {lowStockItems.length > 0 && (
            <Button variant="outline" size="sm" className="h-8 text-xs rounded-lg gap-1 shrink-0 px-2 border-destructive/30 text-destructive hover:bg-destructive/5" onClick={() => setShowLowStock(true)}>
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Low Stock</span>
              <Badge className="h-5 px-1 text-[10px] bg-destructive text-destructive-foreground">{lowStockItems.length}</Badge>
            </Button>
          )}

          {/* Combo filter tag */}
          <Badge variant="secondary" onClick={() => handleTagClick("Combo")}
            className={cn("text-[10px] cursor-pointer transition-all border px-2.5 py-1 rounded-full font-semibold shrink-0 hidden md:inline-flex bg-warning/10 text-warning border-warning/20 ml-0.5", activeTag === "Combo" && "ring-2 ring-primary ring-offset-1 shadow-sm")}>
            Combo
          </Badge>
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
                  "p-3 cursor-pointer hover:shadow-md transition-all text-xs border-l-[3px] rounded-lg hover:-translate-y-0.5",
                  selectedRunningOrder === o.id ? "border-l-primary bg-primary/5 shadow-sm" : "border-l-transparent",
                  o.type === "Delivery" ? "border-l-info" : o.type === "Take Away" ? "border-l-accent" : ""
                )}>
                  <div className="flex items-center justify-between">
                    <span className="font-bold tracking-tight">{o.orderNumber}</span>
                    <Badge variant="secondary" className="text-[9px] rounded-full">{o.type}</Badge>
                  </div>
                  <p className="text-muted-foreground mt-1 truncate">{o.customer}</p>
                  <p className="text-muted-foreground">{o.time}</p>
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
            {/* Dine In: Table Dropdown */}
            {orderType === "Dine In" && (
              <Select value={tableNumber ? String(tableNumber) : ""} onValueChange={(v) => setTableNumber(Number(v))}>
                <SelectTrigger className={cn("w-24 h-6 sm:h-7 text-[10px] sm:text-xs rounded-lg", tableNumber ? "border-primary text-primary font-semibold" : "")}>
                  <SelectValue placeholder="Table #" />
                </SelectTrigger>
                <SelectContent>
                  {backendTables.length > 0
                    ? backendTables.map((t) => (
                        <SelectItem key={t.id} value={String(Number(t.number))}>
                          Table {t.number}{t.floor ? ` (${t.floor})` : ""}{t.capacity ? ` · ${t.capacity}` : ""}
                        </SelectItem>
                      ))
                    : Array.from({ length: 12 }, (_, i) => i + 1).map((t) => (
                        <SelectItem key={t} value={String(t)}>Table {t}</SelectItem>
                      ))
                  }
                </SelectContent>
              </Select>
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
                <Input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Delivery address" className="h-7 sm:h-8 text-xs" />
              </div>
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input value={deliveryPhone} onChange={(e) => setDeliveryPhone(e.target.value)} placeholder="Phone number" className="h-7 sm:h-8 text-xs flex-1" />
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
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <div className="h-20 w-20 rounded-2xl bg-muted/40 flex items-center justify-center mb-4">
                  <ShoppingCart className="h-10 w-10 opacity-20" />
                </div>
                <p className="text-sm font-medium">No items added yet</p>
                <p className="text-xs mt-1">Click items from the menu to add</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left py-2 font-medium">Item</th>
                    <th className="text-center py-2 font-medium w-16">Price</th>
                    <th className="text-center py-2 font-medium w-24">Qty</th>
                    <th className="text-center py-2 font-medium w-16 print:hidden">Disc.</th>
                    <th className="text-right py-2 font-medium w-20">Total</th>
                    <th className="w-8 print:hidden"></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="py-2">
                        <span className="font-medium">{item.name}</span>
                        {item.modifiers && item.modifiers.length > 0 && (
                          <p className="text-[10px] text-muted-foreground">{item.modifiers.join(", ")}</p>
                        )}
                        {item.notes && (
                          <p className="text-[10px] text-warning italic truncate max-w-[120px]">{item.notes}</p>
                        )}
                        <button onClick={() => { setEditingNotesId(item.id); setTempNotes(item.notes || ""); }} className="text-[10px] text-muted-foreground hover:text-primary mt-0.5 flex items-center gap-0.5">
                            <StickyNote className="h-2.5 w-2.5" />{item.notes ? "Edit" : "Note"}
                        </button>
                      </td>
                      <td className="text-center py-2 text-xs">Rs. {item.price}</td>
                      <td className="py-2">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="outline" size="icon" className="h-6 w-6 print:hidden" onClick={() => updateQty(item.id, -1)}><Minus className="h-3 w-3" /></Button>
                          <span className="w-6 text-center font-medium">{item.qty}</span>
                          <Button variant="outline" size="icon" className="h-6 w-6 print:hidden" onClick={() => updateQty(item.id, 1)}><Plus className="h-3 w-3" /></Button>
                        </div>
                      </td>
                      <td className="py-2 print:hidden">
                        <Input type="number" value={item.discount || ""} onChange={(e) => updateItemDiscount(item.id, Number(e.target.value))} className="h-6 w-14 text-xs text-center mx-auto" placeholder="0" />
                      </td>
                      <td className="text-right py-2 font-medium">Rs. {((item.price * item.qty) - item.discount).toLocaleString()}</td>
                      <td className="py-2 print:hidden">
                        <button onClick={() => removeItem(item.id)} className="text-destructive hover:text-destructive/80"><X className="h-4 w-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Bottom Totals & Actions */}
          <div className="border-t-2 border-primary/10 bg-card p-2.5 sm:p-3 space-y-2 print:hidden shadow-[0_-4px_20px_-8px_hsl(var(--primary)/0.08)]">
            <div className="flex justify-between items-center text-lg sm:text-xl font-bold"><span>Total</span><span className="text-primary">Rs. {total.toLocaleString()}</span></div>

            {/* Advance Payment Banner — shown when a future order is loaded */}
            {loadedAdvancePayment > 0 && (
              <div className="bg-success/10 border border-success/30 rounded-lg p-2 space-y-1">
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

            <div className="space-y-1.5 pt-1">
              {/* Secondary Actions Row */}
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-1">
                <Button variant="outline" className="text-destructive border-destructive/30 text-[10px] h-8 rounded-lg hover:bg-destructive/5" onClick={cancelOrder}><Trash2 className="h-3 w-3 mr-0.5" />Cancel</Button>
                <Button variant="outline" className="text-accent border-accent/30 text-[10px] h-8 rounded-lg hover:bg-accent/5" onClick={saveDraft}><FileText className="h-3 w-3 mr-0.5" />Draft</Button>
                <Button variant="outline" className="text-info border-info/30 text-[10px] h-8 rounded-lg hover:bg-info/5 font-semibold" onClick={() => { if (cart.length === 0) { toast.error("Add items first"); return; } setShowCreateFutureSale(true); }}>
                  <CalendarClock className="h-3 w-3 mr-0.5" />Future
                </Button>
                <Button variant="outline" className="text-info border-info/30 text-[10px] h-8 rounded-lg hover:bg-info/5" onClick={() => cart.length > 0 && setShowQuotation(true)}><FileText className="h-3 w-3 mr-0.5" />Quote</Button>
                <Button variant="outline" className="text-info border-info/30 text-[10px] h-8 rounded-lg hover:bg-info/5" onClick={() => cart.length > 0 && setShowInvoice(true)}><Printer className="h-3 w-3 mr-0.5" />Invoice</Button>
              </div>
              {/* KOT Print Row */}
              <div className="grid grid-cols-2 gap-1.5">
                <Button variant="outline" className="text-warning border-warning/30 text-xs h-9 rounded-lg hover:bg-warning/5 font-semibold" onClick={() => {
                  if (cart.length === 0) { toast.error("Add items first"); return; }
                  setKotItems([...cart]); setKotOrderType(orderType); setKotTableNumber(tableNumber); setKotStaffName(selectedStaff);
                  setKotOrderNumber("NEW"); setShowKOT(true);
                }}><ChefHat className="h-3.5 w-3.5 mr-1" />Print KOT</Button>
                <Button className={cn("w-full text-primary-foreground text-sm h-9 font-bold rounded-lg shadow-md hover:shadow-lg transition-shadow", paymentOnlyMode ? "bg-warning hover:bg-warning/90" : "gradient-primary")} onClick={handlePlaceOrder}>
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
          <div className="flex border-b border-border/60 overflow-x-auto bg-muted/20 scrollbar-none">
            {["All", ...foodCategories.map((c) => c.name)].map((cat) => (
              <button key={cat} onClick={() => setActiveCategory(cat)} className={cn(
                "px-3 sm:px-3.5 py-2 sm:py-2.5 text-[11px] sm:text-xs whitespace-nowrap border-b-2 font-semibold transition-all",
                activeCategory === cat ? "border-primary text-primary bg-primary/5" : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
              )}>
                {cat}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-2 sm:p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-3 2xl:grid-cols-4 gap-2 auto-rows-max">
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
                return (
                <React.Fragment key={item.id}>
                  <button onClick={() => addToCart(item)} className={cn(
                    "bg-background rounded-xl border border-border/60 p-1.5 hover:shadow-lg hover:scale-[1.02] transition-all text-left group relative",
                    expandedItemId === item.id && "ring-2 ring-primary border-primary"
                  )}>
                    <div className="aspect-[4/3] rounded-lg overflow-hidden mb-1 relative">
                      {item.image ? (
                        <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      ) : (
                        <div className="w-full h-full gradient-primary flex items-center justify-center rounded-lg">
                          <span className="text-primary-foreground text-xl font-bold">{item.name.charAt(0)}</span>
                        </div>
                      )}
                      {!item.available && (
                        <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
                          <Badge variant="destructive" className="text-[9px]">Unavailable</Badge>
                        </div>
                      )}
                    </div>
                    <p className="text-xs font-semibold truncate">{item.name}</p>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-[11px] text-primary font-bold">{effectiveSettings.currency} {resolvePrice(item, orderType)}</p>
                      {(item as any).cookingTime > 0 && (
                        <span className="text-[9px] text-muted-foreground flex items-center gap-0.5"><Timer className="h-2.5 w-2.5" />{(item as any).cookingTime}m</span>
                      )}
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
            <Input value={newCustomer.phone} onChange={(e) => setNewCustomer((p) => ({ ...p, phone: e.target.value }))} placeholder="Phone number *" />
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
            <AlertDialogDescription>
              <div className="space-y-2 text-left">
                <p>Type: <strong>{orderType}</strong>{tableNumber ? ` — Table ${tableNumber}` : ""}</p>
                <p>Customer: <strong>{selectedCustomerData?.name || "Walk-in"}</strong></p>
                <p>Items: <strong>{cart.length}</strong></p>
                <p className="text-lg font-bold text-primary">Total: Rs. {total.toLocaleString()}</p>
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
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Finalize Sale</span>
              <Badge variant="secondary" className="text-xs">⏱ {orderElapsed}</Badge>
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Left: Order Info */}
            <div className="space-y-3">
              <div className="text-sm space-y-1">
                <p className="text-muted-foreground">Customer: <strong>{selectedCustomerData?.name || "Walk-in"}</strong></p>
                <p className="text-muted-foreground">Type: <strong>{orderType}</strong></p>
                {tableNumber && <p className="text-muted-foreground">Table: <strong>#{tableNumber}</strong></p>}
              </div>
              <Separator />
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowCartDetails(!showCartDetails)}>
                {showCartDetails ? "Hide" : "Show"} Cart Details ({cart.length} items)
              </Button>
              {showCartDetails && (
                <div className="text-xs space-y-1 max-h-32 overflow-y-auto">
                  {cart.map(item => (
                    <div key={item.id} className="flex justify-between">
                      <span>{item.qty}x {item.name}</span>
                      <span>Rs. {((item.price * item.qty) - item.discount).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
              <Separator />
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>Rs. {subtotal.toLocaleString()}</span></div>
                {orderDiscount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="text-destructive">-Rs. {orderDiscount.toLocaleString()}</span></div>}
                <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>Rs. {tax.toLocaleString()}</span></div>
                <Separator />
                <div className="flex justify-between font-bold text-lg"><span>Total</span><span className="text-primary">Rs. {total.toLocaleString()}</span></div>
              </div>
            </div>

            {/* Center: Payment Methods */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Payment Method</p>
              <div className="grid grid-cols-2 gap-2">
                {finalizeMethods.map(m => (
                  <Button key={m.id} variant={finalizeMethod === m.id ? "default" : "outline"} size="sm"
                    className={cn("text-xs h-9", finalizeMethod === m.id && "gradient-primary text-primary-foreground")}
                    onClick={() => setFinalizeMethod(m.id)}>
                    <m.icon className="h-3 w-3 mr-1" />{m.label}
                  </Button>
                ))}
              </div>
              <Separator />
              <div className="space-y-2">
                <p className="text-xs font-medium">Enter Amount</p>
                <Input type="number" value={givenAmount || ""} onChange={(e) => setGivenAmount(Number(e.target.value))} placeholder="0" className="text-lg text-center" />
                <div className="grid grid-cols-3 gap-1">
                  {quickDenominations.map(d => (
                    <Button key={d} variant="outline" size="sm" className="text-xs" onClick={() => setGivenAmount(prev => prev + d)}>+{d}</Button>
                  ))}
                </div>
                <Button className="w-full" size="sm" onClick={addPaymentEntry}>Add Payment Entry</Button>
                <Button variant="outline" className="w-full text-xs" size="sm" onClick={() => { setGivenAmount(total); setPaymentEntries([]); }}>
                  Exact Amount
                </Button>
              </div>
            </div>

            {/* Right: Summary */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Payment Entries</p>
              {paymentEntries.length === 0 ? (
                <p className="text-xs text-muted-foreground">No entries yet</p>
              ) : (
                <div className="space-y-1">
                  {paymentEntries.map(e => (
                    <div key={e.id} className="flex items-center justify-between text-sm bg-muted/50 rounded px-2 py-1">
                      <span className="text-xs">{e.method}</span>
                      <div className="flex items-center gap-1">
                        <span className="font-medium">Rs. {e.amount.toLocaleString()}</span>
                        <button onClick={() => removePaymentEntry(e.id)} className="text-destructive"><X className="h-3 w-3" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <Separator />
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span>Total Due</span><span className="font-bold">Rs. {total.toLocaleString()}</span></div>
                <div className="flex justify-between"><span>Total Paid</span><span className={cn("font-bold", totalPaid >= total ? "text-success" : "text-destructive")}>Rs. {totalPaid.toLocaleString()}</span></div>
                {totalPaid > total && <div className="flex justify-between text-success"><span>Change</span><span className="font-bold">Rs. {(totalPaid - total).toLocaleString()}</span></div>}
                {totalPaid < total && <div className="flex justify-between text-destructive"><span>Remaining</span><span className="font-bold">Rs. {(total - totalPaid).toLocaleString()}</span></div>}
              </div>
              {finalizeChange > 0 && givenAmount > 0 && (
                <div className="bg-success/10 text-success p-2 rounded text-center text-sm font-bold">
                  Change: Rs. {finalizeChange.toLocaleString()}
                </div>
              )}
              <Separator />
              <div className="flex items-center gap-2">
                <Checkbox checked={sendSMS} onCheckedChange={(c) => setSendSMS(!!c)} />
                <Label className="text-xs">Send SMS to customer</Label>
              </div>
              {!isPaymentSufficient && totalPaid < total && (
                <p className="text-xs text-warning">⚠ Payment is less than total. Customer credit will be recorded.</p>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowFinalizeSale(false)} disabled={isSubmitting}>Cancel</Button>
            <Button className="gradient-primary text-primary-foreground min-w-[150px]" onClick={handleFinalizeSubmit} disabled={isSubmitting}>
              {isSubmitting
                ? <><span className="h-4 w-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />Processing...</>
                : <><Check className="h-4 w-4 mr-1" />Confirm Payment</>}
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
            <p className="text-xs">Customer: <strong>{selectedCustomerData?.name || "Walk-in"}</strong> | Type: <strong>{orderType}</strong></p>
            <Table>
              <TableHeader><TableRow><TableHead className="text-xs">Item</TableHead><TableHead className="text-xs text-center">Qty</TableHead><TableHead className="text-xs text-right">Total</TableHead></TableRow></TableHeader>
              <TableBody>{cart.map((c, i) => <TableRow key={i}><TableCell className="text-xs">{c.name}</TableCell><TableCell className="text-xs text-center">{c.qty}</TableCell><TableCell className="text-xs text-right">Rs. {((c.price * c.qty) - c.discount).toLocaleString()}</TableCell></TableRow>)}</TableBody>
            </Table>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between"><span>Subtotal</span><span>Rs. {subtotal.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>Tax</span><span>Rs. {tax.toLocaleString()}</span></div>
              <Separator />
              <div className="flex justify-between font-bold text-base"><span>Total</span><span className="text-primary">Rs. {total.toLocaleString()}</span></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvoice(false)}>Close</Button>
            <Button variant="outline" onClick={() => generateInvoicePDF({
              orderNumber: "—", date: new Date().toISOString().split("T")[0], time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
              orderType, tableNumber: tableNumber || undefined, customer: selectedCustomerData?.name || "Walk-in",
              phone: selectedCustomerData?.phone || "", staff: selectedStaff, paymentMethod: finalizeMethod,
              items: cart.map(c => ({ name: c.name, qty: c.qty, price: c.price, discount: c.discount })),
              subtotal, discount: orderDiscount, tax, total,
            })}><Download className="h-4 w-4 mr-1" />PDF</Button>
            <Button className="gradient-primary text-primary-foreground" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />Print</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* KOT Dialog */}
      <Dialog open={showKOT} onOpenChange={setShowKOT}>
        <DialogContent className="max-w-sm">
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
        <SheetContent side="right" className="w-full sm:w-[420px] lg:w-[520px] p-0">
          <div className="p-4 border-b bg-card">
            <h2 className="font-bold text-lg">Order Status</h2>
            <p className="text-xs text-muted-foreground">Live order tracking — {activeOrdersCount} active orders</p>
          </div>
          <div className="p-4 space-y-4 overflow-y-auto max-h-[calc(100vh-80px)]">
            <div className="grid grid-cols-3 gap-2">
              <Card className="p-3 text-center border-l-4 border-l-warning">
                <p className="text-2xl font-bold text-warning">{ordersByStatus.pending.length}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </Card>
              <Card className="p-3 text-center border-l-4 border-l-accent">
                <p className="text-2xl font-bold text-accent">{ordersByStatus.preparing.length}</p>
                <p className="text-xs text-muted-foreground">Preparing</p>
              </Card>
              <Card className="p-3 text-center border-l-4 border-l-success">
                <p className="text-2xl font-bold text-success">{ordersByStatus.ready.length}</p>
                <p className="text-xs text-muted-foreground">Ready</p>
              </Card>
            </div>

            {(["pending", "preparing", "ready"] as const).map(status => (
              ordersByStatus[status].length > 0 && (
                <div key={status}>
                  <h3 className="text-sm font-semibold capitalize mb-2 flex items-center gap-2">
                    <div className={cn("h-2 w-2 rounded-full", status === "pending" ? "bg-warning" : status === "preparing" ? "bg-accent" : "bg-success")} />
                    {status} ({ordersByStatus[status].length})
                  </h3>
                  <div className="space-y-3">
                    {ordersByStatus[status].map(order => (
                      <Card key={order.id} className={cn(
                        "p-4 text-xs border-l-4",
                        status === "pending" ? "border-l-warning" : status === "preparing" ? "border-l-accent" : "border-l-success"
                      )}>
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <span className="font-bold text-sm">{order.orderNumber}</span>
                            <span className="text-muted-foreground ml-2">{order.time}</span>
                          </div>
                          <Badge variant="secondary" className="text-[10px] shrink-0">{order.type}</Badge>
                        </div>

                        <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                          <User className="h-3 w-3 shrink-0" />
                          <span className="font-medium text-foreground">{order.customer}</span>
                          <span>•</span>
                          <span>{order.phone}</span>
                        </div>

                        {order.type === "Dine In" && order.tableNumber && (
                          <div className="flex items-center gap-1.5 mb-2 text-muted-foreground">
                            <UtensilsCrossed className="h-3 w-3 shrink-0" />
                            <span>Table {order.tableNumber}</span>
                          </div>
                        )}
                        {order.type === "Delivery" && order.deliveryAddress && (
                          <div className="flex items-center gap-1.5 mb-2 text-muted-foreground">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{order.deliveryAddress}</span>
                            {order.rider && <Badge variant="outline" className="text-[9px] ml-auto shrink-0">{order.rider}</Badge>}
                          </div>
                        )}

                        <div className="bg-muted/50 rounded-lg p-2 mb-2">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Items</p>
                          {order.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center py-0.5">
                              <span className="text-foreground">
                                {item.qty}x {item.name}
                              </span>
                              <span className="text-muted-foreground font-medium">Rs.{item.price * item.qty}</span>
                            </div>
                          ))}
                          <div className="border-t border-border mt-1.5 pt-1.5 flex justify-between font-bold text-foreground">
                            <span>Total</span>
                            <span>Rs.{order.total}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-muted-foreground mb-2">
                          <span>Payment: <span className="font-medium text-foreground">{order.paymentMethod}</span></span>
                          <span>Staff: <span className="font-medium text-foreground">{order.staff}</span></span>
                        </div>

                        {(() => {
                          if (status === "ready") return null;
                          // Use actual cookingTime from items; fall back to 10 min default (same as KitchenPanel)
                          const rawCookTime = Math.max(...order.items.map((i: any) => i.cookingTime || 0), 0);
                          const cookTime = rawCookTime > 0 ? rawCookTime : 10;

                          if (status === "pending") {
                            return (
                              <div className="flex items-center gap-2 mb-2 text-[10px]">
                                <Timer className="h-3 w-3 shrink-0 text-warning" />
                                <span className="font-semibold text-warning">
                                  Waiting · {cookTime} min est.
                                </span>
                              </div>
                            );
                          }

                          // "preparing": posPreparingAtMap (set from this POS session when POS clicks Accept)
                          //              → updatedAt from API (set when kitchen accepted)
                          //              → fallback: assume just started
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
                            <div className="flex items-center gap-2 mb-2 text-[10px]">
                              <Timer className="h-3 w-3 shrink-0" />
                              <span className={cn("font-semibold tabular-nums", isOverdue ? "text-destructive" : remainSec <= 120 ? "text-warning" : "text-accent")}>
                                {isOverdue
                                  ? `Overdue ${overMin}m ${overSec}s`
                                  : `${mm}:${ss} remaining`}
                              </span>
                            </div>
                          );
                        })()}

                        <div className="flex gap-1.5">
                          {status === "pending" && (
                            <Button size="sm" className="h-7 text-xs flex-1 gradient-primary text-primary-foreground" onClick={() => { handleOrderStatusUpdate(order.id, "preparing"); }}>
                              Accept Order
                            </Button>
                          )}
                          {status === "preparing" && (
                            <Button size="sm" className="h-7 text-xs flex-1" variant="outline" onClick={() => { handleOrderStatusUpdate(order.id, "ready"); }}>
                              Mark Ready
                            </Button>
                          )}
                          {status === "ready" && (
                            <Button size="sm" className="h-7 text-xs flex-1 bg-success text-success-foreground hover:bg-success/90" onClick={() => { handleOrderStatusUpdate(order.id, "completed"); }}>
                              Complete
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="h-7 text-xs border-warning/30 text-warning hover:bg-warning/5" onClick={() => { setModifyCancelAction("modify"); setModifyCancelReason(""); setShowModifyOrder(order.id); }}>
                            Modify
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs border-destructive/30 text-destructive hover:bg-destructive/5" onClick={() => { setModifyCancelAction("cancel"); setModifyCancelReason(""); setShowModifyOrder(order.id); }}>
                            Cancel
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )
            ))}

            {activeOrdersCount === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No Active Orders</p>
                <p className="text-xs mt-1">New orders will appear here automatically</p>
              </div>
            )}
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
                      <option value="Cash">Cash</option>
                      <option value="Credit Card">Credit Card</option>
                      <option value="JazzCash">JazzCash</option>
                      <option value="EasyPaisa">EasyPaisa</option>
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

      {/* Reservation List Sheet (View-Only) */}
      <Sheet open={showReservations} onOpenChange={setShowReservations}>
        <SheetContent side="right" className="w-full sm:w-[400px] lg:w-[480px] p-0">
          <div className="p-4 border-b bg-card">
            <h2 className="font-bold text-lg flex items-center gap-2"><BookOpen className="h-5 w-5 text-info" />Reservations</h2>
            <p className="text-xs text-muted-foreground">{todayReservations.length} upcoming reservations (view only)</p>
          </div>
          <div className="p-4 space-y-2.5 overflow-y-auto max-h-[calc(100vh-80px)]">
            {todayReservations.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No Upcoming Reservations</p>
                <p className="text-xs mt-1">Reservations will appear here</p>
              </div>
            ) : todayReservations.map(res => (
              <Card key={res.id} className={cn("p-3 text-xs border-l-4", res.status === "confirmed" ? "border-l-success" : res.status === "seated" ? "border-l-primary" : "border-l-warning")}>
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="font-bold text-sm">{res.customerName}</span>
                    <span className="text-muted-foreground ml-2">{res.customerPhone}</span>
                  </div>
                  <Badge variant="secondary" className={cn("text-[9px]",
                    res.status === "confirmed" ? "bg-success/10 text-success" :
                    res.status === "seated" ? "bg-primary/10 text-primary" :
                    res.status === "completed" ? "bg-muted text-muted-foreground" : "bg-warning/10 text-warning"
                  )}>{res.status}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-muted-foreground">
                  <div className="flex items-center gap-1"><Calendar className="h-3 w-3" />{res.date}</div>
                  <div className="flex items-center gap-1"><Timer className="h-3 w-3" />{res.time}</div>
                  <div className="flex items-center gap-1"><User className="h-3 w-3" />{res.guestCount} guests</div>
                </div>
                {res.tableNumber && <p className="mt-1.5 text-muted-foreground">Table: <span className="font-medium text-foreground">{res.tableNumber}</span></p>}
                {res.specialRequests && (
                  <div className="bg-warning/5 border border-warning/20 rounded px-2 py-1 mt-1.5 text-foreground">
                    <span className="text-[10px] font-semibold text-warning uppercase">Note: </span>{res.specialRequests}
                  </div>
                )}
              </Card>
            ))}
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
              <div className="flex justify-between font-bold text-base"><span>Estimated Total</span><span className="text-primary">{effectiveSettings.currency} {total.toLocaleString()}</span></div>
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
      <Dialog open={showRegisterOpen && !activeShift} onOpenChange={() => {}}>
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

      {/* Register Close Dialog */}
      <Dialog open={showRegisterClose} onOpenChange={setShowRegisterClose}>
        <DialogContent className="max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Banknote className="h-5 w-5 text-primary" />Close Cash Register</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <Card className="p-3"><p className="text-xs text-muted-foreground">Opening Cash</p><p className="font-bold text-lg">Rs. {activeShift?.openingCash.toLocaleString()}</p></Card>
              <Card className="p-3"><p className="text-xs text-muted-foreground">Total Sales</p><p className="font-bold text-lg text-primary">Rs. {shiftSales.total.toLocaleString()}</p></Card>
              <Card className="p-3"><p className="text-xs text-muted-foreground">Cash Sales</p><p className="font-bold text-lg">Rs. {shiftSales.cash.toLocaleString()}</p></Card>
              <Card className="p-3"><p className="text-xs text-muted-foreground">Card/Online</p><p className="font-bold text-lg">Rs. {shiftSales.nonCash.toLocaleString()}</p></Card>
            </div>
            <Card className="p-3 border-primary/30 bg-primary/5">
              <p className="text-xs text-muted-foreground">Expected Cash in Drawer</p>
              <p className="font-bold text-xl text-primary">Rs. {((activeShift?.openingCash || 0) + shiftSales.cash).toLocaleString()}</p>
            </Card>
            <div>
              <Label>Actual Closing Cash (Rs.)</Label>
              <Input type="number" value={closingCashInput} onChange={e => setClosingCashInput(e.target.value)} placeholder="Count and enter cash" className="mt-1" min="0" />
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Input value={closingNotes} onChange={e => setClosingNotes(e.target.value)} placeholder="Any notes..." className="mt-1" />
            </div>
            {closingCashInput && (
              <div className={cn("p-2 rounded text-sm font-medium", Number(closingCashInput) - ((activeShift?.openingCash || 0) + shiftSales.cash) === 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
                Difference: Rs. {(Number(closingCashInput) - ((activeShift?.openingCash || 0) + shiftSales.cash)).toLocaleString()}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegisterClose(false)}>Continue Working</Button>
            <Button className="gradient-primary text-primary-foreground" disabled={!closingCashInput || !activeShift} onClick={async () => {
              if (!activeShift) return;
              try {
                await shiftService.closeShift(activeShift.id, {
                  closingCash:      Number(closingCashInput),
                  totalSales:       shiftSales.total,
                  totalCashSales:   shiftSales.cash,
                  totalCardSales:   shiftSales.card,
                  totalOnlineSales: shiftSales.online,
                  orderCount:       shiftSales.count,
                  cancelledOrders:  0,
                  totalExpenses:    0,
                  notes:            closingNotes,
                });
                toast.success("Register closed successfully");
                window.location.href = "/";
              } catch (err: any) {
                toast.error(err?.message || "Failed to close register");
              }
            }}>Close Register & Exit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Kitchen Notifications Sheet */}
      <Sheet open={showKitchenNotifications} onOpenChange={setShowKitchenNotifications}>
        <SheetContent side="right" className="w-full sm:w-[400px] lg:w-[480px] p-0">
          <div className="p-4 border-b bg-success/5">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Bell className="h-5 w-5 text-success" />
              Kitchen Notifications
            </h2>
            <p className="text-xs text-muted-foreground">{kitchenNotifications.length} order(s) ready from kitchen</p>
          </div>
          <div className="p-4 space-y-2.5 overflow-y-auto max-h-[calc(100vh-80px)]">
            {kitchenNotifications.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ChefHat className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No Kitchen Notifications</p>
                <p className="text-xs mt-1">Alerts from the kitchen will appear here when orders are ready</p>
              </div>
            ) : kitchenNotifications.map(order => (
              <Card key={order.id} className={cn(
                "p-3 text-xs border-l-4 border-l-success",
                order.isUrgent && "ring-2 ring-destructive/50 border-l-destructive"
              )}>
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">{order.orderNumber}</span>
                    {order.isUrgent && <Badge className="bg-destructive text-destructive-foreground text-[9px]"><Zap className="h-2.5 w-2.5 mr-0.5" />URGENT</Badge>}
                  </div>
                  <Badge className="bg-success/10 text-success text-[9px]">Ready</Badge>
                </div>
                <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                  <User className="h-3 w-3" />
                  <span className="font-medium text-foreground">{order.customer}</span>
                  {order.type === "Dine In" && order.tableNumber && (
                    <Badge variant="outline" className="text-[9px]">Table #{order.tableNumber}</Badge>
                  )}
                  <Badge variant="secondary" className="text-[9px]">{order.type}</Badge>
                </div>
                <div className="bg-muted/50 rounded-lg p-2 mb-2">
                  {order.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between py-0.5">
                      <span>{item.qty}x {item.name}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" className="h-7 text-xs flex-1 bg-success text-success-foreground hover:bg-success/90"
                    onClick={() => { handleOrderStatusUpdate(order.id, "completed"); toast.success(`Order ${order.orderNumber} completed`); }}>
                    <Check className="h-3 w-3 mr-1" />Complete & Serve
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Order Modification/Cancellation Dialog */}
      <Dialog open={!!showModifyOrder} onOpenChange={(open) => { if (!open) setShowModifyOrder(null); }}>
        <DialogContent className="max-w-md">
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
                    {modifyCancelAction === "cancel" && " Tax amount will not be refunded. The payment will not be returned."}
                  </div>
                )}
                <div>
                  <Label className="text-xs font-medium">Reason for {modifyCancelAction === "cancel" ? "Cancellation" : "Modification"} *</Label>
                  <Select value={modifyCancelReason} onValueChange={setModifyCancelReason}>
                    <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue placeholder="Select reason..." /></SelectTrigger>
                    <SelectContent>
                      {modifyCancelAction === "cancel" ? (
                        <>
                          <SelectItem value="Customer changed mind">Customer changed mind</SelectItem>
                          <SelectItem value="Wrong order entered">Wrong order entered</SelectItem>
                          <SelectItem value="Item not available">Item not available</SelectItem>
                          <SelectItem value="Kitchen mistake">Kitchen mistake</SelectItem>
                          <SelectItem value="Payment failed">Payment failed</SelectItem>
                          <SelectItem value="Duplicate order">Duplicate order</SelectItem>
                          <SelectItem value="Customer complaint">Customer complaint</SelectItem>
                          <SelectItem value="Other">Other (specify below)</SelectItem>
                        </>
                      ) : (
                        <>
                          <SelectItem value="Customer requested change">Customer requested change</SelectItem>
                          <SelectItem value="Wrong item added">Wrong item added</SelectItem>
                          <SelectItem value="Quantity change">Quantity change</SelectItem>
                          <SelectItem value="Add extra items">Add extra items</SelectItem>
                          <SelectItem value="Remove item">Remove item</SelectItem>
                          <SelectItem value="Change instructions">Change instructions</SelectItem>
                          <SelectItem value="Other">Other (specify below)</SelectItem>
                        </>
                      )}
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
            <Button variant="outline" onClick={() => { setShowModifyOrder(null); setModifyCancelReason(""); setModifyCancelCustomReason(""); }}>Cancel</Button>
            {modifyCancelAction === "cancel" ? (
              <Button variant="destructive" disabled={!modifyCancelReason || (modifyCancelReason === "Other" && !modifyCancelCustomReason.trim())} onClick={() => {
                if (!showModifyOrder) return;
                const finalReason = modifyCancelReason === "Other" ? modifyCancelCustomReason.trim() : modifyCancelReason;
                if (!finalReason) return;
                handleOrderStatusUpdate(showModifyOrder, "cancelled");
                toast.success("Order cancelled with audit record");
                setShowModifyOrder(null);
                setModifyCancelReason("");
                setModifyCancelCustomReason("");
              }}>
                <Ban className="h-4 w-4 mr-1" />Confirm Cancellation
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

import { useState, useMemo, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Flame, Search, ShoppingCart, Plus, Minus, Send, ChevronUp, Loader2,
  XCircle, CheckCircle2, Users, Phone, User, BellRing, Utensils, Sparkles,
  ArrowRight, X, Receipt, FileText, Ticket
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useVisiblePolling } from "@/hooks/use-visible-polling";
import { getSelfOrderSocket } from "@/lib/self-order-socket";
import { settingsService } from "@/services/settings.service";
import {
  selfOrderService,
  type SelfOrderTable,
  type SelfOrderMenu,
  type SelfOrderMenuItem,
  type SelfOrderStatus,
  type SelfOrderCouponPreview,
} from "@/services/self-order.service";

interface CartItem {
  id: string;
  menuItemId: string | null;
  variantId?: string | null;
  name: string;
  price: number;
  qty: number;
  variant?: string;
  modifiers?: string[];
  modifierIds?: string[];
}

const resolveModifiers = (item: SelfOrderMenuItem) => item.modifiers || [];

const formatPhoneNumber = (val: string): string => {
  const digitsOnly = val.replace(/\D/g, "").slice(0, 11);
  if (digitsOnly.length > 4) return `${digitsOnly.slice(0, 4)}-${digitsOnly.slice(4)}`;
  return digitsOnly;
};

const PRESET_INSTRUCTIONS = [
  "Less Spicy 🌶️",
  "Extra Spicy 🌶️🔥",
  "No Onions 🧅",
  "Extra Sauce 🥣",
  "Separate Packaging 📦",
  "Serve Hot 🔥",
];

interface PlacedOrder {
  orderId: string;
  items: CartItem[];
  status: SelfOrderStatus;
}

interface PersistedSession {
  entryDone: boolean;
  customerName: string;
  customerPhone: string;
  guestCount: number;
  cart: CartItem[];
  notes: string;
  orders: PlacedOrder[];
  viewingMenu: boolean;
  sessionToken: string | null;
  promotedGuestCount: number | null;
  sittingGeneration: string | null;
}

// Persisted sessions are keyed per BROWSER TAB, not just per table. Two tabs on the
// same device (e.g. testing "host" and "viewer" side by side, or a customer opening
// the link twice) share the same origin's localStorage — without a per-tab id, the
// second tab would silently read/overwrite the first tab's sessionToken and the two
// would collide into a single identity, corrupting the host/viewer split entirely
// (the second tab reconnects AS the host instead of becoming a distinct viewer, and
// its later writes can clobber the first tab's saved token too). sessionStorage is
// scoped per-tab by the browser (survives reloads of the same tab, never shared with
// a different tab/window), so a device id minted from it is a stable per-tab identity.
const DEVICE_ID_KEY = "ovenisto_self_order_device_id";

function resolveDeviceId(): string {
  try {
    let id = sessionStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    // sessionStorage can throw in private-browsing/quota-exceeded cases — fall back to
    // a per-load id; it just means this tab won't remember its session across a reload.
    return crypto.randomUUID();
  }
}

const deviceId = resolveDeviceId();

function sessionStorageKey(tableId: string): string {
  return `ovenisto_self_order_session_${tableId}_${deviceId}`;
}

function sessionEndedStorageKey(tableId: string): string {
  return `ovenisto_self_order_session_ended_${tableId}_${deviceId}`;
}

function loadPersistedSession(tableId: string): PersistedSession | null {
  try {
    const raw = localStorage.getItem(sessionStorageKey(tableId));
    return raw ? (JSON.parse(raw) as PersistedSession) : null;
  } catch {
    return null;
  }
}

function savePersistedSession(tableId: string, session: PersistedSession): void {
  try {
    localStorage.setItem(sessionStorageKey(tableId), JSON.stringify(session));
  } catch {
    // localStorage can throw in private-browsing/quota-exceeded cases
  }
}

function clearPersistedSession(tableId: string): void {
  try {
    localStorage.removeItem(sessionStorageKey(tableId));
  } catch {
    // no-op
  }
}

const SelfOrder = () => {
  const [searchParams] = useSearchParams();
  const tableId = searchParams.get("tableId");

  // ── Table resolution ──
  const [table, setTable] = useState<SelfOrderTable | null>(null);
  const [tableError, setTableError] = useState<string | null>(null);
  const [tableLoading, setTableLoading] = useState(true);

  // ── Live settings ──
  const [currency, setCurrency] = useState("Rs.");
  const [taxRate, setTaxRate] = useState(0);
  const [taxName, setTaxName] = useState("GST");
  const [restaurantName, setRestaurantName] = useState("");

  // ── Live menu ──
  const [menu, setMenu] = useState<SelfOrderMenu | null>(null);
  const [menuLoading, setMenuLoading] = useState(true);

  // ── Entry gate ──
  const [entryDone, setEntryDone] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [guestCount, setGuestCount] = useState(2);
  const [nameConflict, setNameConflict] = useState<{ savedName: string; typedName: string } | null>(null);
  const [checkingCustomer, setCheckingCustomer] = useState(false);

  // ── Menu browsing / cart ──
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<{ id: string; name: string; price: number } | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);
  const [placing, setPlacing] = useState(false);

  // ── Placed orders for this table sitting ──
  const [orders, setOrders] = useState<PlacedOrder[]>([]);
  const [viewingMenu, setViewingMenu] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [role, setRole] = useState<"host" | "viewer" | null>(null);
  const [joined, setJoined] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [requestPending, setRequestPending] = useState(false);
  const [requestTimedOut, setRequestTimedOut] = useState(false);
  const [incomingHostRequest, setIncomingHostRequest] = useState(false);
  const [promotedGuestCount, setPromotedGuestCount] = useState<number | null>(null);
  const [sittingGeneration, setSittingGeneration] = useState<string | null>(null);

  useEffect(() => {
    if (!tableId) { setTableError("No table specified — please scan the QR code on your table."); setTableLoading(false); return; }
    selfOrderService.getTable(tableId)
      .then(setTable)
      .catch(() => setTableError("This table could not be found. Please ask staff for help."))
      .finally(() => setTableLoading(false));
  }, [tableId]);

  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!table || hydrated) return;
    try {
      if (sessionStorage.getItem(sessionEndedStorageKey(table.tableId)) === "true") {
        setSessionEnded(true);
        setJoined(true);
      }
    } catch {}
    const persisted = loadPersistedSession(table.tableId);
    if (persisted) {
      setEntryDone(persisted.entryDone);
      setCustomerName(persisted.customerName);
      setCustomerPhone(persisted.customerPhone);
      setGuestCount(persisted.guestCount);
      setCart(persisted.cart);
      setNotes(persisted.notes);
      setOrders(persisted.orders ?? []);
      setViewingMenu(persisted.viewingMenu ?? false);
      setSessionToken(persisted.sessionToken);
      setPromotedGuestCount(persisted.promotedGuestCount ?? null);
      setSittingGeneration(persisted.sittingGeneration ?? null);
    }
    setHydrated(true);
  }, [table, hydrated]);

  useEffect(() => {
    if (!table || !hydrated) return;
    savePersistedSession(table.tableId, {
      entryDone, customerName, customerPhone, guestCount, cart, notes,
      orders, viewingMenu, sessionToken, promotedGuestCount, sittingGeneration,
    });
  }, [table, hydrated, entryDone, customerName, customerPhone, guestCount, cart, notes, orders, viewingMenu, sessionToken, promotedGuestCount, sittingGeneration]);

  // Fetches orders already placed at this table this sitting and merges them
  // into local state, keyed by orderId (existing local entries keep their
  // position; a fetched order this device didn't already know about is
  // appended). Needed because a promoted device is a genuinely separate
  // device with its own empty localStorage for this table — without this,
  // it would show an empty order list / Rs. 0 bill for a table that already
  // has real orders. Best-effort: a failed fetch just leaves local state as-is.
  const reconcileActiveOrders = useCallback(async (tableId: string) => {
    try {
      const active = await selfOrderService.getActiveOrders(tableId);
      setOrders((prev) => {
        const byId = new Map(prev.map((o) => [o.orderId, o]));
        active.forEach((a) => byId.set(a.orderId, a));
        return Array.from(byId.values());
      });
    } catch {
      // best-effort reconciliation; local state (if any) still stands
    }
  }, []);

  // ── Join this table's socket room ──
  useEffect(() => {
    if (!table || !hydrated || sessionEnded) return;
    const socket = getSelfOrderSocket();

    const joinTable = () => {
      socket.emit(
        "join-table",
        { tableId: table.tableId, sessionToken: sessionToken ?? undefined },
        (
          res:
            | { role: "host"; sessionToken: string; sittingGeneration: string }
            | { role: "viewer"; sittingGeneration: string }
            | { role: "blocked"; reason: "table-occupied" }
            | { role: "ended" }
            | { error: string }
        ) => {
          setJoined(true);
          if ("error" in res) return;
          if (res.role === "ended") {
            setSessionEnded(true);
            return;
          }
          if (res.role === "blocked") {
            setBlocked(true);
            return;
          }
          // A different sittingGeneration than what this device last saw means
          // the server has no memory of this device's old sitting (cleared on
          // End Sitting, or invalidated by a new sitting starting at this
          // table) — its persisted data (name/cart/orders) belongs to a
          // sitting that's no longer live, whether this device ends up host OR
          // viewer this time. A first-ever visit also lands here
          // (sittingGeneration starts null) but there is nothing stale to
          // reset in that case.
          const isStaleReturningDevice = sittingGeneration !== null && sittingGeneration !== res.sittingGeneration;
          if (isStaleReturningDevice) {
            setEntryDone(false);
            setCustomerName("");
            setCustomerPhone("");
            setGuestCount(2);
            setCart([]);
            setNotes("");
            setOrders([]);
            setViewingMenu(false);
            setPromotedGuestCount(null);
          }
          setSittingGeneration(res.sittingGeneration);
          setRole(res.role);
          if (res.role === "host") {
            setSessionToken(res.sessionToken);
            reconcileActiveOrders(table.tableId);
          }
        }
      );
    };

    joinTable();

    socket.on("connect", joinTable);

    const onOrderUpdated = (payload: SelfOrderStatus) => {
      setOrders((prev) => prev.map((o) => (o.orderId === payload.orderId ? { ...o, status: payload } : o)));
    };
    const onSessionEnded = () => setSessionEnded(true);
    const onHostRequest = () => setIncomingHostRequest(true);
    const onHostRequestDeclined = () => {
      setRequestPending(false);
      toast.error("Request declined");
    };
    const onRoleChanged = (
      payload:
        | { role: "host"; sessionToken: string; guestCount?: number | null; sittingGeneration: string }
        | { role: "viewer"; sittingGeneration: string }
    ) => {
      // A takeover handoff is always within the SAME sitting (the server never
      // changes sittingGeneration for this event) — just keep the locally
      // stored value in sync, never reset local data here. A promoted device
      // must keep whatever orders it already placed earlier in this sitting.
      setSittingGeneration(payload.sittingGeneration);
      setRole(payload.role);
      if (payload.role === "host") {
        setSessionToken(payload.sessionToken);
        setRequestPending(false);
        setRequestTimedOut(false);
        if (payload.guestCount != null) {
          setPromotedGuestCount(payload.guestCount);
          setGuestCount(payload.guestCount);
        }
        reconcileActiveOrders(table.tableId);
      }
    };

    socket.on("order:updated", onOrderUpdated);
    socket.on("session:ended", onSessionEnded);
    socket.on("host-request", onHostRequest);
    socket.on("host-request:declined", onHostRequestDeclined);
    socket.on("role:changed", onRoleChanged);

    return () => {
      socket.off("connect", joinTable);
      socket.off("order:updated", onOrderUpdated);
      socket.off("session:ended", onSessionEnded);
      socket.off("host-request", onHostRequest);
      socket.off("host-request:declined", onHostRequestDeclined);
      socket.off("role:changed", onRoleChanged);
    };
  }, [table, hydrated, sessionEnded, sessionToken, sittingGeneration, reconcileActiveOrders]);

  useEffect(() => {
    if (!sessionEnded || !table) return;
    clearPersistedSession(table.tableId);
    try {
      sessionStorage.setItem(sessionEndedStorageKey(table.tableId), "true");
    } catch {}
  }, [sessionEnded, table]);

  // Safety net: don't hold the customer on a spinner forever if the socket
  // can't connect (e.g. a network that blocks websockets) — degrade to the
  // pre-existing behavior (proceed without the occupied-table check) rather
  // than hard-blocking someone who could otherwise still browse and order.
  useEffect(() => {
    if (!table || !hydrated || joined) return;
    const timeout = setTimeout(() => setJoined(true), 5000);
    return () => clearTimeout(timeout);
  }, [table, hydrated, joined]);

  useEffect(() => {
    settingsService.getSettings().then((s) => {
      setCurrency(s.currency || "Rs.");
      setTaxRate(Number(s.taxRate ?? 0));
      setTaxName(s.taxName || "GST");
      setRestaurantName(s.restaurantName || "");
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!entryDone) return;
    setMenuLoading(true);
    selfOrderService.getMenu()
      .then(setMenu)
      .catch(() => toast.error("Could not load the menu. Please try refreshing."))
      .finally(() => setMenuLoading(false));
  }, [entryDone]);

  // ── Poll every non-terminal order's status ──
  const pollStatus = useCallback(() => {
    orders
      .filter((o) => o.status.status !== "cancelled" && !o.status.paid)
      .forEach((o) => {
        selfOrderService.getStatus(o.orderId).then((status) => {
          setOrders((prev) => prev.map((p) => (p.orderId === o.orderId ? { ...p, status } : p)));
        }).catch(() => {});
      });
  }, [orders]);
  const hasActiveOrder = orders.some((o) => o.status.status !== "cancelled" && !o.status.paid);
  useVisiblePolling(pollStatus, 4000, hasActiveOrder);

  const availableItems = useMemo(() => menu?.items ?? [], [menu]);
  const categories = useMemo(() => ["All", ...(menu?.categories.map((c) => c.name) ?? [])], [menu]);
  const filtered = useMemo(() => {
    let items = availableItems;
    if (catFilter !== "All") items = items.filter((i) => i.category?.name === catFilter);
    if (search) items = items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));
    return items;
  }, [availableItems, catFilter, search]);

  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  // ── Coupon / Minimum Spend ──
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<SelfOrderCouponPreview | null>(null);
  const [manualCouponApplied, setManualCouponApplied] = useState(false);
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  // Silently checks for an auto-applying Minimum Spend deal whenever the cart
  // total changes — the customer never has to know it exists, it just
  // discounts the total once they've added enough to qualify. A manually
  // entered Promo Code takes priority and pauses this check.
  useEffect(() => {
    if (manualCouponApplied || !table) return;
    if (cartTotal <= 0) {
      setAppliedCoupon(null);
      return;
    }
    let cancelled = false;
    selfOrderService
      .validateCoupon({ tableId: table.tableId, subtotal: cartTotal })
      .then((result) => { if (!cancelled) setAppliedCoupon(result); })
      .catch(() => { if (!cancelled) setAppliedCoupon(null); });
    return () => { cancelled = true; };
  }, [cartTotal, table, manualCouponApplied]);

  const applyCoupon = async () => {
    if (!couponInput.trim() || !table) return;
    setCheckingCoupon(true);
    setCouponError(null);
    try {
      const result = await selfOrderService.validateCoupon({
        tableId: table.tableId,
        code: couponInput.trim(),
        subtotal: cartTotal,
      });
      setAppliedCoupon(result);
      setManualCouponApplied(true);
    } catch (err) {
      setCouponError(err instanceof Error ? err.message : "Invalid coupon code");
    } finally {
      setCheckingCoupon(false);
    }
  };

  const removeCoupon = () => {
    setManualCouponApplied(false);
    setCouponInput("");
    setCouponError(null);
    setAppliedCoupon(null);
  };

  const discountAmount = appliedCoupon?.amount ?? 0;
  const taxableTotal = Math.max(0, cartTotal - discountAmount);
  const tax = Math.round(taxableTotal * (taxRate / 100));
  const grandTotal = taxableTotal + tax;

  // ── Sitting Bill Calculations ──
  const nonDeclinedOrders = useMemo(
    () => orders.filter((o) => o.status.status !== "cancelled"),
    [orders]
  );
  const sittingSubtotal = useMemo(
    () =>
      nonDeclinedOrders.reduce(
        (sum, o) => sum + o.items.reduce((iSum, item) => iSum + item.price * item.qty, 0),
        0
      ),
    [nonDeclinedOrders]
  );
  const sittingTax = useMemo(
    () => Math.round(sittingSubtotal * (taxRate / 100)),
    [sittingSubtotal, taxRate]
  );
  const sittingGrandTotal = sittingSubtotal + sittingTax;
  const isSittingFullyPaid =
    orders.length > 0 && orders.every((o) => o.status.paid || o.status.status === "cancelled");

  // ── Cart helpers ──

  const addToCart = (item: SelfOrderMenuItem) => {
    const hasVariants = item.variants.length > 0;
    const hasModifiers = resolveModifiers(item).length > 0;

    if (!hasVariants && !hasModifiers) {
      setCart((prev) => {
        const existing = prev.find((c) => c.id === item.id);
        if (existing) return prev.map((c) => (c === existing ? { ...c, qty: c.qty + 1 } : c));
        return [...prev, { id: item.id, menuItemId: item.id, name: item.name, price: item.price, qty: 1 }];
      });
      toast.success(`${item.name} added`);
      return;
    }

    if (expandedItemId === item.id) {
      setExpandedItemId(null);
      setSelectedVariant(null);
      setSelectedModifiers([]);
    } else {
      setExpandedItemId(item.id);
      setSelectedVariant(null);
      setSelectedModifiers([]);
    }
  };

  const confirmAddWithOptions = (item: SelfOrderMenuItem) => {
    const hasVariants = item.variants.length > 0;
    if (hasVariants && !selectedVariant) { toast.error("Please select a size"); return; }

    const basePrice = selectedVariant ? selectedVariant.price : item.price;
    const itemModifiers = resolveModifiers(item);
    const modsCost = selectedModifiers.reduce((sum, mId) => sum + (itemModifiers.find((m) => m.id === mId)?.price ?? 0), 0);
    const totalPrice = basePrice + modsCost;
    const variantName = selectedVariant?.name;
    const modNames = selectedModifiers.map((mId) => itemModifiers.find((m) => m.id === mId)?.name ?? "").filter(Boolean);
    const cartKey = `${item.id}-${variantName ?? "base"}-${selectedModifiers.sort().join("-")}`;

    setCart((prev) => {
      const existing = prev.find((c) => c.id === cartKey);
      if (existing) return prev.map((c) => (c.id === cartKey ? { ...c, qty: c.qty + 1 } : c));
      return [...prev, {
        id: cartKey,
        menuItemId: item.id,
        variantId: selectedVariant?.id ?? null,
        name: variantName ? `${item.name} (${variantName})` : item.name,
        price: totalPrice,
        qty: 1,
        variant: variantName,
        modifiers: modNames,
        modifierIds: selectedModifiers,
      }];
    });

    toast.success(`${item.name}${variantName ? ` (${variantName})` : ""} added`);
    setExpandedItemId(null);
    setSelectedVariant(null);
    setSelectedModifiers([]);
  };

  const updateQty = (id: string, delta: number) => {
    setCart((prev) => prev.map((c) => (c.id === id ? { ...c, qty: Math.max(0, c.qty + delta) } : c)).filter((c) => c.qty > 0));
  };

  const togglePresetNote = (preset: string) => {
    if (!notes) {
      setNotes(preset);
      return;
    }
    if (notes.includes(preset)) {
      const updated = notes
        .split(",")
        .map((n) => n.trim())
        .filter((n) => n !== preset)
        .join(", ");
      setNotes(updated);
    } else {
      setNotes(`${notes}, ${preset}`);
    }
  };

  // ── Entry gate ──

  const handleContinueToMenu = async () => {
    setCheckingCustomer(true);
    try {
      const result = await selfOrderService.lookupCustomerByPhone(customerPhone);
      if (result.exists && result.name && result.name.trim() !== customerName.trim()) {
        setNameConflict({ savedName: result.name, typedName: customerName.trim() });
        return;
      }
    } catch {
      // Proceed on lookup fail
    } finally {
      setCheckingCustomer(false);
    }
    if (role === "host" && promotedGuestCount === null) getSelfOrderSocket().emit("update-guest-count", { guestCount });
    setEntryDone(true);
  };

  const resolveNameConflict = (useSavedName: boolean) => {
    if (nameConflict && useSavedName) setCustomerName(nameConflict.savedName);
    setNameConflict(null);
    if (role === "host" && promotedGuestCount === null) getSelfOrderSocket().emit("update-guest-count", { guestCount });
    setEntryDone(true);
  };

  // ── Place order ──

  const placeOrder = async () => {
    if (cart.length === 0 || !table || placing) return;
    setPlacing(true);
    try {
      const { orderId } = await selfOrderService.createOrder({
        tableId: table.tableId,
        customerName,
        customerPhone,
        guestCount,
        subtotal: cartTotal,
        tax,
        total: grandTotal,
        specialInstructions: notes || undefined,
        dealCode: appliedCoupon?.code ?? undefined,
        items: cart.map((i) => ({ menuItemId: i.menuItemId, variantId: i.variantId, name: i.name, price: i.price, qty: i.qty, modifierIds: i.modifierIds })),
      });
      setOrders((prev) => [...prev, { orderId, items: cart, status: { orderId, status: "pending", accepted: false, paid: false } }]);
      setCart([]);
      setCartOpen(false);
      setViewingMenu(false);
      removeCoupon();
    } catch {
      toast.error("Failed to place order. Please try again.");
    } finally {
      setPlacing(false);
    }
  };

  // ── Takeover ──

  const requestTakeover = () => {
    const socket = getSelfOrderSocket();
    setRequestPending(true);
    setRequestTimedOut(false);
    socket.emit("request-host", {}, (res: { sent: true } | { error: string }) => {
      if ("error" in res) {
        setRequestPending(false);
        toast.error(res.error);
        return;
      }
      setTimeout(() => {
        setRequestPending((stillPending) => {
          if (stillPending) setRequestTimedOut(true);
          return stillPending;
        });
      }, 60000);
    });
  };

  const respondToHostRequest = (approve: boolean) => {
    const socket = getSelfOrderSocket();
    socket.emit("respond-host-request", { approve });
    setIncomingHostRequest(false);
  };

  const callWaiter = () => {
    getSelfOrderSocket().emit("call-waiter", {});
    toast.success("A staff member has been notified");
  };

  // ── Render: table resolution error ──
  if (tableError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-3 max-w-sm">
          <XCircle className="h-12 w-12 mx-auto text-destructive" />
          <p className="font-semibold">{tableError}</p>
        </div>
      </div>
    );
  }
  if (tableLoading || !joined) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ── Render: table already occupied by a staff-seated (non-self-order) sitting ──
  if (blocked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <XCircle className="h-12 w-12 mx-auto text-muted-foreground" />
          <h1 className="text-xl font-bold">This table is already occupied</h1>
          <p className="text-muted-foreground">
            Our staff is already serving this table. Please ask a team member for assistance.
          </p>
          <Button
            variant="outline"
            className="w-full h-11 rounded-xl"
            onClick={() => window.location.reload()}
          >
            Check Again
          </Button>
        </div>
      </div>
    );
  }

  // ── Render: staff ended the sitting ──
  if (sessionEnded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <CheckCircle2 className="h-16 w-16 mx-auto text-success" />
          <h1 className="text-2xl font-bold">Thanks for dining with us!</h1>
          <p className="text-muted-foreground">We hope to see you again soon.</p>
        </div>
      </div>
    );
  }

  // ── Render: incoming takeover request ──
  if (incomingHostRequest) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <Users className="h-12 w-12 mx-auto text-primary animate-pulse" />
          <h1 className="text-xl font-bold">Someone else wants to take over this table's session</h1>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => respondToHostRequest(false)}>Deny</Button>
            <Button className="flex-1 rounded-xl gradient-primary text-primary-foreground font-bold" onClick={() => respondToHostRequest(true)}>Approve</Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: viewer screen — reached whenever role is "viewer", regardless
  //    of orders.length. A device that was host and placed orders before
  //    being demoted (another device took over) must still lose the ability
  //    to place MORE once demoted — it must never fall through to the
  //    order-list screen below (whose "Add More Items" button reaches the
  //    menu) or the menu itself, both of which are unconditional on role. ──
  if (role === "viewer") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <Users className="h-16 w-16 mx-auto text-muted-foreground" />
          <h1 className="text-2xl font-bold">
            {orders.length > 0 ? "Someone else is now managing this table" : "This table already has an active order"}
          </h1>
          <p className="text-muted-foreground">
            {orders.length > 0
              ? `You placed ${orders.length} order${orders.length === 1 ? "" : "s"} earlier this visit. Another device is now hosting — ask them to add more items, or request to take over again below.`
              : "Someone else at this table is already placing an order."}
          </p>
          {requestPending ? (
            requestTimedOut ? (
              <>
                <p className="text-sm text-muted-foreground">No response yet.</p>
                <Button className="w-full h-12 rounded-xl gradient-primary text-primary-foreground font-semibold" onClick={requestTakeover}>
                  Try Again
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Waiting for a response…</p>
            )
          ) : (
            <Button className="w-full h-12 rounded-xl gradient-primary text-primary-foreground font-semibold" onClick={requestTakeover}>
              Request to Take Over
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ── Render: order list ──
  if (orders.length > 0 && !viewingMenu) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-30 bg-card/90 backdrop-blur-md border-b border-border/80 px-4 py-3 shadow-xs">
          <div className="max-w-lg mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center text-primary-foreground shadow-xs">
                <Flame className="h-4 w-4" />
              </div>
              <div>
                <h1 className="font-bold text-foreground text-sm leading-tight">
                  {restaurantName || "Your Orders"}
                </h1>
                <p className="text-[11px] text-muted-foreground">
                  Table {table?.tableNumber}{table?.floor ? ` · ${table.floor}` : ""}
                </p>
              </div>
            </div>

            <button
              onClick={callWaiter}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-secondary text-secondary-foreground hover:bg-primary/10 hover:text-primary transition-all border border-border/50"
            >
              <BellRing className="h-3.5 w-3.5 text-primary" />
              <span>Call Waiter</span>
            </button>
          </div>
        </div>

        {/* Orders List & Bill Summary */}
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4 max-w-lg mx-auto w-full pb-10">
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Active Table Orders ({orders.length})
            </h2>
            {orders.map((o, idx) => {
              const declined = o.status.status === "cancelled";
              const paid = o.status.paid;
              const confirmed = o.status.accepted && !declined && !paid;
              const isPending = !o.status.accepted && !declined && !paid;

              return (
                <div key={o.orderId} className="bg-card rounded-2xl border border-border/80 shadow-md p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Order #{idx + 1}
                    </span>

                    <div
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold border",
                        declined && "bg-destructive/10 text-destructive border-destructive/20",
                        paid && "bg-success/10 text-success border-success/20",
                        confirmed && "bg-success/15 text-success border-success/30 animate-pulse",
                        isPending && "bg-warning/15 text-warning-foreground border-warning/30"
                      )}
                    >
                      {declined ? (
                        <XCircle className="h-3.5 w-3.5" />
                      ) : paid || confirmed ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      )}
                      <span>
                        {declined
                          ? "Order Declined"
                          : paid
                          ? "Bill Settled"
                          : confirmed
                          ? "Order Confirmed & Preparing"
                          : "Waiting for Kitchen Confirmation"}
                      </span>
                    </div>
                  </div>

                  {declined && (
                    <div className="p-2.5 rounded-xl bg-destructive/10 text-destructive text-xs font-medium">
                      {o.status.rejectionReason || "The restaurant could not confirm this order at this time."}
                    </div>
                  )}

                  <div className="space-y-1.5 pt-2 border-t border-border/60">
                    {o.items.map((item) => (
                      <div key={item.id} className="flex justify-between text-xs font-medium">
                        <span className="text-foreground">
                          <span className="font-bold text-primary mr-1">{item.qty}x</span> {item.name}
                        </span>
                        <span className="text-muted-foreground">
                          {currency} {(item.price * item.qty).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sitting Bill Summary Card */}
          <div className="bg-card rounded-2xl border border-primary/30 p-4 space-y-3.5 shadow-xl bg-gradient-to-b from-card to-primary/5">
            <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Receipt className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground text-sm">Sitting Bill Summary</h3>
                  <p className="text-[10px] text-muted-foreground">Cumulative totals for Table {table?.tableNumber}</p>
                </div>
              </div>

              <span
                className={cn(
                  "text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border",
                  isSittingFullyPaid
                    ? "bg-success/15 text-success border-success/30"
                    : "bg-warning/15 text-warning-foreground border-warning/30"
                )}
              >
                {isSittingFullyPaid ? "✔ Bill Settled" : "💳 Pay at Counter / Server"}
              </span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal ({nonDeclinedOrders.length} {nonDeclinedOrders.length === 1 ? "Order" : "Orders"})</span>
                <span>{currency} {sittingSubtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>{taxName} ({taxRate}%)</span>
                <span>{currency} {sittingTax.toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-extrabold text-base pt-2 border-t border-border/60 text-foreground">
                <span>Total Bill Amount</span>
                <span className="text-primary">{currency} {sittingGrandTotal.toLocaleString()}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button
                variant="outline"
                className="h-11 rounded-xl border-primary/40 text-foreground font-bold text-xs hover:bg-primary/10"
                onClick={() => setShowReceipt(true)}
              >
                <FileText className="h-4 w-4 mr-1.5 text-primary" /> View Receipt
              </Button>
              <Button
                className="h-11 rounded-xl gradient-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20"
                onClick={() => setViewingMenu(true)}
              >
                <Plus className="h-4 w-4 mr-1.5" /> Add More Items
              </Button>
            </div>
          </div>
        </div>

        {/* Detailed Thermal Receipt Sheet */}
        <Sheet open={showReceipt} onOpenChange={setShowReceipt}>
          <SheetContent side="bottom" className="max-h-[90vh] rounded-t-3xl border-t border-border bg-card p-0 shadow-2xl overflow-hidden flex flex-col max-w-lg mx-auto">
            <div className="pt-3 pb-2 px-5 border-b border-border/60 bg-muted/10 shrink-0">
              <div className="w-10 h-1 bg-muted-foreground/30 rounded-full mx-auto mb-3" />
              <div className="flex items-center justify-between">
                <SheetTitle className="text-base font-bold flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-primary" /> Detailed Table Statement
                </SheetTitle>
                <button
                  onClick={() => setShowReceipt(false)}
                  className="text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {/* Receipt Paper Card */}
              <div className="bg-card border border-dashed border-border rounded-2xl p-5 shadow-inner space-y-4 font-mono text-xs text-foreground">
                <div className="text-center space-y-1 pb-3 border-b border-dashed border-border/80">
                  <Flame className="h-7 w-7 mx-auto text-primary" />
                  <h2 className="font-bold text-base tracking-wider uppercase">
                    {restaurantName || "OVENISTO RESTAURANT"}
                  </h2>
                  <p className="text-[10px] text-muted-foreground">Digital Dining Statement</p>
                  <div className="flex justify-center gap-2 pt-1 text-[11px] font-sans font-semibold">
                    <span className="px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                      Table {table?.tableNumber}
                    </span>
                    {table?.floor && (
                      <span className="px-2 py-0.5 rounded bg-muted text-muted-foreground">
                        {table.floor}
                      </span>
                    )}
                  </div>
                </div>

                {/* Customer Details */}
                <div className="space-y-1 text-[11px] text-muted-foreground font-sans">
                  <div className="flex justify-between">
                    <span>Customer:</span>
                    <span className="font-bold text-foreground">{customerName || "Dine-in Guest"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Phone:</span>
                    <span className="font-bold text-foreground">{customerPhone || "N/A"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Guests (Pax):</span>
                    <span className="font-bold text-foreground">{guestCount}</span>
                  </div>
                </div>

                <div className="border-b border-dashed border-border/80" />

                {/* Itemized breakdown per order */}
                <div className="space-y-3">
                  {nonDeclinedOrders.map((ord, oIdx) => (
                    <div key={ord.orderId} className="space-y-1.5">
                      <div className="flex justify-between text-[10px] font-sans font-bold text-primary uppercase">
                        <span>--- Order #{oIdx + 1} ---</span>
                        <span>{ord.status.paid ? "PAID" : ord.status.accepted ? "CONFIRMED" : "PENDING"}</span>
                      </div>
                      {ord.items.map((it) => (
                        <div key={it.id} className="flex justify-between items-start">
                          <span className="pr-2">
                            {it.qty}x {it.name}
                            {it.modifiers && it.modifiers.length > 0 && (
                              <span className="block text-[10px] text-muted-foreground font-sans">
                                + {it.modifiers.join(", ")}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 font-bold">
                            {currency} {(it.price * it.qty).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                <div className="border-b border-dashed border-border/80" />

                {/* Receipt Totals */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between">
                    <span>SUBTOTAL</span>
                    <span>{currency} {sittingSubtotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{taxName} ({taxRate}%)</span>
                    <span>{currency} {sittingTax.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-extrabold text-sm pt-2 border-t border-dashed border-border/80 text-foreground">
                    <span>GRAND TOTAL</span>
                    <span className="text-primary">{currency} {sittingGrandTotal.toLocaleString()}</span>
                  </div>
                </div>

                <div className="border-b border-dashed border-border/80" />

                {/* Footer Notice */}
                <div className="text-center space-y-1 text-[10px] text-muted-foreground font-sans pt-1">
                  <p className="font-semibold text-foreground">
                    {isSittingFullyPaid ? "✔ Thank you for your payment!" : "💳 Please present this bill at the counter or to your server."}
                  </p>
                  <p>Thank you for dining with us! 🔥</p>
                </div>
              </div>

              <Button
                className="w-full h-11 rounded-xl mt-4 gradient-primary text-primary-foreground font-bold text-xs shadow-md"
                onClick={() => setShowReceipt(false)}
              >
                Close Receipt
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  // ── Render: entry gate ──
  if (!entryDone) {
    const cleanPhone = customerPhone.replace(/\D/g, "");
    const isPromoted = promotedGuestCount !== null;
    const canContinue = customerName.trim().length > 0 && cleanPhone.length === 11 && (isPromoted || guestCount >= 1);
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="h-16 w-16 mx-auto rounded-2xl gradient-primary flex items-center justify-center text-primary-foreground shadow-xl shadow-primary/30 animate-pulse">
              <Flame className="h-9 w-9" />
            </div>
            <div>
              <h1 className="font-extrabold text-2xl text-foreground tracking-tight">
                {restaurantName || "Welcome"}
              </h1>
              <div className="inline-flex items-center gap-1.5 mt-1 px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-bold">
                <span>Table {table?.tableNumber}</span>
                {table?.floor && <span>· {table.floor}</span>}
              </div>
            </div>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Scan complete! Enter your name & phone to explore the digital menu.
            </p>
          </div>

          <div className="bg-card rounded-2xl border border-border/80 p-5 shadow-xl space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-1.5">
                <User className="h-3.5 w-3.5 text-primary" /> Your Full Name *
              </label>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Ali Khan"
                className="h-11 rounded-xl bg-muted/30 border-border/80 focus-visible:ring-primary text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-1.5">
                <Phone className="h-3.5 w-3.5 text-primary" /> Phone (11 Digits) *
              </label>
              <Input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(formatPhoneNumber(e.target.value))}
                placeholder="0300-1234567"
                className="h-11 rounded-xl bg-muted/30 border-border/80 focus-visible:ring-primary text-sm"
              />
            </div>

            {!isPromoted && (
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-1.5">
                  <Users className="h-3.5 w-3.5 text-primary" /> Number of Guests (Pax) *
                </label>
                <div className="flex items-center justify-between bg-muted/30 border border-border/80 rounded-xl p-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 rounded-lg"
                    onClick={() => setGuestCount((g) => Math.max(1, g - 1))}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="font-extrabold text-lg text-foreground w-12 text-center">
                    {guestCount}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 rounded-lg"
                    onClick={() => setGuestCount((g) => Math.min(50, g + 1))}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            <Button
              className="w-full h-12 rounded-xl gradient-primary text-primary-foreground font-bold text-sm shadow-lg shadow-primary/25 active:scale-[0.99] transition-all"
              disabled={!canContinue || checkingCustomer}
              onClick={handleContinueToMenu}
            >
              {checkingCustomer ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4 mr-2" />
              )}
              Explore Menu & Order
            </Button>
          </div>

          {nameConflict && (
            <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-card rounded-2xl p-5 max-w-xs w-full space-y-4 text-center border border-border shadow-2xl animate-login-card">
                <p className="text-xs text-muted-foreground">
                  We found a profile for this number registered as <span className="font-bold text-foreground">{nameConflict.savedName}</span>. Use saved name or update to <span className="font-bold text-foreground">{nameConflict.typedName}</span>?
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 rounded-xl text-xs" onClick={() => resolveNameConflict(false)}>
                    Use "{nameConflict.typedName}"
                  </Button>
                  <Button className="flex-1 rounded-xl gradient-primary text-primary-foreground text-xs font-bold" onClick={() => resolveNameConflict(true)}>
                    Keep "{nameConflict.savedName}"
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Render: main menu UI ──
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Sticky Header Bar */}
      <div className="sticky top-0 z-30 bg-card/90 backdrop-blur-md border-b border-border/80 px-4 py-2.5 shadow-sm transition-all">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-9 w-9 rounded-xl gradient-primary flex items-center justify-center text-primary-foreground shadow-md shadow-primary/25 shrink-0">
              <Flame className="h-5 w-5 animate-pulse" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-foreground text-base leading-tight truncate">
                {restaurantName || "Ovenisto"}
              </h1>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-primary/10 text-primary font-medium border border-primary/20">
                  Table {table?.tableNumber}
                </span>
                {table?.floor && <span>· {table.floor}</span>}
                <span>· {guestCount} {guestCount === 1 ? "Guest" : "Guests"}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={callWaiter}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold bg-secondary/80 text-secondary-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 border border-transparent transition-all shadow-xs active:scale-95"
              title="Notify staff"
            >
              <BellRing className="h-3.5 w-3.5 text-primary animate-bounce" />
              <span className="hidden sm:inline">Call Waiter</span>
            </button>

            {orders.length > 0 && (
              <button
                onClick={() => setViewingMenu(false)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all shadow-xs active:scale-95",
                  !viewingMenu
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                    : "bg-muted text-foreground hover:bg-muted/80 border border-border"
                )}
              >
                <Utensils className="h-3.5 w-3.5" />
                <span>My Orders ({orders.length})</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Sticky Search & Category Bar */}
      <div className="bg-card/60 backdrop-blur-xs border-b border-border/60 sticky top-[57px] z-20 space-y-2 py-2 px-4 shadow-xs">
        <div className="max-w-lg mx-auto">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search dishes, burgers, drinks..."
              className="pl-9 pr-8 h-10 rounded-xl bg-muted/50 border-border/80 focus-visible:ring-primary text-sm shadow-inner"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex gap-2 overflow-x-auto scrollbar-none pt-2 pb-1 -mx-4 px-4 items-center">
            {categories.map((c) => {
              const isActive = catFilter === c;
              return (
                <button
                  key={c}
                  onClick={() => setCatFilter(c)}
                  className={cn(
                    "shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 border",
                    isActive
                      ? "gradient-primary text-primary-foreground border-transparent shadow-md shadow-primary/25 scale-[1.02]"
                      : "bg-card border-border/80 text-muted-foreground hover:text-foreground hover:border-primary/40"
                  )}
                >
                  <span>{c}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Menu Items Container */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-28">
        <div className="max-w-lg mx-auto space-y-3">
          {menuLoading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-xs font-medium">Preparing fresh menu...</p>
            </div>
          ) : (
            <>
              {filtered.map((item) => {
                const inCart = cart.find((c) => c.id === item.id || c.id.startsWith(`${item.id}-`));
                const isExpanded = expandedItemId === item.id;
                const hasVariants = item.variants.length > 0;
                const itemModifiers = resolveModifiers(item);
                const hasModifiers = itemModifiers.length > 0;

                return (
                  <div
                    key={item.id}
                    className={cn(
                      "bg-card rounded-2xl border transition-all duration-200 overflow-hidden shadow-xs hover:shadow-md",
                      isExpanded ? "border-primary/50 ring-1 ring-primary/20" : "border-border/80 hover:border-border"
                    )}
                  >
                    <div className="p-3 flex items-start gap-3">
                      {/* Food Item Image / Thumbnail Placeholder */}
                      <div className="relative h-20 w-20 sm:h-22 sm:w-22 rounded-xl overflow-hidden bg-muted/50 shrink-0 border border-border/50 flex items-center justify-center">
                        {item.image ? (
                          <img
                            src={item.image}
                            alt={item.name}
                            className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="h-full w-full bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center text-primary/60">
                            <Utensils className="h-7 w-7" />
                          </div>
                        )}
                      </div>

                      {/* Item Info & Price */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between self-stretch">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-foreground text-sm leading-snug line-clamp-1">
                              {item.name}
                            </span>
                            {item.category?.name && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-secondary/80 text-secondary-foreground border border-border/40">
                                {item.category.name}
                              </span>
                            )}
                          </div>

                          <p className="font-extrabold text-primary text-base mt-1">
                            {hasVariants
                              ? `${currency} ${item.variants[0].price.toLocaleString()} – ${currency} ${item.variants[item.variants.length - 1].price.toLocaleString()}`
                              : `${currency} ${item.price.toLocaleString()}`}
                          </p>
                        </div>

                        {/* Quick Add / Stepper Button */}
                        <div className="flex items-center justify-end mt-2">
                          {!hasVariants && !hasModifiers && inCart ? (
                            <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/30 rounded-xl p-1 shadow-xs">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 rounded-lg hover:bg-primary/20 text-primary"
                                onClick={() => updateQty(item.id, -1)}
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </Button>
                              <span className="font-extrabold text-xs text-primary w-5 text-center">
                                {inCart.qty}
                              </span>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 rounded-lg gradient-primary text-primary-foreground hover:opacity-90 shadow-xs"
                                onClick={() => updateQty(item.id, 1)}
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              className={cn(
                                "rounded-xl text-xs font-bold transition-all shadow-xs h-8 px-3",
                                isExpanded
                                  ? "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                                  : "gradient-primary text-primary-foreground hover:opacity-95 shadow-md shadow-primary/20"
                              )}
                              onClick={() => addToCart(item)}
                            >
                              {isExpanded ? (
                                <>
                                  <ChevronUp className="h-3.5 w-3.5 mr-1" /> Close
                                </>
                              ) : hasVariants || hasModifiers ? (
                                <>
                                  <Plus className="h-3.5 w-3.5 mr-1" /> Customize
                                </>
                              ) : (
                                <>
                                  <Plus className="h-3.5 w-3.5 mr-1" /> Add
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Customization Panel */}
                    {isExpanded && (
                      <div className="px-3.5 pb-3.5 pt-2 border-t border-border/60 bg-muted/20 space-y-3">
                        {hasVariants && (
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                              <Sparkles className="h-3 w-3 text-primary" /> Select Portion / Size
                            </label>
                            <div className="grid grid-cols-2 gap-1.5">
                              {item.variants.map((v) => {
                                const isSelected = selectedVariant?.name === v.name;
                                return (
                                  <button
                                    key={v.name}
                                    onClick={() => setSelectedVariant(isSelected ? null : v)}
                                    className={cn(
                                      "px-3 py-2 rounded-xl text-xs font-semibold border text-left transition-all flex items-center justify-between",
                                      isSelected
                                        ? "gradient-primary text-primary-foreground border-transparent shadow-md shadow-primary/20"
                                        : "bg-card border-border/80 text-foreground hover:border-primary/40"
                                    )}
                                  >
                                    <span className="truncate">{v.name}</span>
                                    <span className="font-bold shrink-0 ml-1">
                                      {currency} {v.price.toLocaleString()}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {hasModifiers && (
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                              <Plus className="h-3 w-3 text-primary" /> Extra Add-ons
                            </label>
                            <div className="flex gap-1.5 flex-wrap">
                              {itemModifiers.map((mod) => {
                                const isSelected = selectedModifiers.includes(mod.id);
                                return (
                                  <button
                                    key={mod.id}
                                    onClick={() =>
                                      setSelectedModifiers((prev) =>
                                        prev.includes(mod.id)
                                          ? prev.filter((x) => x !== mod.id)
                                          : [...prev, mod.id]
                                      )
                                    }
                                    className={cn(
                                      "px-3 py-1.5 rounded-xl text-xs font-medium border transition-all flex items-center gap-1",
                                      isSelected
                                        ? "bg-primary/15 border-primary text-primary font-bold shadow-xs"
                                        : "bg-card border-border/80 text-muted-foreground hover:border-primary/30"
                                    )}
                                  >
                                    <span>{mod.name}</span>
                                    {mod.price > 0 && (
                                      <span className="opacity-80">
                                        (+{currency}{mod.price})
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <Button
                          size="sm"
                          className="w-full h-10 rounded-xl gradient-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20"
                          onClick={() => confirmAddWithOptions(item)}
                        >
                          <Plus className="h-4 w-4 mr-1" /> Add to Order
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}

              {filtered.length === 0 && (
                <div className="text-center py-16 px-4 space-y-2 bg-card/40 rounded-3xl border border-dashed border-border">
                  <Search className="h-8 w-8 mx-auto text-muted-foreground/60" />
                  <p className="font-semibold text-foreground text-sm">No dishes match "{search}"</p>
                  <p className="text-xs text-muted-foreground">Try clearing search or picking another category.</p>
                  <Button variant="outline" size="sm" className="mt-2 rounded-xl text-xs" onClick={() => { setSearch(""); setCatFilter("All"); }}>
                    Reset Filters
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Floating Bottom Cart Bar */}
      {cartCount > 0 && (
        <div className="fixed bottom-3 left-3 right-3 z-40 max-w-lg mx-auto">
          <div
            onClick={() => setCartOpen(true)}
            className="bg-card/95 backdrop-blur-xl border border-primary/30 shadow-2xl shadow-primary/30 rounded-2xl p-3 flex items-center justify-between cursor-pointer hover:border-primary/50 transition-all active:scale-[0.99] group"
          >
            <div className="flex items-center gap-3">
              <div className="relative h-11 w-11 rounded-xl gradient-primary flex items-center justify-center text-primary-foreground shadow-md shadow-primary/30">
                <ShoppingCart className="h-5 w-5" />
                <span className="absolute -top-1.5 -right-1.5 bg-foreground text-background font-extrabold text-[10px] h-5 w-5 rounded-full flex items-center justify-center border-2 border-card shadow-xs animate-bounce">
                  {cartCount}
                </span>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Total Order</p>
                <p className="text-base font-extrabold text-foreground leading-tight">
                  {currency} {cartTotal.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 font-bold text-xs bg-primary text-primary-foreground px-4 py-2.5 rounded-xl shadow-sm group-hover:opacity-95">
              <span>View Order</span>
              <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>
        </div>
      )}

      {/* Cart Drawer Bottom Sheet */}
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="bottom" className="max-h-[88vh] rounded-t-3xl border-t border-border bg-card p-0 shadow-2xl overflow-hidden flex flex-col max-w-lg mx-auto">
          <div className="pt-3 pb-2 px-5 border-b border-border/60 bg-muted/10 shrink-0">
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full mx-auto mb-3" />
            <div className="flex items-center justify-between">
              <SheetTitle className="text-base font-bold flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-primary" /> Your Table Order
              </SheetTitle>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                Table {table?.tableNumber}
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            <div className="space-y-3">
              {cart.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-muted/20 border border-border/50">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-foreground truncate">{item.name}</p>
                    {item.modifiers && item.modifiers.length > 0 && (
                      <p className="text-[11px] text-muted-foreground">+ {item.modifiers.join(", ")}</p>
                    )}
                    <p className="text-xs font-bold text-primary mt-0.5">{currency} {item.price.toLocaleString()} each</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-0.5 shadow-xs">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 rounded-md hover:bg-muted"
                        onClick={() => updateQty(item.id, -1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="font-extrabold text-xs w-6 text-center">{item.qty}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 rounded-md hover:bg-muted"
                        onClick={() => updateQty(item.id, 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <span className="font-bold text-sm w-16 text-right">
                      {currency} {(item.price * item.qty).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                <span>Special Instructions</span>
                <span className="text-[10px] font-normal text-muted-foreground">Tap chips to add</span>
              </label>
              <div className="flex gap-1.5 flex-wrap">
                {PRESET_INSTRUCTIONS.map((preset) => {
                  const isAdded = notes.includes(preset);
                  return (
                    <button
                      key={preset}
                      onClick={() => togglePresetNote(preset)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-medium border transition-all",
                        isAdded
                          ? "bg-primary/15 border-primary text-primary font-bold shadow-xs"
                          : "bg-muted/40 border-border text-muted-foreground hover:border-primary/40"
                      )}
                    >
                      {preset}
                    </button>
                  );
                })}
              </div>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any extra preferences (e.g. less salt, warm water)..."
                className="rounded-xl bg-muted/30 border-border/80 text-xs focus-visible:ring-primary"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Ticket className="h-3.5 w-3.5" /> Promo Code
              </label>
              {appliedCoupon?.code && manualCouponApplied ? (
                <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-primary/10 border border-primary/30">
                  <span className="text-xs font-bold text-primary">
                    "{appliedCoupon.code}" applied — {currency} {appliedCoupon.amount.toLocaleString()} off
                  </span>
                  <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={removeCoupon}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    value={couponInput}
                    onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponError(null); }}
                    placeholder="Enter a code, e.g. OVEN20"
                    className="h-9 rounded-xl bg-muted/30 border-border/80 text-xs font-mono focus-visible:ring-primary"
                    maxLength={20}
                  />
                  <Button
                    variant="outline"
                    className="h-9 rounded-xl text-xs font-bold shrink-0"
                    disabled={!couponInput.trim() || checkingCoupon}
                    onClick={applyCoupon}
                  >
                    {checkingCoupon ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Apply"}
                  </Button>
                </div>
              )}
              {couponError && <p className="text-[11px] text-destructive font-medium">{couponError}</p>}
              {/* A Minimum Spend deal applies on its own, with no code typed —
                  only surfaced here, never as an input the customer has to fill. */}
              {appliedCoupon && !appliedCoupon.code && (
                <p className="text-[11px] text-primary font-semibold">
                  {appliedCoupon.dealName} applied automatically — {currency} {appliedCoupon.amount.toLocaleString()} off
                </p>
              )}
            </div>

            <div className="bg-muted/30 rounded-xl p-3.5 border border-border/60 space-y-1.5 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{currency} {cartTotal.toLocaleString()}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-primary font-semibold">
                  <span>Discount</span>
                  <span>- {currency} {discountAmount.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between text-muted-foreground">
                <span>{taxName} ({taxRate}%)</span>
                <span>{currency} {tax.toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-extrabold text-sm pt-2 border-t border-border/60 text-foreground">
                <span>Total Amount</span>
                <span className="text-primary text-base">{currency} {grandTotal.toLocaleString()}</span>
              </div>
            </div>

            <Button
              className="w-full h-12 rounded-xl gradient-primary text-primary-foreground text-base font-bold shadow-lg shadow-primary/25 active:scale-[0.99] transition-all"
              disabled={placing}
              onClick={placeOrder}
            >
              {placing ? (
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              ) : (
                <Send className="h-5 w-5 mr-2" />
              )}
              Send Order to Kitchen 🔥
            </Button>
            <p className="text-center text-[11px] font-medium text-muted-foreground">
              💳 Pay at counter or with server when finished dining
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default SelfOrder;


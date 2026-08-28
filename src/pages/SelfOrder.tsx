import { useState, useMemo, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Flame, Search, ShoppingCart, Plus, Minus, Send, ChevronUp, Loader2,
  XCircle, CheckCircle2, Users, Phone, User, BellRing, Utensils, Sparkles,
  ArrowRight, X, Receipt, FileText, Ticket, Gift, Package, Layers, Percent, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
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
  type SelfOrderDeal,
  type SelfOrderDealOptionItem,
} from "@/services/self-order.service";
import { allocateDealDiscount, dealBogoSides, capFreeUnitPrice } from "@/lib/deals";

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

// Mirrors POS.tsx's dealFormatBadge — order_discount is excluded from
// sellableDeals below (that's the separate Promo Code / Minimum Spend flow).
const dealFormatBadge: Record<Exclude<SelfOrderDeal["type"], "order_discount">, { icon: typeof Package; label: string }> = {
  combo: { icon: Package, label: "Fixed Bundle" },
  option_combo: { icon: Layers, label: "Customizable" },
  percentage: { icon: Percent, label: "% Discount" },
  buy_x_get_y: { icon: Gift, label: "Buy X Get Y" },
};

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

  // ── Live deals — Fixed Bundle/Customizable/%Discount/Buy X Get Y. Order
  // Discount is excluded from browsing (that's the separate Promo Code /
  // Minimum Spend coupon flow above). Always priced at Dine In: a self-order
  // customer only ever orders at their table. ──
  const [deals, setDeals] = useState<SelfOrderDeal[]>([]);
  const sellableDeals = useMemo(() => deals.filter((d) => d.type !== "order_discount"), [deals]);
  const [showDealCustomize, setShowDealCustomize] = useState(false);
  const [customizingDeal, setCustomizingDeal] = useState<SelfOrderDeal | null>(null);
  const [dealGroupSelections, setDealGroupSelections] = useState<Record<string, string[]>>({});
  const [showDealItemPicker, setShowDealItemPicker] = useState(false);
  const [pickingDeal, setPickingDeal] = useState<SelfOrderDeal | null>(null);
  const [pickedDealItemId, setPickedDealItemId] = useState("");
  const [pickedDealVariantId, setPickedDealVariantId] = useState<string | null>(null);
  const [pickedDealQty, setPickedDealQty] = useState(1);

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
    selfOrderService.getMenu(table?.tableId)
      .then(setMenu)
      .catch(() => toast.error("Could not load the menu. Please try refreshing."))
      .finally(() => setMenuLoading(false));
  }, [entryDone, table]);

  useEffect(() => {
    if (!entryDone || !table) return;
    selfOrderService.getDeals(table.tableId).then(setDeals).catch(() => {});
  }, [entryDone, table]);

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
  // Safety net only. The `order:updated` socket handler above already writes the
  // exact same SelfOrderStatus into the exact same state, instantly — this poll
  // exists purely for a device whose socket never connected (a phone on a
  // network that blocks websockets).
  //
  // It used to run every 4s, and it fires ONE request PER un-finished order, so
  // a customer four orders into a sitting generated ~3,600 requests an hour from
  // a single table — the scaling problem the self-order docs flagged as a known
  // limitation. At 20s that is ~180/hr, and the socket still makes the UI feel
  // instant for everyone whose socket works.
  useVisiblePolling(pollStatus, 20_000, hasActiveOrder);

  const availableItems = useMemo(() => menu?.items ?? [], [menu]);
  const categories = useMemo(() => ["All", ...(menu?.categories.map((c) => c.name) ?? [])], [menu]);
  const filtered = useMemo(() => {
    let items = availableItems;
    if (catFilter !== "All") items = items.filter((i) => i.category?.name === catFilter);
    if (search) items = items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));
    return items;
  }, [availableItems, catFilter, search]);

  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty - (i.discount || 0), 0);
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
        (sum, o) => sum + o.items.reduce((iSum, item) => iSum + item.price * item.qty - (item.discount || 0), 0),
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
      if (!item.available) { toast.error(`${item.name} is out of stock`); return; }
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

    const pickedVariant = selectedVariant ? item.variants.find((v) => v.id === selectedVariant.id) : undefined;
    if ((pickedVariant && !pickedVariant.available) || (!hasVariants && !item.available)) {
      toast.error(`${item.name}${selectedVariant ? ` (${selectedVariant.name})` : ""} is out of stock`);
      return;
    }

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

  /** A deal redemption is one unit — removing any of its lines removes all
   *  of them, or a customer could keep half a Fixed Bundle at its bundle
   *  price. Mirrors POS.tsx's removeDealGroup exactly. */
  const removeDealGroup = (dealLineId: string) => setCart((prev) => prev.filter((c) => c.dealLineId !== dealLineId));

  /** The cart's actual render rows: a plain item is its own row, but every
   *  CartItem sharing a dealLineId collapses into one row — mirrors
   *  POS.tsx's cartDisplayRows exactly. */
  const cartDisplayRows = useMemo(() => {
    const rows: ({ kind: "plain"; item: CartItem } | { kind: "deal"; dealLineId: string; dealName: string; items: CartItem[] })[] = [];
    const seenLineIds = new Set<string>();
    for (const item of cart) {
      if (item.dealLineId) {
        if (seenLineIds.has(item.dealLineId)) continue;
        seenLineIds.add(item.dealLineId);
        rows.push({
          kind: "deal",
          dealLineId: item.dealLineId,
          dealName: item.dealName || "Deal",
          items: cart.filter((c) => c.dealLineId === item.dealLineId),
        });
      } else {
        rows.push({ kind: "plain", item });
      }
    }
    return rows;
  }, [cart]);

  // ── Deals: add-to-cart — mirrors POS.tsx's addDealToCart family. Every
  // self-order deal's price/discountPercent already comes back resolved to
  // Dine In from the backend (mapDealOutPublic), so no channel lookup is
  // needed here — deal.price and deal.discountPercent are used directly.
  // Fixed Bundle and Buy X Get Y add their whole redemption in one click;
  // Customizable opens a choice dialog; % Discount opens an eligible-item
  // picker. ──
  const addDealToCart = (deal: SelfOrderDeal) => {
    if (isDealOutOfStock(deal)) { toast.error(`"${deal.name}" is out of stock`); return; }
    if (deal.type === "combo") { addComboDealToCart(deal); return; }
    if (deal.type === "buy_x_get_y") { addBogoDealToCart(deal); return; }
    if (deal.type === "option_combo") { openDealCustomize(deal); return; }
    if (deal.type === "percentage") { openDealItemPicker(deal); return; }
  };

  const menuItemUnitPrice = (menuItem: SelfOrderMenuItem, variant?: SelfOrderMenuItem["variants"][number] | null) =>
    variant ? variant.price : menuItem.price;

  /** Whether menuItemId (at variantId, or the item's own base availability
   *  when variantId is null) is unavailable right now — reads the plain
   *  `available` booleans the backend already computed from live stock (see
   *  getSelfOrderMenu), never raw recipes/ingredient stock, which self-order
   *  never receives. */
  const isMenuItemUnavailable = (menuItemId: string, variantId: string | null): boolean => {
    const item = availableItems.find((m) => m.id === menuItemId);
    if (!item) return true;
    if (variantId) {
      const variant = item.variants.find((v) => v.id === variantId);
      return variant ? !variant.available : true;
    }
    return !item.available;
  };

  /** Whether a deal can be redeemed at all right now, given live stock —
   *  mirrors POS.tsx's isDealOutOfStock, but against the server-computed
   *  `available` flags rather than recomputing from recipes. */
  const isDealOutOfStock = (deal: SelfOrderDeal): boolean => {
    if (deal.type === "combo") {
      return deal.components.some((c) => isMenuItemUnavailable(c.menuItemId, c.variantId));
    }
    if (deal.type === "option_combo") {
      return deal.optionGroups.some((g) => g.options.every((o) => isMenuItemUnavailable(o.menuItemId, o.variantId)));
    }
    if (deal.type === "percentage") {
      const eligible = availableItems.filter((m) =>
        deal.applicableItems.includes(m.id) || (m.category?.id && deal.applicableCategories.includes(m.category.id))
      );
      if (eligible.length === 0) return false;
      return eligible.every((m) => !m.available);
    }
    // buy_x_get_y
    const { buy, get } = dealBogoSides(deal);
    if (buy.length === 0 || get.length === 0) return false;
    return buy.some((r) => isMenuItemUnavailable(r.menuItemId, r.variantId)) || get.some((r) => isMenuItemUnavailable(r.menuItemId, r.variantId));
  };

  const addComboDealToCart = (deal: SelfOrderDeal) => {
    if (deal.components.length === 0) { toast.error(`"${deal.name}" has no items configured`); return; }
    const rows = deal.components.map((c) => {
      const menuItem = availableItems.find((m) => m.id === c.menuItemId);
      const variant = c.variantId ? menuItem?.variants.find((v) => v.id === c.variantId) : undefined;
      return { component: c, menuItem, variant, unitPrice: menuItem ? menuItemUnitPrice(menuItem, variant) : 0 };
    });
    if (rows.some((r) => !r.menuItem)) { toast.error(`A menu item in "${deal.name}" is no longer available`); return; }

    const grossAmounts = rows.map((r) => r.unitPrice * r.component.qty);
    const savings = Math.max(0, grossAmounts.reduce((s, v) => s + v, 0) - (deal.price ?? 0));
    const discounts = allocateDealDiscount(savings, grossAmounts);

    const lineId = `deal-${deal.id}-${Date.now()}`;
    const newItems: CartItem[] = rows.map((r, idx) => ({
      id: `${lineId}-${idx}`,
      name: `${r.menuItem!.name}${r.variant ? ` (${r.variant.name})` : ""}`,
      price: r.unitPrice, qty: r.component.qty, discount: discounts[idx], modifiers: [],
      menuItemId: r.component.menuItemId, variantId: r.component.variantId,
      dealId: deal.id, dealName: deal.name, dealLineId: lineId,
    }));
    setCart((prev) => [...prev, ...newItems]);
    toast.success(`${deal.name} added to cart`);
  };

  const addBogoDealToCart = (deal: SelfOrderDeal) => {
    const { buy, get } = dealBogoSides(deal);
    if (buy.length === 0 || get.length === 0) { toast.error(`"${deal.name}" is not configured correctly`); return; }

    const lineId = `deal-${deal.id}-${Date.now()}`;
    const newItems: CartItem[] = [];
    for (const row of buy) {
      const menuItem = availableItems.find((m) => m.id === row.menuItemId);
      if (!menuItem) { toast.error(`A menu item in "${deal.name}" is no longer available`); return; }
      const variant = row.variantId ? menuItem.variants.find((v) => v.id === row.variantId) : undefined;
      newItems.push({
        id: `${lineId}-buy-${newItems.length}`,
        name: `${menuItem.name}${variant ? ` (${variant.name})` : ""}`,
        price: menuItemUnitPrice(menuItem, variant), qty: row.qty, discount: 0, modifiers: [],
        menuItemId: row.menuItemId, variantId: row.variantId,
        dealId: deal.id, dealName: deal.name, dealLineId: lineId, dealRole: "buy",
      });
    }
    for (const row of get) {
      const menuItem = availableItems.find((m) => m.id === row.menuItemId);
      if (!menuItem) { toast.error(`A menu item in "${deal.name}" is no longer available`); return; }
      const variant = row.variantId ? menuItem.variants.find((v) => v.id === row.variantId) : undefined;
      const unitPrice = menuItemUnitPrice(menuItem, variant);
      const variants = menuItem.variants ?? [];
      const cheapest = variants.length === 0 ? unitPrice : Math.min(...variants.map((v) => v.price));
      const cappedUnitPrice = capFreeUnitPrice(row.variantId, unitPrice, cheapest);
      // The public deal record has no per-channel coverage override (only a
      // PERCENTAGE deal's discountPercent gets folded to Dine In), so this
      // always previews as fully free — the real figure is enforced server
      // side by deal.revalidate.ts against the live Deal row regardless.
      const freeUnitPrice = unitPrice;
      newItems.push({
        id: `${lineId}-get-${newItems.length}`,
        name: `${menuItem.name}${variant ? ` (${variant.name})` : ""} (Free)`,
        price: unitPrice, qty: row.qty, discount: freeUnitPrice * row.qty, modifiers: [],
        menuItemId: row.menuItemId, variantId: row.variantId,
        dealId: deal.id, dealName: deal.name, dealLineId: lineId, dealRole: "get",
      });
    }
    setCart((prev) => [...prev, ...newItems]);
    toast.success(`${deal.name} added to cart`);
  };

  const dealOptionKey = (menuItemId: string, variantId: string | null) => `${menuItemId}:${variantId ?? ""}`;

  const openDealCustomize = (deal: SelfOrderDeal) => {
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

    const picks: { groupId: string; option: SelfOrderDealOptionItem }[] = [];
    for (const g of deal.optionGroups) {
      for (const key of dealGroupSelections[g.id] || []) {
        const option = g.options.find((o) => dealOptionKey(o.menuItemId, o.variantId) === key);
        if (option) picks.push({ groupId: g.id, option });
      }
    }
    if (picks.length === 0) { toast.error("Nothing selected"); return; }

    const rows = picks.map(({ groupId, option }) => {
      const menuItem = availableItems.find((m) => m.id === option.menuItemId);
      const variant = option.variantId ? menuItem?.variants.find((v) => v.id === option.variantId) : undefined;
      return { groupId, option, menuItem, variant, unitPrice: (menuItem ? menuItemUnitPrice(menuItem, variant) : 0) + (option.extraPrice || 0) };
    });
    if (rows.some((r) => !r.menuItem)) { toast.error(`A menu item in "${deal.name}" is no longer available`); return; }

    const grossAmounts = rows.map((r) => r.unitPrice);
    const savings = Math.max(0, grossAmounts.reduce((s, v) => s + v, 0) - (deal.price ?? 0));
    const discounts = allocateDealDiscount(savings, grossAmounts);

    const lineId = `deal-${deal.id}-${Date.now()}`;
    const newItems: CartItem[] = rows.map((r, idx) => ({
      id: `${lineId}-${idx}`,
      name: `${r.menuItem!.name}${r.variant ? ` (${r.variant.name})` : ""}`,
      price: r.unitPrice, qty: 1, discount: discounts[idx], modifiers: [],
      menuItemId: r.option.menuItemId, variantId: r.option.variantId,
      dealId: deal.id, dealName: deal.name, dealLineId: lineId, dealGroupId: r.groupId,
    }));
    setCart((prev) => [...prev, ...newItems]);
    setShowDealCustomize(false);
    setCustomizingDeal(null);
    toast.success(`${deal.name} added to cart`);
  };

  const eligibleDealItems = useMemo(() => {
    if (!pickingDeal) return [];
    return availableItems.filter((m) =>
      pickingDeal.applicableItems.includes(m.id) ||
      (m.category?.id && pickingDeal.applicableCategories.includes(m.category.id))
    );
  }, [pickingDeal, availableItems]);

  const openDealItemPicker = (deal: SelfOrderDeal) => {
    setPickingDeal(deal);
    const eligible = availableItems.filter((m) =>
      deal.applicableItems.includes(m.id) ||
      (m.category?.id != null && deal.applicableCategories.includes(m.category.id))
    );
    if (eligible.length > 0) {
      const first = eligible[0];
      setPickedDealItemId(first.id);
      if (first.variants && first.variants.length > 0) {
        const firstAvail = first.variants.find((v) => !isMenuItemUnavailable(first.id, v.id));
        setPickedDealVariantId(firstAvail ? firstAvail.id : first.variants[0].id);
      } else {
        setPickedDealVariantId(null);
      }
    } else {
      setPickedDealItemId("");
      setPickedDealVariantId(null);
    }
    setPickedDealQty(1);
    setShowDealItemPicker(true);
  };

  const confirmDealItemPick = () => {
    if (!pickingDeal || !pickedDealItemId) return;
    const deal = pickingDeal;
    const menuItem = availableItems.find((m) => m.id === pickedDealItemId);
    if (!menuItem) return;
    const variant = pickedDealVariantId ? menuItem.variants.find((v) => v.id === pickedDealVariantId) : undefined;
    if (menuItem.variants.length > 0 && !variant) { toast.error("Pick a size"); return; }

    const unitPrice = menuItemUnitPrice(menuItem, variant);
    const percent = deal.discountPercent ?? 0;
    const qty = 1;
    const discount = Math.min(unitPrice * qty, unitPrice * qty * (percent / 100));

    const lineId = `deal-${deal.id}-${Date.now()}`;
    const newItem: CartItem = {
      id: lineId,
      name: `${menuItem.name}${variant ? ` (${variant.name})` : ""}`,
      price: unitPrice, qty, discount, modifiers: [],
      menuItemId: menuItem.id, variantId: variant?.id ?? null,
      dealId: deal.id, dealName: deal.name, dealLineId: lineId,
    };
    setCart((prev) => [...prev, newItem]);
    setShowDealItemPicker(false);
    setPickingDeal(null);
    toast.success(`${deal.name} added to cart`);
  };

  /** Everything the rich deal card needs — mirrors POS.tsx's
   *  dealCardPricing, but reads deal.price/deal.discountPercent directly
   *  since they're already resolved to Dine In server-side. */
  const dealCardPricing = (deal: SelfOrderDeal): {
    lines: string[];
    priceLabel: string;
    regularLabel: string | null;
    regularStrike: boolean;
    savingsPercent: number;
  } => {
    if (deal.type === "combo") {
      const rows = deal.components.map((c) => {
        const menuItem = availableItems.find((m) => m.id === c.menuItemId);
        const variant = c.variantId ? menuItem?.variants.find((v) => v.id === c.variantId) : undefined;
        return { c, menuItem, variant };
      });
      const lines = rows.filter((r) => r.menuItem).map((r) => `${r.c.qty}x ${r.menuItem!.name}${r.variant ? ` (${r.variant.name})` : ""}`);
      const regular = rows.reduce((s, r) => (r.menuItem ? s + menuItemUnitPrice(r.menuItem, r.variant) * r.c.qty : s), 0);
      const dealPrice = deal.price ?? 0;
      const savingsPercent = regular > dealPrice ? Math.round(((regular - dealPrice) / regular) * 100) : 0;
      return {
        lines,
        priceLabel: `${currency} ${dealPrice.toLocaleString()}`,
        regularLabel: regular > dealPrice ? `${currency} ${regular.toLocaleString()}` : null,
        regularStrike: true,
        savingsPercent,
      };
    }
    if (deal.type === "option_combo") {
      return {
        lines: deal.optionGroups.map((g) => g.label),
        priceLabel: `${currency} ${(deal.price ?? 0).toLocaleString()}`,
        regularLabel: null,
        regularStrike: false,
        savingsPercent: 0,
      };
    }
    if (deal.type === "percentage") {
      const items = availableItems.filter((m) =>
        deal.applicableItems.includes(m.id) || (m.category?.id && deal.applicableCategories.includes(m.category.id))
      );
      const lines = items.map((m) => m.name);
      const percent = deal.discountPercent ?? 0;
      const prices: number[] = [];
      items.forEach((m) => {
        if (m.variants.length) m.variants.forEach((v) => prices.push(v.price));
        else prices.push(m.price);
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
        priceLabel: afterMin === afterMax ? `${currency} ${afterMin.toLocaleString()}` : `${currency} ${afterMin.toLocaleString()} – ${afterMax.toLocaleString()}`,
        regularLabel: min === max ? `${currency} ${min.toLocaleString()}` : `${currency} ${min.toLocaleString()} – ${max.toLocaleString()}`,
        regularStrike: false,
        savingsPercent: percent,
      };
    }
    // buy_x_get_y
    const { buy, get } = dealBogoSides(deal);
    const lines: string[] = [];
    let buyTotal = 0, getTotal = 0;
    buy.forEach((row) => {
      const menuItem = availableItems.find((m) => m.id === row.menuItemId);
      if (!menuItem) return;
      const variant = row.variantId ? menuItem.variants.find((v) => v.id === row.variantId) : undefined;
      const unitPrice = menuItemUnitPrice(menuItem, variant);
      buyTotal += unitPrice * row.qty;
      lines.push(`Buy ${row.qty}x ${menuItem.name}${variant ? ` (${variant.name})` : ""}`);
    });
    get.forEach((row) => {
      const menuItem = availableItems.find((m) => m.id === row.menuItemId);
      if (!menuItem) return;
      const variant = row.variantId ? menuItem.variants.find((v) => v.id === row.variantId) : undefined;
      const unitPrice = menuItemUnitPrice(menuItem, variant);
      getTotal += unitPrice * row.qty;
      lines.push(`Get ${row.qty}x ${menuItem.name}${variant ? ` (${variant.name})` : ""} Free`);
    });
    const regular = buyTotal + getTotal;
    const dealPrice = Math.round(buyTotal);
    const savingsPercent = regular > 0 ? Math.round((getTotal / regular) * 100) : 0;
    return {
      lines,
      priceLabel: `${currency} ${dealPrice.toLocaleString()}`,
      regularLabel: regular > dealPrice ? `${currency} ${regular.toLocaleString()}` : null,
      regularStrike: true,
      savingsPercent,
    };
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
        items: cart.map((i) => ({
          menuItemId: i.menuItemId, variantId: i.variantId, name: i.name, price: i.price, qty: i.qty, modifierIds: i.modifierIds,
          dealId: i.dealId || null, dealName: i.dealName || null, dealLineId: i.dealLineId || null,
          dealGroupId: i.dealGroupId || null, dealRole: i.dealRole || null,
        })),
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
            {sellableDeals.length > 0 && (
              <button
                onClick={() => setCatFilter("__deals__")}
                className={cn(
                  "shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 border",
                  catFilter === "__deals__"
                    ? "gradient-primary text-primary-foreground border-transparent shadow-md shadow-primary/25 scale-[1.02]"
                    : "bg-card border-border/80 text-muted-foreground hover:text-foreground hover:border-primary/40"
                )}
              >
                <Gift className="h-3.5 w-3.5" />
                <span>Deals</span>
                <span className={cn(
                  "text-[9px] px-1.5 py-0.2 rounded-full font-bold",
                  catFilter === "__deals__" ? "bg-black/20 text-white" : "bg-muted text-muted-foreground"
                )}>
                  {sellableDeals.length}
                </span>
              </button>
            )}
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
          {catFilter === "__deals__" ? (
            sellableDeals.length === 0 ? (
              <div className="text-center py-16 px-4 space-y-2 bg-card/40 rounded-3xl border border-dashed border-border">
                <Gift className="h-8 w-8 mx-auto text-muted-foreground/60" />
                <p className="font-semibold text-foreground text-sm">No deals are running right now</p>
              </div>
            ) : (
              sellableDeals.map((deal) => {
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
                      "w-full text-left bg-card rounded-2xl border border-border/80 hover:border-primary/40 overflow-hidden shadow-xs hover:shadow-md transition-all duration-200",
                      outOfStock && "opacity-60 hover:shadow-xs hover:border-border/80"
                    )}
                  >
                    <div className="aspect-[16/9] w-full relative overflow-hidden bg-muted/50">
                      {deal.image ? (
                        <img src={deal.image} alt={deal.name} className={cn("h-full w-full object-cover", outOfStock && "grayscale")} />
                      ) : (
                        <div className="h-full w-full bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center text-primary/60">
                          <Gift className="h-8 w-8" />
                        </div>
                      )}
                      <div className="absolute top-2 left-2 flex items-center gap-1 text-[10px] font-bold text-primary-foreground bg-primary/90 backdrop-blur-xs px-2 py-1 rounded-lg">
                        <BadgeIcon className="h-3 w-3" />
                        {badge.label}
                      </div>
                      {outOfStock && (
                        <div className="absolute inset-0 bg-background/85 backdrop-blur-xs flex items-center justify-center">
                          <span className="text-[10px] font-bold text-destructive-foreground bg-destructive px-2.5 py-1 rounded-lg uppercase tracking-wide">Out of Stock</span>
                        </div>
                      )}
                    </div>
                    <div className="p-3.5 space-y-2">
                      <p className="font-bold text-foreground text-sm leading-snug">{deal.name}</p>
                      {deal.description && (
                        <p className="text-xs text-muted-foreground">{deal.description}</p>
                      )}
                      {pricing.lines.length > 0 && (
                        <div className="bg-muted/40 border border-border/60 rounded-xl px-2.5 py-2 space-y-1">
                          {pricing.lines.map((line, i) => (
                            <p key={i} className="text-[11px] text-foreground/80 font-medium">• {line}</p>
                          ))}
                        </div>
                      )}
                      <div className="flex items-end justify-between gap-2 pt-1">
                        <div>
                          {pricing.regularLabel && (
                            <span className={cn("text-[11px] text-muted-foreground font-mono block", pricing.regularStrike && "line-through")}>
                              {pricing.regularStrike ? pricing.regularLabel : `was ${pricing.regularLabel}`}
                            </span>
                          )}
                          <span className="font-extrabold text-primary text-base">{pricing.priceLabel}</span>
                        </div>
                        {pricing.savingsPercent > 0 && (
                          <span className="text-[10px] font-bold text-primary bg-primary/10 border border-primary/30 px-2 py-1 rounded-lg shrink-0">
                            SAVE {pricing.savingsPercent}%
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )
          ) : menuLoading ? (
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
                      isExpanded ? "border-primary/50 ring-1 ring-primary/20" : "border-border/80 hover:border-border",
                      !item.available && "opacity-60 hover:shadow-xs"
                    )}
                  >
                    <div className="p-3 flex items-start gap-3">
                      {/* Food Item Image / Thumbnail Placeholder */}
                      <div className="relative h-20 w-20 sm:h-22 sm:w-22 rounded-xl overflow-hidden bg-muted/50 shrink-0 border border-border/50 flex items-center justify-center">
                        {item.image ? (
                          <img
                            src={item.image}
                            alt={item.name}
                            className={cn("h-full w-full object-cover transition-transform duration-300 hover:scale-105", !item.available && "grayscale")}
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

                          {!item.available ? (
                            <p className="font-bold text-destructive text-xs mt-1 uppercase tracking-wide">Out of Stock</p>
                          ) : (
                            <p className="font-extrabold text-primary text-base mt-1">
                              {hasVariants
                                ? `${currency} ${item.variants[0].price.toLocaleString()} – ${currency} ${item.variants[item.variants.length - 1].price.toLocaleString()}`
                                : `${currency} ${item.price.toLocaleString()}`}
                            </p>
                          )}
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
                              disabled={!item.available}
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
                                    disabled={!v.available}
                                    onClick={() => setSelectedVariant(isSelected ? null : v)}
                                    className={cn(
                                      "px-3 py-2 rounded-xl text-xs font-semibold border text-left transition-all flex items-center justify-between",
                                      !v.available
                                        ? "opacity-50 cursor-not-allowed line-through bg-muted/40 border-border/60 text-muted-foreground"
                                        : isSelected
                                        ? "gradient-primary text-primary-foreground border-transparent shadow-md shadow-primary/20"
                                        : "bg-card border-border/80 text-foreground hover:border-primary/40"
                                    )}
                                  >
                                    <span className="truncate">{v.name}</span>
                                    {v.available ? (
                                      <span className="font-bold shrink-0 ml-1">
                                        {currency} {v.price.toLocaleString()}
                                      </span>
                                    ) : (
                                      <span className="font-bold shrink-0 ml-1 text-destructive no-underline">Out of Stock</span>
                                    )}
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
              {cartDisplayRows.map((row) => {
                if (row.kind === "deal") {
                  const gross = row.items.reduce((s, i) => s + i.price * i.qty, 0);
                  const discount = row.items.reduce((s, i) => s + (i.discount || 0), 0);
                  return (
                    <div key={row.dealLineId} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-primary/[0.05] border border-primary/20">
                      <div className="flex-1 min-w-0">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary uppercase tracking-wide">
                          <Gift className="h-3 w-3" /> Deal
                        </span>
                        <p className="font-semibold text-sm text-foreground truncate">{row.dealName}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {row.items.map((i) => `${i.qty}x ${i.name}`).join(", ")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-bold text-sm">{currency} {(gross - discount).toLocaleString()}</span>
                        <Button size="icon" variant="ghost" className="h-7 w-7 rounded-md hover:bg-destructive/10 hover:text-destructive" onClick={() => removeDealGroup(row.dealLineId)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                }
                const item = row.item;
                return (
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
                );
              })}
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

      {/* Customizable (option_combo) Deal — choice group picker */}
      <Dialog open={showDealCustomize} onOpenChange={(open) => { setShowDealCustomize(open); if (!open) setCustomizingDeal(null); }}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary shrink-0" />
              <span>{customizingDeal?.name}</span>
            </DialogTitle>
            <DialogDescription>Pick an item for each step below, then add the deal to your order.</DialogDescription>
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
                        const menuItem = availableItems.find((m) => m.id === o.menuItemId);
                        const variant = o.variantId ? menuItem?.variants.find((v) => v.id === o.variantId) : undefined;
                        const isChecked = selected.includes(key);
                        const optionOutOfStock = isMenuItemUnavailable(o.menuItemId, o.variantId);
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
            <Button className="gradient-primary text-primary-foreground" onClick={confirmDealCustomize}>Add to Order</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* % Discount Deal — customizable-style eligible item picker */}
      <Dialog open={showDealItemPicker} onOpenChange={(open) => { setShowDealItemPicker(open); if (!open) setPickingDeal(null); }}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Percent className="h-5 w-5 text-primary shrink-0" />
              <span>{pickingDeal?.name}</span>
            </DialogTitle>
            <DialogDescription>
              Pick an eligible item below to apply this {pickingDeal?.discountPercent}% discount.
            </DialogDescription>
          </DialogHeader>

          {pickingDeal && (
            <div className="space-y-5">
              {/* Step 1: Select Item */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center shrink-0">1</span>
                  <p className="text-sm font-bold text-foreground">Choose Item</p>
                  <span className="text-[11px] text-muted-foreground font-medium ml-auto shrink-0">Pick 1</span>
                </div>
                <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                  {eligibleDealItems.map((m) => {
                    const isChecked = pickedDealItemId === m.id;
                    const itemVariants = m.variants || [];
                    const itemOutOfStock = itemVariants.length === 0
                      ? isMenuItemUnavailable(m.id, null)
                      : itemVariants.every((v) => isMenuItemUnavailable(m.id, v.id));

                    return (
                      <button
                        key={m.id}
                        type="button"
                        disabled={itemOutOfStock}
                        onClick={() => {
                          setPickedDealItemId(m.id);
                          if (itemVariants.length > 0) {
                            const firstAvail = itemVariants.find((v) => !isMenuItemUnavailable(m.id, v.id));
                            setPickedDealVariantId(firstAvail ? firstAvail.id : itemVariants[0].id);
                          } else {
                            setPickedDealVariantId(null);
                          }
                        }}
                        className={cn(
                          "w-full flex items-center justify-between p-3 rounded-xl border text-left text-sm transition-all duration-150",
                          itemOutOfStock
                            ? "opacity-50 cursor-not-allowed border-border bg-muted/30"
                            : isChecked ? "border-primary bg-primary/5 shadow-xs" : "border-border hover:border-primary/40 hover:bg-muted/30"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={cn(
                            "h-4 w-4 rounded-full border flex items-center justify-center shrink-0 transition-colors",
                            isChecked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
                          )}>
                            {isChecked && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                          </div>
                          <div className="min-w-0">
                            <p className={cn("leading-snug truncate", isChecked && !itemOutOfStock ? "font-semibold text-primary" : "font-medium text-foreground")}>
                              {m.name}
                            </p>
                            {itemVariants.length > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                {itemVariants.length} sizes available
                              </span>
                            )}
                          </div>
                        </div>
                        {itemOutOfStock && (
                          <span className="inline-block text-[10px] font-semibold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded shrink-0">
                            Out of Stock
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 2: Select Size (if selected item has variants) */}
              {(() => {
                const menuItem = eligibleDealItems.find((m) => m.id === pickedDealItemId);
                const variants = menuItem?.variants || [];
                if (!menuItem || variants.length === 0) return null;

                return (
                  <div className="space-y-2 pt-1 border-t border-border">
                    <div className="flex items-center gap-2">
                      <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center shrink-0">2</span>
                      <p className="text-sm font-bold text-foreground">Choose Size for {menuItem.name}</p>
                      <span className="text-[11px] text-muted-foreground font-medium ml-auto shrink-0">Pick 1</span>
                    </div>
                    <div className="space-y-1.5">
                      {variants.map((v) => {
                        const isVarSelected = pickedDealVariantId === v.id;
                        const variantOutOfStock = isMenuItemUnavailable(menuItem.id, v.id);
                        const rawPrice = menuItemUnitPrice(menuItem, v);
                        const pct = pickingDeal.discountPercent ?? 0;
                        const discPrice = Math.max(0, rawPrice - (rawPrice * pct) / 100);

                        return (
                          <button
                            key={v.id}
                            type="button"
                            disabled={variantOutOfStock}
                            onClick={() => setPickedDealVariantId(v.id)}
                            className={cn(
                              "w-full flex items-center justify-between p-3 rounded-xl border text-left text-sm transition-all duration-150",
                              variantOutOfStock
                                ? "opacity-50 cursor-not-allowed border-border bg-muted/30"
                                : isVarSelected ? "border-primary bg-primary/5 shadow-xs" : "border-border hover:border-primary/40 hover:bg-muted/30"
                            )}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={cn(
                                "h-4 w-4 rounded-full border flex items-center justify-center shrink-0 transition-colors",
                                isVarSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
                              )}>
                                {isVarSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                              </div>
                              <span className={cn("leading-snug truncate", isVarSelected && !variantOutOfStock ? "font-semibold text-primary" : "font-medium text-foreground")}>
                                {v.name}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {variantOutOfStock ? (
                                <span className="inline-block text-[10px] font-semibold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">
                                  Out of Stock
                                </span>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-muted-foreground line-through font-mono">
                                    {currency} {rawPrice.toLocaleString()}
                                  </span>
                                  <span className="text-xs font-bold text-primary font-mono">
                                    {currency} {discPrice.toLocaleString()}
                                  </span>
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDealItemPicker(false)}>Cancel</Button>
            <Button
              className="gradient-primary text-primary-foreground font-bold shadow-md"
              disabled={
                !pickedDealItemId ||
                (() => {
                  const sel = eligibleDealItems.find((m) => m.id === pickedDealItemId);
                  if (!sel) return true;
                  if (sel.variants.length > 0 && !pickedDealVariantId) return true;
                  return isMenuItemUnavailable(sel.id, pickedDealVariantId);
                })()
              }
              onClick={confirmDealItemPick}
            >
              Add to Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SelfOrder;


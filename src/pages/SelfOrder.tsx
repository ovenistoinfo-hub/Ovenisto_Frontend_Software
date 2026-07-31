import { useState, useMemo, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Flame, Search, ShoppingCart, Plus, Minus, Send, ChevronDown, ChevronUp, Loader2, XCircle, CheckCircle2, Users, Phone, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
}

function sessionStorageKey(tableId: string): string {
  return `ovenisto_self_order_session_${tableId}`;
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
    // localStorage can throw in private-browsing/quota-exceeded cases — the
    // page still works, it just won't survive a refresh.
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

  // ── Live settings (currency/tax/restaurant name — DataContext is empty for an
  //    anonymous browser, so this must be fetched live, same reason as the menu) ──
  const [currency, setCurrency] = useState("Rs.");
  const [taxRate, setTaxRate] = useState(0);
  const [taxName, setTaxName] = useState("GST");
  const [restaurantName, setRestaurantName] = useState("");

  // ── Live menu ──
  const [menu, setMenu] = useState<SelfOrderMenu | null>(null);
  const [menuLoading, setMenuLoading] = useState(true);

  // ── Entry gate: name / phone / guest count, required before ordering ──
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

  // ── Placed orders for this table sitting (supports multiple orders per visit) ──
  const [orders, setOrders] = useState<PlacedOrder[]>([]);
  const [viewingMenu, setViewingMenu] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [role, setRole] = useState<"host" | "viewer" | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [requestPending, setRequestPending] = useState(false);
  const [requestTimedOut, setRequestTimedOut] = useState(false);
  const [incomingHostRequest, setIncomingHostRequest] = useState(false);
  const [promotedGuestCount, setPromotedGuestCount] = useState<number | null>(null);

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
    }
    setHydrated(true);
  }, [table, hydrated]);

  useEffect(() => {
    if (!table || !hydrated) return;
    savePersistedSession(table.tableId, {
      entryDone, customerName, customerPhone, guestCount, cart, notes,
      orders, viewingMenu, sessionToken,
    });
  }, [table, hydrated, entryDone, customerName, customerPhone, guestCount, cart, notes, orders, viewingMenu, sessionToken]);

  // ── Join this table's socket room for live order/session updates ──
  useEffect(() => {
    if (!table || !hydrated) return;
    const socket = getSelfOrderSocket();

    const joinTable = () => {
      socket.emit(
        "join-table",
        { tableId: table.tableId, sessionToken: sessionToken ?? undefined },
        (res: { role: "host"; sessionToken: string } | { role: "viewer" } | { error: string }) => {
          if ("error" in res) return;
          setRole(res.role);
          if (res.role === "host") setSessionToken(res.sessionToken);
        }
      );
    };

    joinTable();

    // socket.io-client's "connect" event fires on the initial connection AND
    // on every automatic reconnect (reconnection: true, reconnectionAttempts:
    // Infinity — see src/lib/self-order-socket.ts). Without re-emitting
    // join-table here, a customer whose phone briefly drops wifi/cellular
    // reconnects with a fresh server-side socket id, is no longer in the
    // table's room, and silently stops receiving order:updated/session:ended
    // for the rest of the session. The backend's join-table handler is
    // idempotent/safe to call repeatedly.
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
    const onRoleChanged = (payload: { role: "host"; sessionToken: string; guestCount?: number | null } | { role: "viewer" }) => {
      setRole(payload.role);
      if (payload.role === "host") {
        setSessionToken(payload.sessionToken);
        setRequestPending(false);
        setRequestTimedOut(false);
        if (payload.guestCount != null) {
          setPromotedGuestCount(payload.guestCount);
          setGuestCount(payload.guestCount);
        }
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
  }, [table, hydrated, sessionToken]);

  // ── Clear the persisted session once staff ends the sitting ──
  useEffect(() => {
    if (!sessionEnded || !table) return;
    clearPersistedSession(table.tableId);
  }, [sessionEnded, table]);

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

  // ── Poll every non-terminal order's status as a fallback if the socket drops ──
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
  const tax = Math.round(cartTotal * (taxRate / 100));

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

  // ── Entry gate: continue-to-menu with name-conflict check ──

  const handleContinueToMenu = async () => {
    setCheckingCustomer(true);
    try {
      const result = await selfOrderService.lookupCustomerByPhone(customerPhone);
      if (result.exists && result.name && result.name.trim() !== customerName.trim()) {
        setNameConflict({ savedName: result.name, typedName: customerName.trim() });
        return;
      }
    } catch {
      // Lookup failing shouldn't block ordering — proceed with whatever was typed.
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
        total: cartTotal + tax,
        specialInstructions: notes || undefined,
        items: cart.map((i) => ({ menuItemId: i.menuItemId, variantId: i.variantId, name: i.name, price: i.price, qty: i.qty, modifierIds: i.modifierIds })),
      });
      setOrders((prev) => [...prev, { orderId, items: cart, status: { orderId, status: "pending", accepted: false, paid: false } }]);
      setCart([]);
      setCartOpen(false);
      setViewingMenu(false);
    } catch {
      toast.error("Failed to place order. Please try again.");
    } finally {
      setPlacing(false);
    }
  };

  // ── Handoff: request/respond to takeover requests ──

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
  if (tableLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ── Render: staff ended the sitting — session cleared, fresh start on refresh ──
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

  // ── Render: incoming take-over request prompt (host side) ──
  if (incomingHostRequest) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <Users className="h-12 w-12 mx-auto text-primary" />
          <h1 className="text-xl font-bold">Someone else wants to take over this table's session</h1>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => respondToHostRequest(false)}>Deny</Button>
            <Button className="flex-1 gradient-primary text-primary-foreground" onClick={() => respondToHostRequest(true)}>Approve</Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: viewer screen — another device at this table is already the host ──
  if (role === "viewer" && orders.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <Users className="h-16 w-16 mx-auto text-muted-foreground" />
          <h1 className="text-2xl font-bold">This table already has an active order</h1>
          <p className="text-muted-foreground">Someone else at this table is already placing an order.</p>
          {requestPending ? (
            requestTimedOut ? (
              <>
                <p className="text-sm text-muted-foreground">No response yet.</p>
                <Button className="w-full h-12 gradient-primary text-primary-foreground font-semibold" onClick={requestTakeover}>
                  Try Again
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Waiting for a response…</p>
            )
          ) : (
            <Button className="w-full h-12 gradient-primary text-primary-foreground font-semibold" onClick={requestTakeover}>
              Request to Take Over
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ── Render: order list — every order placed this sitting, each with its own live status ──
  if (orders.length > 0 && !viewingMenu) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-sm mx-auto space-y-4">
          <div className="text-center space-y-1">
            <Flame className="h-8 w-8 mx-auto text-primary" />
            <h1 className="font-bold text-lg">{restaurantName || "Your Orders"}</h1>
            <p className="text-xs text-muted-foreground">
              Table {table?.tableNumber}{table?.floor ? ` · ${table.floor}` : ""}
            </p>
            <button onClick={callWaiter} className="text-xs font-semibold text-primary underline underline-offset-2">
              Call Waiter
            </button>
          </div>
          {orders.map((o) => {
            const declined = o.status.status === "cancelled";
            const paid = o.status.paid;
            const confirmed = o.status.accepted && !declined && !paid;
            return (
              <div key={o.orderId} className="bg-card rounded-xl border border-border p-4 space-y-2">
                <div className="flex items-center gap-2">
                  {declined ? (
                    <XCircle className="h-5 w-5 text-destructive shrink-0" />
                  ) : paid || confirmed ? (
                    <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                  ) : (
                    <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
                  )}
                  <p className="font-semibold text-sm">
                    {declined ? "Order Declined" : paid ? "Bill Paid" : confirmed ? "Order Confirmed" : "Waiting for Confirmation"}
                  </p>
                </div>
                {declined && (
                  <p className="text-xs text-muted-foreground">
                    {o.status.rejectionReason || "The restaurant could not confirm this order."}
                  </p>
                )}
                <div className="space-y-1 pt-1 border-t border-border/50">
                  {o.items.map((item) => (
                    <div key={item.id} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{item.qty}x {item.name}</span>
                      <span>{currency} {(item.price * item.qty).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <Button
            className="w-full h-12 gradient-primary text-primary-foreground font-semibold"
            onClick={() => setViewingMenu(true)}
          >
            <Plus className="h-4 w-4 mr-2" /> Place Another Order
          </Button>
        </div>
      </div>
    );
  }

  // ── Render: entry gate (name/phone/guest count) ──
  if (!entryDone) {
    const cleanPhone = customerPhone.replace(/\D/g, "");
    const isPromoted = promotedGuestCount !== null;
    const canContinue = customerName.trim().length > 0 && cleanPhone.length === 11 && (isPromoted || guestCount >= 1);
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-5">
          <div className="text-center space-y-1">
            <Flame className="h-10 w-10 mx-auto text-primary" />
            <h1 className="font-bold text-xl">{restaurantName || "Welcome"}</h1>
            <p className="text-sm text-muted-foreground">
              Table {table?.tableNumber}{table?.floor ? ` · ${table.floor}` : ""}
            </p>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1"><User className="h-3.5 w-3.5" /> Your Name *</label>
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Full name" className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> Phone (11 Digits) *</label>
              <Input value={customerPhone} onChange={(e) => setCustomerPhone(formatPhoneNumber(e.target.value))} placeholder="0300-1234567" className="mt-1" />
            </div>
            {!isPromoted && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Guests (Pax) *</label>
                <div className="flex items-center gap-3 mt-1">
                  <Button type="button" variant="outline" size="icon" onClick={() => setGuestCount((g) => Math.max(1, g - 1))}><Minus className="h-4 w-4" /></Button>
                  <span className="font-bold text-lg w-8 text-center">{guestCount}</span>
                  <Button type="button" variant="outline" size="icon" onClick={() => setGuestCount((g) => Math.min(50, g + 1))}><Plus className="h-4 w-4" /></Button>
                </div>
              </div>
            )}
          </div>
          <Button className="w-full h-12 gradient-primary text-primary-foreground font-semibold" disabled={!canContinue || checkingCustomer} onClick={handleContinueToMenu}>
            {checkingCustomer ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Continue to Menu
          </Button>
        </div>
        {nameConflict && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6">
            <div className="bg-card rounded-2xl p-5 max-w-xs w-full space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                We have you as <span className="font-bold text-foreground">{nameConflict.savedName}</span> — keep this name, or use <span className="font-bold text-foreground">{nameConflict.typedName}</span>?
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => resolveNameConflict(false)}>Use "{nameConflict.typedName}"</Button>
                <Button className="flex-1 gradient-primary text-primary-foreground" onClick={() => resolveNameConflict(true)}>Keep "{nameConflict.savedName}"</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Main menu UI ──

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="sticky top-0 z-20 bg-card border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Flame className="h-6 w-6 text-primary" />
            <span className="font-bold text-primary text-lg">{restaurantName}</span>
          </div>
          {orders.length > 0 && (
            <button onClick={() => setViewingMenu(false)} className="text-xs font-semibold text-primary underline underline-offset-2">
              My Orders ({orders.length})
            </button>
          )}
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-xs text-muted-foreground">Table {table?.tableNumber} · Dine In · {guestCount} Guests</p>
          <button onClick={callWaiter} className="text-xs font-semibold text-primary underline underline-offset-2 shrink-0">
            Call Waiter
          </button>
        </div>
      </div>

      <div className="px-4 py-3 bg-card border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search menu..." className="pl-9 h-10" />
        </div>
      </div>

      <div className="px-4 py-2 bg-card border-b border-border overflow-x-auto">
        <div className="flex gap-2">
          {categories.map((c) => (
            <Button key={c} variant={catFilter === c ? "default" : "outline"} size="sm"
              className={cn("shrink-0", catFilter === c && "gradient-primary text-primary-foreground")}
              onClick={() => setCatFilter(c)}>
              {c}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 pb-24">
        {menuLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((item) => {
              const inCart = cart.find((c) => c.id === item.id || c.id.startsWith(`${item.id}-`));
              const isExpanded = expandedItemId === item.id;
              const hasVariants = item.variants.length > 0;
              const itemModifiers = resolveModifiers(item);
              const hasModifiers = itemModifiers.length > 0;

              return (
                <div key={item.id} className="bg-card rounded-xl border border-border overflow-hidden">
                  <div className="flex gap-3 p-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.category?.name}</p>
                      <p className="font-bold text-primary mt-1">
                        {hasVariants
                          ? `${currency} ${item.variants[0].price.toLocaleString()} - ${currency} ${item.variants[item.variants.length - 1].price.toLocaleString()}`
                          : `${currency} ${item.price.toLocaleString()}`}
                      </p>
                    </div>
                    <div className="flex items-center shrink-0">
                      {!hasVariants && !hasModifiers && inCart ? (
                        <div className="flex items-center gap-2">
                          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => updateQty(item.id, -1)}><Minus className="h-3 w-3" /></Button>
                          <span className="font-bold w-5 text-center">{inCart.qty}</span>
                          <Button size="icon" className="h-8 w-8 gradient-primary text-primary-foreground" onClick={() => updateQty(item.id, 1)}><Plus className="h-3 w-3" /></Button>
                        </div>
                      ) : (
                        <Button size="sm" className="gradient-primary text-primary-foreground" onClick={() => addToCart(item)}>
                          {isExpanded ? <ChevronUp className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                          {isExpanded ? "Close" : "Add"}
                        </Button>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-3 pb-3 pt-1 border-t border-border/50 bg-muted/30 space-y-3">
                      {hasVariants && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1.5">Choose Size</p>
                          <div className="flex gap-1.5 flex-wrap">
                            {item.variants.map((v) => (
                              <button key={v.name}
                                onClick={() => setSelectedVariant(selectedVariant?.name === v.name ? null : v)}
                                className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                                  selectedVariant?.name === v.name
                                    ? "gradient-primary text-primary-foreground border-transparent shadow-sm"
                                    : "bg-card border-border text-foreground hover:border-primary/50")}>
                                {v.name} · {currency} {v.price.toLocaleString()}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {hasModifiers && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1.5">Add Extras</p>
                          <div className="flex gap-1.5 flex-wrap">
                            {itemModifiers.map((mod) => (
                              <button key={mod.id}
                                onClick={() => setSelectedModifiers((prev) => prev.includes(mod.id) ? prev.filter((x) => x !== mod.id) : [...prev, mod.id])}
                                className={cn("px-2.5 py-1 rounded-lg text-xs border transition-all",
                                  selectedModifiers.includes(mod.id)
                                    ? "bg-primary/10 border-primary/50 text-primary font-semibold"
                                    : "bg-card border-border text-muted-foreground hover:border-primary/30")}>
                                {mod.name}{mod.price > 0 ? ` +${currency}${mod.price}` : ""}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <Button size="sm" className="w-full gradient-primary text-primary-foreground" onClick={() => confirmAddWithOptions(item)}>
                        <Plus className="h-3 w-3 mr-1" /> Add
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && <p className="text-center text-muted-foreground py-12 col-span-full">No items found</p>}
          </div>
        )}
      </div>

      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border p-4">
          <Button className="w-full h-12 gradient-primary text-primary-foreground text-base font-semibold" onClick={() => setCartOpen(true)}>
            <ShoppingCart className="h-5 w-5 mr-2" /> View Cart ({cartCount} items) · {currency} {cartTotal.toLocaleString()}
          </Button>
        </div>
      )}

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader><SheetTitle>Your Order</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-4">
            {cart.map((item) => (
              <div key={item.id} className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{item.name}</p>
                  {item.modifiers && item.modifiers.length > 0 && (
                    <p className="text-[10px] text-muted-foreground">+ {item.modifiers.join(", ")}</p>
                  )}
                  <p className="text-xs text-muted-foreground">{currency} {item.price} each</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(item.id, -1)}><Minus className="h-3 w-3" /></Button>
                  <span className="font-bold w-5 text-center text-sm">{item.qty}</span>
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(item.id, 1)}><Plus className="h-3 w-3" /></Button>
                  <span className="font-semibold text-sm w-16 text-right">{currency} {(item.price * item.qty).toLocaleString()}</span>
                </div>
              </div>
            ))}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Special Instructions</label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any special requests..." className="mt-1" rows={2} />
            </div>
            <div className="border-t border-border pt-3 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{currency} {cartTotal.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{taxName} ({taxRate}%)</span><span>{currency} {tax.toLocaleString()}</span></div>
              <div className="flex justify-between font-bold text-base pt-1 border-t border-border"><span>Total</span><span className="text-primary">{currency} {(cartTotal + tax).toLocaleString()}</span></div>
            </div>
            <Button className="w-full h-12 gradient-primary text-primary-foreground text-base font-semibold" disabled={placing} onClick={placeOrder}>
              {placing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />} Place Order
            </Button>
            <p className="text-center text-xs text-muted-foreground">💳 Pay at Counter</p>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default SelfOrder;

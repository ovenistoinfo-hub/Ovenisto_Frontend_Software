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

  // ── Placed-order waiting/status screen ──
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<SelfOrderStatus | null>(null);

  useEffect(() => {
    if (!tableId) { setTableError("No table specified — please scan the QR code on your table."); setTableLoading(false); return; }
    selfOrderService.getTable(tableId)
      .then(setTable)
      .catch(() => setTableError("This table could not be found. Please ask staff for help."))
      .finally(() => setTableLoading(false));
  }, [tableId]);

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

  // ── Poll order status until accepted or rejected ──
  const pollStatus = useCallback(() => {
    if (!placedOrderId) return;
    selfOrderService.getStatus(placedOrderId).then(setOrderStatus).catch(() => {});
  }, [placedOrderId]);
  useVisiblePolling(pollStatus, 4000, !!placedOrderId && !orderStatus?.accepted && orderStatus?.status !== "cancelled");

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

  const addToCart = (item: MenuItemRecord) => {
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

  const confirmAddWithOptions = (item: MenuItemRecord) => {
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
      setPlacedOrderId(orderId);
      setOrderStatus({ status: "pending", accepted: false });
      setCartOpen(false);
    } catch {
      toast.error("Failed to place order. Please try again.");
    } finally {
      setPlacing(false);
    }
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

  // ── Render: waiting/status screen after placing an order ──
  if (placedOrderId && orderStatus) {
    const declined = orderStatus.status === "cancelled";
    const confirmed = orderStatus.accepted && !declined;
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          {declined ? (
            <>
              <XCircle className="h-16 w-16 mx-auto text-destructive" />
              <h1 className="text-2xl font-bold">Order Declined</h1>
              <p className="text-muted-foreground">
                {orderStatus.rejectionReason || "The restaurant could not confirm this order."}
              </p>
              <p className="text-sm text-muted-foreground">Please speak to a staff member at Table {table?.tableNumber}.</p>
            </>
          ) : confirmed ? (
            <>
              <CheckCircle2 className="h-16 w-16 mx-auto text-success animate-bounce" />
              <h1 className="text-2xl font-bold">Order Confirmed!</h1>
              <p className="text-muted-foreground">
                Your order is being prepared in the kitchen. Enjoy your meal! Please pay your bill with your server or at the counter when finished.
              </p>
            </>
          ) : (
            <>
              <Loader2 className="h-16 w-16 mx-auto animate-spin text-primary" />
              <h1 className="text-2xl font-bold">Waiting for Confirmation</h1>
              <p className="text-muted-foreground">A staff member is reviewing your order.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Render: entry gate (name/phone/guest count) ──
  if (!entryDone) {
    const cleanPhone = customerPhone.replace(/\D/g, "");
    const canContinue = customerName.trim().length > 0 && cleanPhone.length === 11 && guestCount >= 1;
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
            <div>
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Guests (Pax) *</label>
              <div className="flex items-center gap-3 mt-1">
                <Button type="button" variant="outline" size="icon" onClick={() => setGuestCount((g) => Math.max(1, g - 1))}><Minus className="h-4 w-4" /></Button>
                <span className="font-bold text-lg w-8 text-center">{guestCount}</span>
                <Button type="button" variant="outline" size="icon" onClick={() => setGuestCount((g) => Math.min(50, g + 1))}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
          </div>
          <Button className="w-full h-12 gradient-primary text-primary-foreground font-semibold" disabled={!canContinue} onClick={() => setEntryDone(true)}>
            Continue to Menu
          </Button>
        </div>
      </div>
    );
  }

  // ── Main menu UI ──

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="sticky top-0 z-20 bg-card border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Flame className="h-6 w-6 text-primary" />
          <span className="font-bold text-primary text-lg">{restaurantName}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">Table {table?.tableNumber} · Dine In · {guestCount} Guests</p>
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

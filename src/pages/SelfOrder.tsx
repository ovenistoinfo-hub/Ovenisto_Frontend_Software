import { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Flame, Search, ShoppingCart, Plus, Minus, X, Check, Send, Tag, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useData } from "@/contexts/DataContext";
import { orderService } from "@/services/order.service";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { OrderType } from "@/data/mock-data";

interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
  image?: string;
  variant?: string;
  modifiers?: string[];
  modifiersCost?: number;
}

const SelfOrder = () => {
  const [searchParams] = useSearchParams();
  const tableNumber = searchParams.get("table") || "1";
  const { foodMenuItems, foodCategories, settings, modifiers: allModifiers, deals } = useData();

  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [orderPlaced, setOrderPlaced] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<OrderType>("Dine In");

  // Variant / modifier expansion
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<{ name: string; price: number } | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);

  // Deal dialog
  const [showDealDialog, setShowDealDialog] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<typeof activeDeals[0] | null>(null);
  const [dealGroupSelections, setDealGroupSelections] = useState<Record<string, string[]>>({});

  const availableItems = useMemo(() =>
    foodMenuItems.filter(i => i.available !== false), [foodMenuItems]);

  const filtered = useMemo(() => {
    let items = availableItems;
    if (catFilter !== "All" && catFilter !== "Deals") items = items.filter(i => i.category === catFilter);
    if (search) items = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
    return items;
  }, [availableItems, catFilter, search]);

  const categories = useMemo(() =>
    ["All", ...foodCategories.map(c => c.name), "Deals"], [foodCategories]);

  const activeModifiers = useMemo(() =>
    allModifiers.filter(m => m.status === "active"), [allModifiers]);

  const activeDeals = useMemo(() =>
    deals.filter(d => d.isActive && d.type === "optionCombo" && d.optionGroups && d.optionGroups.length > 0 &&
      (d.validTo === "always" || d.validTo >= new Date().toISOString().split("T")[0])),
    [deals]);

  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const tax = Math.round(cartTotal * (settings.taxRate / 100));
  const currency = settings.currency || "Rs.";

  // ── Cart helpers ──

  const addToCart = (item: typeof foodMenuItems[0]) => {
    const hasVariants = (item as any).variants && (item as any).variants.length > 0;
    const hasModifiers = activeModifiers.length > 0;

    if (!hasVariants && !hasModifiers) {
      // Simple add — no variants, no modifiers
      setCart(prev => {
        const existing = prev.find(c => c.id === item.id && !c.variant && (!c.modifiers || c.modifiers.length === 0));
        if (existing) return prev.map(c => c === existing ? { ...c, qty: c.qty + 1 } : c);
        return [...prev, { id: item.id, name: item.name, price: item.price, qty: 1, image: item.image }];
      });
      toast.success(`${item.name} added`);
      return;
    }

    // Toggle expansion panel
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

  const confirmAddWithOptions = (item: typeof foodMenuItems[0]) => {
    const variants = (item as any).variants as { name: string; price: number }[] | undefined;
    const hasVariants = variants && variants.length > 0;

    if (hasVariants && !selectedVariant) {
      toast.error("Please select a size");
      return;
    }

    const basePrice = selectedVariant ? selectedVariant.price : item.price;
    const modsCost = selectedModifiers.reduce((sum, mId) => {
      const mod = allModifiers.find(m => m.id === mId);
      return sum + (mod?.price || 0);
    }, 0);
    const totalPrice = basePrice + modsCost;
    const variantName = selectedVariant?.name || undefined;
    const modNames = selectedModifiers.map(mId => allModifiers.find(m => m.id === mId)?.name || "").filter(Boolean);
    const cartKey = `${item.id}-${variantName || "base"}-${selectedModifiers.sort().join("-")}`;

    setCart(prev => {
      const existing = prev.find(c => c.id === cartKey);
      if (existing) return prev.map(c => c.id === cartKey ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, {
        id: cartKey,
        name: variantName ? `${item.name} (${variantName})` : item.name,
        price: totalPrice,
        qty: 1,
        image: item.image,
        variant: variantName,
        modifiers: modNames,
        modifiersCost: modsCost,
      }];
    });

    toast.success(`${item.name}${variantName ? ` (${variantName})` : ""} added`);
    setExpandedItemId(null);
    setSelectedVariant(null);
    setSelectedModifiers([]);
  };

  const addWithoutExtras = (item: typeof foodMenuItems[0]) => {
    const variants = (item as any).variants as { name: string; price: number }[] | undefined;
    const hasVariants = variants && variants.length > 0;

    if (hasVariants && !selectedVariant) {
      toast.error("Please select a size first");
      return;
    }

    const basePrice = selectedVariant ? selectedVariant.price : item.price;
    const variantName = selectedVariant?.name || undefined;
    const cartKey = `${item.id}-${variantName || "base"}-no-extras`;

    setCart(prev => {
      const existing = prev.find(c => c.id === cartKey);
      if (existing) return prev.map(c => c.id === cartKey ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, {
        id: cartKey,
        name: variantName ? `${item.name} (${variantName})` : item.name,
        price: basePrice,
        qty: 1,
        image: item.image,
        variant: variantName,
      }];
    });

    toast.success(`${item.name} added without extras`);
    setExpandedItemId(null);
    setSelectedVariant(null);
    setSelectedModifiers([]);
  };

  const updateQty = (id: string, delta: number) => {
    setCart(prev => prev.map(c => c.id === id ? { ...c, qty: Math.max(0, c.qty + delta) } : c).filter(c => c.qty > 0));
  };

  // ── Deal helpers ──

  const openDealSelection = (deal: typeof activeDeals[0]) => {
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
    }]);
    setShowDealDialog(false);
    setSelectedDeal(null);
    toast.success(`${selectedDeal.name} added to cart`);
  };

  // ── Place order ──

  const placeOrder = async () => {
    if (cart.length === 0) return;
    try {
      const result = await orderService.createOrder({
        customerName: customerName || "Walk-in",
        phone: customerPhone || "",
        type: orderType,
        items: cart.map(i => ({ name: i.name, price: i.price, qty: i.qty, discount: 0, modifiers: i.modifiers || [] })),
        subtotal: cartTotal,
        discount: 0,
        tax,
        total: cartTotal + tax,
        paymentMethod: "Pay at Counter",
        tableNumber: orderType === "Dine In" ? Number(tableNumber) : undefined,
        staffName: "Self Order",
        orderSource: "self-order",
      });
      setOrderPlaced(result.orderNumber);
    } catch {
      toast.error("Failed to place order. Please try again.");
      return;
    }
    setTimeout(() => {
      setOrderPlaced(null);
      setCart([]);
      setCustomerName("");
      setCustomerPhone("");
      setNotes("");
    }, 5000);
  };

  // ── Order Placed success screen ──

  if (orderPlaced) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="h-20 w-20 mx-auto rounded-full bg-success/10 flex items-center justify-center">
            <Check className="h-10 w-10 text-success" />
          </div>
          <h1 className="text-2xl font-bold">Order Placed!</h1>
          {orderType === "Dine In" ? (
            <>
              <p className="text-muted-foreground">Your order <strong>#{orderPlaced}</strong> has been sent to the waiter for confirmation.</p>
              <p className="text-sm text-muted-foreground">Please wait at Table {tableNumber}.</p>
            </>
          ) : (
            <>
              <p className="text-muted-foreground">Your order <strong>#{orderPlaced}</strong> has been sent to the kitchen.</p>
              {orderType === "Take Away" && <p className="text-sm text-muted-foreground">Please collect your order at the counter.</p>}
            </>
          )}
          <div className="animate-pulse text-xs text-muted-foreground">Returning to menu...</div>
        </div>
      </div>
    );
  }

  // ── Main UI ──

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-card border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="h-6 w-6 text-primary" />
            <span className="font-bold text-primary text-lg">{settings.restaurantName}</span>
          </div>
          {/* Order Type Toggle */}
          <div className="flex bg-muted rounded-lg p-0.5 gap-0.5">
            {(["Dine In", "Take Away"] as const).map(t => (
              <button
                key={t}
                onClick={() => setOrderType(t)}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-md transition-all",
                  orderType === t ? "gradient-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {orderType === "Dine In" ? `Table ${tableNumber} · Dine In` : "Take Away"}
        </p>
      </div>

      {/* Search */}
      <div className="px-4 py-3 bg-card border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search menu..." className="pl-9 h-10" />
        </div>
      </div>

      {/* Categories */}
      <div className="px-4 py-2 bg-card border-b border-border overflow-x-auto">
        <div className="flex gap-2">
          {categories.map(c => (
            <Button key={c} variant={catFilter === c ? "default" : "outline"} size="sm"
              className={`shrink-0 ${catFilter === c ? "gradient-primary text-primary-foreground" : ""}`}
              onClick={() => setCatFilter(c)}>
              {c === "Deals" && <Tag className="h-3 w-3 mr-1" />}
              {c}
            </Button>
          ))}
        </div>
      </div>

      {/* Menu items or Deals */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-24">
        {catFilter === "Deals" ? (
          /* ── Deals View ── */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeDeals.length === 0 && <p className="text-center text-muted-foreground py-12 col-span-full">No active deals right now</p>}
            {activeDeals.map(deal => (
              <div key={deal.id} className="bg-card rounded-xl border border-border p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold text-sm">{deal.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{deal.description}</p>
                  </div>
                  <Badge className="gradient-primary text-primary-foreground shrink-0 ml-2">
                    {currency} {(deal.dealPrice || 0).toLocaleString()}
                  </Badge>
                </div>
                <Button size="sm" className="w-full gradient-primary text-primary-foreground" onClick={() => openDealSelection(deal)}>
                  <Plus className="h-4 w-4 mr-1" />Customize & Add
                </Button>
              </div>
            ))}
          </div>
        ) : (
          /* ── Menu Items View ── */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(item => {
              const inCart = cart.find(c => c.id === item.id || c.id.startsWith(`${item.id}-`));
              const isExpanded = expandedItemId === item.id;
              const variants = (item as any).variants as { name: string; price: number }[] | undefined;
              const hasVariants = variants && variants.length > 0;
              const hasModifiers = activeModifiers.length > 0;

              return (
                <div key={item.id} className="bg-card rounded-xl border border-border overflow-hidden">
                  <div className="flex gap-3 p-3">
                    {settings.selfOrder.showImages && (
                      <div className="h-20 w-20 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                        {item.image ? <img src={item.image} alt={item.name} className="h-full w-full object-cover" /> :
                          <span className="text-2xl">{item.name.charAt(0)}</span>}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.category}</p>
                      {settings.selfOrder.showDescriptions && (item as any).description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{(item as any).description}</p>
                      )}
                      <p className="font-bold text-primary mt-1">
                        {hasVariants
                          ? `${currency} ${variants![0].price.toLocaleString()} - ${currency} ${variants![variants!.length - 1].price.toLocaleString()}`
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

                  {/* Expansion Panel — Variant & Modifier Selection */}
                  {isExpanded && (
                    <div className="px-3 pb-3 pt-1 border-t border-border/50 bg-muted/30 space-y-3">
                      {/* Variant / Size Selection */}
                      {hasVariants && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1.5">Choose Size</p>
                          <div className="flex gap-1.5 flex-wrap">
                            {variants!.map(v => (
                              <button
                                key={v.name}
                                onClick={() => setSelectedVariant(selectedVariant?.name === v.name ? null : v)}
                                className={cn(
                                  "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                                  selectedVariant?.name === v.name
                                    ? "gradient-primary text-primary-foreground border-transparent shadow-sm"
                                    : "bg-card border-border text-foreground hover:border-primary/50"
                                )}
                              >
                                {v.name} · {currency} {v.price.toLocaleString()}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Modifier Selection */}
                      {hasModifiers && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1.5">Add Extras</p>
                          <div className="flex gap-1.5 flex-wrap">
                            {activeModifiers.map(mod => (
                              <button
                                key={mod.id}
                                onClick={() => setSelectedModifiers(prev =>
                                  prev.includes(mod.id) ? prev.filter(x => x !== mod.id) : [...prev, mod.id]
                                )}
                                className={cn(
                                  "px-2.5 py-1 rounded-lg text-xs border transition-all",
                                  selectedModifiers.includes(mod.id)
                                    ? "bg-primary/10 border-primary/50 text-primary font-semibold"
                                    : "bg-card border-border text-muted-foreground hover:border-primary/30"
                                )}
                              >
                                {mod.name}{mod.price > 0 ? ` +${currency}${mod.price}` : ""}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1 gradient-primary text-primary-foreground" onClick={() => confirmAddWithOptions(item)}>
                          <Plus className="h-3 w-3 mr-1" />
                          Add{selectedVariant ? ` · ${currency} ${(selectedVariant.price + selectedModifiers.reduce((s, mId) => s + (allModifiers.find(m => m.id === mId)?.price || 0), 0)).toLocaleString()}` : ""}
                        </Button>
                        {hasModifiers && (
                          <Button size="sm" variant="outline" className="text-xs" onClick={() => addWithoutExtras(item)}>
                            No Extras
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && <p className="text-center text-muted-foreground py-12 col-span-full">No items found</p>}
          </div>
        )}
      </div>

      {/* Sticky cart bar */}
      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border p-4">
          <Button className="w-full h-12 gradient-primary text-primary-foreground text-base font-semibold" onClick={() => setCartOpen(true)}>
            <ShoppingCart className="h-5 w-5 mr-2" />
            View Cart ({cartCount} items) · {currency} {cartTotal.toLocaleString()}
          </Button>
        </div>
      )}

      {/* Cart drawer */}
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader><SheetTitle>Your Order</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-4">
            {cart.map(item => (
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
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any special requests..." className="mt-1" rows={2} />
            </div>
            <div className="border-t border-border pt-3 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{currency} {cartTotal.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{settings.taxName} ({settings.taxRate}%)</span><span>{currency} {tax.toLocaleString()}</span></div>
              <div className="flex justify-between font-bold text-base pt-1 border-t border-border"><span>Total</span><span className="text-primary">{currency} {(cartTotal + tax).toLocaleString()}</span></div>
            </div>
            <div className="space-y-2">
              <Input placeholder="Your Name (optional)" value={customerName} onChange={e => setCustomerName(e.target.value)} />
              <Input placeholder="Phone (optional)" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
            </div>
            <Button className="w-full h-12 gradient-primary text-primary-foreground text-base font-semibold" onClick={placeOrder}>
              <Send className="h-4 w-4 mr-2" /> Place Order
            </Button>
            {settings.selfOrder.payAtCounter && (
              <p className="text-center text-xs text-muted-foreground">💳 Pay at Counter</p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Deal Selection Dialog */}
      <Dialog open={showDealDialog} onOpenChange={setShowDealDialog}>
        <DialogContent className="max-w-md w-[95vw] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">{selectedDeal?.name}</DialogTitle>
            <p className="text-xs text-muted-foreground">{selectedDeal?.description}</p>
          </DialogHeader>
          {selectedDeal?.optionGroups?.map(group => (
            <div key={group.id} className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">{group.label} (choose {group.maxSelections})</p>
              <div className="grid grid-cols-2 gap-1.5">
                {group.allowedItems.map(itemId => {
                  const menuItem = foodMenuItems.find(m => m.id === itemId);
                  if (!menuItem) return null;
                  const isSelected = dealGroupSelections[group.id]?.includes(itemId);
                  return (
                    <button
                      key={itemId}
                      onClick={() => toggleDealItemSelection(group.id, itemId, group.maxSelections)}
                      className={cn(
                        "text-left p-2.5 rounded-lg border text-xs transition-all",
                        isSelected
                          ? "border-primary bg-primary/10 text-primary font-semibold"
                          : "border-border bg-card text-foreground hover:border-primary/40"
                      )}
                    >
                      <p className="font-medium truncate">{menuItem.name}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <DialogFooter>
            <Button className="w-full gradient-primary text-primary-foreground" onClick={confirmDealToCart}>
              <Plus className="h-4 w-4 mr-1" /> Add Deal · {currency} {(selectedDeal?.dealPrice || 0).toLocaleString()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SelfOrder;

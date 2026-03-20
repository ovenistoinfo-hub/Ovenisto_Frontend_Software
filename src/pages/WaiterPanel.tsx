import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Plus, Minus, X, ShoppingCart, UtensilsCrossed, Clock, Users, Receipt, CircleDot, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/contexts/DataContext";
import { orderService } from "@/services/order.service";
import { PageHeader } from "@/components/ui/page-header";

interface OrderItem {
  id: string;
  name: string;
  price: number;
  qty: number;
  variant?: string;
  modifiers?: string[];
  modifiersCost?: number;
}

interface TableInfo {
  id: string; number: number; capacity: number;
  status: "available" | "occupied" | "bill-requested";
  orderItems?: OrderItem[];
  occupiedSince?: Date;
}

const initialTables: TableInfo[] = Array.from({ length: 12 }, (_, i) => ({
  id: String(i + 1), number: i + 1, capacity: i < 4 ? 2 : i < 8 ? 4 : 6,
  status: i < 5 ? "available" as const : i < 9 ? "occupied" as const : i < 11 ? "bill-requested" as const : "available" as const,
  orderItems: i >= 5 && i < 9 ? [{ id: "1", name: "Lahori Tikka", price: 550, qty: 1 }, { id: "2", name: "Pepsi 350ml", price: 100, qty: 2 }] : undefined,
  occupiedSince: i >= 5 && i < 11 ? new Date(Date.now() - (i - 4) * 15 * 60000) : undefined,
}));

const statusConfig: Record<string, { card: string; dot: string; bg: string; icon: string; label: string }> = {
  available: { card: "border-success/40 hover:border-success", dot: "bg-success", bg: "bg-success/8", icon: "text-success", label: "Available" },
  occupied: { card: "border-accent/40 hover:border-accent", dot: "bg-accent", bg: "bg-accent/8", icon: "text-accent", label: "Occupied" },
  "bill-requested": { card: "border-destructive/40 hover:border-destructive", dot: "bg-destructive", bg: "bg-destructive/8", icon: "text-destructive", label: "Bill Req." },
};

const WaiterPanel = () => {
  const navigate = useNavigate();
  const { foodMenuItems, settings, modifiers: allModifiers } = useData();
  const currency = settings.currency || "Rs.";
  const [tables, setTables] = useState<TableInfo[]>(initialTables);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [menuCategory, setMenuCategory] = useState("All");

  // Variant/modifier expansion
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<{ name: string; price: number } | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);

  const activeModifiers = allModifiers.filter(m => m.status === "active");

  const table = tables.find((t) => t.id === selectedTable);
  const stats = {
    available: tables.filter((t) => t.status === "available").length,
    occupied: tables.filter((t) => t.status === "occupied").length,
    bill: tables.filter((t) => t.status === "bill-requested").length,
  };
  const categories = ["All", ...new Set(foodMenuItems.map((i) => i.category))];
  const filteredMenu = foodMenuItems.filter((i) => (menuCategory === "All" || i.category === menuCategory) && i.available);

  // ── Add to order (with variants/modifiers support) ──

  const addToOrder = (item: typeof foodMenuItems[0]) => {
    const hasVariants = (item as any).variants && (item as any).variants.length > 0;
    const hasModifiers = activeModifiers.length > 0;

    if (!hasVariants && !hasModifiers) {
      // Simple add
      setOrderItems((prev) => {
        const ex = prev.find((o) => o.id === item.id && !o.variant && (!o.modifiers || o.modifiers.length === 0));
        if (ex) return prev.map((o) => o === ex ? { ...o, qty: o.qty + 1 } : o);
        return [...prev, { id: item.id, name: item.name, price: item.price, qty: 1 }];
      });
      toast.success(`${item.name} added`);
      return;
    }

    // Toggle expand
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

    setOrderItems(prev => {
      const existing = prev.find(c => c.id === cartKey);
      if (existing) return prev.map(c => c.id === cartKey ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, {
        id: cartKey,
        name: variantName ? `${item.name} (${variantName})` : item.name,
        price: totalPrice,
        qty: 1,
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

    setOrderItems(prev => {
      const existing = prev.find(c => c.id === cartKey);
      if (existing) return prev.map(c => c.id === cartKey ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, {
        id: cartKey,
        name: variantName ? `${item.name} (${variantName})` : item.name,
        price: basePrice,
        qty: 1,
        variant: variantName,
      }];
    });

    toast.success(`${item.name} added without extras`);
    setExpandedItemId(null);
    setSelectedVariant(null);
    setSelectedModifiers([]);
  };

  const updateQty = (id: string, d: number) => setOrderItems((p) => p.map((o) => o.id === id ? { ...o, qty: Math.max(1, o.qty + d) } : o));
  const removeOrderItem = (id: string) => setOrderItems((p) => p.filter((o) => o.id !== id));

  const placeOrder = async () => {
    if (orderItems.length === 0 || !selectedTable) return;
    const tableNum = tables.find(t => t.id === selectedTable)?.number || 0;
    const subtotal = orderItems.reduce((s, i) => s + i.price * i.qty, 0);
    const tax = Math.round(subtotal * (settings.taxRate / 100));
    const total = subtotal + tax;
    try {
      await orderService.createOrder({
        type: "Dine In",
        staffName: "Waiter",
        tableNumber: tableNum,
        subtotal, discount: 0, tax, total,
        paymentMethod: "Cash",
        items: orderItems.map(i => ({ name: i.name, price: i.price, qty: i.qty, discount: 0, modifiers: i.modifiers || [] })),
      });
      setTables(p => p.map(t => t.id === selectedTable ? { ...t, status: "occupied", orderItems, occupiedSince: new Date() } : t));
      toast.success("Order sent to kitchen!");
      setOrderItems([]);
    } catch {
      toast.error("Failed to send order");
    }
  };

  const requestBill = () => { setTables((p) => p.map((t) => t.id === selectedTable ? { ...t, status: "bill-requested" } : t)); toast.success("Bill requested"); };
  const markAvailable = () => { setTables((p) => p.map((t) => t.id === selectedTable ? { ...t, status: "available", orderItems: undefined, occupiedSince: undefined } : t)); toast.success("Table marked as available"); setSelectedTable(null); };
  const getElapsed = (date?: Date) => date ? `${Math.floor((Date.now() - date.getTime()) / 60000)} min` : "";
  const orderTotal = orderItems.reduce((s, o) => s + o.price * o.qty, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        icon={<UtensilsCrossed className="h-5 w-5" />}
        title="Waiter Panel"
        subtitle="Manage tables and take orders"
        actions={
          <Button className="gradient-primary text-primary-foreground shadow-md hover:shadow-lg transition-all rounded-lg" onClick={() => navigate("/pos")}>
            <ShoppingCart className="h-4 w-4 mr-2" />New Order (POS)
          </Button>
        }
      />

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border-success/30 bg-success/5 rounded-xl overflow-hidden">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
              <CircleDot className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold text-success">{stats.available}</p>
              <p className="text-xs text-muted-foreground font-medium">Available</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-accent/30 bg-accent/5 rounded-xl overflow-hidden">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
              <Users className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="text-2xl font-bold text-accent">{stats.occupied}</p>
              <p className="text-xs text-muted-foreground font-medium">Occupied</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-destructive/30 bg-destructive/5 rounded-xl overflow-hidden">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
              <Receipt className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold text-destructive">{stats.bill}</p>
              <p className="text-xs text-muted-foreground font-medium">Bill Requested</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Legend */}
      <div className="flex gap-4 flex-wrap">
        {Object.entries(statusConfig).map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <div className={cn("h-2.5 w-2.5 rounded-full shadow-sm", cfg.dot)} />
            <span>{cfg.label}</span>
          </div>
        ))}
      </div>

      {/* Table Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {tables.map((t) => {
          const cfg = statusConfig[t.status];
          return (
            <Card
              key={t.id}
              onClick={() => { setSelectedTable(t.id); if (t.status === "available") setOrderItems([]); else setOrderItems(t.orderItems || []); setExpandedItemId(null); }}
              className={cn(
                "cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-1 border-2 rounded-xl group relative overflow-hidden",
                cfg.card,
                selectedTable === t.id && "ring-2 ring-primary ring-offset-2 shadow-lg"
              )}
            >
              {/* Subtle background glow */}
              <div className={cn("absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300", cfg.bg)} />
              <CardContent className="p-5 text-center relative z-10">
                <div className={cn("h-14 w-14 rounded-2xl mx-auto mb-3 flex items-center justify-center transition-transform group-hover:scale-110 shadow-sm", cfg.bg)}>
                  <UtensilsCrossed className={cn("h-7 w-7", cfg.icon)} />
                </div>
                <p className="text-lg font-bold tracking-tight text-foreground">Table {t.number}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t.capacity} seats</p>
                {t.occupiedSince && (
                  <div className="flex items-center justify-center gap-1 mt-1.5 text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span className="text-[10px] font-medium">{getElapsed(t.occupiedSince)}</span>
                  </div>
                )}
                <Badge
                  variant="secondary"
                  className={cn(
                    "text-[10px] mt-2.5 rounded-full px-2.5 py-0.5 font-semibold border shadow-sm",
                    t.status === "available" && "bg-success/10 text-success border-success/20",
                    t.status === "occupied" && "bg-accent/10 text-accent border-accent/20",
                    t.status === "bill-requested" && "bg-destructive/10 text-destructive border-destructive/20",
                  )}
                >
                  {t.status === "bill-requested" ? "Bill Req." : t.status.charAt(0).toUpperCase() + t.status.slice(1)}
                </Badge>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Sheet Panel */}
      <Sheet open={!!selectedTable} onOpenChange={() => setSelectedTable(null)}>
        <SheetContent className="w-[460px] sm:w-[520px] overflow-y-auto p-0">
          {/* Sheet Header */}
          <div className="sticky top-0 z-10 bg-card border-b border-border/60 px-6 py-4">
            <SheetHeader className="space-y-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "h-10 w-10 rounded-xl flex items-center justify-center shadow-sm",
                    table && statusConfig[table.status].bg
                  )}>
                    <UtensilsCrossed className={cn("h-5 w-5", table && statusConfig[table.status].icon)} />
                  </div>
                  <div>
                    <SheetTitle className="text-lg font-bold tracking-tight">Table {table?.number}</SheetTitle>
                    <p className="text-xs text-muted-foreground">{table?.capacity} seats</p>
                  </div>
                </div>
                {table && (
                  <Badge
                    variant="secondary"
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-semibold border shadow-sm",
                      table.status === "available" && "bg-success/10 text-success border-success/20",
                      table.status === "occupied" && "bg-accent/10 text-accent border-accent/20",
                      table.status === "bill-requested" && "bg-destructive/10 text-destructive border-destructive/20",
                    )}
                  >
                    {table.status === "bill-requested" ? "Bill Requested" : table.status.charAt(0).toUpperCase() + table.status.slice(1)}
                  </Badge>
                )}
              </div>
            </SheetHeader>
            {table?.occupiedSince && (
              <div className="flex items-center gap-1.5 mt-2 text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">Occupied for {getElapsed(table.occupiedSince)}</span>
              </div>
            )}
          </div>

          {table && (
            <div className="px-6 py-5 space-y-5">
              {/* Order Items */}
              {orderItems.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-bold tracking-tight text-foreground flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-primary" />
                    Order Items
                  </h4>
                  <div className="border border-border/60 rounded-xl overflow-hidden bg-card">
                    {orderItems.map((item, idx) => (
                      <div key={item.id} className={cn("flex items-center justify-between px-4 py-3 text-sm", idx !== orderItems.length - 1 && "border-b border-border/40")}>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-foreground">{item.name}</span>
                          {item.modifiers && item.modifiers.length > 0 && (
                            <p className="text-[10px] text-muted-foreground">+ {item.modifiers.join(", ")}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="icon" className="h-7 w-7 rounded-lg border-border/50" onClick={() => updateQty(item.id, -1)}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-7 text-center font-bold text-foreground">{item.qty}</span>
                          <Button variant="outline" size="icon" className="h-7 w-7 rounded-lg border-border/50" onClick={() => updateQty(item.id, 1)}>
                            <Plus className="h-3 w-3" />
                          </Button>
                          <span className="w-20 text-right font-semibold text-foreground">{currency} {(item.price * item.qty).toLocaleString()}</span>
                          <button onClick={() => removeOrderItem(item.id)} className="text-destructive/60 hover:text-destructive transition-colors ml-1 p-1 rounded-md hover:bg-destructive/5">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <Separator />
                    <div className="flex justify-between items-center px-4 py-3 bg-muted/30">
                      <span className="font-bold text-foreground">Total</span>
                      <span className="font-bold text-lg text-primary">{currency} {orderTotal.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Menu Selection */}
              {(table.status === "available" || table.status === "occupied") && (
                <div className="space-y-3">
                  <h4 className="text-sm font-bold tracking-tight text-foreground">
                    {table.status === "available" ? "Start New Order" : "Add More Items"}
                  </h4>
                  <div className="flex gap-1.5 flex-wrap">
                    {categories.map((c) => (
                      <Button
                        key={c}
                        variant={menuCategory === c ? "default" : "outline"}
                        size="sm"
                        className={cn(
                          "text-xs rounded-full px-3 h-7 transition-all",
                          menuCategory === c && "gradient-primary text-primary-foreground shadow-sm"
                        )}
                        onClick={() => setMenuCategory(c)}
                      >
                        {c}
                      </Button>
                    ))}
                  </div>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                    {filteredMenu.map((item) => {
                      const variants = (item as any).variants as { name: string; price: number }[] | undefined;
                      const hasVariants = variants && variants.length > 0;
                      const hasModifiers = activeModifiers.length > 0;
                      const isExpanded = expandedItemId === item.id;

                      return (
                        <div key={item.id} className="border border-border/50 rounded-xl overflow-hidden bg-card">
                          {/* Item Row */}
                          <button
                            onClick={() => addToOrder(item)}
                            className="w-full text-left flex items-center gap-3 p-2.5 hover:bg-muted/40 transition-all group/item"
                          >
                            {/* Image */}
                            <div className="h-11 w-11 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                              {item.image ? (
                                <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                              ) : (
                                <div className="h-full w-full gradient-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
                                  {item.name.charAt(0)}
                                </div>
                              )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-xs text-foreground truncate group-hover/item:text-primary transition-colors">{item.name}</p>
                              <p className="text-primary font-bold text-xs mt-0.5">
                                {hasVariants
                                  ? `${currency} ${variants![0].price} - ${currency} ${variants![variants!.length - 1].price}`
                                  : `${currency} ${item.price.toLocaleString()}`}
                              </p>
                            </div>

                            {/* Add indicator */}
                            <div className="shrink-0">
                              {(hasVariants || hasModifiers) ? (
                                <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center border transition-all", isExpanded ? "gradient-primary text-primary-foreground border-transparent" : "border-border text-muted-foreground hover:border-primary/50")}>
                                  {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                </div>
                              ) : (
                                <div className="h-7 w-7 rounded-lg flex items-center justify-center border border-border text-primary hover:bg-primary/5 transition-all">
                                  <Plus className="h-3.5 w-3.5" />
                                </div>
                              )}
                            </div>
                          </button>

                          {/* Expansion Panel — Variant & Modifier Selection */}
                          {isExpanded && (
                            <div className="px-2.5 pb-2.5 pt-1 border-t border-border/50 bg-muted/30 space-y-2.5">
                              {/* Variant / Size Selection */}
                              {hasVariants && (
                                <div>
                                  <p className="text-[10px] font-semibold text-muted-foreground mb-1">Choose Size</p>
                                  <div className="flex gap-1 flex-wrap">
                                    {variants!.map(v => (
                                      <button
                                        key={v.name}
                                        onClick={() => setSelectedVariant(selectedVariant?.name === v.name ? null : v)}
                                        className={cn(
                                          "px-2 py-1 rounded-md text-[10px] font-semibold border transition-all",
                                          selectedVariant?.name === v.name
                                            ? "gradient-primary text-primary-foreground border-transparent shadow-sm"
                                            : "bg-card border-border text-foreground hover:border-primary/50"
                                        )}
                                      >
                                        {v.name} · {currency} {v.price}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Modifier Selection */}
                              {hasModifiers && (
                                <div>
                                  <p className="text-[10px] font-semibold text-muted-foreground mb-1">Add Extras</p>
                                  <div className="flex gap-1 flex-wrap">
                                    {activeModifiers.map(mod => (
                                      <button
                                        key={mod.id}
                                        onClick={() => setSelectedModifiers(prev =>
                                          prev.includes(mod.id) ? prev.filter(x => x !== mod.id) : [...prev, mod.id]
                                        )}
                                        className={cn(
                                          "px-2 py-1 rounded-md text-[10px] border transition-all",
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
                              <div className="flex gap-1.5">
                                <Button size="sm" className="flex-1 gradient-primary text-primary-foreground text-[10px] h-7" onClick={() => confirmAddWithOptions(item)}>
                                  <Plus className="h-3 w-3 mr-0.5" />Add
                                  {selectedVariant ? ` · ${currency} ${(selectedVariant.price + selectedModifiers.reduce((s, mId) => s + (allModifiers.find(m => m.id === mId)?.price || 0), 0))}` : ""}
                                </Button>
                                {hasModifiers && (
                                  <Button size="sm" variant="outline" className="text-[10px] h-7" onClick={() => addWithoutExtras(item)}>
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
              )}

              {/* Action Buttons */}
              <div className="flex flex-col gap-2.5 pt-2">
                {(table.status === "available" || table.status === "occupied") && orderItems.length > 0 && (
                  <Button className="gradient-primary text-primary-foreground min-h-[46px] rounded-xl shadow-md hover:shadow-lg transition-all text-sm font-semibold" onClick={placeOrder}>
                    <ShoppingCart className="h-4 w-4 mr-2" />
                    {table.status === "available" ? "Place Order" : "Update Order"}
                  </Button>
                )}
                {table.status === "occupied" && (
                  <Button variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/5 min-h-[44px] rounded-xl transition-all text-sm font-medium" onClick={requestBill}>
                    <Receipt className="h-4 w-4 mr-2" />
                    Request Bill
                  </Button>
                )}
                {(table.status === "occupied" || table.status === "bill-requested") && (
                  <Button variant="outline" className="text-success border-success/30 hover:bg-success/5 min-h-[44px] rounded-xl transition-all text-sm font-medium" onClick={markAvailable}>
                    <CircleDot className="h-4 w-4 mr-2" />
                    Mark Available
                  </Button>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default WaiterPanel;

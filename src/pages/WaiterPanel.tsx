import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  Plus, Minus, X, ShoppingCart, UtensilsCrossed, Clock, Users,
  Receipt, CircleDot, ChevronDown, ChevronUp, Bell, Check, Loader2, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/contexts/DataContext";
import { orderService, type OrderRecord } from "@/services/order.service";
import { menuService, type MenuItemRecord, type CategoryRecord, type ModifierRecord, type MenuItemVariant } from "@/services/menu.service";
import { tableService, type TableRecord } from "@/services/table.service";
import { settingsService } from "@/services/settings.service";
import { PageHeader } from "@/components/ui/page-header";

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

type TableStatus = keyof typeof statusConfig;
const ACTIVE_STATUSES = ["pending", "preparing", "ready"];
const POLL_INTERVAL   = 15_000;

// ─── Component ─────────────────────────────────────────────────────────────

const WaiterPanel = () => {
  const { settings } = useData();
  const currency = settings.currency || "Rs.";

  // ── Backend data ──
  const [tables,    setTables]    = useState<TableRecord[]>([]);
  const [orders,    setOrders]    = useState<OrderRecord[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItemRecord[]>([]);
  const [cats,      setCats]      = useState<CategoryRecord[]>([]);
  const [globalMods, setGlobalMods] = useState<ModifierRecord[]>([]);
  const [loading,   setLoading]   = useState(true);

  // ── Local UI state ──
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

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load data ──

  const loadOrders = useCallback(async () => {
    try {
      const res = await orderService.getOrders({ limit: 200 });
      setOrders(res.data);
    } catch { /* silent polling */ }
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const [tableData, itemData, catData, modData, apiSettings] = await Promise.all([
          tableService.getTables(),
          menuService.getMenuItems({ available: true, limit: 200 }),
          menuService.getCategories("active"),
          menuService.getModifiers(),
          settingsService.getSettings(),
        ]);
        setTables(tableData);
        setMenuItems(itemData);
        setCats(catData);
        setGlobalMods(modData.filter((m) => m.status === "active"));
        setTaxRate(Number(apiSettings.taxRate) ?? 0);
      } catch {
        toast.error("Failed to load data");
      } finally {
        setLoading(false);
      }
    };
    init();
    loadOrders();
    pollingRef.current = setInterval(loadOrders, POLL_INTERVAL);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [loadOrders]);

  // ── Derived ──

  const getTableStatus = (tableNum: number): TableStatus => {
    if (billReqSet.has(tableNum)) return "bill-requested";
    return orders.some((o) => o.tableNumber === tableNum && ACTIVE_STATUSES.includes(o.status))
      ? "occupied" : "available";
  };

  const getTableOrders = (tableNum: number) =>
    orders.filter((o) => o.tableNumber === tableNum && ACTIVE_STATUSES.includes(o.status));

  const pendingSelfOrders = orders.filter(
    (o) => o.type === "Self Order" && o.status === "pending"
  );

  const selectedTable    = tables.find((t) => t.id === selectedTableId) ?? null;
  const selectedTableNum = selectedTable ? Number(selectedTable.number) : null;
  const tableStatus: TableStatus = selectedTable ? getTableStatus(Number(selectedTable.number)) : "available";
  const activeTableOrders = selectedTableNum !== null ? getTableOrders(selectedTableNum) : [];

  const stats = {
    available: tables.filter((t) => getTableStatus(Number(t.number)) === "available").length,
    occupied:  tables.filter((t) => getTableStatus(Number(t.number)) === "occupied").length,
    bill:      tables.filter((t) => getTableStatus(Number(t.number)) === "bill-requested").length,
  };

  const categoryNames = ["All", ...cats.map((c) => c.name)];
  const filteredMenu   = menuItems.filter(
    (i) => menuCategory === "All" || i.category?.name === menuCategory
  );
  const cartTotal = cartItems.reduce((s, i) => s + i.price * i.qty, 0);

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

  const placeOrder = async () => {
    if (cartItems.length === 0 || selectedTableNum === null) return;
    setPlacingOrder(true);
    const subtotal = cartTotal;
    const tax      = Math.round(subtotal * (taxRate / 100));
    const total    = subtotal + tax;
    try {
      await orderService.createOrder({
        type: "Dine In",
        tableNumber: selectedTableNum,
        customerName: "Walk-in",
        subtotal, discount: 0, tax, total,
        paymentMethod: "Cash",
        orderSource: "waiter",
        items: cartItems.map((i) => ({
          menuItemId: i.menuItemId || null,
          variantId: i.variantId || null,
          cookingTime: i.cookingTime ?? null,
          name: i.name, price: i.price, qty: i.qty, discount: 0, modifiers: i.modifiers ?? [],
        })),
      });
      toast.success("Order sent to kitchen!");
      setCartItems([]);
      await loadOrders();
    } catch {
      toast.error("Failed to send order");
    } finally {
      setPlacingOrder(false);
    }
  };

  const requestBill = () => {
    if (selectedTableNum === null) return;
    setBillReqSet((p) => new Set(p).add(selectedTableNum));
    toast.success("Bill requested");
  };

  const markAvailable = async () => {
    if (selectedTableNum === null) return;
    try {
      await Promise.all(getTableOrders(selectedTableNum).map((o) => orderService.updateOrderStatus(o.id, "completed")));
    } catch { /* best effort */ }
    setBillReqSet((p) => { const n = new Set(p); n.delete(selectedTableNum!); return n; });
    toast.success("Table marked as available");
    setSelectedTableId(null);
    setCartItems([]);
    await loadOrders();
  };

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
      {/* Header — no POS button */}
      <PageHeader
        icon={<UtensilsCrossed className="h-5 w-5" />}
        title="Waiter Panel"
        subtitle="Manage tables and take orders"
      />

      {/* ── Self-Order Pending Requests Banner ── */}
      {pendingSelfOrders.length > 0 && (
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

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { count: stats.available, label: "Available", color: "success", Icon: CircleDot },
          { count: stats.occupied,  label: "Occupied",  color: "accent",  Icon: Users },
          { count: stats.bill,      label: "Bill Req.", color: "destructive", Icon: Receipt },
        ].map(({ count, label, color, Icon }) => (
          <Card key={label} className={`border-${color}/30 bg-${color}/5 rounded-xl overflow-hidden`}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`h-9 w-9 rounded-xl bg-${color}/10 flex items-center justify-center shrink-0`}>
                <Icon className={`h-5 w-5 text-${color}`} />
              </div>
              <div>
                <p className={`text-2xl font-bold text-${color}`}>{count}</p>
                <p className="text-xs text-muted-foreground font-medium">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Legend */}
      <div className="flex gap-5 flex-wrap">
        {Object.entries(statusConfig).map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <div className={cn("h-2.5 w-2.5 rounded-full", cfg.dot)} />
            <span>{cfg.label}</span>
          </div>
        ))}
      </div>

      {/* Table Grid */}
      {tables.length === 0 ? (
        <Card className="rounded-xl border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
            <UtensilsCrossed className="h-10 w-10 opacity-30" />
            <p className="text-sm font-medium">No tables configured</p>
            <p className="text-xs">Go to Table Layout to add tables</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {tables.map((t) => {
            const tNum    = Number(t.number);
            const status  = getTableStatus(tNum);
            const cfg     = statusConfig[status];
            const tOrders = getTableOrders(tNum);
            const oldest  = tOrders.length > 0 ? tOrders[tOrders.length - 1].createdAt : null;

            return (
              <Card
                key={t.id}
                onClick={() => handleTableClick(t)}
                className={cn(
                  "cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 border-2 rounded-xl group relative overflow-hidden",
                  cfg.card,
                  selectedTableId === t.id && "ring-2 ring-primary ring-offset-2 shadow-lg"
                )}
              >
                <div className={cn("absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity", cfg.bg)} />
                <CardContent className="p-4 text-center relative z-10">
                  <div className={cn("h-12 w-12 rounded-2xl mx-auto mb-2 flex items-center justify-center shadow-sm", cfg.bg)}>
                    <UtensilsCrossed className={cn("h-6 w-6", cfg.icon)} />
                  </div>
                  <p className="text-base font-bold text-foreground">T-{t.number}</p>
                  <p className="text-[10px] text-muted-foreground">{t.capacity} seats</p>
                  {status === "occupied" && oldest && (
                    <div className="flex items-center justify-center gap-0.5 mt-1 text-muted-foreground">
                      <Clock className="h-2.5 w-2.5" />
                      <span className="text-[9px] font-medium">{getElapsed(oldest)}</span>
                    </div>
                  )}
                  <Badge
                    variant="secondary"
                    className={cn(
                      "text-[9px] mt-2 rounded-full px-2 py-0.5 font-semibold border",
                      status === "available"        && "bg-success/10 text-success border-success/20",
                      status === "occupied"         && "bg-accent/10 text-accent border-accent/20",
                      status === "bill-requested"   && "bg-destructive/10 text-destructive border-destructive/20",
                    )}
                  >
                    {status === "bill-requested" ? "Bill" : cfg.label}
                  </Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Order Sheet ── */}
      <Sheet open={!!selectedTableId} onOpenChange={() => { setSelectedTableId(null); setCartItems([]); resetExpansion(); }}>
        <SheetContent className="w-full sm:w-[680px] sm:max-w-[680px] overflow-y-auto p-0 flex flex-col">

          {/* Sheet Header */}
          <div className="sticky top-0 z-10 bg-card border-b border-border/60 px-5 py-4 shrink-0">
            <SheetHeader className="space-y-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shadow-sm", statusConfig[tableStatus].bg)}>
                    <UtensilsCrossed className={cn("h-5 w-5", statusConfig[tableStatus].icon)} />
                  </div>
                  <div>
                    <SheetTitle className="text-base font-bold">Table {selectedTable?.number}</SheetTitle>
                    <p className="text-xs text-muted-foreground">
                      {selectedTable?.capacity} seats{selectedTable?.floor ? ` · ${selectedTable.floor}` : ""}
                    </p>
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold border",
                    tableStatus === "available"      && "bg-success/10 text-success border-success/20",
                    tableStatus === "occupied"       && "bg-accent/10 text-accent border-accent/20",
                    tableStatus === "bill-requested" && "bg-destructive/10 text-destructive border-destructive/20",
                  )}
                >
                  {tableStatus === "bill-requested" ? "Bill Requested" : statusConfig[tableStatus].label}
                </Badge>
              </div>
            </SheetHeader>
          </div>

          {selectedTable && (
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

              {/* Active orders on this table */}
              {activeTableOrders.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />Active Orders
                  </h4>
                  {activeTableOrders.map((o) => (
                    <div key={o.id} className="border border-border/50 rounded-xl bg-muted/30 px-4 py-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-bold text-foreground">{o.orderNumber}</span>
                        <Badge variant="secondary" className="text-[10px] rounded-full capitalize px-2">{o.status}</Badge>
                      </div>
                      <div className="space-y-0.5">
                        {o.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-xs text-muted-foreground">
                            <span>{item.name} ×{item.qty}</span>
                            <span>{currency} {(item.price * item.qty).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                      <Separator className="my-2" />
                      <div className="flex justify-between text-xs font-bold">
                        <span>Total</span>
                        <span className="text-primary">{currency} {o.total.toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Cart */}
              {cartItems.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <ShoppingCart className="h-3.5 w-3.5" />New Order
                    </h4>
                    <button onClick={() => setCartItems([])} className="text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors">
                      <Trash2 className="h-3 w-3" />Clear
                    </button>
                  </div>
                  <div className="border border-border/60 rounded-xl overflow-hidden bg-card">
                    {cartItems.map((item, idx) => (
                      <div key={item.id} className={cn("flex items-center gap-3 px-4 py-2.5", idx !== cartItems.length - 1 && "border-b border-border/40")}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground leading-tight">{item.name}</p>
                          {item.modifiers && item.modifiers.length > 0 && (
                            <p className="text-[10px] text-muted-foreground">+{item.modifiers.join(", ")}</p>
                          )}
                          <p className="text-xs text-primary font-semibold mt-0.5">{currency} {item.price.toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button variant="outline" size="icon" className="h-7 w-7 rounded-lg" onClick={() => updateQty(item.id, -1)}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-6 text-center text-sm font-bold">{item.qty}</span>
                          <Button variant="outline" size="icon" className="h-7 w-7 rounded-lg" onClick={() => updateQty(item.id, 1)}>
                            <Plus className="h-3 w-3" />
                          </Button>
                          <span className="w-16 text-right text-sm font-semibold text-foreground">{currency} {(item.price * item.qty).toLocaleString()}</span>
                          <button onClick={() => removeCartItem(item.id)} className="text-muted-foreground/50 hover:text-destructive transition-colors p-1 ml-1">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <Separator />
                    <div className="flex justify-between items-center px-4 py-3 bg-muted/20">
                      <span className="text-sm font-bold">Total</span>
                      <span className="text-lg font-bold text-primary">{currency} {cartTotal.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Menu Selection */}
              {(tableStatus === "available" || tableStatus === "occupied") && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {tableStatus === "available" ? "Start Order" : "Add Items"}
                  </h4>

                  {/* Category tabs */}
                  <div className="flex gap-1.5 flex-wrap">
                    {categoryNames.map((c) => (
                      <button
                        key={c}
                        onClick={() => { setMenuCategory(c); resetExpansion(); }}
                        className={cn(
                          "px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all border",
                          menuCategory === c
                            ? "gradient-primary text-primary-foreground border-transparent shadow-sm"
                            : "bg-card border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                        )}
                      >
                        {c}
                      </button>
                    ))}
                  </div>

                  {/* 2-column menu grid */}
                  <div className="grid grid-cols-2 gap-2 max-h-[480px] overflow-y-auto pr-0.5">
                    {filteredMenu.map((item) => {
                      const hasVariants  = item.variants && item.variants.length > 0;
                      const itemMods     = resolveModifiers(item);
                      const hasModifiers = itemMods.length > 0;
                      const isExpanded   = expandedItemId === item.id;
                      const baseItemPrice = dineInPrice(item);

                      return (
                        <div key={item.id} className={cn("border rounded-xl overflow-hidden bg-card transition-all", isExpanded ? "col-span-2 border-primary/40" : "border-border/50 hover:border-primary/30 hover:shadow-sm")}>
                          {/* Item tile */}
                          <button
                            onClick={() => addToOrder(item)}
                            className="w-full text-left flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors group/item"
                          >
                            {/* Image / initial */}
                            <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                              {item.image
                                ? <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                                : <div className="h-full w-full gradient-primary flex items-center justify-center text-primary-foreground text-sm font-bold">{item.name.charAt(0)}</div>
                              }
                            </div>
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-foreground leading-tight line-clamp-2 group-hover/item:text-primary transition-colors">{item.name}</p>
                              <p className="text-sm font-bold text-primary mt-0.5">
                                {hasVariants
                                  ? `${currency} ${variantDineInPrice(item.variants[0])}–${variantDineInPrice(item.variants[item.variants.length - 1])}`
                                  : `${currency} ${baseItemPrice.toLocaleString()}`}
                              </p>
                              {item.dineInPrice !== null && item.dineInPrice !== undefined && item.dineInPrice !== item.price && (
                                <p className="text-[9px] text-muted-foreground line-through">{currency} {item.price}</p>
                              )}
                            </div>
                            {/* Action icon */}
                            <div className="shrink-0">
                              {(hasVariants || hasModifiers) ? (
                                <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center border transition-all",
                                  isExpanded ? "gradient-primary text-primary-foreground border-transparent" : "border-border text-muted-foreground")}>
                                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </div>
                              ) : (
                                <div className="h-8 w-8 rounded-lg flex items-center justify-center border border-border text-primary hover:bg-primary/5 transition-all">
                                  <Plus className="h-4 w-4" />
                                </div>
                              )}
                            </div>
                          </button>

                          {/* Expansion: variants + modifiers */}
                          {isExpanded && (
                            <div className="px-3 pb-3 pt-2 border-t border-border/40 bg-muted/20 space-y-3">
                              {/* Variants */}
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
                                              : "bg-card border-border text-foreground hover:border-primary/50"
                                          )}
                                        >
                                          {v.name} · {currency} {vPrice.toLocaleString()}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Item-specific / global modifiers */}
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
                                            : "bg-card border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                                        )}
                                      >
                                        {mod.name}{mod.price > 0 ? ` +${currency}${mod.price}` : ""}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Add buttons */}
                              <div className="flex gap-2 pt-1">
                                <Button
                                  size="sm"
                                  className="flex-1 gradient-primary text-primary-foreground h-9 text-xs font-semibold rounded-lg"
                                  onClick={() => confirmAddWithOptions(item)}
                                >
                                  <Plus className="h-3.5 w-3.5 mr-1" />
                                  Add to Order
                                  {selectedVariant && ` · ${currency} ${(selectedVariant.price + selectedModifiers.reduce((s, mId) => s + (itemMods.find((m) => m.id === mId)?.price ?? 0), 0)).toLocaleString()}`}
                                </Button>
                                {hasModifiers && (
                                  <Button size="sm" variant="outline" className="h-9 text-xs rounded-lg" onClick={() => addWithoutExtras(item)}>
                                    No Extras
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {filteredMenu.length === 0 && (
                      <p className="col-span-2 text-center text-sm text-muted-foreground py-8">No items in this category</p>
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col gap-2 pt-1 pb-2">
                {(tableStatus === "available" || tableStatus === "occupied") && cartItems.length > 0 && (
                  <Button
                    className="gradient-primary text-primary-foreground min-h-[48px] rounded-xl shadow-md font-semibold text-sm"
                    onClick={placeOrder}
                    disabled={placingOrder}
                  >
                    {placingOrder
                      ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      : <ShoppingCart className="h-4 w-4 mr-2" />
                    }
                    {tableStatus === "available" ? "Place Order" : "Add to Order"} · {currency} {cartTotal.toLocaleString()}
                  </Button>
                )}
                {tableStatus === "occupied" && (
                  <Button variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/5 min-h-[44px] rounded-xl font-medium" onClick={requestBill}>
                    <Receipt className="h-4 w-4 mr-2" />Request Bill
                  </Button>
                )}
                {(tableStatus === "occupied" || tableStatus === "bill-requested") && (
                  <Button variant="outline" className="text-success border-success/30 hover:bg-success/5 min-h-[44px] rounded-xl font-medium" onClick={markAvailable}>
                    <CircleDot className="h-4 w-4 mr-2" />Mark Available
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

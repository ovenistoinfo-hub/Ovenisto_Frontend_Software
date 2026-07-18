import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Plus, Minus, X, ShoppingCart, UtensilsCrossed, Clock, Users,
  Receipt, CircleDot, ChevronDown, ChevronUp, Bell, Check, Loader2, Trash2,
  Play, Power, Eye, CreditCard, Percent, CornerUpRight, Printer, ArrowLeft, Search
} from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/contexts/DataContext";
import { orderService, type OrderRecord } from "@/services/order.service";
import { useVisiblePolling } from "@/hooks/use-visible-polling";
import { useOrderEvents } from "@/hooks/use-order-events";
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
  const [isOrderingMode, setIsOrderingMode] = useState(false);
  const [showSettleDialog, setShowSettleDialog] = useState(false);
  const [settlePaymentMethod, setSettlePaymentMethod] = useState("Cash");
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [targetMoveTableId, setTargetMoveTableId] = useState<string | null>(null);
  const [showSplitDialog, setShowSplitDialog] = useState(false);
  const [splitCount, setSplitCount] = useState(2);
  const [paidSplits, setPaidSplits] = useState<Set<number>>(new Set());
  const [showOrdersDialog, setShowOrdersDialog] = useState(false);

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
  }, [loadOrders]);

  // Orders refresh on real-time push, plus a 60s visibility-gated safety poll so a
  // waiter's tablet stops querying when backgrounded (lets the Neon compute idle).
  useOrderEvents(loadOrders);
  useVisiblePolling(loadOrders, 60000);

  // ── Derived ──

  const getTableStatus = (tableNum: number): TableStatus => {
    if (billReqSet.has(tableNum)) return "bill-requested";
    const hasActive = orders.some((o) => o.tableNumber === tableNum && ACTIVE_STATUSES.includes(o.status));
    if (hasActive) return "occupied";
    const t = tables.find((tbl) => Number(tbl.number) === tableNum);
    if (t) {
      if (t.status === "occupied") return "occupied";
      if (t.status === "reserved") return "occupied"; // map reserved to occupied for UI session
      if (t.status === "bill-requested") return "bill-requested";
    }
    return "available";
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
  // The earliest order's timestamp for the seating timer in the sidebar
  const oldest = activeTableOrders.length > 0
    ? activeTableOrders[activeTableOrders.length - 1].createdAt
    : null;

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
      if (selectedTable && selectedTable.status !== "occupied") {
        await tableService.updateTable(selectedTable.id, { status: "occupied" });
        setTables(prev => prev.map(t => t.id === selectedTable.id ? { ...t, status: "occupied" } : t));
      }
      toast.success("Order sent to kitchen!");
      setCartItems([]);
      setIsOrderingMode(false);
      await loadOrders();
    } catch {
      toast.error("Failed to send order");
    } finally {
      setPlacingOrder(false);
    }
  };

  const startSitting = async () => {
    if (!selectedTable) return;
    try {
      await tableService.updateTable(selectedTable.id, { status: "occupied" });
      setTables(prev => prev.map(t => t.id === selectedTable.id ? { ...t, status: "occupied" } : t));
      toast.success(`Table ${selectedTable.number} session started`);
    } catch {
      toast.error("Failed to start session");
    }
  };

  const endSitting = async () => {
    if (!selectedTable || selectedTableNum === null) return;
    try {
      await tableService.updateTable(selectedTable.id, { status: "available" });
      setTables(prev => prev.map(t => t.id === selectedTable.id ? { ...t, status: "available" } : t));
      if (activeTableOrders.length > 0) {
        await Promise.all(activeTableOrders.map((o) => orderService.updateOrderStatus(o.id, "completed")));
        await loadOrders();
      }
      setBillReqSet((p) => { const n = new Set(p); n.delete(selectedTableNum); return n; });
      toast.success(`Table ${selectedTable.number} session ended`);
      setSelectedTableId(null);
      setCartItems([]);
    } catch {
      toast.error("Failed to end session");
    }
  };

  const settleBilling = async (paymentMethod: string) => {
    if (!selectedTable || selectedTableNum === null) return;
    try {
      if (activeTableOrders.length > 0) {
        await Promise.all(
          activeTableOrders.map((o) =>
            orderService.updateOrderStatus(o.id, "completed")
          )
        );
        await Promise.all(
          activeTableOrders.map((o) =>
            orderService.updateOrder(o.id, { paymentMethod })
          )
        );
        await loadOrders();
      }
      await tableService.updateTable(selectedTable.id, { status: "available" });
      setTables(prev => prev.map(t => t.id === selectedTable.id ? { ...t, status: "available" } : t));
      setBillReqSet((p) => { const n = new Set(p); n.delete(selectedTableNum); return n; });
      toast.success(`Table ${selectedTable.number} settled via ${paymentMethod}`);
      setSelectedTableId(null);
      setCartItems([]);
      setShowSettleDialog(false);
    } catch {
      toast.error("Failed to settle billing");
    }
  };

  const moveTableSession = async (targetTableId: string) => {
    const targetTable = tables.find(t => t.id === targetTableId);
    if (!selectedTable || !targetTable) return;
    try {
      if (activeTableOrders.length > 0) {
        await Promise.all(
          activeTableOrders.map((o) =>
            orderService.updateOrder(o.id, { tableNumber: Number(targetTable.number) })
          )
        );
        await loadOrders();
      }
      await Promise.all([
        tableService.updateTable(selectedTable.id, { status: "available" }),
        tableService.updateTable(targetTable.id, { status: "occupied" })
      ]);
      setTables(prev => prev.map(t => 
        t.id === selectedTable.id ? { ...t, status: "available" } :
        t.id === targetTable.id ? { ...t, status: "occupied" } : t
      ));
      if (billReqSet.has(Number(selectedTable.number))) {
        setBillReqSet(p => {
          const n = new Set(p);
          n.delete(Number(selectedTable.number));
          n.add(Number(targetTable.number));
          return n;
        });
      }
      toast.success(`Moved sitting session to Table ${targetTable.number}`);
      setSelectedTableId(targetTable.id);
      setShowMoveDialog(false);
    } catch {
      toast.error("Failed to move table session");
    }
  };

  const printActiveBill = () => {
    if (!selectedTable || activeTableOrders.length === 0) return;
    const subtotal = activeTableOrders.reduce((s, o) => s + Number(o.subtotal), 0);
    const tax      = activeTableOrders.reduce((s, o) => s + Number(o.tax), 0);
    const service  = Math.round(subtotal * 0.05);
    const total    = subtotal + tax + service;

    const win = window.open("", "_blank");
    if (!win) return;
    
    let itemsHtml = "";
    activeTableOrders.forEach((o) => {
      o.items.forEach((item) => {
        itemsHtml += `
          <div style="display:flex; justify-content:space-between; font-size: 13px; margin: 4px 0;">
            <span>${item.name} x${item.qty}</span>
            <span>${currency} ${(item.price * item.qty).toLocaleString()}</span>
          </div>
        `;
      });
    });

    win.document.write(`
      <html>
        <head>
          <title>Receipt - Table ${selectedTable.number}</title>
          <style>
            body { font-family: monospace; padding: 20px; width: 280px; margin: auto; }
            .header { text-align: center; margin-bottom: 20px; }
            .divider { border-bottom: 1px dashed #000; margin: 10px 0; }
            .total-row { display: flex; justify-content: space-between; font-weight: bold; }
            @media print { button { display: none; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h3>Ovenisto</h3>
            <p>Table: ${selectedTable.number}</p>
            <p>Date: ${new Date().toLocaleDateString()}</p>
          </div>
          <div class="divider"></div>
          ${itemsHtml}
          <div class="divider"></div>
          <div style="display:flex; justify-content:space-between; font-size: 13px;">
            <span>Subtotal</span>
            <span>${currency} ${subtotal.toLocaleString()}</span>
          </div>
          <div style="display:flex; justify-content:space-between; font-size: 13px;">
            <span>Tax</span>
            <span>${currency} ${tax.toLocaleString()}</span>
          </div>
          <div style="display:flex; justify-content:space-between; font-size: 13px;">
            <span>Service (5%)</span>
            <span>${currency} ${service.toLocaleString()}</span>
          </div>
          <div class="divider"></div>
          <div class="total-row">
            <span>Grand Total</span>
            <span>${currency} ${total.toLocaleString()}</span>
          </div>
          <div class="divider"></div>
          <p style="text-align:center; font-size: 11px; margin-top:20px;">Thank you for dining with us!</p>
          <br/>
          <button onclick="window.print()" style="width:100%; padding:8px; font-weight:bold; cursor:pointer;">Print Receipt</button>
        </body>
      </html>
    `);
    win.document.close();
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
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <PageHeader
          icon={<UtensilsCrossed className="h-5 w-5" />}
          title="Waiter Panel"
          subtitle="Manage tables and take orders"
        />
        {isOrderingMode && (
          <Button variant="outline" onClick={() => { setIsOrderingMode(false); setCartItems([]); }} className="border-zinc-800 bg-zinc-950/40 hover:bg-zinc-900 rounded-xl font-bold gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Floor Plan
          </Button>
        )}
      </div>

      {/* ── Self-Order Pending Requests Banner ── */}
      {!isOrderingMode && pendingSelfOrders.length > 0 && (
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

      {/* Main Dual Pane Layout Container */}
      <div className="flex flex-col lg:flex-row gap-6 min-h-[calc(100vh-220px)] items-stretch">
        
        {/* LEFT SIDEBAR: Selected table actions & session info */}
        <div className="w-full lg:w-80 xl:w-96 flex flex-col shrink-0 bg-zinc-900/20 border border-zinc-800/80 rounded-2xl p-5 space-y-5 select-none">
          {!selectedTable ? (
            <div className="h-64 lg:h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
              <UtensilsCrossed className="h-10 w-10 text-muted-foreground/30 animate-pulse" />
              <h3 className="font-bold text-sm text-foreground">No Table Selected</h3>
              <p className="text-xs text-muted-foreground max-w-[240px]">
                Select any table from the floor plan to start a sitting session or take orders.
              </p>
            </div>
          ) : (
            <div className="flex flex-col h-full justify-between gap-6">
              
              {/* Header info */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3.5">
                  <div className="space-y-0.5">
                    <h3 className="font-extrabold text-base text-foreground tracking-tight">Table {selectedTable.number}</h3>
                    <p className="text-[10px] text-muted-foreground/60 font-semibold uppercase tracking-wider">{selectedTable.floor || "Main Hall"}</p>
                  </div>
                  <Badge variant="secondary" className={cn(
                    "text-[9px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider leading-none border-none",
                    tableStatus === "available" && "bg-success/10 text-success hover:bg-success/10",
                    tableStatus === "occupied" && "bg-destructive/10 text-destructive hover:bg-destructive/10",
                    tableStatus === "bill-requested" && "bg-destructive/20 text-destructive hover:bg-destructive/20 animate-pulse",
                    tableStatus === "reserved" && "bg-warning/10 text-warning hover:bg-warning/10",
                    tableStatus === "maintenance" && "bg-muted text-muted-foreground hover:bg-muted",
                  )}>
                    {tableStatus === "bill-requested" ? "Bill Req" : tableStatus === "available" ? "Free" : tableStatus}
                  </Badge>
                </div>

                {/* Seating Details */}
                {tableStatus === "available" ? (
                  <div className="space-y-4 py-2">
                    <div className="bg-zinc-950/20 rounded-xl p-4 border border-zinc-800/80 text-center space-y-1">
                      <p className="text-xs text-muted-foreground">This table is currently free.</p>
                      <p className="text-xs font-bold text-foreground">Capacity: {selectedTable.capacity} Seats</p>
                    </div>
                    
                    <div className="flex flex-col gap-2.5">
                      <Button onClick={startSitting} className="gradient-primary text-primary-foreground font-bold rounded-xl h-11 w-full flex items-center justify-center gap-2 shadow-sm">
                        <Play className="h-4 w-4" /> Start Sitting
                      </Button>
                      <Button onClick={() => setIsOrderingMode(true)} variant="outline" className="font-bold border-zinc-800 bg-zinc-950/30 hover:bg-zinc-900/60 rounded-xl h-11 w-full flex items-center justify-center gap-2">
                        <ShoppingCart className="h-4 w-4" /> Place Order
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Seating stats */}
                    <div className="bg-zinc-950/25 rounded-xl p-3 border border-zinc-800/80 space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Active Session:</span>
                        <strong className="text-foreground">#{activeTableOrders[0]?.orderNumber || "Session Active"}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Guests Count:</span>
                        <strong className="text-foreground">{selectedTable.capacity} Pax</strong>
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

                    {/* Actions Grid */}
                    <div className="grid grid-cols-2 gap-2">
                      <Button onClick={endSitting} variant="destructive" className="font-bold rounded-xl h-10 w-full flex items-center justify-center gap-1.5 shadow-sm text-xs">
                        <Power className="h-3.5 w-3.5" /> End Sitting
                      </Button>
                      <Button onClick={() => setIsOrderingMode(true)} className="gradient-primary text-primary-foreground font-bold rounded-xl h-10 w-full flex items-center justify-center gap-1.5 shadow-sm text-xs">
                        <ShoppingCart className="h-3.5 w-3.5" /> Place Order
                      </Button>
                      <Button onClick={() => setShowOrdersDialog(true)} variant="outline" className="font-bold border-zinc-800 bg-zinc-950/30 hover:bg-zinc-900/60 rounded-xl h-10 w-full flex items-center justify-center gap-1.5 text-xs">
                        <Eye className="h-3.5 w-3.5" /> View Order
                      </Button>
                      <Button onClick={() => setShowSettleDialog(true)} className="bg-success text-success-foreground hover:bg-success/90 font-bold rounded-xl h-10 w-full flex items-center justify-center gap-1.5 shadow-sm text-xs">
                        <CreditCard className="h-3.5 w-3.5" /> Settle
                      </Button>
                      <Button onClick={() => setShowSplitDialog(true)} variant="outline" className="font-bold border-zinc-800 bg-zinc-950/30 hover:bg-zinc-900/60 rounded-xl h-10 w-full flex items-center justify-center gap-1.5 text-xs">
                        <Percent className="h-3.5 w-3.5" /> Split Bill
                      </Button>
                      <Button onClick={() => setShowMoveDialog(true)} variant="outline" className="font-bold border-zinc-800 bg-zinc-950/30 hover:bg-zinc-900/60 rounded-xl h-10 w-full flex items-center justify-center gap-1.5 text-xs">
                        <CornerUpRight className="h-3.5 w-3.5" /> Move
                      </Button>
                      <Button onClick={printActiveBill} variant="outline" className="col-span-2 font-bold border-zinc-800 bg-zinc-950/30 hover:bg-zinc-900/60 rounded-xl h-10 w-full flex items-center justify-center gap-1.5 text-xs">
                        <Printer className="h-3.5 w-3.5" /> Print Bill
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Financial Summary */}
              {tableStatus !== "available" && activeTableOrders.length > 0 && (
                <div className="border-t border-zinc-800 pt-4 space-y-2 select-none mt-auto">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Price</span>
                    <span>{currency} {activeTableOrders.reduce((s, o) => s + Number(o.subtotal), 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Tax ({taxRate}%)</span>
                    <span>{currency} {activeTableOrders.reduce((s, o) => s + Number(o.tax), 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Service Charges (5%)</span>
                    <span>{currency} {Math.round(activeTableOrders.reduce((s, o) => s + Number(o.subtotal), 0) * 0.05).toLocaleString()}</span>
                  </div>
                  <Separator className="bg-zinc-800 my-1" />
                  <div className="flex justify-between text-sm font-extrabold text-foreground">
                    <span>Grand Total</span>
                    <span className="text-primary">
                      {currency} {(
                        activeTableOrders.reduce((s, o) => s + Number(o.total), 0) +
                        Math.round(activeTableOrders.reduce((s, o) => s + Number(o.subtotal), 0) * 0.05)
                      ).toLocaleString()}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT AREA: Floor map grid OR Menu Ordering View */}
        <div className="flex-grow flex flex-col overflow-y-auto">
          {!isOrderingMode ? (
            /* State A: Floor Map view */
            <div className="space-y-6 flex-grow flex flex-col justify-between">
              <div className="space-y-6">
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
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
                    {tables.map((t) => {
                      const tNum    = Number(t.number);
                      const status  = getTableStatus(tNum);
                      const cfg     = statusConfig[status];
                      const tOrders = getTableOrders(tNum);
                      const oldest  = tOrders.length > 0 ? tOrders[tOrders.length - 1].createdAt : null;

                      const statusDotColor =
                        status === "available" ? "bg-success shadow-[0_0_8px_rgba(34,197,94,0.5)]" :
                        status === "occupied" ? "bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.5)]" :
                        status === "bill-requested" ? "bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.5)]" :
                        "bg-muted-foreground";

                      const statusBorderClass =
                        status === "available" ? "border-success/35" :
                        status === "occupied" ? "border-destructive/35" :
                        status === "bill-requested" ? "border-destructive/60" :
                        "border-muted";

                      const chairBgClass =
                        status === "available" ? "bg-success/50" :
                        status === "occupied" ? "bg-destructive/50" :
                        status === "bill-requested" ? "bg-destructive animate-pulse" :
                        "bg-muted-foreground/50";

                      return (
                        <div key={t.id} className="p-1">
                          <Card
                            onClick={() => handleTableClick(t)}
                            className={cn(
                              "shadow-md bg-zinc-900/40 border border-zinc-800/80 rounded-2xl flex flex-col justify-between p-4 h-48 w-full cursor-pointer hover:border-zinc-700 hover:-translate-y-1 hover:shadow-lg hover:shadow-zinc-950/20 transition-all duration-300 relative overflow-hidden",
                              status === "bill-requested" && "animate-pulse border-destructive/30",
                              selectedTableId === t.id && "ring-2 ring-primary ring-offset-2 shadow-lg"
                            )}
                          >
                            {/* Top Bar: Table Label & Pulse Status */}
                            <div className="flex items-center justify-between w-full select-none shrink-0">
                              <div className="flex items-center gap-1.5">
                                <span className={cn(
                                  "h-1.5 w-1.5 rounded-full",
                                  status === "bill-requested" && "animate-ping",
                                  statusDotColor
                                )} />
                                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Table {t.number}</span>
                              </div>
                            </div>

                            {/* Middle Area: Graphical Table Blueprint Diagram */}
                            <div className="flex-grow flex items-center justify-center relative my-2 w-full select-none">
                              {t.shape === "round" && (
                                <div className={cn("h-16 w-16 rounded-full border-2 flex items-center justify-center relative bg-zinc-950/30", statusBorderClass)}>
                                  <span className="font-extrabold text-base text-foreground tracking-tight">{t.number}</span>
                                  {renderMiniChairs("round", t.capacity, chairBgClass)}
                                </div>
                              )}
                              {t.shape === "square" && (
                                <div className={cn("h-14 w-14 rounded-xl border-2 flex items-center justify-center relative bg-zinc-950/30", statusBorderClass)}>
                                  <span className="font-extrabold text-base text-foreground tracking-tight">{t.number}</span>
                                  {renderMiniChairs("square", t.capacity, chairBgClass)}
                                </div>
                              )}
                              {t.shape === "rectangle" && (
                                <div className={cn("h-12 w-20 rounded-xl border-2 flex items-center justify-center relative bg-zinc-950/30", statusBorderClass)}>
                                  <span className="font-extrabold text-base text-foreground tracking-tight">{t.number}</span>
                                  {renderMiniChairs("rectangle", t.capacity, chairBgClass)}
                                </div>
                              )}
                            </div>

                            {/* Bottom Bar: Capacity and Status Label */}
                            <div className="flex items-center justify-between w-full mt-1 shrink-0 select-none">
                              <span className="text-[9px] text-muted-foreground/60 font-semibold tracking-wide">
                                {status === "occupied" && oldest ? (
                                  <span className="flex items-center gap-1 text-muted-foreground">
                                    <Clock className="h-2.5 w-2.5" />
                                    <span>{getElapsed(oldest)}</span>
                                  </span>
                                ) : (
                                  t.floor || "Floor"
                                )}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <div className="flex items-center gap-0.5 text-[9px] text-muted-foreground font-bold bg-zinc-950/40 px-2 py-0.5 rounded-full border border-border/10">
                                  <Users className="h-2.5 w-2.5 text-muted-foreground/50" />
                                  <span>{t.capacity}</span>
                                </div>
                                <Badge variant="secondary" className={cn(
                                  "text-[8px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider leading-none border-none",
                                  status === "available" && "bg-success/10 text-success hover:bg-success/10",
                                  status === "occupied" && "bg-destructive/10 text-destructive hover:bg-destructive/10",
                                  status === "bill-requested" && "bg-destructive/20 text-destructive hover:bg-destructive/20 animate-pulse"
                                )}>
                                  {status === "bill-requested" ? "Bill" : cfg.label}
                                </Badge>
                              </div>
                            </div>
                          </Card>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* State B: Menu Ordering POS Layout */
            <div className="flex flex-col md:flex-row gap-6 items-stretch w-full">
              
              {/* Cart List Column */}
              <div className="w-full md:w-80 shrink-0 flex flex-col justify-between bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-4 space-y-4">
                <div className="space-y-4 flex-grow overflow-y-auto">
                  <div className="flex items-center justify-between border-b border-zinc-850 pb-2">
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
                  <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-0.5">
                    {cartItems.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 px-3 py-2.5 bg-zinc-950/20 border border-zinc-800/40 rounded-xl">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold truncate text-foreground leading-tight">{item.name}</p>
                          {item.modifiers && item.modifiers.length > 0 && (
                            <p className="text-[9px] text-muted-foreground">+{item.modifiers.join(", ")}</p>
                          )}
                          <p className="text-[11px] text-primary font-bold mt-0.5">{currency} {item.price.toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button variant="outline" size="icon" className="h-6 w-6 rounded border-zinc-800" onClick={() => updateQty(item.id, -1)}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-5 text-center text-xs font-bold">{item.qty}</span>
                          <Button variant="outline" size="icon" className="h-6 w-6 rounded border-zinc-800" onClick={() => updateQty(item.id, 1)}>
                            <Plus className="h-3 w-3" />
                          </Button>
                          <button onClick={() => removeCartItem(item.id)} className="text-muted-foreground/45 hover:text-destructive p-1 ml-0.5 transition-colors">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {cartItems.length === 0 && (
                      <p className="text-center text-xs text-muted-foreground py-10">Cart is empty</p>
                    )}
                  </div>
                </div>

                {/* Confirm order footer */}
                <div className="border-t border-zinc-850 pt-4 space-y-3 shrink-0">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground font-semibold">Total Amount</span>
                    <span className="text-base font-extrabold text-primary">{currency} {cartTotal.toLocaleString()}</span>
                  </div>
                  <Button
                    onClick={placeOrder}
                    disabled={placingOrder || cartItems.length === 0}
                    className="gradient-primary text-primary-foreground font-bold h-11 w-full flex items-center justify-center gap-2 rounded-xl shadow-md text-xs"
                  >
                    {placingOrder ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <><Check className="h-4 w-4" /> Send to Kitchen</>
                    )}
                  </Button>
                </div>
              </div>

              {/* Menu Catalog Grid Column */}
              <div className="flex-1 space-y-4">
                
                {/* Search and Category block */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/60" />
                    <Input
                      placeholder="Search food items..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 rounded-xl border-zinc-800 bg-zinc-950/20"
                    />
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto pb-1 max-w-full">
                    {categoryNames.map((c) => (
                      <button
                        key={c}
                        onClick={() => { setMenuCategory(c); resetExpansion(); }}
                        className={cn(
                          "px-3.5 py-1.5 rounded-full text-[11px] font-semibold transition-all border whitespace-nowrap leading-none h-9",
                          menuCategory === c
                            ? "gradient-primary text-primary-foreground border-transparent shadow-sm"
                            : "bg-card border-zinc-800 text-muted-foreground hover:border-zinc-700 hover:text-foreground"
                        )}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Items grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 max-h-[480px] overflow-y-auto pr-0.5">
                  {filteredMenu
                    .filter(item => searchQuery === "" || item.name.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map((item) => {
                      const hasVariants  = item.variants && item.variants.length > 0;
                      const itemMods     = resolveModifiers(item);
                      const hasModifiers = itemMods.length > 0;
                      const isExpanded   = expandedItemId === item.id;
                      const baseItemPrice = dineInPrice(item);

                      return (
                        <div key={item.id} className={cn("border rounded-xl overflow-hidden bg-card transition-all", isExpanded ? "col-span-2 border-primary/45 bg-zinc-950/10" : "border-zinc-800/80 hover:border-zinc-700 hover:shadow-sm")}>
                          {/* Item card button */}
                          <button
                            onClick={() => addToOrder(item)}
                            className="w-full text-left flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors group/item"
                          >
                            <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                              {item.image
                                ? <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                                : <div className="h-full w-full gradient-primary flex items-center justify-center text-primary-foreground text-sm font-bold">{item.name.charAt(0)}</div>
                              }
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-foreground leading-tight line-clamp-2 group-hover/item:text-primary transition-colors">{item.name}</p>
                              <p className="text-xs font-bold text-primary mt-0.5">
                                {hasVariants
                                  ? `${currency} ${variantDineInPrice(item.variants[0])}–${variantDineInPrice(item.variants[item.variants.length - 1])}`
                                  : `${currency} ${baseItemPrice.toLocaleString()}`}
                              </p>
                            </div>
                            <div className="shrink-0">
                              {(hasVariants || hasModifiers) ? (
                                <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center border transition-all",
                                  isExpanded ? "gradient-primary text-primary-foreground border-transparent" : "border-zinc-800 text-muted-foreground")}>
                                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </div>
                              ) : (
                                <div className="h-7 w-7 rounded-lg flex items-center justify-center border border-zinc-800 text-primary hover:bg-primary/5 transition-all">
                                  <Plus className="h-4 w-4" />
                                </div>
                              )}
                            </div>
                          </button>

                          {/* Expansion options */}
                          {isExpanded && (
                            <div className="px-3 pb-3 pt-2 border-t border-zinc-800/40 bg-zinc-950/20 space-y-3">
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
                                              : "bg-card border-zinc-800 text-foreground hover:border-zinc-700"
                                          )}
                                        >
                                          {v.name} · {currency} {vPrice.toLocaleString()}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

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
                                            : "bg-card border-zinc-800 text-muted-foreground hover:border-zinc-700 hover:text-foreground"
                                        )}
                                      >
                                        {mod.name}{mod.price > 0 ? ` +${currency}${mod.price}` : ""}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div className="flex gap-2 pt-1">
                                <Button
                                  size="sm"
                                  className="flex-1 gradient-primary text-primary-foreground h-9 text-xs font-semibold rounded-lg"
                                  onClick={() => confirmAddWithOptions(item)}
                                >
                                  <Plus className="h-3.5 w-3.5 mr-1" /> Add to Cart
                                  {selectedVariant && ` · ${currency} ${(selectedVariant.price + selectedModifiers.reduce((s, mId) => s + (itemMods.find((m) => m.id === mId)?.price ?? 0), 0)).toLocaleString()}`}
                                </Button>
                                {hasModifiers && (
                                  <Button size="sm" variant="outline" className="h-9 text-xs rounded-lg border-zinc-800" onClick={() => addWithoutExtras(item)}>
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

            </div>
          )}
        </div>

      </div>

      {/* ── Settlement Dialog ── */}
      <Dialog open={showSettleDialog} onOpenChange={setShowSettleDialog}>
        <DialogContent className="w-[90vw] max-w-[400px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-center text-lg font-bold">Settle Billing</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={settlePaymentMethod} onValueChange={setSettlePaymentMethod}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Credit Card">Credit Card</SelectItem>
                  <SelectItem value="JazzCash">JazzCash</SelectItem>
                  <SelectItem value="EasyPaisa">EasyPaisa</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedTable && activeTableOrders.length > 0 && (
              <div className="bg-zinc-950/20 rounded-xl p-4 border border-zinc-800 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{currency} {activeTableOrders.reduce((s, o) => s + Number(o.subtotal), 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-bold text-foreground">
                  <span>Grand Total</span>
                  <span className="text-primary">
                    {currency} {(
                      activeTableOrders.reduce((s, o) => s + Number(o.total), 0) +
                      Math.round(activeTableOrders.reduce((s, o) => s + Number(o.subtotal), 0) * 0.05)
                    ).toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowSettleDialog(false)} className="rounded-xl flex-1 border-zinc-800">Cancel</Button>
            <Button onClick={() => settleBilling(settlePaymentMethod)} className="gradient-primary text-primary-foreground font-bold rounded-xl flex-1">Confirm Payment</Button>
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
            <Button variant="outline" onClick={() => setShowMoveDialog(false)} className="rounded-xl flex-1 border-zinc-800">Cancel</Button>
            <Button 
              disabled={!targetMoveTableId}
              onClick={() => targetMoveTableId && moveTableSession(targetMoveTableId)} 
              className="gradient-primary text-primary-foreground font-bold rounded-xl flex-1"
            >
              Confirm Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Split Bill Dialog ── */}
      <Dialog open={showSplitDialog} onOpenChange={setShowSplitDialog}>
        <DialogContent className="w-[90vw] max-w-[400px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-center text-lg font-bold">Split Billing</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 text-center">
            <div className="space-y-2 text-left">
              <Label>Number of Splits</Label>
              <Input 
                type="number" 
                min={2} 
                max={12} 
                value={splitCount} 
                onChange={(e) => setSplitCount(Math.max(2, Number(e.target.value)))} 
                className="rounded-xl border-zinc-800 bg-zinc-950/20"
              />
            </div>

            {selectedTable && activeTableOrders.length > 0 && (
              <div className="space-y-4">
                <div className="bg-zinc-950/20 rounded-xl p-4 border border-zinc-800 text-center space-y-1">
                  <p className="text-xs text-muted-foreground">Total Bill</p>
                  <p className="text-2xl font-extrabold text-primary">
                    {currency} {(
                      activeTableOrders.reduce((s, o) => s + Number(o.total), 0) +
                      Math.round(activeTableOrders.reduce((s, o) => s + Number(o.subtotal), 0) * 0.05)
                    ).toLocaleString()}
                  </p>
                  <Separator className="bg-zinc-850 my-2" />
                  <p className="text-xs text-muted-foreground">Each split share ({splitCount} ways)</p>
                  <p className="text-lg font-bold text-foreground">
                    {currency} {Math.round((
                      activeTableOrders.reduce((s, o) => s + Number(o.total), 0) +
                      Math.round(activeTableOrders.reduce((s, o) => s + Number(o.subtotal), 0) * 0.05)
                    ) / splitCount).toLocaleString()}
                  </p>
                </div>
                
                {/* Visual split paid indicators */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {Array.from({ length: splitCount }).map((_, i) => {
                    const isPaid = paidSplits.has(i);
                    return (
                      <Button
                        key={i}
                        variant={isPaid ? "default" : "outline"}
                        onClick={() => {
                          const next = new Set(paidSplits);
                          if (isPaid) next.delete(i);
                          else next.add(i);
                          setPaidSplits(next);
                        }}
                        className={cn(
                          "rounded-lg h-9 font-bold text-[11px]",
                          isPaid ? "bg-success hover:bg-success/90 text-success-foreground" : "border-zinc-800"
                        )}
                      >
                        Share {i + 1}: {isPaid ? "Paid" : "Mark Paid"}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => { setShowSplitDialog(false); setPaidSplits(new Set()); }} className="rounded-xl flex-1 border-zinc-800">Close</Button>
            <Button 
              disabled={paidSplits.size < splitCount}
              onClick={() => settleBilling("Cash")} 
              className="gradient-primary text-primary-foreground font-bold rounded-xl flex-1"
            >
              Settle All
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
            <Button variant="outline" onClick={() => setShowOrdersDialog(false)} className="rounded-xl w-full border-zinc-800">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WaiterPanel;

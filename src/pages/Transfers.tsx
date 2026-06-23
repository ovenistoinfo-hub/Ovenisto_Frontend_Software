import { useState, useEffect, useCallback, useMemo } from "react";
import { challanService, type ChallanRecord, type ChallanStatus } from "@/services/challan.service";
import { warehouseService, type WarehouseRecord } from "@/services/warehouse.service";
import { inventoryService, type IngredientRecord } from "@/services/inventory.service";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Search, Eye, Truck, Trash2, ArrowLeftRight, XCircle, PackageCheck, Printer, Phone, User, FileText, ClipboardList, AlertTriangle, ChevronUp, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";

const STATUS_STYLE: Record<string, string> = {
  PENDING:    "bg-yellow-100 text-yellow-800",
  DISPATCHED: "bg-blue-100 text-blue-800",
  RECEIVED:   "bg-success/10 text-success",
  CANCELLED:  "bg-muted text-muted-foreground",
};

interface FormItem { ingredientId: string; name: string; unit: string; qty: number; availableStock: number; }
interface ReceiveFormItem { id: string; ingredientName: string; unit: string; qty: number; receivedQty: number; wasteQty: number; wasteReason: string; }

const Transfers = () => {
  const { user } = useAuth();
  const userRole      = user?.role || '';
  const isSuperAdmin  = userRole === 'Super Admin';
  const isAdmin       = ['Super Admin', 'Admin'].includes(userRole);
  const isKitchenMgr  = userRole === 'Kitchen Manager';
  const userOutletId  = user?.outletId ?? null;

  // ── Role-based permissions ──────────────────────────────────────
  // Kitchen Manager: receive only, no create, no dispatch
  // Manager / Admin: create (branch→kitchen), dispatch KM demands, receive (from main)
  // Super Admin: create (main→branch), dispatch, NO receive
  const canDispatch = !isKitchenMgr;                    // everyone except KM
  const canReceive  = !isSuperAdmin;                    // everyone except Super Admin

  // Data
  const [challans,     setChallans]     = useState<ChallanRecord[]>([]);
  const [warehouses,   setWarehouses]   = useState<WarehouseRecord[]>([]);
  const [ingredients,  setIngredients]  = useState<IngredientRecord[]>([]);
  const [loading,      setLoading]      = useState(true);

  // UI
  const [saving,       setSaving]       = useState(false);
  const [showDialog,   setShowDialog]   = useState(false);
  const [showDetail,   setShowDetail]   = useState<ChallanRecord | null>(null);
  const [cancelId,     setCancelId]     = useState<string | null>(null);
  const [dispatchId,   setDispatchId]   = useState<string | null>(null);
  const [receiveChallan, setReceiveChallan] = useState<ChallanRecord | null>(null);
  const [search,       setSearch]       = useState("");
  const [filterStatus, setFilterStatus] = useState<ChallanStatus | "ALL">("ALL");

  // Create form
  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [toWarehouseId,   setToWarehouseId]   = useState("");
  const [notes,           setNotes]           = useState("");
  const [items,           setItems]           = useState<FormItem[]>([]);
  const [sourceStockMap,  setSourceStockMap]  = useState<Record<string, { stock: number; unit: string }>>({});
  const [loadingLowStock, setLoadingLowStock] = useState(false);

  // Receive form state
  const [receiveItems, setReceiveItems] = useState<ReceiveFormItem[]>([]);
  const [receiveShipping, setReceiveShipping] = useState<number | "">(0);
  const [receiveMisc, setReceiveMisc] = useState<number | "">(0);

  // ── Data loading ──────────────────────────────────────────────────
  const fetchChallans = useCallback(async () => {
    try {
      const data = await challanService.getAll(
        filterStatus !== "ALL" ? { status: filterStatus } : {}
      );
      setChallans(data);
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to load challans");
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    Promise.all([
      warehouseService.getAll(),
      inventoryService.getIngredients(),
    ])
      .then(([whList, ingList]) => {
        setWarehouses(whList);
        setIngredients(ingList);
      })
      .catch((err: unknown) => toast.error((err as Error).message || "Failed to load data"));
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchChallans();
  }, [fetchChallans]);

  // ── Role-based tab filtering ───────────────────────────────────────
  // Determine which warehouse types this user "owns" for dispatch/receive
  // Manager/Admin (outlet-linked): owns BRANCH + KITCHEN of their outlet
  // Kitchen Manager: owns only KITCHEN of their outlet
  // Super Admin: owns MAIN warehouse (dispatches from main)
  function isMySourceWarehouse(wh: { outletId: string | null; type: string } | null): boolean {
    if (!wh) return false;
    if (isSuperAdmin) return wh.type === 'MAIN';
    if (isKitchenMgr) return false; // KM never dispatches
    // Manager/Admin with outlet → owns BRANCH of their outlet (dispatches from branch)
    if (userOutletId) return wh.outletId === userOutletId && wh.type === 'BRANCH';
    return wh.type === 'MAIN';
  }

  function isMyDestWarehouse(wh: { outletId: string | null; type: string } | null): boolean {
    if (!wh) return false;
    if (isSuperAdmin) return false; // Super Admin never receives
    if (isKitchenMgr) {
      // KM receives at KITCHEN of their outlet
      if (userOutletId) return wh.outletId === userOutletId && wh.type === 'KITCHEN';
      return wh.type === 'KITCHEN';
    }
    // Manager/Admin with outlet → receives at BRANCH (from main) — NOT kitchen
    if (userOutletId) return wh.outletId === userOutletId && wh.type === 'BRANCH';
    return false;
  }

  // Admin has the same permissions as Manager (outlet-scoped, dispatch + receive)
  const outgoingChallans = useMemo(() =>
    challans.filter(c => isMySourceWarehouse(c.fromWarehouse)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [challans, isSuperAdmin, isKitchenMgr, userOutletId]
  );

  const incomingChallans = useMemo(() =>
    challans.filter(c => isMyDestWarehouse(c.toWarehouse)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [challans, isSuperAdmin, isKitchenMgr, userOutletId]
  );

  // Which sections to show
  const showOutgoingSection = !isKitchenMgr;   // Everyone except KM
  const showIncomingSection = !isSuperAdmin;    // Everyone except Super Admin

  // Helper for warehouse scope check (used by create form only)
  function isMyWarehouse(wh: { outletId: string | null; type: string } | null): boolean {
    if (!wh) return false;
    if (isAdmin) return true;
    if (userOutletId) return wh.outletId === userOutletId;
    return wh.type === 'MAIN';
  }

  // Apply search filter
  function applySearch(list: ChallanRecord[]) {
    const q = search.toLowerCase();
    if (!q) return list;
    return list.filter(c =>
      (c.challanNo || "").toLowerCase().includes(q) ||
      (c.demand?.demandNo || "").toLowerCase().includes(q) ||
      (c.fromWarehouse?.name || "").toLowerCase().includes(q) ||
      (c.toWarehouse?.name || "").toLowerCase().includes(q)
    );
  }

  const displayedOutgoing = applySearch(outgoingChallans);
  const displayedIncoming = applySearch(incomingChallans);

  // ── Warehouse dropdowns in create form ───────────────────────────
  // "From" options: non-KITCHEN warehouses that belong to this user's scope
  const fromWarehouseOptions = useMemo(() =>
    warehouses.filter(w => w.type !== 'KITCHEN' && (isAdmin || isMyWarehouse(w))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [warehouses, isAdmin, userOutletId]
  );

  // "To" options: valid destination based on fromWarehouse type
  const selectedFromWH = warehouses.find(w => w.id === fromWarehouseId);
  const toWarehouseOptions = useMemo(() => {
    if (!selectedFromWH) return [];
    if (selectedFromWH.type === 'MAIN')
      return warehouses.filter(w => w.type === 'BRANCH');
    if (selectedFromWH.type === 'BRANCH')
      return warehouses.filter(w => w.type === 'KITCHEN' && w.outletId === selectedFromWH.outletId);
    return [];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouses, selectedFromWH]);

  // Can this user create challans? KM cannot; others need at least one valid "from" warehouse
  const canCreate = !isKitchenMgr && fromWarehouseOptions.length > 0;

  // ── Form helpers ──────────────────────────────────────────────────
  const openAdd = () => {
    // Auto-select from WH if only one option
    const autoFrom = fromWarehouseOptions.length === 1 ? fromWarehouseOptions[0].id : "";
    setFromWarehouseId(autoFrom);
    setToWarehouseId("");
    setNotes("");
    setItems([]);
    setSourceStockMap({});
    if (autoFrom) fetchSourceStock(autoFrom);
    setShowDialog(true);
  };

  // Fetch stock levels from the source warehouse
  const fetchSourceStock = useCallback(async (whId: string) => {
    if (!whId) { setSourceStockMap({}); return; }
    try {
      const stockData = await warehouseService.getStock(whId);
      const map: Record<string, { stock: number; unit: string }> = {};
      for (const s of stockData) {
        map[s.ingredient.id] = {
          stock: Number(s.currentStock),
          unit: s.ingredient.unit?.symbol || s.ingredient.unit?.name || "",
        };
      }
      setSourceStockMap(map);
    } catch { setSourceStockMap({}); }
  }, []);

  // Add items that are low stock in the destination warehouse
  const addLowStockItems = useCallback(async () => {
    if (!toWarehouseId) { toast.error("Select a destination warehouse first"); return; }
    setLoadingLowStock(true);
    try {
      const stockData = await warehouseService.getStock(toWarehouseId, { lowStockOnly: true });
      let added = 0;
      const newItems = [...items];
      for (const s of stockData) {
        if (newItems.some(i => i.ingredientId === s.ingredient.id)) continue;
        const lowLevel = Number(s.lowStockLevel);
        const current = Number(s.currentStock);
        const deficit = Math.max(1, Math.round(lowLevel - current));
        const srcInfo = sourceStockMap[s.ingredient.id];
        const available = srcInfo?.stock ?? 0;
        const qty = Math.min(deficit, available);
        if (qty <= 0) continue;
        newItems.push({
          ingredientId: s.ingredient.id,
          name: s.ingredient.name,
          unit: srcInfo?.unit || s.ingredient.unit?.symbol || s.ingredient.unit?.name || "",
          qty,
          availableStock: available,
        });
        added++;
      }
      setItems(newItems);
      toast.success(`${added} low stock item${added !== 1 ? "s" : ""} added`);
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to load low stock items");
    } finally {
      setLoadingLowStock(false);
    }
  }, [toWarehouseId, items, sourceStockMap]);

  const addItemRow = () => setItems(p => [...p, { ingredientId: "", name: "", unit: "", qty: 0, availableStock: 0 }]);
  const removeItemRow = (idx: number) => setItems(p => p.filter((_, i) => i !== idx));
  const updateItemRow = (idx: number, field: string, value: string | number) => {
    setItems(p => p.map((item, i) => {
      if (i !== idx) return item;
      if (field === "ingredientId") {
        const ing = ingredients.find(ig => ig.id === value);
        const srcInfo = sourceStockMap[value as string];
        return {
          ...item,
          ingredientId: value as string,
          name: ing?.name || "",
          unit: srcInfo?.unit || ing?.unit?.name || "",
          availableStock: srcInfo?.stock ?? 0,
        };
      }
      return { ...item, [field]: value };
    }));
  };

  // When "From" changes, reset "To" and fetch source stock
  const handleFromChange = (v: string) => {
    const id = v === "__none__" ? "" : v;
    setFromWarehouseId(id);
    setToWarehouseId("");
    setItems([]);
    fetchSourceStock(id);
  };

  // ── Actions ───────────────────────────────────────────────────────
  const handleCreateChallan = async () => {
    if (!fromWarehouseId) { toast.error("From warehouse is required"); return; }
    if (!toWarehouseId)   { toast.error("To warehouse is required"); return; }
    if (fromWarehouseId === toWarehouseId) { toast.error("Warehouses must be different"); return; }
    if (items.every(i => !i.ingredientId || i.qty <= 0)) { toast.error("Add at least one item"); return; }

    setSaving(true);
    try {
      const validItems = items
        .filter(i => i.ingredientId && i.qty > 0)
        .map(i => ({ ingredientId: i.ingredientId, qty: i.qty }));
      await challanService.create({
        fromWarehouseId,
        toWarehouseId,
        notes: notes || undefined,
        items: validItems,
      });
      toast.success("Transfer challan created");
      setShowDialog(false);
      await fetchChallans();
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to create challan");
    } finally {
      setSaving(false);
    }
  };

  const handleDispatch = async () => {
    if (!dispatchId) return;
    setSaving(true);
    try {
      await challanService.dispatch(dispatchId);
      toast.success("Challan dispatched — stock deducted from source");
      setDispatchId(null);
      await fetchChallans();
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to dispatch");
    } finally {
      setSaving(false);
    }
  };

  const openReceiveForm = (c: ChallanRecord) => {
    setReceiveItems(c.items.map(item => ({
      id: item.id,
      ingredientName: item.ingredientName,
      unit: item.unit,
      qty: item.qty,
      receivedQty: item.qty,
      wasteQty: 0,
      wasteReason: "",
    })));
    setReceiveShipping(c.shippingCost ?? 0);
    setReceiveMisc(c.miscAmount ?? 0);
    setReceiveChallan(c);
  };

  const handleReceive = async () => {
    if (!receiveChallan) return;
    // Validate
    for (const ri of receiveItems) {
      if (ri.wasteQty > ri.receivedQty) {
        toast.error(`Waste qty cannot exceed received qty for "${ri.ingredientName}"`);
        return;
      }
    }
    setSaving(true);
    try {
      await challanService.receive(receiveChallan.id, {
        items: receiveItems.map(ri => ({
          id: ri.id,
          receivedQty: ri.receivedQty,
          wasteQty: ri.wasteQty || undefined,
          wasteReason: ri.wasteReason || undefined,
        })),
        shippingCost: Number(receiveShipping) || undefined,
        miscAmount: Number(receiveMisc) || undefined,
      });
      toast.success("Challan received — stock added to destination");
      setReceiveChallan(null);
      await fetchChallans();
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to receive");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelId) return;
    setSaving(true);
    try {
      await challanService.cancel(cancelId);
      toast.success("Challan cancelled");
      setCancelId(null);
      await fetchChallans();
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to cancel");
    } finally {
      setSaving(false);
    }
  };

  // ── Shared challan table renderer ────────────────────────────────
  function ChallanTable({
    list,
    emptyMsg,
    showDispatch,
    showReceive,
  }: {
    list: ChallanRecord[];
    emptyMsg: string;
    showDispatch: boolean;
    showReceive: boolean;
  }) {
    if (loading) {
      return <div className="space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-10 w-full rounded" />)}</div>;
    }
    if (list.length === 0) {
      return (
        <div className="text-center py-12">
          <ArrowLeftRight className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" />
          <p className="text-muted-foreground">{emptyMsg}</p>
          {showDispatch && canCreate && (
            <Button size="sm" className="gradient-primary text-primary-foreground mt-3" onClick={openAdd}>
              <Plus className="h-4 w-4 mr-1" />Create Transfer
            </Button>
          )}
        </div>
      );
    }
    return (
      <div className="rounded-lg border overflow-auto max-h-[calc(100vh-420px)]">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead>SN</TableHead>
              <TableHead>Invoice No</TableHead>
              <TableHead>From</TableHead>
              <TableHead>To</TableHead>
              <TableHead className="text-center">Items</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((c, i) => (
              <TableRow key={c.id} className="hover:bg-muted/30 transition-colors">
                <TableCell>{i + 1}</TableCell>
                <TableCell className="font-medium">
                  {c.demand ? (
                    <div>
                      <span>{c.demand.demandNo}</span>
                      <div className="text-[10px] text-muted-foreground">{c.challanNo}</div>
                    </div>
                  ) : c.challanNo}
                </TableCell>
                <TableCell className="text-sm">
                  <span>{c.fromWarehouse?.name}</span>
                  <span className="ml-1 text-xs text-muted-foreground">({c.fromWarehouse?.type})</span>
                </TableCell>
                <TableCell className="text-sm">
                  <span>{c.toWarehouse?.name}</span>
                  <span className="ml-1 text-xs text-muted-foreground">({c.toWarehouse?.type})</span>
                </TableCell>
                <TableCell className="text-center text-sm">{c.items.length}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className={STATUS_STYLE[c.status] || ""}>{c.status}</Badge>
                </TableCell>
                <TableCell className="text-sm">{new Date(c.createdAt).toLocaleDateString()}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowDetail(c)}>
                      <Eye className="h-3 w-3" />
                    </Button>
                    {/* Dispatch — outgoing tab + role allowed + PENDING */}
                    {showDispatch && canDispatch && c.status === "PENDING" && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50" onClick={() => setDispatchId(c.id)} title="Dispatch">
                        <Truck className="h-4 w-4" />
                      </Button>
                    )}
                    {/* Receive — incoming tab + role allowed + DISPATCHED */}
                    {showReceive && canReceive && c.status === "DISPATCHED" && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => openReceiveForm(c)} title="Receive">
                        <PackageCheck className="h-4 w-4" />
                      </Button>
                    )}
                    {/* Cancel — only Admin & Super Admin can cancel */}
                    {isAdmin && (c.status === "PENDING" || c.status === "DISPATCHED") && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setCancelId(c.id)} title="Cancel">
                        <XCircle className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader
        icon={<ArrowLeftRight className="h-5 w-5" />}
        title="Stock Transfers"
        subtitle="Warehouse-to-warehouse challan management"
        actions={canCreate ? (
          <Button className="gradient-primary text-primary-foreground" onClick={() => { if (showDialog) { setShowDialog(false); } else { openAdd(); } }}>
            {showDialog ? <><X className="h-4 w-4 mr-2" />Close Form</> : <><Plus className="h-4 w-4 mr-2" />New Transfer</>}
          </Button>
        ) : undefined}
      />

      {/* Status filter pills */}
      <div className="flex gap-1.5 flex-wrap">
        {(["ALL", "PENDING", "DISPATCHED", "RECEIVED", "CANCELLED"] as const).map(s => (
          <Button key={s} variant={filterStatus === s ? "default" : "outline"} size="sm"
            onClick={() => setFilterStatus(s as ChallanStatus | "ALL")}
            className={filterStatus === s ? "gradient-primary text-primary-foreground" : ""}>
            {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
          </Button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by invoice no, demand no or warehouse..." className="pl-9" />
      </div>

      {/* Inline create form — togglable panel */}
      {showDialog && canCreate && (
        <Card className="shadow-sm border-primary/30 bg-primary/[0.02]">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">New Stock Transfer</Label>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowDialog(false)}><ChevronUp className="h-4 w-4" /></Button>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* ── Transfer Details ── */}
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Transfer Details</Label>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>From Warehouse *</Label>
                    <Select value={fromWarehouseId || "__none__"} onValueChange={handleFromChange}>
                      <SelectTrigger className="h-11"><SelectValue placeholder="Select source warehouse" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Select warehouse</SelectItem>
                        {fromWarehouseOptions.map(w => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.name} ({w.type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedFromWH && (
                      <p className="text-xs text-muted-foreground">
                        {selectedFromWH.type === 'MAIN' ? 'Transfers to → Branch warehouses' : ''}
                        {selectedFromWH.type === 'BRANCH' ? 'Transfers to → Kitchen of this outlet' : ''}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>To Warehouse *</Label>
                    <Select
                      value={toWarehouseId || "__none__"}
                      onValueChange={(v) => setToWarehouseId(v === "__none__" ? "" : v)}
                      disabled={!fromWarehouseId || toWarehouseOptions.length === 0}
                    >
                      <SelectTrigger className="h-11"><SelectValue placeholder={!fromWarehouseId ? "Select source first" : "Select destination"} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Select warehouse</SelectItem>
                        {toWarehouseOptions.map(w => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.name} ({w.type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Notes (optional)</Label>
                  <Textarea placeholder="Any notes about this transfer..." value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-16" />
                </div>
              </CardContent>
            </Card>

            {/* ── Section: Items ── */}
            <Card className="shadow-sm">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                  Items ({items.filter(i => i.ingredientId).length})
                </Label>
                <div className="flex gap-2">
                  {toWarehouseId && (
                    <Button variant="outline" size="sm" className="h-8 min-h-[32px]" onClick={addLowStockItems} disabled={loadingLowStock}>
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      {loadingLowStock ? "Loading..." : "Add Low Stock"}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="h-8 min-h-[32px]" onClick={addItemRow}>
                    <Plus className="h-3 w-3 mr-1" />Add Item
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {items.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    {fromWarehouseId && toWarehouseId
                      ? 'Click "Add Item" or "Add Low Stock" to add ingredients'
                      : "Select source and destination warehouses first"}
                  </div>
                )}

                <div className="space-y-2">
                  {items.map((item, idx) => (
                    <div key={idx} className="border rounded-lg p-3 space-y-2 border-l-2 border-l-primary/40 bg-primary/5">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <div className="flex-1 min-w-0">
                          <Select value={item.ingredientId || "__none__"} onValueChange={(v) => updateItemRow(idx, "ingredientId", v === "__none__" ? "" : v)}>
                            <SelectTrigger className="h-10 text-sm">
                              <SelectValue placeholder="Select ingredient" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Select ingredient</SelectItem>
                              {ingredients
                                .filter(ig => !items.some((it, ii) => ii !== idx && it.ingredientId === ig.id))
                                .map(ig => (
                                  <SelectItem key={ig.id} value={ig.id}>{ig.name} (Warehouse: {sourceStockMap[ig.id]?.stock ?? 0} {sourceStockMap[ig.id]?.unit ?? ig.unit?.name ?? ""})</SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0" onClick={() => removeItemRow(idx)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {item.ingredientId && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Available in Source</Label>
                            <div className={`h-10 flex items-center px-3 text-sm font-semibold rounded-md border bg-muted/50 ${item.availableStock <= 0 ? "text-destructive" : "text-blue-600"}`}>
                              {item.availableStock} {item.unit}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Transfer Qty ({item.unit}) *</Label>
                            <Input
                              className={`h-10 text-sm ${item.qty > item.availableStock ? "border-destructive text-destructive" : ""}`}
                              type="number"
                              min={0}
                              max={item.availableStock}
                              value={item.qty || ""}
                              onChange={(e) => {
                                const val = Math.min(Number(e.target.value), item.availableStock);
                                updateItemRow(idx, "qty", Math.max(0, val));
                              }}
                            />
                          </div>
                          <div className="space-y-1 col-span-2 sm:col-span-1">
                            <Label className="text-xs text-muted-foreground">Remaining After</Label>
                            <div className={`h-10 flex items-center px-3 text-sm font-semibold rounded-md border bg-muted/50 ${(item.availableStock - item.qty) <= 0 ? "text-warning" : "text-success"}`}>
                              {Math.max(0, item.availableStock - item.qty)} {item.unit}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button className="gradient-primary text-primary-foreground" size="sm" onClick={handleCreateChallan} disabled={saving}>
                <Truck className="h-4 w-4 mr-1.5" />
                {saving ? "Creating..." : "Create Transfer"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Single-section view for KM (incoming only) and Super Admin (outgoing only) */}
      {showOutgoingSection && showIncomingSection ? (
        /* Both sections — Manager / Admin */
        <Tabs defaultValue="outgoing">
          <TabsList>
            <TabsTrigger value="outgoing">
              <Truck className="h-4 w-4 mr-1.5" />
              Outgoing ({outgoingChallans.length})
            </TabsTrigger>
            <TabsTrigger value="incoming">
              <PackageCheck className="h-4 w-4 mr-1.5" />
              Incoming ({incomingChallans.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="outgoing" className="mt-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <p className="text-xs text-muted-foreground">
                  Challans you dispatch from your branch to kitchens. Dispatch pending challans here.
                </p>
              </CardHeader>
              <CardContent>
                <ChallanTable
                  list={displayedOutgoing}
                  emptyMsg="No outgoing transfers found"
                  showDispatch={true}
                  showReceive={false}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="incoming" className="mt-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <p className="text-xs text-muted-foreground">
                  Stock dispatched from main warehouse to your branch. Receive once goods are verified.
                </p>
              </CardHeader>
              <CardContent>
                <ChallanTable
                  list={displayedIncoming}
                  emptyMsg="No incoming transfers found"
                  showDispatch={false}
                  showReceive={true}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : showOutgoingSection ? (
        /* Super Admin — outgoing only */
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Truck className="h-4 w-4" />
              Outgoing Transfers ({outgoingChallans.length})
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Challans dispatched from main warehouse to branches. Dispatch pending challans here.
            </p>
          </CardHeader>
          <CardContent>
            <ChallanTable
              list={displayedOutgoing}
              emptyMsg="No outgoing transfers found"
              showDispatch={true}
              showReceive={false}
            />
          </CardContent>
        </Card>
      ) : (
        /* Kitchen Manager — incoming only */
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <PackageCheck className="h-4 w-4" />
              Incoming Transfers ({incomingChallans.length})
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Stock dispatched to your kitchen. Confirm receipt once goods are physically verified.
            </p>
          </CardHeader>
          <CardContent>
            <ChallanTable
              list={displayedIncoming}
              emptyMsg="No incoming transfers found"
              showDispatch={false}
              showReceive={true}
            />
          </CardContent>
        </Card>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 flex-wrap">
              {showDetail?.demand ? (
                <>
                  <ClipboardList className="h-5 w-5 text-orange-600" />
                  <span>Stock Demand: {showDetail.demand.demandNo}</span>
                  <Badge variant="secondary" className={
                    showDetail.demand.status === "APPROVED" || showDetail.demand.status === "FULFILLED"
                      ? "bg-green-100 text-green-800"
                      : showDetail.demand.status === "REJECTED"
                      ? "bg-red-100 text-red-800"
                      : showDetail.demand.status === "PENDING"
                      ? "bg-yellow-100 text-yellow-800"
                      : ""
                  }>
                    Demand: {showDetail.demand.status}
                  </Badge>
                  <Badge variant="secondary" className={STATUS_STYLE[showDetail.status] || ""}>
                    Challan: {showDetail.status}
                  </Badge>
                </>
              ) : (
                <>
                  <span>Stock Transfer Challan: {showDetail?.challanNo}</span>
                  {showDetail && (
                    <Badge variant="secondary" className={STATUS_STYLE[showDetail.status] || ""}>
                      {showDetail.status}
                    </Badge>
                  )}
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          {showDetail && showDetail.demand ? (
            /* ── Demand-linked challan: show full demand details ── */
            <div className="space-y-4">
              {/* Challan ref badge */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-1.5 w-fit">
                <FileText className="h-3.5 w-3.5" />
                <span>Challan Ref: <span className="font-medium text-foreground">{showDetail.challanNo}</span></span>
              </div>

              {/* Requested By / Approved By Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card className="shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Requested By</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{showDetail.demand.requestedBy?.name ?? "—"}</span>
                      {showDetail.demand.requestedBy?.role && <Badge variant="secondary" className="text-xs">{showDetail.demand.requestedBy.role}</Badge>}
                    </div>
                    {showDetail.demand.requestedBy?.outlet && (
                      <div className="text-xs text-muted-foreground">Outlet: <span className="font-medium text-foreground">{showDetail.demand.requestedBy.outlet}</span></div>
                    )}
                    {showDetail.demand.requestedBy?.phone && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="h-3 w-3" />{showDetail.demand.requestedBy.phone}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1">Requested: {new Date(showDetail.demand.createdAt).toLocaleString()}</div>
                  </CardContent>
                </Card>
                <Card className="shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">
                      {showDetail.demand.status === "REJECTED" ? "Rejected By" : "Approved By"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {showDetail.demand.approvedBy ? (
                      <>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{showDetail.demand.approvedBy.name}</span>
                          {showDetail.demand.approvedBy.role && <Badge variant="secondary" className="text-xs">{showDetail.demand.approvedBy.role}</Badge>}
                        </div>
                        {showDetail.demand.approvedBy.outlet && (
                          <div className="text-xs text-muted-foreground">Outlet: <span className="font-medium text-foreground">{showDetail.demand.approvedBy.outlet}</span></div>
                        )}
                        {showDetail.demand.approvedBy.phone && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Phone className="h-3 w-3" />{showDetail.demand.approvedBy.phone}
                          </div>
                        )}
                        {showDetail.demand.approvedAt && (
                          <div className="text-xs text-muted-foreground mt-1">Approved: {new Date(showDetail.demand.approvedAt).toLocaleString()}</div>
                        )}
                      </>
                    ) : (
                      <div className="text-sm text-muted-foreground">Pending approval</div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Dispatch / Receive info (challan lifecycle) */}
              {(showDetail.dispatchedBy || showDetail.receivedBy) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {showDetail.dispatchedBy && (
                    <Card className="shadow-sm border-blue-200">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs text-blue-600 uppercase tracking-wider">Dispatched By</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Truck className="h-4 w-4 text-blue-500" />
                          <span className="font-medium">{showDetail.dispatchedBy.name}</span>
                          {showDetail.dispatchedBy.role && <Badge variant="secondary" className="text-xs">{showDetail.dispatchedBy.role}</Badge>}
                        </div>
                        {showDetail.dispatchedBy.outlet && (
                          <div className="text-xs text-muted-foreground">Outlet: <span className="font-medium text-foreground">{showDetail.dispatchedBy.outlet}</span></div>
                        )}
                        {showDetail.dispatchedBy.phone && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Phone className="h-3 w-3" />{showDetail.dispatchedBy.phone}
                          </div>
                        )}
                        {showDetail.dispatchedAt && (
                          <div className="text-xs text-muted-foreground mt-1">Dispatched: {new Date(showDetail.dispatchedAt).toLocaleString()}</div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                  {showDetail.receivedBy && (
                    <Card className="shadow-sm border-green-200">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs text-green-600 uppercase tracking-wider">Received By</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-1">
                        <div className="flex items-center gap-2">
                          <PackageCheck className="h-4 w-4 text-green-500" />
                          <span className="font-medium">{showDetail.receivedBy.name}</span>
                          {showDetail.receivedBy.role && <Badge variant="secondary" className="text-xs">{showDetail.receivedBy.role}</Badge>}
                        </div>
                        {showDetail.receivedBy.outlet && (
                          <div className="text-xs text-muted-foreground">Outlet: <span className="font-medium text-foreground">{showDetail.receivedBy.outlet}</span></div>
                        )}
                        {showDetail.receivedBy.phone && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Phone className="h-3 w-3" />{showDetail.receivedBy.phone}
                          </div>
                        )}
                        {showDetail.receivedAt && (
                          <div className="text-xs text-muted-foreground mt-1">Received: {new Date(showDetail.receivedAt).toLocaleString()}</div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* Warehouse Route */}
              <div className="flex gap-4 text-sm flex-wrap">
                <div><span className="text-muted-foreground">Requesting WH:</span> <span className="font-medium">{showDetail.demand.requestingWH?.name}</span> <Badge variant="secondary" className="text-xs ml-1">{showDetail.demand.requestingWH?.type}</Badge></div>
                <span className="text-muted-foreground">←</span>
                <div><span className="text-muted-foreground">Supplying WH:</span> <span className="font-medium">{showDetail.demand.supplyingWH?.name}</span> <Badge variant="secondary" className="text-xs ml-1">{showDetail.demand.supplyingWH?.type}</Badge></div>
              </div>

              {/* Notes */}
              {showDetail.demand.notes && (
                <div className="flex gap-2 text-sm">
                  <span className="text-muted-foreground">Notes:</span>
                  <span>{showDetail.demand.notes}</span>
                </div>
              )}

              {/* Demand Items Table — full detail with requested/approved/stock columns */}
              <div className="rounded-lg border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead>SN</TableHead>
                      <TableHead>Ingredient</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Stock at Request</TableHead>
                      <TableHead className="text-right">Requested Qty</TableHead>
                      {(showDetail.demand.status === "APPROVED" || showDetail.demand.status === "FULFILLED") && (
                        <TableHead className="text-right">Approved Qty</TableHead>
                      )}
                      {showDetail.status === "RECEIVED" && (
                        <TableHead className="text-right">Received</TableHead>
                      )}
                      {showDetail.status === "RECEIVED" && (
                        <TableHead className="text-right">Waste</TableHead>
                      )}
                      {showDetail.status === "RECEIVED" && (
                        <TableHead className="text-right">Net to Stock</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {showDetail.demand.items.map((dItem, i) => {
                      const cItem = showDetail.items[i];
                      const hasApproved = showDetail.demand!.status === "APPROVED" || showDetail.demand!.status === "FULFILLED";
                      const received = cItem?.receivedQty ?? cItem?.qty ?? 0;
                      const waste = cItem?.wasteQty ?? 0;
                      const netStock = received - waste;
                      return (
                        <TableRow key={dItem.id}>
                          <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="font-medium">{dItem.ingredientName}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{dItem.category ?? "—"}</TableCell>
                          <TableCell className="text-sm">{dItem.unit}</TableCell>
                          <TableCell className="text-right">{dItem.stockAtRequest ?? "—"}</TableCell>
                          <TableCell className="text-right">{dItem.requestedQty}</TableCell>
                          {hasApproved && (
                            <TableCell className="text-right font-semibold">{dItem.approvedQty ?? "—"}</TableCell>
                          )}
                          {showDetail.status === "RECEIVED" && (
                            <TableCell className="text-right font-medium">
                              <span className={received < (cItem?.qty ?? 0) ? "text-warning" : "text-foreground"}>
                                {received}
                              </span>
                            </TableCell>
                          )}
                          {showDetail.status === "RECEIVED" && (
                            <TableCell className="text-right text-sm">
                              {waste > 0 ? (
                                <span className="text-destructive font-medium">{waste}</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          )}
                          {showDetail.status === "RECEIVED" && (
                            <TableCell className="text-right font-semibold">
                              <span className={netStock < (cItem?.qty ?? 0) ? "text-warning" : "text-success"}>
                                {netStock}
                              </span>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Waste Reasons (if any items have waste) */}
              {showDetail.status === "RECEIVED" && showDetail.items.some(item => (item.wasteQty ?? 0) > 0 && item.wasteReason) && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Waste Reasons</Label>
                  {showDetail.items.filter(item => (item.wasteQty ?? 0) > 0 && item.wasteReason).map((item, i) => (
                    <div key={i} className="flex gap-2 text-sm bg-destructive/5 border border-destructive/20 rounded-md px-3 py-1.5">
                      <span className="font-medium text-destructive shrink-0">{item.ingredientName}:</span>
                      <span className="text-muted-foreground">{item.wasteReason}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Total items */}
              <div className="text-sm text-right text-muted-foreground">
                Total Items: <span className="font-semibold text-foreground">{showDetail.demand.items.length}</span>
              </div>

              {/* Cost Summary */}
              {((showDetail.shippingCost ?? 0) > 0 || (showDetail.miscAmount ?? 0) > 0) && (
                <div className="flex justify-end">
                  <div className="w-64 space-y-1 text-sm border rounded-lg p-3 bg-muted/30">
                    {showDetail.shippingCost != null && showDetail.shippingCost > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Shipping Cost</span>
                        <span>Rs. {showDetail.shippingCost.toLocaleString()}</span>
                      </div>
                    )}
                    {showDetail.miscAmount != null && showDetail.miscAmount > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Misc Charges</span>
                        <span>Rs. {showDetail.miscAmount.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t pt-1 font-semibold">
                      <span>Total Extra Cost</span>
                      <span>Rs. {((showDetail.shippingCost ?? 0) + (showDetail.miscAmount ?? 0)).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : showDetail ? (
            /* ── Standalone challan (manual transfer) ── */
            <div className="space-y-4">
              {/* Created By card */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card className="shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Created By</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{showDetail.createdBy?.name ?? "—"}</span>
                      {showDetail.createdBy?.role && <Badge variant="secondary" className="text-xs">{showDetail.createdBy.role}</Badge>}
                    </div>
                    {showDetail.createdBy?.outlet && (
                      <div className="text-xs text-muted-foreground">Outlet: <span className="font-medium text-foreground">{showDetail.createdBy.outlet}</span></div>
                    )}
                    {showDetail.createdBy?.phone && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="h-3 w-3" />{showDetail.createdBy.phone}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1">Created: {new Date(showDetail.createdAt).toLocaleString()}</div>
                  </CardContent>
                </Card>
                {!showDetail.dispatchedBy && !showDetail.receivedBy && (
                  <Card className="shadow-sm border-dashed">
                    <CardContent className="flex items-center justify-center h-full py-6">
                      <div className="text-sm text-muted-foreground">Pending Dispatch</div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Dispatched / Received cards — same layout as demand-linked */}
              {(showDetail.dispatchedBy || showDetail.receivedBy) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {showDetail.dispatchedBy && (
                    <Card className="shadow-sm border-blue-200">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs text-blue-600 uppercase tracking-wider">Dispatched By</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Truck className="h-4 w-4 text-blue-500" />
                          <span className="font-medium">{showDetail.dispatchedBy.name}</span>
                          {showDetail.dispatchedBy.role && <Badge variant="secondary" className="text-xs">{showDetail.dispatchedBy.role}</Badge>}
                        </div>
                        {showDetail.dispatchedBy.outlet && (
                          <div className="text-xs text-muted-foreground">Outlet: <span className="font-medium text-foreground">{showDetail.dispatchedBy.outlet}</span></div>
                        )}
                        {showDetail.dispatchedBy.phone && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Phone className="h-3 w-3" />{showDetail.dispatchedBy.phone}
                          </div>
                        )}
                        {showDetail.dispatchedAt && (
                          <div className="text-xs text-muted-foreground mt-1">Dispatched: {new Date(showDetail.dispatchedAt).toLocaleString()}</div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                  {showDetail.receivedBy && (
                    <Card className="shadow-sm border-green-200">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs text-green-600 uppercase tracking-wider">Received By</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-1">
                        <div className="flex items-center gap-2">
                          <PackageCheck className="h-4 w-4 text-green-500" />
                          <span className="font-medium">{showDetail.receivedBy.name}</span>
                          {showDetail.receivedBy.role && <Badge variant="secondary" className="text-xs">{showDetail.receivedBy.role}</Badge>}
                        </div>
                        {showDetail.receivedBy.outlet && (
                          <div className="text-xs text-muted-foreground">Outlet: <span className="font-medium text-foreground">{showDetail.receivedBy.outlet}</span></div>
                        )}
                        {showDetail.receivedBy.phone && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Phone className="h-3 w-3" />{showDetail.receivedBy.phone}
                          </div>
                        )}
                        {showDetail.receivedAt && (
                          <div className="text-xs text-muted-foreground mt-1">Received: {new Date(showDetail.receivedAt).toLocaleString()}</div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* Warehouse Route */}
              <div className="flex gap-4 text-sm flex-wrap">
                <div><span className="text-muted-foreground">From:</span> <span className="font-medium">{showDetail.fromWarehouse?.name}</span> <Badge variant="secondary" className="text-xs ml-1">{showDetail.fromWarehouse?.type}</Badge></div>
                <span className="text-muted-foreground">→</span>
                <div><span className="text-muted-foreground">To:</span> <span className="font-medium">{showDetail.toWarehouse?.name}</span> <Badge variant="secondary" className="text-xs ml-1">{showDetail.toWarehouse?.type}</Badge></div>
              </div>

              {/* Notes */}
              {showDetail.notes && (
                <div className="flex gap-2 text-sm">
                  <span className="text-muted-foreground">Notes:</span>
                  <span>{showDetail.notes}</span>
                </div>
              )}

              {/* Items Table — same detail level as demand-linked */}
              <div className="rounded-lg border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead>SN</TableHead>
                      <TableHead>Ingredient</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Dispatched Qty</TableHead>
                      {showDetail.status === "RECEIVED" && <TableHead className="text-right">Received</TableHead>}
                      {showDetail.status === "RECEIVED" && <TableHead className="text-right">Waste</TableHead>}
                      {showDetail.status === "RECEIVED" && <TableHead className="text-right">Net to Stock</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {showDetail.items.map((item, i) => {
                      const received = item.receivedQty ?? item.qty;
                      const waste = item.wasteQty ?? 0;
                      const netStock = received - waste;
                      return (
                        <TableRow key={i}>
                          <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="font-medium">{item.ingredientName}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{item.category ?? "—"}</TableCell>
                          <TableCell className="text-sm">{item.unit}</TableCell>
                          <TableCell className="text-right">{item.qty}</TableCell>
                          {showDetail.status === "RECEIVED" && (
                            <TableCell className="text-right font-medium">
                              <span className={received < item.qty ? "text-warning" : "text-foreground"}>
                                {received}
                              </span>
                            </TableCell>
                          )}
                          {showDetail.status === "RECEIVED" && (
                            <TableCell className="text-right text-sm">
                              {waste > 0 ? (
                                <span className="text-destructive font-medium">{waste}</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          )}
                          {showDetail.status === "RECEIVED" && (
                            <TableCell className="text-right font-semibold">
                              <span className={netStock < item.qty ? "text-warning" : "text-success"}>
                                {netStock}
                              </span>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Waste Reasons (if any items have waste) */}
              {showDetail.status === "RECEIVED" && showDetail.items.some(item => (item.wasteQty ?? 0) > 0 && item.wasteReason) && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Waste Reasons</Label>
                  {showDetail.items.filter(item => (item.wasteQty ?? 0) > 0 && item.wasteReason).map((item, i) => (
                    <div key={i} className="flex gap-2 text-sm bg-destructive/5 border border-destructive/20 rounded-md px-3 py-1.5">
                      <span className="font-medium text-destructive shrink-0">{item.ingredientName}:</span>
                      <span className="text-muted-foreground">{item.wasteReason}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Total items */}
              <div className="text-sm text-right text-muted-foreground">
                Total Items: <span className="font-semibold text-foreground">{showDetail.items.length}</span>
              </div>

              {/* Cost Summary */}
              {(showDetail.shippingCost != null || showDetail.miscAmount != null) && (
                <div className="flex justify-end">
                  <div className="w-64 space-y-1 text-sm border rounded-lg p-3 bg-muted/30">
                    {showDetail.shippingCost != null && showDetail.shippingCost > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Shipping Cost</span>
                        <span>Rs. {showDetail.shippingCost.toLocaleString()}</span>
                      </div>
                    )}
                    {showDetail.miscAmount != null && showDetail.miscAmount > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Misc Charges</span>
                        <span>Rs. {showDetail.miscAmount.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t pt-1 font-semibold">
                      <span>Total Extra Cost</span>
                      <span>Rs. {((showDetail.shippingCost ?? 0) + (showDetail.miscAmount ?? 0)).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : null}
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => {
              const c = showDetail;
              if (!c) return;
              const w = window.open("", "_blank", "width=800,height=700");
              if (!w) return;
              const CSS = `*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;padding:30px;color:#333;font-size:13px}h1{font-size:20px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccc;padding:8px;text-align:left}th{background:#f0f0f0;font-weight:600;font-size:12px}.header{text-align:center;border-bottom:2px solid #333;padding-bottom:16px;margin-bottom:16px}.info-grid{display:flex;justify-content:space-between;margin-bottom:16px}.badge{display:inline-block;padding:3px 12px;border-radius:12px;font-size:11px;font-weight:600;margin-top:6px}.summary{text-align:right;margin-top:12px}.cost-box{margin-top:16px;border-top:1px solid #ccc;padding-top:12px;text-align:right}@media print{body{padding:15px}}`;

              if (c.demand) {
                // ── Demand-linked challan → print full demand invoice with challan lifecycle ──
                const d = c.demand;
                const st = d.status;
                const hasApproved = st === "APPROVED" || st === "FULFILLED";
                const isReceived = c.status === "RECEIVED";
                const approverHtml = d.approvedBy
                  ? `<div style="text-align:right"><p style="font-size:11px;color:#888;text-transform:uppercase;font-weight:600">${st === "REJECTED" ? "Rejected By" : "Approved By"}</p><p style="font-weight:600">${d.approvedBy.name}</p><p style="color:#666">${d.approvedBy.role ?? ""}${d.approvedBy.outlet ? ` — ${d.approvedBy.outlet}` : ""}</p>${d.approvedBy.phone ? `<p style="color:#666">${d.approvedBy.phone}</p>` : ""}${d.approvedAt ? `<p style="font-size:11px;color:#888">${new Date(d.approvedAt).toLocaleString()}</p>` : ""}</div>`
                  : `<div style="text-align:right"><p style="font-size:11px;color:#888;text-transform:uppercase;font-weight:600">Warehouses</p><p style="font-weight:600">${d.supplyingWH?.name} → ${d.requestingWH?.name}</p></div>`;
                w.document.write(`<!DOCTYPE html><html><head><title>${d.demandNo}</title><style>${CSS}</style></head><body>`);
                w.document.write(`<div class="header"><h1>Stock Demand</h1><p style="color:#666;margin-top:4px">${d.demandNo}</p><p style="font-size:11px;color:#999;margin-top:2px">Challan Ref: ${c.challanNo}</p><span class="badge" style="background:${hasApproved ? "#e6f4ea;color:#1a7f37" : st === "REJECTED" ? "#fde8e8;color:#d32f2f" : st === "PENDING" ? "#fff8e1;color:#f57f17" : "#eee;color:#666"}">${st}</span>&nbsp;<span class="badge" style="background:${isReceived ? "#e6f4ea;color:#1a7f37" : c.status === "DISPATCHED" ? "#e8f0fe;color:#1a56db" : c.status === "CANCELLED" ? "#eee;color:#666" : "#fff8e1;color:#f57f17"}">Challan: ${c.status}</span></div>`);
                w.document.write(`<div class="info-grid"><div><p style="font-size:11px;color:#888;text-transform:uppercase;font-weight:600">Requested By</p><p style="font-weight:600">${d.requestedBy?.name ?? "—"}</p><p style="color:#666">${d.requestedBy?.role ?? ""}${d.requestedBy?.outlet ? ` — ${d.requestedBy.outlet}` : ""}</p>${d.requestedBy?.phone ? `<p style="color:#666">${d.requestedBy.phone}</p>` : ""}<p style="font-size:11px;color:#888;margin-top:4px">Date: ${new Date(d.createdAt).toLocaleString()}</p></div>${approverHtml}</div>`);
                // Dispatch / Receive info
                if (c.dispatchedBy || c.receivedBy) {
                  w.document.write(`<div class="info-grid" style="border-top:1px solid #eee;padding-top:12px">`);
                  if (c.dispatchedBy) w.document.write(`<div><p style="font-size:11px;color:#1a56db;text-transform:uppercase;font-weight:600">Dispatched By</p><p style="font-weight:600">${c.dispatchedBy.name}</p><p style="color:#666">${c.dispatchedBy.role ?? ""}${c.dispatchedBy.outlet ? ` — ${c.dispatchedBy.outlet}` : ""}</p>${c.dispatchedBy.phone ? `<p style="color:#666">${c.dispatchedBy.phone}</p>` : ""}${c.dispatchedAt ? `<p style="font-size:11px;color:#888">${new Date(c.dispatchedAt).toLocaleString()}</p>` : ""}</div>`);
                  if (c.receivedBy) w.document.write(`<div style="text-align:right"><p style="font-size:11px;color:#1a7f37;text-transform:uppercase;font-weight:600">Received By</p><p style="font-weight:600">${c.receivedBy.name}</p><p style="color:#666">${c.receivedBy.role ?? ""}${c.receivedBy.outlet ? ` — ${c.receivedBy.outlet}` : ""}</p>${c.receivedBy.phone ? `<p style="color:#666">${c.receivedBy.phone}</p>` : ""}${c.receivedAt ? `<p style="font-size:11px;color:#888">${new Date(c.receivedAt).toLocaleString()}</p>` : ""}</div>`);
                  w.document.write(`</div>`);
                }
                w.document.write(`<p style="margin-bottom:8px"><strong>Requesting WH:</strong> ${d.requestingWH?.name} (${d.requestingWH?.type}) &nbsp;&nbsp; <strong>Supplying WH:</strong> ${d.supplyingWH?.name} (${d.supplyingWH?.type})</p>`);
                if (d.notes) w.document.write(`<p style="background:#f5f5f5;padding:8px;border-radius:4px;margin-bottom:8px"><strong>Notes:</strong> ${d.notes}</p>`);
                w.document.write(`<table><thead><tr><th>SN</th><th>Ingredient</th><th>Category</th><th>Unit</th><th style="text-align:right">Stock at Request</th><th style="text-align:right">Requested</th>${hasApproved ? '<th style="text-align:right">Approved</th>' : ""}${isReceived ? '<th style="text-align:right">Received</th><th style="text-align:right">Waste</th><th style="text-align:right">Net to Stock</th>' : ""}</tr></thead><tbody>`);
                d.items.forEach((item, i) => {
                  const cItem = c.items[i];
                  const recv = cItem?.receivedQty ?? cItem?.qty ?? 0;
                  const waste = cItem?.wasteQty ?? 0;
                  const net = recv - waste;
                  w.document.write(`<tr><td>${i + 1}</td><td>${item.ingredientName}</td><td>${item.category ?? "—"}</td><td>${item.unit}</td><td style="text-align:right">${item.stockAtRequest ?? "—"}</td><td style="text-align:right">${item.requestedQty}</td>${hasApproved ? `<td style="text-align:right;font-weight:600">${item.approvedQty ?? "—"}</td>` : ""}${isReceived ? `<td style="text-align:right;font-weight:600">${recv}</td><td style="text-align:right;color:${waste > 0 ? "#d32f2f" : "#888"}">${waste > 0 ? waste : "—"}</td><td style="text-align:right;font-weight:600;color:${net < (cItem?.qty ?? 0) ? "#d97706" : "#16a34a"}">${net}</td>` : ""}</tr>`);
                });
                w.document.write(`</tbody></table><p class="summary">Total Items: <strong>${d.items.length}</strong></p>`);
                const totalExtra = (c.shippingCost ?? 0) + (c.miscAmount ?? 0);
                if (totalExtra > 0) {
                  w.document.write(`<div class="cost-box">${c.shippingCost ? `<p>Shipping Cost: <strong>Rs. ${c.shippingCost.toLocaleString()}</strong></p>` : ""}${c.miscAmount ? `<p>Misc Charges: <strong>Rs. ${c.miscAmount.toLocaleString()}</strong></p>` : ""}<p style="font-size:14px;font-weight:700;margin-top:6px">Total Extra Cost: Rs. ${totalExtra.toLocaleString()}</p></div>`);
                }
                w.document.write(`</body></html>`);
              } else {
                // ── Manually created challan → print challan invoice ──
                const st = c.status;
                const isReceived = st === "RECEIVED";
                const dispUser = c.receivedBy ?? c.dispatchedBy;
                const dispLabel = c.receivedBy ? "Received By" : c.dispatchedBy ? "Dispatched By" : "Pending Dispatch";
                const dispHtml = dispUser
                  ? `<div style="text-align:right"><p style="font-size:11px;color:#888;text-transform:uppercase;font-weight:600">${dispLabel}</p><p style="font-weight:600">${dispUser.name}</p><p style="color:#666">${dispUser.role ?? ""}</p>${dispUser.phone ? `<p style="color:#666">${dispUser.phone}</p>` : ""}${c.dispatchedAt ? `<p style="font-size:11px;color:#888">Dispatched: ${new Date(c.dispatchedAt).toLocaleString()}</p>` : ""}${c.receivedAt ? `<p style="font-size:11px;color:#888">Received: ${new Date(c.receivedAt).toLocaleString()}</p>` : ""}</div>`
                  : `<div style="text-align:right"><p style="font-size:11px;color:#888;text-transform:uppercase;font-weight:600">Status</p><p style="color:#666">Pending Dispatch</p></div>`;
                const totalExtra = (c.shippingCost ?? 0) + (c.miscAmount ?? 0);
                w.document.write(`<!DOCTYPE html><html><head><title>${c.challanNo}</title><style>${CSS}</style></head><body>`);
                w.document.write(`<div class="header"><h1>Stock Transfer Challan</h1><p style="color:#666;margin-top:4px">${c.challanNo}</p><span class="badge" style="background:${isReceived ? "#e6f4ea;color:#1a7f37" : st === "CANCELLED" ? "#eee;color:#666" : st === "DISPATCHED" ? "#e8f0fe;color:#1a56db" : "#fff8e1;color:#f57f17"}">${st}</span></div>`);
                w.document.write(`<div class="info-grid"><div><p style="font-size:11px;color:#888;text-transform:uppercase;font-weight:600">Created By</p><p style="font-weight:600">${c.createdBy?.name ?? "—"}</p><p style="color:#666">${c.createdBy?.role ?? ""}${c.createdBy?.outlet ? ` — ${c.createdBy.outlet}` : ""}</p>${c.createdBy?.phone ? `<p style="color:#666">${c.createdBy.phone}</p>` : ""}<p style="font-size:11px;color:#888;margin-top:4px">Date: ${new Date(c.createdAt).toLocaleString()}</p></div>${dispHtml}</div>`);
                w.document.write(`<p style="margin-bottom:8px"><strong>From WH:</strong> ${c.fromWarehouse?.name ?? "—"} (${c.fromWarehouse?.type ?? ""}) &nbsp;&nbsp; <strong>To WH:</strong> ${c.toWarehouse?.name ?? "—"} (${c.toWarehouse?.type ?? ""})</p>`);
                if (c.notes) w.document.write(`<p style="background:#f5f5f5;padding:8px;border-radius:4px;margin-bottom:8px"><strong>Notes:</strong> ${c.notes}</p>`);
                w.document.write(`<table><thead><tr><th>SN</th><th>Ingredient</th><th>Category</th><th>Unit</th><th style="text-align:right">Dispatched</th>${isReceived ? '<th style="text-align:right">Received</th><th style="text-align:right">Waste</th><th style="text-align:right">Net to Stock</th>' : ""}</tr></thead><tbody>`);
                c.items.forEach((item, idx) => {
                  const recv = item.receivedQty ?? item.qty;
                  const waste = item.wasteQty ?? 0;
                  const net = recv - waste;
                  w.document.write(`<tr><td>${idx + 1}</td><td>${item.ingredientName}</td><td>${item.category ?? "—"}</td><td>${item.unit}</td><td style="text-align:right">${item.qty}</td>${isReceived ? `<td style="text-align:right;font-weight:600">${recv}</td><td style="text-align:right;color:${waste > 0 ? "#d32f2f" : "#888"}">${waste > 0 ? waste : "—"}</td><td style="text-align:right;font-weight:600;color:${net < item.qty ? "#d97706" : "#16a34a"}">${net}</td>` : ""}</tr>`);
                });
                w.document.write(`</tbody></table>`);
                if (totalExtra > 0) {
                  w.document.write(`<div class="cost-box">${c.shippingCost ? `<p>Shipping Cost: <strong>Rs. ${c.shippingCost.toLocaleString()}</strong></p>` : ""}${c.miscAmount ? `<p>Misc Charges: <strong>Rs. ${c.miscAmount.toLocaleString()}</strong></p>` : ""}<p style="font-size:14px;font-weight:700;margin-top:6px">Total Extra Cost: Rs. ${totalExtra.toLocaleString()}</p></div>`);
                }
                w.document.write(`<p class="summary">Total Items: <strong>${c.items.length}</strong></p></body></html>`);
              }
              w.document.close();
              w.print();
            }}>
              <Printer className="h-4 w-4 mr-1" />Print / PDF
            </Button>
            <Button variant="outline" onClick={() => setShowDetail(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dispatch Confirmation */}
      <AlertDialog open={!!dispatchId} onOpenChange={() => setDispatchId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dispatch this challan?</AlertDialogTitle>
            <AlertDialogDescription>Stock will be deducted from the source warehouse immediately.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDispatch} className="bg-blue-600 hover:bg-blue-700">{saving ? "Dispatching..." : "Dispatch"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Receive Form Dialog */}
      <Dialog open={!!receiveChallan} onOpenChange={() => setReceiveChallan(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-green-600" />
              Receive Challan: {receiveChallan?.demand?.demandNo ?? receiveChallan?.challanNo}
            </DialogTitle>
          </DialogHeader>
          {receiveChallan && (
            <div className="space-y-4">
              {/* Challan info summary */}
              <div className="flex gap-4 text-sm flex-wrap bg-muted/30 rounded-lg px-3 py-2">
                <div><span className="text-muted-foreground">From:</span> <span className="font-medium">{receiveChallan.fromWarehouse?.name}</span></div>
                <span className="text-muted-foreground">→</span>
                <div><span className="text-muted-foreground">To:</span> <span className="font-medium">{receiveChallan.toWarehouse?.name}</span></div>
                <div className="ml-auto"><span className="text-muted-foreground">Items:</span> <span className="font-medium">{receiveChallan.items.length}</span></div>
              </div>

              {/* Item cards — matches purchase form pattern */}
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Items to Receive</Label>
                <div className="space-y-2 mt-2">
                  {receiveItems.map((ri, idx) => {
                    const netReceived = ri.receivedQty - ri.wasteQty;
                    return (
                      <div key={ri.id} className="border rounded-lg p-3 space-y-2 border-l-2 border-l-green-400/60 bg-green-50/30 dark:bg-green-950/10">
                        <div className="flex items-center justify-between gap-2 flex-wrap min-w-0">
                          <span className="font-medium text-sm truncate min-w-0">{ri.ingredientName}</span>
                          <Badge variant="secondary" className="text-xs shrink-0">
                            Dispatched: {ri.qty} {ri.unit}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Received Qty ({ri.unit})</Label>
                            <Input
                              className="h-10 text-sm"
                              type="number"
                              min={0}
                              max={ri.qty}
                              value={ri.receivedQty || ""}
                              onChange={(e) => {
                                const val = Math.min(Number(e.target.value), ri.qty);
                                setReceiveItems(prev => prev.map((r, i) => i === idx ? { ...r, receivedQty: Math.max(0, val) } : r));
                              }}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Waste Qty</Label>
                            <Input
                              className="h-10 text-sm"
                              type="number"
                              min={0}
                              max={ri.receivedQty}
                              value={ri.wasteQty || ""}
                              onChange={(e) => {
                                const val = Math.min(Number(e.target.value), ri.receivedQty);
                                setReceiveItems(prev => prev.map((r, i) => i === idx ? { ...r, wasteQty: Math.max(0, val) } : r));
                              }}
                            />
                          </div>
                          <div className="space-y-1 col-span-2 sm:col-span-1">
                            <Label className="text-xs text-muted-foreground">Net to Stock</Label>
                            <div className={`h-10 flex items-center px-3 text-sm font-semibold rounded-md border bg-muted/50 ${netReceived < ri.qty ? "text-warning" : "text-success"}`}>
                              {netReceived} {ri.unit}
                            </div>
                          </div>
                        </div>
                        {ri.wasteQty > 0 && (
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Waste Reason</Label>
                            <Input
                              className="h-10 text-sm"
                              placeholder="e.g. Broken during transport, expired..."
                              value={ri.wasteReason}
                              onChange={(e) => setReceiveItems(prev => prev.map((r, i) => i === idx ? { ...r, wasteReason: e.target.value } : r))}
                            />
                          </div>
                        )}
                        {ri.wasteQty > 0 && (
                          <div className="flex items-center justify-end text-sm">
                            <Badge variant="secondary" className="text-xs bg-success/10 text-success">
                              Added to stock: {netReceived} {ri.unit}
                            </Badge>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Extra Charges — matches purchase billing summary */}
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Extra Charges (optional)</Label>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 w-full max-w-sm ml-auto">
                    <div className="flex items-center gap-3">
                      <Label className="text-sm shrink-0 min-w-[7rem]">Shipping Cost</Label>
                      <Input
                        className="h-9 text-sm text-right flex-1 min-w-0"
                        type="number"
                        min={0}
                        step={1}
                        placeholder="0"
                        value={receiveShipping || ""}
                        onChange={(e) => setReceiveShipping(Number(e.target.value) || "")}
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <Label className="text-sm shrink-0 min-w-[7rem]">Miscellaneous</Label>
                      <Input
                        className="h-9 text-sm text-right flex-1 min-w-0"
                        type="number"
                        min={0}
                        step={1}
                        placeholder="0"
                        value={receiveMisc || ""}
                        onChange={(e) => setReceiveMisc(Number(e.target.value) || "")}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
            <Button variant="outline" onClick={() => setReceiveChallan(null)}>Cancel</Button>
            <Button className="bg-success hover:bg-success/90 text-white" onClick={handleReceive} disabled={saving}>
              <PackageCheck className="h-4 w-4 mr-1.5" />
              {saving ? "Receiving..." : "Confirm Received"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Confirmation */}
      <AlertDialog open={!!cancelId} onOpenChange={() => setCancelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this challan?</AlertDialogTitle>
            <AlertDialogDescription>If the challan was dispatched, stock will be reversed back to the source warehouse.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{saving ? "Cancelling..." : "Cancel Challan"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Transfers;

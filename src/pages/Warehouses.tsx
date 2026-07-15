import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useData } from "@/contexts/DataContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Building2, Search, RefreshCw, AlertTriangle, PackageX, Clock, XCircle,
  ShoppingCart, ClipboardList, Plus, Trash2, CalendarIcon, CheckCircle2,
  ChevronUp, X,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { warehouseService, type WarehouseRecord, type WarehouseStockRecord, type ExpirySummary } from "@/services/warehouse.service";
import { inventoryService, type IngredientRecord, type IngredientCategoryRecord, type UnitRecord } from "@/services/inventory.service";
import { supplierService, type SupplierRecord } from "@/services/supplier.service";
import { purchaseService } from "@/services/purchase.service";
import { purchaseRequestService, type PurchaseRequestRecord } from "@/services/purchase-request.service";
import { PageHeader } from "@/components/ui/page-header";

type StockStatus = "EMPTY" | "LOW" | "NORMAL";
type CardFilter = "all" | "low" | "out";

function getStatus(s: WarehouseStockRecord): StockStatus {
  if (Number(s.currentStock) <= 0) return "EMPTY";
  if (Number(s.currentStock) <= Number(s.lowStockLevel)) return "LOW";
  return "NORMAL";
}

const STATUS_STYLE: Record<StockStatus, string> = {
  EMPTY: "bg-destructive/10 text-destructive",
  LOW: "bg-yellow-100 text-yellow-800",
  NORMAL: "bg-success/10 text-success",
};
const STATUS_ORDER: Record<StockStatus, number> = { EMPTY: 0, LOW: 1, NORMAL: 2 };

interface FormItem {
  ingredientId: string;
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  approvedQty?: number;
  expiryDate?: string;
  wasteQty: number;
  wasteReason: string;
  source: "approved" | "manual";
}

interface PRItem {
  ingredientId: string;
  name: string;
  unit: string;
  requestedQty: number;
}

/** Inline date picker with auto-close on selection */
const DatePickerField = ({
  value,
  onChange,
  placeholder = "Pick expiry date",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) => {
  const [open, setOpen] = useState(false);
  const selected = value ? parseISO(value) : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("h-10 w-full justify-start text-left font-normal text-sm truncate", !selected && "text-muted-foreground")}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-60" />
          <span className="truncate">{selected ? format(selected, "dd MMM yyyy") : placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" side="bottom">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => { onChange(d ? format(d, "yyyy-MM-dd") : ""); setOpen(false); }}
          initialFocus
        />
        {selected && (
          <div className="p-2 border-t flex justify-end">
            <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground"
              onClick={() => { onChange(""); setOpen(false); }}>
              Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

const Warehouses = () => {
  const { user } = useAuth();
  const { settings } = useData();
  const queryClient = useQueryClient();
  const currency = settings.currency || "Rs.";
  const isSuperAdmin = user?.role === "Super Admin";

  // ── Main page state ──
  const [selectedId, setSelectedId] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [unitFilter, setUnitFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [cardFilter, setCardFilter] = useState<CardFilter>("all");
  const [expiryView, setExpiryView] = useState<"expired" | "near" | null>(null);

  // ── Add Purchase inline dialog state ──
  const [showAddPurchase, setShowAddPurchase] = useState(false);
  const [apSuppliers, setApSuppliers] = useState<SupplierRecord[]>([]);
  const [apIngredients, setApIngredients] = useState<IngredientRecord[]>([]);
  const [apUnits, setApUnits] = useState<UnitRecord[]>([]);
  const [apCategories, setApCategories] = useState<IngredientCategoryRecord[]>([]);
  const [apApprovedRequests, setApApprovedRequests] = useState<PurchaseRequestRecord[]>([]);
  const [apForm, setApForm] = useState({ invoiceNumber: "" });
  const [selectedApSuppliers, setSelectedApSuppliers] = useState<string[]>([]);
  const [apItems, setApItems] = useState<FormItem[]>([
    { ingredientId: "", name: "", qty: 0, unit: "", unitPrice: 0, wasteQty: 0, wasteReason: "", source: "manual" },
  ]);
  const [apSelectedRequestId, setApSelectedRequestId] = useState("");
  const [apWarehouseId, setApWarehouseId] = useState("");
  const [apTax, setApTax] = useState(0);
  const [apShipping, setApShipping] = useState(0);
  const [apMisc, setApMisc] = useState(0);
  const [apSaving, setApSaving] = useState(false);
  const [apQuickAddOpen, setApQuickAddOpen] = useState(false);
  const [apQuickAddTargetIdx, setApQuickAddTargetIdx] = useState<number | null>(null);
  const [apQuickAddForm, setApQuickAddForm] = useState({ name: "", categoryId: "", unitId: "" });
  const [apQuickAddLoading, setApQuickAddLoading] = useState(false);
  const apRefLoaded = useRef(false);

  // ── Create Purchase Request inline dialog state ──
  const [showCreatePR, setShowCreatePR] = useState(false);
  const [prIngredients, setPrIngredients] = useState<IngredientRecord[]>([]);
  const [prWarehouseId, setPrWarehouseId] = useState("");
  const [prItems, setPrItems] = useState<PRItem[]>([]);
  const [prNotes, setPrNotes] = useState("");
  const [prAddIngId, setPrAddIngId] = useState("");
  const [prSaving, setPrSaving] = useState(false);
  const prRefLoaded = useRef(false);

  // ── Multi-select state ──
  const [selectedStockIds, setSelectedStockIds] = useState<Set<string>>(new Set());
  const [prLowStockLoading, setPrLowStockLoading] = useState(false);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Load warehouses + categories + suppliers (primary list — cached, paints instantly on revisit)
  const { data: warehousesData, isLoading: loading } = useQuery({
    queryKey: ["warehouses-list", { isSuperAdmin }],
    queryFn: () =>
      Promise.all([
        warehouseService.getAll(),
        inventoryService.getIngredientCategories(),
        supplierService.getAll(),
      ])
        .then(([whList, catList, supList]) => ({
          warehouses: isSuperAdmin
            ? whList.filter(w => w.type !== "KITCHEN")
            : whList.filter(w => w.type === "BRANCH"),
          categories: catList,
          suppliers: supList.data,
        })),
  });
  const warehouses = useMemo(() => warehousesData?.warehouses ?? [], [warehousesData]);
  const selectedWarehouse = useMemo(() => warehouses.find(w => w.id === selectedId), [warehouses, selectedId]);
  const isMainWarehouseSelected = selectedWarehouse?.type === "MAIN" || selectedWarehouse?.outletId === null;

  // Manager → Purchase Request only; Admin/Super Admin → Add Purchase only (restricted to Main Warehouse for Super Admin)
  const canRequest  = user?.role === "Manager" && (!isSuperAdmin || isMainWarehouseSelected);
  const canPurchase = ["Super Admin", "Admin"].includes(user?.role ?? "") && (!isSuperAdmin || isMainWarehouseSelected);

  const categories: IngredientCategoryRecord[] = warehousesData?.categories ?? [];
  const suppliers: SupplierRecord[] = warehousesData?.suppliers ?? [];

  // Auto-select the first warehouse once the list is available
  useEffect(() => {
    if (!selectedId && warehouses.length > 0) setSelectedId(warehouses[0].id);
  }, [warehouses, selectedId]);

  // Per-warehouse stock + expiry (secondary — loads when a warehouse is selected)
  const { data: stockData, isLoading: stockLoading } = useQuery({
    queryKey: ["warehouse-stock", selectedId],
    queryFn: () =>
      Promise.all([
        warehouseService.getStock(selectedId),
        warehouseService.getExpirySummary(selectedId),
      ]).then(([data, exp]) => ({ stock: data, expiry: exp })),
    enabled: !!selectedId,
  });
  const stock = useMemo<WarehouseStockRecord[]>(() => stockData?.stock ?? [], [stockData]);
  const expiry: ExpirySummary = stockData?.expiry ?? { expiredCount: 0, nearExpiryCount: 0, expired: [], nearExpiry: [] };

  const handleRefresh = async () => {
    if (!selectedId) return;
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ["warehouse-stock", selectedId] });
    } catch (err: Error | unknown) {
      toast.error((err as Error).message || "Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  };

  const uniqueBrands = useMemo(() => [...new Set(stock.map(s => s.ingredient.brand).filter(Boolean))] as string[], [stock]);
  const uniqueUnits = useMemo(() => {
    const map = new Map<string, string>();
    stock.forEach(s => { if (s.ingredient.unit) map.set(s.ingredient.unit.id, s.ingredient.unit.name); });
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [stock]);

  const filteredStock = useMemo(() => {
    let items = stock;
    if (cardFilter === "low") items = items.filter(s => Number(s.currentStock) > 0 && Number(s.currentStock) <= Number(s.lowStockLevel));
    if (cardFilter === "out") items = items.filter(s => Number(s.currentStock) <= 0);
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      items = items.filter(s => s.ingredient.name.toLowerCase().includes(q) || (s.ingredient.brand ?? "").toLowerCase().includes(q));
    }
    if (categoryFilter) items = items.filter(s => s.ingredient.category?.id === categoryFilter);
    if (unitFilter) items = items.filter(s => s.ingredient.unit?.id === unitFilter);
    if (brandFilter) items = items.filter(s => s.ingredient.brand === brandFilter);
    if (vendorFilter) items = items.filter(s => s.ingredient.supplierId === vendorFilter);
    return [...items].sort((a, b) => {
      const diff = STATUS_ORDER[getStatus(a)] - STATUS_ORDER[getStatus(b)];
      if (diff !== 0) return diff;
      return a.ingredient.name.localeCompare(b.ingredient.name);
    });
  }, [stock, cardFilter, debouncedSearch, categoryFilter, unitFilter, brandFilter, vendorFilter]);

  const stats = useMemo(() => ({
    total: stock.length,
    low: stock.filter(s => Number(s.currentStock) > 0 && Number(s.currentStock) <= Number(s.lowStockLevel)).length,
    out: stock.filter(s => Number(s.currentStock) <= 0).length,
    totalValue: stock.reduce((sum, s) => sum + Number(s.currentStock) * Number(s.ingredient.purchasePrice ?? 0), 0),
  }), [stock]);

  const isLoading = loading || stockLoading;
  const toggleCard = (filter: CardFilter) => setCardFilter(prev => prev === filter ? "all" : filter);

  // ── Add Purchase handlers ──
  const resetApForm = useCallback((
    preWarehouseId?: string,
    preIngredientId?: string,
    ingList?: IngredientRecord[]
  ) => {
    setApForm({ invoiceNumber: "" });
    setSelectedApSuppliers([]);
    setApTax(0); setApShipping(0); setApMisc(0);
    setApSelectedRequestId("");
    setApWarehouseId(preWarehouseId ?? selectedId ?? "");
    const ings = ingList ?? apIngredients;
    if (preIngredientId) {
      const ing = ings.find(i => i.id === preIngredientId);
      setApItems(ing
        ? [{
            ingredientId: ing.id, name: ing.name,
            qty: Math.max(1, Number(ing.lowStockLevel) - Number(ing.currentStock)),
            unit: ing.unit?.name ?? "", unitPrice: Number(ing.purchasePrice) || 0,
            wasteQty: 0, wasteReason: "", source: "manual" as const,
          }]
        : [{ ingredientId: "", name: "", qty: 0, unit: "", unitPrice: 0, wasteQty: 0, wasteReason: "", source: "manual" as const }]
      );
    } else {
      setApItems([{ ingredientId: "", name: "", qty: 0, unit: "", unitPrice: 0, wasteQty: 0, wasteReason: "", source: "manual" as const }]);
    }
  }, [selectedId, apIngredients]);

  const loadAddPurchaseData = useCallback(async (preWarehouseId?: string, preIngredientId?: string) => {
    if (!apRefLoaded.current) {
      try {
        const [supRes, ingList, catList, unitList, prRes] = await Promise.all([
          supplierService.getAll(),
          inventoryService.getIngredients(),
          inventoryService.getIngredientCategories(),
          inventoryService.getUnits(),
          purchaseRequestService.getAll({ status: "APPROVED", limit: 100 }),
        ]);
        setApSuppliers(supRes.data);
        setApIngredients(ingList);
        setApCategories(catList);
        setApUnits(unitList);
        setApApprovedRequests(prRes.data);
        apRefLoaded.current = true;
        resetApForm(preWarehouseId, preIngredientId, ingList);
      } catch (err: unknown) {
        toast.error((err as Error).message || "Failed to load data");
      }
    } else {
      resetApForm(preWarehouseId, preIngredientId);
    }
  }, [resetApForm]);

  const apAddItemRow = () =>
    setApItems(p => [...p, { ingredientId: "", name: "", qty: 0, unit: "", unitPrice: 0, wasteQty: 0, wasteReason: "", source: "manual" as const }]);

  const apRemoveItemRow = (idx: number) =>
    setApItems(p => p.filter((_, i) => i !== idx));

  const apUpdateItemRow = (idx: number, field: string, value: string | number) => {
    setApItems(p => p.map((item, i) => {
      if (i !== idx) return item;
      if (field === "ingredientId") {
        const ing = apIngredients.find(ig => ig.id === value);
        return { ...item, ingredientId: value as string, name: ing?.name ?? "", unit: ing?.unit?.name ?? "", unitPrice: Number(ing?.purchasePrice) || 0 };
      }
      return { ...item, [field]: value };
    }));
  };

  const handleApSelectRequest = (requestId: string) => {
    setApSelectedRequestId(requestId);
    if (!requestId) return;
    const pr = apApprovedRequests.find(r => r.id === requestId);
    if (!pr) return;
    setApWarehouseId(pr.warehouseId);
    const approvedItems: FormItem[] = pr.items
      .filter(item => (item.approvedQty ?? 0) > 0)
      .map(item => ({
        ingredientId: item.ingredientId,
        name: item.ingredient.name,
        qty: item.approvedQty ?? item.requestedQty,
        unit: item.ingredient.unit?.name ?? "",
        unitPrice: Number(item.ingredient.purchasePrice) || 0,
        approvedQty: item.approvedQty ?? item.requestedQty,
        wasteQty: 0, wasteReason: "", source: "approved" as const,
      }));
    setApItems(prev => [
      ...approvedItems,
      ...prev.filter(i => i.source === "manual" && i.ingredientId !== ""),
    ]);
  };

  const handleApSave = async () => {
    if (!canPurchase) { toast.error("You are not authorized to perform actions on this warehouse"); return; }
    const validItems = apItems.filter(i => i.ingredientId && i.qty > 0);
    if (!validItems.length) { toast.error("Add at least one item with quantity"); return; }
    const invalidWaste = validItems.find(i => i.wasteQty > i.qty);
    if (invalidWaste) { toast.error(`Waste cannot exceed purchased qty for "${invalidWaste.name}"`); return; }
    const itemsSubtotal = validItems.reduce((s, i) => s + i.qty * i.unitPrice, 0);
    const grandTotal = itemsSubtotal + apTax + apShipping + apMisc;
    const itemSupplierIds = validItems
      .map(item => apIngredients.find(ig => ig.id === item.ingredientId)?.supplierId)
      .filter(Boolean);
    const uniqueApSuppliers = Array.from(new Set(itemSupplierIds));
    const finalSupplierId = selectedApSuppliers.length === 1
      ? selectedApSuppliers[0]
      : (uniqueApSuppliers.length === 1 ? uniqueApSuppliers[0] : undefined);

    setApSaving(true);
    try {
      await purchaseService.create({
        supplierId: finalSupplierId,
        invoiceNumber: apForm.invoiceNumber || undefined,
        date: new Date().toISOString().split("T")[0],
        items: validItems.map(i => ({
          ingredientId: i.ingredientId,
          name: i.name,
          qty: i.qty,
          unit: i.unit,
          unitPrice: i.unitPrice,
          total: i.qty * i.unitPrice,
          wasteQty: i.wasteQty || 0,
          wasteReason: i.wasteReason || "",
          source: i.source,
          ...(i.approvedQty !== undefined && { approvedQty: i.approvedQty }),
          ...(i.expiryDate && { expiryDate: i.expiryDate }),
        })),
        subtotal: itemsSubtotal,
        tax: apTax,
        shippingCost: apShipping,
        miscAmount: apMisc,
        total: grandTotal,
        paid: grandTotal,
        status: "paid",
        warehouseId: apWarehouseId || undefined,
        purchaseRequestId: apSelectedRequestId || undefined,
      });
      toast.success("Purchase added — stock updated");
      setShowAddPurchase(false);
      if (apSelectedRequestId) {
        setApApprovedRequests(prev => prev.filter(r => r.id !== apSelectedRequestId));
      }
      queryClient.invalidateQueries({ queryKey: ["warehouse-stock", selectedId] });
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to save purchase");
    } finally {
      setApSaving(false);
    }
  };

  const handleApQuickAddIngredient = async () => {
    if (!apQuickAddForm.name.trim()) return;
    setApQuickAddLoading(true);
    try {
      const newIng = await inventoryService.createIngredient({
        name: apQuickAddForm.name.trim(),
        categoryId: apQuickAddForm.categoryId || null,
        unitId: apQuickAddForm.unitId || null,
      });
      const updated = await inventoryService.getIngredients();
      setApIngredients(updated);
      if (apQuickAddTargetIdx !== null) {
        apUpdateItemRow(apQuickAddTargetIdx, "ingredientId", newIng.id);
      }
      setApQuickAddOpen(false);
      setApQuickAddForm({ name: "", categoryId: "", unitId: "" });
      toast.success(`"${newIng.name}" added`);
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to add ingredient");
    } finally {
      setApQuickAddLoading(false);
    }
  };

  // ── Create Purchase Request handlers ──
  const loadCreatePRData = useCallback(async (preWarehouseId?: string, preIngredientId?: string) => {
    let ings = prIngredients;
    if (!prRefLoaded.current) {
      try {
        ings = await inventoryService.getIngredients();
        setPrIngredients(ings);
        prRefLoaded.current = true;
      } catch (err: unknown) {
        toast.error((err as Error).message || "Failed to load ingredients");
      }
    }
    setPrWarehouseId(preWarehouseId ?? selectedId ?? "");
    setPrNotes("");
    setPrAddIngId("");
    if (preIngredientId) {
      const ing = ings.find(i => i.id === preIngredientId);
      setPrItems(ing
        ? [{
            ingredientId: ing.id, name: ing.name, unit: ing.unit?.name ?? "",
            requestedQty: Math.max(1, Number(ing.lowStockLevel) - Number(ing.currentStock)),
          }]
        : []
      );
    } else {
      setPrItems([]);
    }
  }, [selectedId, prIngredients]);

  const prAddIngredient = () => {
    if (!prAddIngId) return;
    if (prItems.some(i => i.ingredientId === prAddIngId)) { toast.error("Ingredient already added"); return; }
    const ing = prIngredients.find(i => i.id === prAddIngId);
    if (!ing) return;
    setPrItems(prev => [...prev, {
      ingredientId: ing.id, name: ing.name, unit: ing.unit?.name ?? "",
      requestedQty: Math.max(1, Number(ing.lowStockLevel) - Number(ing.currentStock)),
    }]);
    setPrAddIngId("");
  };

  const handlePrSave = async () => {
    if (!canRequest) { toast.error("You are not authorized to create requests for this warehouse"); return; }
    if (!prWarehouseId) { toast.error("Select a warehouse"); return; }
    const valid = prItems.filter(i => i.ingredientId && i.requestedQty > 0);
    if (!valid.length) { toast.error("Add at least one ingredient with quantity"); return; }
    setPrSaving(true);
    try {
      await purchaseRequestService.create({
        warehouseId: prWarehouseId,
        notes: prNotes || undefined,
        items: valid.map(i => ({ ingredientId: i.ingredientId, requestedQty: i.requestedQty })),
      });
      toast.success("Purchase request submitted");
      setShowCreatePR(false);
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to submit request");
    } finally {
      setPrSaving(false);
    }
  };

  // Which ingredients are currently in each form (for toggle visual + dedup)
  const apIngredientIds = useMemo(() => new Set(apItems.filter(i => i.ingredientId).map(i => i.ingredientId)), [apItems]);
  const prIngredientIds = useMemo(() => new Set(prItems.filter(i => i.ingredientId).map(i => i.ingredientId)), [prItems]);

  // Warehouse stock map for PR dialog (ingredientId → currentStock in selected warehouse)
  const warehouseStockMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of stock) map[s.ingredient.id] = Number(s.currentStock);
    return map;
  }, [stock]);

  // Handlers for multi-vendor selection in Add Purchase
  const handleAddApSupplier = useCallback((supplierId: string) => {
    if (!supplierId || supplierId === "none" || selectedApSuppliers.includes(supplierId)) return;
    setSelectedApSuppliers(prev => [...prev, supplierId]);
    supplierService.getIngredients(supplierId).then(res => {
      const newItems = res.data.map(ing => {
        const currentStock = warehouseStockMap[ing.id] ?? 0;
        const lowLevel = Number(ing.lowStockLevel) || 0;
        return {
          ingredientId: ing.id,
          name: ing.name,
          qty: Math.max(1, Math.round(lowLevel - currentStock)),
          unit: ing.unit?.symbol || ing.unit?.name || "",
          unitPrice: Number(ing.purchasePrice) || 0,
          wasteQty: 0,
          wasteReason: "",
          source: "manual" as const,
        };
      });
      setApItems(prev => {
        const filteredPrev = prev.filter(p => p.ingredientId !== "");
        const toAppend = newItems.filter(n => !filteredPrev.some(p => p.ingredientId === n.ingredientId));
        return [...filteredPrev, ...toAppend];
      });
    }).catch(err => {
      toast.error(err.message || "Failed to load supplier ingredients");
    });
  }, [selectedApSuppliers, warehouseStockMap]);

  const handleRemoveApSupplier = useCallback((supplierId: string) => {
    setSelectedApSuppliers(prev => prev.filter(id => id !== supplierId));
    setApItems(prev => prev.filter(item => {
      const ing = apIngredients.find(ig => ig.id === item.ingredientId);
      return ing?.supplierId !== supplierId;
    }));
  }, [apIngredients]);

  // ── Toggle per-row ingredient in/out of form ──
  const handleToggleRequest = useCallback((s: WarehouseStockRecord) => {
    if (!showCreatePR) {
      loadCreatePRData(selectedId, s.ingredient.id);
      setShowCreatePR(true);
      return;
    }
    if (prIngredientIds.has(s.ingredient.id)) {
      setPrItems(prev => prev.filter(i => i.ingredientId !== s.ingredient.id));
    } else {
      setPrItems(prev => [...prev, {
        ingredientId: s.ingredient.id,
        name: s.ingredient.name,
        unit: s.ingredient.unit?.name ?? "",
        requestedQty: Math.max(1, Number(s.lowStockLevel) - Number(s.currentStock)),
      }]);
    }
  }, [showCreatePR, selectedId, prIngredientIds, loadCreatePRData]);

  const handleTogglePurchase = useCallback((s: WarehouseStockRecord) => {
    if (!showAddPurchase) {
      loadAddPurchaseData(selectedId, s.ingredient.id);
      setShowAddPurchase(true);
      return;
    }
    if (apIngredientIds.has(s.ingredient.id)) {
      setApItems(prev => prev.filter(i => i.ingredientId !== s.ingredient.id));
    } else {
      setApItems(prev => [...prev, {
        ingredientId: s.ingredient.id,
        name: s.ingredient.name,
        qty: Math.max(1, Number(s.lowStockLevel) - Number(s.currentStock)),
        unit: s.ingredient.unit?.name ?? "",
        unitPrice: Number(s.ingredient.purchasePrice) || 0,
        wasteQty: 0, wasteReason: "", source: "manual" as const,
      }]);
    }
  }, [showAddPurchase, selectedId, apIngredientIds, loadAddPurchaseData]);

  const handleBatchRequest = useCallback(async () => {
    if (selectedStockIds.size === 0) return;
    const itemsToAdd: PRItem[] = [];
    selectedStockIds.forEach(stockId => {
      const s = stock.find(st => st.id === stockId);
      if (!s || prIngredientIds.has(s.ingredient.id)) return;
      itemsToAdd.push({
        ingredientId: s.ingredient.id,
        name: s.ingredient.name,
        unit: s.ingredient.unit?.name ?? "",
        requestedQty: Math.max(1, Number(s.lowStockLevel) - Number(s.currentStock)),
      });
    });
    if (!showCreatePR) {
      await loadCreatePRData(selectedId);
      setShowCreatePR(true);
    }
    setPrItems(prev => [...prev.filter(i => i.ingredientId), ...itemsToAdd]);
    setSelectedStockIds(new Set());
  }, [selectedStockIds, stock, prIngredientIds, showCreatePR, selectedId, loadCreatePRData]);

  const handleBatchPurchase = useCallback(async () => {
    if (selectedStockIds.size === 0) return;
    const itemsToAdd: FormItem[] = [];
    selectedStockIds.forEach(stockId => {
      const s = stock.find(st => st.id === stockId);
      if (!s || apIngredientIds.has(s.ingredient.id)) return;
      itemsToAdd.push({
        ingredientId: s.ingredient.id,
        name: s.ingredient.name,
        qty: Math.max(1, Number(s.lowStockLevel) - Number(s.currentStock)),
        unit: s.ingredient.unit?.name ?? "",
        unitPrice: Number(s.ingredient.purchasePrice) || 0,
        wasteQty: 0, wasteReason: "", source: "manual" as const,
      });
    });
    if (!showAddPurchase) {
      await loadAddPurchaseData(selectedId);
      setShowAddPurchase(true);
    }
    setApItems(prev => [...prev.filter(i => i.ingredientId), ...itemsToAdd]);
    setSelectedStockIds(new Set());
  }, [selectedStockIds, stock, apIngredientIds, showAddPurchase, selectedId, loadAddPurchaseData]);

  // Add low stock items to PR form (mirrors PurchaseRequests.tsx)
  const prAddLowStockItems = useCallback(async () => {
    if (!prWarehouseId) { toast.error("Select a warehouse first"); return; }
    setPrLowStockLoading(true);
    try {
      const stockData = await warehouseService.getStock(prWarehouseId, { lowStockOnly: true });
      let added = 0;
      const newItems = [...prItems];
      for (const s of stockData) {
        if (newItems.some(i => i.ingredientId === s.ingredient.id)) continue;
        newItems.push({
          ingredientId: s.ingredient.id,
          name: s.ingredient.name,
          unit: s.ingredient.unit?.symbol || s.ingredient.unit?.name || "",
          requestedQty: Math.max(1, Math.round(Number(s.lowStockLevel) - Number(s.currentStock))),
        });
        added++;
      }
      setPrItems(newItems);
      toast.success(`${added} low stock item${added !== 1 ? "s" : ""} added`);
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to load low stock");
    } finally {
      setPrLowStockLoading(false);
    }
  }, [prWarehouseId, prItems]);

  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-full rounded-lg" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      <Skeleton className="h-10 w-full rounded-lg" />
      {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg mt-2" />)}
    </div>
  );

  // Computed AP billing totals (plain derived values — not hooks, fine after early return)
  const apSubtotal = apItems.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const apGrandTotal = apSubtotal + apTax + apShipping + apMisc;
  const apApprovedCount = apItems.filter(i => i.source === "approved").length;
  const apManualCount = apItems.filter(i => i.source === "manual").length;

  // Multi-select helpers (plain functions — not hooks)
  const toggleStockSelection = (stockId: string) =>
    setSelectedStockIds(prev => { const next = new Set(prev); next.has(stockId) ? next.delete(stockId) : next.add(stockId); return next; });
  const allVisibleSelected = filteredStock.length > 0 && filteredStock.every(s => selectedStockIds.has(s.id));
  const toggleAllSelection = () =>
    setSelectedStockIds(allVisibleSelected ? new Set() : new Set(filteredStock.map(s => s.id)));

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Building2 className="h-5 w-5" />}
        title="Branch Stock"
        subtitle="Warehouse stock levels"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {warehouses.length > 1 && (
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger className="w-56"><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                <SelectContent>
                  {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name} ({w.type})</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />Refresh
            </Button>
            {canRequest && (
              <Button
                variant={showCreatePR ? "destructive" : "outline"}
                size="sm"
                onClick={() => {
                  if (showCreatePR) { setShowCreatePR(false); }
                  else { loadCreatePRData(selectedId); setShowCreatePR(true); }
                }}
              >
                {showCreatePR ? <><X className="h-4 w-4 mr-1.5" />Close Form</> : <><ClipboardList className="h-4 w-4 mr-1.5" />Purchase Request</>}
              </Button>
            )}
            {canPurchase && (
              <Button
                size="sm"
                className={showAddPurchase ? "" : "gradient-primary text-primary-foreground"}
                variant={showAddPurchase ? "destructive" : "default"}
                onClick={() => {
                  if (showAddPurchase) { setShowAddPurchase(false); }
                  else { loadAddPurchaseData(selectedId); setShowAddPurchase(true); }
                }}
              >
                {showAddPurchase ? <><X className="h-4 w-4 mr-1.5" />Close Form</> : <><ShoppingCart className="h-4 w-4 mr-1.5" />Add Purchase</>}
              </Button>
            )}
          </div>
        }
      />

      {warehouses.length === 0 ? (
        <Card className="shadow-sm"><CardContent className="py-12 text-center">
          <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" />
          <p className="text-muted-foreground">No branch warehouses found.</p>
        </CardContent></Card>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className={`shadow-sm cursor-pointer transition-all ${cardFilter === "low" ? "ring-2 ring-yellow-500" : "hover:ring-1 hover:ring-yellow-300"}`} onClick={() => toggleCard("low")}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-yellow-500" /><div className="text-3xl font-bold text-yellow-600">{isLoading ? "—" : stats.low}</div></div>
                <p className="text-sm text-muted-foreground mt-1">Low Stock</p>
              </CardContent>
            </Card>
            <Card className={`shadow-sm cursor-pointer transition-all ${cardFilter === "out" ? "ring-2 ring-destructive" : "hover:ring-1 hover:ring-destructive/30"}`} onClick={() => toggleCard("out")}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2"><PackageX className="h-5 w-5 text-destructive" /><div className="text-3xl font-bold text-destructive">{isLoading ? "—" : stats.out}</div></div>
                <p className="text-sm text-muted-foreground mt-1">Out of Stock</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm border-destructive/30 cursor-pointer hover:ring-1 hover:ring-destructive/50 transition-all" onClick={() => expiry.expiredCount > 0 && setExpiryView("expired")}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2"><XCircle className="h-5 w-5 text-destructive" /><div className="text-3xl font-bold text-destructive">{isLoading ? "—" : expiry.expiredCount}</div></div>
                <p className="text-sm text-muted-foreground mt-1">Expired Items</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm border-orange-500/30 cursor-pointer hover:ring-1 hover:ring-orange-500/50 transition-all" onClick={() => expiry.nearExpiryCount > 0 && setExpiryView("near")}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2"><Clock className="h-5 w-5 text-orange-500" /><div className="text-3xl font-bold text-orange-500">{isLoading ? "—" : expiry.nearExpiryCount}</div></div>
                <p className="text-sm text-muted-foreground mt-1">Near Expiry (7d)</p>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card className="shadow-sm"><CardHeader className="pb-3">
            <div className="flex gap-3 items-end flex-wrap">
              <div className="flex-1 min-w-[180px]"><Label className="text-xs text-muted-foreground">Search</Label><div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or brand..." className="pl-9" /></div></div>
              <div className="w-40"><Label className="text-xs text-muted-foreground">Category</Label><Select value={categoryFilter || "__all__"} onValueChange={v => setCategoryFilter(v === "__all__" ? "" : v)}><SelectTrigger><SelectValue placeholder="All" /></SelectTrigger><SelectContent><SelectItem value="__all__">All Categories</SelectItem>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="w-44"><Label className="text-xs text-muted-foreground">Vendor</Label><Select value={vendorFilter || "__all__"} onValueChange={v => setVendorFilter(v === "__all__" ? "" : v)}><SelectTrigger><SelectValue placeholder="All" /></SelectTrigger><SelectContent><SelectItem value="__all__">All Vendors</SelectItem>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="w-36"><Label className="text-xs text-muted-foreground">Unit</Label><Select value={unitFilter || "__all__"} onValueChange={v => setUnitFilter(v === "__all__" ? "" : v)}><SelectTrigger><SelectValue placeholder="All" /></SelectTrigger><SelectContent><SelectItem value="__all__">All Units</SelectItem>{uniqueUnits.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></div>
              {uniqueBrands.length > 0 && (
                <div className="w-40"><Label className="text-xs text-muted-foreground">Brand</Label><Select value={brandFilter || "__all__"} onValueChange={v => setBrandFilter(v === "__all__" ? "" : v)}><SelectTrigger><SelectValue placeholder="All" /></SelectTrigger><SelectContent><SelectItem value="__all__">All Brands</SelectItem>{uniqueBrands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent></Select></div>
              )}
            </div>
          </CardHeader></Card>

          {/* ── Add Purchase Inline Panel ── */}
          {showAddPurchase && (
            <Card className="shadow-sm border-primary/30 bg-primary/[0.02]">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5 text-primary" />
                  <h3 className="text-base font-semibold">Add Purchase</h3>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowAddPurchase(false)}>
                  <ChevronUp className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-5">

                {/* Approved Request */}
                <Card className="shadow-sm">
                  <CardHeader className="pb-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Link to Approved Request (Optional)</Label>
                  </CardHeader>
                  <CardContent>
                    <Select
                      value={apSelectedRequestId || "__none__"}
                      onValueChange={(v) => handleApSelectRequest(v === "__none__" ? "" : v)}
                    >
                      <SelectTrigger><SelectValue placeholder="Select an approved request" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— No Request —</SelectItem>
                        {apApprovedRequests.map(pr => {
                          const activeItems = pr.items.filter(i => (i.approvedQty ?? 0) > 0).length;
                          return (
                            <SelectItem key={pr.id} value={pr.id}>
                              {pr.requestNo} — {pr.warehouse.name} ({activeItems} items) — by {pr.requestedBy.name}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    {apSelectedRequestId && (
                      <p className="text-xs text-muted-foreground mt-1.5">Approved items loaded below. You can still add manual items.</p>
                    )}
                  </CardContent>
                </Card>

                {/* Purchase Details */}
                <Card className="shadow-sm">
                  <CardHeader className="pb-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Purchase Details</Label>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <Label>Add Supplier (optional)</Label>
                        <Select value="" onValueChange={handleAddApSupplier}>
                          <SelectTrigger className="h-11"><SelectValue placeholder="Add supplier to load ingredients..." /></SelectTrigger>
                          <SelectContent>
                            {apSuppliers
                              .filter(s => !selectedApSuppliers.includes(s.id))
                              .map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {selectedApSuppliers.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2 p-2.5 bg-muted/40 rounded-lg border">
                            <span className="text-xs text-muted-foreground self-center mr-1">Active:</span>
                            {selectedApSuppliers.map(id => {
                              const s = apSuppliers.find(sup => sup.id === id);
                              if (!s) return null;
                              return (
                                <Badge key={id} variant="secondary" className="flex items-center gap-1 py-0.5 pr-1 pl-2">
                                  <span className="text-xs font-semibold">{s.name}</span>
                                  <Button
                                    type="button" variant="ghost" size="icon"
                                    className="h-4 w-4 rounded-full p-0 text-muted-foreground hover:text-foreground"
                                    onClick={() => handleRemoveApSupplier(id)}
                                  >
                                    <X className="h-2.5 w-2.5" />
                                  </Button>
                                </Badge>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label>Invoice Number</Label>
                        <Input className="h-11" placeholder="e.g. INV-001" value={apForm.invoiceNumber} onChange={e => setApForm(p => ({ ...p, invoiceNumber: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Warehouse</Label>
                        <Select
                          value={apWarehouseId || "__none__"}
                          onValueChange={(v) => setApWarehouseId(v === "__none__" ? "" : v)}
                          disabled={!!apSelectedRequestId}
                        >
                          <SelectTrigger className="h-11"><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">No warehouse</SelectItem>
                            {warehouses.filter(w => isSuperAdmin ? true : w.type === "BRANCH").map(w => (
                              <SelectItem key={w.id} value={w.id}>{w.name} ({w.type})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Items */}
                <Card className="shadow-sm">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                      Items ({apItems.filter(i => i.ingredientId).length})
                    </Label>
                    <Button variant="outline" size="sm" onClick={apAddItemRow} className="h-8 min-h-[32px]">
                      <Plus className="h-3 w-3 mr-1" />Add Item
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {apItems.filter(i => i.ingredientId || i.source === "manual").length === 0 && (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        Select an approved request above or add items manually
                      </div>
                    )}

                    {/* Approved Items */}
                    {apApprovedCount > 0 && (
                      <div className="space-y-2">
                        {apSelectedRequestId && (
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs font-medium border-primary/40 text-primary">From Request</Badge>
                            <span className="text-xs text-muted-foreground">{apApprovedRequests.find(r => r.id === apSelectedRequestId)?.requestNo}</span>
                          </div>
                        )}
                        <div className="space-y-2">
                          {apItems.map((item, originalIdx) => {
                            if (item.source !== "approved") return null;
                            const receivedQty = item.qty - (item.wasteQty ?? 0);
                            return (
                              <div key={originalIdx} className="border rounded-lg p-3 space-y-2 border-l-2 border-l-primary/40 bg-primary/5">
                                <div className="flex items-center justify-between gap-2 flex-wrap min-w-0">
                                  <span className="font-medium text-sm truncate min-w-0">{item.name}</span>
                                  <Badge variant="secondary" className="text-xs shrink-0">Approved: {item.approvedQty ?? item.qty} {item.unit}</Badge>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                  <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Purchased Qty ({item.unit})</Label>
                                    <Input className="h-10 text-sm" type="number" min={0} value={item.qty || ""} onChange={e => apUpdateItemRow(originalIdx, "qty", Number(e.target.value))} />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Waste Qty</Label>
                                    <Input className="h-10 text-sm" type="number" min={0} max={item.qty} value={item.wasteQty || ""} onChange={e => apUpdateItemRow(originalIdx, "wasteQty", Number(e.target.value))} />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Unit Price</Label>
                                    <Input className="h-10 text-sm" type="number" min={0} value={item.unitPrice || ""} onChange={e => apUpdateItemRow(originalIdx, "unitPrice", Number(e.target.value))} />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Expiry Date</Label>
                                    <DatePickerField value={item.expiryDate || ""} onChange={v => apUpdateItemRow(originalIdx, "expiryDate", v)} />
                                  </div>
                                </div>
                                {item.wasteQty > 0 && (
                                  <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Waste Reason</Label>
                                    <Input className="h-10 text-sm" placeholder="e.g. Broken during transport" value={item.wasteReason} onChange={e => apUpdateItemRow(originalIdx, "wasteReason", e.target.value)} />
                                  </div>
                                )}
                                <div className="flex items-center justify-between pt-1 text-sm">
                                  <span className="text-muted-foreground">Line Total:</span>
                                  <div className="text-right">
                                    <div className="font-medium">{currency} {(item.qty * item.unitPrice).toLocaleString()}</div>
                                    {item.wasteQty > 0 && (
                                      <Badge variant="secondary" className="text-xs bg-success/10 text-success mt-0.5">Received: {receivedQty} {item.unit}</Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Separator between approved and manual */}
                    {apApprovedCount > 0 && apManualCount > 0 && (
                      <div className="flex items-center gap-2 py-1">
                        <Separator className="flex-1" />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">Additional Items</span>
                        <Separator className="flex-1" />
                      </div>
                    )}

                    {/* Manual Items */}
                    <div className="space-y-2">
                      {apItems.map((item, originalIdx) => {
                        if (item.source !== "manual") return null;
                        const receivedQty = item.qty - (item.wasteQty ?? 0);
                        return (
                          <div key={originalIdx} className="border rounded-lg p-3 space-y-2">
                            <div className="flex gap-2">
                              <Select value={item.ingredientId} onValueChange={v => apUpdateItemRow(originalIdx, "ingredientId", v)}>
                                <SelectTrigger className="h-11 text-sm flex-1"><SelectValue placeholder="Select Ingredient" /></SelectTrigger>
                                <SelectContent>
                                  {apIngredients.map(ig => <SelectItem key={ig.id} value={ig.id}>{ig.name} (Branch: {warehouseStockMap[ig.id] ?? 0} {ig.unit?.name ?? ""})</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <Button
                                type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" title="Add new ingredient"
                                onClick={() => { setApQuickAddTargetIdx(originalIdx); setApQuickAddForm({ name: "", categoryId: "", unitId: "" }); setApQuickAddOpen(true); }}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-destructive" onClick={() => apRemoveItemRow(originalIdx)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Qty {item.unit ? `(${item.unit})` : ""}</Label>
                                <Input className="h-11 text-sm" type="number" min={0} placeholder="Qty" value={item.qty || ""} onChange={e => apUpdateItemRow(originalIdx, "qty", Number(e.target.value))} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Waste Qty</Label>
                                <Input className="h-11 text-sm" type="number" min={0} max={item.qty} placeholder="Waste" value={item.wasteQty || ""} onChange={e => apUpdateItemRow(originalIdx, "wasteQty", Number(e.target.value))} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Unit Price</Label>
                                <Input className="h-11 text-sm" type="number" min={0} placeholder="Price" value={item.unitPrice || ""} onChange={e => apUpdateItemRow(originalIdx, "unitPrice", Number(e.target.value))} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Expiry Date</Label>
                                <DatePickerField value={item.expiryDate || ""} onChange={v => apUpdateItemRow(originalIdx, "expiryDate", v)} />
                              </div>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
                              <div className="flex-1 w-full">
                                {item.wasteQty > 0 && (
                                  <Input className="h-9 text-xs" placeholder="Waste reason (e.g. Broken during transport)" value={item.wasteReason} onChange={e => apUpdateItemRow(originalIdx, "wasteReason", e.target.value)} />
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-sm font-medium whitespace-nowrap">{currency} {(item.qty * item.unitPrice).toLocaleString()}</div>
                                {item.wasteQty > 0 && (
                                  <Badge variant="secondary" className="text-xs bg-success/10 text-success mt-0.5">Received: {receivedQty}</Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Billing Summary */}
                <Card className="shadow-sm">
                  <CardHeader className="pb-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Billing Summary</Label>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 w-full max-w-sm ml-auto">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Subtotal (items)</span>
                        <span className="font-medium tabular-nums">{currency} {apSubtotal.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Label className="text-sm shrink-0 min-w-[7rem]">Shipping Cost</Label>
                        <Input className="h-9 text-sm text-right flex-1 min-w-0" type="number" min={0} step={1} placeholder="0" value={apShipping || ""} onChange={e => setApShipping(Number(e.target.value))} />
                      </div>
                      <div className="flex items-center gap-3">
                        <Label className="text-sm shrink-0 min-w-[7rem]">Tax Amount</Label>
                        <Input className="h-9 text-sm text-right flex-1 min-w-0" type="number" min={0} step={1} placeholder="0" value={apTax || ""} onChange={e => setApTax(Number(e.target.value))} />
                      </div>
                      <div className="flex items-center gap-3">
                        <Label className="text-sm shrink-0 min-w-[7rem]">Miscellaneous</Label>
                        <Input className="h-9 text-sm text-right flex-1 min-w-0" type="number" min={0} step={1} placeholder="0" value={apMisc || ""} onChange={e => setApMisc(Number(e.target.value))} />
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between font-semibold text-base">
                        <span>Grand Total</span>
                        <span className="text-lg tabular-nums">{currency} {apGrandTotal.toLocaleString()}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" onClick={() => setShowAddPurchase(false)}>Cancel</Button>
                  <Button className="gradient-primary text-primary-foreground" onClick={handleApSave} disabled={apSaving}>
                    {apSaving ? "Saving..." : "Save Purchase"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Create Purchase Request Inline Panel ── */}
          {showCreatePR && (
            <Card className="shadow-sm border-primary/30 bg-primary/[0.02]">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-primary" />
                  <h3 className="text-base font-semibold">New Purchase Request</h3>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowCreatePR(false)}>
                  <ChevronUp className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">

                {/* Warehouse */}
                <div className="space-y-1.5">
                  <Label>Target Warehouse (Branch Store) *</Label>
                  {warehouses.filter(w => w.type === "BRANCH").length <= 1 ? (
                    <Input value={warehouses.filter(w => w.type === "BRANCH")[0]?.name ?? "No branch warehouses"} disabled />
                  ) : (
                    <Select value={prWarehouseId} onValueChange={setPrWarehouseId}>
                      <SelectTrigger><SelectValue placeholder="Select branch warehouse" /></SelectTrigger>
                      <SelectContent>
                        {warehouses.filter(w => w.type === "BRANCH").map(w => (
                          <SelectItem key={w.id} value={w.id}>{w.name}{w.outlet ? ` — ${w.outlet.name}` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Add Ingredient + Low Stock */}
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground">Add Ingredient</Label>
                    <Select value={prAddIngId} onValueChange={setPrAddIngId}>
                      <SelectTrigger><SelectValue placeholder="Select ingredient" /></SelectTrigger>
                      <SelectContent>
                        {prIngredients
                          .filter(ig => !prItems.some(i => i.ingredientId === ig.id))
                          .map(ig => (
                            <SelectItem key={ig.id} value={ig.id}>
                              {ig.name} (Stock: {warehouseStockMap[ig.id] ?? 0} {ig.unit?.name ?? ""}){Number(ig.currentStock) <= Number(ig.lowStockLevel) ? " ⚠" : ""}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button variant="outline" onClick={prAddIngredient} disabled={!prAddIngId}>
                    <Plus className="h-4 w-4 mr-1" />Add
                  </Button>
                  <Button variant="outline" onClick={prAddLowStockItems} disabled={!prWarehouseId || prLowStockLoading}>
                    <AlertTriangle className="h-4 w-4 mr-1" />{prLowStockLoading ? "Loading..." : "Add Low Stock"}
                  </Button>
                </div>

                {/* Items Table */}
                {prItems.length > 0 ? (
                  <div className="rounded-lg border overflow-auto">
                    <Table>
                      <TableHeader><TableRow className="bg-muted/50">
                        <TableHead>Ingredient</TableHead><TableHead>Unit</TableHead><TableHead>Current Stock</TableHead><TableHead>Requested Qty</TableHead><TableHead></TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {prItems.map((item, idx) => (
                          <TableRow key={item.ingredientId}>
                            <TableCell className="font-medium">{item.name}</TableCell>
                            <TableCell className="text-sm">{item.unit || "—"}</TableCell>
                            <TableCell className="text-sm">{warehouseStockMap[item.ingredientId] ?? 0}</TableCell>
                            <TableCell>
                              <Input type="number" className="w-24 h-8" min={1}
                                value={item.requestedQty || ""}
                                onChange={e => setPrItems(prev => prev.map((it, i) => i === idx ? { ...it, requestedQty: Number(e.target.value) } : it))}
                              />
                            </TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                                onClick={() => setPrItems(prev => prev.filter((_, i) => i !== idx))}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-6 text-sm text-muted-foreground border rounded-lg">
                    Select an ingredient above or click "Add Low Stock" to populate the request
                  </div>
                )}

                {/* Notes */}
                <div className="space-y-1.5">
                  <Label>Notes (optional)</Label>
                  <Textarea
                    placeholder="Any special instructions or reason for request..."
                    value={prNotes}
                    onChange={e => setPrNotes(e.target.value)}
                    rows={2}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" onClick={() => setShowCreatePR(false)}>Cancel</Button>
                  <Button className="gradient-primary text-primary-foreground" onClick={handlePrSave} disabled={prSaving}>
                    {prSaving ? "Submitting..." : "Submit Request"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stock Table */}
          <Card className="shadow-sm"><CardContent>
            {stockLoading ? (
              <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full rounded" />)}</div>
            ) : filteredStock.length === 0 ? (
              <div className="text-center py-10">
                <Building2 className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-30" />
                <p className="text-sm text-muted-foreground">{stock.length === 0 ? "No stock records yet." : "No items match your filters."}</p>
                {stock.length === 0 && <p className="text-xs text-muted-foreground mt-1">Stock will appear here when purchases or transfers are assigned to this warehouse.</p>}
              </div>
            ) : (
              <>
              {/* Batch action bar */}
              {selectedStockIds.size > 0 && (canRequest || canPurchase) && (
                <div className="flex items-center gap-2 mb-3 p-2.5 rounded-lg border bg-muted/40">
                  <span className="text-sm font-medium">{selectedStockIds.size} selected</span>
                  <div className="flex-1" />
                  {canRequest && (
                    <Button size="sm" variant="outline" onClick={handleBatchRequest}>
                      <ClipboardList className="h-3.5 w-3.5 mr-1.5" />Add to Request
                    </Button>
                  )}
                  {canPurchase && (
                    <Button size="sm" className="gradient-primary text-primary-foreground" onClick={handleBatchPurchase}>
                      <ShoppingCart className="h-3.5 w-3.5 mr-1.5" />Add to Purchase
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setSelectedStockIds(new Set())} className="text-muted-foreground">Clear</Button>
                </div>
              )}

              <div className="rounded-lg border overflow-auto max-h-[calc(100vh-420px)]">
                <Table>
                  <TableHeader className="sticky top-0 z-20 bg-card">
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      {(canRequest || canPurchase) && (
                        <TableHead className="w-10">
                          <Checkbox checked={allVisibleSelected && filteredStock.length > 0} onCheckedChange={toggleAllSelection} />
                        </TableHead>
                      )}
                      <TableHead className="w-12">SN</TableHead><TableHead>Ingredient</TableHead><TableHead>Vendor</TableHead><TableHead>Brand</TableHead><TableHead>Category</TableHead><TableHead>Unit</TableHead>
                      <TableHead className="text-right">Current Stock</TableHead><TableHead className="text-right">Low Stock Level</TableHead>
                      <TableHead>Status</TableHead><TableHead className="text-right">Purchase Price</TableHead>
                      {(canRequest || canPurchase) && <TableHead className="text-center w-28">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStock.map((s, i) => {
                      const status = getStatus(s);
                      const inPR = showCreatePR && prIngredientIds.has(s.ingredient.id);
                      const inAP = showAddPurchase && apIngredientIds.has(s.ingredient.id);
                      return (
                        <TableRow key={s.id} className={cn("hover:bg-muted/30 transition-colors", (inPR || inAP) && "bg-primary/5")}>
                          {(canRequest || canPurchase) && (
                            <TableCell>
                              <Checkbox checked={selectedStockIds.has(s.id)} onCheckedChange={() => toggleStockSelection(s.id)} />
                            </TableCell>
                          )}
                          <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="font-medium">{s.ingredient.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{s.ingredient.supplier?.name || "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{s.ingredient.brand ?? "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{s.ingredient.category?.name ?? "—"}</TableCell>
                          <TableCell className="text-sm">{s.ingredient.unit?.symbol || s.ingredient.unit?.name || "—"}</TableCell>
                          <TableCell className={`text-right font-medium ${Number(s.currentStock) <= 0 ? "text-destructive" : status === "LOW" ? "text-yellow-600" : ""}`}>
                            {Number(s.currentStock).toFixed(3)}
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">{Number(s.lowStockLevel).toFixed(3)}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={STATUS_STYLE[status]}>
                              {status === "EMPTY" ? "Empty" : status === "LOW" ? "Low" : "Normal"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {s.ingredient.purchasePrice != null ? `${currency} ${Number(s.ingredient.purchasePrice).toLocaleString()}` : "—"}
                          </TableCell>
                          {(canRequest || canPurchase) && (
                            <TableCell>
                              <div className="flex items-center justify-center gap-1">
                                {canRequest && (
                                  <Button
                                    variant={inPR ? "default" : status !== "NORMAL" ? "default" : "outline"}
                                    size="sm"
                                    className={`h-7 text-xs px-2 ${
                                      inPR ? "bg-primary text-primary-foreground hover:bg-primary/90" :
                                      status === "EMPTY" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" :
                                      status === "LOW"   ? "bg-yellow-500 text-white hover:bg-yellow-600" : ""
                                    }`}
                                    title={inPR ? "Remove from request" : "Add to purchase request"}
                                    onClick={() => handleToggleRequest(s)}
                                  >
                                    {inPR ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <ClipboardList className="h-3 w-3 mr-1" />}
                                    {inPR ? "Added" : "Request"}
                                  </Button>
                                )}
                                {canPurchase && (
                                  <Button
                                    variant={inAP ? "default" : "outline"}
                                    size="sm"
                                    className={`h-7 text-xs px-2 ${
                                      inAP ? "bg-primary text-primary-foreground hover:bg-primary/90" :
                                      status !== "NORMAL" ? "border-orange-400 text-orange-600 hover:bg-orange-50" : ""
                                    }`}
                                    title={inAP ? "Remove from purchase" : "Add to purchase"}
                                    onClick={() => handleTogglePurchase(s)}
                                  >
                                    {inAP ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <ShoppingCart className="h-3 w-3 mr-1" />}
                                    {inAP ? "Added" : "Buy"}
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              </>
            )}
          </CardContent></Card>
        </>
      )}

      {/* ── Expiry Detail Dialog ── */}
      <Dialog open={!!expiryView} onOpenChange={() => setExpiryView(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {expiryView === "expired"
                ? <><XCircle className="h-5 w-5 text-destructive" /> Expired Items</>
                : <><Clock className="h-5 w-5 text-orange-500" /> Near Expiry Items (within 7 days)</>}
            </DialogTitle>
          </DialogHeader>
          {(() => {
            const groups = expiryView === "expired" ? expiry.expired : expiry.nearExpiry;
            if (groups.length === 0) return <p className="text-center py-8 text-muted-foreground">No items</p>;
            const isExpiredView = expiryView === "expired";
            return (
              <div className="space-y-4">
                {groups.map((g, gi) => (
                  <Card key={g.ingredientId} className={`shadow-sm ${isExpiredView ? "border-destructive/30" : "border-orange-500/30"}`}>
                    <CardContent className="pt-5 pb-4">
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div>
                          <div className="text-lg font-bold">{gi + 1}. {g.ingredientName}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{g.brand ? `${g.brand} · ` : ""}{g.unit || "—"}</div>
                        </div>
                        <Badge variant="secondary" className={`text-sm px-3 py-1 ${isExpiredView ? "bg-destructive/10 text-destructive" : "bg-orange-100 text-orange-800"}`}>
                          {g.affectedQty} {g.unit} {isExpiredView ? "expired" : "expiring soon"}
                        </Badge>
                      </div>
                      <div className="rounded-lg bg-muted/30 p-3 mb-4">
                        <div className="flex items-center gap-6 text-sm flex-wrap">
                          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-muted-foreground/40" /><span className="text-muted-foreground">Total in Stock:</span><span className="font-bold">{g.totalCurrentStock} {g.unit}</span></div>
                          <div className="flex items-center gap-2"><div className={`w-3 h-3 rounded-full ${isExpiredView ? "bg-destructive" : "bg-orange-500"}`} /><span className="text-muted-foreground">{isExpiredView ? "Expired:" : "Expiring:"}</span><span className={`font-bold ${isExpiredView ? "text-destructive" : "text-orange-500"}`}>{g.affectedQty} {g.unit}</span></div>
                          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-success" /><span className="text-muted-foreground">Safe:</span><span className="font-bold text-success">{g.safeQty} {g.unit}</span></div>
                        </div>
                        {g.totalCurrentStock > 0 && (
                          <div className="flex h-2 rounded-full overflow-hidden mt-2 bg-muted">
                            <div className={isExpiredView ? "bg-destructive" : "bg-orange-500"} style={{ width: `${(g.affectedQty / g.totalCurrentStock) * 100}%` }} />
                            <div className="bg-success" style={{ width: `${(g.safeQty / g.totalCurrentStock) * 100}%` }} />
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2">Batch Breakdown</div>
                      <div className="space-y-2">
                        {g.batches.map(b => {
                          const daysLeft = Math.ceil((new Date(b.expiryDate).getTime() - Date.now()) / 86400000);
                          return (
                            <div key={b.id} className={`flex items-center justify-between rounded-lg border p-3 ${daysLeft < 0 ? "border-destructive/30 bg-destructive/5" : "border-orange-500/30 bg-orange-500/5"}`}>
                              <div className="flex items-center gap-4">
                                <div className={`text-2xl font-bold ${daysLeft < 0 ? "text-destructive" : "text-orange-500"}`}>{b.remainingQty}<span className="text-xs ml-1 font-normal">{g.unit}</span></div>
                                <div>
                                  <div className="text-sm font-medium">{daysLeft < 0 ? `Expired ${Math.abs(daysLeft)} days ago` : daysLeft === 0 ? "Expires today!" : `Expires in ${daysLeft} day${daysLeft > 1 ? "s" : ""}`}</div>
                                  <div className="text-xs text-muted-foreground">Expiry: {b.expiryDate} · Purchased: {b.purchasedAt}</div>
                                </div>
                              </div>
                              <Badge variant="secondary" className={daysLeft < 0 ? "bg-destructive/10 text-destructive" : "bg-orange-100 text-orange-800"}>
                                {daysLeft < 0 ? "Expired" : `${daysLeft}d left`}
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpiryView(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Quick Add Ingredient Dialog ── */}
      <Dialog open={apQuickAddOpen} onOpenChange={setApQuickAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add New Ingredient</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={apQuickAddForm.name} onChange={e => setApQuickAddForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Chicken Breast" />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={apQuickAddForm.categoryId} onValueChange={v => setApQuickAddForm(p => ({ ...p, categoryId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {apCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Select value={apQuickAddForm.unitId} onValueChange={v => setApQuickAddForm(p => ({ ...p, unitId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                <SelectContent>
                  {apUnits.map(u => <SelectItem key={u.id} value={u.id}>{u.name} ({u.symbol})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">Stock starts at 0 and price will be set from this purchase.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApQuickAddOpen(false)}>Cancel</Button>
            <Button className="gradient-primary text-primary-foreground" onClick={handleApQuickAddIngredient} disabled={!apQuickAddForm.name.trim() || apQuickAddLoading}>
              {apQuickAddLoading ? "Adding..." : "Add Ingredient"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default Warehouses;

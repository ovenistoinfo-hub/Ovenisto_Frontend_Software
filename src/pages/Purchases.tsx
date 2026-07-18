import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { purchaseService, type PurchaseRecord } from "@/services/purchase.service";
import { supplierService, type SupplierRecord } from "@/services/supplier.service";
import { inventoryService, type IngredientRecord, type IngredientCategoryRecord, type UnitRecord } from "@/services/inventory.service";
import { warehouseService, type WarehouseRecord } from "@/services/warehouse.service";
import { purchaseRequestService, type PurchaseRequestRecord } from "@/services/purchase-request.service";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Search, Eye, Trash2, ShoppingCart, Printer, CalendarIcon, User, Phone, Mail, ChevronUp, X, Wallet, CalendarDays, TrendingUp, BarChart3 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import { TablePagination } from "@/components/TablePagination";
import { PageHeader } from "@/components/ui/page-header";
import { useModuleEvents } from "@/hooks/use-module-events";
import { api } from "@/services/api";

const payColor: Record<string, string> = {
  paid: "bg-success/10 text-success",
  partial: "bg-warning/10 text-warning",
  unpaid: "bg-destructive/10 text-destructive",
};

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

const formatDate = (d: string) => (d ? d.split("T")[0] : "");

/** Reusable date picker — works on mobile (native tap), tablet, and desktop */
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
          className={cn(
            "h-10 w-full justify-start text-left font-normal text-sm truncate",
            !selected && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-60" />
          <span className="truncate">{selected ? format(selected, "dd MMM yyyy") : placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" side="bottom">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => {
            onChange(d ? format(d, "yyyy-MM-dd") : "");
            setOpen(false);
          }}
          initialFocus
        />
        {selected && (
          <div className="p-2 border-t flex justify-end">
            <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground" onClick={() => { onChange(""); setOpen(false); }}>
              Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

const Purchases = () => {
  const { settings } = useData();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const currency = settings.currency || "Rs.";
  const isSuperAdmin = user?.role === "Super Admin";
  const isAdminOrAbove = ["Super Admin", "Admin"].includes(user?.role ?? "");
  // Manager can purchase only from approved requests — no manual ingredient entry
  const canManualEntry = isAdminOrAbove;
  const [searchParams] = useSearchParams();

  // Data state
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [ingredients, setIngredients] = useState<IngredientRecord[]>([]);
  const [categories, setCategories] = useState<IngredientCategoryRecord[]>([]);
  const [units, setUnits] = useState<UnitRecord[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseRecord[]>([]);
  const [approvedRequests, setApprovedRequests] = useState<PurchaseRequestRecord[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState("");

  // UI state
  const [saving, setSaving] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [showDetail, setShowDetail] = useState<PurchaseRecord | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [targetSupplierId, setTargetSupplierId] = useState<string | null>(null);
  const [payDialogAmount, setPayDialogAmount] = useState(0);
  const [payDialogNote, setPayDialogNote] = useState("");
  const [payingSaving, setPayingSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [vendorFilter, setVendorFilter] = useState("");

  // Add form state
  const [form, setForm] = useState({ invoiceNumber: "" });
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [items, setItems] = useState<FormItem[]>([
    { ingredientId: "", name: "", qty: 0, unit: "", unitPrice: 0, wasteQty: 0, wasteReason: "", source: "manual" },
  ]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");

  // Stock of the chosen destination warehouse, so the ingredient picker shows THAT
  // warehouse's quantity (not the chain-wide global). Falls back to global if none chosen.
  const [warehouseStock, setWarehouseStock] = useState<Record<string, { qty: number; unit: string }>>({});
  const stockLabel = useCallback((ig: IngredientRecord) => {
    if (selectedWarehouseId) {
      const ws = warehouseStock[ig.id];
      const unit = ws?.unit || ig.unit?.name || "";
      return ` (Warehouse: ${ws?.qty ?? 0}${unit ? " " + unit : ""})`;
    }
    const unit = ig.unit?.name ?? "";
    return ` (Stock: ${Number(ig.currentStock)}${unit ? " " + unit : ""})`;
  }, [selectedWarehouseId, warehouseStock]);
  useEffect(() => {
    if (!selectedWarehouseId) { setWarehouseStock({}); return; }
    let cancelled = false;
    warehouseService.getStock(selectedWarehouseId).then((rows) => {
      if (cancelled) return;
      const map: Record<string, { qty: number; unit: string }> = {};
      rows.forEach((r) => { map[r.ingredient.id] = { qty: Number(r.currentStock), unit: r.ingredient.unit?.symbol || r.ingredient.unit?.name || "" }; });
      setWarehouseStock(map);
    }).catch(() => { if (!cancelled) setWarehouseStock({}); });
    return () => { cancelled = true; };
  }, [selectedWarehouseId]);

  // Billing / extra costs state
  const [taxAmount, setTaxAmount] = useState(0);
  const [shippingCost, setShippingCost] = useState(0);
  const [miscAmount, setMiscAmount] = useState(0);

  // Payment state per supplier for purchase form (status, paidAmount, discount)
  const [supplierPayments, setSupplierPayments] = useState<Record<string, { status: 'paid' | 'partial' | 'unpaid'; paidAmount: number; discount?: number }>>({});

  // Quick-add ingredient state
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddTargetIdx, setQuickAddTargetIdx] = useState<number | null>(null);
  const [quickAddForm, setQuickAddForm] = useState({ name: "", categoryId: "", unitId: "" });
  const [quickAddLoading, setQuickAddLoading] = useState(false);

  const autoFillDone = useRef(false);

  const { data: purchasesResp, isLoading: loading } = useQuery({
    queryKey: ["purchases", { page, limit: 20 }],
    queryFn: () => purchaseService.getAll({ page, limit: 20 }),
  });
  const purchases = purchasesResp?.data ?? [];
  const totalItems = purchasesResp?.meta.total ?? 0;

  const { data: purchaseStatsResp } = useQuery({
    queryKey: ["purchases", "stats", { supplierId: vendorFilter }],
    queryFn: () => purchaseService.getStats({ supplierId: vendorFilter || undefined }),
  });
  const stats = purchaseStatsResp?.data ?? { total: 0, today: 0, weekly: 0, monthly: 0 };

  // Live updates: the backend pushes purchase changes to the owning outlet's room only.
  const PURCHASE_EVENTS = ["purchase:created", "purchase:updated", "purchase:deleted"] as const;
  useModuleEvents(PURCHASE_EVENTS, (payload: any) => {
    // Clear the api.ts GET cache FIRST — react-query's refetch still goes through
    // api.get, whose 30s TTL is only invalidated by THIS client's own mutations.
    // Another user's action never touches it, so without this the refetch would
    // re-serve the stale list and the toast would fire with no visible change.
    // This also drops /suppliers + /warehouses + /inventory via MUTATION_DEPENDENCIES,
    // which a purchase legitimately changes (supplier dues, stock levels).
    api.clearCache('/purchases');
    queryClient.invalidateQueries({ queryKey: ["purchases"] });

    const invoiceNo = payload?.invoiceNo ?? payload?.billNo ?? payload?.invoiceNumber;
    if (invoiceNo) {
      toast.info(`Purchase ${invoiceNo} updated`);
    } else {
      toast.info("Purchases updated");
    }
  });

  // Load reference data lazily (on first dialog open, cached by api layer)
  const refDataLoaded = useRef(false);
  const loadRefData = useCallback(async () => {
    if (refDataLoaded.current && suppliers.length > 0) return;
    try {
      const [supRes, ingList, catList, unitList, whList, prRes] = await Promise.all([
        supplierService.getAll(),
        inventoryService.getIngredients(),
        inventoryService.getIngredientCategories(),
        inventoryService.getUnits(),
        warehouseService.getAll(),
        purchaseRequestService.getAll({ status: "APPROVED", limit: 100 }),
      ]);
      setSuppliers(supRes.data);
      setIngredients(ingList);
      setCategories(catList);
      setUnits(unitList);
      setWarehouses(whList);
      setApprovedRequests(prRes.data);
      // Pre-select warehouse from URL param if present, otherwise:
      // - Super Admin → MAIN warehouse
      // - Branch user → their outlet's BRANCH warehouse
      const paramWarehouseId = searchParams.get("warehouseId");
      if (paramWarehouseId && whList.find((w) => w.id === paramWarehouseId)) {
        setSelectedWarehouseId(paramWarehouseId);
      } else if (!selectedWarehouseId) {
        const defaultWh = isSuperAdmin
          ? whList.find((w) => w.type === "MAIN")
          : whList.find((w) => w.type === "BRANCH" && w.outletId === user?.outletId);
        if (defaultWh) setSelectedWarehouseId(defaultWh.id);
      }
      refDataLoaded.current = true;
    } catch (err: Error | unknown) {
      toast.error((err as Error).message || "Failed to load data");
    }
  }, [suppliers.length, selectedWarehouseId]);

  // Low-stock / ingredient param auto-fill — trigger ref data load
  useEffect(() => {
    if (autoFillDone.current || loading) return;
    if (searchParams.get("auto") === "low-stock" || searchParams.get("ingredientId")) {
      loadRefData();
    }
  }, [searchParams, loading, loadRefData]);

  // Auto-select targetSupplierId if there's only one supplier with active due
  useEffect(() => {
    if (!payingId) {
      setTargetSupplierId(null);
      return;
    }
    const p = purchases.find((x) => x.id === payingId);
    if (!p) return;
    const activeDues = p.supplierDues && Array.isArray(p.supplierDues)
      ? p.supplierDues.filter((d: any) => d.due > 0 && d.supplierId)
      : [];
    if (activeDues.length === 1) {
      setTargetSupplierId(activeDues[0].supplierId);
      setPayDialogAmount(activeDues[0].due);
    } else if (p.supplierId) {
      setTargetSupplierId(p.supplierId);
    }
  }, [payingId, purchases]);

  // Handlers for multi-vendor selection
  const handleAddSupplier = useCallback((supplierId: string) => {
    if (!supplierId || supplierId === "none" || selectedSuppliers.includes(supplierId)) return;
    setSelectedSuppliers(prev => [...prev, supplierId]);
    supplierService.getIngredients(supplierId).then(res => {
      const newItems = res.data.map(ing => {
        const ws = warehouseStock[ing.id];
        const currentStock = ws ? ws.qty : Number(ing.currentStock) || 0;
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
      setItems(prev => {
        const filteredPrev = prev.filter(p => p.ingredientId !== "");
        const toAppend = newItems.filter(n => !filteredPrev.some(p => p.ingredientId === n.ingredientId));
        return [...filteredPrev, ...toAppend];
      });
    }).catch(err => {
      toast.error(err.message || "Failed to load supplier ingredients");
    });
  }, [selectedSuppliers, warehouseStock]);

  const handleRemoveSupplier = useCallback((supplierId: string) => {
    setSelectedSuppliers(prev => prev.filter(id => id !== supplierId));
    setItems(prev => prev.filter(item => {
      const ing = ingredients.find(ig => ig.id === item.ingredientId);
      return ing?.supplierId !== supplierId;
    }));
  }, [ingredients]);

  useEffect(() => {
    if (autoFillDone.current || ingredients.length === 0) return;
    if (searchParams.get("auto") === "low-stock") {
      autoFillDone.current = true;
      const lowItems = ingredients.filter((i) => Number(i.currentStock) <= Number(i.lowStockLevel));
      if (lowItems.length > 0) {
        setItems(
          lowItems.map((i) => ({
            ingredientId: i.id,
            name: i.name,
            qty: Math.max(1, Number(i.lowStockLevel) - Number(i.currentStock)),
            unit: i.unit?.name || "",
            unitPrice: Number(i.purchasePrice) || 0,
            wasteQty: 0,
            wasteReason: "",
            source: "manual" as const,
          }))
        );
    
        setForm({ supplierId: "", invoiceNumber: "" });
        setShowDialog(true);
      }
    }
  }, [searchParams, loading, ingredients]);

  // ingredientId param auto-fill (don't conflict with auto=low-stock)
  useEffect(() => {
    const paramIngId = searchParams.get("ingredientId");
    if (!paramIngId || autoFillDone.current || ingredients.length === 0) return;
    if (searchParams.get("auto") === "low-stock") return;
    const ing = ingredients.find((i) => i.id === paramIngId);
    if (!ing) return;
    autoFillDone.current = true;
    setItems([{
      ingredientId: ing.id,
      name: ing.name,
      qty: Math.max(1, Number(ing.lowStockLevel) - Number(ing.currentStock)),
      unit: ing.unit?.name ?? "",
      unitPrice: Number(ing.purchasePrice) || 0,
      wasteQty: 0,
      wasteReason: "",
      source: "manual" as const,
    }]);
    setForm({ supplierId: "", invoiceNumber: "" });
    setShowDialog(true);
  }, [searchParams, ingredients]);

  const filtered = purchases.filter(
    (p) =>
      (!vendorFilter || p.supplierId === vendorFilter) &&
      (
        (p.supplierName || "").toLowerCase().includes(search.toLowerCase()) ||
        (p.invoiceNumber || "").toLowerCase().includes(search.toLowerCase())
      )
  );

  const openAdd = () => {
    loadRefData();

    setForm({ invoiceNumber: "" });
    setSelectedSuppliers([]);
    setItems([{ ingredientId: "", name: "", qty: 0, unit: "", unitPrice: 0, wasteQty: 0, wasteReason: "", source: "manual" }]);
    setSelectedRequestId("");
    setTaxAmount(0);
    setShippingCost(0);
    setMiscAmount(0);
    setSupplierPayments({});
    setTargetSupplierId(null);
    const defaultWh = isSuperAdmin
      ? warehouses.find((w) => w.type === "MAIN")
      : warehouses.find((w) => w.type === "BRANCH" && w.outletId === user?.outletId);
    setSelectedWarehouseId(defaultWh?.id || "");
    setShowDialog(true);
  };

  // When an approved request is selected, merge approved items with existing manual items
  const handleSelectRequest = (requestId: string) => {
    setSelectedRequestId(requestId);
    if (!requestId) {
      // Remove approved items, keep manual ones
      setItems((prev) => prev.filter((i) => i.source === "manual"));
      return;
    }
    const pr = approvedRequests.find((r) => r.id === requestId);
    if (!pr) return;
    setSelectedWarehouseId(pr.warehouseId);
    if (pr.supplierId) {
      setSelectedSuppliers([pr.supplierId]);
    } else {
      setSelectedSuppliers([]);
    }
    const approvedItems: FormItem[] = pr.items
      .filter((item) => (item.approvedQty ?? 0) > 0)
      .map((item) => ({
        ingredientId: item.ingredientId,
        name: item.ingredient.name,
        qty: item.approvedQty ?? item.requestedQty,
        unit: item.ingredient.unit?.name ?? "",
        unitPrice: Number(item.ingredient.purchasePrice) || 0,
        approvedQty: item.approvedQty ?? item.requestedQty,
        wasteQty: 0,
        wasteReason: "",
        source: "approved" as const,
      }));
    // Keep existing manual items, put approved items first
    setItems((prev) => [...approvedItems, ...prev.filter((i) => i.source === "manual")]);
  };


  const addItemRow = () =>
    setItems((p) => [
      ...p,
      { ingredientId: "", name: "", qty: 0, unit: "", unitPrice: 0, wasteQty: 0, wasteReason: "", source: "manual" },
    ]);

  const removeItemRow = (idx: number) => setItems((p) => p.filter((_, i) => i !== idx));

  const updateItemRow = (idx: number, field: string, value: string | number) => {
    setItems((p) =>
      p.map((item, i) => {
        if (i !== idx) return item;
        if (field === "ingredientId") {
          const ing = ingredients.find((ig) => ig.id === value);
          return {
            ...item,
            ingredientId: value as string,
            name: ing?.name || "",
            unit: ing?.unit?.name || "",
            unitPrice: Number(ing?.purchasePrice) || 0,
          };
        }
        return { ...item, [field]: value };
      })
    );
  };

  // Group subtotal by supplier (pre-computed helper to prevent loops)
  const groupings = useMemo(() => {
    const map: Record<string, number> = {};
    items.forEach(it => {
      if (!it.ingredientId) return;
      const ing = ingredients.find(ig => ig.id === it.ingredientId);
      const sId = ing?.supplierId || "none";
      map[sId] = (map[sId] || 0) + (it.qty * it.unitPrice);
    });
    return map;
  }, [items, ingredients]);

  const getSupplierPaymentDetails = useCallback((supplierId: string | null) => {
    const key = supplierId || "none";
    const details = supplierPayments[key];
    if (details) {
      return {
        status: details.status,
        paidAmount: details.paidAmount,
        discount: details.discount ?? 0
      };
    }
    const sub = groupings[key] || 0;
    return { status: 'paid' as const, paidAmount: sub, discount: 0 };
  }, [supplierPayments, groupings]);

  const setSupplierPaymentDetails = useCallback((
    supplierId: string | null,
    status: 'paid' | 'partial' | 'unpaid',
    paidVal?: number,
    discVal?: number
  ) => {
    const key = supplierId || "none";
    const sub = groupings[key] || 0;

    setSupplierPayments(prev => {
      const existing = prev[key] || { status: 'paid', paidAmount: sub, discount: 0 };
      const newDiscount = discVal !== undefined ? discVal : (existing.discount ?? 0);
      const netTotal = Math.max(0, sub - newDiscount);

      let finalPaid = paidVal !== undefined ? paidVal : existing.paidAmount;
      if (status === 'paid') finalPaid = netTotal;
      else if (status === 'unpaid') finalPaid = 0;
      else if (status === 'partial' && paidVal === undefined) {
        finalPaid = Math.min(existing.paidAmount, netTotal);
      }

      return {
        ...prev,
        [key]: { status, paidAmount: finalPaid, discount: newDiscount }
      };
    });
  }, [groupings]);

  // Group subtotal and calculate totals for each supplier
  const supplierBreakdowns = useMemo(() => {
    const list: Array<{
      supplierId: string | null;
      supplierName: string;
      subtotal: number;
      discount: number;
      total: number;
    }> = [];

    Object.entries(groupings).forEach(([sId, sub]) => {
      const pay = getSupplierPaymentDetails(sId === "none" ? null : sId);
      const sDiscount = pay.discount;
      const sTotal = Math.max(0, sub - sDiscount);

      if (sId === "none") {
        list.push({
          supplierId: null,
          supplierName: "Non-Supplier Items (Cash)",
          subtotal: sub,
          discount: sDiscount,
          total: sTotal
        });
      } else {
        const supplier = suppliers.find(s => s.id === sId);
        list.push({
          supplierId: sId,
          supplierName: supplier?.name || "Unknown Supplier",
          subtotal: sub,
          discount: sDiscount,
          total: sTotal
        });
      }
    });

    return list;
  }, [groupings, getSupplierPaymentDetails, suppliers]);

  // Computed totals
  const itemsSubtotal = items.reduce((s, it) => s + it.qty * it.unitPrice, 0);

  const discountAmount = useMemo(() => {
    return supplierBreakdowns.reduce((sum, b) => sum + b.discount, 0);
  }, [supplierBreakdowns]);

  const grandTotal = Math.max(0, itemsSubtotal - discountAmount + taxAmount + shippingCost + miscAmount);

  // Billing split: supplier-linked items vs cash items
  const supplierItemsTotal = items.reduce((s, it) => {
    const ing = ingredients.find(ig => ig.id === it.ingredientId);
    return ing?.supplierId ? s + it.qty * it.unitPrice : s;
  }, 0);
  const nonSupplierItemsTotal = items.reduce((s, it) => {
    const ing = ingredients.find(ig => ig.id === it.ingredientId);
    return !it.ingredientId || !ing?.supplierId ? s + it.qty * it.unitPrice : s;
  }, 0);

  const overallDue = useMemo(() => {
    return supplierBreakdowns.reduce((sum, b) => {
      if (b.supplierId === null) return sum;
      const pay = getSupplierPaymentDetails(b.supplierId);
      return sum + Math.max(0, b.total - pay.paidAmount);
    }, 0);
  }, [supplierBreakdowns, getSupplierPaymentDetails]);

  const overallPaid = Math.max(0, grandTotal - overallDue);
  const overallStatus = overallDue <= 0 ? 'paid' : (overallPaid <= nonSupplierItemsTotal ? 'unpaid' : 'partial');

  const approvedItemCount = items.filter((i) => i.source === "approved").length;
  const manualItemCount = items.filter((i) => i.source === "manual").length;

  const handleSave = async () => {
    if (!canManualEntry && !selectedRequestId) {
      toast.error("Please select an approved request to proceed");
      return;
    }
    const validItems = items.filter((i) => i.ingredientId && i.qty > 0);
    if (validItems.length === 0) {
      toast.error("Add at least one item with quantity");
      return;
    }
    // Validate: wasteQty must not exceed qty
    const invalidWaste = validItems.find((i) => i.wasteQty > i.qty);
    if (invalidWaste) {
      toast.error(`Waste quantity cannot exceed purchased quantity for "${invalidWaste.name}"`);
      return;
    }

    // Validate partial payments per supplier
    for (const b of supplierBreakdowns) {
      if (b.supplierId) {
        const pay = getSupplierPaymentDetails(b.supplierId);
        if (pay.status === 'partial' && (pay.paidAmount < 0 || pay.paidAmount > b.total)) {
          toast.error(`For ${b.supplierName}, partial payment must be between 0 and ${b.total}`);
          return;
        }
      }
    }

    const itemSupplierIds = validItems
      .map(item => ingredients.find(ig => ig.id === item.ingredientId)?.supplierId)
      .filter(Boolean);
    const uniqueItemSuppliers = Array.from(new Set(itemSupplierIds));
    const finalSupplierId = selectedSuppliers.length === 1
      ? selectedSuppliers[0]
      : (uniqueItemSuppliers.length === 1 ? uniqueItemSuppliers[0] : undefined);

    const duesArray = supplierBreakdowns
      .filter(b => b.supplierId !== null)
      .map(b => {
        const pay = getSupplierPaymentDetails(b.supplierId!);
        return {
          supplierId: b.supplierId,
          supplierName: b.supplierName,
          total: b.total,
          paid: pay.paidAmount,
          due: Math.max(0, b.total - pay.paidAmount),
          status: pay.status
        };
      });

    setSaving(true);
    try {
      await purchaseService.create({
        supplierId: finalSupplierId,
        invoiceNumber: form.invoiceNumber || undefined,
        date: new Date().toISOString().split("T")[0],
        items: validItems.map((i) => ({
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
        discount: discountAmount,
        tax: taxAmount,
        shippingCost,
        miscAmount,
        total: grandTotal,
        paid: overallPaid,
        status: overallStatus,
        warehouseId: selectedWarehouseId || undefined,
        purchaseRequestId: selectedRequestId || undefined,
        supplierDues: duesArray,
      });
      toast.success("Purchase added — stock updated");
      setShowDialog(false);
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      if (selectedRequestId) {
        setApprovedRequests((prev) => prev.filter((r) => r.id !== selectedRequestId));
      }
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to save purchase");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await purchaseService.delete(deleteId);
      setDeleteId(null);
      toast.success("Purchase deleted");
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to delete purchase");
    }
  };

  const handlePay = async () => {
    if (!payingId || payDialogAmount <= 0) return;
    setPayingSaving(true);
    try {
      await purchaseService.pay(payingId, { 
        amount: payDialogAmount, 
        note: payDialogNote || undefined,
        supplierId: targetSupplierId || undefined
      });
      toast.success("Payment recorded successfully");
      setPayingId(null);
      setTargetSupplierId(null);
      setPayDialogAmount(0);
      setPayDialogNote("");
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      if (showDetail && showDetail.id === payingId) {
        purchaseService.getById(payingId).then(updated => {
          setShowDetail(updated);
        });
      }
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to record payment");
    } finally {
      setPayingSaving(false);
    }
  };

  const handleQuickAddIngredient = async () => {
    if (!quickAddForm.name.trim()) return;
    setQuickAddLoading(true);
    try {
      const newIngredient = await inventoryService.createIngredient({
        name: quickAddForm.name.trim(),
        categoryId: quickAddForm.categoryId || null,
        unitId: quickAddForm.unitId || null,
      });
      const updated = await inventoryService.getIngredients();
      setIngredients(updated);
      if (quickAddTargetIdx !== null) {
        updateItemRow(quickAddTargetIdx, "ingredientId", newIngredient.id);
      }
      setQuickAddOpen(false);
      setQuickAddForm({ name: "", categoryId: "", unitId: "" });
      toast.success(`"${newIngredient.name}" added successfully`);
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to add ingredient");
    } finally {
      setQuickAddLoading(false);
    }
  };

  if (loading)
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-10 w-full rounded-lg" />
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg mt-2" />
        ))}
      </div>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<ShoppingCart className="h-5 w-5" />}
        title="Purchases"
        subtitle="Purchase orders and invoices"
        actions={
          <div className="flex items-center gap-2">
            <Button className="gradient-primary text-primary-foreground" onClick={() => { if (showDialog) { setShowDialog(false); } else { openAdd(); } }}>
              {showDialog ? <><X className="h-4 w-4 mr-2" />Close Form</> : <><Plus className="h-4 w-4 mr-2" />Add Purchase</>}
            </Button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm border-primary/20">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <ShoppingCart className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Total Purchases</p>
                <p className="text-2xl font-bold tracking-tight text-primary">
                  {currency} {stats.total.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0">
                <CalendarDays className="h-5 w-5 text-orange-500" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Today's Purchases</p>
                <p className="text-2xl font-bold tracking-tight text-orange-500">
                  {currency} {stats.today.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-warning/10 flex items-center justify-center shrink-0">
                <TrendingUp className="h-5 w-5 text-warning" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">This Week</p>
                <p className="text-2xl font-bold tracking-tight text-warning">
                  {currency} {stats.weekly.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0">
                <BarChart3 className="h-5 w-5 text-purple-500" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">This Month</p>
                <p className="text-2xl font-bold tracking-tight text-purple-500">
                  {currency} {stats.monthly.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Inline Add Purchase Form Panel ── */}
      {showDialog && (
        <Card className="shadow-sm border-primary/30 bg-primary/[0.02]">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Add Purchase</Label>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowDialog(false)}><ChevronUp className="h-4 w-4" /></Button>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* ── Section: Approved Request ── */}
            {/* Admin/Super Admin: optional. Manager: required */}
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                  {canManualEntry ? "Link to Approved Request (Optional)" : "Select Approved Request *"}
                </Label>
              </CardHeader>
              <CardContent>
                <Select
                  value={selectedRequestId || "__none__"}
                  onValueChange={(v) => handleSelectRequest(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an approved request" />
                  </SelectTrigger>
                  <SelectContent>
                    {canManualEntry && <SelectItem value="__none__">— No Request —</SelectItem>}
                    {approvedRequests.map((pr) => {
                      const activeItems = pr.items.filter((i) => (i.approvedQty ?? 0) > 0).length;
                      return (
                        <SelectItem key={pr.id} value={pr.id}>
                          {pr.requestNo} — {pr.warehouse.name} ({activeItems} items) — by {pr.requestedBy.name}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {selectedRequestId && canManualEntry && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Approved items loaded below. You can still add manual items.
                  </p>
                )}
                {!canManualEntry && !selectedRequestId && (
                  <p className="text-xs text-destructive mt-1.5">
                    You must select an approved request to proceed.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* ── Section: Purchase Details ── */}
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Purchase Details</Label>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Add Supplier (optional)</Label>
                    <Select
                      value=""
                      onValueChange={handleAddSupplier}
                      disabled={!canManualEntry && !!selectedRequestId}
                    >
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder={(!canManualEntry && !!selectedRequestId) ? "Supplier fixed by request" : "Add supplier to load ingredients..."} />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers
                          .filter(s => !selectedSuppliers.includes(s.id))
                          .map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {/* Selected Suppliers Badges */}
                    {selectedSuppliers.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2 p-2.5 bg-muted/40 rounded-lg border">
                        <span className="text-xs text-muted-foreground self-center mr-1">Active:</span>
                        {selectedSuppliers.map(id => {
                          const s = suppliers.find(sup => sup.id === id);
                          if (!s) return null;
                          return (
                            <Badge key={id} variant="secondary" className="flex items-center gap-1 py-0.5 pr-1 pl-2">
                              <span className="text-xs font-semibold">{s.name}</span>
                              {(!(!canManualEntry && !!selectedRequestId)) && (
                                <Button
                                  type="button" variant="ghost" size="icon"
                                  className="h-4 w-4 rounded-full p-0 text-muted-foreground hover:text-foreground"
                                  onClick={() => handleRemoveSupplier(id)}
                                >
                                  <X className="h-2.5 w-2.5" />
                                </Button>
                              )}
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Invoice Number</Label>
                    <Input
                      className="h-11"
                      placeholder="e.g. INV-001"
                      value={form.invoiceNumber}
                      onChange={(e) => setForm((p) => ({ ...p, invoiceNumber: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Warehouse</Label>
                    <Select
                      value={selectedWarehouseId || "__none__"}
                      onValueChange={(v) => setSelectedWarehouseId(v === "__none__" ? "" : v)}
                      disabled={!!selectedRequestId}
                    >
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="Select warehouse" />
                      </SelectTrigger>
                      <SelectContent>
                        {!isSuperAdmin && <SelectItem value="__none__">No warehouse</SelectItem>}
                        {warehouses
                          .filter((w) => (isSuperAdmin ? w.type === "MAIN" : w.type === "BRANCH"))
                          .map((w) => (
                            <SelectItem key={w.id} value={w.id}>
                              {w.name} ({w.type})
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ── Section: Items ── */}
            <Card className="shadow-sm">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                  Items ({items.filter((i) => i.ingredientId).length})
                </Label>
                {canManualEntry && (
                  <Button variant="outline" size="sm" onClick={addItemRow} className="h-8 min-h-[32px]">
                    <Plus className="h-3 w-3 mr-1" />
                    Add Item
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Empty state */}
                {items.filter((i) => i.ingredientId || i.source === "manual").length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    {canManualEntry
                      ? "Select an approved request above or add items manually"
                      : "Select an approved request above to load items"}
                  </div>
                )}

                {/* Approved Items Group */}
                {approvedItemCount > 0 && (
                  <div className="space-y-2">
                    {selectedRequestId && (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs font-medium border-primary/40 text-primary">
                          From Request
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {approvedRequests.find((r) => r.id === selectedRequestId)?.requestNo}
                        </span>
                      </div>
                    )}
                    {/* Card layout for all screen sizes — avoids horizontal scroll */}
                    <div className="space-y-2">
                      {items
                        .map((item, originalIdx) => ({ item, originalIdx }))
                        .filter(({ item }) => item.source === "approved")
                        .map(({ item, originalIdx }) => {
                          const receivedQty = item.qty - (item.wasteQty ?? 0);
                          return (
                            <div
                              key={originalIdx}
                              className="border rounded-lg p-3 space-y-2 border-l-2 border-l-primary/40 bg-primary/5"
                            >
                              <div className="flex items-center justify-between gap-2 flex-wrap min-w-0">
                                <span className="font-medium text-sm truncate min-w-0">{item.name}</span>
                                <Badge variant="secondary" className="text-xs shrink-0">
                                  Approved: {item.approvedQty ?? item.qty} {item.unit}
                                </Badge>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Purchased Qty ({item.unit})</Label>
                                  <Input
                                    className="h-10 text-sm"
                                    type="number"
                                    min={0}
                                    value={item.qty || ""}
                                    onChange={(e) => updateItemRow(originalIdx, "qty", Number(e.target.value))}
                                    disabled={!canManualEntry}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Waste Qty</Label>
                                  <Input
                                    className="h-10 text-sm"
                                    type="number"
                                    min={0}
                                    max={item.qty}
                                    value={item.wasteQty || ""}
                                    onChange={(e) => updateItemRow(originalIdx, "wasteQty", Number(e.target.value))}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Unit Price</Label>
                                  <Input
                                    className="h-10 text-sm"
                                    type="number"
                                    min={0}
                                    value={item.unitPrice || ""}
                                    onChange={(e) => updateItemRow(originalIdx, "unitPrice", Number(e.target.value))}
                                    disabled={!canManualEntry}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Expiry Date</Label>
                                  <DatePickerField
                                    value={item.expiryDate || ""}
                                    onChange={(v) => updateItemRow(originalIdx, "expiryDate", v)}
                                  />
                                </div>
                              </div>
                              {item.wasteQty > 0 && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Waste Reason</Label>
                                  <Input
                                    className="h-10 text-sm"
                                    placeholder="e.g. Broken during transport"
                                    value={item.wasteReason}
                                    onChange={(e) => updateItemRow(originalIdx, "wasteReason", e.target.value)}
                                  />
                                </div>
                              )}
                              <div className="flex items-center justify-between pt-1 text-sm">
                                <span className="text-muted-foreground">Line Total:</span>
                                <div className="text-right">
                                  <div className="font-medium">{currency} {(item.qty * item.unitPrice).toLocaleString()}</div>
                                  {item.wasteQty > 0 && (
                                    <Badge variant="secondary" className="text-xs bg-success/10 text-success mt-0.5">
                                      Received: {receivedQty} {item.unit}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Separator between approved and manual items (admin/super admin only) */}
                {canManualEntry && approvedItemCount > 0 && manualItemCount > 0 && (
                  <div className="flex items-center gap-2 py-1">
                    <Separator className="flex-1" />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">Additional Items</span>
                    <Separator className="flex-1" />
                  </div>
                )}

                {/* Manual Items — Admin / Super Admin only */}
                {canManualEntry && <div className="space-y-2">
                  {items
                    .map((item, originalIdx) => ({ item, originalIdx }))
                    .filter(({ item }) => item.source === "manual")
                    .map(({ item, originalIdx }) => {
                      const receivedQty = item.qty - (item.wasteQty ?? 0);
                      return (
                        <div key={originalIdx} className="border rounded-lg p-3 space-y-2">
                          {/* Row 1: Ingredient selector + quick-add */}
                          <div className="flex gap-2">
                            <Select
                              value={item.ingredientId}
                              onValueChange={(v) => updateItemRow(originalIdx, "ingredientId", v)}
                            >
                              <SelectTrigger className="h-11 text-sm flex-1">
                                <SelectValue placeholder="Select Ingredient" />
                              </SelectTrigger>
                              <SelectContent>
                                {ingredients.map((ig) => (
                                  <SelectItem key={ig.id} value={ig.id}>
                                    {ig.name}{stockLabel(ig)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-11 w-11 shrink-0"
                              title="Add new ingredient"
                              onClick={() => {
                                setQuickAddTargetIdx(originalIdx);
                                setQuickAddForm({ name: "", categoryId: "", unitId: "" });
                                setQuickAddOpen(true);
                              }}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-11 w-11 shrink-0 text-destructive"
                              onClick={() => removeItemRow(originalIdx)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          {/* Row 2: Qty, Unit, Price, Expiry */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Qty {item.unit ? `(${item.unit})` : ""}</Label>
                              <Input
                                className="h-11 text-sm"
                                type="number"
                                min={0}
                                placeholder="Qty"
                                value={item.qty || ""}
                                onChange={(e) => updateItemRow(originalIdx, "qty", Number(e.target.value))}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Waste Qty</Label>
                              <Input
                                className="h-11 text-sm"
                                type="number"
                                min={0}
                                max={item.qty}
                                placeholder="Waste"
                                value={item.wasteQty || ""}
                                onChange={(e) => updateItemRow(originalIdx, "wasteQty", Number(e.target.value))}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Unit Price</Label>
                              <Input
                                className="h-11 text-sm"
                                type="number"
                                min={0}
                                placeholder="Price"
                                value={item.unitPrice || ""}
                                onChange={(e) => updateItemRow(originalIdx, "unitPrice", Number(e.target.value))}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Expiry Date</Label>
                              <DatePickerField
                                value={item.expiryDate || ""}
                                onChange={(v) => updateItemRow(originalIdx, "expiryDate", v)}
                              />
                            </div>
                          </div>
                          {/* Row 3: Waste reason (conditional) + totals */}
                          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
                            <div className="flex-1 w-full">
                              {item.wasteQty > 0 && (
                                <Input
                                  className="h-9 text-xs"
                                  placeholder="Waste reason (e.g. Broken during transport)"
                                  value={item.wasteReason}
                                  onChange={(e) => updateItemRow(originalIdx, "wasteReason", e.target.value)}
                                />
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-sm font-medium whitespace-nowrap">
                                {currency} {(item.qty * item.unitPrice).toLocaleString()}
                              </div>
                              {item.wasteQty > 0 && (
                                <Badge variant="secondary" className="text-xs bg-success/10 text-success mt-0.5">
                                  Received: {receivedQty}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>}
              </CardContent>
            </Card>

            {/* ── Section: Billing Summary ── */}
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Billing Summary</Label>
              </CardHeader>
              <CardContent>
              <div className="space-y-2 w-full max-w-sm ml-auto">
                  {/* Supplier / Non-Supplier split */}
                  {supplierItemsTotal > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Supplier Items (Credit)</span>
                      <span className="font-medium tabular-nums text-amber-600 dark:text-amber-400">{currency} {supplierItemsTotal.toLocaleString()}</span>
                    </div>
                  )}
                  {nonSupplierItemsTotal > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Non-Supplier Items (Cash)</span>
                      <span className="font-medium tabular-nums">{currency} {nonSupplierItemsTotal.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal (items)</span>
                    <span className="font-medium tabular-nums">{currency} {itemsSubtotal.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="text-sm shrink-0 min-w-[7rem] flex flex-col">
                      <span>Discount</span>
                      <span className="text-[10px] text-muted-foreground font-normal">(Sum of vendor discounts)</span>
                    </Label>
                    <Input
                      className="h-9 text-sm text-right flex-1 min-w-0 bg-muted/50 cursor-not-allowed"
                      type="number"
                      disabled
                      placeholder="0"
                      value={discountAmount || ""}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="text-sm shrink-0 min-w-[7rem]">Shipping Cost</Label>
                    <Input
                      className="h-9 text-sm text-right flex-1 min-w-0"
                      type="number"
                      min={0}
                      step={1}
                      placeholder="0"
                      value={shippingCost || ""}
                      onChange={(e) => setShippingCost(Number(e.target.value))}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="text-sm shrink-0 min-w-[7rem]">Tax Amount</Label>
                    <Input
                      className="h-9 text-sm text-right flex-1 min-w-0"
                      type="number"
                      min={0}
                      step={1}
                      placeholder="0"
                      value={taxAmount || ""}
                      onChange={(e) => setTaxAmount(Number(e.target.value))}
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
                      value={miscAmount || ""}
                      onChange={(e) => setMiscAmount(Number(e.target.value))}
                    />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between font-semibold text-base">
                    <span>Grand Total</span>
                    <span className="text-lg tabular-nums">{currency} {grandTotal.toLocaleString()}</span>
                  </div>

                  {supplierBreakdowns.map((b, idx) => {
                    if (b.supplierId === null) {
                      const nonSupplierPay = getSupplierPaymentDetails(null);
                      return (
                        <div key="non-supplier" className="border p-3 rounded-lg bg-muted/40 space-y-2">
                          <div className="flex justify-between text-xs font-semibold text-muted-foreground uppercase">
                            <span>{b.supplierName}</span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Fully Paid (Cash) ✓</span>
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Subtotal:</span>
                            <span>{currency} {b.subtotal.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <Label className="text-xs shrink-0 min-w-[5rem]">Discount</Label>
                            <Input
                              className="h-8 text-xs text-right flex-1 min-w-0"
                              type="number" min={0} max={b.subtotal} step={1} placeholder="0"
                              value={nonSupplierPay.discount || ""}
                              onChange={(e) => {
                                const disc = Number(e.target.value);
                                setSupplierPaymentDetails(null, 'paid', undefined, disc);
                              }}
                            />
                          </div>
                          <div className="flex justify-between text-sm pt-1 border-t">
                            <span className="font-medium">Amount Paid (Net)</span>
                            <span className="font-bold">{currency} {b.total.toLocaleString()}</span>
                          </div>
                        </div>
                      );
                    }

                    const pay = getSupplierPaymentDetails(b.supplierId);
                    return (
                      <div key={b.supplierId} className="border p-3 rounded-lg bg-muted/20 space-y-2.5">
                        <div className="flex justify-between text-xs font-semibold uppercase">
                          <span className="text-amber-600 dark:text-amber-400">{b.supplierName}</span>
                          <span>Subtotal: {currency} {b.subtotal.toLocaleString()}</span>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <Label className="text-xs shrink-0 min-w-[5rem]">Discount</Label>
                          <Input
                            className="h-8 text-xs text-right flex-1 min-w-0"
                            type="number" min={0} max={b.subtotal} step={1} placeholder="0"
                            value={pay.discount || ""}
                            onChange={(e) => {
                              const disc = Number(e.target.value);
                              setSupplierPaymentDetails(b.supplierId!, pay.status, undefined, disc);
                            }}
                          />
                        </div>

                        <div className="flex justify-between text-xs font-semibold text-muted-foreground">
                          <span>Net Share:</span>
                          <span>{currency} {b.total.toLocaleString()}</span>
                        </div>

                        <div className="flex items-center gap-3">
                          <Label className="text-xs shrink-0 min-w-[5rem]">Payment</Label>
                          <Select
                            value={pay.status}
                            onValueChange={(v) => {
                              setSupplierPaymentDetails(
                                b.supplierId!, 
                                v as 'paid' | 'partial' | 'unpaid', 
                                v === 'paid' ? b.total : (v === 'unpaid' ? 0 : undefined)
                              );
                            }}
                          >
                            <SelectTrigger className="h-8 flex-1 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="paid">✅ Paid in Full</SelectItem>
                              <SelectItem value="partial">🟡 Partial Payment</SelectItem>
                              <SelectItem value="unpaid">🔴 Unpaid (Credit)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {pay.status === 'partial' && (
                          <div className="flex items-center gap-3">
                            <Label className="text-xs shrink-0 min-w-[5rem]">Paid Amount</Label>
                            <Input
                              className="h-8 text-xs text-right flex-1 min-w-0"
                              type="number" min={0} max={b.total} step={1} placeholder="0"
                              value={pay.paidAmount || ""}
                              onChange={(e) => setSupplierPaymentDetails(b.supplierId!, 'partial', Number(e.target.value))}
                            />
                          </div>
                        )}

                        <div className="flex justify-between text-xs text-muted-foreground pt-1.5 border-t">
                          <span>Due to Vendor:</span>
                          <span className={b.total - pay.paidAmount > 0 ? "font-bold text-red-600 dark:text-red-400" : "text-emerald-600 font-semibold"}>
                            {currency} {Math.max(0, b.total - pay.paidAmount).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  
                  {overallDue > 0 && (
                    <div className="flex justify-between text-sm pt-1.5 border-t">
                      <span className="font-semibold text-muted-foreground">Overall Due Udhaar:</span>
                      <span className="font-bold text-red-600 dark:text-red-400">
                        {currency} {overallDue.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button
                className="gradient-primary text-primary-foreground"
                size="sm"
                onClick={() => handleSave()}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Purchase"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by supplier or invoice..."
                className="pl-9"
              />
            </div>
            <div className="w-48">
              <Select value={vendorFilter || "__all__"} onValueChange={v => setVendorFilter(v === "__all__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="All Vendors" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Vendors</SelectItem>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingCart className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" />
              <p className="text-muted-foreground">No purchases found</p>
              <p className="text-xs text-muted-foreground mt-1.5">Add your first purchase to get started.</p>
              <Button size="sm" className="gradient-primary text-primary-foreground mt-3" onClick={openAdd}>
                <Plus className="h-4 w-4 mr-1" />
                Add Purchase
              </Button>
            </div>
          ) : (
            <>
              <div className="rounded-lg border overflow-auto max-h-[calc(100vh-300px)]">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead>SN</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Warehouse</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Paid</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((p, i) => (
                      <TableRow key={p.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell>{(page - 1) * 20 + i + 1}</TableCell>
                        <TableCell>{formatDate(p.date)}</TableCell>
                        <TableCell className="font-medium">{p.invoiceNumber || "—"}</TableCell>
                        <TableCell>{p.supplierName || "—"}</TableCell>
                        <TableCell className="text-sm">{p.warehouseName || "—"}</TableCell>
                        <TableCell>{Array.isArray(p.items) ? p.items.length : 0}</TableCell>
                        <TableCell className="font-medium">
                          {currency} {(p.total ?? 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-sm text-emerald-600 dark:text-emerald-400">
                          {currency} {(p.paid ?? 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-sm">
                          {(p.due ?? 0) > 0 ? (
                            <span className="font-semibold text-red-600 dark:text-red-400">{currency} {(p.due ?? 0).toLocaleString()}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={payColor[p.status] || ""}>
                            {p.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setShowDetail(p)}
                              title="View / Receipt"
                            >
                              <Eye className="h-3 w-3" />
                            </Button>
                            {(p.due ?? 0) > 0 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-amber-600 hover:text-amber-700"
                                onClick={() => { setPayingId(p.id); setPayDialogAmount(p.due ?? 0); setPayDialogNote(""); }}
                                title="Record Payment"
                              >
                                <Wallet className="h-3 w-3" />
                              </Button>
                            )}
                            {isSuperAdmin && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive"
                                onClick={() => setDeleteId(p.id)}
                                title="Delete"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <TablePagination currentPage={page} totalItems={totalItems} onPageChange={setPage} pageSize={20} />
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Detail / Receipt Dialog ── */}
      <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {showDetail && (() => {
            const sd = showDetail;
            // Cross-reference full supplier record for phone/email
            const supplierRecord = sd.supplierId ? suppliers.find(s => s.id === sd.supplierId) : null;
            const sdItems = Array.isArray(sd.items)
              ? (sd.items as {
                  name: string; qty: number; unit: string; unitPrice: number;
                  total?: number; approvedQty?: number;
                  wasteQty?: number; wasteReason?: string; source?: "approved" | "manual";
                }[])
              : [];
            const approvedItems = sdItems.filter((i) => i.source === "approved");
            const manualItems = sdItems.filter((i) => i.source === "manual" || !i.source);
            const hasApproved = approvedItems.length > 0;
            const hasWaste = sdItems.some((i) => (i.wasteQty ?? 0) > 0);

            const renderItemsTable = (rows: typeof sdItems, groupLabel?: string) => (
              <div className="space-y-1">
                {groupLabel && (
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                    {groupLabel}
                  </p>
                )}
                <div className="rounded-lg border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead>SN</TableHead>
                        <TableHead>Ingredient</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Unit</TableHead>
                        {hasApproved && <TableHead className="text-right">Approved</TableHead>}
                        <TableHead className="text-right">Purchased</TableHead>
                        {hasWaste && <TableHead className="text-right">Waste</TableHead>}
                        {hasWaste && <TableHead className="text-right">Received</TableHead>}
                        {hasWaste && <TableHead>Waste Reason</TableHead>}
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((item, i) => {
                        const receivedQty = item.qty - (item.wasteQty ?? 0);
                        return (
                          <TableRow key={i}>
                            <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                            <TableCell className="font-medium">{item.name}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{(() => {
                              const ing = ingredients.find(ig => ig.id === (item as any).ingredientId);
                              return ing?.supplier?.name || "—";
                            })()}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{item.unit}</TableCell>
                            {hasApproved && (
                              <TableCell className="text-right text-sm text-muted-foreground">
                                {item.approvedQty ?? "—"}
                              </TableCell>
                            )}
                            <TableCell className="text-right">{item.qty}</TableCell>
                            {hasWaste && (
                              <TableCell className="text-right text-sm">
                                {(item.wasteQty ?? 0) > 0 ? <span className="text-destructive">{item.wasteQty}</span> : "—"}
                              </TableCell>
                            )}
                            {hasWaste && (
                              <TableCell className="text-right">
                                <Badge variant="secondary" className="text-xs bg-success/10 text-success">{receivedQty}</Badge>
                              </TableCell>
                            )}
                            {hasWaste && (
                              <TableCell className="text-sm text-muted-foreground">{item.wasteReason || "—"}</TableCell>
                            )}
                            <TableCell className="text-right">{currency} {item.unitPrice.toLocaleString()}</TableCell>
                            <TableCell className="text-right font-medium">
                              {currency} {(item.total ?? item.qty * item.unitPrice).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            );

            const itemsBySupplier: Record<string, { supplierName: string; items: typeof sdItems }> = {};
            sdItems.forEach(item => {
              const ing = ingredients.find(i => i.id === item.ingredientId);
              const supId = ing?.supplierId || "none";
              const supName = ing?.supplier?.name || "General / No Supplier";
              if (!itemsBySupplier[supId]) {
                itemsBySupplier[supId] = { supplierName: supName, items: [] };
              }
              itemsBySupplier[supId].items.push(item);
            });

            const printSupplierReceipt = (supplierName: string, itemsList: typeof sdItems) => {
              const w = window.open("", "_blank", "width=800,height=700");
              if (!w) return;
              const subtotalVal = itemsList.reduce((s, it) => s + it.qty * it.unitPrice, 0);
              w.document.write(`<!DOCTYPE html><html><head><title>Purchase Receipt — ${supplierName}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;padding:30px;color:#333;font-size:13px}h1{font-size:20px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccc;padding:8px;text-align:left}th{background:#f0f0f0;font-weight:600;font-size:12px}.header{text-align:center;border-bottom:2px solid #333;padding-bottom:16px;margin-bottom:16px}.info-grid{display:flex;justify-content:space-between;margin-bottom:16px}.summary{text-align:right;margin-top:12px}.billing-row{display:flex;justify-content:flex-end;gap:24px;padding:3px 0;font-size:13px}.billing-total{font-weight:700;font-size:15px;border-top:2px solid #333;padding-top:6px;margin-top:4px}@media print{body{padding:15px}}</style></head><body>`);
              w.document.write(`<div class="header"><h1>Purchase Receipt</h1><p style="color:#666;margin-top:4px">Supplier: ${supplierName}</p></div>`);
              w.document.write(`<div class="info-grid"><div><p style="font-size:11px;color:#888;text-transform:uppercase;font-weight:600">Purchase ID</p><p style="font-family:monospace">${sd.invoiceNumber || sd.id.slice(0, 8)}</p><p style="font-size:11px;color:#888;margin-top:4px">${new Date(sd.createdAt).toLocaleString()}</p></div><div style="text-align:right"><p style="font-size:11px;color:#888;text-transform:uppercase;font-weight:600">Warehouse</p><p style="font-weight:600">${sd.warehouseName || "—"}</p></div></div>`);
              w.document.write(`<table><thead><tr><th>SN</th><th>Ingredient</th><th>Unit</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Total</th></tr></thead><tbody>`);
              itemsList.forEach((item, i) => {
                w.document.write(`<tr>
                  <td>${i + 1}</td><td>${item.name}</td><td>${item.unit}</td>
                  <td style="text-align:right">${item.qty}</td>
                  <td style="text-align:right">${currency} ${item.unitPrice.toLocaleString()}</td>
                  <td style="text-align:right;font-weight:600">${currency} ${(item.qty * item.unitPrice).toLocaleString()}</td>
                </tr>`);
              });
              w.document.write(`</tbody></table>`);
              w.document.write(`<div class="summary">`);
              w.document.write(`<div class="billing-row billing-total"><span>Supplier Total:</span><span>${currency} ${subtotalVal.toLocaleString()}</span></div>`);
              w.document.write(`</div></body></html>`);
              w.document.close();
              w.print();
            };

            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-3">
                    <span>Purchase Invoice: {sd.invoiceNumber || sd.id.slice(0, 8)}</span>
                    <Badge variant="secondary" className={payColor[sd.status] || ""}>
                      {sd.status.toUpperCase()}
                    </Badge>
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                  {/* Info Cards — exactly matches PR invoice design */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Purchased By */}
                    <Card className="shadow-sm">
                      <CardHeader className="pb-2">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wider">Purchased By</Label>
                      </CardHeader>
                      <CardContent className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <User className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="font-medium truncate">{sd.createdByName || "—"}</span>
                          {sd.createdByRole && (
                            <Badge variant="secondary" className="text-xs shrink-0">{sd.createdByRole}</Badge>
                          )}
                        </div>
                        {sd.createdByPhone && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Phone className="h-3 w-3 shrink-0" /><span className="truncate">{sd.createdByPhone}</span>
                          </div>
                        )}
                        {sd.createdByEmail && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
                            <Mail className="h-3 w-3 shrink-0" /><span className="break-all text-xs">{sd.createdByEmail}</span>
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground mt-1 break-words">
                          Purchased: {new Date(sd.createdAt).toLocaleString()}
                        </div>
                      </CardContent>
                    </Card>
                    {/* Supplier */}
                    <Card className="shadow-sm">
                      <CardHeader className="pb-2">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wider">Supplier</Label>
                      </CardHeader>
                      <CardContent className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <User className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="font-medium truncate">{sd.supplierName || "—"}</span>
                        </div>
                        {supplierRecord?.company && (
                          <div className="text-sm text-muted-foreground pl-6 truncate">{supplierRecord.company}</div>
                        )}
                        {supplierRecord?.phone && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Phone className="h-3 w-3 shrink-0" /><span className="truncate">{supplierRecord.phone}</span>
                          </div>
                        )}
                        {supplierRecord?.email && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
                            <Mail className="h-3 w-3 shrink-0" /><span className="break-all text-xs">{supplierRecord.email}</span>
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground mt-1">
                          Warehouse: <span className="font-medium text-foreground">{sd.warehouseName || "—"}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Items grouped */}
                  {sdItems.length > 0 && (
                    <div className="space-y-3">
                      {hasApproved && renderItemsTable(approvedItems, "From Approved Request")}
                      {hasApproved && manualItems.length > 0 && renderItemsTable(manualItems, "Additional Items")}
                      {!hasApproved && renderItemsTable(sdItems)}
                    </div>
                  )}

                  {/* Billing — no paid/due */}
                  <div className="space-y-1.5 pt-2 border-t text-sm w-full max-w-xs ml-auto">
                    {(sd.subtotal ?? 0) > 0 && (
                      <div className="flex justify-between gap-4 text-muted-foreground">
                        <span>Subtotal:</span>
                        <span className="tabular-nums whitespace-nowrap">{currency} {(sd.subtotal ?? 0).toLocaleString()}</span>
                      </div>
                    )}
                    {(sd.discount ?? 0) > 0 && (
                      <div className="flex justify-between gap-4 text-muted-foreground">
                        <span>Discount:</span>
                        <span className="tabular-nums whitespace-nowrap">-{currency} {(sd.discount ?? 0).toLocaleString()}</span>
                      </div>
                    )}
                    {(sd.shippingCost ?? 0) > 0 && (
                      <div className="flex justify-between gap-4 text-muted-foreground">
                        <span>Shipping:</span>
                        <span className="tabular-nums whitespace-nowrap">{currency} {(sd.shippingCost ?? 0).toLocaleString()}</span>
                      </div>
                    )}
                    {(sd.tax ?? 0) > 0 && (
                      <div className="flex justify-between gap-4 text-muted-foreground">
                        <span>Tax:</span>
                        <span className="tabular-nums whitespace-nowrap">{currency} {(sd.tax ?? 0).toLocaleString()}</span>
                      </div>
                    )}
                    {(sd.miscAmount ?? 0) > 0 && (
                      <div className="flex justify-between gap-4 text-muted-foreground">
                        <span>Miscellaneous:</span>
                        <span className="tabular-nums whitespace-nowrap">{currency} {(sd.miscAmount ?? 0).toLocaleString()}</span>
                      </div>
                    )}
                    <Separator />
                    <div className="flex justify-between gap-4 font-bold text-base">
                      <span>Grand Total:</span>
                      <span className="tabular-nums whitespace-nowrap">{currency} {(sd.total ?? 0).toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Split Receipts Section */}
                  {Object.keys(itemsBySupplier).length > 1 && (
                    <Card className="shadow-sm border-primary/20 bg-primary/[0.01]">
                      <CardHeader className="py-2.5 flex flex-row items-center justify-between pb-1.5">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Split Receipts by Supplier
                        </Label>
                      </CardHeader>
                      <CardContent className="py-2 flex flex-wrap gap-2">
                        {Object.entries(itemsBySupplier).map(([supId, group]) => (
                          <Button 
                            key={supId} 
                            variant="outline" 
                            size="sm" 
                            onClick={() => printSupplierReceipt(group.supplierName, group.items)}
                            className="text-xs"
                          >
                            <Printer className="h-3 w-3 mr-1" />
                            Print: {group.supplierName} ({group.items.length} items)
                          </Button>
                        ))}
                      </CardContent>
                    </Card>
                  )}

                  {/* Supplier Dues Section */}
                  {sd.supplierDues && sd.supplierDues.length > 0 && (
                    <div className="space-y-2 border-t pt-3">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Vendor Dues & Payment Status
                      </Label>
                      <div className="rounded-lg border overflow-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50 hover:bg-muted/50">
                              <TableHead className="text-xs">Vendor</TableHead>
                              <TableHead className="text-right text-xs">Total Share</TableHead>
                              <TableHead className="text-right text-xs">Paid</TableHead>
                              <TableHead className="text-right text-xs">Due</TableHead>
                              <TableHead className="text-xs">Status</TableHead>
                              <TableHead className="text-xs text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sd.supplierDues.map((due) => (
                              <TableRow key={due.supplierId || 'none'}>
                                <TableCell className="font-medium text-sm">
                                  {due.supplierName || 'General / No Supplier'}
                                </TableCell>
                                <TableCell className="text-right text-sm font-medium">
                                  {currency} {due.total.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right text-sm text-emerald-600 dark:text-emerald-400">
                                  {currency} {due.paid.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right text-sm">
                                  {due.due > 0 ? (
                                    <span className="font-semibold text-red-600 dark:text-red-400">{currency} {due.due.toLocaleString()}</span>
                                  ) : (
                                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Fully Paid ✓</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="secondary" className={payColor[due.status] || ""}>
                                    {due.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  {due.due > 0 && due.supplierId && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs text-amber-600 border-amber-600 hover:bg-amber-50"
                                      onClick={() => {
                                        setPayingId(sd.id);
                                        setPayDialogAmount(due.due);
                                        setPayDialogNote("");
                                        setTargetSupplierId(due.supplierId);
                                      }}
                                    >
                                      <Wallet className="h-3 w-3 mr-1" />
                                      Pay Vendor
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {sd.notes && (
                    <div className="text-sm text-muted-foreground bg-muted/40 rounded px-3 py-2">
                      <span className="font-medium text-foreground">Notes: </span>{sd.notes}
                    </div>
                  )}

                  {/* Total items count */}
                  <p className="text-right text-sm text-muted-foreground">
                    Total Items: <strong>{sdItems.length}</strong>
                  </p>

                  {/* Payment History Ledger */}
                  {sd.paymentHistory && sd.paymentHistory.length > 0 && (
                    <div className="space-y-2 border-t pt-3">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Payment History
                      </Label>
                      <div className="rounded-lg border overflow-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50 hover:bg-muted/50">
                              <TableHead className="text-xs">Date &amp; Time</TableHead>
                              <TableHead className="text-right text-xs">Amount Paid</TableHead>
                              <TableHead className="text-right text-xs">Balance Remaining</TableHead>
                              <TableHead className="text-xs">Note</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sd.paymentHistory.map((ph, idx) => (
                              <TableRow key={ph.id}>
                                <TableCell className="text-sm text-muted-foreground">
                                  {new Date(ph.createdAt).toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right font-medium text-emerald-600 dark:text-emerald-400">
                                  {currency} {ph.amount.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right">
                                  {ph.balanceAfter > 0 ? (
                                    <span className="font-semibold text-red-600 dark:text-red-400">{currency} {ph.balanceAfter.toLocaleString()}</span>
                                  ) : (
                                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Fully Paid ✓</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {ph.note || (idx === 0 ? 'Initial payment' : '—')}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </div>

                <DialogFooter className="gap-2">
                  <Button variant="outline" size="sm" onClick={() => {
                    const w = window.open("", "_blank", "width=800,height=700");
                    if (!w) return;
                    const renderPrintGroup = (rows: typeof sdItems, label: string) => {
                      let html = "";
                      if (label) html += `<p style="font-size:11px;font-weight:600;text-transform:uppercase;color:#888;margin:12px 0 4px">${label}</p>`;
                      html += `<table><thead><tr><th>SN</th><th>Ingredient</th><th>Vendor</th><th>Unit</th>`;
                      if (hasApproved) html += `<th style="text-align:right">Approved</th>`;
                      html += `<th style="text-align:right">Purchased</th>`;
                      if (hasWaste) {
                        html += `<th style="text-align:right">Waste</th><th style="text-align:right">Received</th><th>Waste Reason</th>`;
                      }
                      html += `<th style="text-align:right">Unit Price</th><th style="text-align:right">Total</th></tr></thead><tbody>`;
                      rows.forEach((item, i) => {
                        const receivedQty = item.qty - (item.wasteQty ?? 0);
                        const ing = ingredients.find(ig => ig.id === (item as any).ingredientId);
                        const vendorName = ing?.supplier?.name || "—";
                        html += `<tr>
                          <td>${i + 1}</td><td>${item.name}</td><td>${vendorName}</td><td>${item.unit}</td>
                          ${hasApproved ? `<td style="text-align:right;color:#666">${item.approvedQty ?? "—"}</td>` : ""}
                          <td style="text-align:right">${item.qty}</td>
                          ${hasWaste ? `<td style="text-align:right;color:${(item.wasteQty ?? 0) > 0 ? "#d32f2f" : "#666"}">${(item.wasteQty ?? 0) > 0 ? item.wasteQty : "—"}</td>` : ""}
                          ${hasWaste ? `<td style="text-align:right;color:#1a7f37;font-weight:600">${receivedQty}</td>` : ""}
                          ${hasWaste ? `<td style="color:#666;font-size:11px">${item.wasteReason || "—"}</td>` : ""}
                          <td style="text-align:right">${currency} ${item.unitPrice.toLocaleString()}</td>
                          <td style="text-align:right;font-weight:600">${currency} ${(item.total ?? item.qty * item.unitPrice).toLocaleString()}</td>
                        </tr>`;
                      });
                      html += `</tbody></table>`;
                      return html;
                    };

                    w.document.write(`<!DOCTYPE html><html><head><title>Purchase — ${sd.invoiceNumber || sd.id.slice(0, 8)}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;padding:30px;color:#333;font-size:13px}h1{font-size:20px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccc;padding:8px;text-align:left}th{background:#f0f0f0;font-weight:600;font-size:12px}.header{text-align:center;border-bottom:2px solid #333;padding-bottom:16px;margin-bottom:16px}.info-grid{display:flex;justify-content:space-between;margin-bottom:16px}.badge{display:inline-block;padding:3px 12px;border-radius:12px;font-size:11px;font-weight:600;margin-top:6px}.summary{text-align:right;margin-top:12px}.billing-row{display:flex;justify-content:flex-end;gap:24px;padding:3px 0;font-size:13px}.billing-total{font-weight:700;font-size:15px;border-top:2px solid #333;padding-top:6px;margin-top:4px}@media print{body{padding:15px}}</style></head><body>`);
                    w.document.write(`<div class="header"><h1>Purchase Invoice</h1><p style="color:#666;margin-top:4px">${sd.invoiceNumber || "—"}</p><span class="badge" style="background:${sd.status === "paid" ? "#e6f4ea;color:#1a7f37" : sd.status === "unpaid" ? "#fde8e8;color:#d32f2f" : "#fff8e1;color:#f57f17"}">${sd.status.toUpperCase()}</span></div>`);
                    w.document.write(`<div class="info-grid"><div><p style="font-size:11px;color:#888;text-transform:uppercase;font-weight:600">Purchased By</p><p style="font-weight:600">${sd.createdByName || "—"}</p>${sd.createdByRole ? `<p style="color:#666">${sd.createdByRole}</p>` : ""}${sd.createdByPhone ? `<p style="color:#666">${sd.createdByPhone}</p>` : ""}${sd.createdByEmail ? `<p style="color:#666">${sd.createdByEmail}</p>` : ""}<p style="font-size:11px;color:#888;margin-top:4px">${new Date(sd.createdAt).toLocaleString()}</p></div><div style="text-align:right"><p style="font-size:11px;color:#888;text-transform:uppercase;font-weight:600">Supplier</p><p style="font-weight:600">${sd.supplierName || "—"}</p>${supplierRecord?.company ? `<p style="color:#666">${supplierRecord.company}</p>` : ""}${supplierRecord?.phone ? `<p style="color:#666">${supplierRecord.phone}</p>` : ""}${supplierRecord?.email ? `<p style="color:#666">${supplierRecord.email}</p>` : ""}<p style="color:#666">Warehouse: ${sd.warehouseName || "—"}</p></div></div>`);
                    if (sd.notes) w.document.write(`<p style="background:#f5f5f5;padding:8px;border-radius:4px;margin-bottom:8px"><strong>Notes:</strong> ${sd.notes}</p>`);

                    if (hasApproved) {
                      w.document.write(renderPrintGroup(approvedItems, "From Approved Request"));
                      if (manualItems.length > 0) w.document.write(renderPrintGroup(manualItems, "Additional Items"));
                    } else {
                      w.document.write(renderPrintGroup(sdItems, ""));
                    }

                    w.document.write(`<div class="summary">`);
                    if ((sd.subtotal ?? 0) > 0) w.document.write(`<div class="billing-row"><span>Subtotal:</span><span>${currency} ${(sd.subtotal ?? 0).toLocaleString()}</span></div>`);
                    if ((sd.discount ?? 0) > 0) w.document.write(`<div class="billing-row"><span>Discount:</span><span>-${currency} ${(sd.discount ?? 0).toLocaleString()}</span></div>`);
                    if ((sd.shippingCost ?? 0) > 0) w.document.write(`<div class="billing-row"><span>Shipping:</span><span>${currency} ${(sd.shippingCost ?? 0).toLocaleString()}</span></div>`);
                    if ((sd.tax ?? 0) > 0) w.document.write(`<div class="billing-row"><span>Tax:</span><span>${currency} ${(sd.tax ?? 0).toLocaleString()}</span></div>`);
                    if ((sd.miscAmount ?? 0) > 0) w.document.write(`<div class="billing-row"><span>Miscellaneous:</span><span>${currency} ${(sd.miscAmount ?? 0).toLocaleString()}</span></div>`);
                    w.document.write(`<div class="billing-row billing-total"><span>Grand Total:</span><span>${currency} ${(sd.total ?? 0).toLocaleString()}</span></div>`);
                    w.document.write(`<p style="margin-top:8px;color:#666">Total Items: <strong>${sdItems.length}</strong></p>`);
                    w.document.write(`</div></body></html>`);
                    w.document.close();
                    w.print();
                  }}>
                    <Printer className="h-4 w-4 mr-1" />Print / PDF
                  </Button>
                  <Button variant="outline" onClick={() => setShowDetail(null)}>Close</Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Purchase?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reverse stock adjustments and supplier totals. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Pay Purchase Dialog ── */}
      <Dialog open={!!payingId} onOpenChange={(open) => { if (!open) { setPayingId(null); setTargetSupplierId(null); setPayDialogAmount(0); setPayDialogNote(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-amber-600" />
              Record Vendor Payment
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {payingId && (() => {
              const p = purchases.find(x => x.id === payingId);
              if (!p) return null;

              const activeDues = p.supplierDues && Array.isArray(p.supplierDues)
                ? p.supplierDues.filter((d: any) => d.due > 0 && d.supplierId)
                : [];

              return (
                <>
                  {activeDues.length > 1 ? (
                    <div className="space-y-1.5">
                      <Label>Select Vendor</Label>
                      <Select
                        value={targetSupplierId || ""}
                        onValueChange={(val) => {
                          setTargetSupplierId(val);
                          const chosen = activeDues.find((d: any) => d.supplierId === val);
                          if (chosen) setPayDialogAmount(chosen.due);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a vendor to pay" />
                        </SelectTrigger>
                        <SelectContent>
                          {activeDues.map((d: any) => (
                            <SelectItem key={d.supplierId} value={d.supplierId}>
                              {d.supplierName} (Due: {currency} {d.due.toLocaleString()})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="flex justify-between text-sm bg-muted/40 rounded-lg p-3">
                      <span className="text-muted-foreground">
                        {activeDues.length === 1 ? activeDues[0].supplierName : "Outstanding Due"}
                      </span>
                      <span className="font-bold text-red-600 dark:text-red-400">
                        {currency} {(activeDues.length === 1 ? activeDues[0].due : (p.due ?? 0)).toLocaleString()}
                      </span>
                    </div>
                  )}
                </>
              );
            })()}
            <div className="space-y-1.5">
              <Label>Amount to Pay</Label>
              <Input
                type="number" min={1}
                max={
                  payingId ? (() => {
                    const p = purchases.find(x => x.id === payingId);
                    if (!p) return 0;
                    if (targetSupplierId && p.supplierDues) {
                      const sd = p.supplierDues.find((d: any) => d.supplierId === targetSupplierId);
                      return sd ? sd.due : 0;
                    }
                    if (p.supplierDues && p.supplierDues.length > 0) {
                      const activeDues = p.supplierDues.filter((d: any) => d.due > 0 && d.supplierId);
                      if (activeDues.length === 1) return activeDues[0].due;
                    }
                    return p.due ?? 0;
                  })() : 0
                }
                value={payDialogAmount || ""}
                onChange={(e) => setPayDialogAmount(Number(e.target.value))}
                placeholder="Enter amount"
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Input
                value={payDialogNote}
                onChange={(e) => setPayDialogNote(e.target.value)}
                placeholder="e.g. Bank transfer, Cash payment..."
                className="h-10"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setPayingId(null); setTargetSupplierId(null); setPayDialogAmount(0); setPayDialogNote(""); }}>Cancel</Button>
            <Button
              className="gradient-primary text-primary-foreground"
              onClick={handlePay}
              disabled={
                payingSaving || 
                payDialogAmount <= 0 || 
                (payingId && (() => {
                  const p = purchases.find(x => x.id === payingId);
                  const activeDues = p?.supplierDues && Array.isArray(p.supplierDues)
                    ? p.supplierDues.filter((d: any) => d.due > 0 && d.supplierId)
                    : [];
                  return activeDues.length > 1 && !targetSupplierId;
                })())
              }
            >
              {payingSaving ? "Saving..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Quick Add Ingredient Dialog ── */}
      <Dialog open={quickAddOpen} onOpenChange={setQuickAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add New Ingredient</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input
                value={quickAddForm.name}
                onChange={(e) => setQuickAddForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Chicken Breast"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={quickAddForm.categoryId}
                onValueChange={(v) => setQuickAddForm((p) => ({ ...p, categoryId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Select
                value={quickAddForm.unitId}
                onValueChange={(v) => setQuickAddForm((p) => ({ ...p, unitId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} ({u.symbol})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">Stock starts at 0 and price will be set from this purchase.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickAddOpen(false)}>
              Cancel
            </Button>
            <Button
              className="gradient-primary text-primary-foreground"
              onClick={handleQuickAddIngredient}
              disabled={!quickAddForm.name.trim() || quickAddLoading}
            >
              {quickAddLoading ? "Adding..." : "Add Ingredient"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Purchases;

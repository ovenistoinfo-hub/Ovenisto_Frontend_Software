# Stock Adjustments — Merge Waste Into It Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Stock Adjustments page's content with the Waste page's functionality (KPIs, breakdown, record form, list) plus a small additive-only "Correction" mode, keeping the page named "Stock Adjustments"; remove the now-redundant standalone Waste page, route, nav item, and permission key.

**Architecture:** Single frontend-only rewrite. `pages/stock/StockAdjustments.tsx` is rebuilt to fetch both `WasteRecord`s and `type=correction` `StockAdjustment`s, normalize them into one row shape, and render a merged, sorted, paginated table plus waste-only KPI/breakdown cards. `pages/Waste.tsx` and its route/nav/permission wiring are deleted. No backend or schema changes.

**Tech Stack:** React 18 + TypeScript + Vite, shadcn/ui components, `stockService`/`inventoryService`/`warehouseService` (existing, unmodified), `sonner` toasts, client-side pagination via the existing `TablePagination`/`paginate` helper.

## Global Constraints

- **No backend/schema changes.** Reuse `GET/POST /stock/waste` and `GET/POST /stock/adjustments` exactly as they exist today (see spec `docs/superpowers/specs/2026-07-10-stock-adjustments-waste-merge-design.md`).
- **No new automated tests.** This repo has zero `*.test.tsx` files in the frontend and the backend `CLAUDE.md` explicitly says not to introduce tests without asking first — that convention holds for this plan too. Each task's "test cycle" is: TypeScript compiles clean, ESLint is clean, and the feature is manually verified in the browser preview (per this repo's own convention: "For UI or frontend changes, start the dev server and use the feature in a browser before reporting the task as complete").
- **Route stays `/stock/adjustments`, page title stays "Stock Adjustments".** Only its content changes.
- **`correction` adjustments stay additive-only** (existing backend behavior, unchanged) — no new direction/± toggle.
- Typecheck command for this repo: `npx tsc --noEmit -p .` (run from `Ovenisto_Frontend_Software/`). Lint command: `npm run lint`.
- Dev server: `npm run dev` (port 8080), backend must also be running (`npm run dev` in `Ovenisto-backend/`, port 3001) for the browser-verification steps. Login: `admin@ovenisto.com` / `password123` (seeded Super Admin, prefilled on the login form).

---

### Task 1: Build the merged Stock Adjustments page

**Files:**
- Modify (full rewrite): `Ovenisto_Frontend_Software/src/pages/stock/StockAdjustments.tsx`

**Interfaces:**
- Consumes: `stockService.getWasteRecords`, `stockService.createWasteRecord`, `stockService.getAdjustments`, `stockService.createAdjustment` (all existing, unmodified, from `src/services/stock.service.ts`); `inventoryService.getIngredients` (`src/services/inventory.service.ts`); `warehouseService.getAll` (`src/services/warehouse.service.ts`); `useData()` for `settings.currency` (`src/contexts/DataContext.tsx`); `useAuth()` for `user.role` (`src/contexts/AuthContext.tsx`); `TablePagination`/`paginate` (`src/components/TablePagination.tsx`); `PageHeader` (`src/components/ui/page-header.tsx`).
- Produces: default-exported `StockAdjustments` component, unchanged export shape — `App.tsx`'s `const StockAdjustments = lazy(() => import("./pages/stock/StockAdjustments"));` and its `<Route path="/stock/adjustments" ...>` need no changes.

- [ ] **Step 1: Write the complete new file**

Replace the entire contents of `Ovenisto_Frontend_Software/src/pages/stock/StockAdjustments.tsx` with:

```tsx
import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  Plus, Search, Trash2, TrendingDown, CalendarDays, BarChart3, Eye, User, Phone,
  ChevronUp, X, ShoppingBag, AlertCircle, Check, ChevronsUpDown,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TablePagination, paginate } from "@/components/TablePagination";
import { PageHeader } from "@/components/ui/page-header";
import { stockService, type WasteRecord, type StockAdjustmentRecord } from "@/services/stock.service";
import { inventoryService, type IngredientRecord } from "@/services/inventory.service";
import { warehouseService, type WarehouseRecord } from "@/services/warehouse.service";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";

const WASTE_REASONS = ["Expired", "Spoiled", "Overcooked", "Accidental", "Damaged", "Other"] as const;

const CORRECTION_REASONS = [
  "Physical count mismatch",
  "System error correction",
  "Wrong entry adjustment",
  "Duplicate entry fix",
  "Opening balance correction",
];

type RecordMode = "waste" | "correction";

interface MergedRow {
  id: string;
  kind: RecordMode;
  date: string;
  itemName: string;
  unit: string | null;
  quantity: number | null;
  reason: string | null;
  cost: number | null;
  recordedByName: string | null;
  orderId: string | null;
  waste?: WasteRecord;
  adjustment?: StockAdjustmentRecord;
}

const emptyForm = {
  ingredientId: "",
  itemName: "",
  quantity: 0,
  unit: "",
  reason: "",
  cost: 0,
  notes: "",
  warehouseId: "",
};

const StockAdjustments = () => {
  const { settings } = useData();
  const { user } = useAuth();
  const currency = settings.currency || "Rs.";
  const canRecord = ['Super Admin', 'Admin', 'Manager', 'Kitchen Manager', 'Store Manager'].includes(user?.role ?? '');

  const [list, setList] = useState<MergedRow[]>([]);
  const [ingredients, setIngredients] = useState<IngredientRecord[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseRecord[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [mode, setMode] = useState<RecordMode>("waste");
  const [showDetail, setShowDetail] = useState<MergedRow | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reportView, setReportView] = useState<"daily" | "weekly" | "monthly">("daily");
  const [reasonOpen, setReasonOpen] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const whParam = selectedWarehouseId !== "all" ? selectedWarehouseId : undefined;
      const [wasteRes, adjRes, ings, whs] = await Promise.all([
        stockService.getWasteRecords({ warehouseId: whParam, limit: 200 }),
        stockService.getAdjustments({ warehouseId: whParam, limit: 200 }),
        inventoryService.getIngredients(),
        warehouseService.getAll(),
      ]);

      const wasteRows: MergedRow[] = wasteRes.data.map((w) => ({
        id: `waste-${w.id}`,
        kind: "waste" as const,
        date: w.date,
        itemName: w.itemName || "",
        unit: w.unit,
        quantity: w.quantity,
        reason: w.reason,
        cost: w.cost,
        recordedByName: w.recordedBy,
        orderId: w.orderId,
        waste: w,
      }));

      const correctionRows: MergedRow[] = adjRes.data
        .filter((a) => a.type === "correction")
        .map((a) => ({
          id: `correction-${a.id}`,
          kind: "correction" as const,
          date: a.date,
          itemName: a.ingredient?.name || "",
          unit: a.ingredient?.unit?.symbol || a.ingredient?.unit?.name || null,
          quantity: a.quantity,
          reason: a.reason,
          cost: null,
          recordedByName: a.adjustedBy?.name || null,
          orderId: null,
          adjustment: a,
        }));

      const merged = [...wasteRows, ...correctionRows].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      setList(merged);
      setIngredients(ings);
      setWarehouses(whs);
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to load stock adjustments");
    } finally {
      setLoading(false);
    }
  }, [selectedWarehouseId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const wasteRows = useMemo(() => list.filter((r) => r.kind === "waste"), [list]);

  const filtered = useMemo(() => {
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter((r) => r.itemName.toLowerCase().includes(q));
  }, [list, search]);

  const paged = paginate(filtered, page);

  // Parse penalty info from auto-generated reason strings (waste rows only)
  function parsePenaltyInfo(reason: string | null): { hasPenalty: boolean; fullPenalty: boolean; penaltyAmt: string; person: string; totalCost: string; netLoss: string; noCostData?: boolean } | null {
    if (!reason) return null;
    const fullMatch = reason.match(/Full cost penalty of Rs\. ([\d.]+) charged to (.+?)\. Total cost: Rs\. ([\d.]+)\. Net loss/);
    if (fullMatch) return { hasPenalty: true, fullPenalty: true, penaltyAmt: fullMatch[1], person: fullMatch[2], totalCost: fullMatch[3], netLoss: '0' };
    const partialMatch = reason.match(/Partial penalty of Rs\. ([\d.]+) charged to (.+?)\. Total cost: Rs\. ([\d.]+)\. Net loss: Rs\. ([\d.]+)/);
    if (partialMatch) return { hasPenalty: true, fullPenalty: false, penaltyAmt: partialMatch[1], person: partialMatch[2], totalCost: partialMatch[3], netLoss: partialMatch[4] };
    const penaltyOnlyMatch = reason.match(/Penalty of Rs\. ([\d.]+) charged to (.+?)\. \(Recipe cost/);
    if (penaltyOnlyMatch) return { hasPenalty: true, fullPenalty: false, penaltyAmt: penaltyOnlyMatch[1], person: penaltyOnlyMatch[2], totalCost: '—', netLoss: '—', noCostData: true };
    return null;
  }

  const selectedIng = ingredients.find((i) => i.id === form.ingredientId);
  const estimatedCost = selectedIng ? form.quantity * Number(selectedIng.purchasePrice || 0) : form.cost;

  const todayStr = new Date().toISOString().slice(0, 10);
  const today = new Date();
  const totalLoss = wasteRows.reduce((s, w) => s + Number(w.cost || 0), 0);
  const todayLoss = wasteRows.filter((w) => w.date.slice(0, 10) === todayStr).reduce((s, w) => s + Number(w.cost || 0), 0);

  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const weekStartStr = startOfWeek.toISOString().slice(0, 10);
  const weeklyLoss = wasteRows.filter((w) => w.date.slice(0, 10) >= weekStartStr).reduce((s, w) => s + Number(w.cost || 0), 0);

  const monthStr = todayStr.slice(0, 7);
  const monthlyLoss = wasteRows.filter((w) => w.date.startsWith(monthStr)).reduce((s, w) => s + Number(w.cost || 0), 0);

  const reportList = reportView === "daily"
    ? wasteRows.filter((w) => w.date.slice(0, 10) === todayStr)
    : reportView === "weekly"
      ? wasteRows.filter((w) => w.date.slice(0, 10) >= weekStartStr)
      : wasteRows.filter((w) => w.date.startsWith(monthStr));

  const reasonMap = new Map<string, { count: number; loss: number }>();
  reportList.forEach((w) => {
    const r = w.reason || "Unknown";
    const existing = reasonMap.get(r) || { count: 0, loss: 0 };
    existing.count += 1;
    existing.loss += Number(w.cost || 0);
    reasonMap.set(r, existing);
  });
  const reasonBreakdown = Array.from(reasonMap.entries()).sort((a, b) => b[1].loss - a[1].loss);

  const resetForm = () => setForm(emptyForm);

  const openAdd = () => {
    resetForm();
    setMode("waste");
    setShowAdd(true);
  };

  const switchMode = (next: RecordMode) => {
    resetForm();
    setMode(next);
  };

  const validateAndBuildPayload = ():
    | { kind: "waste"; payload: Parameters<typeof stockService.createWasteRecord>[0] }
    | { kind: "correction"; payload: Parameters<typeof stockService.createAdjustment>[0] }
    | null => {
    if (mode === "waste") {
      const name = form.ingredientId ? (selectedIng?.name || "") : form.itemName.trim();
      if (!name) { toast.error("Select ingredient or enter item name"); return null; }
      if (form.quantity <= 0) { toast.error("Enter quantity"); return null; }
      if (!form.reason) { toast.error("Select a waste reason"); return null; }
      if (form.ingredientId && !form.warehouseId) { toast.error("Select target warehouse for stock deduction"); return null; }
      return {
        kind: "waste",
        payload: {
          itemName: name,
          quantity: form.quantity,
          unit: form.ingredientId ? (selectedIng?.unit?.name || form.unit) : form.unit,
          reason: form.reason,
          cost: form.ingredientId ? estimatedCost : (form.cost || undefined),
          ingredientId: form.ingredientId || undefined,
          warehouseId: form.warehouseId || undefined,
        },
      };
    }
    if (!form.ingredientId) { toast.error("Select an ingredient"); return null; }
    if (form.quantity <= 0) { toast.error("Enter quantity"); return null; }
    if (!form.warehouseId) { toast.error("Select target warehouse"); return null; }
    return {
      kind: "correction",
      payload: {
        ingredientId: form.ingredientId,
        type: "correction",
        quantity: form.quantity,
        reason: form.reason || undefined,
        warehouseId: form.warehouseId,
      },
    };
  };

  const handleSave = async () => {
    const result = validateAndBuildPayload();
    if (!result) return;
    setSaving(true);
    try {
      if (result.kind === "waste") {
        await stockService.createWasteRecord(result.payload);
        toast.success(form.ingredientId ? "Waste recorded — stock deducted" : "Waste recorded");
      } else {
        await stockService.createAdjustment(result.payload);
        toast.success("Correction recorded");
      }
      resetForm();
      setShowAdd(false);
      fetchData();
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to save record");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      <Skeleton className="h-10 w-full rounded-lg" />
      {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg mt-2" />)}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Trash2 className="h-5 w-5" />}
        title="Stock Adjustments"
        subtitle="Track waste, damage & stock corrections"
        actions={canRecord ? (
          <Button className="gradient-primary text-primary-foreground" onClick={() => { if (showAdd) { setShowAdd(false); } else { openAdd(); } }}>
            {showAdd ? <><X className="h-4 w-4 mr-2" />Close Form</> : <><Plus className="h-4 w-4 mr-2" />Record</>}
          </Button>
        ) : undefined}
      />

      {/* KPI Cards — waste-cost only */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm border-destructive/20"><CardContent className="p-5"><div className="flex items-center gap-4"><div className="h-11 w-11 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0"><Trash2 className="h-5 w-5 text-destructive" /></div><div className="min-w-0"><p className="text-xs text-muted-foreground">Total Waste Loss</p><p className="text-2xl font-bold tracking-tight text-destructive">{currency} {totalLoss.toLocaleString()}</p></div></div></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-5"><div className="flex items-center gap-4"><div className="h-11 w-11 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0"><CalendarDays className="h-5 w-5 text-orange-500" /></div><div className="min-w-0"><p className="text-xs text-muted-foreground">Today's Loss</p><p className="text-2xl font-bold tracking-tight text-orange-500">{currency} {todayLoss.toLocaleString()}</p></div></div></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-5"><div className="flex items-center gap-4"><div className="h-11 w-11 rounded-xl bg-warning/10 flex items-center justify-center shrink-0"><TrendingDown className="h-5 w-5 text-warning" /></div><div className="min-w-0"><p className="text-xs text-muted-foreground">This Week</p><p className="text-2xl font-bold tracking-tight text-warning">{currency} {weeklyLoss.toLocaleString()}</p></div></div></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-5"><div className="flex items-center gap-4"><div className="h-11 w-11 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0"><BarChart3 className="h-5 w-5 text-purple-500" /></div><div className="min-w-0"><p className="text-xs text-muted-foreground">This Month</p><p className="text-2xl font-bold tracking-tight text-purple-500">{currency} {monthlyLoss.toLocaleString()}</p></div></div></CardContent></Card>
      </div>

      {/* Breakdown Report — waste rows only */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-base">Waste Breakdown by Reason</CardTitle>
            <div className="flex gap-2">{(["daily", "weekly", "monthly"] as const).map((v) => (
              <Button key={v} size="sm" variant={reportView === v ? "default" : "outline"} onClick={() => setReportView(v)} className="capitalize">{v}</Button>
            ))}</div>
          </div>
        </CardHeader>
        <CardContent>
          {reasonBreakdown.length === 0 ? (
            <p className="text-center text-muted-foreground py-6 text-sm">No waste records for this period</p>
          ) : (
            <div className="space-y-2">
              {reasonBreakdown.map(([reason, data]) => (
                <div key={reason} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                  <div className="flex items-center gap-2"><span className="font-medium">{reason}</span><Badge variant="secondary" className="text-[10px]">{data.count}</Badge></div>
                  <span className="text-destructive font-semibold">{currency} {data.loss.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Inline Record Form — Waste / Correction mode toggle */}
      {showAdd && canRecord && (
        <Card className="shadow-sm border-primary/30 bg-primary/[0.02]">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Record Stock Adjustment</Label>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowAdd(false)}><ChevronUp className="h-4 w-4" /></Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-1.5">
              <Button
                type="button"
                variant={mode === "waste" ? "default" : "outline"}
                size="sm"
                onClick={() => switchMode("waste")}
                className={cn("h-9", mode === "waste" ? "bg-destructive hover:bg-destructive/90 text-white" : "")}
              >
                Waste
              </Button>
              <Button
                type="button"
                variant={mode === "correction" ? "default" : "outline"}
                size="sm"
                onClick={() => switchMode("correction")}
                className={cn("h-9", mode === "correction" ? "bg-blue-600 hover:bg-blue-700 text-white" : "")}
              >
                Correction
              </Button>
            </div>

            {mode === "waste" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Ingredient (Optional — select to auto-deduct stock)</Label>
                  <Select value={form.ingredientId} onValueChange={(v) => setForm((p) => ({ ...p, ingredientId: v === "__none__" ? "" : v, itemName: "" }))}>
                    <SelectTrigger><SelectValue placeholder="Select ingredient (optional)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— None (custom item) —</SelectItem>
                      {ingredients.map((ig) => <SelectItem key={ig.id} value={ig.id}>{ig.name} (Stock: {Number(ig.currentStock)} {ig.unit?.name || ""})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {!form.ingredientId && (
                  <div className="space-y-1.5">
                    <Label>Item Name</Label>
                    <Input list="stock-adj-item-name-list" placeholder="e.g. Chicken Tikka Pizza" value={form.itemName} onChange={(e) => setForm((p) => ({ ...p, itemName: e.target.value }))} />
                    <datalist id="stock-adj-item-name-list">
                      {[...new Set([...wasteRows.map((w) => w.itemName).filter(Boolean), ...ingredients.map((ig) => ig.name)])].map((name) => <option key={name} value={name} />)}
                    </datalist>
                  </div>
                )}

                <div className="space-y-1.5"><Label>Quantity{selectedIng ? ` (${selectedIng.unit?.name || ""})` : ""}</Label><Input type="number" value={form.quantity || ""} onChange={(e) => setForm((p) => ({ ...p, quantity: Number(e.target.value) }))} /></div>

                {!form.ingredientId && (
                  <div className="space-y-1.5"><Label>Unit</Label><Input placeholder="kg, piece..." value={form.unit} onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))} /></div>
                )}

                {!form.ingredientId && (
                  <div className="space-y-1.5"><Label>Cost / Loss ({currency})</Label><Input type="number" placeholder="Enter loss value" value={form.cost || ""} onChange={(e) => setForm((p) => ({ ...p, cost: Number(e.target.value) }))} /></div>
                )}

                <div className="space-y-1.5">
                  <Label>Reason</Label>
                  <Select value={form.reason} onValueChange={(v) => setForm((p) => ({ ...p, reason: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                    <SelectContent>{WASTE_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                </div>

                {form.ingredientId && (
                  <div className="space-y-1.5">
                    <Label>Deduct From Warehouse *</Label>
                    <Select value={form.warehouseId} onValueChange={(v) => setForm((p) => ({ ...p, warehouseId: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                      <SelectContent>
                        {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name} ({w.type})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label>Ingredient *</Label>
                  <Select value={form.ingredientId || "__none__"} onValueChange={(v) => setForm((p) => ({ ...p, ingredientId: v === "__none__" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select Ingredient" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Select ingredient</SelectItem>
                      {ingredients.map((ig) => (
                        <SelectItem key={ig.id} value={ig.id}>{ig.name} (Stock: {Number(ig.currentStock)} {ig.unit?.name || ""})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Quantity{selectedIng ? ` (${selectedIng.unit?.name || ""})` : ""} *</Label>
                  <Input type="number" min={1} value={form.quantity || ""} onChange={(e) => setForm((p) => ({ ...p, quantity: Number(e.target.value) }))} />
                </div>

                <div className="space-y-1.5">
                  <Label>Reason</Label>
                  <Popover open={reasonOpen} onOpenChange={setReasonOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" aria-expanded={reasonOpen} className="w-full justify-between font-normal whitespace-nowrap text-left overflow-hidden">
                        <span className={cn("truncate", form.reason ? "" : "text-muted-foreground")}>{form.reason || "Select reason..."}</span>
                        <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search or type..." value={form.reason} onValueChange={(v) => setForm((p) => ({ ...p, reason: v }))} />
                        <CommandList>
                          <CommandEmpty>
                            <button type="button" className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent rounded cursor-pointer" onClick={() => setReasonOpen(false)}>
                              Use: "{form.reason}"
                            </button>
                          </CommandEmpty>
                          <CommandGroup heading="Common reasons">
                            {CORRECTION_REASONS.map((reason) => (
                              <CommandItem key={reason} value={reason} onSelect={() => { setForm((p) => ({ ...p, reason })); setReasonOpen(false); }}>
                                <Check className={cn("mr-2 h-4 w-4", form.reason === reason ? "opacity-100" : "opacity-0")} />
                                {reason}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-1.5">
                  <Label>Warehouse *</Label>
                  <Select value={form.warehouseId} onValueChange={(v) => setForm((p) => ({ ...p, warehouseId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                    <SelectContent>
                      {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name} ({w.type})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {mode === "waste" && selectedIng && form.quantity > 0 && (
              <p className="text-sm text-muted-foreground">Estimated Loss: <strong className="text-destructive">{currency} {estimatedCost.toLocaleString()}</strong></p>
            )}

            {mode === "waste" && (
              <div className="space-y-1.5"><Label>Notes</Label><Textarea placeholder="Additional notes" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} /></div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => { resetForm(); setShowAdd(false); }}>Cancel</Button>
              <Button className="gradient-primary text-primary-foreground" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Records Table — waste ∪ correction, merged & sorted */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="relative max-w-sm w-full">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search..." className="pl-9" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">Warehouse:</span>
              <Select value={selectedWarehouseId} onValueChange={(v) => { setSelectedWarehouseId(v); setPage(1); }}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder="All Warehouses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Warehouses</SelectItem>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-12"><Trash2 className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" /><p className="text-muted-foreground">No records found</p><p className="text-xs text-muted-foreground mt-1.5">Record waste or a stock correction to get started.</p></div>
          ) : (
            <>
              <div className="rounded-lg border overflow-auto max-h-[calc(100vh-400px)]">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead>SN</TableHead><TableHead>Date</TableHead><TableHead>Item</TableHead><TableHead>Source</TableHead>
                      <TableHead>Qty</TableHead><TableHead>Unit</TableHead><TableHead>Reason</TableHead>
                      <TableHead>Cost / Net Loss</TableHead><TableHead>Recorded By</TableHead><TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.map((r, i) => (
                      <TableRow key={r.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell>{(page - 1) * 10 + i + 1}</TableCell>
                        <TableCell>{r.date.slice(0, 10)}</TableCell>
                        <TableCell className="font-medium">{r.itemName || "—"}</TableCell>
                        <TableCell>
                          {r.kind === "correction"
                            ? <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-[10px]">Correction</Badge>
                            : r.orderId
                              ? <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-[10px]"><ShoppingBag className="h-3 w-3 mr-1" />Order Cancel</Badge>
                              : <Badge variant="secondary" className="text-[10px]">Manual</Badge>
                          }
                        </TableCell>
                        <TableCell className={r.kind === "correction" ? "text-blue-600 dark:text-blue-400 font-medium" : ""}>
                          {r.kind === "correction" ? "+" : ""}{r.quantity ?? "—"}
                        </TableCell>
                        <TableCell>{r.unit || "—"}</TableCell>
                        <TableCell className="max-w-[200px]">
                          <span className="truncate block text-xs text-muted-foreground" title={r.reason ?? ""}>
                            {r.kind === "waste" && r.orderId ? "Order cancelled after preparation" : (r.reason || "—")}
                          </span>
                        </TableCell>
                        <TableCell className={r.kind === "correction" ? "text-muted-foreground" : "text-destructive font-medium"}>
                          {r.kind === "correction" ? "—" : (r.cost != null ? `${currency} ${Number(r.cost).toLocaleString()}` : "—")}
                        </TableCell>
                        <TableCell>{r.recordedByName || "—"}</TableCell>
                        <TableCell><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowDetail(r)}><Eye className="h-3 w-3" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <TablePagination currentPage={page} totalItems={filtered.length} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog — adapts by row kind */}
      <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {showDetail?.kind === "correction" ? <Trash2 className="h-5 w-5 text-blue-600" /> : <Trash2 className="h-5 w-5 text-destructive" />}
              <span>{showDetail?.kind === "correction" ? "Stock Correction" : "Waste Record"}</span>
              {showDetail?.kind === "correction" && <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">Correction</Badge>}
              {showDetail?.kind === "waste" && (
                showDetail.orderId
                  ? <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"><ShoppingBag className="h-3 w-3 mr-1" />Order Cancellation</Badge>
                  : <Badge variant="secondary">Manual Entry</Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {showDetail?.kind === "waste" && showDetail.waste && (() => {
            const w = showDetail.waste;
            const penalty = parsePenaltyInfo(w.reason);
            return (
              <div className="space-y-4">
                <Card className="shadow-sm">
                  <CardHeader className="pb-2"><Label className="text-xs text-muted-foreground uppercase tracking-wider">Recorded By</Label></CardHeader>
                  <CardContent className="space-y-1">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{w.recordedBy || "—"}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Date: {new Date(w.date).toLocaleString()}</div>
                  </CardContent>
                </Card>

                <div className="rounded-lg border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead>Item</TableHead><TableHead>Unit</TableHead>
                        <TableHead className="text-right">Quantity</TableHead><TableHead className="text-right">Net Cost / Loss</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">{w.itemName || "—"}</TableCell>
                        <TableCell className="text-sm">{w.unit || "—"}</TableCell>
                        <TableCell className="text-right text-lg font-bold text-destructive">-{w.quantity ?? 0}</TableCell>
                        <TableCell className="text-right font-semibold text-destructive">{w.cost != null ? `${currency} ${Number(w.cost).toLocaleString()}` : "—"}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                {penalty?.hasPenalty && (
                  <Card className={penalty.fullPenalty ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/20" : "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/20"}>
                    <CardHeader className="pb-2">
                      <CardTitle className={`text-sm flex items-center gap-2 ${penalty.fullPenalty ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
                        <AlertCircle className="h-4 w-4" />
                        {penalty.noCostData
                          ? 'Penalty Charged — Recipe Cost Not Available'
                          : penalty.fullPenalty
                            ? 'Full Penalty Applied — Loss Fully Recovered'
                            : 'Partial Penalty Applied — Reduced Net Loss'}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div><p className="text-xs text-muted-foreground">Responsible Staff</p><p className="font-semibold">{penalty.person}</p></div>
                        <div><p className="text-xs text-muted-foreground">Penalty Charged</p><p className="font-semibold text-emerald-600 dark:text-emerald-400">{currency} {penalty.penaltyAmt}</p></div>
                        {!penalty.noCostData && (
                          <>
                            <div><p className="text-xs text-muted-foreground">Total Preparation Cost</p><p className="font-medium">{currency} {penalty.totalCost}</p></div>
                            <div>
                              <p className="text-xs text-muted-foreground">Net Business Loss</p>
                              <p className={`font-bold ${penalty.netLoss === '0' || Number(penalty.netLoss) === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>{currency} {penalty.netLoss}</p>
                            </div>
                          </>
                        )}
                        {penalty.noCostData && (
                          <div className="col-span-2 text-xs text-muted-foreground italic">
                            Recipe ingredients or prices are not configured for this item. Set purchase prices on ingredients to see full cost breakdown.
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {!penalty?.hasPenalty && w.reason && (
                  <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Reason: </span>{w.reason}
                  </div>
                )}
              </div>
            );
          })()}

          {showDetail?.kind === "correction" && showDetail.adjustment && (() => {
            const a = showDetail.adjustment;
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Card className="shadow-sm">
                    <CardHeader className="pb-2"><Label className="text-xs text-muted-foreground uppercase tracking-wider">Adjusted By</Label></CardHeader>
                    <CardContent className="space-y-1">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{a.adjustedBy?.name ?? "—"}</span>
                        {a.adjustedBy?.role && <Badge variant="secondary" className="text-xs">{a.adjustedBy.role}</Badge>}
                      </div>
                      {a.adjustedBy?.outlet && (
                        <div className="text-xs text-muted-foreground">Outlet: <span className="font-medium text-foreground">{a.adjustedBy.outlet.name}</span></div>
                      )}
                      {a.adjustedBy?.phone && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Phone className="h-3 w-3" />{a.adjustedBy.phone}</div>
                      )}
                      <div className="text-xs text-muted-foreground mt-1">Date: {new Date(a.date).toLocaleString()}</div>
                    </CardContent>
                  </Card>
                  <Card className="shadow-sm">
                    <CardHeader className="pb-2"><Label className="text-xs text-muted-foreground uppercase tracking-wider">Warehouse</Label></CardHeader>
                    <CardContent className="space-y-1">
                      <div className="font-medium">{a.warehouse?.name ?? "—"}</div>
                      {a.warehouse?.type && <Badge variant="secondary" className="text-xs">{a.warehouse.type}</Badge>}
                    </CardContent>
                  </Card>
                </div>

                <div className="rounded-lg border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead>Ingredient</TableHead><TableHead>Category</TableHead><TableHead>Unit</TableHead>
                        <TableHead>Type</TableHead><TableHead className="text-right">Quantity</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">{a.ingredient?.name ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{a.ingredient?.category?.name ?? "—"}</TableCell>
                        <TableCell className="text-sm">{a.ingredient?.unit?.symbol || a.ingredient?.unit?.name || "—"}</TableCell>
                        <TableCell><Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">Correction</Badge></TableCell>
                        <TableCell className="text-right text-lg font-bold text-blue-600 dark:text-blue-400">+{a.quantity} {a.ingredient?.unit?.symbol || a.ingredient?.unit?.name || ""}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                {a.reason && (
                  <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Reason: </span>{a.reason}
                  </div>
                )}
              </div>
            );
          })()}

          <DialogFooter><Button variant="outline" onClick={() => setShowDetail(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StockAdjustments;
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p .` (from `Ovenisto_Frontend_Software/`)
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint` (from `Ovenisto_Frontend_Software/`)
Expected: no new errors/warnings in `src/pages/stock/StockAdjustments.tsx`.

- [ ] **Step 4: Manual browser verification**

Start both servers (`preview_start` for "Ovenisto Frontend Software" and "Ovenisto Backend", or `npm run dev` in each folder). Log in as `admin@ovenisto.com` / `password123`. Navigate to `/stock/adjustments` and confirm:
1. Page title reads "Stock Adjustments"; 4 KPI cards and the "Waste Breakdown by Reason" card render without errors.
2. Click "+ Record" — the inline form opens with a "Waste" / "Correction" toggle, defaulting to "Waste".
3. In Waste mode: pick an ingredient, confirm the warehouse selector appears, fill quantity + reason, save — a toast confirms, the form closes, and a new row appears in the table with a "Manual" badge, `-qty`, and a cost value.
4. Reopen the form, switch to Correction mode: confirm the field set changes (ingredient, quantity, reason combobox, warehouse — no cost field). Fill all fields, save — a new row appears with a "Correction" badge, `+qty`, and "—" in Cost / Net Loss.
5. Click the eye icon on the new Waste row — the detail dialog shows the Recorded By card and item table. Click it on the new Correction row — the detail dialog shows Adjusted By + Warehouse cards and a `+qty` row instead.
6. Type in the search box and confirm both row kinds filter correctly by item/ingredient name.
7. Check browser console (`preview_console_logs`, level `error`) — no errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/stock/StockAdjustments.tsx
git commit -m "feat: merge Waste into Stock Adjustments page with a Correction mode"
```

---

### Task 2: Remove the standalone Waste page and its route/nav/permission wiring

**Files:**
- Delete: `Ovenisto_Frontend_Software/src/pages/Waste.tsx`
- Modify: `Ovenisto_Frontend_Software/src/App.tsx:50` (remove import), `App.tsx:172` (remove route)
- Modify: `Ovenisto_Frontend_Software/src/components/layout/AppSidebar.tsx:6` (remove unused `Trash2` import), `AppSidebar.tsx:83` (remove nav item)
- Modify: `Ovenisto_Frontend_Software/src/contexts/AuthContext.tsx:13` (Manager), `AuthContext.tsx:27` (Store Manager) — remove `"waste"` permission key

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this task only removes dead code left over once Task 1's merged page covers everything Waste.tsx did.

- [ ] **Step 1: Delete the old Waste page**

Delete the file `Ovenisto_Frontend_Software/src/pages/Waste.tsx` (its logic is now in `pages/stock/StockAdjustments.tsx` from Task 1).

- [ ] **Step 2: Remove the Waste import and route from App.tsx**

In `Ovenisto_Frontend_Software/src/App.tsx`, remove this line (currently line 50, among the other `lazy()` page imports):

```tsx
const Waste = lazy(() => import("./pages/Waste"));
```

And remove this line (currently line 172, among the other `<Route>` entries):

```tsx
<Route path="/waste" element={<ProtectedRoute module="waste"><AppLayout><Waste /></AppLayout></ProtectedRoute>} />
```

- [ ] **Step 3: Remove the Waste nav item from AppSidebar.tsx**

In `Ovenisto_Frontend_Software/src/components/layout/AppSidebar.tsx`, the icon import list currently reads:

```tsx
import {
  Home, BarChart3, ShoppingCart, ChefHat, UtensilsCrossed, Store, Settings, Globe, CalendarDays,
  Pizza, Factory, Package, DollarSign, ShoppingBag, CreditCard, ArrowLeftRight,
  Trash2, Users, Clock, FileText, MessageSquare, ChevronDown, ChevronRight, Flame, LogOut, Link2,
  Bike, CalendarCheck, LayoutGrid, ClipboardList, CalendarOff, UserCircle, IdCard, Coins, Ban
} from "lucide-react";
```

Remove `Trash2,` (it becomes unused once the nav item below is removed — nothing else in this file references it):

```tsx
import {
  Home, BarChart3, ShoppingCart, ChefHat, UtensilsCrossed, Store, Settings, Globe, CalendarDays,
  Pizza, Factory, Package, DollarSign, ShoppingBag, CreditCard, ArrowLeftRight,
  Users, Clock, FileText, MessageSquare, ChevronDown, ChevronRight, Flame, LogOut, Link2,
  Bike, CalendarCheck, LayoutGrid, ClipboardList, CalendarOff, UserCircle, IdCard, Coins, Ban
} from "lucide-react";
```

Then in the nav config, the "Transfer / Damage" group currently reads:

```tsx
  { label: "Transfer / Damage", items: [
    { title: "Transfers", url: "/transfers", icon: ArrowLeftRight, module: "transfers" },
    { title: "Demand Lists", url: "/demands", icon: ClipboardList, module: "demands" },
    { title: "Waste", url: "/waste", icon: Trash2, module: "waste" },
  ]},
```

Remove the "Waste" entry:

```tsx
  { label: "Transfer / Damage", items: [
    { title: "Transfers", url: "/transfers", icon: ArrowLeftRight, module: "transfers" },
    { title: "Demand Lists", url: "/demands", icon: ClipboardList, module: "demands" },
  ]},
```

- [ ] **Step 4: Remove the dead "waste" permission key from AuthContext.tsx**

In `Ovenisto_Frontend_Software/src/contexts/AuthContext.tsx`, the Manager array currently reads:

```tsx
  "Manager": [
    "dashboard", "analytics", "pos", "kitchens", "waiter", "order-status",
    "customer-display", "outlets", "items", "production", "stock", "warehouses",
    "sales", "customers", "purchases", "purchase-requests", "suppliers", "supplier-dues",
    "expenses", "transfers", "demands", "waste", "attendance", "employees", "reports", "sms",
    "settings", "my-portal", "cancellation-requests",
  ],
```

Remove `"waste", `:

```tsx
  "Manager": [
    "dashboard", "analytics", "pos", "kitchens", "waiter", "order-status",
    "customer-display", "outlets", "items", "production", "stock", "warehouses",
    "sales", "customers", "purchases", "purchase-requests", "suppliers", "supplier-dues",
    "expenses", "transfers", "demands", "attendance", "employees", "reports", "sms",
    "settings", "my-portal", "cancellation-requests",
  ],
```

The Store Manager array currently reads:

```tsx
  "Store Manager": [
    "items", "stock", "warehouses", "production", "purchases", "suppliers",
    "transfers", "demands", "waste", "employees", "my-portal",
  ],
```

Remove `"waste", `:

```tsx
  "Store Manager": [
    "items", "stock", "warehouses", "production", "purchases", "suppliers",
    "transfers", "demands", "employees", "my-portal",
  ],
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p .` (from `Ovenisto_Frontend_Software/`)
Expected: no errors (confirms nothing else imports `pages/Waste.tsx` or references the removed `Trash2` import).

- [ ] **Step 6: Lint**

Run: `npm run lint` (from `Ovenisto_Frontend_Software/`)
Expected: no new errors/warnings.

- [ ] **Step 7: Manual browser verification**

With both servers running and logged in as `admin@ovenisto.com` / `password123`:
1. Open the sidebar — under "Transfer / Damage" only "Transfers" and "Demand Lists" appear; "Waste" is gone.
2. Navigate directly to `/waste` in the URL bar — it no longer resolves to the old page (falls through to the catch-all/NotFound route).
3. Navigate to `/stock/adjustments` — still works exactly as verified in Task 1.
4. Check browser console (`preview_console_logs`, level `error`) — no errors.

- [ ] **Step 8: Commit**

```bash
git add -A src/pages/Waste.tsx src/App.tsx src/components/layout/AppSidebar.tsx src/contexts/AuthContext.tsx
git commit -m "chore: remove standalone Waste page, route, nav item, and dead waste permission"
```

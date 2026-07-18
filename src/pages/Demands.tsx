import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "@/services/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { demandService, type DemandRecord, type DemandStatus, type DemandItem } from "@/services/demand.service";
import { warehouseService, type WarehouseRecord, type WarehouseStockRecord } from "@/services/warehouse.service";
import { inventoryService, type IngredientRecord } from "@/services/inventory.service";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Search, Eye, CheckCircle2, XCircle, Trash2, ClipboardList, Printer, User, Phone, AlertTriangle, ChevronUp, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { useOutletFilter } from "@/hooks/useOutletFilter";
import { useModuleEvents } from "@/hooks/use-module-events";

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-blue-100 text-blue-800",
  FULFILLED: "bg-success/10 text-success",
  REJECTED: "bg-muted text-muted-foreground",
  CANCELLED: "bg-muted text-muted-foreground",
};

interface FormItem { ingredientId: string; name: string; unit: string; currentStock: number; requestedQty: number; }

const Demands = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canCreate  = ['Kitchen Manager', 'Manager', 'Admin'].includes(user?.role ?? '');
  const canApprove = ['Super Admin', 'Admin', 'Manager'].includes(user?.role ?? '');
  const { outletId } = useOutletFilter();

  // Data state
  const [warehouses, setWarehouses] = useState<WarehouseRecord[]>([]);
  const [ingredients, setIngredients] = useState<IngredientRecord[]>([]);

  // UI state
  const [saving, setSaving] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [showDetail, setShowDetail] = useState<DemandRecord | null>(null);
  const [rejectTarget, setRejectTarget] = useState<DemandRecord | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<DemandStatus | "ALL">("ALL");

  // Create form
  const [requestingWHId, setRequestingWHId] = useState("");
  const [supplyingWHId, setSupplyingWHId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<FormItem[]>([]);
  const [addIngredientId, setAddIngredientId] = useState("");
  const [warehouseStockMap, setWarehouseStockMap] = useState<Record<string, number>>({});
  const [loadingLowStock, setLoadingLowStock] = useState(false);

  // Approve form (editable approvedQty per item)
  const [approveItems, setApproveItems] = useState<{ id: string; approvedQty: number }[]>([]);
  // Supplying warehouse stock map for approval — keyed by ingredientId
  const [supplyingStockMap, setSupplyingStockMap] = useState<Record<string, number>>({});
  const [loadingSupplyStock, setLoadingSupplyStock] = useState(false);

  const { data: demands = [], isLoading: loading } = useQuery({
    queryKey: ["demands", { status: filterStatus, outletId }],
    queryFn: () => {
      api.clearCache('/demands');
      return demandService.getAll({
        ...(filterStatus !== "ALL" && { status: filterStatus }),
        outletId,
      });
    },
    // Demand push events (below) are the primary freshness mechanism, and the hook also
    // refetches on reconnect, so a dropped-and-restored socket catches up on its own.
    // This interval is the last-resort floor for a socket that NEVER connects (the client
    // is websocket-only with no HTTP fallback, and a failed auth handshake is silent).
    // Left at the react-query default of not refetching in the background, so a hidden
    // tab stops polling and Neon's compute can scale to zero.
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
  });

  // Live updates: the backend pushes demand changes to this outlet's room only.
  // Invalidate the same key the page's own mutations use, so the active filter
  // and outlet variants all refetch.
  const DEMAND_EVENTS = ["demand:created", "demand:updated"] as const;
  useModuleEvents(DEMAND_EVENTS, (payload: any) => {
    // Clear the api.ts GET cache FIRST: react-query's refetch still goes through
    // api.get, whose 30s TTL is only invalidated by THIS client's own mutations.
    // Another user's action never touches it, so without this the refetch would
    // re-serve the stale cached list and the toast would fire with no visible
    // change. Also drops /warehouses + /inventory via MUTATION_DEPENDENCIES,
    // which an approval legitimately changes (it creates a challan).
    api.clearCache('/demands');
    queryClient.invalidateQueries({ queryKey: ["demands"] });

    if (payload && payload.demandNo) {
      const demandNo = payload.demandNo;
      const status = payload.status;
      const reqName = payload.requestingWH?.name;
      const supName = payload.supplyingWH?.name;

      if (status === 'APPROVED') {
        toast.success(`Demand ${demandNo} has been approved by ${supName ?? 'supplier'}`);
      } else if (status === 'REJECTED') {
        toast.error(`Demand ${demandNo} has been rejected`);
      } else if (status === 'CANCELLED') {
        toast.warning(`Demand ${demandNo} has been cancelled`);
      } else if (status === 'FULFILLED') {
        toast.success(`Demand ${demandNo} has been fulfilled`);
      } else if (status === 'PENDING') {
        toast.info(`New Demand ${demandNo} requested by ${reqName ?? 'branch'}`);
      } else {
        toast.info(`Demand ${demandNo} updated`);
      }
    } else {
      toast.info("Demands updated");
    }
  });

  useEffect(() => {
    Promise.all([warehouseService.getAll(), inventoryService.getIngredients()])
      .then(([whList, ingList]) => {
        setWarehouses(whList);
        setIngredients(ingList);
      })
      .catch((err: unknown) => toast.error((err as Error).message || "Failed to load data"));
  }, []);

  const filtered = demands.filter(d =>
    (d.demandNo || "").toLowerCase().includes(search.toLowerCase()) ||
    (d.requestingWH?.name || "").toLowerCase().includes(search.toLowerCase()) ||
    (d.supplyingWH?.name || "").toLowerCase().includes(search.toLowerCase())
  );

  // Split for two-tab view (Manager/Admin/SA): incoming-to-review vs own requests
  const incomingDemands = filtered.filter(d => d.requestedBy?.id !== user?.id);
  const myDemands       = filtered.filter(d => d.requestedBy?.id === user?.id);

  // Per-demand approval permission: Manager can only approve KITCHEN→BRANCH, Admin/SA can approve all
  const canApproveThis = (d: DemandRecord | null): boolean => {
    if (!d || !canApprove) return false;
    // BRANCH→MAIN demands: only Super Admin can approve
    if (d.requestingWH?.type === 'BRANCH') return user?.role === 'Super Admin';
    // KITCHEN→BRANCH demands: Manager / Admin / Super Admin can approve
    return true;
  };


  // W6: Smart supplying warehouse based on requesting warehouse type
  // KITCHEN requests from → same outlet BRANCH
  // BRANCH requests from → MAIN
  const selectedReqWH = warehouses.find(w => w.id === requestingWHId);
  const supplyingOptions = useMemo(() => {
    if (!selectedReqWH) return [];
    if (selectedReqWH.type === 'KITCHEN')
      return warehouses.filter(w => w.type === 'BRANCH' && w.outletId === selectedReqWH.outletId);
    if (selectedReqWH.type === 'BRANCH')
      return warehouses.filter(w => w.type === 'MAIN');
    return [];
  }, [warehouses, selectedReqWH]);

  // Role-based requesting warehouse options
  const requestingOptions = useMemo(() => {
    const role = user?.role;
    if (role === 'Super Admin') {
      return warehouses.filter(w => w.type === 'KITCHEN' || w.type === 'BRANCH');
    }
    if (role === 'Kitchen Manager' && user?.outletId) {
      return warehouses.filter(w => w.type === 'KITCHEN' && w.outletId === user.outletId);
    }
    // Local Admin (Branch Admin) / local Manager (Branch Manager) scoped to their outlet
    if (user?.outletId) {
      return warehouses.filter(w => w.type === 'BRANCH' && w.outletId === user.outletId);
    }
    return [];
  }, [warehouses, user?.role, user?.outletId]);

  const handleReqWHChange = (v: string) => {
    setRequestingWHId(v === "__none__" ? "" : v);
    setSupplyingWHId("");
    setItems([]);
    setAddIngredientId("");
    setWarehouseStockMap({});
  };

  // Auto-select supplying WH when there's only one option
  useEffect(() => {
    if (supplyingOptions.length === 1) setSupplyingWHId(supplyingOptions[0].id);
  }, [supplyingOptions]);

  // Fetch warehouse stock map when requesting WH changes
  useEffect(() => {
    if (!requestingWHId) { setWarehouseStockMap({}); return; }
    warehouseService.getStock(requestingWHId).then((stockData: WarehouseStockRecord[]) => {
      const map: Record<string, number> = {};
      for (const s of stockData) map[s.ingredient.id] = Number(s.currentStock);
      setWarehouseStockMap(map);
    }).catch(() => setWarehouseStockMap({}));
  }, [requestingWHId]);

  const getWarehouseStock = useCallback((ingredientId: string) => {
    return warehouseStockMap[ingredientId] ?? 0;
  }, [warehouseStockMap]);

  const openAdd = () => {
    // Auto-select requesting WH if KM has only one kitchen in their outlet
    const autoWH = requestingOptions.length === 1 ? requestingOptions[0].id : "";
    setRequestingWHId(autoWH);
    setSupplyingWHId("");
    setNotes("");
    setItems([]);
    setAddIngredientId("");
    setWarehouseStockMap({});
    setShowDialog(true);
  };

  const openDetail = (d: DemandRecord) => {
    if (canApproveThis(d) && d.status === 'PENDING') {
      // Fetch supplying warehouse stock so approver can see available qty
      setLoadingSupplyStock(true);
      setSupplyingStockMap({});
      warehouseService.getStock(d.supplyingWH?.id ?? '').then((stockData: WarehouseStockRecord[]) => {
        const map: Record<string, number> = {};
        for (const s of stockData) map[s.ingredient.id] = Number(s.currentStock);
        setSupplyingStockMap(map);
        // Default approved qty to min(requestedQty, available stock)
        setApproveItems(d.items.map(i => {
          const available = map[i.ingredientId] ?? 0;
          return { id: i.id, approvedQty: Math.min(i.requestedQty, available) };
        }));
      }).catch(() => {
        setSupplyingStockMap({});
        setApproveItems(d.items.map(i => ({ id: i.id, approvedQty: i.requestedQty })));
      }).finally(() => setLoadingSupplyStock(false));
    }
    setShowDetail(d);
  };

  const addItem = useCallback(() => {
    if (!addIngredientId) return;
    if (items.some(i => i.ingredientId === addIngredientId)) {
      toast.error("Ingredient already added"); return;
    }
    const ing = ingredients.find(i => i.id === addIngredientId);
    if (!ing) return;
    setItems(prev => [...prev, {
      ingredientId: ing.id,
      name: ing.name,
      unit: ing.unit?.name ?? "",
      currentStock: getWarehouseStock(ing.id),
      requestedQty: 1,
    }]);
    setAddIngredientId("");
  }, [addIngredientId, items, ingredients, getWarehouseStock]);

  const addLowStockItems = useCallback(async () => {
    if (!requestingWHId) { toast.error("Select a requesting warehouse first"); return; }
    setLoadingLowStock(true);
    try {
      const stockData = await warehouseService.getStock(requestingWHId, { lowStockOnly: true });
      let added = 0;
      const newItems = [...items];
      for (const s of stockData) {
        if (newItems.some(i => i.ingredientId === s.ingredient.id)) continue;
        const lowLevel = Number(s.lowStockLevel);
        const current = Number(s.currentStock);
        const qty = Math.max(1, Math.round(lowLevel - current));
        newItems.push({
          ingredientId: s.ingredient.id,
          name: s.ingredient.name,
          unit: s.ingredient.unit?.symbol || s.ingredient.unit?.name || "",
          currentStock: current,
          requestedQty: qty,
        });
        added++;
      }
      setItems(newItems);
      toast.success(`${added} low stock item${added !== 1 ? "s" : ""} added`);
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to load low stock");
    } finally {
      setLoadingLowStock(false);
    }
  }, [requestingWHId, items]);

  const handleCreate = async () => {
    if (!requestingWHId) { toast.error("Requesting warehouse is required"); return; }
    if (!supplyingWHId) { toast.error("Supplying warehouse is required"); return; }
    if (requestingWHId === supplyingWHId) { toast.error("Warehouses must be different"); return; }
    if (items.length === 0) { toast.error("Add at least one item"); return; }
    if (items.some(i => i.requestedQty <= 0)) { toast.error("All quantities must be greater than 0"); return; }

    setSaving(true);
    try {
      await demandService.create({
        requestingWHId,
        supplyingWHId,
        notes: notes || undefined,
        items: items.filter(i => i.ingredientId && i.requestedQty > 0).map(i => ({
          ingredientId: i.ingredientId,
          requestedQty: i.requestedQty,
        })),
      });
      toast.success("Demand created");
      setShowDialog(false);
      queryClient.invalidateQueries({ queryKey: ["demands"] });
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to create demand");
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!showDetail) return;
    setSaving(true);
    try {
      const result = await demandService.approve(showDetail.id, { items: approveItems });
      const challanNo = (result as any).challanNo;
      toast.success(`Demand approved${challanNo ? ` — Challan ${challanNo} created` : ""}`);
      setShowDetail(null);
      queryClient.invalidateQueries({ queryKey: ["demands"] });
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to approve demand");
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setSaving(true);
    try {
      await demandService.reject(rejectTarget.id, rejectReason || undefined);
      toast.success("Demand rejected");
      setRejectTarget(null);
      setRejectReason("");
      queryClient.invalidateQueries({ queryKey: ["demands"] });
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to reject demand");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelId) return;
    setSaving(true);
    try {
      await demandService.cancel(cancelId);
      toast.success("Demand cancelled");
      setCancelId(null);
      queryClient.invalidateQueries({ queryKey: ["demands"] });
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to cancel demand");
    } finally {
      setSaving(false);
    }
  };


  function DemandTable({ list, showCreateButton = true }: { list: DemandRecord[]; showCreateButton?: boolean }) {
    if (list.length === 0) return (
      <div className="text-center py-12">
        <ClipboardList className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" />
        <p className="text-muted-foreground">No demands found</p>
        {canCreate && showCreateButton && <Button size="sm" className="gradient-primary text-primary-foreground mt-3" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Create Demand</Button>}
      </div>
    );
    return (
      <div className="rounded-lg border overflow-auto max-h-[calc(100vh-350px)]">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead>SN</TableHead><TableHead>Demand No</TableHead><TableHead>Date</TableHead>
              <TableHead>Requested By</TableHead><TableHead>Requesting WH</TableHead>
              <TableHead>Supplying WH</TableHead><TableHead className="text-center">Items</TableHead>
              <TableHead>Status</TableHead><TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{list.map((d, i) => (
            <TableRow key={d.id} className="hover:bg-muted/30 transition-colors">
              <TableCell className="text-muted-foreground">{i + 1}</TableCell>
              <TableCell className="font-mono font-medium text-sm">{d.demandNo}</TableCell>
              <TableCell className="text-sm">{new Date(d.createdAt).toLocaleDateString()}</TableCell>
              <TableCell>
                <div className="text-sm font-medium">{d.requestedBy?.name || "—"}</div>
                {d.requestedBy?.role && <div className="text-xs text-muted-foreground">{d.requestedBy.role}</div>}
              </TableCell>
              <TableCell className="text-sm">{d.requestingWH?.name} <span className="text-xs text-muted-foreground">({d.requestingWH?.type})</span></TableCell>
              <TableCell className="text-sm">{d.supplyingWH?.name} <span className="text-xs text-muted-foreground">({d.supplyingWH?.type})</span></TableCell>
              <TableCell className="text-center text-sm">{d.items.length}</TableCell>
              <TableCell>
                <Badge variant="secondary" className={STATUS_STYLE[d.status] || ""}>{d.status.charAt(0) + d.status.slice(1).toLowerCase()}</Badge>
                {d.status === "APPROVED" && d.challanId && <div className="text-xs text-blue-600 font-medium mt-0.5">Challan linked</div>}
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDetail(d)} title="View"><Eye className="h-3 w-3" /></Button>
                  {canCreate && d.status === "PENDING" && d.requestedBy?.id === user?.id && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" title="Cancel" onClick={() => setCancelId(d.id)}><XCircle className="h-4 w-4" /></Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      </div>
    );
  }

  if (loading) return <div className="space-y-6"><Skeleton className="h-10 w-full rounded-lg" />{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg mt-2" />)}</div>;

  return (
    <div className="space-y-6">
      <PageHeader icon={<ClipboardList className="h-5 w-5" />} title="Demand Lists" subtitle="Warehouse stock request and approval management" actions={
        <div className="flex items-center gap-2">
          {canCreate && (<Button className="gradient-primary text-primary-foreground" onClick={() => { if (showDialog) { setShowDialog(false); } else { openAdd(); } }}>{showDialog ? <><X className="h-4 w-4 mr-2" />Close Form</> : <><Plus className="h-4 w-4 mr-2" />New Demand</>}</Button>)}
        </div>
      } />

      {/* Status filter pills — PR style */}
      <div className="flex gap-1.5 flex-wrap">
        {(["ALL", "PENDING", "APPROVED", "FULFILLED", "REJECTED", "CANCELLED"] as const).map(s => (
          <Button key={s} variant={filterStatus === s ? "default" : "outline"} size="sm"
            onClick={() => setFilterStatus(s as DemandStatus | "ALL")}
            className={filterStatus === s ? "gradient-primary text-primary-foreground" : ""}>
            {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
          </Button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by demand no or warehouse..." className="pl-9" />
      </div>

      {/* Inline create form — togglable panel */}
      {showDialog && canCreate && (
        <Card className="shadow-sm border-primary/30 bg-primary/[0.02]">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">New Stock Demand</Label>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowDialog(false)}><ChevronUp className="h-4 w-4" /></Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Warehouses */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Requesting Warehouse *</Label>
                {requestingOptions.length <= 1 ? (
                  <Input value={requestingOptions[0]?.name ?? "No warehouse found"} disabled />
                ) : (
                  <Select value={requestingWHId || "__none__"} onValueChange={handleReqWHChange}>
                    <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Select warehouse</SelectItem>
                      {requestingOptions.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Supplying Warehouse *</Label>
                {supplyingOptions.length <= 1 ? (
                  <Input
                    value={supplyingOptions[0]?.name ?? (requestingWHId ? `No ${selectedReqWH?.type === 'BRANCH' ? 'main' : 'branch'} warehouse found` : "Select requesting warehouse first")}
                    disabled
                  />
                ) : (
                  <Select value={supplyingWHId || "__none__"} onValueChange={(v) => setSupplyingWHId(v === "__none__" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Select supply source" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Select warehouse</SelectItem>
                      {supplyingOptions.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea placeholder="Reason or notes for this demand..." value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-16" />
            </div>

            {/* Add ingredient row */}
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">
                  Add Ingredient{requestingWHId && selectedReqWH ? ` — stock from ${selectedReqWH.name}` : ""}
                </Label>
                <Select value={addIngredientId} onValueChange={setAddIngredientId}>
                  <SelectTrigger><SelectValue placeholder="Select ingredient to add" /></SelectTrigger>
                  <SelectContent>
                    {ingredients.filter(ig => !items.some(ci => ci.ingredientId === ig.id)).map(ig => (
                      <SelectItem key={ig.id} value={ig.id}>
                        {ig.name} (Stock: {getWarehouseStock(ig.id)} {ig.unit?.name ?? ""})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={addItem} disabled={!addIngredientId}>
                <Plus className="h-4 w-4 mr-1" />Add
              </Button>
              <Button variant="outline" onClick={addLowStockItems} disabled={!requestingWHId || loadingLowStock}>
                <AlertTriangle className="h-4 w-4 mr-1" />{loadingLowStock ? "Loading..." : "Add Low Stock"}
              </Button>
            </div>

            {/* Items table */}
            {items.length > 0 && (
              <div className="rounded-lg border overflow-auto">
                <Table>
                  <TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead>Ingredient</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Current Stock</TableHead>
                    <TableHead>Requested Qty</TableHead>
                    <TableHead></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {items.map((item, idx) => (
                      <TableRow key={item.ingredientId}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{item.unit}</TableCell>
                        <TableCell className="text-sm">{item.currentStock}</TableCell>
                        <TableCell>
                          <Input type="number" className="w-24 h-8" min={1} value={item.requestedQty}
                            onChange={e => { const qty = Number(e.target.value); setItems(prev => prev.map((it, i) => i === idx ? { ...it, requestedQty: qty } : it)); }} />
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setItems(p => p.filter((_, i) => i !== idx))}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button className="gradient-primary text-primary-foreground" size="sm" onClick={handleCreate} disabled={saving}>{saving ? "Creating..." : "Create Demand"}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table — Super Admin: single review list; Manager/Admin: two tabs; KM: single list */}
      {user?.role === 'Super Admin' ? (
        <Card className="shadow-sm">
          <CardHeader className="pb-2"><p className="text-xs text-muted-foreground">Stock requests awaiting your review.</p></CardHeader>
          <CardContent><DemandTable list={filtered} showCreateButton={false} /></CardContent>
        </Card>
      ) : canApprove ? (
        <Tabs defaultValue="incoming">
          <TabsList>
            <TabsTrigger value="incoming">
              <ClipboardList className="h-4 w-4 mr-1.5" />
              Requests to Review ({incomingDemands.length})
            </TabsTrigger>
            <TabsTrigger value="mine">
              <User className="h-4 w-4 mr-1.5" />
              My Requests ({myDemands.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="incoming" className="mt-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-2"><p className="text-xs text-muted-foreground">Stock requests from your team awaiting your review.</p></CardHeader>
              <CardContent><DemandTable list={incomingDemands} showCreateButton={false} /></CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="mine" className="mt-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-2"><p className="text-xs text-muted-foreground">Your own stock requests sent upward for approval.</p></CardHeader>
              <CardContent><DemandTable list={myDemands} /></CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : (
        <Card className="shadow-sm">
          <CardContent className="pt-4"><DemandTable list={filtered} /></CardContent>
        </Card>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <span>Stock Demand: {showDetail?.demandNo}</span>
              {showDetail && (
                <Badge variant="secondary" className={STATUS_STYLE[showDetail.status] || ""}>
                  {showDetail.status}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {showDetail && (
            <div className="space-y-4">
              {/* Requested By / Approved By Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card className="shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Requested By</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{showDetail.requestedBy?.name ?? "—"}</span>
                      {showDetail.requestedBy?.role && <Badge variant="secondary" className="text-xs">{showDetail.requestedBy.role}</Badge>}
                    </div>
                    {showDetail.requestedBy?.outlet && (
                      <div className="text-xs text-muted-foreground">Outlet: <span className="font-medium text-foreground">{showDetail.requestedBy.outlet}</span></div>
                    )}
                    {showDetail.requestedBy?.phone && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="h-3 w-3" />{showDetail.requestedBy.phone}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1">
                      Requested: {new Date(showDetail.createdAt).toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
                {showDetail.approvedBy ? (
                  <Card className="shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">
                        {showDetail.status === "REJECTED" ? "Rejected By" : "Approved By"}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{showDetail.approvedBy.name}</span>
                        {showDetail.approvedBy.role && <Badge variant="secondary" className="text-xs">{showDetail.approvedBy.role}</Badge>}
                      </div>
                      {showDetail.approvedBy.outlet && (
                        <div className="text-xs text-muted-foreground">Outlet: <span className="font-medium text-foreground">{showDetail.approvedBy.outlet}</span></div>
                      )}
                      {showDetail.approvedBy.phone && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Phone className="h-3 w-3" />{showDetail.approvedBy.phone}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground mt-1">
                        {showDetail.status === "REJECTED" && showDetail.rejectedAt
                          ? `Rejected: ${new Date(showDetail.rejectedAt).toLocaleString()}`
                          : showDetail.approvedAt
                          ? `Approved: ${new Date(showDetail.approvedAt).toLocaleString()}`
                          : null}
                      </div>
                      {showDetail.fulfilledAt && (
                        <div className="text-xs text-muted-foreground">
                          Fulfilled: {new Date(showDetail.fulfilledAt).toLocaleString()}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Warehouses</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 text-sm">
                      <div><span className="text-muted-foreground">From:</span> <span className="font-medium">{showDetail.supplyingWH?.name}</span> <Badge variant="secondary" className="text-xs ml-1">{showDetail.supplyingWH?.type}</Badge></div>
                      <div><span className="text-muted-foreground">To:</span> <span className="font-medium">{showDetail.requestingWH?.name}</span> <Badge variant="secondary" className="text-xs ml-1">{showDetail.requestingWH?.type}</Badge></div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Warehouse row (when approvedBy card is shown) */}
              {showDetail.approvedBy && (
                <div className="flex gap-4 text-sm flex-wrap">
                  <div><span className="text-muted-foreground">Requesting WH:</span> <span className="font-medium">{showDetail.requestingWH?.name}</span> <Badge variant="secondary" className="text-xs ml-1">{showDetail.requestingWH?.type}</Badge></div>
                  <div><span className="text-muted-foreground">Supplying WH:</span> <span className="font-medium">{showDetail.supplyingWH?.name}</span> <Badge variant="secondary" className="text-xs ml-1">{showDetail.supplyingWH?.type}</Badge></div>
                  {showDetail.challanId && <div className="text-blue-600 font-medium text-xs self-center">✓ Challan linked</div>}
                </div>
              )}

              {/* Notes */}
              {showDetail.notes && (
                <div className="flex gap-2 text-sm">
                  <span className="text-muted-foreground">Notes:</span>
                  <span>{showDetail.notes}</span>
                </div>
              )}

              {/* Rejection Reason */}
              {showDetail.status === "REJECTED" && showDetail.rejectionReason && (
                <Card className="shadow-sm border-destructive/30">
                  <CardContent className="py-3">
                    <div className="text-sm"><span className="text-destructive font-medium">Rejection Reason: </span>{showDetail.rejectionReason}</div>
                  </CardContent>
                </Card>
              )}

              {/* Items Table */}
              {canApproveThis(showDetail) && showDetail.status === "PENDING" && (
                <p className="text-sm text-muted-foreground bg-muted/40 rounded-md px-3 py-2">
                  Adjust the approved quantities below, then click <strong>Approve</strong>. A transfer challan will be auto-created.
                  {loadingSupplyStock && <span className="ml-2 text-xs animate-pulse">Loading stock...</span>}
                </p>
              )}
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
                      {(showDetail.status === "APPROVED" || showDetail.status === "FULFILLED") && (
                        <TableHead className="text-right">Approved Qty</TableHead>
                      )}
                      {canApproveThis(showDetail) && showDetail.status === "PENDING" && (
                        <>
                          <TableHead className="text-right">
                            <span className="text-blue-600">Available in WH</span>
                          </TableHead>
                          <TableHead className="text-right">Approve Qty</TableHead>
                        </>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {showDetail.items.map((item: DemandItem, i: number) => {
                      const approveItem = approveItems.find(a => a.id === item.id);
                      const availableInWH = supplyingStockMap[item.ingredientId] ?? 0;
                      const isApproving = canApproveThis(showDetail) && showDetail.status === "PENDING";
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="font-medium">{item.ingredientName}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{item.category ?? "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{item.unit}</TableCell>
                          <TableCell className="text-right text-sm">{item.stockAtRequest ?? "—"}</TableCell>
                          <TableCell className="text-right">{item.requestedQty}</TableCell>
                          {(showDetail.status === "APPROVED" || showDetail.status === "FULFILLED") && (
                            <TableCell className="text-right font-medium">
                              {item.approvedQty !== null ? (
                                <span className={item.approvedQty < item.requestedQty ? "text-warning" : "text-success"}>
                                  {item.approvedQty}
                                </span>
                              ) : "—"}
                            </TableCell>
                          )}
                          {isApproving && (
                            <>
                              <TableCell className="text-right">
                                {loadingSupplyStock ? (
                                  <span className="text-xs text-muted-foreground animate-pulse">...</span>
                                ) : (
                                  <span className={`font-semibold ${availableInWH < item.requestedQty ? "text-destructive" : "text-blue-600"}`}>
                                    {availableInWH}
                                    {availableInWH < item.requestedQty && (
                                      <AlertTriangle className="inline h-3 w-3 ml-1 -mt-0.5" />
                                    )}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <Input
                                  type="number"
                                  min={0}
                                  max={availableInWH}
                                  className={`h-8 w-20 text-center text-xs ml-auto ${(approveItem?.approvedQty ?? 0) > availableInWH ? "border-destructive text-destructive ring-destructive/30" : ""}`}
                                  value={approveItem?.approvedQty ?? item.requestedQty}
                                  onChange={(e) => {
                                    const val = Number(e.target.value);
                                    // Cap at available stock
                                    const capped = Math.min(Math.max(0, val), availableInWH);
                                    setApproveItems(prev => prev.map(a => a.id === item.id ? { ...a, approvedQty: capped } : a));
                                  }}
                                />
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => {
              const d = showDetail;
              if (!d) return;
              const w = window.open("", "_blank", "width=800,height=700");
              if (!w) return;
              const st = d.status;
              const hasApproved = st === "APPROVED" || st === "FULFILLED";
              const approverHtml = d.approvedBy
                ? `<div style="text-align:right"><p style="font-size:11px;color:#888;text-transform:uppercase;font-weight:600">${st === "REJECTED" ? "Rejected By" : "Approved By"}</p><p style="font-weight:600">${d.approvedBy.name}</p><p style="color:#666">${d.approvedBy.role ?? ""}${d.approvedBy.outlet ? ` — ${d.approvedBy.outlet}` : ""}</p>${d.approvedBy.phone ? `<p style="color:#666">${d.approvedBy.phone}</p>` : ""}${d.approvedAt ? `<p style="font-size:11px;color:#888">${new Date(d.approvedAt).toLocaleString()}</p>` : ""}${d.fulfilledAt ? `<p style="font-size:11px;color:#888">Fulfilled: ${new Date(d.fulfilledAt).toLocaleString()}</p>` : ""}</div>`
                : `<div style="text-align:right"><p style="font-size:11px;color:#888;text-transform:uppercase;font-weight:600">Warehouses</p><p style="font-weight:600">${d.supplyingWH?.name} → ${d.requestingWH?.name}</p></div>`;
              w.document.write(`<!DOCTYPE html><html><head><title>${d.demandNo}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;padding:30px;color:#333;font-size:13px}h1{font-size:20px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccc;padding:8px;text-align:left}th{background:#f0f0f0;font-weight:600;font-size:12px}.header{text-align:center;border-bottom:2px solid #333;padding-bottom:16px;margin-bottom:16px}.info-grid{display:flex;justify-content:space-between;margin-bottom:16px}.badge{display:inline-block;padding:3px 12px;border-radius:12px;font-size:11px;font-weight:600;margin-top:6px}.summary{text-align:right;margin-top:12px}@media print{body{padding:15px}}</style></head><body>`);
              w.document.write(`<div class="header"><h1>Stock Demand</h1><p style="color:#666;margin-top:4px">${d.demandNo}</p><span class="badge" style="background:${hasApproved ? "#e6f4ea;color:#1a7f37" : st === "REJECTED" ? "#fde8e8;color:#d32f2f" : st === "PENDING" ? "#fff8e1;color:#f57f17" : "#eee;color:#666"}">${st}</span></div>`);
              w.document.write(`<div class="info-grid"><div><p style="font-size:11px;color:#888;text-transform:uppercase;font-weight:600">Requested By</p><p style="font-weight:600">${d.requestedBy?.name ?? "—"}</p><p style="color:#666">${d.requestedBy?.role ?? ""}${d.requestedBy?.outlet ? ` — ${d.requestedBy.outlet}` : ""}</p>${d.requestedBy?.phone ? `<p style="color:#666">${d.requestedBy.phone}</p>` : ""}<p style="font-size:11px;color:#888;margin-top:4px">Date: ${new Date(d.createdAt).toLocaleString()}</p></div>${approverHtml}</div>`);
              w.document.write(`<p style="margin-bottom:8px"><strong>Requesting WH:</strong> ${d.requestingWH?.name} (${d.requestingWH?.type}) &nbsp;&nbsp; <strong>Supplying WH:</strong> ${d.supplyingWH?.name} (${d.supplyingWH?.type})</p>`);
              if (d.notes) w.document.write(`<p style="background:#f5f5f5;padding:8px;border-radius:4px;margin-bottom:8px"><strong>Notes:</strong> ${d.notes}</p>`);
              if (d.rejectionReason) w.document.write(`<p style="background:#fde8e8;padding:8px;border-radius:4px;margin-bottom:8px;color:#d32f2f"><strong>Rejection Reason:</strong> ${d.rejectionReason}</p>`);
              w.document.write(`<table><thead><tr><th>SN</th><th>Ingredient</th><th>Category</th><th>Unit</th><th style="text-align:right">Current Stock</th><th style="text-align:right">Requested</th>${hasApproved ? '<th style="text-align:right">Approved</th>' : ""}</tr></thead><tbody>`);
              d.items.forEach((item: DemandItem, i: number) => {
                w.document.write(`<tr><td>${i + 1}</td><td>${item.ingredientName}</td><td>${item.category ?? "—"}</td><td>${item.unit}</td><td style="text-align:right">${item.stockAtRequest ?? "—"}</td><td style="text-align:right">${item.requestedQty}</td>${hasApproved ? `<td style="text-align:right;font-weight:600">${item.approvedQty ?? "—"}</td>` : ""}</tr>`);
              });
              w.document.write(`</tbody></table><p class="summary">Total Items: <strong>${d.items.length}</strong></p></body></html>`);
              w.document.close();
              w.print();
            }}>
              <Printer className="h-4 w-4 mr-1" />Print / PDF
            </Button>
            {canApproveThis(showDetail) && showDetail?.status === "PENDING" && (
              <>
                <Button variant="destructive" onClick={() => { setRejectTarget(showDetail); setRejectReason(""); setShowDetail(null); }}>
                  <XCircle className="h-4 w-4 mr-1" />Reject
                </Button>
                <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={handleApprove} disabled={saving}>
                  <CheckCircle2 className="h-4 w-4 mr-1" />{saving ? "Approving..." : "Approve & Create Challan"}
                </Button>
              </>
            )}
            <Button variant="outline" onClick={() => setShowDetail(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <AlertDialog open={!!cancelId} onOpenChange={() => setCancelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this demand?</AlertDialogTitle>
            <AlertDialogDescription>This will withdraw your stock request. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{saving ? "Cancelling..." : "Yes, Cancel"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Dialog */}
      <AlertDialog open={!!rejectTarget} onOpenChange={() => setRejectTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject demand {rejectTarget?.demandNo}?</AlertDialogTitle>
            <AlertDialogDescription>Optionally add a reason that will be visible to the requester.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1 pb-2">
            <Textarea placeholder="Rejection reason (optional)..." value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} className="min-h-16 text-sm" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={handleReject} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{saving ? "Rejecting..." : "Reject Demand"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Demands;

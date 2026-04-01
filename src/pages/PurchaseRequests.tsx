import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useData } from "@/contexts/DataContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { TablePagination, paginate } from "@/components/TablePagination";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ClipboardList, Plus, Search, Eye, PackageX, Trash2, Check, X, AlertTriangle, User, Phone, Mail, Printer,
} from "lucide-react";
import {
  purchaseRequestService,
  type PurchaseRequestRecord,
  type PurchaseRequestItemRecord,
} from "@/services/purchase-request.service";
import { warehouseService, type WarehouseRecord } from "@/services/warehouse.service";
import { inventoryService, type IngredientRecord } from "@/services/inventory.service";

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Pending", cls: "bg-warning/10 text-warning" },
  APPROVED: { label: "Approved", cls: "bg-success/10 text-success" },
  REJECTED: { label: "Rejected", cls: "bg-destructive/10 text-destructive" },
  PURCHASED: { label: "Purchased", cls: "bg-info/10 text-info" },
  CANCELLED: { label: "Cancelled", cls: "bg-muted text-muted-foreground" },
};

interface RequestItem {
  ingredientId: string;
  name: string;
  unit: string;
  currentStock: number;
  requestedQty: number;
}

const PurchaseRequests = () => {
  const { user } = useAuth();
  const { settings } = useData();
  const currency = settings.currency || "Rs.";
  const isSuperAdmin = user?.role === "Super Admin";
  const canApprove = ["Super Admin", "Admin"].includes(user?.role ?? "");
  const canCreate = !canApprove; // Only Manager can create requests; Admin/Super Admin supervise only
  const [searchParams] = useSearchParams();
  const paramAutoOpenDone = useRef(false);

  // List state
  const [requests, setRequests] = useState<PurchaseRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Create dialog state
  const [showCreate, setShowCreate] = useState(false);
  const [warehouses, setWarehouses] = useState<WarehouseRecord[]>([]);
  const [ingredients, setIngredients] = useState<IngredientRecord[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState("");
  const [createItems, setCreateItems] = useState<RequestItem[]>([]);
  const [createNotes, setCreateNotes] = useState("");
  const [addIngredientId, setAddIngredientId] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingLowStock, setLoadingLowStock] = useState(false);
  const [warehouseStockMap, setWarehouseStockMap] = useState<Record<string, number>>({});

  // Detail/Approval dialog state
  const [viewRequest, setViewRequest] = useState<PurchaseRequestRecord | null>(null);
  const [approvalQtys, setApprovalQtys] = useState<Record<string, number>>({});
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [actionSaving, setActionSaving] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);

  // Fetch list
  const fetchRequests = useCallback(async () => {
    try {
      const params: { status?: string; page?: number; limit?: number } = { limit: 200 };
      if (statusFilter !== "ALL") params.status = statusFilter;
      const res = await purchaseRequestService.getAll(params);
      setRequests(res.data);
    } catch (err: Error | unknown) {
      toast.error((err as Error).message || "Failed to load requests");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  // Auto-open create dialog when arriving from Branch Stock page with URL params (only if Manager can create)
  useEffect(() => {
    const paramWarehouseId = searchParams.get("warehouseId");
    const paramIngId = searchParams.get("ingredientId");
    if ((paramWarehouseId || paramIngId) && canCreate && !paramAutoOpenDone.current) {
      paramAutoOpenDone.current = true;
      openCreateDialog();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch warehouses + ingredients for create dialog
  const openCreateDialog = useCallback(async () => {
    setShowCreate(true);
    setCreateItems([]);
    setCreateNotes("");
    setAddIngredientId("");
    try {
      const [whs, ings] = await Promise.all([
        warehouseService.getAll(),
        inventoryService.getIngredients(),
      ]);
      const branchWarehouses = whs.filter(w => w.type === "BRANCH");
      setWarehouses(branchWarehouses);
      setIngredients(ings);
      // Pre-select warehouse from URL param if available
      const paramWarehouseId = searchParams.get("warehouseId");
      if (paramWarehouseId && branchWarehouses.find(w => w.id === paramWarehouseId)) {
        setSelectedWarehouse(paramWarehouseId);
      } else if (branchWarehouses.length === 1) {
        setSelectedWarehouse(branchWarehouses[0].id);
      } else {
        setSelectedWarehouse("");
      }
    } catch (err: Error | unknown) {
      toast.error((err as Error).message || "Failed to load data");
    }
  }, [searchParams]);

  // Fetch warehouse stock when warehouse selection changes
  useEffect(() => {
    if (!selectedWarehouse) { setWarehouseStockMap({}); return; }
    warehouseService.getStock(selectedWarehouse).then(stockData => {
      const map: Record<string, number> = {};
      for (const s of stockData) map[s.ingredient.id] = Number(s.currentStock);
      setWarehouseStockMap(map);
    }).catch((err: Error | unknown) => { setWarehouseStockMap({}); toast.error((err as Error).message || "Failed to load warehouse stock"); });
  }, [selectedWarehouse]);

  // Get warehouse stock for an ingredient (0 if not found in warehouse)
  const getWarehouseStock = useCallback((ingredientId: string) => {
    return warehouseStockMap[ingredientId] ?? 0;
  }, [warehouseStockMap]);

  // Pre-fill ingredient from URL param after ingredients are loaded
  useEffect(() => {
    const paramIngId = searchParams.get("ingredientId");
    if (!paramIngId || ingredients.length === 0 || !showCreate) return;
    const ing = ingredients.find(i => i.id === paramIngId);
    if (!ing) return;
    setCreateItems(prev => {
      if (prev.some(i => i.ingredientId === paramIngId)) return prev;
      return [...prev.filter(i => i.ingredientId !== ""), {
        ingredientId: ing.id,
        name: ing.name,
        unit: ing.unit?.name ?? "",
        currentStock: getWarehouseStock(ing.id),
        requestedQty: Math.max(1, Number(ing.lowStockLevel) - Number(ing.currentStock)),
      }];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingredients, showCreate]);

  // Add ingredient to create list
  const addItem = useCallback(() => {
    if (!addIngredientId) return;
    if (createItems.some(i => i.ingredientId === addIngredientId)) {
      toast.error("Ingredient already added");
      return;
    }
    const ing = ingredients.find(i => i.id === addIngredientId);
    if (!ing) return;
    setCreateItems(prev => [...prev, {
      ingredientId: ing.id,
      name: ing.name,
      unit: ing.unit?.name ?? "",
      currentStock: getWarehouseStock(ing.id),
      requestedQty: 1,
    }]);
    setAddIngredientId("");
  }, [addIngredientId, createItems, ingredients, getWarehouseStock]);

  // Add low stock items from selected warehouse
  const addLowStockItems = useCallback(async () => {
    if (!selectedWarehouse) { toast.error("Select a warehouse first"); return; }
    setLoadingLowStock(true);
    try {
      const stockData = await warehouseService.getStock(selectedWarehouse, { lowStockOnly: true });
      let added = 0;
      const newItems = [...createItems];
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
      setCreateItems(newItems);
      toast.success(`${added} low stock item${added !== 1 ? "s" : ""} added`);
    } catch (err: Error | unknown) {
      toast.error((err as Error).message || "Failed to load low stock");
    } finally {
      setLoadingLowStock(false);
    }
  }, [selectedWarehouse, createItems]);

  // Submit create
  const handleCreate = async () => {
    if (!selectedWarehouse) { toast.error("Select a warehouse"); return; }
    if (createItems.length === 0) { toast.error("Add at least one item"); return; }
    if (createItems.some(i => i.requestedQty <= 0)) { toast.error("All quantities must be > 0"); return; }
    setSaving(true);
    try {
      const newPR = await purchaseRequestService.create({
        warehouseId: selectedWarehouse,
        items: createItems.map(i => ({ ingredientId: i.ingredientId, requestedQty: i.requestedQty })),
        notes: createNotes || undefined,
      });
      toast.success("Purchase request created");
      setShowCreate(false);
      setRequests(prev => [newPR, ...prev]);
    } catch (err: Error | unknown) {
      toast.error((err as Error).message || "Failed to create request");
    } finally {
      setSaving(false);
    }
  };

  // Open detail dialog
  const openDetail = useCallback((pr: PurchaseRequestRecord) => {
    setViewRequest(pr);
    setRejectReason("");
    // Init approval qtys from requested or approved
    const qtys: Record<string, number> = {};
    pr.items.forEach(item => {
      qtys[item.ingredientId] = item.approvedQty ?? item.requestedQty;
    });
    setApprovalQtys(qtys);
  }, []);

  // Approve
  const handleApprove = async () => {
    if (!viewRequest) return;
    setActionSaving(true);
    try {
      const items = viewRequest.items.map(item => ({
        ingredientId: item.ingredientId,
        approvedQty: approvalQtys[item.ingredientId] ?? 0,
      }));
      const approved = await purchaseRequestService.approve(viewRequest.id, items);
      toast.success("Request approved");
      setViewRequest(null);
      setRequests(prev => prev.map(r => r.id === approved.id ? approved : r));
    } catch (err: Error | unknown) {
      toast.error((err as Error).message || "Failed to approve");
    } finally {
      setActionSaving(false);
    }
  };

  // Reject
  const handleReject = async () => {
    if (!viewRequest) return;
    if (!rejectReason.trim()) { toast.error("Rejection reason is required"); return; }
    setActionSaving(true);
    try {
      const rejected = await purchaseRequestService.reject(viewRequest.id, rejectReason);
      toast.success("Request rejected");
      setRejectOpen(false);
      setViewRequest(null);
      setRequests(prev => prev.map(r => r.id === rejected.id ? rejected : r));
    } catch (err: Error | unknown) {
      toast.error((err as Error).message || "Failed to reject");
    } finally {
      setActionSaving(false);
    }
  };

  // Cancel (with confirmation)
  const handleConfirmCancel = async () => {
    if (!cancelId) return;
    try {
      const cancelled = await purchaseRequestService.cancel(cancelId);
      toast.success("Request cancelled");
      setCancelId(null);
      setRequests(prev => prev.map(r => r.id === cancelled.id ? cancelled : r));
    } catch (err: Error | unknown) {
      toast.error((err as Error).message || "Failed to cancel");
    }
  };

  // Filtered list
  const filtered = useMemo(() =>
    requests.filter(r => {
      if (search && !r.requestNo.toLowerCase().includes(search.toLowerCase()) && !r.requestedBy.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }), [requests, search]);

  const paged = paginate(filtered, page, 15);

  if (loading) return <div className="space-y-6"><Skeleton className="h-10 w-full rounded-lg" />{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg mt-2" />)}</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<ClipboardList className="h-5 w-5" />}
        title="Purchase Requests"
        subtitle="Ingredient requisition workflow"
        actions={canCreate ? <Button className="gradient-primary text-primary-foreground" onClick={openCreateDialog}><Plus className="h-4 w-4 mr-2" />New Request</Button> : undefined}
      />

      {/* Status Filters */}
      <div className="flex gap-1.5 flex-wrap">
        {["ALL", "PENDING", "APPROVED", "REJECTED", "PURCHASED", "CANCELLED"].map(s => (
          <Button key={s} variant={statusFilter === s ? "default" : "outline"} size="sm"
            onClick={() => { setStatusFilter(s); setPage(1); }}
            className={statusFilter === s ? "gradient-primary text-primary-foreground" : ""}>
            {s === "ALL" ? "All" : STATUS_STYLE[s]?.label ?? s}
          </Button>
        ))}
      </div>

      {/* Search + List */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search by request # or requester..." className="pl-9" />
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <ClipboardList className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" />
              <p className="text-muted-foreground">No purchase requests found</p>
            </div>
          ) : (
            <>
              <div className="rounded-lg border overflow-auto max-h-[calc(100vh-350px)]">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead>SN</TableHead>
                      <TableHead>Request #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Requester</TableHead>
                      <TableHead>Warehouse</TableHead>
                      <TableHead className="text-center">Items</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.map((pr, i) => {
                      const st = STATUS_STYLE[pr.status] ?? { label: pr.status, cls: "" };
                      return (
                        <TableRow key={pr.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="text-muted-foreground">{(page - 1) * 15 + i + 1}</TableCell>
                          <TableCell className="font-mono text-sm font-medium">{pr.requestNo}</TableCell>
                          <TableCell className="text-sm">{new Date(pr.createdAt).toLocaleDateString()}</TableCell>
                          <TableCell>
                            <div className="text-sm font-medium">{pr.requestedBy.name}</div>
                            <div className="text-xs text-muted-foreground">{pr.requestedBy.role}</div>
                          </TableCell>
                          <TableCell className="text-sm">{pr.warehouse.name}</TableCell>
                          <TableCell className="text-center">{pr.items.length}</TableCell>
                          <TableCell><Badge variant="secondary" className={st.cls}>{st.label}</Badge></TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDetail(pr)} title="View / Receipt"><Eye className="h-3 w-3" /></Button>
                              {pr.status === "PENDING" && pr.requestedBy.id === user?.id && (
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setCancelId(pr.id)} title="Cancel"><X className="h-3 w-3" /></Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <TablePagination currentPage={page} totalItems={filtered.length} onPageChange={setPage} pageSize={15} />
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── Create Request Dialog ─── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Purchase Request</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Warehouse */}
            <div className="space-y-1.5">
              <Label>Target Warehouse (Branch Store) *</Label>
              {warehouses.length <= 1 ? (
                <Input value={warehouses[0]?.name ?? "No branch warehouses"} disabled />
              ) : (
                <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                  <SelectTrigger><SelectValue placeholder="Select branch warehouse" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}{w.outlet ? ` — ${w.outlet.name}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Add ingredient row */}
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">Add Ingredient</Label>
                <Select value={addIngredientId} onValueChange={setAddIngredientId}>
                  <SelectTrigger><SelectValue placeholder="Select ingredient" /></SelectTrigger>
                  <SelectContent>
                    {ingredients.filter(ig => !createItems.some(ci => ci.ingredientId === ig.id)).map(ig => (
                      <SelectItem key={ig.id} value={ig.id}>{ig.name} (Stock: {getWarehouseStock(ig.id)} {ig.unit?.name ?? ""})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={addItem} disabled={!addIngredientId}><Plus className="h-4 w-4 mr-1" />Add</Button>
              <Button variant="outline" onClick={addLowStockItems} disabled={!selectedWarehouse || loadingLowStock}>
                <AlertTriangle className="h-4 w-4 mr-1" />{loadingLowStock ? "Loading..." : "Add Low Stock"}
              </Button>
            </div>

            {/* Items table */}
            {createItems.length > 0 && (
              <div className="rounded-lg border overflow-auto">
                <Table>
                  <TableHeader><TableRow className="bg-muted/50">
                    <TableHead>Ingredient</TableHead><TableHead>Unit</TableHead><TableHead>Current Stock</TableHead><TableHead>Requested Qty</TableHead><TableHead></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {createItems.map((item, idx) => (
                      <TableRow key={item.ingredientId}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-sm">{item.unit}</TableCell>
                        <TableCell className="text-sm">{item.currentStock}</TableCell>
                        <TableCell>
                          <Input type="number" className="w-24 h-8" min={1} value={item.requestedQty}
                            onChange={e => { const qty = Number(e.target.value); setCreateItems(prev => prev.map((it, i) => i === idx ? { ...it, requestedQty: qty } : it)); }} />
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setCreateItems(prev => prev.filter((_, i) => i !== idx))}><Trash2 className="h-3 w-3" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea placeholder="Any additional info..." value={createNotes} onChange={e => setCreateNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button className="gradient-primary text-primary-foreground" onClick={handleCreate} disabled={saving}>{saving ? "Submitting..." : "Submit Request"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Detail / Approval Dialog ─── */}
      <Dialog open={!!viewRequest} onOpenChange={() => setViewRequest(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {viewRequest && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <span>Purchase Request: {viewRequest.requestNo}</span>
                  <Badge variant="secondary" className={STATUS_STYLE[viewRequest.status]?.cls ?? ""}>
                    {STATUS_STYLE[viewRequest.status]?.label ?? viewRequest.status}
                  </Badge>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                {/* Info Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Requester Card */}
                  <Card className="shadow-sm">
                    <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Requester</CardTitle></CardHeader>
                    <CardContent className="space-y-1">
                      <div className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" /><span className="font-medium">{viewRequest.requestedBy.name}</span><Badge variant="secondary" className="text-xs">{viewRequest.requestedBy.role}</Badge></div>
                      {viewRequest.requestedBy.phone && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Phone className="h-3 w-3" />{viewRequest.requestedBy.phone}</div>}
                      {viewRequest.requestedBy.email && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Mail className="h-3 w-3" />{viewRequest.requestedBy.email}</div>}
                      <div className="text-xs text-muted-foreground mt-1">Requested: {new Date(viewRequest.createdAt).toLocaleString()}</div>
                    </CardContent>
                  </Card>

                  {/* Approver Card */}
                  {viewRequest.approvedBy && (
                    <Card className="shadow-sm">
                      <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">{viewRequest.status === "REJECTED" ? "Rejected By" : "Approved By"}</CardTitle></CardHeader>
                      <CardContent className="space-y-1">
                        <div className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" /><span className="font-medium">{viewRequest.approvedBy.name}</span><Badge variant="secondary" className="text-xs">{viewRequest.approvedBy.role}</Badge></div>
                        {viewRequest.approvedBy.phone && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Phone className="h-3 w-3" />{viewRequest.approvedBy.phone}</div>}
                        {viewRequest.approvedBy.email && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Mail className="h-3 w-3" />{viewRequest.approvedBy.email}</div>}
                        <div className="text-xs text-muted-foreground mt-1">{viewRequest.status === "REJECTED" ? `Rejected: ${new Date(viewRequest.rejectedAt!).toLocaleString()}` : `Approved: ${new Date(viewRequest.approvedAt!).toLocaleString()}`}</div>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Warehouse + Notes */}
                <div className="flex gap-4 text-sm flex-wrap">
                  <div><span className="text-muted-foreground">Warehouse:</span> <span className="font-medium">{viewRequest.warehouse.name}</span>{viewRequest.warehouse.outlet && <span className="text-muted-foreground"> — {viewRequest.warehouse.outlet.name}</span>}</div>
                  {viewRequest.notes && <div><span className="text-muted-foreground">Notes:</span> {viewRequest.notes}</div>}
                </div>

                {/* Rejection reason */}
                {viewRequest.status === "REJECTED" && viewRequest.rejectionReason && (
                  <Card className="shadow-sm border-destructive/30"><CardContent className="py-3">
                    <div className="text-sm"><span className="text-destructive font-medium">Rejection Reason: </span>{viewRequest.rejectionReason}</div>
                  </CardContent></Card>
                )}

                {/* Items Table */}
                <div className="rounded-lg border overflow-auto">
                  <Table>
                    <TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead>SN</TableHead>
                      <TableHead>Ingredient</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Current Stock</TableHead>
                      <TableHead className="text-right">Requested Qty</TableHead>
                      {(viewRequest.status === "APPROVED" || viewRequest.status === "PURCHASED") && <TableHead className="text-right">Approved Qty</TableHead>}
                      {canApprove && viewRequest.status === "PENDING" && <TableHead className="text-right">Approve Qty</TableHead>}
                      {canApprove && viewRequest.status === "PENDING" && <TableHead></TableHead>}
                    </TableRow></TableHeader>
                    <TableBody>
                      {viewRequest.items.map((item, i) => {
                      const isRemoved = canApprove && viewRequest.status === "PENDING" && (approvalQtys[item.ingredientId] ?? 0) === 0;
                      return (
                        <TableRow key={item.id} className={isRemoved ? "opacity-40" : ""}>
                          <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className={cn("font-medium", isRemoved && "line-through")}>{item.ingredient.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{item.ingredient.category?.name ?? "—"}</TableCell>
                          <TableCell className="text-sm">{item.ingredient.unit?.name ?? "—"}</TableCell>
                          <TableCell className="text-right text-sm">{item.ingredient.currentStock}</TableCell>
                          <TableCell className="text-right font-medium">{item.requestedQty}</TableCell>
                          {(viewRequest.status === "APPROVED" || viewRequest.status === "PURCHASED") && (
                            <TableCell className="text-right font-medium">
                              {item.approvedQty != null ? (
                                <span className={item.approvedQty < item.requestedQty ? "text-warning" : "text-success"}>
                                  {item.approvedQty}
                                </span>
                              ) : "—"}
                            </TableCell>
                          )}
                          {canApprove && viewRequest.status === "PENDING" && (
                            <TableCell className="text-right">
                              <Input type="number" className="w-24 h-8 ml-auto" min={0}
                                value={approvalQtys[item.ingredientId] ?? 0}
                                onChange={e => setApprovalQtys(prev => ({ ...prev, [item.ingredientId]: Number(e.target.value) }))} />
                            </TableCell>
                          )}
                          {canApprove && viewRequest.status === "PENDING" && (
                            <TableCell>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Remove item (set to 0)"
                                onClick={() => setApprovalQtys(prev => ({ ...prev, [item.ingredientId]: 0 }))}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                    </TableBody>
                  </Table>
                </div>

                {/* Purchase link */}
                {viewRequest.purchase && (
                  <div className="text-sm text-muted-foreground">
                    Linked Purchase: <span className="font-medium">{viewRequest.purchase.invoiceNumber ?? viewRequest.purchase.id.slice(0, 8)}</span> — {currency} {Number(viewRequest.purchase.total).toLocaleString()} ({viewRequest.purchase.status})
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => {
                  const vr = viewRequest;
                  const w = window.open("", "_blank", "width=800,height=700");
                  if (!w) return;
                  const st = vr.status;
                  const hasApproved = st === "APPROVED" || st === "PURCHASED";
                  const approverHtml = vr.approvedBy ? `<div style="text-align:right"><p style="font-size:11px;color:#888;text-transform:uppercase;font-weight:600">${st === "REJECTED" ? "Rejected By" : "Approved By"}</p><p style="font-weight:600">${vr.approvedBy.name}</p><p style="color:#666">${vr.approvedBy.role}</p>${vr.approvedBy.phone ? `<p style="color:#666">${vr.approvedBy.phone}</p>` : ""}${vr.approvedAt ? `<p style="font-size:11px;color:#888">${new Date(vr.approvedAt).toLocaleString()}</p>` : ""}</div>` : `<div style="text-align:right"><p style="font-size:11px;color:#888;text-transform:uppercase;font-weight:600">Warehouse</p><p style="font-weight:600">${vr.warehouse.name}</p>${vr.warehouse.outlet ? `<p style="color:#666">${vr.warehouse.outlet.name}</p>` : ""}</div>`;
                  w.document.write(`<!DOCTYPE html><html><head><title>${vr.requestNo}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;padding:30px;color:#333;font-size:13px}h1{font-size:20px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccc;padding:8px;text-align:left}th{background:#f0f0f0;font-weight:600;font-size:12px}.header{text-align:center;border-bottom:2px solid #333;padding-bottom:16px;margin-bottom:16px}.info-grid{display:flex;justify-content:space-between;margin-bottom:16px}.badge{display:inline-block;padding:3px 12px;border-radius:12px;font-size:11px;font-weight:600;margin-top:6px}.removed{opacity:0.4;text-decoration:line-through}.summary{text-align:right;margin-top:12px}@media print{body{padding:15px}}</style></head><body>`);
                  w.document.write(`<div class="header"><h1>Purchase Request</h1><p style="color:#666;margin-top:4px">${vr.requestNo}</p><span class="badge" style="background:${hasApproved ? "#e6f4ea;color:#1a7f37" : st === "REJECTED" ? "#fde8e8;color:#d32f2f" : st === "PENDING" ? "#fff8e1;color:#f57f17" : "#eee;color:#666"}">${st}</span></div>`);
                  w.document.write(`<div class="info-grid"><div><p style="font-size:11px;color:#888;text-transform:uppercase;font-weight:600">Requested By</p><p style="font-weight:600">${vr.requestedBy.name}</p><p style="color:#666">${vr.requestedBy.role}</p>${vr.requestedBy.phone ? `<p style="color:#666">${vr.requestedBy.phone}</p>` : ""}${vr.requestedBy.email ? `<p style="color:#666">${vr.requestedBy.email}</p>` : ""}<p style="font-size:11px;color:#888;margin-top:4px">Date: ${new Date(vr.createdAt).toLocaleString()}</p></div>${approverHtml}</div>`);
                  if (vr.approvedBy) w.document.write(`<p style="margin-bottom:8px"><strong>Warehouse:</strong> ${vr.warehouse.name}${vr.warehouse.outlet ? " — " + vr.warehouse.outlet.name : ""}</p>`);
                  if (vr.notes) w.document.write(`<p style="background:#f5f5f5;padding:8px;border-radius:4px;margin-bottom:8px"><strong>Notes:</strong> ${vr.notes}</p>`);
                  if (vr.rejectionReason) w.document.write(`<p style="background:#fde8e8;padding:8px;border-radius:4px;margin-bottom:8px;color:#d32f2f"><strong>Rejection Reason:</strong> ${vr.rejectionReason}</p>`);
                  w.document.write(`<table><thead><tr><th>SN</th><th>Ingredient</th><th>Category</th><th>Unit</th><th style="text-align:right">Current Stock</th><th style="text-align:right">Requested</th>${hasApproved ? '<th style="text-align:right">Approved</th>' : ""}</tr></thead><tbody>`);
                  vr.items.forEach((item, i) => {
                    w.document.write(`<tr class="${item.approvedQty === 0 ? "removed" : ""}"><td>${i + 1}</td><td>${item.ingredient.name}</td><td>${item.ingredient.category?.name ?? "—"}</td><td>${item.ingredient.unit?.name ?? "—"}</td><td style="text-align:right">${item.ingredient.currentStock}</td><td style="text-align:right">${item.requestedQty}</td>${hasApproved ? `<td style="text-align:right;font-weight:600">${item.approvedQty ?? "—"}</td>` : ""}</tr>`);
                  });
                  w.document.write(`</tbody></table><p class="summary">Total Items: <strong>${vr.items.filter(i => (i.approvedQty ?? i.requestedQty) > 0).length}</strong></p></body></html>`);
                  w.document.close();
                  w.print();
                }}>
                  <Printer className="h-4 w-4 mr-1" />Print / PDF
                </Button>
                {canApprove && viewRequest.status === "PENDING" && (
                  <>
                    <Button variant="destructive" onClick={() => setRejectOpen(true)} disabled={actionSaving}>
                      <X className="h-4 w-4 mr-1" />Reject
                    </Button>
                    <Button className="bg-success text-success-foreground hover:bg-success/90" onClick={handleApprove} disabled={actionSaving}>
                      <Check className="h-4 w-4 mr-1" />{actionSaving ? "Approving..." : "Approve"}
                    </Button>
                  </>
                )}
                <Button variant="outline" onClick={() => setViewRequest(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Reject Reason Dialog ─── */}
      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Request</AlertDialogTitle>
            <AlertDialogDescription>Please provide a reason for rejection.</AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea placeholder="Reason for rejection..." value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReject} disabled={actionSaving} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {actionSaving ? "Rejecting..." : "Reject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Cancel Confirmation Dialog ─── */}
      <AlertDialog open={!!cancelId} onOpenChange={() => setCancelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Purchase Request?</AlertDialogTitle>
            <AlertDialogDescription>This will cancel your pending purchase request. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, Keep It</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCancel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Yes, Cancel Request</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
};

export default PurchaseRequests;

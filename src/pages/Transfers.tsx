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
import { Plus, Search, Eye, Truck, CheckCircle, Trash2, ArrowLeftRight, XCircle, PackageCheck, Printer, Phone, User } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";

const STATUS_STYLE: Record<string, string> = {
  PENDING:    "bg-yellow-100 text-yellow-800",
  DISPATCHED: "bg-blue-100 text-blue-800",
  RECEIVED:   "bg-success/10 text-success",
  CANCELLED:  "bg-muted text-muted-foreground",
};

interface FormItem { ingredientId: string; name: string; qty: number; }

const Transfers = () => {
  const { user } = useAuth();
  const isAdmin       = ['Super Admin', 'Admin'].includes(user?.role || '');
  const userOutletId  = user?.outletId ?? null;

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
  const [receiveId,    setReceiveId]    = useState<string | null>(null);
  const [search,       setSearch]       = useState("");
  const [filterStatus, setFilterStatus] = useState<ChallanStatus | "ALL">("ALL");

  // Create form
  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [toWarehouseId,   setToWarehouseId]   = useState("");
  const [notes,           setNotes]           = useState("");
  const [shippingCost,    setShippingCost]    = useState<number | "">("");
  const [miscAmount,      setMiscAmount]      = useState<number | "">("");
  const [items,           setItems]           = useState<FormItem[]>([{ ingredientId: "", name: "", qty: 0 }]);

  // ── Data loading ──────────────────────────────────────────────────
  const fetchChallans = useCallback(async () => {
    try {
      const data = await challanService.getAll(
        filterStatus !== "ALL" ? { status: filterStatus } : {}
      );
      setChallans(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load challans");
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
      .catch((err: any) => toast.error(err.message || "Failed to load data"));
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchChallans();
  }, [fetchChallans]);

  // ── Role-based tab filtering ───────────────────────────────────────
  // Determine if a warehouse "belongs" to the current user's scope
  function isMyWarehouse(wh: { outletId: string | null; type: string } | null): boolean {
    if (!wh) return false;
    if (isAdmin) return true;
    if (userOutletId) return wh.outletId === userOutletId;
    // No outletId (main-warehouse staff) → MAIN type
    return wh.type === 'MAIN';
  }

  const outgoingChallans = useMemo(() =>
    challans.filter(c => isAdmin || isMyWarehouse(c.fromWarehouse)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [challans, isAdmin, userOutletId]
  );

  const incomingChallans = useMemo(() =>
    challans.filter(c => isAdmin || isMyWarehouse(c.toWarehouse)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [challans, isAdmin, userOutletId]
  );

  // Apply search filter
  function applySearch(list: ChallanRecord[]) {
    const q = search.toLowerCase();
    if (!q) return list;
    return list.filter(c =>
      (c.challanNo || "").toLowerCase().includes(q) ||
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

  // Can this user create challans (they must have at least one valid "from" warehouse)
  const canCreate = fromWarehouseOptions.length > 0;

  // ── Stats ─────────────────────────────────────────────────────────
  const stats = {
    pending:    challans.filter(c => c.status === "PENDING").length,
    dispatched: challans.filter(c => c.status === "DISPATCHED").length,
    received:   challans.filter(c => c.status === "RECEIVED").length,
  };

  // ── Form helpers ──────────────────────────────────────────────────
  const openAdd = () => {
    setFromWarehouseId("");
    setToWarehouseId("");
    setNotes("");
    setShippingCost("");
    setMiscAmount("");
    setItems([{ ingredientId: "", name: "", qty: 0 }]);
    setShowDialog(true);
  };

  const addItemRow = () => setItems(p => [...p, { ingredientId: "", name: "", qty: 0 }]);
  const removeItemRow = (idx: number) => setItems(p => p.filter((_, i) => i !== idx));
  const updateItemRow = (idx: number, field: string, value: string | number) => {
    setItems(p => p.map((item, i) => {
      if (i !== idx) return item;
      if (field === "ingredientId") {
        const ing = ingredients.find(ig => ig.id === value);
        return { ...item, ingredientId: value as string, name: ing?.name || "" };
      }
      return { ...item, [field]: value };
    }));
  };

  // When "From" changes, reset "To"
  const handleFromChange = (v: string) => {
    setFromWarehouseId(v === "__none__" ? "" : v);
    setToWarehouseId("");
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
        shippingCost: shippingCost !== "" ? shippingCost : undefined,
        miscAmount:   miscAmount   !== "" ? miscAmount   : undefined,
        items: validItems,
      });
      toast.success("Transfer challan created");
      setShowDialog(false);
      await fetchChallans();
    } catch (err: any) {
      toast.error(err.message || "Failed to create challan");
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
    } catch (err: any) {
      toast.error(err.message || "Failed to dispatch");
    } finally {
      setSaving(false);
    }
  };

  const handleReceive = async () => {
    if (!receiveId) return;
    setSaving(true);
    try {
      await challanService.receive(receiveId);
      toast.success("Challan received — stock added to destination");
      setReceiveId(null);
      await fetchChallans();
    } catch (err: any) {
      toast.error(err.message || "Failed to receive");
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
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel");
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
              <TableHead>Challan No</TableHead>
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
                <TableCell className="font-medium">{c.challanNo}</TableCell>
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
                    {/* Dispatch — only in Outgoing tab, only for PENDING */}
                    {showDispatch && c.status === "PENDING" && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50" onClick={() => setDispatchId(c.id)} title="Dispatch">
                        <Truck className="h-4 w-4" />
                      </Button>
                    )}
                    {/* Receive — only in Incoming tab, only for DISPATCHED */}
                    {showReceive && c.status === "DISPATCHED" && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => setReceiveId(c.id)} title="Receive">
                        <PackageCheck className="h-4 w-4" />
                      </Button>
                    )}
                    {/* Cancel — in Outgoing tab for PENDING/DISPATCHED; admin can cancel from either tab */}
                    {(showDispatch || isAdmin) && (c.status === "PENDING" || c.status === "DISPATCHED") && (
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
          <Button className="gradient-primary text-primary-foreground" onClick={openAdd}>
            <Plus className="h-4 w-4 mr-2" />New Transfer
          </Button>
        ) : undefined}
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="shadow-sm">
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-yellow-600">{stats.pending}</div>
            <p className="text-sm text-muted-foreground mt-1">Pending</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-blue-600">{stats.dispatched}</div>
            <p className="text-sm text-muted-foreground mt-1">In Transit</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-green-600">{stats.received}</div>
            <p className="text-sm text-muted-foreground mt-1">Received</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex gap-4 items-end flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs text-muted-foreground">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Challan no or warehouse name..." className="pl-9" />
              </div>
            </div>
            <div className="w-44">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as ChallanStatus | "ALL")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Status</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="DISPATCHED">Dispatched</SelectItem>
                  <SelectItem value="RECEIVED">Received</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Outgoing / Incoming Tabs */}
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
                Challans you dispatched or are pending dispatch.
                {!isAdmin && " (From your warehouse → destination)"}
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
                Challans sent to your warehouse. Receive them once the goods arrive.
                {!isAdmin && " (From source → your warehouse)"}
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

      {/* Create Challan Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Create Stock Transfer</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>From Warehouse *</Label>
                <Select value={fromWarehouseId || "__none__"} onValueChange={handleFromChange}>
                  <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select warehouse</SelectItem>
                    {fromWarehouseOptions.map(w => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name} <span className="text-muted-foreground">({w.type})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedFromWH && (
                  <p className="text-xs text-muted-foreground">
                    {selectedFromWH.type === 'MAIN'   ? 'Can transfer to: Branch warehouses' : ''}
                    {selectedFromWH.type === 'BRANCH' ? 'Can transfer to: Kitchen of this outlet' : ''}
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
                  <SelectTrigger><SelectValue placeholder={!fromWarehouseId ? "Select source first" : "Select destination"} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select warehouse</SelectItem>
                    {toWarehouseOptions.map(w => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name} <span className="text-muted-foreground">({w.type})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea placeholder="Any notes about this transfer..." value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-20" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Shipping Cost (optional)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  value={shippingCost}
                  onChange={(e) => setShippingCost(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Misc Charges (optional)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  value={miscAmount}
                  onChange={(e) => setMiscAmount(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Items *</Label>
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-end border rounded-lg p-2">
                    <div className="flex-1">
                      <Select value={item.ingredientId || "__none__"} onValueChange={(v) => updateItemRow(idx, "ingredientId", v === "__none__" ? "" : v)}>
                        <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Ingredient" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Select ingredient</SelectItem>
                          {ingredients.map(ig => <SelectItem key={ig.id} value={ig.id}>{ig.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-24">
                      <Input className="h-9 text-xs" type="number" placeholder="Qty" value={item.qty || ""} onChange={(e) => updateItemRow(idx, "qty", Number(e.target.value))} />
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => removeItemRow(idx)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" className="mt-2" onClick={addItemRow}>
                <Plus className="h-3 w-3 mr-1" />Add Item
              </Button>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button className="gradient-primary text-primary-foreground" onClick={handleCreateChallan} disabled={saving}>
              {saving ? "Creating..." : "Create Challan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <span>Stock Transfer Challan: {showDetail?.challanNo}</span>
              {showDetail && (
                <Badge variant="secondary" className={STATUS_STYLE[showDetail.status] || ""}>
                  {showDetail.status}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {showDetail && (
            <div className="space-y-4">
              {/* Created By / Dispatched By Cards */}
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
                    {showDetail.createdBy?.phone && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="h-3 w-3" />{showDetail.createdBy.phone}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1">Created: {new Date(showDetail.createdAt).toLocaleString()}</div>
                  </CardContent>
                </Card>
                <Card className="shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">
                      {showDetail.receivedBy ? "Received By" : showDetail.dispatchedBy ? "Dispatched By" : "Pending Dispatch"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {(showDetail.dispatchedBy ?? showDetail.receivedBy) ? (
                      <>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{(showDetail.receivedBy ?? showDetail.dispatchedBy)!.name}</span>
                          {(showDetail.receivedBy ?? showDetail.dispatchedBy)!.role && (
                            <Badge variant="secondary" className="text-xs">{(showDetail.receivedBy ?? showDetail.dispatchedBy)!.role}</Badge>
                          )}
                        </div>
                        {(showDetail.receivedBy ?? showDetail.dispatchedBy)!.phone && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Phone className="h-3 w-3" />{(showDetail.receivedBy ?? showDetail.dispatchedBy)!.phone}
                          </div>
                        )}
                        {showDetail.dispatchedAt && (
                          <div className="text-xs text-muted-foreground mt-1">Dispatched: {new Date(showDetail.dispatchedAt).toLocaleString()}</div>
                        )}
                        {showDetail.receivedAt && (
                          <div className="text-xs text-muted-foreground">Received: {new Date(showDetail.receivedAt).toLocaleString()}</div>
                        )}
                      </>
                    ) : (
                      <div className="text-sm text-muted-foreground">Not yet dispatched</div>
                    )}
                  </CardContent>
                </Card>
              </div>

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

              {/* Items Table */}
              <div className="rounded-lg border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead>SN</TableHead>
                      <TableHead>Ingredient</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Unit</TableHead>
                      {showDetail.status === "RECEIVED" && <TableHead className="text-right">Received Qty</TableHead>}
                      {showDetail.status === "RECEIVED" && <TableHead className="text-right">Variance</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {showDetail.items.map((item, i) => {
                      const variance = showDetail.status === "RECEIVED" && item.receivedQty !== null
                        ? item.qty - item.receivedQty : null;
                      return (
                        <TableRow key={i}>
                          <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="font-medium">{item.ingredientName}</TableCell>
                          <TableCell className="text-right">{item.qty}</TableCell>
                          <TableCell className="text-sm">{item.unit}</TableCell>
                          {showDetail.status === "RECEIVED" && (
                            <TableCell className="text-right font-medium">
                              {item.receivedQty !== null ? (
                                <span className={item.receivedQty < item.qty ? "text-warning" : "text-success"}>
                                  {item.receivedQty}
                                </span>
                              ) : "—"}
                            </TableCell>
                          )}
                          {showDetail.status === "RECEIVED" && (
                            <TableCell className="text-right text-sm">
                              {variance !== null && variance > 0 ? (
                                <span className="text-warning font-medium">-{variance}</span>
                              ) : variance === 0 ? (
                                <span className="text-success">✓</span>
                              ) : "—"}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
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
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => {
              const c = showDetail;
              if (!c) return;
              const w = window.open("", "_blank", "width=800,height=700");
              if (!w) return;
              const st = c.status;
              const isReceived = st === "RECEIVED";
              const dispUser = c.receivedBy ?? c.dispatchedBy;
              const dispLabel = c.receivedBy ? "Received By" : c.dispatchedBy ? "Dispatched By" : "Pending Dispatch";
              const dispHtml = dispUser
                ? `<div style="text-align:right"><p style="font-size:11px;color:#888;text-transform:uppercase;font-weight:600">${dispLabel}</p><p style="font-weight:600">${dispUser.name}</p><p style="color:#666">${dispUser.role ?? ""}</p>${dispUser.phone ? `<p style="color:#666">${dispUser.phone}</p>` : ""}${c.dispatchedAt ? `<p style="font-size:11px;color:#888">Dispatched: ${new Date(c.dispatchedAt).toLocaleString()}</p>` : ""}${c.receivedAt ? `<p style="font-size:11px;color:#888">Received: ${new Date(c.receivedAt).toLocaleString()}</p>` : ""}</div>`
                : `<div style="text-align:right"><p style="font-size:11px;color:#888;text-transform:uppercase;font-weight:600">Status</p><p style="color:#666">Pending Dispatch</p></div>`;
              const totalExtra = (c.shippingCost ?? 0) + (c.miscAmount ?? 0);
              w.document.write(`<!DOCTYPE html><html><head><title>${c.challanNo}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;padding:30px;color:#333;font-size:13px}h1{font-size:20px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccc;padding:8px;text-align:left}th{background:#f0f0f0;font-weight:600;font-size:12px}.header{text-align:center;border-bottom:2px solid #333;padding-bottom:16px;margin-bottom:16px}.info-grid{display:flex;justify-content:space-between;margin-bottom:16px}.badge{display:inline-block;padding:3px 12px;border-radius:12px;font-size:11px;font-weight:600;margin-top:6px}.summary{text-align:right;margin-top:12px}.cost-box{margin-top:16px;border-top:1px solid #ccc;padding-top:12px;text-align:right}@media print{body{padding:15px}}</style></head><body>`);
              w.document.write(`<div class="header"><h1>Stock Transfer Challan</h1><p style="color:#666;margin-top:4px">${c.challanNo}</p><span class="badge" style="background:${isReceived ? "#e6f4ea;color:#1a7f37" : st === "CANCELLED" ? "#eee;color:#666" : st === "DISPATCHED" ? "#e8f0fe;color:#1a56db" : "#fff8e1;color:#f57f17"}">${st}</span></div>`);
              w.document.write(`<div class="info-grid"><div><p style="font-size:11px;color:#888;text-transform:uppercase;font-weight:600">Created By</p><p style="font-weight:600">${c.createdBy?.name ?? "—"}</p><p style="color:#666">${c.createdBy?.role ?? ""}</p>${c.createdBy?.phone ? `<p style="color:#666">${c.createdBy.phone}</p>` : ""}<p style="font-size:11px;color:#888;margin-top:4px">Date: ${new Date(c.createdAt).toLocaleString()}</p></div>${dispHtml}</div>`);
              w.document.write(`<p style="margin-bottom:8px"><strong>From:</strong> ${c.fromWarehouse.name} (${c.fromWarehouse.type}) &nbsp;→&nbsp; <strong>To:</strong> ${c.toWarehouse.name} (${c.toWarehouse.type})</p>`);
              if (c.notes) w.document.write(`<p style="background:#f5f5f5;padding:8px;border-radius:4px;margin-bottom:12px"><strong>Notes:</strong> ${c.notes}</p>`);
              w.document.write(`<table><thead><tr><th>SN</th><th>Ingredient</th><th style="text-align:right">Qty</th><th>Unit</th>${isReceived ? '<th style="text-align:right">Received Qty</th><th style="text-align:right">Variance</th>' : ""}</tr></thead><tbody>`);
              c.items.forEach((item, idx) => {
                const v = isReceived && item.receivedQty !== null ? item.qty - item.receivedQty : null;
                w.document.write(`<tr><td>${idx + 1}</td><td>${item.ingredientName}</td><td style="text-align:right">${item.qty}</td><td>${item.unit}</td>${isReceived ? `<td style="text-align:right;font-weight:600">${item.receivedQty ?? "—"}</td><td style="text-align:right;color:${v && v > 0 ? "#d97706" : "#16a34a"}">${v !== null ? (v > 0 ? `-${v}` : "✓") : "—"}</td>` : ""}</tr>`);
              });
              w.document.write(`</tbody></table>`);
              if (totalExtra > 0) {
                w.document.write(`<div class="cost-box">${c.shippingCost ? `<p>Shipping Cost: <strong>Rs. ${c.shippingCost.toLocaleString()}</strong></p>` : ""}${c.miscAmount ? `<p>Misc Charges: <strong>Rs. ${c.miscAmount.toLocaleString()}</strong></p>` : ""}<p style="font-size:14px;font-weight:700;margin-top:6px">Total Extra Cost: Rs. ${totalExtra.toLocaleString()}</p></div>`);
              }
              w.document.write(`<p class="summary">Total Items: <strong>${c.items.length}</strong></p></body></html>`);
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

      {/* Receive Confirmation */}
      <AlertDialog open={!!receiveId} onOpenChange={() => setReceiveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Receive this challan?</AlertDialogTitle>
            <AlertDialogDescription>Stock will be added to your warehouse. Confirm only after physically verifying the goods.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReceive} className="bg-success hover:bg-success/90">{saving ? "Receiving..." : "Confirm Received"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

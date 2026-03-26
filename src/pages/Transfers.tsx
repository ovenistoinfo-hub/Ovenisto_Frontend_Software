import { useState, useEffect, useCallback, useMemo } from "react";
import { challanService, type ChallanRecord, type ChallanStatus } from "@/services/challan.service";
import { warehouseService, type WarehouseRecord } from "@/services/warehouse.service";
import { inventoryService, type IngredientRecord } from "@/services/inventory.service";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { Plus, Search, Eye, Truck, CheckCircle, Trash2, ArrowLeftRight, XCircle, PackageCheck } from "lucide-react";
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
      await challanService.create({ fromWarehouseId, toWarehouseId, notes: notes || undefined, items: validItems });
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
        <DialogContent>
          <DialogHeader><DialogTitle>Transfer Details — {showDetail?.challanNo}</DialogTitle></DialogHeader>
          {showDetail && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">From:</span> <strong>{showDetail.fromWarehouse?.name}</strong> <span className="text-xs text-muted-foreground">({showDetail.fromWarehouse?.type})</span></div>
                <div><span className="text-muted-foreground">To:</span> <strong>{showDetail.toWarehouse?.name}</strong> <span className="text-xs text-muted-foreground">({showDetail.toWarehouse?.type})</span></div>
                <div><span className="text-muted-foreground">Status:</span> <Badge variant="secondary" className={STATUS_STYLE[showDetail.status] || ""}>{showDetail.status}</Badge></div>
                <div><span className="text-muted-foreground">Date:</span> {new Date(showDetail.createdAt).toLocaleDateString()}</div>
                {showDetail.dispatchedAt && <div><span className="text-muted-foreground">Dispatched:</span> {new Date(showDetail.dispatchedAt).toLocaleString()}</div>}
                {showDetail.receivedAt   && <div><span className="text-muted-foreground">Received:</span>  {new Date(showDetail.receivedAt).toLocaleString()}</div>}
              </div>
              {showDetail.notes && (
                <div className="border-t pt-2"><span className="text-muted-foreground">Notes:</span> <p>{showDetail.notes}</p></div>
              )}
              <div className="border-t pt-2">
                <p className="font-medium mb-2">Items</p>
                <div className="space-y-1 text-xs">
                  {showDetail.items.map((item, i) => (
                    <div key={i} className="flex justify-between">
                      <span>{item.ingredientName} × {item.qty} {item.unit}</span>
                      {item.receivedQty !== null && <span className="text-success">Received: {item.receivedQty}</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setShowDetail(null)}>Close</Button></DialogFooter>
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

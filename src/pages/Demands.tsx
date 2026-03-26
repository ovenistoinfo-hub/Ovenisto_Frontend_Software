import { useState, useEffect, useCallback, useMemo } from "react";
import { demandService, type DemandRecord, type DemandStatus, type DemandItem } from "@/services/demand.service";
import { warehouseService, type WarehouseRecord } from "@/services/warehouse.service";
import { inventoryService, type IngredientRecord } from "@/services/inventory.service";
import { useData } from "@/contexts/DataContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Search, Eye, CheckCircle2, XCircle, Trash2, ClipboardList } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-blue-100 text-blue-800",
  FULFILLED: "bg-success/10 text-success",
  REJECTED: "bg-muted text-muted-foreground",
};

interface FormItem { ingredientId: string; name: string; requestedQty: number; }

const Demands = () => {
  const { settings } = useData();

  // Data state
  const [demands, setDemands] = useState<DemandRecord[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseRecord[]>([]);
  const [ingredients, setIngredients] = useState<IngredientRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [saving, setSaving] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [showDetail, setShowDetail] = useState<DemandRecord | null>(null);
  const [showApprove, setShowApprove] = useState<DemandRecord | null>(null);
  const [rejectTarget, setRejectTarget] = useState<DemandRecord | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<DemandStatus | "ALL">("ALL");
  const [filterWH, setFilterWH] = useState("");

  // Create form
  const [requestingWHId, setRequestingWHId] = useState("");
  const [supplyingWHId, setSupplyingWHId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<FormItem[]>([{ ingredientId: "", name: "", requestedQty: 0 }]);

  // Approve form (editable approvedQty per item)
  const [approveItems, setApproveItems] = useState<{ id: string; approvedQty: number }[]>([]);

  const fetchDemands = useCallback(async () => {
    try {
      const data = await demandService.getAll({
        ...(filterStatus !== "ALL" && { status: filterStatus }),
        ...(filterWH && { requestingWHId: filterWH }),
      });
      setDemands(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load demands");
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterWH]);

  useEffect(() => {
    Promise.all([warehouseService.getAll(), inventoryService.getIngredients()])
      .then(([whList, ingList]) => {
        setWarehouses(whList);
        setIngredients(ingList);
      })
      .catch((err: any) => toast.error(err.message || "Failed to load data"));
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchDemands();
  }, [fetchDemands]);

  const filtered = demands.filter(d =>
    (d.demandNo || "").toLowerCase().includes(search.toLowerCase()) ||
    (d.requestingWH?.name || "").toLowerCase().includes(search.toLowerCase()) ||
    (d.supplyingWH?.name || "").toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: demands.length,
    pending: demands.filter(d => d.status === "PENDING").length,
    approved: demands.filter(d => d.status === "APPROVED").length,
    rejected: demands.filter(d => d.status === "REJECTED").length,
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

  // Only KITCHEN and BRANCH can create demands
  const requestingOptions = useMemo(() =>
    warehouses.filter(w => w.type === 'KITCHEN' || w.type === 'BRANCH'),
    [warehouses]
  );

  const handleReqWHChange = (v: string) => {
    setRequestingWHId(v === "__none__" ? "" : v);
    setSupplyingWHId(""); // reset supplying when requesting changes
  };

  const openAdd = () => {
    setRequestingWHId(""); setSupplyingWHId(""); setNotes("");
    setItems([{ ingredientId: "", name: "", requestedQty: 0 }]);
    setShowDialog(true);
  };

  const openApprove = (d: DemandRecord) => {
    setApproveItems(d.items.map(i => ({ id: i.id, approvedQty: i.requestedQty })));
    setShowApprove(d);
  };

  const addItemRow = () => setItems(p => [...p, { ingredientId: "", name: "", requestedQty: 0 }]);
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

  const handleCreate = async () => {
    if (!requestingWHId) { toast.error("Requesting warehouse is required"); return; }
    if (!supplyingWHId) { toast.error("Supplying warehouse is required"); return; }
    if (requestingWHId === supplyingWHId) { toast.error("Warehouses must be different"); return; }
    if (items.every(i => !i.ingredientId || i.requestedQty <= 0)) { toast.error("Add at least one item"); return; }

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
      await fetchDemands();
    } catch (err: any) {
      toast.error(err.message || "Failed to create demand");
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!showApprove) return;
    setSaving(true);
    try {
      const result = await demandService.approve(showApprove.id, { items: approveItems });
      const challanNo = (result as any).challanNo;
      toast.success(`Demand approved${challanNo ? ` — Challan ${challanNo} created` : ""}`);
      setShowApprove(null);
      await fetchDemands();
    } catch (err: any) {
      toast.error(err.message || "Failed to approve demand");
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
      await fetchDemands();
    } catch (err: any) {
      toast.error(err.message || "Failed to reject demand");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="space-y-6"><Skeleton className="h-10 w-full rounded-lg" />{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg mt-2" />)}</div>;

  return (
    <div className="space-y-6">
      <PageHeader icon={<ClipboardList className="h-5 w-5" />} title="Demand Lists" subtitle="Warehouse stock request and approval management" actions={<Button className="gradient-primary text-primary-foreground" onClick={openAdd}><Plus className="h-4 w-4 mr-2" />New Demand</Button>} />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="shadow-sm"><CardContent className="pt-6"><div className="text-3xl font-bold text-foreground">{stats.total}</div><p className="text-sm text-muted-foreground mt-1">Total</p></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="pt-6"><div className="text-3xl font-bold text-yellow-600">{stats.pending}</div><p className="text-sm text-muted-foreground mt-1">Pending</p></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="pt-6"><div className="text-3xl font-bold text-blue-600">{stats.approved}</div><p className="text-sm text-muted-foreground mt-1">Approved</p></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="pt-6"><div className="text-3xl font-bold text-muted-foreground">{stats.rejected}</div><p className="text-sm text-muted-foreground mt-1">Rejected</p></CardContent></Card>
      </div>

      {/* Filters */}
      <Card className="shadow-sm"><CardHeader className="pb-3">
        <div className="flex gap-4 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]"><Label className="text-xs text-muted-foreground">Search</Label><div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by demand no or warehouse..." className="pl-9" /></div></div>
          <div className="w-40"><Label className="text-xs text-muted-foreground">Status</Label><Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as DemandStatus | "ALL")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">All Status</SelectItem><SelectItem value="PENDING">Pending</SelectItem><SelectItem value="APPROVED">Approved</SelectItem><SelectItem value="FULFILLED">Fulfilled</SelectItem><SelectItem value="REJECTED">Rejected</SelectItem></SelectContent></Select></div>
          <div className="w-48"><Label className="text-xs text-muted-foreground">Requesting WH</Label><Select value={filterWH || "__all__"} onValueChange={(v) => setFilterWH(v === "__all__" ? "" : v)}><SelectTrigger><SelectValue placeholder="All" /></SelectTrigger><SelectContent><SelectItem value="__all__">All Warehouses</SelectItem>{warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent></Select></div>
        </div>
      </CardHeader></Card>

      {/* Table */}
      <Card className="shadow-sm"><CardContent>
        {filtered.length === 0 ? (
          <div className="text-center py-12"><ClipboardList className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" /><p className="text-muted-foreground">No demands found</p><Button size="sm" className="gradient-primary text-primary-foreground mt-3" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Create Demand</Button></div>
        ) : (
          <div className="rounded-lg border overflow-auto max-h-[calc(100vh-420px)]">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>SN</TableHead><TableHead>Demand No</TableHead><TableHead>Requesting WH</TableHead><TableHead>Supplying WH</TableHead><TableHead className="text-center">Items</TableHead><TableHead>Status</TableHead><TableHead>Requested By</TableHead><TableHead>Created At</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
              <TableBody>{filtered.map((d, i) => (
                <TableRow key={d.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell>{i + 1}</TableCell>
                  <TableCell className="font-medium">{d.demandNo}</TableCell>
                  <TableCell className="text-sm">{d.requestingWH?.name}</TableCell>
                  <TableCell className="text-sm">{d.supplyingWH?.name}</TableCell>
                  <TableCell className="text-center text-sm">{d.items.length}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant="secondary" className={STATUS_STYLE[d.status] || ""}>{d.status}</Badge>
                      {d.status === "APPROVED" && d.challanId && (
                        <span className="text-xs text-blue-600 font-medium">Challan linked</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{d.requestedBy?.name || "—"}</TableCell>
                  <TableCell className="text-sm">{new Date(d.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell><div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowDetail(d)}><Eye className="h-3 w-3" /></Button>
                    {d.status === "PENDING" && (
                      <>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => openApprove(d)}><CheckCircle2 className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => { setRejectTarget(d); setRejectReason(""); }}><XCircle className="h-4 w-4" /></Button>
                      </>
                    )}
                  </div></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
        )}
      </CardContent></Card>

      {/* Create Demand Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Create Stock Demand</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Requesting Warehouse *</Label>
                <Select value={requestingWHId || "__none__"} onValueChange={handleReqWHChange}>
                  <SelectTrigger><SelectValue placeholder="Who needs stock?" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select warehouse</SelectItem>
                    {requestingOptions.map(w => <SelectItem key={w.id} value={w.id}>{w.name} ({w.type})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Supplying Warehouse *</Label>
                <Select
                  value={supplyingWHId || "__none__"}
                  onValueChange={(v) => setSupplyingWHId(v === "__none__" ? "" : v)}
                  disabled={!requestingWHId || supplyingOptions.length === 0}
                >
                  <SelectTrigger><SelectValue placeholder={!requestingWHId ? "Select requesting first" : "Select supplier"} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select warehouse</SelectItem>
                    {supplyingOptions.map(w => <SelectItem key={w.id} value={w.id}>{w.name} ({w.type})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea placeholder="Reason or notes for this demand..." value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-16" />
            </div>
            <div>
              <Label className="mb-2 block">Items *</Label>
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-end border rounded-lg p-2">
                    <div className="flex-1"><Select value={item.ingredientId || "__none__"} onValueChange={(v) => updateItemRow(idx, "ingredientId", v === "__none__" ? "" : v)}><SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Ingredient" /></SelectTrigger><SelectContent><SelectItem value="__none__">Select ingredient</SelectItem>{ingredients.map(ig => <SelectItem key={ig.id} value={ig.id}>{ig.name}</SelectItem>)}</SelectContent></Select></div>
                    <div className="w-24"><Input className="h-9 text-xs" type="number" placeholder="Qty" value={item.requestedQty || ""} onChange={(e) => updateItemRow(idx, "requestedQty", Number(e.target.value))} /></div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => removeItemRow(idx)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" className="mt-2" onClick={addItemRow}><Plus className="h-3 w-3 mr-1" />Add Item</Button>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button className="gradient-primary text-primary-foreground" onClick={handleCreate} disabled={saving}>{saving ? "Creating..." : "Create Demand"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Dialog */}
      <Dialog open={!!showApprove} onOpenChange={() => setShowApprove(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Approve Demand — {showApprove?.demandNo}</DialogTitle></DialogHeader>
          {showApprove && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Review and adjust quantities before approving. A transfer challan will be auto-created.</p>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader><TableRow className="bg-muted/50"><TableHead>Ingredient</TableHead><TableHead className="text-center">Requested</TableHead><TableHead className="text-center">Approved Qty</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {showApprove.items.map((item: DemandItem) => {
                      const approveItem = approveItems.find(a => a.id === item.id);
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="text-sm">{item.ingredientName} <span className="text-muted-foreground">({item.unit})</span></TableCell>
                          <TableCell className="text-center text-sm">{item.requestedQty}</TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number"
                              className="h-8 w-20 text-center text-xs mx-auto"
                              value={approveItem?.approvedQty ?? item.requestedQty}
                              onChange={(e) => setApproveItems(prev => prev.map(a => a.id === item.id ? { ...a, approvedQty: Number(e.target.value) } : a))}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowApprove(null)}>Cancel</Button>
            <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={handleApprove} disabled={saving}>{saving ? "Approving..." : "Approve & Create Challan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Demand Details — {showDetail?.demandNo}</DialogTitle></DialogHeader>
          {showDetail && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Requesting WH:</span> <strong>{showDetail.requestingWH?.name}</strong></div>
                <div><span className="text-muted-foreground">Supplying WH:</span> <strong>{showDetail.supplyingWH?.name}</strong></div>
                <div><span className="text-muted-foreground">Status:</span> <Badge variant="secondary" className={STATUS_STYLE[showDetail.status] || ""}>{showDetail.status}</Badge></div>
                <div><span className="text-muted-foreground">Date:</span> {new Date(showDetail.createdAt).toLocaleDateString()}</div>
                {showDetail.requestedBy && <div><span className="text-muted-foreground">Requested by:</span> {showDetail.requestedBy.name}</div>}
                {showDetail.approvedBy  && <div><span className="text-muted-foreground">Approved by:</span> {showDetail.approvedBy.name}</div>}
              </div>
              {showDetail.notes && <div className="border-t pt-2"><span className="text-muted-foreground">Notes:</span> <p>{showDetail.notes}</p></div>}
              {showDetail.rejectionReason && <div className="border-t pt-2 text-destructive"><span className="font-medium">Rejection reason:</span> {showDetail.rejectionReason}</div>}
              <div className="border-t pt-2">
                <p className="font-medium mb-2">Items</p>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader><TableRow className="bg-muted/50 text-xs"><TableHead>Ingredient</TableHead><TableHead className="text-center">Requested</TableHead><TableHead className="text-center">Approved</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {showDetail.items.map((item: DemandItem) => (
                        <TableRow key={item.id} className="text-xs">
                          <TableCell>{item.ingredientName} <span className="text-muted-foreground">({item.unit})</span></TableCell>
                          <TableCell className="text-center">{item.requestedQty}</TableCell>
                          <TableCell className="text-center">{item.approvedQty ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setShowDetail(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

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

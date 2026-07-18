import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { LayoutGrid, Plus, Loader2, QrCode, Download, Printer, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import { tableService, type TableRecord, type CreateTableInput } from "@/services/table.service";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useTableEvents } from "@/hooks/use-table-events";
import { useData } from "@/contexts/DataContext";
import { QRCodeSVG } from "qrcode.react";

const statusConfig: Record<string, { color: string; bg: string; emoji: string }> = {
  available:        { color: "text-success",          bg: "bg-success/10 border-success/30",          emoji: "🟢" },
  occupied:         { color: "text-destructive",       bg: "bg-destructive/10 border-destructive/30",  emoji: "🔴" },
  "bill-requested": { color: "text-destructive font-bold", bg: "bg-destructive/10 border-destructive/30 animate-pulse", emoji: "🧾" },
  reserved:         { color: "text-warning",           bg: "bg-warning/10 border-warning/30",          emoji: "🟡" },
  maintenance:      { color: "text-muted-foreground",  bg: "bg-muted border-muted",                    emoji: "🔧" },
};

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

type FormState = Partial<CreateTableInput> & { status?: string };

const TableLayout = () => {
  const { user } = useAuth();
  const { settings } = useData();
  const restaurantName = settings.businessName || "Ovenisto";
  const isSuperAdmin = user?.role === "Super Admin";
  const [tables,     setTables]     = useState<TableRecord[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [floorTab,   setFloorTab]   = useState("All");
  const [showDialog, setShowDialog] = useState(false);
  const [editId,     setEditId]     = useState<string | null>(null);
  const [deleteId,   setDeleteId]   = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ number: "", capacity: 4, floor: "Main Hall", shape: "square", status: "available" });
  const [selectedQrTable, setSelectedQrTable] = useState<TableRecord | null>(null);
  const qrRef = useRef<HTMLDivElement>(null);

  const downloadPNG = useCallback(() => {
    if (!selectedQrTable) return;
    const svg = qrRef.current?.querySelector("svg");
    if (!svg) return;
    const canvas = document.createElement("canvas");
    const size = 600;
    canvas.width = size; canvas.height = size + 100;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const svgData = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 50, 30, 500, 500);
      ctx.fillStyle = "#000000"; ctx.font = "bold 24px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(`${restaurantName} — Table ${selectedQrTable.number}`, size / 2, size + 70);
      const a = document.createElement("a");
      a.download = `qr-table-${selectedQrTable.number}.png`;
      a.href = canvas.toDataURL("image/png"); a.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  }, [selectedQrTable, restaurantName]);

  const printQR = useCallback(() => {
    if (!selectedQrTable) return;
    const svg = qrRef.current?.querySelector("svg");
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html><head><title>QR - Table ${selectedQrTable.number}</title><style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;margin:0}h2{margin-top:16px}p{color:#666;margin:4px 0}@media print{button{display:none}}</style></head><body>${svgData}<h2>${restaurantName}</h2><p>Scan to order at Table ${selectedQrTable.number}</p><br/><button onclick="window.print()">Print</button></body></html>`);
    win.document.close();
  }, [selectedQrTable, restaurantName]);

  const loadTables = useCallback(() => {
    tableService.getTables()
      .then(setTables)
      .catch(() => toast.error("Failed to load tables"));
  }, []);

  useEffect(() => {
    tableService.getTables()
      .then(setTables)
      .catch(() => toast.error("Failed to load tables"))
      .finally(() => setLoading(false));
  }, []);

  useTableEvents(loadTables);

  const floors   = useMemo(() => ["All", ...Array.from(new Set(tables.map((t) => t.floor ?? "").filter(Boolean)))], [tables]);
  const filtered = useMemo(() => floorTab === "All" ? tables : tables.filter((t) => t.floor === floorTab), [tables, floorTab]);

  const available     = filtered.filter((t) => t.status === "available").length;
  const occupied      = filtered.filter((t) => t.status === "occupied").length;
  const billRequested = filtered.filter((t) => t.status === "bill-requested").length;
  const reserved      = filtered.filter((t) => t.status === "reserved").length;
  const maintenance   = filtered.filter((t) => t.status === "maintenance").length;
  const totalCapacity = filtered.reduce((s, t) => s + t.capacity, 0);

  const openAdd  = () => {
    setEditId(null);
    setForm({ number: String(tables.length + 1), capacity: 4, floor: floors[1] || "Main Hall", shape: "square", status: "available" });
    setShowDialog(true);
  };
  const openEdit = (t: TableRecord) => {
    setEditId(t.id);
    setForm({ number: t.number, capacity: t.capacity, floor: t.floor ?? "", shape: t.shape ?? "square", status: t.status });
    setShowDialog(true);
  };

  const handleSave = async () => {
    const tableNumStr = String(form.number ?? "").trim();
    if (!tableNumStr) { toast.error("Table number required"); return; }
    if (!/^\d+$/.test(tableNumStr)) {
      toast.error("Table number must be a valid positive integer");
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        const updated = await tableService.updateTable(editId, form);
        setTables((prev) => prev.map((t) => t.id === editId ? updated : t));
        toast.success("Updated");
      } else {
        const created = await tableService.createTable(form as CreateTableInput);
        setTables((prev) => [...prev, created]);
        toast.success("Table added");
      }
      setShowDialog(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Failed to save table");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await tableService.deleteTable(deleteId);
      setTables((prev) => prev.filter((t) => t.id !== deleteId));
      toast.success("Deleted");
    } catch {
      toast.error("Failed to delete table");
    } finally {
      setDeleteId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 flex flex-col min-h-[calc(100vh-140px)]">
      <div className="space-y-6 flex-grow">
      <PageHeader
        icon={<LayoutGrid className="h-5 w-5" />}
        title="Table Layout"
        subtitle="Restaurant floor plan and table management"
        actions={!isSuperAdmin ? <Button className="gradient-primary text-primary-foreground" onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Table</Button> : undefined}
      />

      {/* Add/Edit Dialog (Relocated to top) */}
      {showDialog && (!isSuperAdmin || editId) && (
        <Card className="shadow-sm border-primary/30">
          <CardHeader className="pb-3"><CardTitle className="text-base">{editId ? "Edit" : "Add"} Table</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Table Number</Label><Input value={String(form.number ?? "")} onChange={(e) => setForm((p) => ({ ...p, number: e.target.value }))} /></div>
              <div><Label>Capacity</Label><Input type="number" value={form.capacity ?? ""} onChange={(e) => setForm((p) => ({ ...p, capacity: Number(e.target.value) }))} /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Floor</Label><Input value={form.floor ?? ""} onChange={(e) => setForm((p) => ({ ...p, floor: e.target.value }))} placeholder="Main Hall" /></div>
              <div>
                <Label>Shape</Label>
                <Select value={form.shape ?? "square"} onValueChange={(v) => setForm((p) => ({ ...p, shape: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="square">Square</SelectItem>
                    <SelectItem value="round">Round</SelectItem>
                    <SelectItem value="rectangle">Rectangle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status ?? "available"} onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="occupied">Occupied</SelectItem>
                  <SelectItem value="bill-requested">Bill Requested</SelectItem>
                  <SelectItem value="reserved">Reserved</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              {editId && (
                <Button variant="destructive" onClick={() => { setShowDialog(false); setDeleteId(editId); }} className="mr-auto">Delete</Button>
              )}
              <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button className="gradient-primary text-primary-foreground" onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}Save
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-1.5 flex-wrap">
        {floors.map((f) => (
          <Button key={f} variant={floorTab === f ? "default" : "outline"} size="sm" onClick={() => setFloorTab(f)}
            className={floorTab === f ? "gradient-primary text-primary-foreground" : ""}>{f}</Button>
        ))}
      </div>

      <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {filtered.map((t) => {
          const isMaint = t.status === "maintenance";
          
          const statusDotColor =
            t.status === "available" ? "bg-success shadow-[0_0_8px_rgba(34,197,94,0.5)]" :
            t.status === "occupied" ? "bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.5)]" :
            t.status === "bill-requested" ? "bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.5)]" :
            t.status === "reserved" ? "bg-warning shadow-[0_0_8px_rgba(234,179,8,0.5)]" :
            "bg-muted-foreground";

          const statusBorderClass =
            t.status === "available" ? "border-success/35" :
            t.status === "occupied" ? "border-destructive/35" :
            t.status === "bill-requested" ? "border-destructive/60" :
            t.status === "reserved" ? "border-warning/35" :
            "border-muted";

          const chairBgClass =
            t.status === "available" ? "bg-success/50" :
            t.status === "occupied" ? "bg-destructive/50" :
            t.status === "bill-requested" ? "bg-destructive animate-pulse" :
            t.status === "reserved" ? "bg-warning/50" :
            "bg-muted-foreground/50";

          return (
            <div key={t.id} className="p-1">
              <Card
                onClick={() => openEdit(t)}
                className={cn(
                  "shadow-md bg-zinc-900/40 border border-zinc-800/80 rounded-2xl flex flex-col justify-between p-4 h-48 w-full cursor-pointer hover:border-zinc-700 hover:-translate-y-1 hover:shadow-lg hover:shadow-zinc-950/20 transition-all duration-300 relative overflow-hidden",
                  t.status === "bill-requested" && "animate-pulse border-destructive/30",
                  isMaint && "opacity-50 cursor-not-allowed"
                )}
              >
                {/* Top Bar: Table Label & Pulse Status */}
                <div className="flex items-center justify-between w-full select-none shrink-0 relative">
                  <div className="flex items-center gap-1.5">
                    <span className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      t.status === "bill-requested" && "animate-ping",
                      statusDotColor
                    )} />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Table {t.number}</span>
                  </div>
                  {/* QR Code Action */}
                  {!isSuperAdmin && (
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-6 w-6 rounded bg-zinc-950/40 border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 shadow-sm transition-all duration-200 z-20"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedQrTable(t);
                      }}
                    >
                      <QrCode className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                    </Button>
                  )}
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
                  <span className="text-[10px] text-muted-foreground/50 font-semibold tracking-wide">
                    {t.floor || "Floor"}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-bold bg-zinc-950/40 px-2 py-0.5 rounded-full border border-zinc-800/85">
                      <Users className="h-3 w-3 text-muted-foreground/60" />
                      <span>{t.capacity}</span>
                    </div>
                    <Badge variant="secondary" className={cn(
                      "text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider leading-none border-none",
                      t.status === "available" && "bg-success/10 text-success hover:bg-success/10",
                      t.status === "occupied" && "bg-destructive/10 text-destructive hover:bg-destructive/10",
                      t.status === "bill-requested" && "bg-destructive/20 text-destructive hover:bg-destructive/20 animate-pulse",
                      t.status === "reserved" && "bg-warning/10 text-warning hover:bg-warning/10",
                      t.status === "maintenance" && "bg-muted text-muted-foreground hover:bg-muted",
                    )}>
                      {t.status === "bill-requested" ? "Bill Req" : t.status === "available" ? "Free" : t.status}
                    </Badge>
                  </div>
                </div>
              </Card>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-muted-foreground col-span-full text-center py-12">No tables found</p>
        )}
      </div>

      </div>

      <Card className="shadow-sm mt-auto">
        <CardContent className="p-4 grid grid-cols-2 xs:grid-cols-3 sm:flex sm:flex-wrap gap-4 sm:gap-6 text-xs sm:text-sm">
          <div className="col-span-2 xs:col-span-1"><span className="text-muted-foreground">Total:</span> <strong>{filtered.length} tables</strong></div>
          <div>🟢 <strong>{available} available</strong></div>
          <div>🔴 <strong>{occupied} occupied</strong></div>
          <div>🧾 <strong>{billRequested} bill req.</strong></div>
          <div>🟡 <strong>{reserved} reserved</strong></div>
          <div>🔧 <strong>{maintenance} maintenance</strong></div>
          <div className="col-span-2 xs:col-span-1"><span className="text-muted-foreground">Capacity:</span> <strong>{totalCapacity} guests</strong></div>
        </CardContent>
      </Card>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Table?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* QR Code Presentation Dialog */}
      <Dialog open={!!selectedQrTable} onOpenChange={() => setSelectedQrTable(null)}>
        <DialogContent className="w-[90vw] max-w-[360px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-center text-lg font-bold">Table {selectedQrTable?.number} QR Code</DialogTitle>
          </DialogHeader>
          {selectedQrTable && (
            <div className="flex flex-col items-center space-y-5 py-4">
              <div ref={qrRef} className="bg-white p-4 rounded-xl border border-border shadow-sm">
                <QRCodeSVG
                  value={`${window.location.origin}/self-order?table=${selectedQrTable.number}`}
                  size={180}
                  level="H"
                  includeMargin
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={downloadPNG}>
                  <Download className="h-4 w-4 mr-1.5" />Download PNG
                </Button>
                <Button variant="outline" size="sm" onClick={printQR}>
                  <Printer className="h-4 w-4 mr-1.5" />Print QR
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TableLayout;

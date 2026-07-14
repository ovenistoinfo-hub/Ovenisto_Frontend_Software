import { useState, useMemo, useEffect } from "react";
import { LayoutGrid, Plus, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { tableService, type TableRecord, type CreateTableInput } from "@/services/table.service";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const statusConfig: Record<string, { color: string; bg: string; emoji: string }> = {
  available:   { color: "text-success",          bg: "bg-success/10 border-success/30",          emoji: "🟢" },
  occupied:    { color: "text-destructive",       bg: "bg-destructive/10 border-destructive/30",  emoji: "🔴" },
  reserved:    { color: "text-warning",           bg: "bg-warning/10 border-warning/30",          emoji: "🟡" },
  maintenance: { color: "text-muted-foreground",  bg: "bg-muted border-muted",                    emoji: "🔧" },
};

type FormState = Partial<CreateTableInput> & { status?: string };

const TableLayout = () => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "Super Admin";
  const [tables,     setTables]     = useState<TableRecord[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [floorTab,   setFloorTab]   = useState("All");
  const [showDialog, setShowDialog] = useState(false);
  const [editId,     setEditId]     = useState<string | null>(null);
  const [deleteId,   setDeleteId]   = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ number: "", capacity: 4, floor: "Main Hall", shape: "square", status: "available" });

  useEffect(() => {
    tableService.getTables()
      .then(setTables)
      .catch(() => toast.error("Failed to load tables"))
      .finally(() => setLoading(false));
  }, []);

  const floors   = useMemo(() => ["All", ...Array.from(new Set(tables.map((t) => t.floor ?? "").filter(Boolean)))], [tables]);
  const filtered = useMemo(() => floorTab === "All" ? tables : tables.filter((t) => t.floor === floorTab), [tables, floorTab]);

  const available     = filtered.filter((t) => t.status === "available").length;
  const occupied      = filtered.filter((t) => t.status === "occupied").length;
  const reserved      = filtered.filter((t) => t.status === "reserved").length;
  const totalCapacity = filtered.reduce((s, t) => s + t.capacity, 0);

  const openAdd  = () => {
    setEditId(null);
    setForm({ number: `T-${tables.length + 1}`, capacity: 4, floor: floors[1] || "Main Hall", shape: "square", status: "available" });
    setShowDialog(true);
  };
  const openEdit = (t: TableRecord) => {
    setEditId(t.id);
    setForm({ number: t.number, capacity: t.capacity, floor: t.floor ?? "", shape: t.shape ?? "square", status: t.status });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!String(form.number ?? "").trim()) { toast.error("Table number required"); return; }
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
    <div className="space-y-6">
      <PageHeader
        icon={<LayoutGrid className="h-5 w-5" />}
        title="Table Layout"
        subtitle="Restaurant floor plan and table management"
        actions={!isSuperAdmin ? <Button className="gradient-primary text-primary-foreground" onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Table</Button> : undefined}
      />

      <div className="flex gap-1.5 flex-wrap">
        {floors.map((f) => (
          <Button key={f} variant={floorTab === f ? "default" : "outline"} size="sm" onClick={() => setFloorTab(f)}
            className={floorTab === f ? "gradient-primary text-primary-foreground" : ""}>{f}</Button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {filtered.map((t) => {
          const cfg = statusConfig[t.status] ?? statusConfig.available;
          return (
            <Card key={t.id} className={cn("shadow-sm border-2 cursor-pointer hover:shadow-md transition-all", cfg.bg)} onClick={() => openEdit(t)}>
              <CardContent className="p-4 text-center space-y-2">
                <p className="font-bold text-lg">{t.number}</p>
                <p className="text-xl">{cfg.emoji}</p>
                <p className="text-xs text-muted-foreground">{t.capacity} seats{t.shape ? ` · ${t.shape}` : ""}</p>
                <Badge variant="secondary" className={`${cfg.color} capitalize`}>{t.status}</Badge>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-muted-foreground col-span-full text-center py-12">No tables found</p>
        )}
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-4 flex flex-wrap gap-6 text-sm">
          <div><span className="text-muted-foreground">Total:</span> <strong>{filtered.length} tables</strong></div>
          <div>🟢 <strong>{available} available</strong></div>
          <div>🔴 <strong>{occupied} occupied</strong></div>
          <div>🟡 <strong>{reserved} reserved</strong></div>
          <div><span className="text-muted-foreground">Capacity:</span> <strong>{totalCapacity} guests</strong></div>
        </CardContent>
      </Card>

      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>🟢 Available</span><span>🔴 Occupied</span><span>🟡 Reserved</span><span>🔧 Maintenance</span>
      </div>

      {/* Add/Edit Dialog */}
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
    </div>
  );
};

export default TableLayout;

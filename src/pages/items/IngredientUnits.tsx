import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Search, Pencil, Trash2, Ruler } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { inventoryService, type UnitRecord } from "@/services/inventory.service";
import { PageHeader } from "@/components/ui/page-header";

const STANDARD_UNITS = [
  { name: "Kilogram", symbol: "kg" },
  { name: "Gram", symbol: "g" },
  { name: "Milligram", symbol: "mg" },
  { name: "Pound", symbol: "lb" },
  { name: "Ounce", symbol: "oz" },
  { name: "Tola", symbol: "tola" },
  { name: "Liter", symbol: "L" },
  { name: "Milliliter", symbol: "ml" },
  { name: "Cup", symbol: "cup" },
  { name: "Tablespoon", symbol: "tbsp" },
  { name: "Teaspoon", symbol: "tsp" },
  { name: "Piece", symbol: "pc" },
  { name: "Dozen", symbol: "doz" },
  { name: "Pack", symbol: "pack" },
  { name: "Box", symbol: "box" },
  { name: "Bag", symbol: "bag" },
  { name: "Bottle", symbol: "btl" },
  { name: "Can", symbol: "can" },
  { name: "Crate", symbol: "crt" },
  { name: "Sachet", symbol: "sachet" },
];

interface ConversionRow { toUnitId: string; factor: number; }

interface UnitForm {
  name: string;
  symbol: string;
  status: "active" | "inactive";
  conversions: ConversionRow[];
}

const emptyForm: UnitForm = { name: "", symbol: "", status: "active", conversions: [] };

const IngredientUnits = () => {
  const [list, setList] = useState<UnitRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<UnitForm>(emptyForm);

  const fetchUnits = useCallback(async () => {
    try {
      const data = await inventoryService.getUnits();
      setList(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load units");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUnits(); }, [fetchUnits]);

  const filtered = list.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.symbol.toLowerCase().includes(search.toLowerCase())
  );

  // Merged list: all standard units (even if not in DB) + custom DB units
  const mergedConversionTargets = useMemo(() => {
    const editingName = list.find(u => u.id === editingId)?.name?.toLowerCase() || "__NONE__";
    const standardEntries = STANDARD_UNITS.map(su => {
      const existing = list.find(u => u.name.toLowerCase() === su.name.toLowerCase());
      return {
        id: existing?.id || `__std__${su.name}`,
        name: su.name,
        symbol: su.symbol,
        existsInDb: !!existing,
      };
    });
    const customDbUnits = list
      .filter(u => u.id !== editingId)
      .filter(u => !STANDARD_UNITS.some(su => su.name.toLowerCase() === u.name.toLowerCase()))
      .map(u => ({ id: u.id, name: u.name, symbol: u.symbol || "", existsInDb: true }));
    return [...standardEntries, ...customDbUnits].filter(
      u => u.id !== editingId && u.name.toLowerCase() !== editingName
    );
  }, [list, editingId]);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowDialog(true);
  };

  const openEdit = (item: UnitRecord) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      symbol: item.symbol || "",
      status: item.status as "active" | "inactive",
      conversions: (item.conversionsFrom || []).map(c => ({
        toUnitId: c.toUnit.id,
        factor: c.factor,
      })),
    });
    setShowDialog(true);
  };

  const handleStandardSelect = (stdName: string) => {
    const std = STANDARD_UNITS.find(s => s.name === stdName);
    if (std) {
      setForm(p => ({ ...p, name: std.name, symbol: std.symbol }));
    }
  };

  const addConversionRow = () => {
    setForm(p => ({ ...p, conversions: [...p.conversions, { toUnitId: "", factor: 0 }] }));
  };
  const removeConversionRow = (idx: number) => {
    setForm(p => ({ ...p, conversions: p.conversions.filter((_, i) => i !== idx) }));
  };
  const updateConversionRow = (idx: number, field: "toUnitId" | "factor", value: string | number) => {
    setForm(p => ({
      ...p,
      conversions: p.conversions.map((c, i) => i === idx ? { ...c, [field]: value } : c),
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Unit name is required"); return; }
    if (!form.symbol.trim()) { toast.error("Unit symbol is required"); return; }

    const validConversions = form.conversions.filter(c => c.toUnitId && c.factor > 0);

    setSaving(true);
    try {
      // Auto-create any standard units that don't exist in DB yet
      const resolvedConversions: { toUnitId: string; factor: number }[] = [];
      for (const conv of validConversions) {
        if (conv.toUnitId.startsWith("__std__")) {
          const stdName = conv.toUnitId.replace("__std__", "");
          const stdUnit = STANDARD_UNITS.find(su => su.name === stdName);
          if (stdUnit) {
            const created = await inventoryService.createUnit({
              name: stdUnit.name,
              symbol: stdUnit.symbol,
              status: "active",
            });
            resolvedConversions.push({ toUnitId: created.id, factor: conv.factor });
          }
        } else {
          resolvedConversions.push(conv);
        }
      }

      if (editingId) {
        await inventoryService.updateUnit(editingId, {
          name: form.name,
          symbol: form.symbol,
          status: form.status,
          conversions: resolvedConversions,
        });
        toast.success("Updated");
      } else {
        await inventoryService.createUnit({
          name: form.name,
          symbol: form.symbol,
          status: form.status,
          conversions: resolvedConversions,
        });
        toast.success("Unit added");
      }
      setShowDialog(false);
      setEditingId(null);
      await fetchUnits();
    } catch (err: any) {
      toast.error(err.message || "Failed to save unit");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await inventoryService.deleteUnit(id);
      toast.success("Deleted");
      await fetchUnits();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete unit");
    }
  };

  if (loading) return <div className="space-y-6"><Skeleton className="h-10 w-full rounded-lg" />{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg mt-2" />)}</div>;

  return (
    <div className="space-y-6">
      <PageHeader icon={<Ruler className="h-5 w-5" />} title="Ingredient Units" subtitle="Measurement units & conversions" actions={<Button className="gradient-primary text-primary-foreground" onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Unit</Button>} />
      <Card className="shadow-sm"><CardHeader className="pb-3"><div className="relative max-w-sm"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="pl-9" /></div></CardHeader>
        <CardContent>{filtered.length === 0 ? (<div className="text-center py-12"><Ruler className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" /><p className="text-muted-foreground">No units found</p><p className="text-xs text-muted-foreground mt-1.5">Add your first unit to get started.</p><Button size="sm" className="gradient-primary text-primary-foreground mt-3" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Unit</Button></div>) : (
          <div className="rounded-lg border overflow-auto max-h-[calc(100vh-300px)]"><Table><TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>SN</TableHead><TableHead>Name</TableHead><TableHead>Symbol</TableHead><TableHead>Conversions</TableHead><TableHead>Ingredients</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
            <TableBody>{filtered.map((u, i) => (
              <TableRow key={u.id} className="hover:bg-muted/30 transition-colors">
                <TableCell>{i+1}</TableCell>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell><Badge variant="outline" className="font-mono">{u.symbol || "—"}</Badge></TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {u.conversionsFrom && u.conversionsFrom.length > 0
                    ? `${u.conversionsFrom.length} conversion${u.conversionsFrom.length > 1 ? "s" : ""}`
                    : "None"}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">{u._count?.ingredients ?? 0}</TableCell>
                <TableCell><Badge variant="secondary" className={u.status === "active" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}>{u.status}</Badge></TableCell>
                <TableCell><div className="flex gap-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(u)}><Pencil className="h-3 w-3" /></Button>
              <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {u.name}?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone. All conversions for this unit will also be removed.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(u.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
            </div></TableCell></TableRow>))}</TableBody></Table></div>
        )}</CardContent></Card>

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "Edit" : "Add"} Ingredient Unit</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Standard unit selector */}
            {!editingId && (
              <div className="space-y-1.5">
                <Label>Quick Select (Standard Unit)</Label>
                <Select value="" onValueChange={handleStandardSelect}>
                  <SelectTrigger><SelectValue placeholder="Select a standard unit or type custom below" /></SelectTrigger>
                  <SelectContent>
                    {STANDARD_UNITS.filter(su => !list.some(u => u.name.toLowerCase() === su.name.toLowerCase())).map(su => (
                      <SelectItem key={su.symbol} value={su.name}>{su.name} ({su.symbol})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Name and Symbol */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Full Name</Label>
                <Input placeholder="e.g., Kilogram" value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Symbol</Label>
                <Input placeholder="e.g., kg" value={form.symbol} onChange={(e) => setForm(p => ({ ...p, symbol: e.target.value }))} />
              </div>
            </div>

            {/* Status */}
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch checked={form.status === "active"} onCheckedChange={(c) => setForm(p => ({ ...p, status: c ? "active" : "inactive" }))} />
            </div>

            {/* Conversion Units */}
            <div className="space-y-3 bg-muted/30 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Conversion Units</Label>
                <Button variant="outline" size="sm" onClick={addConversionRow} disabled={mergedConversionTargets.length === 0}>
                  <Plus className="h-3 w-3 mr-1" />Add Conversion
                </Button>
              </div>

              {form.conversions.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">No conversions defined. This unit will only appear as itself in recipe forms.</p>
              ) : (
                <div className="space-y-2">
                  {form.conversions.map((c, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">1 {form.symbol || "unit"} =</span>
                      <Input
                        type="number"
                        className="h-8 text-xs w-24"
                        placeholder="Factor"
                        value={c.factor || ""}
                        onChange={(e) => updateConversionRow(idx, "factor", Number(e.target.value))}
                      />
                      <Select value={c.toUnitId} onValueChange={(v) => updateConversionRow(idx, "toUnitId", v)}>
                        <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Target unit" /></SelectTrigger>
                        <SelectContent>
                          {mergedConversionTargets
                            .filter(u => !form.conversions.some((cc, ci) => ci !== idx && cc.toUnitId === u.id))
                            .map(u => (
                              <SelectItem key={u.id} value={u.id}>
                                {u.name} ({u.symbol}){!u.existsInDb && " — will be created"}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => removeConversionRow(idx)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">Reverse conversions are created automatically.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button className="gradient-primary text-primary-foreground" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
export default IngredientUnits;

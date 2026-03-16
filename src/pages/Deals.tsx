import { useState } from "react";
import { Tag, Plus, Pencil, Trash2, Search, X, GripVertical } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/ui/page-header";
import { useData } from "@/contexts/DataContext";
import { toast } from "sonner";
import type { Deal, DealOptionGroup } from "@/contexts/DataContext";
import { DEAL_TYPE_LABELS, DEAL_TYPE_COLORS } from "@/lib/constants";

const typeLabels = DEAL_TYPE_LABELS;
const typeColors = DEAL_TYPE_COLORS;

const Deals = () => {
  const { deals, foodMenuItems, foodCategories, addItem, updateItem, removeItem } = useData();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Deal>>({ type: "percentage", isActive: true, validFrom: new Date().toISOString().split("T")[0], validTo: "", discountPercent: 10 });
  const [optionGroups, setOptionGroups] = useState<DealOptionGroup[]>([]);
  const [itemPickerGroupId, setItemPickerGroupId] = useState<string | null>(null);
  const [itemPickerCategory, setItemPickerCategory] = useState("All");

  const now = new Date().toISOString().split("T")[0];
  const filtered = deals.filter(d => {
    if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter === "Active") return d.isActive && (d.validTo === "always" || d.validTo >= now);
    if (statusFilter === "Expired") return d.validTo !== "always" && d.validTo < now;
    if (statusFilter === "Upcoming") return d.validFrom > now;
    return true;
  });

  const openAdd = () => {
    setEditId(null);
    setForm({ type: "percentage", isActive: true, validFrom: now, validTo: "", discountPercent: 10, name: "", description: "" });
    setOptionGroups([]);
    setShowDialog(true);
  };
  const openEdit = (d: Deal) => {
    setEditId(d.id);
    setForm(d);
    setOptionGroups(d.optionGroups || []);
    setShowDialog(true);
  };

  const handleSave = () => {
    if (!form.name?.trim()) { toast.error("Deal name is required"); return; }
    if (form.type === "optionCombo") {
      if (!form.dealPrice || form.dealPrice <= 0) { toast.error("Deal price is required"); return; }
      if (optionGroups.length === 0) { toast.error("Add at least one option group"); return; }
      const emptyGroup = optionGroups.find(g => g.allowedItems.length === 0);
      if (emptyGroup) { toast.error(`Group "${emptyGroup.label}" has no items`); return; }
    }
    const data = form.type === "optionCombo" ? { ...form, optionGroups } : form;
    if (editId) { updateItem("deals", editId, data as any); toast.success("Deal updated"); }
    else { addItem("deals", { id: crypto.randomUUID(), createdAt: now, ...data } as Deal); toast.success("Deal created"); }
    setShowDialog(false);
  };

  const handleDelete = () => { if (deleteId) { removeItem("deals", deleteId); setDeleteId(null); toast.success("Deal deleted"); } };

  const addOptionGroup = () => {
    setOptionGroups(prev => [...prev, { id: crypto.randomUUID(), label: `Choose Item ${prev.length + 1}`, allowedItems: [], maxSelections: 1 }]);
  };

  const updateGroup = (id: string, updates: Partial<DealOptionGroup>) => {
    setOptionGroups(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g));
  };

  const removeGroup = (id: string) => {
    setOptionGroups(prev => prev.filter(g => g.id !== id));
  };

  const toggleItemInGroup = (groupId: string, itemId: string) => {
    setOptionGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      const has = g.allowedItems.includes(itemId);
      return { ...g, allowedItems: has ? g.allowedItems.filter(x => x !== itemId) : [...g.allowedItems, itemId] };
    }));
  };

  const getValueDisplay = (d: Deal) => {
    if (d.type === "percentage") return `${d.discountPercent}%`;
    if (d.type === "combo") return `Rs. ${d.comboPrice}`;
    if (d.type === "timeBased") return `${d.timeDiscountPercent}% (${d.startTime}-${d.endTime})`;
    if (d.type === "optionCombo") return `Rs. ${d.dealPrice} • ${d.optionGroups?.length || 0} groups`;
    return `Buy ${d.buyQty} Get ${d.getQty}`;
  };

  const activePickerGroup = optionGroups.find(g => g.id === itemPickerGroupId);
  const pickerItems = foodMenuItems.filter(i => itemPickerCategory === "All" || i.category === itemPickerCategory);

  return (
    <div className="space-y-6">
      <PageHeader icon={<Tag className="h-5 w-5" />} title="Deals & Combos" subtitle="Manage promotional offers and combo meals"
        actions={<Button className="gradient-primary text-primary-foreground" onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Create Deal</Button>} />
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search deals..." className="pl-9" /></div>
            <div className="flex gap-1.5 flex-wrap">{["All", "Active", "Expired", "Upcoming"].map(s => (
              <Button key={s} variant={statusFilter === s ? "default" : "outline"} size="sm" onClick={() => setStatusFilter(s)} className={statusFilter === s ? "gradient-primary text-primary-foreground" : ""}>{s}</Button>
            ))}</div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="sticky top-0 z-10 bg-card">Name</TableHead><TableHead className="sticky top-0 z-10 bg-card">Type</TableHead><TableHead className="sticky top-0 z-10 bg-card">Value</TableHead><TableHead className="sticky top-0 z-10 bg-card">Valid</TableHead><TableHead className="sticky top-0 z-10 bg-card">Status</TableHead><TableHead className="sticky top-0 z-10 bg-card">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map(d => (
                  <TableRow key={d.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell><div><p className="font-medium">{d.name}</p><p className="text-xs text-muted-foreground">{d.description}</p></div></TableCell>
                    <TableCell><Badge variant="secondary" className={typeColors[d.type]}>{typeLabels[d.type]}</Badge></TableCell>
                    <TableCell className="text-sm">{getValueDisplay(d)}</TableCell>
                    <TableCell className="text-xs">{d.validFrom} — {d.validTo || "∞"}</TableCell>
                    <TableCell><Badge variant="secondary" className={d.isActive ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}>{d.isActive ? "Active" : "Inactive"}</Badge></TableCell>
                    <TableCell><div className="flex gap-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(d)}><Pencil className="h-3 w-3" /></Button><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(d.id)}><Trash2 className="h-3 w-3" /></Button></div></TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No deals found</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create / Edit Deal Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}><DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{editId ? "Edit" : "Create"} Deal</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Deal Name</Label><Input value={form.name || ""} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
          <div><Label>Description</Label><Textarea value={form.description || ""} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
          <div><Label>Type</Label><Select value={form.type} onValueChange={v => { setForm(p => ({ ...p, type: v as Deal["type"] })); if (v !== "optionCombo") setOptionGroups([]); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
            <SelectItem value="percentage">Percentage Discount</SelectItem>
            <SelectItem value="combo">Fixed Price Combo</SelectItem>
            <SelectItem value="optionCombo">Option Combo (FoodPanda Style)</SelectItem>
            <SelectItem value="buyXgetY">Buy X Get Y</SelectItem>
            <SelectItem value="timeBased">Time-Based</SelectItem>
          </SelectContent></Select></div>

          {form.type === "percentage" && <div><Label>Discount %</Label><Input type="number" value={form.discountPercent || ""} onChange={e => setForm(p => ({ ...p, discountPercent: Number(e.target.value) }))} /></div>}
          {form.type === "combo" && <div><Label>Combo Price (Rs.)</Label><Input type="number" value={form.comboPrice || ""} onChange={e => setForm(p => ({ ...p, comboPrice: Number(e.target.value) }))} /></div>}
          {form.type === "timeBased" && <><div className="grid grid-cols-2 gap-3"><div><Label>Start Time</Label><Input type="time" value={form.startTime || ""} onChange={e => setForm(p => ({ ...p, startTime: e.target.value }))} /></div><div><Label>End Time</Label><Input type="time" value={form.endTime || ""} onChange={e => setForm(p => ({ ...p, endTime: e.target.value }))} /></div></div><div><Label>Discount %</Label><Input type="number" value={form.timeDiscountPercent || ""} onChange={e => setForm(p => ({ ...p, timeDiscountPercent: Number(e.target.value) }))} /></div></>}

          {/* Option Combo — Groups Builder */}
          {form.type === "optionCombo" && (
            <div className="space-y-4">
              <div><Label>Deal Price (Rs.)</Label><Input type="number" value={form.dealPrice || ""} onChange={e => setForm(p => ({ ...p, dealPrice: Number(e.target.value) }))} placeholder="Fixed price for entire deal" /></div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-semibold">Option Groups</Label>
                  <Button type="button" size="sm" variant="outline" onClick={addOptionGroup}><Plus className="h-3 w-3 mr-1" />Add Group</Button>
                </div>
                {optionGroups.length === 0 && <p className="text-xs text-muted-foreground text-center py-4 border border-dashed rounded-lg">No groups yet. Add groups so customers can choose items at order time.</p>}
                <div className="space-y-3">
                  {optionGroups.map((group, idx) => (
                    <div key={group.id} className="border rounded-xl p-3 bg-muted/20 space-y-2">
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-xs font-bold text-muted-foreground shrink-0">#{idx + 1}</span>
                        <Input value={group.label} onChange={e => updateGroup(group.id, { label: e.target.value })} className="h-8 text-xs flex-1" placeholder="e.g. Choose Pizza Flavor" />
                        <Input type="number" value={group.maxSelections} onChange={e => updateGroup(group.id, { maxSelections: Math.max(1, Number(e.target.value)) })} className="h-8 text-xs w-16" title="Max selections" />
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => removeGroup(group.id)}><X className="h-3 w-3" /></Button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex flex-wrap gap-1">
                          {group.allowedItems.length === 0 ? (
                            <span className="text-xs text-muted-foreground italic">No items selected</span>
                          ) : (
                            group.allowedItems.map(itemId => {
                              const mi = foodMenuItems.find(m => m.id === itemId);
                              return mi ? (
                                <Badge key={itemId} variant="secondary" className="text-[10px] gap-1 pr-1">
                                  {mi.name}
                                  <button type="button" className="ml-0.5 hover:text-destructive" onClick={() => toggleItemInGroup(group.id, itemId)}><X className="h-2.5 w-2.5" /></button>
                                </Badge>
                              ) : null;
                            })
                          )}
                        </div>
                        <Button type="button" size="sm" variant="outline" className="text-xs shrink-0 ml-2" onClick={() => { setItemPickerGroupId(group.id); setItemPickerCategory("All"); }}>
                          Pick Items
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><Label>Valid From</Label><Input type="date" value={form.validFrom || ""} onChange={e => setForm(p => ({ ...p, validFrom: e.target.value }))} /></div><div><Label>Valid To</Label><Input type="date" value={form.validTo === "always" ? "" : form.validTo || ""} onChange={e => setForm(p => ({ ...p, validTo: e.target.value || "always" }))} placeholder="Leave empty for always" /></div></div>
          <div className="flex items-center justify-between"><Label>Active</Label><Switch checked={form.isActive} onCheckedChange={c => setForm(p => ({ ...p, isActive: c }))} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button><Button className="gradient-primary text-primary-foreground" onClick={handleSave}>Save</Button></DialogFooter>
      </DialogContent></Dialog>

      {/* Item Picker Dialog for Option Groups */}
      <Dialog open={!!itemPickerGroupId} onOpenChange={() => setItemPickerGroupId(null)}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Select Items — {activePickerGroup?.label}</DialogTitle></DialogHeader>
          <div className="flex gap-1.5 flex-wrap mb-3">
            {["All", ...foodCategories.map(c => c.name)].map(cat => (
              <Button key={cat} size="sm" variant={itemPickerCategory === cat ? "default" : "outline"} onClick={() => setItemPickerCategory(cat)} className="text-xs h-7">{cat}</Button>
            ))}
          </div>
          <div className="space-y-1 max-h-[50vh] overflow-y-auto">
            {pickerItems.map(item => {
              const checked = activePickerGroup?.allowedItems.includes(item.id) ?? false;
              return (
                <label key={item.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
                  <Checkbox checked={checked} onCheckedChange={() => { if (itemPickerGroupId) toggleItemInGroup(itemPickerGroupId, item.id); }} />
                  {item.image ? <img src={item.image} alt={item.name} className="h-8 w-8 rounded-md object-cover" /> : <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center text-xs font-bold">{item.name.charAt(0)}</div>}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.category} — Rs. {item.price}</p>
                  </div>
                </label>
              );
            })}
          </div>
          <DialogFooter>
            <Button onClick={() => setItemPickerGroupId(null)}>Done ({activePickerGroup?.allowedItems.length || 0} selected)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Deal?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
};
export default Deals;

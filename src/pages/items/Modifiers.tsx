import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Search, Trash2, SlidersHorizontal, X, ChevronUp, PackageOpen } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { menuService, type ModifierRecord } from "@/services/menu.service";
import { inventoryService, type IngredientRecord } from "@/services/inventory.service";
import { PageHeader } from "@/components/ui/page-header";

const Modifiers = () => {
  const [list, setList] = useState<ModifierRecord[]>([]);
  const [ingredients, setIngredients] = useState<IngredientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIngredientId, setSelectedIngredientId] = useState("");

  const fetchAll = useCallback(async () => {
    try {
      const [mods, ings] = await Promise.all([
        menuService.getModifiers(),
        inventoryService.getIngredients(),
      ]);
      setList(mods);
      setIngredients(ings);
    } catch (err: any) {
      toast.error(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Ingredients not yet added as modifiers
  const usedIngredientIds = new Set(
    list
      .filter(m => m.ingredientId)
      .map(m => m.ingredientId!)
  );
  const availableIngredients = ingredients.filter(ig => !usedIngredientIds.has(ig.id));

  const filtered = list.filter(m => m.name.toLowerCase().includes(search.toLowerCase()));

  const openAdd = () => {
    setSelectedIngredientId("");
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setSelectedIngredientId("");
  };

  const handleSave = async () => {
    if (!selectedIngredientId) { toast.error("Please select an ingredient"); return; }
    setSaving(true);
    try {
      await menuService.createModifier({ ingredientId: selectedIngredientId });
      toast.success("Modifier added");
      closeForm();
      await fetchAll();
    } catch (err: any) {
      toast.error(err.message || "Failed to save modifier");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await menuService.deleteModifier(id);
      toast.success("Deleted");
      await fetchAll();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete modifier");
    }
  };

  // Helper: get full ingredient data for a modifier
  const getIngredient = (m: ModifierRecord) =>
    ingredients.find(ig => ig.id === m.ingredientId);

  if (loading) return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full rounded-lg" />
      {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<SlidersHorizontal className="h-5 w-5" />}
        title="Modifiers"
        subtitle="Ingredient-backed add-ons customers can request with any menu item"
        actions={
          <Button
            className="gradient-primary text-primary-foreground"
            onClick={() => (showForm ? closeForm() : openAdd())}
          >
            {showForm
              ? <><X className="h-4 w-4 mr-2" />Close</>
              : <><Plus className="h-4 w-4 mr-2" />Add Modifier</>}
          </Button>
        }
      />

      {/* Inline form */}
      {showForm && (
        <Card className="border-primary/20 shadow-sm bg-primary/[0.02]">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <h3 className="text-base font-semibold">Add Modifier</h3>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closeForm}>
              <ChevronUp className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-3 max-w-sm">
              <div className="flex-1 space-y-1.5">
                <Label>Ingredient <span className="text-destructive">*</span></Label>
                <Select value={selectedIngredientId} onValueChange={setSelectedIngredientId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select ingredient..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableIngredients.length === 0 ? (
                      <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                        All ingredients already added as modifiers
                      </div>
                    ) : (
                      availableIngredients.map(ig => (
                        <SelectItem key={ig.id} value={ig.id}>
                          <span className="font-medium">{ig.name}</span>
                          {ig.brand && <span className="text-muted-foreground ml-1 text-xs">· {ig.brand}</span>}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={closeForm}>Cancel</Button>
                <Button
                  className="gradient-primary text-primary-foreground"
                  onClick={handleSave}
                  disabled={saving || !selectedIngredientId}
                >
                  {saving ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search modifiers..."
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <PackageOpen className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" />
              <p className="text-muted-foreground font-medium">No modifiers found</p>
              <p className="text-xs text-muted-foreground mt-1.5">
                Add ingredient-backed modifiers to let customers customize their orders.
              </p>
              <Button size="sm" className="gradient-primary text-primary-foreground mt-4" onClick={openAdd}>
                <Plus className="h-4 w-4 mr-1" />Add Modifier
              </Button>
            </div>
          ) : (
            <div className="rounded-b-lg overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="w-12 pl-4">SN</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Cost Price</TableHead>
                    <TableHead className="w-20 pr-4">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((m, i) => {
                    const ing = getIngredient(m);
                    return (
                      <TableRow key={m.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="text-muted-foreground pl-4">{i + 1}</TableCell>
                        <TableCell className="font-medium">{m.name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {ing?.brand || <span className="opacity-40">—</span>}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {ing?.category?.name || <span className="opacity-40">—</span>}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {ing?.unit?.name || <span className="opacity-40">—</span>}
                        </TableCell>
                        <TableCell className="font-medium text-sm">
                          {m.ingredientCost != null
                            ? `Rs. ${Number(m.ingredientCost).toLocaleString()}`
                            : <span className="text-muted-foreground opacity-40">—</span>}
                        </TableCell>
                        <TableCell className="pr-4">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete "{m.name}"?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This modifier will be removed from all food items it is linked to. This cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(m.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Modifiers;

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

import { Plus, Trash2, Upload, ArrowLeft, Utensils, Timer, Loader2, X, ChevronDown, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { toast } from "sonner";
import { menuService, type CategoryRecord, type ModifierRecord, type RecipeIngredient } from "@/services/menu.service";
import { inventoryService, type IngredientRecord, type UnitRecord } from "@/services/inventory.service";
import { getAccessToken } from "@/services/api";

interface Variant {
  name: string;
  price: number;
  dineInPrice: number | null;
  takeAwayPrice: number | null;
  deliveryPrice: number | null;
  foodpandaPrice: number | null;
}

const ORDER_TYPE_LABELS = [
  { key: "dineInPrice" as const, label: "Dine In" },
  { key: "takeAwayPrice" as const, label: "Take Away" },
  { key: "deliveryPrice" as const, label: "Delivery" },
  { key: "foodpandaPrice" as const, label: "Foodpanda" },
];
interface RecipeItem {
  ingredientId: string;
  name: string;
  qty: number;
  unit: string;              // ingredient's base unit name (display)
  unitId: string;            // ingredient's base unit id
  usageUnitId: string;       // the unit user chose for this recipe row
  usageUnitName: string;     // display name of usage unit
  cost: number;
  variantId: string | null;  // null = base item / simple, string = specific variant
}

// Unit conversion factors: from → to → multiplier
// e.g. to convert 250 grams to kg: 250 * CONVERSIONS["gram"]["kg"] = 0.25
const UNIT_CONVERSIONS: Record<string, Record<string, number>> = {
  kg:    { kg: 1, gram: 1000 },
  gram:  { gram: 1, kg: 0.001 },
  liter: { liter: 1, ml: 1000 },
  ml:    { ml: 1, liter: 0.001 },
  dozen: { dozen: 1, piece: 12 },
  piece: { piece: 1, dozen: 1 / 12 },
};

/** Get compatible units for a given base unit */
function getCompatibleUnits(baseUnitName: string, allUnits: UnitRecord[]): UnitRecord[] {
  const lower = baseUnitName.toLowerCase();
  const group = UNIT_CONVERSIONS[lower];
  if (!group) return allUnits.filter(u => u.name.toLowerCase() === lower);
  const compatibleNames = Object.keys(group);
  return allUnits.filter(u => compatibleNames.includes(u.name.toLowerCase()));
}

/** Convert qty from usageUnit back to ingredient's base unit for cost calc */
function convertToBaseUnit(qty: number, usageUnitName: string, baseUnitName: string): number {
  const from = usageUnitName.toLowerCase();
  const to = baseUnitName.toLowerCase();
  if (from === to) return qty;
  const factor = UNIT_CONVERSIONS[from]?.[to];
  if (factor !== undefined) return qty * factor;
  return qty; // no conversion available, assume same
}

const FoodMenuForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const codeManualRef = useRef(false);

  // Form data
  const [form, setForm] = useState({ name: "", code: "", categoryId: "", description: "", available: true, cookingTime: 0 });

  // Auto-generate item code from name
  const generateCodePreview = useCallback((name: string): string => {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return "";
    const prefix = words.length >= 2
      ? words.map(w => w[0].toUpperCase()).join("").slice(0, 4)
      : words[0].slice(0, 3).toUpperCase();
    return prefix;
  }, []);

  useEffect(() => {
    if (isEdit || codeManualRef.current) return;
    const preview = generateCodePreview(form.name);
    setForm(p => ({ ...p, code: preview }));
  }, [form.name, isEdit, generateCodePreview]);

  const [imageUrl, setImageUrl] = useState("");
  const [pricingType, setPricingType] = useState<"simple" | "variant">("simple");
  const [simplePrice, setSimplePrice] = useState(0);
  const [simpleDineIn, setSimpleDineIn] = useState<number | null>(null);
  const [simpleTakeAway, setSimpleTakeAway] = useState<number | null>(null);
  const [simpleDelivery, setSimpleDelivery] = useState<number | null>(null);
  const [simpleFoodpanda, setSimpleFoodpanda] = useState<number | null>(null);
  const defaultVariant = (): Variant => ({ name: "", price: 0, dineInPrice: null, takeAwayPrice: null, deliveryPrice: null, foodpandaPrice: null });
  const [variants, setVariants] = useState<Variant[]>([
    { name: "Small", price: 400, dineInPrice: null, takeAwayPrice: null, deliveryPrice: null, foodpandaPrice: null },
    { name: "Medium", price: 550, dineInPrice: null, takeAwayPrice: null, deliveryPrice: null, foodpandaPrice: null },
    { name: "Large", price: 750, dineInPrice: null, takeAwayPrice: null, deliveryPrice: null, foodpandaPrice: null },
  ]);
  const [recipe, setRecipe] = useState<RecipeItem[]>([]);
  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);
  // modifierVariantMap: modifierId → variantIds[] (empty = all variants)
  const [modifierVariantMap, setModifierVariantMap] = useState<Record<string, string[]>>({});
  const [expandedVariants, setExpandedVariants] = useState<Set<number>>(new Set([0]));

  // Reference data
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [ingredients, setIngredients] = useState<IngredientRecord[]>([]);
  const [modifiersList, setModifiersList] = useState<ModifierRecord[]>([]);
  const [units, setUnits] = useState<UnitRecord[]>([]);
  // savedVariantIds: maps variant index → saved DB id (needed for recipe variantId)
  const [savedVariantIds, setSavedVariantIds] = useState<Record<number, string>>({});

  useEffect(() => {
    const loadData = async () => {
      try {
        const [cats, ings, mods, unitsList] = await Promise.all([
          menuService.getCategories(),
          inventoryService.getIngredients(),
          menuService.getModifiers(),
          inventoryService.getUnits(),
        ]);
        setCategories(cats);
        setIngredients(ings);
        setModifiersList(mods);
        setUnits(unitsList);

        if (isEdit && id) {
          const item = await menuService.getMenuItem(id);
          setForm({
            name: item.name,
            code: item.code || "",
            categoryId: item.categoryId || "",
            description: "",
            available: item.available,
            cookingTime: item.cookingTime,
          });
          setImageUrl(item.image || "");
          setSimplePrice(item.price);
          setSimpleDineIn((item as any).dineInPrice ?? null);
          setSimpleTakeAway((item as any).takeAwayPrice ?? null);
          setSimpleDelivery((item as any).deliveryPrice ?? null);
          setSimpleFoodpanda((item as any).foodpandaPrice ?? null);

          if (item.variants && item.variants.length > 0) {
            setPricingType("variant");
            setVariants(item.variants.map((v) => ({
              name: v.name, price: v.price,
              dineInPrice: v.dineInPrice ?? null,
              takeAwayPrice: v.takeAwayPrice ?? null,
              deliveryPrice: v.deliveryPrice ?? null,
              foodpandaPrice: v.foodpandaPrice ?? null,
            })));
            const vIdMap: Record<number, string> = {};
            item.variants.forEach((v, i) => { vIdMap[i] = v.id; });
            setSavedVariantIds(vIdMap);
          }

          if (item.recipes && item.recipes.length > 0) {
            setRecipe(item.recipes.map((r: RecipeIngredient) => {
              const baseUnitName = r.ingredient?.unit?.name || "";
              const usageUnitName = r.usageUnit?.name || baseUnitName;
              const usageUnitId = r.usageUnitId || r.ingredient?.unit?.id || "";
              const qtyInBaseUnit = convertToBaseUnit(Number(r.qtyPerUnit), usageUnitName, baseUnitName);
              return {
                ingredientId: r.ingredientId,
                name: r.ingredient?.name || "",
                qty: Number(r.qtyPerUnit),
                unit: baseUnitName,
                unitId: r.ingredient?.unit?.id || "",
                usageUnitId,
                usageUnitName,
                cost: qtyInBaseUnit * Number(r.ingredient?.purchasePrice || 0),
                variantId: r.variantId || null,
              };
            }));
          }

          // Load linked modifiers + variantIds
          if (item.modifiers && item.modifiers.length > 0) {
            setSelectedModifiers(item.modifiers.map((m: any) => m.id));
            const isVariantPricing = item.variants && item.variants.length > 0;
            const allVids = item.variants?.map((v: any) => v.id) || [];
            const vMap: Record<string, string[]> = {};
            item.modifiers.forEach((m: any) => {
              if (m.variantIds?.length) {
                vMap[m.id] = m.variantIds;
              } else if (isVariantPricing) {
                // "All" means all variants — expand to explicit IDs for per-variant UI
                vMap[m.id] = [...allVids];
              }
            });
            setModifierVariantMap(vMap);
          }
        }
      } catch (err: any) {
        toast.error(err.message || "Failed to load data");
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [isEdit, id]);

  const addVariant = () => {
    const newIndex = variants.length;
    setVariants((p) => [...p, defaultVariant()]);
    setExpandedVariants(prev => new Set([...prev, newIndex]));
  };
  const removeVariant = (i: number) => {
    const removedVariantId = savedVariantIds[i] || `new-${i}`;
    setVariants((p) => p.filter((_, idx) => idx !== i));
    // Remove recipes linked to this variant
    if (removedVariantId) {
      setRecipe(p => p.filter(r => r.variantId !== removedVariantId));
    }
    // Remove modifier assignments for this variant
    setModifierVariantMap(prev => {
      const next: Record<string, string[]> = {};
      for (const [modId, vids] of Object.entries(prev)) {
        next[modId] = vids.filter(v => v !== removedVariantId);
      }
      // Remove modifiers that have no variants left
      const emptyMods = Object.keys(next).filter(k => next[k].length === 0);
      setSelectedModifiers(p => p.filter(m => !emptyMods.includes(m)));
      return next;
    });
    // Re-index savedVariantIds
    setSavedVariantIds(prev => {
      const next: Record<number, string> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const idx = Number(k);
        if (idx < i) next[idx] = v;
        else if (idx > i) next[idx - 1] = v;
      });
      return next;
    });
    // Re-index expandedVariants
    setExpandedVariants(prev => {
      const next = new Set<number>();
      prev.forEach(idx => {
        if (idx < i) next.add(idx);
        else if (idx > i) next.add(idx - 1);
      });
      return next;
    });
  };
  const updateVariant = (i: number, field: keyof Variant, value: string | number | null) =>
    setVariants((p) => p.map((v, idx) => idx === i ? { ...v, [field]: value } : v));

  // ── Recipe helpers ──
  const getRecipeForVariant = (variantId: string | null) => recipe.filter(r => r.variantId === variantId);

  const addRecipeItem = (variantId: string | null) => {
    setRecipe((p) => [...p, {
      ingredientId: "", name: "", qty: 0,
      unit: "", unitId: "", usageUnitId: "", usageUnitName: "",
      cost: 0, variantId,
    }]);
  };

  const removeRecipeItem = (i: number) => setRecipe((p) => p.filter((_, idx) => idx !== i));

  const getRecipeGlobalIndex = (variantId: string | null, localIndex: number): number => {
    let count = 0;
    for (let i = 0; i < recipe.length; i++) {
      if (recipe[i].variantId === variantId) {
        if (count === localIndex) return i;
        count++;
      }
    }
    return -1;
  };

  const updateRecipeItem = (globalIdx: number, ingredientId: string) => {
    const ing = ingredients.find((ig) => ig.id === ingredientId);
    if (!ing) return;
    setRecipe((p) => p.map((r, idx) => idx === globalIdx ? {
      ...r,
      ingredientId,
      name: ing.name,
      unit: ing.unit?.name || "",
      unitId: ing.unit?.id || "",
      usageUnitId: ing.unit?.id || "",
      usageUnitName: ing.unit?.name || "",
      cost: 0,
      qty: 0,
    } : r));
  };

  const updateRecipeQty = (globalIdx: number, qty: number) => {
    setRecipe((p) => p.map((r, idx) => {
      if (idx !== globalIdx) return r;
      const ing = ingredients.find((ig) => ig.id === r.ingredientId);
      const baseQty = convertToBaseUnit(qty, r.usageUnitName, r.unit);
      return { ...r, qty, cost: baseQty * Number(ing?.purchasePrice || 0) };
    }));
  };

  const updateRecipeUsageUnit = (globalIdx: number, usageUnitId: string) => {
    const unit = units.find(u => u.id === usageUnitId);
    if (!unit) return;
    setRecipe((p) => p.map((r, idx) => {
      if (idx !== globalIdx) return r;
      const ing = ingredients.find((ig) => ig.id === r.ingredientId);
      const baseQty = convertToBaseUnit(r.qty, unit.name, r.unit);
      return { ...r, usageUnitId, usageUnitName: unit.name, cost: baseQty * Number(ing?.purchasePrice || 0) };
    }));
  };

  // Cost/markup calculations
  const getRecipeCost = (variantId: string | null) => getRecipeForVariant(variantId).reduce((s, r) => s + r.cost, 0);
  const totalFoodCost = recipe.reduce((s, r) => s + r.cost, 0);
  const sellingPrice = pricingType === "simple" ? simplePrice : (variants[0]?.price || 0);
  const markup = sellingPrice > 0 && totalFoodCost > 0 ? Math.round(((sellingPrice - totalFoodCost) / totalFoodCost) * 100) : 0;

  const toggleModifier = (mid: string) => setSelectedModifiers((p) => p.includes(mid) ? p.filter((m) => m !== mid) : [...p, mid]);

  const toggleVariantExpanded = (i: number) => {
    setExpandedVariants(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const getModifiersForVariant = (variantId: string): ModifierRecord[] =>
    modifiersList.filter(m => (modifierVariantMap[m.id] || []).includes(variantId));

  const isModifierForVariant = (modId: string, variantId: string): boolean =>
    (modifierVariantMap[modId] || []).includes(variantId);

  const toggleModifierForVariant = (modId: string, variantId: string) => {
    const currentVids = modifierVariantMap[modId] || [];
    const isAssigned = currentVids.includes(variantId);
    const nextVids = isAssigned ? currentVids.filter(v => v !== variantId) : [...currentVids, variantId];
    setModifierVariantMap(prev => ({ ...prev, [modId]: nextVids }));
    if (nextVids.length === 0) {
      setSelectedModifiers(p => p.filter(m => m !== modId));
    } else if (!selectedModifiers.includes(modId)) {
      setSelectedModifiers(p => [...p, modId]);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5MB"); return; }
    if (!file.type.startsWith("image/")) { toast.error("Only image files allowed"); return; }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const token = getAccessToken();
      const res = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:3001/api"}/upload/image`, {
        method: "POST",
        headers: { ...(token && { Authorization: `Bearer ${token}` }) },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setImageUrl(data.data.url);
      toast.success("Image uploaded");
    } catch (err: any) {
      toast.error(err.message || "Image upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Item name is required"); return; }
    const price = pricingType === "simple" ? simplePrice : (variants[0]?.price || 0);
    if (!price) { toast.error("Price is required"); return; }

    setSaving(true);
    try {
      // For variant pricing, omit modifiers from initial save — we'll set them
      // after getting real variant IDs to avoid temp "new-N" IDs in DB
      const itemData: any = {
        name: form.name,
        code: form.code || undefined,
        categoryId: form.categoryId || null,
        price,
        dineInPrice:    pricingType === "simple" ? simpleDineIn    : null,
        takeAwayPrice:  pricingType === "simple" ? simpleTakeAway  : null,
        deliveryPrice:  pricingType === "simple" ? simpleDelivery  : null,
        foodpandaPrice: pricingType === "simple" ? simpleFoodpanda : null,
        available: form.available,
        image: imageUrl || null,
        cookingTime: form.cookingTime || 0,
        variants: pricingType === "variant" ? variants : [],
        modifiers: pricingType === "simple"
          ? selectedModifiers.map(mid => ({ id: mid, variantIds: [] }))
          : [], // set after save with real variant IDs
      };

      let savedId = id;
      let savedItem: any;
      if (isEdit && id) {
        savedItem = await menuService.updateMenuItem(id, itemData);
        toast.success("Item updated successfully");
      } else {
        savedItem = await menuService.createMenuItem(itemData);
        savedId = savedItem.id;
        toast.success("Item added successfully");
      }

      // For variant pricing, fix modifier variantIds with real DB IDs
      if (pricingType === "variant" && savedItem?.variants?.length && selectedModifiers.length > 0) {
        const nameToRealId: Record<string, string> = {};
        savedItem.variants.forEach((sv: any) => { nameToRealId[sv.name] = sv.id; });

        const correctedModifiers = selectedModifiers.map(mid => {
          const tempVids = modifierVariantMap[mid] || [];
          const realVids = tempVids.map(vid => {
            if (!vid.startsWith("new-")) return vid;
            const idx = parseInt(vid.replace("new-", ""), 10);
            const name = variants[idx]?.name;
            return name ? (nameToRealId[name] || vid) : vid;
          }).filter(vid => !vid.startsWith("new-"));
          // If all variants selected → send empty (= "all")
          const allSelected = savedItem.variants.every((sv: any) => realVids.includes(sv.id));
          return { id: mid, variantIds: allSelected ? [] : realVids };
        });

        await menuService.updateMenuItem(savedId!, { modifiers: correctedModifiers });
      }

      // Build variantId mapping from saved item's variants
      const variantIdMap: Record<string, string> = {};
      if (savedItem?.variants?.length) {
        savedItem.variants.forEach((sv: any) => {
          variantIdMap[sv.name] = sv.id;
        });
      }

      // Save recipe with variantId and usageUnitId
      if (savedId) {
        const recipeData = recipe
          .filter(r => r.ingredientId) // skip empty rows
          .map((r) => {
            let variantId: string | null = null;
            if (r.variantId && pricingType === "variant") {
              // If it's an existing saved variantId that still maps to a variant name
              const matchingVariant = savedItem?.variants?.find((v: any) => v.id === r.variantId);
              if (matchingVariant) {
                variantId = matchingVariant.id;
              } else if (r.variantId.startsWith("new-")) {
                // New item: temp ID like "new-0" → parse index → variant name → real ID
                const idx = parseInt(r.variantId.replace("new-", ""), 10);
                const vName = variants[idx]?.name;
                if (vName && variantIdMap[vName]) {
                  variantId = variantIdMap[vName];
                }
              } else {
                // Try mapping by variant name from the old savedVariantIds
                const variantName = variants.find((_, i) => savedVariantIds[i] === r.variantId)?.name;
                if (variantName && variantIdMap[variantName]) {
                  variantId = variantIdMap[variantName];
                }
              }
            }
            return {
              ingredientId: r.ingredientId,
              qtyPerUnit: r.qty,
              variantId,
              usageUnitId: r.usageUnitId || null,
            };
          });
        await menuService.updateRecipe(savedId, recipeData);
      }

      navigate("/items/food-menu");
    } catch (err: any) {
      toast.error(err.message || "Failed to save item");
    } finally {
      setSaving(false);
    }
  };

  // ── Recipe Section Renderer ──
  const renderRecipeSection = (variantId: string | null, variantName: string | null) => {
    const items = getRecipeForVariant(variantId);
    const cost = getRecipeCost(variantId);
    const vPrice = variantName
      ? variants.find(v => v.name === variantName)?.price || 0
      : (pricingType === "simple" ? simplePrice : 0);
    const vMarkup = vPrice > 0 && cost > 0 ? Math.round(((vPrice - cost) / cost) * 100) : 0;

    return (
      <div className="space-y-3">
        {items.map((r, localIdx) => {
          const globalIdx = getRecipeGlobalIndex(variantId, localIdx);
          const ing = ingredients.find(ig => ig.id === r.ingredientId);
          const compatibleUnits = ing ? getCompatibleUnits(ing.unit?.name || "", units) : [];

          return (
            <div key={localIdx} className="flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-[140px]">
                <Select value={r.ingredientId} onValueChange={(v) => updateRecipeItem(globalIdx, v)}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Ingredient" /></SelectTrigger>
                  <SelectContent>{ingredients.map((ig) => <SelectItem key={ig.id} value={ig.id}>{ig.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="w-20">
                <Input className="h-9 text-xs" type="number" placeholder="Qty" value={r.qty || ""} onChange={(e) => updateRecipeQty(globalIdx, Number(e.target.value))} />
              </div>
              <div className="w-24">
                {compatibleUnits.length > 1 ? (
                  <Select value={r.usageUnitId} onValueChange={(v) => updateRecipeUsageUnit(globalIdx, v)}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Unit" /></SelectTrigger>
                    <SelectContent>{compatibleUnits.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <span className="text-xs text-muted-foreground px-2">{r.usageUnitName || r.unit}</span>
                )}
              </div>
              <span className="text-xs font-medium w-20 text-right">Rs. {r.cost.toLocaleString()}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeRecipeItem(globalIdx)}><Trash2 className="h-3 w-3" /></Button>
            </div>
          );
        })}
        <Button variant="outline" size="sm" onClick={() => addRecipeItem(variantId)}><Plus className="h-3 w-3 mr-1" />Add Ingredient</Button>
        {items.length > 0 && (
          <div className="flex items-center gap-6 pt-3 border-t text-sm">
            <span>Food Cost: <strong>Rs. {cost.toLocaleString()}</strong></span>
            {vPrice > 0 && <span>Markup: <strong>{vMarkup}%</strong></span>}
          </div>
        )}
      </div>
    );
  };

  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-48" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/items/food-menu")}><ArrowLeft className="h-4 w-4" /></Button>
        <PageHeader icon={<Utensils className="h-5 w-5" />} title={`${isEdit ? "Edit" : "Add New"} Food Item`} subtitle={`Items > Food Menu > ${isEdit ? "Edit" : "Add"}`} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* General Info */}
          <Card className="shadow-sm"><CardHeader><CardTitle className="text-base">General Info</CardTitle></CardHeader><CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Item Name</Label><Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g., Lahori Tikka" /></div>
              <div>
                <Label>Item Code</Label>
                <Input
                  value={form.code}
                  onChange={(e) => { codeManualRef.current = true; setForm(p => ({ ...p, code: e.target.value })); }}
                  onBlur={(e) => { if (!e.target.value.trim()) codeManualRef.current = false; }}
                  placeholder={isEdit ? "Leave blank to keep current" : "Auto-generated from name"}
                />
              </div>
            </div>
            <div><Label>Category</Label><Select value={form.categoryId} onValueChange={(v) => setForm((p) => ({ ...p, categoryId: v }))}><SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger><SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Item description..." /></div>
            <div><Label className="flex items-center gap-1.5"><Timer className="h-3.5 w-3.5 text-primary" />Cooking Time (minutes)</Label><Input type="number" min={0} value={form.cookingTime || ""} onChange={(e) => setForm((p) => ({ ...p, cookingTime: Number(e.target.value) }))} placeholder="e.g., 15" className="max-w-xs" /><p className="text-xs text-muted-foreground mt-1">Time needed to prepare this item. Used for kitchen timer & order tracking.</p></div>
          </CardContent></Card>

          {/* Pricing */}
          <Card className="shadow-sm"><CardHeader><CardTitle className="text-base">Pricing</CardTitle></CardHeader><CardContent className="space-y-4">
            <RadioGroup value={pricingType} onValueChange={(v) => setPricingType(v as "simple" | "variant")} className="flex gap-4"><div className="flex items-center gap-2"><RadioGroupItem value="simple" id="simple" /><Label htmlFor="simple">Simple Price</Label></div><div className="flex items-center gap-2"><RadioGroupItem value="variant" id="variant" /><Label htmlFor="variant">Variant Pricing</Label></div></RadioGroup>
            {pricingType === "simple" ? (
              <div className="space-y-3">
                <div><Label className="text-xs text-muted-foreground">Default / Base Price</Label><Input type="number" placeholder="Base Price (Rs.)" value={simplePrice || ""} onChange={(e) => setSimplePrice(Number(e.target.value))} className="max-w-xs" /></div>
                <p className="text-xs text-muted-foreground">Order-type specific prices (leave empty to use base price):</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div><Label className="text-xs">Dine In</Label><Input type="number" placeholder="—" value={simpleDineIn ?? ""} onChange={(e) => setSimpleDineIn(e.target.value ? Number(e.target.value) : null)} /></div>
                  <div><Label className="text-xs">Take Away</Label><Input type="number" placeholder="—" value={simpleTakeAway ?? ""} onChange={(e) => setSimpleTakeAway(e.target.value ? Number(e.target.value) : null)} /></div>
                  <div><Label className="text-xs">Delivery</Label><Input type="number" placeholder="—" value={simpleDelivery ?? ""} onChange={(e) => setSimpleDelivery(e.target.value ? Number(e.target.value) : null)} /></div>
                  <div><Label className="text-xs">Foodpanda</Label><Input type="number" placeholder="—" value={simpleFoodpanda ?? ""} onChange={(e) => setSimpleFoodpanda(e.target.value ? Number(e.target.value) : null)} /></div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Each variant has its own pricing, recipe, and modifiers. Click to expand.</p>
                {variants.map((v, i) => {
                  const variantId = savedVariantIds[i] || `new-${i}`;
                  const isExpanded = expandedVariants.has(i);
                  const cost = getRecipeCost(variantId);
                  const recipeItems = getRecipeForVariant(variantId);
                  const assignedMods = getModifiersForVariant(variantId);
                  return (
                    <div key={i} className="border rounded-lg overflow-hidden">
                      {/* Collapsible Header */}
                      <div
                        className="flex items-center gap-2 p-3 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => toggleVariantExpanded(i)}
                      >
                        {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                        <span className="font-medium flex-1 truncate">{v.name || `Variant ${i + 1}`}</span>
                        <span className="text-sm font-medium whitespace-nowrap">Rs. {v.price.toLocaleString()}</span>
                        {cost > 0 && <span className="text-[10px] text-muted-foreground bg-background border rounded px-1.5 py-0.5 whitespace-nowrap">Cost: Rs. {cost.toLocaleString()}</span>}
                        <span className="text-[10px] text-muted-foreground bg-background border rounded px-1.5 py-0.5 whitespace-nowrap">{recipeItems.length} ing.</span>
                        <span className="text-[10px] text-muted-foreground bg-background border rounded px-1.5 py-0.5 whitespace-nowrap">{assignedMods.length} mod.</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={(e) => { e.stopPropagation(); removeVariant(i); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      {/* Expanded Content */}
                      {isExpanded && (
                        <div className="p-4 space-y-5 border-t">
                          {/* Pricing */}
                          <div className="space-y-2">
                            <h4 className="text-sm font-medium text-primary">Pricing</h4>
                            <div className="flex items-center gap-3">
                              <Input placeholder="Variant name" value={v.name} onChange={(e) => updateVariant(i, "name", e.target.value)} className="flex-1" />
                              <div className="w-32">
                                <Label className="text-[10px] text-muted-foreground">Base Price</Label>
                                <Input type="number" placeholder="Price" value={v.price || ""} onChange={(e) => updateVariant(i, "price", Number(e.target.value))} />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              {ORDER_TYPE_LABELS.map(({ key, label }) => (
                                <div key={key}>
                                  <Label className="text-[10px] text-muted-foreground">{label}</Label>
                                  <Input type="number" placeholder="—" value={v[key] ?? ""} onChange={(e) => updateVariant(i, key, e.target.value ? Number(e.target.value) : null)} className="h-8 text-xs" />
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Recipe / Ingredients */}
                          <div className="space-y-2">
                            <h4 className="text-sm font-medium text-primary">Recipe / Ingredients</h4>
                            {renderRecipeSection(variantId, v.name)}
                          </div>

                          {/* Modifiers */}
                          <div className="space-y-2">
                            <h4 className="text-sm font-medium text-primary">Modifiers</h4>
                            <div className="space-y-1.5">
                              {modifiersList.map((m) => {
                                const isChecked = isModifierForVariant(m.id, variantId);
                                return (
                                  <label key={m.id} className={`flex items-center gap-2 text-sm rounded border p-2 cursor-pointer transition-colors ${isChecked ? "border-primary/40 bg-primary/5" : "hover:bg-muted/30"}`}>
                                    <Checkbox checked={isChecked} onCheckedChange={() => toggleModifierForVariant(m.id, variantId)} />
                                    <span className="flex-1">{m.name}</span>
                                    <span className="text-muted-foreground text-xs">{Number(m.price) > 0 ? `+Rs.${m.price}` : "Free"}</span>
                                  </label>
                                );
                              })}
                              {modifiersList.length === 0 && <p className="text-xs text-muted-foreground">No modifiers available.</p>}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                <Button variant="outline" size="sm" onClick={addVariant}><Plus className="h-3 w-3 mr-1" />Add Variant</Button>
              </div>
            )}
          </CardContent></Card>

          {/* Recipe / Ingredients — only for simple pricing (variant recipes are inside each variant section) */}
          {pricingType === "simple" && (
            <Card className="shadow-sm">
              <CardHeader><CardTitle className="text-base">Recipe / Ingredients</CardTitle></CardHeader>
              <CardContent>
                {renderRecipeSection(null, null)}
              </CardContent>
            </Card>
          )}

          {/* Modifiers — only for simple pricing (variant modifiers are inside each variant section) */}
          {pricingType === "simple" && (
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Modifiers</CardTitle>
                <p className="text-xs text-muted-foreground">Select modifiers for this item.</p>
              </CardHeader>
              <CardContent className="space-y-2">
                {modifiersList.map((m) => {
                  const isSelected = selectedModifiers.includes(m.id);
                  return (
                    <label key={m.id} className={`flex items-center gap-2 text-sm rounded border p-2 cursor-pointer ${isSelected ? "border-primary/40 bg-primary/5" : ""}`}>
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleModifier(m.id)} />
                      <span className="flex-1">{m.name}</span>
                      <span className="text-muted-foreground text-xs">{Number(m.price) > 0 ? `+Rs.${m.price}` : "Free"}</span>
                    </label>
                  );
                })}
                {modifiersList.length === 0 && <p className="text-xs text-muted-foreground">No modifiers created yet. Go to Items &gt; Modifiers to create some.</p>}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <Card className="shadow-sm"><CardHeader><CardTitle className="text-base">Image</CardTitle></CardHeader><CardContent>
            <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleImageUpload} />
            {uploading ? (
              <div className="border-2 border-dashed border-primary/40 rounded-lg p-8 flex flex-col items-center justify-center gap-2">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
                <p className="text-sm text-muted-foreground">Uploading to Cloudinary...</p>
              </div>
            ) : imageUrl ? (
              <div className="space-y-3">
                <div className="relative">
                  <img src={imageUrl} alt={form.name} className="w-full aspect-square object-cover rounded-lg" />
                  <button onClick={() => setImageUrl("")} className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 transition-colors" title="Remove image"><X className="h-3.5 w-3.5" /></button>
                </div>
                <Button variant="outline" size="sm" className="w-full" onClick={() => fileInputRef.current?.click()}><Upload className="h-4 w-4 mr-2" />Change Image</Button>
              </div>
            ) : (
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Click to upload image</p>
                <p className="text-xs text-muted-foreground mt-1">Max 5MB — JPG, PNG, WebP</p>
                <p className="text-xs text-muted-foreground">Saved to Cloudinary CDN</p>
              </div>
            )}
          </CardContent></Card>

          <Card className="shadow-sm"><CardHeader><CardTitle className="text-base">Availability</CardTitle></CardHeader><CardContent className="space-y-4">
            <div className="flex items-center justify-between"><Label>Available</Label><Switch checked={form.available} onCheckedChange={(c) => setForm((p) => ({ ...p, available: c }))} /></div>
          </CardContent></Card>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => navigate("/items/food-menu")}>Cancel</Button>
            <Button className="flex-1 gradient-primary text-primary-foreground" onClick={handleSave} disabled={saving || uploading}>{saving ? "Saving..." : uploading ? "Uploading..." : "Save Item"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FoodMenuForm;

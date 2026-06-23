import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

import { Plus, Trash2, Upload, ArrowLeft, Utensils, Timer, Loader2, X, ChevronDown, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { toast } from "sonner";
import { menuService, type CategoryRecord, type ModifierRecord, type RecipeIngredient } from "@/services/menu.service";
import { inventoryService, type IngredientRecord, type UnitRecord } from "@/services/inventory.service";
import { mealTypeService, type MealTypeRecord } from "@/services/mealType.service";
import productionItemService, { type ProductionItemRecord } from "@/services/production-items.service";
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

interface RecipeRow {
  ingredientId?: string;
  productionItemId?: string;
  name: string;
  unitId: string;
  unit: string;
  usageUnitId: string;
  usageUnitName: string;
  quantities: Record<string, number>;
  costs: Record<string, number>;
}

/** Build dynamic conversion map from API unit data (unit ID → unit ID → factor) */
function buildConversionMap(units: UnitRecord[]): Record<string, Record<string, number>> {
  const map: Record<string, Record<string, number>> = {};
  units.forEach(unit => {
    map[unit.id] = { [unit.id]: 1 };
    if (unit.conversionsFrom) {
      unit.conversionsFrom.forEach(conv => {
        map[unit.id][conv.toUnit.id] = conv.factor;
      });
    }
  });
  return map;
}

/** Get compatible units for a given base unit (by ID) */
function getCompatibleUnits(baseUnitId: string, allUnits: UnitRecord[], conversionMap: Record<string, Record<string, number>>): UnitRecord[] {
  const compatibleIds = Object.keys(conversionMap[baseUnitId] || {});
  if (compatibleIds.length === 0) return allUnits.filter(u => u.id === baseUnitId);
  return allUnits.filter(u => compatibleIds.includes(u.id));
}

/** Convert qty from usageUnit back to ingredient's base unit for cost calc (by ID) */
function convertToBaseUnit(qty: number, fromUnitId: string, toUnitId: string, conversionMap: Record<string, Record<string, number>>): number {
  if (fromUnitId === toUnitId) return qty;
  const factor = conversionMap[fromUnitId]?.[toUnitId];
  if (factor !== undefined) return qty * factor;
  return qty;
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
  const [mealTypeIds, setMealTypeIds] = useState<string[]>([]);
  const [imageUrl, setImageUrl] = useState("");
  const [pricingType, setPricingType] = useState<"simple" | "variant">("simple");

  // Simple pricing
  const [simplePrice, setSimplePrice] = useState(0);
  const [simpleDineIn, setSimpleDineIn] = useState<number | null>(null);
  const [simpleTakeAway, setSimpleTakeAway] = useState<number | null>(null);
  const [simpleDelivery, setSimpleDelivery] = useState<number | null>(null);
  const [simpleFoodpanda, setSimpleFoodpanda] = useState<number | null>(null);

  // Variants
  const defaultVariant = (): Variant => ({ name: "", price: 0, dineInPrice: null, takeAwayPrice: null, deliveryPrice: null, foodpandaPrice: null });
  const [variants, setVariants] = useState<Variant[]>([
    { name: "Small", price: 400, dineInPrice: null, takeAwayPrice: null, deliveryPrice: null, foodpandaPrice: null },
    { name: "Medium", price: 550, dineInPrice: null, takeAwayPrice: null, deliveryPrice: null, foodpandaPrice: null },
    { name: "Large", price: 750, dineInPrice: null, takeAwayPrice: null, deliveryPrice: null, foodpandaPrice: null },
  ]);
  const [newVariantName, setNewVariantName] = useState("");

  // Recipe rows
  const [recipeRows, setRecipeRows] = useState<RecipeRow[]>([]);

  // Modifiers
  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);
  const [modifierVariantMap, setModifierVariantMap] = useState<Record<string, string[]>>({});
  const [modifiersOpen, setModifiersOpen] = useState(false);
  const [activeModifierTab, setActiveModifierTab] = useState(0);

  // Reference data
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [ingredients, setIngredients] = useState<IngredientRecord[]>([]);
  const [modifiersList, setModifiersList] = useState<ModifierRecord[]>([]);
  const [units, setUnits] = useState<UnitRecord[]>([]);
  const [mealTypes, setMealTypes] = useState<MealTypeRecord[]>([]);
  const [productionItems, setProductionItems] = useState<ProductionItemRecord[]>([]);
  const [savedVariantIds, setSavedVariantIds] = useState<Record<number, string>>({});

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

  // Build dynamic conversion map from API data
  const conversionMap = useMemo(() => buildConversionMap(units), [units]);

  // Calculate cost for a recipe row + key
  const calcCost = useCallback((row: RecipeRow, key: string): number => {
    const qty = row.quantities[key] || 0;
    if (qty <= 0) return 0;
    const ing = ingredients.find(ig => ig.id === row.ingredientId);
    const baseQty = convertToBaseUnit(qty, row.usageUnitId, row.unitId, conversionMap);
    return baseQty * Number(ing?.purchasePrice || 0);
  }, [ingredients, conversionMap]);

  // Load data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [cats, ings, mods, unitsList, prodItems] = await Promise.all([
          menuService.getCategories(),
          inventoryService.getIngredients(),
          menuService.getModifiers(),
          inventoryService.getUnits(),
          productionItemService.getAll().catch(() => [] as ProductionItemRecord[]),
        ]);
        setCategories(cats);
        setIngredients(ings);
        setModifiersList(mods);
        setUnits(unitsList);
        setProductionItems(prodItems);
        // Meal types loaded separately — backend route may not exist yet
        mealTypeService.getAll().then(setMealTypes).catch(() => {});

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
          setMealTypeIds(item.mealTypeIds || []);
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

          // Convert flat recipes → RecipeRow[]
          if (item.recipes && item.recipes.length > 0) {
            const cMap = buildConversionMap(unitsList);
            const variantIdToIndex: Record<string, string> = {};
            if (item.variants) {
              item.variants.forEach((v, idx) => { variantIdToIndex[v.id] = idx.toString(); });
            }

            const rowMap: Record<string, RecipeRow> = {};
            item.recipes.forEach((r: RecipeIngredient) => {
              if (!r.ingredientId && !r.productionItemId) return;
              const rowKey = r.ingredientId ? r.ingredientId : `prod_${r.productionItemId}`;
              if (!rowMap[rowKey]) {
                if (r.ingredientId) {
                  // Ingredient row — existing behavior preserved exactly
                  const baseUnitName = r.ingredient?.unit?.name || "";
                  const baseUnitId = r.ingredient?.unit?.id || "";
                  rowMap[rowKey] = {
                    ingredientId: r.ingredientId,
                    name: r.ingredient?.name || "",
                    unitId: baseUnitId,
                    unit: baseUnitName,
                    usageUnitId: r.usageUnitId || baseUnitId,
                    usageUnitName: r.usageUnit?.name || baseUnitName,
                    quantities: {},
                    costs: {},
                  };
                } else {
                  // Production-item row
                  const prodUnit = r.productionItem?.unit ?? (prodItems.find(p => p.id === r.productionItemId)?.unit ?? '');
                  const prodName = r.productionItem?.name ?? (prodItems.find(p => p.id === r.productionItemId)?.name ?? '');
                  rowMap[rowKey] = {
                    productionItemId: r.productionItemId!,
                    name: prodName,
                    unitId: '',
                    unit: prodUnit,
                    usageUnitId: '',
                    usageUnitName: prodUnit,
                    quantities: {},
                    costs: {},
                  };
                }
              }
              const key = r.variantId ? (variantIdToIndex[r.variantId] ?? "base") : "base";
              rowMap[rowKey].quantities[key] = Number(r.qtyPerUnit);
              if (r.ingredientId) {
                // calc cost for ingredient rows
                const baseQty = convertToBaseUnit(Number(r.qtyPerUnit), rowMap[rowKey].usageUnitId, rowMap[rowKey].unitId, cMap);
                const ing = ings.find(ig => ig.id === r.ingredientId);
                rowMap[rowKey].costs[key] = baseQty * Number(ing?.purchasePrice || 0);
              } else {
                // no purchase price for production rows
                rowMap[rowKey].costs[key] = 0;
              }
            });
            setRecipeRows(Object.values(rowMap));
          }

          // Load linked modifiers
          if (item.modifiers && item.modifiers.length > 0) {
            setSelectedModifiers(item.modifiers.map((m: any) => m.id));
            const isVariantPricing = item.variants && item.variants.length > 0;
            const allVids = item.variants?.map((v: any) => v.id) || [];
            const vMap: Record<string, string[]> = {};
            item.modifiers.forEach((m: any) => {
              if (m.variantIds?.length) {
                vMap[m.id] = m.variantIds;
              } else if (isVariantPricing) {
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

  // ── Variant helpers ──
  const addVariant = () => {
    const name = newVariantName.trim();
    if (!name) { toast.error("Enter a variant name"); return; }
    if (variants.some(v => v.name.toLowerCase() === name.toLowerCase())) { toast.error("Variant name already exists"); return; }
    setVariants(p => [...p, { ...defaultVariant(), name }]);
    setNewVariantName("");
  };

  const removeVariant = (i: number) => {
    setVariants(p => p.filter((_, idx) => idx !== i));
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
    // Remove quantities/costs for removed variant index and re-index
    setRecipeRows(prev => prev.map(row => {
      const newQuantities: Record<string, number> = {};
      const newCosts: Record<string, number> = {};
      Object.entries(row.quantities).forEach(([k, v]) => {
        if (k === "base") { newQuantities[k] = v; newCosts[k] = row.costs[k] || 0; return; }
        const idx = parseInt(k, 10);
        if (idx < i) { newQuantities[k] = v; newCosts[k] = row.costs[k] || 0; }
        else if (idx > i) { newQuantities[(idx - 1).toString()] = v; newCosts[(idx - 1).toString()] = row.costs[k] || 0; }
      });
      return { ...row, quantities: newQuantities, costs: newCosts };
    }));
    // Clean up modifier variant map
    const removedVariantId = savedVariantIds[i] || `new-${i}`;
    setModifierVariantMap(prev => {
      const next: Record<string, string[]> = {};
      for (const [modId, vids] of Object.entries(prev)) {
        next[modId] = vids.filter(v => v !== removedVariantId);
      }
      const emptyMods = Object.keys(next).filter(k => next[k].length === 0);
      setSelectedModifiers(p => p.filter(m => !emptyMods.includes(m)));
      return next;
    });
  };

  const updateVariant = (i: number, field: keyof Variant, value: string | number | null) =>
    setVariants(p => p.map((v, idx) => idx === i ? { ...v, [field]: value } : v));

  // ── Recipe helpers ──
  const addRecipeRow = () => {
    setRecipeRows(p => [...p, {
      name: "", unitId: "", unit: "",
      usageUnitId: "", usageUnitName: "",
      quantities: {}, costs: {},
    }]);
  };

  const removeRecipeRow = (idx: number) => setRecipeRows(p => p.filter((_, i) => i !== idx));

  const updateRecipeIngredient = (idx: number, ingredientId: string) => {
    const ing = ingredients.find(ig => ig.id === ingredientId);
    if (!ing) return;
    setRecipeRows(p => p.map((r, i) => i === idx ? {
      ...r,
      ingredientId,
      productionItemId: undefined,
      name: ing.name,
      unitId: ing.unit?.id || "",
      unit: ing.unit?.name || "",
      usageUnitId: ing.unit?.id || "",
      usageUnitName: ing.unit?.name || "",
      quantities: {},
      costs: {},
    } : r));
  };

  const updateRecipeItem = (idx: number, value: string) => {
    if (value.startsWith('ing_')) {
      const ingredientId = value.slice(4);
      const ing = ingredients.find(ig => ig.id === ingredientId);
      if (!ing) return;
      setRecipeRows(p => p.map((r, i) => i === idx ? {
        ...r,
        ingredientId,
        productionItemId: undefined,
        name: ing.name,
        unitId: ing.unit?.id || "",
        unit: ing.unit?.name || "",
        usageUnitId: ing.unit?.id || "",
        usageUnitName: ing.unit?.name || "",
        quantities: {},
        costs: {},
      } : r));
    } else if (value.startsWith('prod_')) {
      const productionItemId = value.slice(5);
      const prod = productionItems.find(p => p.id === productionItemId);
      if (!prod) return;
      setRecipeRows(p => p.map((r, i) => i === idx ? {
        ...r,
        ingredientId: undefined,
        productionItemId,
        name: prod.name,
        unitId: "",
        unit: prod.unit,
        usageUnitId: "",
        usageUnitName: prod.unit,
        quantities: {},
        costs: {},
      } : r));
    }
  };

  const updateRecipeQty = (idx: number, key: string, qty: number) => {
    setRecipeRows(p => p.map((r, i) => {
      if (i !== idx) return r;
      const ing = ingredients.find(ig => ig.id === r.ingredientId);
      const baseQty = convertToBaseUnit(qty, r.usageUnitId, r.unitId, conversionMap);
      const cost = baseQty * Number(ing?.purchasePrice || 0);
      return {
        ...r,
        quantities: { ...r.quantities, [key]: qty },
        costs: { ...r.costs, [key]: cost },
      };
    }));
  };

  const updateRecipeUnit = (idx: number, usageUnitId: string) => {
    const unit = units.find(u => u.id === usageUnitId);
    if (!unit) return;
    setRecipeRows(p => p.map((r, i) => {
      if (i !== idx) return r;
      const ing = ingredients.find(ig => ig.id === r.ingredientId);
      // Recalculate all costs
      const newCosts: Record<string, number> = {};
      Object.entries(r.quantities).forEach(([k, qty]) => {
        const baseQty = convertToBaseUnit(qty, usageUnitId, r.unitId, conversionMap);
        newCosts[k] = baseQty * Number(ing?.purchasePrice || 0);
      });
      return { ...r, usageUnitId, usageUnitName: unit.name, costs: newCosts };
    }));
  };

  // Cost calculations
  const getColumnTotal = (key: string) => recipeRows.reduce((s, r) => s + (r.costs[key] || 0), 0);
  const totalFoodCost = recipeRows.reduce((s, r) => s + Object.values(r.costs).reduce((a, b) => a + b, 0), 0);

  // ── Modifier helpers ──
  const toggleModifier = (mid: string) => setSelectedModifiers(p => p.includes(mid) ? p.filter(m => m !== mid) : [...p, mid]);

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

  // ── Meal type toggle ──
  const toggleMealType = (mtId: string) => {
    setMealTypeIds(p => p.includes(mtId) ? p.filter(id => id !== mtId) : [...p, mtId]);
  };

  // ── Image upload ──
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

  // ── Save ──
  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Item name is required"); return; }
    const price = pricingType === "simple" ? simplePrice : (variants[0]?.price || 0);
    if (!price) { toast.error("Price is required"); return; }

    setSaving(true);
    try {
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
        mealTypeIds,
        variants: pricingType === "variant" ? variants : [],
        modifiers: pricingType === "simple"
          ? selectedModifiers.map(mid => ({ id: mid, variantIds: [] }))
          : [],
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

      // Fix modifier variantIds with real DB IDs for variant pricing
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
          const allSelected = savedItem.variants.every((sv: any) => realVids.includes(sv.id));
          return { id: mid, variantIds: allSelected ? [] : realVids };
        });
        await menuService.updateMenuItem(savedId!, { modifiers: correctedModifiers });
      }

      // Build variantId mapping
      const variantIdMap: Record<string, string> = {};
      if (savedItem?.variants?.length) {
        savedItem.variants.forEach((sv: any) => { variantIdMap[sv.name] = sv.id; });
      }

      // Build recipe payload from RecipeRow[]
      if (savedId) {
        const recipeData: any[] = [];
        recipeRows.forEach(row => {
          if (!row.ingredientId && !row.productionItemId) return;
          const itemFields = row.ingredientId
            ? { ingredientId: row.ingredientId }
            : { productionItemId: row.productionItemId };
          if (pricingType === "simple") {
            const qty = row.quantities["base"] || 0;
            if (qty > 0) recipeData.push({
              ...itemFields,
              qtyPerUnit: qty,
              variantId: null,
              usageUnitId: row.usageUnitId || null,
            });
          } else {
            variants.forEach((v, idx) => {
              const qty = row.quantities[idx.toString()] || 0;
              if (qty > 0) {
                const realVariantId = variantIdMap[v.name] || null;
                recipeData.push({
                  ...itemFields,
                  qtyPerUnit: qty,
                  variantId: realVariantId,
                  usageUnitId: row.usageUnitId || null,
                });
              }
            });
          }
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

  // ── Render ──
  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-48" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );

  // Recipe column keys
  const recipeKeys = pricingType === "simple" ? ["base"] : variants.map((_, i) => i.toString());
  const recipeKeyLabels = pricingType === "simple" ? { base: "Qty" } : Object.fromEntries(variants.map((v, i) => [i.toString(), v.name || `V${i + 1}`]));

  // Soft-deleted production items still referenced by the recipe — computed once here, used in the picker
  const activeProdIds = new Set(productionItems.map(p => p.id));
  const inactiveRefProd = recipeRows
    .filter(r => r.productionItemId && !activeProdIds.has(r.productionItemId))
    .reduce<{ id: string; name: string }[]>((acc, r) => {
      if (!acc.some(x => x.id === r.productionItemId)) acc.push({ id: r.productionItemId!, name: r.name || 'Unknown item' });
      return acc;
    }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/items/food-menu")}><ArrowLeft className="h-4 w-4" /></Button>
        <PageHeader icon={<Utensils className="h-5 w-5" />} title={`${isEdit ? "Edit" : "Add New"} Food Item`} subtitle={`Items > Food Menu > ${isEdit ? "Edit" : "Add"}`} />
      </div>

      <div className="space-y-6">

          {/* SECTION 1 — General Info */}
          <Card className="shadow-sm"><CardHeader><CardTitle className="text-base">General Info</CardTitle></CardHeader><CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Item Name *</Label><Input value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g., Lahori Tikka" /></div>
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
            <div><Label>Category</Label><Select value={form.categoryId} onValueChange={(v) => setForm(p => ({ ...p, categoryId: v }))}><SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger><SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="flex items-center gap-1.5"><Timer className="h-3.5 w-3.5 text-primary" />Cooking Time (minutes)</Label><Input type="number" min={0} value={form.cookingTime || ""} onChange={(e) => setForm(p => ({ ...p, cookingTime: Number(e.target.value) }))} placeholder="e.g., 15" className="max-w-xs" /></div>

            {/* Meal Types */}
            {mealTypes.length > 0 && (
              <div className="space-y-1.5">
                <Label>Meal Types</Label>
                <div className="flex flex-wrap gap-2">
                  {mealTypes.filter(mt => mt.status === "active").map(mt => {
                    const isSelected = mealTypeIds.includes(mt.id);
                    return (
                      <Badge
                        key={mt.id}
                        variant={isSelected ? "default" : "outline"}
                        className={`cursor-pointer transition-colors ${isSelected ? "bg-primary text-primary-foreground hover:bg-primary/90" : "hover:bg-muted"}`}
                        onClick={() => toggleMealType(mt.id)}
                      >
                        {mt.name}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}

            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Item description..." /></div>
          </CardContent></Card>

          {/* SECTION 2 — Pricing Mode Toggle */}
          <Card className="shadow-sm"><CardHeader><CardTitle className="text-base">Pricing</CardTitle></CardHeader><CardContent className="space-y-4">
            <RadioGroup value={pricingType} onValueChange={(v) => setPricingType(v as "simple" | "variant")} className="flex gap-4">
              <div className="flex items-center gap-2"><RadioGroupItem value="simple" id="simple" /><Label htmlFor="simple">Simple Price</Label></div>
              <div className="flex items-center gap-2"><RadioGroupItem value="variant" id="variant" /><Label htmlFor="variant">Variant Pricing</Label></div>
            </RadioGroup>

            {/* SECTION 3 — Variants Row (variant mode only) */}
            {pricingType === "variant" && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {variants.map((v, i) => (
                    <Badge key={i} variant="secondary" className="text-sm py-1 px-3 gap-1.5">
                      {v.name || `Variant ${i + 1}`}
                      <button onClick={() => removeVariant(i)} className="hover:text-destructive transition-colors"><X className="h-3 w-3" /></button>
                    </Badge>
                  ))}
                  <div className="flex items-center gap-1.5">
                    <Input
                      placeholder="Variant name"
                      value={newVariantName}
                      onChange={(e) => setNewVariantName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addVariant(); } }}
                      className="h-8 text-xs w-32"
                    />
                    <Button variant="outline" size="sm" className="h-8" onClick={addVariant}><Plus className="h-3 w-3 mr-1" />Add</Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent></Card>

          {/* SECTION 4 — Recipe Table */}
          <Card className="shadow-sm"><CardHeader><CardTitle className="text-base">Recipe / Ingredients</CardTitle></CardHeader><CardContent>
            {recipeRows.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground mb-3">No ingredients added yet.</p>
                <Button variant="outline" size="sm" onClick={addRecipeRow}><Plus className="h-3 w-3 mr-1" />Add Ingredient</Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead className="w-10">SN</TableHead>
                        <TableHead className="min-w-[160px]">Ingredient</TableHead>
                        <TableHead className="w-24">Unit</TableHead>
                        {recipeKeys.map(key => (
                          pricingType === "simple" ? (
                            <TableHead key={key} className="w-20">Qty</TableHead>
                          ) : (
                            <TableHead key={key} colSpan={2} className="text-center border-l">{recipeKeyLabels[key]}</TableHead>
                          )
                        ))}
                        {pricingType === "simple" && <TableHead className="w-24 text-right">Cost (Rs.)</TableHead>}
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                      {pricingType === "variant" && (
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableHead></TableHead>
                          <TableHead></TableHead>
                          <TableHead></TableHead>
                          {recipeKeys.map(key => (
                            <React.Fragment key={key}>
                              <TableHead className="text-xs border-l w-20">Qty</TableHead>
                              <TableHead className="text-xs w-24 text-right">Cost</TableHead>
                            </React.Fragment>
                          ))}
                          <TableHead></TableHead>
                        </TableRow>
                      )}
                    </TableHeader>
                    <TableBody>
                      {recipeRows.map((row, idx) => {
                        const compatibleUnits = row.unitId ? getCompatibleUnits(row.unitId, units, conversionMap) : [];
                        return (
                          <TableRow key={idx} className="hover:bg-muted/20">
                            <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                            <TableCell>
                              <Select
                                value={
                                  row.ingredientId ? `ing_${row.ingredientId}`
                                  : row.productionItemId ? `prod_${row.productionItemId}`
                                  : ''
                                }
                                onValueChange={(v) => updateRecipeItem(idx, v)}
                              >
                                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select ingredient or item" /></SelectTrigger>
                                <SelectContent>
                                  <SelectGroup>
                                    <SelectLabel>Ingredients</SelectLabel>
                                    {ingredients.map(ig => (
                                      <SelectItem key={`ing_${ig.id}`} value={`ing_${ig.id}`}>{ig.name}</SelectItem>
                                    ))}
                                  </SelectGroup>
                                  <SelectGroup>
                                    <SelectLabel>Production Items</SelectLabel>
                                    {productionItems.map(pi => (
                                      <SelectItem key={`prod_${pi.id}`} value={`prod_${pi.id}`}>{pi.name} (Production)</SelectItem>
                                    ))}
                                    {inactiveRefProd.map(pi => (
                                      <SelectItem key={`prod_${pi.id}`} value={`prod_${pi.id}`}>{pi.name} (inactive)</SelectItem>
                                    ))}
                                  </SelectGroup>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              {compatibleUnits.length > 1 ? (
                                <Select value={row.usageUnitId} onValueChange={(v) => updateRecipeUnit(idx, v)}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Unit" /></SelectTrigger>
                                  <SelectContent>{compatibleUnits.map(u => <SelectItem key={u.id} value={u.id}>{u.symbol || u.name}</SelectItem>)}</SelectContent>
                                </Select>
                              ) : (
                                <span className="text-xs text-muted-foreground">{row.usageUnitName || row.unit || "—"}</span>
                              )}
                            </TableCell>
                            {recipeKeys.map(key => (
                              pricingType === "simple" ? (
                                <TableCell key={key}>
                                  <Input className="h-8 text-xs w-20" type="number" placeholder="0" value={row.quantities[key] || ""} onChange={(e) => updateRecipeQty(idx, key, Number(e.target.value))} />
                                </TableCell>
                              ) : (
                                <React.Fragment key={key}>
                                  <TableCell className="border-l">
                                    <Input className="h-8 text-xs w-20" type="number" placeholder="0" value={row.quantities[key] || ""} onChange={(e) => updateRecipeQty(idx, key, Number(e.target.value))} />
                                  </TableCell>
                                  <TableCell className="text-right text-xs text-muted-foreground">
                                    {(row.costs[key] || 0) > 0 ? `Rs.${Math.round(row.costs[key]).toLocaleString()}` : "—"}
                                  </TableCell>
                                </React.Fragment>
                              )
                            ))}
                            {pricingType === "simple" && (
                              <TableCell className="text-right text-xs font-medium">
                                {(row.costs["base"] || 0) > 0 ? `Rs.${Math.round(row.costs["base"]).toLocaleString()}` : "—"}
                              </TableCell>
                            )}
                            <TableCell>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeRecipeRow(idx)}><Trash2 className="h-3 w-3" /></Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {/* TOTAL row */}
                      <TableRow className="bg-muted/30 font-medium hover:bg-muted/30">
                        <TableCell colSpan={3} className="text-right text-sm">Total</TableCell>
                        {recipeKeys.map(key => (
                          pricingType === "simple" ? (
                            <TableCell key={key}></TableCell>
                          ) : (
                            <React.Fragment key={key}>
                              <TableCell className="border-l"></TableCell>
                              <TableCell className="text-right text-xs font-bold">Rs.{Math.round(getColumnTotal(key)).toLocaleString()}</TableCell>
                            </React.Fragment>
                          )
                        ))}
                        {pricingType === "simple" && (
                          <TableCell className="text-right text-xs font-bold">Rs.{Math.round(getColumnTotal("base")).toLocaleString()}</TableCell>
                        )}
                        <TableCell></TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
                <Button variant="outline" size="sm" onClick={addRecipeRow}><Plus className="h-3 w-3 mr-1" />Add Ingredient</Button>
              </div>
            )}
          </CardContent></Card>

          {/* SECTION 5 — Pricing Table */}
          <Card className="shadow-sm"><CardHeader><CardTitle className="text-base">Selling Prices</CardTitle></CardHeader><CardContent>
            {pricingType === "simple" ? (
              <div className="space-y-3">
                <div><Label className="text-xs text-muted-foreground">Base Price *</Label><Input type="number" placeholder="Base Price (Rs.)" value={simplePrice || ""} onChange={(e) => setSimplePrice(Number(e.target.value))} className="max-w-xs" /></div>
                <p className="text-xs text-muted-foreground">Order-type specific prices (leave empty to use base price):</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div><Label className="text-xs">Dine In</Label><Input type="number" placeholder="—" value={simpleDineIn ?? ""} onChange={(e) => setSimpleDineIn(e.target.value ? Number(e.target.value) : null)} /></div>
                  <div><Label className="text-xs">Take Away</Label><Input type="number" placeholder="—" value={simpleTakeAway ?? ""} onChange={(e) => setSimpleTakeAway(e.target.value ? Number(e.target.value) : null)} /></div>
                  <div><Label className="text-xs">Delivery</Label><Input type="number" placeholder="—" value={simpleDelivery ?? ""} onChange={(e) => setSimpleDelivery(e.target.value ? Number(e.target.value) : null)} /></div>
                  <div><Label className="text-xs">Foodpanda</Label><Input type="number" placeholder="—" value={simpleFoodpanda ?? ""} onChange={(e) => setSimpleFoodpanda(e.target.value ? Number(e.target.value) : null)} /></div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="w-32">Price</TableHead>
                      {variants.map((v, i) => <TableHead key={i} className="text-center min-w-[100px]">{v.name || `Variant ${i + 1}`}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="hover:bg-muted/20">
                      <TableCell className="font-medium text-sm">Base Price *</TableCell>
                      {variants.map((v, i) => (
                        <TableCell key={i}><Input type="number" className="h-8 text-xs" value={v.price || ""} onChange={(e) => updateVariant(i, "price", Number(e.target.value))} /></TableCell>
                      ))}
                    </TableRow>
                    {ORDER_TYPE_LABELS.map(({ key, label }) => (
                      <TableRow key={key} className="hover:bg-muted/20">
                        <TableCell className="text-sm text-muted-foreground">{label}</TableCell>
                        {variants.map((v, i) => (
                          <TableCell key={i}><Input type="number" className="h-8 text-xs" placeholder="—" value={v[key] ?? ""} onChange={(e) => updateVariant(i, key, e.target.value ? Number(e.target.value) : null)} /></TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent></Card>

          {/* SECTION 6 — Modifiers (Collapsible) */}
          <Card className="shadow-sm">
            <Collapsible open={modifiersOpen} onOpenChange={setModifiersOpen}>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2">
                    {modifiersOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <CardTitle className="text-base">Modifiers</CardTitle>
                    {selectedModifiers.length > 0 && <Badge variant="secondary" className="text-xs">{selectedModifiers.length} selected</Badge>}
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="space-y-3">
                  {pricingType === "variant" && variants.length > 0 ? (
                    <>
                      {/* Variant tabs */}
                      <div className="flex gap-1 border-b">
                        {variants.map((v, i) => (
                          <button
                            key={i}
                            className={`px-3 py-1.5 text-sm transition-colors border-b-2 ${activeModifierTab === i ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                            onClick={() => setActiveModifierTab(i)}
                          >
                            {v.name || `Variant ${i + 1}`}
                          </button>
                        ))}
                      </div>
                      {/* Active tab content */}
                      <div className="space-y-1.5">
                        {modifiersList.map(m => {
                          const variantId = savedVariantIds[activeModifierTab] || `new-${activeModifierTab}`;
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
                    </>
                  ) : (
                    <div className="space-y-1.5">
                      {modifiersList.map(m => {
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
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* Image */}
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
                  <img src={imageUrl} alt={form.name} className="w-full max-w-sm aspect-square object-cover rounded-lg" />
                  <button onClick={() => setImageUrl("")} className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 transition-colors" title="Remove image"><X className="h-3.5 w-3.5" /></button>
                </div>
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}><Upload className="h-4 w-4 mr-2" />Change Image</Button>
              </div>
            ) : (
              <div className="border-2 border-dashed border-border rounded-lg p-8 max-w-sm text-center hover:border-primary/50 transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Click to upload image</p>
                <p className="text-xs text-muted-foreground mt-1">Max 5MB — JPG, PNG, WebP</p>
                <p className="text-xs text-muted-foreground">Saved to Cloudinary CDN</p>
              </div>
            )}
          </CardContent></Card>

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => navigate("/items/food-menu")}>Cancel</Button>
            <Button className="gradient-primary text-primary-foreground" onClick={handleSave} disabled={saving || uploading}>{saving ? "Saving..." : uploading ? "Uploading..." : "Save Item"}</Button>
          </div>
      </div>
    </div>
  );
};

export default FoodMenuForm;

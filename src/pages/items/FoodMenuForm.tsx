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
import { Plus, Trash2, Upload, ArrowLeft, Utensils, Timer, Loader2, X } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { toast } from "sonner";
import { menuService, type CategoryRecord, type ModifierRecord, type RecipeIngredient } from "@/services/menu.service";
import { inventoryService, type IngredientRecord } from "@/services/inventory.service";
import { getAccessToken } from "@/services/api";

interface Variant { name: string; price: number; }
interface RecipeItem { ingredientId: string; name: string; qty: number; unit: string; cost: number; }

const FoodMenuForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const codeManualRef = useRef(false); // true when user manually typed a code

  // Form data
  const [form, setForm] = useState({ name: "", code: "", categoryId: "", description: "", available: true, cookingTime: 0 });

  // Auto-generate item code from name (only on Add, only if user hasn't manually set code)
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
  const [imageUrl, setImageUrl] = useState(""); // Cloudinary URL
  const [pricingType, setPricingType] = useState<"simple" | "variant">("simple");
  const [simplePrice, setSimplePrice] = useState(0);
  const [variants, setVariants] = useState<Variant[]>([{ name: "Small", price: 400 }, { name: "Medium", price: 550 }, { name: "Large", price: 750 }]);
  const [recipe, setRecipe] = useState<RecipeItem[]>([]);
  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);

  // Reference data
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [ingredients, setIngredients] = useState<IngredientRecord[]>([]);
  const [modifiersList, setModifiersList] = useState<ModifierRecord[]>([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [cats, ings, mods] = await Promise.all([
          menuService.getCategories(),
          inventoryService.getIngredients(),
          menuService.getModifiers(),
        ]);
        setCategories(cats);
        setIngredients(ings);
        setModifiersList(mods);

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
          if (item.variants && item.variants.length > 0) {
            setPricingType("variant");
            setVariants(item.variants.map((v) => ({ name: v.name, price: v.price })));
          }
          if (item.recipes && item.recipes.length > 0) {
            setRecipe(item.recipes.map((r: RecipeIngredient) => ({
              ingredientId: r.ingredientId,
              name: r.ingredient?.name || "",
              qty: Number(r.qtyPerUnit),
              unit: r.ingredient?.unit?.name || "",
              cost: Number(r.qtyPerUnit) * Number(r.ingredient?.purchasePrice || 0),
            })));
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

  const addVariant = () => setVariants((p) => [...p, { name: "", price: 0 }]);
  const removeVariant = (i: number) => setVariants((p) => p.filter((_, idx) => idx !== i));
  const updateVariant = (i: number, field: "name" | "price", value: string | number) =>
    setVariants((p) => p.map((v, idx) => idx === i ? { ...v, [field]: value } : v));

  const addRecipeItem = () => setRecipe((p) => [...p, { ingredientId: "", name: "", qty: 0, unit: "", cost: 0 }]);
  const removeRecipeItem = (i: number) => setRecipe((p) => p.filter((_, idx) => idx !== i));
  const updateRecipeItem = (i: number, ingredientId: string) => {
    const ing = ingredients.find((ig) => ig.id === ingredientId);
    if (!ing) return;
    setRecipe((p) => p.map((r, idx) => idx === i ? { ...r, ingredientId, name: ing.name, unit: ing.unit?.name || "", cost: 0 } : r));
  };
  const updateRecipeQty = (i: number, qty: number) => {
    setRecipe((p) => p.map((r, idx) => {
      if (idx !== i) return r;
      const ing = ingredients.find((ig) => ig.id === r.ingredientId);
      return { ...r, qty, cost: qty * Number(ing?.purchasePrice || 0) };
    }));
  };

  const totalFoodCost = recipe.reduce((s, r) => s + r.cost, 0);
  const sellingPrice = pricingType === "simple" ? simplePrice : (variants[0]?.price || 0);
  const markup = sellingPrice > 0 && totalFoodCost > 0 ? Math.round(((sellingPrice - totalFoodCost) / totalFoodCost) * 100) : 0;
  const toggleModifier = (mid: string) => setSelectedModifiers((p) => p.includes(mid) ? p.filter((m) => m !== mid) : [...p, mid]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so same file can be re-selected
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
      const itemData = {
        name: form.name,
        code: form.code || undefined,
        categoryId: form.categoryId || null,
        price,
        available: form.available,
        image: imageUrl || null,
        cookingTime: form.cookingTime || 0,
        variants: pricingType === "variant" ? variants : [],
      };

      let savedId = id;
      if (isEdit && id) {
        await menuService.updateMenuItem(id, itemData);
        toast.success("Item updated successfully");
      } else {
        const created = await menuService.createMenuItem(itemData);
        savedId = created.id;
        toast.success("Item added successfully");
      }

      // Save recipe
      if (savedId && recipe.length > 0) {
        await menuService.updateRecipe(savedId, recipe.map((r) => ({ ingredientId: r.ingredientId, qtyPerUnit: r.qty })));
      } else if (savedId && isEdit) {
        // Clear recipe if all removed
        await menuService.updateRecipe(savedId, []);
      }

      navigate("/items/food-menu");
    } catch (err: any) {
      toast.error(err.message || "Failed to save item");
    } finally {
      setSaving(false);
    }
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
          <Card className="shadow-sm"><CardHeader><CardTitle className="text-base">General Info</CardTitle></CardHeader><CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Item Name</Label><Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g., Lahori Tikka" /></div>
              <div>
                <Label>Item Code</Label>
                <Input
                  value={form.code}
                  onChange={(e) => {
                    codeManualRef.current = true;
                    setForm(p => ({ ...p, code: e.target.value }));
                  }}
                  onBlur={(e) => {
                    // If user clears the field manually, re-enable auto-gen
                    if (!e.target.value.trim()) codeManualRef.current = false;
                  }}
                  placeholder={isEdit ? "Leave blank to keep current" : "Auto-generated from name"}
                />
              </div>
            </div>
            <div><Label>Category</Label><Select value={form.categoryId} onValueChange={(v) => setForm((p) => ({ ...p, categoryId: v }))}><SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger><SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Item description..." /></div>
            <div><Label className="flex items-center gap-1.5"><Timer className="h-3.5 w-3.5 text-primary" />Cooking Time (minutes)</Label><Input type="number" min={0} value={form.cookingTime || ""} onChange={(e) => setForm((p) => ({ ...p, cookingTime: Number(e.target.value) }))} placeholder="e.g., 15" className="max-w-xs" /><p className="text-xs text-muted-foreground mt-1">Time needed to prepare this item. Used for kitchen timer & order tracking.</p></div>
          </CardContent></Card>

          <Card className="shadow-sm"><CardHeader><CardTitle className="text-base">Pricing</CardTitle></CardHeader><CardContent className="space-y-4">
            <RadioGroup value={pricingType} onValueChange={(v) => setPricingType(v as "simple" | "variant")} className="flex gap-4"><div className="flex items-center gap-2"><RadioGroupItem value="simple" id="simple" /><Label htmlFor="simple">Simple Price</Label></div><div className="flex items-center gap-2"><RadioGroupItem value="variant" id="variant" /><Label htmlFor="variant">Variant Pricing</Label></div></RadioGroup>
            {pricingType === "simple" ? (<Input type="number" placeholder="Price (Rs.)" value={simplePrice || ""} onChange={(e) => setSimplePrice(Number(e.target.value))} className="max-w-xs" />) : (
              <div className="space-y-2">{variants.map((v, i) => (<div key={i} className="flex items-center gap-3"><Input placeholder="Variant name" value={v.name} onChange={(e) => updateVariant(i, "name", e.target.value)} className="flex-1" /><Input type="number" placeholder="Price" value={v.price || ""} onChange={(e) => updateVariant(i, "price", Number(e.target.value))} className="w-32" /><Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeVariant(i)}><Trash2 className="h-4 w-4" /></Button></div>))}<Button variant="outline" size="sm" onClick={addVariant}><Plus className="h-3 w-3 mr-1" />Add Variant</Button></div>
            )}
          </CardContent></Card>

          <Card className="shadow-sm"><CardHeader><CardTitle className="text-base">Recipe / Ingredients</CardTitle></CardHeader><CardContent className="space-y-3">
            {recipe.map((r, i) => (<div key={i} className="flex flex-wrap items-center gap-2"><div className="flex-1 min-w-[140px]"><Select value={r.ingredientId} onValueChange={(v) => updateRecipeItem(i, v)}><SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Ingredient" /></SelectTrigger><SelectContent>{ingredients.map((ig) => <SelectItem key={ig.id} value={ig.id}>{ig.name}</SelectItem>)}</SelectContent></Select></div><div className="w-20"><Input className="h-9 text-xs" type="number" placeholder="Qty" value={r.qty || ""} onChange={(e) => updateRecipeQty(i, Number(e.target.value))} /></div><span className="text-xs text-muted-foreground w-12 text-center">{r.unit}</span><span className="text-xs font-medium w-20 text-right">Rs. {r.cost.toLocaleString()}</span><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeRecipeItem(i)}><Trash2 className="h-3 w-3" /></Button></div>))}
            <Button variant="outline" size="sm" onClick={addRecipeItem}><Plus className="h-3 w-3 mr-1" />Add Ingredient</Button>
            {recipe.length > 0 && (<div className="flex items-center gap-6 pt-3 border-t text-sm"><span>Total Food Cost: <strong>Rs. {totalFoodCost.toLocaleString()}</strong></span><span>Markup: <strong>{markup}%</strong></span></div>)}
          </CardContent></Card>

          <Card className="shadow-sm"><CardHeader><CardTitle className="text-base">Modifiers</CardTitle></CardHeader><CardContent><div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{modifiersList.map((m) => (<label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded border hover:bg-muted/50"><Checkbox checked={selectedModifiers.includes(m.id)} onCheckedChange={() => toggleModifier(m.id)} /><span className="flex-1">{m.name}</span><span className="text-muted-foreground">{m.price > 0 ? `+Rs.${m.price}` : "Free"}</span></label>))}</div></CardContent></Card>
        </div>

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
                  <button
                    onClick={() => setImageUrl("")}
                    className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 transition-colors"
                    title="Remove image"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <Button variant="outline" size="sm" className="w-full" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" />Change Image
                </Button>
              </div>
            ) : (
              <div
                className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
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

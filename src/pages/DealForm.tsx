import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import {
  Tag, Plus, Trash2, ArrowLeft, Loader2, Upload, Sparkles,
  Package, Check, Layers, Calendar, CheckCircle2, Clock
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getAccessToken } from "@/services/api";
import { dealService, type DealInput } from "@/services/deal.service";
import { menuService } from "@/services/menu.service";

interface ComboItemRow {
  itemId: string;
  variantId: string | null;
  qty: number;
}

interface OptionGroupRow {
  id: string;
  label: string;
  maxSelections: number;
  allowedItems: string[]; // menuItemIds
}

const DealForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: menuItems = [] } = useQuery({
    queryKey: ["menu-items"],
    queryFn: () => menuService.getMenuItems({ limit: 500 }),
  });
  const { data: foodCategories = [] } = useQuery({
    queryKey: ["menu-categories"],
    queryFn: () => menuService.getCategories(),
  });
  const { data: existingDeal, isLoading: loadingDeal } = useQuery({
    queryKey: ["deal", id],
    queryFn: () => dealService.getDeal(id as string),
    enabled: isEdit,
  });

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Form State
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [dealType, setDealType] = useState<"combo" | "option_combo">("combo");
  const [isActive, setIsActive] = useState(true);

  // Pricing
  const [dealPrice, setDealPrice] = useState<number>(0);
  const [dineInPrice, setDineInPrice] = useState<number | null>(null);
  const [takeAwayPrice, setTakeAwayPrice] = useState<number | null>(null);
  const [deliveryPrice, setDeliveryPrice] = useState<number | null>(null);
  const [foodpandaPrice, setFoodpandaPrice] = useState<number | null>(null);

  // Fixed Bundle Items
  const [comboRows, setComboRows] = useState<ComboItemRow[]>([]);

  // Customizable Option Groups
  const [optionGroups, setOptionGroups] = useState<OptionGroupRow[]>([]);
  const [groupCategoryFilters, setGroupCategoryFilters] = useState<Record<string, string>>({});

  // Validity & Schedule
  const todayStr = new Date().toISOString().split("T")[0];
  const [validFrom, setValidFrom] = useState(todayStr);
  const [validTo, setValidTo] = useState("");
  const [alwaysActive, setAlwaysActive] = useState(true);
  const [hasTimeRestriction, setHasTimeRestriction] = useState(false);
  const [startTime, setStartTime] = useState("12:00");
  const [endTime, setEndTime] = useState("23:59");

  // Load existing deal when editing
  useEffect(() => {
    if (!isEdit) return;
    if (loadingDeal) return;
    if (!existingDeal) {
      toast.error("Deal not found");
      navigate("/deals");
      return;
    }

    setName(existingDeal.name || "");
    setCode(existingDeal.code || "");
    setDescription(existingDeal.description || "");
    setImageUrl(existingDeal.image || "");
    setDealType(existingDeal.type);
    setIsActive(existingDeal.isActive ?? true);

    setDealPrice(existingDeal.price || 0);
    setDineInPrice(existingDeal.dineInPrice ?? null);
    setTakeAwayPrice(existingDeal.takeAwayPrice ?? null);
    setDeliveryPrice(existingDeal.deliveryPrice ?? null);
    setFoodpandaPrice(existingDeal.foodpandaPrice ?? null);

    if (existingDeal.components.length > 0) {
      setComboRows(existingDeal.components.map((c) => ({
        itemId: c.menuItemId,
        variantId: c.variantId,
        qty: c.qty,
      })));
    }

    if (existingDeal.optionGroups.length > 0) {
      setOptionGroups(existingDeal.optionGroups.map((g) => ({
        id: g.id,
        label: g.label,
        maxSelections: g.maxSelections,
        allowedItems: g.options.map((o) => o.menuItemId),
      })));
    }

    setValidFrom(existingDeal.validFrom.slice(0, 10) || todayStr);
    if (!existingDeal.validTo) {
      setAlwaysActive(true);
      setValidTo("");
    } else {
      setAlwaysActive(false);
      setValidTo(existingDeal.validTo.slice(0, 10));
    }

    if (existingDeal.startTime && existingDeal.endTime) {
      setHasTimeRestriction(true);
      setStartTime(existingDeal.startTime);
      setEndTime(existingDeal.endTime);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, existingDeal, loadingDeal]);

  // ── Image Upload ──
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
      toast.success("Image uploaded successfully");
    } catch (err: any) {
      toast.error(err.message || "Image upload failed");
    } finally {
      setUploading(false);
    }
  };

  // ── Fixed Bundle Helpers ──
  const addComboRow = () => {
    const firstItem = menuItems[0];
    if (!firstItem) {
      toast.error("No food menu items found in system");
      return;
    }
    setComboRows((prev) => [
      ...prev,
      { itemId: firstItem.id, variantId: null, qty: 1 },
    ]);
  };

  const removeComboRow = (idx: number) => {
    setComboRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateComboItem = (idx: number, itemId: string) => {
    setComboRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, itemId, variantId: null } : r))
    );
  };

  const updateComboVariant = (idx: number, variantId: string | null) => {
    setComboRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, variantId } : r))
    );
  };

  const updateComboQty = (idx: number, qty: number) => {
    const validQty = Math.max(1, qty);
    setComboRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, qty: validQty } : r))
    );
  };

  // Calculate total menu value of items in Fixed Bundle
  const bundleRegularValue = useMemo(() => {
    return comboRows.reduce((sum, row) => {
      const item = menuItems.find((m) => m.id === row.itemId);
      if (!item) return sum;
      let unitPrice = Number(item.price || 0);
      if (row.variantId) {
        const v = item.variants.find((vr) => vr.id === row.variantId);
        if (v && v.price != null) unitPrice = Number(v.price);
      }
      return sum + unitPrice * row.qty;
    }, 0);
  }, [comboRows, menuItems]);

  const bundleSavings = bundleRegularValue > 0 && dealPrice > 0 ? bundleRegularValue - dealPrice : 0;
  const bundleSavingsPercent = bundleRegularValue > 0 && bundleSavings > 0
    ? Math.round((bundleSavings / bundleRegularValue) * 100)
    : 0;

  // ── Customizable Groups Helpers ──
  const addOptionGroup = () => {
    const newId = crypto.randomUUID();
    setOptionGroups((prev) => [
      ...prev,
      {
        id: newId,
        label: `Step ${prev.length + 1}: Choose Item`,
        allowedItems: [],
        maxSelections: 1,
      },
    ]);
    setGroupCategoryFilters((prev) => ({ ...prev, [newId]: "All" }));
  };

  const removeOptionGroup = (groupId: string) => {
    setOptionGroups((prev) => prev.filter((g) => g.id !== groupId));
  };

  const updateGroupLabel = (groupId: string, label: string) => {
    setOptionGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, label } : g))
    );
  };

  const updateGroupMax = (groupId: string, maxSelections: number) => {
    setOptionGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, maxSelections: Math.max(1, maxSelections) } : g))
    );
  };

  const toggleItemInGroup = (groupId: string, itemId: string) => {
    setOptionGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        const exists = g.allowedItems.includes(itemId);
        return {
          ...g,
          allowedItems: exists
            ? g.allowedItems.filter((id) => id !== itemId)
            : [...g.allowedItems, itemId],
        };
      })
    );
  };

  // ── Save Deal ──
  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Please enter a Deal Name");
      return;
    }
    if (!dealPrice || dealPrice <= 0) {
      toast.error("Please specify a valid Deal Price");
      return;
    }
    if (!alwaysActive && validTo && validTo < validFrom) {
      toast.error("Valid To date cannot be before Valid From date");
      return;
    }

    if (dealType === "combo") {
      if (comboRows.length === 0) {
        toast.error("Please add at least 1 food item to this Fixed Bundle");
        return;
      }
    } else if (dealType === "option_combo") {
      if (optionGroups.length === 0) {
        toast.error("Please add at least 1 Step / Option group for this deal");
        return;
      }
      const emptyGroup = optionGroups.find((g) => g.allowedItems.length === 0);
      if (emptyGroup) {
        toast.error(`Please select at least 1 item for "${emptyGroup.label}"`);
        return;
      }
      const notEnoughGroup = optionGroups.find((g) => g.allowedItems.length < g.maxSelections);
      if (notEnoughGroup) {
        toast.error(`"${notEnoughGroup.label}" needs at least ${notEnoughGroup.maxSelections} selectable item(s)`);
        return;
      }
    }

    setSaving(true);
    try {
      const payload: DealInput = {
        name: name.trim(),
        code: code.trim() || null,
        description: description.trim() || null,
        image: imageUrl || null,
        type: dealType,
        price: Number(dealPrice),
        dineInPrice: dineInPrice != null ? Number(dineInPrice) : null,
        takeAwayPrice: takeAwayPrice != null ? Number(takeAwayPrice) : null,
        deliveryPrice: deliveryPrice != null ? Number(deliveryPrice) : null,
        foodpandaPrice: foodpandaPrice != null ? Number(foodpandaPrice) : null,
        isActive,
        validFrom,
        validTo: alwaysActive ? null : (validTo || null),
        startTime: hasTimeRestriction ? startTime : null,
        endTime: hasTimeRestriction ? endTime : null,
        components: dealType === "combo"
          ? comboRows.map((r, idx) => ({
              menuItemId: r.itemId,
              variantId: r.variantId,
              qty: r.qty,
              displayOrder: idx,
            }))
          : [],
        optionGroups: dealType === "option_combo"
          ? optionGroups.map((g, idx) => ({
              label: g.label,
              // The current UI lets an admin set only a max — a paid combo step
              // is normally "choose exactly N", so min is forced equal to max.
              minSelections: g.maxSelections,
              maxSelections: g.maxSelections,
              displayOrder: idx,
              options: g.allowedItems.map((itemId, oIdx) => ({
                menuItemId: itemId,
                variantId: null,
                extraPrice: 0,
                displayOrder: oIdx,
              })),
            }))
          : [],
      };

      if (isEdit && id) {
        await dealService.updateDeal(id, payload);
        toast.success(`Deal "${name}" updated successfully!`);
      } else {
        await dealService.createDeal(payload);
        toast.success(`Deal "${name}" created successfully!`);
      }
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      navigate("/deals");
    } catch (err: any) {
      toast.error(err.message || "Failed to save deal");
    } finally {
      setSaving(false);
    }
  };

  if (isEdit && loadingDeal) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 max-w-5xl mx-auto">
      {/* Top Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/deals")} className="rounded-xl">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold tracking-tight text-foreground">
                {isEdit ? "Edit Deal & Combo" : "Create New Deal & Combo"}
              </h1>
              <Badge variant={isActive ? "default" : "secondary"} className={isActive ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" : ""}>
                {isActive ? "Active" : "Draft / Inactive"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Configure bundle combos, pick-and-choose meal deals, and channel pricing
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button variant="outline" size="sm" onClick={() => navigate("/deals")}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="gradient-primary text-primary-foreground font-semibold shadow-xs"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
            {isEdit ? "Update Deal" : "Save Deal"}
          </Button>
        </div>
      </div>

      {/* ── SECTION 1: General Information ── */}
      <Card className="shadow-xs border-border/80">
        <CardHeader className="pb-3 border-b bg-muted/20">
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
            <Tag className="h-4 w-4 text-primary" />
            1. General Information
          </CardTitle>
          <CardDescription className="text-xs">
            Basic identity and display information for this deal
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-1.5">
              <Label className="text-xs font-semibold">
                Deal Name <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="e.g. Family Feast Deal, Duo Pizza Combo, Midnight Munchies"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-10 text-sm font-medium"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Deal Code / SKU (Optional)</Label>
              <Input
                placeholder="e.g. DEAL-01"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="h-10 text-sm font-mono"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Description / What's Included</Label>
            <Textarea
              placeholder="e.g. 1 Large Pizza + 1 Loaded Fries + 1.5 Litre Soft Drink. Freshly baked and served hot!"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="text-xs min-h-[70px] resize-y"
            />
          </div>

          {/* Image & Active Switch */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Deal Promotional Image</Label>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Image URL or upload..."
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="h-9 text-xs flex-1"
                />
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageUpload}
                  accept="image/*"
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0 gap-1.5 text-xs"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  Upload
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/10 self-end">
              <div>
                <p className="text-xs font-bold text-foreground">Deal Active Status</p>
                <p className="text-[11px] text-muted-foreground">Available on POS & ordering terminals</p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── SECTION 2: Deal Type Selection ── */}
      <Card className="shadow-xs border-border/80">
        <CardHeader className="pb-3 border-b bg-muted/20">
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            2. Choose Deal Format
          </CardTitle>
          <CardDescription className="text-xs">
            Select whether this deal is a pre-fixed bundle or customer pick-and-choose
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* Type 1: Fixed Bundle */}
            <button
              type="button"
              onClick={() => setDealType("combo")}
              className={cn(
                "p-4 rounded-xl border-2 text-left transition-all relative flex flex-col justify-between space-y-2 select-none cursor-pointer",
                dealType === "combo"
                  ? "border-primary bg-primary/[0.04] shadow-xs"
                  : "border-border hover:border-primary/40 hover:bg-muted/30"
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={cn("p-2 rounded-lg", dealType === "combo" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                    <Package className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-foreground">Fixed Bundle Combo</p>
                    <p className="text-[11px] text-muted-foreground">Pre-selected items at a bundle price</p>
                  </div>
                </div>
                {dealType === "combo" && (
                  <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px]">
                    <Check className="h-3.5 w-3.5 stroke-[3]" />
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground bg-background/80 p-2 rounded-lg border border-border/60">
                <strong>Example:</strong> 1 Large Chicken Fajita Pizza + 1 Loaded Fries + 1.5L Drink for Rs. 1,499.
              </p>
            </button>

            {/* Type 2: Customizable Combo */}
            <button
              type="button"
              onClick={() => setDealType("option_combo")}
              className={cn(
                "p-4 rounded-xl border-2 text-left transition-all relative flex flex-col justify-between space-y-2 select-none cursor-pointer",
                dealType === "option_combo"
                  ? "border-primary bg-primary/[0.04] shadow-xs"
                  : "border-border hover:border-primary/40 hover:bg-muted/30"
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={cn("p-2 rounded-lg", dealType === "option_combo" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                    <Layers className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-foreground">Customizable Combo (Pick & Choose)</p>
                    <p className="text-[11px] text-muted-foreground">Customer chooses from defined steps</p>
                  </div>
                </div>
                {dealType === "option_combo" && (
                  <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px]">
                    <Check className="h-3.5 w-3.5 stroke-[3]" />
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground bg-background/80 p-2 rounded-lg border border-border/60">
                <strong>Example:</strong> Choose any 2 Pizza flavors + 1 Drink flavor for Rs. 999.
              </p>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* ── SECTION 3: Pricing & Value Calculator ── */}
      <Card className="shadow-xs border-border/80">
        <CardHeader className="pb-3 border-b bg-muted/20">
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            3. Deal Pricing & Channels
          </CardTitle>
          <CardDescription className="text-xs">
            Set base deal price and optional channel-specific prices
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            <div className="space-y-1.5 md:col-span-1">
              <Label className="text-xs font-bold text-primary">
                Base Deal Price (Rs.) *
              </Label>
              <Input
                type="number"
                min={0}
                placeholder="0"
                value={dealPrice || ""}
                onChange={(e) => setDealPrice(Math.max(0, Number(e.target.value)))}
                className="h-10 text-sm font-extrabold border-primary/50 bg-primary/[0.02]"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Dine In (Optional)</Label>
              <Input
                type="number"
                min={0}
                placeholder={`Default (${dealPrice || 0})`}
                value={dineInPrice ?? ""}
                onChange={(e) => setDineInPrice(e.target.value === "" ? null : Math.max(0, Number(e.target.value)))}
                className="h-10 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Take Away (Optional)</Label>
              <Input
                type="number"
                min={0}
                placeholder={`Default (${dealPrice || 0})`}
                value={takeAwayPrice ?? ""}
                onChange={(e) => setTakeAwayPrice(e.target.value === "" ? null : Math.max(0, Number(e.target.value)))}
                className="h-10 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Delivery (Optional)</Label>
              <Input
                type="number"
                min={0}
                placeholder={`Default (${dealPrice || 0})`}
                value={deliveryPrice ?? ""}
                onChange={(e) => setDeliveryPrice(e.target.value === "" ? null : Math.max(0, Number(e.target.value)))}
                className="h-10 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Foodpanda (Optional)</Label>
              <Input
                type="number"
                min={0}
                placeholder={`Default (${dealPrice || 0})`}
                value={foodpandaPrice ?? ""}
                onChange={(e) => setFoodpandaPrice(e.target.value === "" ? null : Math.max(0, Number(e.target.value)))}
                className="h-10 text-sm"
              />
            </div>
          </div>

          {/* Live Value Breakdown Card for Fixed Bundle */}
          {dealType === "combo" && comboRows.length > 0 && (
            <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl border bg-gradient-to-r from-muted/50 via-muted/30 to-primary/[0.04]">
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-muted-foreground">Regular Menu Total</p>
                <p className="text-sm font-mono font-bold text-foreground">
                  Rs. {bundleRegularValue.toLocaleString()}
                </p>
              </div>

              <div className="space-y-0.5 text-center">
                <p className="text-xs font-semibold text-primary">Deal Offer Price</p>
                <p className="text-base font-mono font-extrabold text-primary">
                  Rs. {dealPrice.toLocaleString()}
                </p>
              </div>

              <div className="text-right space-y-0.5">
                <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Customer Savings</p>
                <p className="text-sm font-mono font-extrabold text-emerald-600 dark:text-emerald-400">
                  {bundleSavings > 0 ? `Rs. ${bundleSavings.toLocaleString()} (${bundleSavingsPercent}% OFF)` : "No discount"}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── SECTION 4: Component Items / Groups ── */}
      {dealType === "combo" ? (
        /* MODE A: Fixed Bundle Items Table */
        <Card className="shadow-xs border-border/80">
          <CardHeader className="pb-3 border-b bg-muted/20 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                4. Fixed Bundle Items ({comboRows.length})
              </CardTitle>
              <CardDescription className="text-xs">
                Add all food items and quantities that come included in this bundle
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addComboRow}
              className="gap-1.5 text-xs font-semibold"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Item
            </Button>
          </CardHeader>
          <CardContent className="p-4">
            {comboRows.length === 0 ? (
              <div className="text-center py-10 space-y-3 border border-dashed rounded-xl bg-muted/10">
                <Package className="h-9 w-9 text-muted-foreground/40 mx-auto" />
                <div>
                  <p className="text-sm font-bold text-foreground">No items added to this bundle yet</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Click below to add food menu items to this deal</p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={addComboRow} className="text-xs gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Add First Item
                </Button>
              </div>
            ) : (
              <div className="rounded-xl border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50 text-xs">
                      <TableHead className="w-10">SN</TableHead>
                      <TableHead className="min-w-[220px]">Food Menu Item</TableHead>
                      <TableHead className="min-w-[150px]">Size / Variant</TableHead>
                      <TableHead className="w-24 text-center">Qty</TableHead>
                      <TableHead className="w-28 text-right">Unit Price</TableHead>
                      <TableHead className="w-28 text-right">Subtotal</TableHead>
                      <TableHead className="w-12 text-center"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comboRows.map((row, idx) => {
                      const selectedItem = menuItems.find((m) => m.id === row.itemId);
                      const variants = selectedItem?.variants || [];
                      let unitPrice = Number(selectedItem?.price || 0);

                      if (row.variantId) {
                        const v = variants.find((vr) => vr.id === row.variantId);
                        if (v && v.price != null) unitPrice = Number(v.price);
                      }

                      const subtotal = unitPrice * row.qty;

                      return (
                        <TableRow key={idx} className="hover:bg-muted/20">
                          <TableCell className="text-xs text-muted-foreground font-mono">{idx + 1}</TableCell>

                          {/* Item Dropdown */}
                          <TableCell>
                            <Select
                              value={row.itemId}
                              onValueChange={(val) => updateComboItem(idx, val)}
                            >
                              <SelectTrigger className="h-9 text-xs">
                                <SelectValue placeholder="Select Food Item..." />
                              </SelectTrigger>
                              <SelectContent className="max-h-60">
                                {menuItems.map((item) => (
                                  <SelectItem key={item.id} value={item.id} className="text-xs">
                                    {item.name} {item.category?.name ? `(${item.category.name})` : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>

                          {/* Variant / Size */}
                          <TableCell>
                            {variants.length > 0 ? (
                              <Select
                                value={row.variantId || "default"}
                                onValueChange={(val) => updateComboVariant(idx, val === "default" ? null : val)}
                              >
                                <SelectTrigger className="h-9 text-xs">
                                  <SelectValue placeholder="Select Size..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="default" className="text-xs">Standard (Rs. {selectedItem?.price})</SelectItem>
                                  {variants.map((v) => (
                                    <SelectItem key={v.id} value={v.id} className="text-xs">
                                      {v.name} (Rs. {v.price})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-xs text-muted-foreground italic px-2">Standard</span>
                            )}
                          </TableCell>

                          {/* Quantity */}
                          <TableCell>
                            <Input
                              type="number"
                              min={1}
                              value={row.qty}
                              onChange={(e) => updateComboQty(idx, Number(e.target.value))}
                              className="h-9 text-xs text-center font-bold"
                            />
                          </TableCell>

                          {/* Unit Price */}
                          <TableCell className="text-right text-xs font-mono text-muted-foreground">
                            Rs. {unitPrice.toLocaleString()}
                          </TableCell>

                          {/* Subtotal */}
                          <TableCell className="text-right text-xs font-mono font-bold text-foreground">
                            Rs. {subtotal.toLocaleString()}
                          </TableCell>

                          {/* Delete */}
                          <TableCell className="text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeComboRow(idx)}
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
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
      ) : (
        /* MODE B: Customizable Pick & Choose Groups */
        <Card className="shadow-xs border-border/80">
          <CardHeader className="pb-3 border-b bg-muted/20 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                4. Selection Steps / Groups ({optionGroups.length})
              </CardTitle>
              <CardDescription className="text-xs">
                Create steps for the customer to choose items (e.g. Choose 1st Pizza, Choose Soft Drink)
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addOptionGroup}
              className="gap-1.5 text-xs font-semibold"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Step Group
            </Button>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            {optionGroups.length === 0 ? (
              <div className="text-center py-10 space-y-3 border border-dashed rounded-xl bg-muted/10">
                <Layers className="h-9 w-9 text-muted-foreground/40 mx-auto" />
                <div>
                  <p className="text-sm font-bold text-foreground">No selection steps created yet</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Click below to create your first choice group (e.g. Choose Pizza Flavor)
                  </p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={addOptionGroup} className="text-xs gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Add First Step Group
                </Button>
              </div>
            ) : (
              optionGroups.map((group, gIdx) => {
                const activeCat = groupCategoryFilters[group.id] || "All";
                const displayItems = menuItems.filter(
                  (item) => activeCat === "All" || item.category?.name === activeCat
                );

                return (
                  <div key={group.id} className="p-4 rounded-xl border bg-muted/10 space-y-3.5">
                    {/* Group Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b">
                      <div className="flex items-center gap-2 flex-1">
                        <span className="h-6 w-6 rounded-lg bg-primary/10 text-primary font-extrabold text-xs flex items-center justify-center shrink-0">
                          #{gIdx + 1}
                        </span>
                        <Input
                          value={group.label}
                          onChange={(e) => updateGroupLabel(group.id, e.target.value)}
                          placeholder="e.g. Choose 1st Pizza Flavor"
                          className="h-8 text-xs font-bold max-w-sm"
                        />
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-auto">
                        <div className="flex items-center gap-1.5">
                          <Label className="text-[11px] text-muted-foreground font-medium whitespace-nowrap">
                            Max Selectable:
                          </Label>
                          <Input
                            type="number"
                            min={1}
                            value={group.maxSelections}
                            onChange={(e) => updateGroupMax(group.id, Number(e.target.value))}
                            className="h-8 w-16 text-xs text-center font-bold"
                          />
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeOptionGroup(group.id)}
                          className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                        </Button>
                      </div>
                    </div>

                    {/* Category Filter for this group */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-muted-foreground">
                          Click items below to include in this choice group ({group.allowedItems.length} selected):
                        </p>
                        <div className="flex gap-1 overflow-x-auto pb-1 max-w-[50%]">
                          <Button
                            type="button"
                            size="sm"
                            variant={activeCat === "All" ? "default" : "outline"}
                            onClick={() => setGroupCategoryFilters((p) => ({ ...p, [group.id]: "All" }))}
                            className="h-6 text-[10px] px-2"
                          >
                            All
                          </Button>
                          {foodCategories.map((c) => (
                            <Button
                              key={c.id}
                              type="button"
                              size="sm"
                              variant={activeCat === c.name ? "default" : "outline"}
                              onClick={() => setGroupCategoryFilters((p) => ({ ...p, [group.id]: c.name }))}
                              className="h-6 text-[10px] px-2 whitespace-nowrap"
                            >
                              {c.name}
                            </Button>
                          ))}
                        </div>
                      </div>

                      {/* Items Selectable Badges */}
                      <div className="flex flex-wrap gap-1.5 p-3 rounded-lg border bg-background max-h-48 overflow-y-auto">
                        {displayItems.map((item) => {
                          const isSelected = group.allowedItems.includes(item.id);
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => toggleItemInGroup(group.id, item.id)}
                              className={cn(
                                "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer select-none",
                                isSelected
                                  ? "bg-primary/10 border-primary text-primary font-bold ring-1 ring-primary"
                                  : "bg-muted/30 border-border text-foreground hover:border-primary/40 hover:bg-muted/60"
                              )}
                            >
                              {isSelected ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                              ) : (
                                <span className="h-3.5 w-3.5 rounded-full border border-muted-foreground/40 shrink-0" />
                              )}
                              <span>{item.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      )}

      {/* ── SECTION 5: Validity & Schedule ── */}
      <Card className="shadow-xs border-border/80">
        <CardHeader className="pb-3 border-b bg-muted/20">
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            5. Validity & Schedule
          </CardTitle>
          <CardDescription className="text-xs">
            Specify start/end dates and optional happy-hour time restrictions
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Valid From Date</Label>
              <Input
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                className="h-10 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Valid To Date</Label>
              <Input
                type="date"
                disabled={alwaysActive}
                min={validFrom}
                value={alwaysActive ? "" : validTo}
                onChange={(e) => setValidTo(e.target.value)}
                className="h-10 text-xs"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/10 self-end">
              <div>
                <p className="text-xs font-bold text-foreground">Never Expires</p>
                <p className="text-[11px] text-muted-foreground">Always active indefinitely</p>
              </div>
              <Switch checked={alwaysActive} onCheckedChange={setAlwaysActive} />
            </div>
          </div>

          {/* Time restriction (Happy Hour) */}
          <div className="pt-2 border-t space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  Time Slot Restriction (Optional)
                </p>
                <p className="text-[11px] text-muted-foreground">Restrict deal to specific hours (e.g. Midnight Deal 11PM-3AM)</p>
              </div>
              <Switch checked={hasTimeRestriction} onCheckedChange={setHasTimeRestriction} />
            </div>

            {hasTimeRestriction && (
              <div className="grid grid-cols-2 gap-4 p-3 rounded-xl border bg-muted/15 max-w-md animate-in slide-in-from-top-1">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Start Time</Label>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">End Time</Label>
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sticky Bottom Bar */}
      <div className="flex items-center justify-between gap-3 pt-4 border-t">
        <Button variant="outline" onClick={() => navigate("/deals")}>
          Cancel
        </Button>
        <Button
          className="gradient-primary text-primary-foreground font-semibold px-6 shadow-xs"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
          {isEdit ? "Update Deal" : "Save Deal"}
        </Button>
      </div>
    </div>
  );
};

export default DealForm;

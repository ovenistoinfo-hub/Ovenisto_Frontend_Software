import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
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
  Package, Check, Layers, Calendar, CheckCircle2, Clock, Percent, Gift,
  ShoppingBag, UtensilsCrossed, Truck, Eye, Image as ImageIcon,
  Coins, TrendingUp, Calculator, ArrowUpRight, ArrowDownRight, RefreshCw, BadgePercent, HelpCircle,
  AlertTriangle
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getAccessToken } from "@/services/api";
import { dealService, type DealInput, type DealTypeValue } from "@/services/deal.service";
import { menuService } from "@/services/menu.service";

interface ComboItemRow {
  itemId: string;
  variantId: string | null;
  qty: number;
}

/** One selectable choice inside a step group. `categoryId` is a UI-only filter that
 *  narrows the item dropdown — it is never sent to the backend. */
interface OptionChoiceRow {
  categoryId: string;
  itemId: string;
  variantId: string | null;
}

/** An individually-named item in a percentage deal's scope. `categoryId` is a
 *  UI-only filter for the row's item dropdown and is never sent to the backend. */
interface ScopeItemRow {
  categoryId: string;
  itemId: string;
}

/** One row on either side of a Buy X Get Y offer. `categoryId` is a UI-only
 *  filter for the row's item dropdown and is never sent to the backend. */
interface BogoRow {
  categoryId: string;
  itemId: string;
  variantId: string | null;
  qty: number;
}

const emptyBogoRow = (): BogoRow => ({ categoryId: "", itemId: "", variantId: null, qty: 1 });

/** Drops rows the admin left blank and strips the UI-only category filter. */
const toBogoInput = (rows: BogoRow[]) =>
  rows
    .filter((r) => r.itemId)
    .map((r, idx) => ({
      menuItemId: r.itemId,
      variantId: r.variantId,
      qty: Math.max(1, Number(r.qty) || 1),
      displayOrder: idx,
    }));

interface OptionGroupRow {
  id: string;
  label: string;
  maxSelections: number;
  choices: OptionChoiceRow[];
  /** False while the label still tracks the step's contents; set once an admin
   *  types their own wording, which then wins over the derived text. */
  labelEdited: boolean;
}

/** Column widths for the Buy X Get Y row table. Qty sits after Selling, the
 *  same place a Fixed Bundle row puts it, so both tables scan identically. */
const BOGO_GRID = "1fr 1.4fr 0.9fr 78px 78px 84px 36px";

/** The two halves of a Buy X Get Y offer. Both render the same row table, so
 *  they are described once here rather than duplicated in the markup. */
const BOGO_SIDES = [
  {
    key: "buy" as const,
    title: "Customer Buys",
    icon: ShoppingBag,
    hint: "Every item listed here has to be bought for the offer to apply",
  },
  {
    key: "get" as const,
    title: "Customer Gets Free",
    icon: Gift,
    hint: "Every item listed here is given away when the offer applies",
  },
];

const PERCENT_PRESETS = [10, 15, 20, 25, 30, 50];

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
  const [calcMode, setCalcMode] = useState<"discount" | "margin">("discount");
  const [priceMode, setPriceMode] = useState<"amount" | "percent">("amount");
  const [percentInput, setPercentInput] = useState<string>("");

  // Form State
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [isCodeManual, setIsCodeManual] = useState(false);
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [dealType, setDealType] = useState<DealTypeValue>("combo");
  const [isActive, setIsActive] = useState(true);

  // Helper to auto-generate clean SKU from deal name
  const generateCodeFromName = (str: string): string => {
    return str
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 16);
  };

  const handleNameChange = (val: string) => {
    setName(val);
    if (!isCodeManual && !isEdit) {
      setCode(generateCodeFromName(val));
    }
  };

  const handleCodeChange = (val: string) => {
    setCode(val.toUpperCase());
    setIsCodeManual(val.trim().length > 0);
  };

  // Pricing (combo / option_combo)
  const [dealPrice, setDealPrice] = useState<number>(0);
  const [dineInPrice, setDineInPrice] = useState<number | null>(null);
  const [takeAwayPrice, setTakeAwayPrice] = useState<number | null>(null);
  const [deliveryPrice, setDeliveryPrice] = useState<number | null>(null);
  const [foodpandaPrice, setFoodpandaPrice] = useState<number | null>(null);
  // Percent-mode display values for the channel overrides below (Rs. fields stay the source of truth)
  const [dineInPct, setDineInPct] = useState<string>("");
  const [takeAwayPct, setTakeAwayPct] = useState<string>("");
  const [deliveryPct, setDeliveryPct] = useState<string>("");
  const [foodpandaPct, setFoodpandaPct] = useState<string>("");

  // Fixed Bundle Items
  const [comboRows, setComboRows] = useState<ComboItemRow[]>([]);

  // Customizable Option Groups
  const [optionGroups, setOptionGroups] = useState<OptionGroupRow[]>([]);

  // Percentage
  const [discountPercent, setDiscountPercent] = useState<number>(10);
  /** One row per individually-named item in a percentage deal's scope.
   *  `categoryId` only narrows the row's item dropdown; it is never persisted. */
  const [scopeItemRows, setScopeItemRows] = useState<ScopeItemRow[]>([]);
  const [applicableCategoryIds, setApplicableCategoryIds] = useState<string[]>([]);

  // Buy X Get Y
  // Both sides hold any number of items, so "Buy 1 Pizza + 1 Pasta, get 1 Drink
  // + 1 Fries free" is one deal. Each row pins a size — without one the offer
  // means "any size", and a customer can qualify with the cheapest while
  // claiming the priciest free.
  const [buyRows, setBuyRows] = useState<BogoRow[]>([emptyBogoRow()]);
  const [getRows, setGetRows] = useState<BogoRow[]>([emptyBogoRow()]);
  // UI-only category filters narrowing the two item dropdowns; never persisted.

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
    setIsCodeManual(Boolean(existingDeal.code));
    setDescription(existingDeal.description || "");
    setImageUrl(existingDeal.image || "");
    setDealType(existingDeal.type);
    setIsActive(existingDeal.isActive ?? true);

    setDealPrice(existingDeal.price || 0);
    setDineInPrice(existingDeal.dineInPrice ?? null);
    setTakeAwayPrice(existingDeal.takeAwayPrice ?? null);
    setDeliveryPrice(existingDeal.deliveryPrice ?? null);
    setFoodpandaPrice(existingDeal.foodpandaPrice ?? null);

    if (existingDeal.components && existingDeal.components.length > 0) {
      setComboRows(
        existingDeal.components.map((c) => ({
          itemId: c.menuItemId,
          variantId: c.variantId,
          qty: c.qty,
        }))
      );
    }

    if (existingDeal.optionGroups && existingDeal.optionGroups.length > 0) {
      setOptionGroups(
        existingDeal.optionGroups.map((g) => ({
          id: g.id,
          label: g.label,
          maxSelections: g.maxSelections,
          // A saved deal's wording is the admin's — keep it verbatim rather than
          // re-deriving over it.
          labelEdited: true,
          // categoryId stays empty here — for a row that already has an item, the
          // category shown is derived from that item at render time, so this never
          // races the menuItems query.
          choices: g.options.map((o) => ({
            categoryId: "",
            itemId: o.menuItemId,
            variantId: o.variantId,
          })),
        }))
      );
    }

    setDiscountPercent(existingDeal.discountPercent ?? 10);
    setScopeItemRows(
      (existingDeal.applicableItems ?? []).map((itemId) => ({ categoryId: "", itemId }))
    );
    setApplicableCategoryIds(existingDeal.applicableCategories ?? []);
    // A deal saved since bogoItems existed carries every row there. An older one
    // has a single item per side in the flat fields — read those so editing an
    // existing deal doesn't silently drop it.
    const bogo = existingDeal.bogoItems ?? [];
    const fromRelation = (role: "BUY" | "GET"): BogoRow[] =>
      bogo
        .filter((b) => b.role === role)
        .slice()
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((b) => ({ categoryId: "", itemId: b.menuItemId, variantId: b.variantId, qty: b.qty }));

    const legacyRow = (itemId: string | null, variantId: string | null, qty: number | null): BogoRow[] =>
      itemId ? [{ categoryId: "", itemId, variantId, qty: qty ?? 1 }] : [emptyBogoRow()];

    const buyFromRelation = fromRelation("BUY");
    const getFromRelation = fromRelation("GET");
    setBuyRows(
      buyFromRelation.length > 0
        ? buyFromRelation
        : legacyRow(existingDeal.buyItemId, existingDeal.buyVariantId, existingDeal.buyQty)
    );
    setGetRows(
      getFromRelation.length > 0
        ? getFromRelation
        : legacyRow(existingDeal.getItemId, existingDeal.getVariantId, existingDeal.getQty)
    );

    setValidFrom(existingDeal.validFrom?.slice(0, 10) || todayStr);
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
  }, [isEdit, existingDeal, loadingDeal]);

  // Direct File Image Upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files allowed (PNG, JPG, WebP)");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const token = getAccessToken();
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || "http://localhost:3001/api"}/upload/image`,
        {
          method: "POST",
          headers: { ...(token && { Authorization: `Bearer ${token}` }) },
          body: formData,
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setImageUrl(data.data.url);
      toast.success("Deal image uploaded successfully");
    } catch (err: any) {
      toast.error(err.message || "Image upload failed");
    } finally {
      setUploading(false);
    }
  };

  // Fixed Bundle Helpers
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

  // Dynamic unit conversion map from inventory API
  // Single item cost — reads the recipe-derived costPrice snapshotted when the menu item was saved
  // (same source as the Cost/Margin columns on the Food Menu list), not a live recipe recompute.
  const getItemCost = useCallback(
    (itemId: string, variantId: string | null): number => {
      const item = menuItems.find((m) => m.id === itemId);
      if (!item) return 0;
      if (variantId) {
        const v = item.variants?.find((vr) => vr.id === variantId);
        if (v) return Number(v.costPrice || 0);
      }
      return Number(item.costPrice || 0);
    },
    [menuItems]
  );

  // Total Bundle Cost (Sum of all recipe ingredient purchase costs)
  const bundleCostPrice = useMemo(() => {
    return comboRows.reduce((sum, row) => {
      const itemCost = getItemCost(row.itemId, row.variantId);
      return sum + itemCost * row.qty;
    }, 0);
  }, [comboRows, getItemCost]);

  // Total Regular Menu Selling Value (Sum of retail menu prices)
  const bundleRegularValue = useMemo(() => {
    return comboRows.reduce((sum, row) => {
      const item = menuItems.find((m) => m.id === row.itemId);
      if (!item) return sum;
      let unitPrice = Number(item.price || 0);
      if (row.variantId) {
        const v = item.variants?.find((vr) => vr.id === row.variantId);
        if (v && v.price != null) unitPrice = Number(v.price);
      }
      return sum + unitPrice * row.qty;
    }, 0);
  }, [comboRows, menuItems]);

  /**
   * A Customizable combo has no single total — the customer's picks decide it. What
   * it does have is a range: in each step, taking the N cheapest choices gives the
   * floor, the N priciest gives the ceiling. Summed across steps that yields the
   * cheapest and priciest combinations a customer can walk out with. The priciest
   * end is the one that matters for pricing: margin has to survive it.
   */
  const optionComboTotals = useMemo(() => {
    let minCost = 0;
    let maxCost = 0;
    let minSelling = 0;
    let maxSelling = 0;

    for (const group of optionGroups) {
      const priced = group.choices
        .filter((c) => c.itemId)
        .map((c) => {
          const item = menuItems.find((m) => m.id === c.itemId);
          let selling = Number(item?.price || 0);
          if (c.variantId) {
            const v = item?.variants?.find((vr) => vr.id === c.variantId);
            if (v && v.price != null) selling = Number(v.price);
          }
          return { cost: getItemCost(c.itemId, c.variantId), selling };
        });
      if (priced.length === 0) continue;

      // Can't pick more than the step actually offers.
      const pick = Math.min(group.maxSelections, priced.length);

      const byCost = [...priced].sort((a, b) => a.cost - b.cost);
      minCost += byCost.slice(0, pick).reduce((s, p) => s + p.cost, 0);
      maxCost += byCost.slice(-pick).reduce((s, p) => s + p.cost, 0);

      const bySelling = [...priced].sort((a, b) => a.selling - b.selling);
      minSelling += bySelling.slice(0, pick).reduce((s, p) => s + p.selling, 0);
      maxSelling += bySelling.slice(-pick).reduce((s, p) => s + p.selling, 0);
    }

    return { minCost, maxCost, minSelling, maxSelling };
  }, [optionGroups, menuItems, getItemCost]);

  // The figures every pricing calculation below works from. A Fixed Bundle has exact
  // totals; a Customizable combo prices against its worst case (priciest picks).
  const basisCost = dealType === "combo" ? bundleCostPrice : optionComboTotals.maxCost;
  const basisValue = dealType === "combo" ? bundleRegularValue : optionComboTotals.maxSelling;

  // Deal Profit (Deal Price - Cost Price)
  const bundleProfit = dealPrice > 0 ? dealPrice - bundleCostPrice : 0;
  const bundleProfitMargin =
    dealPrice > 0 && bundleCostPrice > 0
      ? Math.round(((dealPrice - bundleCostPrice) / dealPrice) * 100)
      : 0;

  // Customer Savings (Menu Value - Deal Price)
  const bundleSavings = bundleRegularValue > 0 && dealPrice > 0 ? bundleRegularValue - dealPrice : 0;
  const bundleSavingsPercent =
    bundleRegularValue > 0 && bundleSavings > 0
      ? Math.round((bundleSavings / bundleRegularValue) * 100)
      : 0;

  // Baseline margin if items were sold separately at full menu price (no deal applied)
  const bundleMenuMargin =
    bundleRegularValue > 0
      ? Math.round(((bundleRegularValue - bundleCostPrice) / bundleRegularValue) * 100)
      : 0;

  // Set deal price from a percentage of either the menu total (discount) or the cost (markup)
  const applyPercent = useCallback(
    (pct: number, mode: "discount" | "margin" = calcMode) => {
      const basis = mode === "discount" ? basisValue : basisCost;
      const price = basis > 0 ? Math.round(mode === "discount" ? basis * (1 - pct / 100) : basis * (1 + pct / 100)) : 0;
      setDealPrice(Math.max(0, price));
    },
    [calcMode, basisValue, basisCost]
  );

  const handlePercentInputChange = (val: string) => {
    setPercentInput(val);
    applyPercent(Math.min(100, Math.max(0, Number(val) || 0)));
  };

  const handleCalcModeChange = (mode: "discount" | "margin") => {
    setCalcMode(mode);
    if (priceMode === "percent") applyPercent(Number(percentInput) || 0, mode);
  };

  // Back-derive a display percentage from a saved Rs. amount (used when switching into percent mode)
  const pctFromPrice = useCallback(
    (price: number | null): string => {
      const basis = calcMode === "discount" ? basisValue : basisCost;
      if (!price || basis <= 0) return "";
      const pct = calcMode === "discount" ? Math.round((1 - price / basis) * 100) : Math.round((price / basis - 1) * 100);
      return pct > 0 ? String(pct) : "";
    },
    [calcMode, basisValue, basisCost]
  );

  // Percent pricing needs a computable basis. A Fixed Bundle always has one; a
  // Customizable combo has one only once its steps hold priced items, which is what
  // basisValue reflects.
  const supportsPercentPricing = basisValue > 0;
  const effectivePriceMode = supportsPercentPricing ? priceMode : "amount";

  // Rs./% is the single toggle governing both the main input and the channel override inputs below
  const handlePriceModeChange = (mode: "amount" | "percent") => {
    setPriceMode(mode);
    if (mode === "percent") {
      setPercentInput(pctFromPrice(dealPrice));
      setDineInPct(pctFromPrice(dineInPrice));
      setTakeAwayPct(pctFromPrice(takeAwayPrice));
      setDeliveryPct(pctFromPrice(deliveryPrice));
      setFoodpandaPct(pctFromPrice(foodpandaPrice));
    }
  };

  // Convert a typed channel percentage into the Rs. amount actually saved
  const applyChannelPercent = (
    pctStr: string,
    setPct: (v: string) => void,
    setPrice: (v: number | null) => void
  ) => {
    setPct(pctStr);
    if (pctStr === "") { setPrice(null); return; }
    const pct = Math.max(0, Number(pctStr) || 0);
    const basis = calcMode === "discount" ? basisValue : basisCost;
    const price = basis > 0 ? Math.round(calcMode === "discount" ? basis * (1 - pct / 100) : basis * (1 + pct / 100)) : 0;
    setPrice(Math.max(0, price));
  };

  // Customizable Option Groups Helpers
  const addOptionGroup = () => {
    setOptionGroups((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        label: "",
        choices: [],
        maxSelections: 1,
        labelEdited: false,
      },
    ]);
  };

  const removeOptionGroup = (groupId: string) => {
    setOptionGroups((prev) => prev.filter((g) => g.id !== groupId));
  };

  const updateGroupLabel = (groupId: string, label: string) => {
    setOptionGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, label, labelEdited: true } : g))
    );
  };

  const updateGroupMax = (groupId: string, maxSelections: number) => {
    setOptionGroups((prev) =>
      prev.map((g) =>
        g.id === groupId ? { ...g, maxSelections: Math.max(1, maxSelections) } : g
      )
    );
  };

  /** Rewrites one choice row inside one group, leaving every other row untouched. */
  const patchChoice = (
    groupId: string,
    idx: number,
    patch: Partial<OptionChoiceRow>
  ) => {
    setOptionGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, choices: g.choices.map((c, i) => (i === idx ? { ...c, ...patch } : c)) }
          : g
      )
    );
  };

  const addChoiceRow = (groupId: string) => {
    setOptionGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, choices: [...g.choices, { categoryId: "", itemId: "", variantId: null }] }
          : g
      )
    );
  };

  const removeChoiceRow = (groupId: string, idx: number) => {
    setOptionGroups((prev) =>
      prev.map((g) =>
        g.id === groupId ? { ...g, choices: g.choices.filter((_, i) => i !== idx) } : g
      )
    );
  };

  // Changing the category clears the item/variant beneath it — the old item is no
  // longer in the narrowed dropdown, so keeping it would show a value the list
  // doesn't contain.
  const updateChoiceCategory = (groupId: string, idx: number, categoryId: string) =>
    patchChoice(groupId, idx, { categoryId, itemId: "", variantId: null });

  /** Picking an item defaults to its first variant, matching the Fixed Bundle rows. */
  const updateChoiceItem = (groupId: string, idx: number, itemId: string) => {
    const item = menuItems.find((m) => m.id === itemId);
    patchChoice(groupId, idx, { itemId, variantId: item?.variants?.[0]?.id ?? null });
  };

  const updateChoiceVariant = (groupId: string, idx: number, variantId: string) =>
    patchChoice(groupId, idx, { variantId });

  /** Both Buy X Get Y sides are edited the same way, so they share one set of
   *  helpers parameterised by which setter to drive. */
  const patchBogoRow = (
    setRows: React.Dispatch<React.SetStateAction<BogoRow[]>>,
    idx: number,
    patch: Partial<BogoRow>
  ) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const addBogoRow = (setRows: React.Dispatch<React.SetStateAction<BogoRow[]>>) =>
    setRows((prev) => [...prev, emptyBogoRow()]);

  // Never drop the last row — an empty side has nothing to add back from.
  const removeBogoRow = (setRows: React.Dispatch<React.SetStateAction<BogoRow[]>>, idx: number) =>
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));

  // Changing the category clears the item and size under it — the old item is no
  // longer in the narrowed dropdown.
  const updateBogoCategory = (
    setRows: React.Dispatch<React.SetStateAction<BogoRow[]>>,
    idx: number,
    categoryId: string
  ) => patchBogoRow(setRows, idx, { categoryId, itemId: "", variantId: null });

  /** Picking an item defaults to its first size, matching the other row tables.
   *  Changing the item must clear the old size, or the deal would save a size
   *  belonging to a different dish. */
  const updateBogoQty = (
    setRows: React.Dispatch<React.SetStateAction<BogoRow[]>>,
    idx: number,
    qty: number
  ) => patchBogoRow(setRows, idx, { qty: Math.max(1, qty) });

  const updateBogoItem = (
    setRows: React.Dispatch<React.SetStateAction<BogoRow[]>>,
    idx: number,
    itemId: string
  ) => {
    const item = menuItems.find((m) => m.id === itemId);
    patchBogoRow(setRows, idx, { itemId, variantId: item?.variants?.[0]?.id ?? null });
  };

  /**
   * How a step reads to a customer: "Choose any 2 Pizza". The noun comes from the
   * choices' shared category, not the step's label — the label is free text an
   * admin can type anything into, while the category is real data. A step mixing
   * categories has no single noun, so it falls back to a plain count.
   */
  const describeGroupPicks = (group: OptionGroupRow): string => {
    const picks = group.choices.length
      ? Math.min(group.maxSelections, group.choices.length)
      : group.maxSelections;

    const categoryIds = new Set(
      group.choices
        .filter((c) => c.itemId)
        .map((c) => menuItems.find((m) => m.id === c.itemId)?.categoryId ?? "")
    );
    const categoryName =
      categoryIds.size === 1
        ? foodCategories.find((c) => c.id === [...categoryIds][0])?.name
        : undefined;

    return categoryName
      ? `Choose any ${picks} ${categoryName}`
      : `Choose any ${picks} of ${group.choices.length}`;
  };

  /** What this step is actually called — the admin's own wording once they've
   *  typed one, otherwise the description derived from its contents. This is the
   *  single string shown in the label field, the preview, and saved to the deal. */
  const groupLabel = (group: OptionGroupRow): string =>
    group.labelEdited && group.label.trim() ? group.label : describeGroupPicks(group);

  /** The rows that name a real item, de-duplicated — what actually gets saved. */
  const applicableItemIds = useMemo(
    () => Array.from(new Set(scopeItemRows.map((r) => r.itemId).filter(Boolean))),
    [scopeItemRows]
  );

  /**
   * What a percentage deal actually discounts, by the same rule the server
   * enforces in deal.pricing.ts's isItemEligibleForDiscount: an item qualifies by
   * being named directly, or by its category being selected. Both lists empty
   * discounts nothing (the server refuses to treat that as "everything").
   */
  const discountScopeItems = useMemo(() => {
    if (applicableItemIds.length === 0 && applicableCategoryIds.length === 0) return [];
    return menuItems.filter(
      (m) =>
        applicableItemIds.includes(m.id) ||
        (m.categoryId ? applicableCategoryIds.includes(m.categoryId) : false)
    );
  }, [menuItems, applicableItemIds, applicableCategoryIds]);

  /**
   * What this discount does to the items in scope. Priced per sellable unit —
   * a variant is what a customer actually buys, so an item with sizes is
   * measured by each size, not by its base price.
   */
  const discountImpact = useMemo(() => {
    const pct = Math.min(100, Math.max(0, discountPercent || 0));

    const units: { name: string; price: number; cost: number }[] = [];
    for (const item of discountScopeItems) {
      const variants = item.variants || [];
      if (variants.length > 0) {
        for (const v of variants) {
          units.push({
            name: `${item.name} (${v.name})`,
            price: Number(v.price ?? item.price ?? 0),
            cost: Number(v.costPrice ?? item.costPrice ?? 0),
          });
        }
      } else {
        units.push({
          name: item.name,
          price: Number(item.price || 0),
          cost: Number(item.costPrice || 0),
        });
      }
    }

    let minBefore = Infinity;
    let maxBefore = 0;
    let minAfter = Infinity;
    let maxAfter = 0;
    let marginSum = 0;
    let marginCount = 0;
    const belowCost: { name: string; after: number; cost: number; loss: number }[] = [];

    for (const unit of units) {
      if (unit.price <= 0) continue;
      const after = unit.price * (1 - pct / 100);
      minBefore = Math.min(minBefore, unit.price);
      maxBefore = Math.max(maxBefore, unit.price);
      minAfter = Math.min(minAfter, after);
      maxAfter = Math.max(maxAfter, after);

      if (unit.cost > 0) {
        if (after < unit.cost) {
          belowCost.push({ name: unit.name, after, cost: unit.cost, loss: unit.cost - after });
        }
        if (after > 0) {
          marginSum += ((after - unit.cost) / after) * 100;
          marginCount += 1;
        }
      }
    }

    // Worst loss first — that's the one that decides whether the discount is viable.
    belowCost.sort((a, b) => b.loss - a.loss);

    return {
      itemCount: discountScopeItems.length,
      unitCount: units.length,
      minBefore: minBefore === Infinity ? 0 : minBefore,
      maxBefore,
      minAfter: minAfter === Infinity ? 0 : minAfter,
      maxAfter,
      belowCost,
      avgMargin: marginCount > 0 ? Math.round(marginSum / marginCount) : null,
      pricedUnits: marginCount,
    };
  }, [discountScopeItems, discountPercent]);

  /**
   * What a Buy X Get Y offer earns and gives away, across every item on both
   * sides.
   *
   * A row that pins a size is exact — the server matches that variant, so those
   * are the only prices in play. A row that has several sizes and none pinned
   * still means "any size", so it falls back to the worst case for the business:
   * bought at the cheapest, given away at the priciest. The footnote tells the
   * user which of the two they are looking at.
   */
  const bogoImpact = useMemo(() => {
    /** Prices one row: the pinned size if there is one, otherwise the size that
     *  hurts most on that side of the offer. */
    const priceRow = (row: BogoRow, worst: "cheapest" | "priciest") => {
      const item = menuItems.find((m) => m.id === row.itemId);
      if (!item) return null;

      const variants = item.variants || [];
      const units = variants.length
        ? variants.map((v) => ({
            id: v.id as string | null,
            label: v.name as string | null,
            price: Number(v.price ?? item.price ?? 0),
            cost: Number(v.costPrice ?? item.costPrice ?? 0),
          }))
        : [{ id: null, label: null, price: Number(item.price || 0), cost: Number(item.costPrice || 0) }];

      const pinned = row.variantId ? units.find((u) => u.id === row.variantId) : undefined;
      const chosen =
        pinned ??
        units.reduce((a, b) =>
          worst === "cheapest" ? (b.price < a.price ? b : a) : b.price > a.price ? b : a
        );

      const qty = Math.max(1, Number(row.qty) || 1);
      return {
        item,
        label: chosen.label,
        qty,
        price: chosen.price * qty,
        cost: chosen.cost * qty,
        // Only an unpinned row with a real choice of sizes makes this a guess.
        unpinned: units.length > 1 && !pinned,
      };
    };

    const buy = buyRows.map((r) => priceRow(r, "cheapest")).filter(Boolean) as NonNullable<
      ReturnType<typeof priceRow>
    >[];
    const give = getRows.map((r) => priceRow(r, "priciest")).filter(Boolean) as NonNullable<
      ReturnType<typeof priceRow>
    >[];
    if (buy.length === 0 || give.length === 0) return null;

    const sum = (rows: typeof buy, key: "price" | "cost") =>
      rows.reduce((total, r) => total + r[key], 0);

    const revenue = sum(buy, "price");
    const giveawayValue = sum(give, "price");
    const giveawayCost = sum(give, "cost");
    const totalCost = sum(buy, "cost") + giveawayCost;
    const profit = revenue - totalCost;

    // Everything the customer carries out, at normal menu price. This is the
    // baseline the Fixed Bundle calls "Total Selling Price" — the free items are
    // part of it, because without the deal they would have been paid for.
    const regularValue = revenue + giveawayValue;

    return {
      buy,
      give,
      // ── At regular menu price ──
      regularValue,
      totalCost,
      menuMargin:
        regularValue > 0 ? Math.round(((regularValue - totalCost) / regularValue) * 100) : null,
      // ── This deal ──
      /** What the customer actually hands over: the bought items only. */
      dealPrice: revenue,
      savings: giveawayValue,
      savingsPercent: regularValue > 0 ? Math.round((giveawayValue / regularValue) * 100) : 0,
      giveawayCost,
      profit,
      margin: revenue > 0 ? Math.round((profit / revenue) * 100) : null,
      hasCost: totalCost > 0,
      variantSpread: [...buy, ...give].some((r) => r.unpinned),
    };
  }, [menuItems, buyRows, getRows]);

  /** The "format" line of the setup checklist. Each deal type has its own idea
   *  of being configured, so it is derived here rather than hard-coded to the
   *  Fixed Bundle's row count. */
  const formatChecklist = useMemo(() => {
    if (dealType === "combo") {
      return { done: comboRows.length > 0, label: `${comboRows.length} item(s) in bundle` };
    }
    if (dealType === "option_combo") {
      const steps = optionGroups.filter((g) => g.choices.some((c) => c.itemId)).length;
      return { done: steps > 0, label: `${steps} choice step(s) configured` };
    }
    if (dealType === "buy_x_get_y") {
      const buys = buyRows.filter((r) => r.itemId).length;
      const gets = getRows.filter((r) => r.itemId).length;
      return {
        done: buys > 0 && gets > 0,
        label: buys > 0 && gets > 0 ? `Buy ${buys} item(s) → get ${gets} free` : "Pick the buy and free items",
      };
    }
    const scoped = applicableItemIds.length + applicableCategoryIds.length;
    return { done: scoped > 0, label: scoped > 0 ? `${scoped} item(s)/categor(ies) in scope` : "Choose what the discount applies to" };
  }, [dealType, comboRows, optionGroups, buyRows, getRows, applicableItemIds, applicableCategoryIds]);

  /** Names the discount's scope for the POS preview — the selected categories,
   *  plus a count of items named on their own. Items a selected category already
   *  covers are left out; counting them twice would overstate the scope. */
  const discountScopeSummary = useMemo(() => {
    const categoryNames = applicableCategoryIds
      .map((id) => foodCategories.find((c) => c.id === id)?.name)
      .filter(Boolean) as string[];

    const standaloneItems = applicableItemIds.filter((id) => {
      const item = menuItems.find((m) => m.id === id);
      return !(item?.categoryId && applicableCategoryIds.includes(item.categoryId));
    }).length;

    const parts: string[] = [];
    if (categoryNames.length > 0) {
      parts.push(
        categoryNames.slice(0, 2).join(", ") +
          (categoryNames.length > 2 ? ` +${categoryNames.length - 2} more` : "")
      );
    }
    if (standaloneItems > 0) {
      parts.push(`${standaloneItems} item${standaloneItems !== 1 ? "s" : ""}`);
    }
    return parts.join(" + ");
  }, [applicableCategoryIds, applicableItemIds, foodCategories, menuItems]);

  // Every deal type now renders a section 4 — Pricing for the combo formats,
  // Discount Impact for percentage, Offer Impact for Buy X Get Y — so validity
  // is always 5.
  const validitySectionNumber = 5;

  // Percentage Scope Helpers
  const addScopeItemRow = () =>
    setScopeItemRows((prev) => [...prev, { categoryId: "", itemId: "" }]);

  const removeScopeItemRow = (idx: number) =>
    setScopeItemRows((prev) => prev.filter((_, i) => i !== idx));

  // Changing the category clears the item under it — the old item is no longer in
  // the narrowed dropdown, so keeping it would display a value the list lacks.
  const updateScopeRowCategory = (idx: number, categoryId: string) =>
    setScopeItemRows((prev) =>
      prev.map((r, i) => (i === idx ? { categoryId, itemId: "" } : r))
    );

  const updateScopeRowItem = (idx: number, itemId: string) =>
    setScopeItemRows((prev) => prev.map((r, i) => (i === idx ? { ...r, itemId } : r)));

  const toggleApplicableCategory = (categoryId: string) => {
    setApplicableCategoryIds((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  // Save Deal
  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Please enter a Deal Name");
      return;
    }
    if (!alwaysActive && validTo && validTo < validFrom) {
      toast.error("Valid To date cannot be before Valid From date");
      return;
    }

    if (dealType === "combo" || dealType === "option_combo") {
      if (!dealPrice || dealPrice <= 0) {
        toast.error("Please specify a valid Deal Price");
        return;
      }
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
      const emptyGroup = optionGroups.find((g) => g.choices.length === 0);
      if (emptyGroup) {
        toast.error(`Please select at least 1 item for "${groupLabel(emptyGroup)}"`);
        return;
      }
      const incompleteGroup = optionGroups.find((g) => g.choices.some((c) => !c.itemId));
      if (incompleteGroup) {
        toast.error(`Pick a menu item for every choice row in "${groupLabel(incompleteGroup)}"`);
        return;
      }
      const notEnoughGroup = optionGroups.find(
        (g) => g.choices.length < g.maxSelections
      );
      if (notEnoughGroup) {
        toast.error(
          `"${groupLabel(notEnoughGroup)}" needs at least ${notEnoughGroup.maxSelections} selectable item(s)`
        );
        return;
      }
    } else if (dealType === "percentage") {
      if (!discountPercent || discountPercent <= 0 || discountPercent > 100) {
        toast.error("Please specify a discount percentage between 1 and 100");
        return;
      }
      if (applicableItemIds.length === 0 && applicableCategoryIds.length === 0) {
        toast.error("Select at least one item or category this discount applies to");
        return;
      }
    } else if (dealType === "buy_x_get_y") {
      const sides = [
        { label: "buy", rows: buyRows, verb: "has to buy" },
        { label: "get", rows: getRows, verb: "gets free" },
      ];
      for (const side of sides) {
        const filled = side.rows.filter((r) => r.itemId);
        if (filled.length === 0) {
          toast.error(`Add at least one item the customer ${side.verb}`);
          return;
        }
        for (const row of filled) {
          const item = menuItems.find((m) => m.id === row.itemId);
          if (!item) continue;
          // A size is mandatory whenever the item has one — the server rejects
          // the save otherwise, and an unpinned row is the one that loses money.
          if ((item.variants?.length ?? 0) > 0 && !row.variantId) {
            toast.error(`Pick which size of ${item.name} the customer ${side.verb}`);
            return;
          }
          if (!row.qty || row.qty < 1) {
            toast.error(`Enter a valid quantity for ${item.name}`);
            return;
          }
        }
        const seen = new Set<string>();
        for (const row of filled) {
          const key = `${row.itemId}:${row.variantId ?? ""}`;
          if (seen.has(key)) {
            const item = menuItems.find((m) => m.id === row.itemId);
            toast.error(`${item?.name ?? "That item"} is listed twice — raise its quantity instead`);
            return;
          }
          seen.add(key);
        }
      }
    }

    setSaving(true);
    try {
      const finalCode = code.trim() || generateCodeFromName(name) || null;
      const payload: DealInput = {
        name: name.trim(),
        code: finalCode,
        description: description.trim() || null,
        image: imageUrl || null,
        type: dealType,
        price:
          dealType === "combo" || dealType === "option_combo"
            ? Number(dealPrice)
            : null,
        dineInPrice: dineInPrice != null ? Number(dineInPrice) : null,
        takeAwayPrice: takeAwayPrice != null ? Number(takeAwayPrice) : null,
        deliveryPrice: deliveryPrice != null ? Number(deliveryPrice) : null,
        foodpandaPrice: foodpandaPrice != null ? Number(foodpandaPrice) : null,
        isActive,
        validFrom,
        validTo: alwaysActive ? null : validTo || null,
        startTime: hasTimeRestriction ? startTime : null,
        endTime: hasTimeRestriction ? endTime : null,
        components:
          dealType === "combo"
            ? comboRows.map((r, idx) => ({
                menuItemId: r.itemId,
                variantId: r.variantId,
                qty: r.qty,
                displayOrder: idx,
              }))
            : [],
        optionGroups:
          dealType === "option_combo"
            ? optionGroups.map((g, idx) => ({
                label: groupLabel(g),
                minSelections: g.maxSelections,
                maxSelections: g.maxSelections,
                displayOrder: idx,
                options: g.choices.map((c, oIdx) => ({
                  menuItemId: c.itemId,
                  variantId: c.variantId,
                  extraPrice: 0,
                  displayOrder: oIdx,
                })),
              }))
            : [],
        discountPercent: dealType === "percentage" ? Number(discountPercent) : null,
        applicableItems: dealType === "percentage" ? applicableItemIds : [],
        applicableCategories:
          dealType === "percentage" ? applicableCategoryIds : [],
        buyItems: dealType === "buy_x_get_y" ? toBogoInput(buyRows) : [],
        getItems: dealType === "buy_x_get_y" ? toBogoInput(getRows) : [],
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
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      {/* TOP PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/80 pb-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/deals")}
            className="rounded-xl hover:bg-muted/80"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
                {isEdit ? "Edit Deal & Combo" : "Create New Deal & Combo"}
              </h1>
              <Badge
                variant={isActive ? "default" : "secondary"}
                className={
                  isActive
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-semibold gap-1.5"
                    : "text-muted-foreground gap-1.5"
                }
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", isActive ? "bg-emerald-500" : "bg-muted-foreground")} />
                {isActive ? "Active" : "Draft"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Build combo bundles, pick-and-choose meal steps, and channel pricing
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
            className="gradient-primary text-primary-foreground font-bold shadow-md shadow-primary/20 px-5"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-1.5" />
            )}
            {isEdit ? "Update Deal" : "Publish Deal"}
          </Button>
        </div>
      </div>

      {/* MAIN SPLIT-LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT FORM SECTION (8 COLS) */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* SECTION 1: General Information */}
          <Card className="shadow-xs border-border/80 overflow-hidden">
            <CardHeader className="pb-3 border-b bg-muted/20">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                    <Tag className="h-4 w-4 text-primary" />
                    1. General Information
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Basic identity, description, and promotional image for POS & customer menus
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 bg-background px-2.5 py-1 rounded-lg border">
                  <span className="text-xs font-semibold text-muted-foreground">Active:</span>
                  <Switch checked={isActive} onCheckedChange={setIsActive} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-5">
              <div style={{ display: "flex", flexDirection: "row", gap: "16px", alignItems: "stretch" }}>

                {/* Left: Title + Description — fills remaining space */}
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-foreground/80 uppercase tracking-wide">
                      Deal Title <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      placeholder="e.g. Mega Crunch Duo Combo, Family Feast Pizza Pack"
                      value={name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      className="h-11 text-sm font-bold placeholder:font-normal"
                    />
                  </div>

                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
                    <Label className="text-xs font-semibold text-foreground/80 uppercase tracking-wide">
                      Description
                    </Label>
                    <Textarea
                      placeholder="e.g. 1 Large Chicken Fajita Pizza + 1 Loaded Fries + 1.5L Cold Drink. Served hot and fresh!"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="text-xs resize-none flex-1"
                      style={{ flex: 1, minHeight: "90px" }}
                    />
                  </div>
                </div>

                {/* Right: Promotional Image — fixed 200px wide square box */}
                <div style={{ width: "200px", flexShrink: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
                  <Label className="text-xs font-semibold text-foreground/80 uppercase tracking-wide">
                    Cover Image
                  </Label>

                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                    accept="image/*"
                    className="hidden"
                  />

                  {!imageUrl ? (
                    <div
                      onClick={() => !uploading && fileInputRef.current?.click()}
                      style={{
                        width: "200px",
                        flex: 1,
                        minHeight: "165px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "10px",
                        border: "2px dashed hsl(var(--border))",
                        borderRadius: "12px",
                        cursor: uploading ? "wait" : "pointer",
                        backgroundColor: "transparent",
                        transition: "all 0.15s ease",
                        userSelect: "none",
                      }}
                      className="group hover:bg-muted/30"
                      onMouseEnter={e => (e.currentTarget.style.borderColor = "hsl(var(--primary) / 0.5)")}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = "hsl(var(--border))")}
                    >
                      <div className="w-11 h-11 rounded-full bg-muted flex items-center justify-center text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                        {uploading ? (
                          <Loader2 className="w-5 h-5 animate-spin text-primary" />
                        ) : (
                          <Upload className="w-5 h-5" />
                        )}
                      </div>
                      <div className="text-center px-2">
                        <p className="text-xs font-bold text-foreground leading-tight">
                          {uploading ? "Uploading…" : "Click to Upload"}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                          PNG, JPG, WebP<br />Max 5 MB
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        width: "200px",
                        flex: 1,
                        minHeight: "165px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                        padding: "8px",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "12px",
                      }}
                      className="bg-muted/20"
                    >
                      {/* Image Preview */}
                      <div style={{ flex: 1, borderRadius: "8px", overflow: "hidden", border: "1px solid hsl(var(--border))" }}>
                        <img
                          src={imageUrl}
                          alt="Deal cover"
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        />
                      </div>
                      {/* Actions */}
                      <div style={{ display: "flex", gap: "6px" }}>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploading}
                          className="h-7 text-[11px] font-semibold gap-1.5 flex-1"
                        >
                          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                          Replace
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setImageUrl("")}
                          disabled={uploading}
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            </CardContent>
          </Card>

          {/* SECTION 2: Choose Deal Format */}
          <Card className="shadow-xs border-border/80 overflow-hidden">
            <CardHeader className="pb-3 border-b bg-muted/20">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                2. Choose Deal Format
              </CardTitle>
              <CardDescription className="text-xs">
                Select the structure of this deal — form fields adapt dynamically
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {(
                  [
                    {
                      type: "combo" as const,
                      icon: Package,
                      title: "Fixed Bundle",
                      subtitle: "Pre-set items at a special price",
                      example: "e.g. 1 Pizza + 1 Fries + 1 Drink for Rs. 1,499",
                      accent: "#3b82f6", // blue-500
                    },
                    {
                      type: "option_combo" as const,
                      icon: Layers,
                      title: "Customizable",
                      subtitle: "Customer picks items from defined steps",
                      example: "e.g. Choose 1 Pizza + 2 Drinks for Rs. 999",
                      accent: "#8b5cf6", // violet-500
                    },
                    {
                      type: "percentage" as const,
                      icon: Percent,
                      title: "% Discount",
                      subtitle: "Percentage off selected items or categories",
                      example: "e.g. 20% off all Burgers & Beverages",
                      accent: "#f59e0b", // amber-500
                    },
                    {
                      type: "buy_x_get_y" as const,
                      icon: Gift,
                      title: "Buy X Get Y",
                      subtitle: "Buy N items, get M free",
                      example: "e.g. Buy 2 Pizzas, Get 1 Cold Drink Free",
                      accent: "#10b981", // emerald-500
                    },
                  ] as const
                ).map((opt) => {
                  const Icon = opt.icon;
                  const selected = dealType === opt.type;
                  return (
                    <button
                      key={opt.type}
                      type="button"
                      onClick={() => setDealType(opt.type)}
                      className="relative p-4 rounded-xl border-2 text-left transition-all flex flex-col gap-3 select-none cursor-pointer"
                      style={selected ? {
                        borderColor: opt.accent,
                        backgroundColor: `${opt.accent}14`,
                        boxShadow: `0 0 0 1px ${opt.accent}30`,
                      } : {
                        borderColor: "hsl(var(--border))",
                        backgroundColor: "transparent",
                      }}
                    >
                      {/* Selected checkmark */}
                      {selected && (
                        <span
                          className="absolute top-3 right-3 h-5 w-5 rounded-full flex items-center justify-center shadow-sm"
                          style={{ backgroundColor: opt.accent, color: "#fff" }}
                        >
                          <Check className="h-3 w-3 stroke-[3]" />
                        </span>
                      )}

                      {/* Icon */}
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-all"
                        style={selected
                          ? { backgroundColor: opt.accent, color: "#fff" }
                          : { backgroundColor: `${opt.accent}18`, color: opt.accent }
                        }
                      >
                        <Icon className="h-4 w-4" />
                      </div>

                      {/* Text */}
                      <div className="space-y-0.5 min-w-0">
                        <p className="font-bold text-[13px] leading-tight text-foreground">
                          {opt.title}
                        </p>
                        <p className="text-[11px] text-muted-foreground leading-snug">
                          {opt.subtitle}
                        </p>
                      </div>

                      {/* Example strip */}
                      <div className="text-[10px] text-muted-foreground bg-background/60 px-2.5 py-1.5 rounded-md border border-border/50 leading-snug">
                        {opt.example}
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

        </div>

        {/* RIGHT STICKY PREVIEW (4 COLS) — paired with Sections 1–2 only */}
        <div className="lg:col-span-4 space-y-4 lg:sticky lg:top-6">
          <Card className="shadow-lg border-primary/30 bg-gradient-to-br from-card via-card to-primary/[0.03] overflow-hidden">
            <CardHeader className="pb-3 border-b bg-muted/30">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <Eye className="h-4 w-4 text-primary" />
                  Live POS Card Preview
                </CardTitle>
                <Badge variant="outline" className="text-[10px] font-mono">
                  {code || "NO-CODE"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              {/* Promotional Card */}
              <div className="rounded-2xl border-2 border-primary/40 bg-card p-4 shadow-md space-y-3">
                {imageUrl ? (
                  <div className="h-32 w-full rounded-xl overflow-hidden border">
                    <img
                      src={imageUrl}
                      alt={name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="h-24 w-full rounded-xl border border-dashed flex flex-col items-center justify-center text-muted-foreground bg-muted/20">
                    <ImageIcon className="h-6 w-6 stroke-[1.5] mb-1 opacity-50" />
                    <span className="text-[11px]">No promotional image uploaded</span>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-extrabold text-sm text-foreground leading-snug">
                      {name || "Untitled Deal Name"}
                    </h3>
                    <Badge className="gradient-primary text-primary-foreground text-[10px] px-2 py-0.5 font-bold">
                      {dealType === "combo"
                        ? "Bundle"
                        : dealType === "option_combo"
                        ? "Custom"
                        : dealType === "percentage"
                        ? "Discount"
                        : "BOGO"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {description || "No description provided yet."}
                  </p>
                </div>

                {/* Items preview */}
                <div className="p-2.5 rounded-lg bg-muted/30 border text-xs space-y-1">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                    Included / Structure:
                  </p>
                  {dealType === "combo" ? (
                    comboRows.length === 0 ? (
                      <p className="text-muted-foreground italic text-[11px]">
                        No items added
                      </p>
                    ) : (
                      comboRows.map((r, i) => {
                        const it = menuItems.find((m) => m.id === r.itemId);
                        return (
                          <div
                            key={i}
                            className="flex justify-between text-[11px] text-foreground/90 font-medium"
                          >
                            <span>
                              • {r.qty}x {it?.name || "Item"}
                            </span>
                          </div>
                        );
                      })
                    )
                  ) : dealType === "option_combo" ? (
                    optionGroups.length === 0 ? (
                      <p className="text-muted-foreground italic text-[11px]">
                        No choice steps defined
                      </p>
                    ) : (
                      optionGroups.map((g, i) => (
                        <p
                          key={i}
                          className="text-[11px] text-foreground/90 font-medium truncate"
                        >
                          • {groupLabel(g)}
                        </p>
                      ))
                    )
                  ) : dealType === "percentage" ? (
                    discountScopeSummary ? (
                      <p className="text-[11px] text-foreground/90 font-medium">
                        • {discountScopeSummary}
                        <span className="text-muted-foreground">
                          {" "}({discountImpact.itemCount} item{discountImpact.itemCount !== 1 ? "s" : ""})
                        </span>
                      </p>
                    ) : (
                      <p className="text-muted-foreground italic text-[11px]">
                        No categories or items selected
                      </p>
                    )
                  ) : bogoImpact ? (
                    <>
                      {bogoImpact.buy.map((r, i) => (
                        <p key={`b${i}`} className="text-[11px] text-foreground/90 font-medium truncate">
                          • Buy {r.qty} × {r.item.name}
                          {r.label ? ` (${r.label})` : ""}
                        </p>
                      ))}
                      {bogoImpact.give.map((r, i) => (
                        <p key={`g${i}`} className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold truncate">
                          • Get {r.qty} × {r.item.name}
                          {r.label ? ` (${r.label})` : ""} free
                        </p>
                      ))}
                    </>
                  ) : (
                    <p className="text-muted-foreground italic text-[11px]">
                      Buy and free items not chosen yet
                    </p>
                  )}
                </div>

                {/* Pricing Footer */}
                <div className="pt-2 border-t flex items-end justify-between">
                  <div>
                    {dealType === "combo" && bundleRegularValue > 0 && (
                      <span className="text-[10px] text-muted-foreground line-through font-mono block">
                        Rs. {bundleRegularValue.toLocaleString()}
                      </span>
                    )}
                    {/* A percentage deal has no single price, so this slot carries what
                        the customer actually saves — money, like every other type. */}
                    {dealType === "percentage" && discountImpact.maxBefore > 0 && (
                      <span className="text-[10px] text-muted-foreground font-mono block">
                        was Rs. {Math.round(discountImpact.minBefore).toLocaleString()} – {Math.round(discountImpact.maxBefore).toLocaleString()}
                      </span>
                    )}
                    {/* Same slot, same meaning: what the customer hands over, against
                        what the whole basket would otherwise have cost. */}
                    {dealType === "buy_x_get_y" && bogoImpact && bogoImpact.savings > 0 && (
                      <span className="text-[10px] text-muted-foreground line-through font-mono block">
                        Rs. {Math.round(bogoImpact.regularValue).toLocaleString()}
                      </span>
                    )}
                    <span className="text-xl font-black text-primary font-mono">
                      {dealType === "combo" || dealType === "option_combo"
                        ? `Rs. ${(dealPrice || 0).toLocaleString()}`
                        : dealType === "percentage"
                        ? discountImpact.maxAfter > 0
                          ? `Rs. ${Math.round(discountImpact.minAfter).toLocaleString()} – ${Math.round(discountImpact.maxAfter).toLocaleString()}`
                          : "—"
                        : bogoImpact
                        ? `Rs. ${Math.round(bogoImpact.dealPrice).toLocaleString()}`
                        : "—"}
                    </span>
                  </div>

                  {dealType === "combo" && bundleSavingsPercent > 0 && (
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded">
                      SAVE {bundleSavingsPercent}%
                    </span>
                  )}

                  {dealType === "percentage" && (discountPercent || 0) > 0 && (
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded shrink-0">
                      SAVE {discountPercent}%
                    </span>
                  )}

                  {dealType === "buy_x_get_y" && bogoImpact && bogoImpact.savingsPercent > 0 && (
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded shrink-0">
                      SAVE {bogoImpact.savingsPercent}%
                    </span>
                  )}
                </div>
              </div>

              {/* Ready Checklist */}
              <div className="p-3.5 rounded-xl border bg-muted/10 space-y-2 text-xs">
                <p className="font-bold text-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Deal Setup Checklist:
                </p>
                <ul className="space-y-1 text-muted-foreground text-[11px]">
                  <li className="flex items-center gap-1.5">
                    {name ? (
                      <Check className="h-3 w-3 text-emerald-500" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    )}
                    <span>Deal Name specified</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    {formatChecklist.done ? (
                      <Check className="h-3 w-3 text-emerald-500" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    )}
                    <span>{formatChecklist.label}</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    {dealPrice > 0 || dealType !== "combo" ? (
                      <Check className="h-3 w-3 text-emerald-500" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    )}
                    <span>Pricing configured</span>
                  </li>
                </ul>
              </div>

              {/* Bottom Quick Save */}
              <Button
                type="button"
                className="w-full gradient-primary text-primary-foreground font-bold shadow-md shadow-primary/20 py-5"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                {isEdit ? "Update Deal" : "Save & Publish Deal"}
              </Button>
            </CardContent>
          </Card>
        </div>

      </div>

      {/* REMAINING SECTIONS — use the full page width, no longer sharing the row with the preview */}
      <div className="space-y-6">

          {/* SECTION 3: Included Bundle Items (Fixed Bundle only) — shown BEFORE pricing */}
          {dealType === "combo" && (
            <Card className="shadow-xs border-border/80 overflow-hidden">
              <CardHeader className="pb-3 border-b bg-muted/20">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                      <Package className="h-4 w-4 text-primary" />
                      3. Included Bundle Items
                      {comboRows.length > 0 && (
                        <span className="ml-1 px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-bold">
                          {comboRows.length}
                        </span>
                      )}
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      Add every food item included in this fixed package
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={addComboRow}
                    className="gradient-primary text-primary-foreground gap-1.5 text-xs font-bold shadow-xs shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Item
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="p-4">
                {comboRows.length === 0 ? (
                  <div className="text-center py-12 space-y-3 border-2 border-dashed border-border/60 rounded-xl bg-muted/10">
                    <div className="w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center mx-auto">
                      <Package className="h-5 w-5 text-muted-foreground/50" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">No items added yet</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Add the food items that come bundled in this deal</p>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={addComboRow} className="text-xs gap-1.5">
                      <Plus className="h-3.5 w-3.5" /> Add First Item
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Header row */}
                    <div className="grid gap-2 px-3 pb-1" style={{ gridTemplateColumns: "1.5fr 0.8fr 78px 78px 64px 36px" }}>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Menu Item</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Size / Variant</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground text-right">Cost</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground text-right">Selling</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground text-center">Qty</span>
                      <span />
                    </div>

                    {/* Item rows */}
                    <div className="space-y-1.5">
                      {comboRows.map((row, idx) => {
                        const selectedItem = menuItems.find((m) => m.id === row.itemId);
                        const variants = selectedItem?.variants || [];
                        let unitPrice = Number(selectedItem?.price || 0);
                        if (row.variantId) {
                          const v = variants.find((vr) => vr.id === row.variantId);
                          if (v && v.price != null) unitPrice = Number(v.price);
                        }
                        const unitCost = getItemCost(row.itemId, row.variantId);

                        return (
                          <div
                            key={idx}
                            className="grid gap-2 items-center px-3 py-2.5 rounded-lg border border-border/60 bg-background hover:bg-muted/20 transition-colors"
                            style={{ gridTemplateColumns: "1.5fr 0.8fr 78px 78px 64px 36px" }}
                          >
                            {/* Item select */}
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0 w-4 text-right">{idx + 1}.</span>
                              <Select value={row.itemId} onValueChange={(val) => updateComboItem(idx, val)}>
                                <SelectTrigger className="h-8 text-xs border-0 bg-muted/30 hover:bg-muted/50 focus:ring-1">
                                  <SelectValue placeholder="Select item…" />
                                </SelectTrigger>
                                <SelectContent className="max-h-60">
                                  {menuItems.map((item) => (
                                    <SelectItem key={item.id} value={item.id} className="text-xs">
                                      {item.name}{item.category?.name ? ` (${item.category.name})` : ""}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Variant */}
                            <div>
                              {variants.length > 0 ? (
                                <Select
                                  value={row.variantId || variants[0]?.id || ""}
                                  onValueChange={(val) => updateComboVariant(idx, val)}
                                >
                                  <SelectTrigger className="h-8 text-xs border-0 bg-muted/30 hover:bg-muted/50 focus:ring-1">
                                    <SelectValue placeholder="Select size…" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {variants.map((v) => (
                                      <SelectItem key={v.id} value={v.id} className="text-xs">
                                        {v.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className="text-xs text-muted-foreground px-1">—</span>
                              )}
                            </div>

                            {/* Line cost — scales with Qty (from saved recipe cost) */}
                            <span className="text-xs font-mono text-muted-foreground text-right">
                              {unitCost > 0 ? `Rs. ${(unitCost * row.qty).toLocaleString()}` : "—"}
                            </span>

                            {/* Line selling price — scales with Qty */}
                            <span className="text-xs font-mono font-semibold text-foreground text-right">
                              Rs. {(unitPrice * row.qty).toLocaleString()}
                            </span>

                            {/* Qty stepper */}
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => updateComboQty(idx, row.qty - 1)}
                                className="w-6 h-6 rounded-md bg-muted hover:bg-primary/10 hover:text-primary text-foreground flex items-center justify-center font-bold text-sm leading-none transition-colors"
                              >
                                −
                              </button>
                              <span className="w-6 text-center text-xs font-mono font-bold">{row.qty}</span>
                              <button
                                type="button"
                                onClick={() => updateComboQty(idx, row.qty + 1)}
                                className="w-6 h-6 rounded-md bg-muted hover:bg-primary/10 hover:text-primary text-foreground flex items-center justify-center font-bold text-sm leading-none transition-colors"
                              >
                                +
                              </button>
                            </div>

                            {/* Delete */}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeComboRow(idx)}
                              className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>

                    {/* Footer — item count only */}
                    <div className="flex items-center px-3 pt-2 border-t border-border/50 mt-1">
                      <span className="text-xs text-muted-foreground">
                        {comboRows.length} item{comboRows.length !== 1 ? "s" : ""} in bundle
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* SECTION 3: Choice Steps & Groups (option_combo only) */}
          {dealType === "option_combo" ? (
            <Card className="shadow-xs border-border/80 overflow-hidden">
              <CardHeader className="pb-3 border-b bg-muted/20">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                      <Layers className="h-4 w-4 text-primary" />
                      3. Choice Steps & Groups
                      {optionGroups.length > 0 && (
                        <span className="ml-1 px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-bold">
                          {optionGroups.length}
                        </span>
                      )}
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      Define pick-and-choose steps (e.g. Choose 1st Pizza, Choose Soft Drink)
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={addOptionGroup}
                    className="gradient-primary text-primary-foreground gap-1.5 text-xs font-bold shadow-xs shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Step Group
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="p-4">
                {optionGroups.length === 0 ? (
                  <div className="text-center py-12 space-y-3 border-2 border-dashed border-border/60 rounded-xl bg-muted/10">
                    <div className="w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center mx-auto">
                      <Layers className="h-5 w-5 text-muted-foreground/50" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">No selection steps created yet</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Create choice groups so customers can pick their own items</p>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={addOptionGroup} className="text-xs gap-1.5">
                      <Plus className="h-3.5 w-3.5" /> Add First Step Group
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {optionGroups.map((group, gIdx) => (
                      <div key={group.id} className="rounded-xl border border-border/60 bg-muted/10 overflow-hidden">

                        {/* Group header — label, how many the customer picks, remove */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-3 py-2.5 border-b border-border/50 bg-muted/20">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="h-6 w-6 rounded-lg bg-primary/10 text-primary font-extrabold text-xs flex items-center justify-center shrink-0">
                              #{gIdx + 1}
                            </span>
                            <Input
                              value={groupLabel(group)}
                              onChange={(e) => updateGroupLabel(group.id, e.target.value)}
                              placeholder="e.g. Choose 1st Pizza Flavor"
                              className="h-8 text-xs font-bold max-w-sm"
                            />
                          </div>

                          <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
                            <div className="flex items-center gap-1.5">
                              <Label className="text-[11px] text-muted-foreground font-medium whitespace-nowrap">
                                Customer Picks:
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
                              className="h-8 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                            </Button>
                          </div>
                        </div>

                        {/* Choice rows — same row layout as the Fixed Bundle table */}
                        <div className="p-3">
                          {group.choices.length === 0 ? (
                            <div className="text-center py-8 space-y-2.5 border border-dashed border-border/60 rounded-lg bg-background/40">
                              <p className="text-xs text-muted-foreground">
                                No selectable items in this step yet
                              </p>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => addChoiceRow(group.id)}
                                className="text-xs gap-1.5"
                              >
                                <Plus className="h-3.5 w-3.5" /> Add Choice
                              </Button>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {/* Header row */}
                              <div className="grid gap-2 px-3 pb-1" style={{ gridTemplateColumns: "1fr 1.4fr 0.9fr 78px 78px 36px" }}>
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Category</span>
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Menu Item</span>
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Size / Variant</span>
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground text-right">Cost</span>
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground text-right">Selling</span>
                                <span />
                              </div>

                              <div className="space-y-1.5">
                                {group.choices.map((choice, cIdx) => {
                                  const selectedItem = menuItems.find((m) => m.id === choice.itemId);
                                  // A row with an item shows that item's real category; only an
                                  // empty row falls back to whatever category was picked to filter.
                                  const activeCategoryId = selectedItem?.categoryId ?? choice.categoryId;
                                  const itemChoices = activeCategoryId
                                    ? menuItems.filter((m) => m.categoryId === activeCategoryId)
                                    : menuItems;
                                  const variants = selectedItem?.variants || [];
                                  let unitPrice = Number(selectedItem?.price || 0);
                                  if (choice.variantId) {
                                    const v = variants.find((vr) => vr.id === choice.variantId);
                                    if (v && v.price != null) unitPrice = Number(v.price);
                                  }
                                  const unitCost = choice.itemId ? getItemCost(choice.itemId, choice.variantId) : 0;

                                  return (
                                    <div
                                      key={cIdx}
                                      className="grid gap-2 items-center px-3 py-2.5 rounded-lg border border-border/60 bg-background hover:bg-muted/20 transition-colors"
                                      style={{ gridTemplateColumns: "1fr 1.4fr 0.9fr 78px 78px 36px" }}
                                    >
                                      {/* Category filter — narrows the item dropdown beside it */}
                                      <Select
                                        value={activeCategoryId || "all"}
                                        onValueChange={(val) =>
                                          updateChoiceCategory(group.id, cIdx, val === "all" ? "" : val)
                                        }
                                      >
                                        <SelectTrigger className="h-8 text-xs border-0 bg-muted/30 hover:bg-muted/50 focus:ring-1">
                                          <SelectValue placeholder="All categories" />
                                        </SelectTrigger>
                                        <SelectContent className="max-h-60">
                                          <SelectItem value="all" className="text-xs">All Categories</SelectItem>
                                          {foodCategories.map((c) => (
                                            <SelectItem key={c.id} value={c.id} className="text-xs">
                                              {c.name}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>

                                      {/* Item select — only items from the category above */}
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0 w-4 text-right">{cIdx + 1}.</span>
                                        <Select
                                          value={choice.itemId}
                                          onValueChange={(val) => updateChoiceItem(group.id, cIdx, val)}
                                        >
                                          <SelectTrigger className="h-8 text-xs border-0 bg-muted/30 hover:bg-muted/50 focus:ring-1">
                                            <SelectValue placeholder="Select item…" />
                                          </SelectTrigger>
                                          <SelectContent className="max-h-60">
                                            {itemChoices.length === 0 ? (
                                              <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                                                No items in this category
                                              </div>
                                            ) : (
                                              itemChoices.map((item) => (
                                                <SelectItem key={item.id} value={item.id} className="text-xs">
                                                  {item.name}
                                                </SelectItem>
                                              ))
                                            )}
                                          </SelectContent>
                                        </Select>
                                      </div>

                                      {/* Variant */}
                                      <div>
                                        {variants.length > 0 ? (
                                          <Select
                                            value={choice.variantId || variants[0]?.id || ""}
                                            onValueChange={(val) => updateChoiceVariant(group.id, cIdx, val)}
                                          >
                                            <SelectTrigger className="h-8 text-xs border-0 bg-muted/30 hover:bg-muted/50 focus:ring-1">
                                              <SelectValue placeholder="Select size…" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {variants.map((v) => (
                                                <SelectItem key={v.id} value={v.id} className="text-xs">
                                                  {v.name}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        ) : (
                                          <span className="text-xs text-muted-foreground px-1">—</span>
                                        )}
                                      </div>

                                      {/* Cost */}
                                      <span className="text-xs font-mono text-muted-foreground text-right">
                                        {unitCost > 0 ? `Rs. ${unitCost.toLocaleString()}` : "—"}
                                      </span>

                                      {/* Selling price */}
                                      <span className="text-xs font-mono font-semibold text-foreground text-right">
                                        {choice.itemId ? `Rs. ${unitPrice.toLocaleString()}` : "—"}
                                      </span>

                                      {/* Delete */}
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => removeChoiceRow(group.id, cIdx)}
                                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Footer — count + add another choice */}
                              <div className="flex items-center justify-between px-3 pt-2 border-t border-border/50 mt-1">
                                <span className="text-xs text-muted-foreground">
                                  {group.choices.length} choice{group.choices.length !== 1 ? "s" : ""} · {describeGroupPicks(group)}
                                </span>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => addChoiceRow(group.id)}
                                  className="h-7 text-xs gap-1.5"
                                >
                                  <Plus className="h-3.5 w-3.5" /> Add Choice
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          {/* SECTION 4: Pricing & Channels (combo / option_combo) */}
          {(dealType === "combo" || dealType === "option_combo") && (
            <Card className="shadow-xs border-border/80 overflow-hidden">
              <CardHeader className="pb-3 border-b bg-muted/20">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div>
                    <CardTitle className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      4. Pricing & Cost Breakdown
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {dealType === "combo"
                        ? "Analyze recipe cost price, menu selling total, and determine promotional deal pricing"
                        : "Cost and selling range across every possible pick, and the deal price you set against it"}
                    </CardDescription>
                  </div>
                  {dealType === "combo" && comboRows.length > 0 && (
                    <Badge variant="outline" className="text-[11px] font-mono self-start sm:self-auto gap-1">
                      <Calculator className="h-3 w-3 text-primary" />
                      Cost-to-Price Calculator Active
                    </Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="p-5 space-y-6">

                {/* ── ROW 1 · AT MENU PRICE (baseline, informational) ── */}
                {dealType === "combo" && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1.5">
                      <Tag className="h-3 w-3" /> At Regular Menu Price
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

                      {/* Total Cost */}
                      <div className="rounded-xl border border-border/70 bg-muted/25 p-4 flex flex-col justify-between gap-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                            <Coins className="h-3.5 w-3.5 text-muted-foreground/70" />
                            Total Cost
                          </span>
                          {bundleCostPrice > 0 ? (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              Recipe Cost
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground/60 px-1.5 py-0">
                              No Recipe
                            </Badge>
                          )}
                        </div>
                        <div>
                          <p className="text-xl font-black font-mono text-foreground tracking-tight">
                            Rs.&nbsp;{bundleCostPrice.toLocaleString()}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                            {bundleCostPrice > 0
                              ? "Raw ingredients & recipe cost"
                              : "Set recipes in Menu Items for live cost"}
                          </p>
                        </div>
                      </div>

                      {/* Total Selling Price */}
                      <div className="rounded-xl border border-border/70 bg-muted/25 p-4 flex flex-col justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <Tag className="h-3.5 w-3.5 text-muted-foreground/70" />
                          Total Selling Price
                        </span>
                        <div>
                          <p className="text-xl font-black font-mono text-foreground tracking-tight">
                            Rs.&nbsp;{bundleRegularValue.toLocaleString()}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                            Standalone menu retail value
                          </p>
                        </div>
                      </div>

                      {/* Total Profit % at menu price */}
                      <div className="rounded-xl border border-border/70 bg-muted/25 p-4 flex flex-col justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <TrendingUp className="h-3.5 w-3.5 text-muted-foreground/70" />
                          Total Profit %
                        </span>
                        <div>
                          <p className="text-xl font-black font-mono text-foreground tracking-tight">
                            {bundleRegularValue > 0 ? `${bundleMenuMargin}%` : "—"}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                            Margin before any deal discount
                          </p>
                        </div>
                      </div>

                    </div>
                  </div>
                )}

                {/* ── ROW 2 · THIS DEAL (the decision, updates live) ── */}
                {dealType === "combo" && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-primary/80 flex items-center gap-1.5">
                      <Sparkles className="h-3 w-3" /> This Deal
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                      {/* Deal Price */}
                      <div className="rounded-xl border-2 border-primary/50 bg-primary/[0.04] p-4 flex flex-col justify-between gap-2 shadow-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5" />
                            Deal Price
                          </span>
                          {bundleSavingsPercent > 0 && (
                            <span className="text-[10px] font-bold text-primary px-1.5 py-0.5 rounded bg-primary/10">
                              {bundleSavingsPercent}% OFF
                            </span>
                          )}
                        </div>
                        <div>
                          <p className="text-xl font-black font-mono text-primary tracking-tight">
                            Rs.&nbsp;{(dealPrice || 0).toLocaleString()}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                            {bundleSavings > 0
                              ? `Customer saves Rs. ${bundleSavings.toLocaleString()}`
                              : "Customer pays at POS & Web"}
                          </p>
                        </div>
                      </div>

                      {/* Deal Profit % */}
                      <div className={cn(
                        "rounded-xl border p-4 flex flex-col justify-between gap-2 transition-all",
                        dealPrice > 0 && bundleProfit > 0
                          ? "border-emerald-500/40 bg-emerald-500/[0.04]"
                          : "border-border/70 bg-muted/25"
                      )}>
                        <span className={cn(
                          "text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5",
                          bundleProfit > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                        )}>
                          <TrendingUp className="h-3.5 w-3.5" />
                          Deal Profit %
                        </span>
                        <div>
                          {dealPrice > 0 && bundleCostPrice > 0 ? (
                            <>
                              <div className="flex items-baseline gap-1.5">
                                <p className={cn(
                                  "text-xl font-black font-mono tracking-tight",
                                  bundleProfit > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                                )}>
                                  {bundleProfitMargin}%
                                </p>
                                <span className="text-xs font-mono font-bold text-muted-foreground">
                                  (Rs.&nbsp;{bundleProfit.toLocaleString()})
                                </span>
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                                Profit over ingredient cost
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="text-xl font-black font-mono text-muted-foreground/40">—</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {dealPrice > 0 ? "Add recipes for profit %" : "Enter deal price below"}
                              </p>
                            </>
                          )}
                        </div>
                      </div>

                    </div>
                  </div>
                )}

                {/* ── CUSTOMIZABLE · the same cost/selling read-out as a Fixed Bundle, but
                     as a range, because the customer's picks decide the real total ── */}
                {dealType === "option_combo" && optionComboTotals.maxSelling > 0 && (
                  <>
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1.5">
                        <Tag className="h-3 w-3" /> At Regular Menu Price
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

                        {/* Total Cost range */}
                        <div className="rounded-xl border border-border/70 bg-muted/25 p-4 flex flex-col justify-between gap-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                              <Coins className="h-3.5 w-3.5 text-muted-foreground/70" />
                              Total Cost
                            </span>
                            {optionComboTotals.maxCost > 0 ? (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Recipe Cost</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground/60 px-1.5 py-0">No Recipe</Badge>
                            )}
                          </div>
                          <div>
                            <p className="text-xl font-black font-mono text-foreground tracking-tight">
                              {optionComboTotals.maxCost > 0
                                ? `Rs.\u00a0${Math.round(optionComboTotals.minCost).toLocaleString()} – ${Math.round(optionComboTotals.maxCost).toLocaleString()}`
                                : "—"}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                              {optionComboTotals.maxCost > 0
                                ? "Cheapest → priciest picks"
                                : "Set recipes in Menu Items for live cost"}
                            </p>
                          </div>
                        </div>

                        {/* Total Selling range */}
                        <div className="rounded-xl border border-border/70 bg-muted/25 p-4 flex flex-col justify-between gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                            <Tag className="h-3.5 w-3.5 text-muted-foreground/70" />
                            Total Selling Price
                          </span>
                          <div>
                            <p className="text-xl font-black font-mono text-foreground tracking-tight">
                              Rs.&nbsp;{Math.round(optionComboTotals.minSelling).toLocaleString()} – {Math.round(optionComboTotals.maxSelling).toLocaleString()}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                              Standalone menu retail value
                            </p>
                          </div>
                        </div>

                        {/* Worst-case menu margin */}
                        <div className="rounded-xl border border-border/70 bg-muted/25 p-4 flex flex-col justify-between gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground/70" />
                            Total Profit %
                          </span>
                          <div>
                            <p className="text-xl font-black font-mono text-foreground tracking-tight">
                              {optionComboTotals.maxCost > 0
                                ? `${Math.round(((optionComboTotals.maxSelling - optionComboTotals.maxCost) / optionComboTotals.maxSelling) * 100)}%`
                                : "—"}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                              Margin at the priciest combination
                            </p>
                          </div>
                        </div>

                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-primary/80 flex items-center gap-1.5">
                        <Sparkles className="h-3 w-3" /> This Deal
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                        {/* Deal Price + biggest discount the customer can extract */}
                        <div className="rounded-xl border-2 border-primary/50 bg-primary/[0.04] p-4 flex flex-col justify-between gap-2 shadow-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                              <Sparkles className="h-3.5 w-3.5" />
                              Deal Price
                            </span>
                            {dealPrice > 0 && optionComboTotals.maxSelling > dealPrice && (
                              <span className="text-[10px] font-bold text-primary px-1.5 py-0.5 rounded bg-primary/10">
                                up to {Math.round(((optionComboTotals.maxSelling - dealPrice) / optionComboTotals.maxSelling) * 100)}% OFF
                              </span>
                            )}
                          </div>
                          <div>
                            <p className="text-xl font-black font-mono text-primary tracking-tight">
                              Rs.&nbsp;{(dealPrice || 0).toLocaleString()}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                              {dealPrice > 0 && optionComboTotals.maxSelling > dealPrice
                                ? `Customer saves up to Rs. ${Math.round(optionComboTotals.maxSelling - dealPrice).toLocaleString()}`
                                : "Customer pays at POS & Web"}
                            </p>
                          </div>
                        </div>

                        {/* Worst-case profit — the number that must stay positive */}
                        <div className={cn(
                          "rounded-xl border p-4 flex flex-col justify-between gap-2 transition-all",
                          dealPrice > 0 && optionComboTotals.maxCost > 0 && dealPrice > optionComboTotals.maxCost
                            ? "border-emerald-500/40 bg-emerald-500/[0.04]"
                            : dealPrice > 0 && optionComboTotals.maxCost > 0
                            ? "border-destructive/40 bg-destructive/[0.04]"
                            : "border-border/70 bg-muted/25"
                        )}>
                          <span className={cn(
                            "text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5",
                            dealPrice > optionComboTotals.maxCost && optionComboTotals.maxCost > 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-muted-foreground"
                          )}>
                            <TrendingUp className="h-3.5 w-3.5" />
                            Worst-Case Profit %
                          </span>
                          <div>
                            {dealPrice > 0 && optionComboTotals.maxCost > 0 ? (
                              <>
                                <div className="flex items-baseline gap-1.5">
                                  <p className={cn(
                                    "text-xl font-black font-mono tracking-tight",
                                    dealPrice > optionComboTotals.maxCost
                                      ? "text-emerald-600 dark:text-emerald-400"
                                      : "text-destructive"
                                  )}>
                                    {Math.round(((dealPrice - optionComboTotals.maxCost) / dealPrice) * 100)}%
                                  </p>
                                  <span className="text-xs font-mono font-bold text-muted-foreground">
                                    (Rs.&nbsp;{Math.round(dealPrice - optionComboTotals.maxCost).toLocaleString()})
                                  </span>
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                                  If the customer picks the priciest options
                                </p>
                              </>
                            ) : (
                              <>
                                <p className="text-xl font-black font-mono text-muted-foreground/40">—</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                  {dealPrice > 0 ? "Add recipes for profit %" : "Enter deal price below"}
                                </p>
                              </>
                            )}
                          </div>
                        </div>

                      </div>
                    </div>
                  </>
                )}

                {/* ── ROW 3 · SET DEAL PRICE — one Rs./% toggle drives the input and the presets ── */}
                <div className="rounded-xl border border-border/70 bg-card p-4 space-y-4 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Label className="text-xs font-bold text-foreground uppercase tracking-wide">
                      Set Deal Price <span className="text-destructive">*</span>
                    </Label>
                    {supportsPercentPricing && (
                      <div className="inline-flex items-center rounded-lg border border-border/70 bg-muted/30 p-0.5">
                        <button
                          type="button"
                          onClick={() => handlePriceModeChange("amount")}
                          className={cn(
                            "text-xs font-bold px-3 py-1.5 rounded-md transition-all",
                            priceMode === "amount"
                              ? "bg-primary text-primary-foreground shadow-xs"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          Rs. Amount
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePriceModeChange("percent")}
                          className={cn(
                            "text-xs font-bold px-3 py-1.5 rounded-md transition-all",
                            priceMode === "percent"
                              ? "bg-primary text-primary-foreground shadow-xs"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          % Percent
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
                    {/* Main input — shape follows the toggle above */}
                    <div className="space-y-1 w-full sm:w-56 shrink-0">
                      {effectivePriceMode === "amount" ? (
                        <div className="relative">
                          <Input
                            type="number"
                            min={0}
                            placeholder="e.g. 1999"
                            value={dealPrice || ""}
                            onChange={(e) => setDealPrice(Math.max(0, Number(e.target.value)))}
                            className="h-11 text-base font-extrabold font-mono border-primary/50 bg-primary/[0.02] pl-10"
                          />
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground font-mono">
                            Rs.
                          </span>
                        </div>
                      ) : (
                        <>
                          <div className="relative">
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              placeholder="e.g. 20"
                              value={percentInput}
                              onChange={(e) => handlePercentInputChange(e.target.value)}
                              className="h-11 text-base font-extrabold font-mono border-primary/50 bg-primary/[0.02] pr-9"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground font-mono">
                              %
                            </span>
                          </div>
                          <p className="text-[10px] font-mono text-muted-foreground pl-0.5">
                            = Rs. {(dealPrice || 0).toLocaleString()}
                          </p>
                        </>
                      )}
                    </div>

                    {/* Percent basis — only meaningful once % mode is selected (Fixed Bundle only) */}
                    {effectivePriceMode === "percent" && (
                      <div className="space-y-1">
                        <span className="text-[10px] text-muted-foreground block">Percent of</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleCalcModeChange("discount")}
                            className={cn(
                              "text-[11px] font-bold px-2.5 py-1.5 rounded-md transition-all flex items-center gap-1",
                              calcMode === "discount"
                                ? "bg-muted text-foreground shadow-xs"
                                : "text-muted-foreground/70 hover:text-muted-foreground"
                            )}
                          >
                            <BadgePercent className="h-3 w-3" />
                            {dealType === "combo" ? "Off Menu Price" : "Off Priciest Menu Value"}
                          </button>
                          {basisCost > 0 && (
                            <button
                              type="button"
                              onClick={() => handleCalcModeChange("margin")}
                              className={cn(
                                "text-[11px] font-bold px-2.5 py-1.5 rounded-md transition-all flex items-center gap-1",
                                calcMode === "margin"
                                  ? "bg-muted text-foreground shadow-xs"
                                  : "text-muted-foreground/70 hover:text-muted-foreground"
                              )}
                            >
                              <TrendingUp className="h-3 w-3" />
                              {dealType === "combo" ? "Markup on Cost" : "Markup on Priciest Cost"}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                </div>

                {/* ── CHANNEL OVERRIDES — same Rs./% toggle as the main price above ── */}
                <div className="space-y-2.5 pt-2 border-t border-border/50">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-foreground">
                      Channel Price Overrides
                    </p>
                    <span className="text-[10px] text-muted-foreground">
                      {effectivePriceMode === "amount"
                        ? `Leave empty to use base deal price (Rs. ${(dealPrice || 0).toLocaleString()})`
                        : `Leave empty to use base deal price · % is ${calcMode === "discount" ? "off Menu Price" : "markup on Cost"}`}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { key: "dineIn", label: "Dine In", Icon: UtensilsCrossed, price: dineInPrice, setPrice: setDineInPrice, pct: dineInPct, setPct: setDineInPct },
                      { key: "takeAway", label: "Take Away", Icon: ShoppingBag, price: takeAwayPrice, setPrice: setTakeAwayPrice, pct: takeAwayPct, setPct: setTakeAwayPct },
                      { key: "delivery", label: "Delivery", Icon: Truck, price: deliveryPrice, setPrice: setDeliveryPrice, pct: deliveryPct, setPct: setDeliveryPct },
                      { key: "foodpanda", label: "Foodpanda", Icon: ShoppingBag, price: foodpandaPrice, setPrice: setFoodpandaPrice, pct: foodpandaPct, setPct: setFoodpandaPct },
                    ].map((ch) => (
                      <div key={ch.key} className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                          <ch.Icon className="h-3 w-3" /> {ch.label}
                        </Label>
                        {effectivePriceMode === "amount" ? (
                          <Input
                            type="number" min={0}
                            placeholder={`Default (${dealPrice || 0})`}
                            value={ch.price ?? ""}
                            onChange={(e) => ch.setPrice(e.target.value === "" ? null : Math.max(0, Number(e.target.value)))}
                            className="h-9 text-xs font-mono"
                          />
                        ) : (
                          <div className="relative">
                            <Input
                              type="number" min={0} max={100}
                              placeholder="Default (0%)"
                              value={ch.pct}
                              onChange={(e) => applyChannelPercent(e.target.value, ch.setPct, ch.setPrice)}
                              className="h-9 text-xs font-mono pr-6"
                            />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground">
                              %
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

              </CardContent>
            </Card>
          )}

          {/* SECTION 3B: Discount Scope (Percentage Mode) */}
          {dealType === "percentage" && (
            <Card className="shadow-xs border-border/80 overflow-hidden">
              <CardHeader className="pb-3 border-b bg-muted/20">
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                  <Percent className="h-4 w-4 text-primary" />
                  3. Discount Percentage & Applicable Scope
                </CardTitle>
                <CardDescription className="text-xs">
                  Set the discount rate and choose qualifying categories or items
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 space-y-6">
                <div className="space-y-2 max-w-sm">
                  <Label className="text-xs font-bold text-primary">
                    Discount Percentage (%) *
                  </Label>
                  <div className="relative">
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      placeholder="10"
                      value={discountPercent || ""}
                      onChange={(e) =>
                        setDiscountPercent(
                          Math.min(100, Math.max(0, Number(e.target.value)))
                        )
                      }
                      className="h-10 text-base font-extrabold border-primary/50 bg-primary/[0.02] pr-8 font-mono"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">
                      %
                    </span>
                  </div>
                  {/* Preset Buttons */}
                  <div className="flex gap-1.5 pt-1">
                    {PERCENT_PRESETS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setDiscountPercent(p)}
                        className={cn(
                          "text-xs px-2.5 py-1 rounded-md border font-semibold transition-all",
                          discountPercent === p
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted/40 hover:bg-muted text-muted-foreground border-border"
                        )}
                      >
                        {p}%
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-5 pt-2 border-t">
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-xs font-bold text-foreground">
                      Applies To Categories & Items <span className="text-destructive">*</span>
                    </Label>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        discountScopeItems.length > 0 && "border-primary/50 text-primary"
                      )}
                    >
                      {discountScopeItems.length} item{discountScopeItems.length !== 1 ? "s" : ""} in scope
                    </Badge>
                  </div>

                  {/* Whole-category toggles — the bulk path */}
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                      Entire Categories
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {foodCategories.map((c) => {
                        const selected = applicableCategoryIds.includes(c.id);
                        const count = menuItems.filter((m) => m.categoryId === c.id).length;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => toggleApplicableCategory(c.id)}
                            className={cn(
                              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer select-none",
                              selected
                                ? "bg-primary text-primary-foreground border-primary shadow-xs"
                                : "bg-muted/30 border-border text-foreground hover:border-primary/40 hover:bg-muted/60"
                            )}
                          >
                            {selected ? (
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                            ) : (
                              <Layers className="h-3.5 w-3.5 shrink-0 opacity-50" />
                            )}
                            <span>{c.name}</span>
                            <span className={cn(
                              "text-[10px] font-mono px-1 rounded",
                              selected ? "bg-primary-foreground/20" : "bg-muted-foreground/10 text-muted-foreground"
                            )}>
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Individually-named items — same row layout as the other sections */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                        Or Specific Individual Items
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={addScopeItemRow}
                        className="h-7 text-xs gap-1.5"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add Item
                      </Button>
                    </div>

                    {scopeItemRows.length === 0 ? (
                      <div className="text-center py-8 border border-dashed border-border/60 rounded-lg bg-muted/10">
                        <p className="text-xs text-muted-foreground">
                          {applicableCategoryIds.length > 0
                            ? "Whole categories selected above. Add single items here only to widen the scope further."
                            : "No individual items added — pick whole categories above, or add items one by one."}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {/* Header row */}
                        <div className="grid gap-2 px-3 pb-1" style={{ gridTemplateColumns: "1fr 1.4fr 90px 100px 36px" }}>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Category</span>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Menu Item</span>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground text-right">Price</span>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground text-right">After {discountPercent || 0}%</span>
                          <span />
                        </div>

                        <div className="space-y-1.5">
                          {scopeItemRows.map((row, idx) => {
                            const selectedItem = menuItems.find((m) => m.id === row.itemId);
                            const activeCategoryId = selectedItem?.categoryId ?? row.categoryId;
                            // Hide items already named on another row — picking the same
                            // item twice adds nothing to the scope.
                            const takenElsewhere = new Set(
                              scopeItemRows.filter((_, i) => i !== idx).map((r) => r.itemId).filter(Boolean)
                            );
                            const itemChoices = menuItems.filter(
                              (m) =>
                                !takenElsewhere.has(m.id) &&
                                (!activeCategoryId || m.categoryId === activeCategoryId)
                            );
                            const price = Number(selectedItem?.price || 0);
                            const after = price * (1 - Math.min(100, Math.max(0, discountPercent || 0)) / 100);
                            // Already covered by a whole-category selection above.
                            const redundant =
                              !!selectedItem?.categoryId &&
                              applicableCategoryIds.includes(selectedItem.categoryId);

                            return (
                              <div
                                key={idx}
                                className={cn(
                                  "grid gap-2 items-center px-3 py-2.5 rounded-lg border bg-background transition-colors",
                                  redundant
                                    ? "border-amber-500/40 bg-amber-500/[0.04]"
                                    : "border-border/60 hover:bg-muted/20"
                                )}
                                style={{ gridTemplateColumns: "1fr 1.4fr 90px 100px 36px" }}
                              >
                                {/* Category filter */}
                                <Select
                                  value={activeCategoryId || "all"}
                                  onValueChange={(val) =>
                                    updateScopeRowCategory(idx, val === "all" ? "" : val)
                                  }
                                >
                                  <SelectTrigger className="h-8 text-xs border-0 bg-muted/30 hover:bg-muted/50 focus:ring-1">
                                    <SelectValue placeholder="All categories" />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-60">
                                    <SelectItem value="all" className="text-xs">All Categories</SelectItem>
                                    {foodCategories.map((c) => (
                                      <SelectItem key={c.id} value={c.id} className="text-xs">
                                        {c.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>

                                {/* Item select */}
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0 w-4 text-right">{idx + 1}.</span>
                                  <Select
                                    value={row.itemId}
                                    onValueChange={(val) => updateScopeRowItem(idx, val)}
                                  >
                                    <SelectTrigger className="h-8 text-xs border-0 bg-muted/30 hover:bg-muted/50 focus:ring-1">
                                      <SelectValue placeholder="Select item…" />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-60">
                                      {itemChoices.length === 0 ? (
                                        <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                                          No items left in this category
                                        </div>
                                      ) : (
                                        itemChoices.map((item) => (
                                          <SelectItem key={item.id} value={item.id} className="text-xs">
                                            {item.name}
                                          </SelectItem>
                                        ))
                                      )}
                                    </SelectContent>
                                  </Select>
                                </div>

                                {/* Price before */}
                                <span className="text-xs font-mono text-muted-foreground text-right line-through">
                                  {row.itemId ? `Rs. ${price.toLocaleString()}` : "—"}
                                </span>

                                {/* Price after the discount */}
                                <span className="text-xs font-mono font-bold text-primary text-right">
                                  {row.itemId ? `Rs. ${Math.round(after).toLocaleString()}` : "—"}
                                </span>

                                {/* Delete */}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeScopeItemRow(idx)}
                                  className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>

                        {scopeItemRows.some((r) => {
                          const it = menuItems.find((m) => m.id === r.itemId);
                          return !!it?.categoryId && applicableCategoryIds.includes(it.categoryId);
                        }) && (
                          <p className="text-[10px] text-amber-600 dark:text-amber-500 flex items-center gap-1.5 px-3 pt-1">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            Highlighted rows are already covered by a category selected above — they change nothing.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* SECTION 4: Discount Impact (Percentage Mode) — the margin read-out the
              combo types get, answered for a percentage-off deal. */}
          {dealType === "percentage" && (
            <Card className="shadow-xs border-border/80 overflow-hidden">
              <CardHeader className="pb-3 border-b bg-muted/20">
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  4. Discount Impact
                </CardTitle>
                <CardDescription className="text-xs">
                  What {discountPercent || 0}% off does to the items in scope
                </CardDescription>
              </CardHeader>

              <CardContent className="p-5 space-y-5">
                {discountImpact.itemCount === 0 ? (
                  <div className="text-center py-10 space-y-2 border-2 border-dashed border-border/60 rounded-xl bg-muted/10">
                    <div className="w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center mx-auto">
                      <Percent className="h-5 w-5 text-muted-foreground/50" />
                    </div>
                    <p className="text-sm font-bold text-foreground">Nothing in scope yet</p>
                    <p className="text-xs text-muted-foreground">
                      Pick a category or some items above to see what this discount costs you
                    </p>
                  </div>
                ) : (
                <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

                  {/* How much of the menu this touches */}
                  <div className="rounded-xl border border-border/70 bg-muted/25 p-4 flex flex-col justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5 text-muted-foreground/70" />
                      Items In Scope
                    </span>
                    <div>
                      <div className="flex items-baseline gap-1.5">
                        <p className="text-xl font-black font-mono text-foreground tracking-tight">
                          {discountImpact.itemCount}
                        </p>
                        {discountImpact.unitCount !== discountImpact.itemCount && (
                          <span className="text-xs font-mono font-bold text-muted-foreground">
                            ({discountImpact.unitCount} sizes)
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                        {[
                          applicableCategoryIds.length > 0
                            ? `${applicableCategoryIds.length} categor${applicableCategoryIds.length !== 1 ? "ies" : "y"}`
                            : null,
                          applicableItemIds.length > 0
                            ? `${applicableItemIds.length} named item${applicableItemIds.length !== 1 ? "s" : ""}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" + ")}
                      </p>
                    </div>
                  </div>

                  {/* What the customer ends up paying, against what they'd have paid */}
                  <div className="rounded-xl border-2 border-primary/50 bg-primary/[0.04] p-4 flex flex-col justify-between gap-2 shadow-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                        <Tag className="h-3.5 w-3.5" />
                        Price After Discount
                      </span>
                      {(discountPercent || 0) > 0 && (
                        <span className="text-[10px] font-bold text-primary px-1.5 py-0.5 rounded bg-primary/10 shrink-0">
                          −{discountPercent}%
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-xl font-black font-mono text-primary tracking-tight">
                        Rs.&nbsp;{Math.round(discountImpact.minAfter).toLocaleString()} – {Math.round(discountImpact.maxAfter).toLocaleString()}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight font-mono">
                        was <span className="line-through">Rs. {Math.round(discountImpact.minBefore).toLocaleString()} – {Math.round(discountImpact.maxBefore).toLocaleString()}</span>
                      </p>
                    </div>
                  </div>

                  {/* Whether it still pays. The number is coloured by its own value —
                      a healthy average stays green even when specific items are
                      underwater — while the card's tint carries that warning. */}
                  <div className={cn(
                    "rounded-xl border p-4 flex flex-col justify-between gap-2 transition-all",
                    discountImpact.avgMargin == null
                      ? "border-border/70 bg-muted/25"
                      : discountImpact.belowCost.length > 0
                      ? "border-amber-500/40 bg-amber-500/[0.04]"
                      : "border-emerald-500/40 bg-emerald-500/[0.04]"
                  )}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5",
                        discountImpact.avgMargin == null
                          ? "text-muted-foreground"
                          : discountImpact.belowCost.length > 0
                          ? "text-amber-600 dark:text-amber-500"
                          : "text-emerald-600 dark:text-emerald-400"
                      )}>
                        <TrendingUp className="h-3.5 w-3.5" />
                        Avg Margin After
                      </span>
                      {discountImpact.belowCost.length > 0 && (
                        <span className="text-[10px] font-bold text-amber-600 dark:text-amber-500 px-1.5 py-0.5 rounded bg-amber-500/10 shrink-0">
                          {discountImpact.belowCost.length} at a loss
                        </span>
                      )}
                    </div>
                    <div>
                      {discountImpact.avgMargin != null ? (
                        <>
                          <p className={cn(
                            "text-xl font-black font-mono tracking-tight",
                            discountImpact.avgMargin > 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-destructive"
                          )}>
                            {discountImpact.avgMargin}%
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                            Across {discountImpact.pricedUnits} of {discountImpact.unitCount} with a recipe cost
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-xl font-black font-mono text-muted-foreground/40">—</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                            Set recipes in Menu Items for live margin
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                </div>

                {/* The one thing worth blocking on: selling under cost */}
                {discountImpact.belowCost.length > 0 && (
                  <div className="rounded-xl border border-destructive/40 bg-destructive/[0.04] overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-destructive/20 bg-destructive/[0.04]">
                      <p className="text-xs font-bold text-destructive flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        {discountImpact.belowCost.length} of {discountImpact.unitCount} sell below cost at {discountPercent}%
                      </p>
                      <span className="text-[10px] text-muted-foreground">
                        Lower the discount, or drop these from the scope above
                      </span>
                    </div>

                    <div className="px-4 py-3 space-y-1.5">
                      {/* Column header — keeps the numbers readable as a table, not a
                          name on one edge and a price on the other. */}
                      <div className="grid gap-3 items-center" style={{ gridTemplateColumns: "1fr 84px 84px 84px" }}>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Item</span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground text-right">Sells At</span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground text-right">Costs</span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground text-right">Loss</span>
                      </div>

                      {discountImpact.belowCost.slice(0, 6).map((u, i) => (
                        <div
                          key={`${u.name}-${i}`}
                          className="grid gap-3 items-center text-[11px] font-mono"
                          style={{ gridTemplateColumns: "1fr 84px 84px 84px" }}
                        >
                          <span className="text-foreground/90 truncate" title={u.name}>{u.name}</span>
                          <span className="text-right text-foreground/80">Rs. {Math.round(u.after).toLocaleString()}</span>
                          <span className="text-right text-muted-foreground">Rs. {Math.round(u.cost).toLocaleString()}</span>
                          <span className="text-right font-bold text-destructive">
                            −Rs. {Math.round(u.loss).toLocaleString()}
                          </span>
                        </div>
                      ))}

                      {discountImpact.belowCost.length > 6 && (
                        <p className="text-[10px] text-muted-foreground pt-1 border-t border-destructive/15 mt-1">
                          + {discountImpact.belowCost.length - 6} more below cost
                        </p>
                      )}
                    </div>
                  </div>
                )}
                </>
                )}
              </CardContent>
            </Card>
          )}

          {/* SECTION 3C: Buy X Get Y Configuration — both sides use the same row
              table as the Fixed Bundle and Choice Steps sections, so an admin
              reads one layout across every deal format. */}
          {dealType === "buy_x_get_y" && (
            <Card className="shadow-xs border-border/80 overflow-hidden">
              <CardHeader className="pb-3 border-b bg-muted/20">
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                  <Gift className="h-4 w-4 text-primary" />
                  3. Buy X Get Y Configuration
                </CardTitle>
                <CardDescription className="text-xs">
                  Define what the customer buys and what they receive for free — both sides take several items
                </CardDescription>
              </CardHeader>

              <CardContent className="p-5 space-y-4">
                {BOGO_SIDES.map((side) => {
                  const rows = side.key === "buy" ? buyRows : getRows;
                  const setRows = side.key === "buy" ? setBuyRows : setGetRows;
                  const SideIcon = side.icon;
                  const filledCount = rows.filter((r) => r.itemId).length;

                  return (
                    <div
                      key={side.key}
                      className={cn(
                        "rounded-xl border overflow-hidden",
                        side.key === "get"
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : "border-border/60 bg-muted/10"
                      )}
                    >
                      {/* Side header */}
                      <div
                        className={cn(
                          "flex items-center justify-between gap-3 px-3 py-2.5 border-b",
                          side.key === "get"
                            ? "border-emerald-500/20 bg-emerald-500/10"
                            : "border-border/50 bg-muted/20"
                        )}
                      >
                        <p
                          className={cn(
                            "text-xs font-bold uppercase tracking-wide flex items-center gap-1.5",
                            side.key === "get"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-foreground"
                          )}
                        >
                          <SideIcon
                            className={cn(
                              "h-4 w-4",
                              side.key === "get" ? "text-emerald-500" : "text-primary"
                            )}
                          />
                          {side.title}
                        </p>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-mono px-1.5 py-0 shrink-0",
                            side.key === "get" && "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                          )}
                        >
                          {filledCount} item{filledCount !== 1 ? "s" : ""}
                        </Badge>
                      </div>

                      <div className="p-3 space-y-2">
                        {/* Header row */}
                        <div className="grid gap-2 px-3 pb-1" style={{ gridTemplateColumns: BOGO_GRID }}>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Category</span>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Menu Item</span>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Size / Variant</span>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground text-right">Cost</span>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground text-right">Selling</span>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground text-center">Qty</span>
                          <span />
                        </div>

                        <div className="space-y-1.5">
                          {rows.map((row, idx) => {
                            const selectedItem = menuItems.find((m) => m.id === row.itemId);
                            // A row with an item shows that item's real category; only an
                            // empty row falls back to whatever category was picked to filter.
                            const activeCategoryId = selectedItem?.categoryId ?? row.categoryId;
                            const itemChoices = activeCategoryId
                              ? menuItems.filter((m) => m.categoryId === activeCategoryId)
                              : menuItems;
                            const variants = selectedItem?.variants || [];
                            let unitPrice = Number(selectedItem?.price || 0);
                            if (row.variantId) {
                              const v = variants.find((vr) => vr.id === row.variantId);
                              if (v && v.price != null) unitPrice = Number(v.price);
                            }
                            const unitCost = row.itemId ? getItemCost(row.itemId, row.variantId) : 0;

                            return (
                              <div
                                key={idx}
                                className="grid gap-2 items-center px-3 py-2.5 rounded-lg border border-border/60 bg-background hover:bg-muted/20 transition-colors"
                                style={{ gridTemplateColumns: BOGO_GRID }}
                              >
                                {/* Category filter — narrows the item dropdown beside it */}
                                <Select
                                  value={activeCategoryId || "all"}
                                  onValueChange={(val) =>
                                    updateBogoCategory(setRows, idx, val === "all" ? "" : val)
                                  }
                                >
                                  <SelectTrigger className="h-8 text-xs border-0 bg-muted/30 hover:bg-muted/50 focus:ring-1">
                                    <SelectValue placeholder="All categories" />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-60">
                                    <SelectItem value="all" className="text-xs">All Categories</SelectItem>
                                    {foodCategories.map((c) => (
                                      <SelectItem key={c.id} value={c.id} className="text-xs">
                                        {c.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>

                                {/* Item select — only items from the category above */}
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0 w-4 text-right">
                                    {idx + 1}.
                                  </span>
                                  <Select
                                    value={row.itemId}
                                    onValueChange={(val) => updateBogoItem(setRows, idx, val)}
                                  >
                                    <SelectTrigger className="h-8 text-xs border-0 bg-muted/30 hover:bg-muted/50 focus:ring-1">
                                      <SelectValue placeholder="Select item…" />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-60">
                                      {itemChoices.length === 0 ? (
                                        <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                                          No items in this category
                                        </div>
                                      ) : (
                                        itemChoices.map((item) => (
                                          <SelectItem key={item.id} value={item.id} className="text-xs">
                                            {item.name}
                                          </SelectItem>
                                        ))
                                      )}
                                    </SelectContent>
                                  </Select>
                                </div>

                                {/* Size — mandatory when the item has any, or the offer
                                    means "any size" and the server rejects the save. */}
                                <div>
                                  {variants.length > 0 ? (
                                    <Select
                                      value={row.variantId || undefined}
                                      onValueChange={(val) => patchBogoRow(setRows, idx, { variantId: val })}
                                    >
                                      <SelectTrigger
                                        className={cn(
                                          "h-8 text-xs border-0 bg-muted/30 hover:bg-muted/50 focus:ring-1",
                                          !row.variantId && "ring-1 ring-amber-500/60"
                                        )}
                                      >
                                        <SelectValue placeholder="Pick size…" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {variants.map((v) => (
                                          <SelectItem key={v.id} value={v.id} className="text-xs">
                                            {v.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <span className="text-xs text-muted-foreground px-1">—</span>
                                  )}
                                </div>

                                {/* Cost */}
                                <span className="text-xs font-mono text-muted-foreground text-right">
                                  {unitCost > 0 ? `Rs. ${unitCost.toLocaleString()}` : "—"}
                                </span>

                                {/* Selling price */}
                                <span
                                  className={cn(
                                    "text-xs font-mono font-semibold text-right",
                                    side.key === "get"
                                      ? "text-emerald-600 dark:text-emerald-400"
                                      : "text-foreground"
                                  )}
                                >
                                  {row.itemId ? `Rs. ${unitPrice.toLocaleString()}` : "—"}
                                </span>

                                {/* Qty stepper — same control as the Fixed Bundle rows */}
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => updateBogoQty(setRows, idx, row.qty - 1)}
                                    className="w-6 h-6 rounded-md bg-muted hover:bg-primary/10 hover:text-primary text-foreground flex items-center justify-center font-bold text-sm leading-none transition-colors"
                                  >
                                    −
                                  </button>
                                  <span className="w-6 text-center text-xs font-mono font-bold">{row.qty}</span>
                                  <button
                                    type="button"
                                    onClick={() => updateBogoQty(setRows, idx, row.qty + 1)}
                                    className="w-6 h-6 rounded-md bg-muted hover:bg-primary/10 hover:text-primary text-foreground flex items-center justify-center font-bold text-sm leading-none transition-colors"
                                  >
                                    +
                                  </button>
                                </div>

                                {/* Delete */}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  disabled={rows.length <= 1}
                                  onClick={() => removeBogoRow(setRows, idx)}
                                  className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-30"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>

                        {/* Footer — add another item to this side */}
                        <div className="flex items-center justify-between px-3 pt-2 border-t border-border/50 mt-1">
                          <span className="text-xs text-muted-foreground">{side.hint}</span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => addBogoRow(setRows)}
                            className="h-7 text-xs gap-1.5"
                          >
                            <Plus className="h-3.5 w-3.5" /> Add Item
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* SECTION 4: Pricing & Cost Breakdown (Buy X Get Y) — deliberately the
              same two-row ladder the Fixed Bundle uses: what everything is worth
              at regular menu price, then what this deal changes. Same card
              styling and the same labels, so an admin reads one vocabulary
              across every deal format. The only difference is that a Buy X Get Y
              price is derived, not typed — the customer pays menu price for what
              they buy, so there is no deal-price input or channel override. */}
          {dealType === "buy_x_get_y" && (
            <Card className="shadow-xs border-border/80 overflow-hidden">
              <CardHeader className="pb-3 border-b bg-muted/20">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div>
                    <CardTitle className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      4. Pricing & Cost Breakdown
                    </CardTitle>
                    <CardDescription className="text-xs">
                      What the offer is worth at menu price, and what it earns per redemption
                    </CardDescription>
                  </div>
                  {bogoImpact && (
                    <Badge variant="outline" className="text-[11px] font-mono self-start sm:self-auto gap-1">
                      <Calculator className="h-3 w-3 text-primary" />
                      Price Set By Items Bought
                    </Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="p-5 space-y-6">
                {!bogoImpact ? (
                  <div className="text-center py-10 space-y-2 border-2 border-dashed border-border/60 rounded-xl bg-muted/10">
                    <div className="w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center mx-auto">
                      <Gift className="h-5 w-5 text-muted-foreground/50" />
                    </div>
                    <p className="text-sm font-bold text-foreground">Nothing configured yet</p>
                    <p className="text-xs text-muted-foreground">
                      Pick what the customer buys and what they get free to see what this offer costs you
                    </p>
                  </div>
                ) : (
                  <>
                    {/* ── ROW 1 · AT MENU PRICE (baseline, informational) ── */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1.5">
                        <Tag className="h-3 w-3" /> At Regular Menu Price
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

                        {/* Total Cost */}
                        <div className="rounded-xl border border-border/70 bg-muted/25 p-4 flex flex-col justify-between gap-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                              <Coins className="h-3.5 w-3.5 text-muted-foreground/70" />
                              Total Cost
                            </span>
                            {bogoImpact.hasCost ? (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Recipe Cost</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground/60 px-1.5 py-0">No Recipe</Badge>
                            )}
                          </div>
                          <div>
                            <p className="text-xl font-black font-mono text-foreground tracking-tight">
                              Rs.&nbsp;{Math.round(bogoImpact.totalCost).toLocaleString()}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                              {bogoImpact.hasCost
                                ? "Raw ingredients & recipe cost"
                                : "Set recipes in Menu Items for live cost"}
                            </p>
                          </div>
                        </div>

                        {/* Total Selling Price */}
                        <div className="rounded-xl border border-border/70 bg-muted/25 p-4 flex flex-col justify-between gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                            <Tag className="h-3.5 w-3.5 text-muted-foreground/70" />
                            Total Selling Price
                          </span>
                          <div>
                            <p className="text-xl font-black font-mono text-foreground tracking-tight">
                              Rs.&nbsp;{Math.round(bogoImpact.regularValue).toLocaleString()}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                              Everything they carry out, at menu price
                            </p>
                          </div>
                        </div>

                        {/* Total Profit % at menu price */}
                        <div className="rounded-xl border border-border/70 bg-muted/25 p-4 flex flex-col justify-between gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground/70" />
                            Total Profit %
                          </span>
                          <div>
                            <p className="text-xl font-black font-mono text-foreground tracking-tight">
                              {bogoImpact.hasCost && bogoImpact.menuMargin != null ? `${bogoImpact.menuMargin}%` : "—"}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                              Margin before any deal discount
                            </p>
                          </div>
                        </div>

                      </div>
                    </div>

                    {/* ── ROW 2 · THIS DEAL (the decision) ── */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-primary/80 flex items-center gap-1.5">
                        <Sparkles className="h-3 w-3" /> This Deal
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                        {/* Deal Price — derived from what they buy, not typed */}
                        <div className="rounded-xl border-2 border-primary/50 bg-primary/[0.04] p-4 flex flex-col justify-between gap-2 shadow-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                              <Sparkles className="h-3.5 w-3.5" />
                              Deal Price
                            </span>
                            {bogoImpact.savingsPercent > 0 && (
                              <span className="text-[10px] font-bold text-primary px-1.5 py-0.5 rounded bg-primary/10 shrink-0">
                                {bogoImpact.savingsPercent}% OFF
                              </span>
                            )}
                          </div>
                          <div>
                            <p className="text-xl font-black font-mono text-primary tracking-tight">
                              Rs.&nbsp;{Math.round(bogoImpact.dealPrice).toLocaleString()}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                              {bogoImpact.savings > 0
                                ? `Customer saves Rs. ${Math.round(bogoImpact.savings).toLocaleString()}`
                                : "Customer pays at POS & Web"}
                            </p>
                          </div>
                        </div>

                        {/* Deal Profit % */}
                        <div className={cn(
                          "rounded-xl border p-4 flex flex-col justify-between gap-2 transition-all",
                          !bogoImpact.hasCost
                            ? "border-border/70 bg-muted/25"
                            : bogoImpact.profit > 0
                            ? "border-emerald-500/40 bg-emerald-500/[0.04]"
                            : "border-destructive/40 bg-destructive/[0.04]"
                        )}>
                          <span className={cn(
                            "text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5",
                            !bogoImpact.hasCost
                              ? "text-muted-foreground"
                              : bogoImpact.profit > 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-destructive"
                          )}>
                            <TrendingUp className="h-3.5 w-3.5" />
                            Deal Profit %
                          </span>
                          <div>
                            {bogoImpact.hasCost && bogoImpact.margin != null ? (
                              <>
                                <div className="flex items-baseline gap-1.5">
                                  <p className={cn(
                                    "text-xl font-black font-mono tracking-tight",
                                    bogoImpact.profit > 0
                                      ? "text-emerald-600 dark:text-emerald-400"
                                      : "text-destructive"
                                  )}>
                                    {bogoImpact.margin}%
                                  </p>
                                  <span className="text-xs font-mono font-bold text-muted-foreground">
                                    (Rs.&nbsp;{Math.round(bogoImpact.profit).toLocaleString()})
                                  </span>
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                                  Profit over ingredient cost
                                </p>
                              </>
                            ) : (
                              <>
                                <p className="text-xl font-black font-mono text-muted-foreground/40">—</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                  Add recipes for profit %
                                </p>
                              </>
                            )}
                          </div>
                        </div>

                      </div>
                    </div>

                    {/* What is actually being given away — the one number a Fixed
                        Bundle has no equivalent for, so it is spelled out rather
                        than left implicit in "Customer saves". */}
                    <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 space-y-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Gift className="h-3 w-3 text-muted-foreground/70" /> Given Away Free
                      </p>
                      {bogoImpact.give.map((r, i) => (
                        <div key={i} className="flex items-center justify-between gap-3 text-xs">
                          <span className="text-foreground/90 truncate">
                            {r.qty} × {r.item.name}
                            {r.label ? ` (${r.label})` : ""}
                          </span>
                          <span className="font-mono text-muted-foreground shrink-0">
                            Rs.&nbsp;{Math.round(r.price).toLocaleString()}
                            {r.cost > 0 && (
                              <span className="text-muted-foreground/60">
                                {" "}· costs you Rs.&nbsp;{Math.round(r.cost).toLocaleString()}
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Loss warning */}
                    {bogoImpact.hasCost && bogoImpact.profit <= 0 && (
                      <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
                        <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          <p className="text-xs font-bold text-destructive">
                            This offer loses Rs. {Math.abs(Math.round(bogoImpact.profit)).toLocaleString()} every time it is redeemed
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Raise what the customer has to buy, or give away something cheaper.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Unpinned sizes make these figures a worst case, not a fact */}
                    {bogoImpact.variantSpread && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">
                        A size is still unpinned, so any size qualifies — these figures assume the worst case: bought at the cheapest size, taken free at the priciest. Pick a size on every row for the real numbers.
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Validity & Schedule — always the last section, so its number follows
              whatever the chosen deal type rendered above it. */}
          <Card className="shadow-xs border-border/80 overflow-hidden">
            <CardHeader className="pb-3 border-b bg-muted/20">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                {validitySectionNumber}. Validity Dates & Time Restrictions
              </CardTitle>
              <CardDescription className="text-xs">
                Configure calendar date validity and optional happy-hour time windows
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
                    <p className="text-xs font-bold text-foreground">
                      Never Expires
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Always active indefinitely
                    </p>
                  </div>
                  <Switch
                    checked={alwaysActive}
                    onCheckedChange={setAlwaysActive}
                  />
                </div>
              </div>

              {/* Time restriction (Happy Hour) */}
              <div className="pt-2 border-t space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-primary" />
                      Time Slot Restriction (Happy Hour / Midnight Deal)
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Restrict deal to specific hours (e.g. Midnight 11PM–3AM, or 4PM–7PM)
                    </p>
                  </div>
                  <Switch
                    checked={hasTimeRestriction}
                    onCheckedChange={setHasTimeRestriction}
                  />
                </div>

                {hasTimeRestriction && (
                  <div className="grid grid-cols-2 gap-4 p-3 rounded-xl border bg-muted/15 max-w-md animate-in slide-in-from-top-1">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">
                        Start Time
                      </Label>
                      <Input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">
                        End Time
                      </Label>
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
      </div>
    </div>
  );
};

export default DealForm;

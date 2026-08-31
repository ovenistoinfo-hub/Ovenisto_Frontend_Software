import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, X } from "lucide-react";
import type { CategoryRecord, MenuItemRecord } from "@/services/menu.service";

export interface CategoryVariantPick {
  itemId: string;
  variantId: string | null;
}

interface CategoryVariantPickerProps {
  categories: CategoryRecord[];
  menuItems: MenuItemRecord[];
  /** "itemId:variantId" keys already present in the target row list — shown
   *  as already-added rather than re-addable. */
  existingKeys: Set<string>;
  onAdd: (picks: CategoryVariantPick[]) => void;
  onClose: () => void;
}

const pickKey = (itemId: string, variantId: string | null) => `${itemId}:${variantId ?? ""}`;

/** Pick a category, see every one of its products with their sizes inline,
 *  and tap a size once to select it across every product in the category
 *  that has it — replacing a one-by-one item dropdown with a bulk pick.
 *  Selection is a local working set; onAdd hands the parent concrete
 *  item+variant pairs to snapshot into its own row state (no dynamic
 *  category rule — an item added to the category later is never
 *  auto-included). */
export function CategoryVariantPicker({ categories, menuItems, existingKeys, onAdd, onClose }: CategoryVariantPickerProps) {
  const [categoryId, setCategoryId] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const categoryItems = useMemo(
    () => menuItems.filter((m) => m.categoryId === categoryId),
    [menuItems, categoryId]
  );

  // Distinct variant names across the category's items, for the bulk
  // "select this size everywhere" header row.
  const bulkVariantNames = useMemo(() => {
    const names = new Set<string>();
    for (const item of categoryItems) {
      for (const v of item.variants) names.add(v.name);
    }
    return [...names];
  }, [categoryItems]);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const bulkSelectVariantName = (variantName: string) => {
    const matchingKeys = categoryItems
      .map((item) => {
        const variant = item.variants.find((v) => v.name === variantName);
        return variant ? pickKey(item.id, variant.id) : null;
      })
      .filter((k): k is string => !!k && !existingKeys.has(k));
    if (matchingKeys.length === 0) return;
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = matchingKeys.every((k) => next.has(k));
      matchingKeys.forEach((k) => (allSelected ? next.delete(k) : next.add(k)));
      return next;
    });
  };

  const handleAdd = () => {
    const picks: CategoryVariantPick[] = [...selected].map((key) => {
      const separatorIdx = key.indexOf(":");
      const itemId = key.slice(0, separatorIdx);
      const variantId = key.slice(separatorIdx + 1);
      return { itemId, variantId: variantId || null };
    });
    onAdd(picks);
    setSelected(new Set());
  };

  return (
    <Card className="border-primary/40 bg-primary/[0.03]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold">Bulk Add From Category</CardTitle>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); setSelected(new Set()); }}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Choose a category" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {categoryId && categoryItems.length === 0 && (
          <p className="text-sm text-muted-foreground">No items in this category.</p>
        )}

        {categoryId && bulkVariantNames.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Select a size across every item</p>
            <div className="flex flex-wrap gap-1.5">
              {bulkVariantNames.map((name) => (
                <Button
                  key={name}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => bulkSelectVariantName(name)}
                >
                  {name}
                </Button>
              ))}
            </div>
          </div>
        )}

        {categoryId && categoryItems.length > 0 && (
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {categoryItems.map((item) => (
              <div key={item.id} className="rounded-md border border-border/70 p-2.5">
                <p className="break-words text-sm font-medium">{item.name}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {item.variants.length > 0 ? (
                    item.variants.map((v) => {
                      const key = pickKey(item.id, v.id);
                      const already = existingKeys.has(key);
                      const isSelected = selected.has(key);
                      return (
                        <Button
                          key={v.id}
                          type="button"
                          size="sm"
                          variant={isSelected ? "default" : "outline"}
                          disabled={already}
                          className="h-7 px-2.5 text-xs"
                          onClick={() => toggle(key)}
                        >
                          {isSelected && <Check className="mr-1 h-3 w-3" />}
                          {v.name}
                          {already ? " (added)" : ""}
                        </Button>
                      );
                    })
                  ) : (
                    <VariantlessItemChip
                      itemId={item.id}
                      already={existingKeys.has(pickKey(item.id, null))}
                      selected={selected.has(pickKey(item.id, null))}
                      onToggle={() => toggle(pickKey(item.id, null))}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border/70 pt-3">
          <span className="text-xs text-muted-foreground">{selected.size} selected</span>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="button" size="sm" disabled={selected.size === 0} onClick={handleAdd}>
              Add {selected.size > 0 ? selected.size : ""} Item{selected.size === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function VariantlessItemChip({ already, selected, onToggle }: { itemId: string; already: boolean; selected: boolean; onToggle: () => void }) {
  return (
    <Button
      type="button"
      size="sm"
      variant={selected ? "default" : "outline"}
      disabled={already}
      className="h-7 px-2.5 text-xs"
      onClick={onToggle}
    >
      {selected && <Check className="mr-1 h-3 w-3" />}
      {already ? "Added" : "Add"}
    </Button>
  );
}

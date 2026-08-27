import { RecipeIngredient } from '../services/menu.service';

export interface FoodAvailabilityResult {
  availableQuantity: number;
  status: 'normal' | 'low' | 'out_of_stock';
  isRestricted: boolean;
  limitingIngredient?: string;
}

/**
 * Calculates how many complete items can currently be made from available ingredient stock for a specific food item size.
 *
 * Rule:
 * available_quantity = Math.floor(current_stock / required_quantity_per_food)
 * Food item's available quantity is MIN across ALL required ingredients for that size.
 *
 * Status:
 * > 5 = 'normal'
 * 1 - 5 = 'low' (Low Stock)
 * 0 = 'out_of_stock' (Out of Stock)
 */
export function calculateFoodAvailability(
  recipes: RecipeIngredient[] = [],
  variantId: string | null = null,
  ingredientStockMap: Map<string, number> | Record<string, number>,
  productionStockMap: Map<string, number> | Record<string, number> = {}
): FoodAvailabilityResult {
  if (!recipes || recipes.length === 0) {
    return { availableQuantity: Infinity, status: 'normal', isRestricted: false };
  }

  // Filter recipes for this item & variant (include both item-level base ingredients and variant-specific ingredients)
  let relevantRecipes: RecipeIngredient[] = [];
  if (variantId) {
    const itemLevel = recipes.filter((r) => !r.variantId);
    const variantLevel = recipes.filter((r) => r.variantId === variantId);
    relevantRecipes = [...itemLevel, ...variantLevel];
  } else {
    relevantRecipes = recipes.filter((r) => !r.variantId);
  }

  if (relevantRecipes.length === 0) {
    return { availableQuantity: Infinity, status: 'normal', isRestricted: false };
  }

  let minAvailable = Infinity;
  let limitingIngName: string | undefined = undefined;

  for (const r of relevantRecipes) {
    const reqQty = Number(r.qtyPerUnit);
    if (!reqQty || reqQty <= 0) continue;

    let stock = 0;
    let name = 'Ingredient';

    if (r.ingredientId) {
      stock = ingredientStockMap instanceof Map
        ? (ingredientStockMap.get(r.ingredientId) ?? 0)
        : (ingredientStockMap[r.ingredientId] ?? 0);
      name = r.ingredient?.name || 'Ingredient';
    } else if (r.productionItemId) {
      stock = productionStockMap instanceof Map
        ? (productionStockMap.get(r.productionItemId) ?? 0)
        : (productionStockMap[r.productionItemId] ?? 0);
      name = r.productionItem?.name || 'Production Item';
    }

    // Floor calculation for complete items
    const possibleItems = Math.floor(stock / reqQty);
    if (possibleItems < minAvailable) {
      minAvailable = possibleItems;
      limitingIngName = name;
    }
  }

  if (minAvailable === Infinity) {
    return { availableQuantity: Infinity, status: 'normal', isRestricted: false };
  }

  const finalAvail = Math.max(0, minAvailable);

  let status: 'normal' | 'low' | 'out_of_stock' = 'normal';
  if (finalAvail === 0) {
    status = 'out_of_stock';
  } else if (finalAvail <= 5) {
    status = 'low';
  }

  return {
    availableQuantity: finalAvail,
    status,
    isRestricted: true,
    limitingIngredient: limitingIngName,
  };
}

/** Whether an item can be sold AT ALL right now — every one of its variants
 *  (or, for a variant-less item, the item itself) is out of stock. Used to
 *  decide when a whole menu/deal card should render as unclickable, as
 *  opposed to just one size within it (see `calculateFoodAvailability`
 *  called per-variant for that finer-grained case). An item with no
 *  variants and no recipe, or any item where at least one variant still has
 *  stock, is never fully out of stock. */
export function isFullyOutOfStock(
  recipes: RecipeIngredient[] = [],
  variantIds: string[],
  ingredientStockMap: Map<string, number> | Record<string, number>,
  productionStockMap: Map<string, number> | Record<string, number> = {}
): boolean {
  if (variantIds.length === 0) {
    const avail = calculateFoodAvailability(recipes, null, ingredientStockMap, productionStockMap);
    return avail.isRestricted && avail.availableQuantity === 0;
  }
  return variantIds.every((variantId) => {
    const avail = calculateFoodAvailability(recipes, variantId, ingredientStockMap, productionStockMap);
    return avail.isRestricted && avail.availableQuantity === 0;
  });
}

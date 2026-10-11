import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { mealTypeService } from "@/services/mealType.service";
import { settingsService } from "@/services/settings.service";
import { parseWebsiteConfig } from "@/lib/websiteConfig";
import type { MealTime } from "@/lib/mealTime";

/**
 * Active meal types with the logged-in user's branch serving times (Settings → Website → Meal times).
 * Empty while loading or for Super Admin (no branch), which means "no restriction".
 */
export function useMealTimes(): MealTime[] {
  const { user } = useAuth();
  const branchId = user?.role !== "Super Admin" ? user?.outletId ?? null : null;
  const { data } = useQuery({
    queryKey: ["meal-times", branchId],
    queryFn: async () => {
      const [types, settings] = await Promise.all([mealTypeService.getAll(), settingsService.getMySettings()]);
      const { mealHours } = parseWebsiteConfig(settings?.websiteConfig);
      return types.filter(t => t.status === "active").map(t => ({ id: t.id, name: t.name, hours: mealHours[t.id] ?? null }));
    },
    enabled: !!branchId,
    staleTime: 5 * 60 * 1000,
  });
  return data ?? [];
}

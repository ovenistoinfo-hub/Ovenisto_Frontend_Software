import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { outletService, type OutletRecord } from "@/services/outlet.service";
import { outletStore } from "@/services/outletStore";

// Local, page-scoped outlet drill-down for Super Admin.
// Defaults to the user's branch or the first available outlet.
// Synchronizes with outletStore so api.ts attaches the active X-Outlet-Id header.
export function useOutletFilter() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "Super Admin";
  const [outletId, setOutletIdState] = useState<string>("all");
  const [hasDefaulted, setHasDefaulted] = useState(false);

  const { data: outlets = [] } = useQuery<OutletRecord[]>({
    queryKey: ["outlets-filter-list"],
    queryFn: () => outletService.getOutlets(),
    enabled: isSuperAdmin,
  });

  const setOutletId = useCallback((id: string) => {
    setOutletIdState(id);
    outletStore.set(id);
  }, []);

  useEffect(() => {
    if (isSuperAdmin && outlets.length > 0 && !hasDefaulted) {
      const preferred =
        user?.outletId && outlets.some((o) => o.id === user.outletId)
          ? user.outletId
          : outlets[0].id;
      setOutletIdState(preferred);
      outletStore.set(preferred);
      setHasDefaulted(true);
    }
  }, [isSuperAdmin, outlets, hasDefaulted, user?.outletId]);

  return { outletId, setOutletId, outlets, isSuperAdmin };
}


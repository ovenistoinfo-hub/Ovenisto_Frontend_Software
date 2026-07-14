import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { outletService, type OutletRecord } from "@/services/outlet.service";

// Local, page-scoped outlet drill-down for Super Admin. No persistence — resets to
// "all" on every mount, matching Warehouses.tsx's existing local-filter pattern.
// Renders/does nothing for every other role (they're already pinned server-side).
export function useOutletFilter() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "Super Admin";
  const [outletId, setOutletId] = useState("all");

  const { data: outlets = [] } = useQuery<OutletRecord[]>({
    queryKey: ["outlets-filter-list"],
    queryFn: () => outletService.getOutlets(),
    enabled: isSuperAdmin,
  });

  return { outletId, setOutletId, outlets, isSuperAdmin };
}

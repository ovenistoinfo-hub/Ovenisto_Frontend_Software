import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./AuthContext";
import { api } from "@/services/api";
import { outletService } from "@/services/outlet.service";
import { outletStore } from "@/services/outletStore";

const STORAGE_KEY = "ovenisto_selected_outlet";

interface OutletOption { id: string; name: string; }

interface OutletContextValue {
  selectedOutletId: string;
  setSelectedOutletId: (id: string) => void;
  outlets: OutletOption[];
  isLocked: boolean;
}

const OutletContext = createContext<OutletContextValue | undefined>(undefined);

export function OutletProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isSuperAdmin = user?.role === "Super Admin";
  const isLocked = !isSuperAdmin;

  const { data: outlets = [] } = useQuery({
    queryKey: ["outlets"],
    queryFn: () => outletService.getOutlets(),
    enabled: !!user,
  });

  // Initialize: Super Admin → last saved or "all"; everyone else → their own outlet.
  // Set the request-layer store synchronously here (during render, before any child
  // page mounts and fires its first query) so the first request after a refresh
  // already carries the correct outlet rather than the default "all".
  const [selectedOutletId, setSelected] = useState<string>(() => {
    let initial: string;
    if (!user) initial = "all";
    else if (isSuperAdmin) initial = localStorage.getItem(STORAGE_KEY) || "all";
    else initial = user.outletId || "all";
    outletStore.set(initial);
    return initial;
  });

  // Re-initialize when the user changes (login/logout/role switch).
  useEffect(() => {
    let next: string;
    if (!user) next = "all";
    else if (isSuperAdmin) next = localStorage.getItem(STORAGE_KEY) || "all";
    else next = user.outletId || "all";
    setSelected(next);
    outletStore.set(next);
  }, [user, isSuperAdmin]);

  // Keep the request-layer holder in sync on every change.
  useEffect(() => {
    outletStore.set(selectedOutletId);
  }, [selectedOutletId]);

  const setSelectedOutletId = (id: string) => {
    if (isLocked) return; // non-super-admins cannot change their outlet
    setSelected(id);
    localStorage.setItem(STORAGE_KEY, id);
    outletStore.set(id);
    api.clearCache();
    queryClient.invalidateQueries();
  };

  return (
    <OutletContext.Provider value={{ selectedOutletId, setSelectedOutletId, outlets, isLocked }}>
      {children}
    </OutletContext.Provider>
  );
}

export function useOutlet(): OutletContextValue {
  const ctx = useContext(OutletContext);
  if (!ctx) throw new Error("useOutlet must be used within an OutletProvider");
  return ctx;
}

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { outletStore } from "@/services/outletStore";

interface OutletContextValue {
  selectedOutletId: string;
}

const OutletContext = createContext<OutletContextValue | undefined>(undefined);

// Super Admin always sees "all" (no per-branch "linking" — see
// docs/superpowers/specs/2026-07-12-outlet-scope-correctness-phase1-design.md).
// Every other role stays pinned to their own outlet, exactly as before.
export function OutletProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [selectedOutletId, setSelected] = useState<string>(() => {
    const initial = user?.role === "Super Admin" ? "all" : (user?.outletId || "all");
    outletStore.set(initial);
    return initial;
  });

  useEffect(() => {
    const next = user?.role === "Super Admin" ? "all" : (user?.outletId || "all");
    setSelected(next);
    outletStore.set(next);
  }, [user]);

  return (
    <OutletContext.Provider value={{ selectedOutletId }}>
      {children}
    </OutletContext.Provider>
  );
}

export function useOutlet(): OutletContextValue {
  const ctx = useContext(OutletContext);
  if (!ctx) throw new Error("useOutlet must be used within an OutletProvider");
  return ctx;
}

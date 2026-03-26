import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { authService, type AuthUser } from "@/services/auth.service";
import { getAccessToken, clearTokens } from "@/services/api";

// Role-based permissions mapping
const rolePermissions: Record<string, string[]> = {
  "Super Admin": ["*"],
  "Admin": ["*"],
  "Manager": [
    "dashboard", "analytics", "pos", "kitchens", "waiter", "order-status",
    "customer-display", "outlets", "items", "production", "stock", "warehouses",
    "sales", "customers", "customer-dues", "purchases", "suppliers", "supplier-dues",
    "expenses", "transfers", "demands", "waste", "attendance", "reports", "sms",
    "settings", "my-portal",
  ],
  "Floor Manager": [
    "dashboard", "waiter", "order-status", "customer-display", "customers",
    "reservations", "table-layout", "attendance", "my-portal",
  ],
  "Cashier": ["dashboard", "pos", "sales", "customers", "customer-dues", "attendance", "my-portal"],
  "Waiter": ["waiter", "attendance", "my-portal"],
  "Kitchen Manager": ["kitchens", "order-status", "items", "production", "stock", "warehouses", "transfers", "demands", "attendance", "my-portal"],
  "Kitchen Staff": ["kitchens", "attendance", "my-portal"],
  "Delivery Manager": ["delivery", "online-orders", "order-status", "sales", "attendance", "my-portal"],
  "Store Manager": [
    "items", "stock", "warehouses", "production", "purchases", "suppliers",
    "supplier-dues", "transfers", "demands", "waste", "attendance", "my-portal",
  ],
  "Accountant": [
    "sales", "customer-dues", "purchases", "suppliers", "supplier-dues",
    "expenses", "reports", "attendance", "my-portal",
  ],
  "Rider": ["attendance", "my-portal"],
  "Customer Screen": ["customer-display"],
};

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string | null;
  phone?: string | null;
  branch?: string | null;
  outletId?: string | null;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  hasPermission: (module: string) => boolean;
  updateUser: (updates: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem("ovenisto_user");
    return stored ? JSON.parse(stored) : null;
  });
  const [isLoading, setIsLoading] = useState(false);

  // On mount: validate session — re-fetch user if token exists
  useEffect(() => {
    const token = getAccessToken();
    const stored = localStorage.getItem("ovenisto_user");

    if (!token) {
      // No access token — clear stale user data and force login
      if (stored) {
        clearTokens();
        localStorage.removeItem("ovenisto_user");
        setUser(null);
      }
      return;
    }

    // Token exists — fetch fresh user data from API (validates token against DB)
    setIsLoading(true);
    authService.getMe()
      .then((data) => {
        const authUser: User = {
          id: data.id,
          name: data.name,
          email: data.email,
          role: data.role,
          avatar: data.avatar,
          phone: data.phone,
          branch: data.branch,
          outletId: data.outletId,
        };
        setUser(authUser);
        localStorage.setItem("ovenisto_user", JSON.stringify(authUser));
      })
      .catch(() => {
        // Token invalid/expired and refresh failed — clear everything
        clearTokens();
        localStorage.removeItem("ovenisto_user");
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    try {
      const data = await authService.login(email, password);
      const authUser: User = {
        id: data.id,
        name: data.name,
        email: data.email,
        role: data.role,
        avatar: data.avatar,
        phone: data.phone,
        branch: data.branch,
        outletId: data.outletId,
      };
      setUser(authUser);
      localStorage.setItem("ovenisto_user", JSON.stringify(authUser));
      return true;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
    localStorage.removeItem("ovenisto_user");
    sessionStorage.removeItem("ovenisto_user");
  }, []);

  const hasPermission = useCallback((module: string) => {
    if (!user) return false;
    const perms = rolePermissions[user.role] || [];
    if (perms.includes("*")) return true;
    return perms.some(p => module.startsWith(p));
  }, [user]);

  const updateUser = useCallback((updates: Partial<User>) => {
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, ...updates };
      localStorage.setItem("ovenisto_user", JSON.stringify(updated));
      return updated;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout, hasPermission, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

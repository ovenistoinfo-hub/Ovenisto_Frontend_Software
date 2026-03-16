import React, { createContext, useContext, useState, useCallback } from "react";
import { users as mockUsers } from "@/data/mock-data";

// Role-based permissions mapping
const rolePermissions: Record<string, string[]> = {
  "Super Admin": ["*"],
  "Admin": ["*"],
  "Manager": ["dashboard", "analytics", "pos", "kitchens", "waiter", "order-status", "customer-display", "outlets", "items", "production", "stock", "sales", "customers", "customer-dues", "purchases", "suppliers", "supplier-dues", "expenses", "transfers", "waste", "attendance", "reports", "sms"],
  "Cashier": ["dashboard", "pos", "sales", "customers", "customer-dues"],
  "Waiter": ["waiter"],
  "Kitchen Staff": ["kitchens"],
};

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
  phone?: string;
  branch?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  hasPermission: (module: string) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem("ovenisto_user") || sessionStorage.getItem("ovenisto_user");
    return stored ? JSON.parse(stored) : null;
  });

  const login = useCallback(async (email: string, password: string) => {
    if (!password.trim()) return false;
    const found = mockUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!found) return false;
    const authUser: User = {
      id: found.id, name: found.name, email: found.email,
      role: found.role, avatar: found.avatar, phone: found.phone, branch: found.branch,
    };
    setUser(authUser);
    // Check remember me preference
    const remember = localStorage.getItem("ovenisto_remember") === "true";
    if (remember) {
      localStorage.setItem("ovenisto_user", JSON.stringify(authUser));
    } else {
      sessionStorage.setItem("ovenisto_user", JSON.stringify(authUser));
    }
    return true;
  }, []);

  const logout = useCallback(() => {
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

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

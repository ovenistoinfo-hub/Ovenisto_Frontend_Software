import { useState, useEffect } from "react";
import { useLocation, Link } from "react-router-dom";
import {
  ShoppingCart, Bell, ChefHat, FileText, Truck, BarChart3, User, Settings, LogOut, ChevronRight, Sun, Moon
} from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/use-theme";

const quickActions = [
  { icon: ShoppingCart, label: "POS", url: "/pos" },
  { icon: Truck, label: "Orders", url: "/sales" },
  { icon: ChefHat, label: "Kitchen", url: "/kitchens" },
  { icon: BarChart3, label: "Monitor", url: "/order-status" },
];

// Multi-level breadcrumb config
const breadcrumbConfig: Record<string, { label: string; parent?: { label: string; url: string } }> = {
  "/": { label: "Dashboard" },
  "/analytics": { label: "Analytics" },
  "/warehouse-dashboard": { label: "Warehouse Management" },
  "/pos": { label: "Point of Sale" },
  "/kitchens": { label: "Kitchens" },
  "/waiter": { label: "Waiter Panel" },
  "/outlets": { label: "Outlets" },
  "/settings": { label: "General Settings", parent: { label: "Settings", url: "/settings" } },
  "/items/ingredient-units": { label: "Ingredient Units", parent: { label: "Items", url: "/items/food-menu" } },
  "/items/ingredient-categories": { label: "Ingredient Categories", parent: { label: "Items", url: "/items/food-menu" } },
  "/items/ingredients": { label: "Ingredients", parent: { label: "Items", url: "/items/food-menu" } },
  "/items/modifiers": { label: "Modifiers", parent: { label: "Items", url: "/items/food-menu" } },
  "/items/menu-categories": { label: "Menu Categories", parent: { label: "Items", url: "/items/food-menu" } },
  "/items/food-menu": { label: "Food Menu", parent: { label: "Items", url: "/items/food-menu" } },
  "/items/pre-made-food": { label: "Pre-Made Food", parent: { label: "Items", url: "/items/food-menu" } },
  "/production": { label: "Production" },
  "/stock": { label: "Overview", parent: { label: "Stock", url: "/stock" } },
  "/stock/low-stock": { label: "Low Stock Alerts", parent: { label: "Stock", url: "/stock" } },
  "/stock/adjustments": { label: "Adjustments", parent: { label: "Stock", url: "/stock" } },
  "/stock/stock-take": { label: "Stock Take", parent: { label: "Stock", url: "/stock" } },
  "/sales": { label: "Sales" },
  "/customers": { label: "Customers" },
  "/rider-portal": { label: "Rider Portal" },
  "/delivery": { label: "Delivery" },
  "/reservations": { label: "Reservations" },
  "/online-orders": { label: "Online Orders" },
  "/table-layout": { label: "Table Layout" },
  "/shifts": { label: "Shifts" },
  "/purchases": { label: "Purchases" },
  "/suppliers": { label: "Suppliers" },
  "/expenses": { label: "Expenses" },
  "/transfers": { label: "Transfers" },
  "/users": { label: "Users" },
  "/attendance": { label: "Attendance" },
  "/cancellation-requests": { label: "Cancellation Requests" },
  "/reports": { label: "Reports" },
  "/sms": { label: "Send SMS" },
  "/profile": { label: "Profile" },
  "/order-status": { label: "Order Monitor" },
  "/customer-display": { label: "Customer Display" },
};

function getBreadcrumbs(pathname: string) {
  // Handle dynamic routes
  let config = breadcrumbConfig[pathname];
  
  // Check for food menu add/edit
  if (!config) {
    if (pathname.startsWith("/items/food-menu/add")) {
      config = { label: "Add New", parent: { label: "Items", url: "/items/food-menu" } };
      return [
        { label: "Home", url: "/" },
        { label: "Items", url: "/items/food-menu" },
        { label: "Food Menu", url: "/items/food-menu" },
        { label: "Add New" },
      ];
    }
    if (pathname.startsWith("/items/food-menu/edit/")) {
      return [
        { label: "Home", url: "/" },
        { label: "Items", url: "/items/food-menu" },
        { label: "Food Menu", url: "/items/food-menu" },
        { label: "Edit" },
      ];
    }
    if (pathname.startsWith("/customers/")) {
      return [
        { label: "Home", url: "/" },
        { label: "Customers", url: "/customers" },
        { label: "Detail" },
      ];
    }
    // Fallback
    return [{ label: "Home", url: "/" }, { label: "Page" }];
  }

  const crumbs: { label: string; url?: string }[] = [{ label: "Home", url: "/" }];
  if (config.parent) {
    crumbs.push({ label: config.parent.label, url: config.parent.url });
  }
  crumbs.push({ label: config.label });
  return crumbs;
}

export function AppHeader() {
  const [time, setTime] = useState(new Date());
  const location = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const breadcrumbs = getBreadcrumbs(location.pathname);

  return (
    <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <SidebarTrigger className="text-muted-foreground hover:text-foreground shrink-0" />
        <div className="flex items-center gap-1 text-sm text-muted-foreground min-w-0 overflow-hidden">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1 shrink-0">
              {i > 0 && <ChevronRight className="h-3 w-3 shrink-0" />}
              {crumb.url && i < breadcrumbs.length - 1 ? (
                <Link to={crumb.url} className="hover:text-primary whitespace-nowrap">{crumb.label}</Link>
              ) : (
                <span className="text-foreground font-medium whitespace-nowrap">{crumb.label}</span>
              )}
            </span>
          ))}
        </div>
      </div>

      <div className="hidden md:flex items-center gap-1">
        {quickActions.map((a) => (
          <Button key={a.label} variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-primary h-8">
            <Link to={a.url}>
              <a.icon className="h-4 w-4" />
              <span className="text-xs">{a.label}</span>
            </Link>
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground hidden lg:block font-medium tabular-nums">
          {time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>

        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleTheme}>
          {theme === "dark" ? <Sun className="h-4 w-4 text-warning" /> : <Moon className="h-4 w-4 text-muted-foreground" />}
        </Button>

        <Button variant="ghost" size="icon" className="relative h-8 w-8">
          <Bell className="h-4 w-4 text-muted-foreground" />
          <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[9px] gradient-primary text-primary-foreground border-0">
            3
          </Badge>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 h-8 px-2">
              <div className="h-7 w-7 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-xs font-semibold">
                {user?.name?.charAt(0) || "A"}
              </div>
              <div className="hidden md:block text-left">
                <p className="text-xs font-medium leading-none">{user?.name || "Admin"}</p>
                <p className="text-[10px] text-muted-foreground">{user?.role || "Super Admin"}</p>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link to="/profile"><User className="h-4 w-4 mr-2" />Profile</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/settings"><Settings className="h-4 w-4 mr-2" />Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive">
              <LogOut className="h-4 w-4 mr-2" />Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

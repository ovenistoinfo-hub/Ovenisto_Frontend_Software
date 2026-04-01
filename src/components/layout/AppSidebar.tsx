import { useState } from "react";
import { useLocation, Link } from "react-router-dom";
import {
  Home, BarChart3, ShoppingCart, ChefHat, UtensilsCrossed, Store, Settings, Globe, CalendarDays,
  Pizza, Factory, Package, DollarSign, Receipt, ShoppingBag, CreditCard, ArrowLeftRight,
  Trash2, Users, Clock, FileText, MessageSquare, ChevronDown, ChevronRight, Flame, LogOut, Link2,
  Tag, Bike, Award, Ticket, CalendarCheck, LayoutGrid, Timer, ClipboardList, CalendarOff, UserCircle
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem,
  SidebarHeader, SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const navSections = [
  { label: "Common", items: [
    { title: "Dashboard", url: "/", icon: Home, module: "dashboard" },
    { title: "Analytics", url: "/analytics", icon: BarChart3, module: "analytics" },
  ]},
  { label: "Panel", items: [
    { title: "POS", url: "/pos", icon: ShoppingCart, module: "pos" },
    { title: "Self Order", url: "/self-order", icon: Pizza, module: "self-order" },
    { title: "Kitchens", url: "/kitchens", icon: ChefHat, module: "kitchens" },
    { title: "Waiter Panel", url: "/waiter", icon: UtensilsCrossed, module: "waiter" },
    { title: "Table Layout", url: "/table-layout", icon: LayoutGrid, module: "settings" },
    { title: "Order Monitor", url: "/order-status", icon: BarChart3, module: "order-status" },
    { title: "Customer Display", url: "/customer-display", icon: Globe, module: "customer-display" },
    { title: "Online Orders", url: "/online-orders", icon: Globe, module: "sales" },
  ]},
  { label: "Outlets", items: [{ title: "Outlets", url: "/outlets", icon: Store, module: "outlets" }]},
  { label: "Settings", items: [
    { title: "General Settings", url: "/settings", icon: Settings, module: "settings" },
    { title: "Self Order", url: "/settings/self-order", icon: Link2, module: "settings" },
    { title: "Website Order", url: "/settings/website-order", icon: Globe, module: "settings" },
    { title: "Reservations", url: "/settings/reservations", icon: CalendarDays, module: "settings" },
    { title: "Warehouses", url: "/settings/warehouses", icon: Package, module: "settings" },
  ]},
  { label: "Item / Stock", items: [
    { title: "Items", icon: Pizza, module: "items", children: [
      { title: "Ingredient Units", url: "/items/ingredient-units" },
      { title: "Ingredient Categories", url: "/items/ingredient-categories" },
      { title: "Ingredients", url: "/items/ingredients" },
      { title: "Modifiers", url: "/items/modifiers" },
      { title: "Menu Categories", url: "/items/menu-categories" },
      { title: "Meal Types", url: "/items/meal-types" },
      { title: "Food Menu", url: "/items/food-menu" },
      { title: "Add Food Item", url: "/items/food-menu/add" },
      { title: "Pre-Made Food", url: "/items/pre-made-food" },
    ]},
    { title: "Deals & Combos", url: "/deals", icon: Tag, module: "items" },
    { title: "Production", url: "/production", icon: Factory, module: "production" },
    { title: "Stock", icon: Package, module: "stock", children: [
      { title: "Branch Stock", url: "/warehouses", module: "warehouses" },
      { title: "Kitchen Stock", url: "/kitchen-stock", module: "kitchens" },
      { title: "Stock Adjustments", url: "/stock/adjustments" },
    ]},
  ]},
  { label: "Sale / Customer", items: [
    { title: "Sales", url: "/sales", icon: DollarSign, module: "sales" },
    { title: "Customers", url: "/customers", icon: Users, module: "customers" },
    { title: "Customer Dues", url: "/customer-dues", icon: Receipt, module: "customer-dues" },
    { title: "Delivery", url: "/delivery", icon: Bike, module: "sales" },
    { title: "Loyalty Program", url: "/loyalty", icon: Award, module: "customers" },
    { title: "Coupons", url: "/coupons", icon: Ticket, module: "sales" },
    { title: "Reservations", url: "/reservations", icon: CalendarCheck, module: "customers" },
  ]},
  { label: "Purchase / Expense", items: [
    { title: "Purchase Requests", url: "/purchase-requests", icon: ClipboardList, module: "purchase-requests" },
    { title: "Purchases", url: "/purchases", icon: ShoppingBag, module: "purchases" },
    { title: "Suppliers", url: "/suppliers", icon: Store, module: "suppliers" },
    { title: "Expenses", url: "/expenses", icon: CreditCard, module: "expenses" },
  ]},
  { label: "Transfer / Damage", items: [
    { title: "Transfers", url: "/transfers", icon: ArrowLeftRight, module: "transfers" },
    { title: "Demand Lists", url: "/demands", icon: ClipboardList, module: "demands" },
    { title: "Waste", url: "/waste", icon: Trash2, module: "waste" },
  ]},
  { label: "Account / HR", items: [
    { title: "My Portal", url: "/my-portal", icon: UserCircle, module: "my-portal" },
    { title: "Users", url: "/users", icon: Users, module: "users" },
    { title: "Attendance", url: "/attendance", icon: Clock, module: "attendance" },
    { title: "Shifts & Schedule", url: "/shifts", icon: Timer, module: "attendance" },
  ]},
  { label: "Report", items: [
    { title: "Reports", url: "/reports", icon: FileText, module: "reports" },
    { title: "Send SMS", url: "/sms", icon: MessageSquare, module: "sms" },
  ]},
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { logout, hasPermission } = useAuth();

  const isActive = (url?: string) => {
    if (!url) return false;
    if (url === "/") return location.pathname === "/";
    return location.pathname.startsWith(url);
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border bg-card">
      <SidebarHeader className={cn("sticky top-0 z-20 bg-card border-b border-border", collapsed ? "justify-center px-2 py-5" : "px-4 py-5")}>
        <div className={cn("flex items-center gap-2", collapsed && "justify-center")}>
          <Flame className="h-7 w-7 text-primary shrink-0" />
          {!collapsed && <span className="text-xl font-bold text-primary tracking-tight">Ovenisto</span>}
        </div>
      </SidebarHeader>

      <SidebarContent className="overflow-y-auto">
        {navSections.map((section) => {
          const visibleItems = section.items.filter((item: any) => !item.module || hasPermission(item.module));
          if (visibleItems.length === 0) return null;
          return (
            <SidebarGroup key={section.label}>
              {!collapsed && <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">{section.label}</SidebarGroupLabel>}
              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleItems.map((item: any) =>
                    "children" in item && item.children ? (
                      <CollapsibleMenuItem key={item.title} item={item} collapsed={collapsed} isActive={isActive} />
                    ) : (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild className={cn(
                          "transition-all rounded-md",
                          isActive(item.url) && "bg-sidebar-accent text-sidebar-accent-foreground font-medium border-l-[3px] border-primary"
                        )}>
                          <Link to={item.url!}>
                            <item.icon className="h-4 w-4 shrink-0" />
                            {!collapsed && <span>{item.title}</span>}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="sticky bottom-0 z-20 bg-card border-t border-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={logout} className="text-destructive hover:bg-destructive/10 rounded-md">
              <LogOut className="h-4 w-4 shrink-0" />
              {!collapsed && <span>Logout</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function CollapsibleMenuItem({ item, collapsed, isActive }: { item: any; collapsed: boolean; isActive: (url?: string) => boolean }) {
  const { hasPermission } = useAuth();
  const visibleChildren = item.children?.filter((c: any) => !c.module || hasPermission(c.module)) || [];
  const hasActiveChild = visibleChildren.some((c: any) => isActive(c.url));
  const [open, setOpen] = useState(hasActiveChild);
  const Icon = item.icon;

  if (visibleChildren.length === 0) return null;

  if (collapsed) {
    return (
      <SidebarMenuItem>
        <HoverCard openDelay={100} closeDelay={200}>
          <HoverCardTrigger asChild>
            <SidebarMenuButton className={cn(hasActiveChild && "bg-sidebar-accent text-sidebar-accent-foreground")}>
              <Icon className="h-4 w-4 shrink-0" />
            </SidebarMenuButton>
          </HoverCardTrigger>
          <HoverCardContent side="right" align="start" className="w-48 p-1">
            <p className="text-xs font-semibold text-muted-foreground px-2 py-1">{item.title}</p>
            {visibleChildren.map((child: any) => (
              <Link
                key={child.title}
                to={child.url}
                className={cn(
                  "block px-2 py-1.5 text-sm rounded-md hover:bg-muted transition-colors",
                  isActive(child.url) && "bg-sidebar-accent text-primary font-medium"
                )}
              >
                {child.title}
              </Link>
            ))}
          </HoverCardContent>
        </HoverCard>
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton className={cn("justify-between", hasActiveChild && "text-primary font-medium")}>
            <span className="flex items-center gap-2">
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.title}</span>
            </span>
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {visibleChildren.map((child: any) => (
              <SidebarMenuSubItem key={child.title}>
                <SidebarMenuSubButton asChild className={cn(
                  isActive(child.url) && "bg-sidebar-accent text-primary font-medium"
                )}>
                  <Link to={child.url}>{child.title}</Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

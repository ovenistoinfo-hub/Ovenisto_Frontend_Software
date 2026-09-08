import type { LucideIcon } from "lucide-react";
import {
  Trophy, Wallet, Users, BarChart3, ChefHat, LayoutGrid, Ban, Package,
  ClipboardList, ArrowLeftRight, UserCheck, CalendarOff, Bike, CalendarCheck, Coins,
} from "lucide-react";

/**
 * Data-driven config for Dashboard.tsx's role-filtered tiles (Phase 2 of the
 * Dashboard/Analytics merge — docs/superpowers/plans/2026-09-07-dashboard-analytics-merge.md).
 *
 * `module` MUST equal the `module` the tile's destination route requires in App.tsx's
 * <ProtectedRoute> — otherwise the tile either hides for someone who could use it, or
 * shows for someone who bounces straight off ProtectedRoute's redirect.
 */
export interface DashboardTile {
  id: string;
  zone: "operations" | "sales" | "inventory" | "people" | "intelligence" | "delivery" | "reservations" | "cashHub";
  module: string;
  title: string;
  icon: LucideIcon;
  route: string;
  /** Chain-wide override for Super Admin, when the branch-level route isn't the right destination for them. */
  superAdminRoute?: { module: string; route: string };
}

// All zones populated as of Phase 4 — Sales & Finance (Phase 2), Customer Intelligence
// (Phase 3), and the six operational zones below.
export const DASHBOARD_TILES: DashboardTile[] = [
  { id: "top-items", zone: "sales", module: "reports", title: "Top 10 Items", icon: Trophy, route: "/reports" },
  { id: "payment-methods", zone: "sales", module: "cash-hub", title: "Payment Methods", icon: Wallet, route: "/cash-hub" },
  // Route is a sensible default ("view all customers"); the table's own rows navigate to
  // /customers/:id individually instead of the whole card sharing one destination.
  { id: "top-customers", zone: "intelligence", module: "customers", title: "Top 10 Customers", icon: Users, route: "/customers" },

  // Today's Operations
  { id: "live-orders", zone: "operations", module: "order-status", title: "Live Orders", icon: BarChart3, route: "/order-status" },
  { id: "kitchens-preparing", zone: "operations", module: "kitchens", title: "Kitchens", icon: ChefHat, route: "/kitchens" },
  { id: "tables", zone: "operations", module: "table-layout", title: "Tables", icon: LayoutGrid, route: "/table-layout" },
  { id: "cancellation-requests", zone: "operations", module: "cancellation-requests", title: "Cancellation Requests", icon: Ban, route: "/cancellation-requests" },

  // Inventory & Procurement
  // App.tsx gates /warehouses on "warehouses" for everyone, Super Admin included (not in
  // superAdminExcluded) — they see this tile too, just routed to the chain-wide dashboard.
  { id: "low-stock", zone: "inventory", module: "warehouses", title: "Low Stock Alert", icon: Package, route: "/warehouses", superAdminRoute: { module: "warehouse-dashboard", route: "/warehouse-dashboard" } },
  { id: "pending-purchase-requests", zone: "inventory", module: "purchase-requests", title: "Pending Purchase Requests", icon: ClipboardList, route: "/purchase-requests" },
  { id: "pending-demands", zone: "inventory", module: "demands", title: "Pending Demands", icon: ArrowLeftRight, route: "/demands" },

  // People
  { id: "attendance-today", zone: "people", module: "attendance", title: "Today's Attendance", icon: UserCheck, route: "/attendance" },
  { id: "pending-leave", zone: "people", module: "attendance", title: "Pending Leave Requests", icon: CalendarOff, route: "/attendance" },

  // Delivery — /delivery's <ProtectedRoute> gates on "sales", not "delivery" (no Dashboard
  // role holds a literal "delivery" permission); module here must match that route exactly.
  { id: "active-deliveries", zone: "delivery", module: "sales", title: "Active Deliveries", icon: Bike, route: "/delivery" },

  // Reservations
  { id: "reservations-today", zone: "reservations", module: "customers", title: "Today's Reservations", icon: CalendarCheck, route: "/reservations" },

  // Cash Hub
  { id: "unsettled-cash", zone: "cashHub", module: "cash-hub", title: "Unsettled Cash", icon: Coins, route: "/cash-hub" },
];

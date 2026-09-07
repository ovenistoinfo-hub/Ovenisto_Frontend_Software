import type { LucideIcon } from "lucide-react";
import { Trophy, Wallet } from "lucide-react";

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

// Only the Sales & Finance zone is populated this phase — later phases add the rest.
export const DASHBOARD_TILES: DashboardTile[] = [
  { id: "top-items", zone: "sales", module: "reports", title: "Top 10 Items", icon: Trophy, route: "/reports" },
  { id: "payment-methods", zone: "sales", module: "cash-hub", title: "Payment Methods", icon: Wallet, route: "/cash-hub" },
];

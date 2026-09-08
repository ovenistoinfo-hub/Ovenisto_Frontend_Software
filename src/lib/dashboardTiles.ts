/**
 * Data-driven config for Dashboard.tsx's role-filtered tiles (Dashboard/Analytics merge —
 * docs/superpowers/plans/2026-09-07-dashboard-analytics-merge.md).
 *
 * `module` MUST equal the `module` the tile's destination route requires in App.tsx's
 * <ProtectedRoute> — otherwise the tile either hides for someone who could use it, or
 * shows for someone who bounces straight off ProtectedRoute's redirect. The one deliberate
 * exception is where a zone is intentionally narrower than its route (see `active-deliveries`
 * and `reservations-today`).
 *
 * Icons are chosen in Dashboard.tsx at the render site, not carried here — this config is
 * purely about zone membership, permission gating, and navigation.
 */
export interface DashboardTile {
  id: string;
  zone: "operations" | "sales" | "inventory" | "people" | "intelligence" | "delivery" | "reservations" | "cashHub";
  module: string;
  title: string;
  route: string;
  /** Chain-wide override for Super Admin, when the branch-level route isn't the right destination for them. */
  superAdminRoute?: { module: string; route: string };
}

export const DASHBOARD_TILES: DashboardTile[] = [
  { id: "top-items", zone: "sales", module: "reports", title: "Top 10 Items", route: "/reports" },
  { id: "payment-methods", zone: "sales", module: "cash-hub", title: "Payment Methods", route: "/cash-hub" },
  // Route is a sensible default ("view all customers"); the table's own rows navigate to
  // /customers/:id individually instead of the whole card sharing one destination.
  { id: "top-customers", zone: "intelligence", module: "customers", title: "Top 10 Customers", route: "/customers" },

  // Today's Operations
  { id: "live-orders", zone: "operations", module: "order-status", title: "Live Orders", route: "/order-status" },
  { id: "kitchens-preparing", zone: "operations", module: "kitchens", title: "Kitchens", route: "/kitchens" },
  { id: "tables", zone: "operations", module: "table-layout", title: "Tables", route: "/table-layout" },
  { id: "cancellation-requests", zone: "operations", module: "cancellation-requests", title: "Cancellation Requests", route: "/cancellation-requests" },

  // Inventory & Procurement
  // App.tsx gates /warehouses on "warehouses" for everyone, Super Admin included (not in
  // superAdminExcluded) — they see this tile too, just routed to the chain-wide dashboard.
  { id: "low-stock", zone: "inventory", module: "warehouses", title: "Low Stock Alert", route: "/warehouses", superAdminRoute: { module: "warehouse-dashboard", route: "/warehouse-dashboard" } },
  { id: "pending-purchase-requests", zone: "inventory", module: "purchase-requests", title: "Pending Purchase Requests", route: "/purchase-requests" },
  { id: "pending-demands", zone: "inventory", module: "demands", title: "Pending Demands", route: "/demands" },

  // People
  { id: "attendance-today", zone: "people", module: "attendance", title: "Today's Attendance", route: "/attendance" },
  { id: "pending-leave", zone: "people", module: "attendance", title: "Pending Leave Requests", route: "/attendance" },

  // Delivery — deliberately gated on "delivery" (which only Admin/Super Admin hold among
  // Dashboard roles), NOT on /delivery's route module "sales". A branch Cashier/Manager/
  // Floor Manager has no delivery-dispatch role, so the whole zone stays chain-oversight
  // only. Every "delivery" holder that can reach the Dashboard also has "sales" (or "*"),
  // so navigation never bounces.
  { id: "active-deliveries", zone: "delivery", module: "delivery", title: "Active Deliveries", route: "/delivery" },

  // Reservations — gated on "reservations" (Floor Manager holds it; Cashier does not), not
  // on /reservations's route module "customers". Floor Manager also holds "customers", so
  // the click-through doesn't bounce.
  { id: "reservations-today", zone: "reservations", module: "reservations", title: "Today's Reservations", route: "/reservations" },

  // Cash Hub
  { id: "unsettled-cash", zone: "cashHub", module: "cash-hub", title: "Unsettled Cash", route: "/cash-hub" },
];

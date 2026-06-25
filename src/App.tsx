import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { OutletProvider } from "@/contexts/OutletContext";
import { DataProvider } from "@/contexts/DataContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Login stays eager — it's the first screen, so we don't want to lazy-load it.
import Login from "./pages/Login";

// All other pages are code-split (React.lazy) so the initial bundle is small and
// each page's JS downloads only when its route is first visited.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Analytics = lazy(() => import("./pages/Analytics"));
const POS = lazy(() => import("./pages/POS"));
const Kitchens = lazy(() => import("./pages/Kitchens"));
const KitchenPanel = lazy(() => import("./pages/KitchenPanel"));
const WaiterPanel = lazy(() => import("./pages/WaiterPanel"));
const Outlets = lazy(() => import("./pages/Outlets"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const IngredientUnits = lazy(() => import("./pages/items/IngredientUnits"));
const IngredientCategories = lazy(() => import("./pages/items/IngredientCategories"));
const Ingredients = lazy(() => import("./pages/items/Ingredients"));
const Modifiers = lazy(() => import("./pages/items/Modifiers"));
const MenuCategories = lazy(() => import("./pages/items/MenuCategories"));
const FoodMenu = lazy(() => import("./pages/items/FoodMenu"));
const FoodMenuForm = lazy(() => import("./pages/items/FoodMenuForm"));
const MealTypes = lazy(() => import("./pages/items/MealTypes"));
const PreMadeFood = lazy(() => import("./pages/items/PreMadeFood"));
const Warehouses = lazy(() => import("./pages/Warehouses"));
const KitchenStock = lazy(() => import("./pages/KitchenStock"));
const Production = lazy(() => import("./pages/Production"));
const StockAdjustments = lazy(() => import("./pages/stock/StockAdjustments"));
const Sales = lazy(() => import("./pages/Sales"));
const Customers = lazy(() => import("./pages/Customers"));
const CustomerDetail = lazy(() => import("./pages/CustomerDetail"));
const Purchases = lazy(() => import("./pages/Purchases"));
const PurchaseRequests = lazy(() => import("./pages/PurchaseRequests"));
const Suppliers = lazy(() => import("./pages/Suppliers"));
const Expenses = lazy(() => import("./pages/Expenses"));
const Transfers = lazy(() => import("./pages/Transfers"));
const Demands = lazy(() => import("./pages/Demands"));
const Waste = lazy(() => import("./pages/Waste"));
const Users = lazy(() => import("./pages/Users"));
const Attendance = lazy(() => import("./pages/Attendance"));
const Reports = lazy(() => import("./pages/Reports"));
const SMS = lazy(() => import("./pages/SMS"));
const Profile = lazy(() => import("./pages/Profile"));
const CustomerDisplay = lazy(() => import("./pages/CustomerDisplay"));
const OrderStatusBoard = lazy(() => import("./pages/OrderStatusBoard"));
const NotFound = lazy(() => import("./pages/NotFound"));

// New pages
const SelfOrder = lazy(() => import("./pages/SelfOrder"));
const Delivery = lazy(() => import("./pages/Delivery"));
const Shifts = lazy(() => import("./pages/Shifts"));
const OnlineOrders = lazy(() => import("./pages/OnlineOrders"));
const Reservations = lazy(() => import("./pages/Reservations"));
const TableLayout = lazy(() => import("./pages/TableLayout"));
const EmployeePortal = lazy(() => import("./pages/EmployeePortal"));
const RiderPortal = lazy(() => import("./pages/RiderPortal"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Serve cached data instantly on remount, revalidate in background.
      // This is what stops the blank "loading" flash on every navigation.
      staleTime: 60_000, // 1 min — repeat visits within this window are instant
      gcTime: 1000 * 60 * 60 * 24, // 24h — must be >= persister maxAge so cached
                                   // entries aren't GC'd before they can be persisted
      refetchOnWindowFocus: false, // don't refetch just because the tab regained focus
      retry: 1,
    },
  },
});

// Persist the react-query cache to localStorage so a PAGE REFRESH (F5) still paints
// instantly from the last-seen data, then revalidates in the background — instead of
// re-fetching everything from scratch. `buster` invalidates the whole persisted cache
// when bumped (e.g. after a breaking data-shape change).
const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: "ovenisto-rq-cache",
});

// Returns the default landing page for each role
function getDefaultRouteForRole(role?: string): string {
  switch (role) {
    case 'Waiter':           return '/waiter';
    case 'Kitchen Staff':    return '/kitchens';
    case 'Kitchen Manager':  return '/kitchens';
    case 'Cashier':          return '/pos';
    case 'Delivery Manager': return '/delivery';
    case 'Store Manager':    return '/warehouses';
    case 'Accountant':       return '/sales';
    case 'Rider':            return '/rider-portal';
    case 'Customer Screen':  return '/customer-display';
    default:                 return '/';
  }
}

function ProtectedRoute({ children, module }: { children: React.ReactNode; module?: string }) {
  const { isAuthenticated, hasPermission, user } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (module && !hasPermission(module)) {
    // Redirect to the user's role-appropriate default page instead of "/"
    const defaultRoute = getDefaultRouteForRole(user?.role);
    return <Navigate to={defaultRoute} replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  const { isAuthenticated, user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to={getDefaultRouteForRole(user?.role)} replace /> : <Login />} />
      {/* Standalone routes (no AppLayout) */}
      <Route path="/pos" element={<ProtectedRoute module="pos"><POS /></ProtectedRoute>} />
      <Route path="/kitchen-panel/:id" element={<ProtectedRoute module="kitchens"><KitchenPanel /></ProtectedRoute>} />
      <Route path="/customer-display" element={<ProtectedRoute module="customer-display"><CustomerDisplay /></ProtectedRoute>} />
      <Route path="/order-status" element={<ProtectedRoute module="order-status"><OrderStatusBoard /></ProtectedRoute>} />
      <Route path="/self-order" element={<SelfOrder />} />

      {/* AppLayout routes */}
      <Route path="/" element={<ProtectedRoute module="dashboard"><AppLayout><Dashboard /></AppLayout></ProtectedRoute>} />
      <Route path="/analytics" element={<ProtectedRoute module="analytics"><AppLayout><Analytics /></AppLayout></ProtectedRoute>} />
      <Route path="/kitchens" element={<ProtectedRoute module="kitchens"><AppLayout><Kitchens /></AppLayout></ProtectedRoute>} />
      <Route path="/waiter" element={<ProtectedRoute module="waiter"><AppLayout><WaiterPanel /></AppLayout></ProtectedRoute>} />
      <Route path="/table-layout" element={<ProtectedRoute module="settings"><AppLayout><TableLayout /></AppLayout></ProtectedRoute>} />
      <Route path="/outlets" element={<ProtectedRoute module="outlets"><AppLayout><Outlets /></AppLayout></ProtectedRoute>} />
      <Route path="/warehouses" element={<ProtectedRoute module="warehouses"><AppLayout><Warehouses /></AppLayout></ProtectedRoute>} />
      <Route path="/kitchen-stock" element={<ProtectedRoute module="kitchens"><AppLayout><KitchenStock /></AppLayout></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute module="settings"><AppLayout><SettingsPage /></AppLayout></ProtectedRoute>} />
      <Route path="/settings/*" element={<ProtectedRoute module="settings"><AppLayout><SettingsPage /></AppLayout></ProtectedRoute>} />
      <Route path="/items/ingredient-units" element={<ProtectedRoute module="items"><AppLayout><IngredientUnits /></AppLayout></ProtectedRoute>} />
      <Route path="/items/ingredient-categories" element={<ProtectedRoute module="items"><AppLayout><IngredientCategories /></AppLayout></ProtectedRoute>} />
      <Route path="/items/ingredients" element={<ProtectedRoute module="items"><AppLayout><Ingredients /></AppLayout></ProtectedRoute>} />
      <Route path="/items/modifiers" element={<ProtectedRoute module="items"><AppLayout><Modifiers /></AppLayout></ProtectedRoute>} />
      <Route path="/items/menu-categories" element={<ProtectedRoute module="items"><AppLayout><MenuCategories /></AppLayout></ProtectedRoute>} />
      <Route path="/items/meal-types" element={<ProtectedRoute module="items"><AppLayout><MealTypes /></AppLayout></ProtectedRoute>} />
      <Route path="/items/food-menu" element={<ProtectedRoute module="items"><AppLayout><FoodMenu /></AppLayout></ProtectedRoute>} />
      <Route path="/items/food-menu/add" element={<ProtectedRoute module="items"><AppLayout><FoodMenuForm /></AppLayout></ProtectedRoute>} />
      <Route path="/items/food-menu/edit/:id" element={<ProtectedRoute module="items"><AppLayout><FoodMenuForm /></AppLayout></ProtectedRoute>} />
      <Route path="/items/pre-made-food" element={<ProtectedRoute module="items"><AppLayout><PreMadeFood /></AppLayout></ProtectedRoute>} />
      <Route path="/production" element={<ProtectedRoute module="production"><AppLayout><Production /></AppLayout></ProtectedRoute>} />
      <Route path="/stock/adjustments" element={<ProtectedRoute module="stock"><AppLayout><StockAdjustments /></AppLayout></ProtectedRoute>} />
      <Route path="/sales" element={<ProtectedRoute module="sales"><AppLayout><Sales /></AppLayout></ProtectedRoute>} />
      <Route path="/customers" element={<ProtectedRoute module="customers"><AppLayout><Customers /></AppLayout></ProtectedRoute>} />
      <Route path="/customers/:id" element={<ProtectedRoute module="customers"><AppLayout><CustomerDetail /></AppLayout></ProtectedRoute>} />
      <Route path="/delivery" element={<ProtectedRoute module="sales"><AppLayout><Delivery /></AppLayout></ProtectedRoute>} />
      <Route path="/reservations" element={<ProtectedRoute module="customers"><AppLayout><Reservations /></AppLayout></ProtectedRoute>} />
      <Route path="/online-orders" element={<ProtectedRoute module="sales"><AppLayout><OnlineOrders /></AppLayout></ProtectedRoute>} />
      <Route path="/purchase-requests" element={<ProtectedRoute module="purchase-requests"><AppLayout><PurchaseRequests /></AppLayout></ProtectedRoute>} />
      <Route path="/purchases" element={<ProtectedRoute module="purchases"><AppLayout><Purchases /></AppLayout></ProtectedRoute>} />
      <Route path="/suppliers" element={<ProtectedRoute module="suppliers"><AppLayout><Suppliers /></AppLayout></ProtectedRoute>} />
      <Route path="/expenses" element={<ProtectedRoute module="expenses"><AppLayout><Expenses /></AppLayout></ProtectedRoute>} />
      <Route path="/transfers" element={<ProtectedRoute module="transfers"><AppLayout><Transfers /></AppLayout></ProtectedRoute>} />
      <Route path="/demands" element={<ProtectedRoute module="demands"><AppLayout><Demands /></AppLayout></ProtectedRoute>} />
      <Route path="/waste" element={<ProtectedRoute module="waste"><AppLayout><Waste /></AppLayout></ProtectedRoute>} />
      <Route path="/users" element={<ProtectedRoute module="users"><AppLayout><Users /></AppLayout></ProtectedRoute>} />
      <Route path="/attendance" element={<ProtectedRoute module="attendance"><AppLayout><Attendance /></AppLayout></ProtectedRoute>} />
      <Route path="/shifts" element={<ProtectedRoute module="attendance"><AppLayout><Shifts /></AppLayout></ProtectedRoute>} />
      <Route path="/rider-portal" element={<ProtectedRoute module="rider-portal"><AppLayout><RiderPortal /></AppLayout></ProtectedRoute>} />
      <Route path="/my-portal" element={<ProtectedRoute module="my-portal"><AppLayout><EmployeePortal /></AppLayout></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute module="reports"><AppLayout><Reports /></AppLayout></ProtectedRoute>} />
      <Route path="/sms" element={<ProtectedRoute module="sms"><AppLayout><SMS /></AppLayout></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><AppLayout><Profile /></AppLayout></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <PersistQueryClientProvider
    client={queryClient}
    persistOptions={{
      persister,
      maxAge: 1000 * 60 * 60 * 24, // discard persisted cache older than 24h
      buster: "v1", // bump this string to force-drop the persisted cache after a breaking change
    }}
  >
    <AuthProvider>
      <OutletProvider>
        <DataProvider>
          <TooltipProvider>
            <ErrorBoundary>
              <Toaster />
              <Sonner />
              <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <Suspense fallback={<div className="flex h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>}>
                  <AppRoutes />
                </Suspense>
              </BrowserRouter>
            </ErrorBoundary>
          </TooltipProvider>
        </DataProvider>
      </OutletProvider>
    </AuthProvider>
  </PersistQueryClientProvider>
);

export default App;

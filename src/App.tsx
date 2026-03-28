import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { DataProvider } from "@/contexts/DataContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Analytics from "./pages/Analytics";
import POS from "./pages/POS";
import Kitchens from "./pages/Kitchens";
import KitchenPanel from "./pages/KitchenPanel";
import WaiterPanel from "./pages/WaiterPanel";
import Outlets from "./pages/Outlets";
import SettingsPage from "./pages/Settings";
import IngredientUnits from "./pages/items/IngredientUnits";
import IngredientCategories from "./pages/items/IngredientCategories";
import Ingredients from "./pages/items/Ingredients";
import Modifiers from "./pages/items/Modifiers";
import MenuCategories from "./pages/items/MenuCategories";
import FoodMenu from "./pages/items/FoodMenu";
import FoodMenuForm from "./pages/items/FoodMenuForm";
import MealTypes from "./pages/items/MealTypes";
import PreMadeFood from "./pages/items/PreMadeFood";
import Warehouses from "./pages/Warehouses";
import KitchenStock from "./pages/KitchenStock";
import Production from "./pages/Production";
import StockAdjustments from "./pages/stock/StockAdjustments";
import Sales from "./pages/Sales";
import Customers from "./pages/Customers";
import CustomerDetail from "./pages/CustomerDetail";
import CustomerDues from "./pages/CustomerDues";
import Purchases from "./pages/Purchases";
import Suppliers from "./pages/Suppliers";
import SupplierDues from "./pages/SupplierDues";
import Expenses from "./pages/Expenses";
import Transfers from "./pages/Transfers";
import Demands from "./pages/Demands";
import Waste from "./pages/Waste";
import Users from "./pages/Users";
import Attendance from "./pages/Attendance";
import Reports from "./pages/Reports";
import SMS from "./pages/SMS";
import Profile from "./pages/Profile";
import CustomerDisplay from "./pages/CustomerDisplay";
import OrderStatusBoard from "./pages/OrderStatusBoard";
import NotFound from "./pages/NotFound";

// New pages
import SelfOrder from "./pages/SelfOrder";
import Deals from "./pages/Deals";
import Delivery from "./pages/Delivery";
import Loyalty from "./pages/Loyalty";
import Shifts from "./pages/Shifts";
import Coupons from "./pages/Coupons";
import OnlineOrders from "./pages/OnlineOrders";
import Reservations from "./pages/Reservations";
import TableLayout from "./pages/TableLayout";
import EmployeePortal from "./pages/EmployeePortal";
import RiderPortal from "./pages/RiderPortal";

const queryClient = new QueryClient();

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
    case 'Rider':            return '/my-portal';
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
      <Route path="/deals" element={<ProtectedRoute module="items"><AppLayout><Deals /></AppLayout></ProtectedRoute>} />
      <Route path="/production" element={<ProtectedRoute module="production"><AppLayout><Production /></AppLayout></ProtectedRoute>} />
      <Route path="/stock/adjustments" element={<ProtectedRoute module="stock"><AppLayout><StockAdjustments /></AppLayout></ProtectedRoute>} />
      <Route path="/sales" element={<ProtectedRoute module="sales"><AppLayout><Sales /></AppLayout></ProtectedRoute>} />
      <Route path="/customers" element={<ProtectedRoute module="customers"><AppLayout><Customers /></AppLayout></ProtectedRoute>} />
      <Route path="/customers/:id" element={<ProtectedRoute module="customers"><AppLayout><CustomerDetail /></AppLayout></ProtectedRoute>} />
      <Route path="/customer-dues" element={<ProtectedRoute module="customer-dues"><AppLayout><CustomerDues /></AppLayout></ProtectedRoute>} />
      <Route path="/delivery" element={<ProtectedRoute module="sales"><AppLayout><Delivery /></AppLayout></ProtectedRoute>} />
      <Route path="/loyalty" element={<ProtectedRoute module="customers"><AppLayout><Loyalty /></AppLayout></ProtectedRoute>} />
      <Route path="/coupons" element={<ProtectedRoute module="sales"><AppLayout><Coupons /></AppLayout></ProtectedRoute>} />
      <Route path="/reservations" element={<ProtectedRoute module="customers"><AppLayout><Reservations /></AppLayout></ProtectedRoute>} />
      <Route path="/online-orders" element={<ProtectedRoute module="sales"><AppLayout><OnlineOrders /></AppLayout></ProtectedRoute>} />
      <Route path="/purchases" element={<ProtectedRoute module="purchases"><AppLayout><Purchases /></AppLayout></ProtectedRoute>} />
      <Route path="/suppliers" element={<ProtectedRoute module="suppliers"><AppLayout><Suppliers /></AppLayout></ProtectedRoute>} />
      <Route path="/supplier-dues" element={<ProtectedRoute module="supplier-dues"><AppLayout><SupplierDues /></AppLayout></ProtectedRoute>} />
      <Route path="/expenses" element={<ProtectedRoute module="expenses"><AppLayout><Expenses /></AppLayout></ProtectedRoute>} />
      <Route path="/transfers" element={<ProtectedRoute module="transfers"><AppLayout><Transfers /></AppLayout></ProtectedRoute>} />
      <Route path="/demands" element={<ProtectedRoute module="demands"><AppLayout><Demands /></AppLayout></ProtectedRoute>} />
      <Route path="/waste" element={<ProtectedRoute module="waste"><AppLayout><Waste /></AppLayout></ProtectedRoute>} />
      <Route path="/users" element={<ProtectedRoute module="users"><AppLayout><Users /></AppLayout></ProtectedRoute>} />
      <Route path="/attendance" element={<ProtectedRoute module="attendance"><AppLayout><Attendance /></AppLayout></ProtectedRoute>} />
      <Route path="/shifts" element={<ProtectedRoute module="attendance"><AppLayout><Shifts /></AppLayout></ProtectedRoute>} />
      <Route path="/my-portal" element={<ProtectedRoute module="my-portal">{user?.role === 'Rider' ? <RiderPortal /> : <AppLayout><EmployeePortal /></AppLayout>}</ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute module="reports"><AppLayout><Reports /></AppLayout></ProtectedRoute>} />
      <Route path="/sms" element={<ProtectedRoute module="sms"><AppLayout><SMS /></AppLayout></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><AppLayout><Profile /></AppLayout></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <DataProvider>
        <TooltipProvider>
          <ErrorBoundary>
            <Toaster />
            <Sonner />
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <AppRoutes />
            </BrowserRouter>
          </ErrorBoundary>
        </TooltipProvider>
      </DataProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;

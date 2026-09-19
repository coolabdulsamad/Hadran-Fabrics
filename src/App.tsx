import { Navigate, Route, Routes } from "react-router";
import { Toaster } from "sonner";
import {
  ClipboardList,
  CreditCard,
  Factory,
  FileBarChart,
  PlusCircle,
  Users,
} from "lucide-react";

import LoginPage from "./pages/auth/LoginPage";
import DashboardPage from "./pages/dashboard/DashboardPage";
import SectionPickerPage from "./pages/sections/SectionPickerPage";
import LaundryHomePage from "./pages/laundry/LaundryHomePage";
import LaundryOrdersPage from "./pages/laundry/LaundryOrdersPage";
import LaundryNewOrderPage from "./pages/laundry/LaundryNewOrderPage";
import LaundryOrderDetailPage from "./pages/laundry/LaundryOrderDetailPage";
import LaundryPaymentsPage from "./pages/laundry/LaundryPaymentsPage";
import LaundryCustomersPage from "./pages/laundry/LaundryCustomersPage";
import LaundryReportsPage from "./pages/laundry/LaundryReportsPage";
import TailoringHomePage from "./pages/tailoring/TailoringHomePage";
import ExpensesPage from "./pages/expenses/ExpensesPage";
import MoneyPage from "./pages/money/MoneyPage";
import { ModulePlaceholder } from "./components/common/ModulePlaceholder";
import { NotFoundPage } from "./pages/errors/NotFoundPage";

// Phase 4 — Catalog & Inventory (live)
import ProductsPage from "./pages/products/ProductsPage";
import ProductDetailsPage from "./pages/products/ProductDetailsPage";
import ProductCreatePage from "./pages/products/ProductCreatePage";
import ProductEditPage from "./pages/products/ProductEditPage";
import CategoriesPage from "./pages/products/CategoriesPage";
import BarcodeLabelsPage from "./pages/products/BarcodeLabelsPage";
import InventoryOverviewPage from "./pages/inventory/InventoryOverviewPage";
import StockMovementsPage from "./pages/inventory/StockMovementsPage";
import StockAdjustmentsPage from "./pages/inventory/StockAdjustmentsPage";
import StockCountPage from "./pages/inventory/StockCountPage";
import LowStockPage from "./pages/inventory/LowStockPage";
import SuppliersPage from "./pages/inventory/SuppliersPage";
import PurchaseOrdersPage from "./pages/inventory/PurchaseOrdersPage";
import POSPage from "./pages/pos/POSPage";
import MySalesPage from "./pages/sales/MySalesPage";
import SalesHistoryPage from "./pages/sales/SalesHistoryPage";
import ReturnsPage from "./pages/returns/ReturnsPage";
import CustomersPage from "./pages/customers/CustomersPage";
import UsersPage from "./pages/users/UsersPage";
import PermissionsPage from "./pages/users/PermissionsPage";
import ApprovalsPage from "./pages/approvals/ApprovalsPage";
import ReportsPage from "./pages/reports/ReportsPage";
import ChatPage from "./pages/chat/ChatPage";
import AIAssistantPage from "./pages/ai/AIAssistantPage";
import AnalyticsPage from "./pages/reports/AnalyticsPage";
import SettingsPage from "./pages/settings/SettingsPage";
import AuditLogsPage from "./pages/settings/AuditLogsPage";
import ProfilePage from "./pages/profile/ProfilePage";

import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth, RequirePermission, RequireSection } from "@/components/layout/guards";
import { useAuth } from "@/hooks/use-auth";
import { landingRouteFor } from "@/store/section-store";
import { LoadingScreen } from "@/components/common/LoadingScreen";

/**
 * HADRAN FABRICS MALL — route map.
 * Built modules render their real pages; upcoming modules render an
 * honest phase placeholder (replaced as each phase ships).
 */

/** "/" → login when signed out, otherwise the role's landing route. */
function HomeRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen label="Restoring your session…" />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={landingRouteFor(user.role)} replace />;
}

export default function App() {
  return (
    <>
      <Toaster position="top-right" richColors closeButton />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<HomeRedirect />} />
        <Route
          path="/sections"
          element={
            <RequireAuth>
              <SectionPickerPage />
            </RequireAuth>
          }
        />

        {/* -------- Authenticated workspace -------- */}
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route
            path="/dashboard"
            element={
              <RequireSection section="SALES">
                <DashboardPage />
              </RequireSection>
            }
          />

          {/* ======== CATALOG — LIVE (Phase 4) ======== */}
          <Route
            path="/products"
            element={
              <RequirePermission permission="products.view">
                <ProductsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/products/new"
            element={
              <RequirePermission permission="products.create">
                <ProductCreatePage />
              </RequirePermission>
            }
          />
          <Route
            path="/products/categories"
            element={
              <RequirePermission permission="products.manage_categories">
                <CategoriesPage />
              </RequirePermission>
            }
          />
          <Route
            path="/products/barcodes"
            element={
              <RequirePermission permission="products.print_barcodes">
                <BarcodeLabelsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/products/:id"
            element={
              <RequirePermission permission="products.view">
                <ProductDetailsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/products/:id/edit"
            element={
              <RequirePermission permission="products.edit">
                <ProductEditPage />
              </RequirePermission>
            }
          />

          {/* ======== INVENTORY — LIVE (Phase 4) ======== */}
          <Route
            path="/inventory"
            element={
              <RequirePermission permission="inventory.view">
                <InventoryOverviewPage />
              </RequirePermission>
            }
          />
          <Route
            path="/inventory/movements"
            element={
              <RequirePermission permission="inventory.view">
                <StockMovementsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/inventory/adjustments"
            element={
              <RequirePermission permission="inventory.adjust">
                <StockAdjustmentsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/inventory/count"
            element={
              <RequirePermission permission="inventory.stock_count">
                <StockCountPage />
              </RequirePermission>
            }
          />
          <Route
            path="/inventory/low-stock"
            element={
              <RequirePermission permission="inventory.view">
                <LowStockPage />
              </RequirePermission>
            }
          />
          <Route
            path="/inventory/suppliers"
            element={
              <RequirePermission permission="inventory.manage_suppliers">
                <SuppliersPage />
              </RequirePermission>
            }
          />
          <Route
            path="/inventory/purchases"
            element={
              <RequirePermission permission="inventory.manage_purchases">
                <PurchaseOrdersPage />
              </RequirePermission>
            }
          />

          {/* POS — Phase 5 */}
          <Route
            path="/pos"
            element={
              <RequirePermission permission="pos.sell">
                <POSPage />
              </RequirePermission>
            }
          />

          {/* Sales — Phases 5 & 6 */}
          <Route
            path="/sales/my"
            element={
              <RequirePermission permission="sales.view_own_history">
                <MySalesPage />
              </RequirePermission>
            }
          />
          <Route
            path="/sales"
            element={
              <RequirePermission permission="sales.view_all_history">
                <SalesHistoryPage />
              </RequirePermission>
            }
          />
          <Route
            path="/returns"
            element={
              <RequirePermission permission="returns.view">
                <ReturnsPage />
              </RequirePermission>
            }
          />

          {/* Customers — Phase 6 */}
          <Route
            path="/customers"
            element={
              <RequirePermission permission="customers.view">
                <CustomersPage />
              </RequirePermission>
            }
          />

          {/* Staff & permissions — Phase 7 */}
          <Route
            path="/users/permissions"
            element={
              <RequirePermission permission="permissions.manage">
                <PermissionsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/users"
            element={
              <RequirePermission permission="users.view">
                <UsersPage />
              </RequirePermission>
            }
          />
          <Route
            path="/approvals"
            element={
              <RequirePermission anyOf={["approvals.request", "approvals.review"]}>
                <ApprovalsPage />
              </RequirePermission>
            }
          />

          {/* Insights — Phase 8 */}
          <Route
            path="/reports"
            element={
              <RequirePermission permission="reports.view">
                <ReportsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/analytics"
            element={
              <RequirePermission permission="analytics.view">
                <AnalyticsPage />
              </RequirePermission>
            }
          />

          {/* Chat & AI — Phase 9 */}
          <Route
            path="/chat"
            element={
              <RequirePermission permission="chat.use">
                <ChatPage />
              </RequirePermission>
            }
          />
          <Route
            path="/ai"
            element={
              <RequirePermission permission="ai.use">
                <AIAssistantPage />
              </RequirePermission>
            }
          />

          {/* Settings & audit — Phase 10 */}
          <Route
            path="/settings/audit-logs"
            element={
              <RequirePermission permission="audit.view">
                <AuditLogsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/settings"
            element={
              <RequirePermission anyOf={["settings.sales", "settings.hardware", "settings.system"]}>
                <SettingsPage />
              </RequirePermission>
            }
          />
          {/* ======== MONEY — LIVE (Phase 3) ======== */}
          <Route
            path="/expenses"
            element={
              <RequireSection section="SALES">
                <RequirePermission permission="expenses.view">
                  <ExpensesPage />
                </RequirePermission>
              </RequireSection>
            }
          />
          <Route
            path="/money"
            element={
              <RequireSection section="SALES">
                <RequirePermission permission="money.view">
                  <MoneyPage />
                </RequirePermission>
              </RequireSection>
            }
          />

          {/* ======== LAUNDRY SECTION — Phase 4 live ======== */}
          <Route
            path="/laundry"
            element={
              <RequireSection section="LAUNDRY">
                <RequirePermission permission="laundry.view">
                  <LaundryHomePage />
                </RequirePermission>
              </RequireSection>
            }
          />
          <Route
            path="/laundry/orders/new"
            element={
              <RequireSection section="LAUNDRY">
                <RequirePermission permission="laundry.manage">
                  <LaundryNewOrderPage />
                </RequirePermission>
              </RequireSection>
            }
          />
          <Route
            path="/laundry/orders"
            element={
              <RequireSection section="LAUNDRY">
                <RequirePermission permission="laundry.view">
                  <LaundryOrdersPage />
                </RequirePermission>
              </RequireSection>
            }
          />
          <Route
            path="/laundry/orders/:id"
            element={
              <RequireSection section="LAUNDRY">
                <RequirePermission permission="laundry.view">
                  <LaundryOrderDetailPage />
                </RequirePermission>
              </RequireSection>
            }
          />
          <Route
            path="/laundry/payments"
            element={
              <RequireSection section="LAUNDRY">
                <RequirePermission permission="laundry.view">
                  <LaundryPaymentsPage />
                </RequirePermission>
              </RequireSection>
            }
          />
          <Route
            path="/laundry/customers"
            element={
              <RequireSection section="LAUNDRY">
                <RequirePermission permission="laundry.view">
                  <LaundryCustomersPage />
                </RequirePermission>
              </RequireSection>
            }
          />
          <Route
            path="/laundry/reports"
            element={
              <RequireSection section="LAUNDRY">
                <RequirePermission permission="laundry.view">
                  <LaundryReportsPage />
                </RequirePermission>
              </RequireSection>
            }
          />

          {/* ======== TAILORING SECTION — home live, modules in Phase 5 ======== */}
          <Route
            path="/tailoring"
            element={
              <RequireSection section="TAILORING">
                <RequirePermission permission="tailoring.view">
                  <TailoringHomePage />
                </RequirePermission>
              </RequireSection>
            }
          />
          <Route
            path="/tailoring/orders/new"
            element={
              <RequireSection section="TAILORING">
                <RequirePermission permission="tailoring.manage">
                  <ModulePlaceholder title="New Tailoring Order" phase={5} icon={PlusCircle} backTo="/tailoring" backLabel="Back to Tailoring Home" description="Capture the style, fabric source (customer's own or shop stock), full body measurements and the agreed price." />
                </RequirePermission>
              </RequireSection>
            }
          />
          <Route
            path="/tailoring/orders"
            element={
              <RequireSection section="TAILORING">
                <RequirePermission permission="tailoring.view">
                  <ModulePlaceholder title="Tailoring Orders" phase={5} icon={ClipboardList} backTo="/tailoring" backLabel="Back to Tailoring Home" description="Track each garment from received → cutting → sewing → finishing → fitting → ready → delivered, assigned to a tailor." />
                </RequirePermission>
              </RequireSection>
            }
          />
          <Route
            path="/tailoring/production"
            element={
              <RequireSection section="TAILORING">
                <RequirePermission permission="production.view">
                  <ModulePlaceholder title="In-House Production" phase={5} icon={Factory} backTo="/tailoring" backLabel="Back to Tailoring Home" description="Consume shop materials to produce finished items that become new sellable products — stock adjusts automatically." />
                </RequirePermission>
              </RequireSection>
            }
          />
          <Route
            path="/tailoring/payments"
            element={
              <RequireSection section="TAILORING">
                <RequirePermission permission="tailoring.view">
                  <ModulePlaceholder title="Tailoring Payments" phase={5} icon={CreditCard} backTo="/tailoring" backLabel="Back to Tailoring Home" description="Deposits, balance collections and receipts for tailoring orders — fully tied into the money ledger." />
                </RequirePermission>
              </RequireSection>
            }
          />
          <Route
            path="/tailoring/customers"
            element={
              <RequireSection section="TAILORING">
                <RequirePermission permission="tailoring.view">
                  <ModulePlaceholder title="Tailoring Customers" phase={5} icon={Users} backTo="/tailoring" backLabel="Back to Tailoring Home" description="Tailoring customer records, saved measurement profiles and full order history per customer." />
                </RequirePermission>
              </RequireSection>
            }
          />
          <Route
            path="/tailoring/reports"
            element={
              <RequireSection section="TAILORING">
                <RequirePermission permission="tailoring.view">
                  <ModulePlaceholder title="Tailoring Reports" phase={5} icon={FileBarChart} backTo="/tailoring" backLabel="Back to Tailoring Home" description="Section reports: orders by status, tailor performance, revenue, delivery punctuality and more — with export." />
                </RequirePermission>
              </RequireSection>
            }
          />

          <Route path="/profile" element={<ProfilePage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}

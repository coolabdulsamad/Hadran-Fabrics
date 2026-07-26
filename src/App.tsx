import { Navigate, Route, Routes } from "react-router";
import { Toaster } from "sonner";

import LoginPage from "./pages/auth/LoginPage";
import DashboardPage from "./pages/dashboard/DashboardPage";
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
import { RequireAuth, RequirePermission } from "@/components/layout/guards";

/**
 * HADRAN FABRICS MALL — route map.
 * Built modules render their real pages; upcoming modules render an
 * honest phase placeholder (replaced as each phase ships).
 */
export default function App() {
  return (
    <>
      <Toaster position="top-right" richColors closeButton />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        {/* -------- Authenticated workspace -------- */}
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />

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
          <Route path="/profile" element={<ProfilePage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}

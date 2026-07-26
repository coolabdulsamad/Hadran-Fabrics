#!/usr/bin/env bash
# ==============================================================
# HADRAN FABRICS MALL — Management Suite
# Project Schema Generator (Phase 1)
# Run from the project ROOT:  bash scripts/create-schema.sh
# Creates every module folder + placeholder file for the app.
# Placeholders are filled phase-by-phase with full code.
# ==============================================================
set -e

echo "==> Creating Hadran Fabrics Mall project schema..."

# ----------------------------- FRONTEND -----------------------------
mkdir -p src/assets
mkdir -p src/config
mkdir -p src/components/layout
mkdir -p src/components/common
mkdir -p src/components/pos
mkdir -p src/components/inventory
mkdir -p src/components/chat
mkdir -p src/components/ai
mkdir -p src/components/settings
mkdir -p src/pages/auth
mkdir -p src/pages/dashboard
mkdir -p src/pages/pos
mkdir -p src/pages/sales
mkdir -p src/pages/products
mkdir -p src/pages/inventory
mkdir -p src/pages/customers
mkdir -p src/pages/returns
mkdir -p src/pages/reports
mkdir -p src/pages/analytics
mkdir -p src/pages/users
mkdir -p src/pages/approvals
mkdir -p src/pages/chat
mkdir -p src/pages/ai
mkdir -p src/pages/settings
mkdir -p src/pages/errors
mkdir -p src/store

FILES=(
  # ---------- config ----------
  "src/config/navigation.ts"
  "src/config/permissions.ts"
  "src/config/constants.ts"

  # ---------- layout components ----------
  "src/components/layout/AppShell.tsx"
  "src/components/layout/Sidebar.tsx"
  "src/components/layout/Topbar.tsx"
  "src/components/layout/PageHeader.tsx"
  "src/components/layout/Breadcrumbs.tsx"
  "src/components/layout/NotificationBell.tsx"
  "src/components/layout/UserMenu.tsx"

  # ---------- shared/common components ----------
  "src/components/common/DataTable.tsx"
  "src/components/common/StatCard.tsx"
  "src/components/common/ConfirmDialog.tsx"
  "src/components/common/EmptyState.tsx"
  "src/components/common/LoadingScreen.tsx"
  "src/components/common/ErrorState.tsx"
  "src/components/common/RoleBadge.tsx"
  "src/components/common/StatusBadge.tsx"
  "src/components/common/CurrencyText.tsx"
  "src/components/common/SearchInput.tsx"
  "src/components/common/FilterBar.tsx"
  "src/components/common/ExportButton.tsx"
  "src/components/common/FormSection.tsx"

  # ---------- POS (point of sale) components ----------
  "src/components/pos/ProductSearchPanel.tsx"
  "src/components/pos/CartPanel.tsx"
  "src/components/pos/CartItemRow.tsx"
  "src/components/pos/PaymentDialog.tsx"
  "src/components/pos/ReceiptPreview.tsx"
  "src/components/pos/ReceiptDocument.tsx"
  "src/components/pos/HoldSaleDialog.tsx"
  "src/components/pos/HeldSalesDrawer.tsx"
  "src/components/pos/CustomerPickerDialog.tsx"
  "src/components/pos/DiscountDialog.tsx"
  "src/components/pos/MeasurementInput.tsx"
  "src/components/pos/ScannerStatus.tsx"

  # ---------- inventory / product components ----------
  "src/components/inventory/ProductForm.tsx"
  "src/components/inventory/ProductDetailsDrawer.tsx"
  "src/components/inventory/CategoryManager.tsx"
  "src/components/inventory/StockMovementForm.tsx"
  "src/components/inventory/StockAdjustmentForm.tsx"
  "src/components/inventory/StockCountSheet.tsx"
  "src/components/inventory/SupplierForm.tsx"
  "src/components/inventory/PurchaseOrderForm.tsx"
  "src/components/inventory/BarcodeLabelPreview.tsx"
  "src/components/inventory/LowStockTable.tsx"

  # ---------- chat components ----------
  "src/components/chat/ChatSidebar.tsx"
  "src/components/chat/ChatWindow.tsx"
  "src/components/chat/MessageBubble.tsx"
  "src/components/chat/MessageComposer.tsx"
  "src/components/chat/AttachmentPreview.tsx"
  "src/components/chat/EntityReferencePicker.tsx"
  "src/components/chat/EntityReferenceCard.tsx"

  # ---------- AI assistant components ----------
  "src/components/ai/AIChatPanel.tsx"
  "src/components/ai/AIReportCard.tsx"

  # ---------- settings components ----------
  "src/components/settings/TaxSettingsForm.tsx"
  "src/components/settings/DiscountSettingsForm.tsx"
  "src/components/settings/ReceiptSettingsForm.tsx"
  "src/components/settings/HardwareSettingsForm.tsx"
  "src/components/settings/PermissionMatrix.tsx"

  # ---------- pages: auth ----------
  "src/pages/auth/LoginPage.tsx"
  "src/pages/auth/ForgotPasswordPage.tsx"

  # ---------- pages: dashboard ----------
  "src/pages/dashboard/DashboardPage.tsx"

  # ---------- pages: POS ----------
  "src/pages/pos/POSPage.tsx"

  # ---------- pages: sales ----------
  "src/pages/sales/SalesHistoryPage.tsx"
  "src/pages/sales/SaleDetailsPage.tsx"
  "src/pages/sales/MySalesPage.tsx"

  # ---------- pages: products ----------
  "src/pages/products/ProductsPage.tsx"
  "src/pages/products/ProductDetailsPage.tsx"
  "src/pages/products/ProductCreatePage.tsx"
  "src/pages/products/ProductEditPage.tsx"
  "src/pages/products/CategoriesPage.tsx"
  "src/pages/products/BarcodeLabelsPage.tsx"

  # ---------- pages: inventory ----------
  "src/pages/inventory/InventoryOverviewPage.tsx"
  "src/pages/inventory/StockMovementsPage.tsx"
  "src/pages/inventory/StockAdjustmentsPage.tsx"
  "src/pages/inventory/StockCountPage.tsx"
  "src/pages/inventory/LowStockPage.tsx"
  "src/pages/inventory/SuppliersPage.tsx"
  "src/pages/inventory/PurchaseOrdersPage.tsx"

  # ---------- pages: customers ----------
  "src/pages/customers/CustomersPage.tsx"
  "src/pages/customers/CustomerDetailsPage.tsx"
  "src/pages/customers/CustomerFormPage.tsx"

  # ---------- pages: returns & exchanges ----------
  "src/pages/returns/ReturnsPage.tsx"
  "src/pages/returns/ReturnCreatePage.tsx"
  "src/pages/returns/ExchangesPage.tsx"

  # ---------- pages: reports ----------
  "src/pages/reports/ReportsHubPage.tsx"
  "src/pages/reports/SalesReportPage.tsx"
  "src/pages/reports/InventoryReportPage.tsx"
  "src/pages/reports/FinancialReportPage.tsx"
  "src/pages/reports/StaffPerformancePage.tsx"

  # ---------- pages: analytics ----------
  "src/pages/analytics/AnalyticsPage.tsx"

  # ---------- pages: users & permissions ----------
  "src/pages/users/UsersPage.tsx"
  "src/pages/users/UserDetailsPage.tsx"
  "src/pages/users/UserFormPage.tsx"
  "src/pages/users/RolesPermissionsPage.tsx"

  # ---------- pages: approvals ----------
  "src/pages/approvals/ApprovalsPage.tsx"

  # ---------- pages: chat ----------
  "src/pages/chat/ChatPage.tsx"

  # ---------- pages: AI ----------
  "src/pages/ai/AIAssistantPage.tsx"

  # ---------- pages: settings ----------
  "src/pages/settings/SettingsHubPage.tsx"
  "src/pages/settings/SalesSettingsPage.tsx"
  "src/pages/settings/HardwareSettingsPage.tsx"
  "src/pages/settings/ReceiptSettingsPage.tsx"
  "src/pages/settings/SystemSettingsPage.tsx"
  "src/pages/settings/AuditLogsPage.tsx"
  "src/pages/settings/ProfilePage.tsx"

  # ---------- pages: errors ----------
  "src/pages/errors/NotFoundPage.tsx"
  "src/pages/errors/ForbiddenPage.tsx"

  # ---------- providers ----------
  "src/providers/auth-provider.tsx"
  "src/providers/theme-provider.tsx"

  # ---------- hooks ----------
  "src/hooks/use-auth.ts"
  "src/hooks/use-permissions.ts"
  "src/hooks/use-cart.ts"
  "src/hooks/use-debounce.ts"
  "src/hooks/use-barcode-scanner.ts"
  "src/hooks/use-printer.ts"
  "src/hooks/use-hotkeys.ts"

  # ---------- client stores (zustand) ----------
  "src/store/auth-store.ts"
  "src/store/cart-store.ts"
  "src/store/ui-store.ts"

  # ---------- lib utilities ----------
  "src/lib/format.ts"
  "src/lib/receipt.ts"
  "src/lib/export.ts"
  "src/lib/barcode.ts"

  # ---------- types ----------
  "src/types/index.ts"
  "src/types/entities.ts"
  "src/types/forms.ts"

  # ----------------------------- BACKEND -----------------------------
  "api/routers/auth.router.ts"
  "api/routers/users.router.ts"
  "api/routers/roles.router.ts"
  "api/routers/products.router.ts"
  "api/routers/categories.router.ts"
  "api/routers/inventory.router.ts"
  "api/routers/suppliers.router.ts"
  "api/routers/purchases.router.ts"
  "api/routers/sales.router.ts"
  "api/routers/returns.router.ts"
  "api/routers/customers.router.ts"
  "api/routers/reports.router.ts"
  "api/routers/analytics.router.ts"
  "api/routers/dashboard.router.ts"
  "api/routers/chat.router.ts"
  "api/routers/ai.router.ts"
  "api/routers/settings.router.ts"
  "api/routers/approvals.router.ts"
  "api/routers/audit.router.ts"

  # ---------- backend services ----------
  "api/services/auth.service.ts"
  "api/services/audit.service.ts"
  "api/services/sales.service.ts"
  "api/services/inventory.service.ts"
  "api/services/approvals.service.ts"
  "api/services/ai.service.ts"
  "api/services/chat.service.ts"
  "api/services/receipt.service.ts"

  # ----------------------------- DB SEEDS -----------------------------
  "db/seeds/roles.seed.ts"
  "db/seeds/users.seed.ts"
  "db/seeds/categories.seed.ts"
  "db/seeds/products.seed.ts"
  "db/seeds/settings.seed.ts"

  # ----------------------------- CONTRACTS -----------------------------
  "contracts/roles.ts"
  "contracts/permissions.ts"
  "contracts/constants.ts"
  "contracts/pos.ts"
  "contracts/receipts.ts"
)

mkdir -p api/routers api/services db/seeds

count=0
for f in "${FILES[@]}"; do
  if [ ! -f "$f" ]; then
    printf '// HADRAN FABRICS MALL — placeholder (code arrives in its build phase)\nexport {}\n' > "$f"
    count=$((count + 1))
  fi
done

touch src/assets/.gitkeep

echo "==> Done. $count placeholder files created."
echo "==> Structure ready. Next: Phase 2 — database schema (db/schema.ts)."

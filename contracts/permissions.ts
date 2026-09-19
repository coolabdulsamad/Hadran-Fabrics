import type { UserRole } from "./roles";

/**
 * HADRAN FABRICS MALL — Permission catalog (shared frontend ↔ backend)
 * Every gated action in the app maps to one of these keys.
 * Admins toggle them per role; per-user overrides live in user_permissions.
 */
export interface PermissionDef {
  key: string;
  label: string;
  group: string;
  description: string;
}

export const PERMISSIONS: PermissionDef[] = [
  // ---- POS / SELLING ----
  { key: "pos.sell", label: "Make sales", group: "POS Terminal", description: "Access the POS terminal and complete sales." },
  { key: "pos.hold_sale", label: "Hold & resume sales", group: "POS Terminal", description: "Park a sale and resume it later." },
  { key: "pos.apply_item_discount", label: "Item discounts", group: "POS Terminal", description: "Discount a single cart line." },
  { key: "pos.apply_cart_discount", label: "Cart discounts", group: "POS Terminal", description: "Discount the whole sale." },
  { key: "pos.override_price", label: "Override prices", group: "POS Terminal", description: "Manually change a product's selling price at the till." },
  { key: "pos.attach_customer", label: "Attach special customers", group: "POS Terminal", description: "Link a registered customer (with their discount) to a sale." },
  { key: "pos.reprint_receipt", label: "Reprint receipts", group: "POS Terminal", description: "Reprint a receipt from sales history." },

  // ---- SALES HISTORY ----
  { key: "sales.view_own_history", label: "Own sales history", group: "Sales", description: "View only sales made by yourself." },
  { key: "sales.view_all_history", label: "All sales history", group: "Sales", description: "View every staff member's sales." },
  { key: "sales.view_details", label: "Sale details", group: "Sales", description: "Open the full details of a sale." },
  { key: "sales.void", label: "Void sales", group: "Sales", description: "Cancel/void a completed sale (stock is restored)." },

  // ---- PRODUCTS ----
  { key: "products.view", label: "View products", group: "Products", description: "Browse the product catalog and details." },
  { key: "products.create", label: "Add products", group: "Products", description: "Create new products (may require approval)." },
  { key: "products.edit", label: "Edit products", group: "Products", description: "Modify product details (may require approval)." },
  { key: "products.delete", label: "Delete products", group: "Products", description: "Archive/delete products (requires approval)." },
  { key: "products.manage_categories", label: "Manage categories", group: "Products", description: "Create/edit product categories." },
  { key: "products.print_barcodes", label: "Print barcode labels", group: "Products", description: "Generate and print shelf/pack barcode labels." },

  // ---- INVENTORY ----
  { key: "inventory.view", label: "View inventory", group: "Inventory", description: "View stock levels and movement history." },
  { key: "inventory.stock_in", label: "Record stock-in", group: "Inventory", description: "Receive stock into inventory." },
  { key: "inventory.stock_out", label: "Record stock-out", group: "Inventory", description: "Record stock leaving (damage, transfer, manual out)." },
  { key: "inventory.adjust", label: "Stock adjustments", group: "Inventory", description: "Correct stock balances (may require approval)." },
  { key: "inventory.stock_count", label: "Stock counts", group: "Inventory", description: "Run physical stock-taking sessions." },
  { key: "inventory.manage_suppliers", label: "Manage suppliers", group: "Inventory", description: "Create/edit supplier records." },
  { key: "inventory.manage_purchases", label: "Manage purchases", group: "Inventory", description: "Create and receive purchase orders." },

  // ---- CUSTOMERS ----
  { key: "customers.view", label: "View customers", group: "Customers", description: "View special customer records." },
  { key: "customers.manage", label: "Manage customers", group: "Customers", description: "Create and edit customer profiles." },
  { key: "customers.manage_discounts", label: "Customer discounts", group: "Customers", description: "Set per-customer discount rates." },

  // ---- RETURNS & EXCHANGES ----
  { key: "returns.view", label: "View returns", group: "Returns & Exchanges", description: "View return/exchange records." },
  { key: "returns.process", label: "Process returns/exchanges", group: "Returns & Exchanges", description: "Accept customer returns and exchanges, restock items." },

  // ---- REPORTS & ANALYTICS ----
  { key: "reports.view", label: "View reports", group: "Reports & Analytics", description: "Access sales, inventory and financial reports." },
  { key: "reports.export", label: "Export reports", group: "Reports & Analytics", description: "Download reports as CSV." },
  { key: "analytics.view", label: "View analytics", group: "Reports & Analytics", description: "Access the analytics dashboards and charts." },

  // ---- USERS & ACCESS ----
  { key: "users.view", label: "View staff", group: "Users & Access", description: "View staff accounts." },
  { key: "users.manage", label: "Manage staff", group: "Users & Access", description: "Create, edit and suspend staff accounts." },
  { key: "permissions.manage", label: "Manage permissions", group: "Users & Access", description: "Change what each role/user is allowed to do." },

  // ---- APPROVALS ----
  { key: "approvals.request", label: "Submit approval requests", group: "Approvals", description: "Send actions to Admin/Super Admin for approval." },
  { key: "approvals.review", label: "Review approvals", group: "Approvals", description: "Approve or reject pending requests." },

  // ---- CHAT & AI ----
  { key: "chat.use", label: "Team chat", group: "Chat & AI", description: "Send messages, attachments and references." },
  { key: "ai.use", label: "AI assistant", group: "Chat & AI", description: "Ask the AI questions about store data and generate analysis." },

  // ---- SETTINGS & AUDIT ----
  { key: "settings.sales", label: "Sales settings", group: "Settings", description: "Configure tax, service charge and discount limits." },
  { key: "settings.hardware", label: "Hardware settings", group: "Settings", description: "Configure receipt printer and barcode scanner." },
  { key: "settings.system", label: "System settings", group: "Settings", description: "Core system configuration (Super Admin)." },
  { key: "audit.view", label: "View audit logs", group: "Settings", description: "Inspect the full activity audit trail." },

  // ---- EXPENSES & MONEY ----
  { key: "expenses.view", label: "View expenses", group: "Expenses & Money", description: "View expense records." },
  { key: "expenses.record", label: "Record expenses", group: "Expenses & Money", description: "Record a new expense (may require approval)." },
  { key: "expenses.void", label: "Void expenses", group: "Expenses & Money", description: "Void an incorrectly recorded expense." },
  { key: "money.view", label: "Money in/out", group: "Expenses & Money", description: "View the money in / money out ledger and balances." },
  { key: "money.manage", label: "Manual money entries", group: "Expenses & Money", description: "Record manual money in/out entries (owner cash, bank deposits)." },

  // ---- LAUNDRY ----
  { key: "laundry.view", label: "View laundry", group: "Laundry", description: "View laundry orders and records." },
  { key: "laundry.manage", label: "Manage laundry orders", group: "Laundry", description: "Create orders, add garments, take payments." },
  { key: "laundry.advance_status", label: "Move workflow", group: "Laundry", description: "Move orders through washing → ready → collected." },
  { key: "laundry.cancel", label: "Cancel laundry orders", group: "Laundry", description: "Cancel a laundry order." },

  // ---- TAILORING ----
  { key: "tailoring.view", label: "View tailoring", group: "Tailoring", description: "View tailoring orders and records." },
  { key: "tailoring.manage", label: "Manage tailoring orders", group: "Tailoring", description: "Create orders, record measurements, take payments." },
  { key: "tailoring.advance_status", label: "Move workflow", group: "Tailoring", description: "Move orders through cutting → sewing → delivered." },
  { key: "tailoring.cancel", label: "Cancel tailoring orders", group: "Tailoring", description: "Cancel a tailoring order." },

  // ---- PRODUCTION (materials → new products) ----
  { key: "production.view", label: "View production", group: "Production", description: "View in-house production runs." },
  { key: "production.manage", label: "Run production", group: "Production", description: "Create and complete production runs (consumes stock, may require approval)." },

  // ---- BRANCHES & TRANSFERS ----
  { key: "branches.view", label: "View branches", group: "Branches", description: "View branch list and branch-scoped data." },
  { key: "branches.manage", label: "Manage branches", group: "Branches", description: "Register and configure branches." },
  { key: "branches.switch", label: "Switch branches", group: "Branches", description: "Work inside other branches after login." },
  { key: "transfers.view", label: "View transfers", group: "Branches", description: "View inter-branch stock transfers." },
  { key: "transfers.manage", label: "Manage transfers", group: "Branches", description: "Create, send and receive stock transfers (may require approval)." },

  // ---- GENERAL (cross-section) REPORTS ----
  { key: "reports.general", label: "General reports", group: "Reports & Analytics", description: "Cross-section and cross-branch reports & analytics." },
];

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

/** Default permission set granted to each role (seeded into role_permissions). */
export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  LAUNDRY: [
    "laundry.view",
    "laundry.manage",
    "laundry.advance_status",
    "expenses.view",
    "expenses.record",
    "chat.use",
  ],
  TAILORING: [
    "tailoring.view",
    "tailoring.manage",
    "tailoring.advance_status",
    "production.view",
    "expenses.view",
    "expenses.record",
    "products.view",
    "chat.use",
  ],
  SALES: [
    "pos.sell",
    "pos.hold_sale",
    "pos.apply_item_discount",
    "pos.attach_customer",
    "pos.reprint_receipt",
    "sales.view_own_history",
    "sales.view_details",
    "products.view",
    "customers.view",
    "chat.use",
  ],
  MANAGER: [
    // everything SALES has, plus:
    "pos.sell",
    "pos.hold_sale",
    "pos.apply_item_discount",
    "pos.apply_cart_discount",
    "pos.attach_customer",
    "pos.reprint_receipt",
    "sales.view_own_history",
    "sales.view_all_history",
    "sales.view_details",
    "sales.void",
    "products.view",
    "products.create",
    "products.edit",
    "products.manage_categories",
    "products.print_barcodes",
    "inventory.view",
    "inventory.stock_in",
    "inventory.stock_out",
    "inventory.adjust",
    "inventory.stock_count",
    "inventory.manage_suppliers",
    "inventory.manage_purchases",
    "customers.view",
    "customers.manage",
    "returns.view",
    "returns.process",
    "reports.view",
    "reports.export",
    "analytics.view",
    "users.view",
    "approvals.request",
    "chat.use",
    "ai.use",
    "expenses.view",
    "expenses.record",
    "money.view",
    "money.manage",
    "laundry.view",
    "laundry.manage",
    "laundry.advance_status",
    "tailoring.view",
    "tailoring.manage",
    "tailoring.advance_status",
    "production.view",
    "production.manage",
    "branches.view",
    "branches.switch",
    "transfers.view",
    "transfers.manage",
  ],
  ADMIN: [
    // everything MANAGER has, plus:
    "pos.sell",
    "pos.hold_sale",
    "pos.apply_item_discount",
    "pos.apply_cart_discount",
    "pos.override_price",
    "pos.attach_customer",
    "pos.reprint_receipt",
    "sales.view_own_history",
    "sales.view_all_history",
    "sales.view_details",
    "sales.void",
    "products.view",
    "products.create",
    "products.edit",
    "products.delete",
    "products.manage_categories",
    "products.print_barcodes",
    "inventory.view",
    "inventory.stock_in",
    "inventory.stock_out",
    "inventory.adjust",
    "inventory.stock_count",
    "inventory.manage_suppliers",
    "inventory.manage_purchases",
    "customers.view",
    "customers.manage",
    "customers.manage_discounts",
    "returns.view",
    "returns.process",
    "reports.view",
    "reports.export",
    "analytics.view",
    "users.view",
    "users.manage",
    "permissions.manage",
    "approvals.request",
    "approvals.review",
    "chat.use",
    "ai.use",
    "settings.sales",
    "settings.hardware",
    "audit.view",
    "expenses.view",
    "expenses.record",
    "expenses.void",
    "money.view",
    "money.manage",
    "laundry.view",
    "laundry.manage",
    "laundry.advance_status",
    "laundry.cancel",
    "tailoring.view",
    "tailoring.manage",
    "tailoring.advance_status",
    "tailoring.cancel",
    "production.view",
    "production.manage",
    "branches.view",
    "branches.manage",
    "branches.switch",
    "transfers.view",
    "transfers.manage",
    "reports.general",
  ],
  SUPER_ADMIN: PERMISSION_KEYS, // developer-level: everything
};

/**
 * Manager actions that must go through an Admin/Super-Admin approval
 * before they take effect (workflow gate).
 */
export const APPROVAL_GATED_PERMISSIONS = [
  "products.create",
  "products.edit",
  "products.delete",
  "inventory.adjust",
  "sales.void",
  "expenses.record",
  "transfers.manage",
  "production.manage",
] as const;

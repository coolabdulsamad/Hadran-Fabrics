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
];

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

/** Default permission set granted to each role (seeded into role_permissions). */
export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, string[]> = {
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
] as const;

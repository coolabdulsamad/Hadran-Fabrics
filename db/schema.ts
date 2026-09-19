import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  text,
  json,
  boolean,
  int,
  bigint,
  decimal,
  timestamp,
  date,
  index,
  uniqueIndex,
  type AnyMySqlColumn,
} from "drizzle-orm/mysql-core";
import {
  USER_ROLES,
  USER_STATUSES,
  PRODUCT_TYPES,
  MATERIAL_TYPES,
  UNITS,
  PRODUCT_STATUSES,
  APPROVAL_STATUSES,
  PAYMENT_METHODS,
  SALE_STATUSES,
  STOCK_MOVEMENT_TYPES,
  STOCK_COUNT_STATUSES,
  PURCHASE_STATUSES,
  RETURN_TYPES,
  RETURN_STATUSES,
  RETURN_CONDITIONS,
  APPROVAL_TYPES,
  APPROVAL_REQUEST_STATUSES,
  CUSTOMER_STATUSES,
  GENDERS,
  CONVERSATION_TYPES,
  MESSAGE_REFERENCE_TYPES,
  ATTACHMENT_TYPES,
  AI_MESSAGE_ROLES,
  SECTIONS,
  BRANCH_STATUSES,
  EXPENSE_CATEGORIES,
  EXPENSE_STATUSES,
  MONEY_DIRECTIONS,
  MONEY_SOURCE_TYPES,
  LAUNDRY_ORDER_STATUSES,
  LAUNDRY_SERVICE_TYPES,
  TAILORING_ORDER_STATUSES,
  FABRIC_SOURCES,
  ORDER_PAYMENT_STATUSES,
  TRANSFER_STATUSES,
  PRODUCTION_STATUSES,
} from "@contracts/index";

/* ======================================================================
   HADRAN FABRICS MALL — Database schema
   28 tables: identity & access, catalog, inventory, sales, returns,
   customers, approvals workflow, chat, AI, settings, audit.
   ====================================================================== */

/* ============================ 0. BRANCHES ============================ */

/** Physical locations: the main mall plus registered sub-branches (supermarkets etc). */
export const branches = mysqlTable(
  "branches",
  {
    id: serial("id").primaryKey(),
    code: varchar("code", { length: 20 }).notNull().unique(), // e.g. MAIN, KUBWA-2
    name: varchar("name", { length: 120 }).notNull(),
    address: varchar("address", { length: 300 }),
    phone: varchar("phone", { length: 40 }),
    isMain: boolean("is_main").notNull().default(false),
    themePrimary: varchar("theme_primary", { length: 20 }), // e.g. #141B2D
    themeAccent: varchar("theme_accent", { length: 20 }), // e.g. #C9A227
    status: mysqlEnum("status", BRANCH_STATUSES).notNull().default("ACTIVE"),
    createdBy: bigint("created_by", { mode: "number", unsigned: true }).references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [index("idx_branches_status").on(t.status)],
);

/* ============================ 1. USERS & ACCESS ============================ */

export const users = mysqlTable(
  "users",
  {
    id: serial("id").primaryKey(),
    username: varchar("username", { length: 60 }).notNull().unique(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    fullName: varchar("full_name", { length: 160 }).notNull(),
    email: varchar("email", { length: 160 }),
    phone: varchar("phone", { length: 40 }),
    role: mysqlEnum("role", USER_ROLES).notNull().default("SALES"),
    status: mysqlEnum("status", USER_STATUSES).notNull().default("ACTIVE"),
    avatarUrl: varchar("avatar_url", { length: 500 }),
    staffCode: varchar("staff_code", { length: 20 }).unique(), // e.g. HFM-0001
    branchId: bigint("branch_id", { mode: "number", unsigned: true }).references(
      (): AnyMySqlColumn => branches.id,
      { onDelete: "set null" },
    ), // null = main branch
    notes: text("notes"),
    lastLoginAt: timestamp("last_login_at"),
    createdBy: bigint("created_by", { mode: "number", unsigned: true }).references(
      (): AnyMySqlColumn => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [index("idx_users_role").on(t.role), index("idx_users_status").on(t.status)],
);

export const sessions = mysqlTable(
  "sessions",
  {
    id: varchar("id", { length: 64 }).primaryKey(), // random session id
    userId: bigint("user_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 255 }).notNull(),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: varchar("user_agent", { length: 300 }),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("idx_sessions_user").on(t.userId), index("idx_sessions_expires").on(t.expiresAt)],
);

/** What each ROLE may do by default (seeded; Admin can edit in Permission Management). */
export const rolePermissions = mysqlTable(
  "role_permissions",
  {
    id: serial("id").primaryKey(),
    role: mysqlEnum("role", USER_ROLES).notNull(),
    permissionKey: varchar("permission_key", { length: 100 }).notNull(),
    allowed: boolean("allowed").notNull().default(true),
    updatedBy: bigint("updated_by", { mode: "number", unsigned: true }).references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [uniqueIndex("uq_role_permission").on(t.role, t.permissionKey)],
);

/** Per-user overrides on top of their role (grant or revoke for one person). */
export const userPermissions = mysqlTable(
  "user_permissions",
  {
    id: serial("id").primaryKey(),
    userId: bigint("user_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permissionKey: varchar("permission_key", { length: 100 }).notNull(),
    allowed: boolean("allowed").notNull().default(true),
    grantedBy: bigint("granted_by", { mode: "number", unsigned: true }).references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_user_permission").on(t.userId, t.permissionKey)],
);

/* ============================ 2. PRODUCT CATALOG ============================ */

export const categories = mysqlTable(
  "categories",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 120 }).notNull().unique(),
    description: text("description"),
    parentId: bigint("parent_id", { mode: "number", unsigned: true }).references(
      (): AnyMySqlColumn => categories.id,
      { onDelete: "set null" },
    ),
    imageUrl: varchar("image_url", { length: 500 }),
    sortOrder: int("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [index("idx_categories_parent").on(t.parentId)],
);

export const suppliers = mysqlTable("suppliers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  contactPerson: varchar("contact_person", { length: 160 }),
  phone: varchar("phone", { length: 40 }),
  email: varchar("email", { length: 160 }),
  address: text("address"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const products = mysqlTable(
  "products",
  {
    id: serial("id").primaryKey(),
    sku: varchar("sku", { length: 50 }).notNull().unique(),
    barcode: varchar("barcode", { length: 64 }).unique(), // scanned at POS to fetch item
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    categoryId: bigint("category_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    supplierId: bigint("supplier_id", { mode: "number", unsigned: true }).references(
      () => suppliers.id,
      { onDelete: "set null" },
    ),
    productType: mysqlEnum("product_type", PRODUCT_TYPES).notNull().default("FABRIC"),
    materialType: mysqlEnum("material_type", MATERIAL_TYPES),
    color: varchar("color", { length: 80 }),
    pattern: varchar("pattern", { length: 120 }),
    brand: varchar("brand", { length: 120 }),
    unitOfMeasure: mysqlEnum("unit_of_measure", UNITS).notNull().default("PIECE"),
    /** e.g. 6 yards in one full pack — used when cutting measured fabric from a pack. */
    packSize: decimal("pack_size", { precision: 10, scale: 3, mode: "number" }),
    /** true = can be measured & cut at POS (e.g. sell 3.5 yards). */
    allowFractional: boolean("allow_fractional").notNull().default(false),
    costPrice: decimal("cost_price", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    sellingPrice: decimal("selling_price", { precision: 14, scale: 2, mode: "number" }).notNull(),
    wholesalePrice: decimal("wholesale_price", { precision: 14, scale: 2, mode: "number" }),
    /** 0 = inherit the store-wide sales.vat_rate setting; >0 = per-product override. */
    taxRate: decimal("tax_rate", { precision: 5, scale: 2, mode: "number" }).notNull().default(0),
    /** VAT-exempt goods are never taxed regardless of the store rate. */
    taxExempt: boolean("tax_exempt").notNull().default(false),
    discountEligible: boolean("discount_eligible").notNull().default(true),
    reorderLevel: decimal("reorder_level", { precision: 14, scale: 3, mode: "number" }).notNull().default(0),
    /** Cached live balance in the base unit (yards/pieces…). Source of truth = stock_movements. */
    currentStock: decimal("current_stock", { precision: 14, scale: 3, mode: "number" }).notNull().default(0),
    shelfLocation: varchar("shelf_location", { length: 80 }),
    primaryImageUrl: varchar("primary_image_url", { length: 500 }),
    status: mysqlEnum("status", PRODUCT_STATUSES).notNull().default("ACTIVE"),
    /** Workflow gate: manager edits stay PENDING until Admin/Super Admin approves. */
    approvalStatus: mysqlEnum("approval_status", APPROVAL_STATUSES).notNull().default("NONE"),
    createdBy: bigint("created_by", { mode: "number", unsigned: true }).references(() => users.id, {
      onDelete: "set null",
    }),
    updatedBy: bigint("updated_by", { mode: "number", unsigned: true }).references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    index("idx_products_category").on(t.categoryId),
    index("idx_products_status").on(t.status),
    index("idx_products_name").on(t.name),
    index("idx_products_type").on(t.productType),
  ],
);

export const productImages = mysqlTable(
  "product_images",
  {
    id: serial("id").primaryKey(),
    productId: bigint("product_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    url: varchar("url", { length: 500 }).notNull(),
    sortOrder: int("sort_order").notNull().default(0),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("idx_product_images_product").on(t.productId)],
);

/* ============================ 3. PURCHASING ============================ */

export const purchases = mysqlTable(
  "purchases",
  {
    id: serial("id").primaryKey(),
    reference: varchar("reference", { length: 30 }).notNull().unique(), // PO-000001
    supplierId: bigint("supplier_id", { mode: "number", unsigned: true }).references(
      () => suppliers.id,
      { onDelete: "set null" },
    ),
    branchId: bigint("branch_id", { mode: "number", unsigned: true }).references(() => branches.id, {
      onDelete: "set null",
    }), // null = main branch
    status: mysqlEnum("status", PURCHASE_STATUSES).notNull().default("PENDING"),
    subtotal: decimal("subtotal", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    tax: decimal("tax", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    totalCost: decimal("total_cost", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    notes: text("notes"),
    expectedAt: date("expected_at"),
    receivedAt: timestamp("received_at"),
    createdBy: bigint("created_by", { mode: "number", unsigned: true }).references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [index("idx_purchases_supplier").on(t.supplierId), index("idx_purchases_status").on(t.status)],
);

export const purchaseItems = mysqlTable(
  "purchase_items",
  {
    id: serial("id").primaryKey(),
    purchaseId: bigint("purchase_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => purchases.id, { onDelete: "cascade" }),
    productId: bigint("product_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    quantity: decimal("quantity", { precision: 14, scale: 3, mode: "number" }).notNull(),
    unit: mysqlEnum("unit", UNITS).notNull().default("PIECE"),
    unitCost: decimal("unit_cost", { precision: 14, scale: 2, mode: "number" }).notNull(),
    lineTotal: decimal("line_total", { precision: 14, scale: 2, mode: "number" }).notNull(),
    receivedQty: decimal("received_qty", { precision: 14, scale: 3, mode: "number" }).notNull().default(0),
  },
  (t) => [index("idx_purchase_items_purchase").on(t.purchaseId)],
);

/* ============================ 4. INVENTORY ============================ */

/** Immutable ledger of every stock change — the source of truth for balances. */
export const stockMovements = mysqlTable(
  "stock_movements",
  {
    id: serial("id").primaryKey(),
    productId: bigint("product_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    branchId: bigint("branch_id", { mode: "number", unsigned: true }).references(() => branches.id, {
      onDelete: "set null",
    }), // null = main branch
    movementType: mysqlEnum("movement_type", STOCK_MOVEMENT_TYPES).notNull(),
    /** Signed: + in, − out. */
    quantity: decimal("quantity", { precision: 14, scale: 3, mode: "number" }).notNull(),
    unit: mysqlEnum("unit", UNITS).notNull().default("PIECE"),
    balanceAfter: decimal("balance_after", { precision: 14, scale: 3, mode: "number" }).notNull(),
    referenceType: varchar("reference_type", { length: 40 }), // SALE | RETURN | PURCHASE | ADJUSTMENT | COUNT
    referenceId: bigint("reference_id", { mode: "number", unsigned: true }),
    reason: varchar("reason", { length: 255 }),
    notes: text("notes"),
    performedBy: bigint("performed_by", { mode: "number", unsigned: true }).references(() => users.id, {
      onDelete: "set null",
    }),
    approvedBy: bigint("approved_by", { mode: "number", unsigned: true }).references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_movements_product").on(t.productId),
    index("idx_movements_type").on(t.movementType),
    index("idx_movements_created").on(t.createdAt),
    index("idx_movements_ref").on(t.referenceType, t.referenceId),
  ],
);

export const stockCounts = mysqlTable("stock_counts", {
  id: serial("id").primaryKey(),
  reference: varchar("reference", { length: 30 }).notNull().unique(), // SC-000001
  branchId: bigint("branch_id", { mode: "number", unsigned: true }).references(() => branches.id, {
      onDelete: "set null",
  }), // null = main branch
  status: mysqlEnum("status", STOCK_COUNT_STATUSES).notNull().default("IN_PROGRESS"),
  notes: text("notes"),
  startedBy: bigint("started_by", { mode: "number", unsigned: true }).references(() => users.id, {
    onDelete: "set null",
  }),
  approvedBy: bigint("approved_by", { mode: "number", unsigned: true }).references(() => users.id, {
    onDelete: "set null",
  }),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const stockCountItems = mysqlTable(
  "stock_count_items",
  {
    id: serial("id").primaryKey(),
    countId: bigint("count_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => stockCounts.id, { onDelete: "cascade" }),
    productId: bigint("product_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    expectedQty: decimal("expected_qty", { precision: 14, scale: 3, mode: "number" }).notNull(),
    countedQty: decimal("counted_qty", { precision: 14, scale: 3, mode: "number" }),
    variance: decimal("variance", { precision: 14, scale: 3, mode: "number" }),
    notes: varchar("notes", { length: 255 }),
  },
  (t) => [index("idx_count_items_count").on(t.countId)],
);

/* ============================ 5. CUSTOMERS ============================ */

export const customers = mysqlTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    code: varchar("code", { length: 20 }).notNull().unique(), // CUST-0001
    fullName: varchar("full_name", { length: 160 }).notNull(),
    phone: varchar("phone", { length: 40 }),
    email: varchar("email", { length: 160 }),
    address: text("address"),
    gender: mysqlEnum("gender", GENDERS),
    birthday: date("birthday"),
    notes: text("notes"),
    /** Special-customer personal discount applied at POS when attached. */
    discountPercent: decimal("discount_percent", { precision: 5, scale: 2, mode: "number" }).notNull().default(0),
    discountNote: varchar("discount_note", { length: 255 }),
    loyaltyPoints: int("loyalty_points").notNull().default(0),
    totalSpent: decimal("total_spent", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    visitCount: int("visit_count").notNull().default(0),
    lastVisitAt: timestamp("last_visit_at"),
    status: mysqlEnum("status", CUSTOMER_STATUSES).notNull().default("ACTIVE"),
    createdBy: bigint("created_by", { mode: "number", unsigned: true }).references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [index("idx_customers_phone").on(t.phone), index("idx_customers_name").on(t.fullName)],
);

/* ============================ 6. SALES (POS) ============================ */

export const sales = mysqlTable(
  "sales",
  {
    id: serial("id").primaryKey(),
    receiptNo: varchar("receipt_no", { length: 30 }).notNull().unique(), // RCP-20260724-0001
    cashierId: bigint("cashier_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    branchId: bigint("branch_id", { mode: "number", unsigned: true }).references(() => branches.id, {
      onDelete: "set null",
    }), // null = main branch
    customerId: bigint("customer_id", { mode: "number", unsigned: true }).references(() => customers.id, {
      onDelete: "set null",
    }),
    status: mysqlEnum("status", SALE_STATUSES).notNull().default("COMPLETED"),
    itemCount: int("item_count").notNull().default(0),
    subtotal: decimal("subtotal", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    discountTotal: decimal("discount_total", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    discountNote: varchar("discount_note", { length: 255 }),
    taxTotal: decimal("tax_total", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    serviceCharge: decimal("service_charge", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    grandTotal: decimal("grand_total", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    amountTendered: decimal("amount_tendered", { precision: 14, scale: 2, mode: "number" }),
    changeGiven: decimal("change_given", { precision: 14, scale: 2, mode: "number" }),
    notes: text("notes"),
    heldAt: timestamp("held_at"),
    completedAt: timestamp("completed_at"),
    voidedBy: bigint("voided_by", { mode: "number", unsigned: true }).references(() => users.id, {
      onDelete: "set null",
    }),
    voidReason: varchar("void_reason", { length: 255 }),
    voidedAt: timestamp("voided_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    index("idx_sales_cashier").on(t.cashierId),
    index("idx_sales_customer").on(t.customerId),
    index("idx_sales_status").on(t.status),
    index("idx_sales_created").on(t.createdAt),
  ],
);

export const saleItems = mysqlTable(
  "sale_items",
  {
    id: serial("id").primaryKey(),
    saleId: bigint("sale_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    productId: bigint("product_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    // Snapshots — receipts stay correct even if the product is edited later:
    productName: varchar("product_name", { length: 255 }).notNull(),
    sku: varchar("sku", { length: 50 }).notNull(),
    quantity: decimal("quantity", { precision: 14, scale: 3, mode: "number" }).notNull(),
    unit: mysqlEnum("unit", UNITS).notNull().default("PIECE"),
    /** true when the fabric was measured & cut from a pack (e.g. 3.5 yards). */
    isMeasuredCut: boolean("is_measured_cut").notNull().default(false),
    unitPrice: decimal("unit_price", { precision: 14, scale: 2, mode: "number" }).notNull(),
    costPrice: decimal("cost_price", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    discountAmount: decimal("discount_amount", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    taxAmount: decimal("tax_amount", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    lineTotal: decimal("line_total", { precision: 14, scale: 2, mode: "number" }).notNull(),
    returnedQty: decimal("returned_qty", { precision: 14, scale: 3, mode: "number" }).notNull().default(0),
  },
  (t) => [index("idx_sale_items_sale").on(t.saleId), index("idx_sale_items_product").on(t.productId)],
);

/** Supports split payments (e.g. part cash + part transfer). */
export const salePayments = mysqlTable(
  "sale_payments",
  {
    id: serial("id").primaryKey(),
    saleId: bigint("sale_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    method: mysqlEnum("method", PAYMENT_METHODS).notNull(),
    amount: decimal("amount", { precision: 14, scale: 2, mode: "number" }).notNull(),
    reference: varchar("reference", { length: 120 }), // transfer ref / POS approval code
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("idx_sale_payments_sale").on(t.saleId)],
);

/* ============================ 7. RETURNS & EXCHANGES ============================ */

export const returns = mysqlTable(
  "returns",
  {
    id: serial("id").primaryKey(),
    reference: varchar("reference", { length: 30 }).notNull().unique(), // RTN-000001
    saleId: bigint("sale_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => sales.id, { onDelete: "restrict" }),
    branchId: bigint("branch_id", { mode: "number", unsigned: true }).references(() => branches.id, {
      onDelete: "set null",
    }), // null = main branch
    type: mysqlEnum("type", RETURN_TYPES).notNull().default("RETURN"),
    reason: varchar("reason", { length: 255 }).notNull(),
    notes: text("notes"),
    status: mysqlEnum("status", RETURN_STATUSES).notNull().default("PENDING"),
    refundAmount: decimal("refund_amount", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    /** Exchanges: total value of the replacement items handed out. */
    exchangeValue: decimal("exchange_value", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    /** Exchanges where replacements cost more: extra cash the customer paid. */
    topUpAmount: decimal("top_up_amount", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    refundMethod: mysqlEnum("refund_method", PAYMENT_METHODS),
    processedBy: bigint("processed_by", { mode: "number", unsigned: true }).references(() => users.id, {
      onDelete: "set null",
    }),
    approvedBy: bigint("approved_by", { mode: "number", unsigned: true }).references(() => users.id, {
      onDelete: "set null",
    }),
    processedAt: timestamp("processed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [index("idx_returns_sale").on(t.saleId), index("idx_returns_status").on(t.status)],
);

export const returnItems = mysqlTable(
  "return_items",
  {
    id: serial("id").primaryKey(),
    returnId: bigint("return_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => returns.id, { onDelete: "cascade" }),
    saleItemId: bigint("sale_item_id", { mode: "number", unsigned: true }).references(() => saleItems.id, {
      onDelete: "set null",
    }),
    productId: bigint("product_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    quantity: decimal("quantity", { precision: 14, scale: 3, mode: "number" }).notNull(),
    unit: mysqlEnum("unit", UNITS).notNull().default("PIECE"),
    condition: mysqlEnum("condition", RETURN_CONDITIONS).notNull().default("GOOD"),
    /** GOOD + restock=true → item goes back into inventory. */
    restock: boolean("restock").notNull().default(true),
    /** For exchanges: what the customer took instead. */
    exchangeProductId: bigint("exchange_product_id", { mode: "number", unsigned: true }).references(
      () => products.id,
      { onDelete: "set null" },
    ),
    exchangeQty: decimal("exchange_qty", { precision: 14, scale: 3, mode: "number" }),
    exchangeUnitPrice: decimal("exchange_unit_price", { precision: 14, scale: 2, mode: "number" }),
    exchangeLineTotal: decimal("exchange_line_total", { precision: 14, scale: 2, mode: "number" }),
    unitPrice: decimal("unit_price", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    lineTotal: decimal("line_total", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
  },
  (t) => [index("idx_return_items_return").on(t.returnId)],
);

/* ============================ 8. APPROVAL WORKFLOW ============================ */

/** Manager actions (add/edit/delete product, adjustments, voids…) wait here for Admin review. */
export const approvalRequests = mysqlTable(
  "approval_requests",
  {
    id: serial("id").primaryKey(),
    requestType: mysqlEnum("request_type", APPROVAL_TYPES).notNull(),
    status: mysqlEnum("status", APPROVAL_REQUEST_STATUSES).notNull().default("PENDING"),
    entityType: varchar("entity_type", { length: 50 }).notNull(), // PRODUCT | STOCK_MOVEMENT | SALE | RETURN | CUSTOMER
    entityId: bigint("entity_id", { mode: "number", unsigned: true }),
    /** Full before/after payload the reviewer inspects and the system applies on approval. */
    payload: json("payload").$type<Record<string, unknown>>().notNull(),
    summary: varchar("summary", { length: 500 }).notNull(),
    requesterId: bigint("requester_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reviewerId: bigint("reviewer_id", { mode: "number", unsigned: true }).references(() => users.id, {
      onDelete: "set null",
    }),
    reviewNote: text("review_note"),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_approvals_status").on(t.status),
    index("idx_approvals_requester").on(t.requesterId),
    index("idx_approvals_entity").on(t.entityType, t.entityId),
  ],
);

/* ============================ 9. TEAM CHAT ============================ */

export const chatConversations = mysqlTable("chat_conversations", {
  id: serial("id").primaryKey(),
  type: mysqlEnum("type", CONVERSATION_TYPES).notNull().default("DIRECT"),
  name: varchar("name", { length: 160 }), // group chats only
  createdBy: bigint("created_by", { mode: "number", unsigned: true }).references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const chatParticipants = mysqlTable(
  "chat_participants",
  {
    id: serial("id").primaryKey(),
    conversationId: bigint("conversation_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => chatConversations.id, { onDelete: "cascade" }),
    userId: bigint("user_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastReadMessageId: bigint("last_read_message_id", { mode: "number", unsigned: true }),
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_conversation_user").on(t.conversationId, t.userId),
    index("idx_participants_user").on(t.userId),
  ],
);

export const chatMessages = mysqlTable(
  "chat_messages",
  {
    id: serial("id").primaryKey(),
    conversationId: bigint("conversation_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => chatConversations.id, { onDelete: "cascade" }),
    senderId: bigint("sender_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body"),
    attachmentUrl: varchar("attachment_url", { length: 500 }),
    attachmentType: mysqlEnum("attachment_type", ATTACHMENT_TYPES),
    attachmentName: varchar("attachment_name", { length: 255 }),
    /** Product / sale / stock reference cards with deep links into the app. */
    referenceType: mysqlEnum("reference_type", MESSAGE_REFERENCE_TYPES),
    referenceId: bigint("reference_id", { mode: "number", unsigned: true }),
    referenceLabel: varchar("reference_label", { length: 255 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    editedAt: timestamp("edited_at"),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => [
    index("idx_messages_conversation").on(t.conversationId),
    index("idx_messages_created").on(t.createdAt),
  ],
);

/* ============================ 10. AI ASSISTANT ============================ */

export const aiConversations = mysqlTable(
  "ai_conversations",
  {
    id: serial("id").primaryKey(),
    userId: bigint("user_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull().default("New conversation"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [index("idx_ai_conversations_user").on(t.userId)],
);

export const aiMessages = mysqlTable(
  "ai_messages",
  {
    id: serial("id").primaryKey(),
    conversationId: bigint("conversation_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    role: mysqlEnum("role", AI_MESSAGE_ROLES).notNull(),
    content: text("content").notNull(),
    tokenCount: int("token_count"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("idx_ai_messages_conversation").on(t.conversationId)],
);

/* ============================ 11. SETTINGS & NOTIFICATIONS ============================ */

/** Key-value store for store profile, tax/discount rates, receipt & hardware config. */
export const settings = mysqlTable("settings", {
  key: varchar("key", { length: 100 }).primaryKey(), // e.g. sales.vat_rate, receipt.footer
  value: text("value").notNull(), // JSON-encoded
  group: varchar("group", { length: 50 }).notNull().default("SYSTEM"),
  description: varchar("description", { length: 255 }),
  updatedBy: bigint("updated_by", { mode: "number", unsigned: true }).references(() => users.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const notifications = mysqlTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: bigint("user_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 40 }).notNull(), // APPROVAL | LOW_STOCK | RETURN | SYSTEM | CHAT
    title: varchar("title", { length: 200 }).notNull(),
    body: varchar("body", { length: 500 }),
    link: varchar("link", { length: 300 }),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("idx_notifications_user").on(t.userId, t.isRead)],
);

/* ============================ 12. AUDIT LOG ============================ */

/** Every sensitive action lands here — who, what, before → after, when, from where. */
export const auditLogs = mysqlTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    actorId: bigint("actor_id", { mode: "number", unsigned: true }).references(() => users.id, {
      onDelete: "set null",
    }),
    actorName: varchar("actor_name", { length: 160 }).notNull(), // snapshot
    actorRole: varchar("actor_role", { length: 20 }).notNull(),
    action: varchar("action", { length: 60 }).notNull(), // e.g. product.create, sale.void, settings.update
    entityType: varchar("entity_type", { length: 50 }).notNull(),
    entityId: varchar("entity_id", { length: 40 }),
    description: varchar("description", { length: 500 }).notNull(),
    beforeData: json("before_data").$type<Record<string, unknown> | null>(),
    afterData: json("after_data").$type<Record<string, unknown> | null>(),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: varchar("user_agent", { length: 300 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_audit_actor").on(t.actorId),
    index("idx_audit_action").on(t.action),
    index("idx_audit_entity").on(t.entityType, t.entityId),
    index("idx_audit_created").on(t.createdAt),
  ],
);

/* ============================ Inferred types ============================ */

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type RolePermission = typeof rolePermissions.$inferSelect;
export type UserPermission = typeof userPermissions.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type ProductImage = typeof productImages.$inferSelect;
export type Purchase = typeof purchases.$inferSelect;
export type PurchaseItem = typeof purchaseItems.$inferSelect;
export type StockMovement = typeof stockMovements.$inferSelect;
export type StockCount = typeof stockCounts.$inferSelect;
export type StockCountItem = typeof stockCountItems.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Sale = typeof sales.$inferSelect;
export type SaleItem = typeof saleItems.$inferSelect;
export type SalePayment = typeof salePayments.$inferSelect;
export type Return = typeof returns.$inferSelect;
export type ReturnItem = typeof returnItems.$inferSelect;
export type ApprovalRequest = typeof approvalRequests.$inferSelect;
export type ChatConversation = typeof chatConversations.$inferSelect;
export type ChatParticipant = typeof chatParticipants.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type AiConversation = typeof aiConversations.$inferSelect;
export type AiMessage = typeof aiMessages.$inferSelect;
export type Setting = typeof settings.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;

/* ============================ 13. BRANCH STOCK LEVELS ============================ */

/** Per-branch stock for each product. Main branch mirrors products.current_stock until migration. */
export const stockLevels = mysqlTable(
  "stock_levels",
  {
    id: serial("id").primaryKey(),
    productId: bigint("product_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    branchId: bigint("branch_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull().default("0"),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    uniqueIndex("uq_stock_product_branch").on(t.productId, t.branchId),
    index("idx_stock_branch").on(t.branchId),
  ],
);

/* ============================ 14. EXPENSES & MONEY LEDGER ============================ */

/** Business expenses — rent, salaries, supplies… scoped to a section & branch. */
export const expenses = mysqlTable(
  "expenses",
  {
    id: serial("id").primaryKey(),
    refNo: varchar("ref_no", { length: 30 }).notNull().unique(), // e.g. EXP-000001
    section: mysqlEnum("section", SECTIONS).notNull().default("SALES"),
    branchId: bigint("branch_id", { mode: "number", unsigned: true }).references(() => branches.id, {
      onDelete: "set null",
    }),
    category: mysqlEnum("category", EXPENSE_CATEGORIES).notNull().default("OTHER"),
    description: varchar("description", { length: 400 }).notNull(),
    vendor: varchar("vendor", { length: 160 }),
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    paymentMethod: mysqlEnum("payment_method", PAYMENT_METHODS).notNull().default("CASH"),
    expenseDate: date("expense_date").notNull(),
    receiptUrl: varchar("receipt_url", { length: 500 }),
    status: mysqlEnum("status", EXPENSE_STATUSES).notNull().default("ACTIVE"),
    notes: text("notes"),
    recordedBy: bigint("recorded_by", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    voidedBy: bigint("voided_by", { mode: "number", unsigned: true }).references(() => users.id, {
      onDelete: "set null",
    }),
    voidReason: varchar("void_reason", { length: 300 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    index("idx_expenses_section").on(t.section, t.expenseDate),
    index("idx_expenses_branch").on(t.branchId),
    index("idx_expenses_category").on(t.category),
    index("idx_expenses_date").on(t.expenseDate),
  ],
);

/** The money ledger — every naira in or out, linked to its source record. */
export const moneyMovements = mysqlTable(
  "money_movements",
  {
    id: serial("id").primaryKey(),
    refNo: varchar("ref_no", { length: 30 }).notNull().unique(), // e.g. MM-000001
    direction: mysqlEnum("direction", MONEY_DIRECTIONS).notNull(),
    section: mysqlEnum("section", SECTIONS).notNull().default("SALES"),
    branchId: bigint("branch_id", { mode: "number", unsigned: true }).references(() => branches.id, {
      onDelete: "set null",
    }),
    sourceType: mysqlEnum("source_type", MONEY_SOURCE_TYPES).notNull(),
    sourceId: varchar("source_id", { length: 40 }), // e.g. sale id, expense id
    sourceRef: varchar("source_ref", { length: 40 }), // e.g. RCP-…, EXP-… (human ref)
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    paymentMethod: mysqlEnum("payment_method", PAYMENT_METHODS).notNull().default("CASH"),
    note: varchar("note", { length: 400 }),
    createdBy: bigint("created_by", { mode: "number", unsigned: true }).references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_money_direction").on(t.direction, t.createdAt),
    index("idx_money_section").on(t.section, t.createdAt),
    index("idx_money_branch").on(t.branchId),
    index("idx_money_source").on(t.sourceType, t.sourceId),
    index("idx_money_created").on(t.createdAt),
  ],
);

/* ============================ 15. INTER-BRANCH TRANSFERS ============================ */

export const branchTransfers = mysqlTable(
  "branch_transfers",
  {
    id: serial("id").primaryKey(),
    refNo: varchar("ref_no", { length: 30 }).notNull().unique(), // e.g. TRF-000001
    fromBranchId: bigint("from_branch_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => branches.id),
    toBranchId: bigint("to_branch_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => branches.id),
    status: mysqlEnum("status", TRANSFER_STATUSES).notNull().default("PENDING_APPROVAL"),
    note: varchar("note", { length: 400 }),
    requestedBy: bigint("requested_by", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    approvedBy: bigint("approved_by", { mode: "number", unsigned: true }).references(() => users.id, {
      onDelete: "set null",
    }),
    receivedBy: bigint("received_by", { mode: "number", unsigned: true }).references(() => users.id, {
      onDelete: "set null",
    }),
    sentAt: timestamp("sent_at"),
    receivedAt: timestamp("received_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    index("idx_transfers_from").on(t.fromBranchId, t.status),
    index("idx_transfers_to").on(t.toBranchId, t.status),
  ],
);

export const branchTransferItems = mysqlTable(
  "branch_transfer_items",
  {
    id: serial("id").primaryKey(),
    transferId: bigint("transfer_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => branchTransfers.id, { onDelete: "cascade" }),
    productId: bigint("product_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => products.id),
    productName: varchar("product_name", { length: 200 }).notNull(), // snapshot
    unit: mysqlEnum("unit", UNITS).notNull().default("PIECE"),
    quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull(),
    receivedQty: decimal("received_qty", { precision: 12, scale: 2 }),
  },
  (t) => [index("idx_transfer_items_transfer").on(t.transferId)],
);

/* ============================ 16. LAUNDRY ============================ */

export const laundryOrders = mysqlTable(
  "laundry_orders",
  {
    id: serial("id").primaryKey(),
    orderNo: varchar("order_no", { length: 30 }).notNull().unique(), // e.g. LND-000001
    branchId: bigint("branch_id", { mode: "number", unsigned: true }).references(() => branches.id, {
      onDelete: "set null",
    }),
    customerId: bigint("customer_id", { mode: "number", unsigned: true }).references(
      () => customers.id,
      { onDelete: "set null" },
    ),
    customerName: varchar("customer_name", { length: 160 }).notNull(), // walk-ins allowed
    customerPhone: varchar("customer_phone", { length: 40 }),
    status: mysqlEnum("status", LAUNDRY_ORDER_STATUSES).notNull().default("RECEIVED"),
    priority: mysqlEnum("priority", ["NORMAL", "EXPRESS"]).notNull().default("NORMAL"),
    dueDate: date("due_date"),
    subtotal: decimal("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
    discountAmount: decimal("discount_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    totalAmount: decimal("total_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    amountPaid: decimal("amount_paid", { precision: 14, scale: 2 }).notNull().default("0"),
    paymentStatus: mysqlEnum("payment_status", ORDER_PAYMENT_STATUSES)
      .notNull()
      .default("UNPAID"),
    notes: text("notes"),
    receivedBy: bigint("received_by", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    collectedAt: timestamp("collected_at"),
    cancelledReason: varchar("cancelled_reason", { length: 300 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    index("idx_laundry_status").on(t.status),
    index("idx_laundry_branch").on(t.branchId, t.createdAt),
    index("idx_laundry_customer").on(t.customerId),
    index("idx_laundry_created").on(t.createdAt),
  ],
);

export const laundryOrderItems = mysqlTable(
  "laundry_order_items",
  {
    id: serial("id").primaryKey(),
    orderId: bigint("order_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => laundryOrders.id, { onDelete: "cascade" }),
    garmentType: varchar("garment_type", { length: 100 }).notNull(), // e.g. Agbada, Suit, Bedsheet
    description: varchar("description", { length: 300 }), // color, brand, marks
    serviceType: mysqlEnum("service_type", LAUNDRY_SERVICE_TYPES).notNull().default("WASH_IRON"),
    quantity: int("quantity").notNull().default(1),
    unitPrice: decimal("unit_price", { precision: 14, scale: 2 }).notNull(),
    lineTotal: decimal("line_total", { precision: 14, scale: 2 }).notNull(),
    conditionNotes: varchar("condition_notes", { length: 300 }), // stains/damage at intake
  },
  (t) => [index("idx_laundry_items_order").on(t.orderId)],
);

export const laundryPayments = mysqlTable(
  "laundry_payments",
  {
    id: serial("id").primaryKey(),
    orderId: bigint("order_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => laundryOrders.id, { onDelete: "cascade" }),
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    method: mysqlEnum("method", PAYMENT_METHODS).notNull().default("CASH"),
    receivedBy: bigint("received_by", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    note: varchar("note", { length: 300 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("idx_laundry_payments_order").on(t.orderId)],
);

export const laundryStatusHistory = mysqlTable(
  "laundry_status_history",
  {
    id: serial("id").primaryKey(),
    orderId: bigint("order_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => laundryOrders.id, { onDelete: "cascade" }),
    fromStatus: mysqlEnum("from_status", LAUNDRY_ORDER_STATUSES),
    toStatus: mysqlEnum("to_status", LAUNDRY_ORDER_STATUSES).notNull(),
    changedBy: bigint("changed_by", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    note: varchar("note", { length: 300 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("idx_laundry_history_order").on(t.orderId)],
);

/* ============================ 17. TAILORING ============================ */

export const tailoringOrders = mysqlTable(
  "tailoring_orders",
  {
    id: serial("id").primaryKey(),
    orderNo: varchar("order_no", { length: 30 }).notNull().unique(), // e.g. TLR-000001
    branchId: bigint("branch_id", { mode: "number", unsigned: true }).references(() => branches.id, {
      onDelete: "set null",
    }),
    customerId: bigint("customer_id", { mode: "number", unsigned: true }).references(
      () => customers.id,
      { onDelete: "set null" },
    ),
    customerName: varchar("customer_name", { length: 160 }).notNull(),
    customerPhone: varchar("customer_phone", { length: 40 }),
    styleDescription: varchar("style_description", { length: 400 }),
    styleImageUrl: varchar("style_image_url", { length: 500 }), // reference photo
    fabricSource: mysqlEnum("fabric_source", FABRIC_SOURCES).notNull().default("CUSTOMER_OWN"),
    status: mysqlEnum("status", TAILORING_ORDER_STATUSES).notNull().default("RECEIVED"),
    tailorId: bigint("tailor_id", { mode: "number", unsigned: true }).references(() => users.id, {
      onDelete: "set null",
    }), // assigned tailor
    dueDate: date("due_date"),
    price: decimal("price", { precision: 14, scale: 2 }).notNull().default("0"),
    amountPaid: decimal("amount_paid", { precision: 14, scale: 2 }).notNull().default("0"),
    paymentStatus: mysqlEnum("payment_status", ORDER_PAYMENT_STATUSES)
      .notNull()
      .default("UNPAID"),
    notes: text("notes"),
    receivedBy: bigint("received_by", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    deliveredAt: timestamp("delivered_at"),
    cancelledReason: varchar("cancelled_reason", { length: 300 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    index("idx_tailoring_status").on(t.status),
    index("idx_tailoring_branch").on(t.branchId, t.createdAt),
    index("idx_tailoring_tailor").on(t.tailorId),
    index("idx_tailoring_customer").on(t.customerId),
  ],
);

/** Body measurements per tailoring order (JSON: chest, waist, sleeve, length…). */
export const tailoringMeasurements = mysqlTable(
  "tailoring_measurements",
  {
    id: serial("id").primaryKey(),
    orderId: bigint("order_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => tailoringOrders.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 100 }).notNull().default("Standard"), // e.g. Standard / Agbada
    measurements: json("measurements").$type<Record<string, number | string>>().notNull(),
    recordedBy: bigint("recorded_by", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("idx_measurements_order").on(t.orderId)],
);

export const tailoringPayments = mysqlTable(
  "tailoring_payments",
  {
    id: serial("id").primaryKey(),
    orderId: bigint("order_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => tailoringOrders.id, { onDelete: "cascade" }),
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    method: mysqlEnum("method", PAYMENT_METHODS).notNull().default("CASH"),
    receivedBy: bigint("received_by", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    note: varchar("note", { length: 300 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("idx_tailoring_payments_order").on(t.orderId)],
);

export const tailoringStatusHistory = mysqlTable(
  "tailoring_status_history",
  {
    id: serial("id").primaryKey(),
    orderId: bigint("order_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => tailoringOrders.id, { onDelete: "cascade" }),
    fromStatus: mysqlEnum("from_status", TAILORING_ORDER_STATUSES),
    toStatus: mysqlEnum("to_status", TAILORING_ORDER_STATUSES).notNull(),
    changedBy: bigint("changed_by", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    note: varchar("note", { length: 300 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("idx_tailoring_history_order").on(t.orderId)],
);

/* ============================ 18. IN-HOUSE PRODUCTION ============================ */

/** Converting shop materials into new sellable products (e.g. fabric → ready-made wears). */
export const productionOrders = mysqlTable(
  "production_orders",
  {
    id: serial("id").primaryKey(),
    refNo: varchar("ref_no", { length: 30 }).notNull().unique(), // e.g. PRD-000001
    branchId: bigint("branch_id", { mode: "number", unsigned: true }).references(() => branches.id, {
      onDelete: "set null",
    }),
    outputProductId: bigint("output_product_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => products.id), // the product being made
    outputQty: decimal("output_qty", { precision: 12, scale: 2 }).notNull(),
    status: mysqlEnum("status", PRODUCTION_STATUSES).notNull().default("DRAFT"),
    notes: text("notes"),
    requestedBy: bigint("requested_by", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    approvedBy: bigint("approved_by", { mode: "number", unsigned: true }).references(() => users.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    index("idx_production_status").on(t.status),
    index("idx_production_output").on(t.outputProductId),
  ],
);

/** Materials consumed from shop stock for a production run. */
export const productionMaterials = mysqlTable(
  "production_materials",
  {
    id: serial("id").primaryKey(),
    productionId: bigint("production_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => productionOrders.id, { onDelete: "cascade" }),
    productId: bigint("product_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => products.id),
    productName: varchar("product_name", { length: 200 }).notNull(), // snapshot
    unit: mysqlEnum("unit", UNITS).notNull().default("PIECE"),
    quantityPlanned: decimal("quantity_planned", { precision: 12, scale: 2 }).notNull(),
    quantityUsed: decimal("quantity_used", { precision: 12, scale: 2 }),
  },
  (t) => [index("idx_production_materials_run").on(t.productionId)],
);

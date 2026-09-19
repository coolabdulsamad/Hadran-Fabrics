/**
 * HADRAN FABRICS MALL — Shared domain constants (frontend ↔ backend)
 */

// ---------- Store identity (from the official card) ----------
export const STORE = {
  name: "Hadran Fabrics Mall",
  tagline: "SHOP. DISCOVER. INDULGE.",
  motto: "Luxury in every visit.",
  address: "Hadran Mall, Opposite Daughters of Charity Hospital, F01 New Market Kubwa",
  currency: "NGN",
  currencySymbol: "₦",
  defaultVatRate: 7.5, // Nigeria VAT
} as const;

// ---------- Product catalog ----------
export const PRODUCT_TYPES = [
  "FABRIC",
  "READY_WEAR",
  "SHOES",
  "JEWELRY",
  "BAGS",
  "HATS",
  "ACCESSORIES",
] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  FABRIC: "Fabric (Ankara, Lace, Wool…)",
  READY_WEAR: "Ready-Made Native Wear",
  SHOES: "Shoes",
  JEWELRY: "Jewelry",
  BAGS: "Bags & Clutches",
  HATS: "Hats & Caps",
  ACCESSORIES: "Accessories",
};

export const MATERIAL_TYPES = [
  "ANKARA",
  "MEN_LACE",
  "WOMEN_LACE",
  "WOOL",
  "GUINEA_BROCADE",
  "CASHMERE",
  "SILK",
  "CHIFFON",
  "VELVET",
  "SATIN",
  "COTTON",
  "ATIKU",
  "GELE",
  "OTHER",
] as const;
export type MaterialType = (typeof MATERIAL_TYPES)[number];

export const MATERIAL_TYPE_LABELS: Record<MaterialType, string> = {
  ANKARA: "Ankara (African Wax Print)",
  MEN_LACE: "Men Lace",
  WOMEN_LACE: "Women Lace",
  WOOL: "Wool / Senator Material",
  GUINEA_BROCADE: "Guinea Brocade",
  CASHMERE: "Cashmere",
  SILK: "Silk",
  CHIFFON: "Chiffon",
  VELVET: "Velvet",
  SATIN: "Satin",
  COTTON: "Cotton",
  ATIKU: "Atiku",
  GELE: "Gele / Head Tie",
  OTHER: "Other",
};

/** Sellable units — fabrics are measured (yards), others are counted. */
export const UNITS = ["YARD", "PIECE", "PACK", "PAIR", "SET"] as const;
export type Unit = (typeof UNITS)[number];

export const UNIT_LABELS: Record<Unit, string> = {
  YARD: "Yard",
  PIECE: "Piece",
  PACK: "Full Pack",
  PAIR: "Pair",
  SET: "Set",
};

export const PRODUCT_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const APPROVAL_STATUSES = ["NONE", "PENDING", "APPROVED", "REJECTED"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

// ---------- POS / sales ----------
export const PAYMENT_METHODS = ["CASH", "POS_TERMINAL", "BANK_TRANSFER", "CARD", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  POS_TERMINAL: "POS Terminal",
  BANK_TRANSFER: "Bank Transfer",
  CARD: "Card",
  OTHER: "Other",
};

export const SALE_STATUSES = ["HELD", "COMPLETED", "VOIDED", "PARTIALLY_RETURNED", "RETURNED"] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

// ---------- Inventory ----------
export const STOCK_MOVEMENT_TYPES = [
  "STOCK_IN",
  "STOCK_OUT",
  "ADJUSTMENT",
  "SALE",
  "SALE_VOID_REVERSAL",
  "RETURN_RESTOCK",
  "EXCHANGE_OUT",
  "EXCHANGE_IN",
  "PURCHASE_RECEIVED",
  "DAMAGE",
  "COUNT_CORRECTION",
  "TRANSFER_OUT",
  "TRANSFER_IN",
  "PRODUCTION_OUT",
  "PRODUCTION_IN",
] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

// ---------- Sections & branches ----------
/** Business sections inside the mall. SALES = fabrics/shop, LAUNDRY, TAILORING. */
export const SECTIONS = ["SALES", "LAUNDRY", "TAILORING"] as const;
export type Section = (typeof SECTIONS)[number];

export const SECTION_LABELS: Record<Section, string> = {
  SALES: "Sales & Inventory",
  LAUNDRY: "Laundry",
  TAILORING: "Tailoring",
};

/** Short one-line pitch for each section (login / picker cards). */
export const SECTION_DESCRIPTIONS: Record<Section, string> = {
  SALES: "Fabrics, ready-wear & accessories — POS, inventory, customers and shop reports.",
  LAUNDRY: "Garment care — washing, dry-cleaning & ironing orders, workflow and payments.",
  TAILORING: "Bespoke tailoring — measurements, style orders, workflow and in-house production.",
};

/** Landing route for each section. */
export const SECTION_HOME: Record<Section, string> = {
  SALES: "/dashboard",
  LAUNDRY: "/laundry",
  TAILORING: "/tailoring",
};

export const BRANCH_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type BranchStatus = (typeof BRANCH_STATUSES)[number];

// ---------- Expenses & money management ----------
export const EXPENSE_CATEGORIES = [
  "RENT",
  "UTILITIES",
  "SALARIES",
  "SUPPLIES",
  "EQUIPMENT",
  "MAINTENANCE",
  "TRANSPORT",
  "MARKETING",
  "PACKAGING",
  "CLEANING",
  "TAXES_LEVIES",
  "OTHER",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_STATUSES = ["ACTIVE", "VOIDED"] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

/** Money ledger: every naira entering or leaving the business. */
export const MONEY_DIRECTIONS = ["IN", "OUT"] as const;
export type MoneyDirection = (typeof MONEY_DIRECTIONS)[number];

export const MONEY_SOURCE_TYPES = [
  "SALE",
  "SALE_VOID_REVERSAL",
  "RETURN_REFUND",
  "EXCHANGE_TOPUP",
  "EXPENSE",
  "PURCHASE",
  "LAUNDRY_PAYMENT",
  "TAILORING_PAYMENT",
  "MANUAL_IN",
  "MANUAL_OUT",
] as const;
export type MoneySourceType = (typeof MONEY_SOURCE_TYPES)[number];

// ---------- Laundry ----------
export const LAUNDRY_ORDER_STATUSES = [
  "RECEIVED",
  "WASHING",
  "DRYING",
  "IRONING",
  "READY",
  "COLLECTED",
  "CANCELLED",
] as const;
export type LaundryOrderStatus = (typeof LAUNDRY_ORDER_STATUSES)[number];

export const LAUNDRY_SERVICE_TYPES = [
  "WASH",
  "DRY_CLEAN",
  "IRON",
  "WASH_IRON",
  "STAIN_REMOVAL",
  "REPAIR",
] as const;
export type LaundryServiceType = (typeof LAUNDRY_SERVICE_TYPES)[number];

// ---------- Tailoring ----------
export const TAILORING_ORDER_STATUSES = [
  "RECEIVED",
  "CUTTING",
  "SEWING",
  "FINISHING",
  "FITTING",
  "READY",
  "DELIVERED",
  "CANCELLED",
] as const;
export type TailoringOrderStatus = (typeof TAILORING_ORDER_STATUSES)[number];

export const FABRIC_SOURCES = ["CUSTOMER_OWN", "SHOP_STOCK"] as const;
export type FabricSource = (typeof FABRIC_SOURCES)[number];

// ---------- Shared payment status (laundry/tailoring orders) ----------
export const ORDER_PAYMENT_STATUSES = ["UNPAID", "PART_PAID", "PAID"] as const;
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUSES)[number];

// ---------- Branch transfers ----------
export const TRANSFER_STATUSES = [
  "PENDING_APPROVAL",
  "APPROVED",
  "IN_TRANSIT",
  "RECEIVED",
  "REJECTED",
  "CANCELLED",
] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

// ---------- In-house production (materials → new sellable products) ----------
export const PRODUCTION_STATUSES = ["DRAFT", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export type ProductionStatus = (typeof PRODUCTION_STATUSES)[number];


export const STOCK_COUNT_STATUSES = ["IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export type StockCountStatus = (typeof STOCK_COUNT_STATUSES)[number];

export const PURCHASE_STATUSES = ["PENDING", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

// ---------- Returns / exchanges ----------
export const RETURN_TYPES = ["RETURN", "EXCHANGE"] as const;
export type ReturnType = (typeof RETURN_TYPES)[number];

export const RETURN_STATUSES = ["PENDING", "APPROVED", "REJECTED", "COMPLETED"] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const RETURN_CONDITIONS = ["GOOD", "DAMAGED"] as const;
export type ReturnCondition = (typeof RETURN_CONDITIONS)[number];

// ---------- Approvals workflow ----------
export const APPROVAL_TYPES = [
  "PRODUCT_CREATE",
  "PRODUCT_EDIT",
  "PRODUCT_DELETE",
  "STOCK_ADJUSTMENT",
  "VOID_SALE",
  "RETURN_PROCESS",
  "CUSTOMER_DISCOUNT",
  "EXPENSE_RECORD",
  "BRANCH_TRANSFER",
  "PRODUCTION_RUN",
] as const;
export type ApprovalType = (typeof APPROVAL_TYPES)[number];

export const APPROVAL_REQUEST_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
export type ApprovalRequestStatus = (typeof APPROVAL_REQUEST_STATUSES)[number];

// ---------- Customers ----------
export const CUSTOMER_STATUSES = ["ACTIVE", "INACTIVE", "BLOCKED"] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const GENDERS = ["MALE", "FEMALE", "OTHER"] as const;
export type Gender = (typeof GENDERS)[number];

// ---------- Chat ----------
export const CONVERSATION_TYPES = ["DIRECT", "GROUP"] as const;
export type ConversationType = (typeof CONVERSATION_TYPES)[number];

export const MESSAGE_REFERENCE_TYPES = ["PRODUCT", "SALE", "STOCK_MOVEMENT", "CUSTOMER", "PURCHASE"] as const;
export type MessageReferenceType = (typeof MESSAGE_REFERENCE_TYPES)[number];

export const ATTACHMENT_TYPES = ["IMAGE", "DOCUMENT"] as const;
export type AttachmentType = (typeof ATTACHMENT_TYPES)[number];

// ---------- AI ----------
export const AI_MESSAGE_ROLES = ["USER", "ASSISTANT", "SYSTEM"] as const;
export type AiMessageRole = (typeof AI_MESSAGE_ROLES)[number];

// ---------- Settings groups ----------
export const SETTINGS_GROUPS = ["STORE", "SALES", "RECEIPT", "HARDWARE", "WORKFLOW", "AI", "SYSTEM"] as const;
export type SettingsGroup = (typeof SETTINGS_GROUPS)[number];

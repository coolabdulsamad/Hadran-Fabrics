import type {
  StockMovementType,
  SaleStatus,
  ReturnStatus,
  ReturnType,
  ApprovalType,
  ApprovalRequestStatus,
  PurchaseStatus,
  StockCountStatus,
  MessageReferenceType,
  ExpenseCategory,
  MoneySourceType,
} from "./constants";

/** Human-readable labels for domain enums (shared frontend ↔ backend). */

export const MOVEMENT_LABELS: Record<StockMovementType, string> = {
  STOCK_IN: "Stock In",
  STOCK_OUT: "Stock Out",
  ADJUSTMENT: "Adjustment",
  SALE: "Sale",
  SALE_VOID_REVERSAL: "Void Reversal",
  RETURN_RESTOCK: "Return Restock",
  EXCHANGE_OUT: "Exchange Out",
  EXCHANGE_IN: "Exchange In",
  PURCHASE_RECEIVED: "Purchase Received",
  DAMAGE: "Damage / Loss",
  COUNT_CORRECTION: "Count Correction",
  TRANSFER_OUT: "Branch Transfer Out",
  TRANSFER_IN: "Branch Transfer In",
  PRODUCTION_OUT: "Production Material Used",
  PRODUCTION_IN: "Production Output",
};

export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  HELD: "Held",
  COMPLETED: "Completed",
  VOIDED: "Voided",
  PARTIALLY_RETURNED: "Partially Returned",
  RETURNED: "Returned",
};

export const RETURN_TYPE_LABELS: Record<ReturnType, string> = {
  RETURN: "Return",
  EXCHANGE: "Exchange",
};

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  COMPLETED: "Completed",
};

export const APPROVAL_TYPE_LABELS: Record<ApprovalType, string> = {
  PRODUCT_CREATE: "Add Product",
  PRODUCT_EDIT: "Edit Product",
  PRODUCT_DELETE: "Delete Product",
  STOCK_ADJUSTMENT: "Stock Adjustment",
  VOID_SALE: "Void Sale",
  RETURN_PROCESS: "Process Return",
  CUSTOMER_DISCOUNT: "Customer Discount",
  EXPENSE_RECORD: "Record Expense",
  BRANCH_TRANSFER: "Branch Transfer",
  PRODUCTION_RUN: "Production Run",
};

export const APPROVAL_STATUS_LABELS: Record<ApprovalRequestStatus, string> = {
  PENDING: "Pending Review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = {
  PENDING: "Pending",
  PARTIALLY_RECEIVED: "Partially Received",
  RECEIVED: "Received",
  CANCELLED: "Cancelled",
};

export const STOCK_COUNT_STATUS_LABELS: Record<StockCountStatus, string> = {
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const REFERENCE_TYPE_LABELS: Record<MessageReferenceType, string> = {
  PRODUCT: "Product",
  SALE: "Sale",
  STOCK_MOVEMENT: "Stock Movement",
  CUSTOMER: "Customer",
  PURCHASE: "Purchase",
};

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  RENT: "Rent",
  UTILITIES: "Utilities",
  SALARIES: "Salaries & Wages",
  SUPPLIES: "Supplies",
  EQUIPMENT: "Equipment",
  MAINTENANCE: "Maintenance & Repairs",
  TRANSPORT: "Transport & Logistics",
  MARKETING: "Marketing & Adverts",
  PACKAGING: "Packaging",
  CLEANING: "Cleaning",
  TAXES_LEVIES: "Taxes & Levies",
  OTHER: "Other",
};

export const MONEY_SOURCE_LABELS: Record<MoneySourceType, string> = {
  SALE: "Sale",
  SALE_VOID_REVERSAL: "Sale Void Reversal",
  RETURN_REFUND: "Return Refund",
  EXCHANGE_TOPUP: "Exchange Top-up",
  EXPENSE: "Expense",
  PURCHASE: "Stock Purchase",
  LAUNDRY_PAYMENT: "Laundry Payment",
  TAILORING_PAYMENT: "Tailoring Payment",
  MANUAL_IN: "Manual Money In",
  MANUAL_OUT: "Manual Money Out",
};

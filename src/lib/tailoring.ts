import type { OrderPaymentStatus, ProductionStatus, TailoringOrderStatus } from "@contracts/constants";
import type { StatusTone } from "@/components/common/StatusBadge";

/**
 * HADRAN FABRICS MALL — tailoring & production UI helpers
 * Shared workflow order + badge tone maps so every tailoring/production
 * page renders statuses consistently.
 */

/** Forward path of the tailoring workflow (CANCELLED sits outside it). */
export const TAILORING_WORKFLOW_ORDER: TailoringOrderStatus[] = [
  "RECEIVED",
  "CUTTING",
  "SEWING",
  "FINISHING",
  "FITTING",
  "READY",
  "DELIVERED",
];

export function tailoringStatusTone(status: TailoringOrderStatus): StatusTone {
  switch (status) {
    case "RECEIVED":
      return "sky";
    case "CUTTING":
    case "SEWING":
    case "FINISHING":
      return "amber";
    case "FITTING":
      return "gold";
    case "READY":
      return "green";
    case "DELIVERED":
      return "navy";
    case "CANCELLED":
      return "red";
    default:
      return "gray";
  }
}

export function paymentStatusTone(status: OrderPaymentStatus): StatusTone {
  switch (status) {
    case "PAID":
      return "green";
    case "PART_PAID":
      return "amber";
    case "UNPAID":
      return "red";
    default:
      return "gray";
  }
}

export function productionStatusTone(status: ProductionStatus): StatusTone {
  switch (status) {
    case "DRAFT":
      return "gray";
    case "IN_PROGRESS":
      return "amber";
    case "COMPLETED":
      return "green";
    case "CANCELLED":
      return "red";
    default:
      return "gray";
  }
}

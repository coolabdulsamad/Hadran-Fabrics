import type { LaundryOrderStatus, OrderPaymentStatus } from "@contracts/constants";
import type { StatusTone } from "@/components/common/StatusBadge";

/**
 * HADRAN FABRICS MALL — laundry UI helpers
 * Shared workflow order + badge tone maps so every laundry page renders
 * statuses consistently.
 */

/** Forward path of the laundry workflow (CANCELLED sits outside it). */
export const LAUNDRY_WORKFLOW: LaundryOrderStatus[] = [
  "RECEIVED",
  "WASHING",
  "DRYING",
  "IRONING",
  "READY",
  "COLLECTED",
];

export function laundryStatusTone(status: LaundryOrderStatus): StatusTone {
  switch (status) {
    case "RECEIVED":
      return "sky";
    case "WASHING":
    case "DRYING":
    case "IRONING":
      return "amber";
    case "READY":
      return "green";
    case "COLLECTED":
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

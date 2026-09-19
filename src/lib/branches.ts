import type { BranchStatus, TransferStatus } from "@contracts/constants";

/**
 * HADRAN FABRICS MALL — branch & transfer UI helpers
 * StatusBadge tones for branch and transfer lifecycles.
 */

export function branchStatusTone(status: BranchStatus): "green" | "gray" {
  return status === "ACTIVE" ? "green" : "gray";
}

export function transferStatusTone(status: TransferStatus): "amber" | "navy" | "sky" | "green" | "red" | "gray" {
  switch (status) {
    case "PENDING_APPROVAL":
      return "amber";
    case "APPROVED":
      return "navy";
    case "IN_TRANSIT":
      return "sky";
    case "RECEIVED":
      return "green";
    case "REJECTED":
      return "red";
    case "CANCELLED":
      return "gray";
  }
}

/** Forward path for the transfer stepper on the detail page. */
export const TRANSFER_FLOW: TransferStatus[] = ["PENDING_APPROVAL", "APPROVED", "IN_TRANSIT", "RECEIVED"];

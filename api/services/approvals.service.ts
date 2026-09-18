import { eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { approvalRequests, settings } from "@db/schema";
import type { ApprovalType } from "@contracts/constants";
import type { UserRole } from "@contracts/roles";

/**
 * HADRAN FABRICS MALL — Approval workflow service
 * When a MANAGER performs a gated action (add/edit/delete product, stock
 * adjustment, sale void…), the action is parked as an approval request
 * for an Admin / Super Admin to review. Admins always apply directly.
 */

interface WorkflowSettings {
  managerRequiresApproval: boolean;
  gatedActions: string[];
  autoApproveAdmin: boolean;
}

async function readJsonSetting<T>(key: string, fallback: T): Promise<T> {
  const db = getDb();
  const row = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  if (!row[0]) return fallback;
  try {
    return JSON.parse(row[0].value) as T;
  } catch {
    return fallback;
  }
}

export async function getWorkflowSettings(): Promise<WorkflowSettings> {
  const [managerRequiresApproval, gatedActions, autoApproveAdmin] = await Promise.all([
    readJsonSetting("workflow.manager_requires_approval", true),
    readJsonSetting<string[]>("workflow.gated_actions", [
      "PRODUCT_CREATE",
      "PRODUCT_EDIT",
      "PRODUCT_DELETE",
      "STOCK_ADJUSTMENT",
      "VOID_SALE",
      "RETURN_PROCESS",
      "CUSTOMER_DISCOUNT",
      "EXPENSE_RECORD",
    ]),
    readJsonSetting("workflow.auto_approve_admin", true),
  ]);
  return { managerRequiresApproval, gatedActions, autoApproveAdmin };
}

/** Does this action by this role have to wait for admin approval? */
export async function isApprovalGated(role: UserRole, actionType: ApprovalType): Promise<boolean> {
  if (role !== "MANAGER") return false; // only managers are gated; admins apply directly
  const wf = await getWorkflowSettings();
  return wf.managerRequiresApproval && wf.gatedActions.includes(actionType);
}

export interface SubmitApprovalInput {
  requestType: ApprovalType;
  entityType: string;
  entityId?: number | null;
  payload: Record<string, unknown>;
  summary: string;
  requesterId: number;
}

export async function submitApproval(input: SubmitApprovalInput) {
  const db = getDb();
  const [row] = await db
    .insert(approvalRequests)
    .values({
      requestType: input.requestType,
      status: "PENDING",
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      payload: input.payload,
      summary: input.summary,
      requesterId: input.requesterId,
    })
    .$returningId();

  // Notify everyone who can review it.
  try {
    const { notifyRoles } = await import("./notifications.service");
    await notifyRoles(["ADMIN", "SUPER_ADMIN"], {
      type: "APPROVAL",
      title: `Approval needed: ${input.requestType.replace(/_/g, " ")}`,
      body: input.summary,
      link: "/approvals",
    });
  } catch {
    /* notifications must never break the main flow */
  }
  return row.id;
}

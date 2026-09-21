import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { approvalRequests, customers, productImages, products } from "@db/schema";
import { getBranchBalance, recordMovement } from "./inventory.service";
import { getMainBranchId } from "./branch.service";
import { voidSale } from "./sales-void.service";
import { processReturn } from "./returns.service";
import { logAudit } from "./audit.service";
import type { ApprovalType, PaymentMethod, ReturnCondition, ReturnType } from "@contracts/constants";

/**
 * HADRAN FABRICS MALL — approval application service.
 * When an Admin approves a parked manager action, this service applies
 * the stored payload: create/edit/archive products, stock adjustments,
 * sale voids, returns/exchanges and customer discount changes.
 * All appliers re-validate against live data — the world may have
 * changed since the request was parked.
 */

type Payload = Record<string, unknown>;

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function bool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/** Map a stored product payload to DB column values (mirrors products.router toDbValues). */
function productDbValues(p: Payload, userId: number) {
  return {
    sku: str(p.sku).trim().toUpperCase(),
    barcode: strOrNull(p.barcode),
    name: str(p.name).trim(),
    description: strOrNull(p.description),
    categoryId: num(p.categoryId),
    supplierId: p.supplierId ? num(p.supplierId) : null,
    productType: str(p.productType) as never,
    materialType: (p.materialType ? str(p.materialType) : null) as never,
    color: strOrNull(p.color),
    pattern: strOrNull(p.pattern),
    brand: strOrNull(p.brand),
    unitOfMeasure: str(p.unitOfMeasure) as never,
    packSize: p.packSize ? num(p.packSize) : null,
    allowFractional: bool(p.allowFractional),
    costPrice: num(p.costPrice),
    sellingPrice: num(p.sellingPrice),
    wholesalePrice: p.wholesalePrice ? num(p.wholesalePrice) : null,
    taxRate: num(p.taxRate),
    taxExempt: bool(p.taxExempt),
    discountEligible: bool(p.discountEligible),
    reorderLevel: num(p.reorderLevel),
    shelfLocation: strOrNull(p.shelfLocation),
    primaryImageUrl: strOrNull(p.primaryImageUrl),
    status: (str(p.status, "ACTIVE") || "ACTIVE") as never,
    updatedBy: userId,
  };
}

export interface ApplyResult {
  description: string;
  entityId?: number | null;
}

export async function applyApproval(
  requestType: ApprovalType,
  payload: Payload,
  reviewer: { id: number; fullName: string },
): Promise<ApplyResult> {
  const db = getDb();

  switch (requestType) {
    /* ------------------------------ PRODUCTS ------------------------------ */
    case "PRODUCT_CREATE": {
      const sku = str(payload.sku).trim().toUpperCase();
      const dup = await db.select().from(products).where(eq(products.sku, sku)).limit(1);
      if (dup[0]) throw new TRPCError({ code: "CONFLICT", message: `SKU "${sku}" is now in use — product may have been created meanwhile.` });

      const [row] = await db
        .insert(products)
        .values({ ...productDbValues(payload, reviewer.id), createdBy: reviewer.id, approvalStatus: "APPROVED" })
        .$returningId();

      const imageUrls = Array.isArray(payload.imageUrls) ? (payload.imageUrls as string[]).filter((u) => typeof u === "string" && u) : [];
      if (imageUrls.length) {
        await db.insert(productImages).values(imageUrls.map((url, i) => ({ productId: row.id, url, sortOrder: i, isPrimary: i === 0 })));
      }

      const opening = num(payload.openingStock);
      if (opening > 0) {
        await recordMovement({
          productId: row.id,
          movementType: "STOCK_IN",
          quantity: opening,
          unit: str(payload.unitOfMeasure) as never,
          branchId: payload.branchId != null ? num(payload.branchId) : null,
          referenceType: "PRODUCT",
          referenceId: row.id,
          reason: "Opening stock (approved request)",
          performedBy: reviewer.id,
        });
      }
      return { description: `Product "${str(payload.name)}" (${sku}) created with approved data.`, entityId: row.id };
    }

    case "PRODUCT_EDIT": {
      const changes = (payload.changes ?? {}) as Payload;
      const id = num(changes.id);
      const existing = await db.select().from(products).where(eq(products.id, id)).limit(1);
      if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Product no longer exists." });

      await db.update(products).set({ ...productDbValues(changes, reviewer.id), approvalStatus: "APPROVED" }).where(eq(products.id, id));

      const imageUrls = Array.isArray(changes.imageUrls) ? (changes.imageUrls as string[]).filter((u) => typeof u === "string" && u) : null;
      if (imageUrls) {
        await db.delete(productImages).where(eq(productImages.productId, id));
        if (imageUrls.length) {
          await db.insert(productImages).values(imageUrls.map((url, i) => ({ productId: id, url, sortOrder: i, isPrimary: i === 0 })));
        }
      }
      return { description: `Approved edits applied to "${existing[0].name}" (${existing[0].sku}).`, entityId: id };
    }

    case "PRODUCT_DELETE": {
      const before = (payload.before ?? {}) as Payload;
      const id = num(before.id);
      const existing = await db.select().from(products).where(eq(products.id, id)).limit(1);
      if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Product no longer exists." });
      await db.update(products).set({ status: "ARCHIVED", approvalStatus: "APPROVED", updatedBy: reviewer.id }).where(eq(products.id, id));
      return { description: `Product "${existing[0].name}" (${existing[0].sku}) archived.`, entityId: id };
    }

    /* ----------------------------- INVENTORY ------------------------------ */
    case "STOCK_ADJUSTMENT": {
      const productId = num(payload.productId);
      const found = await db.select().from(products).where(eq(products.id, productId)).limit(1);
      if (!found[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Product no longer exists." });

      // Recompute the delta against the CURRENT balance AT THE REQUEST'S
      // BRANCH (stock may have moved since the request was parked).
      const adjBranchId = payload.branchId != null ? num(payload.branchId) : await getMainBranchId();
      const branchBalance = adjBranchId != null ? await getBranchBalance(productId, adjBranchId) : found[0].currentStock;
      const delta = Number((num(payload.newBalance) - branchBalance).toFixed(3));
      if (delta === 0) {
        return { description: `Stock of "${found[0].name}" already at ${payload.newBalance} — no movement needed.`, entityId: productId };
      }
      await recordMovement({
        productId,
        movementType: "ADJUSTMENT",
        quantity: delta,
        branchId: payload.branchId != null ? num(payload.branchId) : null,
        referenceType: "ADJUSTMENT",
        reason: `${str(payload.reason)} (approved request)`,
        notes: strOrNull(payload.notes),
        performedBy: reviewer.id,
      });
      return { description: `Stock of "${found[0].name}" adjusted to ${payload.newBalance} (${delta > 0 ? "+" : ""}${delta}).`, entityId: productId };
    }

    /* ------------------------------- SALES -------------------------------- */
    case "VOID_SALE": {
      const result = await voidSale(num(payload.saleId), str(payload.reason, "Void approved"), reviewer.id);
      return { description: `Sale ${result.receiptNo} voided — stock restored.`, entityId: num(payload.saleId) };
    }

    case "RETURN_PROCESS": {
      const items = Array.isArray(payload.items) ? (payload.items as Payload[]) : [];
      const result = await processReturn({
        saleId: num(payload.saleId),
        type: str(payload.type, "RETURN") as ReturnType,
        reason: str(payload.reason, "Approved return"),
        notes: strOrNull(payload.notes) ?? undefined,
        refundMethod: (payload.refundMethod ? str(payload.refundMethod) : null) as PaymentMethod | null,
        items: items.map((i) => ({
          saleItemId: num(i.saleItemId),
          quantity: num(i.quantity),
          condition: str(i.condition, "GOOD") as ReturnCondition,
          restock: bool(i.restock, true),
          exchangeProductId: i.exchangeProductId ? num(i.exchangeProductId) : null,
          exchangeQty: i.exchangeQty ? num(i.exchangeQty) : null,
        })),
        actorId: reviewer.id,
        actorName: reviewer.fullName,
      });
      return { description: `Return ${result.reference} processed — refund ₦${result.refundAmount.toLocaleString()}${result.topUpAmount > 0 ? `, top-up ₦${result.topUpAmount.toLocaleString()}` : ""}, stock updated.`, entityId: result.returnId };
    }

    /* ------------------------------ CUSTOMERS ----------------------------- */
    case "CUSTOMER_DISCOUNT": {
      if (payload.action === "create") {
        const [row] = await db
          .insert(customers)
          .values({
            code: `CUS-APPR-${Date.now().toString(36).toUpperCase()}`,
            fullName: str(payload.fullName).trim(),
            phone: str(payload.phone).trim(),
            email: strOrNull(payload.email),
            address: strOrNull(payload.address),
            gender: (payload.gender ? str(payload.gender) : null) as never,
            birthday: payload.birthday ? new Date(str(payload.birthday)) : null,
            notes: strOrNull(payload.notes),
            discountPercent: num(payload.discountPercent),
            discountNote: strOrNull(payload.discountNote),
            createdBy: reviewer.id,
          })
          .$returningId();
        return { description: `Customer "${str(payload.fullName)}" registered with ${num(payload.discountPercent)}% discount.`, entityId: row.id };
      }

      const id = num(payload.id);
      const existing = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
      if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Customer no longer exists." });
      await db
        .update(customers)
        .set({
          fullName: str(payload.fullName).trim(),
          phone: str(payload.phone).trim(),
          email: strOrNull(payload.email),
          address: strOrNull(payload.address),
          gender: (payload.gender ? str(payload.gender) : null) as never,
          birthday: payload.birthday ? new Date(str(payload.birthday)) : null,
          notes: strOrNull(payload.notes),
          discountPercent: num(payload.discountPercent),
          discountNote: strOrNull(payload.discountNote),
        })
        .where(eq(customers.id, id));
      return {
        description: `${existing[0].fullName}'s discount updated ${existing[0].discountPercent}% → ${num(payload.discountPercent)}%.`,
        entityId: id,
      };
    }

    /* ------------------------------ EXPENSES ------------------------------ */
    case "EXPENSE_RECORD": {
      const { applyExpenseRecord } = await import("./expenses.service");
      const amount = num(payload.amount);
      if (amount <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Expense amount must be greater than zero." });
      const result = await applyExpenseRecord(
        {
          section: str(payload.section, "SALES") as never,
          category: str(payload.category, "OTHER") as never,
          description: str(payload.description).trim(),
          vendor: strOrNull(payload.vendor),
          amount,
          paymentMethod: str(payload.paymentMethod, "CASH") as never,
          expenseDate: str(payload.expenseDate) || new Date().toISOString().slice(0, 10),
          notes: strOrNull(payload.notes),
        },
        num(payload.requestedBy) || reviewer.id, // record under the manager who asked
        payload.branchId ? num(payload.branchId) : null,
      );
      return { description: `Expense ${result.refNo} recorded — ₦${amount.toLocaleString()}.`, entityId: result.expenseId };
    }

    default:
      throw new TRPCError({ code: "BAD_REQUEST", message: `No applier for request type ${requestType}.` });
  }
}

/** Mark the request as approved/rejected and audit it. */
export async function resolveApproval(
  requestId: number,
  status: "APPROVED" | "REJECTED",
  reviewer: { id: number; fullName: string },
  reviewNote: string | undefined,
  appliedDescription?: string,
) {
  const db = getDb();
  await db
    .update(approvalRequests)
    .set({ status, reviewerId: reviewer.id, reviewNote: reviewNote ?? null, reviewedAt: new Date() })
    .where(eq(approvalRequests.id, requestId));

  // Tell the requester the outcome.
  try {
    const rows = await db.select().from(approvalRequests).where(eq(approvalRequests.id, requestId)).limit(1);
    const req = rows[0];
    if (req && req.requesterId !== reviewer.id) {
      const { notifyUsers } = await import("./notifications.service");
      await notifyUsers([req.requesterId], {
        type: "APPROVAL_RESULT",
        title: status === "APPROVED" ? "Your request was approved" : "Your request was rejected",
        body: `${req.requestType.replace(/_/g, " ")} — ${req.summary}${status === "APPROVED" && appliedDescription ? `. ${appliedDescription}` : ""}${status === "REJECTED" && reviewNote ? `. Note: ${reviewNote}` : ""}`,
        link: "/approvals",
      });
    }
  } catch {
    /* notifications must never break the main flow */
  }

  await logAudit({
    actorId: reviewer.id,
    action: status === "APPROVED" ? "approval.approve" : "approval.reject",
    entityType: "APPROVAL",
    entityId: requestId,
    description:
      status === "APPROVED"
        ? `${reviewer.fullName} approved request #${requestId}. ${appliedDescription ?? ""}`
        : `${reviewer.fullName} rejected request #${requestId}${reviewNote ? ` — ${reviewNote}` : ""}.`,
  });
}

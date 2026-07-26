import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { saleItems, sales } from "@db/schema";
import { recordMovement } from "./inventory.service";
import { logAudit } from "./audit.service";

/**
 * HADRAN FABRICS MALL — sale void execution.
 * Shared by the sales router (admin direct void) and the approval
 * workflow (applying a manager's approved void request).
 * Restores stock for every non-returned quantity and marks the sale VOIDED.
 */

export interface VoidSaleResult {
  receiptNo: string;
  grandTotal: number;
}

export async function voidSale(
  saleId: number,
  reason: string,
  actorId: number,
  meta?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<VoidSaleResult> {
  const db = getDb();

  const saleRows = await db.select().from(sales).where(eq(sales.id, saleId)).limit(1);
  const sale = saleRows[0];
  if (!sale) throw new TRPCError({ code: "NOT_FOUND", message: "Sale not found." });
  if (sale.status !== "COMPLETED") {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Only completed sales can be voided — this one is ${sale.status}.` });
  }

  const items = await db.select().from(saleItems).where(eq(saleItems.saleId, saleId));

  await db.transaction(async (tx) => {
    for (const item of items) {
      const restoreQty = Number((item.quantity - item.returnedQty).toFixed(3));
      if (restoreQty <= 0) continue;
      await recordMovement(
        {
          productId: item.productId,
          movementType: "SALE_VOID_REVERSAL",
          quantity: restoreQty,
          referenceType: "SALE",
          referenceId: saleId,
          reason: `Void ${sale.receiptNo} — ${reason}`,
          performedBy: actorId,
        },
        tx,
      );
    }
    await tx
      .update(sales)
      .set({ status: "VOIDED", voidedBy: actorId, voidReason: reason, voidedAt: new Date() })
      .where(eq(sales.id, saleId));
  });

  await logAudit({
    actorId,
    action: "sale.void",
    entityType: "SALE",
    entityId: saleId,
    description: `Voided sale ${sale.receiptNo} (₦${sale.grandTotal.toLocaleString()}) — stock restored. Reason: ${reason}.`,
    beforeData: { status: "COMPLETED", grandTotal: sale.grandTotal },
    afterData: { status: "VOIDED" },
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
  });

  return { receiptNo: sale.receiptNo, grandTotal: sale.grandTotal };
}

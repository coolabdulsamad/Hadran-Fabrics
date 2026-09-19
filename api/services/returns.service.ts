import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { customers, products, returnItems, returns, saleItems, sales } from "@db/schema";
import { recordMovement, type Tx } from "./inventory.service";
import { recordMoneyMovement } from "./money.service";
import { logAudit } from "./audit.service";
import type { PaymentMethod, ReturnCondition, ReturnType } from "@contracts/constants";

/**
 * HADRAN FABRICS MALL — returns & exchanges processing service.
 * Shared by the returns router (admin direct processing) and the
 * approval workflow (applying a manager's approved request).
 *
 * Everything runs in ONE transaction:
 *   return rows → stock restock / exchange movements → sale item
 *   returnedQty → sale status → customer stats reversal.
 */

export interface ReturnItemInput {
  saleItemId: number;
  quantity: number;
  condition: ReturnCondition;
  restock: boolean;
  exchangeProductId?: number | null;
  exchangeQty?: number | null;
}

export interface ProcessReturnInput {
  saleId: number;
  type: ReturnType;
  reason: string;
  notes?: string;
  refundMethod?: PaymentMethod | null;
  items: ReturnItemInput[];
  actorId: number;
  actorName: string;
  /** IP / user-agent for the audit trail. */
  meta?: { ipAddress?: string | null; userAgent?: string | null };
}

export interface ProcessReturnResult {
  returnId: number;
  reference: string;
  refundAmount: number;
  exchangeValue: number;
  topUpAmount: number;
  saleStatus: "PARTIALLY_RETURNED" | "RETURNED";
}

async function nextReturnReference(tx: Tx): Promise<string> {
  const rows = await tx.select({ id: returns.id }).from(returns);
  return `RTN-${String(rows.length + 1).padStart(6, "0")}`;
}

export async function processReturn(input: ProcessReturnInput): Promise<ProcessReturnResult> {
  const db = getDb();

  return db.transaction(async (tx) => {
    /* ------------------------- validate sale ------------------------- */
    const saleRows = await tx.select().from(sales).where(eq(sales.id, input.saleId)).limit(1);
    const sale = saleRows[0];
    if (!sale) throw new TRPCError({ code: "NOT_FOUND", message: "Sale not found." });
    if (sale.status !== "COMPLETED" && sale.status !== "PARTIALLY_RETURNED") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Only completed (or partially returned) sales can be returned — this one is ${sale.status}.`,
      });
    }

    /* ------------------------- validate items ------------------------ */
    const lines: {
      saleItem: typeof saleItems.$inferSelect;
      item: ReturnItemInput;
      unitRefund: number;
      lineRefund: number;
    }[] = [];

    for (const item of input.items) {
      const siRows = await tx.select().from(saleItems).where(eq(saleItems.id, item.saleItemId)).limit(1);
      const si = siRows[0];
      if (!si || si.saleId !== sale.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Sale item #${item.saleItemId} does not belong to this sale.` });
      }
      const returnable = Number((si.quantity - si.returnedQty).toFixed(3));
      if (item.quantity <= 0 || item.quantity > returnable) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `"${si.productName}": only ${returnable} ${si.unit.toLowerCase()}(s) can still be returned.`,
        });
      }
      if (input.type === "EXCHANGE") {
        if (!item.exchangeProductId || !item.exchangeQty || item.exchangeQty <= 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Exchange for "${si.productName}" needs a replacement product and quantity.`,
          });
        }
        const exRows = await tx.select().from(products).where(eq(products.id, item.exchangeProductId)).limit(1);
        if (!exRows[0] || exRows[0].status !== "ACTIVE") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Exchange product is not available." });
        }
        if (exRows[0].currentStock < item.exchangeQty) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Not enough stock of "${exRows[0].name}" for the exchange (${exRows[0].currentStock} left).`,
          });
        }
      }
      // lineTotal already includes allocated discounts — the true amount paid.
      const unitRefund = si.quantity > 0 ? si.lineTotal / si.quantity : 0;
      const lineRefund = Number((unitRefund * item.quantity).toFixed(2));
      lines.push({ saleItem: si, item, unitRefund, lineRefund });
    }

    const returnValue = Number(lines.reduce((s, l) => s + l.lineRefund, 0).toFixed(2));

    /* ------------------------- exchange value ------------------------ */
    let exchangeValue = 0;
    const exchangeLines: { product: typeof products.$inferSelect; qty: number; value: number }[] = [];
    if (input.type === "EXCHANGE") {
      for (const l of lines) {
        const exRows = await tx.select().from(products).where(eq(products.id, l.item.exchangeProductId!)).limit(1);
        const ex = exRows[0]!;
        const value = Number((ex.sellingPrice * l.item.exchangeQty!).toFixed(2));
        exchangeValue = Number((exchangeValue + value).toFixed(2));
        exchangeLines.push({ product: ex, qty: l.item.exchangeQty!, value });
      }
    }

    // For pure returns the customer gets the full value back; for exchanges
    // only the positive difference is refunded — when the replacement costs
    // MORE, the customer pays the difference as a top-up instead.
    const refundAmount =
      input.type === "RETURN" ? returnValue : Number(Math.max(0, returnValue - exchangeValue).toFixed(2));
    const topUpAmount =
      input.type === "EXCHANGE" ? Number(Math.max(0, exchangeValue - returnValue).toFixed(2)) : 0;

    /* ------------------------- insert return ------------------------- */
    const reference = await nextReturnReference(tx);
    const [ret] = await tx
      .insert(returns)
      .values({
        reference,
        saleId: sale.id,
        type: input.type,
        reason: input.reason,
        notes: input.notes ?? null,
        status: "COMPLETED",
        refundAmount,
        exchangeValue,
        topUpAmount,
        refundMethod: input.refundMethod ?? null,
        processedBy: input.actorId,
        approvedBy: input.actorId,
        processedAt: new Date(),
      })
      .$returningId();

    /* --------------------- items + stock movements -------------------- */
    for (const l of lines) {
      const exLine = input.type === "EXCHANGE" ? exchangeLines.find((e) => e.product.id === l.item.exchangeProductId) : undefined;

      await tx.insert(returnItems).values({
        returnId: ret.id,
        saleItemId: l.saleItem.id,
        productId: l.saleItem.productId,
        quantity: l.item.quantity,
        unit: l.saleItem.unit,
        condition: l.item.condition,
        restock: l.item.restock && l.item.condition === "GOOD",
        exchangeProductId: l.item.exchangeProductId ?? null,
        exchangeQty: l.item.exchangeQty ?? null,
        exchangeUnitPrice: exLine ? exLine.product.sellingPrice : null,
        exchangeLineTotal: exLine ? exLine.value : null,
        unitPrice: Number(l.unitRefund.toFixed(2)),
        lineTotal: l.lineRefund,
      });

      // Restock good items; damaged goods never re-enter sellable stock
      // (the return_items row + audit log capture the write-off).
      if (l.item.restock && l.item.condition === "GOOD") {
        await recordMovement(
          {
            productId: l.saleItem.productId,
            movementType: "RETURN_RESTOCK",
            quantity: l.item.quantity,
            branchId: sale.branchId ?? null,
            referenceType: "RETURN",
            referenceId: ret.id,
            reason: `Return ${reference} — ${input.reason}`,
            performedBy: input.actorId,
          },
          tx,
        );
      }

      // Exchange: the replacement leaves the shelves.
      if (exLine) {
        await recordMovement(
          {
            productId: exLine.product.id,
            movementType: "EXCHANGE_OUT",
            quantity: -exLine.qty,
            branchId: sale.branchId ?? null,
            referenceType: "RETURN",
            referenceId: ret.id,
            reason: `Exchange out ${reference} — replaces ${l.saleItem.productName}`,
            performedBy: input.actorId,
          },
          tx,
        );
      }

      await tx
        .update(saleItems)
        .set({ returnedQty: Number((l.saleItem.returnedQty + l.item.quantity).toFixed(3)) })
        .where(eq(saleItems.id, l.saleItem.id));
    }

    /* ----------------------- sale status update ----------------------- */
    const allItems = await tx.select().from(saleItems).where(eq(saleItems.saleId, sale.id));
    const fullyReturned = allItems.every((i) => Number(i.returnedQty) >= Number(i.quantity));
    const saleStatus = fullyReturned ? "RETURNED" : "PARTIALLY_RETURNED";
    await tx.update(sales).set({ status: saleStatus }).where(eq(sales.id, sale.id));

    /* ------------------------- money ledger --------------------------- */
    if (refundAmount > 0) {
      await recordMoneyMovement(
        {
          direction: "OUT",
          section: "SALES",
          branchId: sale.branchId ?? null,
          sourceType: "RETURN_REFUND",
          sourceId: ret.id,
          sourceRef: reference,
          amount: refundAmount,
          paymentMethod: input.refundMethod ?? "CASH",
          note: `Refund on ${sale.receiptNo} (${reference})`,
          createdBy: input.actorId,
        },
        tx,
      );
    }
    if (topUpAmount > 0) {
      await recordMoneyMovement(
        {
          direction: "IN",
          section: "SALES",
          branchId: sale.branchId ?? null,
          sourceType: "EXCHANGE_TOPUP",
          sourceId: ret.id,
          sourceRef: reference,
          amount: topUpAmount,
          paymentMethod: input.refundMethod ?? "CASH",
          note: `Exchange top-up on ${sale.receiptNo} (${reference})`,
          createdBy: input.actorId,
        },
        tx,
      );
    }

    /* -------------------- customer stats reversal --------------------- */
    if (sale.customerId && refundAmount > 0) {
      const custRows = await tx.select().from(customers).where(eq(customers.id, sale.customerId)).limit(1);
      if (custRows[0]) {
        await tx
          .update(customers)
          .set({ totalSpent: Number(Math.max(0, custRows[0].totalSpent - refundAmount).toFixed(2)) })
          .where(eq(customers.id, sale.customerId));
      }
    }

    /* ----------------------------- audit ------------------------------ */
    await logAudit({
      actorId: input.actorId,
      action: input.type === "EXCHANGE" ? "return.exchange" : "return.process",
      entityType: "RETURN",
      entityId: ret.id,
      description:
        `${input.type === "EXCHANGE" ? "Exchange" : "Return"} ${reference} against ${sale.receiptNo}: ` +
        `${lines.length} line(s), value ₦${returnValue.toLocaleString()}` +
        (input.type === "EXCHANGE" ? `, exchange value ₦${exchangeValue.toLocaleString()}` : "") +
        (refundAmount > 0 ? `, refund ₦${refundAmount.toLocaleString()}` : "") +
        (topUpAmount > 0 ? `, top-up paid ₦${topUpAmount.toLocaleString()}` : "") +
        ` — ${input.reason}. By ${input.actorName}.`,
      afterData: { reference, saleId: sale.id, returnValue, exchangeValue, refundAmount, topUpAmount, saleStatus },
      ipAddress: input.meta?.ipAddress,
      userAgent: input.meta?.userAgent,
    });

    return { returnId: ret.id, reference, refundAmount, exchangeValue, topUpAmount, saleStatus };
  });
}

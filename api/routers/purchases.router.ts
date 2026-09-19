import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { asc, count, desc, eq } from "drizzle-orm";
import { createRouter } from "../middleware";
import { permissionProcedure } from "../trpc";
import { getDb } from "../queries/connection";
import { products, purchaseItems, purchases, suppliers, users } from "@db/schema";
import { recordMovement } from "../services/inventory.service";
import { recordMoneyMovement } from "../services/money.service";
import { logAudit, requestMeta } from "../services/audit.service";
import { UNITS } from "@contracts/constants";

/**
 * HADRAN FABRICS MALL — purchase orders router
 * Create POs from suppliers, receive goods into stock (full or partial),
 * cancel pending orders. All receiving flows through the stock ledger.
 */
export const purchasesRouter = createRouter({
  list: permissionProcedure("inventory.manage_purchases").query(async () => {
    const db = getDb();
    return db
      .select({
        id: purchases.id,
        reference: purchases.reference,
        status: purchases.status,
        totalCost: purchases.totalCost,
        expectedAt: purchases.expectedAt,
        receivedAt: purchases.receivedAt,
        createdAt: purchases.createdAt,
        supplierName: suppliers.name,
        creatorName: users.fullName,
        itemCount: count(purchaseItems.id),
      })
      .from(purchases)
      .leftJoin(suppliers, eq(purchases.supplierId, suppliers.id))
      .leftJoin(users, eq(purchases.createdBy, users.id))
      .leftJoin(purchaseItems, eq(purchaseItems.purchaseId, purchases.id))
      .groupBy(purchases.id)
      .orderBy(desc(purchases.createdAt))
      .limit(100);
  }),

  byId: permissionProcedure("inventory.manage_purchases")
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select({ purchase: purchases, supplierName: suppliers.name, creatorName: users.fullName })
        .from(purchases)
        .leftJoin(suppliers, eq(purchases.supplierId, suppliers.id))
        .leftJoin(users, eq(purchases.createdBy, users.id))
        .where(eq(purchases.id, input.id))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Purchase order not found." });

      const items = await db
        .select({
          id: purchaseItems.id,
          productId: purchaseItems.productId,
          quantity: purchaseItems.quantity,
          unit: purchaseItems.unit,
          unitCost: purchaseItems.unitCost,
          lineTotal: purchaseItems.lineTotal,
          receivedQty: purchaseItems.receivedQty,
          productName: products.name,
          sku: products.sku,
          unitOfMeasure: products.unitOfMeasure,
        })
        .from(purchaseItems)
        .innerJoin(products, eq(purchaseItems.productId, products.id))
        .where(eq(purchaseItems.purchaseId, input.id))
        .orderBy(asc(purchaseItems.id));

      return { ...rows[0], items };
    }),

  create: permissionProcedure("inventory.manage_purchases")
    .input(
      z.object({
        supplierId: z.number().int().positive().nullable().optional(),
        notes: z.string().max(1000).optional(),
        expectedAt: z.string().optional(), // ISO date
        tax: z.number().min(0).default(0),
        items: z
          .array(
            z.object({
              productId: z.number().int().positive(),
              quantity: z.number().positive(),
              unit: z.enum(UNITS),
              unitCost: z.number().min(0),
            }),
          )
          .min(1, "Add at least one item"),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();

      const [refRow] = await db.select({ value: count() }).from(purchases);
      const reference = `PO-${String((refRow?.value ?? 0) + 1).padStart(6, "0")}`;

      const subtotal = Number(
        input.items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0).toFixed(2),
      );
      const totalCost = Number((subtotal + input.tax).toFixed(2));

      const [po] = await db
        .insert(purchases)
        .values({
          reference,
          supplierId: input.supplierId ?? null,
          status: "PENDING",
          subtotal,
          tax: input.tax,
          totalCost,
          notes: input.notes ?? null,
          expectedAt: input.expectedAt ? new Date(input.expectedAt) : null,
          createdBy: ctx.user.id,
        })
        .$returningId();

      await db.insert(purchaseItems).values(
        input.items.map((i) => ({
          purchaseId: po.id,
          productId: i.productId,
          quantity: i.quantity,
          unit: i.unit,
          unitCost: i.unitCost,
          lineTotal: Number((i.quantity * i.unitCost).toFixed(2)),
        })),
      );

      await logAudit({
        actorId: ctx.user.id,
        action: "purchase.create",
        entityType: "PURCHASE",
        entityId: po.id,
        description: `Created purchase order ${reference} — ${input.items.length} item(s), total ₦${totalCost.toLocaleString()}.`,
        afterData: { reference, subtotal, tax: input.tax, totalCost, items: input.items.length },
        ...requestMeta(ctx.req),
      });
      return { id: po.id, reference };
    }),

  /** Receive goods into stock — full or per-item quantities. */
  receive: permissionProcedure("inventory.manage_purchases")
    .input(
      z.object({
        purchaseId: z.number().int().positive(),
        /** itemId → qty being received now (defaults handled client-side). */
        receipts: z.array(
          z.object({
            itemId: z.number().int().positive(),
            quantity: z.number().positive(),
          }),
        ),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const poRows = await db.select().from(purchases).where(eq(purchases.id, input.purchaseId)).limit(1);
      const po = poRows[0];
      if (!po) throw new TRPCError({ code: "NOT_FOUND", message: "Purchase order not found." });
      if (po.status === "RECEIVED" || po.status === "CANCELLED") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `This purchase order is already ${po.status.toLowerCase()}.` });
      }

      const items = await db.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, input.purchaseId));

      for (const receipt of input.receipts) {
        const item = items.find((i) => i.id === receipt.itemId);
        if (!item) continue;
        const remaining = Number((item.quantity - item.receivedQty).toFixed(3));
        if (receipt.quantity > remaining + 0.0001) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Cannot receive ${receipt.quantity} — only ${remaining} remaining for one of the items.`,
          });
        }

        await recordMovement({
          productId: item.productId,
          movementType: "PURCHASE_RECEIVED",
          quantity: receipt.quantity,
          unit: item.unit,
          branchId: po.branchId ?? ctx.activeBranchId,
          referenceType: "PURCHASE",
          referenceId: input.purchaseId,
          reason: `Purchase order ${po.reference}`,
          performedBy: ctx.user.id,
        });

        await db
          .update(purchaseItems)
          .set({ receivedQty: Number((item.receivedQty + receipt.quantity).toFixed(3)) })
          .where(eq(purchaseItems.id, item.id));
      }

      // money ledger — goods received = money out to the supplier
      const receivedValue = input.receipts.reduce((sum, receipt) => {
        const item = items.find((i) => i.id === receipt.itemId);
        return item ? sum + receipt.quantity * item.unitCost : sum;
      }, 0);
      if (receivedValue > 0) {
        await recordMoneyMovement({
          direction: "OUT",
          section: "SALES",
          branchId: po.branchId ?? null,
          sourceType: "PURCHASE",
          sourceId: po.id,
          sourceRef: po.reference,
          amount: Number(receivedValue.toFixed(2)),
          paymentMethod: "OTHER",
          note: `Stock received on ${po.reference} (supplier payment)`,
          createdBy: ctx.user.id,
        });
      }

      // Recompute PO status
      const updated = await db.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, input.purchaseId));
      const fullyReceived = updated.every((i) => i.receivedQty >= i.quantity - 0.0001);
      await db
        .update(purchases)
        .set({
          status: fullyReceived ? "RECEIVED" : "PARTIALLY_RECEIVED",
          receivedAt: fullyReceived ? new Date() : null,
        })
        .where(eq(purchases.id, input.purchaseId));

      await logAudit({
        actorId: ctx.user.id,
        action: "purchase.receive",
        entityType: "PURCHASE",
        entityId: input.purchaseId,
        description: `Received ${input.receipts.length} item line(s) on ${po.reference} — status: ${fullyReceived ? "RECEIVED" : "PARTIALLY_RECEIVED"}.`,
        ...requestMeta(ctx.req),
      });
      return { status: fullyReceived ? ("RECEIVED" as const) : ("PARTIALLY_RECEIVED" as const) };
    }),

  cancel: permissionProcedure("inventory.manage_purchases")
    .input(z.object({ purchaseId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const poRows = await db.select().from(purchases).where(eq(purchases.id, input.purchaseId)).limit(1);
      if (!poRows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Purchase order not found." });
      if (poRows[0].status !== "PENDING") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only pending orders can be cancelled." });
      }
      await db.update(purchases).set({ status: "CANCELLED" }).where(eq(purchases.id, input.purchaseId));
      await logAudit({
        actorId: ctx.user.id,
        action: "purchase.cancel",
        entityType: "PURCHASE",
        entityId: input.purchaseId,
        description: `Cancelled purchase order ${poRows[0].reference}.`,
        ...requestMeta(ctx.req),
      });
      return { ok: true };
    }),
});

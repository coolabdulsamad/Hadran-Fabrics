import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, lte, sql, type SQL } from "drizzle-orm";
import { createRouter } from "../middleware";
import { permissionProcedure } from "../trpc";
import { getDb } from "../queries/connection";
import { categories, products, stockCountItems, stockCounts, stockMovements, users } from "@db/schema";
import { recordMovement } from "../services/inventory.service";
import { isApprovalGated, submitApproval } from "../services/approvals.service";
import { logAudit, requestMeta } from "../services/audit.service";
import { STOCK_MOVEMENT_TYPES } from "@contracts/constants";

/**
 * HADRAN FABRICS MALL — inventory router
 * Stock ledger, stock-in/out, adjustments (approval-gated for managers),
 * physical stock counts, low-stock watch and valuation overview.
 */

async function nextReference(prefix: string, table: "stock_counts"): Promise<string> {
  const db = getDb();
  if (table === "stock_counts") {
    const [row] = await db.select({ value: count() }).from(stockCounts);
    return `SC-${String((row?.value ?? 0) + 1).padStart(6, "0")}`;
  }
  return `${prefix}-000001`;
}

export const inventoryRouter = createRouter({
  /* --------------------------- MOVEMENT LEDGER --------------------------- */
  movements: permissionProcedure("inventory.view")
    .input(
      z.object({
        productId: z.number().int().positive().optional(),
        movementType: z.enum(STOCK_MOVEMENT_TYPES).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(5).max(100).default(20),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const conds: SQL[] = [];
      if (input.productId) conds.push(eq(stockMovements.productId, input.productId));
      if (input.movementType) conds.push(eq(stockMovements.movementType, input.movementType));
      const where = conds.length ? and(...conds) : undefined;

      const [total] = await db.select({ value: count() }).from(stockMovements).where(where);

      const items = await db
        .select({
          id: stockMovements.id,
          movementType: stockMovements.movementType,
          quantity: stockMovements.quantity,
          unit: stockMovements.unit,
          balanceAfter: stockMovements.balanceAfter,
          referenceType: stockMovements.referenceType,
          referenceId: stockMovements.referenceId,
          reason: stockMovements.reason,
          notes: stockMovements.notes,
          createdAt: stockMovements.createdAt,
          productName: products.name,
          sku: products.sku,
          performedByName: users.fullName,
        })
        .from(stockMovements)
        .innerJoin(products, eq(stockMovements.productId, products.id))
        .leftJoin(users, eq(stockMovements.performedBy, users.id))
        .where(where)
        .orderBy(desc(stockMovements.createdAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      return { items, total: total?.value ?? 0, page: input.page, pageSize: input.pageSize };
    }),

  /* ------------------------------ STOCK IN ------------------------------- */
  stockIn: permissionProcedure("inventory.stock_in")
    .input(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().positive("Quantity must be greater than zero"),
        reason: z.string().min(2, "Give a reason (e.g. New supply)").max(255),
        notes: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const result = await recordMovement({
        productId: input.productId,
        movementType: "STOCK_IN",
        quantity: input.quantity,
        branchId: ctx.activeBranchId,
        referenceType: "MANUAL",
        reason: input.reason,
        notes: input.notes ?? null,
        performedBy: ctx.user.id,
      });
      await logAudit({
        actorId: ctx.user.id,
        action: "inventory.stock_in",
        entityType: "PRODUCT",
        entityId: input.productId,
        description: `Stock-in +${input.quantity} for "${result.product.name}" (${input.reason}). Balance: ${result.newBalance}.`,
        beforeData: { stock: result.product.currentStock },
        afterData: { stock: result.newBalance },
        ...requestMeta(ctx.req),
      });
      return result;
    }),

  /* ------------------------------ STOCK OUT ------------------------------ */
  stockOut: permissionProcedure("inventory.stock_out")
    .input(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().positive("Quantity must be greater than zero"),
        reason: z.string().min(2, "Give a reason (e.g. Damaged, Transfer)").max(255),
        notes: z.string().max(1000).optional(),
        isDamage: z.boolean().default(false),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const result = await recordMovement({
        productId: input.productId,
        movementType: input.isDamage ? "DAMAGE" : "STOCK_OUT",
        quantity: -input.quantity,
        branchId: ctx.activeBranchId,
        referenceType: "MANUAL",
        reason: input.reason,
        notes: input.notes ?? null,
        performedBy: ctx.user.id,
      });
      await logAudit({
        actorId: ctx.user.id,
        action: "inventory.stock_out",
        entityType: "PRODUCT",
        entityId: input.productId,
        description: `Stock-out −${input.quantity} for "${result.product.name}" (${input.reason}). Balance: ${result.newBalance}.`,
        beforeData: { stock: result.product.currentStock },
        afterData: { stock: result.newBalance },
        ...requestMeta(ctx.req),
      });
      return result;
    }),

  /* ----------------------------- ADJUSTMENT ------------------------------ */
  adjust: permissionProcedure("inventory.adjust")
    .input(
      z.object({
        productId: z.number().int().positive(),
        newBalance: z.number().min(0, "Balance cannot be negative"),
        reason: z.string().min(3, "A clear reason is required for adjustments").max(255),
        notes: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const found = await db.select().from(products).where(eq(products.id, input.productId)).limit(1);
      const product = found[0];
      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found." });

      const delta = Number((input.newBalance - product.currentStock).toFixed(3));
      if (delta === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "New balance equals current stock — nothing to adjust." });

      // ---- Manager gate ----
      if (await isApprovalGated(ctx.user.role, "STOCK_ADJUSTMENT")) {
        const requestId = await submitApproval({
          requestType: "STOCK_ADJUSTMENT",
          entityType: "PRODUCT",
          entityId: input.productId,
          payload: {
            productId: input.productId,
            productName: product.name,
            sku: product.sku,
            currentStock: product.currentStock,
            newBalance: input.newBalance,
            delta,
            reason: input.reason,
            notes: input.notes ?? null,
            branchId: ctx.activeBranchId,
          },
          summary: `Adjust "${product.name}" stock ${product.currentStock} → ${input.newBalance} (${delta > 0 ? "+" : ""}${delta})`,
          requesterId: ctx.user.id,
        });
        await logAudit({
          actorId: ctx.user.id,
          action: "inventory.adjust.requested",
          entityType: "APPROVAL",
          entityId: requestId,
          description: `${ctx.user.fullName} requested stock adjustment for "${product.name}" — pending admin approval.`,
          ...requestMeta(ctx.req),
        });
        return { pending: true as const, approvalId: requestId };
      }

      const result = await recordMovement({
        productId: input.productId,
        movementType: "ADJUSTMENT",
        quantity: delta,
        branchId: ctx.activeBranchId,
        referenceType: "ADJUSTMENT",
        reason: input.reason,
        notes: input.notes ?? null,
        performedBy: ctx.user.id,
      });
      await logAudit({
        actorId: ctx.user.id,
        action: "inventory.adjust",
        entityType: "PRODUCT",
        entityId: input.productId,
        description: `Adjusted "${product.name}" stock ${product.currentStock} → ${input.newBalance} (${input.reason}).`,
        beforeData: { stock: product.currentStock },
        afterData: { stock: result.newBalance },
        ...requestMeta(ctx.req),
      });
      return { pending: false as const, ...result };
    }),

  /* ------------------------------ LOW STOCK ------------------------------ */
  lowStock: permissionProcedure("inventory.view").query(async () => {
    const db = getDb();
    return db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        unitOfMeasure: products.unitOfMeasure,
        currentStock: products.currentStock,
        reorderLevel: products.reorderLevel,
        sellingPrice: products.sellingPrice,
        categoryName: categories.name,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(and(eq(products.status, "ACTIVE"), lte(products.currentStock, products.reorderLevel)))
      .orderBy(asc(products.currentStock));
  }),

  /* ------------------------------ OVERVIEW ------------------------------- */
  overview: permissionProcedure("inventory.view").query(async () => {
    const db = getDb();
    const byCategory = await db
      .select({
        categoryId: categories.id,
        categoryName: categories.name,
        productCount: count(products.id),
        totalCost: sql<number>`COALESCE(SUM(${products.currentStock} * ${products.costPrice}), 0)`,
        totalRetail: sql<number>`COALESCE(SUM(${products.currentStock} * ${products.sellingPrice}), 0)`,
      })
      .from(categories)
      .leftJoin(products, and(eq(products.categoryId, categories.id), eq(products.status, "ACTIVE")))
      .groupBy(categories.id)
      .orderBy(asc(categories.sortOrder));

    const [totals] = await db
      .select({
        products: count(products.id),
        cost: sql<number>`COALESCE(SUM(${products.currentStock} * ${products.costPrice}), 0)`,
        retail: sql<number>`COALESCE(SUM(${products.currentStock} * ${products.sellingPrice}), 0)`,
      })
      .from(products)
      .where(eq(products.status, "ACTIVE"));

    return {
      byCategory: byCategory.map((c) => ({ ...c, totalCost: Number(c.totalCost), totalRetail: Number(c.totalRetail) })),
      totals: {
        products: totals?.products ?? 0,
        cost: Number(totals?.cost ?? 0),
        retail: Number(totals?.retail ?? 0),
      },
    };
  }),

  /* ---------------------------- STOCK COUNTS ----------------------------- */
  listCounts: permissionProcedure("inventory.stock_count").query(async () => {
    const db = getDb();
    return db
      .select({
        id: stockCounts.id,
        reference: stockCounts.reference,
        status: stockCounts.status,
        notes: stockCounts.notes,
        startedAt: stockCounts.startedAt,
        completedAt: stockCounts.completedAt,
        startedByName: users.fullName,
      })
      .from(stockCounts)
      .leftJoin(users, eq(stockCounts.startedBy, users.id))
      .orderBy(desc(stockCounts.startedAt))
      .limit(50);
  }),

  startCount: permissionProcedure("inventory.stock_count")
    .input(z.object({ notes: z.string().max(1000).optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const reference = await nextReference("SC", "stock_counts");

      const [countRow] = await db
        .insert(stockCounts)
        .values({ reference, status: "IN_PROGRESS", notes: input.notes ?? null, startedBy: ctx.user.id })
        .$returningId();

      // Snapshot expected balances for every active product
      const allProducts = await db.select().from(products).where(eq(products.status, "ACTIVE"));
      if (allProducts.length) {
        await db.insert(stockCountItems).values(
          allProducts.map((p) => ({
            countId: countRow.id,
            productId: p.id,
            expectedQty: p.currentStock,
          })),
        );
      }

      await logAudit({
        actorId: ctx.user.id,
        action: "inventory.count_start",
        entityType: "STOCK_COUNT",
        entityId: countRow.id,
        description: `Started stock count ${reference} covering ${allProducts.length} products.`,
        ...requestMeta(ctx.req),
      });
      return { id: countRow.id, reference };
    }),

  getCount: permissionProcedure("inventory.stock_count")
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getDb();
      const countRows = await db
        .select({ count: stockCounts, startedByName: users.fullName })
        .from(stockCounts)
        .leftJoin(users, eq(stockCounts.startedBy, users.id))
        .where(eq(stockCounts.id, input.id))
        .limit(1);
      if (!countRows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Stock count not found." });

      const items = await db
        .select({
          id: stockCountItems.id,
          productId: stockCountItems.productId,
          expectedQty: stockCountItems.expectedQty,
          countedQty: stockCountItems.countedQty,
          variance: stockCountItems.variance,
          notes: stockCountItems.notes,
          productName: products.name,
          sku: products.sku,
          unitOfMeasure: products.unitOfMeasure,
          categoryName: categories.name,
        })
        .from(stockCountItems)
        .innerJoin(products, eq(stockCountItems.productId, products.id))
        .innerJoin(categories, eq(products.categoryId, categories.id))
        .where(eq(stockCountItems.countId, input.id))
        .orderBy(asc(categories.sortOrder), asc(products.name));

      return { ...countRows[0], items };
    }),

  saveCountEntries: permissionProcedure("inventory.stock_count")
    .input(
      z.object({
        countId: z.number().int().positive(),
        entries: z.array(
          z.object({
            itemId: z.number().int().positive(),
            countedQty: z.number().min(0),
          }),
        ),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const countRow = await db.select().from(stockCounts).where(eq(stockCounts.id, input.countId)).limit(1);
      if (!countRow[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Stock count not found." });
      if (countRow[0].status !== "IN_PROGRESS") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This stock count is already closed." });
      }

      for (const entry of input.entries) {
        const item = await db.select().from(stockCountItems).where(eq(stockCountItems.id, entry.itemId)).limit(1);
        if (!item[0] || item[0].countId !== input.countId) continue;
        const variance = Number((entry.countedQty - item[0].expectedQty).toFixed(3));
        await db
          .update(stockCountItems)
          .set({ countedQty: entry.countedQty, variance })
          .where(eq(stockCountItems.id, entry.itemId));
      }
      return { ok: true };
    }),

  completeCount: permissionProcedure("inventory.stock_count")
    .input(z.object({ countId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const countRow = await db.select().from(stockCounts).where(eq(stockCounts.id, input.countId)).limit(1);
      if (!countRow[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Stock count not found." });
      if (countRow[0].status !== "IN_PROGRESS") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This stock count is already closed." });
      }

      const items = await db.select().from(stockCountItems).where(eq(stockCountItems.countId, input.countId));
      let corrections = 0;

      for (const item of items) {
        if (item.countedQty == null) continue;
        const variance = Number((item.countedQty - item.expectedQty).toFixed(3));
        if (variance === 0) continue;

        await recordMovement({
          productId: item.productId,
          movementType: "COUNT_CORRECTION",
          quantity: variance,
          branchId: countRow[0].branchId ?? ctx.activeBranchId,
          referenceType: "STOCK_COUNT",
          referenceId: input.countId,
          reason: `Stock count ${countRow[0].reference}`,
          performedBy: ctx.user.id,
        });
        corrections++;
      }

      await db
        .update(stockCounts)
        .set({ status: "COMPLETED", completedAt: new Date(), approvedBy: ctx.user.id })
        .where(eq(stockCounts.id, input.countId));

      await logAudit({
        actorId: ctx.user.id,
        action: "inventory.count_complete",
        entityType: "STOCK_COUNT",
        entityId: input.countId,
        description: `Completed stock count ${countRow[0].reference} — ${corrections} correction(s) applied.`,
        ...requestMeta(ctx.req),
      });
      return { corrections };
    }),

  cancelCount: permissionProcedure("inventory.stock_count")
    .input(z.object({ countId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await db
        .update(stockCounts)
        .set({ status: "CANCELLED", completedAt: new Date() })
        .where(and(eq(stockCounts.id, input.countId), eq(stockCounts.status, "IN_PROGRESS")));
      await logAudit({
        actorId: ctx.user.id,
        action: "inventory.count_cancel",
        entityType: "STOCK_COUNT",
        entityId: input.countId,
        description: `Cancelled stock count #${input.countId}.`,
        ...requestMeta(ctx.req),
      });
      return { ok: true };
    }),
});

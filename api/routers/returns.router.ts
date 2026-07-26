import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, like, sql, type SQL } from "drizzle-orm";
import { createRouter } from "../middleware";
import { permissionProcedure } from "../trpc";
import { getDb } from "../queries/connection";
import { customers, products, returnItems, returns, saleItems, sales, users } from "@db/schema";
import { isApprovalGated, submitApproval } from "../services/approvals.service";
import { processReturn } from "../services/returns.service";
import { logAudit, requestMeta } from "../services/audit.service";
import { PAYMENT_METHODS, RETURN_CONDITIONS, RETURN_STATUSES, RETURN_TYPES } from "@contracts/constants";

/**
 * HADRAN FABRICS MALL — returns & exchanges router
 * Manager-only area (sales role has no access). Manager requests are
 * gated through the admin approval workflow; Admins process directly.
 * Stock is restored via the movement ledger and sale item returnedQty
 * is tracked so nothing can be returned twice.
 */

const returnItemInput = z.object({
  saleItemId: z.number().int().positive(),
  quantity: z.number().positive("Quantity must be greater than zero"),
  condition: z.enum(RETURN_CONDITIONS).default("GOOD"),
  restock: z.boolean().default(true),
  exchangeProductId: z.number().int().positive().nullable().optional(),
  exchangeQty: z.number().positive().nullable().optional(),
});

const createReturnInput = z.object({
  saleId: z.number().int().positive(),
  type: z.enum(RETURN_TYPES).default("RETURN"),
  reason: z.string().min(3, "A reason is required").max(255),
  notes: z.string().max(1000).optional(),
  refundMethod: z.enum(PAYMENT_METHODS).nullable().optional(),
  items: z.array(returnItemInput).min(1, "Select at least one item"),
});

export type CreateReturnInput = z.infer<typeof createReturnInput>;

export const returnsRouter = createRouter({
  /** Look up a sale by receipt number for the return form. */
  lookupSale: permissionProcedure("returns.view")
    .input(z.object({ receiptNo: z.string().min(3).max(30) }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select({
          sale: sales,
          cashierName: users.fullName,
          customerName: customers.fullName,
        })
        .from(sales)
        .leftJoin(users, eq(sales.cashierId, users.id))
        .leftJoin(customers, eq(sales.customerId, customers.id))
        .where(like(sales.receiptNo, `%${input.receiptNo.trim()}%`))
        .orderBy(desc(sales.createdAt))
        .limit(5);
      if (rows.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "No sale matches that receipt number." });
      return rows;
    }),

  /** Sale items with remaining returnable quantity. */
  saleItems: permissionProcedure("returns.view")
    .input(z.object({ saleId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getDb();
      const items = await db.select().from(saleItems).where(eq(saleItems.saleId, input.saleId));
      return items.map((i) => ({
        ...i,
        returnableQty: Number((i.quantity - i.returnedQty).toFixed(3)),
      }));
    }),

  /** Create a return/exchange — manager is gated, admin processes directly. */
  create: permissionProcedure("returns.process")
    .input(createReturnInput)
    .mutation(async ({ input, ctx }) => {
      const meta = requestMeta(ctx.req);
      const db = getDb();

      const saleRows = await db.select().from(sales).where(eq(sales.id, input.saleId)).limit(1);
      if (!saleRows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Sale not found." });
      const sale = saleRows[0];

      // ---- Manager gate: park for admin approval ----
      if (await isApprovalGated(ctx.user.role, "RETURN_PROCESS")) {
        // Enrich the payload with display-friendly line details so the
        // reviewer sees exactly WHAT is being returned / exchanged.
        const saleItemRows = await db.select().from(saleItems).where(eq(saleItems.saleId, input.saleId));
        const itemDetails = [] as {
          productName: string; quantity: number; unit: string; condition: string; restock: boolean;
          lineRefund: number; exchangeProductName: string | null; exchangeQty: number | null;
          exchangeUnitPrice: number | null; exchangeLineTotal: number | null;
        }[];
        for (const it of input.items) {
          const si = saleItemRows.find((r) => r.id === it.saleItemId);
          if (!si) continue;
          const unitRefund = si.quantity > 0 ? si.lineTotal / si.quantity : 0;
          let exchangeProductName: string | null = null;
          let exchangeUnitPrice: number | null = null;
          let exchangeLineTotal: number | null = null;
          if (it.exchangeProductId && it.exchangeQty) {
            const ex = await db.select().from(products).where(eq(products.id, it.exchangeProductId)).limit(1);
            if (ex[0]) {
              exchangeProductName = `${ex[0].name} (${ex[0].sku})`;
              exchangeUnitPrice = ex[0].sellingPrice;
              exchangeLineTotal = Number((ex[0].sellingPrice * it.exchangeQty).toFixed(2));
            }
          }
          itemDetails.push({
            productName: si.productName,
            quantity: it.quantity,
            unit: si.unit,
            condition: it.condition,
            restock: it.restock,
            lineRefund: Number((unitRefund * it.quantity).toFixed(2)),
            exchangeProductName,
            exchangeQty: it.exchangeQty ?? null,
            exchangeUnitPrice,
            exchangeLineTotal,
          });
        }
        const requestId = await submitApproval({
          requestType: "RETURN_PROCESS",
          entityType: "SALE",
          entityId: input.saleId,
          payload: { ...input, itemDetails, receiptNo: sale.receiptNo, grandTotal: sale.grandTotal },
          summary: `${input.type === "EXCHANGE" ? "Exchange" : "Return"} against ${sale.receiptNo} — ${input.items.length} line(s): ${input.reason}`,
          requesterId: ctx.user.id,
        });
        await logAudit({
          actorId: ctx.user.id,
          action: "return.requested",
          entityType: "APPROVAL",
          entityId: requestId,
          description: `${ctx.user.fullName} requested a ${input.type.toLowerCase()} against ${sale.receiptNo} — pending admin approval.`,
          ...meta,
        });
        return { pending: true as const, approvalId: requestId };
      }

      // ---- Admin: process immediately ----
      const result = await processReturn({
        ...input,
        notes: input.notes,
        refundMethod: input.refundMethod ?? null,
        actorId: ctx.user.id,
        actorName: ctx.user.fullName,
        meta,
      });
      return { pending: false as const, ...result };
    }),

  list: permissionProcedure("returns.view")
    .input(
      z.object({
        status: z.enum(RETURN_STATUSES).optional(),
        type: z.enum(RETURN_TYPES).optional(),
        search: z.string().max(40).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(5).max(50).default(15),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const conds: SQL[] = [];
      if (input.status) conds.push(eq(returns.status, input.status));
      if (input.type) conds.push(eq(returns.type, input.type));
      if (input.search) conds.push(like(returns.reference, `%${input.search}%`));
      const where = conds.length ? and(...conds) : undefined;

      const [total] = await db.select({ value: count() }).from(returns).where(where);
      const items = await db
        .select({
          return: returns,
          receiptNo: sales.receiptNo,
          customerName: customers.fullName,
          processorName: users.fullName,
        })
        .from(returns)
        .innerJoin(sales, eq(returns.saleId, sales.id))
        .leftJoin(customers, eq(sales.customerId, customers.id))
        .leftJoin(users, eq(returns.processedBy, users.id))
        .where(where)
        .orderBy(desc(returns.createdAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      return { items, total: total?.value ?? 0, page: input.page, pageSize: input.pageSize };
    }),

  byId: permissionProcedure("returns.view")
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select({
          return: returns,
          receiptNo: sales.receiptNo,
          customerName: customers.fullName,
          processorName: users.fullName,
        })
        .from(returns)
        .innerJoin(sales, eq(returns.saleId, sales.id))
        .leftJoin(customers, eq(sales.customerId, customers.id))
        .leftJoin(users, eq(returns.processedBy, users.id))
        .where(eq(returns.id, input.id))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Return not found." });

      const items = await db
        .select({
          item: returnItems,
          productName: products.name,
          exchangeProductName: sql<string | null>`(SELECT name FROM products WHERE id = ${returnItems.exchangeProductId})`,
        })
        .from(returnItems)
        .innerJoin(products, eq(returnItems.productId, products.id))
        .where(eq(returnItems.returnId, input.id));

      return { ...rows[0], items };
    }),
});

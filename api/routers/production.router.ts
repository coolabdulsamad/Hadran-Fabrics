import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, gte, like, lte, or, sql, type SQL } from "drizzle-orm";
import { createRouter } from "../middleware";
import { permissionProcedure } from "../trpc";
import { getDb } from "../queries/connection";
import { productionOrders, productionMaterials, products, users } from "@db/schema";
import {
  cancelProductionRun,
  completeProductionRun,
  createProductionRun,
  startProductionRun,
} from "../services/production.service";
import { logAudit, requestMeta } from "../services/audit.service";
import { branchScope, getMainBranchId } from "../services/branch.service";
import { PRODUCTION_STATUSES, UNITS } from "@contracts/constants";

/**
 * HADRAN FABRICS MALL — production router
 * In-house production runs: consume shop materials into new sellable
 * products. Stock movements (PRODUCTION_OUT / PRODUCTION_IN) are written
 * inside the service layer via recordMovement.
 */

const listInput = z.object({
  status: z.enum(PRODUCTION_STATUSES).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().max(120).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(5).max(200).default(25),
});

function buildFilters(input: Omit<z.infer<typeof listInput>, "page" | "pageSize">, branch: Parameters<typeof branchScope>[1]): SQL[] {
  const filters: SQL[] = [];
  const scope = branchScope(productionOrders.branchId, branch);
  if (scope) filters.push(scope);
  if (input.status) filters.push(eq(productionOrders.status, input.status));
  if (input.dateFrom) filters.push(gte(productionOrders.createdAt, new Date(`${input.dateFrom}T00:00:00`)));
  if (input.dateTo) filters.push(lte(productionOrders.createdAt, new Date(`${input.dateTo}T23:59:59`)));
  if (input.search?.trim()) {
    const q = `%${input.search.trim()}%`;
    filters.push(or(like(productionOrders.refNo, q), like(products.name, q))!);
  }
  return filters;
}

export const productionRouter = createRouter({
  /* ------------------------------ SUMMARY ------------------------------ */

  summary: permissionProcedure("production.view").query(async ({ ctx }) => {
    const db = getDb();
    const scope = branchScope(productionOrders.branchId, ctx.activeBranch);
    const statusRows = await db
      .select({ status: productionOrders.status, count: count() })
      .from(productionOrders)
      .where(scope)
      .groupBy(productionOrders.status);
    const board = Object.fromEntries(statusRows.map((r) => [r.status, r.count]));

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [monthRows] = await db.execute(sql`
      SELECT COUNT(*) AS runs, COALESCE(SUM(${productionOrders.outputQty}), 0) AS units
      FROM ${productionOrders}
      WHERE ${productionOrders.status} = 'COMPLETED'
        AND ${productionOrders.completedAt} >= ${monthStart}
        ${scope ? sql`AND ${scope}` : sql``}
    `);
    const month = (monthRows as unknown as { runs: string; units: string }[])[0];

    return {
      board,
      completedThisMonth: Number(month?.runs ?? 0),
      unitsThisMonth: Number(month?.units ?? 0),
    };
  }),

  /* ------------------------------ LIST ------------------------------ */

  list: permissionProcedure("production.view").input(listInput).query(async ({ input, ctx }) => {
    const db = getDb();
    const filters = buildFilters(input, ctx.activeBranch);
    const where = filters.length ? and(...filters) : undefined;

    const [totalRow] = await db
      .select({ value: count() })
      .from(productionOrders)
      .leftJoin(products, eq(productionOrders.outputProductId, products.id))
      .where(where);

    const rows = await db
      .select({
        run: productionOrders,
        outputProductName: products.name,
        requestedByName: users.fullName,
      })
      .from(productionOrders)
      .leftJoin(products, eq(productionOrders.outputProductId, products.id))
      .leftJoin(users, eq(productionOrders.requestedBy, users.id))
      .where(where)
      .orderBy(desc(productionOrders.createdAt), desc(productionOrders.id))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize);

    const ids = rows.map((r) => r.run.id);
    const materialCounts = ids.length
      ? await db
          .select({ productionId: productionMaterials.productionId, count: count() })
          .from(productionMaterials)
          .where(sql`${productionMaterials.productionId} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`)
          .groupBy(productionMaterials.productionId)
      : [];
    const countByRun = new Map(materialCounts.map((r) => [r.productionId, r.count]));

    return {
      rows: rows.map((r) => ({
        ...r.run,
        outputProductName: r.outputProductName,
        requestedByName: r.requestedByName,
        materialCount: countByRun.get(r.run.id) ?? 0,
      })),
      total: totalRow?.value ?? 0,
      page: input.page,
      pageSize: input.pageSize,
    };
  }),

  /* ------------------------------ DETAIL ------------------------------ */

  getById: permissionProcedure("production.view")
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const [row] = await db
        .select({
          run: productionOrders,
          outputProductName: products.name,
          outputProductSku: products.sku,
          requestedByName: users.fullName,
        })
        .from(productionOrders)
        .leftJoin(products, eq(productionOrders.outputProductId, products.id))
        .leftJoin(users, eq(productionOrders.requestedBy, users.id))
        .where(and(eq(productionOrders.id, input.id), branchScope(productionOrders.branchId, ctx.activeBranch)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Production run not found." });

      // Materials are consumed from the run's branch — show THAT branch's
      // availability so the "enough stock to start?" check is branch-true.
      const stockBranchId = row.run.branchId ?? ctx.activeBranchId ?? (await getMainBranchId());
      const materials = await db
        .select({
          material: productionMaterials,
          currentStock:
            stockBranchId != null
              ? sql<string>`COALESCE((SELECT sl.quantity FROM stock_levels sl WHERE sl.product_id = ${productionMaterials.productId} AND sl.branch_id = ${stockBranchId}), 0)`
              : products.currentStock,
        })
        .from(productionMaterials)
        .leftJoin(products, eq(productionMaterials.productId, products.id))
        .where(eq(productionMaterials.productionId, input.id))
        .orderBy(asc(productionMaterials.id));

      let approvedByName: string | null = null;
      if (row.run.approvedBy != null) {
        const [approver] = await db
          .select({ fullName: users.fullName })
          .from(users)
          .where(eq(users.id, row.run.approvedBy))
          .limit(1);
        approvedByName = approver?.fullName ?? null;
      }

      return {
        ...row.run,
        outputProductName: row.outputProductName,
        outputProductSku: row.outputProductSku,
        requestedByName: row.requestedByName,
        approvedByName,
        materials: materials.map((m) => ({ ...m.material, currentStock: m.currentStock })),
      };
    }),

  /* ------------------------------ WRITES ------------------------------ */

  create: permissionProcedure("production.manage")
    .input(
      z.object({
        outputProductId: z.number().int().positive(),
        outputQty: z.number().positive("Output quantity must be greater than zero"),
        notes: z.string().max(2000).optional(),
        materials: z
          .array(
            z.object({
              productId: z.number().int().positive(),
              quantity: z.number().positive("Material quantity must be greater than zero"),
              unit: z.enum(UNITS).optional(),
            }),
          )
          .min(1, "Add at least one material"),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const result = await createProductionRun(input, ctx.user.id, ctx.activeBranchId);
      await logAudit({
        actorId: ctx.user.id,
        action: "production.create",
        entityType: "PRODUCTION_ORDER",
        entityId: result.productionId,
        description: `Created production run ${result.refNo} — ${input.outputQty} unit(s) of product #${input.outputProductId} from ${input.materials.length} material(s).`,
        ...requestMeta(ctx.req),
      });
      return result;
    }),

  start: permissionProcedure("production.manage")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const result = await startProductionRun(input.id, ctx.user.id);
      await logAudit({
        actorId: ctx.user.id,
        action: "production.start",
        entityType: "PRODUCTION_ORDER",
        entityId: input.id,
        description: `Started production run #${input.id} — materials deducted from shop stock.`,
        ...requestMeta(ctx.req),
      });
      return result;
    }),

  complete: permissionProcedure("production.manage")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const result = await completeProductionRun(input.id, ctx.user.id, ctx.user.id);
      await logAudit({
        actorId: ctx.user.id,
        action: "production.complete",
        entityType: "PRODUCTION_ORDER",
        entityId: input.id,
        description: `Completed production run #${input.id} — finished output booked into stock.`,
        ...requestMeta(ctx.req),
      });
      return result;
    }),

  cancel: permissionProcedure("production.manage")
    .input(z.object({ id: z.number().int().positive(), reason: z.string().min(3, "Give a reason").max(300) }))
    .mutation(async ({ input, ctx }) => {
      const result = await cancelProductionRun(input.id, input.reason.trim(), ctx.user.id);
      await logAudit({
        actorId: ctx.user.id,
        action: "production.cancel",
        entityType: "PRODUCTION_ORDER",
        entityId: input.id,
        description: `Cancelled production run #${input.id} (${result.materialsReturned} material line(s) returned to stock). Reason: ${input.reason}.`,
        ...requestMeta(ctx.req),
      });
      return result;
    }),
});

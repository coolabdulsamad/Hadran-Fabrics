import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, gte, like, lt, or, sql, type SQL } from "drizzle-orm";
import { createRouter } from "../middleware";
import { permissionProcedure } from "../trpc";
import { getDb } from "../queries/connection";
import { auditLogs } from "@db/schema";

/**
 * HADRAN FABRICS MALL — audit log router (Admin / Super Admin).
 * Read-only window onto the full activity trail: filters, search,
 * summary stats, and before → after snapshots per entry.
 */

const listInput = z.object({
  search: z.string().max(120).optional(),
  action: z.string().max(60).optional(),
  entityType: z.string().max(50).optional(),
  actorId: z.number().int().positive().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(5).max(100).default(25),
});

export const auditRouter = createRouter({
  list: permissionProcedure("audit.view").input(listInput).query(async ({ input }) => {
    const db = getDb();
    const conds: SQL[] = [];
    if (input.search?.trim()) {
      const q = `%${input.search.trim()}%`;
      conds.push(
        or(like(auditLogs.description, q), like(auditLogs.actorName, q), like(auditLogs.entityId, q))!,
      );
    }
    if (input.action) conds.push(eq(auditLogs.action, input.action));
    if (input.entityType) conds.push(eq(auditLogs.entityType, input.entityType));
    if (input.actorId) conds.push(eq(auditLogs.actorId, input.actorId));
    if (input.from) conds.push(gte(auditLogs.createdAt, new Date(`${input.from}T00:00:00`)));
    if (input.to) conds.push(lt(auditLogs.createdAt, new Date(`${input.to}T23:59:59.999`)));

    const where = conds.length > 0 ? and(...conds) : undefined;
    const [totalRow] = await db.select({ value: count() }).from(auditLogs).where(where);
    const rows = await db
      .select({
        id: auditLogs.id,
        actorId: auditLogs.actorId,
        actorName: auditLogs.actorName,
        actorRole: auditLogs.actorRole,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        description: auditLogs.description,
        ipAddress: auditLogs.ipAddress,
        createdAt: auditLogs.createdAt,
        hasBefore: sql<boolean>`${auditLogs.beforeData} IS NOT NULL`,
        hasAfter: sql<boolean>`${auditLogs.afterData} IS NOT NULL`,
      })
      .from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.id))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize);

    return { rows, total: Number(totalRow?.value ?? 0), page: input.page, pageSize: input.pageSize };
  }),

  /** Distinct actions / entity types / actors for the filter dropdowns. */
  filters: permissionProcedure("audit.view").query(async () => {
    const db = getDb();
    const actions = await db
      .selectDistinct({ action: auditLogs.action })
      .from(auditLogs)
      .orderBy(auditLogs.action);
    const entities = await db
      .selectDistinct({ entityType: auditLogs.entityType })
      .from(auditLogs)
      .orderBy(auditLogs.entityType);
    const actors = await db
      .selectDistinct({ actorId: auditLogs.actorId, actorName: auditLogs.actorName })
      .from(auditLogs)
      .orderBy(auditLogs.actorName);
    return {
      actions: actions.map((r) => r.action),
      entityTypes: entities.map((r) => r.entityType),
      actors: actors.filter((a) => a.actorId != null).map((a) => ({ id: a.actorId!, name: a.actorName })),
    };
  }),

  /** Headline numbers for the stats cards. */
  stats: permissionProcedure("audit.view").query(async () => {
    const db = getDb();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [[total], [today], [actorsToday], topActions] = await Promise.all([
      db.select({ value: count() }).from(auditLogs),
      db.select({ value: count() }).from(auditLogs).where(gte(auditLogs.createdAt, todayStart)),
      db
        .select({ value: sql<number>`COUNT(DISTINCT ${auditLogs.actorId})` })
        .from(auditLogs)
        .where(gte(auditLogs.createdAt, todayStart)),
      db
        .select({ action: auditLogs.action, count: count() })
        .from(auditLogs)
        .where(gte(auditLogs.createdAt, weekAgo))
        .groupBy(auditLogs.action)
        .orderBy(desc(count()))
        .limit(6),
    ]);

    return {
      total: Number(total?.value ?? 0),
      today: Number(today?.value ?? 0),
      actorsToday: Number(actorsToday?.value ?? 0),
      topActions: topActions.map((r) => ({ action: r.action, count: Number(r.count) })),
    };
  }),

  /** Full entry including before/after snapshots and client metadata. */
  byId: permissionProcedure("audit.view")
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(auditLogs).where(eq(auditLogs.id, input.id)).limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Audit entry not found." });
      return rows[0];
    }),
});

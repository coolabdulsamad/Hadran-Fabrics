import { z } from "zod";
import { and, count, desc, eq, gte, like, lte, or, sql, type SQL } from "drizzle-orm";
import { createRouter } from "../middleware";
import { permissionProcedure } from "../trpc";
import { getDb } from "../queries/connection";
import { moneyMovements, users } from "@db/schema";
import { recordMoneyMovement } from "../services/money.service";
import { logAudit, requestMeta } from "../services/audit.service";
import {
  MONEY_DIRECTIONS,
  MONEY_SOURCE_TYPES,
  PAYMENT_METHODS,
  SECTIONS,
} from "@contracts/constants";

/**
 * HADRAN FABRICS MALL — money ledger router
 * Every naira in or out across all sections, with KPIs, trend series
 * and manual in/out entries (e.g. owner cash injection, bank deposit).
 */

const listInput = z.object({
  direction: z.enum(MONEY_DIRECTIONS).optional(),
  sourceType: z.enum(MONEY_SOURCE_TYPES).optional(),
  section: z.enum(SECTIONS).optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().max(120).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(5).max(200).default(25),
});

function buildFilters(input: Omit<z.infer<typeof listInput>, "page" | "pageSize">): SQL[] {
  const filters: SQL[] = [];
  if (input.direction) filters.push(eq(moneyMovements.direction, input.direction));
  if (input.sourceType) filters.push(eq(moneyMovements.sourceType, input.sourceType));
  if (input.section) filters.push(eq(moneyMovements.section, input.section));
  if (input.method) filters.push(eq(moneyMovements.paymentMethod, input.method));
  if (input.dateFrom) filters.push(gte(moneyMovements.createdAt, new Date(`${input.dateFrom}T00:00:00`)));
  if (input.dateTo) filters.push(lte(moneyMovements.createdAt, new Date(`${input.dateTo}T23:59:59`)));
  if (input.search?.trim()) {
    const q = `%${input.search.trim()}%`;
    filters.push(
      or(like(moneyMovements.refNo, q), like(moneyMovements.sourceRef, q), like(moneyMovements.note, q))!,
    );
  }
  return filters;
}

export const moneyRouter = createRouter({
  list: permissionProcedure("money.view").input(listInput).query(async ({ input }) => {
    const db = getDb();
    const filters = buildFilters(input);
    const where = filters.length ? and(...filters) : undefined;

    const [totalRow] = await db.select({ value: count() }).from(moneyMovements).where(where);
    const rows = await db
      .select({ movement: moneyMovements, createdByName: users.fullName })
      .from(moneyMovements)
      .leftJoin(users, eq(moneyMovements.createdBy, users.id))
      .where(where)
      .orderBy(desc(moneyMovements.createdAt), desc(moneyMovements.id))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize);

    return {
      rows: rows.map((r) => ({ ...r.movement, createdByName: r.createdByName })),
      total: totalRow?.value ?? 0,
      page: input.page,
      pageSize: input.pageSize,
    };
  }),

  /** All matching rows without paging — for CSV/Excel export and print. */
  exportRows: permissionProcedure("money.view").input(listInput.omit({ page: true, pageSize: true })).query(async ({ input }) => {
    const db = getDb();
    const filters = buildFilters(input);
    const where = filters.length ? and(...filters) : undefined;
    const rows = await db
      .select({ movement: moneyMovements, createdByName: users.fullName })
      .from(moneyMovements)
      .leftJoin(users, eq(moneyMovements.createdBy, users.id))
      .where(where)
      .orderBy(desc(moneyMovements.createdAt), desc(moneyMovements.id))
      .limit(10000);
    return rows.map((r) => ({ ...r.movement, createdByName: r.createdByName }));
  }),

  /** KPIs + 30-day in/out series + breakdowns for the ledger dashboard. */
  summary: permissionProcedure("money.view").query(async () => {
    const db = getDb();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const thirtyDaysAgo = new Date(todayStart);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);

    const sums = async (from: Date) => {
      const rows = await db
        .select({
          direction: moneyMovements.direction,
          total: sql<string>`COALESCE(SUM(${moneyMovements.amount}), 0)`,
        })
        .from(moneyMovements)
        .where(gte(moneyMovements.createdAt, from))
        .groupBy(moneyMovements.direction);
      const inTotal = Number(rows.find((r) => r.direction === "IN")?.total ?? 0);
      const outTotal = Number(rows.find((r) => r.direction === "OUT")?.total ?? 0);
      return { inTotal, outTotal, net: Number((inTotal - outTotal).toFixed(2)) };
    };

    const [today, month, allTime] = await Promise.all([
      sums(todayStart),
      sums(monthStart),
      sums(new Date(0)),
    ]);

    // Raw query: drizzle renders DATE(col) unqualified in the SELECT list but
    // qualified in GROUP BY, which trips sql_mode=only_full_group_by.
    const [dailyRows] = await db.execute(sql`
      SELECT DATE(${moneyMovements.createdAt}) AS day, ${moneyMovements.direction} AS direction, SUM(${moneyMovements.amount}) AS total
      FROM ${moneyMovements}
      WHERE ${moneyMovements.createdAt} >= ${thirtyDaysAgo}
      GROUP BY day, direction
      ORDER BY day
    `);
    const daily = dailyRows as unknown as { day: string; direction: string; total: string }[];

    const bySource = await db
      .select({
        sourceType: moneyMovements.sourceType,
        direction: moneyMovements.direction,
        total: sql<string>`SUM(${moneyMovements.amount})`,
        count: count(),
      })
      .from(moneyMovements)
      .where(gte(moneyMovements.createdAt, monthStart))
      .groupBy(moneyMovements.sourceType, moneyMovements.direction)
      .orderBy(desc(sql`SUM(${moneyMovements.amount})`));

    const bySection = await db
      .select({
        section: moneyMovements.section,
        direction: moneyMovements.direction,
        total: sql<string>`SUM(${moneyMovements.amount})`,
      })
      .from(moneyMovements)
      .where(gte(moneyMovements.createdAt, monthStart))
      .groupBy(moneyMovements.section, moneyMovements.direction);

    return { today, month, allTime, daily: daily.map((d) => ({ day: d.day, direction: d.direction, total: Number(d.total) })), bySource: bySource.map((s) => ({ sourceType: s.sourceType, direction: s.direction, total: Number(s.total), count: s.count })), bySection: bySection.map((s) => ({ section: s.section, direction: s.direction, total: Number(s.total) })) };
  }),

  /** Manual entries: owner cash injection, bank deposit, petty cash top-up… */
  recordManual: permissionProcedure("money.manage")
    .input(
      z.object({
        direction: z.enum(MONEY_DIRECTIONS),
        section: z.enum(SECTIONS).default("SALES"),
        amount: z.number().positive("Amount must be greater than zero"),
        paymentMethod: z.enum(PAYMENT_METHODS).default("CASH"),
        note: z.string().min(3, "Explain this entry").max(400),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const id = await recordMoneyMovement({
        direction: input.direction,
        section: input.section,
        branchId: ctx.user.branchId ?? null,
        sourceType: input.direction === "IN" ? "MANUAL_IN" : "MANUAL_OUT",
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        note: input.note.trim(),
        createdBy: ctx.user.id,
      });

      await logAudit({
        actorId: ctx.user.id,
        action: "money.manual_entry",
        entityType: "MONEY_MOVEMENT",
        entityId: id,
        description: `Manual money ${input.direction.toLowerCase()}: ₦${input.amount.toLocaleString()} — ${input.note.trim()}.`,
        ...requestMeta(ctx.req),
      });
      return { id };
    }),
});

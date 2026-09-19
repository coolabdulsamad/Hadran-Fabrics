import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, gte, like, lte, or, sql, type SQL } from "drizzle-orm";
import { createRouter } from "../middleware";
import { permissionProcedure } from "../trpc";
import { getDb } from "../queries/connection";
import {
  tailoringOrders,
  tailoringMeasurements,
  tailoringPayments,
  tailoringStatusHistory,
  users,
} from "@db/schema";
import {
  addTailoringPayment,
  advanceTailoringStatus,
  assignTailor,
  cancelTailoringOrder,
  createTailoringOrder,
  saveMeasurements,
} from "../services/tailoring.service";
import { logAudit, requestMeta } from "../services/audit.service";
import {
  FABRIC_SOURCES,
  ORDER_PAYMENT_STATUSES,
  PAYMENT_METHODS,
  TAILORING_ORDER_STATUSES,
} from "@contracts/constants";

/**
 * HADRAN FABRICS MALL — tailoring router
 * Orders, measurements, tailor assignment, payments, workflow, customers
 * and reports for the tailoring section. Money movements are written
 * inside the service layer (deposits, balance payments, refunds).
 */

const listInput = z.object({
  status: z.enum(TAILORING_ORDER_STATUSES).optional(),
  paymentStatus: z.enum(ORDER_PAYMENT_STATUSES).optional(),
  fabricSource: z.enum(FABRIC_SOURCES).optional(),
  tailorId: z.number().int().positive().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().max(120).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(5).max(200).default(25),
});

function buildFilters(input: Omit<z.infer<typeof listInput>, "page" | "pageSize">): SQL[] {
  const filters: SQL[] = [];
  if (input.status) filters.push(eq(tailoringOrders.status, input.status));
  if (input.paymentStatus) filters.push(eq(tailoringOrders.paymentStatus, input.paymentStatus));
  if (input.fabricSource) filters.push(eq(tailoringOrders.fabricSource, input.fabricSource));
  if (input.tailorId) filters.push(eq(tailoringOrders.tailorId, input.tailorId));
  if (input.dateFrom) filters.push(gte(tailoringOrders.createdAt, new Date(`${input.dateFrom}T00:00:00`)));
  if (input.dateTo) filters.push(lte(tailoringOrders.createdAt, new Date(`${input.dateTo}T23:59:59`)));
  if (input.search?.trim()) {
    const q = `%${input.search.trim()}%`;
    filters.push(
      or(
        like(tailoringOrders.orderNo, q),
        like(tailoringOrders.customerName, q),
        like(tailoringOrders.customerPhone, q),
        like(tailoringOrders.styleDescription, q),
      )!,
    );
  }
  return filters;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export const tailoringRouter = createRouter({
  /* ------------------------------ DASHBOARD ------------------------------ */

  dashboard: permissionProcedure("tailoring.view").query(async () => {
    const db = getDb();
    const today = startOfToday();
    const monthStart = startOfToday();
    monthStart.setDate(1);
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);

    const statusRows = await db
      .select({ status: tailoringOrders.status, count: count() })
      .from(tailoringOrders)
      .groupBy(tailoringOrders.status);
    const statusBoard = Object.fromEntries(statusRows.map((r) => [r.status, r.count]));

    // Net collections: refund rows (negative amounts) reduce the totals,
    // matching the money ledger and the daily series.
    const [todayRevenue] = await db
      .select({ value: sql<string>`COALESCE(SUM(${tailoringPayments.amount}), 0)` })
      .from(tailoringPayments)
      .where(gte(tailoringPayments.createdAt, today));
    const [monthRevenue] = await db
      .select({ value: sql<string>`COALESCE(SUM(${tailoringPayments.amount}), 0)` })
      .from(tailoringPayments)
      .where(gte(tailoringPayments.createdAt, monthStart));

    const [outstanding] = await db.execute(sql`
      SELECT COALESCE(SUM(price - amount_paid), 0) AS balance
      FROM ${tailoringOrders}
      WHERE ${tailoringOrders.status} != 'CANCELLED'
    `);
    const outstandingBalance = Number((outstanding as unknown as { balance: string }[])[0]?.balance ?? 0);

    const overdue = await db
      .select({
        id: tailoringOrders.id,
        orderNo: tailoringOrders.orderNo,
        customerName: tailoringOrders.customerName,
        dueDate: tailoringOrders.dueDate,
        status: tailoringOrders.status,
        tailorName: users.fullName,
      })
      .from(tailoringOrders)
      .leftJoin(users, eq(tailoringOrders.tailorId, users.id))
      .where(
        and(
          sql`${tailoringOrders.status} IN ('RECEIVED','CUTTING','SEWING','FINISHING','FITTING','READY')`,
          sql`${tailoringOrders.dueDate} IS NOT NULL`,
          sql`${tailoringOrders.dueDate} <= CURDATE()`,
        ),
      )
      .orderBy(asc(tailoringOrders.dueDate))
      .limit(8);

    const recent = await db
      .select({
        id: tailoringOrders.id,
        orderNo: tailoringOrders.orderNo,
        customerName: tailoringOrders.customerName,
        styleDescription: tailoringOrders.styleDescription,
        status: tailoringOrders.status,
        price: tailoringOrders.price,
        paymentStatus: tailoringOrders.paymentStatus,
        createdAt: tailoringOrders.createdAt,
      })
      .from(tailoringOrders)
      .orderBy(desc(tailoringOrders.createdAt))
      .limit(8);

    // Raw query for the daily series: drizzle renders DATE(col) unqualified
    // in SELECT but qualified in GROUP BY, tripping only_full_group_by.
    const [dailyRows] = await db.execute(sql`
      SELECT DATE(${tailoringPayments.createdAt}) AS day, SUM(${tailoringPayments.amount}) AS total
      FROM ${tailoringPayments}
      WHERE ${tailoringPayments.createdAt} >= ${thirtyDaysAgo}
      GROUP BY day
      ORDER BY day
    `);
    const daily = (dailyRows as unknown as { day: string; total: string }[]).map((d) => ({
      day: d.day,
      total: Number(d.total),
    }));

    // Per-tailor workload of open jobs.
    const [workloadRows] = await db.execute(sql`
      SELECT ${users.fullName} AS name, COUNT(*) AS openJobs
      FROM ${tailoringOrders}
      INNER JOIN ${users} ON ${tailoringOrders.tailorId} = ${users.id}
      WHERE ${tailoringOrders.status} IN ('RECEIVED','CUTTING','SEWING','FINISHING','FITTING')
      GROUP BY ${users.fullName}
      ORDER BY openJobs DESC
      LIMIT 8
    `);
    const tailorWorkload = (workloadRows as unknown as { name: string; openJobs: string }[]).map((t) => ({
      name: t.name,
      openJobs: Number(t.openJobs),
    }));

    return {
      statusBoard,
      revenueToday: Number(todayRevenue?.value ?? 0),
      revenueMonth: Number(monthRevenue?.value ?? 0),
      outstandingBalance,
      overdueCount: overdue.length,
      overdue,
      recent,
      daily,
      tailorWorkload,
    };
  }),

  /* ------------------------------ ORDER LIST ------------------------------ */

  list: permissionProcedure("tailoring.view").input(listInput).query(async ({ input }) => {
    const db = getDb();
    const filters = buildFilters(input);
    const where = filters.length ? and(...filters) : undefined;

    const [totalRow] = await db.select({ value: count() }).from(tailoringOrders).where(where);
    const rows = await db
      .select({ order: tailoringOrders, receivedByName: users.fullName })
      .from(tailoringOrders)
      .leftJoin(users, eq(tailoringOrders.receivedBy, users.id))
      .where(where)
      .orderBy(desc(tailoringOrders.createdAt), desc(tailoringOrders.id))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize);

    const tailorIds = [...new Set(rows.map((r) => r.order.tailorId).filter((v): v is number => v != null))];
    const tailorRows = tailorIds.length
      ? await db.select({ id: users.id, fullName: users.fullName }).from(users).where(
          sql`${users.id} IN (${sql.join(tailorIds.map((id) => sql`${id}`), sql`, `)})`,
        )
      : [];
    const tailorById = new Map(tailorRows.map((t) => [t.id, t.fullName]));

    return {
      rows: rows.map((r) => ({
        ...r.order,
        receivedByName: r.receivedByName,
        tailorName: r.order.tailorId != null ? (tailorById.get(r.order.tailorId) ?? null) : null,
      })),
      total: totalRow?.value ?? 0,
      page: input.page,
      pageSize: input.pageSize,
    };
  }),

  /** All matching rows without paging — for CSV/Excel export and print. */
  exportRows: permissionProcedure("tailoring.view").input(listInput.omit({ page: true, pageSize: true })).query(async ({ input }) => {
    const db = getDb();
    const filters = buildFilters(input);
    const where = filters.length ? and(...filters) : undefined;
    const rows = await db
      .select({ order: tailoringOrders, receivedByName: users.fullName })
      .from(tailoringOrders)
      .leftJoin(users, eq(tailoringOrders.receivedBy, users.id))
      .where(where)
      .orderBy(desc(tailoringOrders.createdAt), desc(tailoringOrders.id))
      .limit(5000);
    return rows.map((r) => ({ ...r.order, receivedByName: r.receivedByName }));
  }),

  /* ------------------------------ ORDER DETAIL ------------------------------ */

  getById: permissionProcedure("tailoring.view")
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getDb();
      const [row] = await db
        .select({ order: tailoringOrders, receivedByName: users.fullName })
        .from(tailoringOrders)
        .leftJoin(users, eq(tailoringOrders.receivedBy, users.id))
        .where(eq(tailoringOrders.id, input.id))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Tailoring order not found." });

      const measurements = await db
        .select()
        .from(tailoringMeasurements)
        .where(eq(tailoringMeasurements.orderId, input.id))
        .orderBy(desc(tailoringMeasurements.createdAt));

      const paymentRows = await db
        .select({ payment: tailoringPayments, receivedByName: users.fullName })
        .from(tailoringPayments)
        .leftJoin(users, eq(tailoringPayments.receivedBy, users.id))
        .where(eq(tailoringPayments.orderId, input.id))
        .orderBy(desc(tailoringPayments.createdAt));

      const historyRows = await db
        .select({ entry: tailoringStatusHistory, changedByName: users.fullName })
        .from(tailoringStatusHistory)
        .leftJoin(users, eq(tailoringStatusHistory.changedBy, users.id))
        .where(eq(tailoringStatusHistory.orderId, input.id))
        .orderBy(asc(tailoringStatusHistory.createdAt), asc(tailoringStatusHistory.id));

      let tailorName: string | null = null;
      if (row.order.tailorId != null) {
        const [tailor] = await db
          .select({ fullName: users.fullName })
          .from(users)
          .where(eq(users.id, row.order.tailorId))
          .limit(1);
        tailorName = tailor?.fullName ?? null;
      }

      return {
        ...row.order,
        receivedByName: row.receivedByName,
        tailorName,
        measurements,
        payments: paymentRows.map((p) => ({ ...p.payment, receivedByName: p.receivedByName })),
        history: historyRows.map((h) => ({ ...h.entry, changedByName: h.changedByName })),
      };
    }),

  /* ------------------------------ WRITES ------------------------------ */

  create: permissionProcedure("tailoring.manage")
    .input(
      z.object({
        customerId: z.number().int().positive().nullish(),
        customerName: z.string().min(2, "Customer name is required").max(160),
        customerPhone: z.string().max(40).optional(),
        styleDescription: z.string().min(2, "Describe the style").max(400),
        styleImageUrl: z.string().max(500).nullish(),
        fabricSource: z.enum(FABRIC_SOURCES).default("CUSTOMER_OWN"),
        tailorId: z.number().int().positive().nullish(),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
        price: z.number().min(0),
        notes: z.string().max(2000).optional(),
        measurements: z
          .object({
            label: z.string().max(80).optional(),
            values: z.record(z.string(), z.union([z.number(), z.string().max(40)])),
          })
          .nullish(),
        deposit: z
          .object({ amount: z.number().min(0), method: z.enum(PAYMENT_METHODS).default("CASH") })
          .nullish(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const result = await createTailoringOrder(input, ctx.user.id, ctx.user.branchId ?? null);
      await logAudit({
        actorId: ctx.user.id,
        action: "tailoring.create",
        entityType: "TAILORING_ORDER",
        entityId: result.orderId,
        description: `Received tailoring order ${result.orderNo} for ${input.customerName} — ${input.styleDescription}.`,
        ...requestMeta(ctx.req),
      });
      return result;
    }),

  addPayment: permissionProcedure("tailoring.manage")
    .input(
      z.object({
        orderId: z.number().int().positive(),
        amount: z.number().positive("Amount must be greater than zero"),
        method: z.enum(PAYMENT_METHODS).default("CASH"),
        note: z.string().max(300).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const result = await addTailoringPayment(input.orderId, input.amount, input.method, input.note?.trim() || null, ctx.user.id);
      await logAudit({
        actorId: ctx.user.id,
        action: "tailoring.payment",
        entityType: "TAILORING_ORDER",
        entityId: input.orderId,
        description: `Took tailoring payment of ₦${input.amount.toLocaleString()} on order #${input.orderId} (${input.method}).`,
        ...requestMeta(ctx.req),
      });
      return result;
    }),

  advanceStatus: permissionProcedure("tailoring.advance_status")
    .input(
      z.object({
        orderId: z.number().int().positive(),
        toStatus: z.enum(TAILORING_ORDER_STATUSES),
        note: z.string().max(300).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const result = await advanceTailoringStatus(input.orderId, input.toStatus, input.note?.trim() || null, ctx.user.id);
      await logAudit({
        actorId: ctx.user.id,
        action: "tailoring.status",
        entityType: "TAILORING_ORDER",
        entityId: input.orderId,
        description: `Tailoring order #${input.orderId}: ${result.fromStatus} → ${result.toStatus}.`,
        ...requestMeta(ctx.req),
      });
      return result;
    }),

  assignTailor: permissionProcedure("tailoring.manage")
    .input(
      z.object({
        orderId: z.number().int().positive(),
        tailorId: z.number().int().positive().nullable(),
        note: z.string().max(300).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const result = await assignTailor(input.orderId, input.tailorId, ctx.user.id, input.note?.trim() || null);
      await logAudit({
        actorId: ctx.user.id,
        action: "tailoring.assign",
        entityType: "TAILORING_ORDER",
        entityId: input.orderId,
        description: input.tailorId
          ? `Assigned tailor #${input.tailorId} to tailoring order #${input.orderId}.`
          : `Unassigned the tailor on tailoring order #${input.orderId}.`,
        ...requestMeta(ctx.req),
      });
      return result;
    }),

  saveMeasurements: permissionProcedure("tailoring.manage")
    .input(
      z.object({
        orderId: z.number().int().positive(),
        label: z.string().max(80).default("Standard"),
        values: z.record(z.string(), z.union([z.number(), z.string().max(40)])),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const result = await saveMeasurements(input.orderId, input.values, input.label.trim() || "Standard", ctx.user.id);
      await logAudit({
        actorId: ctx.user.id,
        action: "tailoring.measurements",
        entityType: "TAILORING_ORDER",
        entityId: input.orderId,
        description: `Updated measurements on tailoring order #${input.orderId} (${Object.keys(input.values).length} fields).`,
        ...requestMeta(ctx.req),
      });
      return result;
    }),

  cancel: permissionProcedure("tailoring.cancel")
    .input(z.object({ orderId: z.number().int().positive(), reason: z.string().min(3, "Give a reason").max(300) }))
    .mutation(async ({ input, ctx }) => {
      const result = await cancelTailoringOrder(input.orderId, input.reason.trim(), ctx.user.id);
      await logAudit({
        actorId: ctx.user.id,
        action: "tailoring.cancel",
        entityType: "TAILORING_ORDER",
        entityId: input.orderId,
        description: `Cancelled tailoring order #${input.orderId}. Refunded ₦${result.refunded.toLocaleString()}. Reason: ${input.reason}.`,
        ...requestMeta(ctx.req),
      });
      return result;
    }),

  /* ------------------------------ PAYMENTS LEDGER ------------------------------ */

  payments: permissionProcedure("tailoring.view")
    .input(
      z.object({
        method: z.enum(PAYMENT_METHODS).optional(),
        dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        search: z.string().max(120).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(5).max(200).default(25),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const filters: SQL[] = [];
      if (input.method) filters.push(eq(tailoringPayments.method, input.method));
      if (input.dateFrom) filters.push(gte(tailoringPayments.createdAt, new Date(`${input.dateFrom}T00:00:00`)));
      if (input.dateTo) filters.push(lte(tailoringPayments.createdAt, new Date(`${input.dateTo}T23:59:59`)));
      if (input.search?.trim()) {
        const q = `%${input.search.trim()}%`;
        filters.push(or(like(tailoringOrders.orderNo, q), like(tailoringOrders.customerName, q))!);
      }
      const where = filters.length ? and(...filters) : undefined;

      const [totalRow] = await db
        .select({ value: count() })
        .from(tailoringPayments)
        .leftJoin(tailoringOrders, eq(tailoringPayments.orderId, tailoringOrders.id))
        .where(where);

      const rows = await db
        .select({
          payment: tailoringPayments,
          orderNo: tailoringOrders.orderNo,
          customerName: tailoringOrders.customerName,
          orderStatus: tailoringOrders.status,
          receivedByName: users.fullName,
        })
        .from(tailoringPayments)
        .leftJoin(tailoringOrders, eq(tailoringPayments.orderId, tailoringOrders.id))
        .leftJoin(users, eq(tailoringPayments.receivedBy, users.id))
        .where(where)
        .orderBy(desc(tailoringPayments.createdAt), desc(tailoringPayments.id))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      return {
        rows: rows.map((r) => ({ ...r.payment, orderNo: r.orderNo, customerName: r.customerName, orderStatus: r.orderStatus, receivedByName: r.receivedByName })),
        total: totalRow?.value ?? 0,
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  /** All matching payments without paging — for export. */
  exportPayments: permissionProcedure("tailoring.view")
    .input(
      z.object({
        method: z.enum(PAYMENT_METHODS).optional(),
        dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        search: z.string().max(120).optional(),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const filters: SQL[] = [];
      if (input.method) filters.push(eq(tailoringPayments.method, input.method));
      if (input.dateFrom) filters.push(gte(tailoringPayments.createdAt, new Date(`${input.dateFrom}T00:00:00`)));
      if (input.dateTo) filters.push(lte(tailoringPayments.createdAt, new Date(`${input.dateTo}T23:59:59`)));
      if (input.search?.trim()) {
        const q = `%${input.search.trim()}%`;
        filters.push(or(like(tailoringOrders.orderNo, q), like(tailoringOrders.customerName, q))!);
      }
      const where = filters.length ? and(...filters) : undefined;
      const rows = await db
        .select({
          payment: tailoringPayments,
          orderNo: tailoringOrders.orderNo,
          customerName: tailoringOrders.customerName,
          orderStatus: tailoringOrders.status,
          receivedByName: users.fullName,
        })
        .from(tailoringPayments)
        .leftJoin(tailoringOrders, eq(tailoringPayments.orderId, tailoringOrders.id))
        .leftJoin(users, eq(tailoringPayments.receivedBy, users.id))
        .where(where)
        .orderBy(desc(tailoringPayments.createdAt), desc(tailoringPayments.id))
        .limit(5000);
      return rows.map((r) => ({ ...r.payment, orderNo: r.orderNo, customerName: r.customerName, orderStatus: r.orderStatus, receivedByName: r.receivedByName }));
    }),

  /* ------------------------------ CUSTOMERS ------------------------------ */

  /** Tailoring customers aggregated from order history (walk-ins included). */
  customers: permissionProcedure("tailoring.view")
    .input(z.object({ search: z.string().max(120).optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      const searchClause = input.search?.trim()
        ? sql`HAVING name LIKE ${`%${input.search.trim()}%`} OR phone LIKE ${`%${input.search.trim()}%`}`
        : sql``;
      const [rows] = await db.execute(sql`
        SELECT
          ${tailoringOrders.customerName} AS name,
          ${tailoringOrders.customerPhone} AS phone,
          COUNT(*) AS orders,
          SUM(${tailoringOrders.price}) AS spent,
          SUM(${tailoringOrders.price} - ${tailoringOrders.amountPaid}) AS balance,
          MAX(${tailoringOrders.createdAt}) AS lastOrderAt
        FROM ${tailoringOrders}
        WHERE ${tailoringOrders.status} != 'CANCELLED'
        GROUP BY ${tailoringOrders.customerName}, ${tailoringOrders.customerPhone}
        ${searchClause}
        ORDER BY spent DESC
        LIMIT 500
      `);
      return (rows as unknown as { name: string; phone: string | null; orders: string; spent: string; balance: string; lastOrderAt: string }[]).map(
        (r) => ({ name: r.name, phone: r.phone, orders: Number(r.orders), spent: Number(r.spent), balance: Number(r.balance), lastOrderAt: r.lastOrderAt }),
      );
    }),

  /* ------------------------------ REPORTS ------------------------------ */

  reports: permissionProcedure("tailoring.view")
    .input(
      z.object({
        dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const from = input.dateFrom ? new Date(`${input.dateFrom}T00:00:00`) : new Date(0);
      const to = input.dateTo ? new Date(`${input.dateTo}T23:59:59`) : new Date();
      const inRange = and(gte(tailoringOrders.createdAt, from), lte(tailoringOrders.createdAt, to));
      const payInRange = and(gte(tailoringPayments.createdAt, from), lte(tailoringPayments.createdAt, to));

      const [totals] = await db
        .select({
          orders: count(),
          billed: sql<string>`COALESCE(SUM(CASE WHEN ${tailoringOrders.status} != 'CANCELLED' THEN ${tailoringOrders.price} ELSE 0 END), 0)`,
          collected: sql<string>`COALESCE(SUM(${tailoringOrders.amountPaid}), 0)`,
          shopFabric: sql<string>`SUM(CASE WHEN ${tailoringOrders.fabricSource} = 'SHOP_STOCK' AND ${tailoringOrders.status} != 'CANCELLED' THEN 1 ELSE 0 END)`,
        })
        .from(tailoringOrders)
        .where(inRange);

      const byStatus = await db
        .select({ status: tailoringOrders.status, count: count() })
        .from(tailoringOrders)
        .where(inRange)
        .groupBy(tailoringOrders.status);

      const [byStyleRows] = await db.execute(sql`
        SELECT ${tailoringOrders.styleDescription} AS style,
               COUNT(*) AS orders,
               SUM(${tailoringOrders.price}) AS revenue
        FROM ${tailoringOrders}
        WHERE ${tailoringOrders.status} != 'CANCELLED'
          AND ${tailoringOrders.createdAt} >= ${from} AND ${tailoringOrders.createdAt} <= ${to}
        GROUP BY style
        ORDER BY revenue DESC
        LIMIT 10
      `);

      const [dailyRows] = await db.execute(sql`
        SELECT DATE(${tailoringPayments.createdAt}) AS day, SUM(${tailoringPayments.amount}) AS total
        FROM ${tailoringPayments}
        WHERE ${payInRange}
        GROUP BY day
        ORDER BY day
      `);

      const [topCustomerRows] = await db.execute(sql`
        SELECT ${tailoringOrders.customerName} AS name,
               ${tailoringOrders.customerPhone} AS phone,
               COUNT(*) AS orders,
               SUM(${tailoringOrders.price}) AS spent
        FROM ${tailoringOrders}
        WHERE ${tailoringOrders.status} != 'CANCELLED'
          AND ${tailoringOrders.createdAt} >= ${from} AND ${tailoringOrders.createdAt} <= ${to}
        GROUP BY ${tailoringOrders.customerName}, ${tailoringOrders.customerPhone}
        ORDER BY spent DESC
        LIMIT 10
      `);

      const [tailorRows] = await db.execute(sql`
        SELECT ${users.fullName} AS name,
               COUNT(*) AS jobs,
               SUM(${tailoringOrders.price}) AS billed,
               SUM(CASE WHEN ${tailoringOrders.status} = 'DELIVERED' THEN 1 ELSE 0 END) AS delivered
        FROM ${tailoringOrders}
        INNER JOIN ${users} ON ${tailoringOrders.tailorId} = ${users.id}
        WHERE ${tailoringOrders.status} != 'CANCELLED'
          AND ${tailoringOrders.createdAt} >= ${from} AND ${tailoringOrders.createdAt} <= ${to}
        GROUP BY ${users.fullName}
        ORDER BY billed DESC
      `);

      const [turnaroundRows] = await db.execute(sql`
        SELECT AVG(TIMESTAMPDIFF(HOUR, ${tailoringOrders.createdAt}, ${tailoringOrders.deliveredAt})) AS avgHours,
               COUNT(*) AS deliveredCount
        FROM ${tailoringOrders}
        WHERE ${tailoringOrders.deliveredAt} IS NOT NULL
          AND ${tailoringOrders.createdAt} >= ${from} AND ${tailoringOrders.createdAt} <= ${to}
      `);
      const turnaround = (turnaroundRows as unknown as { avgHours: string | null; deliveredCount: string }[])[0];

      return {
        totals: {
          orders: totals?.orders ?? 0,
          billed: Number(totals?.billed ?? 0),
          collected: Number(totals?.collected ?? 0),
          outstanding: Number((Number(totals?.billed ?? 0) - Number(totals?.collected ?? 0)).toFixed(2)),
          shopFabricOrders: Number(totals?.shopFabric ?? 0),
        },
        byStatus: byStatus.map((s) => ({ status: s.status, count: s.count })),
        byStyle: (byStyleRows as unknown as { style: string; orders: string; revenue: string }[]).map((s) => ({
          style: s.style,
          orders: Number(s.orders),
          revenue: Number(s.revenue),
        })),
        daily: (dailyRows as unknown as { day: string; total: string }[]).map((d) => ({ day: d.day, total: Number(d.total) })),
        topCustomers: (topCustomerRows as unknown as { name: string; phone: string | null; orders: string; spent: string }[]).map((c) => ({
          name: c.name,
          phone: c.phone,
          orders: Number(c.orders),
          spent: Number(c.spent),
        })),
        tailors: (tailorRows as unknown as { name: string; jobs: string; billed: string; delivered: string }[]).map((t) => ({
          name: t.name,
          jobs: Number(t.jobs),
          billed: Number(t.billed),
          delivered: Number(t.delivered),
        })),
        avgTurnaroundHours: turnaround?.avgHours != null ? Number(Number(turnaround.avgHours).toFixed(1)) : null,
        deliveredCount: Number(turnaround?.deliveredCount ?? 0),
      };
    }),
});

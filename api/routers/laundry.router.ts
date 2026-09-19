import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, gte, like, lte, or, sql, type SQL } from "drizzle-orm";
import { createRouter } from "../middleware";
import { permissionProcedure } from "../trpc";
import { getDb } from "../queries/connection";
import { laundryOrders, laundryOrderItems, laundryPayments, laundryStatusHistory, users } from "@db/schema";
import {
  addLaundryPayment,
  advanceLaundryStatus,
  cancelLaundryOrder,
  createLaundryOrder,
} from "../services/laundry.service";
import { logAudit, requestMeta } from "../services/audit.service";
import {
  LAUNDRY_ORDER_STATUSES,
  LAUNDRY_SERVICE_TYPES,
  ORDER_PAYMENT_STATUSES,
  PAYMENT_METHODS,
} from "@contracts/constants";

/**
 * HADRAN FABRICS MALL — laundry router
 * Orders, garment lines, payments, workflow, customers and reports for
 * the laundry section. Money movements are written inside the service
 * layer (deposits, balance payments, cancellation refunds).
 */

const listInput = z.object({
  status: z.enum(LAUNDRY_ORDER_STATUSES).optional(),
  paymentStatus: z.enum(ORDER_PAYMENT_STATUSES).optional(),
  priority: z.enum(["NORMAL", "EXPRESS"]).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().max(120).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(5).max(200).default(25),
});

function buildFilters(input: Omit<z.infer<typeof listInput>, "page" | "pageSize">): SQL[] {
  const filters: SQL[] = [];
  if (input.status) filters.push(eq(laundryOrders.status, input.status));
  if (input.paymentStatus) filters.push(eq(laundryOrders.paymentStatus, input.paymentStatus));
  if (input.priority) filters.push(eq(laundryOrders.priority, input.priority));
  if (input.dateFrom) filters.push(gte(laundryOrders.createdAt, new Date(`${input.dateFrom}T00:00:00`)));
  if (input.dateTo) filters.push(lte(laundryOrders.createdAt, new Date(`${input.dateTo}T23:59:59`)));
  if (input.search?.trim()) {
    const q = `%${input.search.trim()}%`;
    filters.push(
      or(
        like(laundryOrders.orderNo, q),
        like(laundryOrders.customerName, q),
        like(laundryOrders.customerPhone, q),
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

export const laundryRouter = createRouter({
  /* ------------------------------ DASHBOARD ------------------------------ */

  dashboard: permissionProcedure("laundry.view").query(async () => {
    const db = getDb();
    const today = startOfToday();
    const monthStart = startOfToday();
    monthStart.setDate(1);
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);

    const statusRows = await db
      .select({ status: laundryOrders.status, count: count() })
      .from(laundryOrders)
      .groupBy(laundryOrders.status);
    const statusBoard = Object.fromEntries(statusRows.map((r) => [r.status, r.count]));

    // Net collections: refund rows (negative amounts) reduce the totals,
    // matching the money ledger and the daily series.
    const [todayRevenue] = await db
      .select({ value: sql<string>`COALESCE(SUM(${laundryPayments.amount}), 0)` })
      .from(laundryPayments)
      .where(gte(laundryPayments.createdAt, today));
    const [monthRevenue] = await db
      .select({ value: sql<string>`COALESCE(SUM(${laundryPayments.amount}), 0)` })
      .from(laundryPayments)
      .where(gte(laundryPayments.createdAt, monthStart));

    const [outstanding] = await db.execute(sql`
      SELECT COALESCE(SUM(total_amount - amount_paid), 0) AS balance
      FROM ${laundryOrders}
      WHERE ${laundryOrders.status} != 'CANCELLED'
    `);
    const outstandingBalance = Number((outstanding as unknown as { balance: string }[])[0]?.balance ?? 0);

    const overdue = await db
      .select({
        id: laundryOrders.id,
        orderNo: laundryOrders.orderNo,
        customerName: laundryOrders.customerName,
        dueDate: laundryOrders.dueDate,
        status: laundryOrders.status,
        priority: laundryOrders.priority,
      })
      .from(laundryOrders)
      .where(
        and(
          sql`${laundryOrders.status} IN ('RECEIVED','WASHING','DRYING','IRONING','READY')`,
          sql`${laundryOrders.dueDate} IS NOT NULL`,
          sql`${laundryOrders.dueDate} <= CURDATE()`,
        ),
      )
      .orderBy(asc(laundryOrders.dueDate))
      .limit(8);

    const recent = await db
      .select({
        id: laundryOrders.id,
        orderNo: laundryOrders.orderNo,
        customerName: laundryOrders.customerName,
        status: laundryOrders.status,
        priority: laundryOrders.priority,
        totalAmount: laundryOrders.totalAmount,
        paymentStatus: laundryOrders.paymentStatus,
        createdAt: laundryOrders.createdAt,
      })
      .from(laundryOrders)
      .orderBy(desc(laundryOrders.createdAt))
      .limit(8);

    // Raw query for the daily series: drizzle renders DATE(col) unqualified
    // in SELECT but qualified in GROUP BY, tripping only_full_group_by.
    const [dailyRows] = await db.execute(sql`
      SELECT DATE(${laundryPayments.createdAt}) AS day, SUM(${laundryPayments.amount}) AS total
      FROM ${laundryPayments}
      WHERE ${laundryPayments.createdAt} >= ${thirtyDaysAgo}
      GROUP BY day
      ORDER BY day
    `);
    const daily = (dailyRows as unknown as { day: string; total: string }[]).map((d) => ({
      day: d.day,
      total: Number(d.total),
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
    };
  }),

  /* ------------------------------ ORDER LIST ------------------------------ */

  list: permissionProcedure("laundry.view").input(listInput).query(async ({ input }) => {
    const db = getDb();
    const filters = buildFilters(input);
    const where = filters.length ? and(...filters) : undefined;

    const [totalRow] = await db.select({ value: count() }).from(laundryOrders).where(where);
    const rows = await db
      .select({ order: laundryOrders, receivedByName: users.fullName })
      .from(laundryOrders)
      .leftJoin(users, eq(laundryOrders.receivedBy, users.id))
      .where(where)
      .orderBy(desc(laundryOrders.createdAt), desc(laundryOrders.id))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize);

    const ids = rows.map((r) => r.order.id);
    const itemCounts = ids.length
      ? await db
          .select({ orderId: laundryOrderItems.orderId, count: count() })
          .from(laundryOrderItems)
          .where(sql`${laundryOrderItems.orderId} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`)
          .groupBy(laundryOrderItems.orderId)
      : [];
    const countByOrder = new Map(itemCounts.map((r) => [r.orderId, r.count]));

    return {
      rows: rows.map((r) => ({
        ...r.order,
        receivedByName: r.receivedByName,
        itemCount: countByOrder.get(r.order.id) ?? 0,
      })),
      total: totalRow?.value ?? 0,
      page: input.page,
      pageSize: input.pageSize,
    };
  }),

  /** All matching rows without paging — for CSV/Excel export and print. */
  exportRows: permissionProcedure("laundry.view").input(listInput.omit({ page: true, pageSize: true })).query(async ({ input }) => {
    const db = getDb();
    const filters = buildFilters(input);
    const where = filters.length ? and(...filters) : undefined;
    const rows = await db
      .select({ order: laundryOrders, receivedByName: users.fullName })
      .from(laundryOrders)
      .leftJoin(users, eq(laundryOrders.receivedBy, users.id))
      .where(where)
      .orderBy(desc(laundryOrders.createdAt), desc(laundryOrders.id))
      .limit(5000);
    return rows.map((r) => ({ ...r.order, receivedByName: r.receivedByName }));
  }),

  /* ------------------------------ ORDER DETAIL ------------------------------ */

  getById: permissionProcedure("laundry.view")
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getDb();
      const [row] = await db
        .select({ order: laundryOrders, receivedByName: users.fullName })
        .from(laundryOrders)
        .leftJoin(users, eq(laundryOrders.receivedBy, users.id))
        .where(eq(laundryOrders.id, input.id))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Laundry order not found." });

      const items = await db
        .select()
        .from(laundryOrderItems)
        .where(eq(laundryOrderItems.orderId, input.id))
        .orderBy(asc(laundryOrderItems.id));

      const paymentRows = await db
        .select({ payment: laundryPayments, receivedByName: users.fullName })
        .from(laundryPayments)
        .leftJoin(users, eq(laundryPayments.receivedBy, users.id))
        .where(eq(laundryPayments.orderId, input.id))
        .orderBy(desc(laundryPayments.createdAt));

      const historyRows = await db
        .select({ entry: laundryStatusHistory, changedByName: users.fullName })
        .from(laundryStatusHistory)
        .leftJoin(users, eq(laundryStatusHistory.changedBy, users.id))
        .where(eq(laundryStatusHistory.orderId, input.id))
        .orderBy(asc(laundryStatusHistory.createdAt), asc(laundryStatusHistory.id));

      return {
        ...row.order,
        receivedByName: row.receivedByName,
        items,
        payments: paymentRows.map((p) => ({ ...p.payment, receivedByName: p.receivedByName })),
        history: historyRows.map((h) => ({ ...h.entry, changedByName: h.changedByName })),
      };
    }),

  /* ------------------------------ WRITES ------------------------------ */

  create: permissionProcedure("laundry.manage")
    .input(
      z.object({
        customerId: z.number().int().positive().nullish(),
        customerName: z.string().min(2, "Customer name is required").max(160),
        customerPhone: z.string().max(40).optional(),
        priority: z.enum(["NORMAL", "EXPRESS"]).default("NORMAL"),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
        discountAmount: z.number().min(0).default(0),
        notes: z.string().max(2000).optional(),
        items: z
          .array(
            z.object({
              garmentType: z.string().min(1, "Pick a garment type").max(100),
              description: z.string().max(300).optional(),
              serviceType: z.enum(LAUNDRY_SERVICE_TYPES),
              quantity: z.number().int().min(1).max(999),
              unitPrice: z.number().min(0),
              conditionNotes: z.string().max(300).optional(),
            }),
          )
          .min(1, "Add at least one garment"),
        deposit: z
          .object({ amount: z.number().min(0), method: z.enum(PAYMENT_METHODS).default("CASH") })
          .nullish(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const result = await createLaundryOrder(input, ctx.user.id, ctx.user.branchId ?? null);
      await logAudit({
        actorId: ctx.user.id,
        action: "laundry.create",
        entityType: "LAUNDRY_ORDER",
        entityId: result.orderId,
        description: `Received laundry order ${result.orderNo} for ${input.customerName} — ${input.items.length} garment line(s).`,
        ...requestMeta(ctx.req),
      });
      return result;
    }),

  addPayment: permissionProcedure("laundry.manage")
    .input(
      z.object({
        orderId: z.number().int().positive(),
        amount: z.number().positive("Amount must be greater than zero"),
        method: z.enum(PAYMENT_METHODS).default("CASH"),
        note: z.string().max(300).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const result = await addLaundryPayment(input.orderId, input.amount, input.method, input.note?.trim() || null, ctx.user.id);
      await logAudit({
        actorId: ctx.user.id,
        action: "laundry.payment",
        entityType: "LAUNDRY_ORDER",
        entityId: input.orderId,
        description: `Took laundry payment of ₦${input.amount.toLocaleString()} on order #${input.orderId} (${input.method}).`,
        ...requestMeta(ctx.req),
      });
      return result;
    }),

  advanceStatus: permissionProcedure("laundry.advance_status")
    .input(
      z.object({
        orderId: z.number().int().positive(),
        toStatus: z.enum(LAUNDRY_ORDER_STATUSES),
        note: z.string().max(300).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const result = await advanceLaundryStatus(input.orderId, input.toStatus, input.note?.trim() || null, ctx.user.id);
      await logAudit({
        actorId: ctx.user.id,
        action: "laundry.status",
        entityType: "LAUNDRY_ORDER",
        entityId: input.orderId,
        description: `Laundry order #${input.orderId}: ${result.fromStatus} → ${result.toStatus}.`,
        ...requestMeta(ctx.req),
      });
      return result;
    }),

  cancel: permissionProcedure("laundry.cancel")
    .input(z.object({ orderId: z.number().int().positive(), reason: z.string().min(3, "Give a reason").max(300) }))
    .mutation(async ({ input, ctx }) => {
      const result = await cancelLaundryOrder(input.orderId, input.reason.trim(), ctx.user.id);
      await logAudit({
        actorId: ctx.user.id,
        action: "laundry.cancel",
        entityType: "LAUNDRY_ORDER",
        entityId: input.orderId,
        description: `Cancelled laundry order #${input.orderId}. Refunded ₦${result.refunded.toLocaleString()}. Reason: ${input.reason}.`,
        ...requestMeta(ctx.req),
      });
      return result;
    }),

  /* ------------------------------ PAYMENTS LEDGER ------------------------------ */

  payments: permissionProcedure("laundry.view")
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
      if (input.method) filters.push(eq(laundryPayments.method, input.method));
      if (input.dateFrom) filters.push(gte(laundryPayments.createdAt, new Date(`${input.dateFrom}T00:00:00`)));
      if (input.dateTo) filters.push(lte(laundryPayments.createdAt, new Date(`${input.dateTo}T23:59:59`)));
      if (input.search?.trim()) {
        const q = `%${input.search.trim()}%`;
        filters.push(or(like(laundryOrders.orderNo, q), like(laundryOrders.customerName, q))!);
      }
      const where = filters.length ? and(...filters) : undefined;

      const [totalRow] = await db
        .select({ value: count() })
        .from(laundryPayments)
        .leftJoin(laundryOrders, eq(laundryPayments.orderId, laundryOrders.id))
        .where(where);

      const rows = await db
        .select({
          payment: laundryPayments,
          orderNo: laundryOrders.orderNo,
          customerName: laundryOrders.customerName,
          orderStatus: laundryOrders.status,
          receivedByName: users.fullName,
        })
        .from(laundryPayments)
        .leftJoin(laundryOrders, eq(laundryPayments.orderId, laundryOrders.id))
        .leftJoin(users, eq(laundryPayments.receivedBy, users.id))
        .where(where)
        .orderBy(desc(laundryPayments.createdAt), desc(laundryPayments.id))
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
  exportPayments: permissionProcedure("laundry.view")
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
      if (input.method) filters.push(eq(laundryPayments.method, input.method));
      if (input.dateFrom) filters.push(gte(laundryPayments.createdAt, new Date(`${input.dateFrom}T00:00:00`)));
      if (input.dateTo) filters.push(lte(laundryPayments.createdAt, new Date(`${input.dateTo}T23:59:59`)));
      if (input.search?.trim()) {
        const q = `%${input.search.trim()}%`;
        filters.push(or(like(laundryOrders.orderNo, q), like(laundryOrders.customerName, q))!);
      }
      const where = filters.length ? and(...filters) : undefined;
      const rows = await db
        .select({
          payment: laundryPayments,
          orderNo: laundryOrders.orderNo,
          customerName: laundryOrders.customerName,
          orderStatus: laundryOrders.status,
          receivedByName: users.fullName,
        })
        .from(laundryPayments)
        .leftJoin(laundryOrders, eq(laundryPayments.orderId, laundryOrders.id))
        .leftJoin(users, eq(laundryPayments.receivedBy, users.id))
        .where(where)
        .orderBy(desc(laundryPayments.createdAt), desc(laundryPayments.id))
        .limit(5000);
      return rows.map((r) => ({ ...r.payment, orderNo: r.orderNo, customerName: r.customerName, orderStatus: r.orderStatus, receivedByName: r.receivedByName }));
    }),

  /* ------------------------------ CUSTOMERS ------------------------------ */

  /** Laundry customers aggregated from order history (walk-ins included). */
  customers: permissionProcedure("laundry.view")
    .input(z.object({ search: z.string().max(120).optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      const searchClause = input.search?.trim()
        ? sql`HAVING name LIKE ${`%${input.search.trim()}%`} OR phone LIKE ${`%${input.search.trim()}%`}`
        : sql``;
      const [rows] = await db.execute(sql`
        SELECT
          ${laundryOrders.customerName} AS name,
          ${laundryOrders.customerPhone} AS phone,
          COUNT(*) AS orders,
          SUM(${laundryOrders.totalAmount}) AS spent,
          SUM(${laundryOrders.totalAmount} - ${laundryOrders.amountPaid}) AS balance,
          MAX(${laundryOrders.createdAt}) AS lastOrderAt
        FROM ${laundryOrders}
        WHERE ${laundryOrders.status} != 'CANCELLED'
        GROUP BY ${laundryOrders.customerName}, ${laundryOrders.customerPhone}
        ${searchClause}
        ORDER BY spent DESC
        LIMIT 500
      `);
      return (rows as unknown as { name: string; phone: string | null; orders: string; spent: string; balance: string; lastOrderAt: string }[]).map(
        (r) => ({ name: r.name, phone: r.phone, orders: Number(r.orders), spent: Number(r.spent), balance: Number(r.balance), lastOrderAt: r.lastOrderAt }),
      );
    }),

  /* ------------------------------ REPORTS ------------------------------ */

  reports: permissionProcedure("laundry.view")
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
      const inRange = and(gte(laundryOrders.createdAt, from), lte(laundryOrders.createdAt, to));
      const payInRange = and(gte(laundryPayments.createdAt, from), lte(laundryPayments.createdAt, to));

      const [totals] = await db
        .select({
          orders: count(),
          billed: sql<string>`COALESCE(SUM(CASE WHEN ${laundryOrders.status} != 'CANCELLED' THEN ${laundryOrders.totalAmount} ELSE 0 END), 0)`,
          collected: sql<string>`COALESCE(SUM(${laundryOrders.amountPaid}), 0)`,
          express: sql<string>`SUM(CASE WHEN ${laundryOrders.priority} = 'EXPRESS' THEN 1 ELSE 0 END)`,
        })
        .from(laundryOrders)
        .where(inRange);

      const byStatus = await db
        .select({ status: laundryOrders.status, count: count() })
        .from(laundryOrders)
        .where(inRange)
        .groupBy(laundryOrders.status);

      const [byServiceRows] = await db.execute(sql`
        SELECT ${laundryOrderItems.serviceType} AS serviceType,
               COUNT(*) AS lineCount,
               SUM(${laundryOrderItems.lineTotal}) AS revenue
        FROM ${laundryOrderItems}
        INNER JOIN ${laundryOrders} ON ${laundryOrderItems.orderId} = ${laundryOrders.id}
        WHERE ${laundryOrders.status} != 'CANCELLED'
          AND ${laundryOrders.createdAt} >= ${from} AND ${laundryOrders.createdAt} <= ${to}
        GROUP BY serviceType
        ORDER BY revenue DESC
      `);

      const [dailyRows] = await db.execute(sql`
        SELECT DATE(${laundryPayments.createdAt}) AS day, SUM(${laundryPayments.amount}) AS total
        FROM ${laundryPayments}
        WHERE ${payInRange}
        GROUP BY day
        ORDER BY day
      `);

      const [topCustomerRows] = await db.execute(sql`
        SELECT ${laundryOrders.customerName} AS name,
               ${laundryOrders.customerPhone} AS phone,
               COUNT(*) AS orders,
               SUM(${laundryOrders.totalAmount}) AS spent
        FROM ${laundryOrders}
        WHERE ${laundryOrders.status} != 'CANCELLED'
          AND ${laundryOrders.createdAt} >= ${from} AND ${laundryOrders.createdAt} <= ${to}
        GROUP BY ${laundryOrders.customerName}, ${laundryOrders.customerPhone}
        ORDER BY spent DESC
        LIMIT 10
      `);

      const [staffRows] = await db.execute(sql`
        SELECT ${users.fullName} AS name,
               COUNT(*) AS orders,
               SUM(${laundryOrders.totalAmount}) AS billed
        FROM ${laundryOrders}
        INNER JOIN ${users} ON ${laundryOrders.receivedBy} = ${users.id}
        WHERE ${laundryOrders.status} != 'CANCELLED'
          AND ${laundryOrders.createdAt} >= ${from} AND ${laundryOrders.createdAt} <= ${to}
        GROUP BY ${users.fullName}
        ORDER BY billed DESC
      `);

      const [turnaroundRows] = await db.execute(sql`
        SELECT AVG(TIMESTAMPDIFF(HOUR, ${laundryOrders.createdAt}, ${laundryOrders.collectedAt})) AS avgHours,
               COUNT(*) AS collectedCount
        FROM ${laundryOrders}
        WHERE ${laundryOrders.collectedAt} IS NOT NULL
          AND ${laundryOrders.createdAt} >= ${from} AND ${laundryOrders.createdAt} <= ${to}
      `);
      const turnaround = (turnaroundRows as unknown as { avgHours: string | null; collectedCount: string }[])[0];

      return {
        totals: {
          orders: totals?.orders ?? 0,
          billed: Number(totals?.billed ?? 0),
          collected: Number(totals?.collected ?? 0),
          outstanding: Number((Number(totals?.billed ?? 0) - Number(totals?.collected ?? 0)).toFixed(2)),
          express: Number(totals?.express ?? 0),
        },
        byStatus: byStatus.map((s) => ({ status: s.status, count: s.count })),
        byService: (byServiceRows as unknown as { serviceType: string; lineCount: string; revenue: string }[]).map((s) => ({
          serviceType: s.serviceType,
          lines: Number(s.lineCount),
          revenue: Number(s.revenue),
        })),
        daily: (dailyRows as unknown as { day: string; total: string }[]).map((d) => ({ day: d.day, total: Number(d.total) })),
        topCustomers: (topCustomerRows as unknown as { name: string; phone: string | null; orders: string; spent: string }[]).map((c) => ({
          name: c.name,
          phone: c.phone,
          orders: Number(c.orders),
          spent: Number(c.spent),
        })),
        staff: (staffRows as unknown as { name: string; orders: string; billed: string }[]).map((s) => ({
          name: s.name,
          orders: Number(s.orders),
          billed: Number(s.billed),
        })),
        avgTurnaroundHours: turnaround?.avgHours != null ? Number(Number(turnaround.avgHours).toFixed(1)) : null,
        collectedCount: Number(turnaround?.collectedCount ?? 0),
      };
    }),
});

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, gte, like, lte, or, sql, type SQL } from "drizzle-orm";
import { createRouter } from "../middleware";
import { permissionProcedure } from "../trpc";
import { getDb } from "../queries/connection";
import { expenses, users } from "@db/schema";
import { isApprovalGated, submitApproval } from "../services/approvals.service";
import { applyExpenseRecord } from "../services/expenses.service";
import { recordMoneyMovement } from "../services/money.service";
import { logAudit, requestMeta } from "../services/audit.service";
import { EXPENSE_CATEGORIES, EXPENSE_STATUSES, PAYMENT_METHODS, SECTIONS } from "@contracts/constants";

/**
 * HADRAN FABRICS MALL — expenses router
 * Record business expenses (rent, salaries, supplies…), filter and void
 * them. Every expense writes a matching OUT row to the money ledger.
 * Managers are approval-gated (EXPENSE_RECORD) when the workflow says so.
 */

const listInput = z.object({
  section: z.enum(SECTIONS).optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  status: z.enum(EXPENSE_STATUSES).optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().max(120).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(5).max(200).default(20),
});

const recordInput = z.object({
  section: z.enum(SECTIONS).default("SALES"),
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().min(3, "Describe the expense").max(400),
  vendor: z.string().max(160).optional(),
  amount: z.number().positive("Amount must be greater than zero"),
  paymentMethod: z.enum(PAYMENT_METHODS).default("CASH"),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  notes: z.string().max(2000).optional(),
});

function buildFilters(input: z.infer<typeof listInput>): SQL[] {
  const filters: SQL[] = [];
  if (input.section) filters.push(eq(expenses.section, input.section));
  if (input.category) filters.push(eq(expenses.category, input.category));
  if (input.status) filters.push(eq(expenses.status, input.status));
  if (input.method) filters.push(eq(expenses.paymentMethod, input.method));
  if (input.dateFrom) filters.push(gte(expenses.expenseDate, new Date(`${input.dateFrom}T00:00:00`)));
  if (input.dateTo) filters.push(lte(expenses.expenseDate, new Date(`${input.dateTo}T23:59:59`)));
  if (input.search?.trim()) {
    const q = `%${input.search.trim()}%`;
    filters.push(or(like(expenses.refNo, q), like(expenses.description, q), like(expenses.vendor, q))!);
  }
  return filters;
}

export const expensesRouter = createRouter({
  list: permissionProcedure("expenses.view").input(listInput).query(async ({ input }) => {
    const db = getDb();
    const filters = buildFilters(input);
    const where = filters.length ? and(...filters) : undefined;

    const [totalRow] = await db.select({ value: count() }).from(expenses).where(where);
    const rows = await db
      .select({
        expense: expenses,
        recordedByName: users.fullName,
      })
      .from(expenses)
      .leftJoin(users, eq(expenses.recordedBy, users.id))
      .where(where)
      .orderBy(desc(expenses.expenseDate), desc(expenses.id))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize);

    return {
      rows: rows.map((r) => ({ ...r.expense, recordedByName: r.recordedByName })),
      total: totalRow?.value ?? 0,
      page: input.page,
      pageSize: input.pageSize,
    };
  }),

  /** All matching rows without paging — for CSV/Excel export and print. */
  exportRows: permissionProcedure("expenses.view").input(listInput).query(async ({ input }) => {
    const db = getDb();
    const filters = buildFilters(input);
    const where = filters.length ? and(...filters) : undefined;
    const rows = await db
      .select({ expense: expenses, recordedByName: users.fullName })
      .from(expenses)
      .leftJoin(users, eq(expenses.recordedBy, users.id))
      .where(where)
      .orderBy(desc(expenses.expenseDate), desc(expenses.id))
      .limit(5000);
    return rows.map((r) => ({ ...r.expense, recordedByName: r.recordedByName }));
  }),

  summary: permissionProcedure("expenses.view").query(async () => {
    const db = getDb();
    const monthStart = new Date();
    monthStart.setDate(1);
    const monthStartStr = monthStart.toISOString().slice(0, 10);
    const todayStr = new Date().toISOString().slice(0, 10);

    const active = eq(expenses.status, "ACTIVE");

    const [month] = await db
      .select({ total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)`, count: count() })
      .from(expenses)
      .where(and(active, gte(expenses.expenseDate, new Date(`${monthStartStr}T00:00:00`))));
    const [today] = await db
      .select({ total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)`, count: count() })
      .from(expenses)
      .where(and(active, eq(expenses.expenseDate, new Date(`${todayStr}T00:00:00`))));

    const byCategory = await db
      .select({ category: expenses.category, total: sql<string>`SUM(${expenses.amount})`, count: count() })
      .from(expenses)
      .where(and(active, gte(expenses.expenseDate, new Date(`${monthStartStr}T00:00:00`))))
      .groupBy(expenses.category)
      .orderBy(desc(sql`SUM(${expenses.amount})`));

    const bySection = await db
      .select({ section: expenses.section, total: sql<string>`SUM(${expenses.amount})`, count: count() })
      .from(expenses)
      .where(and(active, gte(expenses.expenseDate, new Date(`${monthStartStr}T00:00:00`))))
      .groupBy(expenses.section);

    return {
      monthTotal: Number(month?.total ?? 0),
      monthCount: month?.count ?? 0,
      todayTotal: Number(today?.total ?? 0),
      todayCount: today?.count ?? 0,
      topCategory: byCategory[0]?.category ?? null,
      byCategory: byCategory.map((c) => ({ category: c.category, total: Number(c.total), count: c.count })),
      bySection: bySection.map((s) => ({ section: s.section, total: Number(s.total), count: s.count })),
    };
  }),

  record: permissionProcedure("expenses.record").input(recordInput).mutation(async ({ input, ctx }) => {
    // Managers park the expense for admin review when the workflow requires it.
    if (await isApprovalGated(ctx.user.role, "EXPENSE_RECORD")) {
      const requestId = await submitApproval({
        requestType: "EXPENSE_RECORD",
        entityType: "EXPENSE",
        payload: { ...input, requestedBy: ctx.user.id, branchId: ctx.user.branchId ?? null },
        summary: `Record expense: ${input.description} — ₦${input.amount.toLocaleString()} (${input.category.replace(/_/g, " ")})`,
        requesterId: ctx.user.id,
      });
      await logAudit({
        actorId: ctx.user.id,
        action: "expense.record_requested",
        entityType: "EXPENSE",
        entityId: null,
        description: `${ctx.user.fullName} requested expense approval: ${input.description} — ₦${input.amount.toLocaleString()}.`,
        ...requestMeta(ctx.req),
      });
      return { pending: true as const, requestId };
    }

    const result = await applyExpenseRecord({ ...input }, ctx.user.id, ctx.user.branchId ?? null);
    await logAudit({
      actorId: ctx.user.id,
      action: "expense.record",
      entityType: "EXPENSE",
      entityId: result.expenseId,
      description: `Recorded expense ${result.refNo}: ${input.description} — ₦${input.amount.toLocaleString()}.`,
      ...requestMeta(ctx.req),
    });
    return { pending: false as const, ...result };
  }),

  void: permissionProcedure("expenses.void")
    .input(z.object({ expenseId: z.number().int().positive(), reason: z.string().min(3).max(300) }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const rows = await db.select().from(expenses).where(eq(expenses.id, input.expenseId)).limit(1);
      const expense = rows[0];
      if (!expense) throw new TRPCError({ code: "NOT_FOUND", message: "Expense not found." });
      if (expense.status === "VOIDED") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This expense is already voided." });
      }

      await db.transaction(async (tx) => {
        await tx
          .update(expenses)
          .set({ status: "VOIDED", voidedBy: ctx.user.id, voidReason: input.reason })
          .where(eq(expenses.id, expense.id));

        // Compensating IN row — the money never really left.
        await recordMoneyMovement(
          {
            direction: "IN",
            section: expense.section,
            branchId: expense.branchId ?? null,
            sourceType: "MANUAL_IN",
            sourceId: expense.id,
            sourceRef: expense.refNo,
            amount: Number(expense.amount),
            paymentMethod: expense.paymentMethod,
            note: `Void reversal of expense ${expense.refNo} — ${input.reason}`,
            createdBy: ctx.user.id,
          },
          tx,
        );
      });

      await logAudit({
        actorId: ctx.user.id,
        action: "expense.void",
        entityType: "EXPENSE",
        entityId: expense.id,
        description: `Voided expense ${expense.refNo} (₦${Number(expense.amount).toLocaleString()}). Reason: ${input.reason}.`,
        beforeData: { status: "ACTIVE", amount: expense.amount },
        afterData: { status: "VOIDED" },
        ...requestMeta(ctx.req),
      });
      return { ok: true };
    }),
});

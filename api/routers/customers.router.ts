import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, like, or, sql, type SQL } from "drizzle-orm";
import { createRouter } from "../middleware";
import { permissionProcedure } from "../trpc";
import { getDb } from "../queries/connection";
import { customers, sales, users } from "@db/schema";
import { isApprovalGated, submitApproval } from "../services/approvals.service";
import { logAudit, requestMeta } from "../services/audit.service";
import { CUSTOMER_STATUSES, GENDERS } from "@contracts/constants";

/**
 * HADRAN FABRICS MALL — customers router
 * POS search/attach plus full customer management: registered & special
 * customers, personal discounts (manager discount changes are gated by
 * the admin approval workflow), statuses and purchase history.
 */

const customerInput = z.object({
  fullName: z.string().min(3, "Full name is required").max(160),
  phone: z.string().min(7, "Phone number looks too short").max(40),
  email: z.string().email("Enter a valid email").max(160).optional().or(z.literal("")),
  address: z.string().max(1000).optional(),
  gender: z.enum(GENDERS).nullable().optional(),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").nullable().optional(),
  notes: z.string().max(2000).optional(),
  discountPercent: z.number().min(0).max(100).default(0),
  discountNote: z.string().max(255).optional(),
});

async function nextCustomerCode(): Promise<string> {
  const db = getDb();
  const [row] = await db.select({ value: count() }).from(customers);
  return `CUS-${String((row?.value ?? 0) + 1).padStart(4, "0")}`;
}

export const customersRouter = createRouter({
  /* ------------------------- POS (Phase 5) ------------------------- */

  /** Lightweight search for the POS customer picker. */
  search: permissionProcedure("customers.view")
    .input(z.object({ query: z.string().max(120).optional() }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      const q = input?.query?.trim();
      const where = q
        ? or(
            like(customers.fullName, `%${q}%`),
            like(customers.phone, `%${q}%`),
            like(customers.code, `%${q}%`),
          )
        : undefined;
      return db
        .select({
          id: customers.id,
          code: customers.code,
          fullName: customers.fullName,
          phone: customers.phone,
          discountPercent: customers.discountPercent,
          loyaltyPoints: customers.loyaltyPoints,
          totalSpent: customers.totalSpent,
          status: customers.status,
        })
        .from(customers)
        .where(where)
        .orderBy(asc(customers.fullName))
        .limit(15);
    }),

  /* ------------------------- MANAGEMENT (Phase 6) ------------------------- */

  list: permissionProcedure("customers.view")
    .input(
      z.object({
        search: z.string().max(120).optional(),
        status: z.enum(CUSTOMER_STATUSES).optional(),
        withDiscountOnly: z.boolean().default(false),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(5).max(50).default(15),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const conds: SQL[] = [];
      if (input.search) {
        conds.push(
          or(
            like(customers.fullName, `%${input.search}%`),
            like(customers.phone, `%${input.search}%`),
            like(customers.code, `%${input.search}%`),
            like(customers.email, `%${input.search}%`),
          )!,
        );
      }
      if (input.status) conds.push(eq(customers.status, input.status));
      if (input.withDiscountOnly) conds.push(sql`${customers.discountPercent} > 0`);
      const where = conds.length ? and(...conds) : undefined;

      const [total] = await db.select({ value: count() }).from(customers).where(where);
      const items = await db
        .select()
        .from(customers)
        .where(where)
        .orderBy(desc(customers.totalSpent))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      return { items, total: total?.value ?? 0, page: input.page, pageSize: input.pageSize };
    }),

  /** Headline stats for the customers page. */
  stats: permissionProcedure("customers.view").query(async () => {
    const db = getDb();
    const [row] = await db
      .select({
        total: count(),
        withDiscount: sql<number>`SUM(CASE WHEN ${customers.discountPercent} > 0 THEN 1 ELSE 0 END)`,
        active: sql<number>`SUM(CASE WHEN ${customers.status} = 'ACTIVE' THEN 1 ELSE 0 END)`,
        totalSpent: sql<string>`COALESCE(SUM(${customers.totalSpent}), 0)`,
      })
      .from(customers);
    return {
      total: row?.total ?? 0,
      withDiscount: Number(row?.withDiscount ?? 0),
      active: Number(row?.active ?? 0),
      lifetimeValue: Number(row?.totalSpent ?? 0),
    };
  }),

  /** Full customer record + purchase history. */
  byId: permissionProcedure("customers.view")
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select({ customer: customers, creatorName: users.fullName })
        .from(customers)
        .leftJoin(users, eq(customers.createdBy, users.id))
        .where(eq(customers.id, input.id))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found." });

      const recentSales = await db
        .select({
          id: sales.id,
          receiptNo: sales.receiptNo,
          status: sales.status,
          itemCount: sales.itemCount,
          grandTotal: sales.grandTotal,
          createdAt: sales.createdAt,
          cashierName: users.fullName,
        })
        .from(sales)
        .leftJoin(users, eq(sales.cashierId, users.id))
        .where(eq(sales.customerId, input.id))
        .orderBy(desc(sales.createdAt))
        .limit(20);

      return { ...rows[0], recentSales };
    }),

  create: permissionProcedure("customers.manage")
    .input(customerInput)
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const meta = requestMeta(ctx.req);

      const dupPhone = await db.select().from(customers).where(eq(customers.phone, input.phone.trim())).limit(1);
      if (dupPhone[0]) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `That phone number already belongs to ${dupPhone[0].fullName} (${dupPhone[0].code}).`,
        });
      }

      // Manager discount on a brand-new customer → approval gate.
      if (input.discountPercent > 0 && (await isApprovalGated(ctx.user.role, "CUSTOMER_DISCOUNT"))) {
        const requestId = await submitApproval({
          requestType: "CUSTOMER_DISCOUNT",
          entityType: "CUSTOMER",
          payload: { action: "create", ...input },
          summary: `New customer "${input.fullName}" with ${input.discountPercent}% personal discount`,
          requesterId: ctx.user.id,
        });
        await logAudit({
          actorId: ctx.user.id,
          action: "customer.create.requested",
          entityType: "APPROVAL",
          entityId: requestId,
          description: `${ctx.user.fullName} requested customer "${input.fullName}" (${input.discountPercent}% discount) — pending admin approval.`,
          ...meta,
        });
        return { pending: true as const, approvalId: requestId, customerId: null };
      }

      const code = await nextCustomerCode();
      const [row] = await db
        .insert(customers)
        .values({
          code,
          fullName: input.fullName.trim(),
          phone: input.phone.trim(),
          email: input.email?.trim() || null,
          address: input.address?.trim() || null,
          gender: input.gender ?? null,
          birthday: input.birthday ? new Date(input.birthday) : null,
          notes: input.notes?.trim() || null,
          discountPercent: input.discountPercent,
          discountNote: input.discountNote?.trim() || null,
          createdBy: ctx.user.id,
        })
        .$returningId();

      await logAudit({
        actorId: ctx.user.id,
        action: "customer.create",
        entityType: "CUSTOMER",
        entityId: row.id,
        description: `Registered customer ${code} — ${input.fullName}${input.discountPercent > 0 ? ` (${input.discountPercent}% discount)` : ""}.`,
        afterData: { code, fullName: input.fullName, discountPercent: input.discountPercent },
        ...meta,
      });
      return { pending: false as const, customerId: row.id, code };
    }),

  update: permissionProcedure("customers.manage")
    .input(customerInput.extend({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const meta = requestMeta(ctx.req);

      const existing = await db.select().from(customers).where(eq(customers.id, input.id)).limit(1);
      if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found." });
      const before = existing[0];

      const dupPhone = await db
        .select()
        .from(customers)
        .where(and(eq(customers.phone, input.phone.trim()), sql`${customers.id} <> ${input.id}`))
        .limit(1);
      if (dupPhone[0]) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `That phone number already belongs to ${dupPhone[0].fullName} (${dupPhone[0].code}).`,
        });
      }

      const discountChanged = Number(before.discountPercent) !== input.discountPercent;

      // Manager changing a personal discount → approval gate (details applied on approval).
      if (discountChanged && (await isApprovalGated(ctx.user.role, "CUSTOMER_DISCOUNT"))) {
        const requestId = await submitApproval({
          requestType: "CUSTOMER_DISCOUNT",
          entityType: "CUSTOMER",
          entityId: input.id,
          payload: { action: "update", ...input, beforeDiscount: Number(before.discountPercent) },
          summary: `Change ${before.fullName}'s discount from ${before.discountPercent}% to ${input.discountPercent}%`,
          requesterId: ctx.user.id,
        });
        await logAudit({
          actorId: ctx.user.id,
          action: "customer.discount.requested",
          entityType: "APPROVAL",
          entityId: requestId,
          description: `${ctx.user.fullName} requested discount change for ${before.fullName} (${before.discountPercent}% → ${input.discountPercent}%) — pending admin approval.`,
          ...meta,
        });
        return { pending: true as const, approvalId: requestId };
      }

      await db
        .update(customers)
        .set({
          fullName: input.fullName.trim(),
          phone: input.phone.trim(),
          email: input.email?.trim() || null,
          address: input.address?.trim() || null,
          gender: input.gender ?? null,
          birthday: input.birthday ? new Date(input.birthday) : null,
          notes: input.notes?.trim() || null,
          discountPercent: input.discountPercent,
          discountNote: input.discountNote?.trim() || null,
        })
        .where(eq(customers.id, input.id));

      await logAudit({
        actorId: ctx.user.id,
        action: "customer.update",
        entityType: "CUSTOMER",
        entityId: input.id,
        description: `Updated customer ${before.code} — ${input.fullName}${discountChanged ? `; discount ${before.discountPercent}% → ${input.discountPercent}%` : ""}.`,
        beforeData: {
          fullName: before.fullName,
          phone: before.phone,
          discountPercent: Number(before.discountPercent),
        },
        afterData: { fullName: input.fullName, phone: input.phone, discountPercent: input.discountPercent },
        ...meta,
      });
      return { pending: false as const };
    }),

  setStatus: permissionProcedure("customers.manage")
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z.enum(CUSTOMER_STATUSES),
        reason: z.string().max(255).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const existing = await db.select().from(customers).where(eq(customers.id, input.id)).limit(1);
      if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found." });

      await db.update(customers).set({ status: input.status }).where(eq(customers.id, input.id));
      await logAudit({
        actorId: ctx.user.id,
        action: "customer.status",
        entityType: "CUSTOMER",
        entityId: input.id,
        description: `Customer ${existing[0].code} (${existing[0].fullName}) status ${existing[0].status} → ${input.status}${input.reason ? ` — ${input.reason}` : ""}.`,
        beforeData: { status: existing[0].status },
        afterData: { status: input.status },
        ...requestMeta(ctx.req),
      });
      return { ok: true };
    }),
});

import { z } from "zod";
import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, like, ne, or, sql, type SQL } from "drizzle-orm";
import { createRouter } from "../middleware";
import { permissionProcedure } from "../trpc";
import { getDb } from "../queries/connection";
import { auditLogs, sales, users } from "@db/schema";
import { logAudit, requestMeta } from "../services/audit.service";
import { USER_ROLES, USER_STATUSES } from "@contracts/roles";

/**
 * HADRAN FABRICS MALL — users router (Admin / Super Admin).
 * Staff accounts: create with initial password, edit, suspend/reactivate,
 * reset passwords. Super Admin accounts can only be managed by a
 * Super Admin. Every change is audit-logged.
 */

const userInput = z.object({
  fullName: z.string().min(3, "Full name is required").max(160),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(60)
    .regex(/^[a-zA-Z0-9._-]+$/, "Letters, numbers, dots, dashes and underscores only"),
  email: z.string().email("Enter a valid email").max(160).optional().or(z.literal("")),
  phone: z.string().max(40).optional(),
  role: z.enum(USER_ROLES),
  notes: z.string().max(1000).optional(),
});

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(100)
  .regex(/[a-zA-Z]/, "Password needs at least one letter")
  .regex(/[0-9]/, "Password needs at least one number");

async function nextStaffCode(): Promise<string> {
  const db = getDb();
  const [row] = await db.select({ value: count() }).from(users);
  return `HFM-${String((row?.value ?? 0) + 1).padStart(4, "0")}`;
}

/** Only a SUPER_ADMIN may touch another SUPER_ADMIN account. */
function assertCanManageTarget(actorRole: string, targetRole: string) {
  if (targetRole === "SUPER_ADMIN" && actorRole !== "SUPER_ADMIN") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only a Super Admin can manage Super Admin accounts.",
    });
  }
}

export const usersRouter = createRouter({
  list: permissionProcedure("users.view")
    .input(
      z.object({
        search: z.string().max(120).optional(),
        role: z.enum(USER_ROLES).optional(),
        status: z.enum(USER_STATUSES).optional(),
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
            like(users.fullName, `%${input.search}%`),
            like(users.username, `%${input.search}%`),
            like(users.staffCode, `%${input.search}%`),
            like(users.email, `%${input.search}%`),
          )!,
        );
      }
      if (input.role) conds.push(eq(users.role, input.role));
      if (input.status) conds.push(eq(users.status, input.status));
      const where = conds.length ? and(...conds) : undefined;

      const [total] = await db.select({ value: count() }).from(users).where(where);
      const items = await db
        .select({
          id: users.id,
          username: users.username,
          fullName: users.fullName,
          email: users.email,
          phone: users.phone,
          role: users.role,
          status: users.status,
          staffCode: users.staffCode,
          lastLoginAt: users.lastLoginAt,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(where)
        .orderBy(asc(users.fullName))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      return { items, total: total?.value ?? 0, page: input.page, pageSize: input.pageSize };
    }),

  stats: permissionProcedure("users.view").query(async () => {
    const db = getDb();
    const [row] = await db
      .select({
        total: count(),
        active: sql<number>`SUM(CASE WHEN ${users.status} = 'ACTIVE' THEN 1 ELSE 0 END)`,
        suspended: sql<number>`SUM(CASE WHEN ${users.status} = 'SUSPENDED' THEN 1 ELSE 0 END)`,
        salesStaff: sql<number>`SUM(CASE WHEN ${users.role} = 'SALES' THEN 1 ELSE 0 END)`,
      })
      .from(users);
    return {
      total: row?.total ?? 0,
      active: Number(row?.active ?? 0),
      suspended: Number(row?.suspended ?? 0),
      salesStaff: Number(row?.salesStaff ?? 0),
    };
  }),

  /** Simple options for pickers (cashiers etc.). */
  options: permissionProcedure("users.view").query(async () => {
    const db = getDb();
    return db
      .select({ id: users.id, fullName: users.fullName, role: users.role })
      .from(users)
      .where(eq(users.status, "ACTIVE"))
      .orderBy(asc(users.fullName));
  }),

  byId: permissionProcedure("users.view")
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select({
          user: users,
          creatorName: sql<string | null>`(SELECT full_name FROM users WHERE id = ${users.createdBy})`,
        })
        .from(users)
        .where(eq(users.id, input.id))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Staff member not found." });

      const now = new Date();
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const [salesToday] = await db
        .select({
          count: count(),
          revenue: sql<string>`COALESCE(SUM(CASE WHEN ${sales.status} = 'COMPLETED' THEN ${sales.grandTotal} ELSE 0 END), 0)`,
        })
        .from(sales)
        .where(and(eq(sales.cashierId, input.id), sql`${sales.createdAt} >= ${dayStart}`));

      const [activity] = await db
        .select({ value: count() })
        .from(auditLogs)
        .where(eq(auditLogs.actorId, input.id));

      const recentActivity = await db
        .select({
          id: auditLogs.id,
          action: auditLogs.action,
          description: auditLogs.description,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .where(eq(auditLogs.actorId, input.id))
        .orderBy(desc(auditLogs.createdAt))
        .limit(10);

      const { passwordHash: _ph, ...safeUser } = rows[0].user;
      return {
        user: safeUser,
        creatorName: rows[0].creatorName,
        todaySales: salesToday?.count ?? 0,
        todayRevenue: Number(salesToday?.revenue ?? 0),
        totalActions: activity?.value ?? 0,
        recentActivity,
      };
    }),

  create: permissionProcedure("users.manage")
    .input(userInput.extend({ password: passwordSchema }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      assertCanManageTarget(ctx.user.role, input.role);

      const dup = await db.select().from(users).where(eq(users.username, input.username.trim().toLowerCase())).limit(1);
      if (dup[0]) throw new TRPCError({ code: "CONFLICT", message: `Username "${input.username}" is already taken.` });

      const staffCode = await nextStaffCode();
      const [row] = await db
        .insert(users)
        .values({
          fullName: input.fullName.trim(),
          username: input.username.trim().toLowerCase(),
          passwordHash: bcrypt.hashSync(input.password, 10),
          email: input.email?.trim() || null,
          phone: input.phone?.trim() || null,
          role: input.role,
          staffCode,
          notes: input.notes?.trim() || null,
          createdBy: ctx.user.id,
        })
        .$returningId();

      await logAudit({
        actorId: ctx.user.id,
        action: "user.create",
        entityType: "USER",
        entityId: row.id,
        description: `Created staff account ${staffCode} — ${input.fullName} (${input.role}).`,
        afterData: { staffCode, fullName: input.fullName, username: input.username, role: input.role },
        ...requestMeta(ctx.req),
      });
      return { id: row.id, staffCode };
    }),

  update: permissionProcedure("users.manage")
    .input(userInput.extend({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const rows = await db.select().from(users).where(eq(users.id, input.id)).limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Staff member not found." });
      const before = rows[0];
      assertCanManageTarget(ctx.user.role, before.role);
      assertCanManageTarget(ctx.user.role, input.role);

      // Protect the last active Super Admin from demotion.
      if (before.role === "SUPER_ADMIN" && input.role !== "SUPER_ADMIN") {
        const [sa] = await db
          .select({ value: count() })
          .from(users)
          .where(and(eq(users.role, "SUPER_ADMIN"), eq(users.status, "ACTIVE")));
        if ((sa?.value ?? 0) <= 1) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot demote the last active Super Admin." });
        }
      }

      const dup = await db
        .select()
        .from(users)
        .where(and(eq(users.username, input.username.trim().toLowerCase()), ne(users.id, input.id)))
        .limit(1);
      if (dup[0]) throw new TRPCError({ code: "CONFLICT", message: `Username "${input.username}" is already taken.` });

      await db
        .update(users)
        .set({
          fullName: input.fullName.trim(),
          username: input.username.trim().toLowerCase(),
          email: input.email?.trim() || null,
          phone: input.phone?.trim() || null,
          role: input.role,
          notes: input.notes?.trim() || null,
        })
        .where(eq(users.id, input.id));

      await logAudit({
        actorId: ctx.user.id,
        action: "user.update",
        entityType: "USER",
        entityId: input.id,
        description: `Updated staff ${before.staffCode} — ${input.fullName}${before.role !== input.role ? `; role ${before.role} → ${input.role}` : ""}.`,
        beforeData: { fullName: before.fullName, username: before.username, role: before.role },
        afterData: { fullName: input.fullName, username: input.username, role: input.role },
        ...requestMeta(ctx.req),
      });
      return { ok: true };
    }),

  setStatus: permissionProcedure("users.manage")
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z.enum(USER_STATUSES),
        reason: z.string().max(255).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (input.id === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot suspend your own account." });
      }
      const rows = await db.select().from(users).where(eq(users.id, input.id)).limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Staff member not found." });
      assertCanManageTarget(ctx.user.role, rows[0].role);

      if (rows[0].role === "SUPER_ADMIN" && input.status === "SUSPENDED") {
        const [sa] = await db
          .select({ value: count() })
          .from(users)
          .where(and(eq(users.role, "SUPER_ADMIN"), eq(users.status, "ACTIVE")));
        if ((sa?.value ?? 0) <= 1) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot suspend the last active Super Admin." });
        }
      }

      await db.update(users).set({ status: input.status }).where(eq(users.id, input.id));
      await logAudit({
        actorId: ctx.user.id,
        action: "user.status",
        entityType: "USER",
        entityId: input.id,
        description: `Staff ${rows[0].staffCode} (${rows[0].fullName}) status ${rows[0].status} → ${input.status}${input.reason ? ` — ${input.reason}` : ""}.`,
        beforeData: { status: rows[0].status },
        afterData: { status: input.status },
        ...requestMeta(ctx.req),
      });
      return { ok: true };
    }),

  resetPassword: permissionProcedure("users.manage")
    .input(z.object({ id: z.number().int().positive(), password: passwordSchema }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const rows = await db.select().from(users).where(eq(users.id, input.id)).limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Staff member not found." });
      assertCanManageTarget(ctx.user.role, rows[0].role);

      await db.update(users).set({ passwordHash: bcrypt.hashSync(input.password, 10) }).where(eq(users.id, input.id));
      await logAudit({
        actorId: ctx.user.id,
        action: "user.password_reset",
        entityType: "USER",
        entityId: input.id,
        description: `Password reset for ${rows[0].staffCode} (${rows[0].fullName}) by ${ctx.user.fullName}.`,
        ...requestMeta(ctx.req),
      });
      return { ok: true };
    }),
});

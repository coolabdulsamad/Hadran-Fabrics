import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { createRouter } from "../middleware";
import { permissionProcedure } from "../trpc";
import { getDb } from "../queries/connection";
import { rolePermissions, userPermissions, users } from "@db/schema";
import { logAudit, requestMeta } from "../services/audit.service";
import { PERMISSIONS, PERMISSION_KEYS } from "@contracts/permissions";
import { USER_ROLES } from "@contracts/roles";

/**
 * HADRAN FABRICS MALL — permissions router (Admin / Super Admin).
 * Two layers:
 *   1. Role matrix — what each role may do (role_permissions).
 *   2. User overrides — grant/revoke a specific permission for one
 *      person (user_permissions), winning over the role default.
 * SUPER_ADMIN is hardcoded to everything and cannot be edited here.
 */

export const permissionsRouter = createRouter({
  /** The full catalog grouped for the matrix UI. */
  catalog: permissionProcedure("permissions.manage").query(() => {
    const groups = new Map<string, typeof PERMISSIONS>();
    for (const p of PERMISSIONS) {
      const list = groups.get(p.group) ?? [];
      list.push(p);
      groups.set(p.group, list);
    }
    return Array.from(groups.entries()).map(([group, items]) => ({ group, items }));
  }),

  /** Role × permission matrix. */
  matrix: permissionProcedure("permissions.manage").query(async () => {
    const db = getDb();
    const rows = await db.select().from(rolePermissions);
    const matrix: Record<string, Record<string, boolean>> = {};
    for (const role of USER_ROLES) {
      matrix[role] = {};
      for (const key of PERMISSION_KEYS) matrix[role][key] = role === "SUPER_ADMIN";
    }
    for (const r of rows) {
      if (r.role === "SUPER_ADMIN") continue; // always full access
      matrix[r.role][r.permissionKey] = r.allowed;
    }
    return matrix;
  }),

  setRolePermission: permissionProcedure("permissions.manage")
    .input(
      z.object({
        role: z.enum(USER_ROLES),
        permissionKey: z.string().min(1).max(100),
        allowed: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (input.role === "SUPER_ADMIN") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Super Admin always has full access — nothing to change." });
      }
      if (!PERMISSION_KEYS.includes(input.permissionKey)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown permission key." });
      }

      const existing = await db
        .select()
        .from(rolePermissions)
        .where(and(eq(rolePermissions.role, input.role), eq(rolePermissions.permissionKey, input.permissionKey)))
        .limit(1);

      if (existing[0]) {
        await db
          .update(rolePermissions)
          .set({ allowed: input.allowed })
          .where(and(eq(rolePermissions.role, input.role), eq(rolePermissions.permissionKey, input.permissionKey)));
      } else {
        await db.insert(rolePermissions).values({ role: input.role, permissionKey: input.permissionKey, allowed: input.allowed });
      }

      const def = PERMISSIONS.find((p) => p.key === input.permissionKey);
      await logAudit({
        actorId: ctx.user.id,
        action: "permissions.role_update",
        entityType: "PERMISSION",
        description: `${ctx.user.fullName} ${input.allowed ? "granted" : "revoked"} "${def?.label ?? input.permissionKey}" for role ${input.role}.`,
        beforeData: { allowed: existing[0]?.allowed ?? null },
        afterData: { role: input.role, permissionKey: input.permissionKey, allowed: input.allowed },
        ...requestMeta(ctx.req),
      });
      return { ok: true };
    }),

  /** Staff list with their override counts (for the override picker). */
  overrideUsers: permissionProcedure("permissions.manage").query(async () => {
    const db = getDb();
    const staff = await db
      .select({ id: users.id, fullName: users.fullName, username: users.username, role: users.role, status: users.status })
      .from(users)
      .orderBy(asc(users.fullName));
    const overrides = await db.select().from(userPermissions);
    return staff.map((u) => ({
      ...u,
      overrideCount: overrides.filter((o) => o.userId === u.id).length,
    }));
  }),

  /** One user's overrides + their effective role defaults. */
  userOverrides: permissionProcedure("permissions.manage")
    .input(z.object({ userId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getDb();
      const userRows = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
      if (!userRows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Staff member not found." });

      const roleRows = await db.select().from(rolePermissions).where(eq(rolePermissions.role, userRows[0].role));
      const roleMap = new Map(roleRows.map((r) => [r.permissionKey, r.allowed]));

      const overrideRows = await db.select().from(userPermissions).where(eq(userPermissions.userId, input.userId));
      const overrideMap = new Map(overrideRows.map((o) => [o.permissionKey, o.allowed]));

      return {
        user: {
          id: userRows[0].id,
          fullName: userRows[0].fullName,
          username: userRows[0].username,
          role: userRows[0].role,
        },
        permissions: PERMISSION_KEYS.map((key) => ({
          key,
          roleDefault: userRows[0].role === "SUPER_ADMIN" ? true : (roleMap.get(key) ?? false),
          override: overrideMap.has(key) ? (overrideMap.get(key) as boolean) : null, // null = inherit
        })),
      };
    }),

  /** Set (or clear) a per-user override. allowed=null → inherit from role. */
  setUserOverride: permissionProcedure("permissions.manage")
    .input(
      z.object({
        userId: z.number().int().positive(),
        permissionKey: z.string().min(1).max(100),
        allowed: z.boolean().nullable(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const userRows = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
      if (!userRows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Staff member not found." });
      if (userRows[0].role === "SUPER_ADMIN") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Super Admin always has full access — overrides have no effect." });
      }
      if (!PERMISSION_KEYS.includes(input.permissionKey)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown permission key." });
      }

      await db
        .delete(userPermissions)
        .where(and(eq(userPermissions.userId, input.userId), eq(userPermissions.permissionKey, input.permissionKey)));
      if (input.allowed !== null) {
        await db.insert(userPermissions).values({
          userId: input.userId,
          permissionKey: input.permissionKey,
          allowed: input.allowed,
          grantedBy: ctx.user.id,
        });
      }

      const def = PERMISSIONS.find((p) => p.key === input.permissionKey);
      await logAudit({
        actorId: ctx.user.id,
        action: "permissions.user_override",
        entityType: "USER",
        entityId: input.userId,
        description:
          input.allowed === null
            ? `${ctx.user.fullName} cleared the "${def?.label ?? input.permissionKey}" override for ${userRows[0].fullName} — now inherits from ${userRows[0].role}.`
            : `${ctx.user.fullName} ${input.allowed ? "granted" : "revoked"} "${def?.label ?? input.permissionKey}" specifically for ${userRows[0].fullName}.`,
        afterData: { userId: input.userId, permissionKey: input.permissionKey, allowed: input.allowed },
        ...requestMeta(ctx.req),
      });
      return { ok: true };
    }),
});

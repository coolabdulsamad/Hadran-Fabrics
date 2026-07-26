import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { asc, eq, like, or } from "drizzle-orm";
import { createRouter } from "../middleware";
import { permissionProcedure } from "../trpc";
import { getDb } from "../queries/connection";
import { suppliers } from "@db/schema";
import { logAudit, requestMeta } from "../services/audit.service";

/**
 * HADRAN FABRICS MALL — suppliers router
 */
export const suppliersRouter = createRouter({
  list: permissionProcedure("inventory.manage_suppliers")
    .input(z.object({ search: z.string().max(120).optional() }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      const where = input?.search
        ? or(like(suppliers.name, `%${input.search}%`), like(suppliers.contactPerson, `%${input.search}%`), like(suppliers.phone, `%${input.search}%`))
        : undefined;
      return db.select().from(suppliers).where(where).orderBy(asc(suppliers.name)).limit(200);
    }),

  /** Lightweight list for dropdowns. */
  options: permissionProcedure("inventory.view").query(async () => {
    const db = getDb();
    return db
      .select({ id: suppliers.id, name: suppliers.name })
      .from(suppliers)
      .where(eq(suppliers.isActive, true))
      .orderBy(asc(suppliers.name));
  }),

  create: permissionProcedure("inventory.manage_suppliers")
    .input(
      z.object({
        name: z.string().min(2).max(160),
        contactPerson: z.string().max(160).optional(),
        phone: z.string().max(40).optional(),
        email: z.string().email().max(160).optional().or(z.literal("")),
        address: z.string().max(1000).optional(),
        notes: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const [row] = await db
        .insert(suppliers)
        .values({
          name: input.name.trim(),
          contactPerson: input.contactPerson || null,
          phone: input.phone || null,
          email: input.email || null,
          address: input.address || null,
          notes: input.notes || null,
        })
        .$returningId();

      await logAudit({
        actorId: ctx.user.id,
        action: "supplier.create",
        entityType: "SUPPLIER",
        entityId: row.id,
        description: `Created supplier "${input.name.trim()}".`,
        afterData: input as unknown as Record<string, unknown>,
        ...requestMeta(ctx.req),
      });
      return { id: row.id };
    }),

  update: permissionProcedure("inventory.manage_suppliers")
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().min(2).max(160),
        contactPerson: z.string().max(160).optional(),
        phone: z.string().max(40).optional(),
        email: z.string().email().max(160).optional().or(z.literal("")),
        address: z.string().max(1000).optional(),
        notes: z.string().max(1000).optional(),
        isActive: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const before = await db.select().from(suppliers).where(eq(suppliers.id, input.id)).limit(1);
      if (!before[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Supplier not found." });

      const { id, ...data } = input;
      await db
        .update(suppliers)
        .set({
          name: data.name.trim(),
          contactPerson: data.contactPerson || null,
          phone: data.phone || null,
          email: data.email || null,
          address: data.address || null,
          notes: data.notes || null,
          isActive: data.isActive,
        })
        .where(eq(suppliers.id, id));

      await logAudit({
        actorId: ctx.user.id,
        action: "supplier.update",
        entityType: "SUPPLIER",
        entityId: id,
        description: `Updated supplier "${before[0].name}".`,
        beforeData: before[0] as unknown as Record<string, unknown>,
        afterData: input as unknown as Record<string, unknown>,
        ...requestMeta(ctx.req),
      });
      return { ok: true };
    }),
});

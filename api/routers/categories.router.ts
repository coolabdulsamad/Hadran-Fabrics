import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { asc, count, eq } from "drizzle-orm";
import { createRouter } from "../middleware";
import { permissionProcedure } from "../trpc";
import { getDb } from "../queries/connection";
import { categories, products } from "@db/schema";
import { logAudit, requestMeta } from "../services/audit.service";

/**
 * HADRAN FABRICS MALL — categories router
 */
export const categoriesRouter = createRouter({
  /** Full category list with product counts (tree-ready: includes parentId). */
  list: permissionProcedure("products.view").query(async () => {
    const db = getDb();
    const rows = await db
      .select({
        id: categories.id,
        name: categories.name,
        description: categories.description,
        parentId: categories.parentId,
        imageUrl: categories.imageUrl,
        sortOrder: categories.sortOrder,
        isActive: categories.isActive,
        productCount: count(products.id),
      })
      .from(categories)
      .leftJoin(products, eq(products.categoryId, categories.id))
      .groupBy(categories.id)
      .orderBy(asc(categories.sortOrder), asc(categories.name));
    return rows;
  }),

  create: permissionProcedure("products.manage_categories")
    .input(
      z.object({
        name: z.string().min(2, "Category name is too short").max(120),
        description: z.string().max(1000).optional(),
        parentId: z.number().int().positive().nullable().optional(),
        sortOrder: z.number().int().min(0).default(0),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const dup = await db.select().from(categories).where(eq(categories.name, input.name.trim())).limit(1);
      if (dup[0]) throw new TRPCError({ code: "CONFLICT", message: "A category with this name already exists." });

      const [row] = await db
        .insert(categories)
        .values({
          name: input.name.trim(),
          description: input.description ?? null,
          parentId: input.parentId ?? null,
          sortOrder: input.sortOrder,
        })
        .$returningId();

      await logAudit({
        actorId: ctx.user.id,
        action: "category.create",
        entityType: "CATEGORY",
        entityId: row.id,
        description: `Created category "${input.name.trim()}".`,
        afterData: { name: input.name.trim(), parentId: input.parentId ?? null },
        ...requestMeta(ctx.req),
      });
      return { id: row.id };
    }),

  update: permissionProcedure("products.manage_categories")
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().min(2).max(120),
        description: z.string().max(1000).optional(),
        parentId: z.number().int().positive().nullable().optional(),
        sortOrder: z.number().int().min(0),
        isActive: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const before = await db.select().from(categories).where(eq(categories.id, input.id)).limit(1);
      if (!before[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Category not found." });
      if (input.parentId === input.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A category cannot be its own parent." });
      }

      await db
        .update(categories)
        .set({
          name: input.name.trim(),
          description: input.description ?? null,
          parentId: input.parentId ?? null,
          sortOrder: input.sortOrder,
          isActive: input.isActive,
        })
        .where(eq(categories.id, input.id));

      await logAudit({
        actorId: ctx.user.id,
        action: "category.update",
        entityType: "CATEGORY",
        entityId: input.id,
        description: `Updated category "${before[0].name}" → "${input.name.trim()}".`,
        beforeData: before[0] as unknown as Record<string, unknown>,
        afterData: input as unknown as Record<string, unknown>,
        ...requestMeta(ctx.req),
      });
      return { ok: true };
    }),
});

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, like, or, type SQL } from "drizzle-orm";
import { createRouter } from "../middleware";
import { permissionProcedure } from "../trpc";
import { getDb } from "../queries/connection";
import { categories, productImages, products, stockMovements, suppliers, users } from "@db/schema";
import { recordMovement } from "../services/inventory.service";
import { isApprovalGated, submitApproval } from "../services/approvals.service";
import { logAudit, requestMeta } from "../services/audit.service";
import { MATERIAL_TYPES, PRODUCT_TYPES, UNITS } from "@contracts/constants";

/**
 * HADRAN FABRICS MALL — products router
 * Full catalog CRUD. Manager create/edit/delete actions are routed through
 * the admin approval workflow; Admin/Super Admin apply immediately.
 */

/** Accepts absolute http(s) URLs and server-relative /uploads/... paths. */
const imageUrl = z
  .string()
  .max(500)
  .refine((v) => /^https?:\/\/.+/.test(v) || /^\/uploads\/[\w\-./]+$/.test(v), {
    message: "Must be an http(s) URL or an uploaded file path",
  });

const productInput = z.object({
  sku: z.string().min(3, "SKU is required (min 3 chars)").max(50),
  barcode: z.string().max(64).optional().or(z.literal("")),
  name: z.string().min(3, "Product name is too short").max(255),
  description: z.string().max(3000).optional(),
  categoryId: z.number().int().positive("Select a category"),
  supplierId: z.number().int().positive().nullable().optional(),
  productType: z.enum(PRODUCT_TYPES),
  materialType: z.enum(MATERIAL_TYPES).nullable().optional(),
  color: z.string().max(80).optional(),
  pattern: z.string().max(120).optional(),
  brand: z.string().max(120).optional(),
  unitOfMeasure: z.enum(UNITS),
  packSize: z.number().positive().nullable().optional(),
  allowFractional: z.boolean(),
  costPrice: z.number().min(0),
  sellingPrice: z.number().min(0, "Selling price is required"),
  wholesalePrice: z.number().min(0).nullable().optional(),
  taxRate: z.number().min(0).max(100),
  taxExempt: z.boolean().default(false),
  discountEligible: z.boolean(),
  reorderLevel: z.number().min(0),
  shelfLocation: z.string().max(80).optional(),
  // Absolute http(s) URLs (e.g. Cloudinary) OR server-relative upload paths.
  primaryImageUrl: imageUrl.optional().or(z.literal("")),
  imageUrls: z.array(imageUrl).max(6).optional(),
  openingStock: z.number().min(0).optional(), // create only
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).default("ACTIVE"),
});

const productUpdateInput = productInput.omit({ openingStock: true }).extend({
  id: z.number().int().positive(),
});

type ProductInput = z.infer<typeof productInput>;

function toDbValues(input: ProductInput | z.infer<typeof productUpdateInput>, userId: number) {
  return {
    sku: input.sku.trim().toUpperCase(),
    barcode: input.barcode ? input.barcode.trim() : null,
    name: input.name.trim(),
    description: input.description || null,
    categoryId: input.categoryId,
    supplierId: input.supplierId ?? null,
    productType: input.productType,
    materialType: input.materialType ?? null,
    color: input.color || null,
    pattern: input.pattern || null,
    brand: input.brand || null,
    unitOfMeasure: input.unitOfMeasure,
    packSize: input.packSize ?? null,
    allowFractional: input.allowFractional,
    costPrice: input.costPrice,
    sellingPrice: input.sellingPrice,
    wholesalePrice: input.wholesalePrice ?? null,
    taxRate: input.taxRate,
    taxExempt: input.taxExempt,
    discountEligible: input.discountEligible,
    reorderLevel: input.reorderLevel,
    shelfLocation: input.shelfLocation || null,
    primaryImageUrl: input.primaryImageUrl || null,
    status: input.status,
    updatedBy: userId,
  };
}

export const productsRouter = createRouter({
  /* ------------------------------- LIST ------------------------------- */
  list: permissionProcedure("products.view")
    .input(
      z.object({
        search: z.string().max(120).optional(),
        categoryId: z.number().int().positive().optional(),
        productType: z.enum(PRODUCT_TYPES).optional(),
        status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(5).max(100).default(15),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const conds: SQL[] = [];
      if (input.search) {
        conds.push(
          or(
            like(products.name, `%${input.search}%`),
            like(products.sku, `%${input.search}%`),
            like(products.barcode, `%${input.search}%`),
            like(products.color, `%${input.search}%`),
            like(products.brand, `%${input.search}%`),
          )!,
        );
      }
      if (input.categoryId) conds.push(eq(products.categoryId, input.categoryId));
      if (input.productType) conds.push(eq(products.productType, input.productType));
      if (input.status) conds.push(eq(products.status, input.status));
      const where = conds.length ? and(...conds) : undefined;

      const [total] = await db.select({ value: count() }).from(products).where(where);

      const items = await db
        .select({
          id: products.id,
          sku: products.sku,
          barcode: products.barcode,
          name: products.name,
          productType: products.productType,
          materialType: products.materialType,
          color: products.color,
          unitOfMeasure: products.unitOfMeasure,
          packSize: products.packSize,
          allowFractional: products.allowFractional,
          costPrice: products.costPrice,
          sellingPrice: products.sellingPrice,
          taxRate: products.taxRate,
          taxExempt: products.taxExempt,
          discountEligible: products.discountEligible,
          currentStock: products.currentStock,
          reorderLevel: products.reorderLevel,
          primaryImageUrl: products.primaryImageUrl,
          status: products.status,
          approvalStatus: products.approvalStatus,
          categoryName: categories.name,
        })
        .from(products)
        .innerJoin(categories, eq(products.categoryId, categories.id))
        .where(where)
        .orderBy(desc(products.updatedAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      return { items, total: total?.value ?? 0, page: input.page, pageSize: input.pageSize };
    }),

  /* ----------------------------- DETAILS ------------------------------ */
  byId: permissionProcedure("products.view")
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select({ product: products, categoryName: categories.name, supplierName: suppliers.name, creatorName: users.fullName })
        .from(products)
        .innerJoin(categories, eq(products.categoryId, categories.id))
        .leftJoin(suppliers, eq(products.supplierId, suppliers.id))
        .leftJoin(users, eq(products.createdBy, users.id))
        .where(eq(products.id, input.id))
        .limit(1);
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found." });

      const images = await db
        .select()
        .from(productImages)
        .where(eq(productImages.productId, input.id))
        .orderBy(asc(productImages.sortOrder));

      const movements = await db
        .select({
          id: stockMovements.id,
          movementType: stockMovements.movementType,
          quantity: stockMovements.quantity,
          unit: stockMovements.unit,
          balanceAfter: stockMovements.balanceAfter,
          reason: stockMovements.reason,
          createdAt: stockMovements.createdAt,
          performedByName: users.fullName,
        })
        .from(stockMovements)
        .leftJoin(users, eq(stockMovements.performedBy, users.id))
        .where(eq(stockMovements.productId, input.id))
        .orderBy(desc(stockMovements.createdAt))
        .limit(12);

      return { ...row, images, movements };
    }),

  /* ------------------------- BARCODE LOOKUP (POS) ---------------------- */
  byBarcode: permissionProcedure("products.view")
    .input(z.object({ code: z.string().min(1).max(64) }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(products)
        .where(and(or(eq(products.barcode, input.code), eq(products.sku, input.code.toUpperCase())), eq(products.status, "ACTIVE")))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "No active product matches that code." });
      return rows[0];
    }),

  /* ----------------------------- SKU SUGGEST ---------------------------- */
  suggestSku: permissionProcedure("products.view")
    .input(z.object({ categoryId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getDb();
      const cat = await db.select().from(categories).where(eq(categories.id, input.categoryId)).limit(1);
      const words = (cat[0]?.name ?? "GEN").replace(/[^a-zA-Z ]/g, "").split(" ").filter(Boolean);
      const prefix = words.map((w) => w[0]).join("").slice(0, 3).toUpperCase().padEnd(3, "X");
      const [row] = await db.select({ value: count() }).from(products).where(like(products.sku, `${prefix}-%`));
      const next = (row?.value ?? 0) + 1;
      return { sku: `${prefix}-${String(next).padStart(4, "0")}` };
    }),

  /* ------------------------------- CREATE ------------------------------- */
  create: permissionProcedure("products.create")
    .input(productInput)
    .mutation(async ({ input, ctx }) => {
      const db = getDb();

      const dup = await db.select().from(products).where(eq(products.sku, input.sku.trim().toUpperCase())).limit(1);
      if (dup[0]) throw new TRPCError({ code: "CONFLICT", message: `SKU "${input.sku.toUpperCase()}" is already in use.` });
      if (input.barcode) {
        const bdup = await db.select().from(products).where(eq(products.barcode, input.barcode.trim())).limit(1);
        if (bdup[0]) throw new TRPCError({ code: "CONFLICT", message: "That barcode is already assigned to another product." });
      }

      // ---- Manager gate: park as approval request ----
      if (await isApprovalGated(ctx.user.role, "PRODUCT_CREATE")) {
        const requestId = await submitApproval({
          requestType: "PRODUCT_CREATE",
          entityType: "PRODUCT",
          payload: input as unknown as Record<string, unknown>,
          summary: `Add new product "${input.name}" (${input.sku.toUpperCase()}) — ${input.sellingPrice} ₦/${input.unitOfMeasure.toLowerCase()}`,
          requesterId: ctx.user.id,
        });
        await logAudit({
          actorId: ctx.user.id,
          action: "product.create.requested",
          entityType: "APPROVAL",
          entityId: requestId,
          description: `${ctx.user.fullName} requested to add product "${input.name}" — pending admin approval.`,
          afterData: input as unknown as Record<string, unknown>,
          ...requestMeta(ctx.req),
        });
        return { pending: true as const, approvalId: requestId };
      }

      // ---- Direct creation (Admin / Super Admin) ----
      const [row] = await db
        .insert(products)
        .values({ ...toDbValues(input, ctx.user.id), createdBy: ctx.user.id, approvalStatus: "APPROVED" })
        .$returningId();

      if (input.imageUrls?.length) {
        await db.insert(productImages).values(
          input.imageUrls.map((url, i) => ({ productId: row.id, url, sortOrder: i, isPrimary: i === 0 })),
        );
      }

      if (input.openingStock && input.openingStock > 0) {
        await recordMovement({
          productId: row.id,
          movementType: "STOCK_IN",
          quantity: input.openingStock,
          unit: input.unitOfMeasure,
          referenceType: "PRODUCT",
          referenceId: row.id,
          reason: "Opening stock",
          performedBy: ctx.user.id,
        });
      }

      await logAudit({
        actorId: ctx.user.id,
        action: "product.create",
        entityType: "PRODUCT",
        entityId: row.id,
        description: `Created product "${input.name}" (${input.sku.toUpperCase()}).`,
        afterData: input as unknown as Record<string, unknown>,
        ...requestMeta(ctx.req),
      });
      return { pending: false as const, id: row.id };
    }),

  /* ------------------------------- UPDATE ------------------------------- */
  update: permissionProcedure("products.edit")
    .input(productUpdateInput)
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const before = await db.select().from(products).where(eq(products.id, input.id)).limit(1);
      if (!before[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found." });

      if (input.sku.trim().toUpperCase() !== before[0].sku) {
        const dup = await db.select().from(products).where(eq(products.sku, input.sku.trim().toUpperCase())).limit(1);
        if (dup[0]) throw new TRPCError({ code: "CONFLICT", message: `SKU "${input.sku.toUpperCase()}" is already in use.` });
      }

      // ---- Manager gate ----
      if (await isApprovalGated(ctx.user.role, "PRODUCT_EDIT")) {
        const requestId = await submitApproval({
          requestType: "PRODUCT_EDIT",
          entityType: "PRODUCT",
          entityId: input.id,
          payload: {
            before: before[0] as unknown as Record<string, unknown>,
            changes: input as unknown as Record<string, unknown>,
          },
          summary: `Edit product "${before[0].name}" (${before[0].sku})`,
          requesterId: ctx.user.id,
        });
        await db.update(products).set({ approvalStatus: "PENDING" }).where(eq(products.id, input.id));
        await logAudit({
          actorId: ctx.user.id,
          action: "product.edit.requested",
          entityType: "APPROVAL",
          entityId: requestId,
          description: `${ctx.user.fullName} requested edits to "${before[0].name}" — pending admin approval.`,
          ...requestMeta(ctx.req),
        });
        return { pending: true as const, approvalId: requestId };
      }

      // ---- Direct update ----
      const { id, imageUrls, ...rest } = input;
      await db.update(products).set(toDbValues(rest as ProductInput, ctx.user.id)).where(eq(products.id, id));

      if (imageUrls) {
        await db.delete(productImages).where(eq(productImages.productId, id));
        if (imageUrls.length) {
          await db.insert(productImages).values(
            imageUrls.map((url, i) => ({ productId: id, url, sortOrder: i, isPrimary: i === 0 })),
          );
        }
      }

      await logAudit({
        actorId: ctx.user.id,
        action: "product.update",
        entityType: "PRODUCT",
        entityId: id,
        description: `Updated product "${before[0].name}" (${before[0].sku}).`,
        beforeData: before[0] as unknown as Record<string, unknown>,
        afterData: input as unknown as Record<string, unknown>,
        ...requestMeta(ctx.req),
      });
      return { pending: false as const, id };
    }),

  /* --------------------------- ARCHIVE (DELETE) -------------------------- */
  archive: permissionProcedure("products.delete")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const before = await db.select().from(products).where(eq(products.id, input.id)).limit(1);
      if (!before[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found." });

      if (await isApprovalGated(ctx.user.role, "PRODUCT_DELETE")) {
        const requestId = await submitApproval({
          requestType: "PRODUCT_DELETE",
          entityType: "PRODUCT",
          entityId: input.id,
          payload: { before: before[0] as unknown as Record<string, unknown> },
          summary: `Archive product "${before[0].name}" (${before[0].sku})`,
          requesterId: ctx.user.id,
        });
        await db.update(products).set({ approvalStatus: "PENDING" }).where(eq(products.id, input.id));
        await logAudit({
          actorId: ctx.user.id,
          action: "product.delete.requested",
          entityType: "APPROVAL",
          entityId: requestId,
          description: `${ctx.user.fullName} requested to archive "${before[0].name}" — pending admin approval.`,
          ...requestMeta(ctx.req),
        });
        return { pending: true as const, approvalId: requestId };
      }

      await db.update(products).set({ status: "ARCHIVED", updatedBy: ctx.user.id }).where(eq(products.id, input.id));
      await logAudit({
        actorId: ctx.user.id,
        action: "product.archive",
        entityType: "PRODUCT",
        entityId: input.id,
        description: `Archived product "${before[0].name}" (${before[0].sku}).`,
        beforeData: { status: before[0].status },
        afterData: { status: "ARCHIVED" },
        ...requestMeta(ctx.req),
      });
      return { pending: false as const };
    }),
});

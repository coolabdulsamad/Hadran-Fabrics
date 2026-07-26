import { and, count, desc, eq, lte, sql } from "drizzle-orm";
import { createRouter } from "../middleware";
import { authedProcedure } from "../trpc";
import { getDb } from "../queries/connection";
import { categories, products, settings, stockMovements, users } from "@db/schema";

/**
 * HADRAN FABRICS MALL — dashboard router
 * Real store summary for the shell dashboard (grows in later phases).
 */
export const dashboardRouter = createRouter({
  summary: authedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    // Inventory valuations are sensitive — sales staff never see them.
    const canSeeValuation = ctx.user.role !== "SALES";

    const [productCount] = await db
      .select({ value: count() })
      .from(products)
      .where(eq(products.status, "ACTIVE"));

    const [categoryCount] = await db.select({ value: count() }).from(categories);

    const [staffCount] = await db.select({ value: count() }).from(users).where(eq(users.status, "ACTIVE"));

    // Products at or below reorder level
    const lowStock = await db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        currentStock: products.currentStock,
        reorderLevel: products.reorderLevel,
        unitOfMeasure: products.unitOfMeasure,
      })
      .from(products)
      .where(and(eq(products.status, "ACTIVE"), lte(products.currentStock, products.reorderLevel)))
      .limit(10);

    const [stockValueRow] = canSeeValuation
      ? await db
          .select({
            cost: sql<number>`COALESCE(SUM(${products.currentStock} * ${products.costPrice}), 0)`,
            retail: sql<number>`COALESCE(SUM(${products.currentStock} * ${products.sellingPrice}), 0)`,
          })
          .from(products)
          .where(eq(products.status, "ACTIVE"))
      : [undefined];

    const storeName = await db.select().from(settings).where(eq(settings.key, "store.name")).limit(1);

    return {
      activeProducts: productCount?.value ?? 0,
      categories: categoryCount?.value ?? 0,
      activeStaff: staffCount?.value ?? 0,
      lowStockCount: lowStock.length,
      lowStock,
      stockValueAtCost: stockValueRow ? Number(stockValueRow.cost ?? 0) : null,
      stockValueAtRetail: stockValueRow ? Number(stockValueRow.retail ?? 0) : null,
      storeName: storeName[0] ? (JSON.parse(storeName[0].value) as string) : "Hadran Fabrics Mall",
    };
  }),

  recentMovements: authedProcedure.query(async () => {
    const db = getDb();
    return db
      .select({
        id: stockMovements.id,
        movementType: stockMovements.movementType,
        quantity: stockMovements.quantity,
        unit: stockMovements.unit,
        balanceAfter: stockMovements.balanceAfter,
        reason: stockMovements.reason,
        createdAt: stockMovements.createdAt,
        productName: products.name,
        sku: products.sku,
        performedByName: users.fullName,
      })
      .from(stockMovements)
      .innerJoin(products, eq(stockMovements.productId, products.id))
      .leftJoin(users, eq(stockMovements.performedBy, users.id))
      .orderBy(desc(stockMovements.createdAt))
      .limit(8);
  }),
});

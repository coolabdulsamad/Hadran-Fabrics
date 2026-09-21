import { and, count, desc, eq, lte, sql } from "drizzle-orm";
import { createRouter } from "../middleware";
import { authedProcedure } from "../trpc";
import { getDb } from "../queries/connection";
import { categories, products, settings, stockLevels, stockMovements, users } from "@db/schema";
import { branchScope, getMainBranchId } from "../services/branch.service";

/**
 * HADRAN FABRICS MALL — dashboard router
 * Store summary for the shell dashboard. Everything stock-, staff- or
 * movement-related is scoped to the request's active branch — switching
 * branches switches the dashboard with them. (Catalog counts are shared
 * master data and stay company-wide.)
 */
export const dashboardRouter = createRouter({
  summary: authedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    // Inventory valuations are sensitive — sales staff never see them.
    const canSeeValuation = ctx.user.role !== "SALES";
    const branchId = ctx.activeBranchId ?? (await getMainBranchId());

    const [productCount] = await db
      .select({ value: count() })
      .from(products)
      .where(eq(products.status, "ACTIVE"));

    const [categoryCount] = await db.select({ value: count() }).from(categories);

    // Staff working at this branch (MAIN also counts unassigned staff).
    const staffScope = branchScope(users.branchId, ctx.activeBranch);
    const [staffCount] = await db
      .select({ value: count() })
      .from(users)
      .where(and(eq(users.status, "ACTIVE"), staffScope));

    // Products THIS branch holds at or below reorder level.
    const lowStock = branchId != null
      ? (
          await db
            .select({
              id: products.id,
              name: products.name,
              sku: products.sku,
              currentStock: stockLevels.quantity,
              reorderLevel: products.reorderLevel,
              unitOfMeasure: products.unitOfMeasure,
            })
            .from(stockLevels)
            .innerJoin(products, eq(stockLevels.productId, products.id))
            .where(
              and(
                eq(stockLevels.branchId, branchId),
                eq(products.status, "ACTIVE"),
                lte(stockLevels.quantity, products.reorderLevel),
              ),
            )
            .orderBy(stockLevels.quantity)
            .limit(10)
        ).map((r) => ({ ...r, currentStock: Number(r.currentStock) }))
      : [];

    // Value of the stock physically held at this branch.
    const branchQty =
      branchId != null
        ? sql<string>`COALESCE((SELECT sl.quantity FROM stock_levels sl WHERE sl.product_id = ${products.id} AND sl.branch_id = ${branchId}), 0)`
        : sql<string>`${products.currentStock}`;
    const [stockValueRow] = canSeeValuation
      ? await db
          .select({
            cost: sql<number>`COALESCE(SUM(${branchQty} * ${products.costPrice}), 0)`,
            retail: sql<number>`COALESCE(SUM(${branchQty} * ${products.sellingPrice}), 0)`,
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

  recentMovements: authedProcedure.query(async ({ ctx }) => {
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
      .where(branchScope(stockMovements.branchId, ctx.activeBranch))
      .orderBy(desc(stockMovements.createdAt))
      .limit(8);
  }),
});

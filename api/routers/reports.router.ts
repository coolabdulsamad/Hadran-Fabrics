import { z } from "zod";
import { and, count, desc, eq, gte, lt, ne, sql, type SQL } from "drizzle-orm";
import { createRouter } from "../middleware";
import { permissionProcedure } from "../trpc";
import { getDb } from "../queries/connection";
import { categories, customers, products, saleItems, salePayments, sales, users } from "@db/schema";

/**
 * HADRAN FABRICS MALL — reports & analytics router (Manager and above).
 * Every query accepts an optional date range; sales aggregates count
 * COMPLETED sales only (voided/held are excluded from revenue).
 */

const rangeInput = z.object({
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

function rangeConds(input: { dateFrom?: string; dateTo?: string }, extra: SQL[] = []): SQL | undefined {
  const conds: SQL[] = [...extra, eq(sales.status, "COMPLETED")];
  if (input.dateFrom) conds.push(gte(sales.createdAt, new Date(input.dateFrom)));
  if (input.dateTo) conds.push(lt(sales.createdAt, new Date(input.dateTo)));
  return and(...conds);
}

/** Default range: last 30 days. */
function resolvedRange(input: { dateFrom?: string; dateTo?: string }): { from: Date; to: Date } {
  const to = input.dateTo ? new Date(input.dateTo) : new Date();
  const from = input.dateFrom
    ? new Date(input.dateFrom)
    : new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
  from.setHours(0, 0, 0, 0);
  return { from, to: new Date(Math.min(to.getTime(), Date.now()) + 1) }; // exclusive-ish upper bound
}

export const reportsRouter = createRouter({
  /* ------------------------------ OVERVIEW ------------------------------ */
  overview: permissionProcedure("reports.view")
    .input(rangeInput.optional())
    .query(async ({ input }) => {
      const db = getDb();
      const where = rangeConds(input ?? {});
      const { from, to } = resolvedRange(input ?? {});
      const span = to.getTime() - from.getTime();
      const prevWhere = and(
        eq(sales.status, "COMPLETED"),
        gte(sales.createdAt, new Date(from.getTime() - span)),
        lt(sales.createdAt, from),
      );

      const aggregate = async (w: SQL | undefined) => {
        const [row] = await db
          .select({
            orders: count(),
            revenue: sql<string>`COALESCE(SUM(${sales.grandTotal}), 0)`,
            discounts: sql<string>`COALESCE(SUM(${sales.discountTotal}), 0)`,
            tax: sql<string>`COALESCE(SUM(${sales.taxTotal}), 0)`,
            service: sql<string>`COALESCE(SUM(${sales.serviceCharge}), 0)`,
            items: sql<string>`COALESCE(SUM(${sales.itemCount}), 0)`,
          })
          .from(sales)
          .where(w);
        return {
          orders: row?.orders ?? 0,
          revenue: Number(row?.revenue ?? 0),
          discounts: Number(row?.discounts ?? 0),
          tax: Number(row?.tax ?? 0),
          service: Number(row?.service ?? 0),
          items: Number(row?.items ?? 0),
        };
      };

      const current = await aggregate(where);
      const previous = await aggregate(prevWhere);
      const growth = previous.revenue > 0 ? ((current.revenue - previous.revenue) / previous.revenue) * 100 : null;

      return {
        range: { from: from.toISOString(), to: to.toISOString() },
        current: { ...current, averageTicket: current.orders > 0 ? current.revenue / current.orders : 0 },
        previous,
        revenueGrowthPct: growth,
      };
    }),

  /* ------------------------------ TREND --------------------------------- */
  salesTrend: permissionProcedure("reports.view")
    .input(rangeInput.optional())
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select({
          day: sql<string>`DATE_FORMAT(${sales.createdAt}, '%Y-%m-%d')`.as("day"),
          revenue: sql<string>`COALESCE(SUM(${sales.grandTotal}), 0)`.as("revenue"),
          orders: count(),
        })
        .from(sales)
        .where(rangeConds(input ?? {}))
        .groupBy(sql`day`)
        .orderBy(sql`day`);

      return rows.map((r) => ({ day: r.day, revenue: Number(r.revenue), orders: r.orders }));
    }),

  /** Sales by hour of day — staffing insight. */
  hourlyPattern: permissionProcedure("reports.view")
    .input(rangeInput.optional())
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select({
          hour: sql<number>`HOUR(${sales.createdAt})`.as("hour"),
          revenue: sql<string>`COALESCE(SUM(${sales.grandTotal}), 0)`.as("revenue"),
          orders: count(),
        })
        .from(sales)
        .where(rangeConds(input ?? {}))
        .groupBy(sql`hour`)
        .orderBy(sql`hour`);

      const byHour = new Map(rows.map((r) => [Number(r.hour), r]));
      return Array.from({ length: 24 }, (_, h) => ({
        hour: h,
        label: `${String(h).padStart(2, "0")}:00`,
        revenue: Number(byHour.get(h)?.revenue ?? 0),
        orders: Number(byHour.get(h)?.orders ?? 0),
      }));
    }),

  /* --------------------------- TOP PERFORMERS ---------------------------- */
  topProducts: permissionProcedure("reports.view")
    .input(rangeInput.extend({ limit: z.number().int().min(3).max(20).default(8) }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select({
          productId: saleItems.productId,
          name: saleItems.productName,
          sku: saleItems.sku,
          unit: saleItems.unit,
          quantity: sql<string>`COALESCE(SUM(${saleItems.quantity}), 0)`,
          revenue: sql<string>`COALESCE(SUM(${saleItems.lineTotal}), 0)`,
        })
        .from(saleItems)
        .innerJoin(sales, eq(saleItems.saleId, sales.id))
        .where(rangeConds(input ?? {}))
        .groupBy(saleItems.productId, saleItems.productName, saleItems.sku, saleItems.unit)
        .orderBy(desc(sql`SUM(${saleItems.lineTotal})`))
        .limit(input?.limit ?? 8);

      return rows.map((r) => ({ ...r, quantity: Number(r.quantity), revenue: Number(r.revenue) }));
    }),

  topCashiers: permissionProcedure("reports.view")
    .input(rangeInput.extend({ limit: z.number().int().min(3).max(20).default(8) }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select({
          cashierId: sales.cashierId,
          name: users.fullName,
          orders: count(),
          revenue: sql<string>`COALESCE(SUM(${sales.grandTotal}), 0)`,
          discounts: sql<string>`COALESCE(SUM(${sales.discountTotal}), 0)`,
        })
        .from(sales)
        .innerJoin(users, eq(sales.cashierId, users.id))
        .where(rangeConds(input ?? {}))
        .groupBy(sales.cashierId, users.fullName)
        .orderBy(desc(sql`SUM(${sales.grandTotal})`))
        .limit(input?.limit ?? 8);

      return rows.map((r) => ({
        ...r,
        revenue: Number(r.revenue),
        discounts: Number(r.discounts),
        averageTicket: r.orders > 0 ? Number(r.revenue) / r.orders : 0,
      }));
    }),

  topCustomers: permissionProcedure("reports.view")
    .input(rangeInput.extend({ limit: z.number().int().min(3).max(20).default(8) }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select({
          customerId: sales.customerId,
          name: customers.fullName,
          orders: count(),
          revenue: sql<string>`COALESCE(SUM(${sales.grandTotal}), 0)`,
        })
        .from(sales)
        .innerJoin(customers, eq(sales.customerId, customers.id))
        .where(rangeConds(input ?? {}))
        .groupBy(sales.customerId, customers.fullName)
        .orderBy(desc(sql`SUM(${sales.grandTotal})`))
        .limit(input?.limit ?? 8);

      return rows.map((r) => ({ ...r, revenue: Number(r.revenue) }));
    }),

  /* ----------------------------- BREAKDOWNS ------------------------------ */
  paymentBreakdown: permissionProcedure("reports.view")
    .input(rangeInput.optional())
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select({
          method: salePayments.method,
          total: sql<string>`COALESCE(SUM(${salePayments.amount}), 0)`,
          count: count(),
        })
        .from(salePayments)
        .innerJoin(sales, eq(salePayments.saleId, sales.id))
        .where(rangeConds(input ?? {}))
        .groupBy(salePayments.method)
        .orderBy(desc(sql`SUM(${salePayments.amount})`));

      const grand = rows.reduce((s, r) => s + Number(r.total), 0);
      return rows.map((r) => ({
        method: r.method,
        total: Number(r.total),
        count: r.count,
        share: grand > 0 ? (Number(r.total) / grand) * 100 : 0,
      }));
    }),

  categoryBreakdown: permissionProcedure("reports.view")
    .input(rangeInput.optional())
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select({
          categoryId: products.categoryId,
          name: categories.name,
          revenue: sql<string>`COALESCE(SUM(${saleItems.lineTotal}), 0)`,
          quantity: sql<string>`COALESCE(SUM(${saleItems.quantity}), 0)`,
        })
        .from(saleItems)
        .innerJoin(sales, eq(saleItems.saleId, sales.id))
        .innerJoin(products, eq(saleItems.productId, products.id))
        .innerJoin(categories, eq(products.categoryId, categories.id))
        .where(rangeConds(input ?? {}))
        .groupBy(products.categoryId, categories.name)
        .orderBy(desc(sql`SUM(${saleItems.lineTotal})`))
        .limit(12);

      const grand = rows.reduce((s, r) => s + Number(r.revenue), 0);
      return rows.map((r) => ({
        ...r,
        revenue: Number(r.revenue),
        quantity: Number(r.quantity),
        share: grand > 0 ? (Number(r.revenue) / grand) * 100 : 0,
      }));
    }),

  /* ------------------------- INVENTORY VALUATION ------------------------- */
  inventoryValuation: permissionProcedure("reports.view").query(async () => {
    const db = getDb();
    const [row] = await db
      .select({
        products: count(),
        costValue: sql<string>`COALESCE(SUM(${products.currentStock} * ${products.costPrice}), 0)`,
        retailValue: sql<string>`COALESCE(SUM(${products.currentStock} * ${products.sellingPrice}), 0)`,
        lowStock: sql<number>`SUM(CASE WHEN ${products.currentStock} > 0 AND ${products.currentStock} <= ${products.reorderLevel} THEN 1 ELSE 0 END)`,
        outOfStock: sql<number>`SUM(CASE WHEN ${products.currentStock} <= 0 THEN 1 ELSE 0 END)`,
      })
      .from(products)
      .where(ne(products.status, "ARCHIVED"));

    const topHoldings = await db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        currentStock: products.currentStock,
        unitOfMeasure: products.unitOfMeasure,
        value: sql<string>`${products.currentStock} * ${products.costPrice}`,
      })
      .from(products)
      .where(ne(products.status, "ARCHIVED"))
      .orderBy(desc(sql`${products.currentStock} * ${products.costPrice}`))
      .limit(6);

    return {
      productCount: row?.products ?? 0,
      costValue: Number(row?.costValue ?? 0),
      retailValue: Number(row?.retailValue ?? 0),
      potentialMargin: Number(row?.retailValue ?? 0) - Number(row?.costValue ?? 0),
      lowStock: Number(row?.lowStock ?? 0),
      outOfStock: Number(row?.outOfStock ?? 0),
      topHoldings: topHoldings.map((h) => ({ ...h, value: Number(h.value) })),
    };
  }),

  /* ------------------------------ CSV EXPORT ----------------------------- */
  exportCsv: permissionProcedure("reports.export")
    .input(
      rangeInput.extend({
        dataset: z.enum(["sales", "top_products", "top_cashiers", "payments", "categories"]),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines: string[] = [];

      if (input.dataset === "sales") {
        const rows = await db
          .select({
            receiptNo: sales.receiptNo,
            date: sales.createdAt,
            cashier: users.fullName,
            customer: customers.fullName,
            items: sales.itemCount,
            subtotal: sales.subtotal,
            discount: sales.discountTotal,
            tax: sales.taxTotal,
            total: sales.grandTotal,
            status: sales.status,
          })
          .from(sales)
          .leftJoin(users, eq(sales.cashierId, users.id))
          .leftJoin(customers, eq(sales.customerId, customers.id))
          .where(rangeConds(input, []))
          .orderBy(desc(sales.createdAt))
          .limit(5000);
        lines.push("Receipt,Date,Cashier,Customer,Items,Subtotal,Discount,VAT,Total,Status");
        for (const r of rows) {
          lines.push(
            [r.receiptNo, r.date?.toISOString(), r.cashier ?? "", r.customer ?? "Walk-in", r.items, r.subtotal, r.discount, r.tax, r.total, r.status]
              .map(esc)
              .join(","),
          );
        }
      } else if (input.dataset === "top_products") {
        const rows = await db
          .select({
            name: saleItems.productName,
            sku: saleItems.sku,
            unit: saleItems.unit,
            quantity: sql<string>`COALESCE(SUM(${saleItems.quantity}), 0)`,
            revenue: sql<string>`COALESCE(SUM(${saleItems.lineTotal}), 0)`,
          })
          .from(saleItems)
          .innerJoin(sales, eq(saleItems.saleId, sales.id))
          .where(rangeConds(input))
          .groupBy(saleItems.productId, saleItems.productName, saleItems.sku, saleItems.unit)
          .orderBy(desc(sql`SUM(${saleItems.lineTotal})`))
          .limit(500);
        lines.push("Product,SKU,Unit,Quantity Sold,Revenue");
        for (const r of rows) lines.push([r.name, r.sku, r.unit, r.quantity, r.revenue].map(esc).join(","));
      } else if (input.dataset === "top_cashiers") {
        const rows = await db
          .select({
            name: users.fullName,
            orders: count(),
            revenue: sql<string>`COALESCE(SUM(${sales.grandTotal}), 0)`,
            discounts: sql<string>`COALESCE(SUM(${sales.discountTotal}), 0)`,
          })
          .from(sales)
          .innerJoin(users, eq(sales.cashierId, users.id))
          .where(rangeConds(input))
          .groupBy(sales.cashierId, users.fullName)
          .orderBy(desc(sql`SUM(${sales.grandTotal})`))
          .limit(500);
        lines.push("Cashier,Orders,Revenue,Discounts Given");
        for (const r of rows) lines.push([r.name, r.orders, r.revenue, r.discounts].map(esc).join(","));
      } else if (input.dataset === "payments") {
        const rows = await db
          .select({
            method: salePayments.method,
            count: count(),
            total: sql<string>`COALESCE(SUM(${salePayments.amount}), 0)`,
          })
          .from(salePayments)
          .innerJoin(sales, eq(salePayments.saleId, sales.id))
          .where(rangeConds(input))
          .groupBy(salePayments.method);
        lines.push("Method,Transactions,Total");
        for (const r of rows) lines.push([r.method, r.count, r.total].map(esc).join(","));
      } else {
        const rows = await db
          .select({
            name: categories.name,
            revenue: sql<string>`COALESCE(SUM(${saleItems.lineTotal}), 0)`,
            quantity: sql<string>`COALESCE(SUM(${saleItems.quantity}), 0)`,
          })
          .from(saleItems)
          .innerJoin(sales, eq(saleItems.saleId, sales.id))
          .innerJoin(products, eq(saleItems.productId, products.id))
          .innerJoin(categories, eq(products.categoryId, categories.id))
          .where(rangeConds(input))
          .groupBy(products.categoryId, categories.name)
          .orderBy(desc(sql`SUM(${saleItems.lineTotal})`));
        lines.push("Category,Quantity Sold,Revenue");
        for (const r of rows) lines.push([r.name, r.quantity, r.revenue].map(esc).join(","));
      }

      return { filename: `hadran-${input.dataset}-${new Date().toISOString().slice(0, 10)}.csv`, csv: lines.join("\n") };
    }),
});

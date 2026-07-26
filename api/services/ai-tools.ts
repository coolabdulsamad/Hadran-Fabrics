import { and, count, desc, eq, gte, like, ne, or, sql } from "drizzle-orm";
import { getDb } from "../queries/connection";
import {
  approvalRequests,
  categories,
  customers,
  products,
  returns,
  saleItems,
  salePayments,
  sales,
  users,
} from "@db/schema";

/**
 * HADRAN FABRICS MALL — AI assistant data tools.
 * Read-only functions over the live database. Used both by the
 * OpenAI-compatible function-calling loop and by the built-in
 * offline analyst (when no API key is configured).
 */

const money = (n: number) => `₦${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function dayStart(offsetDays = 0): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return new Date(d.getTime() + offsetDays * 24 * 3600 * 1000);
}

export async function todaySnapshot() {
  const db = getDb();
  const summarize = async (from: Date, to: Date) => {
    const [row] = await db
      .select({
        orders: count(),
        revenue: sql<string>`COALESCE(SUM(${sales.grandTotal}), 0)`,
        items: sql<string>`COALESCE(SUM(${sales.itemCount}), 0)`,
        discounts: sql<string>`COALESCE(SUM(${sales.discountTotal}), 0)`,
      })
      .from(sales)
      .where(and(eq(sales.status, "COMPLETED"), gte(sales.createdAt, from), sql`${sales.createdAt} < ${to}`));
    return { orders: row?.orders ?? 0, revenue: Number(row?.revenue ?? 0), items: Number(row?.items ?? 0), discounts: Number(row?.discounts ?? 0) };
  };
  const today = await summarize(dayStart(), dayStart(1));
  const yesterday = await summarize(dayStart(-1), dayStart());
  const growth = yesterday.revenue > 0 ? ((today.revenue - yesterday.revenue) / yesterday.revenue) * 100 : null;
  return { today, yesterday, revenueGrowthVsYesterdayPct: growth };
}

export async function salesSummary(days = 7) {
  const db = getDb();
  const [row] = await db
    .select({
      orders: count(),
      revenue: sql<string>`COALESCE(SUM(${sales.grandTotal}), 0)`,
      discounts: sql<string>`COALESCE(SUM(${sales.discountTotal}), 0)`,
      tax: sql<string>`COALESCE(SUM(${sales.taxTotal}), 0)`,
      items: sql<string>`COALESCE(SUM(${sales.itemCount}), 0)`,
    })
    .from(sales)
    .where(and(eq(sales.status, "COMPLETED"), gte(sales.createdAt, dayStart(-(days - 1)))));
  const revenue = Number(row?.revenue ?? 0);
  const orders = row?.orders ?? 0;
  return {
    periodDays: days,
    orders,
    revenue,
    averageTicket: orders > 0 ? revenue / orders : 0,
    itemsSold: Number(row?.items ?? 0),
    discounts: Number(row?.discounts ?? 0),
    vat: Number(row?.tax ?? 0),
  };
}

export async function topProducts(days = 30, limit = 5) {
  const db = getDb();
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
    .where(and(eq(sales.status, "COMPLETED"), gte(sales.createdAt, dayStart(-(days - 1)))))
    .groupBy(saleItems.productId, saleItems.productName, saleItems.sku, saleItems.unit)
    .orderBy(desc(sql`SUM(${saleItems.lineTotal})`))
    .limit(limit);
  return rows.map((r) => ({ ...r, quantity: Number(r.quantity), revenue: Number(r.revenue) }));
}

export async function lowStock() {
  const db = getDb();
  const rows = await db
    .select({ name: products.name, sku: products.sku, stock: products.currentStock, reorderLevel: products.reorderLevel, unit: products.unitOfMeasure })
    .from(products)
    .where(and(ne(products.status, "ARCHIVED"), sql`${products.currentStock} <= ${products.reorderLevel}`))
    .orderBy(sql`${products.currentStock} / NULLIF(${products.reorderLevel}, 0)`)
    .limit(15);
  return rows;
}

export async function stockValue() {
  const db = getDb();
  const [row] = await db
    .select({
      products: count(),
      costValue: sql<string>`COALESCE(SUM(${products.currentStock} * ${products.costPrice}), 0)`,
      retailValue: sql<string>`COALESCE(SUM(${products.currentStock} * ${products.sellingPrice}), 0)`,
      outOfStock: sql<number>`SUM(CASE WHEN ${products.currentStock} <= 0 THEN 1 ELSE 0 END)`,
    })
    .from(products)
    .where(ne(products.status, "ARCHIVED"));
  return {
    productCount: row?.products ?? 0,
    costValue: Number(row?.costValue ?? 0),
    retailValue: Number(row?.retailValue ?? 0),
    potentialMargin: Number(row?.retailValue ?? 0) - Number(row?.costValue ?? 0),
    outOfStock: Number(row?.outOfStock ?? 0),
  };
}

export async function searchProducts(query: string) {
  const db = getDb();
  const q = `%${query}%`;
  const rows = await db
    .select({
      name: products.name,
      sku: products.sku,
      category: categories.name,
      price: products.sellingPrice,
      cost: products.costPrice,
      stock: products.currentStock,
      unit: products.unitOfMeasure,
      status: products.status,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(or(like(products.name, q), like(products.sku, q), like(products.color, q), like(products.barcode, q)))
    .limit(8);
  return rows;
}

export async function recentSales(limit = 5) {
  const db = getDb();
  const rows = await db
    .select({
      receiptNo: sales.receiptNo,
      status: sales.status,
      total: sales.grandTotal,
      items: sales.itemCount,
      cashier: users.fullName,
      date: sales.createdAt,
    })
    .from(sales)
    .leftJoin(users, eq(sales.cashierId, users.id))
    .orderBy(desc(sales.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, date: r.date?.toISOString() }));
}

export async function staffPerformance(days = 30) {
  const db = getDb();
  const rows = await db
    .select({
      name: users.fullName,
      role: users.role,
      orders: count(),
      revenue: sql<string>`COALESCE(SUM(${sales.grandTotal}), 0)`,
    })
    .from(sales)
    .innerJoin(users, eq(sales.cashierId, users.id))
    .where(and(eq(sales.status, "COMPLETED"), gte(sales.createdAt, dayStart(-(days - 1)))))
    .groupBy(sales.cashierId, users.fullName, users.role)
    .orderBy(desc(sql`SUM(${sales.grandTotal})`))
    .limit(10);
  return rows.map((r) => ({ ...r, revenue: Number(r.revenue) }));
}

export async function pendingApprovals() {
  const db = getDb();
  const rows = await db
    .select({ id: approvalRequests.id, type: approvalRequests.requestType, summary: approvalRequests.summary, requester: users.fullName, createdAt: approvalRequests.createdAt })
    .from(approvalRequests)
    .innerJoin(users, eq(approvalRequests.requesterId, users.id))
    .where(eq(approvalRequests.status, "PENDING"))
    .orderBy(desc(approvalRequests.createdAt))
    .limit(15);
  return rows.map((r) => ({ ...r, createdAt: r.createdAt?.toISOString() }));
}

export async function returnsSummary(days = 30) {
  const db = getDb();
  const [row] = await db
    .select({
      total: count(),
      refunds: sql<string>`COALESCE(SUM(${returns.refundAmount}), 0)`,
      exchanges: sql<number>`SUM(CASE WHEN ${returns.type} = 'EXCHANGE' THEN 1 ELSE 0 END)`,
    })
    .from(returns)
    .where(gte(returns.createdAt, dayStart(-(days - 1))));
  return { periodDays: days, count: row?.total ?? 0, refunded: Number(row?.refunds ?? 0), exchanges: Number(row?.exchanges ?? 0) };
}

export async function topCustomers(days = 90, limit = 5) {
  const db = getDb();
  const rows = await db
    .select({
      name: customers.fullName,
      code: customers.code,
      orders: count(),
      spent: sql<string>`COALESCE(SUM(${sales.grandTotal}), 0)`,
    })
    .from(sales)
    .innerJoin(customers, eq(sales.customerId, customers.id))
    .where(and(eq(sales.status, "COMPLETED"), gte(sales.createdAt, dayStart(-(days - 1)))))
    .groupBy(sales.customerId, customers.fullName, customers.code)
    .orderBy(desc(sql`SUM(${sales.grandTotal})`))
    .limit(limit);
  return rows.map((r) => ({ ...r, spent: Number(r.spent) }));
}

export async function paymentBreakdown(days = 30) {
  const db = getDb();
  const rows = await db
    .select({
      method: salePayments.method,
      total: sql<string>`COALESCE(SUM(${salePayments.amount}), 0)`,
      count: count(),
    })
    .from(salePayments)
    .innerJoin(sales, eq(salePayments.saleId, sales.id))
    .where(and(eq(sales.status, "COMPLETED"), gte(sales.createdAt, dayStart(-(days - 1)))))
    .groupBy(salePayments.method);
  return rows.map((r) => ({ ...r, total: Number(r.total) }));
}

export { money };

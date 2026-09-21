import { and, count, desc, eq, ne, sql } from "drizzle-orm";
import {
  categories,
  customers,
  expenses,
  laundryOrderItems,
  laundryOrders,
  laundryPayments,
  products,
  productionOrders,
  returns,
  saleItems,
  salePayments,
  sales,
  stockMovements,
  tailoringOrders,
  tailoringPayments,
  users,
} from "@db/schema";
import {
  EXPENSE_CATEGORIES,
  FABRIC_SOURCES,
  LAUNDRY_ORDER_STATUSES,
  ORDER_PAYMENT_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  PRODUCTION_STATUSES,
  RETURN_STATUSES,
  RETURN_TYPES,
  SALE_STATUSES,
  STOCK_MOVEMENT_TYPES,
  TAILORING_ORDER_STATUSES,
  type PaymentMethod,
  type Section,
} from "@contracts/constants";
import {
  BRANCH_FILTER,
  branchFilter,
  fmtInt,
  fmtNaira,
  fmtPct,
  fmtQty,
  inRange,
  num,
  selectFilter,
  type ReportDef,
} from "./shared";

/**
 * HADRAN FABRICS MALL — report type registry (Reports Studio).
 * Each definition declares its section, filter spec and a run handler that
 * returns KPIs + charts + tables. Sales aggregates count COMPLETED sales
 * only; laundry/tailoring aggregates exclude CANCELLED unless stated.
 */

const CATEGORY_FILTER = { key: "categoryId", label: "Category", kind: "category" as const };

const STATUS_FILTER = selectFilter("status", "Status", SALE_STATUSES);
const PAYSTATUS_FILTER = selectFilter(
  "paymentStatus",
  "Payment status",
  ORDER_PAYMENT_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
);
const METHOD_FILTER = selectFilter(
  "method",
  "Payment method",
  PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] })),
);

/** Filter value helper — returns undefined for empty/"ALL". */
const fv = (filters: Record<string, string>, key: string): string | undefined => {
  const v = filters[key];
  return v && v !== "ALL" && v !== "" ? v : undefined;
};

/* ============================ SALES SECTION ============================= */

const salesSummary: ReportDef = {
  type: "sales_summary",
  section: "SALES",
  label: "Sales summary",
  description: "Headline revenue, orders, ticket size and daily trend for completed sales.",
  hasRange: true,
  filters: [BRANCH_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const scope = branchFilter(sales.branchId, activeBranch, filters);
    const where = inRange(sales.createdAt, range, [scope, eq(sales.status, "COMPLETED")]);

    const [totals] = await db
      .select({
        orders: count(),
        revenue: sql<number>`COALESCE(SUM(${sales.grandTotal}), 0)`,
        discounts: sql<number>`COALESCE(SUM(${sales.discountTotal}), 0)`,
        tax: sql<number>`COALESCE(SUM(${sales.taxTotal}), 0)`,
        service: sql<number>`COALESCE(SUM(${sales.serviceCharge}), 0)`,
        items: sql<number>`COALESCE(SUM(${sales.itemCount}), 0)`,
      })
      .from(sales)
      .where(where);

    const daily = await db
      .select({
        day: sql<string>`DATE_FORMAT(${sales.createdAt}, '%Y-%m-%d')`.as("day"),
        revenue: sql<number>`COALESCE(SUM(${sales.grandTotal}), 0)`.as("revenue"),
        orders: count(),
      })
      .from(sales)
      .where(where)
      .groupBy(sql`day`)
      .orderBy(sql`day`);

    const statusRows = await db
      .select({ status: sales.status, count: count() })
      .from(sales)
      .where(inRange(sales.createdAt, range, [scope]))
      .groupBy(sales.status);

    const revenue = num(totals?.revenue);
    const orders = num(totals?.orders);

    return {
      subtitle: "Completed sales only — voided and held receipts excluded.",
      kpis: [
        { label: "Revenue", value: fmtNaira(revenue), tone: "gold" },
        { label: "Orders", value: fmtInt(orders), hint: "Completed receipts" },
        { label: "Average ticket", value: fmtNaira(orders > 0 ? revenue / orders : 0) },
        { label: "Items sold", value: fmtQty(num(totals?.items)) },
        { label: "Discounts given", value: fmtNaira(num(totals?.discounts)) },
        { label: "VAT collected", value: fmtNaira(num(totals?.tax)), hint: num(totals?.service) > 0 ? `+ ${fmtNaira(num(totals?.service))} service` : undefined },
      ],
      charts: [
        {
          kind: "area",
          title: "Daily revenue",
          xKey: "day",
          series: [
            { key: "revenue", label: "Revenue", format: "currency" },
            { key: "orders", label: "Orders", format: "number" },
          ],
          data: daily.map((d) => ({ day: d.day, revenue: num(d.revenue), orders: d.orders })),
        },
        {
          kind: "pie",
          title: "Receipt status mix",
          subtitle: "All receipts created in the period",
          nameKey: "name",
          valueKey: "value",
          valueFormat: "number",
          data: statusRows.map((s) => ({ name: s.status, value: s.count })),
        },
      ],
      tables: [
        {
          title: "Daily breakdown",
          columns: [
            { key: "day", label: "Day", format: "text" },
            { key: "orders", label: "Orders", align: "right", format: "number" },
            { key: "revenue", label: "Revenue", align: "right", format: "currency" },
          ],
          rows: daily.map((d) => ({ day: d.day, orders: d.orders, revenue: num(d.revenue) })),
        },
      ],
    };
  },
};

const salesDetail: ReportDef = {
  type: "sales_detail",
  section: "SALES",
  label: "Sales detail (receipts)",
  description: "Every receipt in the period with cashier, customer, totals and status.",
  hasRange: true,
  filters: [BRANCH_FILTER, STATUS_FILTER, { key: "search", label: "Receipt / customer", kind: "text", placeholder: "RCP-… or name" }],
  run: async ({ db, activeBranch, filters, range }) => {
    const status = fv(filters, "status");
    const search = fv(filters, "search");
    const where = inRange(sales.createdAt, range, [
      branchFilter(sales.branchId, activeBranch, filters),
      status ? eq(sales.status, status as (typeof SALE_STATUSES)[number]) : undefined,
      search ? sql`(${sales.receiptNo} LIKE ${`%${search}%`} OR ${customers.fullName} LIKE ${`%${search}%`})` : undefined,
    ]);

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
      .where(where)
      .orderBy(desc(sales.createdAt))
      .limit(500);

    const completed = rows.filter((r) => r.status === "COMPLETED");
    const revenue = completed.reduce((s, r) => s + r.total, 0);

    return {
      subtitle: "Up to 500 most recent receipts matching the filters.",
      kpis: [
        { label: "Receipts", value: fmtInt(rows.length), hint: `${completed.length} completed` },
        { label: "Revenue (completed)", value: fmtNaira(revenue), tone: "gold" },
        { label: "Average ticket", value: fmtNaira(completed.length > 0 ? revenue / completed.length : 0) },
        { label: "Discounts", value: fmtNaira(completed.reduce((s, r) => s + r.discount, 0)) },
      ],
      charts: [],
      tables: [
        {
          title: "Receipts",
          columns: [
            { key: "receiptNo", label: "Receipt" },
            { key: "date", label: "Date", format: "datetime" },
            { key: "cashier", label: "Cashier" },
            { key: "customer", label: "Customer" },
            { key: "items", label: "Items", align: "right", format: "number" },
            { key: "discount", label: "Discount", align: "right", format: "currency" },
            { key: "tax", label: "VAT", align: "right", format: "currency" },
            { key: "total", label: "Total", align: "right", format: "currency" },
            { key: "status", label: "Status" },
          ],
          rows: rows.map((r) => ({
            receiptNo: r.receiptNo,
            date: r.date?.toISOString() ?? "",
            cashier: r.cashier ?? "—",
            customer: r.customer ?? "Walk-in",
            items: r.items,
            discount: r.discount,
            tax: r.tax,
            total: r.total,
            status: r.status,
          })),
        },
      ],
    };
  },
};

const productPerformance: ReportDef = {
  type: "product_performance",
  section: "SALES",
  label: "Product performance",
  description: "Quantity, revenue, estimated cost and margin for every product sold.",
  hasRange: true,
  filters: [BRANCH_FILTER, CATEGORY_FILTER, { key: "minRevenue", label: "Min revenue (₦)", kind: "number", placeholder: "0" }],
  run: async ({ db, activeBranch, filters, range }) => {
    const categoryId = fv(filters, "categoryId");
    const minRevenue = Number(fv(filters, "minRevenue") ?? 0) || 0;
    const where = inRange(sales.createdAt, range, [
      branchFilter(sales.branchId, activeBranch, filters),
      eq(sales.status, "COMPLETED"),
      categoryId ? eq(products.categoryId, Number(categoryId)) : undefined,
    ]);

    const rows = await db
      .select({
        productId: saleItems.productId,
        name: saleItems.productName,
        sku: saleItems.sku,
        unit: saleItems.unit,
        category: categories.name,
        quantity: sql<number>`COALESCE(SUM(${saleItems.quantity}), 0)`,
        revenue: sql<number>`COALESCE(SUM(${saleItems.lineTotal}), 0)`,
        cost: sql<number>`COALESCE(SUM(${saleItems.quantity} * ${saleItems.costPrice}), 0)`,
      })
      .from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .innerJoin(products, eq(saleItems.productId, products.id))
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(where)
      .groupBy(saleItems.productId, saleItems.productName, saleItems.sku, saleItems.unit, categories.name)
      .orderBy(desc(sql`SUM(${saleItems.lineTotal})`))
      .limit(300);

    const enriched = rows
      .map((r) => {
        const revenue = num(r.revenue);
        const cost = num(r.cost);
        const margin = revenue - cost;
        return { ...r, quantity: num(r.quantity), revenue, cost, margin, marginPct: revenue > 0 ? (margin / revenue) * 100 : 0 };
      })
      .filter((r) => r.revenue >= minRevenue);

    const totalRevenue = enriched.reduce((s, r) => s + r.revenue, 0);
    const totalMargin = enriched.reduce((s, r) => s + r.margin, 0);

    return {
      kpis: [
        { label: "Products sold", value: fmtInt(enriched.length) },
        { label: "Revenue", value: fmtNaira(totalRevenue), tone: "gold" },
        { label: "Est. gross margin", value: fmtNaira(totalMargin), tone: totalMargin >= 0 ? "emerald" : "red", hint: totalRevenue > 0 ? fmtPct((totalMargin / totalRevenue) * 100) : undefined },
        { label: "Units sold", value: fmtQty(enriched.reduce((s, r) => s + r.quantity, 0)) },
      ],
      charts: [
        {
          kind: "bar",
          title: "Top products by revenue",
          xKey: "name",
          series: [{ key: "revenue", label: "Revenue", format: "currency" }],
          data: enriched.slice(0, 12).map((r) => ({ name: r.name.length > 18 ? `${r.name.slice(0, 18)}…` : r.name, revenue: r.revenue })),
        },
      ],
      tables: [
        {
          title: "Product performance",
          columns: [
            { key: "name", label: "Product" },
            { key: "sku", label: "SKU" },
            { key: "category", label: "Category" },
            { key: "quantity", label: "Qty sold", align: "right", format: "qty" },
            { key: "unit", label: "Unit" },
            { key: "revenue", label: "Revenue", align: "right", format: "currency" },
            { key: "cost", label: "Est. cost", align: "right", format: "currency" },
            { key: "margin", label: "Margin", align: "right", format: "currency" },
            { key: "marginPct", label: "Margin %", align: "right", format: "percent" },
          ],
          rows: enriched.map((r) => ({
            name: r.name,
            sku: r.sku,
            category: r.category,
            quantity: r.quantity,
            unit: r.unit,
            revenue: r.revenue,
            cost: r.cost,
            margin: r.margin,
            marginPct: r.marginPct,
          })),
        },
      ],
    };
  },
};

const categoryPerformance: ReportDef = {
  type: "category_performance",
  section: "SALES",
  label: "Category performance",
  description: "Where the revenue comes from — share, quantity and margin per category.",
  hasRange: true,
  filters: [BRANCH_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const where = inRange(sales.createdAt, range, [
      branchFilter(sales.branchId, activeBranch, filters),
      eq(sales.status, "COMPLETED"),
    ]);
    const rows = await db
      .select({
        categoryId: products.categoryId,
        name: categories.name,
        quantity: sql<number>`COALESCE(SUM(${saleItems.quantity}), 0)`,
        revenue: sql<number>`COALESCE(SUM(${saleItems.lineTotal}), 0)`,
        cost: sql<number>`COALESCE(SUM(${saleItems.quantity} * ${saleItems.costPrice}), 0)`,
      })
      .from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .innerJoin(products, eq(saleItems.productId, products.id))
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(where)
      .groupBy(products.categoryId, categories.name)
      .orderBy(desc(sql`SUM(${saleItems.lineTotal})`));

    const grand = rows.reduce((s, r) => s + num(r.revenue), 0);
    const data = rows.map((r) => {
      const revenue = num(r.revenue);
      const margin = revenue - num(r.cost);
      return { name: r.name, quantity: num(r.quantity), revenue, margin, share: grand > 0 ? (revenue / grand) * 100 : 0 };
    });

    return {
      kpis: [
        { label: "Categories", value: fmtInt(data.length) },
        { label: "Revenue", value: fmtNaira(grand), tone: "gold" },
        { label: "Strongest", value: data[0]?.name ?? "—", hint: data[0] ? fmtPct(data[0].share) : undefined },
      ],
      charts: [
        {
          kind: "pie",
          title: "Revenue share",
          nameKey: "name",
          valueKey: "revenue",
          valueFormat: "currency",
          data: data.map((d) => ({ name: d.name, revenue: d.revenue })),
        },
      ],
      tables: [
        {
          title: "By category",
          columns: [
            { key: "name", label: "Category" },
            { key: "quantity", label: "Qty sold", align: "right", format: "qty" },
            { key: "revenue", label: "Revenue", align: "right", format: "currency" },
            { key: "share", label: "Share", align: "right", format: "percent" },
            { key: "margin", label: "Est. margin", align: "right", format: "currency" },
          ],
          rows: data,
        },
      ],
    };
  },
};

const cashierPerformance: ReportDef = {
  type: "cashier_performance",
  section: "SALES",
  label: "Cashier / staff performance",
  description: "Orders, revenue, discounts and average ticket handled by each cashier.",
  hasRange: true,
  filters: [BRANCH_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const where = inRange(sales.createdAt, range, [
      branchFilter(sales.branchId, activeBranch, filters),
      eq(sales.status, "COMPLETED"),
    ]);
    const rows = await db
      .select({
        cashierId: sales.cashierId,
        name: users.fullName,
        orders: count(),
        items: sql<number>`COALESCE(SUM(${sales.itemCount}), 0)`,
        revenue: sql<number>`COALESCE(SUM(${sales.grandTotal}), 0)`,
        discounts: sql<number>`COALESCE(SUM(${sales.discountTotal}), 0)`,
      })
      .from(sales)
      .innerJoin(users, eq(sales.cashierId, users.id))
      .where(where)
      .groupBy(sales.cashierId, users.fullName)
      .orderBy(desc(sql`SUM(${sales.grandTotal})`));

    const data = rows.map((r) => ({
      name: r.name,
      orders: r.orders,
      items: num(r.items),
      revenue: num(r.revenue),
      discounts: num(r.discounts),
      avgTicket: r.orders > 0 ? num(r.revenue) / r.orders : 0,
    }));

    return {
      kpis: [
        { label: "Active cashiers", value: fmtInt(data.length) },
        { label: "Revenue", value: fmtNaira(data.reduce((s, d) => s + d.revenue, 0)), tone: "gold" },
        { label: "Top cashier", value: data[0]?.name ?? "—", hint: data[0] ? fmtNaira(data[0].revenue) : undefined },
      ],
      charts: [
        {
          kind: "bar",
          title: "Revenue by cashier",
          xKey: "name",
          series: [{ key: "revenue", label: "Revenue", format: "currency" }],
          data: data.map((d) => ({ name: d.name, revenue: d.revenue })),
        },
      ],
      tables: [
        {
          title: "Cashier leaderboard",
          columns: [
            { key: "name", label: "Cashier" },
            { key: "orders", label: "Orders", align: "right", format: "number" },
            { key: "items", label: "Items", align: "right", format: "number" },
            { key: "revenue", label: "Revenue", align: "right", format: "currency" },
            { key: "avgTicket", label: "Avg ticket", align: "right", format: "currency" },
            { key: "discounts", label: "Discounts given", align: "right", format: "currency" },
          ],
          rows: data,
        },
      ],
    };
  },
};

const customerSales: ReportDef = {
  type: "customer_sales",
  section: "SALES",
  label: "Customer sales",
  description: "Registered customers ranked by spend — find your best clients.",
  hasRange: true,
  filters: [BRANCH_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const where = inRange(sales.createdAt, range, [
      branchFilter(sales.branchId, activeBranch, filters),
      eq(sales.status, "COMPLETED"),
    ]);
    const rows = await db
      .select({
        customerId: sales.customerId,
        name: customers.fullName,
        phone: customers.phone,
        orders: count(),
        revenue: sql<number>`COALESCE(SUM(${sales.grandTotal}), 0)`,
      })
      .from(sales)
      .innerJoin(customers, eq(sales.customerId, customers.id))
      .where(where)
      .groupBy(sales.customerId, customers.fullName, customers.phone)
      .orderBy(desc(sql`SUM(${sales.grandTotal})`))
      .limit(200);

    const [walkin] = await db
      .select({ orders: count(), revenue: sql<number>`COALESCE(SUM(${sales.grandTotal}), 0)` })
      .from(sales)
      .where(and(where, sql`${sales.customerId} IS NULL`));

    const data = rows.map((r) => ({ name: r.name, phone: r.phone ?? "", orders: r.orders, revenue: num(r.revenue) }));

    return {
      kpis: [
        { label: "Registered buyers", value: fmtInt(data.length) },
        { label: "Their spend", value: fmtNaira(data.reduce((s, d) => s + d.revenue, 0)), tone: "gold" },
        { label: "Walk-in receipts", value: fmtInt(num(walkin?.orders)), hint: fmtNaira(num(walkin?.revenue)) },
      ],
      charts: [
        {
          kind: "bar",
          title: "Top customers",
          xKey: "name",
          series: [{ key: "revenue", label: "Spend", format: "currency" }],
          data: data.slice(0, 10).map((d) => ({ name: d.name.length > 16 ? `${d.name.slice(0, 16)}…` : d.name, revenue: d.revenue })),
        },
      ],
      tables: [
        {
          title: "Customers",
          columns: [
            { key: "name", label: "Customer" },
            { key: "phone", label: "Phone" },
            { key: "orders", label: "Orders", align: "right", format: "number" },
            { key: "revenue", label: "Total spend", align: "right", format: "currency" },
          ],
          rows: data,
        },
      ],
    };
  },
};

const paymentMethods: ReportDef = {
  type: "payment_methods",
  section: "SALES",
  label: "Payment methods",
  description: "How customers paid — cash, POS, transfer — with share of collections.",
  hasRange: true,
  filters: [BRANCH_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const where = inRange(salePayments.createdAt, range, [
      branchFilter(sales.branchId, activeBranch, filters),
      eq(sales.status, "COMPLETED"),
    ]);
    const rows = await db
      .select({
        method: salePayments.method,
        count: count(),
        total: sql<number>`COALESCE(SUM(${salePayments.amount}), 0)`,
      })
      .from(salePayments)
      .innerJoin(sales, eq(salePayments.saleId, sales.id))
      .where(where)
      .groupBy(salePayments.method)
      .orderBy(desc(sql`SUM(${salePayments.amount})`));

    const grand = rows.reduce((s, r) => s + num(r.total), 0);
    const data = rows.map((r) => ({
      method: PAYMENT_METHOD_LABELS[r.method as PaymentMethod] ?? r.method,
      count: r.count,
      total: num(r.total),
      share: grand > 0 ? (num(r.total) / grand) * 100 : 0,
    }));

    return {
      kpis: [
        { label: "Collected", value: fmtNaira(grand), tone: "gold" },
        { label: "Transactions", value: fmtInt(data.reduce((s, d) => s + d.count, 0)) },
        { label: "Dominant method", value: data[0]?.method ?? "—", hint: data[0] ? fmtPct(data[0].share) : undefined },
      ],
      charts: [
        {
          kind: "pie",
          title: "Payment mix",
          nameKey: "method",
          valueKey: "total",
          valueFormat: "currency",
          data,
        },
      ],
      tables: [
        {
          title: "By method",
          columns: [
            { key: "method", label: "Method" },
            { key: "count", label: "Transactions", align: "right", format: "number" },
            { key: "total", label: "Total", align: "right", format: "currency" },
            { key: "share", label: "Share", align: "right", format: "percent" },
          ],
          rows: data,
        },
      ],
    };
  },
};

const taxReport: ReportDef = {
  type: "tax_report",
  section: "SALES",
  label: "VAT / tax report",
  description: "VAT and service charge collected per day — ready for remittance.",
  hasRange: true,
  filters: [BRANCH_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const where = inRange(sales.createdAt, range, [
      branchFilter(sales.branchId, activeBranch, filters),
      eq(sales.status, "COMPLETED"),
    ]);
    const rows = await db
      .select({
        day: sql<string>`DATE_FORMAT(${sales.createdAt}, '%Y-%m-%d')`.as("day"),
        orders: count(),
        salesTotal: sql<number>`COALESCE(SUM(${sales.grandTotal}), 0)`,
        vat: sql<number>`COALESCE(SUM(${sales.taxTotal}), 0)`,
        service: sql<number>`COALESCE(SUM(${sales.serviceCharge}), 0)`,
      })
      .from(sales)
      .where(where)
      .groupBy(sql`day`)
      .orderBy(sql`day`);

    const data = rows.map((r) => ({ day: r.day, orders: r.orders, salesTotal: num(r.salesTotal), vat: num(r.vat), service: num(r.service) }));
    const vatTotal = data.reduce((s, d) => s + d.vat, 0);
    const serviceTotal = data.reduce((s, d) => s + d.service, 0);

    return {
      kpis: [
        { label: "VAT collected", value: fmtNaira(vatTotal), tone: "gold" },
        { label: "Service charge", value: fmtNaira(serviceTotal) },
        { label: "Taxable revenue", value: fmtNaira(data.reduce((s, d) => s + d.salesTotal, 0)) },
        { label: "Days with sales", value: fmtInt(data.length) },
      ],
      charts: [
        {
          kind: "area",
          title: "VAT per day",
          xKey: "day",
          series: [{ key: "vat", label: "VAT", format: "currency" }],
          data,
        },
      ],
      tables: [
        {
          title: "Daily VAT",
          columns: [
            { key: "day", label: "Day" },
            { key: "orders", label: "Orders", align: "right", format: "number" },
            { key: "salesTotal", label: "Sales total", align: "right", format: "currency" },
            { key: "vat", label: "VAT", align: "right", format: "currency" },
            { key: "service", label: "Service charge", align: "right", format: "currency" },
          ],
          rows: data,
        },
      ],
    };
  },
};

const returnsReport: ReportDef = {
  type: "returns_report",
  section: "SALES",
  label: "Returns & exchanges",
  description: "Refunds and exchanges processed, with reasons and statuses.",
  hasRange: true,
  filters: [
    BRANCH_FILTER,
    selectFilter("status", "Status", RETURN_STATUSES),
    selectFilter("returnType", "Type", RETURN_TYPES.map((t) => ({ value: t, label: t === "RETURN" ? "Return" : "Exchange" }))),
  ],
  run: async ({ db, activeBranch, filters, range }) => {
    const status = fv(filters, "status");
    const returnType = fv(filters, "returnType");
    const where = inRange(returns.createdAt, range, [
      branchFilter(returns.branchId, activeBranch, filters),
      status ? eq(returns.status, status as (typeof RETURN_STATUSES)[number]) : undefined,
      returnType ? eq(returns.type, returnType as (typeof RETURN_TYPES)[number]) : undefined,
    ]);

    const rows = await db
      .select({
        reference: returns.reference,
        date: returns.createdAt,
        receiptNo: sales.receiptNo,
        type: returns.type,
        reason: returns.reason,
        status: returns.status,
        refund: returns.refundAmount,
        exchangeValue: returns.exchangeValue,
        topUp: returns.topUpAmount,
        processedBy: users.fullName,
      })
      .from(returns)
      .leftJoin(sales, eq(returns.saleId, sales.id))
      .leftJoin(users, eq(returns.processedBy, users.id))
      .where(where)
      .orderBy(desc(returns.createdAt))
      .limit(500);

    const refunds = rows.filter((r) => r.type === "RETURN" && r.status === "COMPLETED").reduce((s, r) => s + r.refund, 0);

    return {
      kpis: [
        { label: "Cases", value: fmtInt(rows.length) },
        { label: "Refunds paid", value: fmtNaira(refunds), tone: "red" },
        { label: "Exchanges", value: fmtInt(rows.filter((r) => r.type === "EXCHANGE").length) },
        { label: "Pending", value: fmtInt(rows.filter((r) => r.status === "PENDING").length) },
      ],
      charts: [],
      tables: [
        {
          title: "Returns & exchanges",
          columns: [
            { key: "reference", label: "Reference" },
            { key: "date", label: "Date", format: "datetime" },
            { key: "receiptNo", label: "Original receipt" },
            { key: "type", label: "Type" },
            { key: "reason", label: "Reason" },
            { key: "refund", label: "Refund", align: "right", format: "currency" },
            { key: "status", label: "Status" },
            { key: "processedBy", label: "Processed by" },
          ],
          rows: rows.map((r) => ({
            reference: r.reference,
            date: r.date?.toISOString() ?? "",
            receiptNo: r.receiptNo ?? "—",
            type: r.type,
            reason: r.reason,
            refund: r.refund,
            status: r.status,
            processedBy: r.processedBy ?? "—",
          })),
        },
      ],
    };
  },
};

const profitMargin: ReportDef = {
  type: "profit_margin",
  section: "SALES",
  label: "Profit & margin",
  description: "Revenue versus estimated cost of goods — grouped by product or category.",
  hasRange: true,
  filters: [
    BRANCH_FILTER,
    {
      key: "groupBy",
      label: "Group by",
      kind: "select",
      options: [
        { value: "product", label: "Product" },
        { value: "category", label: "Category" },
      ],
      defaultValue: "product",
    },
    { key: "minRevenue", label: "Min revenue (₦)", kind: "number", placeholder: "0" },
  ],
  run: async ({ db, activeBranch, filters, range }) => {
    const groupBy = fv(filters, "groupBy") ?? "product";
    const minRevenue = Number(fv(filters, "minRevenue") ?? 0) || 0;
    const where = inRange(sales.createdAt, range, [
      branchFilter(sales.branchId, activeBranch, filters),
      eq(sales.status, "COMPLETED"),
    ]);

    const byProduct = groupBy === "product";
    const rows = await db
      .select({
        groupKey: byProduct ? saleItems.productName : categories.name,
        quantity: sql<number>`COALESCE(SUM(${saleItems.quantity}), 0)`,
        revenue: sql<number>`COALESCE(SUM(${saleItems.lineTotal}), 0)`,
        cost: sql<number>`COALESCE(SUM(${saleItems.quantity} * ${saleItems.costPrice}), 0)`,
      })
      .from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .innerJoin(products, eq(saleItems.productId, products.id))
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(where)
      // NB: group by the real column — "key" is a reserved word in MySQL
      // and grouping by select alias is rejected on strict servers.
      .groupBy(byProduct ? saleItems.productName : categories.name)
      .orderBy(desc(sql`SUM(${saleItems.lineTotal})`))
      .limit(300);

    const data = rows
      .map((r) => {
        const revenue = num(r.revenue);
        const cost = num(r.cost);
        const margin = revenue - cost;
        return { name: r.groupKey, quantity: num(r.quantity), revenue, cost, margin, marginPct: revenue > 0 ? (margin / revenue) * 100 : 0 };
      })
      .filter((r) => r.revenue >= minRevenue);

    const revenue = data.reduce((s, d) => s + d.revenue, 0);
    const cost = data.reduce((s, d) => s + d.cost, 0);
    const margin = revenue - cost;

    return {
      subtitle: "Cost estimated from the cost price captured on each sale line.",
      kpis: [
        { label: "Revenue", value: fmtNaira(revenue), tone: "gold" },
        { label: "Est. cost of goods", value: fmtNaira(cost) },
        { label: "Gross margin", value: fmtNaira(margin), tone: margin >= 0 ? "emerald" : "red" },
        { label: "Margin %", value: revenue > 0 ? fmtPct((margin / revenue) * 100) : "—" },
      ],
      charts: [
        {
          kind: "bar",
          title: `Margin by ${byProduct ? "product" : "category"} (top 12 revenue)`,
          xKey: "name",
          series: [
            { key: "revenue", label: "Revenue", format: "currency" },
            { key: "margin", label: "Margin", format: "currency" },
          ],
          data: data.slice(0, 12).map((d) => ({ name: d.name.length > 16 ? `${d.name.slice(0, 16)}…` : d.name, revenue: d.revenue, margin: d.margin })),
        },
      ],
      tables: [
        {
          title: `Margin by ${byProduct ? "product" : "category"}`,
          columns: [
            { key: "name", label: byProduct ? "Product" : "Category" },
            { key: "quantity", label: "Qty", align: "right", format: "qty" },
            { key: "revenue", label: "Revenue", align: "right", format: "currency" },
            { key: "cost", label: "Est. cost", align: "right", format: "currency" },
            { key: "margin", label: "Margin", align: "right", format: "currency" },
            { key: "marginPct", label: "Margin %", align: "right", format: "percent" },
          ],
          rows: data,
        },
      ],
    };
  },
};

const inventoryValuation: ReportDef = {
  type: "inventory_valuation",
  section: "SALES",
  label: "Inventory valuation",
  description: "What the shelves are worth — at cost, at retail, and the margin locked in stock.",
  hasRange: false,
  filters: [CATEGORY_FILTER],
  run: async ({ db, filters }) => {
    const categoryId = fv(filters, "categoryId");
    const where = and(ne(products.status, "ARCHIVED"), categoryId ? eq(products.categoryId, Number(categoryId)) : undefined);

    const [totals] = await db
      .select({
        count: count(),
        costValue: sql<number>`COALESCE(SUM(${products.currentStock} * ${products.costPrice}), 0)`,
        retailValue: sql<number>`COALESCE(SUM(${products.currentStock} * ${products.sellingPrice}), 0)`,
        lowStock: sql<number>`COALESCE(SUM(CASE WHEN ${products.currentStock} > 0 AND ${products.currentStock} <= ${products.reorderLevel} THEN 1 ELSE 0 END), 0)`,
        outOfStock: sql<number>`COALESCE(SUM(CASE WHEN ${products.currentStock} <= 0 THEN 1 ELSE 0 END), 0)`,
      })
      .from(products)
      .where(where);

    const holdings = await db
      .select({
        name: products.name,
        sku: products.sku,
        category: categories.name,
        stock: products.currentStock,
        unit: products.unitOfMeasure,
        value: sql<number>`${products.currentStock} * ${products.costPrice}`,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(where)
      .orderBy(desc(sql`${products.currentStock} * ${products.costPrice}`))
      .limit(50);

    const byCategory = await db
      .select({
        name: categories.name,
        value: sql<number>`COALESCE(SUM(${products.currentStock} * ${products.costPrice}), 0)`,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(where)
      .groupBy(categories.name)
      .orderBy(desc(sql`SUM(${products.currentStock} * ${products.costPrice})`))
      .limit(10);

    const costValue = num(totals?.costValue);
    const retailValue = num(totals?.retailValue);

    return {
      subtitle: "Live snapshot — not affected by a date range.",
      kpis: [
        { label: "Products", value: fmtInt(num(totals?.count)) },
        { label: "Stock at cost", value: fmtNaira(costValue), tone: "gold" },
        { label: "Stock at retail", value: fmtNaira(retailValue) },
        { label: "Locked-in margin", value: fmtNaira(retailValue - costValue), tone: "emerald" },
        { label: "Low stock", value: fmtInt(num(totals?.lowStock)), hint: "At/below reorder level" },
        { label: "Out of stock", value: fmtInt(num(totals?.outOfStock)), tone: num(totals?.outOfStock) > 0 ? "red" : "plain" },
      ],
      charts: [
        {
          kind: "bar",
          title: "Stock value by category (at cost)",
          xKey: "name",
          series: [{ key: "value", label: "Value at cost", format: "currency" }],
          data: byCategory.map((c) => ({ name: c.name, value: num(c.value) })),
        },
      ],
      tables: [
        {
          title: "Largest holdings (top 50 by cost value)",
          columns: [
            { key: "name", label: "Product" },
            { key: "sku", label: "SKU" },
            { key: "category", label: "Category" },
            { key: "stock", label: "In stock", align: "right", format: "qty" },
            { key: "unit", label: "Unit" },
            { key: "value", label: "Value at cost", align: "right", format: "currency" },
          ],
          rows: holdings.map((h) => ({ ...h, value: num(h.value) })),
        },
      ],
    };
  },
};

const stockMovementReport: ReportDef = {
  type: "stock_movements",
  section: "SALES",
  label: "Stock movement ledger",
  description: "Every stock in/out/adjustment in the period — audit the shelves.",
  hasRange: true,
  filters: [
    BRANCH_FILTER,
    selectFilter("movementType", "Movement type", STOCK_MOVEMENT_TYPES),
    { key: "search", label: "Product", kind: "text", placeholder: "Name or SKU" },
  ],
  run: async ({ db, activeBranch, filters, range }) => {
    const movementType = fv(filters, "movementType");
    const search = fv(filters, "search");
    const where = inRange(stockMovements.createdAt, range, [
      branchFilter(stockMovements.branchId, activeBranch, filters),
      movementType ? eq(stockMovements.movementType, movementType as (typeof STOCK_MOVEMENT_TYPES)[number]) : undefined,
      search ? sql`(${products.name} LIKE ${`%${search}%`} OR ${products.sku} LIKE ${`%${search}%`})` : undefined,
    ]);

    const rows = await db
      .select({
        date: stockMovements.createdAt,
        product: products.name,
        sku: products.sku,
        type: stockMovements.movementType,
        quantity: stockMovements.quantity,
        unit: stockMovements.unit,
        balanceAfter: stockMovements.balanceAfter,
        reason: stockMovements.reason,
        performedBy: users.fullName,
      })
      .from(stockMovements)
      .innerJoin(products, eq(stockMovements.productId, products.id))
      .leftJoin(users, eq(stockMovements.performedBy, users.id))
      .where(where)
      .orderBy(desc(stockMovements.createdAt))
      .limit(500);

    const inQty = rows.filter((r) => r.quantity > 0).reduce((s, r) => s + r.quantity, 0);
    const outQty = rows.filter((r) => r.quantity < 0).reduce((s, r) => s + Math.abs(r.quantity), 0);

    return {
      subtitle: "Up to 500 most recent movements.",
      kpis: [
        { label: "Movements", value: fmtInt(rows.length) },
        { label: "Stock in", value: fmtQty(inQty), tone: "emerald" },
        { label: "Stock out", value: fmtQty(outQty), tone: "red" },
        { label: "Net", value: `${inQty - outQty >= 0 ? "+" : "−"}${fmtQty(Math.abs(inQty - outQty))}` },
      ],
      charts: [],
      tables: [
        {
          title: "Movements",
          columns: [
            { key: "date", label: "Date", format: "datetime" },
            { key: "product", label: "Product" },
            { key: "type", label: "Type" },
            { key: "quantity", label: "Qty", align: "right", format: "qty" },
            { key: "unit", label: "Unit" },
            { key: "balanceAfter", label: "Balance after", align: "right", format: "qty" },
            { key: "reason", label: "Reason" },
            { key: "performedBy", label: "By" },
          ],
          rows: rows.map((r) => ({
            date: r.date?.toISOString() ?? "",
            product: r.product,
            type: r.type.replace(/_/g, " "),
            quantity: r.quantity,
            unit: r.unit,
            balanceAfter: r.balanceAfter,
            reason: r.reason ?? "—",
            performedBy: r.performedBy ?? "System",
          })),
        },
      ],
    };
  },
};

const slowMovers: ReportDef = {
  type: "slow_movers",
  section: "SALES",
  label: "Slow & dead stock",
  description: "Active products with zero sales in the period — cash sleeping on shelves.",
  hasRange: true,
  filters: [BRANCH_FILTER, CATEGORY_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const categoryId = fv(filters, "categoryId");
    const salesWhere = inRange(sales.createdAt, range, [
      branchFilter(sales.branchId, activeBranch, filters),
      eq(sales.status, "COMPLETED"),
    ]);

    const soldRows = await db
      .select({ productId: saleItems.productId })
      .from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .where(salesWhere)
      .groupBy(saleItems.productId);
    const soldIds = new Set(soldRows.map((r) => r.productId));

    const stock = await db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        category: categories.name,
        stock: products.currentStock,
        unit: products.unitOfMeasure,
        costValue: sql<number>`${products.currentStock} * ${products.costPrice}`,
        retailValue: sql<number>`${products.currentStock} * ${products.sellingPrice}`,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(and(eq(products.status, "ACTIVE"), categoryId ? eq(products.categoryId, Number(categoryId)) : undefined))
      .orderBy(desc(sql`${products.currentStock} * ${products.costPrice}`))
      .limit(2000);

    const dead = stock.filter((p) => !soldIds.has(p.id)).slice(0, 300);
    const tiedUp = dead.reduce((s, d) => s + num(d.costValue), 0);

    return {
      subtitle: "Products with no completed-sale lines in the selected period.",
      kpis: [
        { label: "Products with no sales", value: fmtInt(dead.length), tone: "red" },
        { label: "Cash tied up (cost)", value: fmtNaira(tiedUp), tone: "gold" },
        { label: "Retail potential", value: fmtNaira(dead.reduce((s, d) => s + num(d.retailValue), 0)) },
        { label: "Products with sales", value: fmtInt(soldIds.size), tone: "emerald" },
      ],
      charts: [],
      tables: [
        {
          title: "No-sale products",
          columns: [
            { key: "name", label: "Product" },
            { key: "sku", label: "SKU" },
            { key: "category", label: "Category" },
            { key: "stock", label: "In stock", align: "right", format: "qty" },
            { key: "unit", label: "Unit" },
            { key: "costValue", label: "Value at cost", align: "right", format: "currency" },
            { key: "retailValue", label: "Value at retail", align: "right", format: "currency" },
          ],
          rows: dead.map((d) => ({ ...d, costValue: num(d.costValue), retailValue: num(d.retailValue) })),
        },
      ],
    };
  },
};

/* -------------------- expenses (shared per section) -------------------- */

function expenseDef(section: Section): ReportDef {
  return {
    type: "expenses",
    section,
    label: "Expenses",
    description: `Every expense booked under the ${section.toLowerCase()} section — by category and in detail.`,
    hasRange: true,
    filters: [BRANCH_FILTER, selectFilter("category", "Category", EXPENSE_CATEGORIES)],
    run: async ({ db, activeBranch, filters, range }) => {
      const category = fv(filters, "category");
      const where = inRange(expenses.expenseDate, range, [
        branchFilter(expenses.branchId, activeBranch, filters),
        eq(expenses.section, section),
        eq(expenses.status, "ACTIVE"),
        category ? eq(expenses.category, category as (typeof EXPENSE_CATEGORIES)[number]) : undefined,
      ]);

      const rows = await db
        .select({
          refNo: expenses.refNo,
          date: expenses.expenseDate,
          category: expenses.category,
          description: expenses.description,
          vendor: expenses.vendor,
          amount: expenses.amount,
          method: expenses.paymentMethod,
          recordedBy: users.fullName,
        })
        .from(expenses)
        .leftJoin(users, eq(expenses.recordedBy, users.id))
        .where(where)
        .orderBy(desc(expenses.expenseDate))
        .limit(500);

      const byCat = await db
        .select({ category: expenses.category, total: sql<number>`COALESCE(SUM(${expenses.amount}), 0)`, count: count() })
        .from(expenses)
        .where(where)
        .groupBy(expenses.category)
        .orderBy(desc(sql`SUM(${expenses.amount})`));

      const total = rows.reduce((s, r) => s + num(r.amount), 0);

      return {
        kpis: [
          { label: "Total spend", value: fmtNaira(total), tone: "red" },
          { label: "Entries", value: fmtInt(rows.length) },
          { label: "Average entry", value: fmtNaira(rows.length > 0 ? total / rows.length : 0) },
          { label: "Largest category", value: byCat[0]?.category.replace(/_/g, " ") ?? "—", hint: byCat[0] ? fmtNaira(num(byCat[0].total)) : undefined },
        ],
        charts: [
          {
            kind: "bar",
            title: "Spend by category",
            xKey: "name",
            series: [{ key: "total", label: "Spend", format: "currency" }],
            data: byCat.map((c) => ({ name: c.category.replace(/_/g, " "), total: num(c.total) })),
          },
        ],
        tables: [
          {
            title: "Expense entries",
            columns: [
              { key: "refNo", label: "Ref" },
              { key: "date", label: "Date", format: "date" },
              { key: "category", label: "Category" },
              { key: "description", label: "Description" },
              { key: "vendor", label: "Vendor" },
              { key: "amount", label: "Amount", align: "right", format: "currency" },
              { key: "method", label: "Paid via" },
              { key: "recordedBy", label: "Recorded by" },
            ],
            rows: rows.map((r) => ({
              refNo: r.refNo,
              date: typeof r.date === "string" ? r.date : String(r.date),
              category: r.category.replace(/_/g, " "),
              description: r.description,
              vendor: r.vendor ?? "—",
              amount: num(r.amount),
              method: PAYMENT_METHOD_LABELS[r.method as PaymentMethod] ?? r.method,
              recordedBy: r.recordedBy ?? "—",
            })),
          },
        ],
      };
    },
  };
}

/* =========================== LAUNDRY SECTION ============================ */

const laundrySummary: ReportDef = {
  type: "laundry_summary",
  section: "LAUNDRY",
  label: "Laundry summary",
  description: "Orders, billing, collections and the live status mix of the laundry desk.",
  hasRange: true,
  filters: [BRANCH_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const scope = branchFilter(laundryOrders.branchId, activeBranch, filters);
    const where = inRange(laundryOrders.createdAt, range, [scope]);

    const [totals] = await db
      .select({
        orders: count(),
        billed: sql<number>`COALESCE(SUM(CASE WHEN ${laundryOrders.status} != 'CANCELLED' THEN ${laundryOrders.totalAmount} ELSE 0 END), 0)`,
        collected: sql<number>`COALESCE(SUM(${laundryOrders.amountPaid}), 0)`,
        express: sql<number>`COALESCE(SUM(CASE WHEN ${laundryOrders.priority} = 'EXPRESS' THEN 1 ELSE 0 END), 0)`,
        cancelled: sql<number>`COALESCE(SUM(CASE WHEN ${laundryOrders.status} = 'CANCELLED' THEN 1 ELSE 0 END), 0)`,
      })
      .from(laundryOrders)
      .where(where);

    const daily = await db
      .select({
        day: sql<string>`DATE_FORMAT(${laundryOrders.createdAt}, '%Y-%m-%d')`.as("day"),
        orders: count(),
        billed: sql<number>`COALESCE(SUM(CASE WHEN ${laundryOrders.status} != 'CANCELLED' THEN ${laundryOrders.totalAmount} ELSE 0 END), 0)`.as("billed"),
      })
      .from(laundryOrders)
      .where(where)
      .groupBy(sql`day`)
      .orderBy(sql`day`);

    const byStatus = await db
      .select({ status: laundryOrders.status, count: count() })
      .from(laundryOrders)
      .where(where)
      .groupBy(laundryOrders.status);

    const billed = num(totals?.billed);
    const collected = num(totals?.collected);

    return {
      kpis: [
        { label: "Orders", value: fmtInt(num(totals?.orders)) },
        { label: "Billed", value: fmtNaira(billed), tone: "gold" },
        { label: "Collected", value: fmtNaira(collected), tone: "emerald" },
        { label: "Outstanding", value: fmtNaira(Math.max(0, billed - collected)), tone: billed - collected > 0 ? "red" : "plain" },
        { label: "Express orders", value: fmtInt(num(totals?.express)) },
        { label: "Cancelled", value: fmtInt(num(totals?.cancelled)) },
      ],
      charts: [
        {
          kind: "area",
          title: "Orders per day",
          xKey: "day",
          series: [
            { key: "orders", label: "Orders", format: "number" },
            { key: "billed", label: "Billed", format: "currency" },
          ],
          data: daily.map((d) => ({ day: d.day, orders: d.orders, billed: num(d.billed) })),
        },
        {
          kind: "bar",
          title: "Status mix",
          xKey: "name",
          series: [{ key: "count", label: "Orders", format: "number" }],
          data: byStatus.map((s) => ({ name: s.status, count: s.count })),
        },
      ],
      tables: [
        {
          title: "By status",
          columns: [
            { key: "status", label: "Status" },
            { key: "count", label: "Orders", align: "right", format: "number" },
          ],
          rows: byStatus,
        },
      ],
    };
  },
};

const laundryOrderList: ReportDef = {
  type: "laundry_orders",
  section: "LAUNDRY",
  label: "Laundry order list",
  description: "Every laundry order in the period with totals, balances and workflow status.",
  hasRange: true,
  filters: [BRANCH_FILTER, selectFilter("status", "Status", LAUNDRY_ORDER_STATUSES), PAYSTATUS_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const status = fv(filters, "status");
    const payStatus = fv(filters, "paymentStatus");
    const where = inRange(laundryOrders.createdAt, range, [
      branchFilter(laundryOrders.branchId, activeBranch, filters),
      status ? eq(laundryOrders.status, status as (typeof LAUNDRY_ORDER_STATUSES)[number]) : undefined,
      payStatus ? eq(laundryOrders.paymentStatus, payStatus as (typeof ORDER_PAYMENT_STATUSES)[number]) : undefined,
    ]);

    const rows = await db
      .select({
        orderNo: laundryOrders.orderNo,
        date: laundryOrders.createdAt,
        customer: laundryOrders.customerName,
        phone: laundryOrders.customerPhone,
        priority: laundryOrders.priority,
        total: laundryOrders.totalAmount,
        paid: laundryOrders.amountPaid,
        paymentStatus: laundryOrders.paymentStatus,
        status: laundryOrders.status,
        dueDate: laundryOrders.dueDate,
      })
      .from(laundryOrders)
      .where(where)
      .orderBy(desc(laundryOrders.createdAt))
      .limit(500);

    const billed = rows.filter((r) => r.status !== "CANCELLED").reduce((s, r) => s + num(r.total), 0);
    const paid = rows.reduce((s, r) => s + num(r.paid), 0);

    return {
      kpis: [
        { label: "Orders", value: fmtInt(rows.length) },
        { label: "Billed", value: fmtNaira(billed), tone: "gold" },
        { label: "Collected", value: fmtNaira(paid), tone: "emerald" },
        { label: "Outstanding", value: fmtNaira(Math.max(0, billed - paid)), tone: "red" },
      ],
      charts: [],
      tables: [
        {
          title: "Orders",
          columns: [
            { key: "orderNo", label: "Order" },
            { key: "date", label: "Received", format: "datetime" },
            { key: "customer", label: "Customer" },
            { key: "phone", label: "Phone" },
            { key: "priority", label: "Priority" },
            { key: "total", label: "Total", align: "right", format: "currency" },
            { key: "paid", label: "Paid", align: "right", format: "currency" },
            { key: "balance", label: "Balance", align: "right", format: "currency" },
            { key: "status", label: "Status" },
            { key: "paymentStatus", label: "Payment" },
          ],
          rows: rows.map((r) => ({
            orderNo: r.orderNo,
            date: r.date?.toISOString() ?? "",
            customer: r.customer,
            phone: r.phone ?? "—",
            priority: r.priority,
            total: num(r.total),
            paid: num(r.paid),
            balance: Math.max(0, num(r.total) - num(r.paid)),
            status: r.status,
            paymentStatus: r.paymentStatus.replace(/_/g, " "),
          })),
        },
      ],
    };
  },
};

const laundryByService: ReportDef = {
  type: "laundry_by_service",
  section: "LAUNDRY",
  label: "Revenue by service",
  description: "Wash, dry-clean, iron… which services bring the money in.",
  hasRange: true,
  filters: [BRANCH_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const where = inRange(laundryOrders.createdAt, range, [
      branchFilter(laundryOrders.branchId, activeBranch, filters),
      sql`${laundryOrders.status} != 'CANCELLED'`,
    ]);
    const rows = await db
      .select({
        service: laundryOrderItems.serviceType,
        lines: count(),
        qty: sql<number>`COALESCE(SUM(${laundryOrderItems.quantity}), 0)`,
        revenue: sql<number>`COALESCE(SUM(${laundryOrderItems.lineTotal}), 0)`,
      })
      .from(laundryOrderItems)
      .innerJoin(laundryOrders, eq(laundryOrderItems.orderId, laundryOrders.id))
      .where(where)
      .groupBy(laundryOrderItems.serviceType)
      .orderBy(desc(sql`SUM(${laundryOrderItems.lineTotal})`));

    const grand = rows.reduce((s, r) => s + num(r.revenue), 0);
    const data = rows.map((r) => ({
      name: r.service.replace(/_/g, " "),
      lines: r.lines,
      qty: num(r.qty),
      revenue: num(r.revenue),
      share: grand > 0 ? (num(r.revenue) / grand) * 100 : 0,
    }));

    return {
      kpis: [
        { label: "Service revenue", value: fmtNaira(grand), tone: "gold" },
        { label: "Garment lines", value: fmtInt(data.reduce((s, d) => s + d.lines, 0)) },
        { label: "Top service", value: data[0]?.name ?? "—", hint: data[0] ? fmtPct(data[0].share) : undefined },
      ],
      charts: [
        { kind: "pie", title: "Service mix", nameKey: "name", valueKey: "revenue", valueFormat: "currency", data },
      ],
      tables: [
        {
          title: "By service",
          columns: [
            { key: "name", label: "Service" },
            { key: "lines", label: "Lines", align: "right", format: "number" },
            { key: "qty", label: "Pieces", align: "right", format: "qty" },
            { key: "revenue", label: "Revenue", align: "right", format: "currency" },
            { key: "share", label: "Share", align: "right", format: "percent" },
          ],
          rows: data,
        },
      ],
    };
  },
};

const laundryByGarment: ReportDef = {
  type: "laundry_by_garment",
  section: "LAUNDRY",
  label: "Garment mix",
  description: "Agbada, suits, bedsheets — what customers actually bring in.",
  hasRange: true,
  filters: [BRANCH_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const where = inRange(laundryOrders.createdAt, range, [
      branchFilter(laundryOrders.branchId, activeBranch, filters),
      sql`${laundryOrders.status} != 'CANCELLED'`,
    ]);
    const rows = await db
      .select({
        garment: laundryOrderItems.garmentType,
        qty: sql<number>`COALESCE(SUM(${laundryOrderItems.quantity}), 0)`,
        revenue: sql<number>`COALESCE(SUM(${laundryOrderItems.lineTotal}), 0)`,
      })
      .from(laundryOrderItems)
      .innerJoin(laundryOrders, eq(laundryOrderItems.orderId, laundryOrders.id))
      .where(where)
      .groupBy(laundryOrderItems.garmentType)
      .orderBy(desc(sql`SUM(${laundryOrderItems.quantity})`))
      .limit(30);

    const data = rows.map((r) => ({ garment: r.garment, qty: num(r.qty), revenue: num(r.revenue) }));

    return {
      kpis: [
        { label: "Garment types", value: fmtInt(data.length) },
        { label: "Pieces handled", value: fmtQty(data.reduce((s, d) => s + d.qty, 0)) },
        { label: "Most frequent", value: data[0]?.garment ?? "—", hint: data[0] ? `${fmtQty(data[0].qty)} pieces` : undefined },
      ],
      charts: [
        {
          kind: "bar",
          title: "Pieces by garment",
          xKey: "garment",
          series: [{ key: "qty", label: "Pieces", format: "qty" }],
          data: data.slice(0, 15),
        },
      ],
      tables: [
        {
          title: "Garments",
          columns: [
            { key: "garment", label: "Garment" },
            { key: "qty", label: "Pieces", align: "right", format: "qty" },
            { key: "revenue", label: "Revenue", align: "right", format: "currency" },
          ],
          rows: data,
        },
      ],
    };
  },
};

const laundryCollections: ReportDef = {
  type: "laundry_collections",
  section: "LAUNDRY",
  label: "Laundry collections",
  description: "Cash actually received at the laundry desk, by day and method.",
  hasRange: true,
  filters: [BRANCH_FILTER, METHOD_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const method = fv(filters, "method");
    const where = inRange(laundryPayments.createdAt, range, [
      branchFilter(laundryOrders.branchId, activeBranch, filters),
      method ? eq(laundryPayments.method, method as PaymentMethod) : undefined,
    ]);

    const daily = await db
      .select({
        day: sql<string>`DATE_FORMAT(${laundryPayments.createdAt}, '%Y-%m-%d')`.as("day"),
        total: sql<number>`COALESCE(SUM(${laundryPayments.amount}), 0)`.as("total"),
        count: count(),
      })
      .from(laundryPayments)
      .innerJoin(laundryOrders, eq(laundryPayments.orderId, laundryOrders.id))
      .where(where)
      .groupBy(sql`day`)
      .orderBy(sql`day`);

    const byMethod = await db
      .select({ method: laundryPayments.method, total: sql<number>`COALESCE(SUM(${laundryPayments.amount}), 0)`, count: count() })
      .from(laundryPayments)
      .innerJoin(laundryOrders, eq(laundryPayments.orderId, laundryOrders.id))
      .where(where)
      .groupBy(laundryPayments.method)
      .orderBy(desc(sql`SUM(${laundryPayments.amount})`));

    const collected = byMethod.reduce((s, m) => s + num(m.total), 0);

    return {
      kpis: [
        { label: "Collected", value: fmtNaira(collected), tone: "gold" },
        { label: "Payments", value: fmtInt(byMethod.reduce((s, m) => s + m.count, 0)) },
        { label: "Average payment", value: fmtNaira(daily.length > 0 ? collected / Math.max(1, byMethod.reduce((s, m) => s + m.count, 0)) : 0) },
      ],
      charts: [
        {
          kind: "area",
          title: "Collections per day",
          xKey: "day",
          series: [{ key: "total", label: "Collected", format: "currency" }],
          data: daily.map((d) => ({ day: d.day, total: num(d.total) })),
        },
      ],
      tables: [
        {
          title: "By method",
          columns: [
            { key: "method", label: "Method" },
            { key: "count", label: "Payments", align: "right", format: "number" },
            { key: "total", label: "Total", align: "right", format: "currency" },
          ],
          rows: byMethod.map((m) => ({ method: PAYMENT_METHOD_LABELS[m.method as PaymentMethod] ?? m.method, count: m.count, total: num(m.total) })),
        },
      ],
    };
  },
};

const laundryOutstanding: ReportDef = {
  type: "laundry_outstanding",
  section: "LAUNDRY",
  label: "Outstanding balances",
  description: "Unpaid and part-paid laundry orders — who still owes, and how much.",
  hasRange: false,
  filters: [BRANCH_FILTER],
  run: async ({ db, activeBranch, filters }) => {
    const where = and(
      branchFilter(laundryOrders.branchId, activeBranch, filters),
      sql`${laundryOrders.status} != 'CANCELLED'`,
      sql`${laundryOrders.paymentStatus} != 'PAID'`,
    );
    const rows = await db
      .select({
        orderNo: laundryOrders.orderNo,
        date: laundryOrders.createdAt,
        customer: laundryOrders.customerName,
        phone: laundryOrders.customerPhone,
        total: laundryOrders.totalAmount,
        paid: laundryOrders.amountPaid,
        status: laundryOrders.status,
        paymentStatus: laundryOrders.paymentStatus,
      })
      .from(laundryOrders)
      .where(where)
      .orderBy(desc(sql`(${laundryOrders.totalAmount} - ${laundryOrders.amountPaid})`))
      .limit(300);

    const data = rows.map((r) => ({
      orderNo: r.orderNo,
      date: r.date?.toISOString().slice(0, 10) ?? "",
      customer: r.customer,
      phone: r.phone ?? "—",
      total: num(r.total),
      paid: num(r.paid),
      balance: Math.max(0, num(r.total) - num(r.paid)),
      status: r.status,
    }));
    const outstanding = data.reduce((s, d) => s + d.balance, 0);

    return {
      subtitle: "Current state — not affected by a date range.",
      kpis: [
        { label: "Orders owing", value: fmtInt(data.length), tone: "red" },
        { label: "Outstanding", value: fmtNaira(outstanding), tone: "red" },
        { label: "Largest debt", value: fmtNaira(data[0]?.balance ?? 0), hint: data[0]?.customer },
      ],
      charts: [],
      tables: [
        {
          title: "Balances",
          columns: [
            { key: "orderNo", label: "Order" },
            { key: "date", label: "Received", format: "text" },
            { key: "customer", label: "Customer" },
            { key: "phone", label: "Phone" },
            { key: "total", label: "Total", align: "right", format: "currency" },
            { key: "paid", label: "Paid", align: "right", format: "currency" },
            { key: "balance", label: "Balance", align: "right", format: "currency" },
            { key: "status", label: "Status" },
          ],
          rows: data,
        },
      ],
    };
  },
};

const laundryCustomers: ReportDef = {
  type: "laundry_customers",
  section: "LAUNDRY",
  label: "Laundry customers",
  description: "Best laundry customers by orders and spend.",
  hasRange: true,
  filters: [BRANCH_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const where = inRange(laundryOrders.createdAt, range, [
      branchFilter(laundryOrders.branchId, activeBranch, filters),
      sql`${laundryOrders.status} != 'CANCELLED'`,
    ]);
    const rows = await db
      .select({
        name: laundryOrders.customerName,
        phone: laundryOrders.customerPhone,
        orders: count(),
        spent: sql<number>`COALESCE(SUM(${laundryOrders.totalAmount}), 0)`,
        balance: sql<number>`COALESCE(SUM(${laundryOrders.totalAmount} - ${laundryOrders.amountPaid}), 0)`,
        lastOrder: sql<string>`MAX(${laundryOrders.createdAt})`,
      })
      .from(laundryOrders)
      .where(where)
      .groupBy(laundryOrders.customerName, laundryOrders.customerPhone)
      .orderBy(desc(sql`SUM(${laundryOrders.totalAmount})`))
      .limit(200);

    const data = rows.map((r) => ({
      name: r.name,
      phone: r.phone ?? "—",
      orders: r.orders,
      spent: num(r.spent),
      balance: Math.max(0, num(r.balance)),
      lastOrder: String(r.lastOrder ?? "").slice(0, 10),
    }));

    return {
      kpis: [
        { label: "Customers", value: fmtInt(data.length) },
        { label: "Total billed", value: fmtNaira(data.reduce((s, d) => s + d.spent, 0)), tone: "gold" },
        { label: "Repeat customers", value: fmtInt(data.filter((d) => d.orders > 1).length), hint: "More than one order" },
      ],
      charts: [
        {
          kind: "bar",
          title: "Top customers by spend",
          xKey: "name",
          series: [{ key: "spent", label: "Spend", format: "currency" }],
          data: data.slice(0, 10).map((d) => ({ name: d.name.length > 16 ? `${d.name.slice(0, 16)}…` : d.name, spent: d.spent })),
        },
      ],
      tables: [
        {
          title: "Customers",
          columns: [
            { key: "name", label: "Customer" },
            { key: "phone", label: "Phone" },
            { key: "orders", label: "Orders", align: "right", format: "number" },
            { key: "spent", label: "Spend", align: "right", format: "currency" },
            { key: "balance", label: "Balance", align: "right", format: "currency" },
            { key: "lastOrder", label: "Last order" },
          ],
          rows: data,
        },
      ],
    };
  },
};

/* =========================== TAILORING SECTION ========================== */

const tailoringSummary: ReportDef = {
  type: "tailoring_summary",
  section: "TAILORING",
  label: "Tailoring summary",
  description: "Bespoke orders, billing, collections and the live workflow mix.",
  hasRange: true,
  filters: [BRANCH_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const scope = branchFilter(tailoringOrders.branchId, activeBranch, filters);
    const where = inRange(tailoringOrders.createdAt, range, [scope]);

    const [totals] = await db
      .select({
        orders: count(),
        billed: sql<number>`COALESCE(SUM(CASE WHEN ${tailoringOrders.status} != 'CANCELLED' THEN ${tailoringOrders.price} ELSE 0 END), 0)`,
        collected: sql<number>`COALESCE(SUM(${tailoringOrders.amountPaid}), 0)`,
        delivered: sql<number>`COALESCE(SUM(CASE WHEN ${tailoringOrders.status} = 'DELIVERED' THEN 1 ELSE 0 END), 0)`,
        inProgress: sql<number>`COALESCE(SUM(CASE WHEN ${tailoringOrders.status} IN ('RECEIVED','CUTTING','SEWING','FINISHING','FITTING') THEN 1 ELSE 0 END), 0)`,
        cancelled: sql<number>`COALESCE(SUM(CASE WHEN ${tailoringOrders.status} = 'CANCELLED' THEN 1 ELSE 0 END), 0)`,
      })
      .from(tailoringOrders)
      .where(where);

    const daily = await db
      .select({
        day: sql<string>`DATE_FORMAT(${tailoringOrders.createdAt}, '%Y-%m-%d')`.as("day"),
        orders: count(),
        billed: sql<number>`COALESCE(SUM(CASE WHEN ${tailoringOrders.status} != 'CANCELLED' THEN ${tailoringOrders.price} ELSE 0 END), 0)`.as("billed"),
      })
      .from(tailoringOrders)
      .where(where)
      .groupBy(sql`day`)
      .orderBy(sql`day`);

    const byStatus = await db
      .select({ status: tailoringOrders.status, count: count() })
      .from(tailoringOrders)
      .where(where)
      .groupBy(tailoringOrders.status);

    const billed = num(totals?.billed);
    const collected = num(totals?.collected);

    return {
      kpis: [
        { label: "Orders", value: fmtInt(num(totals?.orders)) },
        { label: "Billed", value: fmtNaira(billed), tone: "gold" },
        { label: "Collected", value: fmtNaira(collected), tone: "emerald" },
        { label: "Outstanding", value: fmtNaira(Math.max(0, billed - collected)), tone: billed - collected > 0 ? "red" : "plain" },
        { label: "Delivered", value: fmtInt(num(totals?.delivered)) },
        { label: "In progress", value: fmtInt(num(totals?.inProgress)) },
      ],
      charts: [
        {
          kind: "area",
          title: "Orders per day",
          xKey: "day",
          series: [
            { key: "orders", label: "Orders", format: "number" },
            { key: "billed", label: "Billed", format: "currency" },
          ],
          data: daily.map((d) => ({ day: d.day, orders: d.orders, billed: num(d.billed) })),
        },
        {
          kind: "bar",
          title: "Workflow status mix",
          xKey: "name",
          series: [{ key: "count", label: "Orders", format: "number" }],
          data: byStatus.map((s) => ({ name: s.status, count: s.count })),
        },
      ],
      tables: [
        {
          title: "By status",
          columns: [
            { key: "status", label: "Status" },
            { key: "count", label: "Orders", align: "right", format: "number" },
          ],
          rows: byStatus,
        },
      ],
    };
  },
};

const tailoringOrderList: ReportDef = {
  type: "tailoring_orders",
  section: "TAILORING",
  label: "Tailoring order list",
  description: "Every tailoring order with style, tailor, totals and workflow status.",
  hasRange: true,
  filters: [
    BRANCH_FILTER,
    selectFilter("status", "Status", TAILORING_ORDER_STATUSES),
    PAYSTATUS_FILTER,
    selectFilter("fabricSource", "Fabric source", FABRIC_SOURCES.map((f) => ({ value: f, label: f === "CUSTOMER_OWN" ? "Customer's fabric" : "Shop stock" }))),
  ],
  run: async ({ db, activeBranch, filters, range }) => {
    const status = fv(filters, "status");
    const payStatus = fv(filters, "paymentStatus");
    const fabricSource = fv(filters, "fabricSource");
    const where = inRange(tailoringOrders.createdAt, range, [
      branchFilter(tailoringOrders.branchId, activeBranch, filters),
      status ? eq(tailoringOrders.status, status as (typeof TAILORING_ORDER_STATUSES)[number]) : undefined,
      payStatus ? eq(tailoringOrders.paymentStatus, payStatus as (typeof ORDER_PAYMENT_STATUSES)[number]) : undefined,
      fabricSource ? eq(tailoringOrders.fabricSource, fabricSource as (typeof FABRIC_SOURCES)[number]) : undefined,
    ]);

    const rows = await db
      .select({
        orderNo: tailoringOrders.orderNo,
        date: tailoringOrders.createdAt,
        customer: tailoringOrders.customerName,
        style: tailoringOrders.styleDescription,
        tailor: users.fullName,
        fabricSource: tailoringOrders.fabricSource,
        price: tailoringOrders.price,
        paid: tailoringOrders.amountPaid,
        paymentStatus: tailoringOrders.paymentStatus,
        status: tailoringOrders.status,
        dueDate: tailoringOrders.dueDate,
      })
      .from(tailoringOrders)
      .leftJoin(users, eq(tailoringOrders.tailorId, users.id))
      .where(where)
      .orderBy(desc(tailoringOrders.createdAt))
      .limit(500);

    const billed = rows.filter((r) => r.status !== "CANCELLED").reduce((s, r) => s + num(r.price), 0);
    const paid = rows.reduce((s, r) => s + num(r.paid), 0);

    return {
      kpis: [
        { label: "Orders", value: fmtInt(rows.length) },
        { label: "Billed", value: fmtNaira(billed), tone: "gold" },
        { label: "Collected", value: fmtNaira(paid), tone: "emerald" },
        { label: "Outstanding", value: fmtNaira(Math.max(0, billed - paid)), tone: "red" },
      ],
      charts: [],
      tables: [
        {
          title: "Orders",
          columns: [
            { key: "orderNo", label: "Order" },
            { key: "date", label: "Received", format: "datetime" },
            { key: "customer", label: "Customer" },
            { key: "style", label: "Style" },
            { key: "tailor", label: "Tailor" },
            { key: "price", label: "Price", align: "right", format: "currency" },
            { key: "paid", label: "Paid", align: "right", format: "currency" },
            { key: "balance", label: "Balance", align: "right", format: "currency" },
            { key: "status", label: "Status" },
            { key: "paymentStatus", label: "Payment" },
          ],
          rows: rows.map((r) => ({
            orderNo: r.orderNo,
            date: r.date?.toISOString() ?? "",
            customer: r.customer,
            style: r.style ?? "—",
            tailor: r.tailor ?? "Unassigned",
            price: num(r.price),
            paid: num(r.paid),
            balance: Math.max(0, num(r.price) - num(r.paid)),
            status: r.status,
            paymentStatus: r.paymentStatus.replace(/_/g, " "),
          })),
        },
      ],
    };
  },
};

const tailorWorkload: ReportDef = {
  type: "tailor_workload",
  section: "TAILORING",
  label: "Tailor workload & output",
  description: "Orders assigned, delivered and revenue earned per tailor.",
  hasRange: true,
  filters: [BRANCH_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const where = inRange(tailoringOrders.createdAt, range, [
      branchFilter(tailoringOrders.branchId, activeBranch, filters),
      sql`${tailoringOrders.status} != 'CANCELLED'`,
      sql`${tailoringOrders.tailorId} IS NOT NULL`,
    ]);

    const rows = await db
      .select({
        tailorId: tailoringOrders.tailorId,
        name: users.fullName,
        orders: count(),
        delivered: sql<number>`COALESCE(SUM(CASE WHEN ${tailoringOrders.status} = 'DELIVERED' THEN 1 ELSE 0 END), 0)`,
        inProgress: sql<number>`COALESCE(SUM(CASE WHEN ${tailoringOrders.status} IN ('RECEIVED','CUTTING','SEWING','FINISHING','FITTING') THEN 1 ELSE 0 END), 0)`,
        revenue: sql<number>`COALESCE(SUM(${tailoringOrders.price}), 0)`,
      })
      .from(tailoringOrders)
      .innerJoin(users, eq(tailoringOrders.tailorId, users.id))
      .where(where)
      .groupBy(tailoringOrders.tailorId, users.fullName)
      .orderBy(desc(sql`SUM(${tailoringOrders.price})`));

    const data = rows.map((r) => ({
      name: r.name,
      orders: r.orders,
      delivered: num(r.delivered),
      inProgress: num(r.inProgress),
      revenue: num(r.revenue),
      completion: r.orders > 0 ? (num(r.delivered) / r.orders) * 100 : 0,
    }));

    return {
      kpis: [
        { label: "Tailors with work", value: fmtInt(data.length) },
        { label: "Orders assigned", value: fmtInt(data.reduce((s, d) => s + d.orders, 0)) },
        { label: "Top earner", value: data[0]?.name ?? "—", hint: data[0] ? fmtNaira(data[0].revenue) : undefined },
      ],
      charts: [
        {
          kind: "bar",
          title: "Orders per tailor",
          xKey: "name",
          series: [
            { key: "delivered", label: "Delivered", format: "number" },
            { key: "inProgress", label: "In progress", format: "number" },
          ],
          data,
        },
      ],
      tables: [
        {
          title: "Per tailor",
          columns: [
            { key: "name", label: "Tailor" },
            { key: "orders", label: "Assigned", align: "right", format: "number" },
            { key: "delivered", label: "Delivered", align: "right", format: "number" },
            { key: "inProgress", label: "In progress", align: "right", format: "number" },
            { key: "completion", label: "Completion", align: "right", format: "percent" },
            { key: "revenue", label: "Revenue", align: "right", format: "currency" },
          ],
          rows: data,
        },
      ],
    };
  },
};

const tailoringCollections: ReportDef = {
  type: "tailoring_collections",
  section: "TAILORING",
  label: "Tailoring collections",
  description: "Cash received for tailoring work, by day and payment method.",
  hasRange: true,
  filters: [BRANCH_FILTER, METHOD_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const method = fv(filters, "method");
    const where = inRange(tailoringPayments.createdAt, range, [
      branchFilter(tailoringOrders.branchId, activeBranch, filters),
      method ? eq(tailoringPayments.method, method as PaymentMethod) : undefined,
    ]);

    const daily = await db
      .select({
        day: sql<string>`DATE_FORMAT(${tailoringPayments.createdAt}, '%Y-%m-%d')`.as("day"),
        total: sql<number>`COALESCE(SUM(${tailoringPayments.amount}), 0)`.as("total"),
      })
      .from(tailoringPayments)
      .innerJoin(tailoringOrders, eq(tailoringPayments.orderId, tailoringOrders.id))
      .where(where)
      .groupBy(sql`day`)
      .orderBy(sql`day`);

    const byMethod = await db
      .select({ method: tailoringPayments.method, total: sql<number>`COALESCE(SUM(${tailoringPayments.amount}), 0)`, count: count() })
      .from(tailoringPayments)
      .innerJoin(tailoringOrders, eq(tailoringPayments.orderId, tailoringOrders.id))
      .where(where)
      .groupBy(tailoringPayments.method)
      .orderBy(desc(sql`SUM(${tailoringPayments.amount})`));

    const collected = byMethod.reduce((s, m) => s + num(m.total), 0);

    return {
      kpis: [
        { label: "Collected", value: fmtNaira(collected), tone: "gold" },
        { label: "Payments", value: fmtInt(byMethod.reduce((s, m) => s + m.count, 0)) },
      ],
      charts: [
        {
          kind: "area",
          title: "Collections per day",
          xKey: "day",
          series: [{ key: "total", label: "Collected", format: "currency" }],
          data: daily.map((d) => ({ day: d.day, total: num(d.total) })),
        },
      ],
      tables: [
        {
          title: "By method",
          columns: [
            { key: "method", label: "Method" },
            { key: "count", label: "Payments", align: "right", format: "number" },
            { key: "total", label: "Total", align: "right", format: "currency" },
          ],
          rows: byMethod.map((m) => ({ method: PAYMENT_METHOD_LABELS[m.method as PaymentMethod] ?? m.method, count: m.count, total: num(m.total) })),
        },
      ],
    };
  },
};

const tailoringOutstanding: ReportDef = {
  type: "tailoring_outstanding",
  section: "TAILORING",
  label: "Outstanding balances",
  description: "Unpaid and part-paid tailoring orders — chase the balances.",
  hasRange: false,
  filters: [BRANCH_FILTER],
  run: async ({ db, activeBranch, filters }) => {
    const where = and(
      branchFilter(tailoringOrders.branchId, activeBranch, filters),
      sql`${tailoringOrders.status} != 'CANCELLED'`,
      sql`${tailoringOrders.paymentStatus} != 'PAID'`,
    );
    const rows = await db
      .select({
        orderNo: tailoringOrders.orderNo,
        date: tailoringOrders.createdAt,
        customer: tailoringOrders.customerName,
        phone: tailoringOrders.customerPhone,
        price: tailoringOrders.price,
        paid: tailoringOrders.amountPaid,
        status: tailoringOrders.status,
      })
      .from(tailoringOrders)
      .where(where)
      .orderBy(desc(sql`(${tailoringOrders.price} - ${tailoringOrders.amountPaid})`))
      .limit(300);

    const data = rows.map((r) => ({
      orderNo: r.orderNo,
      date: r.date?.toISOString().slice(0, 10) ?? "",
      customer: r.customer,
      phone: r.phone ?? "—",
      price: num(r.price),
      paid: num(r.paid),
      balance: Math.max(0, num(r.price) - num(r.paid)),
      status: r.status,
    }));
    const outstanding = data.reduce((s, d) => s + d.balance, 0);

    return {
      subtitle: "Current state — not affected by a date range.",
      kpis: [
        { label: "Orders owing", value: fmtInt(data.length), tone: "red" },
        { label: "Outstanding", value: fmtNaira(outstanding), tone: "red" },
        { label: "Largest debt", value: fmtNaira(data[0]?.balance ?? 0), hint: data[0]?.customer },
      ],
      charts: [],
      tables: [
        {
          title: "Balances",
          columns: [
            { key: "orderNo", label: "Order" },
            { key: "date", label: "Received", format: "text" },
            { key: "customer", label: "Customer" },
            { key: "phone", label: "Phone" },
            { key: "price", label: "Price", align: "right", format: "currency" },
            { key: "paid", label: "Paid", align: "right", format: "currency" },
            { key: "balance", label: "Balance", align: "right", format: "currency" },
            { key: "status", label: "Status" },
          ],
          rows: data,
        },
      ],
    };
  },
};

const fabricSourceReport: ReportDef = {
  type: "fabric_source",
  section: "TAILORING",
  label: "Fabric source mix",
  description: "Customer's own fabric versus shop stock — and what each earns.",
  hasRange: true,
  filters: [BRANCH_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const where = inRange(tailoringOrders.createdAt, range, [
      branchFilter(tailoringOrders.branchId, activeBranch, filters),
      sql`${tailoringOrders.status} != 'CANCELLED'`,
    ]);
    const rows = await db
      .select({
        source: tailoringOrders.fabricSource,
        orders: count(),
        revenue: sql<number>`COALESCE(SUM(${tailoringOrders.price}), 0)`,
        collected: sql<number>`COALESCE(SUM(${tailoringOrders.amountPaid}), 0)`,
      })
      .from(tailoringOrders)
      .where(where)
      .groupBy(tailoringOrders.fabricSource);

    const grand = rows.reduce((s, r) => s + num(r.revenue), 0);
    const label = (s: string) => (s === "CUSTOMER_OWN" ? "Customer's fabric" : "Shop stock");
    const data = rows.map((r) => ({
      source: label(r.source),
      orders: r.orders,
      revenue: num(r.revenue),
      collected: num(r.collected),
      share: grand > 0 ? (num(r.revenue) / grand) * 100 : 0,
    }));

    return {
      kpis: [
        { label: "Orders", value: fmtInt(data.reduce((s, d) => s + d.orders, 0)) },
        { label: "Revenue", value: fmtNaira(grand), tone: "gold" },
        { label: "Shop-stock share", value: fmtPct(data.find((d) => d.source === "Shop stock")?.share ?? 0) },
      ],
      charts: [
        { kind: "pie", title: "Orders by fabric source", nameKey: "source", valueKey: "orders", valueFormat: "number", data },
      ],
      tables: [
        {
          title: "By fabric source",
          columns: [
            { key: "source", label: "Source" },
            { key: "orders", label: "Orders", align: "right", format: "number" },
            { key: "revenue", label: "Billed", align: "right", format: "currency" },
            { key: "collected", label: "Collected", align: "right", format: "currency" },
            { key: "share", label: "Share", align: "right", format: "percent" },
          ],
          rows: data,
        },
      ],
    };
  },
};

const productionRuns: ReportDef = {
  type: "production_runs",
  section: "TAILORING",
  label: "Production runs",
  description: "In-house production — what was made, from what, and how far each run got.",
  hasRange: true,
  filters: [BRANCH_FILTER, selectFilter("status", "Status", PRODUCTION_STATUSES)],
  run: async ({ db, activeBranch, filters, range }) => {
    const status = fv(filters, "status");
    const where = inRange(productionOrders.createdAt, range, [
      branchFilter(productionOrders.branchId, activeBranch, filters),
      status ? eq(productionOrders.status, status as (typeof PRODUCTION_STATUSES)[number]) : undefined,
    ]);

    const rows = await db
      .select({
        refNo: productionOrders.refNo,
        date: productionOrders.createdAt,
        product: products.name,
        outputQty: productionOrders.outputQty,
        status: productionOrders.status,
        requestedBy: users.fullName,
        startedAt: productionOrders.startedAt,
        completedAt: productionOrders.completedAt,
      })
      .from(productionOrders)
      .innerJoin(products, eq(productionOrders.outputProductId, products.id))
      .leftJoin(users, eq(productionOrders.requestedBy, users.id))
      .where(where)
      .orderBy(desc(productionOrders.createdAt))
      .limit(300);

    const completedQty = rows.filter((r) => r.status === "COMPLETED").reduce((s, r) => s + num(r.outputQty), 0);

    return {
      kpis: [
        { label: "Runs", value: fmtInt(rows.length) },
        { label: "Completed", value: fmtInt(rows.filter((r) => r.status === "COMPLETED").length), tone: "emerald" },
        { label: "In progress", value: fmtInt(rows.filter((r) => r.status === "IN_PROGRESS").length) },
        { label: "Units produced", value: fmtQty(completedQty), tone: "gold" },
      ],
      charts: [],
      tables: [
        {
          title: "Runs",
          columns: [
            { key: "refNo", label: "Ref" },
            { key: "date", label: "Created", format: "datetime" },
            { key: "product", label: "Output product" },
            { key: "outputQty", label: "Output qty", align: "right", format: "qty" },
            { key: "status", label: "Status" },
            { key: "requestedBy", label: "Requested by" },
            { key: "completedAt", label: "Completed", format: "datetime" },
          ],
          rows: rows.map((r) => ({
            refNo: r.refNo,
            date: r.date?.toISOString() ?? "",
            product: r.product,
            outputQty: num(r.outputQty),
            status: r.status.replace(/_/g, " "),
            requestedBy: r.requestedBy ?? "—",
            completedAt: r.completedAt?.toISOString() ?? "—",
          })),
        },
      ],
    };
  },
};

/* ------------------------------- registry ------------------------------ */

export const REPORT_DEFS: ReportDef[] = [
  // Sales & inventory (14)
  salesSummary,
  salesDetail,
  productPerformance,
  categoryPerformance,
  cashierPerformance,
  customerSales,
  paymentMethods,
  taxReport,
  returnsReport,
  profitMargin,
  inventoryValuation,
  stockMovementReport,
  slowMovers,
  expenseDef("SALES"),
  // Laundry (8)
  laundrySummary,
  laundryOrderList,
  laundryByService,
  laundryByGarment,
  laundryCollections,
  laundryOutstanding,
  laundryCustomers,
  expenseDef("LAUNDRY"),
  // Tailoring (8)
  tailoringSummary,
  tailoringOrderList,
  tailorWorkload,
  tailoringCollections,
  tailoringOutstanding,
  fabricSourceReport,
  productionRuns,
  expenseDef("TAILORING"),
];

export function findReportDef(type: string, section: Section): ReportDef | undefined {
  return REPORT_DEFS.find((d) => d.type === type && d.section === section);
}

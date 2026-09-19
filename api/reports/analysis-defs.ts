import { count, desc, eq, sql } from "drizzle-orm";
import {
  branches,
  categories,
  laundryOrderItems,
  laundryOrders,
  products,
  productionOrders,
  saleItems,
  salePayments,
  sales,
  tailoringOrders,
  users,
} from "@db/schema";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@contracts/constants";
import { BRANCH_FILTER, branchFilter, fmtInt, fmtNaira, fmtPct, fmtQty, inRange, num, type ReportDef } from "./shared";

/**
 * HADRAN FABRICS MALL — analysis type registry (Analysis Studio).
 * Chart-first companions to the report registry: same run contract, but the
 * emphasis is on patterns and trends rather than tabular detail.
 */

/* ============================ SALES SECTION ============================= */

const revenueTrend: ReportDef = {
  type: "revenue_trend",
  section: "SALES",
  label: "Revenue trend",
  description: "Daily revenue and order volume — spot the climb or the dip.",
  hasRange: true,
  filters: [BRANCH_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const rows = await db
      .select({
        day: sql<string>`DATE_FORMAT(${sales.createdAt}, '%Y-%m-%d')`.as("day"),
        revenue: sql<number>`COALESCE(SUM(${sales.grandTotal}), 0)`.as("revenue"),
        orders: count(),
      })
      .from(sales)
      .where(inRange(sales.createdAt, range, [branchFilter(sales.branchId, activeBranch, filters), eq(sales.status, "COMPLETED")]))
      .groupBy(sql`day`)
      .orderBy(sql`day`);

    const data = rows.map((r) => ({ day: r.day, revenue: num(r.revenue), orders: r.orders }));
    const total = data.reduce((s, d) => s + d.revenue, 0);
    const best = data.reduce<(typeof data)[number] | null>((b, d) => (d.revenue > (b?.revenue ?? -1) ? d : b), null);

    return {
      kpis: [
        { label: "Period revenue", value: fmtNaira(total), tone: "gold" },
        { label: "Best day", value: best?.day ?? "—", hint: best ? fmtNaira(best.revenue) : undefined },
        { label: "Average per day", value: fmtNaira(data.length > 0 ? total / data.length : 0) },
      ],
      charts: [
        {
          kind: "area",
          title: "Revenue",
          xKey: "day",
          series: [{ key: "revenue", label: "Revenue", format: "currency" }],
          data,
          height: 320,
        },
        {
          kind: "line",
          title: "Orders",
          xKey: "day",
          series: [{ key: "orders", label: "Orders", format: "number" }],
          data,
        },
      ],
      tables: [],
    };
  },
};

const hourlyPattern: ReportDef = {
  type: "hourly_pattern",
  section: "SALES",
  label: "Hourly pattern",
  description: "Which hours of the day make the money — plan staffing around the peaks.",
  hasRange: true,
  filters: [BRANCH_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const rows = await db
      .select({
        hour: sql<number>`HOUR(${sales.createdAt})`.as("hour"),
        revenue: sql<number>`COALESCE(SUM(${sales.grandTotal}), 0)`.as("revenue"),
        orders: count(),
      })
      .from(sales)
      .where(inRange(sales.createdAt, range, [branchFilter(sales.branchId, activeBranch, filters), eq(sales.status, "COMPLETED")]))
      .groupBy(sql`hour`)
      .orderBy(sql`hour`);

    const byHour = new Map(rows.map((r) => [Number(r.hour), r]));
    const data = Array.from({ length: 24 }, (_, h) => ({
      hour: `${String(h).padStart(2, "0")}:00`,
      revenue: num(byHour.get(h)?.revenue),
      orders: num(byHour.get(h)?.orders),
    }));
    const peak = data.reduce((b, d) => (d.revenue > b.revenue ? d : b), data[0]);

    return {
      kpis: [
        { label: "Peak hour", value: peak.revenue > 0 ? peak.hour : "—", hint: peak.revenue > 0 ? fmtNaira(peak.revenue) : undefined, tone: "gold" },
        { label: "Busiest by orders", value: data.reduce((b, d) => (d.orders > b.orders ? d : b), data[0]).hour },
      ],
      charts: [
        {
          kind: "bar",
          title: "Revenue by hour",
          xKey: "hour",
          series: [{ key: "revenue", label: "Revenue", format: "currency" }],
          data,
          height: 300,
        },
      ],
      tables: [],
    };
  },
};

const weekdayPattern: ReportDef = {
  type: "weekday_pattern",
  section: "SALES",
  label: "Weekday pattern",
  description: "Mondays vs Saturdays — which days of the week carry the shop.",
  hasRange: true,
  filters: [BRANCH_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const rows = await db
      .select({
        weekday: sql<string>`DAYNAME(${sales.createdAt})`.as("weekday"),
        dow: sql<number>`DAYOFWEEK(${sales.createdAt})`.as("dow"),
        revenue: sql<number>`COALESCE(SUM(${sales.grandTotal}), 0)`.as("revenue"),
        orders: count(),
      })
      .from(sales)
      .where(inRange(sales.createdAt, range, [branchFilter(sales.branchId, activeBranch, filters), eq(sales.status, "COMPLETED")]))
      .groupBy(sql`weekday`, sql`dow`)
      .orderBy(sql`dow`);

    const data = rows.map((r) => ({ weekday: r.weekday, revenue: num(r.revenue), orders: r.orders }));
    const best = data.reduce<(typeof data)[number] | null>((b, d) => (d.revenue > (b?.revenue ?? -1) ? d : b), null);

    return {
      kpis: [
        { label: "Strongest day", value: best?.weekday ?? "—", hint: best ? fmtNaira(best.revenue) : undefined, tone: "gold" },
        { label: "Quietest day", value: data.reduce((b, d) => (d.revenue < b.revenue ? d : b), data[0] ?? { weekday: "—", revenue: 0, orders: 0 }).weekday },
      ],
      charts: [
        {
          kind: "bar",
          title: "Revenue by weekday",
          xKey: "weekday",
          series: [
            { key: "revenue", label: "Revenue", format: "currency" },
            { key: "orders", label: "Orders", format: "number" },
          ],
          data,
          height: 300,
        },
      ],
      tables: [],
    };
  },
};

const paymentMix: ReportDef = {
  type: "payment_mix",
  section: "SALES",
  label: "Payment mix",
  description: "Cash vs POS vs transfer — the shape of your collections.",
  hasRange: true,
  filters: [BRANCH_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const rows = await db
      .select({ method: salePayments.method, total: sql<number>`COALESCE(SUM(${salePayments.amount}), 0)`, count: count() })
      .from(salePayments)
      .innerJoin(sales, eq(salePayments.saleId, sales.id))
      .where(inRange(salePayments.createdAt, range, [branchFilter(sales.branchId, activeBranch, filters), eq(sales.status, "COMPLETED")]))
      .groupBy(salePayments.method)
      .orderBy(desc(sql`SUM(${salePayments.amount})`));

    const grand = rows.reduce((s, r) => s + num(r.total), 0);
    const data = rows.map((r) => ({ name: PAYMENT_METHOD_LABELS[r.method as PaymentMethod] ?? r.method, value: num(r.total) }));

    return {
      kpis: [
        { label: "Collected", value: fmtNaira(grand), tone: "gold" },
        { label: "Dominant method", value: data[0]?.name ?? "—", hint: data[0] && grand > 0 ? fmtPct((data[0].value / grand) * 100) : undefined },
      ],
      charts: [
        { kind: "pie", title: "Collections by method", nameKey: "name", valueKey: "value", valueFormat: "currency", data, height: 300 },
      ],
      tables: [],
    };
  },
};

const categoryShare: ReportDef = {
  type: "category_share",
  section: "SALES",
  label: "Category share",
  description: "How revenue splits across the catalogue — and how it shifts over time.",
  hasRange: true,
  filters: [BRANCH_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const rows = await db
      .select({
        name: categories.name,
        revenue: sql<number>`COALESCE(SUM(${saleItems.lineTotal}), 0)`,
      })
      .from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .innerJoin(products, eq(saleItems.productId, products.id))
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(inRange(sales.createdAt, range, [branchFilter(sales.branchId, activeBranch, filters), eq(sales.status, "COMPLETED")]))
      .groupBy(categories.name)
      .orderBy(desc(sql`SUM(${saleItems.lineTotal})`))
      .limit(10);

    const data = rows.map((r) => ({ name: r.name, value: num(r.revenue) }));
    const grand = data.reduce((s, d) => s + d.value, 0);

    return {
      kpis: [
        { label: "Categories selling", value: fmtInt(data.length) },
        { label: "Leader", value: data[0]?.name ?? "—", hint: data[0] && grand > 0 ? fmtPct((data[0].value / grand) * 100) : undefined, tone: "gold" },
      ],
      charts: [
        { kind: "pie", title: "Revenue share", nameKey: "name", valueKey: "value", valueFormat: "currency", data, height: 320 },
        {
          kind: "bar",
          title: "Revenue by category",
          xKey: "name",
          series: [{ key: "value", label: "Revenue", format: "currency" }],
          data,
        },
      ],
      tables: [],
    };
  },
};

const productPareto: ReportDef = {
  type: "product_pareto",
  section: "SALES",
  label: "Product pareto (80/20)",
  description: "The few products that make most of the money — cumulative share included.",
  hasRange: true,
  filters: [BRANCH_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const rows = await db
      .select({
        name: saleItems.productName,
        revenue: sql<number>`COALESCE(SUM(${saleItems.lineTotal}), 0)`,
        qty: sql<number>`COALESCE(SUM(${saleItems.quantity}), 0)`,
      })
      .from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .where(inRange(sales.createdAt, range, [branchFilter(sales.branchId, activeBranch, filters), eq(sales.status, "COMPLETED")]))
      .groupBy(saleItems.productId, saleItems.productName)
      .orderBy(desc(sql`SUM(${saleItems.lineTotal})`))
      .limit(50);

    const grand = rows.reduce((s, r) => s + num(r.revenue), 0);
    let running = 0;
    const data = rows.map((r, i) => {
      running += num(r.revenue);
      return {
        rank: i + 1,
        name: r.name,
        revenue: num(r.revenue),
        qty: num(r.qty),
        cumShare: grand > 0 ? (running / grand) * 100 : 0,
      };
    });
    const top20Count = Math.max(1, Math.ceil(data.length * 0.2));
    const top20Share = data.slice(0, top20Count).reduce((s, d) => s + d.revenue, 0);

    return {
      kpis: [
        { label: "Products analysed", value: fmtInt(data.length) },
        { label: "Revenue", value: fmtNaira(grand), tone: "gold" },
        { label: `Top ${top20Count} products hold`, value: grand > 0 ? fmtPct((top20Share / grand) * 100) : "—", hint: "of all revenue" },
      ],
      charts: [
        {
          kind: "bar",
          title: "Revenue by product (top 20)",
          xKey: "name",
          series: [{ key: "revenue", label: "Revenue", format: "currency" }],
          data: data.slice(0, 20).map((d) => ({ ...d, name: d.name.length > 14 ? `${d.name.slice(0, 14)}…` : d.name })),
          height: 320,
        },
      ],
      tables: [
        {
          title: "Pareto table",
          columns: [
            { key: "rank", label: "#", align: "right", format: "number" },
            { key: "name", label: "Product" },
            { key: "qty", label: "Qty", align: "right", format: "qty" },
            { key: "revenue", label: "Revenue", align: "right", format: "currency" },
            { key: "cumShare", label: "Cumulative %", align: "right", format: "percent" },
          ],
          rows: data,
        },
      ],
    };
  },
};

const cashierLeaderboard: ReportDef = {
  type: "cashier_leaderboard",
  section: "SALES",
  label: "Cashier race",
  description: "Who's ringing up the most — revenue and orders head to head.",
  hasRange: true,
  filters: [BRANCH_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const rows = await db
      .select({
        name: users.fullName,
        orders: count(),
        revenue: sql<number>`COALESCE(SUM(${sales.grandTotal}), 0)`,
      })
      .from(sales)
      .innerJoin(users, eq(sales.cashierId, users.id))
      .where(inRange(sales.createdAt, range, [branchFilter(sales.branchId, activeBranch, filters), eq(sales.status, "COMPLETED")]))
      .groupBy(sales.cashierId, users.fullName)
      .orderBy(desc(sql`SUM(${sales.grandTotal})`));

    const data = rows.map((r) => ({ name: r.name, revenue: num(r.revenue), orders: r.orders }));

    return {
      kpis: [
        { label: "Leader", value: data[0]?.name ?? "—", hint: data[0] ? fmtNaira(data[0].revenue) : undefined, tone: "gold" },
        { label: "Cashiers", value: fmtInt(data.length) },
      ],
      charts: [
        {
          kind: "bar",
          title: "Revenue & orders by cashier",
          xKey: "name",
          series: [
            { key: "revenue", label: "Revenue", format: "currency" },
            { key: "orders", label: "Orders", format: "number" },
          ],
          data,
          height: 320,
        },
      ],
      tables: [],
    };
  },
};

const basketAnalysis: ReportDef = {
  type: "basket_analysis",
  section: "SALES",
  label: "Basket analysis",
  description: "Items per receipt and average ticket over time — are baskets growing?",
  hasRange: true,
  filters: [BRANCH_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const rows = await db
      .select({
        day: sql<string>`DATE_FORMAT(${sales.createdAt}, '%Y-%m-%d')`.as("day"),
        orders: count(),
        items: sql<number>`COALESCE(SUM(${sales.itemCount}), 0)`.as("items"),
        revenue: sql<number>`COALESCE(SUM(${sales.grandTotal}), 0)`.as("revenue"),
      })
      .from(sales)
      .where(inRange(sales.createdAt, range, [branchFilter(sales.branchId, activeBranch, filters), eq(sales.status, "COMPLETED")]))
      .groupBy(sql`day`)
      .orderBy(sql`day`);

    const data = rows.map((r) => ({
      day: r.day,
      avgItems: r.orders > 0 ? num(r.items) / r.orders : 0,
      avgTicket: r.orders > 0 ? num(r.revenue) / r.orders : 0,
    }));
    const overallItems = data.length > 0 ? data.reduce((s, d) => s + d.avgItems, 0) / data.length : 0;
    const overallTicket = data.length > 0 ? data.reduce((s, d) => s + d.avgTicket, 0) / data.length : 0;

    return {
      kpis: [
        { label: "Avg items / receipt", value: overallItems.toFixed(2), tone: "gold" },
        { label: "Avg ticket", value: fmtNaira(overallTicket) },
      ],
      charts: [
        {
          kind: "line",
          title: "Average items per receipt",
          xKey: "day",
          series: [{ key: "avgItems", label: "Items", format: "number" }],
          data,
        },
        {
          kind: "area",
          title: "Average ticket",
          xKey: "day",
          series: [{ key: "avgTicket", label: "Ticket", format: "currency" }],
          data,
        },
      ],
      tables: [],
    };
  },
};

const branchRace: ReportDef = {
  type: "branch_race",
  section: "SALES",
  label: "Branch comparison",
  description: "Revenue, orders and ticket size across every branch.",
  hasRange: true,
  filters: [],
  run: async ({ db, range }) => {
    const rows = await db
      .select({
        branchId: sales.branchId,
        orders: count(),
        revenue: sql<number>`COALESCE(SUM(${sales.grandTotal}), 0)`,
      })
      .from(sales)
      .where(inRange(sales.createdAt, range, [eq(sales.status, "COMPLETED")]))
      .groupBy(sales.branchId);

    const branchRows = await db.select({ id: branches.id, name: branches.name, isMain: branches.isMain }).from(branches);
    const nameOf = new Map(branchRows.map((b) => [b.id, b.name]));
    const mainName = branchRows.find((b) => b.isMain)?.name ?? "Main";

    const data = rows.map((r) => ({
      branch: r.branchId == null ? mainName : nameOf.get(r.branchId) ?? `Branch ${r.branchId}`,
      orders: r.orders,
      revenue: num(r.revenue),
      avgTicket: r.orders > 0 ? num(r.revenue) / r.orders : 0,
    })).sort((a, b) => b.revenue - a.revenue);

    return {
      kpis: [
        { label: "Branches selling", value: fmtInt(data.length) },
        { label: "Strongest branch", value: data[0]?.branch ?? "—", hint: data[0] ? fmtNaira(data[0].revenue) : undefined, tone: "gold" },
        { label: "Combined revenue", value: fmtNaira(data.reduce((s, d) => s + d.revenue, 0)) },
      ],
      charts: [
        {
          kind: "bar",
          title: "Revenue by branch",
          xKey: "branch",
          series: [{ key: "revenue", label: "Revenue", format: "currency" }],
          data,
          height: 320,
        },
      ],
      tables: [
        {
          title: "Branches",
          columns: [
            { key: "branch", label: "Branch" },
            { key: "orders", label: "Orders", align: "right", format: "number" },
            { key: "revenue", label: "Revenue", align: "right", format: "currency" },
            { key: "avgTicket", label: "Avg ticket", align: "right", format: "currency" },
          ],
          rows: data,
        },
      ],
    };
  },
};

const marginByCategory: ReportDef = {
  type: "margin_by_category",
  section: "SALES",
  label: "Margin map",
  description: "Estimated gross margin per category — which shelves earn their space.",
  hasRange: true,
  filters: [BRANCH_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const rows = await db
      .select({
        name: categories.name,
        revenue: sql<number>`COALESCE(SUM(${saleItems.lineTotal}), 0)`,
        cost: sql<number>`COALESCE(SUM(${saleItems.quantity} * ${saleItems.costPrice}), 0)`,
      })
      .from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .innerJoin(products, eq(saleItems.productId, products.id))
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(inRange(sales.createdAt, range, [branchFilter(sales.branchId, activeBranch, filters), eq(sales.status, "COMPLETED")]))
      .groupBy(categories.name)
      .orderBy(desc(sql`SUM(${saleItems.lineTotal}) - SUM(${saleItems.quantity} * ${saleItems.costPrice})`));

    const data = rows.map((r) => {
      const revenue = num(r.revenue);
      const margin = revenue - num(r.cost);
      return { name: r.name, margin, marginPct: revenue > 0 ? (margin / revenue) * 100 : 0 };
    });

    return {
      kpis: [
        { label: "Best margin category", value: data[0]?.name ?? "—", hint: data[0] ? fmtNaira(data[0].margin) : undefined, tone: "gold" },
        { label: "Total margin", value: fmtNaira(data.reduce((s, d) => s + d.margin, 0)) },
      ],
      charts: [
        {
          kind: "bar",
          title: "Gross margin by category",
          xKey: "name",
          series: [{ key: "margin", label: "Margin", format: "currency" }],
          data,
          height: 320,
        },
      ],
      tables: [
        {
          title: "Margin detail",
          columns: [
            { key: "name", label: "Category" },
            { key: "margin", label: "Margin", align: "right", format: "currency" },
            { key: "marginPct", label: "Margin %", align: "right", format: "percent" },
          ],
          rows: data,
        },
      ],
    };
  },
};

/* =========================== LAUNDRY SECTION ============================ */

const laundryVolume: ReportDef = {
  type: "laundry_volume",
  section: "LAUNDRY",
  label: "Order volume trend",
  description: "Laundry orders per day — is the desk getting busier?",
  hasRange: true,
  filters: [BRANCH_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const rows = await db
      .select({
        day: sql<string>`DATE_FORMAT(${laundryOrders.createdAt}, '%Y-%m-%d')`.as("day"),
        orders: count(),
        express: sql<number>`COALESCE(SUM(CASE WHEN ${laundryOrders.priority} = 'EXPRESS' THEN 1 ELSE 0 END), 0)`.as("express"),
      })
      .from(laundryOrders)
      .where(inRange(laundryOrders.createdAt, range, [branchFilter(laundryOrders.branchId, activeBranch, filters)]))
      .groupBy(sql`day`)
      .orderBy(sql`day`);

    const data = rows.map((r) => ({ day: r.day, orders: r.orders, express: num(r.express) }));
    const total = data.reduce((s, d) => s + d.orders, 0);

    return {
      kpis: [
        { label: "Orders", value: fmtInt(total), tone: "gold" },
        { label: "Average per day", value: data.length > 0 ? (total / data.length).toFixed(1) : "0" },
        { label: "Express share", value: total > 0 ? fmtPct((data.reduce((s, d) => s + d.express, 0) / total) * 100) : "—" },
      ],
      charts: [
        {
          kind: "area",
          title: "Orders per day",
          xKey: "day",
          series: [
            { key: "orders", label: "Orders", format: "number" },
            { key: "express", label: "Express", format: "number" },
          ],
          data,
          height: 320,
        },
      ],
      tables: [],
    };
  },
};

const laundryRevenueCollected: ReportDef = {
  type: "laundry_revenue_collected",
  section: "LAUNDRY",
  label: "Billed vs collected",
  description: "What was invoiced versus what actually landed in the till.",
  hasRange: true,
  filters: [BRANCH_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const scope = branchFilter(laundryOrders.branchId, activeBranch, filters);
    const billedRows = await db
      .select({
        day: sql<string>`DATE_FORMAT(${laundryOrders.createdAt}, '%Y-%m-%d')`.as("day"),
        billed: sql<number>`COALESCE(SUM(CASE WHEN ${laundryOrders.status} != 'CANCELLED' THEN ${laundryOrders.totalAmount} ELSE 0 END), 0)`.as("billed"),
      })
      .from(laundryOrders)
      .where(inRange(laundryOrders.createdAt, range, [scope]))
      .groupBy(sql`day`);

    const paidRows = await db
      .select({
        day: sql<string>`DATE_FORMAT(${laundryOrders.createdAt}, '%Y-%m-%d')`.as("day"),
        collected: sql<number>`COALESCE(SUM(${laundryOrders.amountPaid}), 0)`.as("collected"),
      })
      .from(laundryOrders)
      .where(inRange(laundryOrders.createdAt, range, [scope]))
      .groupBy(sql`day`);

    const collectedByDay = new Map(paidRows.map((r) => [r.day, num(r.collected)]));
    const days = Array.from(new Set([...billedRows.map((r) => r.day), ...paidRows.map((r) => r.day)])).sort();
    const billedByDay = new Map(billedRows.map((r) => [r.day, num(r.billed)]));
    const data = days.map((day) => ({ day, billed: billedByDay.get(day) ?? 0, collected: collectedByDay.get(day) ?? 0 }));

    const billed = data.reduce((s, d) => s + d.billed, 0);
    const collected = data.reduce((s, d) => s + d.collected, 0);

    return {
      kpis: [
        { label: "Billed", value: fmtNaira(billed), tone: "gold" },
        { label: "Collected", value: fmtNaira(collected), tone: "emerald" },
        { label: "Collection rate", value: billed > 0 ? fmtPct((collected / billed) * 100) : "—" },
      ],
      charts: [
        {
          kind: "bar",
          title: "Billed vs collected per day",
          xKey: "day",
          series: [
            { key: "billed", label: "Billed", format: "currency" },
            { key: "collected", label: "Collected", format: "currency" },
          ],
          data,
          height: 320,
        },
      ],
      tables: [],
    };
  },
};

const serviceMix: ReportDef = {
  type: "service_mix",
  section: "LAUNDRY",
  label: "Service mix",
  description: "Wash & iron vs dry-clean vs stain removal — the shape of demand.",
  hasRange: true,
  filters: [BRANCH_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const rows = await db
      .select({
        service: laundryOrderItems.serviceType,
        revenue: sql<number>`COALESCE(SUM(${laundryOrderItems.lineTotal}), 0)`,
      })
      .from(laundryOrderItems)
      .innerJoin(laundryOrders, eq(laundryOrderItems.orderId, laundryOrders.id))
      .where(inRange(laundryOrders.createdAt, range, [branchFilter(laundryOrders.branchId, activeBranch, filters), sql`${laundryOrders.status} != 'CANCELLED'`]))
      .groupBy(laundryOrderItems.serviceType)
      .orderBy(desc(sql`SUM(${laundryOrderItems.lineTotal})`));

    const data = rows.map((r) => ({ name: r.service.replace(/_/g, " "), value: num(r.revenue) }));

    return {
      kpis: [
        { label: "Top service", value: data[0]?.name ?? "—", tone: "gold", hint: data[0] ? fmtNaira(data[0].value) : undefined },
        { label: "Services offered", value: fmtInt(data.length) },
      ],
      charts: [{ kind: "pie", title: "Revenue by service", nameKey: "name", valueKey: "value", valueFormat: "currency", data, height: 320 }],
      tables: [],
    };
  },
};

const garmentMix: ReportDef = {
  type: "garment_mix",
  section: "LAUNDRY",
  label: "Garment mix",
  description: "Which garments flow through the shop most — and earn most.",
  hasRange: true,
  filters: [BRANCH_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const rows = await db
      .select({
        garment: laundryOrderItems.garmentType,
        qty: sql<number>`COALESCE(SUM(${laundryOrderItems.quantity}), 0)`,
        revenue: sql<number>`COALESCE(SUM(${laundryOrderItems.lineTotal}), 0)`,
      })
      .from(laundryOrderItems)
      .innerJoin(laundryOrders, eq(laundryOrderItems.orderId, laundryOrders.id))
      .where(inRange(laundryOrders.createdAt, range, [branchFilter(laundryOrders.branchId, activeBranch, filters), sql`${laundryOrders.status} != 'CANCELLED'`]))
      .groupBy(laundryOrderItems.garmentType)
      .orderBy(desc(sql`SUM(${laundryOrderItems.quantity})`))
      .limit(15);

    const data = rows.map((r) => ({ garment: r.garment, qty: num(r.qty), revenue: num(r.revenue) }));

    return {
      kpis: [
        { label: "Pieces handled", value: fmtQty(data.reduce((s, d) => s + d.qty, 0)), tone: "gold" },
        { label: "Most common", value: data[0]?.garment ?? "—" },
      ],
      charts: [
        {
          kind: "bar",
          title: "Pieces by garment",
          xKey: "garment",
          series: [{ key: "qty", label: "Pieces", format: "qty" }],
          data,
          height: 320,
        },
      ],
      tables: [],
    };
  },
};

const laundryFunnel: ReportDef = {
  type: "laundry_funnel",
  section: "LAUNDRY",
  label: "Workflow funnel",
  description: "Live orders sitting at each stage — where's the bottleneck?",
  hasRange: false,
  filters: [BRANCH_FILTER],
  run: async ({ db, activeBranch, filters }) => {
    const rows = await db
      .select({ status: laundryOrders.status, count: count() })
      .from(laundryOrders)
      .where(branchFilter(laundryOrders.branchId, activeBranch, filters))
      .groupBy(laundryOrders.status);

    const order = ["RECEIVED", "WASHING", "DRYING", "IRONING", "READY", "COLLECTED", "CANCELLED"];
    const byStatus = new Map(rows.map((r) => [r.status, r.count]));
    const data = order.map((s) => ({ stage: s, count: byStatus.get(s as never) ?? 0 }));
    const wip = data.filter((d) => !["COLLECTED", "CANCELLED"].includes(d.stage)).reduce((s, d) => s + d.count, 0);

    return {
      subtitle: "All-time current state of the workflow.",
      kpis: [
        { label: "Work in progress", value: fmtInt(wip), tone: "gold" },
        { label: "Ready for pickup", value: fmtInt(byStatus.get("READY" as never) ?? 0), tone: "emerald" },
        { label: "Collected (all time)", value: fmtInt(byStatus.get("COLLECTED" as never) ?? 0) },
      ],
      charts: [
        {
          kind: "bar",
          title: "Orders by stage",
          xKey: "stage",
          series: [{ key: "count", label: "Orders", format: "number" }],
          data,
          height: 320,
        },
      ],
      tables: [],
    };
  },
};

const expressShare: ReportDef = {
  type: "express_share",
  section: "LAUNDRY",
  label: "Express demand",
  description: "Share of orders marked express — and the premium they carry.",
  hasRange: true,
  filters: [BRANCH_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const rows = await db
      .select({
        day: sql<string>`DATE_FORMAT(${laundryOrders.createdAt}, '%Y-%m-%d')`.as("day"),
        orders: count(),
        express: sql<number>`COALESCE(SUM(CASE WHEN ${laundryOrders.priority} = 'EXPRESS' THEN 1 ELSE 0 END), 0)`.as("express"),
        expressRevenue: sql<number>`COALESCE(SUM(CASE WHEN ${laundryOrders.priority} = 'EXPRESS' THEN ${laundryOrders.totalAmount} ELSE 0 END), 0)`.as("expressRevenue"),
      })
      .from(laundryOrders)
      .where(inRange(laundryOrders.createdAt, range, [branchFilter(laundryOrders.branchId, activeBranch, filters), sql`${laundryOrders.status} != 'CANCELLED'`]))
      .groupBy(sql`day`)
      .orderBy(sql`day`);

    const data = rows.map((r) => ({
      day: r.day,
      expressShare: r.orders > 0 ? (num(r.express) / r.orders) * 100 : 0,
      expressRevenue: num(r.expressRevenue),
    }));
    const totalOrders = rows.reduce((s, r) => s + r.orders, 0);
    const totalExpress = rows.reduce((s, r) => s + num(r.express), 0);

    return {
      kpis: [
        { label: "Express share", value: totalOrders > 0 ? fmtPct((totalExpress / totalOrders) * 100) : "—", tone: "gold" },
        { label: "Express revenue", value: fmtNaira(rows.reduce((s, r) => s + num(r.expressRevenue), 0)) },
      ],
      charts: [
        {
          kind: "area",
          title: "Express share of orders (%)",
          xKey: "day",
          series: [{ key: "expressShare", label: "Express %", format: "percent" }],
          data,
          height: 320,
        },
      ],
      tables: [],
    };
  },
};

/* =========================== TAILORING SECTION ========================== */

const tailoringVolume: ReportDef = {
  type: "tailoring_volume",
  section: "TAILORING",
  label: "Order volume trend",
  description: "Tailoring orders per day — demand for the sewing floor.",
  hasRange: true,
  filters: [BRANCH_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const rows = await db
      .select({
        day: sql<string>`DATE_FORMAT(${tailoringOrders.createdAt}, '%Y-%m-%d')`.as("day"),
        orders: count(),
        billed: sql<number>`COALESCE(SUM(CASE WHEN ${tailoringOrders.status} != 'CANCELLED' THEN ${tailoringOrders.price} ELSE 0 END), 0)`.as("billed"),
      })
      .from(tailoringOrders)
      .where(inRange(tailoringOrders.createdAt, range, [branchFilter(tailoringOrders.branchId, activeBranch, filters)]))
      .groupBy(sql`day`)
      .orderBy(sql`day`);

    const data = rows.map((r) => ({ day: r.day, orders: r.orders, billed: num(r.billed) }));
    const total = data.reduce((s, d) => s + d.orders, 0);

    return {
      kpis: [
        { label: "Orders", value: fmtInt(total), tone: "gold" },
        { label: "Average per day", value: data.length > 0 ? (total / data.length).toFixed(1) : "0" },
        { label: "Billed", value: fmtNaira(data.reduce((s, d) => s + d.billed, 0)) },
      ],
      charts: [
        {
          kind: "area",
          title: "Orders & billing per day",
          xKey: "day",
          series: [
            { key: "orders", label: "Orders", format: "number" },
            { key: "billed", label: "Billed", format: "currency" },
          ],
          data,
          height: 320,
        },
      ],
      tables: [],
    };
  },
};

const tailorLeaderboard: ReportDef = {
  type: "tailor_leaderboard",
  section: "TAILORING",
  label: "Tailor leaderboard",
  description: "Revenue earned and orders delivered per tailor.",
  hasRange: true,
  filters: [BRANCH_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const rows = await db
      .select({
        name: users.fullName,
        orders: count(),
        delivered: sql<number>`COALESCE(SUM(CASE WHEN ${tailoringOrders.status} = 'DELIVERED' THEN 1 ELSE 0 END), 0)`.as("delivered"),
        revenue: sql<number>`COALESCE(SUM(${tailoringOrders.price}), 0)`.as("revenue"),
      })
      .from(tailoringOrders)
      .innerJoin(users, eq(tailoringOrders.tailorId, users.id))
      .where(
        inRange(tailoringOrders.createdAt, range, [
          branchFilter(tailoringOrders.branchId, activeBranch, filters),
          sql`${tailoringOrders.status} != 'CANCELLED'`,
          sql`${tailoringOrders.tailorId} IS NOT NULL`,
        ]),
      )
      .groupBy(tailoringOrders.tailorId, users.fullName)
      .orderBy(desc(sql`SUM(${tailoringOrders.price})`));

    const data = rows.map((r) => ({ name: r.name, orders: r.orders, delivered: num(r.delivered), revenue: num(r.revenue) }));

    return {
      kpis: [
        { label: "Top tailor", value: data[0]?.name ?? "—", hint: data[0] ? fmtNaira(data[0].revenue) : undefined, tone: "gold" },
        { label: "Tailors active", value: fmtInt(data.length) },
      ],
      charts: [
        {
          kind: "bar",
          title: "Revenue by tailor",
          xKey: "name",
          series: [
            { key: "revenue", label: "Revenue", format: "currency" },
            { key: "orders", label: "Orders", format: "number" },
          ],
          data,
          height: 320,
        },
      ],
      tables: [],
    };
  },
};

const tailoringFunnel: ReportDef = {
  type: "tailoring_funnel",
  section: "TAILORING",
  label: "Workflow funnel",
  description: "Live orders at each tailoring stage — find the pile-up.",
  hasRange: false,
  filters: [BRANCH_FILTER],
  run: async ({ db, activeBranch, filters }) => {
    const rows = await db
      .select({ status: tailoringOrders.status, count: count() })
      .from(tailoringOrders)
      .where(branchFilter(tailoringOrders.branchId, activeBranch, filters))
      .groupBy(tailoringOrders.status);

    const order = ["RECEIVED", "CUTTING", "SEWING", "FINISHING", "FITTING", "READY", "DELIVERED", "CANCELLED"];
    const byStatus = new Map(rows.map((r) => [r.status, r.count]));
    const data = order.map((s) => ({ stage: s, count: byStatus.get(s as never) ?? 0 }));
    const wip = data.filter((d) => !["DELIVERED", "CANCELLED"].includes(d.stage)).reduce((s, d) => s + d.count, 0);

    return {
      subtitle: "All-time current state of the workflow.",
      kpis: [
        { label: "Work in progress", value: fmtInt(wip), tone: "gold" },
        { label: "Ready for pickup", value: fmtInt(byStatus.get("READY" as never) ?? 0), tone: "emerald" },
        { label: "Delivered (all time)", value: fmtInt(byStatus.get("DELIVERED" as never) ?? 0) },
      ],
      charts: [
        {
          kind: "bar",
          title: "Orders by stage",
          xKey: "stage",
          series: [{ key: "count", label: "Orders", format: "number" }],
          data,
          height: 320,
        },
      ],
      tables: [],
    };
  },
};

const fabricSourceMix: ReportDef = {
  type: "fabric_source_mix",
  section: "TAILORING",
  label: "Fabric source mix",
  description: "Customer's fabric vs shop stock — how bespoke demand splits.",
  hasRange: true,
  filters: [BRANCH_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const rows = await db
      .select({ source: tailoringOrders.fabricSource, orders: count(), revenue: sql<number>`COALESCE(SUM(${tailoringOrders.price}), 0)` })
      .from(tailoringOrders)
      .where(inRange(tailoringOrders.createdAt, range, [branchFilter(tailoringOrders.branchId, activeBranch, filters), sql`${tailoringOrders.status} != 'CANCELLED'`]))
      .groupBy(tailoringOrders.fabricSource);

    const data = rows.map((r) => ({
      name: r.source === "CUSTOMER_OWN" ? "Customer's fabric" : "Shop stock",
      value: r.orders,
      revenue: num(r.revenue),
    }));

    return {
      kpis: [
        { label: "Orders", value: fmtInt(data.reduce((s, d) => s + d.value, 0)) },
        { label: "Shop-stock orders", value: fmtPct(data.reduce((s, d) => s + d.value, 0) > 0 ? ((data.find((d) => d.name === "Shop stock")?.value ?? 0) / data.reduce((s, d) => s + d.value, 0)) * 100 : 0), tone: "gold" },
      ],
      charts: [{ kind: "pie", title: "Orders by fabric source", nameKey: "name", valueKey: "value", valueFormat: "number", data, height: 320 }],
      tables: [],
    };
  },
};

const productionOutput: ReportDef = {
  type: "production_output",
  section: "TAILORING",
  label: "Production output",
  description: "What the in-house line actually produced in the period.",
  hasRange: true,
  filters: [BRANCH_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const rows = await db
      .select({
        name: products.name,
        qty: sql<number>`COALESCE(SUM(${productionOrders.outputQty}), 0)`,
        runs: count(),
      })
      .from(productionOrders)
      .innerJoin(products, eq(productionOrders.outputProductId, products.id))
      .where(inRange(productionOrders.createdAt, range, [branchFilter(productionOrders.branchId, activeBranch, filters), eq(productionOrders.status, "COMPLETED")]))
      .groupBy(products.name)
      .orderBy(desc(sql`SUM(${productionOrders.outputQty})`));

    const data = rows.map((r) => ({ name: r.name, qty: num(r.qty), runs: r.runs }));

    return {
      kpis: [
        { label: "Units produced", value: fmtQty(data.reduce((s, d) => s + d.qty, 0)), tone: "gold" },
        { label: "Completed runs", value: fmtInt(data.reduce((s, d) => s + d.runs, 0)) },
        { label: "Products made", value: fmtInt(data.length) },
      ],
      charts: [
        {
          kind: "bar",
          title: "Output by product",
          xKey: "name",
          series: [{ key: "qty", label: "Units", format: "qty" }],
          data: data.map((d) => ({ ...d, name: d.name.length > 16 ? `${d.name.slice(0, 16)}…` : d.name })),
          height: 320,
        },
      ],
      tables: [],
    };
  },
};

const deliveryPerformance: ReportDef = {
  type: "delivery_performance",
  section: "TAILORING",
  label: "Delivery performance",
  description: "Turnaround days and on-time rate — are promises being kept?",
  hasRange: true,
  filters: [BRANCH_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const rows = await db
      .select({
        orderNo: tailoringOrders.orderNo,
        createdAt: tailoringOrders.createdAt,
        deliveredAt: tailoringOrders.deliveredAt,
        dueDate: tailoringOrders.dueDate,
      })
      .from(tailoringOrders)
      .where(
        inRange(tailoringOrders.createdAt, range, [
          branchFilter(tailoringOrders.branchId, activeBranch, filters),
          eq(tailoringOrders.status, "DELIVERED"),
          sql`${tailoringOrders.deliveredAt} IS NOT NULL`,
        ]),
      )
      .limit(500);

    const MS_DAY = 24 * 3600 * 1000;
    const enriched = rows.map((r) => {
      const days = r.deliveredAt && r.createdAt ? (r.deliveredAt.getTime() - r.createdAt.getTime()) / MS_DAY : 0;
      const onTime = r.dueDate ? r.deliveredAt!.toISOString().slice(0, 10) <= String(r.dueDate) : null;
      return { orderNo: r.orderNo, days, onTime };
    });

    const avgDays = enriched.length > 0 ? enriched.reduce((s, e) => s + e.days, 0) / enriched.length : 0;
    const withDue = enriched.filter((e) => e.onTime !== null);
    const onTimePct = withDue.length > 0 ? (withDue.filter((e) => e.onTime).length / withDue.length) * 100 : null;

    // Bucket turnaround for a distribution chart.
    const buckets = [
      { bucket: "0–2 days", count: 0 },
      { bucket: "3–5 days", count: 0 },
      { bucket: "6–10 days", count: 0 },
      { bucket: "11+ days", count: 0 },
    ];
    for (const e of enriched) {
      if (e.days <= 2) buckets[0].count += 1;
      else if (e.days <= 5) buckets[1].count += 1;
      else if (e.days <= 10) buckets[2].count += 1;
      else buckets[3].count += 1;
    }

    return {
      kpis: [
        { label: "Delivered orders", value: fmtInt(enriched.length) },
        { label: "Avg turnaround", value: `${avgDays.toFixed(1)} days`, tone: "gold" },
        { label: "On-time rate", value: onTimePct == null ? "—" : fmtPct(onTimePct), hint: onTimePct == null ? "No due dates recorded" : `${withDue.filter((e) => e.onTime).length} of ${withDue.length}` },
      ],
      charts: [
        {
          kind: "bar",
          title: "Turnaround distribution",
          xKey: "bucket",
          series: [{ key: "count", label: "Orders", format: "number" }],
          data: buckets,
          height: 320,
        },
      ],
      tables: [],
    };
  },
};

/* ------------------------------- registry ------------------------------ */

export const ANALYSIS_DEFS: ReportDef[] = [
  // Sales & inventory (10)
  revenueTrend,
  hourlyPattern,
  weekdayPattern,
  paymentMix,
  categoryShare,
  productPareto,
  cashierLeaderboard,
  basketAnalysis,
  branchRace,
  marginByCategory,
  // Laundry (6)
  laundryVolume,
  laundryRevenueCollected,
  serviceMix,
  garmentMix,
  laundryFunnel,
  expressShare,
  // Tailoring (6)
  tailoringVolume,
  tailorLeaderboard,
  tailoringFunnel,
  fabricSourceMix,
  productionOutput,
  deliveryPerformance,
];

export function findAnalysisDef(type: string, section: string): ReportDef | undefined {
  return ANALYSIS_DEFS.find((d) => d.type === type && d.section === section);
}

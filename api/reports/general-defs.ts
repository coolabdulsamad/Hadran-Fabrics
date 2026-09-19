import { and, count, desc, eq, ne, sql, type SQL } from "drizzle-orm";
import {
  branches,
  customers,
  expenses,
  laundryOrders,
  moneyMovements,
  sales,
  tailoringOrders,
  users,
} from "@db/schema";
import {
  EXPENSE_CATEGORIES,
  MONEY_DIRECTIONS,
  MONEY_SOURCE_TYPES,
  ORDER_PAYMENT_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  SECTIONS,
  SECTION_LABELS,
  type Section,
} from "@contracts/constants";
import type { ReportCatalogItem } from "@contracts/reporting";
import {
  BRANCH_FILTER,
  branchFilter,
  fmtInt,
  fmtNaira,
  fmtPct,
  inRange,
  num,
  selectFilter,
  type ReportDef,
  type RunArgs,
} from "./shared";
import { getMainBranchId } from "../services/branch.service";

/**
 * HADRAN FABRICS MALL — general cross-section report & analysis registry
 * (Phase 9). These definitions merge records from ALL business sections
 * (Sales, Laundry, Tailoring) and all branches into unified views: whole-
 * business revenue, money flow, expenses, customers, staff and balances.
 * Access is gated by the `reports.general` permission (Admin and above).
 *
 * Conventions match the section studios:
 *  - "Billed" = COMPLETED sales grand totals + non-cancelled laundry order
 *    totals + non-cancelled tailoring order prices.
 *  - "Collected" = money-ledger IN movements from sale/laundry/tailoring
 *    payments (manual cash injections are reported separately).
 *  - Expenses count ACTIVE rows only, over their expense date.
 */

export type GeneralDef = Omit<ReportDef, "section"> & { section: "GENERAL" };

/* ------------------------------ filter specs ---------------------------- */

const SECTION_FILTER = selectFilter(
  "section",
  "Section",
  SECTIONS.map((s) => ({ value: s, label: SECTION_LABELS[s] })),
  "All sections",
);

const DIRECTION_FILTER = selectFilter("direction", "Direction", MONEY_DIRECTIONS, "In & out");

const METHOD_FILTER = selectFilter(
  "method",
  "Payment method",
  PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] })),
);

const SOURCE_FILTER = selectFilter(
  "source",
  "Money source",
  MONEY_SOURCE_TYPES.map((s) => ({ value: s, label: s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) })),
  "All sources",
);

const BALANCE_STATUS_FILTER = selectFilter(
  "paymentStatus",
  "Payment status",
  ORDER_PAYMENT_STATUSES.filter((s) => s !== "PAID").map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
  "Unpaid & part-paid",
);

/** Filter value helper — returns undefined for empty/"ALL". */
const fv = (filters: Record<string, string>, key: string): string | undefined => {
  const v = filters[key];
  return v && v !== "ALL" && v !== "" ? v : undefined;
};

/** Should a section be included given the section filter? */
const want = (filters: Record<string, string>, section: Section): boolean => {
  const sel = fv(filters, "section");
  return !sel || sel === section;
};

/** WHERE fragment for tables that carry their own section enum column. */
const sectionEq = (column: typeof moneyMovements.section | typeof expenses.section, filters: Record<string, string>): SQL | undefined => {
  const sel = fv(filters, "section");
  return sel ? eq(column, sel as Section) : undefined;
};

/* -------------------------- merged aggregators --------------------------- */

type SectionTotals = Record<Section, number>;

const emptyTotals = (): SectionTotals => ({ SALES: 0, LAUNDRY: 0, TAILORING: 0 });

/** Billed revenue per section for the range (completed / non-cancelled). */
async function billedBySection({ db, activeBranch, filters, range }: RunArgs): Promise<SectionTotals> {
  const out = emptyTotals();
  if (want(filters, "SALES")) {
    const [r] = await db
      .select({ total: sql<number>`COALESCE(SUM(${sales.grandTotal}), 0)` })
      .from(sales)
      .where(inRange(sales.createdAt, range, [branchFilter(sales.branchId, activeBranch, filters), eq(sales.status, "COMPLETED")]));
    out.SALES = num(r?.total);
  }
  if (want(filters, "LAUNDRY")) {
    const [r] = await db
      .select({ total: sql<number>`COALESCE(SUM(${laundryOrders.totalAmount}), 0)` })
      .from(laundryOrders)
      .where(inRange(laundryOrders.createdAt, range, [branchFilter(laundryOrders.branchId, activeBranch, filters), ne(laundryOrders.status, "CANCELLED")]));
    out.LAUNDRY = num(r?.total);
  }
  if (want(filters, "TAILORING")) {
    const [r] = await db
      .select({ total: sql<number>`COALESCE(SUM(${tailoringOrders.price}), 0)` })
      .from(tailoringOrders)
      .where(inRange(tailoringOrders.createdAt, range, [branchFilter(tailoringOrders.branchId, activeBranch, filters), ne(tailoringOrders.status, "CANCELLED")]));
    out.TAILORING = num(r?.total);
  }
  return out;
}

/** Order / receipt counts per section for the range. */
async function ordersBySection({ db, activeBranch, filters, range }: RunArgs): Promise<SectionTotals> {
  const out = emptyTotals();
  if (want(filters, "SALES")) {
    const [r] = await db
      .select({ n: count() })
      .from(sales)
      .where(inRange(sales.createdAt, range, [branchFilter(sales.branchId, activeBranch, filters), eq(sales.status, "COMPLETED")]));
    out.SALES = num(r?.n);
  }
  if (want(filters, "LAUNDRY")) {
    const [r] = await db
      .select({ n: count() })
      .from(laundryOrders)
      .where(inRange(laundryOrders.createdAt, range, [branchFilter(laundryOrders.branchId, activeBranch, filters), ne(laundryOrders.status, "CANCELLED")]));
    out.LAUNDRY = num(r?.n);
  }
  if (want(filters, "TAILORING")) {
    const [r] = await db
      .select({ n: count() })
      .from(tailoringOrders)
      .where(inRange(tailoringOrders.createdAt, range, [branchFilter(tailoringOrders.branchId, activeBranch, filters), ne(tailoringOrders.status, "CANCELLED")]));
    out.TAILORING = num(r?.n);
  }
  return out;
}

/** Money-ledger IN per section from real customer payments only. */
async function collectedBySection({ db, activeBranch, filters, range }: RunArgs): Promise<SectionTotals> {
  const rows = await db
    .select({ section: moneyMovements.section, total: sql<number>`COALESCE(SUM(${moneyMovements.amount}), 0)` })
    .from(moneyMovements)
    .where(
      inRange(moneyMovements.createdAt, range, [
        branchFilter(moneyMovements.branchId, activeBranch, filters),
        eq(moneyMovements.direction, "IN"),
        sql`${moneyMovements.sourceType} IN ('SALE','EXCHANGE_TOPUP','LAUNDRY_PAYMENT','TAILORING_PAYMENT')`,
        sectionEq(moneyMovements.section, filters),
      ]),
    )
    .groupBy(moneyMovements.section);
  const out = emptyTotals();
  for (const r of rows) out[r.section] = num(r.total);
  return out;
}

/** Active expenses per section for the range. */
async function expensesBySection({ db, activeBranch, filters, range }: RunArgs): Promise<SectionTotals> {
  const rows = await db
    .select({ section: expenses.section, total: sql<number>`COALESCE(SUM(${expenses.amount}), 0)` })
    .from(expenses)
    .where(
      inRange(expenses.expenseDate, range, [
        branchFilter(expenses.branchId, activeBranch, filters),
        eq(expenses.status, "ACTIVE"),
        sectionEq(expenses.section, filters),
      ]),
    )
    .groupBy(expenses.section);
  const out = emptyTotals();
  for (const r of rows) out[r.section] = num(r.total);
  return out;
}

/** Billed revenue per calendar day per section — merged in JS. */
async function billedByDay(args: RunArgs): Promise<Map<string, SectionTotals>> {
  const { db, activeBranch, filters, range } = args;
  const byDay = new Map<string, SectionTotals>();
  const bump = (day: string, section: Section, amount: number) => {
    const slot = byDay.get(day) ?? emptyTotals();
    slot[section] += amount;
    byDay.set(day, slot);
  };

  if (want(filters, "SALES")) {
    const rows = await db
      .select({ day: sql<string>`DATE_FORMAT(${sales.createdAt}, '%Y-%m-%d')`.as("day"), total: sql<number>`COALESCE(SUM(${sales.grandTotal}), 0)` })
      .from(sales)
      .where(inRange(sales.createdAt, range, [branchFilter(sales.branchId, activeBranch, filters), eq(sales.status, "COMPLETED")]))
      .groupBy(sql`day`);
    for (const r of rows) bump(r.day, "SALES", num(r.total));
  }
  if (want(filters, "LAUNDRY")) {
    const rows = await db
      .select({ day: sql<string>`DATE_FORMAT(${laundryOrders.createdAt}, '%Y-%m-%d')`.as("day"), total: sql<number>`COALESCE(SUM(${laundryOrders.totalAmount}), 0)` })
      .from(laundryOrders)
      .where(inRange(laundryOrders.createdAt, range, [branchFilter(laundryOrders.branchId, activeBranch, filters), ne(laundryOrders.status, "CANCELLED")]))
      .groupBy(sql`day`);
    for (const r of rows) bump(r.day, "LAUNDRY", num(r.total));
  }
  if (want(filters, "TAILORING")) {
    const rows = await db
      .select({ day: sql<string>`DATE_FORMAT(${tailoringOrders.createdAt}, '%Y-%m-%d')`.as("day"), total: sql<number>`COALESCE(SUM(${tailoringOrders.price}), 0)` })
      .from(tailoringOrders)
      .where(inRange(tailoringOrders.createdAt, range, [branchFilter(tailoringOrders.branchId, activeBranch, filters), ne(tailoringOrders.status, "CANCELLED")]))
      .groupBy(sql`day`);
    for (const r of rows) bump(r.day, "TAILORING", num(r.total));
  }
  return byDay;
}

/** Expenses per calendar day (all sections combined). */
async function expensesByDay({ db, activeBranch, filters, range }: RunArgs): Promise<Map<string, number>> {
  const rows = await db
    .select({ day: sql<string>`DATE_FORMAT(${expenses.expenseDate}, '%Y-%m-%d')`.as("day"), total: sql<number>`COALESCE(SUM(${expenses.amount}), 0)` })
    .from(expenses)
    .where(
      inRange(expenses.expenseDate, range, [
        branchFilter(expenses.branchId, activeBranch, filters),
        eq(expenses.status, "ACTIVE"),
        sectionEq(expenses.section, filters),
      ]),
    )
    .groupBy(sql`day`);
  return new Map(rows.map((r) => [r.day, num(r.total)]));
}

const sumTotals = (t: SectionTotals): number => t.SALES + t.LAUNDRY + t.TAILORING;

/* ============================ GENERAL REPORTS ============================ */

const businessOverview: GeneralDef = {
  type: "general_business_overview",
  section: "GENERAL",
  label: "Business overview",
  description: "The whole mall at a glance — billed revenue, collections, expenses and net position across every section and branch.",
  hasRange: true,
  filters: [BRANCH_FILTER, SECTION_FILTER],
  run: async (args) => {
    const { db, activeBranch, filters, range } = args;
    const [billed, collected, spent, orders] = await Promise.all([
      billedBySection(args),
      collectedBySection(args),
      expensesBySection(args),
      ordersBySection(args),
    ]);

    const totalBilled = sumTotals(billed);
    const totalCollected = sumTotals(collected);
    const totalSpent = sumTotals(spent);
    const totalOrders = sumTotals(orders);
    const net = totalCollected - totalSpent;

    // Manual cash movements shown for transparency.
    const [manual] = await db
      .select({
        manualIn: sql<number>`COALESCE(SUM(CASE WHEN ${moneyMovements.direction} = 'IN' THEN ${moneyMovements.amount} ELSE 0 END), 0)`,
        manualOut: sql<number>`COALESCE(SUM(CASE WHEN ${moneyMovements.direction} = 'OUT' THEN ${moneyMovements.amount} ELSE 0 END), 0)`,
      })
      .from(moneyMovements)
      .where(
        inRange(moneyMovements.createdAt, range, [
          branchFilter(moneyMovements.branchId, activeBranch, filters),
          sql`${moneyMovements.sourceType} IN ('MANUAL_IN','MANUAL_OUT')`,
          sectionEq(moneyMovements.section, filters),
        ]),
      );

    const byDay = await billedByDay(args);
    const expByDay = await expensesByDay(args);
    const days = [...new Set([...byDay.keys(), ...expByDay.keys()])].sort();
    const trend = days.map((day) => {
      const b = byDay.get(day) ?? emptyTotals();
      const e = expByDay.get(day) ?? 0;
      return { day, sales: b.SALES, laundry: b.LAUNDRY, tailoring: b.TAILORING, expenses: e, net: sumTotals(b) - e };
    });

    return {
      subtitle: "Billed = completed sales + active laundry & tailoring orders. Collected = customer payments received.",
      kpis: [
        { label: "Billed revenue", value: fmtNaira(totalBilled), tone: "gold" },
        { label: "Collected", value: fmtNaira(totalCollected), hint: "Customer payments in" },
        { label: "Expenses", value: fmtNaira(totalSpent), tone: totalSpent > 0 ? "red" : "plain" },
        { label: "Net cash", value: fmtNaira(net), tone: net >= 0 ? "emerald" : "red", hint: "Collected − expenses" },
        { label: "Orders & receipts", value: fmtInt(totalOrders) },
        { label: "Collection rate", value: totalBilled > 0 ? fmtPct((totalCollected / totalBilled) * 100) : "—" },
        { label: "Manual in / out", value: `${fmtNaira(num(manual?.manualIn))} / ${fmtNaira(num(manual?.manualOut))}` },
      ],
      charts: [
        {
          kind: "area",
          title: "Daily billed revenue by section",
          xKey: "day",
          series: [
            { key: "sales", label: "Sales", format: "currency" },
            { key: "laundry", label: "Laundry", format: "currency" },
            { key: "tailoring", label: "Tailoring", format: "currency" },
          ],
          data: trend,
        },
        {
          kind: "pie",
          title: "Revenue share by section",
          nameKey: "name",
          valueKey: "value",
          valueFormat: "currency",
          data: SECTIONS.filter((s) => billed[s] > 0).map((s) => ({ name: SECTION_LABELS[s], value: billed[s] })),
        },
      ],
      tables: [
        {
          title: "Section summary",
          columns: [
            { key: "section", label: "Section" },
            { key: "orders", label: "Orders", align: "right", format: "number" },
            { key: "billed", label: "Billed", align: "right", format: "currency" },
            { key: "collected", label: "Collected", align: "right", format: "currency" },
            { key: "expenses", label: "Expenses", align: "right", format: "currency" },
            { key: "net", label: "Net cash", align: "right", format: "currency" },
            { key: "share", label: "Revenue share", align: "right", format: "percent" },
          ],
          rows: SECTIONS.filter((s) => want(filters, s)).map((s) => ({
            section: SECTION_LABELS[s],
            orders: orders[s],
            billed: billed[s],
            collected: collected[s],
            expenses: spent[s],
            net: collected[s] - spent[s],
            share: totalBilled > 0 ? (billed[s] / totalBilled) * 100 : 0,
          })),
        },
        {
          title: "Daily merged totals",
          columns: [
            { key: "day", label: "Day" },
            { key: "sales", label: "Sales", align: "right", format: "currency" },
            { key: "laundry", label: "Laundry", align: "right", format: "currency" },
            { key: "tailoring", label: "Tailoring", align: "right", format: "currency" },
            { key: "expenses", label: "Expenses", align: "right", format: "currency" },
            { key: "net", label: "Net", align: "right", format: "currency" },
          ],
          rows: [...trend].reverse(),
        },
      ],
    };
  },
};

const moneyFlow: GeneralDef = {
  type: "general_money_flow",
  section: "GENERAL",
  label: "Money flow",
  description: "Every naira in and out — the money ledger across all sections: sources, methods and the daily in/out stream.",
  hasRange: true,
  filters: [BRANCH_FILTER, SECTION_FILTER, DIRECTION_FILTER, SOURCE_FILTER, METHOD_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const direction = fv(filters, "direction");
    const source = fv(filters, "source");
    const method = fv(filters, "method");
    const scope = (extra: (SQL | undefined)[] = []) =>
      inRange(moneyMovements.createdAt, range, [
        branchFilter(moneyMovements.branchId, activeBranch, filters),
        sectionEq(moneyMovements.section, filters),
        direction ? eq(moneyMovements.direction, direction as (typeof MONEY_DIRECTIONS)[number]) : undefined,
        source ? eq(moneyMovements.sourceType, source as (typeof MONEY_SOURCE_TYPES)[number]) : undefined,
        method ? eq(moneyMovements.paymentMethod, method as (typeof PAYMENT_METHODS)[number]) : undefined,
        ...extra,
      ]);

    const [totals] = await db
      .select({
        inTotal: sql<number>`COALESCE(SUM(CASE WHEN ${moneyMovements.direction} = 'IN' THEN ${moneyMovements.amount} ELSE 0 END), 0)`,
        outTotal: sql<number>`COALESCE(SUM(CASE WHEN ${moneyMovements.direction} = 'OUT' THEN ${moneyMovements.amount} ELSE 0 END), 0)`,
        movements: count(),
      })
      .from(moneyMovements)
      .where(scope());

    const bySource = await db
      .select({
        source: moneyMovements.sourceType,
        direction: moneyMovements.direction,
        total: sql<number>`COALESCE(SUM(${moneyMovements.amount}), 0)`,
        n: count(),
      })
      .from(moneyMovements)
      .where(scope())
      .groupBy(moneyMovements.sourceType, moneyMovements.direction)
      .orderBy(desc(sql`SUM(${moneyMovements.amount})`));

    const byMethod = await db
      .select({ method: moneyMovements.paymentMethod, total: sql<number>`COALESCE(SUM(${moneyMovements.amount}), 0)`, n: count() })
      .from(moneyMovements)
      .where(scope([eq(moneyMovements.direction, "IN")]))
      .groupBy(moneyMovements.paymentMethod)
      .orderBy(desc(sql`SUM(${moneyMovements.amount})`));

    const daily = await db
      .select({
        day: sql<string>`DATE_FORMAT(${moneyMovements.createdAt}, '%Y-%m-%d')`.as("day"),
        inTotal: sql<number>`COALESCE(SUM(CASE WHEN ${moneyMovements.direction} = 'IN' THEN ${moneyMovements.amount} ELSE 0 END), 0)`,
        outTotal: sql<number>`COALESCE(SUM(CASE WHEN ${moneyMovements.direction} = 'OUT' THEN ${moneyMovements.amount} ELSE 0 END), 0)`,
      })
      .from(moneyMovements)
      .where(scope())
      .groupBy(sql`day`)
      .orderBy(sql`day`);

    const inTotal = num(totals?.inTotal);
    const outTotal = num(totals?.outTotal);
    const label = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

    return {
      subtitle: "Source = what triggered the movement (sale, order payment, expense, manual…).",
      kpis: [
        { label: "Money in", value: fmtNaira(inTotal), tone: "emerald" },
        { label: "Money out", value: fmtNaira(outTotal), tone: "red" },
        { label: "Net flow", value: fmtNaira(inTotal - outTotal), tone: inTotal - outTotal >= 0 ? "gold" : "red" },
        { label: "Movements", value: fmtInt(num(totals?.movements)) },
      ],
      charts: [
        {
          kind: "area",
          title: "Daily in vs out",
          xKey: "day",
          series: [
            { key: "in", label: "Money in", format: "currency" },
            { key: "out", label: "Money out", format: "currency" },
          ],
          data: daily.map((d) => ({ day: d.day, in: num(d.inTotal), out: num(d.outTotal) })),
        },
        {
          kind: "pie",
          title: "Money in by method",
          nameKey: "name",
          valueKey: "value",
          valueFormat: "currency",
          data: byMethod.map((m) => ({ name: PAYMENT_METHOD_LABELS[m.method], value: num(m.total) })),
        },
      ],
      tables: [
        {
          title: "By source",
          columns: [
            { key: "source", label: "Source" },
            { key: "direction", label: "Direction" },
            { key: "n", label: "Movements", align: "right", format: "number" },
            { key: "total", label: "Total", align: "right", format: "currency" },
          ],
          rows: bySource.map((r) => ({ source: label(r.source), direction: r.direction, n: r.n, total: num(r.total) })),
        },
        {
          title: "Money in by payment method",
          columns: [
            { key: "method", label: "Method" },
            { key: "n", label: "Movements", align: "right", format: "number" },
            { key: "total", label: "Total", align: "right", format: "currency" },
            { key: "share", label: "Share", align: "right", format: "percent" },
          ],
          rows: byMethod.map((m) => ({
            method: PAYMENT_METHOD_LABELS[m.method],
            n: m.n,
            total: num(m.total),
            share: inTotal > 0 ? (num(m.total) / inTotal) * 100 : 0,
          })),
        },
      ],
    };
  },
};

const sectionComparison: GeneralDef = {
  type: "general_section_comparison",
  section: "GENERAL",
  label: "Section comparison",
  description: "Sales vs Laundry vs Tailoring — billed, collected, orders, average ticket, expenses and net, side by side.",
  hasRange: true,
  filters: [BRANCH_FILTER],
  run: async (args) => {
    const [billed, collected, spent, orders] = await Promise.all([
      billedBySection(args),
      collectedBySection(args),
      expensesBySection(args),
      ordersBySection(args),
    ]);
    const totalBilled = sumTotals(billed);
    const totalOrders = sumTotals(orders);

    const rows = SECTIONS.map((s) => ({
      section: SECTION_LABELS[s],
      orders: orders[s],
      billed: billed[s],
      collected: collected[s],
      avgTicket: orders[s] > 0 ? billed[s] / orders[s] : 0,
      expenses: spent[s],
      net: collected[s] - spent[s],
      share: totalBilled > 0 ? (billed[s] / totalBilled) * 100 : 0,
    }));

    return {
      kpis: [
        { label: "Top section", value: rows.reduce((a, b) => (b.billed > a.billed ? b : a), rows[0]).section, tone: "gold", hint: totalBilled > 0 ? fmtNaira(Math.max(...rows.map((r) => r.billed))) : undefined },
        { label: "Total billed", value: fmtNaira(totalBilled) },
        { label: "Total orders", value: fmtInt(totalOrders) },
        { label: "Business net cash", value: fmtNaira(sumTotals(collected) - sumTotals(spent)), tone: sumTotals(collected) - sumTotals(spent) >= 0 ? "emerald" : "red" },
      ],
      charts: [
        {
          kind: "bar",
          title: "Billed vs collected vs expenses",
          xKey: "section",
          series: [
            { key: "billed", label: "Billed", format: "currency" },
            { key: "collected", label: "Collected", format: "currency" },
            { key: "expenses", label: "Expenses", format: "currency" },
          ],
          data: rows,
        },
        {
          kind: "pie",
          title: "Order volume share",
          nameKey: "name",
          valueKey: "value",
          valueFormat: "number",
          data: rows.filter((r) => r.orders > 0).map((r) => ({ name: r.section, value: r.orders })),
        },
      ],
      tables: [
        {
          title: "Section scoreboard",
          columns: [
            { key: "section", label: "Section" },
            { key: "orders", label: "Orders", align: "right", format: "number" },
            { key: "billed", label: "Billed", align: "right", format: "currency" },
            { key: "collected", label: "Collected", align: "right", format: "currency" },
            { key: "avgTicket", label: "Avg ticket", align: "right", format: "currency" },
            { key: "expenses", label: "Expenses", align: "right", format: "currency" },
            { key: "net", label: "Net cash", align: "right", format: "currency" },
            { key: "share", label: "Revenue share", align: "right", format: "percent" },
          ],
          rows,
        },
      ],
    };
  },
};

interface BranchBucket {
  name: string;
  orders: number;
  billed: number;
  expenses: number;
}

const branchPerformance: GeneralDef = {
  type: "general_branch_performance",
  section: "GENERAL",
  label: "Branch performance",
  description: "Every branch side by side — revenue by section, orders, expenses and net cash contribution.",
  hasRange: true,
  filters: [],
  run: async ({ db, activeBranch, range }) => {
    // Non-main staff stay pinned to their branch even here.
    const pin = activeBranch && !activeBranch.isMain ? activeBranch.id : null;
    const mainId = (await getMainBranchId()) ?? null;

    const branchRows = await db
      .select({ id: branches.id, name: branches.name, isMain: branches.isMain })
      .from(branches)
      .where(eq(branches.status, "ACTIVE"));
    const buckets = new Map<number, BranchBucket>();
    for (const b of branchRows) {
      if (pin != null && b.id !== pin) continue;
      buckets.set(b.id, { name: b.name, orders: 0, billed: 0, expenses: 0 });
    }
    const keyOf = (branchId: number | null): number => branchId ?? mainId ?? 0;
    const bump = (branchId: number | null, billedAmt: number, ordersAmt: number, expAmt: number) => {
      const b = buckets.get(keyOf(branchId));
      if (!b) return;
      b.billed += billedAmt;
      b.orders += ordersAmt;
      b.expenses += expAmt;
    };

    const salesRows = await db
      .select({ branchId: sales.branchId, total: sql<number>`COALESCE(SUM(${sales.grandTotal}), 0)`, n: count() })
      .from(sales)
      .where(inRange(sales.createdAt, range, [eq(sales.status, "COMPLETED"), pin != null ? eq(sales.branchId, pin) : undefined]))
      .groupBy(sales.branchId);
    for (const r of salesRows) bump(r.branchId, num(r.total), r.n, 0);

    const laundryRows = await db
      .select({ branchId: laundryOrders.branchId, total: sql<number>`COALESCE(SUM(${laundryOrders.totalAmount}), 0)`, n: count() })
      .from(laundryOrders)
      .where(inRange(laundryOrders.createdAt, range, [ne(laundryOrders.status, "CANCELLED"), pin != null ? eq(laundryOrders.branchId, pin) : undefined]))
      .groupBy(laundryOrders.branchId);
    for (const r of laundryRows) bump(r.branchId, num(r.total), r.n, 0);

    const tailoringRows = await db
      .select({ branchId: tailoringOrders.branchId, total: sql<number>`COALESCE(SUM(${tailoringOrders.price}), 0)`, n: count() })
      .from(tailoringOrders)
      .where(inRange(tailoringOrders.createdAt, range, [ne(tailoringOrders.status, "CANCELLED"), pin != null ? eq(tailoringOrders.branchId, pin) : undefined]))
      .groupBy(tailoringOrders.branchId);
    for (const r of tailoringRows) bump(r.branchId, num(r.total), r.n, 0);

    const expenseRows = await db
      .select({ branchId: expenses.branchId, total: sql<number>`COALESCE(SUM(${expenses.amount}), 0)` })
      .from(expenses)
      .where(inRange(expenses.expenseDate, range, [eq(expenses.status, "ACTIVE"), pin != null ? eq(expenses.branchId, pin) : undefined]))
      .groupBy(expenses.branchId);
    for (const r of expenseRows) bump(r.branchId, 0, 0, num(r.total));

    const rows = [...buckets.entries()]
      .map(([, b]) => ({ branch: b.name, orders: b.orders, billed: b.billed, expenses: b.expenses, net: b.billed - b.expenses, avgTicket: b.orders > 0 ? b.billed / b.orders : 0 }))
      .sort((a, b) => b.billed - a.billed);
    const totalBilled = rows.reduce((s, r) => s + r.billed, 0);

    return {
      subtitle: "Net = billed revenue − expenses booked at the branch.",
      kpis: [
        { label: "Branches", value: fmtInt(rows.length) },
        { label: "Best branch", value: rows[0]?.branch ?? "—", tone: "gold", hint: rows[0] ? fmtNaira(rows[0].billed) : undefined },
        { label: "Total billed", value: fmtNaira(totalBilled) },
        { label: "Total net", value: fmtNaira(rows.reduce((s, r) => s + r.net, 0)), tone: "emerald" },
      ],
      charts: [
        {
          kind: "bar",
          title: "Billed revenue vs expenses by branch",
          xKey: "branch",
          series: [
            { key: "billed", label: "Billed", format: "currency" },
            { key: "expenses", label: "Expenses", format: "currency" },
          ],
          data: rows,
        },
        {
          kind: "pie",
          title: "Revenue share by branch",
          nameKey: "name",
          valueKey: "value",
          valueFormat: "currency",
          data: rows.filter((r) => r.billed > 0).map((r) => ({ name: r.branch, value: r.billed })),
        },
      ],
      tables: [
        {
          title: "Branch scoreboard",
          columns: [
            { key: "branch", label: "Branch" },
            { key: "orders", label: "Orders", align: "right", format: "number" },
            { key: "billed", label: "Billed", align: "right", format: "currency" },
            { key: "avgTicket", label: "Avg ticket", align: "right", format: "currency" },
            { key: "expenses", label: "Expenses", align: "right", format: "currency" },
            { key: "net", label: "Net", align: "right", format: "currency" },
            { key: "share", label: "Revenue share", align: "right", format: "percent" },
          ],
          rows: rows.map((r) => ({ ...r, share: totalBilled > 0 ? (r.billed / totalBilled) * 100 : 0 })),
        },
      ],
    };
  },
};

const expenseAnalysis: GeneralDef = {
  type: "general_expense_analysis",
  section: "GENERAL",
  label: "Expense analysis",
  description: "All expenses across every section and branch — by category, section, branch and in full detail.",
  hasRange: true,
  filters: [BRANCH_FILTER, SECTION_FILTER, selectFilter("category", "Category", EXPENSE_CATEGORIES)],
  run: async ({ db, activeBranch, filters, range }) => {
    const category = fv(filters, "category");
    const where = inRange(expenses.expenseDate, range, [
      branchFilter(expenses.branchId, activeBranch, filters),
      sectionEq(expenses.section, filters),
      eq(expenses.status, "ACTIVE"),
      category ? eq(expenses.category, category as (typeof EXPENSE_CATEGORIES)[number]) : undefined,
    ]);

    const [byCat, bySection, byBranch, recent] = await Promise.all([
      db
        .select({ category: expenses.category, total: sql<number>`COALESCE(SUM(${expenses.amount}), 0)`, n: count() })
        .from(expenses)
        .where(where)
        .groupBy(expenses.category)
        .orderBy(desc(sql`SUM(${expenses.amount})`)),
      db
        .select({ section: expenses.section, total: sql<number>`COALESCE(SUM(${expenses.amount}), 0)`, n: count() })
        .from(expenses)
        .where(where)
        .groupBy(expenses.section),
      db
        .select({ branchId: expenses.branchId, name: branches.name, total: sql<number>`COALESCE(SUM(${expenses.amount}), 0)`, n: count() })
        .from(expenses)
        .leftJoin(branches, eq(expenses.branchId, branches.id))
        .where(where)
        .groupBy(expenses.branchId, branches.name)
        .orderBy(desc(sql`SUM(${expenses.amount})`)),
      db
        .select({
          refNo: expenses.refNo,
          date: expenses.expenseDate,
          section: expenses.section,
          category: expenses.category,
          description: expenses.description,
          amount: expenses.amount,
          method: expenses.paymentMethod,
          branchName: branches.name,
        })
        .from(expenses)
        .leftJoin(branches, eq(expenses.branchId, branches.id))
        .where(where)
        .orderBy(desc(expenses.expenseDate))
        .limit(200),
    ]);

    const total = byCat.reduce((s, c) => s + num(c.total), 0);
    const entries = byCat.reduce((s, c) => s + c.n, 0);

    return {
      kpis: [
        { label: "Total spend", value: fmtNaira(total), tone: "red" },
        { label: "Entries", value: fmtInt(entries) },
        { label: "Average entry", value: fmtNaira(entries > 0 ? total / entries : 0) },
        { label: "Largest category", value: byCat[0]?.category.replace(/_/g, " ") ?? "—", hint: byCat[0] ? fmtNaira(num(byCat[0].total)) : undefined },
      ],
      charts: [
        {
          kind: "pie",
          title: "Spend by category",
          nameKey: "name",
          valueKey: "value",
          valueFormat: "currency",
          data: byCat.map((c) => ({ name: c.category.replace(/_/g, " "), value: num(c.total) })),
        },
        {
          kind: "bar",
          title: "Spend by section",
          xKey: "name",
          series: [{ key: "total", label: "Spend", format: "currency" }],
          data: bySection.map((s) => ({ name: SECTION_LABELS[s.section], total: num(s.total) })),
        },
      ],
      tables: [
        {
          title: "By branch",
          columns: [
            { key: "branch", label: "Branch" },
            { key: "n", label: "Entries", align: "right", format: "number" },
            { key: "total", label: "Total", align: "right", format: "currency" },
            { key: "share", label: "Share", align: "right", format: "percent" },
          ],
          rows: byBranch.map((b) => ({
            branch: b.name ?? "Main",
            n: b.n,
            total: num(b.total),
            share: total > 0 ? (num(b.total) / total) * 100 : 0,
          })),
        },
        {
          title: "Recent expense entries",
          columns: [
            { key: "refNo", label: "Ref" },
            { key: "date", label: "Date", format: "date" },
            { key: "section", label: "Section" },
            { key: "category", label: "Category" },
            { key: "description", label: "Description" },
            { key: "branch", label: "Branch" },
            { key: "amount", label: "Amount", align: "right", format: "currency" },
            { key: "method", label: "Paid via" },
          ],
          rows: recent.map((r) => ({
            refNo: r.refNo,
            date: typeof r.date === "string" ? r.date : String(r.date),
            section: SECTION_LABELS[r.section],
            category: r.category.replace(/_/g, " "),
            description: r.description,
            branch: r.branchName ?? "Main",
            amount: num(r.amount),
            method: PAYMENT_METHOD_LABELS[r.method],
          })),
        },
      ],
    };
  },
};

const paymentMethods: GeneralDef = {
  type: "general_payment_methods",
  section: "GENERAL",
  label: "Payment methods",
  description: "How customers actually pay across the whole business — cash vs POS vs transfer, per section.",
  hasRange: true,
  filters: [BRANCH_FILTER, SECTION_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const rows = await db
      .select({
        method: moneyMovements.paymentMethod,
        section: moneyMovements.section,
        total: sql<number>`COALESCE(SUM(${moneyMovements.amount}), 0)`,
        n: count(),
      })
      .from(moneyMovements)
      .where(
        inRange(moneyMovements.createdAt, range, [
          branchFilter(moneyMovements.branchId, activeBranch, filters),
          sectionEq(moneyMovements.section, filters),
          eq(moneyMovements.direction, "IN"),
          sql`${moneyMovements.sourceType} IN ('SALE','EXCHANGE_TOPUP','LAUNDRY_PAYMENT','TAILORING_PAYMENT')`,
        ]),
      )
      .groupBy(moneyMovements.paymentMethod, moneyMovements.section)
      .orderBy(desc(sql`SUM(${moneyMovements.amount})`));

    const grand = rows.reduce((s, r) => s + num(r.total), 0);
    const byMethod = new Map<string, { total: number; n: number; sections: SectionTotals }>();
    for (const r of rows) {
      const slot = byMethod.get(r.method) ?? { total: 0, n: 0, sections: emptyTotals() };
      slot.total += num(r.total);
      slot.n += r.n;
      slot.sections[r.section] += num(r.total);
      byMethod.set(r.method, slot);
    }
    const table = [...byMethod.entries()].map(([method, v]) => ({
      method: PAYMENT_METHOD_LABELS[method as (typeof PAYMENT_METHODS)[number]],
      sales: v.sections.SALES,
      laundry: v.sections.LAUNDRY,
      tailoring: v.sections.TAILORING,
      n: v.n,
      total: v.total,
      share: grand > 0 ? (v.total / grand) * 100 : 0,
    }));

    return {
      subtitle: "Customer payments only (sales, order payments, top-ups) — manual entries excluded.",
      kpis: [
        { label: "Total collected", value: fmtNaira(grand), tone: "gold" },
        { label: "Dominant method", value: table[0]?.method ?? "—", hint: table[0] ? fmtPct(table[0].share) : undefined },
        { label: "Cash share", value: grand > 0 ? fmtPct(((byMethod.get("CASH")?.total ?? 0) / grand) * 100) : "—" },
        { label: "Transactions", value: fmtInt(rows.reduce((s, r) => s + r.n, 0)) },
      ],
      charts: [
        {
          kind: "pie",
          title: "Collection share by method",
          nameKey: "name",
          valueKey: "value",
          valueFormat: "currency",
          data: table.map((t) => ({ name: t.method, value: t.total })),
        },
        {
          kind: "bar",
          title: "Method usage by section",
          xKey: "method",
          series: [
            { key: "sales", label: "Sales", format: "currency" },
            { key: "laundry", label: "Laundry", format: "currency" },
            { key: "tailoring", label: "Tailoring", format: "currency" },
          ],
          data: table,
        },
      ],
      tables: [
        {
          title: "Method breakdown",
          columns: [
            { key: "method", label: "Method" },
            { key: "sales", label: "Sales", align: "right", format: "currency" },
            { key: "laundry", label: "Laundry", align: "right", format: "currency" },
            { key: "tailoring", label: "Tailoring", align: "right", format: "currency" },
            { key: "n", label: "Transactions", align: "right", format: "number" },
            { key: "total", label: "Total", align: "right", format: "currency" },
            { key: "share", label: "Share", align: "right", format: "percent" },
          ],
          rows: table,
        },
      ],
    };
  },
};

const dailyTrend: GeneralDef = {
  type: "general_daily_trend",
  section: "GENERAL",
  label: "Daily business trend",
  description: "Day-by-day merged totals for the entire mall — sales, laundry, tailoring, expenses and net, in one stream.",
  hasRange: true,
  filters: [BRANCH_FILTER, SECTION_FILTER],
  run: async (args) => {
    const byDay = await billedByDay(args);
    const expByDay = await expensesByDay(args);
    const days = [...new Set([...byDay.keys(), ...expByDay.keys()])].sort();
    const trend = days.map((day) => {
      const b = byDay.get(day) ?? emptyTotals();
      const e = expByDay.get(day) ?? 0;
      return { day, sales: b.SALES, laundry: b.LAUNDRY, tailoring: b.TAILORING, billed: sumTotals(b), expenses: e, net: sumTotals(b) - e };
    });

    const totalBilled = trend.reduce((s, t) => s + t.billed, 0);
    const totalExp = trend.reduce((s, t) => s + t.expenses, 0);
    const best = trend.reduce((a, b) => (b.billed > (a?.billed ?? -1) ? b : a), trend[0]);

    return {
      kpis: [
        { label: "Active days", value: fmtInt(trend.length) },
        { label: "Total billed", value: fmtNaira(totalBilled), tone: "gold" },
        { label: "Average day", value: fmtNaira(trend.length > 0 ? totalBilled / trend.length : 0) },
        { label: "Best day", value: best?.day ?? "—", hint: best ? fmtNaira(best.billed) : undefined },
        { label: "Net over period", value: fmtNaira(totalBilled - totalExp), tone: totalBilled - totalExp >= 0 ? "emerald" : "red" },
      ],
      charts: [
        {
          kind: "area",
          title: "Billed vs expenses vs net",
          xKey: "day",
          series: [
            { key: "billed", label: "Billed", format: "currency" },
            { key: "expenses", label: "Expenses", format: "currency" },
            { key: "net", label: "Net", format: "currency" },
          ],
          data: trend,
        },
        {
          kind: "bar",
          title: "Daily section split",
          xKey: "day",
          series: [
            { key: "sales", label: "Sales", format: "currency" },
            { key: "laundry", label: "Laundry", format: "currency" },
            { key: "tailoring", label: "Tailoring", format: "currency" },
          ],
          data: trend,
        },
      ],
      tables: [
        {
          title: "Daily merged totals",
          columns: [
            { key: "day", label: "Day" },
            { key: "sales", label: "Sales", align: "right", format: "currency" },
            { key: "laundry", label: "Laundry", align: "right", format: "currency" },
            { key: "tailoring", label: "Tailoring", align: "right", format: "currency" },
            { key: "billed", label: "Billed", align: "right", format: "currency" },
            { key: "expenses", label: "Expenses", align: "right", format: "currency" },
            { key: "net", label: "Net", align: "right", format: "currency" },
          ],
          rows: [...trend].reverse(),
        },
      ],
    };
  },
};

const normName = (s: string | null | undefined): string => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

const topCustomers: GeneralDef = {
  type: "general_top_customers",
  section: "GENERAL",
  label: "Top customers (all sections)",
  description: "Your best customers across shop, laundry and tailoring combined — one merged ranking.",
  hasRange: true,
  filters: [BRANCH_FILTER, SECTION_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    interface Cust { name: string; sales: number; laundry: number; tailoring: number; orders: number }
    const map = new Map<string, Cust>();
    const bump = (name: string, section: Section, amount: number) => {
      const key = normName(name);
      if (!key) return;
      const c = map.get(key) ?? { name: name.trim(), sales: 0, laundry: 0, tailoring: 0, orders: 0 };
      c[section === "SALES" ? "sales" : section === "LAUNDRY" ? "laundry" : "tailoring"] += amount;
      c.orders += 1;
      map.set(key, c);
    };

    if (want(filters, "SALES")) {
      const rows = await db
        .select({ name: customers.fullName, total: sql<number>`COALESCE(SUM(${sales.grandTotal}), 0)`, n: count() })
        .from(sales)
        .innerJoin(customers, eq(sales.customerId, customers.id))
        .where(inRange(sales.createdAt, range, [branchFilter(sales.branchId, activeBranch, filters), eq(sales.status, "COMPLETED")]))
        .groupBy(sales.customerId, customers.fullName);
      for (const r of rows) {
        const key = normName(r.name);
        const c = map.get(key) ?? { name: r.name.trim(), sales: 0, laundry: 0, tailoring: 0, orders: 0 };
        c.sales += num(r.total);
        c.orders += r.n;
        map.set(key, c);
      }
    }
    if (want(filters, "LAUNDRY")) {
      const rows = await db
        .select({ name: laundryOrders.customerName, total: sql<number>`COALESCE(SUM(${laundryOrders.totalAmount}), 0)`, n: count() })
        .from(laundryOrders)
        .where(inRange(laundryOrders.createdAt, range, [branchFilter(laundryOrders.branchId, activeBranch, filters), ne(laundryOrders.status, "CANCELLED")]))
        .groupBy(laundryOrders.customerName);
      for (const r of rows) bump(r.name, "LAUNDRY", num(r.total));
      // order counts: bump() adds 1 per row; add the remainder
      for (const r of rows) {
        const c = map.get(normName(r.name));
        if (c) c.orders += r.n - 1;
      }
    }
    if (want(filters, "TAILORING")) {
      const rows = await db
        .select({ name: tailoringOrders.customerName, total: sql<number>`COALESCE(SUM(${tailoringOrders.price}), 0)`, n: count() })
        .from(tailoringOrders)
        .where(inRange(tailoringOrders.createdAt, range, [branchFilter(tailoringOrders.branchId, activeBranch, filters), ne(tailoringOrders.status, "CANCELLED")]))
        .groupBy(tailoringOrders.customerName);
      for (const r of rows) bump(r.name, "TAILORING", num(r.total));
      for (const r of rows) {
        const c = map.get(normName(r.name));
        if (c) c.orders += r.n - 1;
      }
    }

    const ranked = [...map.values()]
      .map((c) => ({ ...c, total: c.sales + c.laundry + c.tailoring }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);

    return {
      subtitle: "Customers matched by name across sections; walk-in sales without a customer record are excluded.",
      kpis: [
        { label: "Customers found", value: fmtInt(map.size) },
        { label: "Top customer", value: ranked[0]?.name ?? "—", tone: "gold", hint: ranked[0] ? fmtNaira(ranked[0].total) : undefined },
        { label: "Top-20 revenue", value: fmtNaira(ranked.reduce((s, r) => s + r.total, 0)) },
        { label: "Cross-section customers", value: fmtInt(ranked.filter((r) => [r.sales, r.laundry, r.tailoring].filter((v) => v > 0).length > 1).length), hint: "Spend in 2+ sections (top 20)" },
      ],
      charts: [
        {
          kind: "bar",
          title: "Top 10 customers by total spend",
          xKey: "name",
          series: [
            { key: "sales", label: "Sales", format: "currency" },
            { key: "laundry", label: "Laundry", format: "currency" },
            { key: "tailoring", label: "Tailoring", format: "currency" },
          ],
          data: ranked.slice(0, 10),
        },
      ],
      tables: [
        {
          title: "Customer ranking",
          columns: [
            { key: "name", label: "Customer" },
            { key: "sales", label: "Shop", align: "right", format: "currency" },
            { key: "laundry", label: "Laundry", align: "right", format: "currency" },
            { key: "tailoring", label: "Tailoring", align: "right", format: "currency" },
            { key: "orders", label: "Orders", align: "right", format: "number" },
            { key: "total", label: "Total", align: "right", format: "currency" },
          ],
          rows: ranked,
        },
      ],
    };
  },
};

const staffPerformance: GeneralDef = {
  type: "general_staff_performance",
  section: "GENERAL",
  label: "Staff performance",
  description: "Who handles the money — sales rung up, laundry and tailoring orders received, per staff member, all sections merged.",
  hasRange: true,
  filters: [BRANCH_FILTER, SECTION_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    interface Staff { name: string; salesRev: number; salesOrders: number; laundryRev: number; laundryOrders: number; tailoringRev: number; tailoringOrders: number }
    const map = new Map<number, Staff>();
    const slot = (id: number, name: string): Staff => {
      const s = map.get(id) ?? { name, salesRev: 0, salesOrders: 0, laundryRev: 0, laundryOrders: 0, tailoringRev: 0, tailoringOrders: 0 };
      map.set(id, s);
      return s;
    };

    if (want(filters, "SALES")) {
      const rows = await db
        .select({ id: sales.cashierId, name: users.fullName, total: sql<number>`COALESCE(SUM(${sales.grandTotal}), 0)`, n: count() })
        .from(sales)
        .innerJoin(users, eq(sales.cashierId, users.id))
        .where(inRange(sales.createdAt, range, [branchFilter(sales.branchId, activeBranch, filters), eq(sales.status, "COMPLETED")]))
        .groupBy(sales.cashierId, users.fullName);
      for (const r of rows) {
        const s = slot(r.id, r.name);
        s.salesRev += num(r.total);
        s.salesOrders += r.n;
      }
    }
    if (want(filters, "LAUNDRY")) {
      const rows = await db
        .select({ id: laundryOrders.receivedBy, name: users.fullName, total: sql<number>`COALESCE(SUM(${laundryOrders.totalAmount}), 0)`, n: count() })
        .from(laundryOrders)
        .innerJoin(users, eq(laundryOrders.receivedBy, users.id))
        .where(inRange(laundryOrders.createdAt, range, [branchFilter(laundryOrders.branchId, activeBranch, filters), ne(laundryOrders.status, "CANCELLED")]))
        .groupBy(laundryOrders.receivedBy, users.fullName);
      for (const r of rows) {
        const s = slot(r.id, r.name);
        s.laundryRev += num(r.total);
        s.laundryOrders += r.n;
      }
    }
    if (want(filters, "TAILORING")) {
      const rows = await db
        .select({ id: tailoringOrders.receivedBy, name: users.fullName, total: sql<number>`COALESCE(SUM(${tailoringOrders.price}), 0)`, n: count() })
        .from(tailoringOrders)
        .innerJoin(users, eq(tailoringOrders.receivedBy, users.id))
        .where(inRange(tailoringOrders.createdAt, range, [branchFilter(tailoringOrders.branchId, activeBranch, filters), ne(tailoringOrders.status, "CANCELLED")]))
        .groupBy(tailoringOrders.receivedBy, users.fullName);
      for (const r of rows) {
        const s = slot(r.id, r.name);
        s.tailoringRev += num(r.total);
        s.tailoringOrders += r.n;
      }
    }

    const ranked = [...map.values()]
      .map((s) => ({ ...s, totalRev: s.salesRev + s.laundryRev + s.tailoringRev, totalOrders: s.salesOrders + s.laundryOrders + s.tailoringOrders }))
      .sort((a, b) => b.totalRev - a.totalRev);

    return {
      subtitle: "Revenue attributed to the cashier / receiving staff member.",
      kpis: [
        { label: "Active staff", value: fmtInt(ranked.length) },
        { label: "Top performer", value: ranked[0]?.name ?? "—", tone: "gold", hint: ranked[0] ? fmtNaira(ranked[0].totalRev) : undefined },
        { label: "Total handled", value: fmtNaira(ranked.reduce((s, r) => s + r.totalRev, 0)) },
        { label: "Total orders handled", value: fmtInt(ranked.reduce((s, r) => s + r.totalOrders, 0)) },
      ],
      charts: [
        {
          kind: "bar",
          title: "Revenue handled per staff member",
          xKey: "name",
          series: [
            { key: "salesRev", label: "Sales", format: "currency" },
            { key: "laundryRev", label: "Laundry", format: "currency" },
            { key: "tailoringRev", label: "Tailoring", format: "currency" },
          ],
          data: ranked.slice(0, 12),
        },
      ],
      tables: [
        {
          title: "Staff scoreboard",
          columns: [
            { key: "name", label: "Staff" },
            { key: "salesOrders", label: "Receipts", align: "right", format: "number" },
            { key: "salesRev", label: "Sales ₦", align: "right", format: "currency" },
            { key: "laundryOrders", label: "Laundry orders", align: "right", format: "number" },
            { key: "laundryRev", label: "Laundry ₦", align: "right", format: "currency" },
            { key: "tailoringOrders", label: "Tailoring orders", align: "right", format: "number" },
            { key: "tailoringRev", label: "Tailoring ₦", align: "right", format: "currency" },
            { key: "totalRev", label: "Total", align: "right", format: "currency" },
          ],
          rows: ranked,
        },
      ],
    };
  },
};

const outstandingBalances: GeneralDef = {
  type: "general_outstanding_balances",
  section: "GENERAL",
  label: "Outstanding balances",
  description: "Every unpaid or part-paid laundry and tailoring order across all branches — who owes what, and since when.",
  hasRange: true,
  filters: [BRANCH_FILTER, SECTION_FILTER, BALANCE_STATUS_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const payStatus = fv(filters, "paymentStatus");

    type Row = { ref: string; section: string; customer: string; total: number; paid: number; balance: number; due: string | null; branch: string; created: string };
    const rows: Row[] = [];

    if (want(filters, "LAUNDRY")) {
      const r = await db
        .select({
          ref: laundryOrders.orderNo,
          customer: laundryOrders.customerName,
          total: laundryOrders.totalAmount,
          paid: laundryOrders.amountPaid,
          due: laundryOrders.dueDate,
          created: laundryOrders.createdAt,
          branchName: branches.name,
          paymentStatus: laundryOrders.paymentStatus,
        })
        .from(laundryOrders)
        .leftJoin(branches, eq(laundryOrders.branchId, branches.id))
        .where(
          and(
            inRange(laundryOrders.createdAt, range, [branchFilter(laundryOrders.branchId, activeBranch, filters), ne(laundryOrders.status, "CANCELLED")]),
            payStatus ? eq(laundryOrders.paymentStatus, payStatus as "UNPAID" | "PART_PAID") : sql`${laundryOrders.paymentStatus} IN ('UNPAID','PART_PAID')`,
          ),
        )
        .orderBy(desc(laundryOrders.createdAt))
        .limit(300);
      for (const x of r) {
        rows.push({
          ref: x.ref,
          section: "Laundry",
          customer: x.customer,
          total: num(x.total),
          paid: num(x.paid),
          balance: num(x.total) - num(x.paid),
          due: x.due ? (x.due instanceof Date ? x.due.toISOString().slice(0, 10) : String(x.due)) : null,
          branch: x.branchName ?? "Main",
          created: x.created.toISOString(),
        });
      }
    }
    if (want(filters, "TAILORING")) {
      const r = await db
        .select({
          ref: tailoringOrders.orderNo,
          customer: tailoringOrders.customerName,
          total: tailoringOrders.price,
          paid: tailoringOrders.amountPaid,
          due: tailoringOrders.dueDate,
          created: tailoringOrders.createdAt,
          branchName: branches.name,
          paymentStatus: tailoringOrders.paymentStatus,
        })
        .from(tailoringOrders)
        .leftJoin(branches, eq(tailoringOrders.branchId, branches.id))
        .where(
          and(
            inRange(tailoringOrders.createdAt, range, [branchFilter(tailoringOrders.branchId, activeBranch, filters), ne(tailoringOrders.status, "CANCELLED")]),
            payStatus ? eq(tailoringOrders.paymentStatus, payStatus as "UNPAID" | "PART_PAID") : sql`${tailoringOrders.paymentStatus} IN ('UNPAID','PART_PAID')`,
          ),
        )
        .orderBy(desc(tailoringOrders.createdAt))
        .limit(300);
      for (const x of r) {
        rows.push({
          ref: x.ref,
          section: "Tailoring",
          customer: x.customer,
          total: num(x.total),
          paid: num(x.paid),
          balance: num(x.total) - num(x.paid),
          due: x.due ? (x.due instanceof Date ? x.due.toISOString().slice(0, 10) : String(x.due)) : null,
          branch: x.branchName ?? "Main",
          created: x.created.toISOString(),
        });
      }
    }

    rows.sort((a, b) => b.balance - a.balance);
    const totalBalance = rows.reduce((s, r) => s + r.balance, 0);
    const overdue = rows.filter((r) => r.due && r.due < new Date().toISOString().slice(0, 10));

    return {
      subtitle: "Sales receipts are settled at the till, so open balances come from laundry & tailoring orders.",
      kpis: [
        { label: "Outstanding", value: fmtNaira(totalBalance), tone: "red" },
        { label: "Open orders", value: fmtInt(rows.length) },
        { label: "Overdue", value: fmtInt(overdue.length), hint: overdue.length > 0 ? fmtNaira(overdue.reduce((s, r) => s + r.balance, 0)) : "Past due date" },
        { label: "Largest balance", value: rows[0] ? fmtNaira(rows[0].balance) : "—", hint: rows[0]?.customer },
      ],
      charts: [
        {
          kind: "bar",
          title: "Largest open balances",
          xKey: "customer",
          series: [{ key: "balance", label: "Balance", format: "currency" }],
          data: rows.slice(0, 10).map((r) => ({ customer: r.customer, balance: r.balance })),
        },
        {
          kind: "pie",
          title: "Outstanding by section",
          nameKey: "name",
          valueKey: "value",
          valueFormat: "currency",
          data: ["Laundry", "Tailoring"]
            .map((s) => ({ name: s, value: rows.filter((r) => r.section === s).reduce((t, r) => t + r.balance, 0) }))
            .filter((d) => d.value > 0),
        },
      ],
      tables: [
        {
          title: "Open balances",
          columns: [
            { key: "ref", label: "Ref" },
            { key: "section", label: "Section" },
            { key: "customer", label: "Customer" },
            { key: "branch", label: "Branch" },
            { key: "total", label: "Total", align: "right", format: "currency" },
            { key: "paid", label: "Paid", align: "right", format: "currency" },
            { key: "balance", label: "Balance", align: "right", format: "currency" },
            { key: "due", label: "Due", format: "date" },
            { key: "created", label: "Created", format: "date" },
          ],
          rows: rows.slice(0, 300),
        },
      ],
    };
  },
};

const taxAndDiscounts: GeneralDef = {
  type: "general_tax_discounts",
  section: "GENERAL",
  label: "VAT & discounts",
  description: "VAT collected, service charges and every discount given across the business.",
  hasRange: true,
  filters: [BRANCH_FILTER, SECTION_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    let vat = 0, service = 0, salesDisc = 0, laundryDisc = 0;

    if (want(filters, "SALES")) {
      const [r] = await db
        .select({
          vat: sql<number>`COALESCE(SUM(${sales.taxTotal}), 0)`,
          service: sql<number>`COALESCE(SUM(${sales.serviceCharge}), 0)`,
          disc: sql<number>`COALESCE(SUM(${sales.discountTotal}), 0)`,
        })
        .from(sales)
        .where(inRange(sales.createdAt, range, [branchFilter(sales.branchId, activeBranch, filters), eq(sales.status, "COMPLETED")]));
      vat = num(r?.vat);
      service = num(r?.service);
      salesDisc = num(r?.disc);
    }
    if (want(filters, "LAUNDRY")) {
      const [r] = await db
        .select({ disc: sql<number>`COALESCE(SUM(${laundryOrders.discountAmount}), 0)` })
        .from(laundryOrders)
        .where(inRange(laundryOrders.createdAt, range, [branchFilter(laundryOrders.branchId, activeBranch, filters), ne(laundryOrders.status, "CANCELLED")]));
      laundryDisc = num(r?.disc);
    }

    const totalDisc = salesDisc + laundryDisc;
    return {
      subtitle: "VAT and service charges are levied at the sales till; laundry orders carry their own discounts.",
      kpis: [
        { label: "VAT collected", value: fmtNaira(vat), tone: "gold" },
        { label: "Service charges", value: fmtNaira(service) },
        { label: "Discounts given", value: fmtNaira(totalDisc), tone: totalDisc > 0 ? "red" : "plain" },
        { label: "Shop vs laundry discounts", value: `${fmtNaira(salesDisc)} / ${fmtNaira(laundryDisc)}` },
      ],
      charts: [
        {
          kind: "bar",
          title: "Where the adjustments sit",
          xKey: "name",
          series: [{ key: "value", label: "Amount", format: "currency" }],
          data: [
            { name: "VAT (Sales)", value: vat },
            { name: "Service charge (Sales)", value: service },
            { name: "Discounts (Sales)", value: salesDisc },
            { name: "Discounts (Laundry)", value: laundryDisc },
          ],
        },
      ],
      tables: [
        {
          title: "Breakdown by section",
          columns: [
            { key: "section", label: "Section" },
            { key: "vat", label: "VAT", align: "right", format: "currency" },
            { key: "service", label: "Service charge", align: "right", format: "currency" },
            { key: "discounts", label: "Discounts", align: "right", format: "currency" },
          ],
          rows: [
            { section: SECTION_LABELS.SALES, vat, service, discounts: salesDisc },
            { section: SECTION_LABELS.LAUNDRY, vat: 0, service: 0, discounts: laundryDisc },
            { section: SECTION_LABELS.TAILORING, vat: 0, service: 0, discounts: 0 },
          ],
        },
      ],
    };
  },
};

const transactionStream: GeneralDef = {
  type: "general_transaction_stream",
  section: "GENERAL",
  label: "Transaction stream",
  description: "The raw merged money trail — every movement in or out, across all sections and branches, newest first.",
  hasRange: true,
  filters: [
    BRANCH_FILTER,
    SECTION_FILTER,
    DIRECTION_FILTER,
    METHOD_FILTER,
    { key: "q", label: "Search", kind: "text", placeholder: "Ref, note…" },
  ],
  run: async ({ db, activeBranch, filters, range }) => {
    const direction = fv(filters, "direction");
    const method = fv(filters, "method");
    const q = fv(filters, "q");

    const rows = await db
      .select({
        refNo: moneyMovements.refNo,
        created: moneyMovements.createdAt,
        direction: moneyMovements.direction,
        section: moneyMovements.section,
        sourceType: moneyMovements.sourceType,
        sourceRef: moneyMovements.sourceRef,
        amount: moneyMovements.amount,
        method: moneyMovements.paymentMethod,
        note: moneyMovements.note,
        branchName: branches.name,
        staff: users.fullName,
      })
      .from(moneyMovements)
      .leftJoin(branches, eq(moneyMovements.branchId, branches.id))
      .leftJoin(users, eq(moneyMovements.createdBy, users.id))
      .where(
        inRange(moneyMovements.createdAt, range, [
          branchFilter(moneyMovements.branchId, activeBranch, filters),
          sectionEq(moneyMovements.section, filters),
          direction ? eq(moneyMovements.direction, direction as (typeof MONEY_DIRECTIONS)[number]) : undefined,
          method ? eq(moneyMovements.paymentMethod, method as (typeof PAYMENT_METHODS)[number]) : undefined,
          q ? sql`(${moneyMovements.refNo} LIKE ${`%${q}%`} OR ${moneyMovements.sourceRef} LIKE ${`%${q}%`} OR ${moneyMovements.note} LIKE ${`%${q}%`})` : undefined,
        ]),
      )
      .orderBy(desc(moneyMovements.createdAt))
      .limit(500);

    const inTotal = rows.filter((r) => r.direction === "IN").reduce((s, r) => s + num(r.amount), 0);
    const outTotal = rows.filter((r) => r.direction === "OUT").reduce((s, r) => s + num(r.amount), 0);

    return {
      subtitle: "Showing the latest 500 movements that match your filters.",
      kpis: [
        { label: "Movements", value: fmtInt(rows.length) },
        { label: "Money in", value: fmtNaira(inTotal), tone: "emerald" },
        { label: "Money out", value: fmtNaira(outTotal), tone: "red" },
        { label: "Net", value: fmtNaira(inTotal - outTotal), tone: inTotal - outTotal >= 0 ? "gold" : "red" },
      ],
      charts: [],
      tables: [
        {
          title: "Movements",
          columns: [
            { key: "refNo", label: "Ref" },
            { key: "created", label: "When", format: "datetime" },
            { key: "direction", label: "Dir" },
            { key: "section", label: "Section" },
            { key: "source", label: "Source" },
            { key: "branch", label: "Branch" },
            { key: "amount", label: "Amount", align: "right", format: "currency" },
            { key: "method", label: "Method" },
            { key: "staff", label: "By" },
            { key: "note", label: "Note" },
          ],
          rows: rows.map((r) => ({
            refNo: r.refNo,
            created: r.created.toISOString(),
            direction: r.direction,
            section: SECTION_LABELS[r.section],
            source: `${r.sourceType.replace(/_/g, " ")}${r.sourceRef ? ` · ${r.sourceRef}` : ""}`,
            branch: r.branchName ?? "Main",
            amount: num(r.amount),
            method: PAYMENT_METHOD_LABELS[r.method],
            staff: r.staff ?? "—",
            note: r.note ?? "",
          })),
        },
      ],
    };
  },
};

/* ============================ GENERAL ANALYSES =========================== */

const revenueMix: GeneralDef = {
  type: "general_revenue_mix",
  section: "GENERAL",
  label: "Revenue mix",
  description: "How the business earns — section share of billed revenue, and how that mix shifts day by day.",
  hasRange: true,
  filters: [BRANCH_FILTER],
  run: async (args) => {
    const billed = await billedBySection(args);
    const total = sumTotals(billed);
    const byDay = await billedByDay(args);
    const days = [...byDay.keys()].sort();

    return {
      kpis: [
        { label: "Total billed", value: fmtNaira(total), tone: "gold" },
        ...SECTIONS.map((s) => ({ label: `${SECTION_LABELS[s]} share`, value: total > 0 ? fmtPct((billed[s] / total) * 100) : "—", hint: fmtNaira(billed[s]) })),
      ],
      charts: [
        {
          kind: "pie",
          title: "Billed revenue share",
          nameKey: "name",
          valueKey: "value",
          valueFormat: "currency",
          data: SECTIONS.filter((s) => billed[s] > 0).map((s) => ({ name: SECTION_LABELS[s], value: billed[s] })),
        },
        {
          kind: "area",
          title: "Daily mix",
          xKey: "day",
          series: SECTIONS.map((s) => ({ key: s.toLowerCase(), label: SECTION_LABELS[s], format: "currency" as const })),
          data: days.map((day) => {
            const b = byDay.get(day) ?? emptyTotals();
            return { day, sales: b.SALES, laundry: b.LAUNDRY, tailoring: b.TAILORING };
          }),
        },
      ],
      tables: [],
    };
  },
};

const cashPosition: GeneralDef = {
  type: "general_cash_position",
  section: "GENERAL",
  label: "Cash vs credit position",
  description: "Billed vs actually collected per section — how much of the business runs on customer credit.",
  hasRange: true,
  filters: [BRANCH_FILTER],
  run: async (args) => {
    const [billed, collected] = await Promise.all([billedBySection(args), collectedBySection(args)]);
    const rows = SECTIONS.map((s) => ({
      section: SECTION_LABELS[s],
      billed: billed[s],
      collected: collected[s],
      outstanding: Math.max(billed[s] - collected[s], 0),
      rate: billed[s] > 0 ? (collected[s] / billed[s]) * 100 : 0,
    }));
    const totalBilled = sumTotals(billed);
    const totalCollected = sumTotals(collected);

    return {
      kpis: [
        { label: "Billed", value: fmtNaira(totalBilled) },
        { label: "Collected", value: fmtNaira(totalCollected), tone: "emerald" },
        { label: "Outstanding", value: fmtNaira(Math.max(totalBilled - totalCollected, 0)), tone: "red" },
        { label: "Collection rate", value: totalBilled > 0 ? fmtPct((totalCollected / totalBilled) * 100) : "—", tone: "gold" },
      ],
      charts: [
        {
          kind: "bar",
          title: "Billed vs collected vs outstanding",
          xKey: "section",
          series: [
            { key: "billed", label: "Billed", format: "currency" },
            { key: "collected", label: "Collected", format: "currency" },
            { key: "outstanding", label: "Outstanding", format: "currency" },
          ],
          data: rows,
        },
        {
          kind: "pie",
          title: "Where credit sits",
          nameKey: "name",
          valueKey: "value",
          valueFormat: "currency",
          data: rows.filter((r) => r.outstanding > 0).map((r) => ({ name: r.section, value: r.outstanding })),
        },
      ],
      tables: [
        {
          title: "Position by section",
          columns: [
            { key: "section", label: "Section" },
            { key: "billed", label: "Billed", align: "right", format: "currency" },
            { key: "collected", label: "Collected", align: "right", format: "currency" },
            { key: "outstanding", label: "Outstanding", align: "right", format: "currency" },
            { key: "rate", label: "Collection rate", align: "right", format: "percent" },
          ],
          rows,
        },
      ],
    };
  },
};

const expenseRatio: GeneralDef = {
  type: "general_expense_ratio",
  section: "GENERAL",
  label: "Expense ratio",
  description: "What it costs to earn each naira — expenses as a share of billed revenue, per section and per month.",
  hasRange: true,
  filters: [BRANCH_FILTER],
  run: async (args) => {
    const { db, activeBranch, filters, range } = args;
    const [billed, spent] = await Promise.all([billedBySection(args), expensesBySection(args)]);
    const rows = SECTIONS.map((s) => ({
      section: SECTION_LABELS[s],
      billed: billed[s],
      expenses: spent[s],
      ratio: billed[s] > 0 ? (spent[s] / billed[s]) * 100 : 0,
    }));
    const totalBilled = sumTotals(billed);
    const totalSpent = sumTotals(spent);

    // Monthly whole-business ratio.
    const billedMonth = new Map<string, number>();
    const bump = (m: string, v: number) => billedMonth.set(m, (billedMonth.get(m) ?? 0) + v);
    const salesM = await db
      .select({ m: sql<string>`DATE_FORMAT(${sales.createdAt}, '%Y-%m')`.as("m"), total: sql<number>`COALESCE(SUM(${sales.grandTotal}), 0)` })
      .from(sales)
      .where(inRange(sales.createdAt, range, [branchFilter(sales.branchId, activeBranch, filters), eq(sales.status, "COMPLETED")]))
      .groupBy(sql`m`);
    for (const r of salesM) bump(r.m, num(r.total));
    const laundryM = await db
      .select({ m: sql<string>`DATE_FORMAT(${laundryOrders.createdAt}, '%Y-%m')`.as("m"), total: sql<number>`COALESCE(SUM(${laundryOrders.totalAmount}), 0)` })
      .from(laundryOrders)
      .where(inRange(laundryOrders.createdAt, range, [branchFilter(laundryOrders.branchId, activeBranch, filters), ne(laundryOrders.status, "CANCELLED")]))
      .groupBy(sql`m`);
    for (const r of laundryM) bump(r.m, num(r.total));
    const tailoringM = await db
      .select({ m: sql<string>`DATE_FORMAT(${tailoringOrders.createdAt}, '%Y-%m')`.as("m"), total: sql<number>`COALESCE(SUM(${tailoringOrders.price}), 0)` })
      .from(tailoringOrders)
      .where(inRange(tailoringOrders.createdAt, range, [branchFilter(tailoringOrders.branchId, activeBranch, filters), ne(tailoringOrders.status, "CANCELLED")]))
      .groupBy(sql`m`);
    for (const r of tailoringM) bump(r.m, num(r.total));
    const expM = await db
      .select({ m: sql<string>`DATE_FORMAT(${expenses.expenseDate}, '%Y-%m')`.as("m"), total: sql<number>`COALESCE(SUM(${expenses.amount}), 0)` })
      .from(expenses)
      .where(inRange(expenses.expenseDate, range, [branchFilter(expenses.branchId, activeBranch, filters), eq(expenses.status, "ACTIVE")]))
      .groupBy(sql`m`);
    const expMonth = new Map(expM.map((r) => [r.m, num(r.total)]));
    const months = [...new Set([...billedMonth.keys(), ...expMonth.keys()])].sort();
    const monthly = months.map((m) => ({
      month: m,
      billed: billedMonth.get(m) ?? 0,
      expenses: expMonth.get(m) ?? 0,
      ratio: (billedMonth.get(m) ?? 0) > 0 ? ((expMonth.get(m) ?? 0) / (billedMonth.get(m) ?? 0)) * 100 : 0,
    }));

    return {
      kpis: [
        { label: "Business expense ratio", value: totalBilled > 0 ? fmtPct((totalSpent / totalBilled) * 100) : "—", tone: "gold" },
        { label: "Total expenses", value: fmtNaira(totalSpent), tone: "red" },
        { label: "Leanest section", value: rows.filter((r) => r.billed > 0).sort((a, b) => a.ratio - b.ratio)[0]?.section ?? "—" },
      ],
      charts: [
        {
          kind: "bar",
          title: "Expense ratio by section",
          xKey: "section",
          series: [{ key: "ratio", label: "Expenses ÷ billed", format: "percent" }],
          data: rows,
        },
        {
          kind: "line",
          title: "Monthly expense ratio",
          xKey: "month",
          series: [{ key: "ratio", label: "Ratio", format: "percent" }],
          data: monthly,
        },
      ],
      tables: [
        {
          title: "Monthly detail",
          columns: [
            { key: "month", label: "Month" },
            { key: "billed", label: "Billed", align: "right", format: "currency" },
            { key: "expenses", label: "Expenses", align: "right", format: "currency" },
            { key: "ratio", label: "Ratio", align: "right", format: "percent" },
          ],
          rows: [...monthly].reverse(),
        },
      ],
    };
  },
};

const growthAnalysis: GeneralDef = {
  type: "general_growth",
  section: "GENERAL",
  label: "Period-over-period growth",
  description: "This period vs the equal period before it — billed, expenses and net growth for each section.",
  hasRange: true,
  filters: [BRANCH_FILTER],
  run: async (args) => {
    const { range } = args;
    const span = range.to.getTime() - range.from.getTime();
    const prevRange = { from: new Date(range.from.getTime() - span), to: range.from };
    const cur = await Promise.all([billedBySection(args), expensesBySection(args), collectedBySection(args)]);
    const prev = await Promise.all([
      billedBySection({ ...args, range: prevRange }),
      expensesBySection({ ...args, range: prevRange }),
      collectedBySection({ ...args, range: prevRange }),
    ]);

    const rows = SECTIONS.map((s) => {
      const billedCur = cur[0][s], billedPrev = prev[0][s];
      const netCur = cur[2][s] - cur[1][s], netPrev = prev[2][s] - prev[1][s];
      return {
        section: SECTION_LABELS[s],
        billedPrev,
        billedCur,
        billedGrowth: billedPrev > 0 ? ((billedCur - billedPrev) / billedPrev) * 100 : null,
        netPrev,
        netCur,
        netGrowth: netPrev > 0 ? ((netCur - netPrev) / netPrev) * 100 : null,
      };
    });

    const totCur = sumTotals(cur[0]);
    const totPrev = sumTotals(prev[0]);

    return {
      subtitle: "Previous period = the same number of days immediately before the selected range.",
      kpis: [
        { label: "Billed this period", value: fmtNaira(totCur), tone: "gold" },
        { label: "Previous period", value: fmtNaira(totPrev) },
        { label: "Billed growth", value: totPrev > 0 ? fmtPct(((totCur - totPrev) / totPrev) * 100) : "—", tone: totCur >= totPrev ? "emerald" : "red" },
        { label: "Net this period", value: fmtNaira(sumTotals(cur[2]) - sumTotals(cur[1])), tone: sumTotals(cur[2]) - sumTotals(cur[1]) >= 0 ? "emerald" : "red" },
      ],
      charts: [
        {
          kind: "bar",
          title: "This period vs previous — billed",
          xKey: "section",
          series: [
            { key: "billedPrev", label: "Previous", format: "currency" },
            { key: "billedCur", label: "Current", format: "currency" },
          ],
          data: rows.map((r) => ({ section: r.section, billedPrev: r.billedPrev, billedCur: r.billedCur })),
        },
      ],
      tables: [
        {
          title: "Growth detail",
          columns: [
            { key: "section", label: "Section" },
            { key: "billedPrev", label: "Billed (prev)", align: "right", format: "currency" },
            { key: "billedCur", label: "Billed (current)", align: "right", format: "currency" },
            { key: "billedGrowth", label: "Billed growth", align: "right", format: "percent" },
            { key: "netPrev", label: "Net (prev)", align: "right", format: "currency" },
            { key: "netCur", label: "Net (current)", align: "right", format: "currency" },
          ],
          rows: rows.map((r) => ({ ...r, billedGrowth: r.billedGrowth ?? 0 })),
        },
      ],
    };
  },
};

const methodTrend: GeneralDef = {
  type: "general_method_trend",
  section: "GENERAL",
  label: "Payment method trend",
  description: "How payment preferences evolve — monthly collections by method across the whole business.",
  hasRange: true,
  filters: [BRANCH_FILTER, SECTION_FILTER],
  run: async ({ db, activeBranch, filters, range }) => {
    const rows = await db
      .select({
        m: sql<string>`DATE_FORMAT(${moneyMovements.createdAt}, '%Y-%m')`.as("m"),
        method: moneyMovements.paymentMethod,
        total: sql<number>`COALESCE(SUM(${moneyMovements.amount}), 0)`,
      })
      .from(moneyMovements)
      .where(
        inRange(moneyMovements.createdAt, range, [
          branchFilter(moneyMovements.branchId, activeBranch, filters),
          sectionEq(moneyMovements.section, filters),
          eq(moneyMovements.direction, "IN"),
        ]),
      )
      .groupBy(sql`m`, moneyMovements.paymentMethod)
      .orderBy(sql`m`);

    const months = [...new Set(rows.map((r) => r.m))].sort();
    const data = months.map((m) => {
      const row: Record<string, string | number> = { month: m };
      for (const method of PAYMENT_METHODS) row[method.toLowerCase()] = 0;
      for (const r of rows.filter((x) => x.m === m)) row[r.method.toLowerCase()] = num(r.total);
      return row;
    });

    const totals = new Map<string, number>();
    for (const r of rows) totals.set(r.method, (totals.get(r.method) ?? 0) + num(r.total));
    const grand = [...totals.values()].reduce((s, v) => s + v, 0);
    const top = [...totals.entries()].sort((a, b) => b[1] - a[1])[0];

    return {
      kpis: [
        { label: "Total collected", value: fmtNaira(grand), tone: "gold" },
        { label: "Dominant method", value: top ? PAYMENT_METHOD_LABELS[top[0] as (typeof PAYMENT_METHODS)[number]] : "—", hint: top && grand > 0 ? fmtPct((top[1] / grand) * 100) : undefined },
        { label: "Months covered", value: fmtInt(months.length) },
      ],
      charts: [
        {
          kind: "area",
          title: "Monthly collections by method",
          xKey: "month",
          series: PAYMENT_METHODS.map((m) => ({ key: m.toLowerCase(), label: PAYMENT_METHOD_LABELS[m], format: "currency" as const })),
          data,
        },
      ],
      tables: [
        {
          title: "Monthly detail",
          columns: [
            { key: "month", label: "Month" },
            ...PAYMENT_METHODS.map((m) => ({ key: m.toLowerCase(), label: PAYMENT_METHOD_LABELS[m], align: "right" as const, format: "currency" as const })),
          ],
          rows: [...data].reverse(),
        },
      ],
    };
  },
};

const weekdayPattern: GeneralDef = {
  type: "general_weekday_pattern",
  section: "GENERAL",
  label: "Weekday pattern",
  description: "Which days of the week make the money — merged billed revenue by weekday across all sections.",
  hasRange: true,
  filters: [BRANCH_FILTER, SECTION_FILTER],
  run: async (args) => {
    const { db, activeBranch, filters, range } = args;
    const byWeekday = new Map<number, { billed: number; orders: number }>();
    const bump = (dow: number, billed: number, orders: number) => {
      const s = byWeekday.get(dow) ?? { billed: 0, orders: 0 };
      s.billed += billed;
      s.orders += orders;
      byWeekday.set(dow, s);
    };

    if (want(filters, "SALES")) {
      const rows = await db
        .select({ dow: sql<number>`DAYOFWEEK(${sales.createdAt})`.as("dow"), total: sql<number>`COALESCE(SUM(${sales.grandTotal}), 0)`, n: count() })
        .from(sales)
        .where(inRange(sales.createdAt, range, [branchFilter(sales.branchId, activeBranch, filters), eq(sales.status, "COMPLETED")]))
        .groupBy(sql`dow`);
      for (const r of rows) bump(num(r.dow), num(r.total), r.n);
    }
    if (want(filters, "LAUNDRY")) {
      const rows = await db
        .select({ dow: sql<number>`DAYOFWEEK(${laundryOrders.createdAt})`.as("dow"), total: sql<number>`COALESCE(SUM(${laundryOrders.totalAmount}), 0)`, n: count() })
        .from(laundryOrders)
        .where(inRange(laundryOrders.createdAt, range, [branchFilter(laundryOrders.branchId, activeBranch, filters), ne(laundryOrders.status, "CANCELLED")]))
        .groupBy(sql`dow`);
      for (const r of rows) bump(num(r.dow), num(r.total), r.n);
    }
    if (want(filters, "TAILORING")) {
      const rows = await db
        .select({ dow: sql<number>`DAYOFWEEK(${tailoringOrders.createdAt})`.as("dow"), total: sql<number>`COALESCE(SUM(${tailoringOrders.price}), 0)`, n: count() })
        .from(tailoringOrders)
        .where(inRange(tailoringOrders.createdAt, range, [branchFilter(tailoringOrders.branchId, activeBranch, filters), ne(tailoringOrders.status, "CANCELLED")]))
        .groupBy(sql`dow`);
      for (const r of rows) bump(num(r.dow), num(r.total), r.n);
    }

    const NAMES = ["", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const data = [2, 3, 4, 5, 6, 7, 1].map((dow) => ({
      day: NAMES[dow],
      billed: byWeekday.get(dow)?.billed ?? 0,
      orders: byWeekday.get(dow)?.orders ?? 0,
    }));
    const best = data.reduce((a, b) => (b.billed > a.billed ? b : a), data[0]);

    return {
      kpis: [
        { label: "Best weekday", value: best?.day ?? "—", tone: "gold", hint: best ? fmtNaira(best.billed) : undefined },
        { label: "Quietest weekday", value: data.reduce((a, b) => (b.billed < a.billed ? b : a), data[0])?.day ?? "—" },
        { label: "Total billed", value: fmtNaira(data.reduce((s, d) => s + d.billed, 0)) },
      ],
      charts: [
        {
          kind: "bar",
          title: "Billed revenue by weekday",
          xKey: "day",
          series: [{ key: "billed", label: "Billed", format: "currency" }],
          data,
        },
        {
          kind: "line",
          title: "Orders by weekday",
          xKey: "day",
          series: [{ key: "orders", label: "Orders", format: "number" }],
          data,
        },
      ],
      tables: [
        {
          title: "Weekday detail",
          columns: [
            { key: "day", label: "Weekday" },
            { key: "orders", label: "Orders", align: "right", format: "number" },
            { key: "billed", label: "Billed", align: "right", format: "currency" },
            { key: "avgTicket", label: "Avg ticket", align: "right", format: "currency" },
          ],
          rows: data.map((d) => ({ ...d, avgTicket: d.orders > 0 ? d.billed / d.orders : 0 })),
        },
      ],
    };
  },
};

const orderPipeline: GeneralDef = {
  type: "general_order_pipeline",
  section: "GENERAL",
  label: "Order pipeline",
  description: "Where work sits right now — open laundry and tailoring orders by workflow stage, plus today's till activity.",
  hasRange: false,
  filters: [BRANCH_FILTER],
  run: async ({ db, activeBranch, filters }) => {
    const laundryStages = await db
      .select({ status: laundryOrders.status, n: count(), value: sql<number>`COALESCE(SUM(${laundryOrders.totalAmount}), 0)` })
      .from(laundryOrders)
      .where(and(ne(laundryOrders.status, "CANCELLED"), branchFilter(laundryOrders.branchId, activeBranch, filters)))
      .groupBy(laundryOrders.status);

    const tailoringStages = await db
      .select({ status: tailoringOrders.status, n: count(), value: sql<number>`COALESCE(SUM(${tailoringOrders.price}), 0)` })
      .from(tailoringOrders)
      .where(and(ne(tailoringOrders.status, "CANCELLED"), branchFilter(tailoringOrders.branchId, activeBranch, filters)))
      .groupBy(tailoringOrders.status);

    const openLaundry = laundryStages.filter((s) => !["COLLECTED"].includes(s.status));
    const openTailoring = tailoringStages.filter((s) => !["DELIVERED"].includes(s.status));

    return {
      subtitle: "Snapshot of all time — not date-ranged.",
      kpis: [
        { label: "Open laundry orders", value: fmtInt(openLaundry.reduce((s, r) => s + r.n, 0)), hint: fmtNaira(openLaundry.reduce((s, r) => s + num(r.value), 0)) },
        { label: "Open tailoring orders", value: fmtInt(openTailoring.reduce((s, r) => s + r.n, 0)), hint: fmtNaira(openTailoring.reduce((s, r) => s + num(r.value), 0)) },
        { label: "Work in progress value", value: fmtNaira([...openLaundry, ...openTailoring].reduce((s, r) => s + num(r.value), 0)), tone: "gold" },
      ],
      charts: [
        {
          kind: "bar",
          title: "Laundry pipeline",
          xKey: "stage",
          series: [{ key: "n", label: "Orders", format: "number" }],
          data: laundryStages.map((s) => ({ stage: s.status.replace(/_/g, " "), n: s.n })),
        },
        {
          kind: "bar",
          title: "Tailoring pipeline",
          xKey: "stage",
          series: [{ key: "n", label: "Orders", format: "number" }],
          data: tailoringStages.map((s) => ({ stage: s.status.replace(/_/g, " "), n: s.n })),
        },
      ],
      tables: [
        {
          title: "Pipeline detail",
          columns: [
            { key: "section", label: "Section" },
            { key: "stage", label: "Stage" },
            { key: "n", label: "Orders", align: "right", format: "number" },
            { key: "value", label: "Value", align: "right", format: "currency" },
          ],
          rows: [
            ...laundryStages.map((s) => ({ section: "Laundry", stage: s.status.replace(/_/g, " "), n: s.n, value: num(s.value) })),
            ...tailoringStages.map((s) => ({ section: "Tailoring", stage: s.status.replace(/_/g, " "), n: s.n, value: num(s.value) })),
          ],
        },
      ],
    };
  },
};

const peakDays: GeneralDef = {
  type: "general_peak_days",
  section: "GENERAL",
  label: "Best & worst days",
  description: "The mall's strongest and weakest trading days in the period — billed, expenses and net per day, ranked.",
  hasRange: true,
  filters: [BRANCH_FILTER, SECTION_FILTER],
  run: async (args) => {
    const byDay = await billedByDay(args);
    const expByDay = await expensesByDay(args);
    const days = [...new Set([...byDay.keys(), ...expByDay.keys()])].sort();
    const all = days.map((day) => {
      const b = byDay.get(day) ?? emptyTotals();
      const e = expByDay.get(day) ?? 0;
      return { day, billed: sumTotals(b), expenses: e, net: sumTotals(b) - e };
    });
    const best = [...all].sort((a, b) => b.billed - a.billed).slice(0, 10);
    const worst = [...all].filter((d) => d.billed > 0).sort((a, b) => a.billed - b.billed).slice(0, 10);
    const avg = all.length > 0 ? all.reduce((s, d) => s + d.billed, 0) / all.length : 0;

    return {
      kpis: [
        { label: "Best day", value: best[0]?.day ?? "—", tone: "gold", hint: best[0] ? fmtNaira(best[0].billed) : undefined },
        { label: "Average day", value: fmtNaira(avg) },
        { label: "Days above average", value: fmtInt(all.filter((d) => d.billed > avg).length), hint: `of ${fmtInt(all.length)} active days` },
      ],
      charts: [
        {
          kind: "bar",
          title: "Top 10 days by billed revenue",
          xKey: "day",
          series: [{ key: "billed", label: "Billed", format: "currency" }],
          data: best,
        },
      ],
      tables: [
        {
          title: "Best days",
          columns: [
            { key: "day", label: "Day" },
            { key: "billed", label: "Billed", align: "right", format: "currency" },
            { key: "expenses", label: "Expenses", align: "right", format: "currency" },
            { key: "net", label: "Net", align: "right", format: "currency" },
          ],
          rows: best,
        },
        {
          title: "Weakest active days",
          columns: [
            { key: "day", label: "Day" },
            { key: "billed", label: "Billed", align: "right", format: "currency" },
            { key: "expenses", label: "Expenses", align: "right", format: "currency" },
            { key: "net", label: "Net", align: "right", format: "currency" },
          ],
          rows: worst,
        },
      ],
    };
  },
};

/* ------------------------------ registries ------------------------------ */

export const GENERAL_REPORT_DEFS: GeneralDef[] = [
  businessOverview,
  moneyFlow,
  sectionComparison,
  branchPerformance,
  expenseAnalysis,
  paymentMethods,
  dailyTrend,
  topCustomers,
  staffPerformance,
  outstandingBalances,
  taxAndDiscounts,
  transactionStream,
];

export const GENERAL_ANALYSIS_DEFS: GeneralDef[] = [
  revenueMix,
  cashPosition,
  expenseRatio,
  growthAnalysis,
  methodTrend,
  weekdayPattern,
  orderPipeline,
  peakDays,
];

export function findGeneralReportDef(type: string): GeneralDef | undefined {
  return GENERAL_REPORT_DEFS.find((d) => d.type === type);
}

export function findGeneralAnalysisDef(type: string): GeneralDef | undefined {
  return GENERAL_ANALYSIS_DEFS.find((d) => d.type === type);
}

export function toGeneralCatalog(def: GeneralDef): ReportCatalogItem {
  return {
    type: def.type,
    section: "GENERAL",
    label: def.label,
    description: def.description,
    hasRange: def.hasRange,
    filters: def.filters,
  };
}

import { z } from "zod";
import { and, count, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { createRouter } from "../middleware";
import { authedProcedure } from "../trpc";
import { getDb } from "../queries/connection";
import {
  laundryOrders,
  laundryPayments,
  sales,
  tailoringOrders,
  tailoringPayments,
} from "@db/schema";
import { SECTIONS } from "@contracts/constants";

/**
 * HADRAN FABRICS MALL — sections router
 * Lightweight per-section overview numbers for the section home pages
 * (Sales & Inventory / Laundry / Tailoring). Full module routers ship
 * with their own phases; this only powers the landing dashboards.
 */

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const LAUNDRY_ACTIVE = ["RECEIVED", "WASHING", "DRYING", "IRONING"] as const;
const TAILORING_ACTIVE = ["RECEIVED", "CUTTING", "SEWING", "FINISHING", "FITTING"] as const;

export const sectionsRouter = createRouter({
  overview: authedProcedure
    .input(z.object({ section: z.enum(SECTIONS) }))
    .query(async ({ input }) => {
      const db = getDb();
      const today = startOfToday();

      if (input.section === "LAUNDRY") {
        const [active] = await db
          .select({ value: count() })
          .from(laundryOrders)
          .where(inArray(laundryOrders.status, [...LAUNDRY_ACTIVE]));
        const [ready] = await db
          .select({ value: count() })
          .from(laundryOrders)
          .where(eq(laundryOrders.status, "READY"));
        const [unpaid] = await db
          .select({ value: count() })
          .from(laundryOrders)
          .where(and(ne(laundryOrders.paymentStatus, "PAID"), ne(laundryOrders.status, "CANCELLED")));
        const [revenue] = await db
          .select({ value: sql<string>`COALESCE(SUM(${laundryPayments.amount}), 0)` })
          .from(laundryPayments)
          .where(gte(laundryPayments.createdAt, today));
        const [dueSoon] = await db
          .select({ value: count() })
          .from(laundryOrders)
          .where(
            and(
              inArray(laundryOrders.status, [...LAUNDRY_ACTIVE]),
              sql`${laundryOrders.dueDate} IS NOT NULL`,
              sql`${laundryOrders.dueDate} <= CURDATE() + INTERVAL 1 DAY`,
            ),
          );

        return {
          section: input.section,
          activeOrders: active?.value ?? 0,
          readyOrders: ready?.value ?? 0,
          unpaidOrders: unpaid?.value ?? 0,
          dueSoon: dueSoon?.value ?? 0,
          revenueToday: Number(revenue?.value ?? 0),
        };
      }

      if (input.section === "TAILORING") {
        const [active] = await db
          .select({ value: count() })
          .from(tailoringOrders)
          .where(inArray(tailoringOrders.status, [...TAILORING_ACTIVE]));
        const [ready] = await db
          .select({ value: count() })
          .from(tailoringOrders)
          .where(eq(tailoringOrders.status, "READY"));
        const [unpaid] = await db
          .select({ value: count() })
          .from(tailoringOrders)
          .where(and(ne(tailoringOrders.paymentStatus, "PAID"), ne(tailoringOrders.status, "CANCELLED")));
        const [revenue] = await db
          .select({ value: sql<string>`COALESCE(SUM(${tailoringPayments.amount}), 0)` })
          .from(tailoringPayments)
          .where(gte(tailoringPayments.createdAt, today));
        const [dueSoon] = await db
          .select({ value: count() })
          .from(tailoringOrders)
          .where(
            and(
              inArray(tailoringOrders.status, [...TAILORING_ACTIVE]),
              sql`${tailoringOrders.dueDate} IS NOT NULL`,
              sql`${tailoringOrders.dueDate} <= CURDATE() + INTERVAL 1 DAY`,
            ),
          );

        return {
          section: input.section,
          activeOrders: active?.value ?? 0,
          readyOrders: ready?.value ?? 0,
          unpaidOrders: unpaid?.value ?? 0,
          dueSoon: dueSoon?.value ?? 0,
          revenueToday: Number(revenue?.value ?? 0),
        };
      }

      // SALES — headline numbers for the section card preview.
      const [todayCount] = await db
        .select({ value: count() })
        .from(sales)
        .where(and(eq(sales.status, "COMPLETED"), gte(sales.createdAt, today)));
      const [todayTotal] = await db
        .select({ value: sql<string>`COALESCE(SUM(${sales.grandTotal}), 0)` })
        .from(sales)
        .where(and(eq(sales.status, "COMPLETED"), gte(sales.createdAt, today)));

      return {
        section: input.section,
        salesToday: todayCount?.value ?? 0,
        revenueToday: Number(todayTotal?.value ?? 0),
      };
    }),
});

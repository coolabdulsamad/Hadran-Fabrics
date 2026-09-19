import { and, asc, count, desc, eq, like, ne, or, sql, type SQL } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";
import { getDb } from "../queries/connection";
import { branches, products, users } from "@db/schema";
import type { BranchStatus } from "@contracts/constants";

/**
 * HADRAN FABRICS MALL — branch service
 * Registration and configuration of physical branches, staff branch
 * assignment, per-branch stock lookups and the active-branch resolution
 * used by the request context.
 *
 * The MAIN branch (is_main = 1, code MAIN) is the mall itself: it cannot
 * be deactivated or deleted, and legacy rows whose branch_id is NULL are
 * treated as belonging to MAIN.
 */

type DbExecutor = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<DbExecutor["transaction"]>[0]>[0];

export interface BranchSummary {
  id: number;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  isMain: boolean;
  themePrimary: string | null;
  themeAccent: string | null;
  status: BranchStatus;
  staffCount: number;
  createdAt: Date;
}

/* ------------------------- main branch lookup ------------------------- */

/**
 * WHERE fragment scoping a `branch_id` column to the request's active
 * branch. The MAIN branch also sees legacy rows whose branch_id IS NULL.
 * Returns undefined when no branch is resolved (logged-out context).
 */
export function branchScope(column: AnyMySqlColumn, branch: BranchOption | null): SQL | undefined {
  if (!branch) return undefined;
  if (branch.isMain) return sql`(${column} = ${branch.id} OR ${column} IS NULL)`;
  return sql`${column} = ${branch.id}`;
}

let cachedMainBranchId: number | null | undefined;

/** Id of the MAIN branch (null when the branches table is somehow empty). Cached per process. */
export async function getMainBranchId(): Promise<number | null> {
  if (cachedMainBranchId !== undefined) return cachedMainBranchId;
  const db = getDb();
  const rows = await db
    .select({ id: branches.id })
    .from(branches)
    .where(eq(branches.isMain, true))
    .limit(1);
  cachedMainBranchId = rows[0]?.id ?? null;
  return cachedMainBranchId;
}

/** Small public shape used for switchers / session payloads. */
export interface BranchOption {
  id: number;
  code: string;
  name: string;
  isMain: boolean;
  status: BranchStatus;
  themePrimary: string | null;
  themeAccent: string | null;
}

export async function getBranchOption(id: number): Promise<BranchOption | null> {
  const db = getDb();
  const rows = await db
    .select({
      id: branches.id,
      code: branches.code,
      name: branches.name,
      isMain: branches.isMain,
      status: branches.status,
      themePrimary: branches.themePrimary,
      themeAccent: branches.themeAccent,
    })
    .from(branches)
    .where(eq(branches.id, id))
    .limit(1);
  return (rows[0] as BranchOption | undefined) ?? null;
}

/**
 * Resolve which branch a request acts on.
 * - Staff with branches.switch may work inside any ACTIVE branch (header pick).
 * - Everyone else is locked to their assigned branch, or MAIN when unassigned.
 * - An invalid/inactive pick falls back to the assigned branch — the client
 *   re-syncs its store from branches.myContext.
 */
export async function resolveActiveBranch(
  assignedBranchId: number | null,
  canSwitch: boolean,
  requestedBranchId: number | null,
): Promise<BranchOption | null> {
  if (canSwitch && requestedBranchId != null) {
    const picked = await getBranchOption(requestedBranchId);
    if (picked && picked.status === "ACTIVE") return picked;
  }
  if (assignedBranchId != null) {
    const own = await getBranchOption(assignedBranchId);
    if (own) return own;
  }
  const mainId = await getMainBranchId();
  return mainId != null ? getBranchOption(mainId) : null;
}

/* ------------------------------ listing ------------------------------ */

export async function listBranches(): Promise<BranchSummary[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: branches.id,
      code: branches.code,
      name: branches.name,
      address: branches.address,
      phone: branches.phone,
      isMain: branches.isMain,
      themePrimary: branches.themePrimary,
      themeAccent: branches.themeAccent,
      status: branches.status,
      staffCount: count(users.id),
      createdAt: branches.createdAt,
    })
    .from(branches)
    .leftJoin(users, and(eq(users.branchId, branches.id), eq(users.status, "ACTIVE")))
    .groupBy(branches.id)
    .orderBy(desc(branches.isMain), asc(branches.name));
  return rows.map((r) => ({ ...r, staffCount: Number(r.staffCount) })) as BranchSummary[];
}

/* ------------------------------ details ------------------------------ */

export async function getBranchDetails(id: number) {
  const db = getDb();
  const option = await getBranchOption(id);
  if (!option) throw new Error("Branch not found.");

  const full = await db.select().from(branches).where(eq(branches.id, id)).limit(1);
  const branch = full[0];

  const [staff] = await db
    .select({ count: count() })
    .from(users)
    .where(and(eq(users.branchId, id), eq(users.status, "ACTIVE")));

  const [stockAgg] = await db.execute(sql`
    SELECT COUNT(*) AS products, COALESCE(SUM(sl.quantity), 0) AS units
    FROM stock_levels sl
    WHERE sl.branch_id = ${id} AND sl.quantity > 0
  `);
  const stockRow = (stockAgg as unknown as { products: number; units: string }[])[0];

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthIso = monthStart.toISOString().slice(0, 19).replace("T", " ");

  // MAIN also owns legacy rows whose branch_id IS NULL.
  const branchWhere = option.isMain
    ? sql`(s.branch_id = ${id} OR s.branch_id IS NULL)`
    : sql`s.branch_id = ${id}`;
  const [salesAgg] = await db.execute(sql`
    SELECT COUNT(*) AS sales_count, COALESCE(SUM(s.grand_total), 0) AS sales_total
    FROM sales s
    WHERE ${branchWhere} AND s.status != 'VOIDED' AND s.created_at >= ${monthIso}
  `);
  const salesRow = (salesAgg as unknown as { sales_count: number; sales_total: string }[])[0];

  const expenseWhere = option.isMain
    ? sql`(e.branch_id = ${id} OR e.branch_id IS NULL)`
    : sql`e.branch_id = ${id}`;
  const [expAgg] = await db.execute(sql`
    SELECT COALESCE(SUM(e.amount), 0) AS expenses_total
    FROM expenses e
    WHERE ${expenseWhere} AND e.status = 'ACTIVE' AND e.expense_date >= ${monthIso.slice(0, 10)}
  `);
  const expenseRow = (expAgg as unknown as { expenses_total: string }[])[0];

  const [transferAgg] = await db.execute(sql`
    SELECT COUNT(*) AS open_transfers
    FROM branch_transfers t
    WHERE (t.from_branch_id = ${id} OR t.to_branch_id = ${id})
      AND t.status IN ('PENDING_APPROVAL', 'APPROVED', 'IN_TRANSIT')
  `);
  const transferRow = (transferAgg as unknown as { open_transfers: number }[])[0];

  return {
    branch,
    stats: {
      staffCount: Number(staff?.count ?? 0),
      stockedProducts: Number(stockRow?.products ?? 0),
      stockUnits: Number(stockRow?.units ?? 0),
      monthSalesCount: Number(salesRow?.sales_count ?? 0),
      monthSalesTotal: Number(salesRow?.sales_total ?? 0),
      monthExpensesTotal: Number(expenseRow?.expenses_total ?? 0),
      openTransfers: Number(transferRow?.open_transfers ?? 0),
    },
  };
}

/** Staff currently assigned to a branch. */
export async function branchStaff(branchId: number) {
  const db = getDb();
  return db
    .select({
      id: users.id,
      fullName: users.fullName,
      username: users.username,
      role: users.role,
      status: users.status,
      staffCode: users.staffCode,
    })
    .from(users)
    .where(eq(users.branchId, branchId))
    .orderBy(asc(users.fullName));
}

/* ------------------------------- writes ------------------------------- */

export interface BranchInput {
  code: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  themePrimary?: string | null;
  themeAccent?: string | null;
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "-");
}

export async function createBranch(input: BranchInput, actorId: number, tx?: Tx) {
  const db = (tx ?? getDb()) as DbExecutor;
  const code = normalizeCode(input.code);
  if (!/^[A-Z0-9-]{2,20}$/.test(code)) {
    throw new Error("Branch code must be 2–20 characters of A–Z, 0–9 or dashes.");
  }
  const dupe = await db.select({ id: branches.id }).from(branches).where(eq(branches.code, code)).limit(1);
  if (dupe[0]) throw new Error(`Branch code "${code}" is already taken.`);

  const [row] = await db
    .insert(branches)
    .values({
      code,
      name: input.name.trim(),
      address: input.address?.trim() || null,
      phone: input.phone?.trim() || null,
      themePrimary: input.themePrimary || null,
      themeAccent: input.themeAccent || null,
      createdBy: actorId,
    })
    .$returningId();
  return { branchId: row.id, code };
}

export async function updateBranch(id: number, input: Partial<BranchInput>, _actorId: number) {
  const db = getDb();
  const existing = await db.select().from(branches).where(eq(branches.id, id)).limit(1);
  if (!existing[0]) throw new Error("Branch not found.");

  const patch: Record<string, unknown> = {};
  if (input.name != null) patch.name = input.name.trim();
  if (input.address !== undefined) patch.address = input.address?.trim() || null;
  if (input.phone !== undefined) patch.phone = input.phone?.trim() || null;
  if (input.themePrimary !== undefined) patch.themePrimary = input.themePrimary || null;
  if (input.themeAccent !== undefined) patch.themeAccent = input.themeAccent || null;
  if (input.code != null) {
    if (existing[0].isMain) throw new Error("The main branch keeps its MAIN code.");
    const code = normalizeCode(input.code);
    if (!/^[A-Z0-9-]{2,20}$/.test(code)) {
      throw new Error("Branch code must be 2–20 characters of A–Z, 0–9 or dashes.");
    }
    const dupe = await db
      .select({ id: branches.id })
      .from(branches)
      .where(and(eq(branches.code, code), ne(branches.id, id)))
      .limit(1);
    if (dupe[0]) throw new Error(`Branch code "${code}" is already taken.`);
    patch.code = code;
  }
  if (Object.keys(patch).length === 0) throw new Error("Nothing to update.");

  await db.update(branches).set(patch).where(eq(branches.id, id));
  return { branchId: id };
}

export async function setBranchStatus(id: number, status: BranchStatus, _actorId: number) {
  const db = getDb();
  const existing = await db.select().from(branches).where(eq(branches.id, id)).limit(1);
  if (!existing[0]) throw new Error("Branch not found.");
  if (existing[0].isMain && status === "INACTIVE") {
    throw new Error("The main branch cannot be deactivated.");
  }
  if (status === "INACTIVE") {
    const [open] = await db.execute(sql`
      SELECT COUNT(*) AS n FROM branch_transfers t
      WHERE (t.from_branch_id = ${id} OR t.to_branch_id = ${id})
        AND t.status IN ('PENDING_APPROVAL', 'APPROVED', 'IN_TRANSIT')
    `);
    const n = Number((open as unknown as { n: number }[])[0]?.n ?? 0);
    if (n > 0) throw new Error(`This branch has ${n} open transfer(s) — complete or cancel them first.`);
  }
  await db.update(branches).set({ status }).where(eq(branches.id, id));
  return { branchId: id, status };
}

/** Assign a staff member to a branch (null = main branch / unassigned). */
export async function assignStaffToBranch(userId: number, branchId: number | null, _actorId: number) {
  const db = getDb();
  const u = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u[0]) throw new Error("Staff member not found.");
  if (branchId != null) {
    const b = await db.select({ id: branches.id, status: branches.status }).from(branches).where(eq(branches.id, branchId)).limit(1);
    if (!b[0]) throw new Error("Branch not found.");
    if (b[0].status !== "ACTIVE") throw new Error("Cannot assign staff to an inactive branch.");
  }
  await db.update(users).set({ branchId }).where(eq(users.id, userId));
  return { userId, branchId };
}

/* --------------------------- branch stock --------------------------- */

/** Products with their stock level at one branch (transfer / stocktake picker). */
export async function branchStock(branchId: number, search?: string, limit = 12) {
  const db = getDb();
  const q = search?.trim();
  const rows = await db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      unitOfMeasure: products.unitOfMeasure,
      globalStock: products.currentStock,
      branchStock: sql<string>`(SELECT COALESCE(SUM(sl.quantity), 0) FROM stock_levels sl WHERE sl.product_id = products.id AND sl.branch_id = ${branchId})`,
    })
    .from(products)
    .where(
      and(
        eq(products.status, "ACTIVE"),
        q ? or(like(products.name, `%${q}%`), like(products.sku, `%${q}%`), like(products.barcode, `%${q}%`)) : undefined,
      ),
    )
    .orderBy(asc(products.name))
    .limit(limit);
  return rows.map((r) => ({ ...r, branchStock: Number(r.branchStock) }));
}

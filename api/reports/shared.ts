import { TRPCError } from "@trpc/server";
import { and, gte, lt, sql, type SQL } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";
import type {
  ReportCatalogItem,
  ReportFilterSpec,
  ReportFilterValues,
  ReportResult,
} from "@contracts/reporting";
import { STORE, type Section } from "@contracts/constants";
import { getDb } from "../queries/connection";
import { getMainBranchId } from "../services/branch.service";

/**
 * HADRAN FABRICS MALL — reporting engine shared helpers.
 * Registry definitions (report-defs.ts / analysis-defs.ts) declare metadata
 * plus a `run` handler; the routers expose the catalog and execute runs.
 */

type Db = ReturnType<typeof getDb>;

export interface RunArgs {
  db: Db;
  /** Active-branch context from the request (x-hfm-branch). */
  activeBranch: { id: number; isMain: boolean } | null;
  filters: ReportFilterValues;
  range: { from: Date; to: Date };
}

export interface ReportDef {
  type: string;
  section: Section;
  label: string;
  description: string;
  hasRange: boolean;
  filters: ReportFilterSpec[];
  run: (args: RunArgs) => Promise<Omit<ReportResult, "title" | "section" | "type" | "generatedAt">>;
}

/* ------------------------------ permissions ---------------------------- */

export const SECTION_VIEW_PERMISSION: Record<Section, string> = {
  SALES: "reports.view",
  LAUNDRY: "laundry.view",
  TAILORING: "tailoring.view",
};

export function assertSectionAccess(permissions: Set<string>, section: Section) {
  const need = SECTION_VIEW_PERMISSION[section];
  if (!permissions.has(need) && !permissions.has("reports.general")) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `You don't have permission to view ${section.toLowerCase()} reports (${need}).`,
    });
  }
}

/* -------------------------------- ranges ------------------------------- */

/**
 * Inclusive-from / exclusive-to range. Defaults: a lone dateTo looks back 30
 * days from it; no dates at all means ALL TIME (the client's "All time"
 * preset sends neither).
 */
export function resolveRange(dateFrom?: string, dateTo?: string): { from: Date; to: Date } {
  if (!dateFrom && !dateTo) return { from: new Date(2020, 0, 1), to: new Date(Date.now() + 1000) };
  const toRaw = dateTo ? new Date(dateTo) : new Date();
  const from = dateFrom ? new Date(dateFrom) : new Date(toRaw.getTime() - 29 * 24 * 60 * 60 * 1000);
  from.setHours(0, 0, 0, 0);
  return { from, to: new Date(Math.min(toRaw.getTime(), Date.now()) + 1) };
}

/** WHERE fragment for a createdAt-style column over the resolved range. */
export function inRange(column: AnyMySqlColumn, range: { from: Date; to: Date }, extra: (SQL | undefined)[] = []): SQL | undefined {
  return and(gte(column, range.from), lt(column, range.to), ...extra);
}

/* --------------------------- branch scoping ---------------------------- */

/**
 * Branch resolution for reports:
 *  - staff pinned to a non-main branch always see only their branch;
 *  - main-branch users may pass filters.branchId — "ALL" (or absent) sees
 *    everything, MAIN sees main rows plus legacy NULL rows, any other id
 *    scopes to that branch.
 */
export function branchFilter(column: AnyMySqlColumn, activeBranch: RunArgs["activeBranch"], filters: ReportFilterValues): SQL | undefined {
  if (activeBranch && !activeBranch.isMain) {
    return sql`${column} = ${activeBranch.id}`;
  }
  const pick = filters.branchId;
  if (!pick || pick === "ALL") return undefined;
  const id = Number(pick);
  if (!Number.isFinite(id)) return undefined;
  // Cheap main check without a round trip when the pick matches context.
  if (activeBranch?.isMain && id === activeBranch.id) {
    return sql`(${column} = ${id} OR ${column} IS NULL)`;
  }
  return sql`${column} = ${id}`;
}

/** Async variant that recognises MAIN even without request context. */
export async function branchFilterAsync(column: AnyMySqlColumn, activeBranch: RunArgs["activeBranch"], filters: ReportFilterValues): Promise<SQL | undefined> {
  if (activeBranch && !activeBranch.isMain) return sql`${column} = ${activeBranch.id}`;
  const pick = filters.branchId;
  if (!pick || pick === "ALL") return undefined;
  const id = Number(pick);
  if (!Number.isFinite(id)) return undefined;
  const mainId = await getMainBranchId();
  if (mainId != null && id === mainId) return sql`(${column} = ${id} OR ${column} IS NULL)`;
  return sql`${column} = ${id}`;
}

/* ------------------------------ formatting ----------------------------- */

export const num = (v: unknown): number => Number(v ?? 0);

export const fmtNaira = (n: number): string =>
  `${STORE.currencySymbol}${n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtInt = (n: number): string => Math.round(n).toLocaleString("en-NG");

export const fmtQty = (n: number): string =>
  n.toLocaleString("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 3 });

export const fmtPct = (n: number): string => `${n.toFixed(1)}%`;

/* --------------------------- catalog helpers --------------------------- */

export function toCatalog(def: ReportDef): ReportCatalogItem {
  return {
    type: def.type,
    section: def.section,
    label: def.label,
    description: def.description,
    hasRange: def.hasRange,
    filters: def.filters,
  };
}

/** Standard branch filter spec shared by most definitions. */
export const BRANCH_FILTER: ReportFilterSpec = { key: "branchId", label: "Branch", kind: "branch" };

export function selectFilter(key: string, label: string, options: readonly string[] | { value: string; label: string }[], allLabel = "All"): ReportFilterSpec {
  const opts = (options as readonly unknown[]).map((o) =>
    typeof o === "string" ? { value: o, label: o.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) } : (o as { value: string; label: string }),
  );
  return { key, label, kind: "select", options: [{ value: "ALL", label: allLabel }, ...opts], defaultValue: "ALL" };
}

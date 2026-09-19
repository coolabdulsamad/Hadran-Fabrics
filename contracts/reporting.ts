/**
 * HADRAN FABRICS MALL — reporting engine contract (frontend ↔ backend)
 *
 * Phase 8: the Reports Studio and Analysis Studio are driven by a typed
 * registry. The backend exposes a catalog (which report/analysis types exist
 * per business section, with their filter specs) and a runner that executes
 * one type with a date range + filter values, returning a normalized result:
 * KPI cards, charts and tables. The frontend renders that contract generically
 * and exports it (CSV / Excel / print) without extra server round-trips.
 */

import type { Section } from "./constants";

/**
 * Where a report/analysis lives. The three business sections plus GENERAL —
 * Phase 9 cross-section / cross-branch reports that merge all records.
 */
export type ReportScope = Section | "GENERAL";

/* ------------------------------- filters ------------------------------- */

export type ReportFilterKind = "select" | "branch" | "category" | "text" | "number";

export interface ReportFilterSpec {
  key: string;
  label: string;
  kind: ReportFilterKind;
  /** Static options for kind="select". Branch/category options load live. */
  options?: { value: string; label: string }[];
  placeholder?: string;
  /** Default value applied when the report type is first selected. */
  defaultValue?: string;
}

export type ReportFilterValues = Record<string, string>;

/* --------------------------------- KPIs -------------------------------- */

export type ReportKpiTone = "gold" | "navy" | "emerald" | "red" | "plain";

export interface ReportKpi {
  label: string;
  value: string;
  hint?: string;
  tone?: ReportKpiTone;
}

/* -------------------------------- charts ------------------------------- */

export type ChartValueFormat = "currency" | "number" | "percent" | "qty";

export interface ReportChartSeries {
  key: string;
  label: string;
  color?: string;
  format?: ChartValueFormat;
}

export interface ReportChart {
  kind: "area" | "line" | "bar" | "pie";
  title: string;
  subtitle?: string;
  /** area/line/bar: x-axis key + series; pie: nameKey/valueKey. */
  xKey?: string;
  series?: ReportChartSeries[];
  nameKey?: string;
  valueKey?: string;
  valueFormat?: ChartValueFormat;
  data: Record<string, string | number>[];
  height?: number;
}

/* -------------------------------- tables ------------------------------- */

export type ReportCellFormat =
  | "text"
  | "currency"
  | "number"
  | "qty"
  | "percent"
  | "date"
  | "datetime";

export interface ReportTableColumn {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  format?: ReportCellFormat;
}

export interface ReportTable {
  title: string;
  columns: ReportTableColumn[];
  rows: Record<string, string | number | null>[];
}

/* -------------------------------- result ------------------------------- */

export interface ReportResult {
  title: string;
  subtitle?: string;
  section: ReportScope;
  type: string;
  generatedAt: string;
  rangeLabel?: string;
  kpis: ReportKpi[];
  charts: ReportChart[];
  tables: ReportTable[];
}

/* -------------------------------- catalog ------------------------------ */

export interface ReportCatalogItem {
  type: string;
  section: ReportScope;
  label: string;
  description: string;
  /** Whether the date-range presets apply to this type. */
  hasRange: boolean;
  filters: ReportFilterSpec[];
}

export interface ReportCatalog {
  reports: ReportCatalogItem[];
  analyses: ReportCatalogItem[];
}

# Phase 8 — Reports & Analysis Studios

**Status:** ✅ Complete
**Scope:** Requirement 6 — rebuild the Reports and Analytics pages as advanced,
type-driven studios with per-type filters, KPI cards, charts, tables and
CSV / Excel / print export. Report and analysis types depend on the business
section (Sales & Inventory / Laundry / Tailoring).

---

## What was built

### Reports Studio (`/reports`) — 30 report types

| Section | # | Types |
| --- | --- | --- |
| Sales & Inventory | 14 | Sales summary · Sales detail (receipts) · Product performance · Category performance · Cashier / staff performance · Customer sales · Payment methods · VAT / tax report · Returns & exchanges · Profit & margin · Inventory valuation · Stock movement ledger · Slow & dead stock · Expenses |
| Laundry | 8 | Laundry summary · Laundry order list · Revenue by service · Garment mix · Laundry collections · Outstanding balances · Laundry customers · Expenses |
| Tailoring | 8 | Tailoring summary · Tailoring order list · Tailor workload & output · Tailoring collections · Outstanding balances · Fabric source mix · Production runs · Expenses |

### Analysis Studio (`/analytics`) — 22 analysis types

| Section | # | Types |
| --- | --- | --- |
| Sales & Inventory | 10 | Revenue trend · Hourly pattern · Weekday pattern · Payment mix · Category share · Product pareto (80/20) · Cashier race · Basket analysis · Branch comparison · Margin map |
| Laundry | 6 | Order volume trend · Billed vs collected · Service mix · Garment mix · Workflow funnel · Express demand |
| Tailoring | 6 | Order volume trend · Tailor leaderboard · Workflow funnel · Fabric source mix · Production output · Delivery performance |

### The studio experience

- **Section tabs** (Sales & Inventory / Laundry / Tailoring) with per-section
  type counts; only sections the user's permissions allow are returned by the
  catalog and shown.
- **Type picker**: left rail on desktop, dropdown on mobile. Selecting a type
  swaps the filter bar to that type's filter set (branch, category, status,
  payment status/method, fabric source, movement type, min revenue, free
  text search…).
- **Date presets**: Today / 7 days / 30 days / This month / All time / Custom.
  "All time" sends no dates and the server treats that as unbounded. Types
  flagged `hasRange: false` (inventory valuation, outstanding balances,
  workflow funnels) hide the range picker.
- **Results**: KPI cards → charts (area / line / bar / pie via recharts) →
  formatted tables (currency, qty, %, dates; zebra rows, responsive scroll).
- **Exports**: CSV (one file, all tables), Excel (workbook with a Summary
  sheet + one sheet per table, numbers kept numeric), Print (clean paper
  layout with store header — reuses the existing print-portal CSS strategy).

## Architecture

```
contracts/reporting.ts          Shared contract: FilterSpec, Kpi, Chart, Table,
                                ReportResult, ReportCatalogItem
api/reports/shared.ts           RunArgs/ReportDef, resolveRange (30-day default,
                                no-dates = all time), branchFilter (staff pinned
                                to their branch; main users may pick a branch
                                or ALL), ₦/qty/% formatters, catalog helpers
api/reports/report-defs.ts      30 report definitions (handlers return
                                kpis/charts/tables)
api/reports/analysis-defs.ts    22 analysis definitions
api/routers/reports.router.ts   + catalog, + run  (legacy endpoints kept)
api/routers/analytics.router.ts NEW router: catalog + run (registered in
                                api/router.ts as `analytics`)
src/components/reports/Studio.tsx       Section tabs, type rail, dynamic filter
                                        bar, run wiring, export toolbar
src/components/reports/ResultView.tsx   Generic KPI/chart/table renderer
src/lib/report-export.ts                CSV / Excel (xlsx) / print builders
src/pages/reports/ReportsPage.tsx       Thin wrapper — Reports Studio
src/pages/reports/AnalyticsPage.tsx     Thin wrapper — Analysis Studio
src/index.css                           + #studio-print-root print rules,
                                        .print-only utility
```

### Permissions

- Catalog and `run` are permission-filtered per section: SALES →
  `reports.view`, LAUNDRY → `laundry.view`, TAILORING → `tailoring.view`;
  `reports.general` unlocks everything. Analysis runs additionally accept
  `analytics.view` (SALES) / `analytics.view` (LAUNDRY/TAILORING).
- Export buttons require `reports.export` (print is available to all viewers).

### Branch behaviour

- Staff pinned to a non-main branch always see only their branch's data.
- Main-branch users get a **Branch** filter (All branches + each branch);
  MAIN includes legacy `branch_id IS NULL` rows. The filter only renders when
  more than one branch exists.
- *Branch comparison* analysis always aggregates across all branches.

## Notes & decisions

- Sales aggregates count **COMPLETED** sales only; laundry/tailoring
  aggregates exclude **CANCELLED** orders unless the type says otherwise.
- Profit & margin types estimate cost from the `cost_price` snapshot captured
  on each sale line.
- The five legacy stub pages (`FinancialReportPage`, `InventoryReportPage`,
  `ReportsHubPage`, `SalesReportPage`, `StaffPerformancePage`) and the unused
  `src/pages/analytics/` stub are superseded by the studios (stub removed).
- Old `reports.*` endpoints (overview, salesTrend, …, exportCsv) remain for
  backward compatibility; the studios use only `catalog` + `run`.

## Verification

- `npx tsc -b` clean; `npm run build` clean.
- Playwright (admin login, 1440px + 390px): all three section tabs render with
  correct type counts (14/8/8 reports, 10/6/6 analyses); per-type filter bars
  swap correctly; KPIs/charts/tables render from live data; CSV and Excel
  downloads fire with correct filenames; `window.print` invoked; zero console
  errors.

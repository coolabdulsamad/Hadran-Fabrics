# Phase 9 — General Reports & Analysis (Cross-Section / Cross-Branch)

**Goal:** one "whole business" studio that merges records from every section
(Sales, Laundry, Tailoring) and every branch into unified reports and
analyses — the owner's helicopter view of Hadran Fabrics Mall.

## What was built

A third studio alongside the Phase 8 Reports Studio and Analysis Studio:
**General Reports & Analysis** (`/reports/general`), hosting **12 general
report types** and **8 general analysis types** in a single page with a
Reports ⇄ Analyses mode toggle.

### General report types (12)

| Type | Label | What it merges |
|---|---|---|
| `general_business_overview` | Business overview | Billed, collected, expenses, net, orders per section + daily merged trend |
| `general_money_flow` | Money flow | Every money-ledger movement: in/out by source, method, day |
| `general_section_comparison` | Section comparison | Sales vs Laundry vs Tailoring scoreboard |
| `general_branch_performance` | Branch performance | Per-branch billed / orders / expenses / net across all sections |
| `general_expense_analysis` | Expense analysis | All expenses by category, section, branch + detail listing |
| `general_payment_methods` | Payment methods | Customer payment method mix across sections (from money ledger) |
| `general_daily_trend` | Daily business trend | Day-by-day sales + laundry + tailoring + expenses + net |
| `general_top_customers` | Top customers (all sections) | Customers matched by name across shop, laundry and tailoring |
| `general_staff_performance` | Staff performance | Revenue handled per cashier / receiving staff member, merged |
| `general_outstanding_balances` | Outstanding balances | Unpaid / part-paid laundry + tailoring orders, all branches |
| `general_tax_discounts` | VAT & discounts | VAT, service charges and discounts across the business |
| `general_transaction_stream` | Transaction stream | Raw money-ledger trail (latest 500) with search |

### General analysis types (8)

| Type | Label | Focus |
|---|---|---|
| `general_revenue_mix` | Revenue mix | Section share of billed revenue + daily mix |
| `general_cash_position` | Cash vs credit position | Billed vs collected vs outstanding per section |
| `general_expense_ratio` | Expense ratio | Expenses ÷ billed per section and per month |
| `general_growth` | Period-over-period growth | Current range vs the equal period before it |
| `general_method_trend` | Payment method trend | Monthly collections by payment method |
| `general_weekday_pattern` | Weekday pattern | Billed revenue and orders by weekday |
| `general_order_pipeline` | Order pipeline | Live snapshot of laundry + tailoring workflow stages (no date range) |
| `general_peak_days` | Best & worst days | Strongest and weakest trading days, ranked |

## Definitions used

- **Billed** = COMPLETED sales grand totals + non-cancelled laundry order
  totals + non-cancelled tailoring order prices.
- **Collected** = money-ledger IN movements whose source is a customer
  payment (`SALE`, `EXCHANGE_TOPUP`, `LAUNDRY_PAYMENT`, `TAILORING_PAYMENT`).
  Manual cash injections/withdrawals are reported separately.
- **Expenses** = ACTIVE expense rows, over their expense date.
- **Net cash** = collected − expenses.

## Architecture

```
contracts/reporting.ts          + ReportScope = Section | "GENERAL"
                                (ReportResult.section / ReportCatalogItem.section widened)
api/reports/general-defs.ts     NEW — GeneralDef registry, merged aggregators
                                (billedBySection, collectedBySection,
                                expensesBySection, ordersBySection,
                                billedByDay, expensesByDay)
api/routers/general.router.ts   NEW — catalog (reports + analyses) & run,
                                both gated by reports.general
api/router.ts                   + general: generalRouter
src/components/reports/GeneralStudio.tsx   NEW — mode toggle, type rail,
                                adaptive filters, result view, exports
src/components/reports/Studio.tsx          FilterField now exported (reuse)
src/pages/reports/GeneralReportsPage.tsx   NEW — thin wrapper
src/App.tsx                     + /reports/general route (reports.general)
src/config/navigation.ts        + "General Reports" nav item (Insights group)
```

## Permissions & branch behaviour

- Page, router and nav item all require **`reports.general`** (Admin and
  Super Admin hold it by default; assignable per role/user).
- Export buttons additionally require `reports.export`; print is open to all
  viewers of the page.
- Main-branch users get **All branches** / per-branch filtering (rendered
  only when more than one branch exists). Users pinned to a non-main branch
  remain scoped to their branch on the server even in general reports —
  cross-branch visibility is never granted by this page.
- Legacy `NULL` branch rows roll up to the main branch.

## Export & print

Same Phase 8 engine, untouched: CSV (store header + KPI section + per-table
blocks), Excel workbook (Summary sheet + one sheet per table, numeric cells
numeric), and a clean print view via `#studio-print-root`. Filenames use the
`hadran-general-<type>-<date>` pattern.

## Verification

- `npx tsc -b` clean; `npm run build` clean.
- Playwright (1440px + 390px): all 12 report types and 8 analysis types
  enumerated and executed against live data; KPI cards, charts and tables
  render; CSV and Excel downloads confirmed; zero console/page errors.

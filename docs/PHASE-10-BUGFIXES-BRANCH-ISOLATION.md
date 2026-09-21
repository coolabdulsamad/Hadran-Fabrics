# Phase 10 — Report Bugfixes & Full Branch Isolation

**Date:** 21 September 2026
**Scope:** Fix three production report bugs reported by the owner, then deliver the
real requirement behind the complaints: **branches are fully independent** — every
operational page shows and acts on the active branch only.

---

## 1. Bugfixes

### 1.1 `profit_margin` report — HTTP 500 (MySQL reserved word)

**Symptom:** Running the *Profit Margin* report (Sales section) failed with
`Failed query: … group by key order by SUM(sale_items.line_total) desc …` on the
production MySQL server.

**Root cause:** The report grouped by a select alias literally named `key`
(`.groupBy(sql`key`)`). `KEY` is a **reserved word in MySQL**, and grouping by
select alias is rejected on strict servers. The local TiDB dev database tolerated
it, production MySQL did not.

**Fix (`api/reports/report-defs.ts`):** Group by the real columns
(`sale_items.product_name` / `categories.name`) and renamed the output alias to
`groupKey`. A codebase-wide audit of every other select alias used in
`GROUP BY`/`ORDER BY` found no other reserved-word collisions.

### 1.2 Analysis Studio & report charts render blank (no error)

**Symptom:** `/analytics`, `/reports` and `/reports/general` showed empty chart
cards — no error, no SVG, as if nothing loaded.

**Root cause:** Recharts' `<ResponsiveContainer>` measures its box and injects
`width`/`height` props into its **direct child** via `cloneElement`. The studio
wrapped each chart in custom components (`AxisChart`, `PieChartView`) that did
**not forward those props**, so the inner `<BarChart>`/`<LineChart>`/`<AreaChart>`/
`<PieChart>` received no dimensions, failed recharts' `validateWidthHeight` guard
and silently rendered `null`.

**Fix (`src/components/reports/ResultView.tsx`):** The wrapper components now
accept and forward `width`/`height` to the underlying charts. Verified live:
2 SVGs on `/analytics`, 4 on `/reports`, 3 on `/reports/general` against
production-shaped data, zero console errors.

### 1.3 Reports "not loading details, no error"

Mostly legitimate empty states: the production database has little or no activity
in some sections (laundry/tailoring have no orders yet). Empty results now render
the "No data for this selection." placeholder (already present) with working
charts (1.2). The permission-matrix self-heal shipped earlier (boot-time
`role_permissions` sync, commit `f9efc0e2`) covers the General Reports 403 that
looked like "nothing loads" for non-super-admin roles.

---

## 2. Full branch isolation

**Requirement (owner):** switching branches must not be cosmetic — *every* page
follows the active branch; branches share nothing operational.

### 2.1 Data model (unchanged — it was already right)

- `stock_levels (product_id, branch_id, quantity)` is the per-branch source of truth.
- `products.current_stock` remains the company-wide total (sum of all branches).
- Every write path (`recordMovement`, `recordBranchTransfer`) already stamped
  `branch_id` and kept both in sync.
- The gap was entirely on the **read path**: pages read the global total and
  unfiltered ledgers, so switching branches changed nothing on screen.

### 2.2 What is per-branch vs shared

| Per-branch (scoped to active branch) | Shared master data (company-wide) |
|---|---|
| Stock quantities & valuation | Product catalog (name, price, SKU…) |
| Stock movement ledger | Categories |
| Stock counts & adjustments | Suppliers |
| Sales (history, held, receipts, today stats) | Customers & loyalty |
| Purchases (POs) | Staff accounts & roles |
| Returns & exchanges | Settings |
| Expenses, money ledger *(already was)* | Branches themselves |
| Laundry, tailoring, production *(already was)* | Reports/Analytics can view **All branches** (main-branch staff) |
| Dashboard (staff count, low stock, valuation, activity) | |
| POS availability & checkout validation | |

Rationale: a customer can shop at any branch and a supplier delivers to the
company — those stay global. Everything that *happens at* a branch belongs to it.

### 2.3 Server changes

- **`products.router.ts`** — `list`, `byId`, `byBarcode` now also return
  `branchStock` (quantity at the active branch). Product movement history on the
  details page is branch-scoped. Product-create approval payload carries
  `branchId` so approved opening stock lands in the requesting branch.
- **`inventory.router.ts`**
  - `movements` — ledger filtered by `branchScope(stockMovements.branchId, …)`.
  - `lowStock` — products the active branch holds at/below reorder level
    (per `stock_levels`, not the global total).
  - `overview` — valuation of the active branch's holdings.
  - `listCounts` scoped; `startCount` stamps `branchId` and snapshots expected
    quantities **from that branch's levels**; `getCount`/`saveCountEntries`/
    `completeCount`/`cancelCount` reject counts belonging to other branches.
  - `adjust` — delta computed against the **branch balance**, not the global one.
- **`dashboard.router.ts`** — staff count, low-stock list, stock valuation and
  recent movements all scoped to the active branch (catalog counts stay global).
- **`purchases.router.ts`** — `list`/`byId` scoped; `create` stamps `branchId`.
- **`returns.router.ts` / `returns.service.ts`** — `list`/`byId` scoped; the
  return row is stamped with the sale's branch (restock already went there).
- **`sales.router.ts`** — `heldSales`, `myDailySummary`, `byId`, `receiptData`,
  `todayStats` scoped (history was already). **Checkout now validates against
  the active branch's shelf stock**: a branch can only sell what it physically
  holds — move goods first with a branch transfer. Error copy: *"Insufficient
  stock … at this branch — only N available here."*
- **`production.router.ts`** — run details show material availability at the
  **run's branch**; detail endpoint rejects runs from other branches.
- **`approvals.apply.ts`** — approved stock adjustments recompute the delta
  against the branch balance (not the global one) at apply time.

### 2.4 Frontend changes

- **Products list** — the stock column is now *Stock (this branch)* with a muted
  "all branches: N" reference line.
- **Product details** — shows *Stock at this branch* (primary, drives the
  low-stock colour), *Company-wide (all branches)*, and branch-based stock value.
- **POS** — search results, out-of-stock/low badges and the cart ceiling
  (`maxStock`) use branch stock; scanned products resolve branch stock too;
  out-of-stock message says *"out of stock at this branch"*.
- **Stock adjustments** — the "current balance" shown is the branch balance.
- **Product picker** (stock-in/out, POs) — displays branch stock.
- **Production** — material picker shows branch availability.
- **Movements / Low Stock pages** — descriptions clarify branch scope.

### 2.5 Behaviour notes

- Switching branch invalidates **all** queries (existing behaviour) — now every
  refetched screen actually differs per branch.
- The MAIN branch also owns legacy rows whose `branch_id IS NULL`
  (`branchScope` in `api/services/branch.service.ts`) — historical sales made
  before branches existed stay visible at MAIN.
- A new branch starts with **zero stock**: transfer goods in via
  *Inventory → Transfers* before it can sell. This is intentional — branches are
  independent; nothing is shared silently.
- Outbound movements still protect the company-wide invariant server-side
  (`recordMovement` never lets the global total go negative).

### 2.6 Verification

Against production-shaped data (Railway MySQL, 2 branches — MAIN holds all 340
units; KUBWA-2 holds none yet):

| Check | MAIN | KUBWA-2 |
|---|---|---|
| Products stock cell | `30 yard(s) · all branches: 30` | `0 yard(s) · all branches: 30` |
| Dashboard valuation | ₦3,133,100 / ₦4,733,500 | ₦0.00 / ₦0.00 |
| Stock movements | sale movement listed | empty state |
| POS search "Ankara" | `30 in stock` — sellable | `out of stock at this branch` |
| Mobile 390px products | — | `0 yard(s) · all branches: 30` |

- `npx tsc -b` clean; `npm run build` clean (client + API bundle).
- No console errors, no HTTP 5xx during the full walkthrough.

---

## 3. Files touched

```
api/reports/report-defs.ts            profit_margin GROUP BY fix (1.1)
src/components/reports/ResultView.tsx recharts width/height forwarding (1.2)
api/routers/products.router.ts        branchStock on reads, scoped history
api/routers/inventory.router.ts       scoped ledger/counts, branch adjust & low stock
api/routers/dashboard.router.ts       scoped summary & recent movements
api/routers/purchases.router.ts       scoped list/detail, branch stamp
api/routers/returns.router.ts         scoped list/detail
api/services/returns.service.ts       return stamped with sale's branch
api/routers/sales.router.ts           scoped reads + branch-stock checkout guard
api/routers/production.router.ts      branch material availability + detail guard
api/services/approvals.apply.ts       adjustment delta vs branch balance
src/pages/products/ProductsPage.tsx   branch stock column
src/pages/products/ProductDetailsPage.tsx branch vs company-wide stock
src/pages/pos/POSPage.tsx             branch-driven sellability
src/components/pos/ScanSearchPanel.tsx branch stock badges & blocking
src/components/inventory/ProductPicker.tsx branch stock display
src/pages/inventory/StockAdjustmentsPage.tsx branch balance label
src/pages/inventory/StockMovementsPage.tsx  scope copy
src/pages/inventory/LowStockPage.tsx        scope copy
src/pages/tailoring/ProductionNewRunPage.tsx branch material stock
```

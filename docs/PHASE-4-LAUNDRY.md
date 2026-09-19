# Phase 4 — Laundry Section

Full laundry module for Hadran Fabrics Mall: order intake, garment tracking,
workflow management, payments tied into the money ledger, customer history
and section reports.

## What ships

### Server
- **`api/services/laundry.service.ts`** — all laundry writes in one
  transactional layer:
  - `createLaundryOrder` — order (`LND-000001` sequence) + garment lines +
    optional deposit. Deposit writes a payment row AND a `LAUNDRY_PAYMENT`
    IN row to the money ledger, all in one transaction.
  - `addLaundryPayment` — validates against the outstanding balance
    (overpayment rejected), updates `amountPaid` / `paymentStatus`
    (`UNPAID → PART_PAID → PAID`), writes the ledger row.
  - `advanceLaundryStatus` — free-order moves through
    `RECEIVED → WASHING → DRYING → IRONING → READY → COLLECTED` (staff may
    skip stages, e.g. iron-only jobs). Terminal states (`COLLECTED`,
    `CANCELLED`) reject further moves. **Collection requires the bill to be
    fully paid** — the error tells staff the exact outstanding balance.
  - `cancelLaundryOrder` — cancels with reason; any money already taken is
    refunded automatically (negative payment row + compensating OUT row in
    the ledger) and the order's `amountPaid` resets to zero.
- **`api/routers/laundry.router.ts`** — endpoints:
  - `dashboard` — status board counts, net revenue today/month, outstanding
    balances, due/overdue list, recent orders, 30-day daily revenue series.
  - `list` / `exportRows` — filtered, paginated orders (status, payment,
    priority, date range, search) + unpaged export for CSV/Excel/print.
  - `getById` — order + garment lines + payments + status history with
    staff names.
  - `create` / `addPayment` / `advanceStatus` / `cancel` — writes, each
    audit-logged; permissions `laundry.manage`, `laundry.manage`,
    `laundry.advance_status`, `laundry.cancel` respectively.
  - `payments` / `exportPayments` — payment ledger with method/date/search
    filters.
  - `customers` — aggregated laundry customers (walk-ins included):
    orders, lifetime spend, outstanding balance, last visit. Cancelled
    orders excluded.
  - `reports` — date-ranged: totals (orders/billed/collected/outstanding/
    express), orders by status, revenue by service type, daily collections,
    top 10 customers, staff performance, average turnaround hours.

### Frontend (`src/pages/laundry/`)
- **`LaundryHomePage.tsx`** — section dashboard: 6 KPIs, clickable
  workflow board (each stage deep-links to a filtered orders list), 30-day
  revenue chart, due/overdue list, latest orders, quick links.
- **`LaundryOrdersPage.tsx`** — filterable order list (reads `?status=`
  deep links from the dashboard board), balance column, CSV/Excel export
  and print sheet.
- **`LaundryNewOrderPage.tsx`** — one-screen intake: walk-in or registered
  customer (search gated on `customers.view`), garment lines with preset
  garment types and suggested prices (`LAUNDRY_PRICE_GUIDE`), per-line
  service + condition notes, discount, due date, NORMAL/EXPRESS priority,
  optional deposit. Submits straight to the order detail and opens the
  print ticket (`?print=ticket`).
- **`LaundryOrderDetailPage.tsx`** — status strip, clickable workflow
  stepper, garments table with totals, payment panel (take payment,
  refund display), cancel dialog with automatic-refund notice, full status
  history timeline, printable customer ticket.
- **`LaundryPaymentsPage.tsx`** — payments ledger with KPIs
  (collected/refunds/net for the current page), filters, export, print.
- **`LaundryCustomersPage.tsx`** — aggregated customer table with repeat
  customer KPI, outstanding balances, loyalty crown for 5+ orders, export.
- **`LaundryReportsPage.tsx`** — date-range reports with presets
  (Today / This Month / All Time), 6 KPIs, revenue-by-service pie, daily
  collections bar, orders-by-status, top customers, staff performance,
  per-section export and a full print sheet.
- **`src/lib/laundry.ts`** — shared `LAUNDRY_WORKFLOW` order + badge tone
  maps for consistent status rendering.

### Contracts
- `LAUNDRY_GARMENT_TYPES` — 17 preset garment types (Agbada, Senator,
  Kaftan, Suit, … Other).
- `LAUNDRY_PRICE_GUIDE` — suggested default prices (₦) per garment; purely
  a starting point at intake.
- `LAUNDRY_TERMINAL_STATUSES` — `COLLECTED`, `CANCELLED`.
- Labels: `LAUNDRY_STATUS_LABELS`, `LAUNDRY_SERVICE_LABELS`,
  `ORDER_PAYMENT_STATUS_LABELS`.

## Money ledger integration
Every laundry payment writes `LAUNDRY_PAYMENT` movements (section
`LAUNDRY`): deposits and balance payments are IN rows, cancellation refunds
are OUT rows. The Money In/Out page, dashboard KPIs and reports all agree
because they read the same rows. Revenue figures are **net of refunds**.

## Operational rules enforced
- Overpayment beyond the outstanding balance is rejected.
- Garments cannot be marked COLLECTED while a balance remains — the error
  states the exact amount owed.
- Collected orders cannot be cancelled; cancelled orders cannot move or
  take payments.
- Cancelling a paid order refunds automatically (ledger + negative payment
  row) — no orphan money.
- Every create / payment / status move / cancel is audit-logged with the
  actor.

## Gotchas discovered (documented for future phases)
- **`lines` is a reserved word** in MySQL 8 / TiDB — never use it as a SQL
  alias (the reports `byService` query now aliases `lineCount`).
- Dashboard/report revenue sums must include negative (refund) payment
  rows to stay consistent with the money ledger.
- The `?print=ticket` deep link after intake auto-opens the browser print
  dialog with the customer ticket.

## Verified
- API (curl): create → WASHING → guard blocks COLLECTED with balance →
  pay balance → READY → COLLECTED; cancel-with-refund; dashboard, list,
  payments, customers, reports; money ledger cross-check; LAUNDRY role can
  view/manage but cannot cancel (403).
- Browser (Playwright): login → dashboard → orders → new order via the
  form → detail (toast + stepper + payments) → payments → customers →
  reports; mobile (390px) responsive check. No JS errors.
- `npm run build` passes; new files are `tsc -b` clean.

# Phase 5 — Tailoring Section & In-House Production

**Status:** ✅ Complete
**Date:** 2026-09-19

Phase 5 turns the tailoring placeholder into a full section: bespoke sewing
orders with measurements, tailor assignment and the workshop workflow, plus
in-house production runs that convert shop stock into new sellable products.

No new database tables were needed — Phase 1's migration already created
`tailoring_orders`, `tailoring_measurements`, `tailoring_payments`,
`tailoring_status_history`, `production_orders` and `production_materials`.

---

## 1. Contracts

### `contracts/constants.ts` (extended)
- `TAILORING_WORKFLOW` — forward path: RECEIVED → CUTTING → SEWING → FINISHING → FITTING → READY → DELIVERED.
- `TAILORING_TERMINAL_STATUSES` — DELIVERED, CANCELLED.
- `MEASUREMENT_FIELDS` — 14 standard fields (chest, waist, hips, shoulder, sleeve, armhole, neck, topLength, trouserLength, thigh, knee, ankle, gownLength, capSize), values in inches.
- `TAILORING_STYLE_PRESETS` — 15 common Nigerian styles (Senator Suit, Agbada 3-piece, Kaftan, Iro & Buba, …) to speed up intake.

### `contracts/labels.ts` (extended)
- `TAILORING_STATUS_LABELS`, `FABRIC_SOURCE_LABELS` ("Customer's Own Fabric" / "Shop Stock"), `PRODUCTION_STATUS_LABELS`.

## 2. Server — services

### `api/services/tailoring.service.ts`
Single transactional home for all tailoring writes (mirrors the laundry service):
- `createTailoringOrder` — order (TLR-000001…) + optional measurement set + optional deposit. Deposit writes a `TAILORING_PAYMENT` IN row to the money ledger (section `TAILORING`).
- `addTailoringPayment` — rejects over-payment, updates `amountPaid`/`paymentStatus`, writes the ledger IN row.
- `advanceTailoringStatus` — free-order moves (stages may be skipped), never out of a terminal state, **DELIVERED requires full payment**.
- `assignTailor` — assign/reassign/unassign; validates the tailor is an ACTIVE user; leaves a history entry.
- `saveMeasurements` — add or replace the order's measurement set (blocked after delivery/cancellation).
- `cancelTailoringOrder` — writes a negative payment row + compensating ledger OUT refund, then CANCELLED.

### `api/services/production.service.ts`
- `createProductionRun` — DRAFT run (PRD-000001…), output product + planned material lines with product-name snapshots.
- `startProductionRun` — deducts every material from stock via `recordMovement` (`PRODUCTION_OUT`, negative qty) and freezes `quantityUsed = quantityPlanned`. Throws if any material would go negative.
- `completeProductionRun` — books `outputQty` of the output product into stock (`PRODUCTION_IN`), stamps approver.
- `cancelProductionRun` — DRAFT: plain cancel. IN_PROGRESS: returns each consumed material to stock (`PRODUCTION_IN` on the material) before cancelling.

Stock only ever moves through `recordMovement`, so balances, movement
history and low-stock alerts stay consistent with the rest of inventory.

## 3. Server — routers

### `api/routers/tailoring.router.ts` (permission-gated)
| Endpoint | Permission | Notes |
|---|---|---|
| `dashboard` | tailoring.view | status board, today/month revenue, outstanding, overdue, recent, 30-day daily collections, per-tailor open workload |
| `list` / `exportRows` | tailoring.view | filters: status, paymentStatus, fabricSource, tailorId, date range, search (order no/customer/phone/style) |
| `getById` | tailoring.view | order + measurements + payments + history + tailor/received-by names |
| `create` | tailoring.manage | with optional measurements + deposit |
| `addPayment` | tailoring.manage | balance-guarded |
| `advanceStatus` | tailoring.advance_status | delivery gate on unpaid balance |
| `assignTailor` | tailoring.manage | |
| `saveMeasurements` | tailoring.manage | |
| `cancel` | tailoring.cancel | automatic refund |
| `payments` / `exportPayments` | tailoring.view | section payment ledger |
| `customers` | tailoring.view | aggregated from order history |
| `reports` | tailoring.view | totals, byStatus, top styles, daily, top customers, **tailor performance**, avg turnaround |

### `api/routers/production.router.ts`
`summary`, `list` (status/date/search over refNo + output product), `getById`
(materials with live `currentStock`), `create`, `start`, `complete`, `cancel` —
all writes under `production.manage`, reads under `production.view`.

Both routers registered in `api/router.ts` (`tailoring`, `production`).
All writes are audit-logged (`tailoring.*` / `production.*` actions).

## 4. Frontend

### `src/lib/tailoring.ts`
`TAILORING_WORKFLOW_ORDER`, `tailoringStatusTone`, `paymentStatusTone`, `productionStatusTone`.

### Pages (`src/pages/tailoring/`)
| Page | Route | Highlights |
|---|---|---|
| `TailoringHomePage` | `/tailoring` | 6 KPIs, 8-stage workflow board (deep-links), 30-day revenue chart, due/overdue list, **tailor workload**, quick links incl. production badge |
| `TailoringOrdersPage` | `/tailoring/orders` | filters + fabric source, tailor column, CSV/Excel export + print |
| `TailoringNewOrderPage` | `/tailoring/orders/new` | style presets + free text, fabric source, tailor picker (TAILORING-role staff), due date, collapsible 14-field measurement grid, price + deposit with live balance |
| `TailoringOrderDetailPage` | `/tailoring/orders/:id` | workflow stepper (click any stage), job card, measurements card + editor dialog, tailor assign dialog, payments + take-payment dialog, cancel with refund, history timeline, printable job ticket (measurements table) |
| `TailoringPaymentsPage` | `/tailoring/payments` | section ledger with collected/refund/net cards, export + print |
| `TailoringCustomersPage` | `/tailoring/customers` | aggregated customers, repeat count, outstanding |
| `TailoringReportsPage` | `/tailoring/reports` | KPIs, top-styles bar chart, daily collections, status/customer/tailor tables, print sheet |
| `ProductionRunsPage` | `/tailoring/production` | status summary cards, filterable runs list |
| `ProductionNewRunPage` | `/tailoring/production/new` | product pickers with live stock, material lines with overdraw warnings, draft-only creation |
| `ProductionRunDetailPage` | `/tailoring/production/:id` | materials planned/used/live-stock, Start / Complete / Cancel lifecycle, insufficient-stock banner, printable job sheet |

Routes wired in `src/App.tsx` (all behind `RequireSection("TAILORING")` +
the right `RequirePermission`); the 6 Phase-2 `ModulePlaceholder` routes and
their now-unused lucide imports were removed. Sidebar menu entries already
existed from Phase 2 (`src/config/navigation.ts`).

## 5. Fixes folded into this phase
- Pre-existing `tsc -b` errors from Phase 3 are now resolved: `expenseDate`
  string→Date comparisons in `api/routers/expenses.router.ts` +
  `api/services/expenses.service.ts`, unused `grandTotal` param in
  `api/services/money.service.ts` (renamed `_grandTotal`), and an unsafe cast
  in `ExpensesPage.tsx`. **`npm run check` is fully green.**
- Recharts pitfall found & fixed: a series whose data key is literally
  `style` crashes React ("style prop expects a mapping") because recharts
  spreads payload props onto tick elements. The top-styles chart maps to
  `styleName` instead.

## 6. Verification
- `npm run build` ✅ (vite + api bundle)
- `npx tsc -b` ✅ zero errors project-wide
- API smoke (curl, admin session): create TLR order with deposit + measurements → advance → **delivery blocked while ₦25,000 outstanding** → pay balance (BANK_TRANSFER) → deliver ✅
- Production: create PRD-000001 (2× Jewelry Set from 1.5 YD cashmere + 2 YD Ankara) → start (stock 14.5→13, 46→44) → complete (output 8→10) ✅
- Playwright sweep of all 10 new pages: zero page errors, no horizontal overflow at 390px ✅

## 7. Permissions recap
- `TAILORING` role default: tailoring.view/manage/advance_status, production.view (no cancel, no production.manage).
- `production.manage` and `tailoring.cancel` default to ADMIN / SUPER_ADMIN — grant via Roles page as needed.

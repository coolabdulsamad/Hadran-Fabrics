# Phase 3 — Expenses & Money Management

**Status:** ✅ Complete (build verified, browser-tested on desktop / tablet / mobile)

Phase 3 gives Hadran Fabrics Mall a full money trail: every naira that enters or
leaves the business — sales, voids, refunds, purchases, expenses and manual
entries — lands in one **money ledger**, plus a dedicated **expenses** module
with categories, approval gating and export/print.

---

## 1. Database

Tables were created in Phase 1 (`db/migrations/0001_*.sql`); Phase 3 adds data
seeds only (`db/migrations/0002_phase3_money.sql`, idempotent — applied to both
the local dev DB and the Railway production DB):

| Table | Purpose |
|---|---|
| `money_movements` | Append-only ledger of every IN/OUT movement (`MM-000001` refs) |
| `expenses` | Expense records (`EXP-000001` refs), status `ACTIVE` / `VOIDED` |

Seeds in `0002`:
- `money.manage` permission granted to **MANAGER** and **ADMIN** roles.
- `EXPENSE_RECORD` appended to the `workflow.gated_actions` settings row
  (manager-recorded expenses require admin sign-off).

## 2. Money ledger service — `api/services/money.service.ts`

| Helper | What it does |
|---|---|
| `recordMoneyMovement(input, tx?)` | Inserts one ledger row (auto `MM-XXXXXX` ref). Accepts an optional transaction handle so the movement is written **atomically with the business event** that caused it. |
| `netPayments(payments, grandTotal, changeGiven)` | Nets change out of CASH legs first (then largest legs) so IN rows sum to what the shop actually kept — a ₦5,000 tender on a ₦4,837.50 bill records **₦4,837.50 IN**, not ₦5,000. |

### Automatic ledger writers (all inside the same DB transaction as the event)

| Event | Direction | `sourceType` |
|---|---|---|
| POS checkout (per payment leg, change-netted) | IN | `SALE` |
| Sale voided | OUT | `SALE_VOID_REVERSAL` |
| Return with refund | OUT | `RETURN_REFUND` |
| Exchange with top-up payment | IN | `EXCHANGE_TOPUP` |
| Purchase order stock received | OUT | `PURCHASE` |
| Expense recorded | OUT | `EXPENSE` |
| Expense voided (compensating entry) | IN | `MANUAL_IN` (note: "Void reversal of expense …") |
| Manual entry (owner injection, bank deposit…) | IN/OUT | `MANUAL_IN` / `MANUAL_OUT` |

## 3. Expenses — `api/routers/expenses.router.ts`

| Procedure | Permission | Notes |
|---|---|---|
| `expenses.list` | `expenses.view` | Filters: section, category, status, method, date range, free-text search (ref/description/vendor); paged; joins `users` for `recordedByName`. |
| `expenses.exportRows` | `expenses.view` | Same filters, unpaged (max 5,000) for CSV/Excel/print. |
| `expenses.summary` | `expenses.view` | Month total/count, today total/count, top category, by-category and by-section breakdowns (`ACTIVE` rows only). |
| `expenses.record` | `expenses.record` | **MANAGER role is approval-gated** (`EXPENSE_RECORD`): the request is parked in the approvals queue and applied on admin approval with the *original* recorder's identity (`requestedBy`/`branchId` travel in the approval payload). Admins record directly. |
| `expenses.void` | `expenses.void` | Marks `VOIDED` with a reason and writes a compensating IN movement so the ledger always balances. |

## 4. Money ledger API — `api/routers/money.router.ts`

| Procedure | Permission | Notes |
|---|---|---|
| `money.list` | `money.view` | Filters: direction, source type, section, method, date range, search; paged. |
| `money.exportRows` | `money.view` | Unpaged export (max 10,000). |
| `money.summary` | `money.view` | KPIs (today / month / all-time in-out-net), 30-day daily IN/OUT series, by-source and by-section breakdowns. |
| `money.recordManual` | `money.manage` | Manual IN/OUT entries (owner cash injection, bank deposit, petty-cash top-up). Audited as `money.manual_entry`. |

> **TiDB / `only_full_group_by` note:** the 30-day series is a raw
> `db.execute(sql`…`)` query grouping by the select **aliases** (`GROUP BY day,
> direction`). Drizzle's select builder renders `DATE(col)` unqualified in the
> SELECT list but qualified in GROUP BY, which MySQL/TiDB rejects under
> `only_full_group_by`. Do not "simplify" it back into a drizzle select.

## 5. Frontend

| Piece | File | Highlights |
|---|---|---|
| Expenses page | `src/pages/expenses/ExpensesPage.tsx` | 4 KPI cards, category pie chart, by-section list, 7-filter bar, void dialog with reason, CSV/Excel export, print sheet. |
| Money ledger page | `src/pages/money/MoneyPage.tsx` | 6 KPI cards (in/out/net today, in/out month, all-time net), 30-day cash-flow bar chart (emerald IN / red OUT), by-source breakdown, 7 filters, manual-entry dialog, export/print. |
| Expense dialog | `src/components/expenses/ExpenseFormDialog.tsx` | Section, category, description, vendor, amount, method, date, notes; shows an approval notice banner for manager accounts. |
| Export button | `src/components/common/ExportButton.tsx` | Dropdown: **CSV** (BOM-prefixed via papaparse) or **Excel** (real `.xlsx` via `xlsx`). Accepts rows or an async row fetcher. |
| Filter bar | `src/components/common/FilterBar.tsx` | `FilterBar` + `FilterField` primitives, optional reset. |
| StatCard | `src/components/common/StatCard.tsx` | **Upgraded:** values auto-fit via `ResizeObserver` — the font shrinks pixel-by-pixel until the full value fits on one line. Never wraps mid-number, never truncates; full value + hint in a tooltip. |
| Navigation | `src/config/navigation.ts` | New **Money** group (SALES section): *Expenses* (`expenses.view`), *Money Ledger* (`money.view`). |

Routes (both wrapped in `RequireSection("SALES")` + `RequirePermission`):
`/expenses`, `/money`.

## 6. Verification performed

- **Checkout netting:** ₦4,837.50 sale, ₦5,000 tender → single IN row of ₦4,837.50 (`MM-000001`).
- **Void:** sale void → `SALE_VOID_REVERSAL` OUT ₦4,837.50.
- **Approval gate:** manager expense → parked (request `120001`) → admin approve → `EXP-000001` + OUT movement, recorded under the **manager's** identity.
- **Expense void:** compensating IN row appears in the ledger.
- **Permissions:** `sales1` gets 403 on `/expenses` and `/money` and sees no Money nav group; `money.list` rejects non-permitted roles server-side.
- **UI end-to-end (Playwright):** admin records an expense through the dialog → row appears in the table and as an OUT entry in the money ledger; manager dialog shows the approval notice; zero console errors; zero horizontal overflow at 390 / 768 / 1600 px on both pages.
- `npm run build` ✅

## 7. Known scope notes

- Expense categories are the fixed 12-value enum from Phase 1 (`EXPENSE_CATEGORY_LABELS`).
- Money movements are append-only: corrections happen through compensating entries (void reversals), never edits — this is deliberate, for auditability.
- Laundry/tailoring payments will write into the same ledger (their `section` column is already in place) when Phases 4–5 land.

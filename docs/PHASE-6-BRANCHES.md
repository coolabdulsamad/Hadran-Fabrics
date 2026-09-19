# Phase 6 — Branches & Inter-Branch Stock Transfers

**Status:** ✅ Complete
**Date:** 2026-09-19

Phase 6 turns Hadran Fabrics Mall into a multi-branch operation: branches can
be registered, staff are assigned to a home branch, every operational write is
tagged with the branch that made it, lists and dashboards are scoped to the
active branch, stock is tracked per branch, and inter-branch transfers move
stock through a proper request → approve → dispatch → receive lifecycle.

No new tables were needed — Phase 1's migration already created `branches`,
`stock_levels`, `branch_transfers` and `branch_transfer_items` (plus the
`branches.*` / `transfers.*` permissions). The only data change is migration
`0003`, which backfills `stock_levels` from existing product stock into MAIN.

---

## 1. Stock model — global total + per-branch split

- `products.currentStock` remains the **company-wide total** (unchanged
  behaviour everywhere it was already used).
- `stock_levels` holds the **per-branch split**. Invariant:
  `SUM(stock_levels.quantity) == products.currentStock` per product.
- Migration `0003_phase6_branches.sql` backfills every product's current stock
  onto MAIN (guarded, idempotent). Verified: 14 products, 283 units at MAIN,
  sums match `products.current_stock` exactly. Applied to local TiDB **and**
  the Railway production database.

### `api/services/inventory.service.ts` (extended)
- `MovementInput.branchId` — every movement can now name its acting branch.
- `recordMovement` — outbound stock comes from the acting branch first and
  **falls back to MAIN for any shortfall** (warehouse backs the shop floor);
  inbound lands on the acting branch. Global total + branch level + movement
  row (with `branch_id`) update atomically.
- `recordBranchTransfer` — used by transfers only: **strict per-branch
  availability** (no fallback), never touches the global total, writes
  `TRANSFER_OUT` / `TRANSFER_IN` movements whose `balanceAfter` is the
  branch-level balance.
- `getBranchBalance(productId, branchId)` — branch-level balance lookup.

Every `recordMovement` call site now threads a branch: sales (+ money legs),
expenses, laundry/tailoring/production writes, inventory stock-in/out/adjust/
count corrections, product opening stock, purchase receipts, return restocks,
sale-void reversals and approval-applied payloads.

## 2. Active branch — server-validated context

- Client sends `x-hfm-branch: <id>` on every tRPC call (httpBatchLink header
  read from the persisted zustand store `hadran.branch`).
- `api/context.ts` resolves `ctx.activeBranch` via
  `resolveActiveBranch(assignedBranchId, canSwitch, requestedBranchId)`:
  the requested branch is honoured only if the user has `branches.switch` and
  the branch is ACTIVE; otherwise the user's assigned branch, then MAIN.
- The client re-syncs from `branches.myContext` — if the server resolved
  something different (e.g. the stored branch was deactivated), the store
  adopts the server's answer.
- **Switch race fix:** a shared `lastSwitchAt` timestamp in the store guards
  every `useBranch()` re-sync effect — responses fetched *before* the user's
  latest switch describe the old branch and are ignored. (Found via Playwright:
  three hook consumers were each reverting the pick with stale data.)

### Scoping rule — `branchScope(column, branch)`
- MAIN sees its own rows **plus legacy NULL `branch_id` rows**.
- Other branches see only their own rows.
- Applied to: sales history, expenses (list/summary/export), money ledger
  (list/summary/export/daily/bySource/bySection), laundry & tailoring
  (orders, dashboards, payments, customers, reports incl. raw-SQL blocks) and
  production runs.

## 3. Transfers — built-in approval lifecycle

`PENDING_APPROVAL → APPROVED → IN_TRANSIT → RECEIVED` (or REJECTED / CANCELLED).

- Deliberately **not** routed through `approval_requests` — transfers carry
  their own approver (`requestedBy ≠ approver`, enforced server-side).
- `createTransfer` — strict per-item balance check at the source branch,
  ref `TRF-000001…`, starts PENDING_APPROVAL.
- `approveTransfer` / `rejectTransfer` — approver must differ from requester.
- `sendTransfer` — deducts planned quantities at the **source** branch.
- `receiveTransfer` — credits **received** quantities at the destination.
  **Shortfall returns to the source branch** (`TRF-…-RTN` movement), keeping
  the global-sum invariant intact; genuine losses go through inventory
  adjustments afterwards.
- `cancelTransfer` — only before dispatch (no stock has moved).

### Verified end-to-end (curl, local TiDB)
1. Created branch `GWA` (Hadran Fabrics — Gwarinpa).
2. Admin created TRF-000001 MAIN→GWA (5 yd Ankara + 3 pc Fila Cap).
3. Self-approve correctly rejected ("requester cannot approve their own
   transfer"); manager approved.
4. Dispatch deducted at MAIN; receive accepted 4.5/3 (partial on Ankara).
5. `stock_levels`: Ankara MAIN 31.5 + GWA 4.5 = 36.00 == global 36.000 ✓;
   Fila Cap MAIN 11 + GWA 3 = 14.00 == global 14.000 ✓.
6. Scoping: sales.history total 4 at MAIN vs 0 at GWA; transfers.list at GWA
   shows TRF-000001.

## 4. Frontend

- `src/store/branch-store.ts` — persisted pick + shared `lastSwitchAt`.
- `src/hooks/use-branch.ts` — myContext query, re-sync effect, `switchBranch`
  (guarded by `branches.switch`, invalidates every query).
- `src/providers/trpc.tsx` — `x-hfm-branch` header injection.
- `src/components/layout/BranchSwitcher.tsx` — topbar chip: dropdown for
  switchers (colour dots + active check), static chip otherwise;
  `BranchThemeStrip` paints a gradient bar under the topbar and exposes
  `--branch-primary` / `--branch-accent` CSS variables per branch.
- `src/lib/branches.ts` — `branchStatusTone`, `transferStatusTone`,
  `TRANSFER_FLOW` stepper constant.

### Pages
- `/branches` — stat cards (branches / active / staff / main), table with
  theme swatches + status, register-branch dialog (`branches.manage`).
- `/branches/:id` — edit identity & theme colours, activate/deactivate (MAIN
  protected), staff roster with assign/remove via `users.list` picker, live
  stats (staff, stocked products + units, month sales, month expenses, open
  transfers).
- `/transfers` — summary cards (pending / approved / in transit / received
  this month), direction + status + date + search filters, paginated table.
- `/transfers/new` — destination picker, product search against **this
  branch's** stock (`branches.stockAt`), quantity lines with overdraw
  warnings, note, submit for approval.
- `/transfers/:id` — lifecycle stepper, actor/timestamp cards, items with
  planned vs received (shortages highlighted), guarded action buttons
  (Approve/Reject/Send/Receive with per-line received quantities/Cancel),
  printable transfer note with signature lines.

### Navigation
New shared **Branches** group (visible in every workspace): Branches
(`branches.view`) and Stock Transfers (`transfers.view`). Routes are
permission-gated in `App.tsx` (no section gate — branches span sections).

## 5. Notable fixes during verification

- `branchStock` correlated subquery was ambiguous (`id` matched multiple
  `stock_levels` rows) → rewritten as
  `(SELECT COALESCE(SUM(sl.quantity),0) … WHERE sl.product_id = products.id …)`.
- Partial receipt leaked stock out of `stock_levels` (shortfall vanished) →
  shortfall now returns to the source branch automatically.
- Branch switch raced the re-sync effect (three hook consumers each reverted
  the pick) → shared `lastSwitchAt` guard in the store.
- `src/hooks/use-debounce.ts` was an empty stub → implemented `useDebounce`.

## 6. Verification

- `npx tsc -b` clean; `npm run build` clean.
- curl lifecycle: create → guard → approve → send → partial receive (above).
- Playwright sweep: all 5 pages at 1440px and 390px — no console errors;
  switcher dropdown, theme strip and CSS variables verified live after
  switching to GWA.

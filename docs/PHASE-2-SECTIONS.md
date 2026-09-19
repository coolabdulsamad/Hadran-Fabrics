# Phase 2 — Sections Framework

**Status:** ✅ Complete · **Depends on:** Phase 1 (database foundation)

Phase 2 turns the app from a single-workspace tool into a **multi-section suite**:
Sales & Inventory, Laundry, and Tailoring — each with its own menus, home page,
routes and access rules.

---

## 1. What staff experience now

| Moment | Behaviour |
|---|---|
| **Login (multi-section role)** — Manager, Admin, Super Admin | Lands on the **Section Picker** (`/sections`): three cards — Sales & Inventory, Laundry, Tailoring. Picking one opens that workspace. |
| **Login (single-section role)** — Sales, Laundry, Tailoring staff | Goes **straight into their own section** (no picker needed). |
| **Deep links** | If you were sent to a page while logged out, you return to that exact page after login. |
| **Header** | Always shows the **current branch name** and a **section chip** (gold = Sales & Inventory, cyan = Laundry, violet = Tailoring). Multi-section roles click the chip to switch sections anytime. |
| **Sidebar** | Shows only the menus of the **active section**, plus the shared Workspace group (Team Chat, Approvals, Settings, Audit Logs — still permission-gated). |
| **User menu** | "Switch Section" entry for multi-section roles. |
| **Direct URL into another section** | `RequireSection` guard switches the active section automatically (for allowed roles) or shows 403 (for roles locked out). |

## 2. Role → section access matrix

| Role | Sales & Inventory | Laundry | Tailoring | Lands on |
|---|:-:|:-:|:-:|---|
| SALES | ✅ | 🔒 | 🔒 | `/dashboard` |
| LAUNDRY | 🔒 | ✅ | 🔒 | `/laundry` |
| TAILORING | 🔒* | 🔒 | ✅ | `/tailoring` |
| MANAGER / ADMIN / SUPER_ADMIN | ✅ | ✅ | ✅ | `/sections` picker |

\* Tailoring staff hold `products.view` only (needed later to pick production materials) —
they cannot open the sales dashboard, POS or inventory pages.

Locked sections appear **greyed out with a lock** on the picker. Trying the URL directly
returns the 403 page. The Dashboard is additionally section-guarded so laundry/tailoring
staff never see shop sales figures.

## 3. New pages

| Route | Page | Notes |
|---|---|---|
| `/sections` | Section Picker | Standalone gateway page with per-section accent cards |
| `/laundry` | Laundry Home | **Live KPIs**: active orders, ready for collection, due soon, unpaid orders, collected today — plus quick links into the module |
| `/tailoring` | Tailoring Home | Same pattern, plus an In-House Production quick link |
| `/laundry/orders`, `/laundry/orders/new`, `/laundry/payments`, `/laundry/customers`, `/laundry/reports` | Honest placeholders | "Arrives in Phase 4" — navigation is already complete |
| `/tailoring/orders`, `/tailoring/orders/new`, `/tailoring/production`, `/tailoring/payments`, `/tailoring/customers`, `/tailoring/reports` | Honest placeholders | "Arrives in Phase 5" |

## 4. Backend changes

- **`SessionUser`** now carries `branchId`, `branchName`, `branchCode` (resolved from the
  `branches` table at login and on every session restore) — this powers the branch name in
  the header and, in Phase 6, per-branch data isolation.
- **New `sections.overview` endpoint** (`api/routers/sections.router.ts`): real-time headline
  numbers per section (order-status counts, unpaid count, due-soon count, today's collections
  for laundry/tailoring; today's sales for the shop).

## 5. Key frontend pieces

| File | Purpose |
|---|---|
| `contracts/roles.ts` | `ROLE_SECTIONS` — which sections each role may enter; `ROLE_HOME_SECTION` typed to `Section` |
| `contracts/constants.ts` | `SECTION_LABELS`, `SECTION_DESCRIPTIONS`, `SECTION_HOME` |
| `src/store/section-store.ts` | Persisted active section (zustand), `allowedSections()`, `landingRouteFor()` |
| `src/hooks/use-section.ts` | Effective section = persisted choice validated against the role |
| `src/config/navigation.ts` | Nav groups tagged per section; `visibleSections(permissions, section)` |
| `src/components/layout/guards.tsx` | `RequireSection` guard |
| `src/components/layout/Topbar.tsx` | Section chip + branch name |
| `src/pages/sections/SectionPickerPage.tsx` | The picker |
| `src/pages/sections/SectionHomePage.tsx` | Shared laundry/tailoring home (KPIs + quick links) |

## 6. Verified

- ✅ Admin → picker → Laundry → Tailoring → placeholder pages, all clean at 1600px
- ✅ Sales staff → straight to dashboard; `/laundry` → 403; picker shows locked cards
- ✅ Laundry staff → straight to `/laundry`; `/tailoring` and `/dashboard` → 403
- ✅ Deep-link preserved through login (`/sales/my` → login → `/sales/my`)
- ✅ No horizontal overflow at 390px / 768px / 1600px on any new page
- ✅ `npm run build` clean

**Test account created (local dev DB only):** `laundry1` / `Laundry@123` (LAUNDRY role).

## 7. Next up

**Phase 3 — Expenses & Money Management** (money in/out ledger, KPI cards, filters,
charts, CSV/Excel/print) on the `expenses` + `money_movements` tables from Phase 1.

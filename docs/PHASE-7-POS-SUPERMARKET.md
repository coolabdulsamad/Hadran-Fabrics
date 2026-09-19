# Phase 7 — POS Terminal: Supermarket-Style Redesign

**Status:** ✅ Complete
**Date:** 2026-09-19

Phase 7 rebuilds the POS terminal the way supermarket tills work. The old
product-card grid (with category filter chips) was slow and space-hungry with
a supermarket-sized catalog — foodstuffs, drinks and fabrics together. The
terminal is now **scan-first, search-second, cart-dominant**.

No backend changes were needed — the redesign is entirely client-side, on top
of the existing `products.list` / `products.byBarcode` / `sales.*` endpoints.

---

## 1. What changed

### Removed
- **Product card grid** (`ProductSearchPanel.tsx` deleted) — the tall image
  cards that loaded 60 products at a time and ate the screen.
- **Category filter chips** — search + scanner are the whole workflow now.
- **Mobile cart drawer** — on phones the cart IS the screen; no drawer needed.

### Added / rewritten
- **`src/components/pos/ScanSearchPanel.tsx`** (new) — slim scan/search rail:
  - Big autofocus scan box ("Scan barcode or type name / SKU…").
  - Compact result **rows** (monogram/image, name, SKU • colour • stock,
    price per unit) — tap to add.
  - **Enter adds the top match**, supermarket style:
    1. exact barcode/SKU among loaded results (free),
    2. code-like input (`6+` chars of `[0-9A-Za-z-]`) resolved straight
       against `products.byBarcode` — this is the path a hardware scanner
       takes when it types into the focused box faster than the debounce,
    3. otherwise the first in-stock search hit.
  - First in-stock row carries a `⏎ Enter` key hint; out-of-stock rows are
    disabled inline; measured (fractional) products keep their badge and
    still open the measurement dialog on pick.
  - Mobile: results float as an overlay dropdown under the box; desktop:
    inline scroll list with a "Terminal ready" idle state.
  - No initial catalog fetch — queries fire only while searching
    (`pageSize: 20`, 250 ms debounce).
- **`src/components/pos/CartPanel.tsx`** (rewritten) — the dominant panel:
  - Receipt-style **numbered lines** (#1, #2, …) with full product detail:
    image, name, SKU, unit price, measured-cut badge.
  - Quantity: steppers **plus type-in entry** (commits on blur/Enter,
    clamped to stock; fractional products keep 0.5 steps).
  - Item discount button, line net total with strikethrough gross, remove.
  - Oversized totals block (₦ total at 3xl) and `h-12` Hold / Charge actions.
- **`src/pages/pos/POSPage.tsx`** (rewritten layout):
  - Desktop grid `[minmax(340px,390px) minmax(0,1fr)]` — search rail left,
    cart takes the majority.
  - Mobile: single column, search on top, cart below — fully responsive,
    zero horizontal overflow at 390 px.
  - Scanner beeps (below); "last scan" chip in the header now also updates
    when a scanner types into the focused search box (`onCodeScan`).
- **`src/lib/sounds.ts`** — added `playBeep("scan" | "error")`: synthesised
  WebAudio supermarket beep (1.76 kHz / 90 ms) and error buzz (220 Hz /
  250 ms). No audio assets needed; respects the existing mute setting.
- **`index.html` + `public/favicon.svg`** — brand favicon (navy/gold "H"
  monogram). Fixes the pre-existing `/favicon.ico` 404 console noise on
  every page load.
- **`MeasurementInput.tsx`** — `PosProduct` type import repointed to the new
  panel (no behaviour change).

## 2. Scan paths — both verified

| Scanner state | Path | Result |
|---|---|---|
| Search box focused (default, autofocus) | digits land in the box → Enter → `byBarcode` resolve | ✅ adds + beeps + badge updates |
| Box not focused | global keyboard-wedge hook catches the burst | ✅ adds + beeps + badge updates |

Measured/fractional products (e.g. French Cord Lace) open the measurement
dialog from **both** paths — scanning a fabric still asks for the cut length.

## 3. Verification

- `npx tsc -b` clean; `npm run build` clean (`dist/public/index.html` emitted).
- Playwright at **1440 px and 390 px**: header + scan box render, category
  chips gone (`All` chip count = 0), search "a" → 14 result rows, Enter → top
  match in cart, cart header + Charge button present, **0 px horizontal
  overflow**, zero console errors.
- Hardware-scanner burst simulation (fast keystrokes + Enter terminator):
  both focus paths add the right product; quantity type-in commits (`3`);
  last-scan badge shows the code.
- Deletion of `ProductSearchPanel.tsx` confirmed safe — sole importer was
  `POSPage.tsx`.

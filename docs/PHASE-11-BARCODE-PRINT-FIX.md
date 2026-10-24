# Phase 11 — Bugfix: Blank Barcode Label Printing

## Symptom

On **Products → Barcode Labels** (`/products/barcodes`), clicking **Print** opened the
browser print dialog with a completely blank preview page, even though the label
sheet (HADRAN FABRICS MALL header, CODE128 barcodes, prices, SKUs) rendered
correctly on screen.

## Root cause

`src/index.css` had an unconditional print rule:

```css
@media print {
  body > *:not(#print-root) { display: none !important; }
}
```

`#print-root` is only created while a `PrintPortal` consumer (POS receipt,
studio reports, laundry/tailoring slips, etc.) is mounted. The barcode label
page prints **in-page** content via the legacy `.receipt-print-area` fallback —
no `PrintPortal`, so `#print-root` does not exist. The selector then matched
**every** direct child of `<body>`, `display:none`'d the whole app root, and
the visibility-based `.receipt-print-area` fallback could not recover it
(an ancestor's `display:none` beats any descendant `visibility: visible`).
Result: a blank sheet.

## Fix

One selector change in `src/index.css` — strip the app **only when the print
root actually has content**:

```css
@media print {
  body:has(#print-root > *) > *:not(#print-root) {
    display: none !important;
  }
  /* ... visibility fallbacks unchanged ... */
}
```

- Receipt-style prints (PrintPortal mounted) behave exactly as before:
  app stripped, `#print-root` content printed on the 80mm receipt page.
- In-page print areas (barcode labels, `#studio-print-root` reports) now work:
  with no `#print-root` content, the visibility fallback shows only
  `.receipt-print-area` and hides everything else.

## Verification (headless Chromium against the live app)

- Logged in, opened `/products/barcodes`, selected 3 products.
- Screen: 3 labels rendered. Print media emulation: **3 labels + 3 barcode
  SVGs visible**; print-to-PDF produced all three labels on A4 (previously blank).
- Regression check with a mounted `#print-root` + `.print-receipt`: app root
  `display: none`, print root printed — receipt path unaffected.

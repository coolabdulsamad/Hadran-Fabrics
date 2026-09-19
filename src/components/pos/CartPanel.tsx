import { useState } from "react";
import { Minus, Plus, Trash2, Percent, UserRound, PauseCircle, CreditCard, Eraser, Crown, ReceiptText } from "lucide-react";
import { useCartStore, computeTotals, type PosConfigSnapshot } from "@/store/cart-store";
import type { CartLine } from "@contracts/pos";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatQty } from "@/lib/format";
import { UNIT_LABELS } from "@contracts/constants";
import { cn } from "@/lib/utils";

/**
 * HADRAN FABRICS MALL — supermarket cart panel (Phase 7).
 * The dominant half of the terminal: receipt-style numbered lines with
 * full product detail (image, SKU, unit price, measured-cut badge),
 * steppers AND type-in quantities, item discounts, customer chip,
 * complete totals breakdown and oversized Hold / Charge actions.
 */

interface CartPanelProps {
  config: PosConfigSnapshot;
  canItemDiscount: boolean;
  canCartDiscount: boolean;
  canHold: boolean;
  onItemDiscount: (line: CartLine) => void;
  onCartDiscount: () => void;
  onCustomerClick: () => void;
  onHold: () => void;
  onCharge: () => void;
  holding: boolean;
  charging: boolean;
}

/** Quantity box: steppers plus type-in entry (commits on blur/Enter). */
function QtyInput({
  line,
  step,
  onCommit,
}: {
  line: CartLine;
  step: number;
  onCommit: (qty: number) => void;
}) {
  const [text, setText] = useState<string | null>(null);

  const commit = () => {
    if (text === null) return;
    const n = Number(text);
    if (Number.isFinite(n) && n > 0) {
      onCommit(Number(Math.min(n, line.maxStock).toFixed(3)));
    }
    setText(null);
  };

  return (
    <div className="flex items-center rounded-lg border border-border bg-card">
      <button
        type="button"
        className="px-2.5 py-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
        disabled={line.quantity <= step}
        onClick={() => onCommit(Number((line.quantity - step).toFixed(3)))}
        aria-label="Decrease quantity"
      >
        <Minus className="h-4 w-4" />
      </button>
      <input
        data-no-scan
        inputMode="decimal"
        value={text ?? formatQty(line.quantity)}
        onFocus={(e) => {
          setText(String(line.quantity));
          e.target.select();
        }}
        onChange={(e) => setText(e.target.value.replace(/[^0-9.]/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        className="h-9 w-16 border-x border-border bg-transparent text-center text-sm font-semibold tabular-nums outline-none focus:bg-gold-500/5"
        aria-label={`Quantity of ${line.name}`}
      />
      <button
        type="button"
        className="px-2.5 py-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
        disabled={line.quantity >= line.maxStock}
        onClick={() => onCommit(Number(Math.min(line.quantity + step, line.maxStock).toFixed(3)))}
        aria-label="Increase quantity"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

export function CartPanel({
  config,
  canItemDiscount,
  canCartDiscount,
  canHold,
  onItemDiscount,
  onCartDiscount,
  onCustomerClick,
  onHold,
  onCharge,
  holding,
  charging,
}: CartPanelProps) {
  const lines = useCartStore((s) => s.lines);
  const customer = useCartStore((s) => s.customer);
  const cartDiscountAmount = useCartStore((s) => s.cartDiscountAmount);
  const cartDiscountNote = useCartStore((s) => s.cartDiscountNote);
  const setQuantity = useCartStore((s) => s.setQuantity);
  const removeLine = useCartStore((s) => s.removeLine);
  const clear = useCartStore((s) => s.clear);

  const totals = computeTotals(lines, cartDiscountAmount, customer, config);
  const empty = lines.length === 0;

  const stepFor = (l: CartLine) => (l.allowFractional ? 0.5 : 1);

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-gold-500/25 bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-navy-900 text-gold-400">
            <ReceiptText className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-display text-lg font-semibold leading-tight text-navy-900">Current Sale</h2>
            <p className="text-xs text-muted-foreground">
              {lines.length} line{lines.length === 1 ? "" : "s"} • {formatQty(totals.itemCount)} item
              {totals.itemCount === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        {!empty && (
          <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" onClick={clear}>
            <Eraser className="mr-1.5 h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      {/* Customer chip */}
      <div className="border-b border-border px-4 py-2.5 sm:px-5">
        <button
          type="button"
          onClick={onCustomerClick}
          className="flex w-full items-center gap-2.5 rounded-xl border border-dashed border-border px-3 py-2 text-left transition-colors hover:border-gold-500/60 hover:bg-gold-500/5"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-900 text-gold-400">
            <UserRound className="h-4 w-4" />
          </span>
          {customer ? (
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <span className="truncate">{customer.fullName}</span>
                {customer.discountPercent > 0 && (
                  <Badge className="bg-gold-500/15 text-[10px] text-gold-700" variant="outline">
                    <Crown className="mr-0.5 h-3 w-3" />
                    {customer.discountPercent}%
                  </Badge>
                )}
              </span>
              <span className="text-[11px] text-muted-foreground">Tap to change customer</span>
            </span>
          ) : (
            <span className="flex-1">
              <span className="block text-sm font-medium text-muted-foreground">Walk-in customer</span>
              <span className="text-[11px] text-muted-foreground">Tap to attach a registered customer</span>
            </span>
          )}
        </button>
      </div>

      {/* Lines — supermarket receipt style */}
      <div className="scrollbar-lux min-h-0 flex-1 overflow-y-auto px-3 py-2 sm:px-4">
        {empty ? (
          <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 text-muted-foreground">
            <CreditCard className="h-10 w-10" />
            <p className="text-sm font-medium">Cart is empty</p>
            <p className="max-w-[260px] text-center text-xs leading-relaxed">
              Scan a barcode or search on the left — items land here with their full details.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {lines.map((l, idx) => {
              const gross = l.unitPrice * l.quantity;
              const net = gross - l.discountAmount;
              const step = stepFor(l);
              return (
                <li
                  key={l.productId}
                  className="flex items-start gap-3 rounded-xl border border-border bg-background/60 p-3"
                >
                  {/* Line number */}
                  <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy-900/5 font-mono text-[11px] font-semibold text-navy-800">
                    {idx + 1}
                  </span>

                  {/* Image / monogram */}
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-navy-900/5 font-display text-sm font-semibold text-gold-600">
                    {l.imageUrl ? (
                      <img src={l.imageUrl} alt={l.name} className="h-full w-full object-cover" />
                    ) : (
                      l.name.slice(0, 2).toUpperCase()
                    )}
                  </span>

                  {/* Details + controls */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{l.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {l.sku} • {formatCurrency(l.unitPrice)}/
                      {UNIT_LABELS[l.unit as keyof typeof UNIT_LABELS] ?? l.unit}
                      {l.isMeasuredCut && " • measured cut"}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <QtyInput
                        line={l}
                        step={step}
                        onCommit={(qty) => setQuantity(l.productId, qty)}
                      />
                      <span className="text-[11px] text-muted-foreground">
                        {UNIT_LABELS[l.unit as keyof typeof UNIT_LABELS] ?? l.unit} · max {formatQty(l.maxStock)}
                      </span>
                      {canItemDiscount && l.discountEligible && (
                        <button
                          type="button"
                          onClick={() => onItemDiscount(l)}
                          className={cn(
                            "flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors",
                            l.discountAmount > 0
                              ? "border-gold-500 bg-gold-500/15 text-gold-700"
                              : "border-border text-muted-foreground hover:border-gold-500/50",
                          )}
                        >
                          <Percent className="h-3 w-3" />
                          {l.discountAmount > 0 ? `−${formatCurrency(l.discountAmount)}` : "Discount"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Line total + remove */}
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-display text-base font-semibold tabular-nums text-navy-900">
                      {formatCurrency(net)}
                    </span>
                    {l.discountAmount > 0 && (
                      <span className="text-[11px] text-muted-foreground line-through">
                        {formatCurrency(gross)}
                      </span>
                    )}
                    <button
                      type="button"
                      className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
                      onClick={() => removeLine(l.productId)}
                      aria-label={`Remove ${l.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Totals + actions */}
      <div className="border-t border-border px-4 py-3 sm:px-5">
        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatCurrency(totals.subtotal + totals.itemDiscountTotal)}</span>
          </div>
          {totals.itemDiscountTotal > 0 && (
            <div className="flex justify-between text-emerald-700">
              <span>Item discounts</span>
              <span className="tabular-nums">−{formatCurrency(totals.itemDiscountTotal)}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <button
              type="button"
              disabled={!canCartDiscount || empty}
              onClick={onCartDiscount}
              className={cn(
                "flex items-center gap-1 text-muted-foreground transition-colors",
                canCartDiscount && !empty && "hover:text-gold-700",
                totals.cartDiscount > 0 && "text-emerald-700",
              )}
            >
              <Percent className="h-3.5 w-3.5" />
              Cart discount
              {totals.cartDiscount > 0 && cartDiscountNote && (
                <span className="max-w-[110px] truncate text-[10px]">({cartDiscountNote})</span>
              )}
            </button>
            <span className={cn("tabular-nums", totals.cartDiscount > 0 ? "text-emerald-700" : "text-muted-foreground")}>
              {totals.cartDiscount > 0 ? `−${formatCurrency(totals.cartDiscount)}` : formatCurrency(0)}
            </span>
          </div>
          {totals.customerDiscount > 0 && (
            <div className="flex justify-between text-emerald-700">
              <span>Customer discount ({customer?.discountPercent}%)</span>
              <span className="tabular-nums">−{formatCurrency(totals.customerDiscount)}</span>
            </div>
          )}
          <div className="flex justify-between text-muted-foreground">
            <span>VAT</span>
            <span className="tabular-nums">{formatCurrency(totals.taxTotal)}</span>
          </div>
          {totals.serviceCharge > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Service charge</span>
              <span className="tabular-nums">{formatCurrency(totals.serviceCharge)}</span>
            </div>
          )}
          <div className="gold-divider my-2" />
          <div className="flex items-end justify-between">
            <span className="font-display text-base font-semibold text-navy-900">Total</span>
            <span className="font-display text-3xl font-bold tabular-nums text-navy-900">
              {formatCurrency(totals.grandTotal)}
            </span>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <Button
            variant="outline"
            className="h-12 flex-1"
            disabled={empty || !canHold || holding || charging}
            onClick={onHold}
          >
            <PauseCircle className="mr-1.5 h-4 w-4" />
            {holding ? "Holding…" : "Hold"}
          </Button>
          <Button
            className="h-12 flex-[2] bg-gold-500 text-lg font-bold text-navy-950 hover:bg-gold-400"
            disabled={empty || holding || charging}
            onClick={onCharge}
          >
            <CreditCard className="mr-1.5 h-5 w-5" />
            {charging ? "Processing…" : `Charge ${formatCurrency(totals.grandTotal)}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

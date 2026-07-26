import { useEffect, useMemo, useState } from "react";
import { Percent, Banknote } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * HADRAN FABRICS MALL — discount dialog (item-level and cart-level).
 * Caps enforced client-side; the server re-validates everything at checkout.
 */

interface DiscountDialogProps {
  open: boolean;
  onClose: () => void;
  /** "item" discounts one cart line; "cart" discounts the whole sale. */
  mode: "item" | "cart";
  title: string;
  /** Base the discount applies to (line gross or cart subtotal). */
  baseAmount: number;
  currentAmount: number;
  maxPercent: number;
  /** Cart discounts carry an optional reason note. */
  currentNote?: string;
  onConfirm: (amount: number, note: string) => void;
}

export function DiscountDialog({
  open,
  onClose,
  mode,
  title,
  baseAmount,
  currentAmount,
  maxPercent,
  currentNote = "",
  onConfirm,
}: DiscountDialogProps) {
  const [value, setValue] = useState("0");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setValue(currentAmount > 0 ? String(currentAmount) : "");
      setNote(currentNote);
    }
  }, [open, currentAmount, currentNote]);

  const maxAmount = useMemo(() => Number(((maxPercent / 100) * baseAmount).toFixed(2)), [maxPercent, baseAmount]);
  const amount = useMemo(() => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }, [value]);

  const valid = amount >= 0 && amount <= maxAmount && amount <= baseAmount;

  const quickPercents = [5, 10, 15, 20, 25, 30].filter((p) => p <= maxPercent);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border-gold-500/30 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-navy-900">
            <Percent className="h-5 w-5 text-gold-600" />
            {mode === "item" ? "Item Discount" : "Cart Discount"}
          </DialogTitle>
          <DialogDescription>
            {title} — base {formatCurrency(baseAmount)}, maximum allowed {formatCurrency(maxAmount)} ({maxPercent}%).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Banknote className="h-4 w-4 text-gold-600" />
              Discount amount (₦)
            </label>
            <Input
              data-no-scan
              type="number"
              min="0"
              step="50"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0.00"
              className="input-lux h-12 text-center text-xl font-semibold"
              autoFocus
              onFocus={(e) => e.target.select()}
            />
          </div>

          {quickPercents.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {quickPercents.map((p) => {
                const v = Number(((p / 100) * baseAmount).toFixed(2));
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setValue(String(v))}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                      amount === v
                        ? "border-gold-500 bg-gold-500/15 text-gold-700"
                        : "border-border hover:border-gold-500/50",
                    )}
                  >
                    {p}%
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setValue("0")}
                className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-red-300 hover:text-red-600"
              >
                Clear
              </button>
            </div>
          )}

          {mode === "cart" && amount > 0 && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Reason (optional)</label>
              <Input
                data-no-scan
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Loyal customer, bulk purchase…"
                className="input-lux"
                maxLength={255}
              />
            </div>
          )}

          {!valid && amount > 0 && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              Discount exceeds the allowed maximum of {formatCurrency(maxAmount)} for this {mode}.
            </p>
          )}

          <div className="flex items-center justify-between rounded-xl bg-navy-900/5 px-4 py-3">
            <span className="text-sm text-muted-foreground">{mode === "item" ? "Line" : "Cart"} after discount</span>
            <span className="font-display text-xl font-semibold text-navy-900">
              {formatCurrency(Math.max(0, baseAmount - (valid ? amount : 0)))}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            className="bg-gold-500 text-navy-950 hover:bg-gold-400"
            onClick={() => {
              onConfirm(Number(amount.toFixed(2)), note.trim());
              onClose();
            }}
          >
            Apply Discount
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

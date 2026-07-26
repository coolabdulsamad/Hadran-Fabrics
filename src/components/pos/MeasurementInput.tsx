import { useEffect, useMemo, useState } from "react";
import { Ruler, Scissors } from "lucide-react";
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
import { formatCurrency, formatQty } from "@/lib/format";
import { UNIT_LABELS } from "@contracts/constants";
import type { PosProduct } from "./ProductSearchPanel";
import { cn } from "@/lib/utils";

/**
 * HADRAN FABRICS MALL — measured-cut quantity dialog.
 * Fabrics are sold by the yard from full packs: the cashier measures,
 * cuts, and enters the yardage here. Quick chips cover common cuts
 * (1, 1.5, 2, 3 yards … full pack).
 */

interface MeasurementInputProps {
  product: PosProduct | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (quantity: number) => void;
}

export function MeasurementInput({ product, open, onClose, onConfirm }: MeasurementInputProps) {
  const [value, setValue] = useState("1");

  useEffect(() => {
    if (open) setValue("1");
  }, [open, product?.id]);

  const qty = useMemo(() => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }, [value]);

  if (!product) return null;

  const unitLabel = UNIT_LABELS[product.unitOfMeasure as keyof typeof UNIT_LABELS] ?? product.unitOfMeasure;
  const maxStock = product.currentStock;
  const valid = qty > 0 && qty <= maxStock;
  const lineTotal = valid ? qty * product.sellingPrice : 0;

  // Quick picks: common yard cuts + full-pack shortcut.
  const quick: number[] = [1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6].filter((q) => q <= maxStock);
  if (product.packSize && product.packSize <= maxStock && !quick.includes(product.packSize)) {
    quick.push(product.packSize);
    quick.sort((a, b) => a - b);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border-gold-500/30 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-navy-900">
            <Scissors className="h-5 w-5 text-gold-600" />
            Measure &amp; Cut
          </DialogTitle>
          <DialogDescription>
            {product.name} — {formatCurrency(product.sellingPrice)} per {unitLabel.toLowerCase()}.
            {product.packSize ? ` Full pack = ${formatQty(product.packSize)} ${unitLabel.toLowerCase()}.` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Ruler className="h-4 w-4 text-gold-600" />
              Quantity ({unitLabel})
            </label>
            <Input
              data-no-scan
              type="number"
              min="0.1"
              step="0.5"
              max={maxStock}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="input-lux h-12 text-center text-xl font-semibold"
              autoFocus
              onFocus={(e) => e.target.select()}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              In stock: {formatQty(maxStock)} {unitLabel.toLowerCase()}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {quick.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setValue(String(q))}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                  qty === q
                    ? "border-gold-500 bg-gold-500/15 text-gold-700"
                    : "border-border hover:border-gold-500/50",
                )}
              >
                {formatQty(q)}
                {product.packSize === q ? " (full pack)" : ""}
              </button>
            ))}
          </div>

          {qty > maxStock && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              Only {formatQty(maxStock)} {unitLabel.toLowerCase()} available in stock.
            </p>
          )}
          {qty <= 0 && value !== "" && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              Quantity must be greater than zero.
            </p>
          )}

          <div className="flex items-center justify-between rounded-xl bg-navy-900/5 px-4 py-3">
            <span className="text-sm text-muted-foreground">Line total</span>
            <span className="font-display text-xl font-semibold text-navy-900">
              {formatCurrency(lineTotal)}
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
              onConfirm(Number(qty.toFixed(3)));
              onClose();
            }}
          >
            Add to Cart
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

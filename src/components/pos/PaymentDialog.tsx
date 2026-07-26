import { useEffect, useMemo, useState } from "react";
import { Banknote, CreditCard, Landmark, Smartphone, Ellipsis, Plus, Trash2, Loader2 } from "lucide-react";
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
import { PAYMENT_METHOD_LABELS } from "@contracts/constants";
import type { CheckoutPayment } from "@contracts/pos";
import type { PaymentMethod } from "@contracts/constants";
import { cn } from "@/lib/utils";

/**
 * HADRAN FABRICS MALL — payment dialog.
 * Split tenders (cash + transfer + POS…), quick cash denominations,
 * live change calculation, then completes the sale.
 */

const METHOD_ICONS: Record<PaymentMethod, typeof Banknote> = {
  CASH: Banknote,
  POS_TERMINAL: Smartphone,
  BANK_TRANSFER: Landmark,
  CARD: CreditCard,
  OTHER: Ellipsis,
};

const QUICK_CASH = [500, 1000, 2000, 5000, 10000, 20000, 50000];

interface PaymentDialogProps {
  open: boolean;
  onClose: () => void;
  grandTotal: number;
  submitting: boolean;
  onComplete: (payments: CheckoutPayment[]) => void;
}

export function PaymentDialog({ open, onClose, grandTotal, submitting, onComplete }: PaymentDialogProps) {
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [payments, setPayments] = useState<CheckoutPayment[]>([]);

  useEffect(() => {
    if (open) {
      setMethod("CASH");
      setAmount(grandTotal > 0 ? String(grandTotal) : "");
      setReference("");
      setPayments([]);
    }
  }, [open, grandTotal]);

  const paid = useMemo(() => Number(payments.reduce((s, p) => s + p.amount, 0).toFixed(2)), [payments]);
  const remaining = Number(Math.max(0, grandTotal - paid).toFixed(2));
  const change = Number(Math.max(0, paid - grandTotal).toFixed(2));

  const entryAmount = useMemo(() => {
    const n = Number(amount);
    return Number.isFinite(n) ? n : 0;
  }, [amount]);

  const needsReference = method !== "CASH";

  const addPayment = () => {
    if (entryAmount <= 0) return;
    setPayments((prev) => [
      ...prev,
      {
        method,
        amount: Number(entryAmount.toFixed(2)),
        reference: reference.trim() || undefined,
      },
    ]);
    const newPaid = Number((paid + entryAmount).toFixed(2));
    const left = Number(Math.max(0, grandTotal - newPaid).toFixed(2));
    setAmount(left > 0 ? String(left) : "");
    setReference("");
  };

  const complete = payments.length > 0 && paid + 0.001 >= grandTotal && !submitting;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent className="border-gold-500/30 sm:max-w-lg" data-no-scan>
        <DialogHeader>
          <DialogTitle className="font-display text-navy-900">Take Payment</DialogTitle>
          <DialogDescription>
            Total due{" "}
            <span className="font-display text-lg font-semibold text-navy-900">
              {formatCurrency(grandTotal)}
            </span>{" "}
            — add one or more tenders.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Method selector */}
          <div className="grid grid-cols-5 gap-2">
            {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => {
              const Icon = METHOD_ICONS[m];
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl border px-1 py-2.5 text-[11px] font-medium transition-colors",
                    method === m
                      ? "border-gold-500 bg-gold-500/15 text-gold-700"
                      : "border-border text-muted-foreground hover:border-gold-500/50",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {PAYMENT_METHOD_LABELS[m]}
                </button>
              );
            })}
          </div>

          {/* Amount entry */}
          <div className="flex gap-2">
            <Input
              data-no-scan
              type="number"
              min="0"
              step="100"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount"
              className="input-lux h-12 text-center text-lg font-semibold"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addPayment();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="h-12 shrink-0"
              disabled={entryAmount <= 0}
              onClick={addPayment}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add
            </Button>
          </div>

          {/* Quick cash */}
          {method === "CASH" && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setAmount(String(remaining > 0 ? remaining : grandTotal))}
                className="rounded-lg border border-gold-500 bg-gold-500/15 px-3 py-1.5 text-sm font-medium text-gold-700"
              >
                Exact
              </button>
              {QUICK_CASH.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setAmount(String(q))}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:border-gold-500/50"
                >
                  ₦{q.toLocaleString()}
                </button>
              ))}
            </div>
          )}

          {/* Reference */}
          {needsReference && (
            <Input
              data-no-scan
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={
                method === "POS_TERMINAL"
                  ? "POS approval code (optional)"
                  : method === "BANK_TRANSFER"
                    ? "Transfer reference (optional)"
                    : "Reference (optional)"
              }
              className="input-lux"
              maxLength={120}
            />
          )}

          {/* Added payments */}
          {payments.length > 0 && (
            <ul className="space-y-1.5">
              {payments.map((p, i) => (
                <li
                  key={`${p.method}-${i}`}
                  className="flex items-center justify-between rounded-lg border border-border bg-background/60 px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{PAYMENT_METHOD_LABELS[p.method]}</span>
                    {p.reference && <span className="text-xs text-muted-foreground">ref {p.reference}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-semibold tabular-nums">{formatCurrency(p.amount)}</span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-red-600"
                      onClick={() => setPayments((prev) => prev.filter((_, j) => j !== i))}
                      aria-label="Remove payment"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Summary */}
          <div className="space-y-1.5 rounded-xl bg-navy-900/5 px-4 py-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Paid</span>
              <span className="tabular-nums">{formatCurrency(paid)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Remaining</span>
              <span className={cn("font-semibold tabular-nums", remaining > 0 ? "text-amber-700" : "text-emerald-700")}>
                {formatCurrency(remaining)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Change</span>
              <span className={cn("font-display text-lg font-bold tabular-nums", change > 0 ? "text-gold-700" : "text-muted-foreground")}>
                {formatCurrency(change)}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Back
          </Button>
          <Button
            className="bg-gold-500 font-semibold text-navy-950 hover:bg-gold-400"
            disabled={!complete}
            onClick={() => onComplete(payments)}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Completing…
              </>
            ) : (
              "Complete Sale"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

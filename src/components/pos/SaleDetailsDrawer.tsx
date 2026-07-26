import { Printer, ReceiptText } from "lucide-react";
import { trpc } from "@/providers/trpc";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { StatusBadge, toneForStatus } from "@/components/common/StatusBadge";
import { formatCurrency, formatDateTime, formatQty } from "@/lib/format";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@contracts/constants";
import { UNIT_LABELS } from "@contracts/constants";
import { usePermissions } from "@/hooks/use-permissions";

/**
 * HADRAN FABRICS MALL — sale details drawer.
 * Full line items, payments, totals and status for any sale,
 * with receipt reprint (permission-gated).
 */

interface SaleDetailsDrawerProps {
  saleId: number | null;
  open: boolean;
  onClose: () => void;
  /** Opens the receipt preview/print flow for this sale. */
  onReprint: (saleId: number) => void;
}

export function SaleDetailsDrawer({ saleId, open, onClose, onReprint }: SaleDetailsDrawerProps) {
  const { can } = usePermissions();
  const query = trpc.sales.byId.useQuery({ id: saleId! }, { enabled: open && saleId != null, retry: 1 });

  const data = query.data;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="scrollbar-lux w-full overflow-y-auto border-l-gold-500/30 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 font-display text-navy-900">
            <ReceiptText className="h-5 w-5 text-gold-600" />
            Sale Details
          </SheetTitle>
          <SheetDescription>{data ? `Receipt ${data.sale.receiptNo}` : "Loading sale…"}</SheetDescription>
        </SheetHeader>

        {query.isLoading ? (
          <div className="mt-6 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-xl" />
            ))}
          </div>
        ) : query.isError ? (
          <p className="mt-8 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {query.error.message}
          </p>
        ) : data ? (
          <div className="mt-6 space-y-5">
            {/* Meta */}
            <div className="card-lux space-y-2 rounded-xl border p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <StatusBadge label={data.sale.status.replace(/_/g, " ")} tone={toneForStatus(data.sale.status)} />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date</span>
                <span>{formatDateTime(new Date(data.sale.completedAt ?? data.sale.createdAt))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cashier</span>
                <span>{data.cashierName ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer</span>
                <span>{data.customerName ?? "Walk-in"}</span>
              </div>
              {data.sale.status === "VOIDED" && (
                <>
                  <div className="flex justify-between text-red-700">
                    <span>Voided by</span>
                    <span>{data.voiderName ?? "—"}</span>
                  </div>
                  {data.sale.voidReason && (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{data.sale.voidReason}</p>
                  )}
                </>
              )}
              {data.sale.notes && (
                <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">{data.sale.notes}</p>
              )}
            </div>

            {/* Items */}
            <div>
              <h3 className="mb-2 font-display text-sm font-semibold text-navy-900">Items</h3>
              <ul className="space-y-2">
                {data.items.map((i) => (
                  <li key={i.id} className="rounded-xl border border-border p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{i.productName}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {i.sku} • {formatQty(i.quantity)}{" "}
                          {UNIT_LABELS[i.unit as keyof typeof UNIT_LABELS] ?? i.unit} × {formatCurrency(i.unitPrice)}
                          {i.isMeasuredCut && " • measured cut"}
                        </p>
                        {i.discountAmount > 0 && (
                          <p className="text-[11px] text-emerald-700">Discount −{formatCurrency(i.discountAmount)}</p>
                        )}
                        {Number(i.returnedQty) > 0 && (
                          <p className="text-[11px] text-amber-700">Returned: {formatQty(Number(i.returnedQty))}</p>
                        )}
                      </div>
                      <span className="shrink-0 font-semibold tabular-nums">{formatCurrency(i.lineTotal)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Payments */}
            <div>
              <h3 className="mb-2 font-display text-sm font-semibold text-navy-900">Payments</h3>
              <ul className="space-y-1.5">
                {data.payments.map((p) => (
                  <li key={p.id} className="flex justify-between rounded-lg border border-border px-3 py-2 text-sm">
                    <span>
                      {PAYMENT_METHOD_LABELS[p.method as PaymentMethod]}
                      {p.reference && <span className="ml-1.5 text-xs text-muted-foreground">ref {p.reference}</span>}
                    </span>
                    <span className="font-semibold tabular-nums">{formatCurrency(p.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Totals */}
            <div className="card-lux space-y-1.5 rounded-xl border p-4 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatCurrency(data.sale.subtotal)}</span>
              </div>
              {Number(data.sale.discountTotal) > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Discounts</span>
                  <span className="tabular-nums">−{formatCurrency(Number(data.sale.discountTotal))}</span>
                </div>
              )}
              <div className="flex justify-between text-muted-foreground">
                <span>VAT</span>
                <span className="tabular-nums">{formatCurrency(data.sale.taxTotal)}</span>
              </div>
              {Number(data.sale.serviceCharge) > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Service charge</span>
                  <span className="tabular-nums">{formatCurrency(Number(data.sale.serviceCharge))}</span>
                </div>
              )}
              <Separator />
              <div className="flex items-center justify-between">
                <span className="font-display font-semibold text-navy-900">Grand total</span>
                <span className="font-display text-xl font-bold tabular-nums text-navy-900">
                  {formatCurrency(data.sale.grandTotal)}
                </span>
              </div>
              {Number(data.sale.changeGiven) > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Change given</span>
                  <span className="tabular-nums">{formatCurrency(Number(data.sale.changeGiven))}</span>
                </div>
              )}
            </div>

            {/* Reprint */}
            {can("pos.reprint_receipt") && data.sale.status !== "HELD" && (
              <Button
                className="w-full bg-navy-900 text-cream-100 hover:bg-navy-800"
                onClick={() => onReprint(data.sale.id)}
              >
                <Printer className="mr-1.5 h-4 w-4" />
                Reprint Receipt
              </Button>
            )}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

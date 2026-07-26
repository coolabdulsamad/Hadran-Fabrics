import { RotateCcw, ArrowLeftRight } from "lucide-react";
import { trpc } from "@/providers/trpc";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { StatusBadge, toneForStatus } from "@/components/common/StatusBadge";
import { formatCurrency, formatDateTime, formatQty } from "@/lib/format";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@contracts/constants";
import { UNIT_LABELS } from "@contracts/constants";

/**
 * HADRAN FABRICS MALL — return/exchange details drawer.
 */

interface ReturnDetailsDrawerProps {
  returnId: number | null;
  open: boolean;
  onClose: () => void;
}

export function ReturnDetailsDrawer({ returnId, open, onClose }: ReturnDetailsDrawerProps) {
  const query = trpc.returns.byId.useQuery({ id: returnId! }, { enabled: open && returnId != null, retry: 1 });
  const data = query.data;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="scrollbar-lux w-full overflow-y-auto border-l-gold-500/30 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 font-display text-navy-900">
            {data?.return.type === "EXCHANGE" ? (
              <ArrowLeftRight className="h-5 w-5 text-gold-600" />
            ) : (
              <RotateCcw className="h-5 w-5 text-gold-600" />
            )}
            {data ? `${data.return.type === "EXCHANGE" ? "Exchange" : "Return"} ${data.return.reference}` : "Return details"}
          </SheetTitle>
          <SheetDescription>{data ? `Against receipt ${data.receiptNo}` : "Loading…"}</SheetDescription>
        </SheetHeader>

        {query.isLoading ? (
          <div className="mt-6 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : query.isError ? (
          <p className="mt-8 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {query.error.message}
          </p>
        ) : data ? (
          <div className="mt-6 space-y-5">
            <div className="card-lux space-y-2 rounded-xl border p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <StatusBadge label={data.return.status} tone={toneForStatus(data.return.status)} />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Processed</span>
                <span>{data.return.processedAt ? formatDateTime(new Date(data.return.processedAt)) : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Processed by</span>
                <span>{data.processorName ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer</span>
                <span>{data.customerName ?? "Walk-in"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reason</span>
                <span className="max-w-[60%] text-right">{data.return.reason}</span>
              </div>
              {data.return.notes && (
                <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">{data.return.notes}</p>
              )}
            </div>

            <div>
              <h3 className="mb-2 font-display text-sm font-semibold text-navy-900">
                {data.return.type === "EXCHANGE" ? "Returned items" : "Items"}
              </h3>
              <ul className="space-y-2">
                {data.items.map(({ item, productName, exchangeProductName }) => (
                  <li key={item.id} className="rounded-xl border border-border p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{productName}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatQty(item.quantity)} {UNIT_LABELS[item.unit as keyof typeof UNIT_LABELS] ?? item.unit} ×{" "}
                          {formatCurrency(item.unitPrice)} • {item.condition}
                          {item.condition === "GOOD" && item.restock ? " • restocked" : ""}
                          {item.condition === "DAMAGED" ? " • written off" : ""}
                        </p>
                      </div>
                      <span className="shrink-0 font-semibold tabular-nums">{formatCurrency(item.lineTotal)}</span>
                    </div>

                    {exchangeProductName && (
                      <div className="mt-2 flex items-start justify-between gap-2 rounded-lg border border-gold-500/30 bg-gold-50/60 px-3 py-2">
                        <div className="min-w-0">
                          <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gold-700">
                            <ArrowLeftRight className="h-3 w-3" /> Exchanged for
                          </p>
                          <p className="truncate text-sm font-medium">{exchangeProductName}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatQty(Number(item.exchangeQty ?? 0))} × {formatCurrency(Number(item.exchangeUnitPrice ?? 0))}
                          </p>
                        </div>
                        <span className="shrink-0 font-semibold tabular-nums text-gold-700">
                          {formatCurrency(Number(item.exchangeLineTotal ?? 0))}
                        </span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <Separator />

            <div className="card-lux space-y-1.5 rounded-xl border p-4 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Returned value</span>
                <span className="tabular-nums">{formatCurrency(returnValueOf(data.items))}</span>
              </div>
              {data.return.type === "EXCHANGE" && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Exchange value</span>
                  <span className="tabular-nums">{formatCurrency(data.return.exchangeValue)}</span>
                </div>
              )}
              <Separator className="my-1" />
              {data.return.refundAmount > 0 ? (
                <div className="flex items-center justify-between">
                  <span className="font-display font-semibold text-navy-900">Refund due</span>
                  <span className="font-display text-xl font-bold tabular-nums text-navy-900">
                    {formatCurrency(data.return.refundAmount)}
                  </span>
                </div>
              ) : data.return.topUpAmount > 0 ? (
                <div className="flex items-center justify-between">
                  <span className="font-display font-semibold text-gold-700">Top-up paid by customer</span>
                  <span className="font-display text-xl font-bold tabular-nums text-gold-700">
                    {formatCurrency(data.return.topUpAmount)}
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="font-display font-semibold text-navy-900">
                    {data.return.type === "EXCHANGE" ? "Even exchange" : "Refund amount"}
                  </span>
                  <span className="font-display text-xl font-bold tabular-nums text-navy-900">
                    {formatCurrency(0)}
                  </span>
                </div>
              )}
              {data.return.refundMethod && data.return.refundAmount > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Refund method</span>
                  <span>{PAYMENT_METHOD_LABELS[data.return.refundMethod as PaymentMethod]}</span>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/** Sum of the per-line returned values. */
function returnValueOf(items: { item: { lineTotal: number } }[]): number {
  return Number(items.reduce((s, { item }) => s + Number(item.lineTotal), 0).toFixed(2));
}

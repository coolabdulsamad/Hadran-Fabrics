import { Crown, Star, ReceiptText, Pencil, Ban, CircleCheck, Phone, Mail, MapPin, Gift, StickyNote } from "lucide-react";
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
import { formatCurrency, formatDateTime, timeAgo } from "@/lib/format";
import { SALE_STATUS_LABELS } from "@contracts/labels";
import type { SaleStatus } from "@contracts/constants";

/**
 * HADRAN FABRICS MALL — customer 360° drawer.
 * Full record, discount/loyalty state and recent purchase history,
 * with edit / block / reactivate actions.
 */

interface CustomerDetailsDrawerProps {
  customerId: number | null;
  open: boolean;
  onClose: () => void;
  canManage: boolean;
  onEdit: (id: number) => void;
}

export function CustomerDetailsDrawer({ customerId, open, onClose, canManage, onEdit }: CustomerDetailsDrawerProps) {
  const utils = trpc.useUtils();
  const query = trpc.customers.byId.useQuery({ id: customerId! }, { enabled: open && customerId != null, retry: 1 });

  const statusMutation = trpc.customers.setStatus.useMutation({
    onSuccess: () => {
      void utils.customers.list.invalidate();
      void utils.customers.byId.invalidate();
      void utils.customers.stats.invalidate();
    },
  });

  const data = query.data;
  const c = data?.customer;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="scrollbar-lux w-full overflow-y-auto border-l-gold-500/30 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="font-display text-navy-900">{c ? c.fullName : "Customer"}</SheetTitle>
          <SheetDescription>{c ? `${c.code} • joined ${formatDateTime(new Date(c.createdAt)).split(",")[0]}` : "Loading…"}</SheetDescription>
        </SheetHeader>

        {query.isLoading ? (
          <div className="mt-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : query.isError ? (
          <p className="mt-8 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {query.error.message}
          </p>
        ) : c ? (
          <div className="mt-6 space-y-5">
            {/* Status + headline */}
            <div className="card-lux rounded-xl border p-4">
              <div className="flex items-center justify-between">
                <StatusBadge label={c.status} tone={toneForStatus(c.status)} />
                {Number(c.discountPercent) > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-gold-500/15 px-3 py-1 text-xs font-semibold text-gold-700">
                    <Crown className="h-3.5 w-3.5" />
                    {Number(c.discountPercent)}% personal discount
                  </span>
                )}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-navy-900/5 px-2 py-3">
                  <p className="font-display text-lg font-bold text-navy-900">{formatCurrency(c.totalSpent)}</p>
                  <p className="text-[11px] text-muted-foreground">Total spent</p>
                </div>
                <div className="rounded-lg bg-navy-900/5 px-2 py-3">
                  <p className="font-display text-lg font-bold text-navy-900">{c.visitCount}</p>
                  <p className="text-[11px] text-muted-foreground">Visits</p>
                </div>
                <div className="rounded-lg bg-navy-900/5 px-2 py-3">
                  <p className="flex items-center justify-center gap-1 font-display text-lg font-bold text-gold-700">
                    <Star className="h-4 w-4" />
                    {c.loyaltyPoints.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Loyalty pts</p>
                </div>
              </div>
              {c.lastVisitAt && (
                <p className="mt-3 text-center text-xs text-muted-foreground">
                  Last visit {timeAgo(new Date(c.lastVisitAt))}
                </p>
              )}
            </div>

            {/* Contact & profile */}
            <div className="space-y-2 text-sm">
              {c.phone && (
                <p className="flex items-center gap-2.5">
                  <Phone className="h-4 w-4 text-gold-600" /> {c.phone}
                </p>
              )}
              {c.email && (
                <p className="flex items-center gap-2.5">
                  <Mail className="h-4 w-4 text-gold-600" /> {c.email}
                </p>
              )}
              {c.address && (
                <p className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold-600" /> {c.address}
                </p>
              )}
              {c.birthday && (
                <p className="flex items-center gap-2.5">
                  <Gift className="h-4 w-4 text-gold-600" /> Birthday: {String(c.birthday).slice(0, 10)}
                </p>
              )}
              {c.discountNote && (
                <p className="rounded-lg bg-gold-500/10 px-3 py-2 text-xs text-gold-800">
                  Discount reason: {c.discountNote}
                </p>
              )}
              {c.notes && (
                <p className="flex items-start gap-2.5 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                  <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {c.notes}
                </p>
              )}
              {data?.creatorName && (
                <p className="text-[11px] text-muted-foreground">Registered by {data.creatorName}</p>
              )}
            </div>

            {canManage && (
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => onEdit(c.id)}>
                  <Pencil className="mr-1.5 h-4 w-4" />
                  Edit
                </Button>
                {c.status === "ACTIVE" ? (
                  <Button
                    variant="outline"
                    className="flex-1 text-red-600 hover:border-red-300 hover:bg-red-50"
                    disabled={statusMutation.isPending}
                    onClick={() =>
                      statusMutation.mutate({ id: c.id, status: "BLOCKED", reason: "Blocked from customer record" })
                    }
                  >
                    <Ban className="mr-1.5 h-4 w-4" />
                    Block
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="flex-1 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50"
                    disabled={statusMutation.isPending}
                    onClick={() => statusMutation.mutate({ id: c.id, status: "ACTIVE" })}
                  >
                    <CircleCheck className="mr-1.5 h-4 w-4" />
                    Reactivate
                  </Button>
                )}
              </div>
            )}

            <Separator />

            {/* Recent purchases */}
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 font-display text-sm font-semibold text-navy-900">
                <ReceiptText className="h-4 w-4 text-gold-600" />
                Recent purchases
              </h3>
              {(data?.recentSales ?? []).length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No purchases yet.</p>
              ) : (
                <ul className="space-y-2">
                  {data!.recentSales.map((s) => (
                    <li key={s.id} className="flex items-center justify-between rounded-xl border border-border px-3.5 py-2.5 text-sm">
                      <div>
                        <p className="font-medium text-foreground">{s.receiptNo}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatDateTime(new Date(s.createdAt))} • {s.cashierName ?? "—"} • {s.itemCount} item(s)
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold tabular-nums">{formatCurrency(s.grandTotal)}</p>
                        <StatusBadge
                          label={SALE_STATUS_LABELS[s.status as SaleStatus]}
                          tone={toneForStatus(s.status)}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

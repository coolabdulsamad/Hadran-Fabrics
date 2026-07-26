import { PauseCircle, Play, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
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
import { timeAgo } from "@/lib/format";

/**
 * HADRAN FABRICS MALL — held sales drawer.
 * Parked carts ("customer stepped out to the ATM") listed for resume/discard.
 */

interface HeldSalesDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Resume the held sale into the live cart (page fetches lines). */
  onResume: (heldSaleId: number) => void;
  /** True while a resume fetch is in flight. */
  resuming?: boolean;
}

export function HeldSalesDrawer({ open, onClose, onResume, resuming }: HeldSalesDrawerProps) {
  const utils = trpc.useUtils();
  const heldQuery = trpc.sales.heldSales.useQuery(undefined, { enabled: open });

  const deleteMutation = trpc.sales.deleteHeld.useMutation({
    onSuccess: () => {
      toast.success("Held sale discarded.");
      void utils.sales.heldSales.invalidate();
    },
    onError: (err) => toast.error("Could not discard held sale.", { description: err.message }),
  });

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full border-l-gold-500/30 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 font-display text-navy-900">
            <PauseCircle className="h-5 w-5 text-gold-600" />
            Held Sales
          </SheetTitle>
          <SheetDescription>
            Carts parked for later. Resume one to continue selling, or discard it.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void heldQuery.refetch()}
            disabled={heldQuery.isFetching}
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${heldQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="scrollbar-lux mt-2 max-h-[calc(100vh-180px)] space-y-2.5 overflow-y-auto pr-1">
          {heldQuery.isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)
          ) : (heldQuery.data ?? []).length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-14 text-muted-foreground">
              <PauseCircle className="h-9 w-9" />
              <p className="text-sm">No held sales right now.</p>
            </div>
          ) : (
            (heldQuery.data ?? []).map((h) => (
              <div key={h.id} className="card-lux rounded-xl border p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {h.notes?.trim() || `Held sale #${h.id}`}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {h.cashierName ?? "—"}
                      {h.customerName ? ` • ${h.customerName}` : ""} • {h.itemCount} item
                      {Number(h.itemCount) === 1 ? "" : "s"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{h.heldAt ? timeAgo(new Date(h.heldAt)) : ""}</p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 bg-gold-500 text-navy-950 hover:bg-gold-400"
                    disabled={resuming}
                    onClick={() => onResume(h.id)}
                  >
                    <Play className="mr-1.5 h-3.5 w-3.5" />
                    Resume
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:border-red-300 hover:bg-red-50"
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate({ id: h.id })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

import { useState } from "react";
import { Search, UserRound, Star, Crown, UserX } from "lucide-react";
import { trpc } from "@/providers/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format";
import type { CartCustomer } from "@/store/cart-store";
import { cn } from "@/lib/utils";

/**
 * HADRAN FABRICS MALL — POS customer picker.
 * Attach a special/registered customer to the sale so their personal
 * discount applies automatically, or keep it as a walk-in.
 */

interface CustomerPickerDialogProps {
  open: boolean;
  onClose: () => void;
  current: CartCustomer | null;
  onSelect: (customer: CartCustomer | null) => void;
}

export function CustomerPickerDialog({ open, onClose, current, onSelect }: CustomerPickerDialogProps) {
  const [query, setQuery] = useState("");

  const searchQuery = trpc.customers.search.useQuery(
    { query: query.trim() || undefined },
    { enabled: open },
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border-gold-500/30 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-navy-900">
            <UserRound className="h-5 w-5 text-gold-600" />
            Attach Customer
          </DialogTitle>
          <DialogDescription>
            Registered customers get their personal discount automatically. Search by name, phone or code.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-no-scan
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customers…"
            className="input-lux pl-10"
            autoFocus
          />
        </div>

        <div className="scrollbar-lux max-h-[46vh] min-h-[180px] space-y-2 overflow-y-auto pr-1">
          {/* Walk-in option */}
          <button
            type="button"
            onClick={() => {
              onSelect(null);
              onClose();
            }}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
              current === null
                ? "border-gold-500 bg-gold-500/10"
                : "border-border hover:border-gold-500/50",
            )}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <UserX className="h-5 w-5 text-muted-foreground" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Walk-in Customer</p>
              <p className="text-xs text-muted-foreground">No discount, no customer record on the receipt.</p>
            </div>
          </button>

          {searchQuery.isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)
          ) : (searchQuery.data ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {query.trim() ? "No customers match that search." : "No registered customers yet."}
            </p>
          ) : (
            (searchQuery.data ?? []).map((c) => {
              const selected = current?.id === c.id;
              const discount = Number(c.discountPercent);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onSelect({ id: c.id, fullName: c.fullName, discountPercent: discount });
                    onClose();
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                    selected ? "border-gold-500 bg-gold-500/10" : "border-border hover:border-gold-500/50",
                  )}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-900 font-display text-sm font-semibold text-gold-400">
                    {c.fullName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{c.fullName}</p>
                      {c.status !== "ACTIVE" && (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          {c.status}
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.code} • {c.phone}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {discount > 0 && (
                        <Badge className="bg-gold-500/15 text-[10px] text-gold-700" variant="outline">
                          <Crown className="mr-1 h-3 w-3" />
                          {discount}% discount
                        </Badge>
                      )}
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Star className="h-3 w-3 text-gold-500" />
                        {Number(c.loyaltyPoints).toLocaleString()} pts
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        Spent {formatCurrency(Number(c.totalSpent))}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

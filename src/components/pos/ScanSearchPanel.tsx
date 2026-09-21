import { useMemo, useRef, useState } from "react";
import { CornerDownLeft, Loader2, PackageSearch, Plus, Ruler, ScanBarcode, X } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useDebounce } from "@/hooks/use-debounce";
import { formatCurrency, formatQty } from "@/lib/format";
import { UNIT_LABELS } from "@contracts/constants";
import { cn } from "@/lib/utils";

/**
 * HADRAN FABRICS MALL — supermarket scan/search rail (Phase 7).
 * Replaces the old product-card grid: a big autofocus scan box plus a
 * compact result LIST. Scan a barcode (works anywhere on screen) or type
 * and tap a row — Enter instantly adds the top in-stock match. No
 * category filters: search + scanner are the whole workflow.
 */

export interface PosProduct {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  color: string | null;
  unitOfMeasure: string;
  packSize: number | null;
  allowFractional: boolean;
  sellingPrice: number;
  taxRate: number;
  taxExempt: boolean;
  discountEligible: boolean;
  /** Company-wide total (reference only). */
  currentStock: number;
  /** Stock at the active branch — what this terminal can actually sell. */
  branchStock?: number;
  reorderLevel: number;
  primaryImageUrl: string | null;
  categoryName: string;
}

/** What this terminal can sell right now (active-branch shelf stock). */
function sellable(p: PosProduct): number {
  return p.branchStock ?? p.currentStock;
}

interface ScanSearchPanelProps {
  /** Called when the cashier picks a product (row tap or Enter). */
  onPick: (product: PosProduct) => void;
  /** Products already in the cart (to show picked state). */
  inCartIds: Set<number>;
  /** A code was resolved through this box (scanner typed into it) — lets the page flash "last scan". */
  onCodeScan?: (code: string) => void;
}

export function ScanSearchPanel({ onPick, inCartIds, onCodeScan }: ScanSearchPanelProps) {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search.trim(), 250);
  const inputRef = useRef<HTMLInputElement>(null);

  const productsQuery = trpc.products.list.useQuery(
    { search: debounced || undefined, status: "ACTIVE", page: 1, pageSize: 20 },
    { enabled: debounced.length > 0, retry: 1 },
  );
  const items = useMemo(() => (productsQuery.data?.items ?? []) as PosProduct[], [productsQuery.data]);
  const searchActive = search.trim().length > 0;

  const pick = (p: PosProduct) => {
    if (sellable(p) <= 0) return; // parent toasts on scan; rows are disabled anyway
    onPick(p);
    setSearch("");
    inputRef.current?.focus();
  };

  /**
   * Supermarket behaviour for Enter:
   * 1. exact barcode/SKU among loaded results (free),
   * 2. code-like input (a scanner typed into this box faster than the
   *    debounce) resolved straight against the barcode endpoint,
   * 3. otherwise the top in-stock search hit.
   */
  const handleEnter = async () => {
    const q = search.trim();
    if (!q) return;
    const exact = items.find(
      (i) => sellable(i) > 0 && (i.barcode === q || i.sku.toUpperCase() === q.toUpperCase()),
    );
    if (exact) {
      pick(exact);
      return;
    }
    if (/^[0-9A-Za-z-]{6,}$/.test(q)) {
      try {
        const p = await utils.products.byBarcode.fetch({ code: q });
        onCodeScan?.(q);
        pick({ ...p, categoryName: "" } as PosProduct);
        return;
      } catch {
        /* unknown code — fall through to the top hit */
      }
    }
    const first = items.find((i) => sellable(i) > 0);
    if (first) pick(first);
  };

  return (
    <div className="relative flex min-h-0 w-full min-w-0 flex-col gap-3 lg:h-full">
      {/* Scan / search box */}
      <div className="rounded-2xl border border-gold-500/25 bg-card p-3 shadow-sm">
        <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <ScanBarcode className="h-3.5 w-3.5 text-gold-600" />
          Scan or search
        </p>
        <div className="relative">
          <ScanBarcode className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gold-600" />
          <Input
            ref={inputRef}
            data-no-scan
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleEnter();
              }
            }}
            placeholder="Scan barcode or type name / SKU…"
            className="input-lux h-12 pl-11 pr-9 text-base"
            aria-label="Scan barcode or search products"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                inputRef.current?.focus();
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="mt-1.5 hidden text-[11px] text-muted-foreground lg:block">
          Scanner works anywhere on this screen · <CornerDownLeft className="inline h-3 w-3" /> adds the top match
        </p>
      </div>

      {/* Results — overlay dropdown on mobile, inline scroll list on desktop */}
      <div
        className={cn(
          "lg:static lg:mt-0 lg:min-h-0 lg:flex-1",
          searchActive ? "absolute inset-x-0 top-full z-40 mt-1" : "hidden lg:block",
        )}
      >
        <div className="flex max-h-[55vh] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-lg lg:h-full lg:max-h-none lg:shadow-sm">
          {!searchActive ? (
            /* Idle state (desktop only) */
            <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-navy-900/5">
                <ScanBarcode className="h-8 w-8 text-gold-600" />
              </span>
              <p className="text-sm font-semibold text-navy-900">Terminal ready</p>
              <p className="max-w-[240px] text-xs leading-relaxed">
                Scan a barcode to add it straight to the sale, or type above to search the catalog.
              </p>
            </div>
          ) : productsQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-muted-foreground">
              <PackageSearch className="h-7 w-7" />
              <p className="text-sm">No products match “{search.trim()}”.</p>
            </div>
          ) : (
            <ul className="scrollbar-lux min-h-0 divide-y divide-border overflow-y-auto">
              {items.map((p, idx) => {
                const out = sellable(p) <= 0;
                const low = !out && sellable(p) <= p.reorderLevel;
                const picked = inCartIds.has(p.id);
                const first = idx === items.findIndex((i) => sellable(i) > 0);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={out}
                      onClick={() => pick(p)}
                      className={cn(
                        "flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors",
                        out ? "cursor-not-allowed opacity-45" : "hover:bg-gold-500/5",
                        first && !out && "bg-gold-500/10",
                      )}
                    >
                      {/* Monogram / image */}
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-navy-900/5 font-display text-xs font-semibold text-gold-600">
                        {p.primaryImageUrl ? (
                          <img src={p.primaryImageUrl} alt={p.name} className="h-full w-full object-cover" />
                        ) : (
                          p.name.slice(0, 2).toUpperCase()
                        )}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-medium text-foreground">{p.name}</span>
                          {p.allowFractional && (
                            <Badge variant="outline" className="shrink-0 gap-0.5 text-[9px] text-navy-700">
                              <Ruler className="h-2.5 w-2.5" /> Measured
                            </Badge>
                          )}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {p.sku}
                          {p.color ? ` • ${p.color}` : ""} ·{" "}
                          {out ? (
                            <span className="font-medium text-red-600">out of stock at this branch</span>
                          ) : low ? (
                            <span className="font-medium text-amber-700">low — {formatQty(sellable(p))} left</span>
                          ) : (
                            <>{formatQty(sellable(p))} in stock</>
                          )}
                          {picked && !out && <span className="font-medium text-gold-700"> · in cart</span>}
                        </span>
                      </span>

                      <span className="shrink-0 text-right">
                        <span className="block font-display text-sm font-semibold tabular-nums text-navy-900">
                          {formatCurrency(p.sellingPrice)}
                        </span>
                        <span className="block text-[10px] text-muted-foreground">
                          / {UNIT_LABELS[p.unitOfMeasure as keyof typeof UNIT_LABELS] ?? p.unitOfMeasure}
                        </span>
                      </span>

                      {first && !out ? (
                        <kbd className="hidden shrink-0 items-center gap-0.5 rounded border border-gold-500/50 bg-gold-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-gold-700 sm:flex">
                          <CornerDownLeft className="h-3 w-3" /> Enter
                        </kbd>
                      ) : (
                        !out && <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { Search, Package, Ruler, Layers } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatQty } from "@/lib/format";
import { UNIT_LABELS } from "@contracts/constants";
import { cn } from "@/lib/utils";

/**
 * HADRAN FABRICS MALL — POS product search & pick panel.
 * Search box + category chips + touch-friendly product grid.
 * The barcode scanner is handled at page level (see POSPage);
 * this panel is the manual/search path.
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
  currentStock: number;
  reorderLevel: number;
  primaryImageUrl: string | null;
  categoryName: string;
}

interface ProductSearchPanelProps {
  /** Called when the cashier taps a product card. */
  onPick: (product: PosProduct) => void;
  /** Products already in the cart (to show picked state). */
  inCartIds: Set<number>;
}

export function ProductSearchPanel({ onPick, inCartIds }: ProductSearchPanelProps) {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);

  const categoriesQuery = trpc.categories.list.useQuery();
  const productsQuery = trpc.products.list.useQuery({
    search: search.trim() || undefined,
    categoryId: categoryId ?? undefined,
    status: "ACTIVE",
    page: 1,
    pageSize: 60,
  });

  const categories = useMemo(() => {
    const raw = categoriesQuery.data;
    if (!raw) return [];
    return Array.isArray(raw) ? raw : (raw as { items?: { id: number; name: string }[] }).items ?? [];
  }, [categoriesQuery.data]);

  const items = (productsQuery.data?.items ?? []) as PosProduct[];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          data-no-scan
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, SKU, barcode, colour, brand…"
          className="input-lux h-11 pl-10"
        />
      </div>

      {/* Category chips */}
      <div className="scrollbar-lux flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setCategoryId(null)}
          className={cn(
            "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
            categoryId === null
              ? "border-gold-500 bg-gold-500/15 text-gold-700"
              : "border-border bg-card text-muted-foreground hover:border-gold-500/50 hover:text-foreground",
          )}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
              categoryId === c.id
                ? "border-gold-500 bg-gold-500/15 text-gold-700"
                : "border-border bg-card text-muted-foreground hover:border-gold-500/50 hover:text-foreground",
            )}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="scrollbar-lux min-h-0 flex-1 overflow-y-auto pr-1">
        {productsQuery.isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Package className="h-8 w-8" />
            <p className="text-sm">No products match your search.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
            {items.map((p) => {
              const out = p.currentStock <= 0;
              const low = !out && p.currentStock <= p.reorderLevel;
              const picked = inCartIds.has(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={out}
                  onClick={() => onPick(p)}
                  className={cn(
                    "card-lux group relative flex flex-col overflow-hidden rounded-xl border text-left transition-all",
                    out
                      ? "cursor-not-allowed opacity-45"
                      : "hover:-translate-y-0.5 hover:border-gold-500/60 hover:shadow-lg",
                    picked && !out && "border-gold-500 ring-1 ring-gold-500/40",
                  )}
                >
                  {/* Image / monogram */}
                  <div className="relative flex h-20 items-center justify-center overflow-hidden bg-navy-900/5">
                    {p.primaryImageUrl ? (
                      <img src={p.primaryImageUrl} alt={p.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="font-display text-2xl font-semibold text-gold-600/70">
                        {p.name.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    {p.allowFractional && (
                      <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-navy-900/85 px-2 py-0.5 text-[10px] font-medium text-cream-100">
                        <Ruler className="h-3 w-3" /> Measured
                      </span>
                    )}
                    {picked && !out && (
                      <span className="absolute right-2 top-2 rounded-full bg-gold-500 px-2 py-0.5 text-[10px] font-semibold text-navy-950">
                        In cart
                      </span>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col gap-1 p-3">
                    <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {p.sku}
                      {p.color ? ` • ${p.color}` : ""}
                    </p>
                    <div className="mt-auto flex items-end justify-between pt-1">
                      <span className="font-display text-base font-semibold text-navy-900">
                        {formatCurrency(p.sellingPrice)}
                        <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                          / {UNIT_LABELS[p.unitOfMeasure as keyof typeof UNIT_LABELS] ?? p.unitOfMeasure}
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {out ? (
                        <Badge variant="destructive" className="text-[10px]">Out of stock</Badge>
                      ) : low ? (
                        <Badge className="border-amber-300 bg-amber-50 text-[10px] text-amber-700" variant="outline">
                          Low • {formatQty(p.currentStock)} left
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          <Layers className="mr-1 h-3 w-3" />
                          {formatQty(p.currentStock)} in stock
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

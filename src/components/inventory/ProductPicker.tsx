import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Package } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatCurrency, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface PickedProduct {
  id: number;
  sku: string;
  name: string;
  unitOfMeasure: string;
  currentStock: number;
  sellingPrice: number;
}

interface ProductPickerProps {
  value: PickedProduct | null;
  onChange: (product: PickedProduct | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Searchable product picker — used by stock forms, purchase orders,
 * adjustments and (later) the POS.
 */
export function ProductPicker({ value, onChange, placeholder = "Search product by name, SKU or barcode…", disabled }: ProductPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const query = trpc.products.list.useQuery(
    { search: search || undefined, status: "ACTIVE", page: 1, pageSize: 10 },
    { enabled: open },
  );

  const items = useMemo(() => query.data?.items ?? [], [query.data]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className="h-11 w-full justify-between border-input bg-background px-3 font-normal hover:bg-gold-50/50"
        >
          {value ? (
            <span className="flex min-w-0 items-center gap-2">
              <Package className="h-4 w-4 shrink-0 text-gold-600" />
              <span className="truncate text-sm font-medium text-navy-900">{value.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{value.sku}</span>
            </span>
          ) : (
            <span className="truncate text-sm text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-navy-400" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] border-gold-500/30 p-0" align="start">
        <div className="border-b border-border p-2">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type to search…"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-gold-500"
          />
        </div>
        <div className="scrollbar-lux max-h-72 overflow-y-auto p-1">
          {query.isLoading ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Searching…</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No products match.</p>
          ) : (
            items.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onChange({
                    id: p.id,
                    sku: p.sku,
                    name: p.name,
                    unitOfMeasure: p.unitOfMeasure,
                    currentStock: p.currentStock,
                    sellingPrice: p.sellingPrice,
                  });
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left transition hover:bg-gold-50",
                  value?.id === p.id && "bg-gold-50",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-navy-900">{p.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.sku} · stock {formatQty(p.currentStock)} {p.unitOfMeasure.toLowerCase()}(s)
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs font-semibold text-navy-700">{formatCurrency(p.sellingPrice)}</span>
                  {value?.id === p.id && <Check className="h-4 w-4 text-gold-600" />}
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

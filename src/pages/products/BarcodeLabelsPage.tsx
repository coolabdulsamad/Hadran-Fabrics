import { useEffect, useMemo, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { Printer, Search, Barcode as BarcodeIcon, CheckSquare, Square } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/EmptyState";
import { formatCurrency } from "@/lib/format";
import { APP_NAME } from "@/config/constants";
import { cn } from "@/lib/utils";

interface LabelProduct {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  sellingPrice: number;
  unitOfMeasure: string;
}

/** One rendered barcode label (SVG via JsBarcode). */
function BarcodeLabel({ product }: { product: LabelProduct }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current && product.barcode) {
      try {
        JsBarcode(svgRef.current, product.barcode, {
          format: "CODE128",
          width: 1.4,
          height: 40,
          fontSize: 12,
          margin: 0,
          displayValue: true,
        });
      } catch {
        // invalid barcode characters — render nothing
      }
    }
  }, [product.barcode]);

  return (
    <div className="flex w-[62mm] flex-col items-center rounded-md border border-gray-300 bg-white px-2 py-2 text-center print:border-gray-400">
      <p className="text-[9px] font-bold uppercase tracking-widest text-gray-700">{APP_NAME}</p>
      <p className="mt-0.5 line-clamp-2 min-h-[2em] text-[10px] font-semibold leading-tight text-black">
        {product.name}
      </p>
      <svg ref={svgRef} className="mt-1 max-w-full" />
      <p className="mt-0.5 text-[10px] font-bold text-black">
        {formatCurrency(product.sellingPrice)} / {product.unitOfMeasure.toLowerCase()}
      </p>
      <p className="text-[9px] text-gray-600">{product.sku}</p>
    </div>
  );
}

export default function BarcodeLabelsPage() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Map<number, LabelProduct>>(new Map());

  const query = trpc.products.list.useQuery(
    { search: search || undefined, status: "ACTIVE", page: 1, pageSize: 20 },
    { retry: 1 },
  );

  const items: LabelProduct[] = useMemo(
    () =>
      (query.data?.items ?? []).map((p) => ({
        id: p.id,
        sku: p.sku,
        barcode: p.barcode,
        name: p.name,
        sellingPrice: p.sellingPrice,
        unitOfMeasure: p.unitOfMeasure,
      })),
    [query.data],
  );

  const toggle = (p: LabelProduct) => {
    if (!p.barcode) {
      toast.error(`"${p.name}" has no barcode — edit the product to add or generate one.`);
      return;
    }
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(p.id)) next.delete(p.id);
      else next.set(p.id, p);
      return next;
    });
  };

  const selectedList = [...selected.values()];

  const print = () => {
    if (selectedList.length === 0) {
      toast.error("Select at least one product first.");
      return;
    }
    window.print();
  };

  return (
    <div>
      <PageHeader
        title="Barcode Labels"
        description="Select products, preview their shelf labels and print — the scanner reads these codes at the POS."
        actions={
          <Button onClick={print} className="bg-navy-800 text-cream-100 hover:bg-navy-700">
            <Printer className="mr-2 h-4 w-4 text-gold-400" />
            Print {selectedList.length > 0 ? `(${selectedList.length})` : "Labels"}
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {/* Product picker */}
        <div className="card-lux no-print">
          <div className="border-b border-border p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gold-600" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products…"
                className="input-lux pl-10"
              />
            </div>
          </div>
          <div className="scrollbar-lux max-h-[520px] overflow-y-auto p-2">
            {query.isLoading ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">Loading…</p>
            ) : items.length === 0 ? (
              <EmptyState title="No products found" description="Try a different search." />
            ) : (
              items.map((p) => {
                const isSelected = selected.has(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => toggle(p)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition",
                      isSelected ? "bg-gold-50" : "hover:bg-cream-200/60",
                      !p.barcode && "opacity-50",
                    )}
                  >
                    {isSelected ? (
                      <CheckSquare className="h-5 w-5 shrink-0 text-gold-600" />
                    ) : (
                      <Square className="h-5 w-5 shrink-0 text-navy-300" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-navy-900">{p.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {p.sku} · {p.barcode ? `barcode ${p.barcode}` : "no barcode"}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-navy-700">{formatCurrency(p.sellingPrice)}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Label preview (print area) */}
        <div className="card-lux">
          <div className="flex items-center gap-2 border-b border-border px-5 py-4 no-print">
            <BarcodeIcon className="h-4 w-4 text-gold-600" />
            <p className="font-display text-sm font-semibold text-navy-900">
              Label Preview — {selectedList.length} selected
            </p>
          </div>
          {selectedList.length === 0 ? (
            <div className="no-print">
              <EmptyState
                icon={BarcodeIcon}
                title="No labels selected"
                description="Tick products on the left to build your label sheet."
              />
            </div>
          ) : (
            <div className="receipt-print-area flex flex-wrap gap-3 p-5">
              {selectedList.map((p) => (
                <BarcodeLabel key={p.id} product={p} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

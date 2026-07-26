import { AlertTriangle, ArrowDownToLine } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { usePermissions } from "@/hooks/use-permissions";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { StockMovementForm } from "@/components/inventory/StockMovementForm";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatQty } from "@/lib/format";

type Row = {
  id: number;
  sku: string;
  name: string;
  unitOfMeasure: string;
  currentStock: number;
  reorderLevel: number;
  sellingPrice: number;
  categoryName: string;
};

export default function LowStockPage() {
  const { can } = usePermissions();
  const query = trpc.inventory.lowStock.useQuery();

  const columns: Column<Row>[] = [
    {
      header: "Product",
      render: (p) => (
        <div className="min-w-0">
          <p className="max-w-[280px] truncate font-medium text-navy-900">{p.name}</p>
          <p className="text-xs text-muted-foreground">{p.sku} · {p.categoryName}</p>
        </div>
      ),
    },
    {
      header: "Status",
      render: (p) =>
        p.currentStock <= 0 ? (
          <StatusBadge label="OUT OF STOCK" tone="red" />
        ) : (
          <StatusBadge label="LOW" tone="amber" />
        ),
    },
    {
      header: "In Stock",
      className: "text-right",
      render: (p) => (
        <span className={`font-bold ${p.currentStock <= 0 ? "text-red-600" : "text-amber-600"}`}>
          {formatQty(p.currentStock)} {p.unitOfMeasure.toLowerCase()}(s)
        </span>
      ),
    },
    {
      header: "Reorder Level",
      className: "text-right",
      render: (p) => <span className="text-navy-800">{formatQty(p.reorderLevel)}</span>,
    },
    {
      header: "Unit Price",
      className: "text-right",
      render: (p) => <span className="text-navy-800">{formatCurrency(p.sellingPrice)}</span>,
    },
    {
      header: "Action",
      className: "text-right",
      render: (p) =>
        can("inventory.stock_in") ? (
          <StockMovementForm
            mode="IN"
            product={{
              id: p.id,
              sku: p.sku,
              name: p.name,
              unitOfMeasure: p.unitOfMeasure,
              currentStock: p.currentStock,
              sellingPrice: p.sellingPrice,
            }}
            trigger={
              <Button size="sm" variant="outline" className="h-8 border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                <ArrowDownToLine className="mr-1.5 h-3.5 w-3.5" />
                Restock
              </Button>
            }
          />
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Low Stock Watch"
        description="Everything at or below its reorder level — restock before the next market rush."
        actions={
          <span className="flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-4 py-1.5 text-sm font-semibold text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            {query.data?.length ?? 0} alert{(query.data?.length ?? 0) === 1 ? "" : "s"}
          </span>
        }
      />

      <DataTable
        columns={columns}
        data={query.data as Row[] | undefined}
        loading={query.isLoading}
        keyFn={(p) => p.id}
        emptyTitle="Stock levels are healthy"
        emptyDescription="No product is at or below its reorder level right now."
      />
    </div>
  );
}

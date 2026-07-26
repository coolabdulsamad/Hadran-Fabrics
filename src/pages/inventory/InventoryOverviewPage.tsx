import { Boxes, Package, Banknote, TrendingUp } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { DataTable, type Column } from "@/components/common/DataTable";
import { formatCurrency, formatNumber } from "@/lib/format";

type Row = {
  categoryId: number;
  categoryName: string;
  productCount: number;
  totalCost: number;
  totalRetail: number;
};

export default function InventoryOverviewPage() {
  const query = trpc.inventory.overview.useQuery();

  const columns: Column<Row>[] = [
    {
      header: "Category",
      render: (c) => <span className="font-medium text-navy-900">{c.categoryName}</span>,
    },
    {
      header: "Products",
      className: "text-right",
      render: (c) => <span className="text-navy-800">{formatNumber(c.productCount)}</span>,
    },
    {
      header: "Value at Cost",
      className: "text-right",
      render: (c) => <span className="font-medium text-navy-900">{formatCurrency(c.totalCost)}</span>,
    },
    {
      header: "Value at Retail",
      className: "text-right",
      render: (c) => <span className="font-medium text-navy-900">{formatCurrency(c.totalRetail)}</span>,
    },
    {
      header: "Potential Margin",
      className: "text-right",
      render: (c) => (
        <span className="font-semibold text-emerald-600">{formatCurrency(c.totalRetail - c.totalCost)}</span>
      ),
    },
  ];

  const t = query.data?.totals;

  return (
    <div>
      <PageHeader
        title="Inventory Overview"
        description="Live valuation of everything on the shelves — by category, at cost and at retail."
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Package} label="Active Products" value={formatNumber(t?.products)} tone="navy" />
        <StatCard icon={Boxes} label="Categories" value={formatNumber(query.data?.byCategory.length)} tone="gold" />
        <StatCard icon={Banknote} label="Value at Cost" value={formatCurrency(t?.cost)} tone="navy" />
        <StatCard icon={TrendingUp} label="Value at Retail" value={formatCurrency(t?.retail)} tone="gold" />
      </div>

      <DataTable
        columns={columns}
        data={query.data?.byCategory as Row[] | undefined}
        loading={query.isLoading}
        keyFn={(c) => c.categoryId}
        emptyTitle="No inventory yet"
        emptyDescription="Add products and record stock to see valuations."
      />
    </div>
  );
}

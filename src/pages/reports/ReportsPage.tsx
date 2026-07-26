import { useState } from "react";
import { toast } from "sonner";
import {
  Banknote, ReceiptText, TrendingUp, TrendingDown, ShoppingBag, Percent, Landmark,
  Download, Package, AlertTriangle, PackageX, Loader2,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { usePermissions } from "@/hooks/use-permissions";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ChartCard, RangePicker, useReportRange, CHART_COLORS } from "./report-shared";

/**
 * HADRAN FABRICS MALL — Reports (Manager and above).
 * The numbers: period KPIs with growth, product & cashier leaderboards,
 * category & customer tables, live inventory valuation, CSV exports.
 * Visual charts live on the separate Analytics page.
 */

type Dataset = "sales" | "top_products" | "top_cashiers" | "payments" | "categories";

export default function ReportsPage() {
  const { can } = usePermissions();
  const utils = trpc.useUtils();
  const canExport = can("reports.export");
  const rangeCtl = useReportRange();
  const { range } = rangeCtl;
  const [exporting, setExporting] = useState<string | null>(null);

  const overviewQuery = trpc.reports.overview.useQuery(range);
  const productsQuery = trpc.reports.topProducts.useQuery({ ...range, limit: 8 });
  const cashiersQuery = trpc.reports.topCashiers.useQuery({ ...range, limit: 8 });
  const customersQuery = trpc.reports.topCustomers.useQuery({ ...range, limit: 6 });
  const categoriesQuery = trpc.reports.categoryBreakdown.useQuery(range);
  const valuationQuery = trpc.reports.inventoryValuation.useQuery();

  const ov = overviewQuery.data?.current;
  const growth = overviewQuery.data?.revenueGrowthPct ?? null;

  const doExport = async (dataset: Dataset) => {
    setExporting(dataset);
    try {
      const result = await utils.reports.exportCsv.fetch({ ...range, dataset });
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Report downloaded.", { description: result.filename });
    } catch (err) {
      toast.error("Export failed.", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setExporting(null);
    }
  };

  const ExportBtn = ({ dataset }: { dataset: Dataset }) =>
    canExport ? (
      <Button size="sm" variant="outline" disabled={exporting !== null} onClick={() => void doExport(dataset)}>
        {exporting === dataset ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
        CSV
      </Button>
    ) : undefined;

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader title="Reports" description="Period KPIs, leaderboards, category & customer tables, stock valuation and CSV exports. For visual trends, open Analytics." />

      <RangePicker {...rangeCtl} trailing={canExport ? <ExportBtn dataset="sales" /> : undefined} />

      {/* Overview cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard
          icon={Banknote}
          label="Revenue"
          value={formatCurrency(ov?.revenue ?? 0)}
          hint={
            growth == null
              ? `vs ${formatCurrency(overviewQuery.data?.previous.revenue ?? 0)} previously`
              : `${growth >= 0 ? "+" : ""}${growth.toFixed(1)}% vs previous period`
          }
          tone="gold"
        />
        <StatCard icon={ReceiptText} label="Orders" value={String(ov?.orders ?? 0)} hint="Completed sales" />
        <StatCard icon={TrendingUp} label="Average ticket" value={formatCurrency(ov?.averageTicket ?? 0)} hint="Revenue ÷ orders" />
        <StatCard icon={ShoppingBag} label="Items sold" value={formatQty(ov?.items ?? 0)} hint="Across all orders" />
        <StatCard icon={Percent} label="Discounts given" value={formatCurrency(ov?.discounts ?? 0)} hint="Item + cart + customer" />
        <StatCard icon={Landmark} label="VAT collected" value={formatCurrency(ov?.tax ?? 0)} hint={ov && ov.service > 0 ? `+ ${formatCurrency(ov.service)} service` : "On completed sales"} />
      </div>

      {growth != null && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm",
            growth >= 0 ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700",
          )}
        >
          {growth >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          Revenue is {growth >= 0 ? "up" : "down"} {Math.abs(growth).toFixed(1)}% compared with the previous equivalent period (
          {formatCurrency(overviewQuery.data?.previous.revenue ?? 0)} then).
        </div>
      )}

      {/* Leaderboards row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Top products" subtitle="By revenue in the period" action={<ExportBtn dataset="top_products" />}>
          <ul className="space-y-2.5">
            {(productsQuery.data ?? []).map((p, i) => {
              const max = productsQuery.data?.[0]?.revenue ?? 1;
              return (
                <li key={p.productId}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-navy-900 font-display text-[10px] font-bold text-gold-400">
                        {i + 1}
                      </span>
                      <span className="truncate font-medium">{p.name}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{formatQty(p.quantity)} sold</span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">{formatCurrency(p.revenue)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-navy-900/10">
                    <div className="h-full rounded-full bg-gold-500" style={{ width: `${(p.revenue / max) * 100}%` }} />
                  </div>
                </li>
              );
            })}
            {(productsQuery.data ?? []).length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No sales in this period.</p>}
          </ul>
        </ChartCard>

        <ChartCard title="Cashier leaderboard" subtitle="Revenue and orders per staff member" action={<ExportBtn dataset="top_cashiers" />}>
          <ul className="space-y-2.5">
            {(cashiersQuery.data ?? []).map((c, i) => {
              const max = cashiersQuery.data?.[0]?.revenue ?? 1;
              return (
                <li key={c.cashierId}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gold-500 font-display text-[10px] font-bold text-navy-950">
                        {i + 1}
                      </span>
                      <span className="font-medium">{c.name}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {c.orders} orders · avg {formatCurrency(c.averageTicket)}
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums">{formatCurrency(c.revenue)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-navy-900/10">
                    <div className="h-full rounded-full bg-navy-800" style={{ width: `${(c.revenue / max) * 100}%` }} />
                  </div>
                </li>
              );
            })}
            {(cashiersQuery.data ?? []).length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No sales in this period.</p>}
          </ul>
        </ChartCard>
      </div>

      {/* Categories + customers row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Category breakdown" subtitle="Where the revenue comes from" action={<ExportBtn dataset="categories" />}>
          <ul className="space-y-2">
            {(categoriesQuery.data ?? []).map((c, i) => (
              <li key={c.categoryId} className="flex items-center gap-3 text-sm">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                <span className="text-xs text-muted-foreground">{c.share.toFixed(1)}%</span>
                <span className="w-24 text-right font-semibold tabular-nums">{formatCurrency(c.revenue)}</span>
              </li>
            ))}
            {(categoriesQuery.data ?? []).length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No sales in this period.</p>}
          </ul>
        </ChartCard>

        <ChartCard title="Top customers" subtitle="Biggest spenders in the period">
          <ul className="space-y-2">
            {(customersQuery.data ?? []).map((c, i) => (
              <li key={c.customerId} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-900 font-display text-[10px] font-bold text-gold-400">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                <span className="text-xs text-muted-foreground">{c.orders} order(s)</span>
                <span className="font-semibold tabular-nums">{formatCurrency(c.revenue)}</span>
              </li>
            ))}
            {(customersQuery.data ?? []).length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">No registered-customer sales in this period — attach customers at the POS to build this list.</p>
            )}
          </ul>
        </ChartCard>
      </div>

      {/* Inventory valuation */}
      <ChartCard title="Inventory valuation" subtitle="Live — not affected by the date range">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard icon={Package} label="Products" value={String(valuationQuery.data?.productCount ?? 0)} hint="Active catalogue items" />
          <StatCard icon={Banknote} label="Stock at cost" value={formatCurrency(valuationQuery.data?.costValue ?? 0)} hint="What the shelves cost" tone="gold" />
          <StatCard icon={TrendingUp} label="Stock at retail" value={formatCurrency(valuationQuery.data?.retailValue ?? 0)} hint="If everything sells" />
          <StatCard icon={AlertTriangle} label="Low stock" value={String(valuationQuery.data?.lowStock ?? 0)} hint="At or below reorder level" tone="emerald" />
          <StatCard icon={PackageX} label="Out of stock" value={String(valuationQuery.data?.outOfStock ?? 0)} hint="Need restocking" tone="red" />
        </div>
        {(valuationQuery.data?.topHoldings ?? []).length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-navy-700">Largest holdings (by cost value)</p>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {valuationQuery.data!.topHoldings.map((h) => (
                <li key={h.id} className="rounded-lg border border-border px-3 py-2 text-sm">
                  <p className="truncate font-medium">{h.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatQty(h.currentStock)} in stock · <span className="font-semibold text-navy-900">{formatCurrency(h.value)}</span>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </ChartCard>
    </div>
  );
}

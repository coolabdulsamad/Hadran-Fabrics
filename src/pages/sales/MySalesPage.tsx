import { useState } from "react";
import { Link } from "react-router";
import { ReceiptText, ShoppingCart, Banknote, CalendarClock } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge, toneForStatus } from "@/components/common/StatusBadge";
import { SaleDetailsDrawer } from "@/components/pos/SaleDetailsDrawer";
import { ReceiptPreview } from "@/components/pos/ReceiptPreview";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { SALE_STATUSES, type SaleStatus } from "@contracts/constants";
import { SALE_STATUS_LABELS } from "@contracts/labels";

/**
 * HADRAN FABRICS MALL — My Sales (cashier personal history).
 * Today's summary cards + full paginated receipt log with
 * details drawer and reprint.
 */

interface HistoryRow {
  id: number;
  receiptNo: string;
  status: SaleStatus;
  itemCount: number;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  changeGiven: number;
  createdAt: string | Date;
  customerName: string | null;
}

export default function MySalesPage() {
  const [status, setStatus] = useState<SaleStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [detailsId, setDetailsId] = useState<number | null>(null);
  const [reprintId, setReprintId] = useState<number | null>(null);

  const summaryQuery = trpc.sales.myDailySummary.useQuery();
  const configQuery = trpc.sales.posConfig.useQuery();
  const historyQuery = trpc.sales.myHistory.useQuery({
    status: status === "ALL" ? undefined : status,
    page,
    pageSize: 15,
  });

  const columns: Column<HistoryRow>[] = [
    {
      header: "Receipt",
      render: (r) => (
        <div>
          <p className="font-semibold text-navy-900">{r.receiptNo}</p>
          <p className="text-[11px] text-muted-foreground">{formatDateTime(new Date(r.createdAt))}</p>
        </div>
      ),
    },
    {
      header: "Customer",
      render: (r) => r.customerName ?? <span className="text-muted-foreground">Walk-in</span>,
    },
    {
      header: "Items",
      className: "text-center",
      render: (r) => <span className="tabular-nums">{r.itemCount}</span>,
    },
    {
      header: "Total",
      className: "text-right",
      render: (r) => (
        <div className="text-right">
          <p className="font-semibold tabular-nums text-navy-900">{formatCurrency(r.grandTotal)}</p>
          {Number(r.changeGiven) > 0 && (
            <p className="text-[11px] text-muted-foreground">change {formatCurrency(Number(r.changeGiven))}</p>
          )}
        </div>
      ),
    },
    {
      header: "Status",
      render: (r) => <StatusBadge label={SALE_STATUS_LABELS[r.status]} tone={toneForStatus(r.status)} />,
    },
    {
      header: "",
      className: "text-right",
      render: (r) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setDetailsId(r.id)}
        >
          <ReceiptText className="mr-1.5 h-3.5 w-3.5" />
          View
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader
        title="My Sales"
        description="Every receipt you have issued — open any sale for full details or to reprint its receipt."
        actions={
          <Button asChild className="bg-gold-500 font-semibold text-navy-950 hover:bg-gold-400">
            <Link to="/pos">
              <ShoppingCart className="mr-1.5 h-4 w-4" />
              Open POS Terminal
            </Link>
          </Button>
        }
      />

      {/* Today summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={ReceiptText}
          label="Sales today"
          value={String(summaryQuery.data?.todayCount ?? 0)}
          hint="Completed receipts issued by you today"
        />
        <StatCard
          icon={Banknote}
          label="Revenue today"
          value={formatCurrency(summaryQuery.data?.todayTotal ?? 0)}
          hint="Your grand-total sum for today"
          tone="gold"
        />
        <StatCard
          icon={CalendarClock}
          label="Average ticket"
          value={
            summaryQuery.data && summaryQuery.data.todayCount > 0
              ? formatCurrency(summaryQuery.data.todayTotal / summaryQuery.data.todayCount)
              : formatCurrency(0)
          }
          hint="Revenue ÷ receipts today"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as SaleStatus | "ALL");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[190px] bg-card">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {SALE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {SALE_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          {historyQuery.data?.total ?? 0} sale{(historyQuery.data?.total ?? 0) === 1 ? "" : "s"}
        </p>
      </div>

      <DataTable<HistoryRow>
        columns={columns}
        data={historyQuery.data?.items as HistoryRow[] | undefined}
        loading={historyQuery.isLoading}
        keyFn={(r) => r.id}
        emptyTitle="No sales yet"
        emptyDescription="Your completed sales will appear here as soon as you check out at the POS terminal."
        pagination={{
          page,
          pageSize: 15,
          total: historyQuery.data?.total ?? 0,
          onPage: setPage,
        }}
      />

      <SaleDetailsDrawer
        saleId={detailsId}
        open={detailsId != null}
        onClose={() => setDetailsId(null)}
        onReprint={(id: number) => setReprintId(id)}
      />

      <ReceiptPreview
        saleId={reprintId}
        open={reprintId != null}
        onClose={() => setReprintId(null)}
        mode="reprint"
        paperCheckEnabled={configQuery.data?.printerPaperCheck ?? true}
      />
    </div>
  );
}

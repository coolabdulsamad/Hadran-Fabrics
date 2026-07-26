import { useState } from "react";
import { ReceiptText, Banknote, Percent, Landmark, Ban, Search, RotateCcw } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge, toneForStatus } from "@/components/common/StatusBadge";
import { SaleDetailsDrawer } from "@/components/pos/SaleDetailsDrawer";
import { ReceiptPreview } from "@/components/pos/ReceiptPreview";
import { Input } from "@/components/ui/input";
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
 * HADRAN FABRICS MALL — Sales History (all staff).
 * Manager+ view of every sale in the store with cashier / customer /
 * status / date filters, today's headline figures, details and reprint.
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
  cashierName: string | null;
  customerName: string | null;
}

export default function SalesHistoryPage() {
  const [search, setSearch] = useState("");
  const [cashierId, setCashierId] = useState<number | "ALL">("ALL");
  const [status, setStatus] = useState<SaleStatus | "ALL">("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [detailsId, setDetailsId] = useState<number | null>(null);
  const [reprintId, setReprintId] = useState<number | null>(null);

  const statsQuery = trpc.sales.todayStats.useQuery();
  const cashiersQuery = trpc.sales.cashiers.useQuery();
  const configQuery = trpc.sales.posConfig.useQuery();

  const historyQuery = trpc.sales.history.useQuery({
    search: search.trim() || undefined,
    cashierId: cashierId === "ALL" ? undefined : cashierId,
    status: status === "ALL" ? undefined : status,
    dateFrom: dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : undefined,
    dateTo: dateTo ? new Date(`${dateTo}T23:59:59.999`).toISOString() : undefined,
    page,
    pageSize: 15,
  });

  const resetPage = () => setPage(1);
  const hasFilters = search.trim() || cashierId !== "ALL" || status !== "ALL" || dateFrom || dateTo;

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
    { header: "Cashier", render: (r) => r.cashierName ?? "—" },
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
          {Number(r.discountTotal) > 0 && (
            <p className="text-[11px] text-emerald-700">−{formatCurrency(Number(r.discountTotal))} disc.</p>
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
        <Button size="sm" variant="outline" onClick={() => setDetailsId(r.id)}>
          <ReceiptText className="mr-1.5 h-3.5 w-3.5" />
          View
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader
        title="Sales History"
        description="Every sale across all staff — filter by cashier, status or date, open full details and reprint receipts."
      />

      {/* Today stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          icon={Banknote}
          label="Revenue today"
          value={formatCurrency(statsQuery.data?.todayRevenue ?? 0)}
          hint={`${statsQuery.data?.todayCount ?? 0} completed sale(s)`}
          tone="gold"
        />
        <StatCard
          icon={ReceiptText}
          label="Average ticket"
          value={formatCurrency(statsQuery.data?.averageTicket ?? 0)}
          hint="Revenue ÷ completed sales"
        />
        <StatCard
          icon={Percent}
          label="Discounts today"
          value={formatCurrency(statsQuery.data?.todayDiscounts ?? 0)}
          hint="All discount types combined"
        />
        <StatCard
          icon={Landmark}
          label="VAT today"
          value={formatCurrency(statsQuery.data?.todayTax ?? 0)}
          hint="Tax collected on completed sales"
        />
        <StatCard
          icon={Ban}
          label="Voided today"
          value={String(statsQuery.data?.todayVoided ?? 0)}
          hint="Sales cancelled with stock restored"
          tone="red"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-no-scan
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
            placeholder="Search receipt no…"
            className="input-lux pl-10"
          />
        </div>
        <Select
          value={cashierId === "ALL" ? "ALL" : String(cashierId)}
          onValueChange={(v) => {
            setCashierId(v === "ALL" ? "ALL" : Number(v));
            resetPage();
          }}
        >
          <SelectTrigger className="w-[170px] bg-card">
            <SelectValue placeholder="Cashier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All cashiers</SelectItem>
            {(cashiersQuery.data ?? []).map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as SaleStatus | "ALL");
            resetPage();
          }}
        >
          <SelectTrigger className="w-[170px] bg-card">
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
        <Input
          data-no-scan
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            resetPage();
          }}
          className="input-lux w-[150px]"
          aria-label="From date"
        />
        <Input
          data-no-scan
          type="date"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            resetPage();
          }}
          className="input-lux w-[150px]"
          aria-label="To date"
        />
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setCashierId("ALL");
              setStatus("ALL");
              setDateFrom("");
              setDateTo("");
              resetPage();
            }}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reset
          </Button>
        )}
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {historyQuery.data?.total ?? 0} sale{(historyQuery.data?.total ?? 0) === 1 ? "" : "s"}
          {hasFilters ? " matching filters" : ""}
        </span>
        {historyQuery.data && historyQuery.data.filteredRevenue > 0 && (
          <span>
            Completed value:{" "}
            <span className="font-semibold text-navy-900">{formatCurrency(historyQuery.data.filteredRevenue)}</span>
          </span>
        )}
      </div>

      <DataTable<HistoryRow>
        columns={columns}
        data={historyQuery.data?.items as HistoryRow[] | undefined}
        loading={historyQuery.isLoading}
        keyFn={(r) => r.id}
        emptyTitle="No sales found"
        emptyDescription="Try widening the filters — or no sales have been made yet in this range."
        pagination={{ page, pageSize: 15, total: historyQuery.data?.total ?? 0, onPage: setPage }}
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

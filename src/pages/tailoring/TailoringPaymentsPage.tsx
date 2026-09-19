import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Printer, Loader2, Banknote, CircleDollarSign, Scale } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { DataTable, type Column } from "@/components/common/DataTable";
import { FilterBar, FilterField } from "@/components/common/FilterBar";
import { ExportButton, type ExportColumn } from "@/components/common/ExportButton";
import { StatusBadge } from "@/components/common/StatusBadge";
import { PrintPortal } from "@/components/common/PrintPortal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod, type TailoringOrderStatus } from "@contracts/constants";
import { TAILORING_STATUS_LABELS } from "@contracts/labels";
import { tailoringStatusTone } from "@/lib/tailoring";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * HADRAN FABRICS MALL — tailoring payments
 * Every deposit and balance collection for tailoring orders, filterable
 * and exportable. Each row has a matching entry in the money ledger.
 */

interface PaymentRow {
  id: number;
  orderId: number;
  orderNo: string | null;
  customerName: string | null;
  orderStatus: TailoringOrderStatus | null;
  amount: string;
  method: PaymentMethod;
  note: string | null;
  receivedByName: string | null;
  createdAt: string | Date;
}

const EMPTY_FILTERS = { method: "", dateFrom: "", dateTo: "", search: "" };

export default function TailoringPaymentsPage() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [printRows, setPrintRows] = useState<PaymentRow[] | null>(null);
  const [printBusy, setPrintBusy] = useState(false);

  const queryInput = useMemo(
    () => ({
      method: (filters.method || undefined) as PaymentMethod | undefined,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
      search: filters.search || undefined,
      page,
      pageSize: 25,
    }),
    [filters, page],
  );

  const list = trpc.tailoring.payments.useQuery(queryInput, { retry: 1 });
  const exportQuery = trpc.tailoring.exportPayments.useQuery(
    { method: queryInput.method, dateFrom: queryInput.dateFrom, dateTo: queryInput.dateTo, search: queryInput.search },
    { enabled: false, retry: 1 },
  );

  const setFilter = (key: keyof typeof EMPTY_FILTERS, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  const pageTotals = useMemo(() => {
    const rows = (list.data?.rows ?? []) as PaymentRow[];
    const collected = rows.reduce((s, r) => s + Math.max(Number(r.amount), 0), 0);
    const refunds = rows.reduce((s, r) => s + Math.abs(Math.min(Number(r.amount), 0)), 0);
    return { collected, refunds, net: collected - refunds };
  }, [list.data?.rows]);

  const exportColumns: ExportColumn<PaymentRow>[] = [
    { header: "Date/Time", value: (r) => formatDateTime(r.createdAt) },
    { header: "Order", value: (r) => r.orderNo },
    { header: "Customer", value: (r) => r.customerName },
    { header: "Method", value: (r) => PAYMENT_METHOD_LABELS[r.method] },
    { header: "Amount (₦)", value: (r) => Number(r.amount) },
    { header: "Note", value: (r) => r.note },
    { header: "Received By", value: (r) => r.receivedByName },
  ];

  const handlePrint = async () => {
    setPrintBusy(true);
    try {
      const rows = (await exportQuery.refetch()).data as PaymentRow[] | undefined;
      if (!rows?.length) {
        toast.error("Nothing to print with the current filters.");
        return;
      }
      setPrintRows(rows);
      setTimeout(() => window.print(), 250);
    } finally {
      setPrintBusy(false);
    }
  };

  const columns: Column<PaymentRow>[] = [
    { header: "When", render: (r) => <span className="whitespace-nowrap text-xs">{formatDateTime(r.createdAt)}</span> },
    {
      header: "Order",
      render: (r) =>
        r.orderNo ? (
          <Link to={`/tailoring/orders/${r.orderId}`} className="font-mono text-xs font-semibold text-navy-800 underline-offset-2 hover:text-gold-700 hover:underline">
            {r.orderNo}
          </Link>
        ) : (
          "—"
        ),
    },
    { header: "Customer", render: (r) => <span className="text-sm">{r.customerName ?? "—"}</span> },
    { header: "Order Status", render: (r) => (r.orderStatus ? <StatusBadge label={TAILORING_STATUS_LABELS[r.orderStatus]} tone={tailoringStatusTone(r.orderStatus)} /> : "—") },
    { header: "Method", render: (r) => PAYMENT_METHOD_LABELS[r.method] },
    { header: "Note", render: (r) => <span className="block max-w-[200px] truncate text-xs text-muted-foreground" title={r.note ?? undefined}>{r.note ?? "—"}</span> },
    {
      header: "Amount",
      className: "text-right",
      render: (r) => (
        <span className={cn("font-semibold", Number(r.amount) < 0 ? "text-red-600" : "text-emerald-700")}>
          {Number(r.amount) < 0 ? "−" : "+"}{formatCurrency(Math.abs(Number(r.amount)))}
        </span>
      ),
    },
    { header: "By", render: (r) => <span className="text-xs">{r.receivedByName ?? "—"}</span> },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Tailoring Payments"
        description="Deposits, balance collections and refunds — fully tied into the money ledger."
        actions={
          <>
            <ExportButton filename="tailoring-payments" sheetName="Tailoring Payments" columns={exportColumns} rows={async () => ((await exportQuery.refetch()).data ?? []) as PaymentRow[]} />
            <Button variant="outline" onClick={handlePrint} disabled={printBusy} className="gap-2 border-gold-500/40 text-navy-800 hover:bg-gold-50">
              {printBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4 text-gold-600" />}
              Print
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Banknote} label="Collected (this page)" value={formatCurrency(pageTotals.collected)} tone="emerald" hint="Payments in" />
        <StatCard icon={CircleDollarSign} label="Refunds (this page)" value={formatCurrency(pageTotals.refunds)} tone="red" hint="Cancellation refunds" />
        <StatCard icon={Scale} label="Net (this page)" value={formatCurrency(pageTotals.net)} tone="navy" hint="Collected minus refunds" />
      </div>

      <div className="mt-6">
        <FilterBar onReset={() => { setFilters(EMPTY_FILTERS); setPage(1); }}>
          <FilterField label="Method">
            <Select value={filters.method || "ALL"} onValueChange={(v) => setFilter("method", v === "ALL" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All methods</SelectItem>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="From">
            <Input type="date" value={filters.dateFrom} onChange={(e) => setFilter("dateFrom", e.target.value)} />
          </FilterField>
          <FilterField label="To">
            <Input type="date" value={filters.dateTo} onChange={(e) => setFilter("dateTo", e.target.value)} />
          </FilterField>
          <FilterField label="Search" className="sm:min-w-[200px]">
            <Input placeholder="Order no or customer…" value={filters.search} onChange={(e) => setFilter("search", e.target.value)} />
          </FilterField>
        </FilterBar>
      </div>

      <div className="mt-6">
        <DataTable
          columns={columns}
          data={list.data?.rows as PaymentRow[] | undefined}
          loading={list.isLoading}
          keyFn={(r) => r.id}
          emptyTitle="No tailoring payments found"
          emptyDescription="Deposits and balance collections appear here automatically."
          pagination={{ page, pageSize: 25, total: list.data?.total ?? 0, onPage: setPage }}
        />
      </div>

      {/* Print sheet */}
      {printRows && (
        <PrintPortal>
          <div className="p-6">
            <h1 style={{ fontSize: 18, fontWeight: 700 }}>Hadran Fabrics Mall — Tailoring Payments</h1>
            <p style={{ fontSize: 11, marginTop: 4 }}>
              Printed {formatDate(new Date())}
              {filters.dateFrom && ` · From ${filters.dateFrom}`}
              {filters.dateTo && ` · To ${filters.dateTo}`}
              {` · ${printRows.length} row(s)`}
            </p>
            <table style={{ width: "100%", marginTop: 12, borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  {["When", "Order", "Customer", "Method", "Note", "Amount"].map((h) => (
                    <th key={h} style={{ border: "1px solid #999", padding: "4px 6px", textAlign: "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {printRows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{formatDateTime(r.createdAt)}</td>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{r.orderNo}</td>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{r.customerName}</td>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{PAYMENT_METHOD_LABELS[r.method]}</td>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{r.note ?? ""}</td>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{Number(r.amount) < 0 ? "−" : "+"}{formatCurrency(Math.abs(Number(r.amount)))}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={5} style={{ border: "1px solid #999", padding: "4px 6px", fontWeight: 700 }}>Net (filtered)</td>
                  <td style={{ border: "1px solid #999", padding: "4px 6px", fontWeight: 700 }}>
                    {formatCurrency(printRows.reduce((s, r) => s + Number(r.amount), 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </PrintPortal>
      )}
    </div>
  );
}

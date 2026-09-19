import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { PlusCircle, Printer, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/layout/PageHeader";
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
import { useAuth } from "@/hooks/use-auth";
import {
  FABRIC_SOURCES,
  ORDER_PAYMENT_STATUSES,
  TAILORING_ORDER_STATUSES,
  type FabricSource,
  type OrderPaymentStatus,
  type TailoringOrderStatus,
} from "@contracts/constants";
import { FABRIC_SOURCE_LABELS, ORDER_PAYMENT_STATUS_LABELS, TAILORING_STATUS_LABELS } from "@contracts/labels";
import { tailoringStatusTone, paymentStatusTone } from "@/lib/tailoring";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";

/**
 * HADRAN FABRICS MALL — tailoring orders list
 * Every job with status / payment / fabric source / date filters,
 * deep-linkable from the dashboard workflow board, plus export & print.
 */

interface OrderRow {
  id: number;
  orderNo: string;
  customerName: string;
  customerPhone: string | null;
  styleDescription: string;
  fabricSource: FabricSource;
  status: TailoringOrderStatus;
  tailorId: number | null;
  tailorName?: string | null;
  dueDate: string | Date | null;
  price: string;
  amountPaid: string;
  paymentStatus: OrderPaymentStatus;
  receivedByName: string | null;
  createdAt: string | Date;
}

const EMPTY_FILTERS = { status: "", paymentStatus: "", fabricSource: "", dateFrom: "", dateTo: "", search: "" };

export default function TailoringOrdersPage() {
  const { hasPermission } = useAuth();
  const [searchParams] = useSearchParams();
  const initialStatus = searchParams.get("status") ?? "";

  const [filters, setFilters] = useState({ ...EMPTY_FILTERS, status: initialStatus });
  const [page, setPage] = useState(1);
  const [printRows, setPrintRows] = useState<OrderRow[] | null>(null);
  const [printBusy, setPrintBusy] = useState(false);

  const queryInput = useMemo(
    () => ({
      status: (filters.status || undefined) as TailoringOrderStatus | undefined,
      paymentStatus: (filters.paymentStatus || undefined) as OrderPaymentStatus | undefined,
      fabricSource: (filters.fabricSource || undefined) as FabricSource | undefined,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
      search: filters.search || undefined,
      page,
      pageSize: 25,
    }),
    [filters, page],
  );

  const list = trpc.tailoring.list.useQuery(queryInput, { retry: 1 });
  const exportQuery = trpc.tailoring.exportRows.useQuery(
    {
      status: queryInput.status,
      paymentStatus: queryInput.paymentStatus,
      fabricSource: queryInput.fabricSource,
      dateFrom: queryInput.dateFrom,
      dateTo: queryInput.dateTo,
      search: queryInput.search,
    },
    { enabled: false, retry: 1 },
  );

  const setFilter = (key: keyof typeof EMPTY_FILTERS, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  const exportColumns: ExportColumn<OrderRow>[] = [
    { header: "Order No", value: (r) => r.orderNo },
    { header: "Date", value: (r) => formatDateTime(r.createdAt) },
    { header: "Customer", value: (r) => r.customerName },
    { header: "Phone", value: (r) => r.customerPhone },
    { header: "Style", value: (r) => r.styleDescription },
    { header: "Fabric", value: (r) => FABRIC_SOURCE_LABELS[r.fabricSource] },
    { header: "Tailor", value: (r) => r.tailorName },
    { header: "Status", value: (r) => TAILORING_STATUS_LABELS[r.status] },
    { header: "Due Date", value: (r) => (r.dueDate ? formatDate(r.dueDate) : "") },
    { header: "Price (₦)", value: (r) => Number(r.price) },
    { header: "Paid (₦)", value: (r) => Number(r.amountPaid) },
    { header: "Balance (₦)", value: (r) => Number(r.price) - Number(r.amountPaid) },
    { header: "Payment", value: (r) => ORDER_PAYMENT_STATUS_LABELS[r.paymentStatus] },
    { header: "Received By", value: (r) => r.receivedByName },
  ];

  const handlePrint = async () => {
    setPrintBusy(true);
    try {
      const rows = (await exportQuery.refetch()).data as OrderRow[] | undefined;
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

  const columns: Column<OrderRow>[] = [
    { header: "Order", render: (r) => <Link to={`/tailoring/orders/${r.id}`} className="font-mono text-xs font-semibold text-navy-800 underline-offset-2 hover:text-gold-700 hover:underline">{r.orderNo}</Link> },
    {
      header: "Customer & Style",
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-navy-900">{r.customerName}</p>
          <p className="truncate text-[11px] text-muted-foreground">{r.styleDescription}</p>
        </div>
      ),
    },
    {
      header: "Fabric",
      render: (r) => (
        <StatusBadge
          label={FABRIC_SOURCE_LABELS[r.fabricSource]}
          tone={r.fabricSource === "SHOP_STOCK" ? "gold" : "gray"}
        />
      ),
    },
    { header: "Tailor", render: (r) => <span className="whitespace-nowrap text-xs">{r.tailorName ?? <span className="text-muted-foreground">Unassigned</span>}</span> },
    { header: "Received", render: (r) => <span className="whitespace-nowrap text-xs">{formatDateTime(r.createdAt)}</span> },
    { header: "Due", render: (r) => <span className="whitespace-nowrap text-xs">{r.dueDate ? formatDate(r.dueDate) : "—"}</span> },
    { header: "Status", render: (r) => <StatusBadge label={TAILORING_STATUS_LABELS[r.status]} tone={tailoringStatusTone(r.status)} /> },
    { header: "Payment", render: (r) => <StatusBadge label={ORDER_PAYMENT_STATUS_LABELS[r.paymentStatus]} tone={paymentStatusTone(r.paymentStatus)} /> },
    {
      header: "Price",
      className: "text-right",
      render: (r) => <span className="font-semibold text-navy-900">{formatCurrency(r.price)}</span>,
    },
    {
      header: "Balance",
      className: "text-right",
      render: (r) => {
        const bal = Number(r.price) - Number(r.amountPaid);
        return <span className={bal > 0 ? "font-semibold text-red-600" : "text-emerald-700"}>{formatCurrency(bal)}</span>;
      },
    },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Tailoring Orders"
        description="Track every job from received → cutting → sewing → finishing → fitting → ready → delivered."
        actions={
          <>
            <ExportButton filename="tailoring-orders" sheetName="Tailoring Orders" columns={exportColumns} rows={async () => ((await exportQuery.refetch()).data ?? []) as OrderRow[]} />
            <Button variant="outline" onClick={handlePrint} disabled={printBusy} className="gap-2 border-gold-500/40 text-navy-800 hover:bg-gold-50">
              {printBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4 text-gold-600" />}
              Print
            </Button>
            {hasPermission("tailoring.manage") && (
              <Link to="/tailoring/orders/new">
                <Button className="gap-2 bg-navy-800 text-cream-100 hover:bg-navy-700">
                  <PlusCircle className="h-4 w-4 text-gold-400" />
                  New Order
                </Button>
              </Link>
            )}
          </>
        }
      />

      <FilterBar onReset={() => { setFilters(EMPTY_FILTERS); setPage(1); }}>
        <FilterField label="Status">
          <Select value={filters.status || "ALL"} onValueChange={(v) => setFilter("status", v === "ALL" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              {TAILORING_ORDER_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{TAILORING_STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Payment">
          <Select value={filters.paymentStatus || "ALL"} onValueChange={(v) => setFilter("paymentStatus", v === "ALL" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All</SelectItem>
              {ORDER_PAYMENT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{ORDER_PAYMENT_STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Fabric">
          <Select value={filters.fabricSource || "ALL"} onValueChange={(v) => setFilter("fabricSource", v === "ALL" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All sources</SelectItem>
              {FABRIC_SOURCES.map((s) => (
                <SelectItem key={s} value={s}>{FABRIC_SOURCE_LABELS[s]}</SelectItem>
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
          <Input placeholder="Order no, customer, phone or style…" value={filters.search} onChange={(e) => setFilter("search", e.target.value)} />
        </FilterField>
      </FilterBar>

      <div className="mt-6">
        <DataTable
          columns={columns}
          data={list.data?.rows as OrderRow[] | undefined}
          loading={list.isLoading}
          keyFn={(r) => r.id}
          emptyTitle="No tailoring orders found"
          emptyDescription="Receive a new order to get the workshop moving."
          pagination={{ page, pageSize: 25, total: list.data?.total ?? 0, onPage: setPage }}
        />
      </div>

      {/* Print sheet */}
      {printRows && (
        <PrintPortal>
          <div className="p-6">
            <h1 style={{ fontSize: 18, fontWeight: 700 }}>Hadran Fabrics Mall — Tailoring Orders</h1>
            <p style={{ fontSize: 11, marginTop: 4 }}>
              Printed {formatDate(new Date())}
              {filters.dateFrom && ` · From ${filters.dateFrom}`}
              {filters.dateTo && ` · To ${filters.dateTo}`}
              {` · ${printRows.length} order(s)`}
            </p>
            <table style={{ width: "100%", marginTop: 12, borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  {["Order", "Customer", "Style", "Received", "Due", "Status", "Price", "Balance"].map((h) => (
                    <th key={h} style={{ border: "1px solid #999", padding: "4px 6px", textAlign: "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {printRows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{r.orderNo}</td>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{r.customerName}</td>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{r.styleDescription}</td>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{formatDateTime(r.createdAt)}</td>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{r.dueDate ? formatDate(r.dueDate) : "—"}</td>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{TAILORING_STATUS_LABELS[r.status]}</td>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{formatCurrency(r.price)}</td>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{formatCurrency(Number(r.price) - Number(r.amountPaid))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PrintPortal>
      )}
    </div>
  );
}

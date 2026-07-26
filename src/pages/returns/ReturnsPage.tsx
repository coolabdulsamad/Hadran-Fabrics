import { useState } from "react";
import { RotateCcw, ArrowLeftRight, Plus, Search } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { usePermissions } from "@/hooks/use-permissions";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge, toneForStatus } from "@/components/common/StatusBadge";
import { CreateReturnDialog } from "@/components/returns/CreateReturnDialog";
import { ReturnDetailsDrawer } from "@/components/returns/ReturnDetailsDrawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { RETURN_STATUSES, RETURN_TYPES, type ReturnStatus, type ReturnType } from "@contracts/constants";

/**
 * HADRAN FABRICS MALL — Returns & Exchanges (manager area).
 * Manager requests wait for admin approval; Admins process immediately.
 * Stock is restored through the movement ledger; returned quantities
 * are tracked per sale line so nothing can come back twice.
 */

interface ReturnRow {
  return: {
    id: number;
    reference: string;
    type: ReturnType;
    status: ReturnStatus;
    reason: string;
    refundAmount: number;
    createdAt: string | Date;
  };
  receiptNo: string;
  customerName: string | null;
  processorName: string | null;
}

export default function ReturnsPage() {
  const { can } = usePermissions();
  const canProcess = can("returns.process");

  const [status, setStatus] = useState<ReturnStatus | "ALL">("ALL");
  const [type, setType] = useState<ReturnType | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailsId, setDetailsId] = useState<number | null>(null);

  const listQuery = trpc.returns.list.useQuery({
    status: status === "ALL" ? undefined : status,
    type: type === "ALL" ? undefined : type,
    search: search.trim() || undefined,
    page,
    pageSize: 15,
  });

  const columns: Column<ReturnRow>[] = [
    {
      header: "Reference",
      render: (r) => (
        <div>
          <p className="flex items-center gap-1.5 font-semibold text-navy-900">
            {r.return.type === "EXCHANGE" ? (
              <ArrowLeftRight className="h-3.5 w-3.5 text-gold-600" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5 text-gold-600" />
            )}
            {r.return.reference}
          </p>
          <p className="text-[11px] text-muted-foreground">{formatDateTime(new Date(r.return.createdAt))}</p>
        </div>
      ),
    },
    { header: "Receipt", render: (r) => r.receiptNo },
    {
      header: "Customer",
      render: (r) => r.customerName ?? <span className="text-muted-foreground">Walk-in</span>,
    },
    {
      header: "Reason",
      render: (r) => <span className="line-clamp-1 max-w-[200px] text-muted-foreground">{r.return.reason}</span>,
    },
    {
      header: "Refund",
      className: "text-right",
      render: (r) => (
        <span className="font-semibold tabular-nums text-navy-900">{formatCurrency(r.return.refundAmount)}</span>
      ),
    },
    {
      header: "Processed by",
      render: (r) => r.processorName ?? <span className="text-muted-foreground">—</span>,
    },
    {
      header: "Status",
      render: (r) => <StatusBadge label={r.return.status} tone={toneForStatus(r.return.status)} />,
    },
    {
      header: "",
      className: "text-right",
      render: (r) => (
        <Button size="sm" variant="outline" onClick={() => setDetailsId(r.return.id)}>
          View
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader
        title="Returns & Exchanges"
        description="Process customer returns and exchanges against their original receipt. Manager requests are approved by an Admin before stock and refunds move."
        actions={
          canProcess ? (
            <Button
              className="bg-gold-500 font-semibold text-navy-950 hover:bg-gold-400"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              New Return / Exchange
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-no-scan
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search reference…"
            className="input-lux pl-10"
          />
        </div>
        <Select
          value={type}
          onValueChange={(v) => {
            setType(v as ReturnType | "ALL");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[160px] bg-card">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All types</SelectItem>
            {RETURN_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t === "EXCHANGE" ? "Exchanges" : "Returns"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as ReturnStatus | "ALL");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[160px] bg-card">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {RETURN_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {listQuery.data?.total ?? 0} record{(listQuery.data?.total ?? 0) === 1 ? "" : "s"}
        </span>
      </div>

      <DataTable<ReturnRow>
        columns={columns}
        data={listQuery.data?.items as ReturnRow[] | undefined}
        loading={listQuery.isLoading}
        keyFn={(r) => r.return.id}
        emptyTitle="No returns yet"
        emptyDescription="Processed returns and exchanges will appear here, with their stock and refund trail."
        pagination={{ page, pageSize: 15, total: listQuery.data?.total ?? 0, onPage: setPage }}
      />

      <CreateReturnDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onProcessed={() => void listQuery.refetch()}
      />

      <ReturnDetailsDrawer returnId={detailsId} open={detailsId != null} onClose={() => setDetailsId(null)} />
    </div>
  );
}

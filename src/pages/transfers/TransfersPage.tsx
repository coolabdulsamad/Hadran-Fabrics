import { useState } from "react";
import { Link } from "react-router";
import { ArrowRight, ArrowRightLeft, CheckCheck, Clock3, PackageCheck, PlusCircle, Truck } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { DataTable, type Column } from "@/components/common/DataTable";
import { FilterBar, FilterField } from "@/components/common/FilterBar";
import { StatusBadge } from "@/components/common/StatusBadge";
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
import { TRANSFER_STATUS_LABELS } from "@contracts/labels";
import { TRANSFER_STATUSES, type TransferStatus } from "@contracts/constants";
import { transferStatusTone } from "@/lib/branches";
import { formatDateTime, formatNumber } from "@/lib/format";

/**
 * HADRAN FABRICS MALL — stock transfers page
 * Inter-branch stock movements. The list is scoped to the caller's active
 * branch (sent OR received); filters cover direction, status and dates.
 */

interface TransferRow {
  id: number;
  refNo: string;
  fromBranchId: number;
  toBranchId: number;
  fromBranchName: string;
  toBranchName: string;
  status: TransferStatus;
  note: string | null;
  createdAt: string | Date;
  sentAt: string | Date | null;
  receivedAt: string | Date | null;
  itemCount: number;
}

const ALL = "__ALL__";

export default function TransfersPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("transfers.manage");

  const [direction, setDirection] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const summary = trpc.transfers.summary.useQuery(undefined, { retry: 1 });
  const list = trpc.transfers.list.useQuery(
    {
      direction: direction === ALL ? undefined : (direction as "SENT" | "RECEIVED"),
      status: status === ALL ? undefined : (status as TransferStatus),
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      search: search || undefined,
      page,
      pageSize,
    },
    { retry: 1 },
  );

  const rows = (list.data?.rows ?? []) as TransferRow[];

  const reset = () => {
    setDirection(ALL);
    setStatus(ALL);
    setDateFrom("");
    setDateTo("");
    setSearch("");
    setPage(1);
  };

  const columns: Column<TransferRow>[] = [
    {
      header: "Ref №",
      render: (t) => (
        <Link to={`/transfers/${t.id}`} className="font-mono text-xs font-semibold text-navy-900 underline-offset-2 hover:text-gold-700 hover:underline">
          {t.refNo}
        </Link>
      ),
    },
    {
      header: "Route",
      render: (t) => (
        <span className="flex items-center gap-1.5 text-sm">
          <span className="max-w-[130px] truncate font-medium text-navy-900">{t.fromBranchName}</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gold-600" />
          <span className="max-w-[130px] truncate font-medium text-navy-900">{t.toBranchName}</span>
        </span>
      ),
    },
    { header: "Items", className: "text-center", render: (t) => <span className="font-semibold">{formatNumber(t.itemCount)}</span> },
    { header: "Status", render: (t) => <StatusBadge label={TRANSFER_STATUS_LABELS[t.status]} tone={transferStatusTone(t.status)} /> },
    { header: "Created", render: (t) => <span className="text-xs text-muted-foreground">{formatDateTime(t.createdAt)}</span> },
    {
      header: "Note",
      render: (t) => <span className="block max-w-[180px] truncate text-xs text-muted-foreground" title={t.note ?? undefined}>{t.note ?? "—"}</span>,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Stock Transfers"
        description="Move stock between branches — request, approval, dispatch and receiving."
        actions={
          canManage && (
            <Button asChild className="gap-2 bg-navy-800 text-cream-100 hover:bg-navy-700">
              <Link to="/transfers/new">
                <PlusCircle className="h-4 w-4 text-gold-400" />
                New Transfer
              </Link>
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard icon={Clock3} label="Pending Approval" value={formatNumber(summary.data?.pendingApproval ?? 0)} hint="Awaiting an approver" tone="gold" />
        <StatCard icon={CheckCheck} label="Approved" value={formatNumber(summary.data?.approved ?? 0)} hint="Ready to dispatch" tone="navy" />
        <StatCard icon={Truck} label="In Transit" value={formatNumber(summary.data?.inTransit ?? 0)} hint="On the road" tone="emerald" />
        <StatCard icon={PackageCheck} label="Received This Month" value={formatNumber(summary.data?.receivedThisMonth ?? 0)} hint="Completed at destination" tone="red" />
      </div>

      <div className="mt-6">
        <FilterBar onReset={reset}>
          <FilterField label="Direction">
            <Select value={direction} onValueChange={(v) => { setDirection(v); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All</SelectItem>
                <SelectItem value="SENT">Sent by this branch</SelectItem>
                <SelectItem value="RECEIVED">Received by this branch</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Status">
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {TRANSFER_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{TRANSFER_STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="From">
            <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
          </FilterField>
          <FilterField label="To">
            <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
          </FilterField>
          <FilterField label="Search" className="sm:min-w-[180px]">
            <Input placeholder="TRF-000001…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </FilterField>
        </FilterBar>

        <DataTable
          columns={columns}
          data={rows}
          loading={list.isLoading}
          keyFn={(t) => t.id}
          emptyTitle="No transfers found"
          emptyDescription="Transfers between your branches will appear here once created."
          pagination={{
            page,
            pageSize,
            total: list.data?.total ?? 0,
            onPage: setPage,
          }}
        />
      </div>

      {rows.length === 0 && !list.isLoading && (
        <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <ArrowRightLeft className="h-3.5 w-3.5" />
          Tip: transfers deduct stock from the sending branch only when dispatched, and credit the destination when received.
        </p>
      )}
    </div>
  );
}

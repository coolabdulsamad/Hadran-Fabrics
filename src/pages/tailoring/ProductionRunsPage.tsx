import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { PlusCircle, Factory, Loader2, PlayCircle, CheckCircle2, Package } from "lucide-react";
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
import { PRODUCTION_STATUSES, type ProductionStatus } from "@contracts/constants";
import { PRODUCTION_STATUS_LABELS } from "@contracts/labels";
import { productionStatusTone } from "@/lib/tailoring";
import { formatDateTime } from "@/lib/format";

/**
 * HADRAN FABRICS MALL — production runs list
 * In-house production: runs that consume shop materials into new sellable
 * products. Filter by status/date, deep-link from the tailoring dashboard.
 */

interface RunRow {
  id: number;
  refNo: string;
  status: ProductionStatus;
  outputProductId: number;
  outputProductName: string | null;
  outputQty: string;
  materialCount?: number;
  requestedByName: string | null;
  startedAt: string | Date | null;
  completedAt: string | Date | null;
  createdAt: string | Date;
}

const EMPTY_FILTERS = { status: "", dateFrom: "", dateTo: "", search: "" };

export default function ProductionRunsPage() {
  const { hasPermission } = useAuth();
  const [searchParams] = useSearchParams();
  const initialStatus = searchParams.get("status") ?? "";

  const [filters, setFilters] = useState({ ...EMPTY_FILTERS, status: initialStatus });
  const [page, setPage] = useState(1);

  const summary = trpc.production.summary.useQuery(undefined, { retry: 1 });

  const queryInput = useMemo(
    () => ({
      status: (filters.status || undefined) as ProductionStatus | undefined,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
      search: filters.search || undefined,
      page,
      pageSize: 25,
    }),
    [filters, page],
  );

  const list = trpc.production.list.useQuery(queryInput, { retry: 1 });

  const setFilter = (key: keyof typeof EMPTY_FILTERS, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  const board = summary.data?.board ?? {};

  const columns: Column<RunRow>[] = [
    { header: "Ref", render: (r) => <Link to={`/tailoring/production/${r.id}`} className="font-mono text-xs font-semibold text-navy-800 underline-offset-2 hover:text-gold-700 hover:underline">{r.refNo}</Link> },
    {
      header: "Output Product",
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-navy-900">{r.outputProductName ?? `#${r.outputProductId}`}</p>
          <p className="text-[11px] text-muted-foreground">{Number(r.outputQty)} unit(s) planned</p>
        </div>
      ),
    },
    { header: "Materials", className: "text-center", render: (r) => <span className="text-xs">{r.materialCount ?? "—"}</span> },
    { header: "Status", render: (r) => <StatusBadge label={PRODUCTION_STATUS_LABELS[r.status]} tone={productionStatusTone(r.status)} /> },
    { header: "Created", render: (r) => <span className="whitespace-nowrap text-xs">{formatDateTime(r.createdAt)}</span> },
    { header: "Started", render: (r) => <span className="whitespace-nowrap text-xs">{r.startedAt ? formatDateTime(r.startedAt) : "—"}</span> },
    { header: "Completed", render: (r) => <span className="whitespace-nowrap text-xs">{r.completedAt ? formatDateTime(r.completedAt) : "—"}</span> },
    { header: "By", render: (r) => <span className="text-xs">{r.requestedByName ?? "—"}</span> },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="In-House Production"
        description="Turn shop stock into sellable products — draft a run, start it (materials leave stock), complete it (output enters stock)."
        actions={
          hasPermission("production.manage") ? (
            <Link to="/tailoring/production/new">
              <Button className="gap-2 bg-navy-800 text-cream-100 hover:bg-navy-700">
                <PlusCircle className="h-4 w-4 text-gold-400" />
                New Run
              </Button>
            </Link>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard icon={Factory} label="Draft" value={String(board.DRAFT ?? 0)} tone="navy" hint="Not started yet" />
        <StatCard icon={Loader2} label="In Progress" value={String(board.IN_PROGRESS ?? 0)} tone="gold" hint="Materials consumed" />
        <StatCard icon={PlayCircle} label="Completed (Month)" value={String(summary.data?.completedThisMonth ?? 0)} tone="emerald" hint="Runs finished this month" />
        <StatCard icon={Package} label="Units Produced (Month)" value={String(summary.data?.unitsThisMonth ?? 0)} tone="emerald" hint="Output booked into stock" />
      </div>

      <div className="mt-6">
        <FilterBar onReset={() => { setFilters(EMPTY_FILTERS); setPage(1); }}>
          <FilterField label="Status">
            <Select value={filters.status || "ALL"} onValueChange={(v) => setFilter("status", v === "ALL" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                {PRODUCTION_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{PRODUCTION_STATUS_LABELS[s]}</SelectItem>
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
            <Input placeholder="Ref no or output product…" value={filters.search} onChange={(e) => setFilter("search", e.target.value)} />
          </FilterField>
        </FilterBar>
      </div>

      <div className="mt-6">
        <DataTable
          columns={columns}
          data={list.data?.rows as RunRow[] | undefined}
          loading={list.isLoading}
          keyFn={(r) => r.id}
          emptyTitle="No production runs found"
          emptyDescription="Draft a run to start converting shop stock into sellable products."
          pagination={{ page, pageSize: 25, total: list.data?.total ?? 0, onPage: setPage }}
        />
      </div>

      {hasPermission("production.manage") && (board.DRAFT ?? 0) > 0 && (
        <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-gold-600" />
          Tip: open a draft run and press Start — the materials are deducted from stock immediately.
        </p>
      )}
    </div>
  );
}

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  TrendingUp,
  TrendingDown,
  Scale,
  PlusCircle,
  Printer,
  Loader2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import {
  MONEY_DIRECTIONS,
  MONEY_SOURCE_TYPES,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  SECTION_LABELS,
  SECTIONS,
  STORE,
} from "@contracts/constants";
import { MONEY_SOURCE_LABELS } from "@contracts/labels";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * HADRAN FABRICS MALL — money ledger page
 * Every naira in or out across all sections: sales, expenses, purchases,
 * returns, laundry & tailoring payments and manual entries — with KPIs,
 * a 30-day flow chart, filters, and CSV/Excel/print export.
 */

interface MoneyRow {
  id: number;
  refNo: string;
  direction: "IN" | "OUT";
  section: keyof typeof SECTION_LABELS;
  sourceType: keyof typeof MONEY_SOURCE_LABELS;
  sourceRef: string | null;
  amount: string;
  paymentMethod: keyof typeof PAYMENT_METHOD_LABELS;
  note: string | null;
  createdByName: string | null;
  createdAt: string | Date;
}

const EMPTY_FILTERS = { direction: "", sourceType: "", section: "", method: "", dateFrom: "", dateTo: "", search: "" };

export default function MoneyPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("money.manage");

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({ direction: "IN" as "IN" | "OUT", section: "SALES" as (typeof SECTIONS)[number], amount: "", paymentMethod: "CASH" as (typeof PAYMENT_METHODS)[number], note: "" });
  const [printRows, setPrintRows] = useState<MoneyRow[] | null>(null);
  const [printBusy, setPrintBusy] = useState(false);

  const queryInput = useMemo(
    () => ({
      direction: (filters.direction || undefined) as "IN" | "OUT" | undefined,
      sourceType: (filters.sourceType || undefined) as (typeof MONEY_SOURCE_TYPES)[number] | undefined,
      section: (filters.section || undefined) as (typeof SECTIONS)[number] | undefined,
      method: (filters.method || undefined) as (typeof PAYMENT_METHODS)[number] | undefined,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
      search: filters.search || undefined,
      page,
      pageSize: 25,
    }),
    [filters, page],
  );

  const list = trpc.money.list.useQuery(queryInput, { retry: 1 });
  const summary = trpc.money.summary.useQuery(undefined, { retry: 1 });
  const exportQuery = trpc.money.exportRows.useQuery(
    { direction: queryInput.direction, sourceType: queryInput.sourceType, section: queryInput.section, method: queryInput.method, dateFrom: queryInput.dateFrom, dateTo: queryInput.dateTo, search: queryInput.search },
    { enabled: false, retry: 1 },
  );

  const manualMutation = trpc.money.recordManual.useMutation({
    onSuccess: () => {
      toast.success("Manual entry recorded in the ledger.");
      setManualOpen(false);
      setManual({ direction: "IN", section: "SALES", amount: "", paymentMethod: "CASH", note: "" });
      list.refetch();
      summary.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const setFilter = (key: keyof typeof EMPTY_FILTERS, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  /* ---------- 30-day chart series ---------- */
  const chartData = useMemo(() => {
    const days: { day: string; moneyIn: number; moneyOut: number }[] = [];
    const byDay = new Map<string, { moneyIn: number; moneyOut: number }>();
    for (const row of summary.data?.daily ?? []) {
      const entry = byDay.get(row.day) ?? { moneyIn: 0, moneyOut: 0 };
      if (row.direction === "IN") entry.moneyIn += row.total;
      else entry.moneyOut += row.total;
      byDay.set(row.day, entry);
    }
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const entry = byDay.get(key) ?? { moneyIn: 0, moneyOut: 0 };
      days.push({ day: key.slice(5), moneyIn: Number(entry.moneyIn.toFixed(2)), moneyOut: Number(entry.moneyOut.toFixed(2)) });
    }
    return days;
  }, [summary.data?.daily]);

  const exportColumns: ExportColumn<MoneyRow>[] = [
    { header: "Ref No", value: (r) => r.refNo },
    { header: "Date/Time", value: (r) => formatDateTime(r.createdAt) },
    { header: "Direction", value: (r) => r.direction },
    { header: "Section", value: (r) => SECTION_LABELS[r.section] },
    { header: "Source", value: (r) => MONEY_SOURCE_LABELS[r.sourceType] },
    { header: "Source Ref", value: (r) => r.sourceRef },
    { header: "Note", value: (r) => r.note },
    { header: "Method", value: (r) => PAYMENT_METHOD_LABELS[r.paymentMethod] },
    { header: `Amount (${STORE.currencySymbol})`, value: (r) => (r.direction === "IN" ? Number(r.amount) : -Number(r.amount)) },
    { header: "Recorded By", value: (r) => r.createdByName },
  ];

  const handlePrint = async () => {
    setPrintBusy(true);
    try {
      const rows = (await exportQuery.refetch()).data as MoneyRow[] | undefined;
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

  const columns: Column<MoneyRow>[] = [
    { header: "Ref", render: (r) => <span className="font-mono text-xs font-semibold text-navy-800">{r.refNo}</span> },
    { header: "When", render: (r) => <span className="whitespace-nowrap text-xs">{formatDateTime(r.createdAt)}</span> },
    {
      header: "Flow",
      render: (r) => <StatusBadge label={r.direction === "IN" ? "Money In" : "Money Out"} tone={r.direction === "IN" ? "green" : "red"} />,
    },
    { header: "Section", render: (r) => <StatusBadge label={SECTION_LABELS[r.section]} tone={r.section === "LAUNDRY" ? "sky" : r.section === "TAILORING" ? "navy" : "gold"} /> },
    {
      header: "Source",
      render: (r) => (
        <div>
          <p className="text-sm font-medium text-navy-900">{MONEY_SOURCE_LABELS[r.sourceType]}</p>
          {r.sourceRef && <p className="font-mono text-[11px] text-muted-foreground">{r.sourceRef}</p>}
        </div>
      ),
    },
    {
      header: "Note",
      render: (r) => <span className="block max-w-[240px] truncate text-xs text-muted-foreground" title={r.note ?? undefined}>{r.note ?? "—"}</span>,
    },
    { header: "Method", render: (r) => PAYMENT_METHOD_LABELS[r.paymentMethod] },
    {
      header: "Amount",
      className: "text-right",
      render: (r) => (
        <span className={cn("font-semibold", r.direction === "IN" ? "text-emerald-700" : "text-red-600")}>
          {r.direction === "IN" ? "+" : "−"}{formatCurrency(r.amount)}
        </span>
      ),
    },
    { header: "By", render: (r) => <span className="text-xs">{r.createdByName ?? "—"}</span> },
  ];

  const sourceRows = useMemo(() => {
    const map = new Map<string, { in: number; out: number; count: number }>();
    for (const s of summary.data?.bySource ?? []) {
      const e = map.get(s.sourceType) ?? { in: 0, out: 0, count: 0 };
      if (s.direction === "IN") e.in += s.total;
      else e.out += s.total;
      e.count += s.count;
      map.set(s.sourceType, e);
    }
    return [...map.entries()].sort((a, b) => b[1].in + b[1].out - (a[1].in + a[1].out));
  }, [summary.data?.bySource]);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Money In / Money Out"
        description="The full cash story of the mall — every sale, expense, purchase, refund and manual entry in one ledger."
        actions={
          <>
            <ExportButton filename="money-ledger" sheetName="Money Ledger" columns={exportColumns} rows={async () => ((await exportQuery.refetch()).data ?? []) as MoneyRow[]} />
            <Button variant="outline" onClick={handlePrint} disabled={printBusy} className="gap-2 border-gold-500/40 text-navy-800 hover:bg-gold-50">
              {printBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4 text-gold-600" />}
              Print
            </Button>
            {canManage && (
              <Button onClick={() => setManualOpen(true)} className="gap-2 bg-navy-800 text-cream-100 hover:bg-navy-700">
                <PlusCircle className="h-4 w-4 text-gold-400" />
                Manual Entry
              </Button>
            )}
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={TrendingUp} label="In Today" value={formatCurrency(summary.data?.today.inTotal ?? 0)} tone="emerald" hint="Money received today" />
        <StatCard icon={TrendingDown} label="Out Today" value={formatCurrency(summary.data?.today.outTotal ?? 0)} tone="red" hint="Money spent today" />
        <StatCard icon={Scale} label="Net Today" value={formatCurrency(summary.data?.today.net ?? 0)} tone="navy" hint="In minus out, today" />
        <StatCard icon={TrendingUp} label="In This Month" value={formatCurrency(summary.data?.month.inTotal ?? 0)} tone="emerald" hint="Month to date" />
        <StatCard icon={TrendingDown} label="Out This Month" value={formatCurrency(summary.data?.month.outTotal ?? 0)} tone="red" hint="Month to date" />
        <StatCard icon={Scale} label="Net Position" value={formatCurrency(summary.data?.allTime.net ?? 0)} tone="gold" hint="All-time in minus out" />
      </div>

      {/* Chart + source breakdown */}
      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="card-lux min-w-0 p-5">
          <h2 className="font-display text-base font-bold text-navy-900">Cash flow — last 30 days</h2>
          <div className="mt-3 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d5" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} interval={4} />
                <YAxis tick={{ fontSize: 10 }} width={70} tickFormatter={(v) => `${STORE.currencySymbol}${Number(v).toLocaleString()}`} />
                <RTooltip formatter={(v) => formatCurrency(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="moneyIn" name="Money In" fill="#059669" radius={[3, 3, 0, 0]} />
                <Bar dataKey="moneyOut" name="Money Out" fill="#DC2626" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card-lux min-w-0 p-5">
          <h2 className="font-display text-base font-bold text-navy-900">By source — this month</h2>
          {sourceRows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No movements this month yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {sourceRows.map(([source, v]) => (
                <li key={source} className="min-w-0 rounded-lg border border-border bg-cream-50 px-3 py-2.5">
                  <p className="truncate text-xs font-semibold text-navy-900">{MONEY_SOURCE_LABELS[source as keyof typeof MONEY_SOURCE_LABELS]}</p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-[11px]">
                    {v.in > 0 && <span className="text-emerald-700">+{formatCurrency(v.in)}</span>}
                    {v.out > 0 && <span className="text-red-600">−{formatCurrency(v.out)}</span>}
                    <span className="text-muted-foreground">{v.count} entr{v.count === 1 ? "y" : "ies"}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="mt-6">
        <FilterBar onReset={() => { setFilters(EMPTY_FILTERS); setPage(1); }}>
          <FilterField label="Direction">
            <Select value={filters.direction || "ALL"} onValueChange={(v) => setFilter("direction", v === "ALL" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">In & Out</SelectItem>
                {MONEY_DIRECTIONS.map((d) => (
                  <SelectItem key={d} value={d}>{d === "IN" ? "Money In" : "Money Out"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Source">
            <Select value={filters.sourceType || "ALL"} onValueChange={(v) => setFilter("sourceType", v === "ALL" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All sources</SelectItem>
                {MONEY_SOURCE_TYPES.map((s) => (
                  <SelectItem key={s} value={s}>{MONEY_SOURCE_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Section">
            <Select value={filters.section || "ALL"} onValueChange={(v) => setFilter("section", v === "ALL" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All sections</SelectItem>
                {SECTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{SECTION_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
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
            <Input placeholder="Ref, source ref or note…" value={filters.search} onChange={(e) => setFilter("search", e.target.value)} />
          </FilterField>
        </FilterBar>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={list.data?.rows as MoneyRow[] | undefined}
        loading={list.isLoading}
        keyFn={(r) => r.id}
        emptyTitle="No money movements found"
        emptyDescription="Sales, expenses and manual entries appear here automatically."
        pagination={{ page, pageSize: 25, total: list.data?.total ?? 0, onPage: setPage }}
      />

      {/* Manual entry dialog */}
      <Dialog open={manualOpen} onOpenChange={(o) => !o && setManualOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-navy-900">Manual Money Entry</DialogTitle>
            <DialogDescription>
              For money that moves outside a sale or expense — owner cash injection, bank deposit, petty cash top-up…
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Direction</p>
              <Select value={manual.direction} onValueChange={(v) => setManual((m) => ({ ...m, direction: v as "IN" | "OUT" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="IN">Money In</SelectItem>
                  <SelectItem value="OUT">Money Out</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Section</p>
              <Select value={manual.section} onValueChange={(v) => setManual((m) => ({ ...m, section: v as (typeof SECTIONS)[number] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SECTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{SECTION_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Amount (₦)</p>
              <Input type="number" min="0" step="0.01" value={manual.amount} onChange={(e) => setManual((m) => ({ ...m, amount: e.target.value }))} placeholder="0.00" />
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Method</p>
              <Select value={manual.paymentMethod} onValueChange={(v) => setManual((m) => ({ ...m, paymentMethod: v as (typeof PAYMENT_METHODS)[number] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Explanation *</p>
              <Textarea rows={2} value={manual.note} onChange={(e) => setManual((m) => ({ ...m, note: e.target.value }))} placeholder="e.g. Owner cash injection for change float" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualOpen(false)} disabled={manualMutation.isPending}>Cancel</Button>
            <Button
              onClick={() => manualMutation.mutate({ direction: manual.direction, section: manual.section, amount: Number(manual.amount), paymentMethod: manual.paymentMethod, note: manual.note.trim() })}
              disabled={manualMutation.isPending || !(Number(manual.amount) > 0) || manual.note.trim().length < 3}
              className="gap-2 bg-navy-800 text-cream-100 hover:bg-navy-700"
            >
              {manualMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Record Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print sheet */}
      {printRows && (
        <PrintPortal>
          <div className="p-6">
            <h1 style={{ fontSize: 18, fontWeight: 700 }}>Hadran Fabrics Mall — Money Ledger</h1>
            <p style={{ fontSize: 11, marginTop: 4 }}>
              Printed {formatDate(new Date())}
              {filters.dateFrom && ` · From ${filters.dateFrom}`}
              {filters.dateTo && ` · To ${filters.dateTo}`}
              {` · ${printRows.length} row(s)`}
            </p>
            <table style={{ width: "100%", marginTop: 12, borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  {["Ref", "When", "Flow", "Source", "Note", "Method", "Amount"].map((h) => (
                    <th key={h} style={{ border: "1px solid #999", padding: "4px 6px", textAlign: "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {printRows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{r.refNo}</td>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{formatDateTime(r.createdAt)}</td>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{r.direction}</td>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{MONEY_SOURCE_LABELS[r.sourceType]}{r.sourceRef ? ` (${r.sourceRef})` : ""}</td>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{r.note ?? ""}</td>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{PAYMENT_METHOD_LABELS[r.paymentMethod]}</td>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{r.direction === "IN" ? "+" : "−"}{formatCurrency(r.amount)}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={6} style={{ border: "1px solid #999", padding: "4px 6px", fontWeight: 700 }}>Net (filtered)</td>
                  <td style={{ border: "1px solid #999", padding: "4px 6px", fontWeight: 700 }}>
                    {formatCurrency(printRows.reduce((s, r) => s + (r.direction === "IN" ? Number(r.amount) : -Number(r.amount)), 0))}
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

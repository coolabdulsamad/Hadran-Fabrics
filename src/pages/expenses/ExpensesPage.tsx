import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  PlusCircle,
  Banknote,
  CalendarClock,
  Receipt,
  Tags,
  Printer,
  Loader2,
  Trash2,
} from "lucide-react";
import { PieChart, Pie, Cell, Tooltip as RTooltip, ResponsiveContainer, Legend } from "recharts";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { DataTable, type Column } from "@/components/common/DataTable";
import { FilterBar, FilterField } from "@/components/common/FilterBar";
import { ExportButton, type ExportColumn } from "@/components/common/ExportButton";
import { StatusBadge } from "@/components/common/StatusBadge";
import { PrintPortal } from "@/components/common/PrintPortal";
import { ExpenseFormDialog } from "@/components/expenses/ExpenseFormDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  EXPENSE_CATEGORIES,
  EXPENSE_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  SECTION_LABELS,
  SECTIONS,
  STORE,
} from "@contracts/constants";
import { EXPENSE_CATEGORY_LABELS } from "@contracts/labels";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";

/**
 * HADRAN FABRICS MALL — expenses page
 * Record and review every business expense, with KPIs, a category
 * breakdown chart, rich filters, voiding and CSV/Excel/print export.
 */

interface ExpenseRow {
  id: number;
  refNo: string;
  section: keyof typeof SECTION_LABELS;
  category: keyof typeof EXPENSE_CATEGORY_LABELS;
  description: string;
  vendor: string | null;
  amount: string;
  paymentMethod: keyof typeof PAYMENT_METHOD_LABELS;
  expenseDate: string;
  status: "ACTIVE" | "VOIDED";
  recordedByName: string | null;
  voidReason: string | null;
  createdAt: string | Date;
}

const PIE_COLORS = ["#141B2D", "#C9A227", "#0E7490", "#7C3AED", "#059669", "#DC2626", "#D97706", "#0284C7", "#9333EA", "#475569", "#B45309", "#BE185D"];

const EMPTY_FILTERS = {
  section: "",
  category: "",
  status: "",
  method: "",
  dateFrom: "",
  dateTo: "",
  search: "",
};

export default function ExpensesPage() {
  const { hasPermission } = useAuth();
  const canRecord = hasPermission("expenses.record");
  const canVoid = hasPermission("expenses.void");

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [recordOpen, setRecordOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState<ExpenseRow | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [printRows, setPrintRows] = useState<ExpenseRow[] | null>(null);
  const [printBusy, setPrintBusy] = useState(false);

  const queryInput = useMemo(
    () => ({
      section: (filters.section || undefined) as (typeof SECTIONS)[number] | undefined,
      category: (filters.category || undefined) as (typeof EXPENSE_CATEGORIES)[number] | undefined,
      status: (filters.status || undefined) as (typeof EXPENSE_STATUSES)[number] | undefined,
      method: (filters.method || undefined) as (typeof PAYMENT_METHODS)[number] | undefined,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
      search: filters.search || undefined,
      page,
      pageSize: 20,
    }),
    [filters, page],
  );

  const list = trpc.expenses.list.useQuery(queryInput, { retry: 1 });
  const summary = trpc.expenses.summary.useQuery(undefined, { retry: 1 });

  const exportQuery = trpc.expenses.exportRows.useQuery(
    { ...queryInput },
    { enabled: false, retry: 1 },
  );

  const voidMutation = trpc.expenses.void.useMutation({
    onSuccess: () => {
      toast.success("Expense voided — the reversal is in the money ledger.");
      setVoidTarget(null);
      setVoidReason("");
      list.refetch();
      summary.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const setFilter = (key: keyof typeof EMPTY_FILTERS, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  const exportColumns: ExportColumn<ExpenseRow>[] = [
    { header: "Ref No", value: (r) => r.refNo },
    { header: "Date", value: (r) => r.expenseDate },
    { header: "Section", value: (r) => SECTION_LABELS[r.section] },
    { header: "Category", value: (r) => EXPENSE_CATEGORY_LABELS[r.category] },
    { header: "Description", value: (r) => r.description },
    { header: "Vendor", value: (r) => r.vendor },
    { header: `Amount (${STORE.currencySymbol})`, value: (r) => Number(r.amount) },
    { header: "Method", value: (r) => PAYMENT_METHOD_LABELS[r.paymentMethod] },
    { header: "Status", value: (r) => r.status },
    { header: "Recorded By", value: (r) => r.recordedByName },
  ];

  const handlePrint = async () => {
    setPrintBusy(true);
    try {
      const rows = (await exportQuery.refetch()).data as ExpenseRow[] | undefined;
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

  const columns: Column<ExpenseRow>[] = [
    { header: "Ref", render: (r) => <span className="font-mono text-xs font-semibold text-navy-800">{r.refNo}</span> },
    { header: "Date", render: (r) => formatDate(r.expenseDate) },
    { header: "Section", render: (r) => <StatusBadge label={SECTION_LABELS[r.section]} tone={r.section === "LAUNDRY" ? "sky" : r.section === "TAILORING" ? "navy" : "gold"} /> },
    { header: "Category", render: (r) => EXPENSE_CATEGORY_LABELS[r.category] },
    {
      header: "Description",
      render: (r) => (
        <div className="max-w-[260px]">
          <p className="truncate font-medium text-navy-900" title={r.description}>{r.description}</p>
          {r.vendor && <p className="truncate text-xs text-muted-foreground">to {r.vendor}</p>}
        </div>
      ),
    },
    { header: "Method", render: (r) => PAYMENT_METHOD_LABELS[r.paymentMethod] },
    {
      header: "Amount",
      className: "text-right",
      render: (r) => <span className="font-semibold text-navy-900">{formatCurrency(r.amount)}</span>,
    },
    { header: "Status", render: (r) => <StatusBadge label={r.status} tone={r.status === "ACTIVE" ? "green" : "red"} /> },
    { header: "Recorded By", render: (r) => <span className="text-xs">{r.recordedByName ?? "—"}</span> },
    ...(canVoid
      ? [
          {
            header: "",
            className: "text-right",
            render: (r: ExpenseRow) =>
              r.status === "ACTIVE" ? (
                <button
                  onClick={() => setVoidTarget(r)}
                  className="rounded-md p-1.5 text-red-500 transition hover:bg-red-50"
                  title="Void this expense"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null,
          } satisfies Column<ExpenseRow>,
        ]
      : []),
  ];

  const pieData = (summary.data?.byCategory ?? []).map((c) => ({
    name: EXPENSE_CATEGORY_LABELS[c.category],
    value: c.total,
  }));

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Expenses"
        description="Every naira the business spends — rent, salaries, supplies and more."
        actions={
          <>
            <ExportButton filename="expenses" sheetName="Expenses" columns={exportColumns} rows={async () => ((await exportQuery.refetch()).data ?? []) as ExpenseRow[]} />
            <Button variant="outline" onClick={handlePrint} disabled={printBusy} className="gap-2 border-gold-500/40 text-navy-800 hover:bg-gold-50">
              {printBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4 text-gold-600" />}
              Print
            </Button>
            {canRecord && (
              <Button onClick={() => setRecordOpen(true)} className="gap-2 bg-navy-800 text-cream-100 hover:bg-navy-700">
                <PlusCircle className="h-4 w-4 text-gold-400" />
                Record Expense
              </Button>
            )}
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard icon={Banknote} label="Spent This Month" value={formatCurrency(summary.data?.monthTotal ?? 0)} hint={`${formatNumber(summary.data?.monthCount ?? 0)} expense(s) this month`} tone="navy" />
        <StatCard icon={CalendarClock} label="Spent Today" value={formatCurrency(summary.data?.todayTotal ?? 0)} hint={`${formatNumber(summary.data?.todayCount ?? 0)} expense(s) today`} tone="gold" />
        <StatCard icon={Receipt} label="Records This Month" value={formatNumber(summary.data?.monthCount ?? 0)} hint="Active expense entries" tone="emerald" />
        <StatCard icon={Tags} label="Top Category" value={summary.data?.topCategory ? EXPENSE_CATEGORY_LABELS[summary.data.topCategory] : "—"} hint="Biggest spend this month" tone="red" />
      </div>

      {/* Category chart + section split */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card-lux p-5">
          <h2 className="font-display text-base font-bold text-navy-900">Where the money goes — this month</h2>
          {pieData.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No expenses recorded this month yet.</p>
          ) : (
            <div className="mt-2 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <RTooltip formatter={(v) => formatCurrency(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div className="card-lux p-5">
          <h2 className="font-display text-base font-bold text-navy-900">By section — this month</h2>
          {(summary.data?.bySection ?? []).length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No section spending yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {(summary.data?.bySection ?? []).map((s) => (
                <li key={s.section} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-cream-50 px-4 py-3">
                  <span className="flex items-center gap-2 text-sm font-medium text-navy-900">
                    <StatusBadge label={SECTION_LABELS[s.section]} tone={s.section === "LAUNDRY" ? "sky" : s.section === "TAILORING" ? "navy" : "gold"} />
                    <span className="text-xs text-muted-foreground">{formatNumber(s.count)} expense(s)</span>
                  </span>
                  <span className="shrink-0 font-semibold text-navy-900">{formatCurrency(s.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="mt-6">
        <FilterBar onReset={() => { setFilters(EMPTY_FILTERS); setPage(1); }}>
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
          <FilterField label="Category">
            <Select value={filters.category || "ALL"} onValueChange={(v) => setFilter("category", v === "ALL" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All categories</SelectItem>
                {EXPENSE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Status">
            <Select value={filters.status || "ALL"} onValueChange={(v) => setFilter("status", v === "ALL" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                {EXPENSE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
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
            <Input placeholder="Ref, description or vendor…" value={filters.search} onChange={(e) => setFilter("search", e.target.value)} />
          </FilterField>
        </FilterBar>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={list.data?.rows as ExpenseRow[] | undefined}
        loading={list.isLoading}
        keyFn={(r) => r.id}
        emptyTitle="No expenses found"
        emptyDescription="Adjust the filters, or record your first expense."
        pagination={{ page, pageSize: 20, total: list.data?.total ?? 0, onPage: setPage }}
      />

      {/* Record dialog */}
      <ExpenseFormDialog open={recordOpen} onClose={() => setRecordOpen(false)} onSaved={() => { list.refetch(); summary.refetch(); }} />

      {/* Void dialog */}
      <Dialog open={!!voidTarget} onOpenChange={(o) => { if (!o) { setVoidTarget(null); setVoidReason(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-navy-900">Void expense {voidTarget?.refNo}?</DialogTitle>
            <DialogDescription>
              {voidTarget && <>This voids <strong>{formatCurrency(voidTarget.amount)}</strong> — “{voidTarget?.description}”. A compensating money-in entry goes into the ledger.</>}
            </DialogDescription>
          </DialogHeader>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Reason *</p>
            <Input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Why is this expense wrong?" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidTarget(null)} disabled={voidMutation.isPending}>Cancel</Button>
            <Button
              onClick={() => voidTarget && voidMutation.mutate({ expenseId: voidTarget.id, reason: voidReason.trim() })}
              disabled={voidMutation.isPending || voidReason.trim().length < 3}
              className="gap-2 bg-red-600 text-white hover:bg-red-700"
            >
              {voidMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Void Expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print sheet */}
      {printRows && (
        <PrintPortal>
          <div className="p-6">
            <h1 style={{ fontSize: 18, fontWeight: 700 }}>Hadran Fabrics Mall — Expenses Report</h1>
            <p style={{ fontSize: 11, marginTop: 4 }}>
              Printed {formatDate(new Date())}
              {filters.dateFrom && ` · From ${filters.dateFrom}`}
              {filters.dateTo && ` · To ${filters.dateTo}`}
              {filters.category && ` · ${EXPENSE_CATEGORY_LABELS[filters.category as keyof typeof EXPENSE_CATEGORY_LABELS]}`}
              {` · ${printRows.length} row(s)`}
            </p>
            <table style={{ width: "100%", marginTop: 12, borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  {["Ref", "Date", "Section", "Category", "Description", "Method", "Amount", "Status"].map((h) => (
                    <th key={h} style={{ border: "1px solid #999", padding: "4px 6px", textAlign: "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {printRows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{r.refNo}</td>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{r.expenseDate}</td>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{SECTION_LABELS[r.section]}</td>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{EXPENSE_CATEGORY_LABELS[r.category]}</td>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{r.description}</td>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{PAYMENT_METHOD_LABELS[r.paymentMethod]}</td>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{formatCurrency(r.amount)}</td>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{r.status}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={6} style={{ border: "1px solid #999", padding: "4px 6px", fontWeight: 700 }}>Total (active)</td>
                  <td style={{ border: "1px solid #999", padding: "4px 6px", fontWeight: 700 }}>
                    {formatCurrency(printRows.filter((r) => r.status === "ACTIVE").reduce((s, r) => s + Number(r.amount), 0))}
                  </td>
                  <td style={{ border: "1px solid #999", padding: "4px 6px" }} />
                </tr>
              </tbody>
            </table>
          </div>
        </PrintPortal>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BarChart3, FileBarChart, FileSpreadsheet, FileText, Loader2, Printer, Scissors, ShoppingBag, WashingMachine } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { usePermissions } from "@/hooks/use-permissions";
import { useBranch } from "@/hooks/use-branch";
import { useDebounce } from "@/hooks/use-debounce";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { STORE, SECTION_LABELS, type Section } from "@contracts/constants";
import type { ReportCatalogItem, ReportFilterSpec, ReportResult } from "@contracts/reporting";
import { RangePicker, useReportRange } from "@/pages/reports/report-shared";
import { ReportResultView } from "./ResultView";
import { downloadCsv, downloadExcel, printResult } from "@/lib/report-export";

/**
 * HADRAN FABRICS MALL — Report/Analysis Studio shell (Phase 8).
 * One engine drives both pages: pick a section → pick a type → the filter
 * bar adapts to that type → KPIs, charts and tables render below, ready for
 * CSV / Excel / print export.
 */

const SECTION_ICONS: Record<Section, typeof ShoppingBag> = {
  SALES: ShoppingBag,
  LAUNDRY: WashingMachine,
  TAILORING: Scissors,
};

const SECTION_ORDER: Section[] = ["SALES", "LAUNDRY", "TAILORING"];

interface StudioProps {
  mode: "reports" | "analyses";
  pageTitle: string;
  pageDescription: string;
}

export function Studio({ mode, pageTitle, pageDescription }: StudioProps) {
  const { can } = usePermissions();
  const { serverBranch, options: branchOptions } = useBranch();
  const canExport = can("reports.export");

  /* ------------------------------- catalog ------------------------------ */
  const reportsCatalog = trpc.reports.catalog.useQuery(undefined, { enabled: mode === "reports", staleTime: 300_000 });
  const analysesCatalog = trpc.analytics.catalog.useQuery(undefined, { enabled: mode === "analyses", staleTime: 300_000 });
  const catalogItems: ReportCatalogItem[] = useMemo(
    () => (mode === "reports" ? reportsCatalog.data?.reports : analysesCatalog.data?.analyses) ?? [],
    [mode, reportsCatalog.data, analysesCatalog.data],
  );

  const sections = useMemo(
    () => SECTION_ORDER.filter((s) => catalogItems.some((i) => i.section === s)),
    [catalogItems],
  );

  const [section, setSection] = useState<Section | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const rangeCtl = useReportRange();
  const { range } = rangeCtl;

  // Default to the first available section/type once the catalog lands.
  useEffect(() => {
    if (section || sections.length === 0) return;
    const first = sections[0];
    setSection(first);
    const firstItem = catalogItems.find((i) => i.section === first);
    if (firstItem) setType(firstItem.type);
  }, [section, sections, catalogItems]);

  const items = useMemo(() => catalogItems.filter((i) => i.section === section), [catalogItems, section]);
  const def = useMemo(() => items.find((i) => i.type === type) ?? null, [items, type]);

  // Reset filters to the type's defaults whenever the type changes.
  useEffect(() => {
    if (!def) return;
    const defaults: Record<string, string> = {};
    for (const f of def.filters) defaults[f.key] = f.defaultValue ?? (f.kind === "select" || f.kind === "branch" || f.kind === "category" ? "ALL" : "");
    setFilters(defaults);
  }, [def?.type, def?.section]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickSection = (s: Section) => {
    setSection(s);
    const first = catalogItems.find((i) => i.section === s);
    setType(first?.type ?? null);
  };

  /* --------------------------- filter data feeds ------------------------ */
  const needsCategory = def?.filters.some((f) => f.kind === "category") ?? false;
  const categoriesQuery = trpc.categories.list.useQuery(undefined, {
    enabled: needsCategory && can("products.view"),
    staleTime: 300_000,
    retry: 1,
  });

  const branchSelectable = !serverBranch || serverBranch.isMain;
  const isMultiBranch = branchSelectable && branchOptions.length > 1;

  const visibleFilters = useMemo(
    () =>
      (def?.filters ?? []).filter((f) => {
        if (f.kind === "branch") return isMultiBranch;
        if (f.kind === "category") return can("products.view");
        return true;
      }),
    [def, isMultiBranch, can],
  );

  /* ------------------------------- the run ------------------------------ */
  const cleanFilters = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(filters)) if (v && v !== "ALL") out[k] = v;
    return out;
  }, [filters]);
  const debouncedFilters = useDebounce(cleanFilters, 350);

  const runInput = useMemo(
    () => ({
      section: (section ?? "SALES") as Section,
      type: type ?? "",
      dateFrom: def?.hasRange ? range.dateFrom : undefined,
      dateTo: def?.hasRange ? range.dateTo : undefined,
      filters: debouncedFilters,
    }),
    [section, type, def?.hasRange, range.dateFrom, range.dateTo, debouncedFilters],
  );

  const enabled = !!def && !!section && !!type;
  const reportsRun = trpc.reports.run.useQuery(runInput, { enabled: enabled && mode === "reports", retry: 1 });
  const analysesRun = trpc.analytics.run.useQuery(runInput, { enabled: enabled && mode === "analyses", retry: 1 });
  const run = mode === "reports" ? reportsRun : analysesRun;
  const result = run.data as ReportResult | undefined;

  useEffect(() => {
    if (run.error) {
      toast.error(mode === "reports" ? "Report failed." : "Analysis failed.", { description: run.error.message });
    }
  }, [run.error, mode]);

  /* ------------------------------- exports ------------------------------ */
  const doExport = (kind: "csv" | "excel" | "print") => {
    if (!result) return;
    try {
      if (kind === "csv") {
        downloadCsv(result);
        toast.success("CSV downloaded.");
      } else if (kind === "excel") {
        downloadExcel(result);
        toast.success("Excel workbook downloaded.");
      } else {
        printResult(result);
      }
    } catch (err) {
      toast.error("Export failed.", { description: err instanceof Error ? err.message : undefined });
    }
  };

  /* -------------------------------- render ------------------------------ */
  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader
        title={pageTitle}
        description={pageDescription}
        actions={
          <>
            {canExport && (
              <>
                <Button size="sm" variant="outline" disabled={!result} onClick={() => doExport("csv")}>
                  <FileText className="mr-1.5 h-3.5 w-3.5" /> CSV
                </Button>
                <Button size="sm" variant="outline" disabled={!result} onClick={() => doExport("excel")}>
                  <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" /> Excel
                </Button>
              </>
            )}
            <Button size="sm" variant="outline" disabled={!result} onClick={() => doExport("print")}>
              <Printer className="mr-1.5 h-3.5 w-3.5" /> Print
            </Button>
          </>
        }
      />

      {/* Section tabs */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Business section">
        {sections.map((s) => {
          const Icon = SECTION_ICONS[s];
          const active = s === section;
          return (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => pickSection(s)}
              className={cn(
                "flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-gold-500 bg-gold-500/15 text-gold-700"
                  : "border-border bg-card text-muted-foreground hover:border-gold-500/50 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {SECTION_LABELS[s]}
              <span className={cn("rounded-full px-1.5 text-[10px] font-bold", active ? "bg-gold-500/25" : "bg-muted")}>
                {catalogItems.filter((i) => i.section === s).length}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[270px_minmax(0,1fr)]">
        {/* Type picker — rail on desktop, select on mobile */}
        <aside className="card-lux hidden self-start p-2 lg:block">
          <p className="px-3 pb-2 pt-2 text-[11px] font-bold uppercase tracking-wider text-navy-700">
            {mode === "reports" ? "Report types" : "Analysis types"}
          </p>
          <ul className="max-h-[70vh] space-y-0.5 overflow-y-auto">
            {items.map((item) => (
              <li key={item.type}>
                <button
                  type="button"
                  onClick={() => setType(item.type)}
                  title={item.description}
                  className={cn(
                    "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    item.type === type ? "bg-navy-900 font-semibold text-gold-300" : "text-foreground hover:bg-navy-900/5",
                  )}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="min-w-0 space-y-4">
          {/* Mobile type picker */}
          <div className="lg:hidden">
            <Select value={type ?? ""} onValueChange={(v) => setType(v)}>
              <SelectTrigger className="input-lux" aria-label={mode === "reports" ? "Report type" : "Analysis type"}>
                <SelectValue placeholder="Choose a type" />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.type} value={item.type}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Current type intro + filters */}
          {def && (
            <div className="card-lux space-y-3 p-4" data-no-print>
              <div className="flex items-start gap-2.5">
                {mode === "reports" ? (
                  <FileBarChart className="mt-0.5 h-5 w-5 shrink-0 text-gold-600" />
                ) : (
                  <BarChart3 className="mt-0.5 h-5 w-5 shrink-0 text-gold-600" />
                )}
                <div>
                  <h2 className="font-display text-lg font-semibold text-navy-900">{def.label}</h2>
                  <p className="text-xs text-muted-foreground">{def.description}</p>
                </div>
              </div>

              {def.hasRange && <RangePicker {...rangeCtl} />}

              {visibleFilters.length > 0 && (
                <div className="flex flex-wrap items-end gap-3">
                  {visibleFilters.map((f) => (
                    <FilterField
                      key={f.key}
                      spec={f}
                      value={filters[f.key] ?? ""}
                      onChange={(v) => setFilters((prev) => ({ ...prev, [f.key]: v }))}
                      branches={branchOptions}
                      categories={categoriesQuery.data ?? []}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Result */}
          <div id="studio-print-root">
            {/* Print-only header */}
            <div className="print-only mb-4 border-b-2 border-double pb-3" style={{ borderColor: "#C9A227" }}>
              <h1 className="font-display text-xl font-bold">{STORE.name}</h1>
              <p className="text-sm font-semibold">{def?.label}</p>
              <p className="text-xs text-gray-600">
                {def?.description} · Generated {result ? new Date(result.generatedAt).toLocaleString() : ""}
                {def?.hasRange ? ` · ${rangeCtl.preset === "CUSTOM" ? `${rangeCtl.customFrom || "…"} → ${rangeCtl.customTo || "…"}` : `Range: ${rangeCtl.preset}`}` : ""}
              </p>
            </div>

            {run.isLoading && (
              <div className="card-lux flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-gold-600" /> Crunching the numbers…
              </div>
            )}
            {!run.isLoading && result && <ReportResultView result={result} />}
            {!run.isLoading && !result && !run.error && (
              <div className="card-lux py-16 text-center text-sm text-muted-foreground">
                Choose {mode === "reports" ? "a report" : "an analysis"} type to begin.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ filter field ---------------------------- */

function FilterField({
  spec,
  value,
  onChange,
  branches,
  categories,
}: {
  spec: ReportFilterSpec;
  value: string;
  onChange: (v: string) => void;
  branches: { id: number; name: string; isMain: boolean }[];
  categories: { id: number; name: string }[];
}) {
  if (spec.kind === "text" || spec.kind === "number") {
    return (
      <label className="block">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-navy-700">{spec.label}</span>
        <Input
          data-no-scan
          type={spec.kind === "number" ? "number" : "text"}
          value={value}
          placeholder={spec.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="input-lux w-44"
        />
      </label>
    );
  }

  const options =
    spec.kind === "branch"
      ? [{ value: "ALL", label: "All branches" }, ...branches.map((b) => ({ value: String(b.id), label: b.name }))]
      : spec.kind === "category"
        ? [{ value: "ALL", label: "All categories" }, ...categories.map((c) => ({ value: String(c.id), label: c.name }))]
        : (spec.options ?? []);

  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-navy-700">{spec.label}</span>
      <Select value={value || "ALL"} onValueChange={onChange}>
        <SelectTrigger className="input-lux w-48" aria-label={spec.label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

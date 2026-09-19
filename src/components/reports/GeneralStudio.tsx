import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BarChart3, FileBarChart, FileSpreadsheet, FileText, Globe2, Loader2, Printer } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { usePermissions } from "@/hooks/use-permissions";
import { useBranch } from "@/hooks/use-branch";
import { useDebounce } from "@/hooks/use-debounce";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { STORE } from "@contracts/constants";
import type { ReportCatalogItem, ReportResult } from "@contracts/reporting";
import { RangePicker, useReportRange } from "@/pages/reports/report-shared";
import { ReportResultView } from "./ResultView";
import { FilterField } from "./Studio";
import { downloadCsv, downloadExcel, printResult } from "@/lib/report-export";

/**
 * HADRAN FABRICS MALL — General Studio (Phase 9).
 * Cross-section / cross-branch reporting: one page hosting general report
 * types AND general analysis types that merge records from Sales, Laundry
 * and Tailoring (and every branch) into unified results. Access requires
 * the reports.general permission; non-main-branch users stay branch-pinned
 * on the server.
 */

type Mode = "reports" | "analyses";

export function GeneralStudio() {
  const { can } = usePermissions();
  const { serverBranch, options: branchOptions } = useBranch();
  const canExport = can("reports.export");

  const [mode, setMode] = useState<Mode>("reports");
  const [type, setType] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const rangeCtl = useReportRange();
  const { range } = rangeCtl;

  /* ------------------------------- catalog ------------------------------ */
  const catalog = trpc.general.catalog.useQuery(undefined, { staleTime: 300_000 });
  const items: ReportCatalogItem[] = useMemo(
    () => (mode === "reports" ? catalog.data?.reports : catalog.data?.analyses) ?? [],
    [mode, catalog.data],
  );

  const def = useMemo(() => items.find((i) => i.type === type) ?? null, [items, type]);

  // Default to the first type of the mode once the catalog lands.
  useEffect(() => {
    if (items.length === 0) return;
    if (!def) setType(items[0].type);
  }, [items, def]);

  // Reset filters to the type's defaults whenever the type changes.
  useEffect(() => {
    if (!def) return;
    const defaults: Record<string, string> = {};
    for (const f of def.filters) defaults[f.key] = f.defaultValue ?? (f.kind === "select" || f.kind === "branch" ? "ALL" : "");
    setFilters(defaults);
  }, [def?.type]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickMode = (m: Mode) => {
    setMode(m);
    setType(null); // re-defaults via the effect above
  };

  /* ------------------------------- filters ------------------------------ */
  const branchSelectable = !serverBranch || serverBranch.isMain;
  const isMultiBranch = branchSelectable && branchOptions.length > 1;
  const visibleFilters = useMemo(
    () => (def?.filters ?? []).filter((f) => (f.kind === "branch" ? isMultiBranch : true)),
    [def, isMultiBranch],
  );

  const cleanFilters = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(filters)) if (v && v !== "ALL") out[k] = v;
    return out;
  }, [filters]);
  const debouncedFilters = useDebounce(cleanFilters, 350);

  /* -------------------------------- the run ----------------------------- */
  const runInput = useMemo(
    () => ({
      kind: (mode === "reports" ? "report" : "analysis") as "report" | "analysis",
      type: type ?? "",
      dateFrom: def?.hasRange ? range.dateFrom : undefined,
      dateTo: def?.hasRange ? range.dateTo : undefined,
      filters: debouncedFilters,
    }),
    [mode, type, def?.hasRange, range.dateFrom, range.dateTo, debouncedFilters],
  );

  const run = trpc.general.run.useQuery(runInput, { enabled: !!def, retry: 1 });
  const result = run.data as ReportResult | undefined;

  useEffect(() => {
    if (run.error) toast.error("General report failed.", { description: run.error.message });
  }, [run.error]);

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
        title="General Reports & Analysis"
        description="The whole business in one view — records merged across Sales, Laundry, Tailoring and every branch. Export to CSV, Excel or print."
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

      {/* Mode toggle */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Studio mode">
        {(
          [
            ["reports", "Reports", FileBarChart],
            ["analyses", "Analyses", BarChart3],
          ] as [Mode, string, typeof FileBarChart][]
        ).map(([m, label, Icon]) => {
          const active = m === mode;
          const count = m === "reports" ? catalog.data?.reports.length ?? 0 : catalog.data?.analyses.length ?? 0;
          return (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => pickMode(m)}
              className={cn(
                "flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-gold-500 bg-gold-500/15 text-gold-700"
                  : "border-border bg-card text-muted-foreground hover:border-gold-500/50 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
              <span className={cn("rounded-full px-1.5 text-[10px] font-bold", active ? "bg-gold-500/25" : "bg-muted")}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[270px_minmax(0,1fr)]">
        {/* Type picker — rail on desktop, select on mobile */}
        <aside className="card-lux hidden self-start p-2 lg:block">
          <p className="px-3 pb-2 pt-2 text-[11px] font-bold uppercase tracking-wider text-navy-700">
            {mode === "reports" ? "General report types" : "General analysis types"}
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
                <Globe2 className="mt-0.5 h-5 w-5 shrink-0 text-gold-600" />
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
                      categories={[]}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Result */}
          <div id="studio-print-root">
            <div className="print-only mb-4 border-b-2 border-double pb-3" style={{ borderColor: "#C9A227" }}>
              <h1 className="font-display text-xl font-bold">{STORE.name}</h1>
              <p className="text-sm font-semibold">{def?.label} — General (all sections)</p>
              <p className="text-xs text-gray-600">
                {def?.description} · Generated {result ? new Date(result.generatedAt).toLocaleString() : ""}
                {def?.hasRange ? ` · ${rangeCtl.preset === "CUSTOM" ? `${rangeCtl.customFrom || "…"} → ${rangeCtl.customTo || "…"}` : `Range: ${rangeCtl.preset}`}` : ""}
              </p>
            </div>

            {run.isLoading && (
              <div className="card-lux flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-gold-600" /> Merging records across all sections…
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

import * as XLSX from "xlsx";
import { toast } from "sonner";
import type { ReportResult, ReportTableColumn } from "@contracts/reporting";
import { STORE } from "@contracts/constants";

/**
 * HADRAN FABRICS MALL — client-side report exporting (Phase 8).
 * The run result already holds every number, so CSV/Excel are built locally:
 * no extra server round-trip, works for all 50+ report & analysis types.
 */

const escCsv = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function baseName(result: ReportResult): string {
  return `hadran-${result.section.toLowerCase()}-${result.type}-${new Date().toISOString().slice(0, 10)}`;
}

/* --------------------------------- CSV --------------------------------- */

export function downloadCsv(result: ReportResult) {
  const lines: string[] = [
    escCsv(STORE.name),
    escCsv(`${result.title}${result.subtitle ? ` — ${result.subtitle}` : ""}`),
    escCsv(`Generated ${new Date(result.generatedAt).toLocaleString()}`),
    "",
    "KEY FIGURES",
    ["Metric", "Value", "Note"].map(escCsv).join(","),
    ...result.kpis.map((k) => [k.label, k.value, k.hint ?? ""].map(escCsv).join(",")),
  ];

  for (const table of result.tables) {
    lines.push("", table.title.toUpperCase());
    lines.push(table.columns.map((c) => escCsv(c.label)).join(","));
    for (const row of table.rows) {
      lines.push(table.columns.map((c) => escCsv(row[c.key] ?? "")).join(","));
    }
  }

  download(`${baseName(result)}.csv`, new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }));
}

/* -------------------------------- Excel -------------------------------- */

/** Raw value for Excel cells — numbers stay numeric so sheets can compute. */
function cellValue(v: unknown, format: ReportTableColumn["format"]): string | number {
  if (v == null) return "";
  if ((format === "currency" || format === "number" || format === "qty" || format === "percent") && typeof v === "number") return v;
  return String(v);
}

export function downloadExcel(result: ReportResult) {
  const wb = XLSX.utils.book_new();

  const summaryRows: (string | number)[][] = [
    [STORE.name],
    [`${result.title}${result.subtitle ? ` — ${result.subtitle}` : ""}`],
    [`Generated ${new Date(result.generatedAt).toLocaleString()}`],
    [],
    ["Metric", "Value", "Note"],
    ...result.kpis.map((k) => [k.label, k.value, k.hint ?? ""]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "Summary");

  const usedNames = new Set<string>(["Summary"]);
  for (const table of result.tables) {
    let name = table.title.replace(/[\\/?*[\]:]/g, " ").slice(0, 28).trim() || "Data";
    let i = 2;
    while (usedNames.has(name)) name = `${name.slice(0, 25)} ${i++}`;
    usedNames.add(name);

    const aoa: (string | number)[][] = [
      table.columns.map((c) => c.label),
      ...table.rows.map((row) => table.columns.map((c) => cellValue(row[c.key], c.format))),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  }

  XLSX.writeFile(wb, `${baseName(result)}.xlsx`);
}

/* -------------------------------- print -------------------------------- */

export function printResult(result: ReportResult) {
  if (!result.tables.length && !result.charts.length && !result.kpis.length) {
    toast.error("Nothing to print yet — run a report first.");
    return;
  }
  window.print();
}

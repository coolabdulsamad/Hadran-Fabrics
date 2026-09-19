import { useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

/**
 * HADRAN FABRICS MALL — export button
 * Downloads the CURRENTLY FILTERED dataset as CSV or a real Excel (.xlsx)
 * workbook. Columns map header → value extractor, so labels stay human.
 */

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

interface ExportButtonProps<T> {
  /** Human base name, e.g. "expenses" → expenses-2026-09-19.csv */
  filename: string;
  columns: ExportColumn<T>[];
  /** Rows already loaded, or an async loader (used for full, unpaged exports). */
  rows: T[] | (() => Promise<T[]>);
  sheetName?: string;
  disabled?: boolean;
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ExportButton<T>({ filename, columns, rows, sheetName = "Data", disabled }: ExportButtonProps<T>) {
  const [busy, setBusy] = useState(false);

  const resolveRows = async (): Promise<T[]> => {
    const data = typeof rows === "function" ? await rows() : rows;
    if (!data.length) throw new Error("There is nothing to export with the current filters.");
    return data;
  };

  const toRecords = (data: T[]) =>
    data.map((row) => {
      const rec: Record<string, string | number> = {};
      for (const col of columns) rec[col.header] = col.value(row) ?? "";
      return rec;
    });

  const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = async () => {
    setBusy(true);
    try {
      const data = await resolveRows();
      const csv = Papa.unparse(toRecords(data));
      download(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), `${filename}-${stamp()}.csv`);
      toast.success(`Exported ${data.length} row(s) to CSV.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  };

  const exportExcel = async () => {
    setBusy(true);
    try {
      const data = await resolveRows();
      const sheet = XLSX.utils.json_to_sheet(toRecords(data));
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, sheetName.slice(0, 31));
      XLSX.writeFile(book, `${filename}-${stamp()}.xlsx`);
      toast.success(`Exported ${data.length} row(s) to Excel.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={disabled || busy} className="gap-2 border-gold-500/40 text-navy-800 hover:bg-gold-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 text-gold-600" />}
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 border-gold-500/30">
        <DropdownMenuItem onClick={exportCsv} className="cursor-pointer gap-2">
          <FileText className="h-4 w-4 text-gold-600" />
          CSV file
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportExcel} className="cursor-pointer gap-2">
          <FileSpreadsheet className="h-4 w-4 text-gold-600" />
          Excel (.xlsx)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

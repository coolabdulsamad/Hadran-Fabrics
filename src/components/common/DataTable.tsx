import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "./EmptyState";
import { cn } from "@/lib/utils";

/**
 * HADRAN FABRICS MALL — DataTable
 * Styled table with loading skeletons, branded empty state and pagination.
 */

export interface Column<T> {
  header: string;
  className?: string;
  render: (row: T, index: number) => ReactNode;
}

export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[] | undefined;
  loading?: boolean;
  keyFn: (row: T) => string | number;
  emptyTitle?: string;
  emptyDescription?: string;
  pagination?: PaginationState;
  dense?: boolean;
}

export function DataTable<T>({
  columns,
  data,
  loading,
  keyFn,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  pagination,
  dense,
}: DataTableProps<T>) {
  const totalPages = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize)) : 1;

  return (
    <div className="card-lux overflow-hidden">
      <div className="scrollbar-lux overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-cream-200/60">
              {columns.map((col) => (
                <th
                  key={col.header}
                  className={cn(
                    "whitespace-nowrap px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-navy-700",
                    col.className,
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border/60">
                  {columns.map((col) => (
                    <td key={col.header} className="px-4 py-3.5">
                      <div className="h-4 w-full max-w-[180px] animate-pulse rounded bg-cream-300/70" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data && data.length > 0 ? (
              data.map((row, i) => (
                <tr key={keyFn(row)} className="border-b border-border/60 transition hover:bg-gold-50/40">
                  {columns.map((col) => (
                    <td key={col.header} className={cn("px-4", dense ? "py-2" : "py-3.5", col.className)}>
                      {col.render(row, i)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length}>
                  <EmptyState title={emptyTitle} description={emptyDescription} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.total > 0 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Showing {(pagination.page - 1) * pagination.pageSize + 1}–
            {Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPage(pagination.page - 1)}
              className="h-8 border-gold-500/40 text-navy-800 hover:bg-gold-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs font-medium text-navy-800">
              Page {pagination.page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= totalPages}
              onClick={() => pagination.onPage(pagination.page + 1)}
              className="h-8 border-gold-500/40 text-navy-800 hover:bg-gold-50"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

import type { ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * HADRAN FABRICS MALL — filter bar
 * Consistent labelled filter row for list/ledger pages. Compose with
 * <FilterField label="…"> around any control; Reset clears everything.
 */

export function FilterBar({
  children,
  onReset,
  className,
}: {
  children: ReactNode;
  onReset?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("card-lux mb-5 flex flex-wrap items-end gap-3 p-4", className)}>
      {children}
      {onReset && (
        <Button variant="ghost" size="sm" onClick={onReset} className="gap-1.5 text-muted-foreground hover:text-navy-800">
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </Button>
      )}
    </div>
  );
}

export function FilterField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-[130px] flex-1 sm:flex-none", className)}>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

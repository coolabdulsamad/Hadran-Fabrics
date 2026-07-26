import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Shared range presets + chart shell for the Reports and Analytics pages. */

export type Preset = "TODAY" | "7D" | "30D" | "MONTH" | "ALL" | "CUSTOM";

export const CHART_COLORS = ["#C9A227", "#141B2D", "#8C7220", "#3D4A6B", "#E5C95C", "#6B7A9E", "#A8851B", "#232F4B"];

export function presetRange(preset: Preset): { from?: Date; to?: Date } {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case "TODAY":
      return { from: startOfDay, to: new Date(startOfDay.getTime() + 24 * 3600 * 1000) };
    case "7D":
      return { from: new Date(startOfDay.getTime() - 6 * 24 * 3600 * 1000), to: new Date(startOfDay.getTime() + 24 * 3600 * 1000) };
    case "30D":
      return { from: new Date(startOfDay.getTime() - 29 * 24 * 3600 * 1000), to: new Date(startOfDay.getTime() + 24 * 3600 * 1000) };
    case "MONTH":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
    case "ALL":
      return {};
    case "CUSTOM":
      return {};
  }
}

export const compact = (n: number) =>
  n >= 1_000_000 ? `₦${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `₦${(n / 1_000).toFixed(0)}k` : `₦${n.toFixed(0)}`;

export function ChartCard({ title, subtitle, children, action }: { title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="card-lux p-5">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-base font-semibold text-navy-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Preset state + tRPC-ready ISO range. */
export function useReportRange() {
  const [preset, setPreset] = useState<Preset>("30D");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const range = useMemo(() => {
    if (preset === "CUSTOM") {
      return {
        dateFrom: customFrom ? new Date(`${customFrom}T00:00:00`).toISOString() : undefined,
        dateTo: customTo ? new Date(`${customTo}T23:59:59.999`).toISOString() : undefined,
      };
    }
    const r = presetRange(preset);
    return { dateFrom: r.from?.toISOString(), dateTo: r.to?.toISOString() };
  }, [preset, customFrom, customTo]);

  return { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range };
}

export function RangePicker({
  preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, trailing,
}: ReturnType<typeof useReportRange> & { trailing?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(
        [
          ["TODAY", "Today"],
          ["7D", "7 days"],
          ["30D", "30 days"],
          ["MONTH", "This month"],
          ["ALL", "All time"],
          ["CUSTOM", "Custom"],
        ] as [Preset, string][]
      ).map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => setPreset(key)}
          className={cn(
            "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
            preset === key
              ? "border-gold-500 bg-gold-500/15 text-gold-700"
              : "border-border bg-card text-muted-foreground hover:border-gold-500/50 hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
      {preset === "CUSTOM" && (
        <>
          <Input data-no-scan type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="input-lux w-[150px]" aria-label="From" />
          <span className="text-muted-foreground">→</span>
          <Input data-no-scan type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="input-lux w-[150px]" aria-label="To" />
        </>
      )}
      {trailing && <div className="ml-auto">{trailing}</div>}
    </div>
  );
}

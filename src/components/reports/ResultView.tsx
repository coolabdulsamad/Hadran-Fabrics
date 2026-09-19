import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  ChartValueFormat,
  ReportChart,
  ReportKpi,
  ReportResult,
  ReportTable,
  ReportTableColumn,
} from "@contracts/reporting";
import { formatCurrency, formatDate, formatDateTime, formatNumber, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CHART_COLORS } from "@/pages/reports/report-shared";

/**
 * HADRAN FABRICS MALL — generic result renderer for the Report/Analysis
 * Studios (Phase 8). Turns the normalized run result (KPIs + charts +
 * tables) into the luxury navy/gold presentation.
 */

const TOOLTIP_STYLE = { borderRadius: 12, border: "1px solid #C9A22755", fontSize: 13 } as const;

const compact = (n: number) =>
  Math.abs(n) >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : Math.abs(n) >= 1_000 ? `${(n / 1_000).toFixed(0)}k` : `${Math.round(n)}`;

function fmtValue(v: number, format: ChartValueFormat | undefined): string {
  switch (format) {
    case "currency":
      return formatCurrency(v);
    case "percent":
      return `${v.toFixed(1)}%`;
    case "qty":
      return formatQty(v);
    default:
      return formatNumber(v);
  }
}

/* --------------------------------- KPIs -------------------------------- */

const KPI_TONES: Record<NonNullable<ReportKpi["tone"]>, string> = {
  gold: "text-gold-700",
  navy: "text-navy-900",
  emerald: "text-emerald-700",
  red: "text-red-600",
  plain: "text-navy-900",
};

function KpiGrid({ kpis }: { kpis: ReportKpi[] }) {
  if (kpis.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {kpis.map((k) => (
        <div key={k.label} className="card-lux px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-navy-700">{k.label}</p>
          <p className={cn("mt-1 truncate font-display text-xl font-bold tabular-nums", KPI_TONES[k.tone ?? "plain"])} title={k.value}>
            {k.value}
          </p>
          {k.hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{k.hint}</p>}
        </div>
      ))}
    </div>
  );
}

/* -------------------------------- charts ------------------------------- */

function AxisChart({ chart }: { chart: ReportChart }) {
  const series = chart.series ?? [];
  const yFormat = series.find((s) => s.format === "currency") ? "currency" : series[0]?.format;
  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#e5e1d5" vertical={false} />
      <XAxis dataKey={chart.xKey} tick={{ fontSize: 11 }} stroke="#8a8570" />
      <YAxis tick={{ fontSize: 11 }} stroke="#8a8570" width={64} tickFormatter={(v: number) => (yFormat === "currency" ? `₦${compact(v)}` : compact(v))} />
      <Tooltip
        contentStyle={TOOLTIP_STYLE}
        formatter={(value: number, name: string) => {
          const s = series.find((x) => x.key === name || x.label === name);
          return [fmtValue(value, s?.format), s?.label ?? name];
        }}
      />
      {series.length > 1 && <Legend formatter={(v: string) => <span className="text-xs">{series.find((s) => s.key === v)?.label ?? v}</span>} />}
    </>
  );

  if (chart.kind === "bar") {
    return (
      <BarChart data={chart.data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        {common}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} fill={s.color ?? CHART_COLORS[i % CHART_COLORS.length]} radius={[4, 4, 0, 0]} />
        ))}
      </BarChart>
    );
  }
  if (chart.kind === "line") {
    return (
      <LineChart data={chart.data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        {common}
        {series.map((s, i) => (
          <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color ?? CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2.5} dot={false} />
        ))}
      </LineChart>
    );
  }
  return (
    <AreaChart data={chart.data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
      <defs>
        {series.map((s, i) => {
          const color = s.color ?? CHART_COLORS[i % CHART_COLORS.length];
          return (
            <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.45} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          );
        })}
      </defs>
      {common}
      {series.map((s, i) => (
        <Area
          key={s.key}
          type="monotone"
          dataKey={s.key}
          stroke={s.color ?? CHART_COLORS[i % CHART_COLORS.length]}
          strokeWidth={2.5}
          fill={`url(#grad-${s.key})`}
        />
      ))}
    </AreaChart>
  );
}

function PieChartView({ chart }: { chart: ReportChart }) {
  const data = chart.data;
  return (
    <PieChart>
      <Pie data={data} dataKey={chart.valueKey ?? "value"} nameKey={chart.nameKey ?? "name"} innerRadius={55} outerRadius={95} paddingAngle={3}>
        {data.map((_, i) => (
          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
        ))}
      </Pie>
      <Tooltip formatter={(value: number, name: string) => [fmtValue(value, chart.valueFormat), name]} contentStyle={TOOLTIP_STYLE} />
      <Legend formatter={(v: string) => <span className="text-xs">{v}</span>} />
    </PieChart>
  );
}

function ChartCard({ chart }: { chart: ReportChart }) {
  return (
    <section className="card-lux break-inside-avoid p-5">
      <div className="mb-3">
        <h3 className="font-display text-base font-semibold text-navy-900">{chart.title}</h3>
        {chart.subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{chart.subtitle}</p>}
      </div>
      {chart.data.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No data for this selection.</p>
      ) : (
        <div style={{ height: chart.height ?? 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            {chart.kind === "pie" ? <PieChartView chart={chart} /> : <AxisChart chart={chart} />}
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

/* -------------------------------- tables ------------------------------- */

function formatCell(v: string | number | null | undefined, format: ReportTableColumn["format"]): string {
  if (v == null || v === "") return "—";
  switch (format) {
    case "currency":
      return formatCurrency(v);
    case "number":
      return formatNumber(v);
    case "qty":
      return formatQty(v);
    case "percent":
      return `${Number(v).toFixed(1)}%`;
    case "date":
      return formatDate(String(v));
    case "datetime":
      return String(v) === "—" ? "—" : formatDateTime(String(v));
    default:
      return String(v);
  }
}

function ResultTable({ table }: { table: ReportTable }) {
  return (
    <section className="card-lux break-inside-avoid p-5">
      <h3 className="mb-3 font-display text-base font-semibold text-navy-900">{table.title}</h3>
      {table.rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No rows match the current filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-navy-900/10 text-left">
                {table.columns.map((c) => (
                  <th
                    key={c.key}
                    className={cn(
                      "px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-navy-700",
                      c.align === "right" && "text-right",
                      c.align === "center" && "text-center",
                    )}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, i) => (
                <tr key={i} className={cn("border-b border-border/60 last:border-0", i % 2 === 1 && "bg-navy-900/[0.025]")}>
                  {table.columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        "max-w-[260px] truncate px-3 py-2",
                        c.align === "right" && "text-right tabular-nums",
                        c.align === "center" && "text-center",
                        c.format && c.format !== "text" && "tabular-nums",
                      )}
                      title={String(row[c.key] ?? "")}
                    >
                      {formatCell(row[c.key], c.format)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ------------------------------- the view ------------------------------ */

export function ReportResultView({ result }: { result: ReportResult }) {
  return (
    <div className="space-y-4">
      <KpiGrid kpis={result.kpis} />
      {result.charts.length > 0 && (
        <div className={cn("grid gap-4", result.charts.length > 1 && "xl:grid-cols-2")}>
          {result.charts.map((c, i) => (
            <ChartCard key={`${c.title}-${i}`} chart={c} />
          ))}
        </div>
      )}
      {result.tables.map((t, i) => (
        <ResultTable key={`${t.title}-${i}`} table={t} />
      ))}
      {result.kpis.length === 0 && result.charts.length === 0 && result.tables.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">This report returned nothing for the selected filters.</p>
      )}
    </div>
  );
}

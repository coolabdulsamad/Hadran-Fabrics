import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCurrency } from "@/lib/format";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@contracts/constants";
import { ChartCard, RangePicker, useReportRange, compact, CHART_COLORS } from "./report-shared";

/**
 * HADRAN FABRICS MALL — Analytics (Manager and above).
 * The visual side: revenue trend, payment mix, hourly pattern and category
 * share for any period. Numbers & exports live on the Reports page.
 */

const TOOLTIP_STYLE = { borderRadius: 12, border: "1px solid #C9A22755", fontSize: 13 } as const;

export default function AnalyticsPage() {
  const rangeCtl = useReportRange();
  const { range } = rangeCtl;

  const trendQuery = trpc.reports.salesTrend.useQuery(range);
  const hourlyQuery = trpc.reports.hourlyPattern.useQuery(range);
  const paymentsQuery = trpc.reports.paymentBreakdown.useQuery(range);
  const categoriesQuery = trpc.reports.categoryBreakdown.useQuery(range);

  const trend = trendQuery.data ?? [];
  const payments = paymentsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const hourly = hourlyQuery.data ?? [];

  const totalRevenue = trend.reduce((s, d) => s + d.revenue, 0);
  const peakHour = hourly.reduce<{ hour: string; orders: number } | null>(
    (best, h) => (h.orders > (best?.orders ?? 0) ? { hour: h.label, orders: h.orders } : best),
    null,
  );
  const topCategory = categories[0] ?? null;

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader title="Analytics" description="Visual trends and patterns — revenue over time, payment mix, busiest hours and category share." />

      <RangePicker {...rangeCtl} />

      {/* Insight strip */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card-lux px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-navy-700">Period revenue</p>
          <p className="mt-1 font-display text-xl font-bold tabular-nums text-gold-700">{formatCurrency(totalRevenue)}</p>
        </div>
        <div className="card-lux px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-navy-700">Peak selling hour</p>
          <p className="mt-1 font-display text-xl font-bold text-navy-900">
            {peakHour && peakHour.orders > 0 ? peakHour.hour : "—"}
            {peakHour && peakHour.orders > 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">{peakHour.orders} orders</span>}
          </p>
        </div>
        <div className="card-lux px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-navy-700">Strongest category</p>
          <p className="mt-1 truncate font-display text-xl font-bold text-navy-900">
            {topCategory ? topCategory.name : "—"}
            {topCategory && <span className="ml-2 text-xs font-normal text-muted-foreground">{topCategory.share.toFixed(1)}% of revenue</span>}
          </p>
        </div>
      </div>

      {/* Revenue trend */}
      <ChartCard title="Revenue trend" subtitle="Daily completed-sales revenue for the selected period">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="goldFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#C9A227" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#C9A227" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e1d5" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} stroke="#8a8570" />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={compact} stroke="#8a8570" width={60} />
              <Tooltip
                formatter={(value: number, name: string) => [name === "revenue" ? formatCurrency(value) : value, name === "revenue" ? "Revenue" : "Orders"]}
                labelFormatter={(d: string) => `Date: ${d}`}
                contentStyle={TOOLTIP_STYLE}
              />
              <Area type="monotone" dataKey="revenue" stroke="#C9A227" strokeWidth={2.5} fill="url(#goldFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* Breakdowns row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Payment methods" subtitle="How customers paid">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={payments.map((p) => ({ ...p, name: PAYMENT_METHOD_LABELS[p.method as PaymentMethod] ?? p.method }))}
                  dataKey="total"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={3}
                >
                  {payments.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={TOOLTIP_STYLE} />
                <Legend formatter={(v: string) => <span className="text-xs">{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 space-y-1">
            {payments.map((p, i) => (
              <li key={p.method} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  {PAYMENT_METHOD_LABELS[p.method as PaymentMethod] ?? p.method}
                  <span className="text-muted-foreground">({p.count} tx)</span>
                </span>
                <span className="font-medium tabular-nums">
                  {formatCurrency(p.total)} · {p.share.toFixed(1)}%
                </span>
              </li>
            ))}
          </ul>
        </ChartCard>

        <ChartCard title="Busiest hours" subtitle="Orders by hour of day — plan staffing">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourly} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e1d5" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={2} stroke="#8a8570" />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} stroke="#8a8570" width={35} />
                <Tooltip
                  formatter={(value: number, name: string) => [name === "orders" ? value : formatCurrency(value), name === "orders" ? "Orders" : "Revenue"]}
                  contentStyle={TOOLTIP_STYLE}
                />
                <Bar dataKey="orders" fill="#141B2D" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* Category share */}
      <ChartCard title="Category share" subtitle="Revenue distribution across the catalogue">
        {categories.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No sales in this period.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex h-4 w-full overflow-hidden rounded-full">
              {categories.map((c, i) => (
                <div
                  key={c.categoryId}
                  style={{ width: `${c.share}%`, background: CHART_COLORS[i % CHART_COLORS.length] }}
                  title={`${c.name} — ${c.share.toFixed(1)}%`}
                />
              ))}
            </div>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((c, i) => (
                <li key={c.categoryId} className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-sm">
                  <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                  <span className="text-xs text-muted-foreground">{c.share.toFixed(1)}%</span>
                  <span className="font-semibold tabular-nums">{formatCurrency(c.revenue)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </ChartCard>
    </div>
  );
}

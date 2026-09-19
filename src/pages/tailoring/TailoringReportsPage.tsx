import { useState } from "react";
import { Printer, ClipboardList, Banknote, CircleDollarSign, Scale, Shirt, Timer, Scissors } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
} from "recharts";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ExportButton, type ExportColumn } from "@/components/common/ExportButton";
import { PrintPortal } from "@/components/common/PrintPortal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TAILORING_STATUS_LABELS } from "@contracts/labels";
import { STORE, type TailoringOrderStatus } from "@contracts/constants";
import { tailoringStatusTone } from "@/lib/tailoring";
import { formatCurrency, formatDate } from "@/lib/format";

/**
 * HADRAN FABRICS MALL — tailoring reports
 * Date-ranged section reports: headline totals, top styles, orders by
 * status, daily collections, top customers, tailor performance and
 * average turnaround — with CSV/Excel export and a print sheet.
 */

function monthStart(): string {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function TailoringReportsPage() {
  const [dateFrom, setDateFrom] = useState(monthStart());
  const [dateTo, setDateTo] = useState(todayStr());
  const [printing, setPrinting] = useState(false);

  const report = trpc.tailoring.reports.useQuery(
    { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined },
    { retry: 1 },
  );
  const r = report.data;

  const styleExport: ExportColumn<{ style: string; orders: number; revenue: number }>[] = [
    { header: "Style", value: (s) => s.style },
    { header: "Orders", value: (s) => s.orders },
    { header: "Revenue (₦)", value: (s) => s.revenue },
  ];
  const customerExport: ExportColumn<{ name: string; phone: string | null; orders: number; spent: number }>[] = [
    { header: "Customer", value: (c) => c.name },
    { header: "Phone", value: (c) => c.phone },
    { header: "Orders", value: (c) => c.orders },
    { header: "Spent (₦)", value: (c) => c.spent },
  ];
  const tailorExport: ExportColumn<{ name: string; jobs: number; billed: number; delivered: number }>[] = [
    { header: "Tailor", value: (t) => t.name },
    { header: "Jobs", value: (t) => t.jobs },
    { header: "Delivered", value: (t) => t.delivered },
    { header: "Billed (₦)", value: (t) => t.billed },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Tailoring Reports"
        description="Revenue, styles, customers, tailor performance and turnaround for any date range."
        actions={
          <Button
            variant="outline"
            onClick={() => { setPrinting(true); setTimeout(() => window.print(), 250); }}
            disabled={!r}
            className="gap-2 border-gold-500/40 text-navy-800 hover:bg-gold-50"
          >
            <Printer className="h-4 w-4 text-gold-600" />
            Print
          </Button>
        }
      />

      {/* Date range */}
      <div className="card-lux flex flex-wrap items-end gap-4 p-4">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">From</p>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">To</p>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className="flex gap-2">
          {[
            { label: "Today", from: todayStr(), to: todayStr() },
            { label: "This Month", from: monthStart(), to: todayStr() },
            { label: "All Time", from: "", to: "" },
          ].map((p) => (
            <Button key={p.label} variant="outline" size="sm" onClick={() => { setDateFrom(p.from); setDateTo(p.to); }} className="border-gold-500/40 text-navy-800 hover:bg-gold-50">
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={ClipboardList} label="Orders" value={String(r?.totals.orders ?? 0)} tone="navy" hint="Received in range" />
        <StatCard icon={Banknote} label="Billed" value={formatCurrency(r?.totals.billed ?? 0)} tone="navy" hint="Order value" />
        <StatCard icon={CircleDollarSign} label="Collected" value={formatCurrency(r?.totals.collected ?? 0)} tone="emerald" hint="Money taken" />
        <StatCard icon={Scale} label="Outstanding" value={formatCurrency(r?.totals.outstanding ?? 0)} tone="red" hint="Still to collect" />
        <StatCard icon={Shirt} label="Shop-Fabric Jobs" value={String(r?.totals.shopFabricOrders ?? 0)} tone="gold" hint="Fabric from shop stock" />
        <StatCard
          icon={Timer}
          label="Avg Turnaround"
          value={r?.avgTurnaroundHours != null ? `${r.avgTurnaroundHours}h` : "—"}
          tone="navy"
          hint={r?.deliveredCount ? `${r.deliveredCount} delivered orders` : "No deliveries yet"}
        />
      </div>

      {/* Charts */}
      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="card-lux min-w-0 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-navy-900">Top styles by revenue</h2>
            <ExportButton filename="tailoring-top-styles" sheetName="Top Styles" columns={styleExport} rows={r?.byStyle ?? []} />
          </div>
          {(r?.byStyle ?? []).length === 0 ? (
            <p className="py-14 text-center text-sm text-muted-foreground">No style data in this range.</p>
          ) : (
            <div className="mt-3 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={r!.byStyle.slice(0, 8).map((s) => ({ styleName: s.style, revenue: s.revenue }))} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d5" />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${STORE.currencySymbol}${Number(v).toLocaleString()}`} />
                  <YAxis type="category" dataKey="styleName" tick={{ fontSize: 10 }} width={110} />
                  <RTooltip formatter={(v) => formatCurrency(Number(v))} />
                  <Bar dataKey="revenue" name="Revenue" fill="#b8860b" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card-lux min-w-0 p-5">
          <h2 className="font-display text-base font-bold text-navy-900">Daily collections</h2>
          {(r?.daily ?? []).length === 0 ? (
            <p className="py-14 text-center text-sm text-muted-foreground">No payments in this range.</p>
          ) : (
            <div className="mt-3 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={r!.daily.map((d) => ({ ...d, day: d.day.slice(5) }))} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d5" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} width={70} tickFormatter={(v) => `${STORE.currencySymbol}${Number(v).toLocaleString()}`} />
                  <RTooltip formatter={(v) => formatCurrency(Number(v))} />
                  <Bar dataKey="total" name="Collected" fill="#b8860b" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Status + customers + tailors */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card-lux min-w-0 p-5">
          <h2 className="font-display text-base font-bold text-navy-900">Orders by status</h2>
          <ul className="mt-3 space-y-2">
            {(r?.byStatus ?? []).map((s) => (
              <li key={s.status} className="flex items-center justify-between rounded-lg border border-border bg-cream-50 px-3 py-2">
                <StatusBadge label={TAILORING_STATUS_LABELS[s.status as TailoringOrderStatus] ?? s.status} tone={tailoringStatusTone(s.status as TailoringOrderStatus)} />
                <span className="text-sm font-bold text-navy-900">{s.count}</span>
              </li>
            ))}
            {(r?.byStatus ?? []).length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No orders in range.</p>}
          </ul>
        </div>

        <div className="card-lux min-w-0 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-navy-900">Top customers</h2>
            <ExportButton filename="tailoring-top-customers" sheetName="Top Customers" columns={customerExport} rows={r?.topCustomers ?? []} />
          </div>
          <ul className="mt-3 space-y-2">
            {(r?.topCustomers ?? []).map((c, i) => (
              <li key={`${c.name}-${i}`} className="min-w-0 rounded-lg border border-border bg-cream-50 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-semibold text-navy-900">
                    <span className="mr-1.5 font-mono text-[10px] text-gold-700">#{i + 1}</span>
                    {c.name}
                  </p>
                  <span className="shrink-0 text-xs font-bold text-navy-900">{formatCurrency(c.spent)}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{c.orders} order{c.orders === 1 ? "" : "s"}{c.phone ? ` · ${c.phone}` : ""}</p>
              </li>
            ))}
            {(r?.topCustomers ?? []).length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No customers in range.</p>}
          </ul>
        </div>

        <div className="card-lux min-w-0 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-navy-900">Tailor performance</h2>
            <ExportButton filename="tailoring-tailor-performance" sheetName="Tailors" columns={tailorExport} rows={r?.tailors ?? []} />
          </div>
          <ul className="mt-3 space-y-2">
            {(r?.tailors ?? []).map((t) => (
              <li key={t.name} className="rounded-lg border border-border bg-cream-50 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex min-w-0 items-center gap-1.5 truncate text-xs font-semibold text-navy-900">
                    <Scissors className="h-3 w-3 shrink-0 text-gold-600" />
                    {t.name}
                  </p>
                  <span className="shrink-0 text-xs font-bold text-navy-900">{formatCurrency(t.billed)}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {t.jobs} job{t.jobs === 1 ? "" : "s"} · {t.delivered} delivered
                </p>
              </li>
            ))}
            {(r?.tailors ?? []).length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No tailor activity in range.</p>}
          </ul>
        </div>
      </div>

      {/* Print sheet */}
      {printing && r && (
        <PrintPortal>
          <div className="p-6">
            <h1 style={{ fontSize: 18, fontWeight: 700 }}>Hadran Fabrics Mall — Tailoring Report</h1>
            <p style={{ fontSize: 11, marginTop: 4 }}>
              Printed {formatDate(new Date())} · {dateFrom || "Beginning"} → {dateTo || "Today"}
            </p>
            <table style={{ width: "100%", marginTop: 12, borderCollapse: "collapse", fontSize: 11 }}>
              <tbody>
                {[
                  ["Orders received", String(r.totals.orders)],
                  ["Total billed", formatCurrency(r.totals.billed)],
                  ["Collected", formatCurrency(r.totals.collected)],
                  ["Outstanding", formatCurrency(r.totals.outstanding)],
                  ["Shop-fabric jobs", String(r.totals.shopFabricOrders)],
                  ["Avg turnaround", r.avgTurnaroundHours != null ? `${r.avgTurnaroundHours} hours (${r.deliveredCount} delivered)` : "—"],
                ].map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{k}</td>
                    <td style={{ border: "1px solid #999", padding: "4px 6px", fontWeight: 700 }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h2 style={{ fontSize: 13, fontWeight: 700, marginTop: 16 }}>Top styles</h2>
            <table style={{ width: "100%", marginTop: 6, borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>{["Style", "Orders", "Revenue"].map((h) => <th key={h} style={{ border: "1px solid #999", padding: "4px 6px", textAlign: "left" }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {r.byStyle.map((s) => (
                  <tr key={s.style}>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{s.style}</td>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{s.orders}</td>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{formatCurrency(s.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h2 style={{ fontSize: 13, fontWeight: 700, marginTop: 16 }}>Tailor performance</h2>
            <table style={{ width: "100%", marginTop: 6, borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>{["Tailor", "Jobs", "Delivered", "Billed"].map((h) => <th key={h} style={{ border: "1px solid #999", padding: "4px 6px", textAlign: "left" }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {r.tailors.map((t) => (
                  <tr key={t.name}>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{t.name}</td>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{t.jobs}</td>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{t.delivered}</td>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{formatCurrency(t.billed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PrintPortal>
      )}
    </div>
  );
}

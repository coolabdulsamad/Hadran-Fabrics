import { useMemo } from "react";
import { Link } from "react-router";
import {
  WashingMachine,
  PlusCircle,
  ClipboardList,
  CircleDollarSign,
  AlarmClock,
  PackageCheck,
  Banknote,
  ArrowRight,
  CreditCard,
  Users,
  FileBarChart,
} from "lucide-react";
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
import { LoadingScreen } from "@/components/common/LoadingScreen";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { LAUNDRY_STATUS_LABELS, ORDER_PAYMENT_STATUS_LABELS } from "@contracts/labels";
import { LAUNDRY_ORDER_STATUSES, STORE, type LaundryOrderStatus } from "@contracts/constants";
import { LAUNDRY_WORKFLOW, laundryStatusTone, paymentStatusTone } from "@/lib/laundry";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * HADRAN FABRICS MALL — laundry dashboard
 * The laundry desk at a glance: revenue, workload by workflow stage,
 * overdue orders, outstanding balances and the latest activity.
 */

export default function LaundryHomePage() {
  const { hasPermission } = useAuth();
  const dash = trpc.laundry.dashboard.useQuery(undefined, { retry: 1 });

  const board = dash.data?.statusBoard ?? {};
  const activeOrders = LAUNDRY_WORKFLOW.filter((s) => s !== "COLLECTED").reduce(
    (sum, s) => sum + (board[s] ?? 0),
    0,
  );

  const chartData = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const d of dash.data?.daily ?? []) byDay.set(d.day, d.total);
    const days: { day: string; revenue: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ day: key.slice(5), revenue: Number((byDay.get(key) ?? 0).toFixed(2)) });
    }
    return days;
  }, [dash.data?.daily]);

  if (dash.isLoading) return <LoadingScreen label="Loading laundry dashboard…" />;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Laundry"
        description="Garment care — washing, dry-cleaning, ironing & repairs. Track every order from intake to pickup."
        actions={
          <>
            <Link to="/laundry/orders">
              <Button variant="outline" className="gap-2 border-gold-500/40 text-navy-800 hover:bg-gold-50">
                <ClipboardList className="h-4 w-4 text-gold-600" />
                All Orders
              </Button>
            </Link>
            {hasPermission("laundry.manage") && (
              <Link to="/laundry/orders/new">
                <Button className="gap-2 bg-navy-800 text-cream-100 hover:bg-navy-700">
                  <PlusCircle className="h-4 w-4 text-gold-400" />
                  New Order
                </Button>
              </Link>
            )}
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={Banknote} label="Revenue Today" value={formatCurrency(dash.data?.revenueToday ?? 0)} tone="emerald" hint="Payments collected today" />
        <StatCard icon={CircleDollarSign} label="Revenue Month" value={formatCurrency(dash.data?.revenueMonth ?? 0)} tone="emerald" hint="Month to date" />
        <StatCard icon={WashingMachine} label="Active Orders" value={String(activeOrders)} tone="navy" hint="In the workflow right now" />
        <StatCard icon={PackageCheck} label="Ready for Pickup" value={String(board.READY ?? 0)} tone="gold" hint="Waiting for customers" />
        <StatCard icon={AlarmClock} label="Due / Overdue" value={String(dash.data?.overdueCount ?? 0)} tone="red" hint="Due today or earlier" />
        <StatCard icon={CreditCard} label="Outstanding" value={formatCurrency(dash.data?.outstandingBalance ?? 0)} tone="red" hint="Unpaid balances" />
      </div>

      {/* Workflow pipeline */}
      <div className="card-lux mt-6 p-5">
        <h2 className="font-display text-base font-bold text-navy-900">Workflow board</h2>
        <p className="text-xs text-muted-foreground">Tap a stage to see the orders sitting in it.</p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {LAUNDRY_ORDER_STATUSES.map((status) => (
            <Link
              key={status}
              to={`/laundry/orders?status=${status}`}
              className={cn(
                "group rounded-xl border border-border bg-cream-50 p-3 text-center transition hover:border-gold-400 hover:shadow-sm",
                status === "CANCELLED" && "opacity-80",
              )}
            >
              <p className="font-display text-2xl font-bold text-navy-900 group-hover:text-gold-700">
                {board[status as LaundryOrderStatus] ?? 0}
              </p>
              <div className="mt-1.5 flex justify-center">
                <StatusBadge label={LAUNDRY_STATUS_LABELS[status as LaundryOrderStatus]} tone={laundryStatusTone(status as LaundryOrderStatus)} />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Chart + overdue + recent */}
      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="card-lux min-w-0 p-5">
          <h2 className="font-display text-base font-bold text-navy-900">Revenue — last 30 days</h2>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d5" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} interval={4} />
                <YAxis tick={{ fontSize: 10 }} width={70} tickFormatter={(v) => `${STORE.currencySymbol}${Number(v).toLocaleString()}`} />
                <RTooltip formatter={(v) => formatCurrency(Number(v))} />
                <Bar dataKey="revenue" name="Laundry revenue" fill="#0891b2" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-lux min-w-0 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-navy-900">Due / overdue</h2>
            <AlarmClock className="h-4 w-4 text-red-500" />
          </div>
          {(dash.data?.overdue ?? []).length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nothing due — the desk is on schedule.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {dash.data!.overdue.map((o) => (
                <li key={o.id}>
                  <Link
                    to={`/laundry/orders/${o.id}`}
                    className="block min-w-0 rounded-lg border border-border bg-cream-50 px-3 py-2.5 transition hover:border-gold-400"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-semibold text-navy-900">{o.customerName}</p>
                      {o.priority === "EXPRESS" && <StatusBadge label="Express" tone="red" />}
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                      <span className="font-mono">{o.orderNo}</span>
                      <span>·</span>
                      <span>due {o.dueDate ? formatDate(o.dueDate) : "—"}</span>
                      <span>·</span>
                      <span>{LAUNDRY_STATUS_LABELS[o.status]}</span>
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Recent orders + quick links */}
      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="card-lux min-w-0 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-navy-900">Latest orders</h2>
            <Link to="/laundry/orders" className="flex items-center gap-1 text-xs font-semibold text-gold-700 hover:text-gold-800">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {(dash.data?.recent ?? []).length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No orders yet — receive the first one.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {dash.data!.recent.map((o) => (
                <li key={o.id}>
                  <Link to={`/laundry/orders/${o.id}`} className="flex items-center justify-between gap-3 py-2.5 transition hover:bg-cream-50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-navy-900">
                        {o.customerName} <span className="ml-1 font-mono text-[11px] text-muted-foreground">{o.orderNo}</span>
                      </p>
                      <p className="text-[11px] text-muted-foreground">{formatDateTime(o.createdAt)}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                      <span className="text-sm font-semibold text-navy-900">{formatCurrency(o.totalAmount)}</span>
                      <StatusBadge label={LAUNDRY_STATUS_LABELS[o.status]} tone={laundryStatusTone(o.status)} />
                      <StatusBadge label={ORDER_PAYMENT_STATUS_LABELS[o.paymentStatus]} tone={paymentStatusTone(o.paymentStatus)} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card-lux min-w-0 p-5">
          <h2 className="font-display text-base font-bold text-navy-900">Laundry desk</h2>
          <ul className="mt-3 space-y-2">
            {[
              { label: "Payments", description: "Deposits & balance collections", path: "/laundry/payments", icon: CreditCard },
              { label: "Customers", description: "Records & order history", path: "/laundry/customers", icon: Users },
              { label: "Reports", description: "Revenue, services & staff", path: "/laundry/reports", icon: FileBarChart },
            ].map((l) => (
              <li key={l.path}>
                <Link
                  to={l.path}
                  className="flex items-center gap-3 rounded-lg border border-border bg-cream-50 px-3 py-2.5 transition hover:border-gold-400 hover:shadow-sm"
                >
                  <l.icon className="h-4 w-4 shrink-0 text-gold-600" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-navy-900">{l.label}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{l.description}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

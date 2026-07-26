import { Link } from "react-router";
import {
  Package,
  Tags,
  UserCog,
  AlertTriangle,
  ShoppingCart,
  ArrowDownToLine,
  FileBarChart,
  MessageSquare,
  Bot,
  PlusCircle,
  Boxes,
  TrendingUp,
  ArrowDownUp,
  type LucideIcon,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { StatCard } from "@/components/common/StatCard";
import { RoleBadge } from "@/components/common/RoleBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingScreen } from "@/components/common/LoadingScreen";
import { formatCurrency, formatDate, formatQty, timeAgo } from "@/lib/format";
import { MOVEMENT_LABELS } from "@contracts/labels";
import { cn } from "@/lib/utils";

interface QuickAction {
  label: string;
  description: string;
  path: string;
  icon: LucideIcon;
  permission?: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: "Open POS Terminal", description: "Start selling — scan or search items", path: "/pos", icon: ShoppingCart, permission: "pos.sell" },
  { label: "Add New Product", description: "Register fabric, shoes, jewelry…", path: "/products/new", icon: PlusCircle, permission: "products.create" },
  { label: "Record Stock-In", description: "Receive new inventory", path: "/inventory/movements", icon: ArrowDownToLine, permission: "inventory.stock_in" },
  { label: "View Reports", description: "Sales, inventory & financials", path: "/reports", icon: FileBarChart, permission: "reports.view" },
  { label: "Team Chat", description: "Message the store team", path: "/chat", icon: MessageSquare, permission: "chat.use" },
  { label: "Ask AI Assistant", description: "Questions answered from store data", path: "/ai", icon: Bot, permission: "ai.use" },
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { can } = usePermissions();
  const summary = trpc.dashboard.summary.useQuery(undefined, { retry: 1 });
  const movements = trpc.dashboard.recentMovements.useQuery(undefined, { retry: 1 });

  if (summary.isLoading) return <LoadingScreen label="Loading dashboard…" />;

  const s = summary.data;
  const actions = QUICK_ACTIONS.filter((a) => !a.permission || can(a.permission));

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="card-lux-gold relative overflow-hidden bg-navy-900 p-6 text-cream-100 md:p-8">
        <div className="pointer-events-none absolute inset-3 rounded-sm border border-gold-500/20" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-gold-400">
              {formatDate(new Date())} · {s?.storeName ?? "Hadran Fabrics Mall"}
            </p>
            <h1 className="mt-2 font-display text-2xl font-bold md:text-3xl">
              {greeting()}, {user?.fullName.split(" ")[0]}.
            </h1>
            <p className="mt-1 text-sm text-cream-300/75">
              Here's the state of the store at a glance.
            </p>
          </div>
          {user && <RoleBadge role={user.role} />}
        </div>
      </div>

      {/* KPI stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Package} label="Active Products" value={String(s?.activeProducts ?? 0)} hint="In the catalog" tone="navy" />
        <StatCard icon={Tags} label="Categories" value={String(s?.categories ?? 0)} hint="Fabric walls & sections" tone="gold" />
        <StatCard icon={UserCog} label="Active Staff" value={String(s?.activeStaff ?? 0)} hint="Across all roles" tone="emerald" />
        <StatCard
          icon={AlertTriangle}
          label="Low Stock Alerts"
          value={String(s?.lowStockCount ?? 0)}
          hint="At or below reorder level"
          tone={s && s.lowStockCount > 0 ? "red" : "emerald"}
        />
      </div>

      {user?.role !== "SALES" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard icon={Boxes} label="Stock Value (Cost)" value={formatCurrency(s?.stockValueAtCost)} hint="What the inventory cost" tone="navy" />
          <StatCard icon={TrendingUp} label="Stock Value (Retail)" value={formatCurrency(s?.stockValueAtRetail)} hint="Potential sales value" tone="gold" />
        </div>
      )}

      {/* Quick actions */}
      {actions.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-semibold text-navy-900">Quick Actions</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {actions.map((a) => (
              <Link
                key={a.path + a.label}
                to={a.path}
                className="card-lux group flex items-start gap-4 p-5 transition hover:border-gold-500/50 hover:shadow-[0_10px_30px_-12px_rgba(201,162,39,0.35)]"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-navy-800 transition group-hover:bg-navy-700">
                  <a.icon className="h-5 w-5 text-gold-400" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-navy-900">{a.label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{a.description}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Low stock alerts */}
        <section className="card-lux">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-navy-900">
              <AlertTriangle className="h-4 w-4 text-gold-600" />
              Low Stock Watch
            </h2>
            <Link to="/inventory/low-stock" className="text-xs font-medium text-gold-700 hover:underline">
              View all
            </Link>
          </div>
          {s && s.lowStock.length > 0 ? (
            <ul className="divide-y divide-border">
              {s.lowStock.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-navy-900">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.sku}</p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-xs font-bold",
                      p.currentStock <= 0 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800",
                    )}
                  >
                    {formatQty(p.currentStock)} {p.unitOfMeasure.toLowerCase()}
                    {p.currentStock === 1 ? "" : "s"} left
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Package}
              title="Stock levels are healthy"
              description="No product is at or below its reorder level right now."
            />
          )}
        </section>

        {/* Recent stock movements */}
        <section className="card-lux">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-navy-900">
              <ArrowDownUp className="h-4 w-4 text-gold-600" />
              Recent Stock Movements
            </h2>
            <Link to="/inventory/movements" className="text-xs font-medium text-gold-700 hover:underline">
              View all
            </Link>
          </div>
          {movements.data && movements.data.length > 0 ? (
            <ul className="divide-y divide-border">
              {movements.data.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-navy-900">{m.productName}</p>
                    <p className="text-xs text-muted-foreground">
                      {MOVEMENT_LABELS[m.movementType] ?? m.movementType}
                      {m.performedByName ? ` · ${m.performedByName}` : ""}
                      {m.reason ? ` · ${m.reason}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        "text-sm font-bold",
                        m.quantity >= 0 ? "text-emerald-600" : "text-red-600",
                      )}
                    >
                      {m.quantity >= 0 ? "+" : ""}
                      {formatQty(m.quantity)} {m.unit.toLowerCase()}
                      {Math.abs(m.quantity) === 1 ? "" : "s"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{timeAgo(m.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={ArrowDownUp}
              title="No movements yet"
              description="Stock in/out activity will appear here as the team works."
            />
          )}
        </section>
      </div>
    </div>
  );
}

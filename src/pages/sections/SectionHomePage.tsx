import { Link } from "react-router";
import {
  ClipboardList,
  CreditCard,
  Factory,
  FileBarChart,
  PlusCircle,
  Scissors,
  Users,
  WashingMachine,
  AlarmClock,
  BadgeCheck,
  Banknote,
  CircleDollarSign,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { LoadingScreen } from "@/components/common/LoadingScreen";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { SECTION_LABELS } from "@contracts/constants";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * HADRAN FABRICS MALL — section home (Laundry / Tailoring)
 * Live headline numbers for the section plus quick links into its
 * modules. Full module pages arrive with their dedicated phases.
 */

type ServiceSection = "LAUNDRY" | "TAILORING";

interface QuickLink {
  label: string;
  description: string;
  path: string;
  icon: LucideIcon;
  phase: number;
}

const SECTION_META: Record<
  ServiceSection,
  { icon: LucideIcon; chip: string; accent: string; tagline: string; links: QuickLink[] }
> = {
  LAUNDRY: {
    icon: WashingMachine,
    chip: "bg-cyan-100 text-cyan-700",
    accent: "text-cyan-700",
    tagline: "Garment care — washing, dry-cleaning, ironing & repairs.",
    links: [
      { label: "New Order", description: "Receive garments and price the job.", path: "/laundry/orders/new", icon: PlusCircle, phase: 4 },
      { label: "Orders", description: "Track every order through the workflow.", path: "/laundry/orders", icon: ClipboardList, phase: 4 },
      { label: "Payments", description: "Deposits, balances and receipts.", path: "/laundry/payments", icon: CreditCard, phase: 4 },
      { label: "Customers", description: "Laundry customer records & history.", path: "/laundry/customers", icon: Users, phase: 4 },
      { label: "Reports", description: "Section reports and analytics.", path: "/laundry/reports", icon: FileBarChart, phase: 4 },
    ],
  },
  TAILORING: {
    icon: Scissors,
    chip: "bg-violet-100 text-violet-700",
    accent: "text-violet-700",
    tagline: "Bespoke tailoring — measurements, styles & in-house production.",
    links: [
      { label: "New Order", description: "Capture style, fabric & measurements.", path: "/tailoring/orders/new", icon: PlusCircle, phase: 5 },
      { label: "Orders", description: "Cutting → sewing → fitting → delivery.", path: "/tailoring/orders", icon: ClipboardList, phase: 5 },
      { label: "Production", description: "Turn shop materials into sellable stock.", path: "/tailoring/production", icon: Factory, phase: 5 },
      { label: "Payments", description: "Deposits, balances and receipts.", path: "/tailoring/payments", icon: CreditCard, phase: 5 },
      { label: "Customers", description: "Tailoring customer records & history.", path: "/tailoring/customers", icon: Users, phase: 5 },
      { label: "Reports", description: "Section reports and analytics.", path: "/tailoring/reports", icon: FileBarChart, phase: 5 },
    ],
  },
};

export function SectionHomePage({ section }: { section: ServiceSection }) {
  const { user } = useAuth();
  const meta = SECTION_META[section];
  const Icon = meta.icon;

  const overview = trpc.sections.overview.useQuery({ section }, { retry: 1 });

  if (overview.isLoading) return <LoadingScreen label={`Opening ${SECTION_LABELS[section]}…`} />;
  if (overview.error) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="card-lux max-w-md p-8 text-center">
          <p className="font-display text-lg font-bold text-navy-900">Could not load the section</p>
          <p className="mt-2 text-sm text-muted-foreground">{overview.error.message}</p>
          <Button onClick={() => overview.refetch()} className="mt-5 bg-navy-800 text-cream-100 hover:bg-navy-700">
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const data = overview.data;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={`${SECTION_LABELS[section]} Section`}
        description={`${meta.tagline}${user?.branchName ? ` · ${user.branchName}` : ""}`}
        actions={
          <span className={cn("inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-widest", meta.chip)}>
            <Icon className="h-4 w-4" />
            {SECTION_LABELS[section]}
          </span>
        }
      />

      {/* Headline numbers */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatCard icon={ClipboardList} label="Active Orders" value={formatNumber(data && "activeOrders" in data ? data.activeOrders : 0)} hint="In progress right now" tone="navy" />
        <StatCard icon={BadgeCheck} label={section === "LAUNDRY" ? "Ready for Collection" : "Ready for Delivery"} value={formatNumber(data && "readyOrders" in data ? data.readyOrders : 0)} hint="Waiting on the customer" tone="emerald" />
        <StatCard icon={AlarmClock} label="Due Soon" value={formatNumber(data && "dueSoon" in data ? data.dueSoon : 0)} hint="Due today or tomorrow" tone="red" />
        <StatCard icon={CreditCard} label="Unpaid Orders" value={formatNumber(data && "unpaidOrders" in data ? data.unpaidOrders : 0)} hint="Unpaid or part-paid" tone="gold" />
        <StatCard icon={CircleDollarSign} label="Collected Today" value={formatCurrency(data && "revenueToday" in data ? data.revenueToday : 0)} hint="Payments received today" tone="navy" />
      </div>

      {/* Quick links into the module */}
      <h2 className="mt-10 font-display text-lg font-bold text-navy-900">Jump to work</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {meta.links.map((link) => (
          <Link
            key={link.path}
            to={link.path}
            className="card-lux group flex items-start gap-4 p-5 transition hover:-translate-y-0.5 hover:border-gold-500/50 hover:shadow-lg"
          >
            <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", meta.chip)}>
              <link.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-semibold text-navy-900">
                {link.label}
                <ArrowRight className="h-3.5 w-3.5 text-gold-600 opacity-0 transition group-hover:opacity-100" />
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{link.description}</p>
              <p className="mt-2 text-[10px] font-semibold uppercase tracking-widest text-gold-600">
                Full module in Phase {link.phase}
              </p>
            </div>
          </Link>
        ))}
      </div>

      {/* Honest phase note */}
      <div className="card-lux-gold mt-8 flex items-start gap-4 p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-800">
          <Banknote className="h-5 w-5 text-gold-400" />
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          <span className="font-semibold text-navy-900">This is the live section home.</span>{" "}
          The numbers above are real. The full {SECTION_LABELS[section].toLowerCase()} module —
          order capture, garment workflow, payments and reports — is built out in{" "}
          <span className="font-semibold text-navy-900">Phase {section === "LAUNDRY" ? 4 : 5}</span>,
          right after Expenses & Money Management.
        </p>
      </div>
    </div>
  );
}

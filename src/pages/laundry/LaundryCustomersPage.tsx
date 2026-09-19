import { useMemo, useState } from "react";
import { Crown } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { DataTable, type Column } from "@/components/common/DataTable";
import { ExportButton, type ExportColumn } from "@/components/common/ExportButton";
import { Input } from "@/components/ui/input";
import { Users, UserCheck, CircleDollarSign } from "lucide-react";
import { formatCurrency, formatDateTime } from "@/lib/format";

/**
 * HADRAN FABRICS MALL — laundry customers
 * Customer records aggregated from laundry order history (walk-ins
 * included): orders, lifetime spend, outstanding balance and last visit.
 */

interface CustomerRow {
  name: string;
  phone: string | null;
  orders: number;
  spent: number;
  balance: number;
  lastOrderAt: string;
}

export default function LaundryCustomersPage() {
  const [search, setSearch] = useState("");
  const customersQuery = trpc.laundry.customers.useQuery({ search: search || undefined }, { retry: 1 });
  const rows = (customersQuery.data ?? []) as CustomerRow[];

  const totals = useMemo(
    () => ({
      count: rows.length,
      repeat: rows.filter((r) => r.orders > 1).length,
      outstanding: rows.reduce((s, r) => s + r.balance, 0),
    }),
    [rows],
  );

  const exportColumns: ExportColumn<CustomerRow>[] = [
    { header: "Customer", value: (r) => r.name },
    { header: "Phone", value: (r) => r.phone },
    { header: "Orders", value: (r) => r.orders },
    { header: "Total Spent (₦)", value: (r) => r.spent },
    { header: "Outstanding (₦)", value: (r) => r.balance },
    { header: "Last Order", value: (r) => formatDateTime(r.lastOrderAt) },
  ];

  const columns: Column<CustomerRow>[] = [
    {
      header: "Customer",
      render: (r) => (
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-100 text-xs font-bold text-navy-800">
            {r.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-navy-900">
              {r.name}
              {r.orders >= 5 && <Crown className="ml-1 inline h-3.5 w-3.5 text-gold-500" />}
            </p>
            {r.phone && <p className="text-[11px] text-muted-foreground">{r.phone}</p>}
          </div>
        </div>
      ),
    },
    { header: "Orders", className: "text-center", render: (r) => <span className="text-sm font-semibold text-navy-900">{r.orders}</span> },
    { header: "Total Spent", className: "text-right", render: (r) => <span className="font-semibold text-navy-900">{formatCurrency(r.spent)}</span> },
    {
      header: "Outstanding",
      className: "text-right",
      render: (r) => <span className={r.balance > 0 ? "font-semibold text-red-600" : "text-emerald-700"}>{formatCurrency(r.balance)}</span>,
    },
    { header: "Last Order", render: (r) => <span className="whitespace-nowrap text-xs">{formatDateTime(r.lastOrderAt)}</span> },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Laundry Customers"
        description="Everyone who has brought garments in — order counts, lifetime spend and outstanding balances."
        actions={<ExportButton filename="laundry-customers" sheetName="Laundry Customers" columns={exportColumns} rows={rows} />}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Users} label="Customers" value={String(totals.count)} tone="navy" hint="Distinct laundry customers" />
        <StatCard icon={UserCheck} label="Repeat Customers" value={String(totals.repeat)} tone="emerald" hint="More than one order" />
        <StatCard icon={CircleDollarSign} label="Outstanding Balances" value={formatCurrency(totals.outstanding)} tone="red" hint="Still to collect" />
      </div>

      <div className="mt-6 max-w-sm">
        <Input placeholder="Search name or phone…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          data={rows}
          loading={customersQuery.isLoading}
          keyFn={(r) => `${r.name}|${r.phone ?? ""}`}
          emptyTitle="No laundry customers yet"
          emptyDescription="Customers appear here as soon as their first order is received."
        />
      </div>
    </div>
  );
}

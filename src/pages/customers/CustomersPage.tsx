import { useState } from "react";
import { UserPlus, Users, Crown, CircleCheck, Banknote, Search, Star } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { usePermissions } from "@/hooks/use-permissions";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge, toneForStatus } from "@/components/common/StatusBadge";
import { CustomerFormDialog, type EditableCustomer } from "@/components/customers/CustomerFormDialog";
import { CustomerDetailsDrawer } from "@/components/customers/CustomerDetailsDrawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, timeAgo } from "@/lib/format";
import { CUSTOMER_STATUSES, type CustomerStatus } from "@contracts/constants";

/**
 * HADRAN FABRICS MALL — Customer management.
 * Registered & special customers: personal discounts, loyalty points,
 * lifetime value, purchase history. Manager edits that touch a discount
 * are routed to the admin approval queue automatically.
 */

type CustomerRow = {
  id: number;
  code: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  discountPercent: number;
  loyaltyPoints: number;
  totalSpent: number;
  visitCount: number;
  lastVisitAt: string | Date | null;
  status: CustomerStatus;
  address: string | null;
  gender: "MALE" | "FEMALE" | "OTHER" | null;
  birthday: string | Date | null;
  notes: string | null;
  discountNote: string | null;
};

export default function CustomersPage() {
  const { can } = usePermissions();
  const canManage = can("customers.manage");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CustomerStatus | "ALL">("ALL");
  const [withDiscountOnly, setWithDiscountOnly] = useState(false);
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EditableCustomer | null>(null);
  const [detailsId, setDetailsId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const statsQuery = trpc.customers.stats.useQuery();
  const listQuery = trpc.customers.list.useQuery({
    search: search.trim() || undefined,
    status: status === "ALL" ? undefined : status,
    withDiscountOnly,
    page,
    pageSize: 15,
  });

  const items = (listQuery.data?.items ?? []) as unknown as CustomerRow[];

  const openEdit = async (id: number) => {
    try {
      const { customer: c } = await utils.customers.byId.fetch({ id });
      setEditing({
        id: c.id,
        fullName: c.fullName,
        phone: c.phone,
        email: c.email,
        address: c.address,
        gender: c.gender,
        birthday: c.birthday,
        notes: c.notes,
        discountPercent: Number(c.discountPercent),
        discountNote: c.discountNote,
      });
      setDetailsId(null);
      setFormOpen(true);
    } catch {
      // row vanished — refresh the list
      void listQuery.refetch();
    }
  };

  const columns: Column<CustomerRow>[] = [
    {
      header: "Customer",
      render: (r) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-900 font-display text-xs font-semibold text-gold-400">
            {r.fullName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
          </span>
          <div>
            <p className="font-medium text-foreground">{r.fullName}</p>
            <p className="text-[11px] text-muted-foreground">
              {r.code} • {r.phone ?? "no phone"}
            </p>
          </div>
        </div>
      ),
    },
    {
      header: "Discount",
      render: (r) =>
        Number(r.discountPercent) > 0 ? (
          <span className="flex items-center gap-1 font-semibold text-gold-700">
            <Crown className="h-3.5 w-3.5" />
            {Number(r.discountPercent)}%
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      header: "Loyalty",
      className: "text-center",
      render: (r) => (
        <span className="flex items-center justify-center gap-1 tabular-nums">
          <Star className="h-3.5 w-3.5 text-gold-500" />
          {r.loyaltyPoints.toLocaleString()}
        </span>
      ),
    },
    {
      header: "Total spent",
      className: "text-right",
      render: (r) => <span className="font-semibold tabular-nums text-navy-900">{formatCurrency(r.totalSpent)}</span>,
    },
    {
      header: "Last visit",
      render: (r) => (
        <span className="text-muted-foreground">{r.lastVisitAt ? timeAgo(new Date(r.lastVisitAt)) : "Never"}</span>
      ),
    },
    {
      header: "Status",
      render: (r) => <StatusBadge label={r.status} tone={toneForStatus(r.status)} />,
    },
    {
      header: "",
      className: "text-right",
      render: (r) => (
        <Button size="sm" variant="outline" onClick={() => setDetailsId(r.id)}>
          View
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader
        title="Customers"
        description="Registered and special customers — personal discounts apply automatically at the POS when attached."
        actions={
          canManage ? (
            <Button
              className="bg-gold-500 font-semibold text-navy-950 hover:bg-gold-400"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <UserPlus className="mr-1.5 h-4 w-4" />
              Register Customer
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="Total customers" value={String(statsQuery.data?.total ?? 0)} hint={`${statsQuery.data?.active ?? 0} active`} />
        <StatCard
          icon={Crown}
          label="Special customers"
          value={String(statsQuery.data?.withDiscount ?? 0)}
          hint="With a personal discount"
          tone="gold"
        />
        <StatCard
          icon={CircleCheck}
          label="Active"
          value={String(statsQuery.data?.active ?? 0)}
          hint="Can be attached at the POS"
        />
        <StatCard
          icon={Banknote}
          label="Lifetime value"
          value={formatCurrency(statsQuery.data?.lifetimeValue ?? 0)}
          hint="Combined spend of all customers"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-no-scan
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search name, phone, code…"
            className="input-lux pl-10"
          />
        </div>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as CustomerStatus | "ALL");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[160px] bg-card">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {CUSTOMER_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <Switch
            checked={withDiscountOnly}
            onCheckedChange={(v) => {
              setWithDiscountOnly(v);
              setPage(1);
            }}
          />
          Special customers only
        </label>
      </div>

      <DataTable<CustomerRow>
        columns={columns}
        data={items}
        loading={listQuery.isLoading}
        keyFn={(r) => r.id}
        emptyTitle="No customers yet"
        emptyDescription="Register your first customer to start tracking visits, spend and personal discounts."
        pagination={{ page, pageSize: 15, total: listQuery.data?.total ?? 0, onPage: setPage }}
      />

      <CustomerFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        customer={editing}
        onSaved={() => void listQuery.refetch()}
      />

      <CustomerDetailsDrawer
        customerId={detailsId}
        open={detailsId != null}
        onClose={() => setDetailsId(null)}
        canManage={canManage}
        onEdit={openEdit}
      />
    </div>
  );
}

import { useState } from "react";
import { UserPlus, Users, CircleCheck, Ban, ShoppingCart, Search } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge, toneForStatus } from "@/components/common/StatusBadge";
import { RoleBadge } from "@/components/common/RoleBadge";
import { UserFormDialog, type EditableStaff } from "@/components/users/UserFormDialog";
import { UserDetailsDrawer } from "@/components/users/UserDetailsDrawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { timeAgo } from "@/lib/format";
import { USER_ROLES, USER_STATUSES, ROLE_LABELS, type UserRole, type UserStatus } from "@contracts/roles";

/**
 * HADRAN FABRICS MALL — staff management (Admin / Super Admin).
 * Accounts, roles, suspension and password resets — every change audited.
 */

interface StaffRow {
  id: number;
  username: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  staffCode: string | null;
  lastLoginAt: string | Date | null;
  createdAt: string | Date;
}

export default function UsersPage() {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<UserRole | "ALL">("ALL");
  const [status, setStatus] = useState<UserStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EditableStaff | null>(null);
  const [detailsId, setDetailsId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const statsQuery = trpc.users.stats.useQuery();
  const listQuery = trpc.users.list.useQuery({
    search: search.trim() || undefined,
    role: role === "ALL" ? undefined : role,
    status: status === "ALL" ? undefined : status,
    page,
    pageSize: 15,
  });

  const items = (listQuery.data?.items ?? []) as StaffRow[];

  const openEdit = async (id: number) => {
    try {
      const { user: u } = await utils.users.byId.fetch({ id });
      setEditing({
        id: u.id,
        fullName: u.fullName,
        username: u.username,
        email: u.email,
        phone: u.phone,
        role: u.role,
        notes: u.notes,
      });
      setDetailsId(null);
      setFormOpen(true);
    } catch {
      void listQuery.refetch();
    }
  };

  const columns: Column<StaffRow>[] = [
    {
      header: "Staff",
      render: (r) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-900 font-display text-xs font-semibold text-gold-400">
            {r.fullName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
          </span>
          <div>
            <p className="font-medium text-foreground">{r.fullName}</p>
            <p className="text-[11px] text-muted-foreground">
              {r.staffCode ?? "—"} • @{r.username}
            </p>
          </div>
        </div>
      ),
    },
    { header: "Role", render: (r) => <RoleBadge role={r.role} /> },
    {
      header: "Contact",
      render: (r) => (
        <div className="text-xs text-muted-foreground">
          {r.email && <p>{r.email}</p>}
          {r.phone && <p>{r.phone}</p>}
          {!r.email && !r.phone && "—"}
        </div>
      ),
    },
    {
      header: "Last login",
      render: (r) => (
        <span className="text-muted-foreground">{r.lastLoginAt ? timeAgo(new Date(r.lastLoginAt)) : "Never"}</span>
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
        title="Staff & Users"
        description="Manage who can access the system and at what level. Permission fine-tuning lives under Permissions."
        actions={
          <Button
            className="bg-gold-500 font-semibold text-navy-950 hover:bg-gold-400"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <UserPlus className="mr-1.5 h-4 w-4" />
            Add Staff
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="Total staff" value={String(statsQuery.data?.total ?? 0)} hint="All accounts" />
        <StatCard icon={CircleCheck} label="Active" value={String(statsQuery.data?.active ?? 0)} hint="Can log in right now" tone="emerald" />
        <StatCard icon={Ban} label="Suspended" value={String(statsQuery.data?.suspended ?? 0)} hint="Blocked from login" tone="red" />
        <StatCard icon={ShoppingCart} label="Sales staff" value={String(statsQuery.data?.salesStaff ?? 0)} hint="POS-only accounts" tone="gold" />
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-no-scan
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search name, username, code…"
            className="input-lux pl-10"
          />
        </div>
        <Select
          value={role}
          onValueChange={(v) => {
            setRole(v as UserRole | "ALL");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[160px] bg-card">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All roles</SelectItem>
            {USER_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as UserStatus | "ALL");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[150px] bg-card">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {USER_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable<StaffRow>
        columns={columns}
        data={items}
        loading={listQuery.isLoading}
        keyFn={(r) => r.id}
        emptyTitle="No staff found"
        emptyDescription="Add your first team member to give them access to the system."
        pagination={{ page, pageSize: 15, total: listQuery.data?.total ?? 0, onPage: setPage }}
      />

      <UserFormDialog open={formOpen} onClose={() => setFormOpen(false)} staff={editing} onSaved={() => void listQuery.refetch()} />

      <UserDetailsDrawer userId={detailsId} open={detailsId != null} onClose={() => setDetailsId(null)} onEdit={openEdit} />
    </div>
  );
}

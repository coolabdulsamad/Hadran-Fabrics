import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import {
  ArrowLeft,
  ArrowRightLeft,
  Banknote,
  Boxes,
  Loader2,
  MapPin,
  Pencil,
  Phone,
  Power,
  ShoppingBag,
  UserPlus,
  Users2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { StatusBadge, toneForStatus } from "@/components/common/StatusBadge";
import { LoadingScreen } from "@/components/common/LoadingScreen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { BRANCH_STATUS_LABELS } from "@contracts/labels";
import { ROLE_LABELS, type UserStatus } from "@contracts/roles";
import type { BranchStatus } from "@contracts/constants";
import { branchStatusTone } from "@/lib/branches";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * HADRAN FABRICS MALL — branch detail page
 * One branch in full: identity & theme editing, activate/deactivate,
 * staff roster with assign/remove, and live stats (stock, monthly sales,
 * monthly expenses, open transfers).
 */

interface BranchRow {
  id: number;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  isMain: boolean;
  themePrimary: string | null;
  themeAccent: string | null;
  status: BranchStatus;
  createdAt: string | Date;
}

interface StaffRow {
  id: number;
  fullName: string;
  username: string;
  role: string;
  status: UserStatus;
  staffCode: string | null;
}

interface EditForm {
  code: string;
  name: string;
  address: string;
  phone: string;
  themePrimary: string;
  themeAccent: string;
}

export default function BranchDetailPage() {
  const { id } = useParams();
  const branchId = Number(id);
  const { hasPermission } = useAuth();
  const canManage = hasPermission("branches.manage");
  const canViewUsers = hasPermission("users.view");

  const detail = trpc.branches.getById.useQuery({ id: branchId }, { enabled: Number.isFinite(branchId), retry: 1 });

  const [editOpen, setEditOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [staffSearch, setStaffSearch] = useState("");
  const [form, setForm] = useState<EditForm | null>(null);

  const branch = detail.data?.branch as BranchRow | undefined;
  const stats = detail.data?.stats;
  const staff = (detail.data?.staff ?? []) as StaffRow[];

  // Staff picker: only search when the dialog is open.
  const staffPicker = trpc.users.list.useQuery(
    { search: staffSearch || undefined, status: "ACTIVE", page: 1, pageSize: 15 },
    { enabled: assignOpen && canViewUsers },
  );
  const pickerItems = useMemo(
    () => (staffPicker.data?.items ?? []).filter((u) => !staff.some((s) => s.id === u.id)),
    [staffPicker.data, staff],
  );

  const updateMutation = trpc.branches.update.useMutation({
    onSuccess: () => {
      toast.success("Branch updated.");
      setEditOpen(false);
      detail.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const statusMutation = trpc.branches.setStatus.useMutation({
    onSuccess: (_r, vars) => {
      toast.success(vars.status === "ACTIVE" ? "Branch activated." : "Branch deactivated.");
      detail.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const assignMutation = trpc.branches.assignStaff.useMutation({
    onSuccess: () => {
      toast.success("Staff assignment updated.");
      detail.refetch();
      staffPicker.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    if (editOpen && branch) {
      setForm({
        code: branch.code,
        name: branch.name,
        address: branch.address ?? "",
        phone: branch.phone ?? "",
        themePrimary: branch.themePrimary ?? "#141B2D",
        themeAccent: branch.themeAccent ?? "#C9A227",
      });
    }
  }, [editOpen, branch]);

  if (detail.isLoading) return <LoadingScreen label="Loading branch…" />;
  if (!branch) {
    return (
      <div className="mx-auto max-w-3xl py-20 text-center">
        <p className="text-lg font-semibold text-navy-900">Branch not found.</p>
        <Link to="/branches" className="mt-2 inline-block text-sm text-gold-700 underline-offset-2 hover:underline">
          Back to branches
        </Link>
      </div>
    );
  }

  const submitEdit = () => {
    if (!form) return;
    updateMutation.mutate({
      id: branch.id,
      data: {
        code: form.code || undefined,
        name: form.name || undefined,
        address: form.address || null,
        phone: form.phone || null,
        themePrimary: form.themePrimary || null,
        themeAccent: form.themeAccent || null,
      },
    });
  };

  const toggleStatus = () => {
    const next = branch.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    if (next === "INACTIVE" && !window.confirm(`Deactivate ${branch.name}? Staff assigned here lose their branch context.`)) return;
    statusMutation.mutate({ id: branch.id, status: next });
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <span
              className="h-6 w-6 rounded-lg border border-border shadow-sm"
              style={{ background: `linear-gradient(135deg, ${branch.themePrimary ?? "#141B2D"}, ${branch.themeAccent ?? "#C9A227"})` }}
            />
            {branch.name}
            <StatusBadge label={BRANCH_STATUS_LABELS[branch.status]} tone={branchStatusTone(branch.status)} />
            {branch.isMain && <StatusBadge label="MAIN" tone="gold" />}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="font-mono">{branch.code}</span>
            {branch.address && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{branch.address}</span>}
            {branch.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{branch.phone}</span>}
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="gap-2">
              <Link to="/branches"><ArrowLeft className="h-4 w-4" />All Branches</Link>
            </Button>
            {canManage && (
              <>
                <Button variant="outline" className="gap-2" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4" />Edit
                </Button>
                {!branch.isMain && (
                  <Button
                    variant="outline"
                    className={cn("gap-2", branch.status === "ACTIVE" ? "text-red-700 hover:text-red-800" : "text-emerald-700 hover:text-emerald-800")}
                    onClick={toggleStatus}
                    disabled={statusMutation.isPending}
                  >
                    <Power className="h-4 w-4" />
                    {branch.status === "ACTIVE" ? "Deactivate" : "Activate"}
                  </Button>
                )}
              </>
            )}
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard icon={Users2} label="Staff" value={formatNumber(stats?.staffCount ?? 0)} hint="Active members" tone="navy" />
        <StatCard icon={Boxes} label="Stocked Products" value={formatNumber(stats?.stockedProducts ?? 0)} hint={`${formatNumber(stats?.stockUnits ?? 0)} units on hand`} tone="gold" />
        <StatCard icon={ShoppingBag} label="Sales This Month" value={formatNumber(stats?.monthSalesCount ?? 0)} hint={formatCurrency(stats?.monthSalesTotal ?? 0)} tone="emerald" />
        <StatCard icon={Banknote} label="Expenses This Month" value={formatCurrency(stats?.monthExpensesTotal ?? 0)} hint="Active expense records" tone="red" />
        <StatCard icon={ArrowRightLeft} label="Open Transfers" value={formatNumber(stats?.openTransfers ?? 0)} hint="Pending / approved / in transit" tone="navy" />
        <StatCard icon={MapPin} label="Registered" value={formatDate(branch.createdAt)} hint="Branch record created" tone="gold" />
      </div>

      {/* Staff roster */}
      <section className="mt-8 rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-navy-900">Staff at this Branch</h2>
            <p className="text-xs text-muted-foreground">{staff.length} assigned — assignment sets each member's home branch.</p>
          </div>
          {canManage && canViewUsers && (
            <Button size="sm" onClick={() => setAssignOpen(true)} className="gap-2 bg-navy-800 text-cream-100 hover:bg-navy-700">
              <UserPlus className="h-4 w-4 text-gold-400" />
              Assign Staff
            </Button>
          )}
        </div>
        {staff.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">No staff assigned to this branch yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {staff.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-800 font-display text-xs font-semibold text-gold-400">
                  {s.fullName.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-navy-900">{s.fullName}</p>
                  <p className="text-xs text-muted-foreground">
                    @{s.username}
                    {s.staffCode ? ` · ${s.staffCode}` : ""}
                  </p>
                </div>
                <StatusBadge label={ROLE_LABELS[s.role as keyof typeof ROLE_LABELS] ?? s.role} tone="navy" />
                <StatusBadge label={s.status} tone={toneForStatus(s.status)} />
                {canManage && (
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Remove from branch"
                    className="h-8 w-8 text-muted-foreground hover:text-red-700"
                    disabled={assignMutation.isPending}
                    onClick={() => assignMutation.mutate({ userId: s.id, branchId: null })}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={(v) => !v && setEditOpen(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-navy-900">Edit Branch</DialogTitle>
            <DialogDescription>{branch.isMain ? "The main branch keeps its MAIN code." : `Editing ${branch.code}.`}</DialogDescription>
          </DialogHeader>
          {form && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="ecode">Code</Label>
                <Input id="ecode" value={form.code} disabled={branch.isMain} onChange={(e) => setForm((f) => f && { ...f, code: e.target.value.toUpperCase() })} className="mt-1.5 font-mono" maxLength={20} />
              </div>
              <div>
                <Label htmlFor="ename">Name</Label>
                <Input id="ename" value={form.name} onChange={(e) => setForm((f) => f && { ...f, name: e.target.value })} className="mt-1.5" maxLength={120} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="eaddr">Address</Label>
                <Input id="eaddr" value={form.address} onChange={(e) => setForm((f) => f && { ...f, address: e.target.value })} className="mt-1.5" maxLength={300} />
              </div>
              <div>
                <Label htmlFor="ephone">Phone</Label>
                <Input id="ephone" value={form.phone} onChange={(e) => setForm((f) => f && { ...f, phone: e.target.value })} className="mt-1.5" maxLength={40} />
              </div>
              <div className="flex gap-4">
                <div>
                  <Label htmlFor="eprim">Primary</Label>
                  <Input id="eprim" type="color" value={form.themePrimary} onChange={(e) => setForm((f) => f && { ...f, themePrimary: e.target.value })} className="mt-1.5 h-9 w-16 cursor-pointer p-1" />
                </div>
                <div>
                  <Label htmlFor="eacc">Accent</Label>
                  <Input id="eacc" type="color" value={form.themeAccent} onChange={(e) => setForm((f) => f && { ...f, themeAccent: e.target.value })} className="mt-1.5 h-9 w-16 cursor-pointer p-1" />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={updateMutation.isPending}>Cancel</Button>
            <Button onClick={submitEdit} disabled={updateMutation.isPending} className="gap-2 bg-navy-800 text-cream-100 hover:bg-navy-700">
              {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign staff dialog */}
      <Dialog open={assignOpen} onOpenChange={(v) => !v && setAssignOpen(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-navy-900">Assign Staff to {branch.name}</DialogTitle>
            <DialogDescription>Pick an active staff member — they move from their current branch.</DialogDescription>
          </DialogHeader>
          <Input placeholder="Search by name, username or staff code…" value={staffSearch} onChange={(e) => setStaffSearch(e.target.value)} />
          <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
            {staffPicker.isLoading ? (
              <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching…
              </p>
            ) : pickerItems.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No matching staff found.</p>
            ) : (
              <ul className="divide-y divide-border">
                {pickerItems.map((u) => (
                  <li key={u.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-navy-900">{u.fullName}</p>
                      <p className="text-xs text-muted-foreground">@{u.username}{u.staffCode ? ` · ${u.staffCode}` : ""}</p>
                    </div>
                    <StatusBadge label={ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] ?? u.role} tone="navy" />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={assignMutation.isPending}
                      onClick={() => assignMutation.mutate({ userId: u.id, branchId: branch.id })}
                    >
                      Assign
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

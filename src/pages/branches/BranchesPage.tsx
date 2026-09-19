import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Building2, Loader2, MapPin, Phone, PlusCircle, Users2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
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
import type { BranchStatus } from "@contracts/constants";
import { branchStatusTone } from "@/lib/branches";
import { formatDate, formatNumber } from "@/lib/format";

/**
 * HADRAN FABRICS MALL — branches page
 * Every physical location of the business: the main mall plus registered
 * sub-branches. Admins register new branches here; everyone with
 * branches.view sees staff counts, themes and status at a glance.
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
  staffCount: number;
  createdAt: string | Date;
}

const EMPTY_FORM = { code: "", name: "", address: "", phone: "", themePrimary: "#141B2D", themeAccent: "#C9A227" };

export default function BranchesPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("branches.manage");

  const list = trpc.branches.list.useQuery(undefined, { retry: 1 });

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const createMutation = trpc.branches.create.useMutation({
    onSuccess: (res) => {
      toast.success(`Branch ${res.code} registered.`);
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      list.refetch();
      navigate(`/branches/${res.branchId}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const branches = (list.data ?? []) as BranchRow[];
  const activeCount = branches.filter((b) => b.status === "ACTIVE").length;
  const staffTotal = branches.reduce((s, b) => s + b.staffCount, 0);

  const submit = () => {
    if (form.code.trim().length < 2 || form.name.trim().length < 2) {
      toast.error("Branch code and name are required (2+ characters).");
      return;
    }
    createMutation.mutate({
      code: form.code,
      name: form.name,
      address: form.address || undefined,
      phone: form.phone || undefined,
      themePrimary: form.themePrimary || undefined,
      themeAccent: form.themeAccent || undefined,
    });
  };

  const columns: Column<BranchRow>[] = [
    {
      header: "Branch",
      render: (b) => (
        <div className="min-w-0">
          <Link to={`/branches/${b.id}`} className="flex items-center gap-2 font-semibold text-navy-900 underline-offset-2 hover:text-gold-700 hover:underline">
            <span
              className="h-3 w-3 shrink-0 rounded-full border border-border"
              style={{ backgroundColor: b.themeAccent ?? "#C9A227" }}
            />
            <span className="truncate">{b.name}</span>
            {b.isMain && <StatusBadge label="MAIN" tone="gold" />}
          </Link>
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{b.code}</p>
        </div>
      ),
    },
    {
      header: "Location",
      render: (b) => (
        <div className="max-w-[240px] text-xs text-muted-foreground">
          {b.address && <p className="flex items-center gap-1 truncate"><MapPin className="h-3 w-3 shrink-0" />{b.address}</p>}
          {b.phone && <p className="flex items-center gap-1"><Phone className="h-3 w-3 shrink-0" />{b.phone}</p>}
          {!b.address && !b.phone && "—"}
        </div>
      ),
    },
    { header: "Staff", className: "text-center", render: (b) => <span className="font-semibold text-navy-900">{b.staffCount}</span> },
    {
      header: "Theme",
      render: (b) => (
        <span className="flex items-center gap-1.5">
          {[b.themePrimary, b.themeAccent].map((c, i) => (
            <span
              key={i}
              title={c ?? "Default"}
              className="h-5 w-5 rounded-md border border-border"
              style={{ backgroundColor: c ?? (i === 0 ? "#141B2D" : "#C9A227") }}
            />
          ))}
        </span>
      ),
    },
    { header: "Status", render: (b) => <StatusBadge label={BRANCH_STATUS_LABELS[b.status]} tone={branchStatusTone(b.status)} /> },
    { header: "Registered", render: (b) => <span className="text-xs text-muted-foreground">{formatDate(b.createdAt)}</span> },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Branches"
        description="Every location of Hadran Fabrics Mall — registration, staff and themes."
        actions={
          canManage && (
            <Button onClick={() => setCreateOpen(true)} className="gap-2 bg-navy-800 text-cream-100 hover:bg-navy-700">
              <PlusCircle className="h-4 w-4 text-gold-400" />
              Register Branch
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard icon={Building2} label="Branches" value={formatNumber(branches.length)} hint="Registered locations" tone="navy" />
        <StatCard icon={MapPin} label="Active" value={formatNumber(activeCount)} hint="Open for business" tone="emerald" />
        <StatCard icon={Users2} label="Staff Assigned" value={formatNumber(staffTotal)} hint="Across all branches" tone="gold" />
        <StatCard icon={Building2} label="Main Branch" value={branches.find((b) => b.isMain)?.name ?? "—"} hint="Head office & warehouse" tone="red" />
      </div>

      <div className="mt-6">
        <DataTable
          columns={columns}
          data={branches}
          loading={list.isLoading}
          keyFn={(b) => b.id}
          emptyTitle="No branches yet"
          emptyDescription="Register your first sub-branch to start moving stock between locations."
        />
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={(v) => !v && setCreateOpen(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-navy-900">Register a Branch</DialogTitle>
            <DialogDescription>A new physical location — its stock starts empty; move stock with a transfer.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="bcode">Code *</Label>
              <Input id="bcode" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="KUBWA-2" className="mt-1.5 font-mono" maxLength={20} />
            </div>
            <div>
              <Label htmlFor="bname">Name *</Label>
              <Input id="bname" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Hadran Supermarket — Gwarinpa" className="mt-1.5" maxLength={120} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="baddr">Address</Label>
              <Input id="baddr" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Plot 12, Gwarinpa Estate…" className="mt-1.5" maxLength={300} />
            </div>
            <div>
              <Label htmlFor="bphone">Phone</Label>
              <Input id="bphone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="0803…" className="mt-1.5" maxLength={40} />
            </div>
            <div className="flex gap-4">
              <div>
                <Label htmlFor="bprim">Primary</Label>
                <Input id="bprim" type="color" value={form.themePrimary} onChange={(e) => setForm((f) => ({ ...f, themePrimary: e.target.value }))} className="mt-1.5 h-9 w-16 cursor-pointer p-1" />
              </div>
              <div>
                <Label htmlFor="bacc">Accent</Label>
                <Input id="bacc" type="color" value={form.themeAccent} onChange={(e) => setForm((f) => ({ ...f, themeAccent: e.target.value }))} className="mt-1.5 h-9 w-16 cursor-pointer p-1" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createMutation.isPending}>Cancel</Button>
            <Button onClick={submit} disabled={createMutation.isPending} className="gap-2 bg-navy-800 text-cream-100 hover:bg-navy-700">
              {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Register
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

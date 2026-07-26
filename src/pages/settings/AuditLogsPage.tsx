import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatCard } from "@/components/common/StatCard";
import { RoleBadge } from "@/components/common/RoleBadge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ScrollText, Activity, Users, Eye, X, ArrowRight, Globe, Monitor } from "lucide-react";
import type { UserRole } from "@contracts/roles";

interface AuditRow {
  id: number;
  actorId: number | null;
  actorName: string;
  actorRole: UserRole;
  action: string;
  entityType: string;
  entityId: string | null;
  description: string;
  ipAddress: string | null;
  createdAt: string | Date;
  hasBefore: boolean;
  hasAfter: boolean;
}

const ACTION_COLORS: Record<string, string> = {
  create: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  delete: "bg-red-500/10 text-red-700 border-red-500/30",
  void: "bg-red-500/10 text-red-700 border-red-500/30",
  suspend: "bg-red-500/10 text-red-700 border-red-500/30",
  login_failed: "bg-red-500/10 text-red-700 border-red-500/30",
  update: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  edit: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  approve: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  reject: "bg-red-500/10 text-red-700 border-red-500/30",
};

function actionBadgeClass(action: string) {
  for (const [k, v] of Object.entries(ACTION_COLORS)) {
    if (action.includes(k)) return v;
  }
  return "bg-navy-500/10 text-navy-700 border-navy-500/30";
}

export default function AuditLogsPage() {
  const [search, setSearch] = useState("");
  const [action, setAction] = useState<string>("");
  const [entityType, setEntityType] = useState<string>("");
  const [actorId, setActorId] = useState<string>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<number | null>(null);

  const statsQ = trpc.audit.stats.useQuery();
  const filtersQ = trpc.audit.filters.useQuery();
  const listQ = trpc.audit.list.useQuery({
    search: search || undefined,
    action: action || undefined,
    entityType: entityType || undefined,
    actorId: actorId ? Number(actorId) : undefined,
    from: from || undefined,
    to: to || undefined,
    page,
    pageSize: 25,
  });

  const hasFilters = !!(search || action || entityType || actorId || from || to);
  const clearFilters = () => {
    setSearch(""); setAction(""); setEntityType(""); setActorId(""); setFrom(""); setTo(""); setPage(1);
  };

  const columns: Column<AuditRow>[] = [
    {
      header: "When",
      className: "w-40",
      render: (r) => (
        <div>
          <p className="text-sm font-medium">{formatDateTime(new Date(r.createdAt))}</p>
          <p className="text-[11px] text-muted-foreground">#{r.id}</p>
        </div>
      ),
    },
    {
      header: "Actor",
      render: (r) => (
        <div className="flex items-center gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{r.actorName}</p>
            <RoleBadge role={r.actorRole} className="mt-0.5" />
          </div>
        </div>
      ),
    },
    {
      header: "Action",
      render: (r) => (
        <div>
          <Badge variant="outline" className={`font-mono text-[11px] ${actionBadgeClass(r.action)}`}>{r.action}</Badge>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {r.entityType}{r.entityId ? ` #${r.entityId}` : ""}
          </p>
        </div>
      ),
    },
    {
      header: "Description",
      render: (r) => <p className="max-w-md text-sm leading-snug">{r.description}</p>,
    },
    {
      header: "",
      className: "w-24 text-right",
      render: (r) => (
        <Button variant="ghost" size="sm" onClick={() => setDetailId(r.id)}>
          <Eye className="mr-1 h-3.5 w-3.5" />
          {(r.hasBefore || r.hasAfter) ? "Diff" : "View"}
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        description="The complete activity trail — who did what, when, and from where. Read-only and tamper-evident."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={ScrollText} label="Total entries" value={statsQ.data?.total?.toLocaleString() ?? "—"} />
        <StatCard icon={Activity} label="Actions today" value={statsQ.data?.today?.toLocaleString() ?? "—"} tone="gold" />
        <StatCard icon={Users} label="Active staff today" value={statsQ.data?.actorsToday?.toLocaleString() ?? "—"} />
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Top actions (7d)</p>
          <div className="mt-2 space-y-1">
            {(statsQ.data?.topActions ?? []).slice(0, 4).map((t) => (
              <div key={t.action} className="flex items-center justify-between text-xs">
                <span className="truncate font-mono">{t.action}</span>
                <span className="ml-2 font-semibold">{t.count}</span>
              </div>
            ))}
            {(statsQ.data?.topActions ?? []).length === 0 && <p className="text-xs text-muted-foreground">No activity yet</p>}
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search description, actor, entity…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-64"
        />
        <Select value={action} onValueChange={(v) => { setAction(v === "__all__" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All actions" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All actions</SelectItem>
            {(filtersQ.data?.actions ?? []).map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={entityType} onValueChange={(v) => { setEntityType(v === "__all__" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All entities" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All entities</SelectItem>
            {(filtersQ.data?.entityTypes ?? []).map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={actorId} onValueChange={(v) => { setActorId(v === "__all__" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All staff" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All staff</SelectItem>
            {(filtersQ.data?.actors ?? []).map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-38" />
        <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-38" />
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 h-3.5 w-3.5" />Clear
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={listQ.data?.rows as AuditRow[] | undefined}
        loading={listQ.isLoading}
        keyFn={(r) => r.id}
        emptyTitle="No audit entries match"
        pagination={{
          page,
          pageSize: 25,
          total: listQ.data?.total ?? 0,
          onPage: setPage,
        }}
      />

      <AuditDetailSheet id={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}

/** Side sheet with the full entry: metadata + before → after JSON diff. */
function AuditDetailSheet({ id, onClose }: { id: number | null; onClose: () => void }) {
  const detailQ = trpc.audit.byId.useQuery({ id: id! }, { enabled: id != null });
  const d = detailQ.data;

  return (
    <Sheet open={id != null} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Audit entry #{id}
            {d && (
              <Badge variant="outline" className={`font-mono text-[11px] ${actionBadgeClass(d.action)}`}>
                {d.action}
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription>{d?.description}</SheetDescription>
        </SheetHeader>

        {d && (
          <ScrollArea className="h-[calc(100vh-8rem)] pr-3">
            <div className="mt-4 space-y-5">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Meta label="Actor" value={`${d.actorName} (${d.actorRole})`} />
                <Meta label="When" value={formatDateTime(new Date(d.createdAt))} />
                <Meta label="Entity" value={`${d.entityType}${d.entityId ? ` #${d.entityId}` : ""}`} />
                <Meta label="IP address" value={d.ipAddress ?? "—"} icon={<Globe className="h-3.5 w-3.5" />} />
              </div>
              {d.userAgent && (
                <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  <Monitor className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="break-all">{d.userAgent}</span>
                </div>
              )}

              <Separator />

              {(d.beforeData || d.afterData) ? (
                <div>
                  <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    Changes <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /> before → after
                  </p>
                  <DiffView before={d.beforeData as Record<string, unknown> | null} after={d.afterData as Record<string, unknown> | null} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">This action did not record a data snapshot.</p>
              )}
            </div>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Meta({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}{label}
      </p>
      <p className="mt-0.5 truncate text-sm font-medium">{value}</p>
    </div>
  );
}

/** Key-by-key before → after comparison. */
function DiffView({ before, after }: { before: Record<string, unknown> | null; after: Record<string, unknown> | null }) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  if (keys.length === 0) return <p className="text-sm text-muted-foreground">Empty snapshot.</p>;
  const fmt = (v: unknown) => (v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

  return (
    <div className="overflow-hidden rounded-lg border border-border text-xs">
      <div className="grid grid-cols-[1fr_1fr_1fr] gap-px bg-border font-semibold">
        <div className="bg-muted px-3 py-2">Field</div>
        <div className="bg-muted px-3 py-2">Before</div>
        <div className="bg-muted px-3 py-2">After</div>
      </div>
      {keys.map((k) => {
        const b = fmt(before?.[k]);
        const a = fmt(after?.[k]);
        const changed = b !== a;
        return (
          <div key={k} className={`grid grid-cols-[1fr_1fr_1fr] gap-px bg-border ${changed ? "" : "opacity-60"}`}>
            <div className={`px-3 py-2 font-medium ${changed ? "bg-gold/10" : "bg-card"}`}>{k}</div>
            <div className={`break-all px-3 py-2 ${changed ? "bg-red-500/5 text-red-700" : "bg-card"}`}>{b}</div>
            <div className={`break-all px-3 py-2 ${changed ? "bg-emerald-500/5 text-emerald-700" : "bg-card"}`}>{a}</div>
          </div>
        );
      })}
    </div>
  );
}

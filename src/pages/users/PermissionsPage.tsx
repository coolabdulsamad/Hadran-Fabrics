import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Users, Crown, Loader2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/layout/PageHeader";
import { RoleBadge } from "@/components/common/RoleBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ROLE_LABELS, type UserRole } from "@contracts/roles";
import { cn } from "@/lib/utils";

/**
 * HADRAN FABRICS MALL — Permission management (Admin / Super Admin).
 * Tab 1: role matrix — what SALES / MANAGER / ADMIN may do (SUPER_ADMIN
 * is hardcoded to everything). Tab 2: per-user overrides that win over
 * the role default. Changes take effect on the user's next request.
 */

const MATRIX_ROLES: Exclude<UserRole, "SUPER_ADMIN">[] = ["SALES", "MANAGER", "ADMIN"];

export default function PermissionsPage() {
  const utils = trpc.useUtils();
  const catalogQuery = trpc.permissions.catalog.useQuery();
  const matrixQuery = trpc.permissions.matrix.useQuery();

  const setRoleMutation = trpc.permissions.setRolePermission.useMutation({
    onSuccess: () => void utils.permissions.matrix.invalidate(),
    onError: (err) => toast.error("Could not update permission.", { description: err.message }),
  });

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader
        title="Permission Management"
        description="Control exactly what each role — and each individual — can do. Super Admin always has full access."
      />

      <Tabs defaultValue="matrix">
        <TabsList className="bg-cream-200/70">
          <TabsTrigger value="matrix" className="gap-1.5">
            <ShieldCheck className="h-4 w-4" />
            Role Matrix
          </TabsTrigger>
          <TabsTrigger value="overrides" className="gap-1.5">
            <Users className="h-4 w-4" />
            User Overrides
          </TabsTrigger>
        </TabsList>

        {/* ------------------------- ROLE MATRIX ------------------------- */}
        <TabsContent value="matrix" className="mt-5 space-y-5">
          {catalogQuery.isLoading || matrixQuery.isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)
          ) : (
            (catalogQuery.data ?? []).map(({ group, items }) => (
              <section key={group} className="card-lux overflow-hidden">
                <header className="flex items-center justify-between border-b border-border bg-cream-200/60 px-5 py-3">
                  <h3 className="font-display text-sm font-semibold text-navy-900">{group}</h3>
                  <div className="hidden grid-cols-3 gap-6 text-[10px] font-bold uppercase tracking-wider text-navy-700 sm:grid">
                    {MATRIX_ROLES.map((r) => (
                      <span key={r} className="w-20 text-center">
                        {ROLE_LABELS[r]}
                      </span>
                    ))}
                  </div>
                </header>
                <ul className="divide-y divide-border">
                  {items.map((p) => (
                    <li key={p.key} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{p.label}</p>
                        <p className="text-xs text-muted-foreground">{p.description}</p>
                      </div>
                      <div className="grid grid-cols-3 gap-6">
                        {MATRIX_ROLES.map((role) => {
                          const allowed = matrixQuery.data?.[role]?.[p.key] ?? false;
                          const busy =
                            setRoleMutation.isPending &&
                            setRoleMutation.variables?.role === role &&
                            setRoleMutation.variables?.permissionKey === p.key;
                          return (
                            <span key={role} className="flex w-20 items-center justify-center gap-1.5">
                              {busy && <Loader2 className="h-3 w-3 animate-spin text-gold-600" />}
                              <Switch
                                checked={allowed}
                                disabled={busy}
                                onCheckedChange={(v) =>
                                  setRoleMutation.mutate({ role, permissionKey: p.key, allowed: v })
                                }
                                aria-label={`${p.label} for ${ROLE_LABELS[role]}`}
                              />
                              <span className="text-[11px] text-muted-foreground sm:hidden">{ROLE_LABELS[role]}</span>
                            </span>
                          );
                        })}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Crown className="h-3.5 w-3.5 text-gold-600" />
            Super Admin bypasses this matrix and always has every permission.
          </p>
        </TabsContent>

        {/* ------------------------ USER OVERRIDES ------------------------ */}
        <TabsContent value="overrides" className="mt-5">
          <UserOverridesPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ============================ overrides panel ============================ */

function UserOverridesPanel() {
  const utils = trpc.useUtils();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  const usersQuery = trpc.permissions.overrideUsers.useQuery();
  const overridesQuery = trpc.permissions.userOverrides.useQuery(
    { userId: selectedUserId! },
    { enabled: selectedUserId != null },
  );
  const catalogQuery = trpc.permissions.catalog.useQuery();

  const setOverrideMutation = trpc.permissions.setUserOverride.useMutation({
    onSuccess: () => {
      void utils.permissions.userOverrides.invalidate();
      void utils.permissions.overrideUsers.invalidate();
    },
    onError: (err) => toast.error("Could not update override.", { description: err.message }),
  });

  const selected = overridesQuery.data;

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      {/* Staff list */}
      <div className="card-lux overflow-hidden">
        <header className="border-b border-border bg-cream-200/60 px-4 py-3">
          <h3 className="font-display text-sm font-semibold text-navy-900">Staff</h3>
        </header>
        <ScrollArea className="max-h-[60vh]">
          {usersQuery.isLoading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {(usersQuery.data ?? []).map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedUserId(u.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors",
                      selectedUserId === u.id ? "bg-gold-500/10" : "hover:bg-muted/50",
                    )}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{u.fullName}</p>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <RoleBadge role={u.role} />
                        {u.status !== "ACTIVE" && (
                          <span className="text-[10px] text-red-600">{u.status.toLowerCase()}</span>
                        )}
                      </div>
                    </div>
                    {u.overrideCount > 0 && (
                      <Badge className="bg-gold-500/15 text-[10px] text-gold-700" variant="outline">
                        {u.overrideCount} override{u.overrideCount === 1 ? "" : "s"}
                      </Badge>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </div>

      {/* Override editor */}
      <div className="min-h-[300px]">
        {!selectedUserId ? (
          <div className="card-lux flex h-full min-h-[300px] flex-col items-center justify-center gap-2 text-muted-foreground">
            <Users className="h-9 w-9" />
            <p className="text-sm">Pick a staff member to tune their personal permissions.</p>
          </div>
        ) : overridesQuery.isLoading || catalogQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : selected ? (
          <div className="space-y-4">
            <div className="card-lux flex flex-wrap items-center justify-between gap-2 px-5 py-3.5">
              <div>
                <p className="font-display text-base font-semibold text-navy-900">{selected.user.fullName}</p>
                <p className="text-xs text-muted-foreground">
                  Overrides win over the {ROLE_LABELS[selected.user.role]} role defaults. Set back to{" "}
                  <em>Inherit</em> to remove one.
                </p>
              </div>
              <RoleBadge role={selected.user.role} />
            </div>

            {(catalogQuery.data ?? []).map(({ group, items }) => (
              <section key={group} className="card-lux overflow-hidden">
                <header className="border-b border-border bg-cream-200/60 px-5 py-2.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-navy-700">{group}</h4>
                </header>
                <ul className="divide-y divide-border">
                  {items.map((p) => {
                    const row = selected.permissions.find((x) => x.key === p.key);
                    const override = row?.override ?? null;
                    const roleDefault = row?.roleDefault ?? false;
                    const busy = setOverrideMutation.isPending && setOverrideMutation.variables?.permissionKey === p.key;
                    return (
                      <li key={p.key} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">{p.label}</p>
                          <p className="text-xs text-muted-foreground">
                            Role default:{" "}
                            <span className={roleDefault ? "font-medium text-emerald-700" : "font-medium text-red-600"}>
                              {roleDefault ? "allowed" : "denied"}
                            </span>
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-gold-600" />}
                          {(
                            [
                              { label: "Inherit", value: null },
                              { label: "Allow", value: true },
                              { label: "Deny", value: false },
                            ] as const
                          ).map((opt) => (
                            <button
                              key={opt.label}
                              type="button"
                              disabled={busy || selected.user.role === "SUPER_ADMIN"}
                              onClick={() =>
                                setOverrideMutation.mutate({ userId: selectedUserId, permissionKey: p.key, allowed: opt.value })
                              }
                              className={cn(
                                "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                                override === opt.value
                                  ? opt.value === true
                                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                                    : opt.value === false
                                      ? "border-red-400 bg-red-50 text-red-700"
                                      : "border-navy-400 bg-navy-900/5 text-navy-800"
                                  : "border-border text-muted-foreground hover:border-gold-500/50",
                                selected.user.role === "SUPER_ADMIN" && "opacity-40",
                              )}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            {selected.user.role === "SUPER_ADMIN" && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Crown className="h-3.5 w-3.5 text-gold-600" />
                Super Admin accounts can't be overridden — they always have full access.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

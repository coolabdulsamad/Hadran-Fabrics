import { Check, ChevronsUpDown, MapPin } from "lucide-react";
import { useBranch } from "@/hooks/use-branch";
import { useAuth } from "@/hooks/use-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * HADRAN FABRICS MALL — branch switcher chip (topbar).
 * Staff with branches.switch pick any ACTIVE branch; everyone else sees a
 * static label of their assigned branch. Switching invalidates every query
 * because lists/ledgers/dashboards are branch-scoped server-side.
 */
export function BranchSwitcher() {
  const { user } = useAuth();
  const { branch, serverBranch, options, canSwitch, switchBranch } = useBranch();

  const active = serverBranch ?? branch;
  const label = active?.name ?? user?.branchName ?? "Main Branch";
  const accent = active?.themeAccent ?? null;

  if (!canSwitch) {
    return (
      <span
        className="hidden items-center gap-1.5 rounded-full border border-navy-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-navy-800 md:inline-flex"
        title={`Your branch: ${label}`}
      >
        <MapPin className="h-3.5 w-3.5" style={accent ? { color: accent } : undefined} />
        <span className="max-w-[130px] truncate">{label}</span>
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="hidden items-center gap-1.5 rounded-full border border-gold-500/40 bg-gold-50 px-3 py-1.5 text-[11px] font-semibold text-navy-800 transition hover:shadow-sm md:inline-flex"
          title="Switch branch"
        >
          <MapPin className="h-3.5 w-3.5" style={accent ? { color: accent } : undefined} />
          <span className="max-w-[130px] truncate">{label}</span>
          <ChevronsUpDown className="h-3 w-3 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Work in branch
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((b) => (
          <DropdownMenuItem
            key={b.id}
            onClick={() => switchBranch(b)}
            className="flex items-center gap-2"
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full border border-border"
              style={{ backgroundColor: b.themeAccent ?? "#C9A227" }}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{b.name}</span>
              <span className="block font-mono text-[10px] text-muted-foreground">{b.code}</span>
            </span>
            {active?.id === b.id && <Check className="h-4 w-4 text-gold-600" />}
          </DropdownMenuItem>
        ))}
        {options.length === 0 && (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">No active branches.</p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Per-branch theme: paints a slim accent strip under the topbar and exposes
 * the branch colours as CSS variables (--branch-primary / --branch-accent)
 * for branch-aware surfaces. The navy/gold palette stays the house style.
 */
export function BranchThemeStrip() {
  const { serverBranch, branch } = useBranch();
  const active = serverBranch ?? branch;
  const accent = active?.themeAccent;
  const primary = active?.themePrimary;

  if (!accent && !primary) return null;
  return (
    <>
      <div
        aria-hidden
        className={cn("h-1 w-full")}
        style={{ background: `linear-gradient(90deg, ${primary ?? "#141B2D"}, ${accent ?? "#C9A227"})` }}
      />
      <style>{`:root { --branch-primary: ${primary ?? "#141B2D"}; --branch-accent: ${accent ?? "#C9A227"}; }`}</style>
    </>
  );
}

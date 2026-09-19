import { useLocation, useNavigate } from "react-router";
import { Menu, MapPin, ArrowLeftRight, ShoppingBag, WashingMachine, Scissors, type LucideIcon } from "lucide-react";
import { pageTitleFor } from "@/config/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useSection } from "@/hooks/use-section";
import { useBranch } from "@/hooks/use-branch";
import { SECTION_LABELS, type Section } from "@contracts/constants";
import { NotificationBell } from "./NotificationBell";
import { UserMenu } from "./UserMenu";
import { BranchSwitcher } from "./BranchSwitcher";
import { cn } from "@/lib/utils";

const SECTION_ICONS: Record<Section, LucideIcon> = {
  SALES: ShoppingBag,
  LAUNDRY: WashingMachine,
  TAILORING: Scissors,
};

const SECTION_CHIP: Record<Section, string> = {
  SALES: "border-gold-500/40 bg-gold-50 text-gold-700",
  LAUNDRY: "border-cyan-500/40 bg-cyan-50 text-cyan-700",
  TAILORING: "border-violet-500/40 bg-violet-50 text-violet-700",
};

/** Sticky topbar: mobile menu button, page title, section + branch, notifications, user menu. */
export function Topbar({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { section, canSwitch } = useSection();
  const { serverBranch, branch } = useBranch();
  const activeBranchName = (serverBranch ?? branch)?.name ?? user?.branchName ?? "Main Branch";
  const title = pageTitleFor(location.pathname);

  const SectionIcon = SECTION_ICONS[section];

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-cream-50/90 px-4 backdrop-blur md:px-6">
      <button
        onClick={onOpenSidebar}
        className="rounded-lg p-2 text-navy-700 transition hover:bg-gold-100 lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="min-w-0">
        <h1 className="truncate font-display text-lg font-bold text-navy-900">{title}</h1>
        <p className="hidden items-center gap-1.5 text-[11px] uppercase tracking-[0.25em] text-gold-600 sm:flex">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{activeBranchName}</span>
        </p>
      </div>

      {/* Active section chip — doubles as the section switcher */}
      <button
        onClick={() => canSwitch && navigate("/sections")}
        disabled={!canSwitch}
        title={canSwitch ? "Switch section" : `Your section: ${SECTION_LABELS[section]}`}
        className={cn(
          "ml-1 hidden shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition sm:inline-flex",
          SECTION_CHIP[section],
          canSwitch && "hover:shadow-sm",
        )}
      >
        <SectionIcon className="h-3.5 w-3.5" />
        <span className="max-w-[120px] truncate">{SECTION_LABELS[section]}</span>
        {canSwitch && <ArrowLeftRight className="h-3 w-3 opacity-70" />}
      </button>

      {/* Active branch chip — doubles as the branch switcher */}
      <BranchSwitcher />

      <div className="ml-auto flex items-center gap-1.5">
        <NotificationBell />
        <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
        <UserMenu />
      </div>
    </header>
  );
}

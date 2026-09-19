import { useNavigate } from "react-router";
import {
  ShoppingBag,
  WashingMachine,
  Scissors,
  Lock,
  ArrowRight,
  MapPin,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSection } from "@/hooks/use-section";
import { UserMenu } from "@/components/layout/UserMenu";
import { SECTION_DESCRIPTIONS, SECTION_HOME, SECTION_LABELS, SECTIONS, type Section } from "@contracts/constants";
import { APP_MOTTO, APP_TAGLINE } from "@/config/constants";
import { cn } from "@/lib/utils";

/**
 * HADRAN FABRICS MALL — section picker
 * The gateway shown after login (for roles that can work in more than
 * one section): pick Sales & Inventory, Laundry or Tailoring.
 */

const SECTION_META: Record<
  Section,
  { icon: LucideIcon; accent: string; ring: string; chip: string; glow: string }
> = {
  SALES: {
    icon: ShoppingBag,
    accent: "text-gold-600",
    ring: "hover:border-gold-500/60",
    chip: "bg-gold-100 text-gold-700",
    glow: "from-gold-500/15",
  },
  LAUNDRY: {
    icon: WashingMachine,
    accent: "text-cyan-600",
    ring: "hover:border-cyan-500/60",
    chip: "bg-cyan-100 text-cyan-700",
    glow: "from-cyan-500/15",
  },
  TAILORING: {
    icon: Scissors,
    accent: "text-violet-600",
    ring: "hover:border-violet-500/60",
    chip: "bg-violet-100 text-violet-700",
    glow: "from-violet-500/15",
  },
};

export default function SectionPickerPage() {
  const { user } = useAuth();
  const { allowed, setSection } = useSection();
  const navigate = useNavigate();

  if (!user) return null; // route is guarded by RequireAuth

  const enter = (section: Section) => {
    setSection(section);
    navigate(SECTION_HOME[section]);
  };

  return (
    <div className="flex min-h-screen flex-col bg-cream-100">
      {/* Minimal header — brand + signed-in staff */}
      <header className="flex h-16 items-center justify-between border-b border-border bg-cream-50/90 px-4 backdrop-blur md:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-gold-500/60 bg-navy-800">
            <Scissors className="h-4 w-4 text-gold-400" />
          </div>
          <div>
            <p className="font-display text-sm font-bold tracking-wide text-navy-900">
              HADRAN FABRICS MALL
            </p>
            <p className="text-[9px] uppercase tracking-[0.3em] text-gold-600">{APP_TAGLINE}</p>
          </div>
        </div>
        <UserMenu />
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-4 py-10 md:px-8">
        <div className="text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-gold-500/40 bg-gold-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.25em] text-gold-700">
            <Sparkles className="h-3.5 w-3.5" />
            Welcome, {user.fullName.split(" ")[0]}
          </p>
          <h1 className="mt-5 font-display text-3xl font-bold text-navy-900 md:text-4xl">
            Where are you working today?
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
            Choose a section to open its workspace. Your menus, dashboards and reports will
            follow the section you pick.
          </p>
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-navy-600">
            <MapPin className="h-3.5 w-3.5 text-gold-600" />
            {user.branchName ?? "Main Branch"}
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((section) => {
            const meta = SECTION_META[section];
            const Icon = meta.icon;
            const isAllowed = allowed.includes(section);

            return (
              <button
                key={section}
                disabled={!isAllowed}
                onClick={() => enter(section)}
                className={cn(
                  "card-lux group relative overflow-hidden p-7 text-left transition",
                  isAllowed
                    ? cn("cursor-pointer hover:-translate-y-0.5 hover:shadow-lg", meta.ring)
                    : "cursor-not-allowed opacity-55",
                )}
              >
                <div
                  className={cn(
                    "pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b to-transparent",
                    meta.glow,
                  )}
                />
                <div className="relative">
                  <div className="flex items-start justify-between">
                    <div
                      className={cn(
                        "flex h-14 w-14 items-center justify-center rounded-2xl",
                        meta.chip,
                      )}
                    >
                      <Icon className="h-7 w-7" />
                    </div>
                    {!isAllowed && <Lock className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <h2 className="mt-5 font-display text-xl font-bold text-navy-900">
                    {SECTION_LABELS[section]}
                  </h2>
                  <p className="mt-2 min-h-[3.75rem] text-sm leading-relaxed text-muted-foreground">
                    {SECTION_DESCRIPTIONS[section]}
                  </p>
                  <p
                    className={cn(
                      "mt-5 inline-flex items-center gap-1.5 text-sm font-semibold",
                      isAllowed ? meta.accent : "text-muted-foreground",
                    )}
                  >
                    {isAllowed ? (
                      <>
                        Open workspace
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </>
                    ) : (
                      "Not available for your role"
                    )}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        <p className="mt-10 text-center text-[11px] italic text-muted-foreground">{APP_MOTTO}</p>
      </main>
    </div>
  );
}

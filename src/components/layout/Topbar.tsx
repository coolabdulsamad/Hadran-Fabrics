import { useLocation } from "react-router";
import { Menu } from "lucide-react";
import { pageTitleFor } from "@/config/navigation";
import { NotificationBell } from "./NotificationBell";
import { UserMenu } from "./UserMenu";

/** Sticky topbar: mobile menu button, page title, notifications, user menu. */
export function Topbar({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const location = useLocation();
  const title = pageTitleFor(location.pathname);

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
        <p className="hidden text-[11px] uppercase tracking-[0.25em] text-gold-600 sm:block">
          Hadran Fabrics Mall
        </p>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <NotificationBell />
        <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
        <UserMenu />
      </div>
    </header>
  );
}

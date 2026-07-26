import { NavLink } from "react-router";
import { Scissors, X, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { visibleSections } from "@/config/navigation";
import { APP_MOTTO } from "@/config/constants";
import { cn } from "@/lib/utils";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

/** Navy + gold sidebar. Nav items are filtered by the user's effective permissions. Collapsible on desktop. */
export function Sidebar({ open, onClose, collapsed, onToggleCollapse }: SidebarProps) {
  const { permissions } = useAuth();
  const sections = visibleSections(permissions);

  const nav = (isCollapsed: boolean) => (
    <nav className="flex h-full flex-col">
      {/* Brand */}
      <div className={cn("flex items-center gap-3 border-b border-navy-700/60 py-5", isCollapsed ? "justify-center px-2" : "px-5")}>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-gold-500/60 bg-navy-800" title="Hadran Fabrics Mall">
          <Scissors className="h-4.5 w-4.5 text-gold-400" />
        </div>
        {!isCollapsed && (
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-bold tracking-wide text-cream-100">
              HADRAN FABRICS MALL
            </p>
            <p className="text-[9px] uppercase tracking-[0.3em] text-gold-500">Management Suite</p>
          </div>
        )}
        <button
          onClick={onClose}
          className="ml-auto rounded-md p-1 text-cream-300/70 hover:bg-navy-800 hover:text-gold-400 lg:hidden"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Nav sections */}
      <div className={cn("scrollbar-lux flex-1 overflow-y-auto py-4", isCollapsed ? "px-2" : "px-3")}>
        {sections.map((section) => (
          <div key={section.title} className="mb-5">
            {isCollapsed ? (
              <div className="mx-auto mb-1.5 h-px w-8 bg-navy-700/80" />
            ) : (
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.25em] text-gold-500/80">
                {section.title}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    onClick={onClose}
                    title={isCollapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        "group flex items-center rounded-lg border-l-2 text-sm transition",
                        isCollapsed ? "justify-center gap-0 px-2 py-2.5" : "gap-3 px-3 py-2",
                        isActive
                          ? "border-gold-400 bg-navy-800 font-semibold text-gold-300"
                          : "border-transparent text-cream-300/75 hover:bg-navy-800/60 hover:text-cream-100",
                      )
                    }
                  >
                    <item.icon className="h-4 w-4 shrink-0 opacity-80 transition group-hover:opacity-100" />
                    {!isCollapsed && <span className="truncate">{item.label}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Collapse toggle (desktop only) */}
      <div className={cn("hidden border-t border-navy-700/60 py-3 lg:block", isCollapsed ? "px-2" : "px-5")}>
        <button
          onClick={onToggleCollapse}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-cream-300/70 transition hover:bg-navy-800 hover:text-gold-300",
            isCollapsed && "justify-center",
          )}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {!isCollapsed && <span>Collapse sidebar</span>}
        </button>
      </div>

      {/* Footer */}
      {!isCollapsed && (
        <div className="border-t border-navy-700/60 px-5 py-4">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-gold-500/50 to-transparent" />
          <p className="mt-3 text-center text-[10px] italic text-cream-300/50">{APP_MOTTO}</p>
        </div>
      )}
    </nav>
  );

  return (
    <>
      {/* Desktop */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden bg-navy-900 transition-[width] duration-200 lg:block",
          collapsed ? "w-[76px]" : "w-[260px]",
        )}
      >
        {nav(collapsed)}
      </aside>

      {/* Mobile slide-over */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-navy-950/60 backdrop-blur-sm transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[280px] bg-navy-900 shadow-2xl transition-transform lg:hidden",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {nav(false)}
      </aside>
    </>
  );
}

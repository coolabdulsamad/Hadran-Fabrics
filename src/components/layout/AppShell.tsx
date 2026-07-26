import { useState } from "react";
import { Outlet } from "react-router";
import { useAppSounds } from "@/hooks/use-app-sounds";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

/**
 * The authenticated workspace frame:
 * navy/gold sidebar (permission-filtered) + topbar + routed page content.
 */
export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== "undefined" && localStorage.getItem("hadran.sidebar.collapsed") === "1",
  );
  // Global sounds: new chat messages + notifications, on every page.
  useAppSounds(true);

  const toggleCollapse = () => {
    setCollapsed((c) => {
      localStorage.setItem("hadran.sidebar.collapsed", c ? "0" : "1");
      return !c;
    });
  };

  return (
    <div className="min-h-screen bg-cream-100">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
      />

      <div
        className={`flex min-h-screen flex-col transition-[padding] duration-200 ${
          collapsed ? "lg:pl-[76px]" : "lg:pl-[260px]"
        }`}
      >
        <Topbar onOpenSidebar={() => setSidebarOpen(true)} />

        <main className="flex-1 px-4 py-6 md:px-6 lg:px-8">
          <Outlet />
        </main>

        <footer className="border-t border-border px-6 py-4 text-center">
          <p className="text-[11px] text-muted-foreground">
            Hadran Fabrics Mall — Management Suite ·{" "}
            <span className="italic">Luxury in every visit.</span>
          </p>
        </footer>
      </div>
    </div>
  );
}

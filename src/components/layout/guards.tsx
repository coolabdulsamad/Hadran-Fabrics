import { useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { useSection } from "@/hooks/use-section";
import { useSectionStore } from "@/store/section-store";
import { LoadingScreen } from "@/components/common/LoadingScreen";
import { ForbiddenPage } from "@/pages/errors/ForbiddenPage";
import type { Section } from "@contracts/constants";

/**
 * Route guards:
 *   <RequireAuth>       → must be logged in (else → /login, with return path)
 *   <RequirePermission> → must hold a permission key (else → 403 page)
 */

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <LoadingScreen label="Restoring your session…" />;
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}

export function RequirePermission({
  permission,
  anyOf,
  children,
}: {
  permission?: string;
  anyOf?: string[];
  children: ReactNode;
}) {
  const { hasPermission, hasAnyPermission, isLoading } = useAuth();

  if (isLoading) return <LoadingScreen />;

  const allowed =
    (permission ? hasPermission(permission) : true) &&
    (anyOf && anyOf.length > 0 ? hasAnyPermission(...anyOf) : true);

  if (!allowed) return <ForbiddenPage />;
  return <>{children}</>;
}

/**
 * Section guard for laundry/tailoring workspaces:
 * the role must be allowed in that section (else 403), and entering the
 * route switches the active section so menus/header follow along.
 */
export function RequireSection({ section, children }: { section: Section; children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const { allowed, section: active } = useSection();
  const setSection = useSectionStore((s) => s.setSection);

  useEffect(() => {
    if (active !== section && allowed.includes(section)) setSection(section);
  }, [active, section, allowed, setSection]);

  if (isLoading || !user) return <LoadingScreen />;
  if (!allowed.includes(section)) return <ForbiddenPage />;
  return <>{children}</>;
}

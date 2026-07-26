import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { LoadingScreen } from "@/components/common/LoadingScreen";
import { ForbiddenPage } from "@/pages/errors/ForbiddenPage";

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

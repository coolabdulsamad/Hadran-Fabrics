import { useAuthContext } from "@/providers/auth-provider";

/**
 * Permission helpers bound to the current user:
 *   const { can, canAny } = usePermissions();
 *   can("products.edit") // boolean
 */
export function usePermissions() {
  const { hasPermission, hasAnyPermission, permissions } = useAuthContext();
  return { can: hasPermission, canAny: hasAnyPermission, permissions };
}

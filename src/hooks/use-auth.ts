import { useAuthContext } from "@/providers/auth-provider";

/**
 * Access the current staff session anywhere in the app:
 *   const { user, isAuthenticated, login, logout } = useAuth();
 */
export function useAuth() {
  return useAuthContext();
}

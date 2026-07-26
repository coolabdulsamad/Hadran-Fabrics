import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { trpc } from "./trpc";
import type { UserRole } from "@contracts/roles";

/**
 * HADRAN FABRICS MALL — auth provider
 * Holds the logged-in staff member + effective permissions,
 * exposes login/logout and permission checks to the whole app.
 */

export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  status: "ACTIVE" | "SUSPENDED";
  avatarUrl: string | null;
  staffCode: string | null;
  createdAt: string | Date;
  lastLoginAt: string | Date | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  permissions: ReadonlySet<string>;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (key: string) => boolean;
  hasAnyPermission: (...keys: string[]) => boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const utils = trpc.useUtils();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
    },
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      await utils.invalidate();
    },
    onSettled: async () => {
      await utils.auth.me.invalidate();
    },
  });

  const user = (meQuery.data?.user ?? null) as AuthUser | null;

  const permissions = useMemo<ReadonlySet<string>>(
    () => new Set(meQuery.data?.permissions ?? []),
    [meQuery.data],
  );

  const login = useCallback(
    async (username: string, password: string) => {
      await loginMutation.mutateAsync({ username, password });
    },
    [loginMutation],
  );

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch {
      // Even if the server call fails, clear local state.
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, utils]);

  const hasPermission = useCallback((key: string) => permissions.has(key), [permissions]);
  const hasAnyPermission = useCallback(
    (...keys: string[]) => keys.some((k) => permissions.has(k)),
    [permissions],
  );

  const refresh = useCallback(async () => {
    await utils.auth.me.invalidate();
  }, [utils]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      permissions,
      isLoading: meQuery.isLoading,
      isAuthenticated: !!user,
      login,
      logout,
      hasPermission,
      hasAnyPermission,
      refresh,
    }),
    [user, permissions, meQuery.isLoading, login, logout, hasPermission, hasAnyPermission, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be used inside <AuthProvider>");
  return ctx;
}

/**
 * HADRAN FABRICS MALL — Staff roles (shared frontend ↔ backend)
 * Hierarchy: SALES < MANAGER < ADMIN < SUPER_ADMIN
 */
export const USER_ROLES = ["SALES", "MANAGER", "ADMIN", "SUPER_ADMIN"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  SALES: "Sales Staff",
  MANAGER: "Manager",
  ADMIN: "Admin",
  SUPER_ADMIN: "Super Admin",
};

/** Higher rank inherits everything below it (unless a permission override says otherwise). */
export const ROLE_RANK: Record<UserRole, number> = {
  SALES: 1,
  MANAGER: 2,
  ADMIN: 3,
  SUPER_ADMIN: 4,
};

export const USER_STATUSES = ["ACTIVE", "SUSPENDED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

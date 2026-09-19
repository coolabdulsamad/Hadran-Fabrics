/**
 * HADRAN FABRICS MALL — Staff roles (shared frontend ↔ backend)
 * Section staff (SALES / LAUNDRY / TAILORING) work inside their own section.
 * Elevated roles (MANAGER / ADMIN / SUPER_ADMIN) can work across sections & branches.
 */
import type { Section } from "./constants";

export const USER_ROLES = ["SALES", "LAUNDRY", "TAILORING", "MANAGER", "ADMIN", "SUPER_ADMIN"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  SALES: "Sales Staff",
  LAUNDRY: "Laundry Staff",
  TAILORING: "Tailoring Staff",
  MANAGER: "Manager",
  ADMIN: "Admin",
  SUPER_ADMIN: "Super Admin",
};

/** Higher rank inherits everything below it (unless a permission override says otherwise). */
export const ROLE_RANK: Record<UserRole, number> = {
  SALES: 1,
  LAUNDRY: 1,
  TAILORING: 1,
  MANAGER: 2,
  ADMIN: 3,
  SUPER_ADMIN: 4,
};

/** The business section a staff role belongs to by default. */
export const ROLE_HOME_SECTION: Record<UserRole, Section> = {
  SALES: "SALES",
  LAUNDRY: "LAUNDRY",
  TAILORING: "TAILORING",
  MANAGER: "SALES",
  ADMIN: "SALES",
  SUPER_ADMIN: "SALES",
};

/**
 * Which sections each role may enter. Section staff are locked to their own
 * section; elevated roles can move between all three.
 */
export const ROLE_SECTIONS: Record<UserRole, Section[]> = {
  SALES: ["SALES"],
  LAUNDRY: ["LAUNDRY"],
  TAILORING: ["TAILORING"],
  MANAGER: ["SALES", "LAUNDRY", "TAILORING"],
  ADMIN: ["SALES", "LAUNDRY", "TAILORING"],
  SUPER_ADMIN: ["SALES", "LAUNDRY", "TAILORING"],
};

export const USER_STATUSES = ["ACTIVE", "SUSPENDED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

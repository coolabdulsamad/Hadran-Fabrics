import type { UserRole } from "@contracts/roles";

/**
 * HADRAN FABRICS MALL — frontend app constants
 */

export const APP_NAME = "Hadran Fabrics Mall";
export const APP_SUITE = "Management Suite";
export const APP_TAGLINE = "SHOP. DISCOVER. INDULGE.";
export const APP_MOTTO = "Luxury in every visit.";
export const APP_ADDRESS =
  "Hadran Mall, Opposite Daughters of Charity Hospital, F01 New Market Kubwa";

/** Role badge styling across the app. */
export const ROLE_STYLES: Record<UserRole, { badge: string; dot: string }> = {
  SALES: { badge: "bg-sky-100 text-sky-800 border-sky-200", dot: "bg-sky-500" },
  MANAGER: { badge: "bg-emerald-100 text-emerald-800 border-emerald-200", dot: "bg-emerald-500" },
  ADMIN: { badge: "bg-gold-100 text-gold-800 border-gold-300", dot: "bg-gold-500" },
  SUPER_ADMIN: { badge: "bg-navy-100 text-navy-800 border-navy-200", dot: "bg-navy-700" },
};

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Section } from "@contracts/constants";
import { SECTION_HOME } from "@contracts/constants";
import { ROLE_HOME_SECTION, ROLE_SECTIONS, type UserRole } from "@contracts/roles";

/**
 * HADRAN FABRICS MALL — active section store (zustand, persisted)
 * Tracks which business section the staff member is working in
 * (Sales & Inventory / Laundry / Tailoring). Sidebar, header and
 * routing all follow this. The choice survives reloads, but is always
 * re-validated against the role's allowed sections.
 */

interface SectionState {
  section: Section;
  setSection: (section: Section) => void;
}

export const useSectionStore = create<SectionState>()(
  persist(
    (set) => ({
      section: "SALES",
      setSection: (section) => set({ section }),
    }),
    { name: "hadran.section" },
  ),
);

/** Sections a role may enter (contract re-export for convenience). */
export function allowedSections(role: UserRole): Section[] {
  return ROLE_SECTIONS[role] ?? ["SALES"];
}

/**
 * Resolve the effective section for a role: the persisted choice when the
 * role is allowed there, otherwise the role's home section.
 */
export function resolveSection(role: UserRole, persisted: Section): Section {
  const allowed = allowedSections(role);
  return allowed.includes(persisted) ? persisted : ROLE_HOME_SECTION[role];
}

/** Home route of a section. */
export function sectionHome(section: Section): string {
  return SECTION_HOME[section];
}

/** The route a freshly logged-in user of this role should land on. */
export function landingRouteFor(role: UserRole): string {
  const allowed = allowedSections(role);
  // Single-section staff go straight into their workspace; multi-section
  // staff pick a section first.
  return allowed.length === 1 ? SECTION_HOME[allowed[0]] : "/sections";
}

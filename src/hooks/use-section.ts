import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  allowedSections,
  resolveSection,
  useSectionStore,
} from "@/store/section-store";
import type { Section } from "@contracts/constants";

/**
 * The section the current staff member is working in.
 * Validates the persisted choice against the role's allowed sections and
 * keeps the store corrected when the role changes (e.g. re-login).
 */
export function useSection() {
  const { user } = useAuth();
  const stored = useSectionStore((s) => s.section);
  const setSection = useSectionStore((s) => s.setSection);

  const section: Section = user ? resolveSection(user.role, stored) : "SALES";
  const allowed = user ? allowedSections(user.role) : (["SALES"] as Section[]);
  const canSwitch = allowed.length > 1;

  useEffect(() => {
    if (section !== stored) setSection(section);
  }, [section, stored, setSection]);

  return { section, setSection, allowed, canSwitch };
}

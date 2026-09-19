import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * HADRAN FABRICS MALL — active branch store (zustand, persisted)
 * Which branch the staff member is currently working in. Mirrored to the
 * server on every API call via the x-hfm-branch header; the server
 * validates the pick (branches.switch permission + ACTIVE branch) and
 * the client re-syncs from branches.myContext when they drift.
 *
 * `lastSwitchAt` is shared across every useBranch() consumer: responses
 * fetched BEFORE the user's latest manual switch describe the old branch
 * and must not trigger a re-sync revert.
 */

export interface ActiveBranch {
  id: number;
  code: string;
  name: string;
  isMain: boolean;
  themePrimary: string | null;
  themeAccent: string | null;
}

interface BranchState {
  branch: ActiveBranch | null;
  lastSwitchAt: number;
  setBranch: (branch: ActiveBranch) => void;
  markSwitch: () => void;
}

export const useBranchStore = create<BranchState>()(
  persist(
    (set) => ({
      branch: null,
      lastSwitchAt: 0,
      setBranch: (branch) => set({ branch }),
      markSwitch: () => set({ lastSwitchAt: Date.now() }),
    }),
    {
      name: "hadran.branch",
      // Persist only the pick — the switch timestamp is session-scoped.
      partialize: (state) => ({ branch: state.branch }) as BranchState,
    },
  ),
);

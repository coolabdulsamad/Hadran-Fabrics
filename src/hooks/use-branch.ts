import { useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/use-auth";
import { useBranchStore, type ActiveBranch } from "@/store/branch-store";

/**
 * HADRAN FABRICS MALL — active branch hook.
 * Source of truth is the server (branches.myContext resolves the request's
 * branch from the x-hfm-branch header + the user's permissions); the
 * persisted store is just the client's pick. When they drift — e.g. a
 * stored branch got deactivated — the server wins and the store re-syncs.
 */
export function useBranch() {
  const { user } = useAuth();
  const stored = useBranchStore((s) => s.branch);
  const setBranch = useBranchStore((s) => s.setBranch);
  const markSwitch = useBranchStore((s) => s.markSwitch);
  const lastSwitchAt = useBranchStore((s) => s.lastSwitchAt);
  const utils = trpc.useUtils();

  const ctxQuery = trpc.branches.myContext.useQuery(undefined, {
    retry: 1,
    enabled: !!user,
    staleTime: 60_000,
  });

  const serverBranch = ctxQuery.data?.activeBranch ?? null;
  const canSwitch = ctxQuery.data?.canSwitch ?? false;
  const options = (ctxQuery.data?.options ?? []) as (ActiveBranch & { status: string })[];

  // Re-sync the persisted pick with what the server actually resolved.
  // Responses fetched before the user's latest manual switch describe the
  // OLD branch — ignore them (the timestamp is shared across every
  // useBranch consumer, so one switch guards all re-sync effects).
  useEffect(() => {
    if (!ctxQuery.data) return;
    if (ctxQuery.dataUpdatedAt < lastSwitchAt) return; // pre-switch response — stale
    if (serverBranch && stored?.id !== serverBranch.id) {
      setBranch({
        id: serverBranch.id,
        code: serverBranch.code,
        name: serverBranch.name,
        isMain: serverBranch.isMain,
        themePrimary: serverBranch.themePrimary,
        themeAccent: serverBranch.themeAccent,
      });
    }
  }, [ctxQuery.data, ctxQuery.dataUpdatedAt, lastSwitchAt, serverBranch, stored?.id, setBranch]);

  const switchBranch = (branch: ActiveBranch) => {
    if (!canSwitch) return;
    markSwitch();
    setBranch(branch);
    // Every scoped query depends on the branch header — refetch everything.
    void utils.invalidate();
  };

  return {
    branch: stored,
    serverBranch,
    options,
    canSwitch,
    isLoading: ctxQuery.isLoading,
    switchBranch,
  };
}

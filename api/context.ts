import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { readSessionCookie, resolveSession, type SessionUser } from "./services/auth.service";
import { resolveActiveBranch, type BranchOption } from "./services/branch.service";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  /** Authenticated staff member (null when logged out). */
  user: SessionUser | null;
  /** Effective permission keys for the current user. */
  permissions: Set<string>;
  /** Raw session token (needed for logout). */
  sessionToken: string | null;
  /**
   * Branch this request acts on. Defaults to the user's assigned branch
   * (or MAIN when unassigned); staff with branches.switch may override it
   * per-request via the x-hfm-branch header. null when logged out.
   */
  activeBranch: BranchOption | null;
  /** Convenience: activeBranch?.id ?? null */
  activeBranchId: number | null;
};

/** Header the frontend sets to the branch it wants to work in. */
export const BRANCH_HEADER = "x-hfm-branch";

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  const token = readSessionCookie(opts.req);

  let user: SessionUser | null = null;
  let permissions = new Set<string>();

  if (token) {
    const resolved = await resolveSession(token);
    if (resolved) {
      user = resolved.user;
      permissions = new Set(resolved.permissions);
    }
  }

  let activeBranch: BranchOption | null = null;
  if (user) {
    const raw = opts.req.headers.get(BRANCH_HEADER);
    const requested = raw && /^\d+$/.test(raw) ? Number(raw) : null;
    activeBranch = await resolveActiveBranch(
      user.branchId ?? null,
      permissions.has("branches.switch"),
      requested,
    );
  }

  return {
    req: opts.req,
    resHeaders: opts.resHeaders,
    user,
    permissions,
    sessionToken: token,
    activeBranch,
    activeBranchId: activeBranch?.id ?? null,
  };
}

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter } from "../middleware";
import { authedProcedure, permissionProcedure } from "../trpc";
import { getDb } from "../queries/connection";
import { branches } from "@db/schema";
import { desc, eq } from "drizzle-orm";
import {
  assignStaffToBranch,
  branchStaff,
  branchStock,
  createBranch,
  getBranchDetails,
  listBranches,
  setBranchStatus,
  updateBranch,
  type BranchOption,
} from "../services/branch.service";
import { logAudit, requestMeta } from "../services/audit.service";
import { BRANCH_STATUSES } from "@contracts/constants";

/**
 * HADRAN FABRICS MALL — branches router
 * Branch registration & configuration (admin), per-branch stock lookup
 * (transfer picker), staff assignment, and the active-branch context the
 * frontend switcher syncs against.
 */

const themeColor = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Use a hex colour like #C9A227")
  .nullish();

const branchInput = z.object({
  code: z.string().min(2).max(20),
  name: z.string().min(2).max(120),
  address: z.string().max(300).nullish(),
  phone: z.string().max(40).nullish(),
  themePrimary: themeColor,
  themeAccent: themeColor,
});

export const branchesRouter = createRouter({
  /**
   * Active-branch context for the client: the server-resolved branch this
   * session is acting on + the branches the user may switch to. The client
   * re-syncs its persisted store from this (falls back gracefully when a
   * stored pick is no longer valid).
   */
  myContext: authedProcedure.query(async ({ ctx }) => {
    const canSwitch = ctx.permissions.has("branches.switch");
    let options: BranchOption[] = [];
    if (canSwitch) {
      const db = getDb();
      const rows = await db
        .select({
          id: branches.id,
          code: branches.code,
          name: branches.name,
          isMain: branches.isMain,
          status: branches.status,
          themePrimary: branches.themePrimary,
          themeAccent: branches.themeAccent,
        })
        .from(branches)
        .where(eq(branches.status, "ACTIVE"))
        .orderBy(desc(branches.isMain), branches.name);
      options = rows as BranchOption[];
    }
    return {
      activeBranch: ctx.activeBranch,
      canSwitch,
      options,
    };
  }),

  list: permissionProcedure("branches.view").query(async () => listBranches()),

  getById: permissionProcedure("branches.view")
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const details = await getBranchDetails(input.id);
      const staff = await branchStaff(input.id);
      return { ...details, staff };
    }),

  /** Products + their stock level at one branch (transfer item picker). */
  stockAt: permissionProcedure("transfers.view")
    .input(z.object({ branchId: z.number().int().positive(), search: z.string().max(120).optional() }))
    .query(async ({ input }) => branchStock(input.branchId, input.search)),

  create: permissionProcedure("branches.manage")
    .input(branchInput)
    .mutation(async ({ input, ctx }) => {
      const result = await createBranch(input, ctx.user.id);
      await logAudit({
        actorId: ctx.user.id,
        action: "branch.create",
        entityType: "BRANCH",
        entityId: result.branchId,
        description: `Registered branch ${result.code} — ${input.name}.`,
        ...requestMeta(ctx.req),
      });
      return result;
    }),

  update: permissionProcedure("branches.manage")
    .input(z.object({ id: z.number().int().positive(), data: branchInput.partial() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await updateBranch(input.id, input.data, ctx.user.id);
        await logAudit({
          actorId: ctx.user.id,
          action: "branch.update",
          entityType: "BRANCH",
          entityId: input.id,
          description: `Updated branch #${input.id}: ${Object.keys(input.data).join(", ")}.`,
          ...requestMeta(ctx.req),
        });
        return result;
      } catch (e) {
        throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message });
      }
    }),

  setStatus: permissionProcedure("branches.manage")
    .input(z.object({ id: z.number().int().positive(), status: z.enum(BRANCH_STATUSES) }))
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await setBranchStatus(input.id, input.status, ctx.user.id);
        await logAudit({
          actorId: ctx.user.id,
          action: "branch.set_status",
          entityType: "BRANCH",
          entityId: input.id,
          description: `Branch #${input.id} → ${input.status}.`,
          ...requestMeta(ctx.req),
        });
        return result;
      } catch (e) {
        throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message });
      }
    }),

  assignStaff: permissionProcedure("branches.manage")
    .input(
      z.object({
        userId: z.number().int().positive(),
        branchId: z.number().int().positive().nullable(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await assignStaffToBranch(input.userId, input.branchId, ctx.user.id);
        await logAudit({
          actorId: ctx.user.id,
          action: "branch.assign_staff",
          entityType: "USER",
          entityId: input.userId,
          description: `Staff #${input.userId} assigned to branch ${input.branchId ?? "MAIN (unassigned)"}.`,
          ...requestMeta(ctx.req),
        });
        return result;
      } catch (e) {
        throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message });
      }
    }),
});

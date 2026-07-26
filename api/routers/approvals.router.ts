import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { createRouter } from "../middleware";
import { permissionProcedure } from "../trpc";
import { getDb } from "../queries/connection";
import { approvalRequests, products, users } from "@db/schema";
import { applyApproval, resolveApproval } from "../services/approvals.apply";
import { APPROVAL_REQUEST_STATUSES, APPROVAL_TYPES } from "@contracts/constants";

/**
 * HADRAN FABRICS MALL — approvals router.
 * The review queue: managers' gated actions wait here; Admins inspect
 * the full payload, approve (the action is applied immediately) or
 * reject with a note. Managers see the fate of their own requests.
 */

export const approvalsRouter = createRouter({
  /** Pending queue count (for the sidebar badge / bell). */
  pendingCount: permissionProcedure("approvals.review").query(async () => {
    const db = getDb();
    const [row] = await db
      .select({ value: count() })
      .from(approvalRequests)
      .where(eq(approvalRequests.status, "PENDING"));
    return { count: row?.value ?? 0 };
  }),

  /** Review queue — pending first, with requester names. */
  list: permissionProcedure("approvals.review")
    .input(
      z.object({
        status: z.enum(APPROVAL_REQUEST_STATUSES).optional(),
        requestType: z.enum(APPROVAL_TYPES).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(5).max(50).default(15),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const conds: SQL[] = [];
      if (input.status) conds.push(eq(approvalRequests.status, input.status));
      if (input.requestType) conds.push(eq(approvalRequests.requestType, input.requestType));
      const where = conds.length ? and(...conds) : undefined;

      const [total] = await db.select({ value: count() }).from(approvalRequests).where(where);
      const items = await db
        .select({
          request: approvalRequests,
          requesterName: users.fullName,
          reviewerName: sql<string | null>`(SELECT full_name FROM users WHERE id = ${approvalRequests.reviewerId})`,
        })
        .from(approvalRequests)
        .innerJoin(users, eq(approvalRequests.requesterId, users.id))
        .where(where)
        .orderBy(desc(approvalRequests.createdAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      return { items, total: total?.value ?? 0, page: input.page, pageSize: input.pageSize };
    }),

  /** The signed-in user's own requests (managers track their asks). */
  myRequests: permissionProcedure("approvals.request")
    .input(
      z.object({
        status: z.enum(APPROVAL_REQUEST_STATUSES).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(5).max(50).default(10),
      }),
    )
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const conds: SQL[] = [eq(approvalRequests.requesterId, ctx.user.id)];
      if (input.status) conds.push(eq(approvalRequests.status, input.status));
      const where = and(...conds);

      const [total] = await db.select({ value: count() }).from(approvalRequests).where(where);
      const items = await db
        .select({
          request: approvalRequests,
          reviewerName: sql<string | null>`(SELECT full_name FROM users WHERE id = ${approvalRequests.reviewerId})`,
        })
        .from(approvalRequests)
        .where(where)
        .orderBy(desc(approvalRequests.createdAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      return { items, total: total?.value ?? 0, page: input.page, pageSize: input.pageSize };
    }),

  /** Approve: apply the payload, then resolve. */
  approve: permissionProcedure("approvals.review")
    .input(z.object({ id: z.number().int().positive(), reviewNote: z.string().max(500).optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const rows = await db.select().from(approvalRequests).where(eq(approvalRequests.id, input.id)).limit(1);
      const request = rows[0];
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Approval request not found." });
      if (request.status !== "PENDING") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `This request was already ${request.status.toLowerCase()}.` });
      }

      // Apply the parked action (throws → request stays PENDING so it can be retried/rejected).
      const applied = await applyApproval(request.requestType, request.payload, {
        id: ctx.user.id,
        fullName: ctx.user.fullName,
      });

      await resolveApproval(request.id, "APPROVED", ctx.user, input.reviewNote, applied.description);
      return { ok: true, applied: applied.description };
    }),

  reject: permissionProcedure("approvals.review")
    .input(
      z.object({
        id: z.number().int().positive(),
        reviewNote: z.string().min(3, "Give the requester a reason").max(500),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const rows = await db.select().from(approvalRequests).where(eq(approvalRequests.id, input.id)).limit(1);
      const request = rows[0];
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Approval request not found." });
      if (request.status !== "PENDING") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `This request was already ${request.status.toLowerCase()}.` });
      }

      // If a product was parked in PENDING state, release it back.
      if (request.entityType === "PRODUCT" && request.entityId) {
        await db.update(products).set({ approvalStatus: "APPROVED" }).where(eq(products.id, request.entityId));
      }

      await resolveApproval(request.id, "REJECTED", ctx.user, input.reviewNote);
      return { ok: true };
    }),
});

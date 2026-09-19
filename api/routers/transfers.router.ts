import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, gte, inArray, like, lte, or, type SQL } from "drizzle-orm";
import { createRouter } from "../middleware";
import { permissionProcedure } from "../trpc";
import { getDb } from "../queries/connection";
import { branches, branchTransferItems, branchTransfers, products, users } from "@db/schema";
import {
  approveTransfer,
  cancelTransfer,
  createTransfer,
  receiveTransfer,
  rejectTransfer,
  sendTransfer,
  type TransferItemInput,
} from "../services/transfer.service";
import { logAudit, requestMeta } from "../services/audit.service";
import { TRANSFER_STATUSES } from "@contracts/constants";

/**
 * HADRAN FABRICS MALL — inter-branch transfers router
 * Lists are scoped to the caller's active branch (sent OR received);
 * the lifecycle writes are service-side and audit-logged here.
 */

const listInput = z.object({
  direction: z.enum(["SENT", "RECEIVED"]).optional(),
  status: z.enum(TRANSFER_STATUSES).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().max(120).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(5).max(100).default(20),
});

function branchNameMap(db: ReturnType<typeof getDb>) {
  return db.select({ id: branches.id, name: branches.name, code: branches.code }).from(branches);
}

export const transfersRouter = createRouter({
  /* ------------------------------ SUMMARY ------------------------------ */

  summary: permissionProcedure("transfers.view").query(async ({ ctx }) => {
    const db = getDb();
    const branchId = ctx.activeBranchId;
    const scope = branchId != null
      ? or(eq(branchTransfers.fromBranchId, branchId), eq(branchTransfers.toBranchId, branchId))
      : undefined;

    const statusRows = await db
      .select({ status: branchTransfers.status, count: count() })
      .from(branchTransfers)
      .where(scope)
      .groupBy(branchTransfers.status);
    const board = Object.fromEntries(statusRows.map((r) => [r.status, Number(r.count)]));

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthRows = await db
      .select({ count: count() })
      .from(branchTransfers)
      .where(and(scope, eq(branchTransfers.status, "RECEIVED"), gte(branchTransfers.receivedAt, monthStart)));

    return {
      pendingApproval: board.PENDING_APPROVAL ?? 0,
      approved: board.APPROVED ?? 0,
      inTransit: board.IN_TRANSIT ?? 0,
      receivedThisMonth: Number(monthRows[0]?.count ?? 0),
    };
  }),

  /* -------------------------------- LIST -------------------------------- */

  list: permissionProcedure("transfers.view").input(listInput).query(async ({ input, ctx }) => {
    const db = getDb();
    const filters: SQL[] = [];
    const branchId = ctx.activeBranchId;

    if (branchId != null) {
      if (input.direction === "SENT") filters.push(eq(branchTransfers.fromBranchId, branchId));
      else if (input.direction === "RECEIVED") filters.push(eq(branchTransfers.toBranchId, branchId));
      else filters.push(or(eq(branchTransfers.fromBranchId, branchId), eq(branchTransfers.toBranchId, branchId))!);
    }
    if (input.status) filters.push(eq(branchTransfers.status, input.status));
    if (input.dateFrom) filters.push(gte(branchTransfers.createdAt, new Date(`${input.dateFrom}T00:00:00`)));
    if (input.dateTo) filters.push(lte(branchTransfers.createdAt, new Date(`${input.dateTo}T23:59:59`)));
    if (input.search?.trim()) filters.push(like(branchTransfers.refNo, `%${input.search.trim()}%`));

    const where = filters.length ? and(...filters) : undefined;
    const offset = (input.page - 1) * input.pageSize;

    const [rows, totalRow, branchRows] = await Promise.all([
      db
        .select()
        .from(branchTransfers)
        .where(where)
        .orderBy(desc(branchTransfers.createdAt))
        .limit(input.pageSize)
        .offset(offset),
      db.select({ count: count() }).from(branchTransfers).where(where),
      branchNameMap(db),
    ]);

    const names = new Map(branchRows.map((b) => [b.id, b]));
    const transferIds = rows.map((r) => r.id);
    const itemCounts = transferIds.length
      ? await db
          .select({ transferId: branchTransferItems.transferId, count: count() })
          .from(branchTransferItems)
          .where(inArray(branchTransferItems.transferId, transferIds))
          .groupBy(branchTransferItems.transferId)
      : [];
    const itemCountMap = new Map(itemCounts.map((i) => [i.transferId, Number(i.count)]));

    return {
      rows: rows.map((r) => ({
        ...r,
        fromBranchName: names.get(r.fromBranchId)?.name ?? `#${r.fromBranchId}`,
        toBranchName: names.get(r.toBranchId)?.name ?? `#${r.toBranchId}`,
        itemCount: itemCountMap.get(r.id) ?? 0,
      })),
      total: Number(totalRow[0]?.count ?? 0),
      page: input.page,
      pageSize: input.pageSize,
    };
  }),

  /* ------------------------------- DETAIL ------------------------------- */

  getById: permissionProcedure("transfers.view")
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(branchTransfers).where(eq(branchTransfers.id, input.id)).limit(1);
      const transfer = rows[0];
      if (!transfer) throw new TRPCError({ code: "NOT_FOUND", message: "Transfer not found." });

      const [items, branchRows, userRows] = await Promise.all([
        db.select().from(branchTransferItems).where(eq(branchTransferItems.transferId, transfer.id)),
        branchNameMap(db),
        db
          .select({ id: users.id, fullName: users.fullName })
          .from(users)
          .where(
            inArray(
              users.id,
              [transfer.requestedBy, transfer.approvedBy, transfer.receivedBy].filter(
                (v): v is number => v != null,
              ),
            ),
          ),
      ]);
      const names = new Map(branchRows.map((b) => [b.id, b]));
      const userNames = new Map(userRows.map((u) => [u.id, u.fullName]));

      return {
        ...transfer,
        fromBranchName: names.get(transfer.fromBranchId)?.name ?? `#${transfer.fromBranchId}`,
        toBranchName: names.get(transfer.toBranchId)?.name ?? `#${transfer.toBranchId}`,
        requestedByName: userNames.get(transfer.requestedBy) ?? null,
        approvedByName: transfer.approvedBy != null ? userNames.get(transfer.approvedBy) ?? null : null,
        receivedByName: transfer.receivedBy != null ? userNames.get(transfer.receivedBy) ?? null : null,
        items,
      };
    }),

  /* ------------------------------- CREATE ------------------------------- */

  create: permissionProcedure("transfers.manage")
    .input(
      z.object({
        toBranchId: z.number().int().positive(),
        note: z.string().max(400).optional(),
        items: z
          .array(
            z.object({
              productId: z.number().int().positive(),
              quantity: z.number().positive(),
            }),
          )
          .min(1)
          .max(100),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.activeBranchId == null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No active branch — pick a branch first." });
      }
      // Authoritative product names/units — never trust client snapshots.
      const db = getDb();
      const ids = input.items.map((i) => i.productId);
      const productRows = await db
        .select({ id: products.id, name: products.name, unitOfMeasure: products.unitOfMeasure, status: products.status })
        .from(products)
        .where(inArray(products.id, ids));
      const byId = new Map(productRows.map((p) => [p.id, p]));

      const items: TransferItemInput[] = input.items.map((i) => {
        const p = byId.get(i.productId);
        if (!p) throw new TRPCError({ code: "BAD_REQUEST", message: `Product #${i.productId} not found.` });
        if (p.status !== "ACTIVE") {
          throw new TRPCError({ code: "BAD_REQUEST", message: `"${p.name}" is not an active product.` });
        }
        return { productId: p.id, productName: p.name, unit: p.unitOfMeasure, quantity: i.quantity };
      });

      try {
        const result = await createTransfer(
          { fromBranchId: ctx.activeBranchId, toBranchId: input.toBranchId, note: input.note, items },
          ctx.user.id,
        );
        await logAudit({
          actorId: ctx.user.id,
          action: "transfer.create",
          entityType: "TRANSFER",
          entityId: result.transferId,
          description: `Created transfer ${result.refNo} from branch #${ctx.activeBranchId} to branch #${input.toBranchId} (${items.length} item(s)).`,
          ...requestMeta(ctx.req),
        });
        return result;
      } catch (e) {
        throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message });
      }
    }),

  /* ------------------------------ LIFECYCLE ------------------------------ */

  approve: permissionProcedure("transfers.manage")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await approveTransfer(input.id, ctx.user.id);
        await logAudit({
          actorId: ctx.user.id,
          action: "transfer.approve",
          entityType: "TRANSFER",
          entityId: input.id,
          description: `Approved transfer #${input.id}.`,
          ...requestMeta(ctx.req),
        });
        return result;
      } catch (e) {
        throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message });
      }
    }),

  reject: permissionProcedure("transfers.manage")
    .input(z.object({ id: z.number().int().positive(), reason: z.string().max(300).optional() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await rejectTransfer(input.id, ctx.user.id, input.reason);
        await logAudit({
          actorId: ctx.user.id,
          action: "transfer.reject",
          entityType: "TRANSFER",
          entityId: input.id,
          description: `Rejected transfer #${input.id}${input.reason ? `: ${input.reason}` : ""}.`,
          ...requestMeta(ctx.req),
        });
        return result;
      } catch (e) {
        throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message });
      }
    }),

  send: permissionProcedure("transfers.manage")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await sendTransfer(input.id, ctx.user.id);
        await logAudit({
          actorId: ctx.user.id,
          action: "transfer.send",
          entityType: "TRANSFER",
          entityId: input.id,
          description: `Sent transfer #${input.id} — ${result.itemsSent} item line(s) deducted at source branch.`,
          ...requestMeta(ctx.req),
        });
        return result;
      } catch (e) {
        throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message });
      }
    }),

  receive: permissionProcedure("transfers.manage")
    .input(
      z.object({
        id: z.number().int().positive(),
        received: z
          .array(z.object({ itemId: z.number().int().positive(), quantity: z.number().min(0) }))
          .optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await receiveTransfer(input.id, ctx.user.id, input.received);
        await logAudit({
          actorId: ctx.user.id,
          action: "transfer.receive",
          entityType: "TRANSFER",
          entityId: input.id,
          description: `Received transfer #${input.id} at destination branch.`,
          ...requestMeta(ctx.req),
        });
        return result;
      } catch (e) {
        throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message });
      }
    }),

  cancel: permissionProcedure("transfers.manage")
    .input(z.object({ id: z.number().int().positive(), reason: z.string().max(300).optional() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await cancelTransfer(input.id, ctx.user.id, input.reason);
        await logAudit({
          actorId: ctx.user.id,
          action: "transfer.cancel",
          entityType: "TRANSFER",
          entityId: input.id,
          description: `Cancelled transfer #${input.id}${input.reason ? `: ${input.reason}` : ""}.`,
          ...requestMeta(ctx.req),
        });
        return result;
      } catch (e) {
        throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message });
      }
    }),
});

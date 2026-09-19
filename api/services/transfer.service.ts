import { count, eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { branches, branchTransferItems, branchTransfers } from "@db/schema";
import { getBranchBalance, recordBranchTransfer, type Tx } from "./inventory.service";
import type { Unit } from "@contracts/constants";

/**
 * HADRAN FABRICS MALL — inter-branch transfer service
 * Moves stock between branches without changing the company-wide total:
 *
 *   PENDING_APPROVAL → APPROVED → IN_TRANSIT → RECEIVED
 *                       ↘ REJECTED      (cancel allowed until sending)
 *
 * Stock leaves the SOURCE branch when the transfer is sent (TRANSFER_OUT)
 * and lands at the DESTINATION when received (TRANSFER_IN, per-item
 * receivedQty allows partial receipt). Branch levels are strict — a
 * branch can only send what it actually holds.
 */

type DbExecutor = ReturnType<typeof getDb>;

async function nextTransferRef(db: DbExecutor | Tx): Promise<string> {
  const [row] = await db.select({ value: count() }).from(branchTransfers);
  return `TRF-${String((row?.value ?? 0) + 1).padStart(6, "0")}`;
}

async function loadTransfer(db: DbExecutor | Tx, id: number) {
  const rows = await db.select().from(branchTransfers).where(eq(branchTransfers.id, id)).limit(1);
  if (!rows[0]) throw new Error("Transfer not found.");
  return rows[0];
}

async function loadItems(db: DbExecutor | Tx, transferId: number) {
  return db.select().from(branchTransferItems).where(eq(branchTransferItems.transferId, transferId));
}

/* ------------------------------- create ------------------------------- */

export interface TransferItemInput {
  productId: number;
  productName: string;
  unit: Unit;
  quantity: number;
}

export async function createTransfer(
  input: { fromBranchId: number; toBranchId: number; note?: string | null; items: TransferItemInput[] },
  actorId: number,
) {
  const db = getDb();
  if (input.fromBranchId === input.toBranchId) {
    throw new Error("Source and destination branches must differ.");
  }
  if (input.items.length === 0) throw new Error("Add at least one item to transfer.");

  return db.transaction(async (tx) => {
    // Both branches must exist and be ACTIVE.
    const bs = await tx.select().from(branches);
    const from = bs.find((b) => b.id === input.fromBranchId);
    const to = bs.find((b) => b.id === input.toBranchId);
    if (!from || !to) throw new Error("Branch not found.");
    if (from.status !== "ACTIVE" || to.status !== "ACTIVE") {
      throw new Error("Both branches must be active to transfer stock.");
    }

    // Strict source-branch availability, checked up front for a clean error.
    for (const item of input.items) {
      if (!(item.quantity > 0)) throw new Error(`Quantity for "${item.productName}" must be positive.`);
      const held = await getBranchBalance(item.productId, input.fromBranchId, tx);
      if (held + 0.0001 < item.quantity) {
        throw new Error(
          `"${item.productName}": ${from.name} holds ${held}, cannot send ${item.quantity}.`,
        );
      }
    }

    const refNo = await nextTransferRef(tx);
    const [row] = await tx
      .insert(branchTransfers)
      .values({
        refNo,
        fromBranchId: input.fromBranchId,
        toBranchId: input.toBranchId,
        note: input.note?.trim() || null,
        requestedBy: actorId,
      })
      .$returningId();

    await tx.insert(branchTransferItems).values(
      input.items.map((i) => ({
        transferId: row.id,
        productId: i.productId,
        productName: i.productName,
        unit: i.unit,
        quantity: String(i.quantity),
      })),
    );

    return { transferId: row.id, refNo };
  });
}

/* ------------------------------ lifecycle ------------------------------ */

export async function approveTransfer(id: number, approverId: number) {
  const db = getDb();
  const t = await loadTransfer(db, id);
  if (t.status !== "PENDING_APPROVAL") throw new Error("Only pending transfers can be approved.");
  if (t.requestedBy === approverId) {
    throw new Error("The requester cannot approve their own transfer — another manager must approve it.");
  }
  await db
    .update(branchTransfers)
    .set({ status: "APPROVED", approvedBy: approverId })
    .where(eq(branchTransfers.id, id));
  return { transferId: id };
}

export async function rejectTransfer(id: number, approverId: number, reason?: string) {
  const db = getDb();
  const t = await loadTransfer(db, id);
  if (t.status !== "PENDING_APPROVAL") throw new Error("Only pending transfers can be rejected.");
  if (t.requestedBy === approverId) {
    throw new Error("The requester cannot reject their own transfer — ask another manager.");
  }
  await db
    .update(branchTransfers)
    .set({
      status: "REJECTED",
      approvedBy: approverId,
      note: reason?.trim() ? `${t.note ? t.note + " · " : ""}Rejected: ${reason.trim()}` : t.note,
    })
    .where(eq(branchTransfers.id, id));
  return { transferId: id };
}

/** APPROVED → IN_TRANSIT: stock leaves the source branch. */
export async function sendTransfer(id: number, actorId: number) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const t = await loadTransfer(tx, id);
    if (t.status !== "APPROVED") throw new Error("Only approved transfers can be sent.");
    const items = await loadItems(tx, id);
    for (const item of items) {
      await recordBranchTransfer(
        {
          productId: item.productId,
          branchId: t.fromBranchId,
          quantity: -Number(item.quantity),
          transferId: id,
          transferRef: t.refNo,
          performedBy: actorId,
        },
        tx,
      );
    }
    await tx
      .update(branchTransfers)
      .set({ status: "IN_TRANSIT", sentAt: new Date() })
      .where(eq(branchTransfers.id, id));
    return { transferId: id, itemsSent: items.length };
  });
}

/** IN_TRANSIT → RECEIVED: stock lands at the destination branch. */
export async function receiveTransfer(
  id: number,
  actorId: number,
  received?: { itemId: number; quantity: number }[],
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const t = await loadTransfer(tx, id);
    if (t.status !== "IN_TRANSIT") throw new Error("Only in-transit transfers can be received.");
    const items = await loadItems(tx, id);
    const overrides = new Map((received ?? []).map((r) => [r.itemId, r.quantity]));

    for (const item of items) {
      const planned = Number(item.quantity);
      const got = overrides.has(item.id) ? Number(overrides.get(item.id)) : planned;
      if (!(got >= 0)) throw new Error(`Received quantity for "${item.productName}" cannot be negative.`);
      if (got > planned + 0.0001) {
        throw new Error(`Received quantity for "${item.productName}" exceeds what was sent (${planned}).`);
      }
      await tx
        .update(branchTransferItems)
        .set({ receivedQty: String(got) })
        .where(eq(branchTransferItems.id, item.id));
      if (got > 0.0001) {
        await recordBranchTransfer(
          {
            productId: item.productId,
            branchId: t.toBranchId,
            quantity: got,
            transferId: id,
            transferRef: t.refNo,
            performedBy: actorId,
          },
          tx,
        );
      }
      // Shortfall returns to the source branch (goods never left / came back),
      // preserving sum(stock_levels) == products.currentStock. Genuine losses
      // are then handled deliberately via inventory adjustments.
      const shortfall = planned - got;
      if (shortfall > 0.0001) {
        await recordBranchTransfer(
          {
            productId: item.productId,
            branchId: t.fromBranchId,
            quantity: shortfall,
            transferId: id,
            transferRef: `${t.refNo}-RTN`,
            performedBy: actorId,
          },
          tx,
        );
      }
    }

    await tx
      .update(branchTransfers)
      .set({ status: "RECEIVED", receivedBy: actorId, receivedAt: new Date() })
      .where(eq(branchTransfers.id, id));
    return { transferId: id, itemsReceived: items.length };
  });
}

/** PENDING_APPROVAL / APPROVED → CANCELLED (stock has not moved yet). */
export async function cancelTransfer(id: number, _actorId: number, reason?: string) {
  const db = getDb();
  const t = await loadTransfer(db, id);
  if (t.status !== "PENDING_APPROVAL" && t.status !== "APPROVED") {
    throw new Error("Only transfers not yet sent can be cancelled.");
  }
  await db
    .update(branchTransfers)
    .set({
      status: "CANCELLED",
      note: reason?.trim() ? `${t.note ? t.note + " · " : ""}Cancelled: ${reason.trim()}` : t.note,
    })
    .where(eq(branchTransfers.id, id));
  return { transferId: id };
}

import { and, eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { products, stockLevels, stockMovements } from "@db/schema";
import type { StockMovementType, Unit } from "@contracts/constants";

/**
 * HADRAN FABRICS MALL — Inventory service
 * The ONLY way stock changes: every change writes a signed movement
 * (immutable ledger) and updates the product's cached balance.
 *
 * Phase 6 (branches): products.current_stock stays the company-wide
 * total; stock_levels tracks the per-branch split. recordMovement keeps
 * both in sync (sum of branch levels == global balance). Outbound moves
 * deduct from the acting branch first, falling back to the MAIN branch
 * for any shortfall (the main warehouse backs the shop floor).
 * Inter-branch transfers use recordBranchTransfer instead — strict
 * per-branch availability, company-wide total untouched.
 */

type DbExecutor = ReturnType<typeof getDb>;

/** Transaction handle accepted by recordMovement (drizzle mysql2 tx). */
export type Tx = Parameters<Parameters<DbExecutor["transaction"]>[0]>[0];

export interface MovementInput {
  productId: number;
  movementType: StockMovementType;
  /** Signed: positive = stock in, negative = stock out. */
  quantity: number;
  unit?: Unit;
  /** Branch the move happens at; null/absent = main branch. */
  branchId?: number | null;
  referenceType?: string | null;
  referenceId?: number | null;
  reason?: string | null;
  notes?: string | null;
  performedBy?: number | null;
  approvedBy?: number | null;
}

/** Read one stock_levels row (null when the branch has never held the product). */
async function levelFor(
  db: DbExecutor,
  productId: number,
  branchId: number,
): Promise<{ id: number; quantity: number } | null> {
  const rows = await db
    .select({ id: stockLevels.id, quantity: stockLevels.quantity })
    .from(stockLevels)
    .where(and(eq(stockLevels.productId, productId), eq(stockLevels.branchId, branchId)))
    .limit(1);
  const row = rows[0];
  return row ? { id: row.id, quantity: Number(row.quantity) } : null;
}

/** Apply a signed delta to one branch's level row (creating it if needed). Returns the new branch balance. */
async function bumpLevel(db: DbExecutor, productId: number, branchId: number, delta: number): Promise<number> {
  const existing = await levelFor(db, productId, branchId);
  const next = Number(((existing?.quantity ?? 0) + delta).toFixed(2));
  if (existing) {
    await db.update(stockLevels).set({ quantity: String(next) }).where(eq(stockLevels.id, existing.id));
  } else {
    await db.insert(stockLevels).values({ productId, branchId, quantity: String(next) });
  }
  return next;
}

export async function recordMovement(input: MovementInput, tx?: Tx) {
  const db = (tx ?? getDb()) as DbExecutor;

  const found = await db.select().from(products).where(eq(products.id, input.productId)).limit(1);
  const product = found[0];
  if (!product) throw new Error("Product not found.");

  const qty = Math.abs(input.quantity) * Math.sign(input.quantity);
  if (qty === 0) throw new Error("Quantity cannot be zero.");

  const newBalance = Number((product.currentStock + qty).toFixed(3));
  if (newBalance < 0) {
    throw new Error(
      `Insufficient stock for "${product.name}" — available ${product.currentStock} ${product.unitOfMeasure.toLowerCase()}(s).`,
    );
  }

  // Keep the per-branch split in sync with the global move.
  const { getMainBranchId } = await import("./branch.service");
  const mainBranchId = await getMainBranchId();
  const actingBranchId = input.branchId ?? mainBranchId;
  if (actingBranchId != null) {
    if (qty > 0) {
      await bumpLevel(db, input.productId, actingBranchId, qty);
    } else {
      // Outbound: take from the acting branch first, MAIN covers the shortfall.
      const available = (await levelFor(db, input.productId, actingBranchId))?.quantity ?? 0;
      const fromActing = Math.min(Math.max(available, 0), -qty);
      await bumpLevel(db, input.productId, actingBranchId, -fromActing);
      const remainder = -qty - fromActing;
      if (remainder > 0.0001 && mainBranchId != null && mainBranchId !== actingBranchId) {
        await bumpLevel(db, input.productId, mainBranchId, -remainder);
      }
    }
  }

  const [movement] = await db
    .insert(stockMovements)
    .values({
      productId: input.productId,
      branchId: actingBranchId ?? null,
      movementType: input.movementType,
      quantity: qty,
      unit: input.unit ?? product.unitOfMeasure,
      balanceAfter: newBalance,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      reason: input.reason ?? null,
      notes: input.notes ?? null,
      performedBy: input.performedBy ?? null,
      approvedBy: input.approvedBy ?? null,
    })
    .$returningId();

  await db.update(products).set({ currentStock: newBalance }).where(eq(products.id, input.productId));

  // Low-stock alert: only when the balance CROSSES from above to at/below the
  // reorder level, and only when the alert setting is enabled.
  try {
    if (product.reorderLevel > 0 && product.currentStock > product.reorderLevel && newBalance <= product.reorderLevel) {
      const { readSetting } = await import("./settings.service");
      const enabled = await readSetting("system.low_stock_alerts", true);
      if (enabled) {
        const { notifyRoles } = await import("./notifications.service");
        await notifyRoles(["ADMIN", "SUPER_ADMIN", "MANAGER"], {
          type: "LOW_STOCK",
          title: `Low stock: ${product.name}`,
          body: newBalance <= 0
            ? `"${product.name}" (${product.sku}) is now OUT of stock. Reorder level is ${product.reorderLevel}.`
            : `"${product.name}" (${product.sku}) dropped to ${newBalance} — at/below its reorder level of ${product.reorderLevel}.`,
          link: `/products/${product.id}`,
        });
      }
    }
  } catch {
    /* notifications must never break stock movements */
  }

  return { movementId: movement.id, newBalance, product };
}

/** Current balance for a product (throws if missing). */
export async function getBalance(productId: number): Promise<number> {
  const db = getDb();
  const found = await db
    .select({ currentStock: products.currentStock })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!found[0]) throw new Error("Product not found.");
  return found[0].currentStock;
}

/** Current per-branch balance for a product (0 when never stocked there). */
export async function getBranchBalance(productId: number, branchId: number, tx?: Tx): Promise<number> {
  const db = (tx ?? getDb()) as DbExecutor;
  return (await levelFor(db, productId, branchId))?.quantity ?? 0;
}

export interface BranchTransferMovementInput {
  productId: number;
  branchId: number;
  /** Signed: negative when stock leaves the branch, positive when it arrives. */
  quantity: number;
  transferId: number;
  transferRef: string;
  performedBy?: number | null;
}

/**
 * Strict per-branch stock move for inter-branch transfers.
 * Unlike recordMovement this NEVER touches products.currentStock — a
 * transfer moves stock between branches, the company-wide total is
 * unchanged. Outbound moves require sufficient stock AT that branch.
 * balanceAfter on the ledger row is the branch-level balance.
 */
export async function recordBranchTransfer(
  input: BranchTransferMovementInput,
  tx?: Tx,
): Promise<{ movementId: number; branchBalance: number }> {
  const db = (tx ?? getDb()) as DbExecutor;

  const found = await db.select().from(products).where(eq(products.id, input.productId)).limit(1);
  const product = found[0];
  if (!product) throw new Error("Product not found.");

  const qty = Math.abs(input.quantity) * Math.sign(input.quantity);
  if (qty === 0) throw new Error("Quantity cannot be zero.");

  if (qty < 0) {
    const available = (await levelFor(db, input.productId, input.branchId))?.quantity ?? 0;
    if (available + 0.0001 < -qty) {
      throw new Error(
        `Insufficient branch stock for "${product.name}" — this branch holds ${available} ${product.unitOfMeasure.toLowerCase()}(s).`,
      );
    }
  }

  const branchBalance = await bumpLevel(db, input.productId, input.branchId, qty);

  const [movement] = await db
    .insert(stockMovements)
    .values({
      productId: input.productId,
      branchId: input.branchId,
      movementType: qty < 0 ? "TRANSFER_OUT" : "TRANSFER_IN",
      quantity: qty,
      unit: product.unitOfMeasure,
      balanceAfter: branchBalance,
      referenceType: "TRANSFER",
      referenceId: input.transferId,
      reason: `Branch transfer ${input.transferRef}`,
      performedBy: input.performedBy ?? null,
    })
    .$returningId();

  return { movementId: movement.id, branchBalance };
}

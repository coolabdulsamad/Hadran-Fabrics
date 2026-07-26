import { eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { products, stockMovements } from "@db/schema";
import type { StockMovementType, Unit } from "@contracts/constants";

/**
 * HADRAN FABRICS MALL — Inventory service
 * The ONLY way stock changes: every change writes a signed movement
 * (immutable ledger) and updates the product's cached balance.
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
  referenceType?: string | null;
  referenceId?: number | null;
  reason?: string | null;
  notes?: string | null;
  performedBy?: number | null;
  approvedBy?: number | null;
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

  const [movement] = await db
    .insert(stockMovements)
    .values({
      productId: input.productId,
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

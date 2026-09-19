import { count, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../queries/connection";
import { productionOrders, productionMaterials, products } from "@db/schema";
import { recordMovement } from "./inventory.service";
import type { ProductionStatus, Unit } from "@contracts/constants";

/**
 * HADRAN FABRICS MALL — in-house production service
 * Turns shop stock (fabrics, lining, accessories) into new sellable
 * products (ready-made garments, pre-cut bundles, etc.).
 *
 *   createProductionRun → DRAFT run + planned material lines
 *   startProductionRun  → consumes materials from stock (PRODUCTION_OUT)
 *   completeProductionRun → books the finished output into stock (PRODUCTION_IN)
 *   cancelProductionRun → DRAFT: just cancels; IN_PROGRESS: returns materials
 *
 * Stock only ever moves through recordMovement — balances, movement
 * history and low-stock alerts stay consistent with the rest of inventory.
 */

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

export interface ProductionMaterialInput {
  productId: number;
  quantity: number;
  unit?: Unit;
}

export interface CreateProductionRunInput {
  outputProductId: number;
  outputQty: number;
  notes?: string | null;
  materials: ProductionMaterialInput[];
}

async function nextRefNo(tx: Tx): Promise<string> {
  const [row] = await tx.select({ value: count() }).from(productionOrders);
  return `PRD-${String((row?.value ?? 0) + 1).padStart(6, "0")}`;
}

async function assertProductsExist(
  tx: Tx,
  ids: number[],
): Promise<Map<number, { name: string; unit: Unit }>> {
  const rows = await tx
    .select({ id: products.id, name: products.name, unit: products.unitOfMeasure })
    .from(products)
    .where(inArray(products.id, ids));
  const map = new Map(rows.map((r) => [r.id, { name: r.name, unit: r.unit as Unit }]));
  for (const id of ids) {
    if (!map.has(id)) throw new TRPCError({ code: "BAD_REQUEST", message: `Product #${id} does not exist.` });
  }
  return map;
}

/** Create a production run in DRAFT with its planned material lines. */
export async function createProductionRun(
  input: CreateProductionRunInput,
  actorId: number,
  branchId: number | null,
): Promise<{ productionId: number; refNo: string }> {
  const db = getDb();

  if (input.outputQty <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Output quantity must be greater than zero." });
  }
  if (input.materials.length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Add at least one material to consume." });
  }
  if (input.materials.some((m) => m.quantity <= 0)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Material quantities must be greater than zero." });
  }

  return db.transaction(async (tx) => {
    const productIds = [input.outputProductId, ...input.materials.map((m) => m.productId)];
    const catalog = await assertProductsExist(tx, productIds);

    const refNo = await nextRefNo(tx);

    const [run] = await tx
      .insert(productionOrders)
      .values({
        refNo,
        branchId,
        outputProductId: input.outputProductId,
        outputQty: input.outputQty.toFixed(2),
        status: "DRAFT",
        notes: input.notes?.trim() || null,
        requestedBy: actorId,
      })
      .$returningId();

    await tx.insert(productionMaterials).values(
      input.materials.map((m) => ({
        productionId: run.id,
        productId: m.productId,
        productName: catalog.get(m.productId)!.name,
        unit: m.unit ?? catalog.get(m.productId)!.unit,
        quantityPlanned: m.quantity.toFixed(2),
      })),
    );

    return { productionId: run.id, refNo };
  });
}

/**
 * Start a DRAFT run: deducts every planned material from shop stock as
 * PRODUCTION_OUT and freezes quantityUsed = quantityPlanned.
 */
export async function startProductionRun(
  productionId: number,
  actorId: number,
): Promise<{ status: ProductionStatus }> {
  const db = getDb();

  return db.transaction(async (tx) => {
    const [run] = await tx.select().from(productionOrders).where(eq(productionOrders.id, productionId)).limit(1);
    if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Production run not found." });
    if (run.status !== "DRAFT") {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Only a draft run can be started (current: ${run.status}).` });
    }

    const materials = await tx
      .select()
      .from(productionMaterials)
      .where(eq(productionMaterials.productionId, productionId));
    if (materials.length === 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This run has no material lines." });
    }

    for (const m of materials) {
      const qty = Number(m.quantityPlanned);
      await recordMovement(
        {
          productId: m.productId,
          movementType: "PRODUCTION_OUT",
          quantity: -qty,
          unit: m.unit,
          branchId: run.branchId ?? null,
          referenceType: "PRODUCTION",
          referenceId: productionId,
          reason: `Production run ${run.refNo}`,
          notes: `Material consumed: ${m.productName}`,
          performedBy: actorId,
        },
        tx,
      );
      await tx
        .update(productionMaterials)
        .set({ quantityUsed: qty.toFixed(2) })
        .where(eq(productionMaterials.id, m.id));
    }

    await tx
      .update(productionOrders)
      .set({ status: "IN_PROGRESS", startedAt: new Date() })
      .where(eq(productionOrders.id, productionId));

    return { status: "IN_PROGRESS" };
  });
}

/**
 * Complete an IN_PROGRESS run: books the finished quantity of the output
 * product into stock as PRODUCTION_IN.
 */
export async function completeProductionRun(
  productionId: number,
  actorId: number,
  approverId?: number | null,
): Promise<{ status: ProductionStatus }> {
  const db = getDb();

  return db.transaction(async (tx) => {
    const [run] = await tx.select().from(productionOrders).where(eq(productionOrders.id, productionId)).limit(1);
    if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Production run not found." });
    if (run.status !== "IN_PROGRESS") {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Only an in-progress run can be completed (current: ${run.status}).` });
    }

    await recordMovement(
      {
        productId: run.outputProductId,
        movementType: "PRODUCTION_IN",
        quantity: Number(run.outputQty),
        branchId: run.branchId ?? null,
        referenceType: "PRODUCTION",
        referenceId: productionId,
        reason: `Production run ${run.refNo} completed`,
        notes: `Output of production run ${run.refNo}`,
        performedBy: actorId,
        approvedBy: approverId ?? null,
      },
      tx,
    );

    await tx
      .update(productionOrders)
      .set({ status: "COMPLETED", completedAt: new Date(), approvedBy: approverId ?? null })
      .where(eq(productionOrders.id, productionId));

    return { status: "COMPLETED" };
  });
}

/**
 * Cancel a run. DRAFT runs simply cancel; an IN_PROGRESS run has already
 * consumed its materials, so each line is returned to stock (PRODUCTION_IN
 * on the material product) before cancelling.
 */
export async function cancelProductionRun(
  productionId: number,
  reason: string,
  actorId: number,
): Promise<{ status: ProductionStatus; materialsReturned: number }> {
  const db = getDb();

  return db.transaction(async (tx) => {
    const [run] = await tx.select().from(productionOrders).where(eq(productionOrders.id, productionId)).limit(1);
    if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Production run not found." });
    if (run.status === "COMPLETED" || run.status === "CANCELLED") {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Run is already ${run.status.toLowerCase()}.` });
    }

    let returned = 0;
    if (run.status === "IN_PROGRESS") {
      const materials = await tx
        .select()
        .from(productionMaterials)
        .where(eq(productionMaterials.productionId, productionId));
      for (const m of materials) {
        const qty = Number(m.quantityUsed ?? m.quantityPlanned);
        if (qty <= 0) continue;
        await recordMovement(
          {
            productId: m.productId,
            movementType: "PRODUCTION_IN",
            quantity: qty,
            unit: m.unit,
            branchId: run.branchId ?? null,
            referenceType: "PRODUCTION",
            referenceId: productionId,
            reason: `Production run ${run.refNo} cancelled — material returned`,
            notes: `Returned to stock on cancellation: ${reason}`,
            performedBy: actorId,
          },
          tx,
        );
        returned += 1;
      }
    }

    await tx
      .update(productionOrders)
      .set({ status: "CANCELLED", notes: [run.notes, `Cancelled: ${reason}`].filter(Boolean).join("\n") })
      .where(eq(productionOrders.id, productionId));

    return { status: "CANCELLED", materialsReturned: returned };
  });
}

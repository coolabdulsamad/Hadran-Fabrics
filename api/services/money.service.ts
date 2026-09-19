import { count } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { moneyMovements } from "@db/schema";
import type { MoneyDirection, MoneySourceType, PaymentMethod, Section } from "@contracts/constants";

/**
 * HADRAN FABRICS MALL — money ledger service
 * One row per naira movement, linked back to its source record
 * (sale, expense, return, purchase, laundry/tailoring payment…).
 * Every writer goes through recordMoneyMovement so the ledger can
 * never drift from the business event that caused it.
 */

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

export interface MoneyMovementInput {
  direction: MoneyDirection;
  section?: Section;
  branchId?: number | null;
  sourceType: MoneySourceType;
  sourceId?: number | string | null;
  sourceRef?: string | null;
  amount: number;
  paymentMethod?: PaymentMethod;
  note?: string | null;
  createdBy?: number | null;
}

async function nextMoneyRef(tx?: Tx): Promise<string> {
  const runner = tx ?? getDb();
  const [row] = await runner.select({ value: count() }).from(moneyMovements);
  return `MM-${String((row?.value ?? 0) + 1).padStart(6, "0")}`;
}

/** Append one movement to the money ledger. Pass a tx to stay atomic with the business write. */
export async function recordMoneyMovement(input: MoneyMovementInput, tx?: Tx): Promise<number> {
  const runner = tx ?? getDb();
  const refNo = await nextMoneyRef(tx);
  const [row] = await runner
    .insert(moneyMovements)
    .values({
      refNo,
      direction: input.direction,
      section: input.section ?? "SALES",
      branchId: input.branchId ?? null,
      sourceType: input.sourceType,
      sourceId: input.sourceId != null ? String(input.sourceId) : null,
      sourceRef: input.sourceRef ?? null,
      amount: String(input.amount.toFixed(2)),
      paymentMethod: input.paymentMethod ?? "CASH",
      note: input.note ?? null,
      createdBy: input.createdBy ?? null,
    })
    .$returningId();
  return row.id;
}

/**
 * Net split payments against change given.
 * Tendered cash often exceeds the bill; the change handed back is NOT money
 * in. We reduce the CASH leg(s) by the change so the rows sum to exactly
 * what the shop kept (the grand total).
 */
export function netPayments<T extends { method: PaymentMethod; amount: number }>(
  payments: T[],
  _grandTotal: number,
  changeGiven: number,
): { method: PaymentMethod; amount: number }[] {
  if (changeGiven <= 0) return payments.map((p) => ({ method: p.method, amount: p.amount }));

  let remaining = changeGiven;
  const rows = payments.map((p) => ({ method: p.method, amount: p.amount }));
  // Reduce cash legs first (change physically comes out of the cash drawer).
  for (const row of rows.filter((r) => r.method === "CASH")) {
    if (remaining <= 0) break;
    const cut = Math.min(row.amount, remaining);
    row.amount = Number((row.amount - cut).toFixed(2));
    remaining = Number((remaining - cut).toFixed(2));
  }
  // No (or not enough) cash — fall back to the largest legs.
  if (remaining > 0) {
    for (const row of [...rows].sort((a, b) => b.amount - a.amount)) {
      if (remaining <= 0) break;
      const cut = Math.min(row.amount, remaining);
      row.amount = Number((row.amount - cut).toFixed(2));
      remaining = Number((remaining - cut).toFixed(2));
    }
  }
  return rows.filter((r) => r.amount > 0.0001);
}

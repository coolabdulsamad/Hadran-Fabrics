import { count } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { expenses } from "@db/schema";
import { recordMoneyMovement } from "./money.service";
import type { ExpenseCategory, PaymentMethod, Section } from "@contracts/constants";

/**
 * HADRAN FABRICS MALL — expense recording service.
 * Shared by the expenses router (direct record) and the approval workflow
 * (applying a manager's approved EXPENSE_RECORD request). One transaction:
 * expense row + matching OUT row in the money ledger.
 */

export interface ExpenseRecordInput {
  section: Section;
  category: ExpenseCategory;
  description: string;
  vendor?: string | null;
  amount: number;
  paymentMethod: PaymentMethod;
  expenseDate: string; // YYYY-MM-DD
  notes?: string | null;
}

export async function applyExpenseRecord(
  input: ExpenseRecordInput,
  actorId: number,
  branchId: number | null,
): Promise<{ expenseId: number; refNo: string }> {
  const db = getDb();

  return db.transaction(async (tx) => {
    const [countRow] = await tx.select({ value: count() }).from(expenses);
    const refNo = `EXP-${String((countRow?.value ?? 0) + 1).padStart(6, "0")}`;

    const [row] = await tx
      .insert(expenses)
      .values({
        refNo,
        section: input.section,
        branchId,
        category: input.category,
        description: input.description.trim(),
        vendor: input.vendor?.trim() || null,
        amount: input.amount.toFixed(2),
        paymentMethod: input.paymentMethod,
        expenseDate: input.expenseDate,
        notes: input.notes?.trim() || null,
        status: "ACTIVE",
        recordedBy: actorId,
      })
      .$returningId();

    await recordMoneyMovement(
      {
        direction: "OUT",
        section: input.section,
        branchId,
        sourceType: "EXPENSE",
        sourceId: row.id,
        sourceRef: refNo,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        note: `Expense: ${input.description.trim()}`,
        createdBy: actorId,
      },
      tx,
    );

    return { expenseId: row.id, refNo };
  });
}

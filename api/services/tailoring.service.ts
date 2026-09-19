import { count, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../queries/connection";
import {
  tailoringOrders,
  tailoringMeasurements,
  tailoringPayments,
  tailoringStatusHistory,
  users,
} from "@db/schema";
import { recordMoneyMovement } from "./money.service";
import type {
  FabricSource,
  OrderPaymentStatus,
  PaymentMethod,
  TailoringOrderStatus,
} from "@contracts/constants";

/**
 * HADRAN FABRICS MALL — tailoring service
 * All tailoring writes live here so the router, and any future approval
 * workflow, share one transactional implementation:
 *
 *   createTailoringOrder   → order + measurements + optional deposit
 *   addTailoringPayment    → payment + order totals + money ledger row
 *   advanceTailoringStatus → workflow move + history trail
 *   assignTailor           → assign/reassign the tailor on a job
 *   cancelTailoringOrder   → cancel + automatic refund of any payments
 *
 * Every payment writes a matching IN row to the money ledger; a
 * cancellation refund writes the compensating OUT row — the ledger can
 * never drift from what the tailoring desk actually collected.
 */

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

export interface CreateTailoringOrderInput {
  customerId?: number | null;
  customerName: string;
  customerPhone?: string | null;
  styleDescription: string;
  styleImageUrl?: string | null;
  fabricSource: FabricSource;
  tailorId?: number | null;
  dueDate?: string | null; // YYYY-MM-DD
  price: number;
  notes?: string | null;
  measurements?: { label?: string; values: Record<string, number | string> } | null;
  deposit?: { amount: number; method: PaymentMethod } | null;
}

async function nextOrderNo(tx: Tx): Promise<string> {
  const [row] = await tx.select({ value: count() }).from(tailoringOrders);
  return `TLR-${String((row?.value ?? 0) + 1).padStart(6, "0")}`;
}

function paymentStatusFor(amountPaid: number, price: number): OrderPaymentStatus {
  if (amountPaid <= 0) return "UNPAID";
  if (amountPaid < price - 0.0001) return "PART_PAID";
  return "PAID";
}

/** Create a tailoring order with measurements and an optional deposit. */
export async function createTailoringOrder(
  input: CreateTailoringOrderInput,
  actorId: number,
  branchId: number | null,
): Promise<{ orderId: number; orderNo: string }> {
  const db = getDb();

  const price = Math.max(input.price, 0);
  const depositAmount = Math.min(Math.max(input.deposit?.amount ?? 0, 0), price);

  return db.transaction(async (tx) => {
    if (input.tailorId) {
      const [tailor] = await tx
        .select({ id: users.id, status: users.status })
        .from(users)
        .where(eq(users.id, input.tailorId))
        .limit(1);
      if (!tailor) throw new TRPCError({ code: "BAD_REQUEST", message: "Selected tailor does not exist." });
      if (tailor.status !== "ACTIVE") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selected tailor is not an active staff member." });
      }
    }

    const orderNo = await nextOrderNo(tx);

    const [order] = await tx
      .insert(tailoringOrders)
      .values({
        orderNo,
        branchId,
        customerId: input.customerId ?? null,
        customerName: input.customerName.trim(),
        customerPhone: input.customerPhone?.trim() || null,
        styleDescription: input.styleDescription.trim(),
        styleImageUrl: input.styleImageUrl?.trim() || null,
        fabricSource: input.fabricSource,
        tailorId: input.tailorId ?? null,
        dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00`) : null,
        price: price.toFixed(2),
        amountPaid: depositAmount.toFixed(2),
        paymentStatus: paymentStatusFor(depositAmount, price),
        notes: input.notes?.trim() || null,
        receivedBy: actorId,
      })
      .$returningId();

    if (input.measurements && Object.keys(input.measurements.values).length > 0) {
      await tx.insert(tailoringMeasurements).values({
        orderId: order.id,
        label: input.measurements.label?.trim() || "Standard",
        measurements: input.measurements.values,
        recordedBy: actorId,
      });
    }

    await tx.insert(tailoringStatusHistory).values({
      orderId: order.id,
      fromStatus: null,
      toStatus: "RECEIVED",
      changedBy: actorId,
      note: "Order received at the tailoring desk.",
    });

    if (depositAmount > 0 && input.deposit) {
      await tx.insert(tailoringPayments).values({
        orderId: order.id,
        amount: depositAmount.toFixed(2),
        method: input.deposit.method,
        receivedBy: actorId,
        note: "Deposit at intake",
      });
      await recordMoneyMovement(
        {
          direction: "IN",
          section: "TAILORING",
          branchId,
          sourceType: "TAILORING_PAYMENT",
          sourceId: order.id,
          sourceRef: orderNo,
          amount: depositAmount,
          paymentMethod: input.deposit.method,
          note: `Tailoring deposit — ${input.customerName.trim()} (${orderNo})`,
          createdBy: actorId,
        },
        tx,
      );
    }

    return { orderId: order.id, orderNo };
  });
}

/** Take a payment against an order's outstanding balance. */
export async function addTailoringPayment(
  orderId: number,
  amount: number,
  method: PaymentMethod,
  note: string | null,
  actorId: number,
): Promise<{ paymentId: number; amountPaid: number; balance: number; paymentStatus: OrderPaymentStatus }> {
  const db = getDb();

  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(tailoringOrders).where(eq(tailoringOrders.id, orderId)).limit(1);
    if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Tailoring order not found." });
    if (order.status === "CANCELLED") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot take payment on a cancelled order." });
    }

    const price = Number(order.price);
    const paidSoFar = Number(order.amountPaid);
    const balance = Number((price - paidSoFar).toFixed(2));
    if (amount > balance + 0.0001) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Amount exceeds the outstanding balance of ₦${balance.toLocaleString()}.`,
      });
    }

    const [payment] = await tx
      .insert(tailoringPayments)
      .values({ orderId, amount: amount.toFixed(2), method, receivedBy: actorId, note })
      .$returningId();

    const newPaid = Number((paidSoFar + amount).toFixed(2));
    const newStatus = paymentStatusFor(newPaid, price);
    await tx
      .update(tailoringOrders)
      .set({ amountPaid: newPaid.toFixed(2), paymentStatus: newStatus })
      .where(eq(tailoringOrders.id, orderId));

    await recordMoneyMovement(
      {
        direction: "IN",
        section: "TAILORING",
        branchId: order.branchId ?? null,
        sourceType: "TAILORING_PAYMENT",
        sourceId: orderId,
        sourceRef: order.orderNo,
        amount,
        paymentMethod: method,
        note: `Tailoring payment — ${order.customerName} (${order.orderNo})`,
        createdBy: actorId,
      },
      tx,
    );

    return { paymentId: payment.id, amountPaid: newPaid, balance: Number((price - newPaid).toFixed(2)), paymentStatus: newStatus };
  });
}

/**
 * Move an order through the workflow. Moves are free-order (staff may skip
 * stages — e.g. a simple alteration goes straight to FINISHING) but never
 * out of a terminal state, and delivery requires the bill to be fully paid.
 */
export async function advanceTailoringStatus(
  orderId: number,
  toStatus: TailoringOrderStatus,
  note: string | null,
  actorId: number,
): Promise<{ fromStatus: TailoringOrderStatus; toStatus: TailoringOrderStatus }> {
  const db = getDb();

  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(tailoringOrders).where(eq(tailoringOrders.id, orderId)).limit(1);
    if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Tailoring order not found." });

    const from = order.status;
    if (from === "DELIVERED" || from === "CANCELLED") {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Order is already ${from.toLowerCase()} — no further moves.` });
    }
    if (toStatus === "CANCELLED") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Use the cancel action so refunds are handled properly." });
    }
    if (toStatus === from) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Order is already at that stage." });
    }
    if (toStatus === "DELIVERED" && order.paymentStatus !== "PAID") {
      const balance = Number((Number(order.price) - Number(order.amountPaid)).toFixed(2));
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Customer still owes ₦${balance.toLocaleString()} — collect the balance before delivering the garment.`,
      });
    }

    await tx
      .update(tailoringOrders)
      .set({ status: toStatus, deliveredAt: toStatus === "DELIVERED" ? new Date() : order.deliveredAt })
      .where(eq(tailoringOrders.id, orderId));

    await tx.insert(tailoringStatusHistory).values({
      orderId,
      fromStatus: from,
      toStatus,
      changedBy: actorId,
      note,
    });

    return { fromStatus: from, toStatus };
  });
}

/** Assign (or reassign) the tailor responsible for a job. */
export async function assignTailor(
  orderId: number,
  tailorId: number | null,
  actorId: number,
  note?: string | null,
): Promise<{ tailorId: number | null }> {
  const db = getDb();

  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(tailoringOrders).where(eq(tailoringOrders.id, orderId)).limit(1);
    if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Tailoring order not found." });
    if (order.status === "DELIVERED" || order.status === "CANCELLED") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot reassign a delivered or cancelled order." });
    }

    let tailorName: string | null = null;
    if (tailorId) {
      const [tailor] = await tx
        .select({ id: users.id, fullName: users.fullName, status: users.status })
        .from(users)
        .where(eq(users.id, tailorId))
        .limit(1);
      if (!tailor) throw new TRPCError({ code: "BAD_REQUEST", message: "Selected tailor does not exist." });
      if (tailor.status !== "ACTIVE") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selected tailor is not an active staff member." });
      }
      tailorName = tailor.fullName;
    }

    await tx.update(tailoringOrders).set({ tailorId }).where(eq(tailoringOrders.id, orderId));

    await tx.insert(tailoringStatusHistory).values({
      orderId,
      fromStatus: order.status,
      toStatus: order.status,
      changedBy: actorId,
      note: note?.trim() || (tailorId ? `Assigned to ${tailorName}.` : "Tailor unassigned."),
    });

    return { tailorId };
  });
}

/** Add or replace the measurement set on an order (before delivery). */
export async function saveMeasurements(
  orderId: number,
  values: Record<string, number | string>,
  label: string,
  actorId: number,
): Promise<{ measurementId: number }> {
  const db = getDb();

  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(tailoringOrders).where(eq(tailoringOrders.id, orderId)).limit(1);
    if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Tailoring order not found." });
    if (order.status === "DELIVERED" || order.status === "CANCELLED") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot edit measurements on a delivered or cancelled order." });
    }

    const [existing] = await tx
      .select({ id: tailoringMeasurements.id })
      .from(tailoringMeasurements)
      .where(eq(tailoringMeasurements.orderId, orderId))
      .limit(1);

    if (existing) {
      await tx
        .update(tailoringMeasurements)
        .set({ measurements: values, label: label || "Standard", recordedBy: actorId })
        .where(eq(tailoringMeasurements.id, existing.id));
      return { measurementId: existing.id };
    }

    const [row] = await tx
      .insert(tailoringMeasurements)
      .values({ orderId, label: label || "Standard", measurements: values, recordedBy: actorId })
      .$returningId();
    return { measurementId: row.id };
  });
}

/** Cancel an order; any money already taken is refunded automatically. */
export async function cancelTailoringOrder(
  orderId: number,
  reason: string,
  actorId: number,
): Promise<{ refunded: number }> {
  const db = getDb();

  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(tailoringOrders).where(eq(tailoringOrders.id, orderId)).limit(1);
    if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Tailoring order not found." });
    if (order.status === "CANCELLED") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This order is already cancelled." });
    }
    if (order.status === "DELIVERED") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Garment already delivered — the order can no longer be cancelled." });
    }

    const from = order.status;
    const paid = Number(order.amountPaid);

    if (paid > 0) {
      // Negative payment row keeps the order's own trail honest…
      await tx.insert(tailoringPayments).values({
        orderId,
        amount: (-paid).toFixed(2),
        method: "CASH",
        receivedBy: actorId,
        note: `Refund on cancellation — ${reason}`,
      });
      // …and the ledger gets the compensating OUT row.
      await recordMoneyMovement(
        {
          direction: "OUT",
          section: "TAILORING",
          branchId: order.branchId ?? null,
          sourceType: "TAILORING_PAYMENT",
          sourceId: orderId,
          sourceRef: order.orderNo,
          amount: paid,
          paymentMethod: "CASH",
          note: `Tailoring refund — cancelled ${order.orderNo}: ${reason}`,
          createdBy: actorId,
        },
        tx,
      );
    }

    await tx
      .update(tailoringOrders)
      .set({
        status: "CANCELLED",
        cancelledReason: reason,
        amountPaid: "0.00",
        paymentStatus: "UNPAID",
      })
      .where(eq(tailoringOrders.id, orderId));

    await tx.insert(tailoringStatusHistory).values({
      orderId,
      fromStatus: from,
      toStatus: "CANCELLED",
      changedBy: actorId,
      note: reason,
    });

    return { refunded: paid };
  });
}

import { count, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../queries/connection";
import { laundryOrders, laundryOrderItems, laundryPayments, laundryStatusHistory } from "@db/schema";
import { recordMoneyMovement } from "./money.service";
import type {
  LaundryOrderStatus,
  LaundryServiceType,
  OrderPaymentStatus,
  PaymentMethod,
} from "@contracts/constants";

/**
 * HADRAN FABRICS MALL — laundry service
 * All laundry writes live here so the router, and any future approval
 * workflow, share one transactional implementation:
 *
 *   createLaundryOrder   → order + garment lines + optional deposit
 *   addLaundryPayment    → payment + order totals + money ledger row
 *   advanceLaundryStatus → workflow move + history trail
 *   cancelLaundryOrder   → cancel + automatic refund of any payments
 *
 * Every payment writes a matching IN row to the money ledger; a
 * cancellation refund writes the compensating OUT row — the ledger can
 * never drift from what the laundry desk actually collected.
 */

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

export interface LaundryOrderItemInput {
  garmentType: string;
  description?: string | null;
  serviceType: LaundryServiceType;
  quantity: number;
  unitPrice: number;
  conditionNotes?: string | null;
}

export interface CreateLaundryOrderInput {
  customerId?: number | null;
  customerName: string;
  customerPhone?: string | null;
  priority: "NORMAL" | "EXPRESS";
  dueDate?: string | null; // YYYY-MM-DD
  discountAmount?: number;
  notes?: string | null;
  items: LaundryOrderItemInput[];
  deposit?: { amount: number; method: PaymentMethod } | null;
}

async function nextOrderNo(tx: Tx): Promise<string> {
  const [row] = await tx.select({ value: count() }).from(laundryOrders);
  return `LND-${String((row?.value ?? 0) + 1).padStart(6, "0")}`;
}

function paymentStatusFor(amountPaid: number, totalAmount: number): OrderPaymentStatus {
  if (amountPaid <= 0) return "UNPAID";
  if (amountPaid < totalAmount - 0.0001) return "PART_PAID";
  return "PAID";
}

/** Create a laundry order with garment lines and an optional deposit. */
export async function createLaundryOrder(
  input: CreateLaundryOrderInput,
  actorId: number,
  branchId: number | null,
): Promise<{ orderId: number; orderNo: string }> {
  const db = getDb();

  const subtotal = input.items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
  const discount = Math.min(Math.max(input.discountAmount ?? 0, 0), subtotal);
  const total = Number((subtotal - discount).toFixed(2));
  const depositAmount = Math.min(Math.max(input.deposit?.amount ?? 0, 0), total);

  return db.transaction(async (tx) => {
    const orderNo = await nextOrderNo(tx);

    const [order] = await tx
      .insert(laundryOrders)
      .values({
        orderNo,
        branchId,
        customerId: input.customerId ?? null,
        customerName: input.customerName.trim(),
        customerPhone: input.customerPhone?.trim() || null,
        status: "RECEIVED",
        priority: input.priority,
        dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00`) : null,
        subtotal: subtotal.toFixed(2),
        discountAmount: discount.toFixed(2),
        totalAmount: total.toFixed(2),
        amountPaid: depositAmount.toFixed(2),
        paymentStatus: paymentStatusFor(depositAmount, total),
        notes: input.notes?.trim() || null,
        receivedBy: actorId,
      })
      .$returningId();

    await tx.insert(laundryOrderItems).values(
      input.items.map((it) => ({
        orderId: order.id,
        garmentType: it.garmentType.trim(),
        description: it.description?.trim() || null,
        serviceType: it.serviceType,
        quantity: it.quantity,
        unitPrice: it.unitPrice.toFixed(2),
        lineTotal: (it.quantity * it.unitPrice).toFixed(2),
        conditionNotes: it.conditionNotes?.trim() || null,
      })),
    );

    await tx.insert(laundryStatusHistory).values({
      orderId: order.id,
      fromStatus: null,
      toStatus: "RECEIVED",
      changedBy: actorId,
      note: "Order received at the laundry desk.",
    });

    if (depositAmount > 0 && input.deposit) {
      await tx.insert(laundryPayments).values({
        orderId: order.id,
        amount: depositAmount.toFixed(2),
        method: input.deposit.method,
        receivedBy: actorId,
        note: "Deposit at intake",
      });
      await recordMoneyMovement(
        {
          direction: "IN",
          section: "LAUNDRY",
          branchId,
          sourceType: "LAUNDRY_PAYMENT",
          sourceId: order.id,
          sourceRef: orderNo,
          amount: depositAmount,
          paymentMethod: input.deposit.method,
          note: `Laundry deposit — ${input.customerName.trim()} (${orderNo})`,
          createdBy: actorId,
        },
        tx,
      );
    }

    return { orderId: order.id, orderNo };
  });
}

/** Take a payment against an order's outstanding balance. */
export async function addLaundryPayment(
  orderId: number,
  amount: number,
  method: PaymentMethod,
  note: string | null,
  actorId: number,
): Promise<{ paymentId: number; amountPaid: number; balance: number; paymentStatus: OrderPaymentStatus }> {
  const db = getDb();

  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(laundryOrders).where(eq(laundryOrders.id, orderId)).limit(1);
    if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Laundry order not found." });
    if (order.status === "CANCELLED") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot take payment on a cancelled order." });
    }

    const total = Number(order.totalAmount);
    const paidSoFar = Number(order.amountPaid);
    const balance = Number((total - paidSoFar).toFixed(2));
    if (amount > balance + 0.0001) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Amount exceeds the outstanding balance of ₦${balance.toLocaleString()}.`,
      });
    }

    const [payment] = await tx
      .insert(laundryPayments)
      .values({ orderId, amount: amount.toFixed(2), method, receivedBy: actorId, note })
      .$returningId();

    const newPaid = Number((paidSoFar + amount).toFixed(2));
    const newStatus = paymentStatusFor(newPaid, total);
    await tx
      .update(laundryOrders)
      .set({ amountPaid: newPaid.toFixed(2), paymentStatus: newStatus })
      .where(eq(laundryOrders.id, orderId));

    await recordMoneyMovement(
      {
        direction: "IN",
        section: "LAUNDRY",
        branchId: order.branchId ?? null,
        sourceType: "LAUNDRY_PAYMENT",
        sourceId: orderId,
        sourceRef: order.orderNo,
        amount,
        paymentMethod: method,
        note: `Laundry payment — ${order.customerName} (${order.orderNo})`,
        createdBy: actorId,
      },
      tx,
    );

    return { paymentId: payment.id, amountPaid: newPaid, balance: Number((total - newPaid).toFixed(2)), paymentStatus: newStatus };
  });
}

/**
 * Move an order through the workflow. Moves are free-order (staff may skip
 * stages — e.g. iron-only jobs never enter WASHING) but never out of a
 * terminal state, and collection requires the bill to be fully paid.
 */
export async function advanceLaundryStatus(
  orderId: number,
  toStatus: LaundryOrderStatus,
  note: string | null,
  actorId: number,
): Promise<{ fromStatus: LaundryOrderStatus; toStatus: LaundryOrderStatus }> {
  const db = getDb();

  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(laundryOrders).where(eq(laundryOrders.id, orderId)).limit(1);
    if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Laundry order not found." });

    const from = order.status;
    if (from === "COLLECTED" || from === "CANCELLED") {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Order is already ${from.toLowerCase()} — no further moves.` });
    }
    if (toStatus === "CANCELLED") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Use the cancel action so refunds are handled properly." });
    }
    if (toStatus === from) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Order is already at that stage." });
    }
    if (toStatus === "COLLECTED" && order.paymentStatus !== "PAID") {
      const balance = Number((Number(order.totalAmount) - Number(order.amountPaid)).toFixed(2));
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Customer still owes ₦${balance.toLocaleString()} — collect the balance before releasing the garments.`,
      });
    }

    await tx
      .update(laundryOrders)
      .set({ status: toStatus, collectedAt: toStatus === "COLLECTED" ? new Date() : order.collectedAt })
      .where(eq(laundryOrders.id, orderId));

    await tx.insert(laundryStatusHistory).values({
      orderId,
      fromStatus: from,
      toStatus,
      changedBy: actorId,
      note,
    });

    return { fromStatus: from, toStatus };
  });
}

/** Cancel an order; any money already taken is refunded automatically. */
export async function cancelLaundryOrder(
  orderId: number,
  reason: string,
  actorId: number,
): Promise<{ refunded: number }> {
  const db = getDb();

  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(laundryOrders).where(eq(laundryOrders.id, orderId)).limit(1);
    if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Laundry order not found." });
    if (order.status === "CANCELLED") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This order is already cancelled." });
    }
    if (order.status === "COLLECTED") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Garments already collected — the order can no longer be cancelled." });
    }

    const from = order.status;
    const paid = Number(order.amountPaid);

    if (paid > 0) {
      // Negative payment row keeps the order's own trail honest…
      await tx.insert(laundryPayments).values({
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
          section: "LAUNDRY",
          branchId: order.branchId ?? null,
          sourceType: "LAUNDRY_PAYMENT",
          sourceId: orderId,
          sourceRef: order.orderNo,
          amount: paid,
          paymentMethod: "CASH",
          note: `Laundry refund — cancelled ${order.orderNo}: ${reason}`,
          createdBy: actorId,
        },
        tx,
      );
    }

    await tx
      .update(laundryOrders)
      .set({
        status: "CANCELLED",
        cancelledReason: reason,
        amountPaid: "0.00",
        paymentStatus: "UNPAID",
      })
      .where(eq(laundryOrders.id, orderId));

    await tx.insert(laundryStatusHistory).values({
      orderId,
      fromStatus: from,
      toStatus: "CANCELLED",
      changedBy: actorId,
      note: reason,
    });

    return { refunded: paid };
  });
}

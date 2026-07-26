import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, gte, inArray, like, lt, sql, type SQL } from "drizzle-orm";
import { createRouter } from "../middleware";
import { authedProcedure, permissionProcedure } from "../trpc";
import { getDb } from "../queries/connection";
import {
  customers,
  products,
  saleItems,
  salePayments,
  sales,
  settings,
  users,
} from "@db/schema";
import { recordMovement } from "../services/inventory.service";
import { voidSale } from "../services/sales-void.service";
import { isApprovalGated, submitApproval } from "../services/approvals.service";
import { logAudit, requestMeta } from "../services/audit.service";
import { checkoutSchema } from "@contracts/pos";
import type { ReceiptConfig, ReceiptData } from "@contracts/receipts";
import { STORE, SALE_STATUSES } from "@contracts/constants";

/**
 * HADRAN FABRICS MALL — sales router
 * POS checkout (transactional: sale + items + payments + stock ledger +
 * customer stats), held sales, cashier history, voids and receipt data.
 */

/* ------------------------------ helpers ------------------------------ */

async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const db = getDb();
  const row = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  if (!row[0]) return fallback;
  try {
    return JSON.parse(row[0].value) as T;
  } catch {
    return fallback;
  }
}

async function nextReceiptNo(): Promise<string> {
  const db = getDb();
  const prefix = await readSetting("sales.receipt_prefix", "RCP");
  const day = new Date();
  const dayStamp = `${day.getFullYear()}${String(day.getMonth() + 1).padStart(2, "0")}${String(day.getDate()).padStart(2, "0")}`;
  // Use the highest existing suffix (not a row count) — held sales that get
  // deleted or completed would otherwise cause duplicate receipt numbers.
  const [row] = await db
    .select({ maxNo: sql<string | null>`MAX(${sales.receiptNo})` })
    .from(sales)
    .where(like(sales.receiptNo, `${prefix}-${dayStamp}-%`));
  const lastSuffix = row?.maxNo ? Number(row.maxNo.split("-").pop()) : 0;
  const next = (Number.isFinite(lastSuffix) ? lastSuffix : 0) + 1;
  return `${prefix}-${dayStamp}-${String(next).padStart(4, "0")}`;
}

async function loadReceiptConfig(): Promise<ReceiptConfig> {
  const [name, tagline, motto, address, phone, symbol, showCashier, showCustomer, footerNote, returnPolicy, width] =
    await Promise.all([
      readSetting("store.name", STORE.name),
      readSetting("store.tagline", STORE.tagline),
      readSetting("store.motto", STORE.motto),
      readSetting("store.address", STORE.address),
      readSetting("store.phone", ""),
      readSetting("store.currency_symbol", STORE.currencySymbol),
      readSetting("receipt.show_cashier", true),
      readSetting("receipt.show_customer", true),
      readSetting("receipt.footer_note", "Thank you for shopping with us — Luxury in every visit."),
      readSetting("receipt.return_policy", ""),
      readSetting("receipt.paper_width_mm", 80),
    ]);
  return {
    storeName: name as string,
    tagline: tagline as string,
    motto: motto as string,
    address: address as string,
    phone: phone as string,
    currencySymbol: symbol as string,
    footerNote: footerNote as string,
    returnPolicy: returnPolicy as string,
    showCashier: showCashier as boolean,
    showCustomer: showCustomer as boolean,
    paperWidthMm: width as number,
  };
}

/* ------------------------------- router ------------------------------ */

export const salesRouter = createRouter({
  /** POS config: settings the terminal needs (limits, rates, receipt, hardware). */
  posConfig: permissionProcedure("pos.sell").query(async () => {
    const [vat, svc, maxItem, maxCart, allowOverride, pointPer, loyaltyEnabled, paperCheck, scannerEnabled, scannerSuffix, scannerMinLength] =
      await Promise.all([
        readSetting("sales.vat_rate", STORE.defaultVatRate),
        readSetting("sales.service_charge_rate", 0),
        readSetting("sales.max_item_discount_percent", 20),
        readSetting("sales.max_cart_discount_percent", 30),
        readSetting("sales.allow_price_override", false),
        readSetting("sales.loyalty_point_per", 1000),
        readSetting("sales.loyalty_enabled", true),
        readSetting("hardware.printer_paper_check", true),
        readSetting("hardware.scanner_enabled", true),
        readSetting("hardware.scanner_suffix", "ENTER"),
        readSetting("hardware.scanner_min_length", 6),
      ]);
    return {
      vatRate: vat as number,
      serviceChargeRate: svc as number,
      maxItemDiscountPercent: maxItem as number,
      maxCartDiscountPercent: maxCart as number,
      allowPriceOverride: allowOverride as boolean,
      loyaltyPointPer: pointPer as number,
      loyaltyEnabled: loyaltyEnabled as boolean,
      printerPaperCheck: paperCheck as boolean,
      scannerEnabled: scannerEnabled as boolean,
      scannerSuffix: scannerSuffix as "ENTER" | "TAB",
      scannerMinLength: scannerMinLength as number,
      receipt: await loadReceiptConfig(),
    };
  }),

  /* ------------------------------ CHECKOUT ------------------------------ */
  checkout: permissionProcedure("pos.sell")
    .input(checkoutSchema)
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const meta = requestMeta(ctx.req);

      // ----- load products -----
      const ids = input.items.map((i) => i.productId);
      const catalog = await db.select().from(products).where(inArray(products.id, ids));
      const byId = new Map(catalog.map((p) => [p.id, p]));

      // ----- settings / limits -----
      const [maxItemPct, maxCartPct, svcRate, pointPer, loyaltyEnabled, allowOverrideSetting, vatRate] =
        await Promise.all([
          readSetting("sales.max_item_discount_percent", 20),
          readSetting("sales.max_cart_discount_percent", 30),
          readSetting("sales.service_charge_rate", 0),
          readSetting("sales.loyalty_point_per", 1000),
          readSetting("sales.loyalty_enabled", true),
          readSetting("sales.allow_price_override", false),
          readSetting("sales.vat_rate", STORE.defaultVatRate),
        ]);
      const canOverridePrice = ctx.permissions.has("pos.override_price") && allowOverrideSetting;

      // ----- customer (special customer discount) -----
      let customer: typeof customers.$inferSelect | null = null;
      if (input.customerId) {
        if (!ctx.permissions.has("pos.attach_customer")) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You don't have permission to attach customers to sales." });
        }
        const found = await db.select().from(customers).where(eq(customers.id, input.customerId)).limit(1);
        customer = found[0] ?? null;
        if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found." });
        if (customer.status !== "ACTIVE") throw new TRPCError({ code: "BAD_REQUEST", message: "This customer is not active." });
      }

      // ----- compute lines -----
      interface ComputedLine {
        product: (typeof catalog)[number];
        quantity: number;
        unitPrice: number;
        discountAmount: number;
        isMeasuredCut: boolean;
        lineNet: number;
        taxAmount: number;
        lineTotal: number;
      }

      const lines: ComputedLine[] = [];
      let itemDiscountTotal = 0;

      for (const item of input.items) {
        const product = byId.get(item.productId);
        if (!product) throw new TRPCError({ code: "NOT_FOUND", message: `Product #${item.productId} not found.` });
        if (product.status !== "ACTIVE") {
          throw new TRPCError({ code: "BAD_REQUEST", message: `"${product.name}" is not active and cannot be sold.` });
        }
        if (!product.allowFractional && Math.abs(item.quantity % 1) > 0.0001) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `"${product.name}" is sold in whole ${product.unitOfMeasure.toLowerCase()}s only.` });
        }
        if (item.quantity > product.currentStock + 0.0001) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Insufficient stock for "${product.name}" — only ${product.currentStock} ${product.unitOfMeasure.toLowerCase()}(s) available.`,
          });
        }

        const unitPrice =
          canOverridePrice && item.unitPrice != null ? item.unitPrice : product.sellingPrice;

        let discount = Math.min(item.discountAmount, unitPrice * item.quantity);
        if (discount > 0) {
          if (!product.discountEligible) {
            throw new TRPCError({ code: "BAD_REQUEST", message: `"${product.name}" is not eligible for discounts.` });
          }
          if (!ctx.permissions.has("pos.apply_item_discount")) {
            throw new TRPCError({ code: "FORBIDDEN", message: "You don't have permission to give item discounts." });
          }
          const cap = (maxItemPct / 100) * unitPrice * item.quantity;
          if (discount > cap + 0.01) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Item discount exceeds the ${maxItemPct}% limit for "${product.name}" (max ₦${cap.toFixed(2)}).`,
            });
          }
          discount = Number(discount.toFixed(2));
        }

        const lineNet = Number((unitPrice * item.quantity - discount).toFixed(2));
        itemDiscountTotal += discount;
        lines.push({
          product,
          quantity: item.quantity,
          unitPrice,
          discountAmount: discount,
          isMeasuredCut: item.isMeasuredCut,
          lineNet,
          taxAmount: 0, // computed after cart-level discounts
          lineTotal: 0,
        });
      }

      const subtotal = Number(lines.reduce((s, l) => s + l.lineNet, 0).toFixed(2));

      // ----- cart-level discounts -----
      let cartDiscount = Math.min(input.cartDiscountAmount, subtotal);
      if (cartDiscount > 0) {
        if (!ctx.permissions.has("pos.apply_cart_discount")) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You don't have permission to give cart discounts." });
        }
        const cap = (maxCartPct / 100) * subtotal;
        if (cartDiscount > cap + 0.01) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Cart discount exceeds the ${maxCartPct}% limit (max ₦${cap.toFixed(2)}).`,
          });
        }
        cartDiscount = Number(cartDiscount.toFixed(2));
      }

      const customerDiscount = customer
        ? Number((((customer.discountPercent ?? 0) / 100) * (subtotal - cartDiscount)).toFixed(2))
        : 0;

      // ----- tax (proportional share of cart-level discounts per line) -----
      const cartLevelTotal = cartDiscount + customerDiscount;
      const ratio = subtotal > 0 ? 1 - cartLevelTotal / subtotal : 1;
      let taxTotal = 0;
      for (const line of lines) {
        const taxable = line.lineNet * ratio;
        // taxRate 0 = inherit the store VAT setting; taxExempt = never taxed.
        const effRate = line.product.taxExempt ? 0 : (line.product.taxRate > 0 ? line.product.taxRate : (vatRate as number));
        line.taxAmount = Number(((taxable * effRate) / 100).toFixed(2));
        line.lineTotal = Number((line.lineNet * ratio + line.taxAmount).toFixed(2));
        taxTotal += line.taxAmount;
      }
      taxTotal = Number(taxTotal.toFixed(2));

      const serviceCharge = Number((((subtotal - cartLevelTotal) * svcRate) / 100).toFixed(2));
      const grandTotal = Number((subtotal - cartLevelTotal + taxTotal + serviceCharge).toFixed(2));

      // ----- payments -----
      const paid = Number(input.payments.reduce((s, p) => s + p.amount, 0).toFixed(2));
      if (paid < grandTotal - 0.01) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Payments (₦${paid.toFixed(2)}) do not cover the total (₦${grandTotal.toFixed(2)}).`,
        });
      }
      const changeGiven = Number(Math.max(0, paid - grandTotal).toFixed(2));

      const receiptNo = await nextReceiptNo();
      const discountTotal = Number((itemDiscountTotal + cartLevelTotal).toFixed(2));

      // ----- transactional write -----
      const saleId = await db.transaction(async (tx) => {
        const [saleRow] = await tx
          .insert(sales)
          .values({
            receiptNo,
            cashierId: ctx.user.id,
            customerId: customer?.id ?? null,
            status: "COMPLETED",
            itemCount: lines.reduce((s, l) => s + l.quantity, 0),
            subtotal,
            discountTotal,
            discountNote: input.cartDiscountNote ?? null,
            taxTotal,
            serviceCharge,
            grandTotal,
            amountTendered: paid,
            changeGiven,
            notes: input.notes ?? null,
            completedAt: new Date(),
          })
          .$returningId();

        await tx.insert(saleItems).values(
          lines.map((l) => ({
            saleId: saleRow.id,
            productId: l.product.id,
            productName: l.product.name,
            sku: l.product.sku,
            quantity: l.quantity,
            unit: l.product.unitOfMeasure,
            isMeasuredCut: l.isMeasuredCut,
            unitPrice: l.unitPrice,
            costPrice: l.product.costPrice,
            discountAmount: l.discountAmount,
            taxAmount: l.taxAmount,
            lineTotal: l.lineTotal,
          })),
        );

        await tx.insert(salePayments).values(
          input.payments.map((p) => ({
            saleId: saleRow.id,
            method: p.method,
            amount: p.amount,
            reference: p.reference ?? null,
          })),
        );

        // stock ledger — one signed movement per line
        for (const l of lines) {
          await recordMovement(
            {
              productId: l.product.id,
              movementType: "SALE",
              quantity: -l.quantity,
              referenceType: "SALE",
              referenceId: saleRow.id,
              reason: `Sale ${receiptNo}`,
              performedBy: ctx.user.id,
            },
            tx,
          );
        }

        // customer stats + loyalty
        if (customer) {
          const earned = loyaltyEnabled ? Math.floor(grandTotal / pointPer) : 0;
          await tx
            .update(customers)
            .set({
              totalSpent: Number((customer.totalSpent + grandTotal).toFixed(2)),
              visitCount: customer.visitCount + 1,
              lastVisitAt: new Date(),
              loyaltyPoints: customer.loyaltyPoints + earned,
            })
            .where(eq(customers.id, customer.id));
        }

        // completing a held sale? remove the parked record
        if (input.heldSaleId) {
          await tx.delete(saleItems).where(eq(saleItems.saleId, input.heldSaleId));
          await tx.delete(sales).where(and(eq(sales.id, input.heldSaleId), eq(sales.status, "HELD")));
        }

        return saleRow.id;
      });

      await logAudit({
        actorId: ctx.user.id,
        action: "sale.create",
        entityType: "SALE",
        entityId: saleId,
        description: `Sale ${receiptNo} — ${lines.length} line(s), total ₦${grandTotal.toLocaleString()}, paid ₦${paid.toLocaleString()}${customer ? `, customer ${customer.fullName}` : ""}.`,
        afterData: { receiptNo, grandTotal, paid, changeGiven, lines: lines.length },
        ...meta,
      });

      return { saleId, receiptNo, grandTotal, amountTendered: paid, changeGiven };
    }),

  /* ----------------------------- HELD SALES ----------------------------- */
  hold: permissionProcedure("pos.hold_sale")
    .input(
      z.object({
        items: z
          .array(
            z.object({
              productId: z.number().int().positive(),
              quantity: z.number().positive(),
              discountAmount: z.number().min(0).default(0),
              isMeasuredCut: z.boolean().default(false),
            }),
          )
          .min(1, "Cart is empty"),
        customerId: z.number().int().positive().nullable().optional(),
        notes: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const catalog = await db.select().from(products).where(inArray(products.id, input.items.map((i) => i.productId)));
      const byId = new Map(catalog.map((p) => [p.id, p]));

      const receiptNo = `HOLD-${Date.now().toString(36).toUpperCase()}`;
      const [row] = await db
        .insert(sales)
        .values({
          receiptNo,
          cashierId: ctx.user.id,
          customerId: input.customerId ?? null,
          status: "HELD",
          itemCount: input.items.reduce((s, i) => s + i.quantity, 0),
          notes: input.notes ?? null,
          heldAt: new Date(),
        })
        .$returningId();

      await db.insert(saleItems).values(
        input.items.map((i) => {
          const p = byId.get(i.productId);
          if (!p) throw new TRPCError({ code: "NOT_FOUND", message: `Product #${i.productId} not found.` });
          const net = Number((p.sellingPrice * i.quantity - i.discountAmount).toFixed(2));
          return {
            saleId: row.id,
            productId: p.id,
            productName: p.name,
            sku: p.sku,
            quantity: i.quantity,
            unit: p.unitOfMeasure,
            isMeasuredCut: i.isMeasuredCut,
            unitPrice: p.sellingPrice,
            costPrice: p.costPrice,
            discountAmount: i.discountAmount,
            taxAmount: 0,
            lineTotal: net,
          };
        }),
      );

      await logAudit({
        actorId: ctx.user.id,
        action: "sale.hold",
        entityType: "SALE",
        entityId: row.id,
        description: `Held sale with ${input.items.length} line(s) — parked for later.`,
        ...requestMeta(ctx.req),
      });
      return { heldSaleId: row.id };
    }),

  heldSales: permissionProcedure("pos.sell").query(async ({ ctx }) => {
    const db = getDb();
    const canSeeAll = ctx.permissions.has("sales.view_all_history");
    return db
      .select({
        id: sales.id,
        receiptNo: sales.receiptNo,
        itemCount: sales.itemCount,
        notes: sales.notes,
        heldAt: sales.heldAt,
        cashierName: users.fullName,
        customerName: customers.fullName,
      })
      .from(sales)
      .leftJoin(users, eq(sales.cashierId, users.id))
      .leftJoin(customers, eq(sales.customerId, customers.id))
      .where(and(eq(sales.status, "HELD"), canSeeAll ? undefined : eq(sales.cashierId, ctx.user.id)))
      .orderBy(desc(sales.heldAt))
      .limit(30);
  }),

  heldById: permissionProcedure("pos.sell")
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getDb();
      const saleRows = await db.select().from(sales).where(and(eq(sales.id, input.id), eq(sales.status, "HELD"))).limit(1);
      if (!saleRows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Held sale not found." });
      const items = await db.select().from(saleItems).where(eq(saleItems.saleId, input.id));
      return { sale: saleRows[0], items };
    }),

  deleteHeld: permissionProcedure("pos.sell")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const held = await db.select().from(sales).where(and(eq(sales.id, input.id), eq(sales.status, "HELD"))).limit(1);
      if (!held[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Held sale not found." });
      if (held[0].cashierId !== ctx.user.id && !ctx.permissions.has("sales.view_all_history")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only discard your own held sales." });
      }
      await db.delete(saleItems).where(eq(saleItems.saleId, input.id));
      await db.delete(sales).where(eq(sales.id, input.id));
      await logAudit({
        actorId: ctx.user.id,
        action: "sale.hold_delete",
        entityType: "SALE",
        entityId: input.id,
        description: `Discarded held sale #${input.id}.`,
        ...requestMeta(ctx.req),
      });
      return { ok: true };
    }),

  /* ------------------------------ HISTORY ------------------------------ */
  myHistory: authedProcedure
    .input(
      z.object({
        status: z.enum(SALE_STATUSES).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(5).max(50).default(15),
      }),
    )
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const conds: SQL[] = [eq(sales.cashierId, ctx.user.id)];
      if (input.status) conds.push(eq(sales.status, input.status));
      const where = and(...conds);

      const [total] = await db.select({ value: count() }).from(sales).where(where);
      const items = await db
        .select({
          id: sales.id,
          receiptNo: sales.receiptNo,
          status: sales.status,
          itemCount: sales.itemCount,
          subtotal: sales.subtotal,
          discountTotal: sales.discountTotal,
          taxTotal: sales.taxTotal,
          grandTotal: sales.grandTotal,
          changeGiven: sales.changeGiven,
          createdAt: sales.createdAt,
          customerName: customers.fullName,
        })
        .from(sales)
        .leftJoin(customers, eq(sales.customerId, customers.id))
        .where(where)
        .orderBy(desc(sales.createdAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      return { items, total: total?.value ?? 0, page: input.page, pageSize: input.pageSize };
    }),

  /** Today's totals for the signed-in cashier. */
  myDailySummary: authedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const [row] = await db
      .select({
        count: count(),
        total: sql<number>`COALESCE(SUM(${sales.grandTotal}), 0)`,
      })
      .from(sales)
      .where(and(eq(sales.cashierId, ctx.user.id), eq(sales.status, "COMPLETED"), gte(sales.createdAt, dayStart), lt(sales.createdAt, new Date(dayStart.getTime() + 86400000))));
    return { todayCount: row?.count ?? 0, todayTotal: Number(row?.total ?? 0) };
  }),

  /* --------------------------- SALE DETAILS ---------------------------- */
  byId: authedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const rows = await db
        .select({
          sale: sales,
          cashierName: users.fullName,
          customerName: customers.fullName,
          customerDiscount: customers.discountPercent,
          voiderName: sql<string | null>`(SELECT full_name FROM users WHERE id = ${sales.voidedBy})`,
        })
        .from(sales)
        .leftJoin(users, eq(sales.cashierId, users.id))
        .leftJoin(customers, eq(sales.customerId, customers.id))
        .where(eq(sales.id, input.id))
        .limit(1);

      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Sale not found." });

      const canSeeAll = ctx.permissions.has("sales.view_all_history");
      if (!canSeeAll && row.sale.cashierId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only view your own sales." });
      }

      const items = await db.select().from(saleItems).where(eq(saleItems.saleId, input.id));
      const payments = await db.select().from(salePayments).where(eq(salePayments.saleId, input.id));

      return { ...row, items, payments, receipt: await loadReceiptConfig() };
    }),

  /** Receipt-shaped data for printing/reprinting. */
  receiptData: authedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }): Promise<ReceiptData & { config: ReceiptConfig }> => {
      const db = getDb();
      const rows = await db
        .select({
          sale: sales,
          cashierName: users.fullName,
          customerName: customers.fullName,
          customerDiscount: customers.discountPercent,
        })
        .from(sales)
        .leftJoin(users, eq(sales.cashierId, users.id))
        .leftJoin(customers, eq(sales.customerId, customers.id))
        .where(eq(sales.id, input.id))
        .limit(1);
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Sale not found." });
      if (!ctx.permissions.has("sales.view_all_history") && row.sale.cashierId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only print your own receipts." });
      }

      const items = await db.select().from(saleItems).where(eq(saleItems.saleId, input.id));
      const payments = await db.select().from(salePayments).where(eq(salePayments.saleId, input.id));

      return {
        config: await loadReceiptConfig(),
        receiptNo: row.sale.receiptNo,
        soldAt: row.sale.completedAt ?? row.sale.createdAt,
        cashierName: row.cashierName ?? "Staff",
        customerName: row.customerName,
        customerDiscountPercent: row.customerDiscount ?? 0,
        lines: items.map((i) => ({
          name: i.productName,
          sku: i.sku,
          quantity: i.quantity,
          unit: i.unit,
          isMeasuredCut: i.isMeasuredCut,
          unitPrice: i.unitPrice,
          discountAmount: i.discountAmount,
          taxAmount: i.taxAmount,
          lineTotal: i.lineTotal,
        })),
        itemCount: row.sale.itemCount,
        subtotal: row.sale.subtotal,
        discountTotal: row.sale.discountTotal,
        discountNote: row.sale.discountNote,
        taxTotal: row.sale.taxTotal,
        serviceCharge: row.sale.serviceCharge,
        grandTotal: row.sale.grandTotal,
        payments: payments.map((p) => ({ method: p.method, amount: p.amount, reference: p.reference })),
        amountTendered: row.sale.amountTendered ?? row.sale.grandTotal,
        changeGiven: row.sale.changeGiven ?? 0,
      };
    }),

  /* -------------------------------- VOID -------------------------------- */
  void: permissionProcedure("sales.void")
    .input(
      z.object({
        saleId: z.number().int().positive(),
        reason: z.string().min(3, "A reason is required to void a sale").max(255),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const saleRows = await db.select().from(sales).where(eq(sales.id, input.saleId)).limit(1);
      const sale = saleRows[0];
      if (!sale) throw new TRPCError({ code: "NOT_FOUND", message: "Sale not found." });
      if (sale.status !== "COMPLETED") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only completed sales can be voided." });
      }

      // ---- Manager gate ----
      if (await isApprovalGated(ctx.user.role, "VOID_SALE")) {
        const requestId = await submitApproval({
          requestType: "VOID_SALE",
          entityType: "SALE",
          entityId: input.saleId,
          payload: { saleId: input.saleId, receiptNo: sale.receiptNo, grandTotal: sale.grandTotal, reason: input.reason },
          summary: `Void sale ${sale.receiptNo} (₦${sale.grandTotal.toLocaleString()}) — ${input.reason}`,
          requesterId: ctx.user.id,
        });
        await logAudit({
          actorId: ctx.user.id,
          action: "sale.void.requested",
          entityType: "APPROVAL",
          entityId: requestId,
          description: `${ctx.user.fullName} requested to void sale ${sale.receiptNo} — pending admin approval.`,
          ...requestMeta(ctx.req),
        });
        return { pending: true as const, approvalId: requestId };
      }

      await voidSale(input.saleId, input.reason, ctx.user.id, requestMeta(ctx.req));
      return { pending: false as const };
    }),

  /* -------------------- ALL-STAFF HISTORY (Phase 6) -------------------- */

  /** Cashiers who have at least one sale (for the history filter). */
  cashiers: permissionProcedure("sales.view_all_history").query(async () => {
    const db = getDb();
    return db
      .selectDistinct({ id: users.id, fullName: users.fullName })
      .from(sales)
      .innerJoin(users, eq(sales.cashierId, users.id))
      .orderBy(users.fullName);
  }),

  /** All-staff sales history with rich filters (Manager and above). */
  history: permissionProcedure("sales.view_all_history")
    .input(
      z.object({
        search: z.string().max(60).optional(), // receipt no
        cashierId: z.number().int().positive().optional(),
        customerId: z.number().int().positive().optional(),
        status: z.enum(SALE_STATUSES).optional(),
        dateFrom: z.string().datetime().optional(),
        dateTo: z.string().datetime().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(5).max(50).default(15),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const conds: SQL[] = [];
      if (input.search) conds.push(like(sales.receiptNo, `%${input.search}%`));
      if (input.cashierId) conds.push(eq(sales.cashierId, input.cashierId));
      if (input.customerId) conds.push(eq(sales.customerId, input.customerId));
      if (input.status) conds.push(eq(sales.status, input.status));
      if (input.dateFrom) conds.push(gte(sales.createdAt, new Date(input.dateFrom)));
      if (input.dateTo) conds.push(lt(sales.createdAt, new Date(input.dateTo)));
      const where = conds.length ? and(...conds) : undefined;

      const [totals] = await db
        .select({
          count: count(),
          revenue: sql<string>`COALESCE(SUM(CASE WHEN ${sales.status} = 'COMPLETED' THEN ${sales.grandTotal} ELSE 0 END), 0)`,
        })
        .from(sales)
        .where(where);

      const items = await db
        .select({
          id: sales.id,
          receiptNo: sales.receiptNo,
          status: sales.status,
          itemCount: sales.itemCount,
          subtotal: sales.subtotal,
          discountTotal: sales.discountTotal,
          taxTotal: sales.taxTotal,
          grandTotal: sales.grandTotal,
          changeGiven: sales.changeGiven,
          createdAt: sales.createdAt,
          cashierName: users.fullName,
          customerName: customers.fullName,
        })
        .from(sales)
        .leftJoin(users, eq(sales.cashierId, users.id))
        .leftJoin(customers, eq(sales.customerId, customers.id))
        .where(where)
        .orderBy(desc(sales.createdAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      return {
        items,
        total: totals?.count ?? 0,
        filteredRevenue: Number(totals?.revenue ?? 0),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  /** Today's headline figures across all staff. */
  todayStats: permissionProcedure("sales.view_all_history").query(async () => {
    const db = getDb();
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const [row] = await db
      .select({
        count: sql<number>`SUM(CASE WHEN ${sales.status} = 'COMPLETED' THEN 1 ELSE 0 END)`,
        revenue: sql<string>`COALESCE(SUM(CASE WHEN ${sales.status} = 'COMPLETED' THEN ${sales.grandTotal} ELSE 0 END), 0)`,
        discounts: sql<string>`COALESCE(SUM(CASE WHEN ${sales.status} = 'COMPLETED' THEN ${sales.discountTotal} ELSE 0 END), 0)`,
        tax: sql<string>`COALESCE(SUM(CASE WHEN ${sales.status} = 'COMPLETED' THEN ${sales.taxTotal} ELSE 0 END), 0)`,
      })
      .from(sales)
      .where(gte(sales.createdAt, dayStart));
    const [voided] = await db
      .select({ count: count() })
      .from(sales)
      .where(and(gte(sales.createdAt, dayStart), eq(sales.status, "VOIDED")));
    const revenue = Number(row?.revenue ?? 0);
    const completed = Number(row?.count ?? 0);
    return {
      todayCount: completed,
      todayRevenue: revenue,
      todayDiscounts: Number(row?.discounts ?? 0),
      todayTax: Number(row?.tax ?? 0),
      todayVoided: voided?.count ?? 0,
      averageTicket: completed > 0 ? revenue / completed : 0,
    };
  }),
});

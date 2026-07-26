import { z } from "zod";
import { PAYMENT_METHODS } from "./constants";

/**
 * HADRAN FABRICS MALL — POS checkout contracts (shared frontend ↔ backend)
 */

/** One cart line as sent to checkout. */
export const checkoutItemSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().positive("Quantity must be greater than zero"),
  /** Only honored when the cashier has price-override rights; server otherwise uses the catalog price. */
  unitPrice: z.number().min(0).optional(),
  /** Item-level discount in ₦ (validated against product eligibility + limits). */
  discountAmount: z.number().min(0).default(0),
  /** Fabric measured & cut from a pack (e.g. 3.5 yards). */
  isMeasuredCut: z.boolean().default(false),
});
export type CheckoutItem = z.infer<typeof checkoutItemSchema>;

export const paymentSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  amount: z.number().positive("Payment amount must be greater than zero"),
  reference: z.string().max(120).optional(),
});
export type CheckoutPayment = z.infer<typeof paymentSchema>;

export const checkoutSchema = z.object({
  items: z.array(checkoutItemSchema).min(1, "Cart is empty"),
  customerId: z.number().int().positive().nullable().optional(),
  /** Manual cart-level discount in ₦. */
  cartDiscountAmount: z.number().min(0).default(0),
  cartDiscountNote: z.string().max(255).optional(),
  payments: z.array(paymentSchema).min(1, "Add at least one payment"),
  notes: z.string().max(1000).optional(),
  /** When completing a previously held sale. */
  heldSaleId: z.number().int().positive().optional(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

/** Full computed sale returned by checkout (drives the receipt). */
export interface CompletedSale {
  saleId: number;
  receiptNo: string;
  grandTotal: number;
  amountTendered: number;
  changeGiven: number;
}

/** Cart line used by the frontend store. */
export interface CartLine {
  productId: number;
  sku: string;
  name: string;
  unit: string;
  imageUrl: string | null;
  unitPrice: number;
  catalogPrice: number;
  quantity: number;
  allowFractional: boolean;
  packSize: number | null;
  discountEligible: boolean;
  taxRate: number;
  taxExempt: boolean;
  discountAmount: number;
  isMeasuredCut: boolean;
  maxStock: number;
}

import { create } from "zustand";
import type { CartLine } from "@contracts/pos";

/**
 * HADRAN FABRICS MALL — POS cart store (zustand)
 * Holds the live cart for the terminal. Totals are derived via computeTotals
 * (mirrors the server's checkout math exactly).
 */

export interface CartCustomer {
  id: number;
  fullName: string;
  discountPercent: number;
}

export interface PosConfigSnapshot {
  vatRate: number;
  serviceChargeRate: number;
  maxItemDiscountPercent: number;
  maxCartDiscountPercent: number;
}

interface CartState {
  lines: CartLine[];
  customer: CartCustomer | null;
  cartDiscountAmount: number;
  cartDiscountNote: string;
  heldSaleId: number | null;

  addLine: (line: Omit<CartLine, "quantity" | "discountAmount" | "isMeasuredCut">, quantity: number, isMeasuredCut: boolean) => void;
  setQuantity: (productId: number, quantity: number) => void;
  setLineDiscount: (productId: number, amount: number) => void;
  removeLine: (productId: number) => void;
  setCustomer: (customer: CartCustomer | null) => void;
  setCartDiscount: (amount: number, note: string) => void;
  loadHeld: (heldSaleId: number, lines: CartLine[], customer: CartCustomer | null) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>((set) => ({
  lines: [],
  customer: null,
  cartDiscountAmount: 0,
  cartDiscountNote: "",
  heldSaleId: null,

  addLine: (line, quantity, isMeasuredCut) =>
    set((state) => {
      const existing = state.lines.find((l) => l.productId === line.productId);
      if (existing && !existing.allowFractional) {
        // whole-unit items simply increment
        return {
          lines: state.lines.map((l) =>
            l.productId === line.productId
              ? { ...l, quantity: Math.min(l.quantity + quantity, l.maxStock) }
              : l,
          ),
        };
      }
      if (existing) {
        return {
          lines: state.lines.map((l) =>
            l.productId === line.productId
              ? { ...l, quantity: Math.min(l.quantity + quantity, l.maxStock), isMeasuredCut: true }
              : l,
          ),
        };
      }
      return {
        lines: [
          ...state.lines,
          { ...line, quantity: Math.min(quantity, line.maxStock), discountAmount: 0, isMeasuredCut },
        ],
      };
    }),

  setQuantity: (productId, quantity) =>
    set((state) => ({
      lines: state.lines.map((l) =>
        l.productId === productId ? { ...l, quantity: Math.max(0, Math.min(quantity, l.maxStock)) } : l,
      ),
    })),

  setLineDiscount: (productId, amount) =>
    set((state) => ({
      lines: state.lines.map((l) =>
        l.productId === productId
          ? { ...l, discountAmount: Math.max(0, Math.min(amount, l.unitPrice * l.quantity)) }
          : l,
      ),
    })),

  removeLine: (productId) =>
    set((state) => ({ lines: state.lines.filter((l) => l.productId !== productId) })),

  setCustomer: (customer) => set({ customer }),

  setCartDiscount: (amount, note) =>
    set({ cartDiscountAmount: Math.max(0, amount), cartDiscountNote: note }),

  loadHeld: (heldSaleId, lines, customer) =>
    set({ heldSaleId, lines, customer, cartDiscountAmount: 0, cartDiscountNote: "" }),

  clear: () =>
    set({ lines: [], customer: null, cartDiscountAmount: 0, cartDiscountNote: "", heldSaleId: null }),
}));

/* ------------------------- totals (mirror of server) ------------------------- */

export interface CartTotals {
  itemCount: number;
  itemDiscountTotal: number;
  subtotal: number;
  cartDiscount: number;
  customerDiscount: number;
  discountTotal: number;
  taxTotal: number;
  serviceCharge: number;
  grandTotal: number;
}

export function computeTotals(
  lines: CartLine[],
  cartDiscountAmount: number,
  customer: CartCustomer | null,
  config: PosConfigSnapshot,
): CartTotals {
  const itemDiscountTotal = Number(lines.reduce((s, l) => s + l.discountAmount, 0).toFixed(2));
  const subtotal = Number(lines.reduce((s, l) => s + l.unitPrice * l.quantity - l.discountAmount, 0).toFixed(2));

  const cartCap = (config.maxCartDiscountPercent / 100) * subtotal;
  const cartDiscount = Number(Math.min(cartDiscountAmount, cartCap, subtotal).toFixed(2));

  const customerDiscount = customer
    ? Number(((customer.discountPercent / 100) * (subtotal - cartDiscount)).toFixed(2))
    : 0;

  const cartLevel = cartDiscount + customerDiscount;
  const ratio = subtotal > 0 ? 1 - cartLevel / subtotal : 1;

  let taxTotal = 0;
  for (const l of lines) {
    const taxable = (l.unitPrice * l.quantity - l.discountAmount) * ratio;
    // Mirror of server: taxRate 0 inherits the store VAT setting; exempt = 0.
    const effRate = l.taxExempt ? 0 : l.taxRate > 0 ? l.taxRate : config.vatRate;
    taxTotal += (taxable * effRate) / 100;
  }
  taxTotal = Number(taxTotal.toFixed(2));

  const serviceCharge = Number((((subtotal - cartLevel) * config.serviceChargeRate) / 100).toFixed(2));
  const grandTotal = Number((subtotal - cartLevel + taxTotal + serviceCharge).toFixed(2));

  return {
    itemCount: lines.reduce((s, l) => s + l.quantity, 0),
    itemDiscountTotal,
    subtotal,
    cartDiscount,
    customerDiscount,
    discountTotal: Number((itemDiscountTotal + cartLevel).toFixed(2)),
    taxTotal,
    serviceCharge,
    grandTotal,
  };
}

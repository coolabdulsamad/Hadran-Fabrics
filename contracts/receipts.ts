import type { PaymentMethod } from "./constants";

/**
 * HADRAN FABRICS MALL — receipt contracts
 * Everything needed to render/print an 80mm thermal receipt.
 */

export interface ReceiptConfig {
  storeName: string;
  tagline: string;
  motto: string;
  address: string;
  phone: string;
  currencySymbol: string;
  footerNote: string;
  returnPolicy: string;
  showCashier: boolean;
  showCustomer: boolean;
  paperWidthMm: number;
}

export interface ReceiptLine {
  name: string;
  sku: string;
  quantity: number;
  unit: string;
  isMeasuredCut: boolean;
  unitPrice: number;
  discountAmount: number;
  taxAmount: number;
  lineTotal: number;
}

export interface ReceiptPayment {
  method: PaymentMethod;
  amount: number;
  reference: string | null;
}

export interface ReceiptData {
  receiptNo: string;
  soldAt: Date | string;
  cashierName: string;
  customerName: string | null;
  customerDiscountPercent: number;
  lines: ReceiptLine[];
  itemCount: number;
  subtotal: number;
  discountTotal: number;
  discountNote: string | null;
  taxTotal: number;
  serviceCharge: number;
  grandTotal: number;
  payments: ReceiptPayment[];
  amountTendered: number;
  changeGiven: number;
}

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import type { ReceiptConfig, ReceiptData } from "@contracts/receipts";
import { PAYMENT_METHOD_LABELS } from "@contracts/constants";
import { formatQty } from "@/lib/format";

/**
 * HADRAN FABRICS MALL — 80mm thermal receipt (print document).
 * Rendered inside .receipt-print-area — only this shows when printing.
 */

function money(symbol: string, n: number): string {
  return `${symbol}${n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ReceiptBarcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (ref.current && value) {
      try {
        JsBarcode(ref.current, value, {
          format: "CODE128",
          width: 1.1,
          height: 32,
          fontSize: 10,
          margin: 0,
        });
      } catch {
        /* non-critical */
      }
    }
  }, [value]);
  return <svg ref={ref} className="mx-auto mt-2 max-w-full" />;
}

const DASH = "------------------------------------------";

export function ReceiptDocument({ data, config }: { data: ReceiptData; config: ReceiptConfig }) {
  const soldAt = data.soldAt instanceof Date ? data.soldAt : new Date(data.soldAt);

  return (
    <div className="receipt-print-area receipt-80mm mx-auto bg-white p-3 text-black">
      {/* Header */}
      <div className="text-center">
        <p className="font-display text-[16px] font-bold uppercase tracking-wide">{config.storeName}</p>
        <p className="text-[9px] uppercase tracking-[0.25em]">{config.tagline}</p>
        <p className="mt-1 text-[10px] leading-tight">{config.address}</p>
        {config.phone && <p className="text-[10px]">Tel: {config.phone}</p>}
      </div>

      <pre className="my-1.5 overflow-hidden text-[10px] leading-none">{DASH}</pre>

      {/* Meta */}
      <div className="text-[10px] leading-relaxed">
        <div className="flex justify-between"><span>Receipt:</span><span className="font-bold">{data.receiptNo}</span></div>
        <div className="flex justify-between">
          <span>Date:</span>
          <span>
            {soldAt.toLocaleDateString("en-GB")} {soldAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        {config.showCashier && (
          <div className="flex justify-between"><span>Cashier:</span><span>{data.cashierName}</span></div>
        )}
        {config.showCustomer && data.customerName && (
          <div className="flex justify-between">
            <span>Customer:</span>
            <span className="font-semibold">{data.customerName}</span>
          </div>
        )}
      </div>

      <pre className="my-1.5 overflow-hidden text-[10px] leading-none">{DASH}</pre>

      {/* Lines */}
      <table className="w-full text-[10px]">
        <thead>
          <tr className="border-b border-dashed border-black">
            <th className="pb-0.5 text-left font-bold">Item</th>
            <th className="pb-0.5 text-right font-bold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((l, i) => (
            <tr key={i}>
              <td className="py-1 pr-1 align-top">
                <p className="font-semibold leading-tight">{l.name}</p>
                <p className="text-[9px]">
                  {formatQty(l.quantity)} {l.unit.toLowerCase()}(s)
                  {l.isMeasuredCut ? " (cut)" : ""} × {money(config.currencySymbol, l.unitPrice)}
                  {l.discountAmount > 0 && ` · disc −${money(config.currencySymbol, l.discountAmount)}`}
                </p>
              </td>
              <td className="py-1 text-right align-top font-semibold">
                {money(config.currencySymbol, l.lineTotal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <pre className="my-1.5 overflow-hidden text-[10px] leading-none">{DASH}</pre>

      {/* Totals */}
      <div className="text-[10px] leading-relaxed">
        <div className="flex justify-between"><span>Subtotal</span><span>{money(config.currencySymbol, data.subtotal)}</span></div>
        {data.discountTotal > 0 && (
          <div className="flex justify-between">
            <span>Discount{data.customerDiscountPercent > 0 ? ` (incl. customer ${data.customerDiscountPercent}%)` : ""}</span>
            <span>−{money(config.currencySymbol, data.discountTotal)}</span>
          </div>
        )}
        {data.taxTotal > 0 && (
          <div className="flex justify-between"><span>VAT</span><span>{money(config.currencySymbol, data.taxTotal)}</span></div>
        )}
        {data.serviceCharge > 0 && (
          <div className="flex justify-between"><span>Service charge</span><span>{money(config.currencySymbol, data.serviceCharge)}</span></div>
        )}
        <div className="mt-1 flex justify-between border-t border-black pt-1 text-[13px] font-bold">
          <span>TOTAL</span>
          <span>{money(config.currencySymbol, data.grandTotal)}</span>
        </div>
      </div>

      {/* Payments */}
      <div className="mt-1.5 text-[10px] leading-relaxed">
        {data.payments.map((p, i) => (
          <div key={i} className="flex justify-between">
            <span>
              {PAYMENT_METHOD_LABELS[p.method]}
              {p.reference ? ` (${p.reference})` : ""}
            </span>
            <span>{money(config.currencySymbol, p.amount)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-dashed border-black pt-0.5">
          <span>Tendered</span><span>{money(config.currencySymbol, data.amountTendered)}</span>
        </div>
        <div className="flex justify-between font-bold">
          <span>Change</span><span>{money(config.currencySymbol, data.changeGiven)}</span>
        </div>
      </div>

      <pre className="my-1.5 overflow-hidden text-[10px] leading-none">{DASH}</pre>

      {/* Footer */}
      <div className="text-center text-[9px] leading-relaxed">
        <p>{config.footerNote}</p>
        {config.returnPolicy && <p className="mt-1">{config.returnPolicy}</p>}
        <p className="mt-1 italic">{config.motto}</p>
        <ReceiptBarcode value={data.receiptNo} />
        <p className="mt-1">Items: {data.itemCount} · Thank you!</p>
      </div>
    </div>
  );
}

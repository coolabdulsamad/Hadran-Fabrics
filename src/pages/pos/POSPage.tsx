import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { PauseCircle, ScanBarcode, Wifi, WifiOff } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useCartStore, type PosConfigSnapshot } from "@/store/cart-store";
import { usePermissions } from "@/hooks/use-permissions";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { ScanSearchPanel, type PosProduct } from "@/components/pos/ScanSearchPanel";
import { CartPanel } from "@/components/pos/CartPanel";
import { MeasurementInput } from "@/components/pos/MeasurementInput";
import { DiscountDialog } from "@/components/pos/DiscountDialog";
import { CustomerPickerDialog } from "@/components/pos/CustomerPickerDialog";
import { HeldSalesDrawer } from "@/components/pos/HeldSalesDrawer";
import { PaymentDialog } from "@/components/pos/PaymentDialog";
import { ReceiptPreview } from "@/components/pos/ReceiptPreview";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { CartLine, CheckoutPayment } from "@contracts/pos";
import { computeTotals } from "@/store/cart-store";
import { playBeep } from "@/lib/sounds";

/**
 * HADRAN FABRICS MALL — POS Terminal, supermarket style (Phase 7).
 * No product-card grid, no category filters: a slim scan/search rail on
 * the left (scan anywhere, or type and Enter for the top match) and a
 * dominant receipt-style cart carrying every line's full details.
 * Completed sales flow into the thermal-receipt preview with paper-check.
 */

const FALLBACK_CONFIG: PosConfigSnapshot = {
  vatRate: 7.5,
  serviceChargeRate: 0,
  maxItemDiscountPercent: 20,
  maxCartDiscountPercent: 30,
};

function toCartLineBase(p: PosProduct): Omit<CartLine, "quantity" | "discountAmount" | "isMeasuredCut"> {
  return {
    productId: p.id,
    sku: p.sku,
    name: p.name,
    unit: p.unitOfMeasure,
    imageUrl: p.primaryImageUrl,
    unitPrice: p.sellingPrice,
    catalogPrice: p.sellingPrice,
    allowFractional: p.allowFractional,
    packSize: p.packSize,
    discountEligible: p.discountEligible,
    taxRate: p.taxRate,
    taxExempt: p.taxExempt,
    // Sellable ceiling = what the ACTIVE BRANCH holds, not the company total.
    maxStock: p.branchStock ?? p.currentStock,
  };
}

export default function POSPage() {
  const utils = trpc.useUtils();
  const { can } = usePermissions();

  const lines = useCartStore((s) => s.lines);
  const customer = useCartStore((s) => s.customer);
  const cartDiscountAmount = useCartStore((s) => s.cartDiscountAmount);
  const cartDiscountNote = useCartStore((s) => s.cartDiscountNote);
  const heldSaleId = useCartStore((s) => s.heldSaleId);
  const addLine = useCartStore((s) => s.addLine);
  const setLineDiscount = useCartStore((s) => s.setLineDiscount);
  const setCustomer = useCartStore((s) => s.setCustomer);
  const setCartDiscount = useCartStore((s) => s.setCartDiscount);
  const loadHeld = useCartStore((s) => s.loadHeld);
  const clear = useCartStore((s) => s.clear);

  const configQuery = trpc.sales.posConfig.useQuery();
  const config: PosConfigSnapshot = configQuery.data ?? FALLBACK_CONFIG;

  /* ------------------------- dialog state ------------------------- */
  const [measureProduct, setMeasureProduct] = useState<PosProduct | null>(null);
  const [measureOpen, setMeasureOpen] = useState(false);
  const [discountLine, setDiscountLine] = useState<CartLine | null>(null);
  const [itemDiscountOpen, setItemDiscountOpen] = useState(false);
  const [cartDiscountOpen, setCartDiscountOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [receiptSaleId, setReceiptSaleId] = useState<number | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);

  const inCartIds = useMemo(() => new Set(lines.map((l) => l.productId)), [lines]);
  const totals = useMemo(
    () => computeTotals(lines, cartDiscountAmount, customer, config),
    [lines, cartDiscountAmount, customer, config],
  );

  /* ------------------------- pick / scan ------------------------- */
  const pickProduct = useCallback(
    (p: PosProduct) => {
      if ((p.branchStock ?? p.currentStock) <= 0) {
        playBeep("error");
        toast.error(`${p.name} is out of stock at this branch.`);
        return;
      }
      playBeep("scan");
      if (p.allowFractional) {
        setMeasureProduct(p);
        setMeasureOpen(true);
      } else {
        addLine(toCartLineBase(p), 1, false);
      }
    },
    [addLine],
  );

  const handleScan = useCallback(
    async (code: string) => {
      setLastScan(code);
      try {
        const p = await utils.products.byBarcode.fetch({ code });
        pickProduct({
          id: p.id,
          sku: p.sku,
          barcode: p.barcode,
          name: p.name,
          color: p.color,
          unitOfMeasure: p.unitOfMeasure,
          packSize: p.packSize,
          allowFractional: p.allowFractional,
          sellingPrice: p.sellingPrice,
          taxRate: p.taxRate,
          taxExempt: p.taxExempt,
          discountEligible: p.discountEligible,
          currentStock: p.currentStock,
          branchStock: p.branchStock,
          reorderLevel: p.reorderLevel,
          primaryImageUrl: p.primaryImageUrl,
          categoryName: "",
        });
      } catch (err) {
        playBeep("error");
        toast.error("Barcode not recognised.", {
          description: err instanceof Error ? err.message : `No active product for code "${code}".`,
        });
      }
    },
    [utils, pickProduct],
  );

  useBarcodeScanner({
    enabled: configQuery.data?.scannerEnabled !== false && !paymentOpen,
    minLength: configQuery.data?.scannerMinLength ?? 6,
    suffix: configQuery.data?.scannerSuffix ?? "ENTER",
    onScan: (code) => void handleScan(code),
  });

  /* ------------------------- hold ------------------------- */
  const holdMutation = trpc.sales.hold.useMutation();
  const deleteHeldMutation = trpc.sales.deleteHeld.useMutation();
  const [holding, setHolding] = useState(false);

  const handleHold = async () => {
    if (lines.length === 0) return;
    setHolding(true);
    try {
      // Re-holding a resumed cart replaces the previous parked copy.
      if (heldSaleId) {
        await deleteHeldMutation.mutateAsync({ id: heldSaleId });
      }
      const note = window.prompt("Optional note for this held sale (e.g. customer name):", "") ?? "";
      await holdMutation.mutateAsync({
        items: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          discountAmount: l.discountAmount,
          isMeasuredCut: l.isMeasuredCut,
        })),
        customerId: customer?.id ?? null,
        notes: note.trim() || undefined,
      });
      toast.success("Sale held.", { description: "Find it under Held Sales when the customer returns." });
      clear();
      void utils.sales.heldSales.invalidate();
    } catch (err) {
      toast.error("Could not hold sale.", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setHolding(false);
    }
  };

  /* ------------------------- resume held ------------------------- */
  const handleResume = async (id: number) => {
    setResuming(true);
    try {
      const { sale, items } = await utils.sales.heldById.fetch({ id });
      const restored: CartLine[] = [];
      for (const i of items) {
        const p = await utils.products.byId.fetch({ id: i.productId });
        const prod = p.product;
        // byId puts branchStock at the top level (active-branch balance).
        const sellable = p.branchStock ?? prod.currentStock;
        restored.push({
          productId: prod.id,
          sku: prod.sku,
          name: prod.name,
          unit: prod.unitOfMeasure,
          imageUrl: prod.primaryImageUrl,
          unitPrice: i.unitPrice,
          catalogPrice: prod.sellingPrice,
          quantity: Math.min(i.quantity, Math.max(sellable, i.quantity)),
          allowFractional: prod.allowFractional,
          packSize: prod.packSize,
          discountEligible: prod.discountEligible,
          taxRate: prod.taxRate,
          taxExempt: prod.taxExempt,
          discountAmount: i.discountAmount,
          isMeasuredCut: i.isMeasuredCut,
          maxStock: sellable > 0 ? sellable : i.quantity,
        });
      }
      let cust: { id: number; fullName: string; discountPercent: number } | null = null;
      if (sale.customerId) {
        try {
          const c = await utils.customers.byId.fetch({ id: sale.customerId });
          cust = {
            id: c.customer.id,
            fullName: c.customer.fullName,
            discountPercent: Number(c.customer.discountPercent),
          };
        } catch {
          cust = null;
        }
      }
      loadHeld(id, restored, cust);
      setHeldOpen(false);
      toast.success("Held sale resumed.", {
        description: "Stock is re-checked at payment. Cart discounts need re-applying.",
      });
    } catch (err) {
      toast.error("Could not resume held sale.", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setResuming(false);
    }
  };

  /* ------------------------- checkout ------------------------- */
  const checkoutMutation = trpc.sales.checkout.useMutation();

  const handleCompleteSale = async (payments: CheckoutPayment[]) => {
    try {
      const result = await checkoutMutation.mutateAsync({
        items: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          discountAmount: l.discountAmount,
          isMeasuredCut: l.isMeasuredCut,
        })),
        customerId: customer?.id ?? null,
        cartDiscountAmount,
        cartDiscountNote: cartDiscountNote.trim() || undefined,
        payments,
        heldSaleId: heldSaleId ?? undefined,
      });
      setPaymentOpen(false);
      clear();
      setReceiptSaleId(result.saleId);
      setReceiptOpen(true);
      void utils.sales.heldSales.invalidate();
      void utils.sales.myDailySummary.invalidate();
      void utils.products.list.invalidate();
      void utils.dashboard.summary.invalidate();
      toast.success(`Sale completed — ${result.receiptNo}`, {
        description:
          result.changeGiven > 0
            ? `Change to give: ₦${result.changeGiven.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
            : "Receipt is ready to print.",
      });
    } catch (err) {
      toast.error("Checkout failed.", { description: err instanceof Error ? err.message : undefined });
    }
  };

  const cartSubtotal = totals.subtotal;

  const cartPanelProps = {
    config,
    canItemDiscount: can("pos.apply_item_discount"),
    canCartDiscount: can("pos.apply_cart_discount"),
    canHold: can("pos.hold_sale"),
    onItemDiscount: (line: CartLine) => {
      setDiscountLine(line);
      setItemDiscountOpen(true);
    },
    onCartDiscount: () => setCartDiscountOpen(true),
    onCustomerClick: () => setCustomerOpen(true),
    onHold: () => void handleHold(),
    onCharge: () => setPaymentOpen(true),
    holding,
    charging: checkoutMutation.isPending,
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] w-full min-w-0 flex-col gap-3 lg:h-[calc(100vh-4rem)]">
      {/* Terminal header strip */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <ScanBarcode className="h-5 w-5 text-gold-600" />
          <h1 className="font-display text-xl font-semibold text-navy-900">POS Terminal</h1>
        </div>
        {configQuery.data?.scannerEnabled !== false ? (
          <Badge variant="outline" className="gap-1 text-[11px] text-emerald-700">
            <Wifi className="h-3 w-3" /> Scanner listening
            {lastScan && <span className="max-w-[140px] truncate text-muted-foreground">• last: {lastScan}</span>}
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 text-[11px] text-muted-foreground">
            <WifiOff className="h-3 w-3" /> Scanner off (search only)
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setHeldOpen(true)}>
            <PauseCircle className="mr-1.5 h-4 w-4" />
            Held Sales
          </Button>
        </div>
      </div>

      {/* Supermarket split — slim scan rail left, dominant cart right.
          On mobile the cart IS the screen: search sits on top and its
          results float as an overlay, no drawer needed. */}
      <div className="grid w-full min-w-0 flex-1 gap-3 lg:min-h-0 lg:grid-cols-[minmax(340px,390px)_minmax(0,1fr)]">
        <ScanSearchPanel onPick={pickProduct} inCartIds={inCartIds} onCodeScan={setLastScan} />
        <div className="min-h-[62vh] min-w-0 lg:min-h-0">
          <CartPanel {...cartPanelProps} />
        </div>
      </div>

      {/* Dialogs */}
      <MeasurementInput
        product={measureProduct}
        open={measureOpen}
        onClose={() => setMeasureOpen(false)}
        onConfirm={(qty) => {
          if (measureProduct) addLine(toCartLineBase(measureProduct), qty, true);
        }}
      />

      <DiscountDialog
        open={itemDiscountOpen}
        onClose={() => setItemDiscountOpen(false)}
        mode="item"
        title={discountLine ? `${discountLine.name} (${discountLine.quantity} × ₦${discountLine.unitPrice.toLocaleString()})` : ""}
        baseAmount={discountLine ? discountLine.unitPrice * discountLine.quantity : 0}
        currentAmount={discountLine?.discountAmount ?? 0}
        maxPercent={config.maxItemDiscountPercent}
        onConfirm={(amount) => {
          if (discountLine) setLineDiscount(discountLine.productId, amount);
        }}
      />

      <DiscountDialog
        open={cartDiscountOpen}
        onClose={() => setCartDiscountOpen(false)}
        mode="cart"
        title="Whole sale"
        baseAmount={cartSubtotal}
        currentAmount={cartDiscountAmount}
        currentNote={cartDiscountNote}
        maxPercent={config.maxCartDiscountPercent}
        onConfirm={(amount, note) => setCartDiscount(amount, note)}
      />

      <CustomerPickerDialog
        open={customerOpen}
        onClose={() => setCustomerOpen(false)}
        current={customer}
        onSelect={setCustomer}
      />

      <HeldSalesDrawer
        open={heldOpen}
        onClose={() => setHeldOpen(false)}
        onResume={(id) => void handleResume(id)}
        resuming={resuming}
      />

      <PaymentDialog
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        grandTotal={totals.grandTotal}
        submitting={checkoutMutation.isPending}
        onComplete={(payments) => void handleCompleteSale(payments)}
      />

      <ReceiptPreview
        saleId={receiptSaleId}
        open={receiptOpen}
        onClose={() => setReceiptOpen(false)}
        mode="checkout"
        paperCheckEnabled={configQuery.data?.printerPaperCheck ?? true}
      />
    </div>
  );
}

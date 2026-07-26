import { useMemo, useState } from "react";
import { toast } from "sonner";
import { RotateCcw, Search, Loader2, Clock, ArrowLeftRight } from "lucide-react";
import { trpc } from "@/providers/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { StatusBadge, toneForStatus } from "@/components/common/StatusBadge";
import { ProductPicker, type PickedProduct } from "@/components/inventory/ProductPicker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatDateTime, formatQty } from "@/lib/format";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS, type PaymentMethod, type ReturnType } from "@contracts/constants";
import { UNIT_LABELS } from "@contracts/constants";
import { SALE_STATUS_LABELS } from "@contracts/labels";
import type { SaleStatus } from "@contracts/constants";
import { cn } from "@/lib/utils";

/**
 * HADRAN FABRICS MALL — create return / exchange dialog.
 * Receipt lookup → pick lines (qty, condition, restock) → for exchanges,
 * pick the replacement product per line. Manager submissions route to
 * the admin approval queue; Admins process immediately.
 */

interface SaleMatch {
  sale: {
    id: number;
    receiptNo: string;
    status: SaleStatus;
    grandTotal: number;
    createdAt: string | Date;
  };
  cashierName: string | null;
  customerName: string | null;
}

interface LineState {
  saleItemId: number;
  productName: string;
  sku: string;
  unit: string;
  unitRefund: number;
  returnableQty: number;
  selected: boolean;
  quantity: string;
  condition: "GOOD" | "DAMAGED";
  restock: boolean;
  exchangeProduct: PickedProduct | null;
  exchangeQty: string;
}

interface CreateReturnDialogProps {
  open: boolean;
  onClose: () => void;
  onProcessed: () => void;
}

export function CreateReturnDialog({ open, onClose, onProcessed }: CreateReturnDialogProps) {
  const utils = trpc.useUtils();

  const [receiptQuery, setReceiptQuery] = useState("");
  const [matches, setMatches] = useState<SaleMatch[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [sale, setSale] = useState<SaleMatch | null>(null);
  const [type, setType] = useState<ReturnType>("RETURN");
  const [lines, setLines] = useState<LineState[]>([]);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>("CASH");

  const reset = () => {
    setReceiptQuery("");
    setMatches(null);
    setSale(null);
    setType("RETURN");
    setLines([]);
    setReason("");
    setNotes("");
    setRefundMethod("CASH");
  };

  const lookup = async () => {
    if (receiptQuery.trim().length < 3) return;
    setSearching(true);
    try {
      const rows = (await utils.returns.lookupSale.fetch({ receiptNo: receiptQuery.trim() })) as unknown as SaleMatch[];
      setMatches(rows);
      if (rows.length === 1) void pickSale(rows[0]);
    } catch (err) {
      setMatches([]);
      toast.error("No sale found.", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setSearching(false);
    }
  };

  const pickSale = async (match: SaleMatch) => {
    setSale(match);
    setMatches(null);
    const items = await utils.returns.saleItems.fetch({ saleId: match.sale.id });
    setLines(
      items.map((i) => ({
        saleItemId: i.id,
        productName: i.productName,
        sku: i.sku,
        unit: i.unit,
        unitRefund: i.quantity > 0 ? i.lineTotal / i.quantity : 0,
        returnableQty: i.returnableQty,
        selected: false,
        quantity: String(i.returnableQty),
        condition: "GOOD",
        restock: true,
        exchangeProduct: null,
        exchangeQty: String(i.returnableQty),
      })),
    );
  };

  const setLine = (idx: number, patch: Partial<LineState>) =>
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const selectedLines = lines.filter((l) => l.selected && l.returnableQty > 0);

  const totals = useMemo(() => {
    let returnValue = 0;
    let exchangeValue = 0;
    for (const l of selectedLines) {
      const qty = Math.min(Number(l.quantity) || 0, l.returnableQty);
      returnValue += l.unitRefund * qty;
      if (type === "EXCHANGE" && l.exchangeProduct) {
        exchangeValue += l.exchangeProduct.sellingPrice * (Number(l.exchangeQty) || 0);
      }
    }
    returnValue = Number(returnValue.toFixed(2));
    exchangeValue = Number(exchangeValue.toFixed(2));
    const refund = type === "RETURN" ? returnValue : Math.max(0, returnValue - exchangeValue);
    const topUp = type === "EXCHANGE" ? Math.max(0, exchangeValue - returnValue) : 0;
    return { returnValue, exchangeValue, refund: Number(refund.toFixed(2)), topUp: Number(topUp.toFixed(2)) };
  }, [selectedLines, type]);

  const validate = (): string | null => {
    if (!sale) return "Find and select a sale first.";
    if (sale.sale.status !== "COMPLETED" && sale.sale.status !== "PARTIALLY_RETURNED")
      return `This sale is ${sale.sale.status} — only completed sales can be returned.`;
    if (selectedLines.length === 0) return "Select at least one item to return.";
    for (const l of selectedLines) {
      const qty = Number(l.quantity);
      if (!Number.isFinite(qty) || qty <= 0 || qty > l.returnableQty)
        return `"${l.productName}": quantity must be between 0 and ${l.returnableQty}.`;
      if (type === "EXCHANGE") {
        if (!l.exchangeProduct) return `"${l.productName}": pick a replacement product for the exchange.`;
        const exQty = Number(l.exchangeQty);
        if (!Number.isFinite(exQty) || exQty <= 0) return `"${l.productName}": exchange quantity must be above zero.`;
        if (exQty > l.exchangeProduct.currentStock)
          return `Only ${formatQty(l.exchangeProduct.currentStock)} of "${l.exchangeProduct.name}" in stock.`;
      }
    }
    if (reason.trim().length < 3) return "Give a reason for this return.";
    return null;
  };

  const createMutation = trpc.returns.create.useMutation({
    onSuccess: (r) => {
      if (r.pending) {
        toast.info("Sent for admin approval.", {
          description: `Request #${r.approvalId} — the ${type.toLowerCase()} is processed once an Admin approves it.`,
          icon: <Clock className="h-4 w-4" />,
        });
      } else {
        toast.success(`${type === "EXCHANGE" ? "Exchange" : "Return"} processed — ${r.reference}`, {
          description:
            r.refundAmount > 0
              ? `Refund due: ${formatCurrency(r.refundAmount)}. Stock has been updated.`
              : (r.topUpAmount ?? 0) > 0
                ? `Top-up collected: ${formatCurrency(r.topUpAmount!)}. Stock has been updated.`
                : "Even exchange — stock has been updated.",
        });
      }
      void utils.returns.list.invalidate();
      void utils.products.list.invalidate();
      onProcessed();
      onClose();
      reset();
    },
    onError: (err) => toast.error("Could not process return.", { description: err.message }),
  });

  const submit = () => {
    const problem = validate();
    if (problem) {
      toast.error(problem);
      return;
    }
    createMutation.mutate({
      saleId: sale!.sale.id,
      type,
      reason: reason.trim(),
      notes: notes.trim() || undefined,
      refundMethod: type === "RETURN" || totals.refund > 0 ? refundMethod : null,
      items: selectedLines.map((l) => ({
        saleItemId: l.saleItemId,
        quantity: Number(l.quantity),
        condition: l.condition,
        restock: l.condition === "GOOD" && l.restock,
        exchangeProductId: type === "EXCHANGE" ? (l.exchangeProduct?.id ?? null) : null,
        exchangeQty: type === "EXCHANGE" ? Number(l.exchangeQty) : null,
      })),
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !createMutation.isPending) {
          onClose();
          reset();
        }
      }}
    >
      <DialogContent className="scrollbar-lux max-h-[92vh] overflow-y-auto border-gold-500/30 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-navy-900">
            <RotateCcw className="h-5 w-5 text-gold-600" />
            New Return / Exchange
          </DialogTitle>
          <DialogDescription>
            Find the original receipt, pick what is coming back and in what condition. Good items go back into stock;
            damaged ones are written off. Exchanges swap for a replacement product.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Step 1: receipt lookup */}
          {!sale ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    data-no-scan
                    value={receiptQuery}
                    onChange={(e) => setReceiptQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void lookup()}
                    placeholder="Receipt number, e.g. RCP-20260724-0001"
                    className="input-lux pl-10"
                  />
                </div>
                <Button onClick={() => void lookup()} disabled={searching || receiptQuery.trim().length < 3}>
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Find"}
                </Button>
              </div>
              {matches && matches.length > 0 && (
                <ul className="space-y-2">
                  {matches.map((m) => (
                    <li key={m.sale.id}>
                      <button
                        type="button"
                        onClick={() => void pickSale(m)}
                        className="flex w-full items-center justify-between rounded-xl border border-border p-3 text-left transition-colors hover:border-gold-500/60"
                      >
                        <div>
                          <p className="font-medium">{m.sale.receiptNo}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(new Date(m.sale.createdAt))} • {m.cashierName ?? "—"} •{" "}
                            {m.customerName ?? "Walk-in"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold tabular-nums">{formatCurrency(m.sale.grandTotal)}</span>
                          <StatusBadge label={SALE_STATUS_LABELS[m.sale.status]} tone={toneForStatus(m.sale.status)} />
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {matches && matches.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">No sale matches that receipt number.</p>
              )}
            </div>
          ) : (
            <>
              {/* Selected sale header */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gold-500/30 bg-gold-500/5 p-3.5">
                <div>
                  <p className="font-semibold text-navy-900">{sale.sale.receiptNo}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(new Date(sale.sale.createdAt))} • {sale.cashierName ?? "—"} •{" "}
                    {sale.customerName ?? "Walk-in"} • {formatCurrency(sale.sale.grandTotal)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge label={SALE_STATUS_LABELS[sale.sale.status]} tone={toneForStatus(sale.sale.status)} />
                  <Button variant="ghost" size="sm" onClick={() => { setSale(null); setLines([]); }}>
                    Change
                  </Button>
                </div>
              </div>

              {/* Type toggle */}
              <div className="flex gap-2">
                {(["RETURN", "EXCHANGE"] as ReturnType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors",
                      type === t
                        ? "border-gold-500 bg-gold-500/15 text-gold-700"
                        : "border-border text-muted-foreground hover:border-gold-500/50",
                    )}
                  >
                    {t === "EXCHANGE" ? <ArrowLeftRight className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                    {t === "EXCHANGE" ? "Exchange (swap items)" : "Return (refund)"}
                  </button>
                ))}
              </div>

              {/* Items */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-navy-700">Items on this receipt</h4>
                {lines.map((l, idx) => {
                  const unitLabel = UNIT_LABELS[l.unit as keyof typeof UNIT_LABELS] ?? l.unit;
                  const exhausted = l.returnableQty <= 0;
                  return (
                    <div
                      key={l.saleItemId}
                      className={cn(
                        "rounded-xl border p-3.5 transition-colors",
                        l.selected ? "border-gold-500/60 bg-gold-500/5" : "border-border",
                        exhausted && "opacity-50",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={l.selected}
                          disabled={exhausted}
                          onCheckedChange={(v) => setLine(idx, { selected: v === true })}
                          className="mt-1"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{l.productName}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {l.sku} • paid {formatCurrency(l.unitRefund)}/{unitLabel.toLowerCase()} •{" "}
                            {exhausted ? "fully returned already" : `${formatQty(l.returnableQty)} returnable`}
                          </p>

                          {l.selected && !exhausted && (
                            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                              <div>
                                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                                  Qty ({unitLabel.toLowerCase()}, max {formatQty(l.returnableQty)})
                                </label>
                                <Input
                                  data-no-scan
                                  type="number"
                                  min="0"
                                  step={l.unit === "PIECE" || l.unit === "PAIR" || l.unit === "SET" ? "1" : "0.5"}
                                  max={l.returnableQty}
                                  value={l.quantity}
                                  onChange={(e) => setLine(idx, { quantity: e.target.value })}
                                  className="input-lux h-9"
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Condition</label>
                                <Select
                                  value={l.condition}
                                  onValueChange={(v) =>
                                    setLine(idx, { condition: v as "GOOD" | "DAMAGED", restock: v === "GOOD" ? l.restock : false })
                                  }
                                >
                                  <SelectTrigger className="h-9 bg-card"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="GOOD">Good — resellable</SelectItem>
                                    <SelectItem value="DAMAGED">Damaged — write off</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Back into stock?</label>
                                <label className="flex h-9 items-center gap-2">
                                  <Switch
                                    checked={l.restock && l.condition === "GOOD"}
                                    disabled={l.condition !== "GOOD"}
                                    onCheckedChange={(v) => setLine(idx, { restock: v })}
                                  />
                                  <span className="text-xs text-muted-foreground">
                                    {l.condition !== "GOOD" ? "N/A (damaged)" : l.restock ? "Yes, restock" : "No"}
                                  </span>
                                </label>
                              </div>
                              <div className="flex items-end justify-end">
                                <p className="text-sm font-semibold text-navy-900">
                                  {formatCurrency(l.unitRefund * Math.min(Number(l.quantity) || 0, l.returnableQty))}
                                </p>
                              </div>
                              {type === "EXCHANGE" && (
                                <div className="sm:col-span-2 lg:col-span-4">
                                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                                    Customer takes instead
                                  </label>
                                  <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
                                    <ProductPicker
                                      value={l.exchangeProduct}
                                      onChange={(p) => setLine(idx, { exchangeProduct: p })}
                                      placeholder="Pick the replacement product…"
                                    />
                                    <Input
                                      data-no-scan
                                      type="number"
                                      min="0"
                                      step="0.5"
                                      value={l.exchangeQty}
                                      onChange={(e) => setLine(idx, { exchangeQty: e.target.value })}
                                      className="input-lux h-11"
                                      placeholder="Qty"
                                    />
                                  </div>
                                  {l.exchangeProduct && (
                                    <p className="mt-1 text-[11px] text-muted-foreground">
                                      {formatCurrency(l.exchangeProduct.sellingPrice)}/
                                      {(UNIT_LABELS[l.exchangeProduct.unitOfMeasure as keyof typeof UNIT_LABELS] ?? l.exchangeProduct.unitOfMeasure).toLowerCase()}{" "}
                                      • {formatQty(l.exchangeProduct.currentStock)} in stock
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Reason / refund */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    Reason <span className="text-gold-600">*</span>
                  </label>
                  <Input
                    data-no-scan
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Wrong colour supplied, fabric flawed…"
                    className="input-lux"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Refund method</label>
                  <Select value={refundMethod} onValueChange={(v) => setRefundMethod(v as PaymentMethod)}>
                    <SelectTrigger className="bg-card"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {PAYMENT_METHOD_LABELS[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium">Internal notes</label>
                  <Textarea
                    data-no-scan
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="input-lux resize-none"
                    placeholder="Anything the team should know…"
                  />
                </div>
              </div>

              {/* Totals */}
              <div className="space-y-1.5 rounded-xl bg-navy-900/5 px-4 py-3 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Returned value</span>
                  <span className="tabular-nums">{formatCurrency(totals.returnValue)}</span>
                </div>
                {type === "EXCHANGE" && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Replacement value</span>
                    <span className="tabular-nums">{formatCurrency(totals.exchangeValue)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="font-medium">Refund to customer</span>
                  <span className="font-display text-lg font-bold tabular-nums text-navy-900">
                    {formatCurrency(totals.refund)}
                  </span>
                </div>
                {totals.topUp > 0 && (
                  <div className="flex justify-between text-amber-700">
                    <span>Customer top-up required</span>
                    <span className="font-semibold tabular-nums">{formatCurrency(totals.topUp)}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); reset(); }} disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button
            className="bg-gold-500 font-semibold text-navy-950 hover:bg-gold-400"
            disabled={!sale || selectedLines.length === 0 || createMutation.isPending}
            onClick={submit}
          >
            {createMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {type === "EXCHANGE" ? "Process Exchange" : "Process Return"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

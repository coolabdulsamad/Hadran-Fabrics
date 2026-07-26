import { useState } from "react";
import { toast } from "sonner";
import { ArrowDownToLine, ArrowUpFromLine, Loader2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { ProductPicker, type PickedProduct } from "./ProductPicker";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatQty } from "@/lib/format";

interface StockMovementFormProps {
  mode: "IN" | "OUT";
  trigger: React.ReactNode;
  /** Pre-select a product (e.g. from Low Stock page). */
  product?: PickedProduct | null;
  onDone?: () => void;
}

/** Dialog to record stock-in or stock-out against any product. */
export function StockMovementForm({ mode, trigger, product, onDone }: StockMovementFormProps) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<PickedProduct | null>(product ?? null);
  const [quantity, setQuantity] = useState<string>("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [isDamage, setIsDamage] = useState(false);

  const inMutation = trpc.inventory.stockIn.useMutation();
  const outMutation = trpc.inventory.stockOut.useMutation();
  const pending = inMutation.isPending || outMutation.isPending;

  const reset = () => {
    setPicked(product ?? null);
    setQuantity("");
    setReason("");
    setNotes("");
    setIsDamage(false);
  };

  const submit = async () => {
    const qty = Number(quantity);
    if (!picked) return toast.error("Select a product first.");
    if (!qty || qty <= 0) return toast.error("Enter a quantity greater than zero.");
    if (reason.trim().length < 2) return toast.error("Give a reason for this movement.");
    if (mode === "OUT" && qty > picked.currentStock) {
      return toast.error(`Only ${formatQty(picked.currentStock)} ${picked.unitOfMeasure.toLowerCase()}(s) in stock.`);
    }

    try {
      if (mode === "IN") {
        await inMutation.mutateAsync({ productId: picked.id, quantity: qty, reason: reason.trim(), notes: notes || undefined });
        toast.success(`Stock-in recorded: +${formatQty(qty)} ${picked.unitOfMeasure.toLowerCase()}(s) — ${picked.name}`);
      } else {
        await outMutation.mutateAsync({ productId: picked.id, quantity: qty, reason: reason.trim(), notes: notes || undefined, isDamage });
        toast.success(`Stock-out recorded: −${formatQty(qty)} ${picked.unitOfMeasure.toLowerCase()}(s) — ${picked.name}`);
      }
      await utils.inventory.invalidate();
      await utils.products.invalidate();
      await utils.dashboard.invalidate();
      setOpen(false);
      reset();
      onDone?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not record the movement.");
    }
  };

  const isIn = mode === "IN";

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) reset(); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="border-gold-500/30 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-navy-900">
            {isIn ? (
              <ArrowDownToLine className="h-5 w-5 text-emerald-600" />
            ) : (
              <ArrowUpFromLine className="h-5 w-5 text-red-500" />
            )}
            Record Stock-{isIn ? "In" : "Out"}
          </DialogTitle>
          <DialogDescription>
            {isIn
              ? "Receive new stock into inventory — the movement ledger and product balance update instantly."
              : "Record stock leaving the store (damage, transfer, manual out) with a clear reason."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy-700">Product *</label>
            <ProductPicker value={picked} onChange={setPicked} />
            {picked && (
              <p className="mt-1 text-xs text-muted-foreground">
                Current stock: <span className="font-semibold text-navy-800">{formatQty(picked.currentStock)} {picked.unitOfMeasure.toLowerCase()}(s)</span>
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy-700">
              Quantity ({picked ? `${picked.unitOfMeasure.toLowerCase()}(s)` : "units"}) *
            </label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="input-lux"
              placeholder={isIn ? "e.g. 24" : "e.g. 2"}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy-700">Reason *</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="input-lux"
              placeholder={isIn ? "e.g. New supply from wholesaler" : "e.g. Damaged in store / Transfer"}
            />
          </div>

          {!isIn && (
            <div className="flex h-11 items-center gap-3 rounded-lg border border-input bg-background px-3">
              <Switch checked={isDamage} onCheckedChange={setIsDamage} />
              <span className="text-sm text-navy-800">Mark as damage / loss</span>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy-700">Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input-lux h-auto py-2.5"
              placeholder="Optional extra detail…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} className="border-border">Cancel</Button>
          <Button
            onClick={submit}
            disabled={pending}
            className={isIn ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-red-600 text-white hover:bg-red-700"}
          >
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Confirm Stock-{isIn ? "In" : "Out"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

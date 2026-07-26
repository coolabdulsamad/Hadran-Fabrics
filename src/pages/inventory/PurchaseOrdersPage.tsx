import { useState } from "react";
import { toast } from "sonner";
import {
  PlusCircle,
  ShoppingBag,
  Trash2,
  Eye,
  PackageCheck,
  XCircle,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge, toneForStatus } from "@/components/common/StatusBadge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ProductPicker, type PickedProduct } from "@/components/inventory/ProductPicker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatDate, formatQty } from "@/lib/format";
import { UNITS } from "@contracts/index";

interface POListRow {
  id: number;
  reference: string;
  status: "PENDING" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED";
  totalCost: number;
  expectedAt: string | null;
  receivedAt: Date | null;
  createdAt: Date;
  supplierName: string | null;
  creatorName: string | null;
  itemCount: number;
}

interface DraftItem {
  product: PickedProduct;
  quantity: number;
  unitCost: number;
}

export default function PurchaseOrdersPage() {
  const utils = trpc.useUtils();
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  // Create form state
  const [supplierId, setSupplierId] = useState<string>("");
  const [expectedAt, setExpectedAt] = useState("");
  const [tax, setTax] = useState("0");
  const [notes, setNotes] = useState("");
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [picked, setPicked] = useState<PickedProduct | null>(null);
  const [pickQty, setPickQty] = useState("1");
  const [pickCost, setPickCost] = useState("");

  // Receive state
  const [receiveQtys, setReceiveQtys] = useState<Record<number, string>>({});

  const listQuery = trpc.purchases.list.useQuery();
  const suppliersQuery = trpc.suppliers.options.useQuery();
  const detailQuery = trpc.purchases.byId.useQuery({ id: detailId! }, { enabled: detailId != null });

  const createMutation = trpc.purchases.create.useMutation({
    onSuccess: async (res) => {
      await utils.purchases.list.invalidate();
      toast.success(`Purchase order ${res.reference} created.`);
      setCreateOpen(false);
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const receiveMutation = trpc.purchases.receive.useMutation({
    onSuccess: async (res) => {
      await utils.purchases.invalidate();
      await utils.inventory.invalidate();
      await utils.products.invalidate();
      toast.success(res.status === "RECEIVED" ? "Fully received — stock updated." : "Partially received — stock updated.");
      setReceiveQtys({});
    },
    onError: (e) => toast.error(e.message),
  });

  const cancelMutation = trpc.purchases.cancel.useMutation({
    onSuccess: async () => {
      await utils.purchases.list.invalidate();
      toast.info("Purchase order cancelled.");
      setDetailId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => {
    setSupplierId("");
    setExpectedAt("");
    setTax("0");
    setNotes("");
    setDraftItems([]);
    setPicked(null);
    setPickQty("1");
    setPickCost("");
  };

  const addItem = () => {
    const qty = Number(pickQty);
    const cost = Number(pickCost);
    if (!picked) return toast.error("Pick a product first.");
    if (!qty || qty <= 0) return toast.error("Enter a valid quantity.");
    if (Number.isNaN(cost) || cost < 0) return toast.error("Enter the unit cost.");
    if (draftItems.some((d) => d.product.id === picked.id)) {
      return toast.error("That product is already in the order — remove it to re-add.");
    }
    setDraftItems((prev) => [...prev, { product: picked, quantity: qty, unitCost: cost }]);
    setPicked(null);
    setPickQty("1");
    setPickCost("");
  };

  const subtotal = draftItems.reduce((s, d) => s + d.quantity * d.unitCost, 0);
  const total = subtotal + (Number(tax) || 0);

  const submitCreate = () => {
    if (draftItems.length === 0) return toast.error("Add at least one item to the order.");
    createMutation.mutate({
      supplierId: supplierId ? Number(supplierId) : null,
      expectedAt: expectedAt || undefined,
      tax: Number(tax) || 0,
      notes: notes || undefined,
      items: draftItems.map((d) => ({
        productId: d.product.id,
        quantity: d.quantity,
        unit: d.product.unitOfMeasure as (typeof UNITS)[number],
        unitCost: d.unitCost,
      })),
    });
  };

  /* ------------------------- DETAIL VIEW ------------------------- */
  if (detailId != null && detailQuery.data) {
    const { purchase, supplierName, creatorName, items } = detailQuery.data;
    const receivable = purchase.status === "PENDING" || purchase.status === "PARTIALLY_RECEIVED";

    const doReceive = () => {
      const receipts = items
        .map((i) => {
          const remaining = Number((i.quantity - i.receivedQty).toFixed(3));
          const raw = receiveQtys[i.id];
          const qty = raw === undefined || raw === "" ? remaining : Number(raw);
          return qty > 0 ? { itemId: i.id, quantity: qty } : null;
        })
        .filter(Boolean) as { itemId: number; quantity: number }[];
      if (receipts.length === 0) return toast.error("Nothing to receive — all items are complete.");
      receiveMutation.mutate({ purchaseId: purchase.id, receipts });
    };

    return (
      <div>
        <PageHeader
          title={`Purchase Order ${purchase.reference}`}
          description={`Created ${formatDate(purchase.createdAt)} by ${creatorName ?? "—"} · Supplier: ${supplierName ?? "—"}`}
          actions={
            <div className="flex items-center gap-2">
              <StatusBadge label={purchase.status} tone={toneForStatus(purchase.status)} />
              <Button variant="outline" onClick={() => setDetailId(null)} className="border-border">
                <ArrowLeft className="mr-2 h-4 w-4" />
                All Orders
              </Button>
            </div>
          }
        />

        <div className="card-lux overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-cream-200/60">
                {["Product", "Ordered", "Received", "Remaining", "Unit Cost", "Line Total", receivable ? "Receive Now" : ""].map(
                  (h) =>
                    h && (
                      <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-navy-700">
                        {h}
                      </th>
                    ),
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const remaining = Number((i.quantity - i.receivedQty).toFixed(3));
                return (
                  <tr key={i.id} className="border-b border-border/60">
                    <td className="px-4 py-3">
                      <p className="font-medium text-navy-900">{i.productName}</p>
                      <p className="text-xs text-muted-foreground">{i.sku}</p>
                    </td>
                    <td className="px-4 py-3 text-right">{formatQty(i.quantity)} {i.unit.toLowerCase()}(s)</td>
                    <td className="px-4 py-3 text-right text-emerald-700">{formatQty(i.receivedQty)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-navy-900">{formatQty(remaining)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(i.unitCost)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(i.lineTotal)}</td>
                    {receivable && (
                      <td className="px-4 py-3 text-right">
                        {remaining > 0 ? (
                          <input
                            type="number"
                            min="0"
                            max={remaining}
                            step="0.5"
                            value={receiveQtys[i.id] ?? remaining}
                            onChange={(e) => setReceiveQtys((prev) => ({ ...prev, [i.id]: e.target.value }))}
                            className="h-9 w-24 rounded-md border border-input bg-background px-2 text-right text-sm outline-none focus:border-gold-500"
                          />
                        ) : (
                          <StatusBadge label="DONE" tone="green" />
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-cream-200/40 px-5 py-4">
            <div className="text-sm text-navy-800">
              Subtotal <strong>{formatCurrency(purchase.subtotal)}</strong> · Tax{" "}
              <strong>{formatCurrency(purchase.tax)}</strong> · Total{" "}
              <strong className="font-display text-base text-navy-900">{formatCurrency(purchase.totalCost)}</strong>
            </div>
            <div className="flex gap-2">
              {receivable && (
                <>
                  <Button onClick={doReceive} disabled={receiveMutation.isPending} className="bg-emerald-600 text-white hover:bg-emerald-700">
                    {receiveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackageCheck className="mr-2 h-4 w-4" />}
                    Receive Into Stock
                  </Button>
                  {purchase.status === "PENDING" && (
                    <ConfirmDialog
                      trigger={
                        <Button variant="outline" className="border-red-300 text-red-600 hover:bg-red-50">
                          <XCircle className="mr-2 h-4 w-4" />
                          Cancel Order
                        </Button>
                      }
                      title="Cancel this purchase order?"
                      description="The order is marked cancelled. No stock changes are made."
                      destructive
                      confirmLabel="Cancel Order"
                      onConfirm={() => cancelMutation.mutate({ purchaseId: purchase.id })}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {purchase.notes && (
          <div className="card-lux mt-4 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</p>
            <p className="mt-1 text-sm text-navy-800">{purchase.notes}</p>
          </div>
        )}
      </div>
    );
  }

  /* -------------------------- LIST VIEW -------------------------- */
  const columns: Column<POListRow>[] = [
    { header: "Reference", render: (p) => <span className="font-mono text-sm font-semibold text-navy-900">{p.reference}</span> },
    { header: "Supplier", render: (p) => <span className="text-navy-800">{p.supplierName ?? "—"}</span> },
    { header: "Items", className: "text-right", render: (p) => <span>{p.itemCount}</span> },
    { header: "Total Cost", className: "text-right", render: (p) => <span className="font-semibold text-navy-900">{formatCurrency(p.totalCost)}</span> },
    { header: "Status", render: (p) => <StatusBadge label={p.status} tone={toneForStatus(p.status)} /> },
    { header: "Expected", render: (p) => <span className="text-xs text-navy-800">{p.expectedAt ? formatDate(p.expectedAt) : "—"}</span> },
    { header: "Created", render: (p) => <span className="text-xs text-navy-800">{formatDate(p.createdAt)}</span> },
    {
      header: "Action",
      className: "text-right",
      render: (p) => (
        <Button size="sm" variant="outline" onClick={() => setDetailId(p.id)} className="h-8 border-gold-500/40 text-navy-800 hover:bg-gold-50">
          <Eye className="mr-1.5 h-3.5 w-3.5" />
          {p.status === "PENDING" || p.status === "PARTIALLY_RECEIVED" ? "Receive / View" : "View"}
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Purchase Orders"
        description="Order stock from suppliers and receive it straight into inventory through the stock ledger."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="bg-navy-800 text-cream-100 hover:bg-navy-700">
            <PlusCircle className="mr-2 h-4 w-4 text-gold-400" />
            New Purchase Order
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={listQuery.data as POListRow[] | undefined}
        loading={listQuery.isLoading}
        keyFn={(p) => p.id}
        emptyTitle="No purchase orders yet"
        emptyDescription="Create your first order to a supplier."
      />

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-gold-500/30 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-navy-900">
              <ShoppingBag className="h-5 w-5 text-gold-600" />
              New Purchase Order
            </DialogTitle>
            <DialogDescription>Add products with quantities and unit costs — totals compute automatically.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy-700">Supplier</label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger className="h-11 border-input bg-background">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(suppliersQuery.data ?? []).map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy-700">Expected Date</label>
                <input type="date" value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)} className="input-lux" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy-700">Tax / Extra (₦)</label>
                <input type="number" min="0" step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} className="input-lux" />
              </div>
            </div>

            {/* Item adder */}
            <div className="rounded-lg border border-gold-500/30 bg-gold-50/40 p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-navy-700">Add Item</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_110px_130px_auto]">
                <ProductPicker value={picked} onChange={setPicked} />
                <input type="number" min="0.5" step="0.5" value={pickQty} onChange={(e) => setPickQty(e.target.value)} className="input-lux" placeholder="Qty" />
                <input type="number" min="0" step="0.01" value={pickCost} onChange={(e) => setPickCost(e.target.value)} className="input-lux" placeholder="Unit cost ₦" />
                <Button type="button" onClick={addItem} className="h-11 bg-navy-800 text-cream-100 hover:bg-navy-700">Add</Button>
              </div>
            </div>

            {/* Items list */}
            {draftItems.length > 0 && (
              <div className="rounded-lg border border-border">
                {draftItems.map((d, idx) => (
                  <div key={d.product.id} className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5 last:border-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-navy-900">{d.product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatQty(d.quantity)} {d.product.unitOfMeasure.toLowerCase()}(s) × {formatCurrency(d.unitCost)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-sm font-semibold text-navy-900">{formatCurrency(d.quantity * d.unitCost)}</span>
                      <button onClick={() => setDraftItems((prev) => prev.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-700">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
                <div className="flex justify-end gap-6 bg-cream-200/50 px-4 py-3 text-sm">
                  <span>Subtotal: <strong>{formatCurrency(subtotal)}</strong></span>
                  <span>Total: <strong className="font-display text-navy-900">{formatCurrency(total)}</strong></span>
                </div>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy-700">Notes</label>
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="input-lux h-auto py-2.5" placeholder="Delivery terms, supplier promises…" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} className="border-border">Cancel</Button>
            <Button onClick={submitCreate} disabled={createMutation.isPending} className="bg-navy-800 text-cream-100 hover:bg-navy-700">
              {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create Order — {formatCurrency(total)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

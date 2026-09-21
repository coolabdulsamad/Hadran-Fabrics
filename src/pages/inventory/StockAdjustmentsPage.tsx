import { useState } from "react";
import { toast } from "sonner";
import { Loader2, SlidersHorizontal, BadgeCheck } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { ProductPicker, type PickedProduct } from "@/components/inventory/ProductPicker";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatQty } from "@/lib/format";
import { MOVEMENT_LABELS } from "@contracts/index";
import { cn } from "@/lib/utils";

type AdjustmentRow = {
  id: number;
  movementType: keyof typeof MOVEMENT_LABELS;
  quantity: number;
  unit: string;
  balanceAfter: number;
  reason: string | null;
  createdAt: Date;
  productName: string;
  sku: string;
  performedByName: string | null;
};

export default function StockAdjustmentsPage() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [picked, setPicked] = useState<PickedProduct | null>(null);
  const [newBalance, setNewBalance] = useState<string>("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [page, setPage] = useState(1);

  const isManager = user?.role === "MANAGER";

  const adjustmentsQuery = trpc.inventory.movements.useQuery(
    { movementType: "ADJUSTMENT", page, pageSize: 15 },
    { retry: 1 },
  );

  const adjustMutation = trpc.inventory.adjust.useMutation({
    onSuccess: async (res) => {
      await utils.inventory.invalidate();
      await utils.products.invalidate();
      if (res.pending) {
        toast.info("Adjustment sent to Admin for approval", {
          description: "The balance updates once an Admin approves the request.",
        });
      } else {
        toast.success("Stock adjusted.", { description: `New balance: ${formatQty(res.newBalance ?? 0)}` });
      }
      setPicked(null);
      setNewBalance("");
      setReason("");
      setNotes("");
    },
    onError: (e) => toast.error(e.message),
  });

  const submit = () => {
    const balance = Number(newBalance);
    if (!picked) return toast.error("Select a product first.");
    if (newBalance === "" || Number.isNaN(balance) || balance < 0) return toast.error("Enter the correct new balance.");
    if (balance === picked.currentStock) return toast.error("New balance equals current stock — nothing to adjust.");
    if (reason.trim().length < 3) return toast.error("A clear reason is required.");
    adjustMutation.mutate({
      productId: picked.id,
      newBalance: balance,
      reason: reason.trim(),
      notes: notes || undefined,
    });
  };

  const columns: Column<AdjustmentRow>[] = [
    { header: "When", render: (m) => <span className="whitespace-nowrap text-xs text-navy-800">{formatDateTime(m.createdAt)}</span> },
    {
      header: "Product",
      render: (m) => (
        <div className="min-w-0">
          <p className="max-w-[260px] truncate font-medium text-navy-900">{m.productName}</p>
          <p className="text-xs text-muted-foreground">{m.sku}</p>
        </div>
      ),
    },
    {
      header: "Adjustment",
      className: "text-right",
      render: (m) => (
        <span className={cn("font-bold", m.quantity >= 0 ? "text-emerald-600" : "text-red-600")}>
          {m.quantity >= 0 ? "+" : ""}
          {formatQty(m.quantity)}
        </span>
      ),
    },
    { header: "New Balance", className: "text-right", render: (m) => <span className="font-medium text-navy-900">{formatQty(m.balanceAfter)}</span> },
    { header: "Reason", render: (m) => <span className="block max-w-[240px] truncate text-xs text-navy-800">{m.reason}</span> },
    { header: "By", render: (m) => <span className="whitespace-nowrap text-xs text-navy-800">{m.performedByName ?? "—"}</span> },
  ];

  return (
    <div>
      <PageHeader
        title="Stock Adjustments"
        description="Correct inventory balances with a mandatory reason trail. Manager adjustments route through Admin approval."
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* Adjustment form */}
        <div className="card-lux-gold h-fit p-5">
          <h3 className="flex items-center gap-2 font-display text-base font-semibold text-navy-900">
            <SlidersHorizontal className="h-4 w-4 text-gold-600" />
            New Adjustment
          </h3>

          {isManager && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-gold-500/40 bg-gold-50 px-3 py-2.5">
              <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold-700" />
              <p className="text-xs leading-relaxed text-gold-800">
                As a Manager, your adjustment will be sent to an Admin for approval before the
                balance changes.
              </p>
            </div>
          )}

          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy-700">Product *</label>
              <ProductPicker value={picked} onChange={setPicked} />
            </div>

            {picked && (
              <div className="rounded-lg bg-cream-200/70 px-4 py-3 text-sm">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Current balance (this branch)</p>
                <p className="font-display text-lg font-bold text-navy-900">
                  {formatQty(picked.currentStock)} {picked.unitOfMeasure.toLowerCase()}(s)
                </p>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy-700">
                Correct New Balance *
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={newBalance}
                onChange={(e) => setNewBalance(e.target.value)}
                className="input-lux"
                placeholder="e.g. 42"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy-700">Reason *</label>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="input-lux"
                placeholder="e.g. Found 2 extra packs in store room"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy-700">Notes</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input-lux h-auto py-2.5"
                placeholder="Optional detail for the audit trail…"
              />
            </div>

            <Button
              onClick={submit}
              disabled={adjustMutation.isPending}
              className="h-11 w-full bg-navy-800 font-semibold text-cream-100 hover:bg-navy-700"
            >
              {adjustMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {isManager ? "Submit for Approval" : "Apply Adjustment"}
            </Button>
          </div>
        </div>

        {/* Recent adjustments */}
        <div className="xl:col-span-2">
          <DataTable
            columns={columns}
            data={adjustmentsQuery.data?.items as AdjustmentRow[] | undefined}
            loading={adjustmentsQuery.isLoading}
            keyFn={(m) => m.id}
            emptyTitle="No adjustments yet"
            emptyDescription="Applied stock corrections appear here."
            pagination={
              adjustmentsQuery.data
                ? { page, pageSize: 15, total: adjustmentsQuery.data.total, onPage: setPage }
                : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}

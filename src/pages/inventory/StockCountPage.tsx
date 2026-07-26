import { useState } from "react";
import { toast } from "sonner";
import {
  PlusCircle,
  Save,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge, toneForStatus } from "@/components/common/StatusBadge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";

interface CountListRow {
  id: number;
  reference: string;
  status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  notes: string | null;
  startedAt: Date;
  completedAt: Date | null;
  startedByName: string | null;
}

interface CountItem {
  id: number;
  productId: number;
  expectedQty: number;
  countedQty: number | null;
  variance: number | null;
  productName: string;
  sku: string;
  unitOfMeasure: string;
  categoryName: string;
}

export default function StockCountPage() {
  const utils = trpc.useUtils();
  const [activeCountId, setActiveCountId] = useState<number | null>(null);
  const [entries, setEntries] = useState<Record<number, string>>({});

  const listQuery = trpc.inventory.listCounts.useQuery();
  const detailQuery = trpc.inventory.getCount.useQuery(
    { id: activeCountId! },
    { enabled: activeCountId != null },
  );

  const startMutation = trpc.inventory.startCount.useMutation({
    onSuccess: async (res) => {
      await utils.inventory.listCounts.invalidate();
      toast.success(`Stock count ${res.reference} started — all active products snapshotted.`);
      setActiveCountId(res.id);
      setEntries({});
    },
    onError: (e) => toast.error(e.message),
  });

  const saveMutation = trpc.inventory.saveCountEntries.useMutation({
    onSuccess: async () => {
      await utils.inventory.getCount.invalidate({ id: activeCountId! });
      toast.success("Counted quantities saved.");
    },
    onError: (e) => toast.error(e.message),
  });

  const completeMutation = trpc.inventory.completeCount.useMutation({
    onSuccess: async (res) => {
      await utils.inventory.invalidate();
      await utils.products.invalidate();
      toast.success(`Count completed — ${res.corrections} correction(s) applied to stock.`);
      setActiveCountId(null);
      setEntries({});
    },
    onError: (e) => toast.error(e.message),
  });

  const cancelMutation = trpc.inventory.cancelCount.useMutation({
    onSuccess: async () => {
      await utils.inventory.listCounts.invalidate();
      toast.info("Stock count cancelled.");
      setActiveCountId(null);
      setEntries({});
    },
    onError: (e) => toast.error(e.message),
  });

  /* ------------------------- DETAIL VIEW ------------------------- */
  if (activeCountId != null && detailQuery.data) {
    const { count, startedByName, items } = detailQuery.data;
    const inProgress = count.status === "IN_PROGRESS";

    const saveAll = () => {
      // Save every row that has a value in the input OR was previously counted
      const payload = items
        .map((i: CountItem) => {
          const raw = entries[i.id];
          if (raw === undefined) return null;
          const n = Number(raw);
          return Number.isNaN(n) || n < 0 ? null : { itemId: i.id, countedQty: n };
        })
        .filter(Boolean) as { itemId: number; countedQty: number }[];
      if (payload.length === 0) return toast.error("Enter at least one counted quantity.");
      saveMutation.mutate({ countId: count.id, entries: payload });
    };

    const countedSoFar = items.filter((i: CountItem) => i.countedQty != null || entries[i.id] !== undefined).length;

    const columns: Column<CountItem>[] = [
      {
        header: "Product",
        render: (i) => (
          <div className="min-w-0">
            <p className="max-w-[260px] truncate font-medium text-navy-900">{i.productName}</p>
            <p className="text-xs text-muted-foreground">{i.sku} · {i.categoryName}</p>
          </div>
        ),
      },
      {
        header: "Expected",
        className: "text-right",
        render: (i) => <span className="font-medium text-navy-900">{formatQty(i.expectedQty)}</span>,
      },
      {
        header: "Counted",
        className: "text-right",
        render: (i) =>
          inProgress ? (
            <input
              type="number"
              min="0"
              step="0.5"
              value={entries[i.id] ?? (i.countedQty != null ? String(i.countedQty) : "")}
              onChange={(e) => setEntries((prev) => ({ ...prev, [i.id]: e.target.value }))}
              className="h-9 w-28 rounded-md border border-input bg-background px-2 text-right text-sm outline-none focus:border-gold-500"
              placeholder="—"
            />
          ) : (
            <span className="font-medium text-navy-900">{i.countedQty != null ? formatQty(i.countedQty) : "—"}</span>
          ),
      },
      {
        header: "Variance",
        className: "text-right",
        render: (i) => {
          const raw = entries[i.id];
          const counted = raw !== undefined && raw !== "" ? Number(raw) : i.countedQty;
          if (counted == null || Number.isNaN(counted)) return <span className="text-muted-foreground">—</span>;
          const variance = Number((counted - i.expectedQty).toFixed(3));
          return (
            <span className={cn("font-bold", variance === 0 ? "text-emerald-600" : "text-red-600")}>
              {variance > 0 ? "+" : ""}
              {formatQty(variance)}
            </span>
          );
        },
      },
      { header: "Unit", render: (i) => <span className="text-xs text-muted-foreground">{i.unitOfMeasure.toLowerCase()}(s)</span> },
    ];

    return (
      <div>
        <PageHeader
          title={`Stock Count ${count.reference}`}
          description={`Started ${formatDateTime(count.startedAt)} by ${startedByName ?? "—"} · ${countedSoFar}/${items.length} products counted`}
          actions={
            <div className="flex items-center gap-2">
              <StatusBadge label={count.status} tone={toneForStatus(count.status)} />
              <Button variant="outline" onClick={() => { setActiveCountId(null); setEntries({}); }} className="border-border">
                <ArrowLeft className="mr-2 h-4 w-4" />
                All Counts
              </Button>
            </div>
          }
        />

        {inProgress && (
          <div className="card-lux-gold mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm text-navy-800">
              Count the physical stock, enter the real quantities, save, then complete — variances
              post automatic <strong>COUNT_CORRECTION</strong> movements.
            </p>
            <div className="flex gap-2">
              <Button onClick={saveAll} disabled={saveMutation.isPending} variant="outline" className="border-gold-500/40 text-navy-800 hover:bg-gold-50">
                {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4 text-gold-600" />}
                Save Entries
              </Button>
              <ConfirmDialog
                trigger={
                  <Button className="bg-emerald-600 text-white hover:bg-emerald-700">
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Complete Count
                  </Button>
                }
                title="Complete this stock count?"
                description="Saved variances will immediately adjust stock balances via correction movements. This cannot be undone."
                confirmLabel="Complete & Apply"
                onConfirm={() => completeMutation.mutate({ countId: count.id })}
              />
              <ConfirmDialog
                trigger={
                  <Button variant="outline" className="border-red-300 text-red-600 hover:bg-red-50">
                    <XCircle className="mr-2 h-4 w-4" />
                    Cancel
                  </Button>
                }
                title="Cancel this stock count?"
                description="The session is discarded and no stock changes are made."
                destructive
                confirmLabel="Cancel Count"
                onConfirm={() => cancelMutation.mutate({ countId: count.id })}
              />
            </div>
          </div>
        )}

        <DataTable
          columns={columns}
          data={items as CountItem[]}
          loading={detailQuery.isLoading}
          keyFn={(i) => i.id}
          emptyTitle="No products in this count"
        />
      </div>
    );
  }

  /* -------------------------- LIST VIEW -------------------------- */
  const columns: Column<CountListRow>[] = [
    { header: "Reference", render: (c) => <span className="font-mono text-sm font-semibold text-navy-900">{c.reference}</span> },
    { header: "Status", render: (c) => <StatusBadge label={c.status} tone={toneForStatus(c.status)} /> },
    { header: "Started", render: (c) => <span className="whitespace-nowrap text-xs text-navy-800">{formatDateTime(c.startedAt)}</span> },
    { header: "Started By", render: (c) => <span className="text-xs text-navy-800">{c.startedByName ?? "—"}</span> },
    { header: "Completed", render: (c) => <span className="whitespace-nowrap text-xs text-navy-800">{c.completedAt ? formatDateTime(c.completedAt) : "—"}</span> },
    {
      header: "Action",
      className: "text-right",
      render: (c) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => { setActiveCountId(c.id); setEntries({}); }}
          className="h-8 border-gold-500/40 text-navy-800 hover:bg-gold-50"
        >
          {c.status === "IN_PROGRESS" ? "Continue Count" : "View"}
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Stock Counts"
        description="Physical stock-taking: snapshot expected balances, count the shelves, apply variance corrections."
        actions={
          <Button onClick={() => startMutation.mutate({})} disabled={startMutation.isPending} className="bg-navy-800 text-cream-100 hover:bg-navy-700">
            {startMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4 text-gold-400" />}
            Start New Count
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={listQuery.data as CountListRow[] | undefined}
        loading={listQuery.isLoading}
        keyFn={(c) => c.id}
        emptyTitle="No stock counts yet"
        emptyDescription="Start your first physical stock-taking session."
      />
    </div>
  );
}

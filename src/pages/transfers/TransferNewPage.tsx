import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeft, ArrowRight, Loader2, PackageSearch, PlusCircle, Search, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/layout/PageHeader";
import { LoadingScreen } from "@/components/common/LoadingScreen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBranch } from "@/hooks/use-branch";
import { useDebounce } from "@/hooks/use-debounce";
import { formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * HADRAN FABRICS MALL — new stock transfer
 * Pick a destination branch, then build item lines from products with stock
 * at YOUR active branch. Quantities above branch stock are flagged but the
 * server is the final authority (strict per-branch check at creation).
 */

interface StockHit {
  id: number;
  sku: string;
  name: string;
  unitOfMeasure: string;
  globalStock: string | number;
  branchStock: number;
}

interface Line {
  productId: number;
  name: string;
  sku: string;
  unit: string;
  branchStock: number;
  quantity: string;
}

export default function TransferNewPage() {
  const navigate = useNavigate();
  const { branch, serverBranch, isLoading: branchLoading } = useBranch();
  const activeBranch = serverBranch ?? branch;

  const [toBranchId, setToBranchId] = useState<string>("");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [lines, setLines] = useState<Line[]>([]);

  const branchesQuery = trpc.branches.list.useQuery(undefined, { retry: 1 });
  const destinations = useMemo(
    () => (branchesQuery.data ?? []).filter((b) => b.status === "ACTIVE" && b.id !== activeBranch?.id),
    [branchesQuery.data, activeBranch?.id],
  );

  const stockQuery = trpc.branches.stockAt.useQuery(
    { branchId: activeBranch?.id ?? 0, search: debouncedSearch || undefined },
    { enabled: activeBranch != null, retry: 1 },
  );
  const hits = useMemo(
    () => ((stockQuery.data ?? []) as StockHit[]).filter((h) => !lines.some((l) => l.productId === h.id)),
    [stockQuery.data, lines],
  );

  const createMutation = trpc.transfers.create.useMutation({
    onSuccess: (res) => {
      toast.success(`Transfer ${res.refNo} created — awaiting approval.`);
      navigate(`/transfers/${res.transferId}`);
    },
    onError: (err) => toast.error(err.message),
  });

  if (branchLoading) return <LoadingScreen label="Loading branch context…" />;

  const addLine = (hit: StockHit) => {
    setLines((ls) => [
      ...ls,
      {
        productId: hit.id,
        name: hit.name,
        sku: hit.sku,
        unit: hit.unitOfMeasure,
        branchStock: hit.branchStock,
        quantity: "",
      },
    ]);
    setSearch("");
  };

  const setQty = (productId: number, quantity: string) => {
    setLines((ls) => ls.map((l) => (l.productId === productId ? { ...l, quantity } : l)));
  };

  const removeLine = (productId: number) => setLines((ls) => ls.filter((l) => l.productId !== productId));

  const overdrawn = lines.filter((l) => Number(l.quantity) > l.branchStock);
  const valid =
    toBranchId !== "" &&
    lines.length > 0 &&
    lines.every((l) => Number(l.quantity) > 0) &&
    overdrawn.length === 0;

  const submit = () => {
    if (!valid) {
      toast.error("Pick a destination and give every line a quantity within branch stock.");
      return;
    }
    createMutation.mutate({
      toBranchId: Number(toBranchId),
      note: note.trim() || undefined,
      items: lines.map((l) => ({ productId: l.productId, quantity: Number(l.quantity) })),
    });
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="New Stock Transfer"
        description={`Sending from ${activeBranch?.name ?? "your branch"} — stock leaves on dispatch, not before.`}
        actions={
          <Button asChild variant="outline" className="gap-2">
            <Link to="/transfers"><ArrowLeft className="h-4 w-4" />All Transfers</Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Left: lines */}
        <section className="rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-display text-lg font-semibold text-navy-900">Items to Transfer</h2>
            <p className="text-xs text-muted-foreground">{lines.length} line(s) — quantities are in each product's unit of measure.</p>
          </div>

          {/* Product search */}
          <div className="border-b border-border px-5 py-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search stock at ${activeBranch?.name ?? "this branch"} by name, SKU or barcode…`}
                className="pl-9"
              />
            </div>
            {(debouncedSearch || stockQuery.isLoading) && (
              <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-border">
                {stockQuery.isLoading ? (
                  <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Searching…
                  </p>
                ) : hits.length === 0 ? (
                  <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                    <PackageSearch className="h-4 w-4" /> No matching products.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {hits.map((h) => (
                      <li key={h.id} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-navy-900">{h.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {h.sku} · {formatQty(h.branchStock)} {h.unitOfMeasure.toLowerCase()} at this branch
                          </p>
                        </div>
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => addLine(h)} disabled={h.branchStock <= 0}>
                          <PlusCircle className="h-3.5 w-3.5" /> Add
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Lines */}
          {lines.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-muted-foreground">
              No items yet — search above to add products to this transfer.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {lines.map((l) => {
                const over = Number(l.quantity) > l.branchStock;
                return (
                  <li key={l.productId} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-navy-900">{l.name}</p>
                      <p className={cn("text-xs", over ? "font-semibold text-red-700" : "text-muted-foreground")}>
                        {l.sku} · available: {formatQty(l.branchStock)} {l.unit.toLowerCase()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={l.quantity}
                        onChange={(e) => setQty(l.productId, e.target.value)}
                        placeholder="Qty"
                        className={cn("h-9 w-28 text-right", over && "border-red-500 text-red-700 focus-visible:ring-red-500")}
                      />
                      <span className="w-14 text-xs text-muted-foreground">{l.unit.toLowerCase()}</span>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-red-700" onClick={() => removeLine(l.productId)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {overdrawn.length > 0 && (
            <p className="flex items-center gap-2 border-t border-red-200 bg-red-50 px-5 py-3 text-xs font-medium text-red-700">
              <TriangleAlert className="h-4 w-4" />
              {overdrawn.length} line(s) exceed this branch's stock — adjust before submitting.
            </p>
          )}
        </section>

        {/* Right: destination + note */}
        <aside className="h-fit rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-display text-lg font-semibold text-navy-900">Route</h2>
          </div>
          <div className="space-y-4 px-5 py-4">
            <div>
              <Label>From</Label>
              <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm font-semibold text-navy-900">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: activeBranch?.themeAccent ?? "#C9A227" }} />
                {activeBranch?.name ?? "—"}
              </div>
            </div>
            <div>
              <Label>To *</Label>
              <Select value={toBranchId} onValueChange={setToBranchId}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Pick destination branch…" />
                </SelectTrigger>
                <SelectContent>
                  {destinations.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      <span className="flex items-center gap-2">
                        {b.name}
                        <span className="font-mono text-[10px] text-muted-foreground">{b.code}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {destinations.length === 0 && (
                <p className="mt-1.5 text-xs text-muted-foreground">No other active branches — register one first.</p>
              )}
            </div>
            <div>
              <Label htmlFor="tnote">Note</Label>
              <Textarea
                id="tnote"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Reason for the transfer, vehicle, driver…"
                className="mt-1.5 min-h-[90px]"
                maxLength={400}
              />
            </div>
            <Button onClick={submit} disabled={!valid || createMutation.isPending} className="w-full gap-2 bg-navy-800 text-cream-100 hover:bg-navy-700">
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4 text-gold-400" />}
              Submit for Approval
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">
              A different manager must approve before dispatch.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

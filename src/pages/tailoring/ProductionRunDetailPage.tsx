import { useState } from "react";
import { Link, useParams } from "react-router";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Loader2,
  PlayCircle,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { LoadingScreen } from "@/components/common/LoadingScreen";
import { PrintPortal } from "@/components/common/PrintPortal";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { PRODUCTION_STATUS_LABELS } from "@contracts/labels";
import { STORE, type ProductionStatus } from "@contracts/constants";
import { productionStatusTone } from "@/lib/tailoring";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * HADRAN FABRICS MALL — production run detail
 * One run's materials, stock impact and lifecycle actions:
 * start (deduct materials), complete (book output), cancel (return
 * materials if already started) — plus a printable job sheet.
 */

interface MaterialRow {
  id: number;
  productId: number;
  productName: string;
  unit: string;
  quantityPlanned: string;
  quantityUsed: string | null;
  currentStock?: number | string | null;
}

export default function ProductionRunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const runId = Number(id);
  const { hasPermission } = useAuth();

  const run = trpc.production.getById.useQuery({ id: runId }, { retry: 1 });

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [printSheet, setPrintSheet] = useState(false);

  const refresh = () => run.refetch();

  const startMutation = trpc.production.start.useMutation({
    onSuccess: () => { toast.success("Run started — materials deducted from stock."); refresh(); },
    onError: (err) => toast.error(err.message),
  });
  const completeMutation = trpc.production.complete.useMutation({
    onSuccess: () => { toast.success("Run completed — output booked into stock."); refresh(); },
    onError: (err) => toast.error(err.message),
  });
  const cancelMutation = trpc.production.cancel.useMutation({
    onSuccess: (r) => {
      toast.success(r.materialsReturned > 0 ? `Cancelled — ${r.materialsReturned} material line(s) returned to stock.` : "Run cancelled.");
      setCancelOpen(false);
      setCancelReason("");
      refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  if (run.isLoading) return <LoadingScreen label="Loading production run…" />;
  if (!run.data) {
    return (
      <div className="mx-auto max-w-3xl py-20 text-center">
        <p className="text-sm text-muted-foreground">Production run not found.</p>
        <Link to="/tailoring/production" className="mt-2 inline-block text-sm font-semibold text-gold-700 hover:underline">Back to runs</Link>
      </div>
    );
  }

  const o = run.data;
  const materials = o.materials as MaterialRow[];
  const canManage = hasPermission("production.manage");
  const insufficient = o.status === "DRAFT"
    ? materials.filter((m) => Number(m.quantityPlanned) > Number(m.currentStock ?? 0) + 0.0001)
    : [];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={o.refNo}
        description={`${o.outputProductName ?? `Product #${o.outputProductId}`} × ${Number(o.outputQty)} — requested ${formatDateTime(o.createdAt)} by ${o.requestedByName ?? "staff"}.`}
        actions={
          <>
            <Link to="/tailoring/production">
              <Button variant="outline" className="gap-2 border-gold-500/40 text-navy-800 hover:bg-gold-50">
                <ArrowLeft className="h-4 w-4 text-gold-600" />
                Runs
              </Button>
            </Link>
            <Button
              variant="outline"
              onClick={() => { setPrintSheet(true); setTimeout(() => window.print(), 250); }}
              className="gap-2 border-gold-500/40 text-navy-800 hover:bg-gold-50"
            >
              <Printer className="h-4 w-4 text-gold-600" />
              Job Sheet
            </Button>
            {o.status === "DRAFT" && canManage && (
              <Button
                onClick={() => startMutation.mutate({ id: runId })}
                disabled={startMutation.isPending || insufficient.length > 0}
                title={insufficient.length > 0 ? `Not enough stock: ${insufficient.map((m) => m.productName).join(", ")}` : undefined}
                className="gap-2 bg-navy-800 text-cream-100 hover:bg-navy-700"
              >
                {startMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4 text-gold-400" />}
                Start Run
              </Button>
            )}
            {o.status === "IN_PROGRESS" && canManage && (
              <Button
                onClick={() => completeMutation.mutate({ id: runId })}
                disabled={completeMutation.isPending}
                className="gap-2 bg-emerald-700 text-cream-100 hover:bg-emerald-600"
              >
                {completeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Complete Run
              </Button>
            )}
          </>
        }
      />

      {/* Status strip */}
      <div className="card-lux flex flex-wrap items-center gap-2 p-4">
        <StatusBadge label={PRODUCTION_STATUS_LABELS[o.status as ProductionStatus]} tone={productionStatusTone(o.status as ProductionStatus)} />
        <span className="ml-auto text-xs text-muted-foreground">
          {o.startedAt ? `Started ${formatDateTime(o.startedAt)}` : "Not started"}
          {o.completedAt && ` · Completed ${formatDateTime(o.completedAt)}`}
          {o.approvedByName && ` · Approved by ${o.approvedByName}`}
        </span>
      </div>

      {insufficient.length > 0 && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          Not enough stock to start: {insufficient.map((m) => `${m.productName} (needs ${m.quantityPlanned}, has ${m.currentStock})`).join("; ")}.
          Restock first, or cancel this run.
        </p>
      )}

      {/* Materials */}
      <div className="card-lux mt-4 p-5">
        <h2 className="font-display text-base font-bold text-navy-900">Materials ({materials.length})</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="pb-2 pr-3">Material</th>
                <th className="pb-2 pr-3 text-right">Planned</th>
                <th className="pb-2 pr-3 text-right">Used</th>
                <th className="pb-2 text-right">Current Stock</th>
              </tr>
            </thead>
            <tbody>
              {materials.map((m) => {
                const over = o.status === "DRAFT" && Number(m.quantityPlanned) > Number(m.currentStock ?? 0) + 0.0001;
                return (
                  <tr key={m.id} className="border-b border-border/60">
                    <td className="py-2.5 pr-3">
                      <Link to={`/inventory/products/${m.productId}`} className="text-xs font-semibold text-navy-900 underline-offset-2 hover:text-gold-700 hover:underline">
                        {m.productName}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-3 text-right text-xs">{Number(m.quantityPlanned)} {m.unit}</td>
                    <td className="py-2.5 pr-3 text-right text-xs">
                      {m.quantityUsed != null ? `${Number(m.quantityUsed)} ${m.unit}` : "—"}
                    </td>
                    <td className={cn("py-2.5 text-right text-xs font-semibold", over ? "text-red-600" : "text-emerald-700")}>
                      {m.currentStock ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {o.notes && (
          <p className="mt-3 whitespace-pre-line rounded-lg bg-cream-50 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-semibold text-navy-800">Notes:</span> {o.notes}
          </p>
        )}
      </div>

      {/* Output */}
      <div className="card-lux mt-4 p-5">
        <h2 className="font-display text-base font-bold text-navy-900">Output</h2>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-navy-900">{o.outputProductName ?? `Product #${o.outputProductId}`}</p>
            <p className="font-mono text-[11px] text-muted-foreground">{o.outputProductSku}</p>
          </div>
          <StatusBadge
            label={o.status === "COMPLETED" ? `${Number(o.outputQty)} booked into stock` : `${Number(o.outputQty)} planned`}
            tone={o.status === "COMPLETED" ? "green" : "gray"}
          />
        </div>
        {(o.status === "DRAFT" || o.status === "IN_PROGRESS") && canManage && (
          <Button variant="outline" size="sm" onClick={() => setCancelOpen(true)} className="mt-4 w-full gap-1.5 border-red-300 text-red-600 hover:bg-red-50">
            <Ban className="h-3.5 w-3.5" /> Cancel Run
          </Button>
        )}
      </div>

      {/* Cancel dialog */}
      <Dialog open={cancelOpen} onOpenChange={(v) => !v && setCancelOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-red-700">Cancel Run {o.refNo}</DialogTitle>
            <DialogDescription>
              {o.status === "IN_PROGRESS"
                ? "Materials were already deducted — they will be returned to stock automatically."
                : "The run is still a draft, so no stock has moved."}
            </DialogDescription>
          </DialogHeader>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Reason *</p>
            <Textarea rows={2} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Why is this run being cancelled?" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={cancelMutation.isPending}>Keep Run</Button>
            <Button
              onClick={() => cancelMutation.mutate({ id: runId, reason: cancelReason.trim() })}
              disabled={cancelMutation.isPending || cancelReason.trim().length < 3}
              className="gap-2 bg-red-600 text-white hover:bg-red-700"
            >
              {cancelMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Cancel Run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print job sheet */}
      {printSheet && (
        <PrintPortal>
          <div className="p-6" style={{ maxWidth: 480 }}>
            <h1 style={{ fontSize: 16, fontWeight: 700, textAlign: "center" }}>{STORE.name}</h1>
            <p style={{ fontSize: 10, textAlign: "center" }}>{STORE.address}</p>
            <p style={{ fontSize: 13, fontWeight: 700, textAlign: "center", marginTop: 8 }}>PRODUCTION JOB SHEET — {o.refNo}</p>
            <p style={{ fontSize: 10, marginTop: 6 }}>
              Output: {o.outputProductName} × {Number(o.outputQty)}<br />
              Status: {PRODUCTION_STATUS_LABELS[o.status as ProductionStatus]}<br />
              Requested: {formatDateTime(o.createdAt)} by {o.requestedByName ?? "staff"}<br />
              {o.startedAt ? <>Started: {formatDateTime(o.startedAt)}<br /></> : null}
              {o.completedAt ? <>Completed: {formatDateTime(o.completedAt)}<br /></> : null}
            </p>
            <table style={{ width: "100%", marginTop: 8, borderCollapse: "collapse", fontSize: 10 }}>
              <thead>
                <tr>
                  {["Material", "Planned", "Used"].map((h) => (
                    <th key={h} style={{ border: "1px solid #999", padding: "3px 5px", textAlign: "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {materials.map((m) => (
                  <tr key={m.id}>
                    <td style={{ border: "1px solid #999", padding: "3px 5px" }}>{m.productName}</td>
                    <td style={{ border: "1px solid #999", padding: "3px 5px" }}>{Number(m.quantityPlanned)} {m.unit}</td>
                    <td style={{ border: "1px solid #999", padding: "3px 5px" }}>{m.quantityUsed != null ? `${Number(m.quantityUsed)} ${m.unit}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {o.notes ? <p style={{ fontSize: 10, marginTop: 6, whiteSpace: "pre-line" }}>Notes: {o.notes}</p> : null}
          </div>
        </PrintPortal>
      )}
    </div>
  );
}

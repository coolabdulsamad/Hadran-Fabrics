import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import {
  ArrowLeft,
  Printer,
  Loader2,
  Ban,
  ArrowRightCircle,
  CheckCircle2,
  Circle,
  PlusCircle,
  Ruler,
  Scissors,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { LoadingScreen } from "@/components/common/LoadingScreen";
import { PrintPortal } from "@/components/common/PrintPortal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { useAuth } from "@/hooks/use-auth";
import { FABRIC_SOURCE_LABELS, ORDER_PAYMENT_STATUS_LABELS, TAILORING_STATUS_LABELS } from "@contracts/labels";
import {
  MEASUREMENT_FIELDS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  STORE,
  type PaymentMethod,
  type TailoringOrderStatus,
} from "@contracts/constants";
import { TAILORING_WORKFLOW_ORDER, tailoringStatusTone, paymentStatusTone } from "@/lib/tailoring";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * HADRAN FABRICS MALL — tailoring order detail
 * The working screen for one job: style & measurements, tailor assignment,
 * workflow stepper with guarded moves (delivery needs full payment),
 * payments with the money ledger behind them, cancellation with automatic
 * refund, status history and a printable job ticket.
 */

export default function TailoringOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const orderId = Number(id);
  const [searchParams, setSearchParams] = useSearchParams();
  const { hasPermission } = useAuth();

  const order = trpc.tailoring.getById.useQuery({ id: orderId }, { retry: 1 });
  const tailors = trpc.users.list.useQuery({ role: "TAILORING", page: 1, pageSize: 50 }, { retry: 1 });

  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<TailoringOrderStatus | "">("");
  const [moveNote, setMoveNote] = useState("");

  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("CASH");
  const [payNote, setPayNote] = useState("");

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTailorId, setAssignTailorId] = useState("");

  const [measureOpen, setMeasureOpen] = useState(false);
  const [measureValues, setMeasureValues] = useState<Record<string, string>>({});

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const [printTicket, setPrintTicket] = useState(false);

  const refresh = () => order.refetch();

  const moveMutation = trpc.tailoring.advanceStatus.useMutation({
    onSuccess: (r) => {
      toast.success(`Moved to ${TAILORING_STATUS_LABELS[r.toStatus]}.`);
      setMoveOpen(false);
      setMoveTarget("");
      setMoveNote("");
      refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const payMutation = trpc.tailoring.addPayment.useMutation({
    onSuccess: (r) => {
      toast.success(r.balance > 0 ? `Payment recorded — balance ${formatCurrency(r.balance)}.` : "Fully paid. Thank you!");
      setPayOpen(false);
      setPayAmount("");
      setPayNote("");
      refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const assignMutation = trpc.tailoring.assignTailor.useMutation({
    onSuccess: () => {
      toast.success("Tailor assignment updated.");
      setAssignOpen(false);
      refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const measureMutation = trpc.tailoring.saveMeasurements.useMutation({
    onSuccess: () => {
      toast.success("Measurements saved.");
      setMeasureOpen(false);
      refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const cancelMutation = trpc.tailoring.cancel.useMutation({
    onSuccess: (r) => {
      toast.success(r.refunded > 0 ? `Cancelled — refunded ${formatCurrency(r.refunded)}.` : "Order cancelled.");
      setCancelOpen(false);
      setCancelReason("");
      refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  // Auto-open the print ticket right after intake (?print=ticket).
  useEffect(() => {
    if (searchParams.get("print") === "ticket" && order.data) {
      setPrintTicket(true);
      setTimeout(() => window.print(), 400);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.data, searchParams]);

  const balance = useMemo(
    () => (order.data ? Number((Number(order.data.price) - Number(order.data.amountPaid)).toFixed(2)) : 0),
    [order.data],
  );

  if (order.isLoading) return <LoadingScreen label="Loading order…" />;
  if (!order.data) {
    return (
      <div className="mx-auto max-w-3xl py-20 text-center">
        <p className="text-sm text-muted-foreground">Order not found.</p>
        <Link to="/tailoring/orders" className="mt-2 inline-block text-sm font-semibold text-gold-700 hover:underline">Back to orders</Link>
      </div>
    );
  }

  const o = order.data;
  const terminal = o.status === "DELIVERED" || o.status === "CANCELLED";
  const currentIdx = TAILORING_WORKFLOW_ORDER.indexOf(o.status);
  const nextStatus = currentIdx >= 0 && currentIdx < TAILORING_WORKFLOW_ORDER.length - 1 ? TAILORING_WORKFLOW_ORDER[currentIdx + 1] : null;
  const canManage = hasPermission("tailoring.manage");
  const canAdvance = hasPermission("tailoring.advance_status");
  const canCancel = hasPermission("tailoring.cancel");

  const measurementSet = o.measurements[0] ?? null;
  const measurementEntries = measurementSet
    ? Object.entries(measurementSet.measurements as Record<string, number | string>).filter(([, v]) => v !== "" && v != null)
    : [];
  const measurementLabel = (key: string) => MEASUREMENT_FIELDS.find((f) => f.key === key)?.label ?? key;

  const openMeasurementEditor = () => {
    const vals: Record<string, string> = {};
    if (measurementSet) {
      for (const [k, v] of Object.entries(measurementSet.measurements as Record<string, number | string>)) {
        vals[k] = String(v);
      }
    }
    setMeasureValues(vals);
    setMeasureOpen(true);
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={o.orderNo}
        description={`${o.customerName}${o.customerPhone ? ` · ${o.customerPhone}` : ""} — received ${formatDateTime(o.createdAt)} by ${o.receivedByName ?? "staff"}.`}
        actions={
          <>
            <Link to="/tailoring/orders">
              <Button variant="outline" className="gap-2 border-gold-500/40 text-navy-800 hover:bg-gold-50">
                <ArrowLeft className="h-4 w-4 text-gold-600" />
                Orders
              </Button>
            </Link>
            <Button
              variant="outline"
              onClick={() => { setPrintTicket(true); setTimeout(() => window.print(), 250); }}
              className="gap-2 border-gold-500/40 text-navy-800 hover:bg-gold-50"
            >
              <Printer className="h-4 w-4 text-gold-600" />
              Print Ticket
            </Button>
            {!terminal && canAdvance && nextStatus && (
              <Button
                onClick={() => { setMoveTarget(nextStatus); setMoveOpen(true); }}
                className="gap-2 bg-navy-800 text-cream-100 hover:bg-navy-700"
              >
                <ArrowRightCircle className="h-4 w-4 text-gold-400" />
                Move to {TAILORING_STATUS_LABELS[nextStatus]}
              </Button>
            )}
          </>
        }
      />

      {/* Status strip */}
      <div className="card-lux flex flex-wrap items-center gap-2 p-4">
        <StatusBadge label={TAILORING_STATUS_LABELS[o.status]} tone={tailoringStatusTone(o.status)} />
        <StatusBadge label={ORDER_PAYMENT_STATUS_LABELS[o.paymentStatus]} tone={paymentStatusTone(o.paymentStatus)} />
        <StatusBadge label={FABRIC_SOURCE_LABELS[o.fabricSource]} tone={o.fabricSource === "SHOP_STOCK" ? "gold" : "gray"} />
        {o.tailorName && <StatusBadge label={`Tailor: ${o.tailorName}`} tone="navy" />}
        <span className="ml-auto text-xs text-muted-foreground">
          {o.dueDate ? `Due ${formatDate(o.dueDate)}` : "No due date"}
          {o.deliveredAt && ` · Delivered ${formatDateTime(o.deliveredAt)}`}
        </span>
      </div>

      {/* Workflow stepper */}
      <div className="card-lux mt-4 p-5">
        <div className="flex flex-wrap items-center gap-y-3">
          {TAILORING_WORKFLOW_ORDER.map((status, idx) => {
            const reached = currentIdx >= idx;
            const isCurrent = o.status === status;
            return (
              <div key={status} className="flex items-center">
                <button
                  type="button"
                  disabled={terminal || !canAdvance || isCurrent}
                  onClick={() => { setMoveTarget(status); setMoveOpen(true); }}
                  title={isCurrent ? "Current stage" : terminal ? "Order closed" : `Move to ${TAILORING_STATUS_LABELS[status]}`}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                    isCurrent
                      ? "border-gold-500 bg-gold-100 text-gold-800"
                      : reached
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                        : "border-border bg-cream-50 text-muted-foreground",
                    !terminal && canAdvance && !isCurrent && "hover:border-gold-400 hover:shadow-sm",
                    (terminal || !canAdvance) && "cursor-default",
                  )}
                >
                  {reached ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                  {TAILORING_STATUS_LABELS[status]}
                </button>
                {idx < TAILORING_WORKFLOW_ORDER.length - 1 && <div className={cn("h-px w-3 sm:w-5", reached && currentIdx > idx ? "bg-emerald-300" : "bg-border")} />}
              </div>
            );
          })}
        </div>
        {o.status === "CANCELLED" && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            Cancelled{o.cancelledReason ? ` — ${o.cancelledReason}` : ""}.
          </p>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* Job details */}
        <div className="space-y-4">
          <div className="card-lux min-w-0 p-5">
            <h2 className="font-display text-base font-bold text-navy-900">Job</h2>
            <p className="mt-2 text-sm font-medium text-navy-900">{o.styleDescription}</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Fabric source</dt>
                <dd className="mt-0.5 font-semibold text-navy-900">{FABRIC_SOURCE_LABELS[o.fabricSource]}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Tailor</dt>
                <dd className="mt-0.5 flex items-center gap-2 font-semibold text-navy-900">
                  {o.tailorName ?? "Unassigned"}
                  {!terminal && canManage && (
                    <button
                      type="button"
                      onClick={() => { setAssignTailorId(o.tailorId != null ? String(o.tailorId) : ""); setAssignOpen(true); }}
                      className="text-[11px] font-semibold text-gold-700 hover:underline"
                    >
                      {o.tailorName ? "Reassign" : "Assign"}
                    </button>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Due date</dt>
                <dd className="mt-0.5 font-semibold text-navy-900">{o.dueDate ? formatDate(o.dueDate) : "—"}</dd>
              </div>
            </dl>
            <div className="mt-3 border-t border-border pt-3">
              <div className="flex justify-between text-base font-display font-bold text-navy-900">
                <span>Price</span><span>{formatCurrency(o.price)}</span>
              </div>
            </div>
            {o.notes && (
              <p className="mt-3 rounded-lg bg-cream-50 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-semibold text-navy-800">Notes:</span> {o.notes}
              </p>
            )}
          </div>

          {/* Measurements */}
          <div className="card-lux min-w-0 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-navy-900">
                Measurements {measurementSet && <span className="text-xs font-normal text-muted-foreground">({measurementSet.label})</span>}
              </h2>
              {!terminal && canManage && (
                <Button size="sm" variant="outline" onClick={openMeasurementEditor} className="gap-1.5 border-gold-500/40 text-navy-800 hover:bg-gold-50">
                  <Ruler className="h-3.5 w-3.5 text-gold-600" />
                  {measurementEntries.length ? "Edit" : "Add"}
                </Button>
              )}
            </div>
            {measurementEntries.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">No measurements recorded yet.</p>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {measurementEntries.map(([key, value]) => (
                  <div key={key} className="rounded-lg border border-border bg-cream-50 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{measurementLabel(key)}</p>
                    <p className="mt-0.5 text-sm font-bold text-navy-900">{value}&Prime;</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Payments */}
        <div className="card-lux min-w-0 self-start p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-navy-900">Payments</h2>
            {!terminal && canManage && balance > 0 && (
              <Button size="sm" onClick={() => { setPayAmount(String(balance)); setPayOpen(true); }} className="gap-1.5 bg-navy-800 text-cream-100 hover:bg-navy-700">
                <PlusCircle className="h-3.5 w-3.5 text-gold-400" /> Take Payment
              </Button>
            )}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-cream-50 p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Price</p>
              <p className="mt-0.5 text-sm font-bold text-navy-900">{formatCurrency(o.price)}</p>
            </div>
            <div className="rounded-lg bg-emerald-50 p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Paid</p>
              <p className="mt-0.5 text-sm font-bold text-emerald-800">{formatCurrency(o.amountPaid)}</p>
            </div>
            <div className={cn("rounded-lg p-2.5", balance > 0 ? "bg-red-50" : "bg-emerald-50")}>
              <p className={cn("text-[10px] font-semibold uppercase tracking-wider", balance > 0 ? "text-red-600" : "text-emerald-700")}>Balance</p>
              <p className={cn("mt-0.5 text-sm font-bold", balance > 0 ? "text-red-700" : "text-emerald-800")}>{formatCurrency(balance)}</p>
            </div>
          </div>

          <ul className="mt-3 space-y-2">
            {o.payments.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">No payments yet.</p>}
            {o.payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-cream-50 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-navy-900">{PAYMENT_METHOD_LABELS[p.method]}</p>
                  <p className="text-[11px] text-muted-foreground">{formatDateTime(p.createdAt)} · {p.receivedByName ?? "staff"}</p>
                  {p.note && <p className="truncate text-[11px] italic text-muted-foreground">{p.note}</p>}
                </div>
                <span className={cn("shrink-0 text-sm font-bold", Number(p.amount) < 0 ? "text-red-600" : "text-emerald-700")}>
                  {Number(p.amount) < 0 ? "−" : "+"}{formatCurrency(Math.abs(Number(p.amount)))}
                </span>
              </li>
            ))}
          </ul>

          {!terminal && canCancel && (
            <Button variant="outline" size="sm" onClick={() => setCancelOpen(true)} className="mt-4 w-full gap-1.5 border-red-300 text-red-600 hover:bg-red-50">
              <Ban className="h-3.5 w-3.5" /> Cancel Order
            </Button>
          )}
        </div>
      </div>

      {/* History */}
      <div className="card-lux mt-4 p-5">
        <h2 className="font-display text-base font-bold text-navy-900">History</h2>
        <ol className="mt-3 space-y-0">
          {o.history.map((h, i) => (
            <li key={h.id} className="relative flex gap-3 pb-4 last:pb-0">
              {i < o.history.length - 1 && <div className="absolute left-[7px] top-5 h-full w-px bg-border" />}
              <div className={cn("mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2", i === o.history.length - 1 ? "border-gold-500 bg-gold-200" : "border-border bg-cream-100")} />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-navy-900">
                  {h.fromStatus && h.fromStatus !== h.toStatus ? `${TAILORING_STATUS_LABELS[h.fromStatus]} → ` : ""}{TAILORING_STATUS_LABELS[h.toStatus]}
                </p>
                <p className="text-[11px] text-muted-foreground">{formatDateTime(h.createdAt)} · {h.changedByName ?? "staff"}</p>
                {h.note && <p className="mt-0.5 text-[11px] italic text-muted-foreground">{h.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* Move dialog */}
      <Dialog open={moveOpen} onOpenChange={(v) => !v && setMoveOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-navy-900">Move Order</DialogTitle>
            <DialogDescription>
              {o.orderNo} is currently <strong>{TAILORING_STATUS_LABELS[o.status]}</strong>. Pick the next stage.
            </DialogDescription>
          </DialogHeader>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Move to</p>
            <Select value={moveTarget} onValueChange={(v) => setMoveTarget(v as TailoringOrderStatus)}>
              <SelectTrigger><SelectValue placeholder="Pick a stage…" /></SelectTrigger>
              <SelectContent>
                {TAILORING_WORKFLOW_ORDER.filter((s) => s !== o.status).map((s) => (
                  <SelectItem key={s} value={s}>
                    {TAILORING_STATUS_LABELS[s]}
                    {s === "DELIVERED" && balance > 0 ? " — balance outstanding!" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Note (optional)</p>
            <Input value={moveNote} onChange={(e) => setMoveNote(e.target.value)} placeholder="e.g. first fitting done, sleeve adjusted" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveOpen(false)} disabled={moveMutation.isPending}>Cancel</Button>
            <Button
              onClick={() => moveTarget && moveMutation.mutate({ orderId, toStatus: moveTarget, note: moveNote.trim() || undefined })}
              disabled={!moveTarget || moveMutation.isPending}
              className="gap-2 bg-navy-800 text-cream-100 hover:bg-navy-700"
            >
              {moveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Move Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment dialog */}
      <Dialog open={payOpen} onOpenChange={(v) => !v && setPayOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-navy-900">Take Payment</DialogTitle>
            <DialogDescription>Outstanding balance: <strong>{formatCurrency(balance)}</strong> on {o.orderNo}.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Amount (₦) *</p>
              <Input type="number" min={0} max={balance} step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Method</p>
              <Select value={payMethod} onValueChange={(v) => setPayMethod(v as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Note (optional)</p>
              <Input value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="e.g. balance on delivery" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)} disabled={payMutation.isPending}>Cancel</Button>
            <Button
              onClick={() => payMutation.mutate({ orderId, amount: Number(payAmount), method: payMethod, note: payNote.trim() || undefined })}
              disabled={payMutation.isPending || !(Number(payAmount) > 0) || Number(payAmount) > balance + 0.0001}
              className="gap-2 bg-navy-800 text-cream-100 hover:bg-navy-700"
            >
              {payMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign tailor dialog */}
      <Dialog open={assignOpen} onOpenChange={(v) => !v && setAssignOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-navy-900">Assign Tailor</DialogTitle>
            <DialogDescription>Pick the tailor responsible for {o.orderNo}.</DialogDescription>
          </DialogHeader>
          <Select value={assignTailorId || "NONE"} onValueChange={(v) => setAssignTailorId(v === "NONE" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">Unassigned</SelectItem>
              {(tailors.data?.items ?? []).map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>{t.fullName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)} disabled={assignMutation.isPending}>Cancel</Button>
            <Button
              onClick={() => assignMutation.mutate({ orderId, tailorId: assignTailorId ? Number(assignTailorId) : null })}
              disabled={assignMutation.isPending}
              className="gap-2 bg-navy-800 text-cream-100 hover:bg-navy-700"
            >
              {assignMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4 text-gold-400" />}
              Save Assignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Measurements dialog */}
      <Dialog open={measureOpen} onOpenChange={(v) => !v && setMeasureOpen(false)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-navy-900">Measurements — {o.orderNo}</DialogTitle>
            <DialogDescription>All values in inches. Blank fields are left out.</DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[55vh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3">
            {MEASUREMENT_FIELDS.map((f) => (
              <div key={f.key}>
                <p className="mb-1 text-[11px] font-semibold text-muted-foreground">{f.label}</p>
                <Input
                  value={measureValues[f.key] ?? ""}
                  onChange={(e) => setMeasureValues((m) => ({ ...m, [f.key]: e.target.value }))}
                  placeholder="—"
                  className="h-9"
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMeasureOpen(false)} disabled={measureMutation.isPending}>Cancel</Button>
            <Button
              onClick={() => {
                const values: Record<string, number | string> = {};
                for (const [k, v] of Object.entries(measureValues)) {
                  const t = v.trim();
                  if (!t) continue;
                  const n = Number(t);
                  values[k] = Number.isFinite(n) ? n : t;
                }
                measureMutation.mutate({ orderId, label: measurementSet?.label ?? "Standard", values });
              }}
              disabled={measureMutation.isPending}
              className="gap-2 bg-navy-800 text-cream-100 hover:bg-navy-700"
            >
              {measureMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 text-gold-400" />}
              Save Measurements
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel dialog */}
      <Dialog open={cancelOpen} onOpenChange={(v) => !v && setCancelOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-red-700">Cancel Order {o.orderNo}</DialogTitle>
            <DialogDescription>
              {Number(o.amountPaid) > 0
                ? `The customer has paid ${formatCurrency(o.amountPaid)} — it will be refunded automatically and logged in the money ledger.`
                : "No payments on this order, so nothing to refund."}
            </DialogDescription>
          </DialogHeader>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Reason *</p>
            <Textarea rows={2} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Why is this order being cancelled?" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={cancelMutation.isPending}>Keep Order</Button>
            <Button
              onClick={() => cancelMutation.mutate({ orderId, reason: cancelReason.trim() })}
              disabled={cancelMutation.isPending || cancelReason.trim().length < 3}
              className="gap-2 bg-red-600 text-white hover:bg-red-700"
            >
              {cancelMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Cancel Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print job ticket */}
      {printTicket && (
        <PrintPortal>
          <div className="p-6" style={{ maxWidth: 420 }}>
            <h1 style={{ fontSize: 16, fontWeight: 700, textAlign: "center" }}>{STORE.name}</h1>
            <p style={{ fontSize: 10, textAlign: "center" }}>{STORE.address}</p>
            <p style={{ fontSize: 13, fontWeight: 700, textAlign: "center", marginTop: 8 }}>TAILORING JOB TICKET — {o.orderNo}</p>
            <p style={{ fontSize: 10, marginTop: 6 }}>
              Customer: {o.customerName}{o.customerPhone ? ` (${o.customerPhone})` : ""}<br />
              Received: {formatDateTime(o.createdAt)} by {o.receivedByName ?? "staff"}<br />
              {o.dueDate ? <>Due: {formatDate(o.dueDate)}<br /></> : null}
              Style: {o.styleDescription}<br />
              Fabric: {FABRIC_SOURCE_LABELS[o.fabricSource]}<br />
              Tailor: {o.tailorName ?? "Unassigned"}<br />
              Status: {TAILORING_STATUS_LABELS[o.status]}
            </p>
            {measurementEntries.length > 0 && (
              <table style={{ width: "100%", marginTop: 8, borderCollapse: "collapse", fontSize: 10 }}>
                <tbody>
                  {Array.from({ length: Math.ceil(measurementEntries.length / 2) }, (_, rowIdx) => (
                    <tr key={rowIdx}>
                      {[0, 1].map((colIdx) => {
                        const entry = measurementEntries[rowIdx * 2 + colIdx];
                        return (
                          <td key={colIdx} style={{ border: "1px solid #999", padding: "3px 5px", width: "50%" }}>
                            {entry ? `${measurementLabel(entry[0])}: ${entry[1]}"` : ""}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p style={{ fontSize: 11, marginTop: 8 }}>
              <strong>Price: {formatCurrency(o.price)}</strong><br />
              Paid: {formatCurrency(o.amountPaid)} · Balance: {formatCurrency(balance)}
            </p>
            {o.notes ? <p style={{ fontSize: 10, marginTop: 6 }}>Notes: {o.notes}</p> : null}
            <p style={{ fontSize: 9, marginTop: 10, textAlign: "center" }}>
              Please present this ticket (or the order number) at pickup. Thank you for choosing {STORE.name}.
            </p>
          </div>
        </PrintPortal>
      )}
    </div>
  );
}

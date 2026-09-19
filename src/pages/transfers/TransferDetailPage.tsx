import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  CheckCheck,
  Clock3,
  Loader2,
  PackageCheck,
  Printer,
  Send,
  Truck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { LoadingScreen } from "@/components/common/LoadingScreen";
import { PrintPortal } from "@/components/common/PrintPortal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { TRANSFER_STATUS_LABELS } from "@contracts/labels";
import { STORE, type TransferStatus } from "@contracts/constants";
import { TRANSFER_FLOW, transferStatusTone } from "@/lib/branches";
import { formatDateTime, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * HADRAN FABRICS MALL — transfer detail page
 * The working screen for one inter-branch transfer: lifecycle stepper,
 * item lines with received quantities, guarded actions (approver ≠
 * requester; stock only moves on dispatch/receipt) and a printable
 * transfer note for the driver.
 */

interface TransferItem {
  id: number;
  productId: number;
  productName: string;
  unit: string;
  quantity: string;
  receivedQty: string | null;
}

interface TransferDetail {
  id: number;
  refNo: string;
  fromBranchName: string;
  toBranchName: string;
  status: TransferStatus;
  note: string | null;
  requestedBy: number;
  requestedByName: string | null;
  approvedByName: string | null;
  receivedByName: string | null;
  sentAt: string | Date | null;
  receivedAt: string | Date | null;
  createdAt: string | Date;
  items: TransferItem[];
}

const FLOW_META: { status: (typeof TRANSFER_FLOW)[number]; label: string; icon: typeof Clock3 }[] = [
  { status: "PENDING_APPROVAL", label: "Requested", icon: Clock3 },
  { status: "APPROVED", label: "Approved", icon: CheckCheck },
  { status: "IN_TRANSIT", label: "In Transit", icon: Truck },
  { status: "RECEIVED", label: "Received", icon: PackageCheck },
];

export default function TransferDetailPage() {
  const { id } = useParams<{ id: string }>();
  const transferId = Number(id);
  const { user, hasPermission } = useAuth();
  const canManage = hasPermission("transfers.manage");

  const detail = trpc.transfers.getById.useQuery({ id: transferId }, { enabled: Number.isFinite(transferId), retry: 1 });
  const t = detail.data as TransferDetail | undefined;

  const [rejectOpen, setRejectOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [receivedQtys, setReceivedQtys] = useState<Record<number, string>>({});
  const [printNote, setPrintNote] = useState(false);

  const refresh = () => detail.refetch();
  const onErr = (err: { message: string }) => toast.error(err.message);

  const approveMutation = trpc.transfers.approve.useMutation({
    onSuccess: () => { toast.success("Transfer approved — ready to dispatch."); refresh(); },
    onError: onErr,
  });
  const rejectMutation = trpc.transfers.reject.useMutation({
    onSuccess: () => { toast.success("Transfer rejected."); setRejectOpen(false); setReason(""); refresh(); },
    onError: onErr,
  });
  const sendMutation = trpc.transfers.send.useMutation({
    onSuccess: () => { toast.success("Transfer dispatched — stock deducted at source branch."); refresh(); },
    onError: onErr,
  });
  const receiveMutation = trpc.transfers.receive.useMutation({
    onSuccess: () => { toast.success("Transfer received — stock credited at destination."); setReceiveOpen(false); refresh(); },
    onError: onErr,
  });
  const cancelMutation = trpc.transfers.cancel.useMutation({
    onSuccess: () => { toast.success("Transfer cancelled."); setCancelOpen(false); setReason(""); refresh(); },
    onError: onErr,
  });

  useEffect(() => {
    if (receiveOpen && t) {
      setReceivedQtys(Object.fromEntries(t.items.map((i) => [i.id, String(Number(i.quantity))])));
    }
  }, [receiveOpen, t]);

  if (detail.isLoading) return <LoadingScreen label="Loading transfer…" />;
  if (!t) {
    return (
      <div className="mx-auto max-w-3xl py-20 text-center">
        <p className="text-lg font-semibold text-navy-900">Transfer not found.</p>
        <Link to="/transfers" className="mt-2 inline-block text-sm text-gold-700 underline-offset-2 hover:underline">
          Back to transfers
        </Link>
      </div>
    );
  }

  const terminal = t.status === "REJECTED" || t.status === "CANCELLED";
  const flowIndex = TRANSFER_FLOW.indexOf(t.status as (typeof TRANSFER_FLOW)[number]);
  const ownRequest = user?.id === t.requestedBy;
  const busy =
    approveMutation.isPending || rejectMutation.isPending || sendMutation.isPending ||
    receiveMutation.isPending || cancelMutation.isPending;

  const submitReceive = () => {
    const received = t.items.map((i) => ({ itemId: i.id, quantity: Number(receivedQtys[i.id] ?? 0) }));
    if (received.some((r) => !Number.isFinite(r.quantity) || r.quantity < 0)) {
      toast.error("Received quantities must be zero or more.");
      return;
    }
    const over = received.filter((r) => {
      const planned = Number(t.items.find((i) => i.id === r.itemId)?.quantity ?? 0);
      return r.quantity > planned;
    });
    if (over.length > 0) {
      toast.error("Received quantity cannot exceed the planned quantity.");
      return;
    }
    receiveMutation.mutate({ id: t.id, received });
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono">{t.refNo}</span>
            <StatusBadge label={TRANSFER_STATUS_LABELS[t.status]} tone={transferStatusTone(t.status)} />
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-navy-800">{t.fromBranchName}</span>
            <ArrowRight className="h-3.5 w-3.5 text-gold-600" />
            <span className="font-semibold text-navy-800">{t.toBranchName}</span>
            <span className="text-muted-foreground">· requested {formatDateTime(t.createdAt)} by {t.requestedByName ?? "staff"}</span>
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="gap-2">
              <Link to="/transfers"><ArrowLeft className="h-4 w-4" />All Transfers</Link>
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => { setPrintNote(true); setTimeout(() => window.print(), 60); }}>
              <Printer className="h-4 w-4" />Print Note
            </Button>
          </div>
        }
      />

      {/* Lifecycle stepper */}
      {!terminal ? (
        <ol className="mb-6 flex flex-wrap items-center gap-y-3">
          {FLOW_META.map((step, idx) => {
            const done = flowIndex > idx || t.status === "RECEIVED";
            const current = flowIndex === idx && t.status !== "RECEIVED";
            const Icon = step.icon;
            return (
              <li key={step.status} className="flex items-center">
                <span
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold",
                    done && "border-emerald-300 bg-emerald-50 text-emerald-800",
                    current && "border-gold-400 bg-gold-50 text-navy-900 shadow-sm",
                    !done && !current && "border-border bg-muted/40 text-muted-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {step.label}
                </span>
                {idx < FLOW_META.length - 1 && (
                  <span className={cn("mx-2 h-px w-6 sm:w-10", flowIndex > idx || t.status === "RECEIVED" ? "bg-emerald-400" : "bg-border")} />
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <div className={cn(
          "mb-6 rounded-xl border px-5 py-4 text-sm font-medium",
          t.status === "REJECTED" ? "border-red-200 bg-red-50 text-red-800" : "border-border bg-muted/50 text-muted-foreground",
        )}>
          This transfer was {TRANSFER_STATUS_LABELS[t.status].toLowerCase()}.
          {t.approvedByName && t.status === "REJECTED" ? ` Handled by ${t.approvedByName}.` : ""}
        </div>
      )}

      {/* Meta cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: "Requested By", value: t.requestedByName ?? "—", sub: formatDateTime(t.createdAt) },
          { label: "Approved By", value: t.approvedByName ?? "—", sub: t.sentAt ? `sent ${formatDateTime(t.sentAt)}` : "awaiting dispatch" },
          { label: "Received By", value: t.receivedByName ?? "—", sub: t.receivedAt ? formatDateTime(t.receivedAt) : "not yet received" },
          { label: "Items", value: `${t.items.length} line(s)`, sub: `${formatQty(t.items.reduce((s, i) => s + Number(i.quantity), 0))} unit(s) planned` },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{m.label}</p>
            <p className="mt-1 truncate text-sm font-semibold text-navy-900">{m.value}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{m.sub}</p>
          </div>
        ))}
      </div>

      {t.note && (
        <div className="mb-6 rounded-xl border border-border bg-card px-5 py-4 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Note</p>
          <p className="mt-1 text-sm text-navy-900">{t.note}</p>
        </div>
      )}

      {/* Items */}
      <section className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-navy-900">Transfer Items</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 font-semibold">Product</th>
                <th className="px-5 py-3 text-right font-semibold">Planned</th>
                <th className="px-5 py-3 text-right font-semibold">Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {t.items.map((i) => (
                <tr key={i.id}>
                  <td className="px-5 py-3 font-medium text-navy-900">{i.productName}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{formatQty(i.quantity)} {i.unit.toLowerCase()}</td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {i.receivedQty != null ? (
                      <span className={cn(Number(i.receivedQty) < Number(i.quantity) && "font-semibold text-amber-700")}>
                        {formatQty(i.receivedQty)} {i.unit.toLowerCase()}
                      </span>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Actions */}
      {canManage && !terminal && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {t.status === "PENDING_APPROVAL" && (
            <>
              <Button
                onClick={() => approveMutation.mutate({ id: t.id })}
                disabled={busy || ownRequest}
                className="gap-2 bg-emerald-700 text-white hover:bg-emerald-600"
              >
                {approveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
                Approve
              </Button>
              <Button variant="outline" className="gap-2 text-red-700 hover:text-red-800" disabled={busy || ownRequest} onClick={() => setRejectOpen(true)}>
                <XCircle className="h-4 w-4" />Reject
              </Button>
              {ownRequest && (
                <span className="text-xs text-muted-foreground">You requested this transfer — another manager must approve it.</span>
              )}
            </>
          )}
          {t.status === "APPROVED" && (
            <Button onClick={() => sendMutation.mutate({ id: t.id })} disabled={busy} className="gap-2 bg-navy-800 text-cream-100 hover:bg-navy-700">
              {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 text-gold-400" />}
              Dispatch (deduct stock)
            </Button>
          )}
          {t.status === "IN_TRANSIT" && (
            <Button onClick={() => setReceiveOpen(true)} disabled={busy} className="gap-2 bg-emerald-700 text-white hover:bg-emerald-600">
              <PackageCheck className="h-4 w-4" />Receive at Destination
            </Button>
          )}
          {(t.status === "PENDING_APPROVAL" || t.status === "APPROVED") && (
            <Button variant="ghost" className="gap-2 text-muted-foreground hover:text-red-700" disabled={busy} onClick={() => setCancelOpen(true)}>
              <Ban className="h-4 w-4" />Cancel Transfer
            </Button>
          )}
        </div>
      )}

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={(v) => !v && setRejectOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-navy-900">Reject {t.refNo}</DialogTitle>
            <DialogDescription>The requester can create a corrected transfer afterwards.</DialogDescription>
          </DialogHeader>
          <Label htmlFor="rejreason">Reason</Label>
          <Textarea id="rejreason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this transfer rejected?" className="mt-1.5" maxLength={300} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={rejectMutation.isPending}>Back</Button>
            <Button onClick={() => rejectMutation.mutate({ id: t.id, reason: reason || undefined })} disabled={rejectMutation.isPending} className="gap-2 bg-red-700 text-white hover:bg-red-600">
              {rejectMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel dialog */}
      <Dialog open={cancelOpen} onOpenChange={(v) => !v && setCancelOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-navy-900">Cancel {t.refNo}</DialogTitle>
            <DialogDescription>No stock has moved yet — this simply closes the request.</DialogDescription>
          </DialogHeader>
          <Label htmlFor="canreason">Reason</Label>
          <Textarea id="canreason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional note…" className="mt-1.5" maxLength={300} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={cancelMutation.isPending}>Back</Button>
            <Button onClick={() => cancelMutation.mutate({ id: t.id, reason: reason || undefined })} disabled={cancelMutation.isPending} className="gap-2 bg-red-700 text-white hover:bg-red-600">
              {cancelMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Cancel Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receive dialog */}
      <Dialog open={receiveOpen} onOpenChange={(v) => !v && setReceiveOpen(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-navy-900">Receive {t.refNo}</DialogTitle>
            <DialogDescription>Confirm what actually arrived — lower quantities flag shortages on the record.</DialogDescription>
          </DialogHeader>
          <ul className="max-h-72 space-y-3 overflow-y-auto">
            {t.items.map((i) => (
              <li key={i.id} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-navy-900">{i.productName}</p>
                  <p className="text-xs text-muted-foreground">planned {formatQty(i.quantity)} {i.unit.toLowerCase()}</p>
                </div>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={receivedQtys[i.id] ?? ""}
                  onChange={(e) => setReceivedQtys((m) => ({ ...m, [i.id]: e.target.value }))}
                  className={cn(
                    "h-9 w-28 text-right",
                    Number(receivedQtys[i.id]) < Number(i.quantity) && "border-amber-500 text-amber-700",
                  )}
                />
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveOpen(false)} disabled={receiveMutation.isPending}>Back</Button>
            <Button onClick={submitReceive} disabled={receiveMutation.isPending} className="gap-2 bg-emerald-700 text-white hover:bg-emerald-600">
              {receiveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Confirm Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Printable transfer note */}
      {printNote && (
        <PrintPortal>
          <div className="p-6" style={{ maxWidth: 640 }}>
            <h1 style={{ fontSize: 16, fontWeight: 700, textAlign: "center" }}>{STORE.name}</h1>
            <p style={{ fontSize: 10, textAlign: "center" }}>{STORE.address}</p>
            <p style={{ fontSize: 13, fontWeight: 700, textAlign: "center", marginTop: 8 }}>STOCK TRANSFER NOTE — {t.refNo}</p>
            <p style={{ fontSize: 11, marginTop: 6 }}>
              From: <strong>{t.fromBranchName}</strong> → To: <strong>{t.toBranchName}</strong><br />
              Requested: {formatDateTime(t.createdAt)} by {t.requestedByName ?? "staff"}<br />
              {t.approvedByName ? <>Approved by: {t.approvedByName}<br /></> : null}
              Status: {TRANSFER_STATUS_LABELS[t.status]}
              {t.note ? <><br />Note: {t.note}</> : null}
            </p>
            <table style={{ width: "100%", marginTop: 8, borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  {["Product", "Planned", "Received"].map((h) => (
                    <th key={h} style={{ border: "1px solid #999", padding: "4px 6px", textAlign: "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.items.map((i) => (
                  <tr key={i.id}>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{i.productName}</td>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{formatQty(i.quantity)} {i.unit.toLowerCase()}</td>
                    <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{i.receivedQty != null ? `${formatQty(i.receivedQty)} ${i.unit.toLowerCase()}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 36, fontSize: 11 }}>
              <span>Dispatched by: ____________________</span>
              <span>Received by: ____________________</span>
            </div>
          </div>
        </PrintPortal>
      )}
    </div>
  );
}

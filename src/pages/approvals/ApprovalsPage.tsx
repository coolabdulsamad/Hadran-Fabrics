import { useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, Check, X, Clock, ChevronDown, ChevronUp, Loader2, Inbox } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { usePermissions } from "@/hooks/use-permissions";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge, toneForStatus } from "@/components/common/StatusBadge";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency, timeAgo } from "@/lib/format";
import { APPROVAL_TYPE_LABELS } from "@contracts/labels";
import type { ApprovalType } from "@contracts/constants";
import { cn } from "@/lib/utils";

/**
 * HADRAN FABRICS MALL — Approvals.
 * Review Queue: admins inspect each parked manager action (with full
 * payload detail), then approve (applied instantly) or reject with a
 * reason. History shows past decisions; My Requests lets managers
 * track their own submissions.
 */

interface RequestRow {
  request: {
    id: number;
    requestType: ApprovalType;
    status: "PENDING" | "APPROVED" | "REJECTED";
    entityType: string;
    entityId: number | null;
    payload: Record<string, unknown>;
    summary: string;
    reviewNote: string | null;
    reviewedAt: string | Date | null;
    createdAt: string | Date;
  };
  requesterName?: string | null;
  reviewerName?: string | null;
}

/* -------------------- payload detail rendering -------------------- */

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

function PayloadDetails({ type, payload }: { type: ApprovalType; payload: Record<string, unknown> }) {
  const money = (v: unknown) => formatCurrency(Number(v ?? 0));
  const s = (v: unknown) => String(v ?? "—");

  switch (type) {
    case "PRODUCT_CREATE":
      return (
        <div className="space-y-1.5">
          <DetailRow label="Product" value={`${s(payload.name)} (${s(payload.sku)})`} />
          <DetailRow label="Selling price" value={money(payload.sellingPrice)} />
          <DetailRow label="Cost price" value={money(payload.costPrice)} />
          <DetailRow label="Opening stock" value={s(payload.openingStock ?? 0)} />
          <DetailRow label="Barcode" value={s(payload.barcode || "—")} />
        </div>
      );
    case "PRODUCT_EDIT": {
      const before = (payload.before ?? {}) as Record<string, unknown>;
      const changes = (payload.changes ?? {}) as Record<string, unknown>;
      const EDIT_FIELDS: { key: string; label: string; money?: boolean }[] = [
        { key: "name", label: "Name" },
        { key: "description", label: "Description" },
        { key: "brand", label: "Brand" },
        { key: "color", label: "Colour" },
        { key: "material", label: "Material" },
        { key: "unit", label: "Unit" },
        { key: "barcode", label: "Barcode" },
        { key: "sellingPrice", label: "Selling price", money: true },
        { key: "costPrice", label: "Cost price", money: true },
        { key: "reorderLevel", label: "Reorder level" },
        { key: "status", label: "Status" },
      ];
      const rows = EDIT_FIELDS.filter((f) => changes[f.key] !== undefined && String(changes[f.key] ?? "") !== String(before[f.key] ?? ""));
      const imagesChanged = Array.isArray(changes.imageUrls);
      return (
        <div className="space-y-1.5">
          <DetailRow label="Product" value={`${s(before.name)} (${s(before.sku)})`} />
          {rows.length === 0 && !imagesChanged ? (
            <p className="text-sm text-muted-foreground">No field-level differences detected.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              {rows.map((f) => (
                <div key={f.key} className="grid grid-cols-[110px_1fr_1fr] gap-2 border-b border-border/60 px-3 py-1.5 text-xs last:border-0">
                  <span className="font-semibold text-muted-foreground">{f.label}</span>
                  <span className="break-all text-red-700 line-through decoration-red-400/60">
                    {f.money ? money(before[f.key]) : s(before[f.key])}
                  </span>
                  <span className="break-all font-medium text-emerald-700">
                    {f.money ? money(changes[f.key]) : s(changes[f.key])}
                  </span>
                </div>
              ))}
              {imagesChanged && (
                <div className="grid grid-cols-[110px_1fr_1fr] gap-2 px-3 py-1.5 text-xs">
                  <span className="font-semibold text-muted-foreground">Images</span>
                  <span className="text-muted-foreground">{Array.isArray(before.imageUrls) ? before.imageUrls.length : 0} image(s)</span>
                  <span className="font-medium text-emerald-700">{(changes.imageUrls as unknown[]).length} image(s)</span>
                </div>
              )}
            </div>
          )}
        </div>
      );
    }
    case "PRODUCT_DELETE": {
      const before = (payload.before ?? {}) as Record<string, unknown>;
      return (
        <div className="space-y-1.5">
          <DetailRow label="Archive product" value={`${s(before.name)} (${s(before.sku)})`} />
          <DetailRow label="Current stock" value={s(before.currentStock)} />
          <DetailRow label="Selling price" value={money(before.sellingPrice)} />
        </div>
      );
    }
    case "STOCK_ADJUSTMENT":
      return (
        <div className="space-y-1.5">
          <DetailRow label="Product" value={`${s(payload.productName)} (${s(payload.sku)})`} />
          <DetailRow label="Stock" value={`${s(payload.currentStock)} → ${s(payload.newBalance)}`} />
          <DetailRow label="Reason" value={s(payload.reason)} />
        </div>
      );
    case "VOID_SALE":
      return (
        <div className="space-y-1.5">
          <DetailRow label="Receipt" value={s(payload.receiptNo)} />
          <DetailRow label="Sale value" value={money(payload.grandTotal)} />
          <DetailRow label="Reason" value={s(payload.reason)} />
          <p className="pt-1 text-xs text-amber-700">Approving restores all stock from this sale.</p>
        </div>
      );
    case "RETURN_PROCESS": {
      const items = Array.isArray(payload.items) ? payload.items : [];
      const details = Array.isArray(payload.itemDetails) ? (payload.itemDetails as Record<string, unknown>[]) : null;
      return (
        <div className="space-y-1.5">
          <DetailRow label="Receipt" value={s(payload.receiptNo)} />
          <DetailRow label="Type" value={s(payload.type)} />
          <DetailRow label="Sale value" value={money(payload.grandTotal)} />
          <DetailRow label="Reason" value={s(payload.reason)} />
          {details ? (
            <div className="overflow-hidden rounded-lg border border-border">
              {details.map((d, i) => (
                <div key={i} className="border-b border-border/60 px-3 py-1.5 text-xs last:border-0">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{s(d.productName)}</span>
                    <span className="tabular-nums">{money(d.lineRefund)}</span>
                  </div>
                  <p className="text-muted-foreground">
                    {s(d.quantity)} {String(d.unit ?? "").toLowerCase()} • {s(d.condition)}
                    {d.condition === "GOOD" && d.restock ? " • restock" : ""}
                  </p>
                  {d.exchangeProductName != null && (
                    <div className="mt-1 flex justify-between gap-2 rounded bg-gold-500/10 px-2 py-1 text-gold-700">
                      <span>↔ {s(d.exchangeProductName)} — {s(d.exchangeQty)} × {money(d.exchangeUnitPrice)}</span>
                      <span className="tabular-nums">{money(d.exchangeLineTotal)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <DetailRow label="Lines" value={String(items.length)} />
          )}
          <p className="pt-1 text-xs text-amber-700">Approving restocks good items and records the refund / top-up.</p>
        </div>
      );
    }
    case "CUSTOMER_DISCOUNT":
      return payload.action === "create" ? (
        <div className="space-y-1.5">
          <DetailRow label="New customer" value={s(payload.fullName)} />
          <DetailRow label="Phone" value={s(payload.phone)} />
          <DetailRow label="Personal discount" value={`${s(payload.discountPercent)}%`} />
          <DetailRow label="Reason" value={s(payload.discountNote || "—")} />
        </div>
      ) : (
        <div className="space-y-1.5">
          <DetailRow label="Customer" value={s(payload.fullName)} />
          <DetailRow label="Discount" value={`${s(payload.beforeDiscount ?? "?")}% → ${s(payload.discountPercent)}%`} />
          <DetailRow label="Reason" value={s(payload.discountNote || "—")} />
        </div>
      );
    default:
      return <p className="text-sm text-muted-foreground">No detail view for this request type.</p>;
  }
}

/* ------------------------------ main page ------------------------------ */

export default function ApprovalsPage() {
  const { can } = usePermissions();
  const canReview = can("approvals.review");
  const utils = trpc.useUtils();

  const [historyPage, setHistoryPage] = useState(1);
  const [myPage, setMyPage] = useState(1);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [confirm, setConfirm] = useState<{ id: number; action: "APPROVE" | "REJECT"; summary: string } | null>(null);
  const [note, setNote] = useState("");

  const pendingQuery = trpc.approvals.list.useQuery(
    { status: "PENDING", page: 1, pageSize: 50 },
    { enabled: canReview },
  );
  const historyQuery = trpc.approvals.list.useQuery(
    { page: historyPage, pageSize: 15 },
    { enabled: canReview },
  );
  const myQuery = trpc.approvals.myRequests.useQuery(
    { page: myPage, pageSize: 10 },
    { enabled: can("approvals.request") },
  );

  const invalidateAll = () => {
    void utils.approvals.list.invalidate();
    void utils.approvals.myRequests.invalidate();
    void utils.approvals.pendingCount.invalidate();
    void utils.products.list.invalidate();
    void utils.returns.list.invalidate();
    void utils.sales.history.invalidate();
    void utils.customers.list.invalidate();
  };

  const approveMutation = trpc.approvals.approve.useMutation({
    onSuccess: (r) => {
      toast.success("Request approved and applied.", { description: r.applied });
      setConfirm(null);
      setNote("");
      invalidateAll();
    },
    onError: (err) => toast.error("Could not apply this request.", { description: err.message }),
  });

  const rejectMutation = trpc.approvals.reject.useMutation({
    onSuccess: () => {
      toast.success("Request rejected.", { description: "The requester can see your note." });
      setConfirm(null);
      setNote("");
      invalidateAll();
    },
    onError: (err) => toast.error("Could not reject.", { description: err.message }),
  });

  const toggleExpand = (id: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pending = (pendingQuery.data?.items ?? []) as RequestRow[];
  const busy = approveMutation.isPending || rejectMutation.isPending;

  /* ------------------- history & my-requests tables ------------------- */
  const historyColumns: Column<RequestRow>[] = [
    {
      header: "Request",
      render: (r) => (
        <div>
          <p className="font-medium text-foreground">{r.request.summary}</p>
          <p className="text-[11px] text-muted-foreground">
            #{r.request.id} • {timeAgo(new Date(r.request.createdAt))}
          </p>
        </div>
      ),
    },
    {
      header: "Type",
      render: (r) => <StatusBadge label={APPROVAL_TYPE_LABELS[r.request.requestType]} tone="gold" />,
    },
    { header: "Requested by", render: (r) => r.requesterName ?? "—" },
    {
      header: "Decision",
      render: (r) => (
        <div>
          <StatusBadge label={r.request.status} tone={toneForStatus(r.request.status)} />
          {r.request.reviewNote && (
            <p className="mt-0.5 max-w-[220px] truncate text-[11px] text-muted-foreground" title={r.request.reviewNote}>
              “{r.request.reviewNote}”
            </p>
          )}
        </div>
      ),
    },
    { header: "Reviewed by", render: (r) => r.reviewerName ?? "—" },
  ];

  const myColumns: Column<RequestRow>[] = [
    {
      header: "My request",
      render: (r) => (
        <div>
          <p className="font-medium text-foreground">{r.request.summary}</p>
          <p className="text-[11px] text-muted-foreground">
            #{r.request.id} • {timeAgo(new Date(r.request.createdAt))}
          </p>
        </div>
      ),
    },
    {
      header: "Type",
      render: (r) => <StatusBadge label={APPROVAL_TYPE_LABELS[r.request.requestType]} tone="gold" />,
    },
    {
      header: "Status",
      render: (r) => (
        <div>
          <StatusBadge label={r.request.status} tone={toneForStatus(r.request.status)} />
          {r.request.reviewNote && (
            <p className="mt-0.5 max-w-[220px] truncate text-[11px] text-muted-foreground" title={r.request.reviewNote}>
              “{r.request.reviewNote}”
            </p>
          )}
        </div>
      ),
    },
    {
      header: "Reviewed by",
      render: (r) => (r.request.status === "PENDING" ? <span className="text-muted-foreground">Waiting…</span> : (r.reviewerName ?? "—")),
    },
  ];

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader
        title="Approvals"
        description="Manager actions that need an Admin's sign-off. Approving applies the change immediately; rejecting returns a note to the requester."
      />

      <Tabs defaultValue={canReview ? "queue" : "mine"}>
        <TabsList className="bg-cream-200/70">
          {canReview && (
            <TabsTrigger value="queue" className="gap-1.5">
              <Inbox className="h-4 w-4" />
              Review Queue
              {pending.length > 0 && (
                <span className="ml-1 rounded-full bg-gold-500 px-2 py-0.5 text-[10px] font-bold text-navy-950">
                  {pending.length}
                </span>
              )}
            </TabsTrigger>
          )}
          {canReview && (
            <TabsTrigger value="history" className="gap-1.5">
              <BadgeCheck className="h-4 w-4" />
              History
            </TabsTrigger>
          )}
          <TabsTrigger value="mine" className="gap-1.5">
            <Clock className="h-4 w-4" />
            My Requests
          </TabsTrigger>
        </TabsList>

        {/* ------------------------- REVIEW QUEUE ------------------------- */}
        {canReview && (
          <TabsContent value="queue" className="mt-5">
            {pendingQuery.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 rounded-xl" />
                ))}
              </div>
            ) : pending.length === 0 ? (
              <div className="card-lux flex flex-col items-center gap-2 py-16 text-muted-foreground">
                <BadgeCheck className="h-10 w-10 text-emerald-500" />
                <p className="font-medium">All caught up!</p>
                <p className="text-sm">No requests are waiting for review.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pending.map((r) => {
                  const open = !collapsed.has(r.request.id);
                  return (
                    <article key={r.request.id} className="card-lux overflow-hidden border-l-4 border-l-gold-500">
                      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge label={APPROVAL_TYPE_LABELS[r.request.requestType]} tone="gold" />
                            <span className="text-[11px] text-muted-foreground">
                              #{r.request.id} • {r.requesterName ?? "Someone"} • {timeAgo(new Date(r.request.createdAt))}
                            </span>
                          </div>
                          <p className="mt-1.5 text-sm font-medium text-foreground">{r.request.summary}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50"
                            disabled={busy}
                            onClick={() => {
                              setConfirm({ id: r.request.id, action: "APPROVE", summary: r.request.summary });
                              setNote("");
                            }}
                          >
                            <Check className="mr-1 h-3.5 w-3.5" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:border-red-300 hover:bg-red-50"
                            disabled={busy}
                            onClick={() => {
                              setConfirm({ id: r.request.id, action: "REJECT", summary: r.request.summary });
                              setNote("");
                            }}
                          >
                            <X className="mr-1 h-3.5 w-3.5" />
                            Reject
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => toggleExpand(r.request.id)} className="text-xs text-muted-foreground">
                            {open ? <ChevronUp className="mr-1 h-3.5 w-3.5" /> : <ChevronDown className="mr-1 h-3.5 w-3.5" />}
                            {open ? "Hide details" : "View details"}
                          </Button>
                        </div>
                      </div>
                      {open && (
                        <div className={cn("border-t border-border bg-cream-100/60 px-4 py-3")}>
                          <PayloadDetails type={r.request.requestType} payload={r.request.payload} />
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </TabsContent>
        )}

        {/* --------------------------- HISTORY --------------------------- */}
        {canReview && (
          <TabsContent value="history" className="mt-5">
            <DataTable<RequestRow>
              columns={historyColumns}
              data={((historyQuery.data?.items ?? []) as RequestRow[]).filter((r) => r.request.status !== "PENDING")}
              loading={historyQuery.isLoading}
              keyFn={(r) => r.request.id}
              emptyTitle="No decisions yet"
              emptyDescription="Approved and rejected requests will appear here."
              pagination={{
                page: historyPage,
                pageSize: 15,
                total: historyQuery.data?.total ?? 0,
                onPage: setHistoryPage,
              }}
            />
          </TabsContent>
        )}

        {/* ------------------------- MY REQUESTS ------------------------- */}
        <TabsContent value="mine" className="mt-5">
          <DataTable<RequestRow>
            columns={myColumns}
            data={(myQuery.data?.items ?? []) as RequestRow[]}
            loading={myQuery.isLoading}
            keyFn={(r) => r.request.id}
            emptyTitle="No requests submitted"
            emptyDescription="When one of your actions needs admin approval, it shows up here."
            pagination={{ page: myPage, pageSize: 10, total: myQuery.data?.total ?? 0, onPage: setMyPage }}
          />
        </TabsContent>
      </Tabs>

      {/* --------------------- approve / reject dialog --------------------- */}
      <Dialog open={confirm != null} onOpenChange={(o) => !o && !busy && setConfirm(null)}>
        <DialogContent className="border-gold-500/30 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-navy-900">
              {confirm?.action === "APPROVE" ? "Approve request" : "Reject request"}
            </DialogTitle>
            <DialogDescription className="line-clamp-2">{confirm?.summary}</DialogDescription>
          </DialogHeader>
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Note {confirm?.action === "REJECT" ? <span className="text-gold-600">* (shown to requester)</span> : "(optional)"}
            </label>
            <Textarea
              data-no-scan
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="input-lux resize-none"
              placeholder={confirm?.action === "REJECT" ? "Why is this being rejected?" : "Anything to note…"}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)} disabled={busy}>
              Back
            </Button>
            <Button
              className={
                confirm?.action === "APPROVE"
                  ? "bg-emerald-600 font-semibold text-white hover:bg-emerald-500"
                  : "bg-red-600 font-semibold text-white hover:bg-red-500"
              }
              disabled={busy || (confirm?.action === "REJECT" && note.trim().length < 3)}
              onClick={() => {
                if (!confirm) return;
                if (confirm.action === "APPROVE") {
                  approveMutation.mutate({ id: confirm.id, reviewNote: note.trim() || undefined });
                } else {
                  rejectMutation.mutate({ id: confirm.id, reviewNote: note.trim() });
                }
              }}
            >
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {confirm?.action === "APPROVE" ? "Approve & Apply" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

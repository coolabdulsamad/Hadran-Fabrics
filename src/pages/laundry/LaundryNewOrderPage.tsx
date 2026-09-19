import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeft, Plus, Trash2, Loader2, UserSearch, Zap } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import {
  LAUNDRY_GARMENT_TYPES,
  LAUNDRY_PRICE_GUIDE,
  LAUNDRY_SERVICE_TYPES,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type LaundryServiceType,
  type PaymentMethod,
} from "@contracts/constants";
import { LAUNDRY_SERVICE_LABELS } from "@contracts/labels";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * HADRAN FABRICS MALL — new laundry order
 * One-screen intake: customer (walk-in or registered), garment lines with
 * service + condition notes, discount, due date, priority and an optional
 * deposit. On submit the order lands on its detail page ready to print
 * the customer ticket.
 */

interface GarmentLine {
  key: number;
  garmentType: string;
  description: string;
  serviceType: LaundryServiceType;
  quantity: number;
  unitPrice: string;
  conditionNotes: string;
}

let lineKey = 1;
const newLine = (): GarmentLine => ({
  key: lineKey++,
  garmentType: "",
  description: "",
  serviceType: "WASH_IRON",
  quantity: 1,
  unitPrice: "",
  conditionNotes: "",
});

export default function LaundryNewOrderPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canSearchCustomers = hasPermission("customers.view");

  /* ---------- customer ---------- */
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const customerSearch = trpc.customers.search.useQuery(
    { query: customerQuery },
    { enabled: canSearchCustomers && customerQuery.trim().length >= 2, retry: 1 },
  );

  /* ---------- order meta ---------- */
  const [priority, setPriority] = useState<"NORMAL" | "EXPRESS">("NORMAL");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [discount, setDiscount] = useState("");

  /* ---------- garment lines ---------- */
  const [lines, setLines] = useState<GarmentLine[]>([newLine()]);

  /* ---------- deposit ---------- */
  const [depositAmount, setDepositAmount] = useState("");
  const [depositMethod, setDepositMethod] = useState<PaymentMethod>("CASH");

  const updateLine = (key: number, patch: Partial<GarmentLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const pickGarment = (key: number, garment: string) => {
    setLines((ls) =>
      ls.map((l) =>
        l.key === key
          ? { ...l, garmentType: garment, unitPrice: l.unitPrice || String(LAUNDRY_PRICE_GUIDE[garment] ?? "") }
          : l,
      ),
    );
  };

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + (l.quantity || 0) * (Number(l.unitPrice) || 0), 0),
    [lines],
  );
  const discountNum = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  const total = Number((subtotal - discountNum).toFixed(2));
  const depositNum = Math.min(Math.max(Number(depositAmount) || 0, 0), total);
  const balance = Number((total - depositNum).toFixed(2));

  const validLines = lines.filter((l) => l.garmentType.trim() && l.quantity > 0 && Number(l.unitPrice) > 0);
  const canSubmit = customerName.trim().length >= 2 && validLines.length > 0;

  const createMutation = trpc.laundry.create.useMutation({
    onSuccess: (res) => {
      toast.success(`Order ${res.orderNo} received.`);
      navigate(`/laundry/orders/${res.orderId}?print=ticket`);
    },
    onError: (err) => toast.error(err.message),
  });

  const submit = () => {
    if (!canSubmit || createMutation.isPending) return;
    createMutation.mutate({
      customerId,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim() || undefined,
      priority,
      dueDate: dueDate || null,
      discountAmount: discountNum,
      notes: notes.trim() || undefined,
      items: validLines.map((l) => ({
        garmentType: l.garmentType.trim(),
        description: l.description.trim() || undefined,
        serviceType: l.serviceType,
        quantity: l.quantity,
        unitPrice: Number(l.unitPrice),
        conditionNotes: l.conditionNotes.trim() || undefined,
      })),
      deposit: depositNum > 0 ? { amount: depositNum, method: depositMethod } : null,
    });
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="New Laundry Order"
        description="Receive garments, price each service line and capture a deposit — all in one go."
        actions={
          <Link to="/laundry/orders">
            <Button variant="outline" className="gap-2 border-gold-500/40 text-navy-800 hover:bg-gold-50">
              <ArrowLeft className="h-4 w-4 text-gold-600" />
              Orders
            </Button>
          </Link>
        }
      />

      {/* Customer */}
      <div className="card-lux p-5">
        <h2 className="font-display text-base font-bold text-navy-900">Customer</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Name *</p>
            <Input value={customerName} onChange={(e) => { setCustomerName(e.target.value); setCustomerId(null); }} placeholder="e.g. Amina Bello" />
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Phone</p>
            <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="e.g. 0803 000 0000" />
          </div>
        </div>

        {canSearchCustomers && (
          <div className="mt-4 rounded-lg border border-dashed border-gold-400/60 bg-gold-50/50 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gold-700">
              <UserSearch className="h-3.5 w-3.5" /> Link a registered customer (optional)
            </p>
            <Input value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} placeholder="Type at least 2 letters to search…" />
            {customerSearch.data && customerSearch.data.length > 0 && (
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                {customerSearch.data.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomerId(c.id);
                        setCustomerName(c.fullName);
                        setCustomerPhone(c.phone ?? "");
                        setCustomerQuery("");
                        toast.success(`Linked ${c.fullName} (${c.code}).`);
                      }}
                      className="w-full rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-gold-100"
                    >
                      <span className="font-semibold text-navy-900">{c.fullName}</span>
                      <span className="ml-2 font-mono text-[10px] text-muted-foreground">{c.code}</span>
                      {c.phone && <span className="ml-2 text-muted-foreground">{c.phone}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {customerId && <p className="mt-2 text-[11px] font-medium text-emerald-700">Linked to customer record #{customerId}.</p>}
          </div>
        )}
      </div>

      {/* Garment lines */}
      <div className="card-lux mt-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-navy-900">Garments</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, newLine()])} className="gap-1.5 border-gold-500/40 text-navy-800 hover:bg-gold-50">
            <Plus className="h-3.5 w-3.5 text-gold-600" /> Add garment
          </Button>
        </div>

        <div className="mt-4 space-y-4">
          {lines.map((l, idx) => (
            <div key={l.key} className="rounded-xl border border-border bg-cream-50 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-navy-800">Garment {idx + 1}</p>
                {lines.length > 1 && (
                  <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="text-red-500 transition hover:text-red-700">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="col-span-2">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Garment type *</p>
                  <Select value={l.garmentType} onValueChange={(v) => pickGarment(l.key, v)}>
                    <SelectTrigger><SelectValue placeholder="Pick garment…" /></SelectTrigger>
                    <SelectContent>
                      {LAUNDRY_GARMENT_TYPES.map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Service *</p>
                  <Select value={l.serviceType} onValueChange={(v) => updateLine(l.key, { serviceType: v as LaundryServiceType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LAUNDRY_SERVICE_TYPES.map((s) => (
                        <SelectItem key={s} value={s}>{LAUNDRY_SERVICE_LABELS[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Qty *</p>
                  <Input type="number" min={1} max={999} value={l.quantity} onChange={(e) => updateLine(l.key, { quantity: Math.max(1, Number(e.target.value) || 1) })} />
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Unit price (₦) *</p>
                  <Input type="number" min={0} step="0.01" value={l.unitPrice} onChange={(e) => updateLine(l.key, { unitPrice: e.target.value })} placeholder="0.00" />
                </div>
                <div className="col-span-2">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Description</p>
                  <Input value={l.description} onChange={(e) => updateLine(l.key, { description: e.target.value })} placeholder="Colour, brand, marks…" />
                </div>
                <div className="col-span-2 md:col-span-4">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Condition at intake</p>
                  <Input value={l.conditionNotes} onChange={(e) => updateLine(l.key, { conditionNotes: e.target.value })} placeholder="Stains, tears, missing buttons…" />
                </div>
              </div>
              <p className="mt-2 text-right text-xs font-semibold text-navy-900">
                Line total: {formatCurrency((l.quantity || 0) * (Number(l.unitPrice) || 0))}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Meta + totals */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card-lux p-5">
          <h2 className="font-display text-base font-bold text-navy-900">Schedule & notes</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Due date</p>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Priority</p>
              <div className="flex gap-2">
                {(["NORMAL", "EXPRESS"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition",
                      priority === p
                        ? p === "EXPRESS"
                          ? "border-red-400 bg-red-50 text-red-700"
                          : "border-navy-400 bg-navy-50 text-navy-800"
                        : "border-border bg-white text-muted-foreground hover:border-gold-400",
                    )}
                  >
                    {p === "EXPRESS" && <Zap className="h-3.5 w-3.5" />}
                    {p === "EXPRESS" ? "Express" : "Normal"}
                  </button>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Order notes</p>
              <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Special instructions — e.g. no starch, fold not hang…" />
            </div>
          </div>
        </div>

        <div className="card-lux p-5">
          <h2 className="font-display text-base font-bold text-navy-900">Totals & deposit</h2>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-semibold text-navy-900">{formatCurrency(subtotal)}</span></div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Discount (₦)</span>
              <Input type="number" min={0} step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} className="h-8 w-32 text-right" placeholder="0.00" />
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-base">
              <span className="font-semibold text-navy-900">Total</span>
              <span className="font-display font-bold text-navy-900">{formatCurrency(total)}</span>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-border bg-cream-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Deposit (optional)</p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <Input type="number" min={0} max={total} step="0.01" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="0.00" />
              <Select value={depositMethod} onValueChange={(v) => setDepositMethod(v as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="mt-2 flex justify-between text-xs">
              <span className="text-muted-foreground">Balance on pickup</span>
              <span className={balance > 0 ? "font-semibold text-red-600" : "font-semibold text-emerald-700"}>{formatCurrency(balance)}</span>
            </div>
          </div>

          <Button
            onClick={submit}
            disabled={!canSubmit || createMutation.isPending}
            className="mt-4 w-full gap-2 bg-navy-800 py-6 text-base text-cream-100 hover:bg-navy-700"
          >
            {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Receive Order{total > 0 ? ` — ${formatCurrency(total)}` : ""}
          </Button>
          {!canSubmit && (
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Enter the customer name and at least one priced garment line.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

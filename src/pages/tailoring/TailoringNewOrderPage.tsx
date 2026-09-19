import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeft, Loader2, Ruler, Save } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/layout/PageHeader";
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
import {
  FABRIC_SOURCES,
  MEASUREMENT_FIELDS,
  PAYMENT_METHODS,
  TAILORING_STYLE_PRESETS,
  PAYMENT_METHOD_LABELS,
  type FabricSource,
  type PaymentMethod,
} from "@contracts/constants";
import { FABRIC_SOURCE_LABELS } from "@contracts/labels";
import { formatCurrency } from "@/lib/format";

/**
 * HADRAN FABRICS MALL — new tailoring order
 * Intake form: customer, style (preset or free text), fabric source,
 * tailor assignment, due date, measurements grid, price and an
 * optional deposit.
 */

export default function TailoringNewOrderPage() {
  const navigate = useNavigate();

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [stylePreset, setStylePreset] = useState("");
  const [styleDescription, setStyleDescription] = useState("");
  const [fabricSource, setFabricSource] = useState<FabricSource>("CUSTOMER_OWN");
  const [tailorId, setTailorId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [measurements, setMeasurements] = useState<Record<string, string>>({});
  const [showMeasurements, setShowMeasurements] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositMethod, setDepositMethod] = useState<PaymentMethod>("CASH");

  // Tailors = active staff with the TAILORING role.
  const tailors = trpc.users.list.useQuery(
    { role: "TAILORING", page: 1, pageSize: 50 },
    { retry: 1 },
  );

  const priceNum = Number(price) || 0;
  const depositNum = Math.min(Number(depositAmount) || 0, priceNum);

  const measurementValues = useMemo(() => {
    const out: Record<string, number | string> = {};
    for (const [k, v] of Object.entries(measurements)) {
      const trimmed = v.trim();
      if (!trimmed) continue;
      const n = Number(trimmed);
      out[k] = Number.isFinite(n) && trimmed !== "" ? n : trimmed;
    }
    return out;
  }, [measurements]);

  const createMutation = trpc.tailoring.create.useMutation({
    onSuccess: (res) => {
      toast.success(`Order ${res.orderNo} received.`);
      navigate(`/tailoring/orders/${res.orderId}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const effectiveStyle = (styleDescription.trim() || stylePreset).trim();

  const canSubmit =
    customerName.trim().length >= 2 &&
    effectiveStyle.length >= 2 &&
    priceNum > 0 &&
    !createMutation.isPending;

  const submit = () => {
    if (!canSubmit) {
      toast.error("Fill in the customer, style and price first.");
      return;
    }
    createMutation.mutate({
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim() || undefined,
      styleDescription: effectiveStyle,
      fabricSource,
      tailorId: tailorId ? Number(tailorId) : null,
      dueDate: dueDate || null,
      price: priceNum,
      notes: notes.trim() || undefined,
      measurements: Object.keys(measurementValues).length
        ? { label: "Standard", values: measurementValues }
        : null,
      deposit: depositNum > 0 ? { amount: depositNum, method: depositMethod } : null,
    });
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="New Tailoring Order"
        description="Receive a sewing job — style, fabric source, measurements and price."
        actions={
          <Link to="/tailoring/orders">
            <Button variant="outline" className="gap-2 border-gold-500/40 text-navy-800 hover:bg-gold-50">
              <ArrowLeft className="h-4 w-4 text-gold-600" />
              Back to Orders
            </Button>
          </Link>
        }
      />

      <div className="space-y-6">
        {/* Customer */}
        <section className="card-lux p-5">
          <h2 className="font-display text-base font-bold text-navy-900">Customer</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="customerName">Customer name *</Label>
              <Input id="customerName" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="e.g. Alhaji Musa Bello" className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="customerPhone">Phone</Label>
              <Input id="customerPhone" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="080…" className="mt-1.5" />
            </div>
          </div>
        </section>

        {/* Style & job */}
        <section className="card-lux p-5">
          <h2 className="font-display text-base font-bold text-navy-900">Style & Job</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Style preset</Label>
              <Select
                value={stylePreset || "NONE"}
                onValueChange={(v) => {
                  const val = v === "NONE" ? "" : v;
                  setStylePreset(val);
                  if (val && !styleDescription.trim()) setStyleDescription(val);
                }}
              >
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Pick a common style…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Custom / other</SelectItem>
                  {TAILORING_STYLE_PRESETS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="styleDescription">Style description *</Label>
              <Input
                id="styleDescription"
                value={styleDescription}
                onChange={(e) => setStyleDescription(e.target.value)}
                placeholder="e.g. Agbada (3-piece) with gold embroidery"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Fabric source</Label>
              <Select value={fabricSource} onValueChange={(v) => setFabricSource(v as FabricSource)}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FABRIC_SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>{FABRIC_SOURCE_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fabricSource === "SHOP_STOCK" && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Fabric comes from shop stock — include its cost in the price. Deduct the fabric itself via a stock adjustment or a production run.
                </p>
              )}
            </div>
            <div>
              <Label>Assign tailor</Label>
              <Select value={tailorId || "NONE"} onValueChange={(v) => setTailorId(v === "NONE" ? "" : v)}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Unassigned</SelectItem>
                  {(tailors.data?.items ?? []).map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.fullName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="dueDate">Due date</Label>
              <Input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="price">Price (₦) *</Label>
              <Input id="price" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" className="mt-1.5" />
            </div>
          </div>
          <div className="mt-4">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Embroidery details, fabric condition, customer requests…" className="mt-1.5" />
          </div>
        </section>

        {/* Measurements */}
        <section className="card-lux p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-bold text-navy-900">Measurements</h2>
              <p className="text-xs text-muted-foreground">All values in inches — fill only what the style needs.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowMeasurements((s) => !s)}
              className="gap-2 border-gold-500/40 text-navy-800 hover:bg-gold-50"
            >
              <Ruler className="h-4 w-4 text-gold-600" />
              {showMeasurements ? "Hide" : Object.keys(measurementValues).length ? `Edit (${Object.keys(measurementValues).length})` : "Add"}
            </Button>
          </div>
          {showMeasurements && (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {MEASUREMENT_FIELDS.map((f) => (
                <div key={f.key}>
                  <Label className="text-[11px]">{f.label}</Label>
                  <Input
                    value={measurements[f.key] ?? ""}
                    onChange={(e) => setMeasurements((m) => ({ ...m, [f.key]: e.target.value }))}
                    placeholder="—"
                    className="mt-1 h-9"
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Deposit */}
        <section className="card-lux p-5">
          <h2 className="font-display text-base font-bold text-navy-900">Deposit (optional)</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="depositAmount">Amount (₦)</Label>
              <Input id="depositAmount" type="number" min="0" step="0.01" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="0.00" className="mt-1.5" />
            </div>
            <div>
              <Label>Method</Label>
              <Select value={depositMethod} onValueChange={(v) => setDepositMethod(v as PaymentMethod)}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <p className="text-sm text-muted-foreground">
                Balance after deposit:{" "}
                <span className="font-semibold text-navy-900">{formatCurrency(Math.max(priceNum - depositNum, 0))}</span>
              </p>
            </div>
          </div>
        </section>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3 pb-8">
          <p className="mr-auto text-sm text-muted-foreground">
            Total: <span className="font-display text-lg font-bold text-navy-900">{formatCurrency(priceNum)}</span>
          </p>
          <Link to="/tailoring/orders">
            <Button variant="outline">Cancel</Button>
          </Link>
          <Button onClick={submit} disabled={!canSubmit} className="gap-2 bg-navy-800 text-cream-100 hover:bg-navy-700">
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 text-gold-400" />}
            Receive Order
          </Button>
        </div>
      </div>
    </div>
  );
}

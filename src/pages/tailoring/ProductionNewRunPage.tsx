import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeft, Loader2, PackagePlus, Save, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * HADRAN FABRICS MALL — new production run
 * Draft a run: pick the product being made (output), then the shop-stock
 * materials it consumes. The run starts as DRAFT — stock only moves when
 * the run is started from the detail page.
 */

interface ProductPick {
  id: number;
  sku: string;
  name: string;
  unitOfMeasure: string;
  currentStock: number;
}

interface MaterialLine extends ProductPick {
  quantity: string;
}

function ProductPicker({
  label,
  onPick,
  excludeIds,
}: {
  label: string;
  onPick: (p: ProductPick) => void;
  excludeIds: number[];
}) {
  const [search, setSearch] = useState("");
  const results = trpc.products.list.useQuery(
    { search: search || undefined, status: "ACTIVE", page: 1, pageSize: 8 },
    { retry: 1 },
  );
  const items = (results.data?.items ?? []).filter((p) => !excludeIds.includes(p.id));

  return (
    <div>
      <Label>{label}</Label>
      <div className="relative mt-1.5">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, SKU or barcode…" className="pl-8" />
      </div>
      <ul className="mt-2 max-h-52 space-y-1 overflow-y-auto rounded-lg border border-border bg-cream-50 p-1.5">
        {items.length === 0 && (
          <li className="px-2 py-4 text-center text-xs text-muted-foreground">
            {results.isLoading ? "Searching…" : "No matching active products."}
          </li>
        )}
        {items.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() =>
                onPick({
                  id: p.id,
                  sku: p.sku,
                  name: p.name,
                  unitOfMeasure: p.unitOfMeasure,
                  currentStock: Number(p.currentStock),
                })
              }
              className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-gold-50"
            >
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-navy-900">{p.name}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{p.sku}</span>
              </span>
              <span className={cn("shrink-0 text-[11px] font-semibold", Number(p.currentStock) > 0 ? "text-emerald-700" : "text-red-600")}>
                {Number(p.currentStock)} {p.unitOfMeasure}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ProductionNewRunPage() {
  const navigate = useNavigate();

  const [output, setOutput] = useState<ProductPick | null>(null);
  const [outputQty, setOutputQty] = useState("");
  const [notes, setNotes] = useState("");
  const [materials, setMaterials] = useState<MaterialLine[]>([]);

  const excluded = useMemo(
    () => [output?.id ?? 0, ...materials.map((m) => m.id)],
    [output, materials],
  );

  const createMutation = trpc.production.create.useMutation({
    onSuccess: (res) => {
      toast.success(`Production run ${res.refNo} drafted.`);
      navigate(`/tailoring/production/${res.productionId}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const qtyNum = Number(outputQty) || 0;
  const canSubmit =
    output != null &&
    qtyNum > 0 &&
    materials.length > 0 &&
    materials.every((m) => Number(m.quantity) > 0) &&
    !createMutation.isPending;

  const addMaterial = (p: ProductPick) => {
    setMaterials((ms) => [...ms, { ...p, quantity: "" }]);
  };
  const removeMaterial = (id: number) => setMaterials((ms) => ms.filter((m) => m.id !== id));
  const setMaterialQty = (id: number, qty: string) =>
    setMaterials((ms) => ms.map((m) => (m.id === id ? { ...m, quantity: qty } : m)));

  const submit = () => {
    if (!canSubmit || !output) {
      toast.error("Pick the output product, set a quantity and add at least one material.");
      return;
    }
    const overdrawn = materials.filter((m) => Number(m.quantity) > m.currentStock + 0.0001);
    if (overdrawn.length > 0) {
      toast.error(`Not enough stock for: ${overdrawn.map((m) => m.name).join(", ")}.`);
      return;
    }
    createMutation.mutate({
      outputProductId: output.id,
      outputQty: qtyNum,
      notes: notes.trim() || undefined,
      materials: materials.map((m) => ({ productId: m.id, quantity: Number(m.quantity) })),
    });
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="New Production Run"
        description="Draft a run that converts shop materials into a sellable product."
        actions={
          <Link to="/tailoring/production">
            <Button variant="outline" className="gap-2 border-gold-500/40 text-navy-800 hover:bg-gold-50">
              <ArrowLeft className="h-4 w-4 text-gold-600" />
              Back to Runs
            </Button>
          </Link>
        }
      />

      <div className="space-y-6">
        {/* Output */}
        <section className="card-lux p-5">
          <h2 className="font-display text-base font-bold text-navy-900">Output — what are we making?</h2>
          {output ? (
            <div className="mt-4 flex items-center justify-between rounded-lg border border-gold-300 bg-gold-50 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-navy-900">{output.name}</p>
                <p className="font-mono text-[11px] text-muted-foreground">{output.sku} · in stock: {output.currentStock} {output.unitOfMeasure}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setOutput(null)}>Change</Button>
            </div>
          ) : (
            <div className="mt-4">
              <ProductPicker label="Output product *" onPick={setOutput} excludeIds={excluded} />
            </div>
          )}
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="outputQty">Quantity to produce *</Label>
              <Input id="outputQty" type="number" min="0" step="0.01" value={outputQty} onChange={(e) => setOutputQty(e.target.value)} placeholder="e.g. 10" className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={1} placeholder="Batch details, target quality…" className="mt-1.5" />
            </div>
          </div>
        </section>

        {/* Materials */}
        <section className="card-lux p-5">
          <h2 className="font-display text-base font-bold text-navy-900">Materials — what does it consume?</h2>
          <p className="text-xs text-muted-foreground">These leave shop stock (PRODUCTION_OUT) when the run starts.</p>

          {materials.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2 pr-3">Material</th>
                    <th className="pb-2 pr-3 text-right">In Stock</th>
                    <th className="pb-2 pr-3 text-right">Quantity *</th>
                    <th className="pb-2 text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {materials.map((m) => {
                    const over = Number(m.quantity) > m.currentStock + 0.0001;
                    return (
                      <tr key={m.id} className="border-b border-border/60">
                        <td className="py-2 pr-3">
                          <p className="text-xs font-semibold text-navy-900">{m.name}</p>
                          <p className="font-mono text-[10px] text-muted-foreground">{m.sku}</p>
                        </td>
                        <td className="py-2 pr-3 text-right text-xs">{m.currentStock} {m.unitOfMeasure}</td>
                        <td className="py-2 pr-3 text-right">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={m.quantity}
                            onChange={(e) => setMaterialQty(m.id, e.target.value)}
                            className={cn("ml-auto h-8 w-28 text-right", over && "border-red-400 text-red-700")}
                          />
                          {over && <p className="mt-0.5 text-[10px] text-red-600">Exceeds stock</p>}
                        </td>
                        <td className="py-2 text-right">
                          <button type="button" onClick={() => removeMaterial(m.id)} className="text-red-500 hover:text-red-700">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4">
            <ProductPicker label="Add material" onPick={addMaterial} excludeIds={excluded} />
          </div>
        </section>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3 pb-8">
          <p className="mr-auto flex items-center gap-2 text-sm text-muted-foreground">
            <PackagePlus className="h-4 w-4 text-gold-600" />
            The run is created as a draft — stock moves when you start it.
          </p>
          <Link to="/tailoring/production">
            <Button variant="outline">Cancel</Button>
          </Link>
          <Button onClick={submit} disabled={!canSubmit} className="gap-2 bg-navy-800 text-cream-100 hover:bg-navy-700">
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 text-gold-400" />}
            Draft Run
          </Button>
        </div>
      </div>
    </div>
  );
}

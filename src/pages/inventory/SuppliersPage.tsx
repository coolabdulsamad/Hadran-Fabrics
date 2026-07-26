import { useState } from "react";
import { toast } from "sonner";
import { PlusCircle, Pencil, Truck, Search, Phone, Mail, MapPin, User } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { LoadingScreen } from "@/components/common/LoadingScreen";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Supplier {
  id: number;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
}

interface FormState {
  open: boolean;
  editing: Supplier | null;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  isActive: boolean;
}

const EMPTY: FormState = {
  open: false,
  editing: null,
  name: "",
  contactPerson: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
  isActive: true,
};

export default function SuppliersPage() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY);

  const listQuery = trpc.suppliers.list.useQuery({ search: search || undefined });

  const createMutation = trpc.suppliers.create.useMutation({
    onSuccess: async () => {
      await utils.suppliers.list.invalidate();
      await utils.suppliers.options.invalidate();
      toast.success("Supplier created.");
      setForm(EMPTY);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.suppliers.update.useMutation({
    onSuccess: async () => {
      await utils.suppliers.list.invalidate();
      await utils.suppliers.options.invalidate();
      toast.success("Supplier updated.");
      setForm(EMPTY);
    },
    onError: (e) => toast.error(e.message),
  });

  const openEdit = (s: Supplier) =>
    setForm({
      open: true,
      editing: s,
      name: s.name,
      contactPerson: s.contactPerson ?? "",
      phone: s.phone ?? "",
      email: s.email ?? "",
      address: s.address ?? "",
      notes: s.notes ?? "",
      isActive: s.isActive,
    });

  const save = () => {
    if (form.name.trim().length < 2) return toast.error("Supplier name is required.");
    const payload = {
      name: form.name.trim(),
      contactPerson: form.contactPerson.trim() || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      address: form.address.trim() || undefined,
      notes: form.notes.trim() || undefined,
    };
    if (form.editing) updateMutation.mutate({ id: form.editing.id, ...payload, isActive: form.isActive });
    else createMutation.mutate(payload);
  };

  if (listQuery.isLoading) return <LoadingScreen label="Loading suppliers…" />;

  const suppliers = (listQuery.data ?? []) as Supplier[];

  return (
    <div>
      <PageHeader
        title="Suppliers"
        description="Who the store buys from — contacts for reordering fabrics, shoes, jewelry and more."
        actions={
          <Button onClick={() => setForm({ ...EMPTY, open: true })} className="bg-navy-800 text-cream-100 hover:bg-navy-700">
            <PlusCircle className="mr-2 h-4 w-4 text-gold-400" />
            Add Supplier
          </Button>
        }
      />

      <div className="card-lux mb-4 p-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gold-600" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, contact or phone…" className="input-lux pl-10" />
        </div>
      </div>

      {suppliers.length === 0 ? (
        <div className="card-lux">
          <EmptyState icon={Truck} title="No suppliers found" description="Add your first supplier to start creating purchase orders." />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {suppliers.map((s) => (
            <div key={s.id} className="card-lux p-5 transition hover:border-gold-500/40">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy-800">
                    <Truck className="h-5 w-5 text-gold-400" />
                  </span>
                  <div>
                    <p className="font-semibold text-navy-900">{s.name}</p>
                    {!s.isActive && <StatusBadge label="INACTIVE" tone="gray" />}
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => openEdit(s)} className="h-8 w-8 text-navy-600 hover:bg-gold-50 hover:text-gold-700">
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-4 space-y-2 text-sm text-navy-800">
                {s.contactPerson && (
                  <p className="flex items-center gap-2"><User className="h-3.5 w-3.5 text-gold-600" />{s.contactPerson}</p>
                )}
                {s.phone && <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-gold-600" />{s.phone}</p>}
                {s.email && <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-gold-600" />{s.email}</p>}
                {s.address && <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-600" />{s.address}</p>}
                {s.notes && <p className="border-t border-border/70 pt-2 text-xs italic text-muted-foreground">{s.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/edit dialog */}
      <Dialog open={form.open} onOpenChange={(open) => !open && setForm(EMPTY)}>
        <DialogContent className="border-gold-500/30 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-navy-900">
              {form.editing ? `Edit — ${form.editing.name}` : "Add Supplier"}
            </DialogTitle>
            <DialogDescription>Complete supplier contact details.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy-700">Name *</label>
              <input className="input-lux" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Lagos Textile Wholesalers" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy-700">Contact Person</label>
              <input className="input-lux" value={form.contactPerson} onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy-700">Phone</label>
              <input className="input-lux" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+234…" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy-700">Email</label>
              <input className="input-lux" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy-700">Address</label>
              <input className="input-lux" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy-700">Notes</label>
              <textarea rows={2} className="input-lux h-auto py-2.5" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            {form.editing && (
              <div className="flex h-11 items-center gap-3 rounded-lg border border-input bg-background px-3 sm:col-span-2">
                <Switch checked={form.isActive} onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))} />
                <span className="text-sm text-navy-800">Active supplier</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(EMPTY)} className="border-border">Cancel</Button>
            <Button onClick={save} disabled={createMutation.isPending || updateMutation.isPending} className="bg-navy-800 text-cream-100 hover:bg-navy-700">
              {createMutation.isPending || updateMutation.isPending ? "Saving…" : form.editing ? "Save Changes" : "Create Supplier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

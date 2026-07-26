import { useEffect, useState } from "react";
import { toast } from "sonner";
import { UserRound, Phone, Crown, StickyNote, Loader2, Clock } from "lucide-react";
import { trpc } from "@/providers/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { GENDERS } from "@contracts/constants";

/**
 * HADRAN FABRICS MALL — customer create/edit dialog.
 * Full-detail form: identity, contact, special-customer discount and notes.
 * Manager discount changes may route to the admin approval queue —
 * the dialog surfaces that pending state instead of a plain success.
 */

export interface CustomerFormValues {
  fullName: string;
  phone: string;
  email: string;
  address: string;
  gender: (typeof GENDERS)[number] | "";
  birthday: string;
  notes: string;
  discountPercent: string;
  discountNote: string;
}

export interface EditableCustomer {
  id: number;
  fullName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  gender: (typeof GENDERS)[number] | null;
  birthday: string | Date | null;
  notes: string | null;
  discountPercent: number;
  discountNote: string | null;
}

const EMPTY: CustomerFormValues = {
  fullName: "",
  phone: "",
  email: "",
  address: "",
  gender: "",
  birthday: "",
  notes: "",
  discountPercent: "0",
  discountNote: "",
};

/** Format a DATE column (string or Date) for <input type="date"> without TZ shifts. */
export function dateInputValue(d: string | Date | null | undefined): string {
  if (!d) return "";
  if (typeof d === "string") return d.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface CustomerFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** Null = create; otherwise edit this customer. */
  customer: EditableCustomer | null;
  onSaved: () => void;
}

export function CustomerFormDialog({ open, onClose, customer, onSaved }: CustomerFormDialogProps) {
  const utils = trpc.useUtils();
  const [values, setValues] = useState<CustomerFormValues>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof CustomerFormValues, string>>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (customer) {
      setValues({
        fullName: customer.fullName,
        phone: customer.phone ?? "",
        email: customer.email ?? "",
        address: customer.address ?? "",
        gender: customer.gender ?? "",
        birthday: dateInputValue(customer.birthday),
        notes: customer.notes ?? "",
        discountPercent: String(customer.discountPercent),
        discountNote: customer.discountNote ?? "",
      });
    } else {
      setValues(EMPTY);
    }
  }, [open, customer]);

  const set = <K extends keyof CustomerFormValues>(key: K, value: CustomerFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const validate = (): boolean => {
    const e: typeof errors = {};
    if (values.fullName.trim().length < 3) e.fullName = "Full name is required (min 3 characters).";
    if (values.phone.trim().length < 7) e.phone = "A valid phone number is required.";
    if (values.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()))
      e.email = "Enter a valid email address.";
    const disc = Number(values.discountPercent);
    if (!Number.isFinite(disc) || disc < 0 || disc > 100) e.discountPercent = "Discount must be between 0 and 100.";
    if (disc > 0 && !values.discountNote.trim()) e.discountNote = "Say why this customer gets a discount.";
    if (values.birthday && !/^\d{4}-\d{2}-\d{2}$/.test(values.birthday)) e.birthday = "Use YYYY-MM-DD.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleResult = (result: { pending: boolean; approvalId?: number }, isEdit: boolean) => {
    if (result.pending) {
      toast.info("Sent for admin approval.", {
        description: `Request #${result.approvalId} — the ${isEdit ? "discount change" : "new customer with discount"} applies once an Admin approves it.`,
        icon: <Clock className="h-4 w-4" />,
      });
    } else {
      toast.success(isEdit ? "Customer updated." : "Customer registered.", {
        description: isEdit ? undefined : "They can now be attached at the POS.",
      });
    }
    void utils.customers.list.invalidate();
    void utils.customers.stats.invalidate();
    void utils.customers.byId.invalidate();
    onSaved();
    onClose();
  };

  const createMutation = trpc.customers.create.useMutation({
    onSuccess: (r) => handleResult(r, false),
    onError: (err) => toast.error("Could not register customer.", { description: err.message }),
  });
  const updateMutation = trpc.customers.update.useMutation({
    onSuccess: (r) => handleResult(r, true),
    onError: (err) => toast.error("Could not update customer.", { description: err.message }),
  });

  const submitting = createMutation.isPending || updateMutation.isPending;
  const discount = Number(values.discountPercent) || 0;

  const submit = () => {
    if (!validate()) return;
    const payload = {
      fullName: values.fullName.trim(),
      phone: values.phone.trim(),
      email: values.email.trim() || undefined,
      address: values.address.trim() || undefined,
      gender: values.gender || null,
      birthday: values.birthday || null,
      notes: values.notes.trim() || undefined,
      discountPercent: discount,
      discountNote: values.discountNote.trim() || undefined,
    };
    if (customer) {
      updateMutation.mutate({ ...payload, id: customer.id });
    } else {
      createMutation.mutate(payload);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent className="scrollbar-lux max-h-[92vh] overflow-y-auto border-gold-500/30 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-navy-900">
            <UserRound className="h-5 w-5 text-gold-600" />
            {customer ? "Edit Customer" : "Register Customer"}
          </DialogTitle>
          <DialogDescription>
            {customer
              ? `Update ${customer.fullName}'s record. Discount changes by managers go through admin approval.`
              : "Register a customer so they can be attached at the POS, earn loyalty points and (optionally) enjoy a personal discount."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Identity */}
          <section>
            <h4 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-navy-700">
              <UserRound className="h-3.5 w-3.5 text-gold-600" /> Identity
            </h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium">Full name <span className="text-gold-600">*</span></label>
                <Input
                  data-no-scan
                  value={values.fullName}
                  onChange={(e) => set("fullName", e.target.value)}
                  placeholder="e.g. Mrs. Adaeze Okafor"
                  className="input-lux"
                />
                {errors.fullName && <p className="mt-1 text-xs text-red-600">{errors.fullName}</p>}
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Gender</label>
                <Select value={values.gender || "NONE"} onValueChange={(v) => set("gender", v === "NONE" ? "" : (v as CustomerFormValues["gender"]))}>
                  <SelectTrigger className="bg-card"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Not specified</SelectItem>
                    <SelectItem value="MALE">Male</SelectItem>
                    <SelectItem value="FEMALE">Female</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Birthday</label>
                <Input
                  data-no-scan
                  type="date"
                  value={values.birthday}
                  onChange={(e) => set("birthday", e.target.value)}
                  className="input-lux"
                />
                {errors.birthday && <p className="mt-1 text-xs text-red-600">{errors.birthday}</p>}
              </div>
            </div>
          </section>

          {/* Contact */}
          <section>
            <h4 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-navy-700">
              <Phone className="h-3.5 w-3.5 text-gold-600" /> Contact
            </h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Phone <span className="text-gold-600">*</span></label>
                <Input
                  data-no-scan
                  value={values.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="0803 000 0000"
                  className="input-lux"
                />
                {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone}</p>}
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Email</label>
                <Input
                  data-no-scan
                  type="email"
                  value={values.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="customer@example.com"
                  className="input-lux"
                />
                {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium">Address</label>
                <Input
                  data-no-scan
                  value={values.address}
                  onChange={(e) => set("address", e.target.value)}
                  placeholder="Home or shop address"
                  className="input-lux"
                />
              </div>
            </div>
          </section>

          {/* Special discount */}
          <section className="rounded-xl border border-gold-500/30 bg-gold-500/5 p-4">
            <h4 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-navy-700">
              <Crown className="h-3.5 w-3.5 text-gold-600" /> Special Customer Discount
            </h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Discount % (0 = regular customer)</label>
                <Input
                  data-no-scan
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={values.discountPercent}
                  onChange={(e) => set("discountPercent", e.target.value)}
                  className="input-lux"
                />
                {errors.discountPercent && <p className="mt-1 text-xs text-red-600">{errors.discountPercent}</p>}
                {discount > 0 && (
                  <p className="mt-1 text-xs text-gold-700">
                    Applied automatically whenever this customer is attached at the POS.
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Discount reason {discount > 0 && <span className="text-gold-600">*</span>}
                </label>
                <Input
                  data-no-scan
                  value={values.discountNote}
                  onChange={(e) => set("discountNote", e.target.value)}
                  placeholder="e.g. VIP boutique owner, bulk buyer"
                  className="input-lux"
                  disabled={discount <= 0}
                />
                {errors.discountNote && <p className="mt-1 text-xs text-red-600">{errors.discountNote}</p>}
              </div>
            </div>
          </section>

          {/* Notes */}
          <section>
            <h4 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-navy-700">
              <StickyNote className="h-3.5 w-3.5 text-gold-600" /> Notes
            </h4>
            <Textarea
              data-no-scan
              value={values.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Preferences, usual orders, measurements, anything useful for the team…"
              rows={3}
              className="input-lux resize-none"
            />
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            className="bg-gold-500 font-semibold text-navy-950 hover:bg-gold-400"
            disabled={submitting}
            onClick={submit}
          >
            {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {customer ? "Save Changes" : "Register Customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

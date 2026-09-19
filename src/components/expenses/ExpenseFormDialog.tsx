import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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
import {
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  SECTION_LABELS,
  SECTIONS,
  type ExpenseCategory,
  type PaymentMethod,
  type Section,
} from "@contracts/constants";
import { EXPENSE_CATEGORY_LABELS } from "@contracts/labels";
import { useAuth } from "@/hooks/use-auth";

/**
 * HADRAN FABRICS MALL — record expense dialog.
 * Managers see an approval notice when their workflow requires sign-off;
 * everyone else records directly.
 */

interface FormValues {
  section: Section;
  category: ExpenseCategory | "";
  description: string;
  vendor: string;
  amount: string;
  paymentMethod: PaymentMethod;
  expenseDate: string;
  notes: string;
}

const EMPTY: FormValues = {
  section: "SALES",
  category: "",
  description: "",
  vendor: "",
  amount: "",
  paymentMethod: "CASH",
  expenseDate: new Date().toISOString().slice(0, 10),
  notes: "",
};

export function ExpenseFormDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [values, setValues] = useState<FormValues>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});

  useEffect(() => {
    if (open) {
      setValues({ ...EMPTY, expenseDate: new Date().toISOString().slice(0, 10) });
      setErrors({});
    }
  }, [open]);

  const record = trpc.expenses.record.useMutation({
    onSuccess: (result) => {
      if (result.pending) {
        toast.success("Expense sent for admin approval — it will post once approved.");
      } else {
        toast.success(`Expense ${result.refNo} recorded.`);
      }
      onSaved();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const submit = () => {
    const next: Partial<Record<keyof FormValues, string>> = {};
    if (!values.category) next.category = "Pick a category";
    if (values.description.trim().length < 3) next.description = "Describe the expense (min 3 characters)";
    const amount = Number(values.amount);
    if (!Number.isFinite(amount) || amount <= 0) next.amount = "Enter an amount greater than zero";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.expenseDate)) next.expenseDate = "Pick a valid date";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    record.mutate({
      section: values.section,
      category: values.category as ExpenseCategory,
      description: values.description.trim(),
      vendor: values.vendor.trim() || undefined,
      amount,
      paymentMethod: values.paymentMethod,
      expenseDate: values.expenseDate,
      notes: values.notes.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl text-navy-900">Record Expense</DialogTitle>
          <DialogDescription>
            Money going out of the business — rent, salaries, supplies, transport… It lands in the
            money ledger immediately.
          </DialogDescription>
        </DialogHeader>

        {user?.role === "MANAGER" && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Manager accounts need admin sign-off — your expense posts as soon as an admin approves it.
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Section</p>
            <Select value={values.section} onValueChange={(v) => set("section", v as Section)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SECTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{SECTION_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Category *</p>
            <Select value={values.category} onValueChange={(v) => set("category", v as ExpenseCategory)}>
              <SelectTrigger className={errors.category ? "border-red-400" : ""}>
                <SelectValue placeholder="Pick a category" />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.category && <p className="mt-1 text-xs text-red-600">{errors.category}</p>}
          </div>
          <div className="sm:col-span-2">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Description *</p>
            <Input
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="e.g. August rent for the mall space"
              className={errors.description ? "border-red-400" : ""}
            />
            {errors.description && <p className="mt-1 text-xs text-red-600">{errors.description}</p>}
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Amount (₦) *</p>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={values.amount}
              onChange={(e) => set("amount", e.target.value)}
              placeholder="0.00"
              className={errors.amount ? "border-red-400" : ""}
            />
            {errors.amount && <p className="mt-1 text-xs text-red-600">{errors.amount}</p>}
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Payment method</p>
            <Select value={values.paymentMethod} onValueChange={(v) => set("paymentMethod", v as PaymentMethod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Expense date *</p>
            <Input
              type="date"
              value={values.expenseDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => set("expenseDate", e.target.value)}
              className={errors.expenseDate ? "border-red-400" : ""}
            />
            {errors.expenseDate && <p className="mt-1 text-xs text-red-600">{errors.expenseDate}</p>}
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Vendor / paid to</p>
            <Input value={values.vendor} onChange={(e) => set("vendor", e.target.value)} placeholder="e.g. PHCN, landlord…" />
          </div>
          <div className="sm:col-span-2">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</p>
            <Textarea value={values.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Optional extra detail" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={record.isPending}>Cancel</Button>
          <Button onClick={submit} disabled={record.isPending} className="gap-2 bg-navy-800 text-cream-100 hover:bg-navy-700">
            {record.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Record Expense
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

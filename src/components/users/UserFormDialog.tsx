import { useEffect, useState } from "react";
import { toast } from "sonner";
import { UserRound, ShieldCheck, KeyRound, Loader2 } from "lucide-react";
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
import { USER_ROLES, ROLE_LABELS, type UserRole } from "@contracts/roles";

/**
 * HADRAN FABRICS MALL — staff create/edit dialog.
 * Create sets the initial password; role choice shows a plain-English
 * description so admins pick the right access level.
 */

const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  SALES: "POS terminal only — sell, hold carts, view own receipts.",
  LAUNDRY: "Laundry section — receive garments, run the washing workflow, take payments.",
  TAILORING: "Tailoring section — measurements, sewing workflow, and production runs.",
  MANAGER: "Everything sales does, plus inventory, purchases, reports — big actions need admin approval.",
  ADMIN: "Everything manager does, without approval gates, plus staff, permissions and sales settings.",
  SUPER_ADMIN: "Full control including system settings — the developer/owner role.",
};

export interface StaffFormValues {
  fullName: string;
  username: string;
  email: string;
  phone: string;
  role: UserRole;
  notes: string;
  password: string;
}

export interface EditableStaff {
  id: number;
  fullName: string;
  username: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  notes: string | null;
}

const EMPTY: StaffFormValues = {
  fullName: "",
  username: "",
  email: "",
  phone: "",
  role: "SALES",
  notes: "",
  password: "",
};

interface UserFormDialogProps {
  open: boolean;
  onClose: () => void;
  staff: EditableStaff | null; // null = create
  onSaved: () => void;
}

export function UserFormDialog({ open, onClose, staff, onSaved }: UserFormDialogProps) {
  const utils = trpc.useUtils();
  const [values, setValues] = useState<StaffFormValues>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof StaffFormValues, string>>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (staff) {
      setValues({
        fullName: staff.fullName,
        username: staff.username,
        email: staff.email ?? "",
        phone: staff.phone ?? "",
        role: staff.role,
        notes: staff.notes ?? "",
        password: "",
      });
    } else {
      setValues(EMPTY);
    }
  }, [open, staff]);

  const set = <K extends keyof StaffFormValues>(key: K, value: StaffFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const validate = (): boolean => {
    const e: typeof errors = {};
    if (values.fullName.trim().length < 3) e.fullName = "Full name is required.";
    if (!/^[a-zA-Z0-9._-]{3,}$/.test(values.username.trim()))
      e.username = "Min 3 chars — letters, numbers, dots, dashes, underscores.";
    if (values.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) e.email = "Enter a valid email.";
    if (!staff) {
      if (values.password.length < 8) e.password = "Password must be at least 8 characters.";
      else if (!/[a-zA-Z]/.test(values.password) || !/[0-9]/.test(values.password))
        e.password = "Password needs at least one letter and one number.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSuccess = (created: boolean) => {
    toast.success(created ? "Staff account created." : "Staff account updated.", {
      description: created ? "Share the username and initial password with the staff member." : undefined,
    });
    void utils.users.list.invalidate();
    void utils.users.stats.invalidate();
    void utils.users.byId.invalidate();
    onSaved();
    onClose();
  };

  const createMutation = trpc.users.create.useMutation({
    onSuccess: () => onSuccess(true),
    onError: (err) => toast.error("Could not create account.", { description: err.message }),
  });
  const updateMutation = trpc.users.update.useMutation({
    onSuccess: () => onSuccess(false),
    onError: (err) => toast.error("Could not update account.", { description: err.message }),
  });

  const submitting = createMutation.isPending || updateMutation.isPending;

  const submit = () => {
    if (!validate()) return;
    const base = {
      fullName: values.fullName.trim(),
      username: values.username.trim(),
      email: values.email.trim() || undefined,
      phone: values.phone.trim() || undefined,
      role: values.role,
      notes: values.notes.trim() || undefined,
    };
    if (staff) {
      updateMutation.mutate({ ...base, id: staff.id });
    } else {
      createMutation.mutate({ ...base, password: values.password });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent className="scrollbar-lux max-h-[92vh] overflow-y-auto border-gold-500/30 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-navy-900">
            <UserRound className="h-5 w-5 text-gold-600" />
            {staff ? `Edit ${staff.fullName}` : "Add Staff Member"}
          </DialogTitle>
          <DialogDescription>
            {staff
              ? "Update their details or change their role — permission changes apply on their next request."
              : "Create a login for a new team member and choose their access level."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <section>
            <h4 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-navy-700">
              <UserRound className="h-3.5 w-3.5 text-gold-600" /> Identity &amp; Contact
            </h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium">Full name <span className="text-gold-600">*</span></label>
                <Input data-no-scan value={values.fullName} onChange={(e) => set("fullName", e.target.value)} placeholder="e.g. Fatima Abubakar" className="input-lux" />
                {errors.fullName && <p className="mt-1 text-xs text-red-600">{errors.fullName}</p>}
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Email</label>
                <Input data-no-scan type="email" value={values.email} onChange={(e) => set("email", e.target.value)} placeholder="staff@hadranfabrics.ng" className="input-lux" />
                {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Phone</label>
                <Input data-no-scan value={values.phone} onChange={(e) => set("phone", e.target.value)} placeholder="0803 000 0000" className="input-lux" />
              </div>
            </div>
          </section>

          <section>
            <h4 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-navy-700">
              <ShieldCheck className="h-3.5 w-3.5 text-gold-600" /> Access
            </h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Username <span className="text-gold-600">*</span></label>
                <Input data-no-scan value={values.username} onChange={(e) => set("username", e.target.value)} placeholder="e.g. fatima" className="input-lux" />
                {errors.username && <p className="mt-1 text-xs text-red-600">{errors.username}</p>}
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Role <span className="text-gold-600">*</span></label>
                <Select value={values.role} onValueChange={(v) => set("role", v as UserRole)}>
                  <SelectTrigger className="bg-card"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {USER_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="rounded-lg bg-navy-900/5 px-3 py-2 text-xs text-muted-foreground sm:col-span-2">
                {ROLE_DESCRIPTIONS[values.role]}
              </p>
              {!staff && (
                <div className="sm:col-span-2">
                  <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                    <KeyRound className="h-3.5 w-3.5 text-gold-600" />
                    Initial password <span className="text-gold-600">*</span>
                  </label>
                  <Input
                    data-no-scan
                    type="text"
                    value={values.password}
                    onChange={(e) => set("password", e.target.value)}
                    placeholder="Min 8 chars, at least one letter and one number"
                    className="input-lux"
                  />
                  {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">
                    The staff member should change it after first login (Profile → Change password).
                  </p>
                </div>
              )}
            </div>
          </section>

          <section>
            <label className="mb-1.5 block text-sm font-medium">Internal notes</label>
            <Textarea
              data-no-scan
              value={values.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              className="input-lux resize-none"
              placeholder="Shift, responsibilities, anything useful…"
            />
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button className="bg-gold-500 font-semibold text-navy-950 hover:bg-gold-400" disabled={submitting} onClick={submit}>
            {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {staff ? "Save Changes" : "Create Account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

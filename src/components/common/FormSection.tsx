import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface FormSectionProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  children: ReactNode;
}

/** Titled section block used to organize the long, detailed forms. */
export function FormSection({ icon: Icon, title, description, children }: FormSectionProps) {
  return (
    <section className="card-lux">
      <div className="flex items-start gap-3 border-b border-border px-5 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-800">
          <Icon className="h-4 w-4 text-gold-400" />
        </span>
        <div>
          <h3 className="font-display text-base font-semibold text-navy-900">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-x-5 gap-y-4 p-5 md:grid-cols-2">{children}</div>
    </section>
  );
}

/** Field wrapper with label + error, pairs with FormSection. */
export function Field({
  label,
  required,
  error,
  hint,
  full,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={full ? "md:col-span-2" : undefined}>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy-700">
        {label} {required && <span className="text-gold-600">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

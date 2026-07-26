import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone?: "navy" | "gold" | "emerald" | "red";
  className?: string;
}

const TONES = {
  navy: "bg-navy-100 text-navy-700",
  gold: "bg-gold-100 text-gold-700",
  emerald: "bg-emerald-100 text-emerald-700",
  red: "bg-red-100 text-red-700",
} as const;

/** KPI stat card used on the dashboard and report pages. */
export function StatCard({ icon: Icon, label, value, hint, tone = "navy", className }: StatCardProps) {
  return (
    <div className={cn("card-lux flex items-center gap-4 p-5", className)}>
      <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", TONES[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-0.5 truncate font-display text-xl font-bold text-navy-900">{value}</p>
        {hint && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

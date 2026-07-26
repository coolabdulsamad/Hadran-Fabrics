import { ROLE_LABELS, type UserRole } from "@contracts/roles";
import { ROLE_STYLES } from "@/config/constants";
import { cn } from "@/lib/utils";

/** Colored role pill: SALES sky · MANAGER emerald · ADMIN gold · SUPER_ADMIN navy. */
export function RoleBadge({ role, className }: { role: UserRole; className?: string }) {
  const style = ROLE_STYLES[role] ?? ROLE_STYLES.SALES;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide",
        style.badge,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

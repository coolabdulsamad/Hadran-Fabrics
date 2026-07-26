import { cn } from "@/lib/utils";

export type StatusTone = "green" | "amber" | "red" | "gray" | "navy" | "gold" | "sky";

const TONES: Record<StatusTone, string> = {
  green: "bg-emerald-100 text-emerald-800 border-emerald-200",
  amber: "bg-amber-100 text-amber-800 border-amber-200",
  red: "bg-red-100 text-red-700 border-red-200",
  gray: "bg-gray-100 text-gray-600 border-gray-200",
  navy: "bg-navy-100 text-navy-800 border-navy-200",
  gold: "bg-gold-100 text-gold-800 border-gold-300",
  sky: "bg-sky-100 text-sky-800 border-sky-200",
};

/** Generic pill for statuses (product, sale, purchase, approval…). */
export function StatusBadge({ label, tone = "gray" }: { label: string; tone?: StatusTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
        TONES[tone],
      )}
    >
      {label}
    </span>
  );
}

/** Map common domain statuses to tones. */
export function toneForStatus(status: string): StatusTone {
  switch (status) {
    case "ACTIVE":
    case "COMPLETED":
    case "RECEIVED":
    case "APPROVED":
    case "GOOD":
      return "green";
    case "PENDING":
    case "IN_PROGRESS":
    case "PARTIALLY_RECEIVED":
    case "PARTIALLY_RETURNED":
    case "DRAFT":
      return "amber";
    case "ARCHIVED":
    case "CANCELLED":
    case "VOIDED":
    case "REJECTED":
    case "DAMAGED":
    case "SUSPENDED":
    case "BLOCKED":
      return "red";
    case "HELD":
      return "sky";
    case "RETURNED":
      return "navy";
    default:
      return "gray";
  }
}

/**
 * HADRAN FABRICS MALL — display formatting helpers
 */

const CURRENCY_SYMBOL = "₦";

/** ₦12,500.00 — Nigerian Naira, grouped thousands. */
export function formatCurrency(amount: number | string | null | undefined): string {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return `${CURRENCY_SYMBOL}0.00`;
  return `${CURRENCY_SYMBOL}${n.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** 12,500 — plain grouped number. */
export function formatNumber(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  return Number.isFinite(v) ? v.toLocaleString("en-NG") : "0";
}

/** 3.5 / 48 — quantity with trimmed trailing zeros. */
export function formatQty(q: number | string | null | undefined): string {
  const v = Number(q ?? 0);
  if (!Number.isFinite(v)) return "0";
  return v % 1 === 0 ? v.toLocaleString("en-NG") : v.toLocaleString("en-NG", { maximumFractionDigits: 3 });
}

/** 24 Jul 2026 */
export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/** 24 Jul 2026, 14:35 */
export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  return `${formatDate(date)}, ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

/** "5 min ago" / "2 hrs ago" / "Yesterday" / date */
export function timeAgo(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return formatDate(date);
}

/** Initials for avatar fallback: "Floor Manager" → "FM" */
export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

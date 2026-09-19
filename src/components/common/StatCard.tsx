import { useLayoutEffect, useRef } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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

const MAX_PX = 20; // ~text-xl
const MIN_PX = 11;

/**
 * KPI stat card used on the dashboard and report pages.
 * The value auto-fits its container: it shrinks pixel-by-pixel until the
 * FULL value fits on one line — it never wraps mid-number and never
 * truncates. Hovering the card shows the full value + details in a tooltip.
 */
export function StatCard({ icon: Icon, label, value, hint, tone = "navy", className }: StatCardProps) {
  const valueRef = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const el = valueRef.current;
    if (!el) return;
    const fit = () => {
      let size = MAX_PX;
      el.style.fontSize = `${size}px`;
      // shrink until the whole value fits on one line (or we hit the floor)
      while (size > MIN_PX && el.scrollWidth > el.clientWidth + 1) {
        size -= 0.5;
        el.style.fontSize = `${size}px`;
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [value]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn("card-lux flex items-center gap-4 p-5", className)}>
          <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", TONES[tone])}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
            <p
              ref={valueRef}
              className="mt-0.5 whitespace-nowrap font-display font-bold leading-tight text-navy-900"
              style={{ fontSize: MAX_PX }}
            >
              {value}
            </p>
            {hint && <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{hint}</p>}
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-center">
        <p className="text-[11px] font-medium uppercase tracking-wider opacity-80">{label}</p>
        <p className="font-display text-base font-bold">{value}</p>
        {hint && <p className="mt-0.5 text-xs opacity-80">{hint}</p>}
      </TooltipContent>
    </Tooltip>
  );
}

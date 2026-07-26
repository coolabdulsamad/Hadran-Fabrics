import { Scissors } from "lucide-react";

/** Full-screen branded loader (session restore, route transitions). */
export function LoadingScreen({ label = "Loading your workspace…" }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-navy-900">
      <div className="relative">
        <div className="h-20 w-20 animate-spin rounded-full border-2 border-gold-500/20 border-t-gold-400" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Scissors className="h-6 w-6 text-gold-400" />
        </div>
      </div>
      <p className="mt-6 font-display text-lg tracking-wide text-cream-100">Hadran Fabrics Mall</p>
      <p className="mt-1 text-xs uppercase tracking-[0.3em] text-gold-500/80">{label}</p>
    </div>
  );
}

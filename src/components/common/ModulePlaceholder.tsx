import { Hammer, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";

interface ModulePlaceholderProps {
  title: string;
  phase: number;
  description: string;
  icon?: LucideIcon;
}

/**
 * Honest placeholder for modules scheduled in a later build phase.
 * Keeps navigation complete without faking functionality.
 */
export function ModulePlaceholder({ title, phase, description, icon: Icon = Hammer }: ModulePlaceholderProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="card-lux-gold max-w-lg p-10 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-gold-500/40 bg-navy-800">
          <Icon className="h-7 w-7 text-gold-400" />
        </div>
        <h1 className="mt-6 font-display text-2xl font-bold text-navy-900">{title}</h1>
        <div className="gold-divider mx-auto mt-4 w-40" />
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{description}</p>
        <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-gold-500/40 bg-gold-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-gold-700">
          Arrives in Phase {phase}
        </p>
        <div className="mt-8">
          <Button asChild variant="outline" className="border-gold-500/40 text-navy-800 hover:bg-gold-50">
            <Link to="/dashboard">Back to Dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

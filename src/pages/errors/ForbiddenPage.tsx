import { Lock } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";

export function ForbiddenPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="card-lux-gold max-w-md p-10 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-gold-500/40 bg-navy-800">
          <Lock className="h-7 w-7 text-gold-400" />
        </div>
        <p className="mt-6 font-display text-4xl font-bold text-gold-gradient">403</p>
        <h1 className="mt-2 font-display text-xl font-semibold text-navy-900">Access Restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your role doesn't have permission to open this page. If you believe this is a mistake,
          ask your Admin to review your permissions.
        </p>
        <Button asChild className="mt-6 bg-navy-800 text-cream-100 hover:bg-navy-700">
          <Link to="/dashboard">Return to Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}

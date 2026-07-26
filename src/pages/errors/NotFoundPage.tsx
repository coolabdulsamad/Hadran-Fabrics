import { Compass } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-900 p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-gold-500/50 bg-navy-800">
          <Compass className="h-7 w-7 text-gold-400" />
        </div>
        <p className="mt-6 font-display text-5xl font-bold text-gold-gradient">404</p>
        <h1 className="mt-2 font-display text-xl font-semibold text-cream-100">Page Not Found</h1>
        <p className="mt-2 text-sm text-cream-300/70">
          The page you're looking for has moved or never existed.
        </p>
        <Button asChild className="mt-6 bg-gold-500 text-navy-900 hover:bg-gold-400">
          <Link to="/dashboard">Back to Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}

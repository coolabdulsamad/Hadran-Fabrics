import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Navigate, useLocation } from "react-router";
import { toast } from "sonner";
import {
  Scissors,
  MapPin,
  User,
  Lock,
  Eye,
  EyeOff,
  LogIn,
  ShieldCheck,
  Barcode,
  Printer,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { landingRouteFor } from "@/store/section-store";
import { LoadingScreen } from "@/components/common/LoadingScreen";
import { APP_ADDRESS, APP_MOTTO, APP_TAGLINE } from "@/config/constants";

const loginSchema = z.object({
  username: z.string().min(1, "Enter your username"),
  password: z.string().min(1, "Enter your password"),
});
type LoginForm = z.infer<typeof loginSchema>;

const HIGHLIGHTS = [
  { icon: ShieldCheck, text: "Role-based access — Sales, Laundry, Tailoring & Management" },
  { icon: Barcode, text: "Barcode scanning & measured fabric sales by the yard" },
  { icon: Printer, text: "Instant 80mm thermal receipts at the till" },
];

export default function LoginPage() {
  const { user, login, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Where to send the user once the session flips to authenticated.
  const [target, setTarget] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  if (isLoading) return <LoadingScreen label="Preparing sign in…" />;
  if (isAuthenticated && user) {
    return <Navigate to={target ?? landingRouteFor(user.role)} replace />;
  }

  const from = (location.state as { from?: string } | null)?.from;

  const onSubmit = async (values: LoginForm) => {
    setSubmitting(true);
    setError(null);
    try {
      const { user: loggedIn } = await login(values.username, values.password);
      toast.success("Welcome back to Hadran Fabrics Mall");
      // Honour a deep-link target; otherwise land on the section picker
      // (or straight into the workspace for single-section roles).
      // The redirect fires when the session state flips to authenticated.
      setTarget(from && from !== "/" ? from : landingRouteFor(loggedIn.role));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed. Try again.";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-cream-100">
      {/* ---------- Brand panel ---------- */}
      <aside className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-navy-900 p-12 lg:flex">
        <div className="pointer-events-none absolute inset-6 rounded-sm border border-gold-500/25" />
        <div className="pointer-events-none absolute inset-8 rounded-sm border border-gold-500/15" />

        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-gold-500/60 bg-navy-800">
              <Scissors className="h-5 w-5 text-gold-400" />
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.35em] text-gold-400">
                {APP_TAGLINE}
              </p>
              <p className="font-display text-lg font-semibold text-cream-100">Management Suite</p>
            </div>
          </div>
        </div>

        <div className="relative">
          <h1 className="font-display text-5xl font-bold leading-tight text-cream-50">
            HADRAN
            <br />
            <span className="text-gold-gradient">FABRICS</span> MALL
          </h1>
          <div className="mt-5 flex w-48 items-center gap-3">
            <span className="h-px flex-1 bg-gradient-to-r from-transparent to-gold-500/80" />
            <Sparkles className="h-4 w-4 text-gold-400" />
            <span className="h-px flex-1 bg-gradient-to-l from-transparent to-gold-500/80" />
          </div>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-cream-300/80">
            The complete system for fabrics, native wear, shoes, jewelry and accessories —
            sales, inventory, staff, reports and more, in one elegant workspace.
          </p>

          <ul className="mt-8 space-y-3">
            {HIGHLIGHTS.map((h) => (
              <li key={h.text} className="flex items-center gap-3 text-sm text-cream-200/90">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gold-500/30 bg-navy-800">
                  <h.icon className="h-4 w-4 text-gold-400" />
                </span>
                {h.text}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative">
          <p className="flex items-center gap-2 text-xs text-cream-300/70">
            <MapPin className="h-3.5 w-3.5 text-gold-500" />
            {APP_ADDRESS}
          </p>
          <p className="mt-2 text-xs italic text-cream-300/50">{APP_MOTTO}</p>
        </div>
      </aside>

      {/* ---------- Form panel ---------- */}
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Mobile brand header */}
          <div className="mb-8 text-center lg:hidden">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 border-gold-500/60 bg-navy-800">
              <Scissors className="h-6 w-6 text-gold-400" />
            </div>
            <h1 className="mt-4 font-display text-2xl font-bold text-navy-900">
              HADRAN <span className="text-gold-gradient">FABRICS</span> MALL
            </h1>
            <p className="mt-1 text-[10px] uppercase tracking-[0.3em] text-gold-600">{APP_TAGLINE}</p>
          </div>

          <div className="card-lux-gold p-8">
            <h2 className="font-display text-2xl font-bold text-navy-900">Staff Sign In</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter your staff credentials to open your workspace.
            </p>
            <div className="gold-divider mt-5" />

            <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5" noValidate>
              <div>
                <label htmlFor="username" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy-700">
                  Username
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gold-600" />
                  <input
                    id="username"
                    type="text"
                    autoComplete="username"
                    autoFocus
                    placeholder="e.g. manager"
                    className="input-lux pl-10"
                    {...register("username")}
                  />
                </div>
                {errors.username && (
                  <p className="mt-1 text-xs text-red-600">{errors.username.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="password" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy-700">
                  Password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gold-600" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="input-lux pl-10 pr-11"
                    {...register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-navy-400 transition hover:text-gold-600"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
                )}
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-navy-800 font-semibold text-cream-100 shadow-[0_6px_20px_-8px_rgba(20,27,45,0.6)] transition hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-cream-100/30 border-t-gold-400" />
                    Signing in…
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4 text-gold-400" />
                    Sign In
                  </>
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-xs text-muted-foreground">
              Trouble signing in? Ask your Admin to reset your password.
            </p>
          </div>

          <p className="mt-6 text-center text-[11px] text-muted-foreground">
            Hadran Fabrics Mall — Management Suite · {APP_MOTTO}
          </p>
        </div>
      </main>
    </div>
  );
}

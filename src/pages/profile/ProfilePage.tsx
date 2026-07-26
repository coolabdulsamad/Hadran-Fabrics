import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/use-auth";
import { formatCurrency, formatDate, timeAgo } from "@/lib/format";
import { PageHeader } from "@/components/layout/PageHeader";
import { RoleBadge } from "@/components/common/RoleBadge";
import { StatCard } from "@/components/common/StatCard";
import { FormSection, Field } from "@/components/common/FormSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useRef } from "react";
import {
  UserRound, Mail, Phone, IdCard, CalendarDays, KeyRound, Loader2, Save,
  ReceiptText, Banknote, LogIn, History, Eye, EyeOff, ShieldCheck, Camera,
} from "lucide-react";
import { toast } from "sonner";

export default function ProfilePage() {
  const { user, refresh, logout } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [profileDirty, setProfileDirty] = useState(false);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);

  const activityQ = trpc.auth.myActivity.useQuery();
  const updateMut = trpc.auth.updateProfile.useMutation();
  const pwMut = trpc.auth.changePassword.useMutation();

  useEffect(() => {
    setFullName(user?.fullName ?? "");
    setEmail(user?.email ?? "");
    setPhone(user?.phone ?? "");
  }, [user?.fullName, user?.email, user?.phone]);

  if (!user) return null;

  const markDirty = () => setProfileDirty(true);

  const saveProfile = async () => {
    try {
      await updateMut.mutateAsync({
        fullName: fullName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
      });
      toast.success("Profile updated.");
      setProfileDirty(false);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile");
    }
  };

  const pwValid =
    currentPw.length > 0 &&
    newPw.length >= 8 &&
    /[a-zA-Z]/.test(newPw) &&
    /\d/.test(newPw) &&
    newPw === confirmPw;

  const changePw = async () => {
    if (!pwValid) return;
    try {
      await pwMut.mutateAsync({ currentPassword: currentPw, newPassword: newPw });
      toast.success("Password changed — please log in again.");
      await logout().catch(() => undefined);
      navigate("/login", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change password");
    }
  };

  const initials = user.fullName.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const activity = activityQ.data;

  return (
    <div>
      <PageHeader title="My Profile" description="Your account details, today's activity and security settings." />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* Identity card */}
        <div className="space-y-5">
          <div className="rounded-xl border border-border bg-card p-6 text-center">
            <AvatarUpload user={user} initials={initials} onDone={() => refresh()} />
            <h2 className="mt-3 text-lg font-semibold">{user.fullName}</h2>
            <p className="text-sm text-muted-foreground">@{user.username}</p>
            <div className="mt-2 flex justify-center"><RoleBadge role={user.role} /></div>
            <Separator className="my-4" />
            <div className="space-y-2.5 text-left text-sm">
              <InfoRow icon={IdCard} label="Staff code" value={user.staffCode ?? "—"} />
              <InfoRow icon={Mail} label="Email" value={user.email ?? "Not set"} />
              <InfoRow icon={Phone} label="Phone" value={user.phone ?? "Not set"} />
              <InfoRow icon={CalendarDays} label="Member since" value={formatDate(new Date(user.createdAt))} />
              <InfoRow icon={LogIn} label="Last login" value={user.lastLoginAt ? timeAgo(new Date(user.lastLoginAt)) : "—"} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <StatCard icon={ReceiptText} label="Sales today" value={String(activity?.todaySales ?? "—")} />
            <StatCard icon={Banknote} label="Revenue today" value={activity ? formatCurrency(activity.todayRevenue) : "—"} tone="gold" />
            <StatCard icon={LogIn} label="Total logins" value={String(activity?.totalLogins ?? "—")} />
          </div>
        </div>

        {/* Edit + security */}
        <div className="space-y-5 xl:col-span-2">
          <FormSection icon={UserRound} title="Profile details" description="Your name appears on receipts, sales records and the audit trail.">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field label="Full name" required hint="Shown across the whole system">
                <Input value={fullName} onChange={(e) => { setFullName(e.target.value); markDirty(); }} />
              </Field>
              <Field label="Username" hint="Usernames can only be changed by an administrator">
                <Input value={user.username} disabled />
              </Field>
              <Field label="Email">
                <Input type="email" placeholder="you@example.com" value={email}
                  onChange={(e) => { setEmail(e.target.value); markDirty(); }} />
              </Field>
              <Field label="Phone">
                <Input placeholder="+234 …" value={phone}
                  onChange={(e) => { setPhone(e.target.value); markDirty(); }} />
              </Field>
            </div>
            <div className="mt-5 flex justify-end">
              <Button onClick={saveProfile} disabled={!profileDirty || fullName.trim().length < 3 || updateMut.isPending}>
                {updateMut.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                Save changes
              </Button>
            </div>
          </FormSection>

          <FormSection icon={KeyRound} title="Change password" description="You will be logged out of all devices after changing your password.">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              <Field label="Current password" required>
                <Input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} autoComplete="current-password" />
              </Field>
              <Field label="New password" required hint="Min 8 chars, with a letter and a number">
                <div className="relative">
                  <Input type={showPw ? "text" : "password"} value={newPw} onChange={(e) => setNewPw(e.target.value)}
                    autoComplete="new-password" className="pr-9" />
                  <button type="button" onClick={() => setShowPw((s) => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>
              <Field label="Confirm new password" required
                error={confirmPw && confirmPw !== newPw ? "Passwords do not match" : undefined}>
                <Input type={showPw ? "text" : "password"} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)}
                  autoComplete="new-password" />
              </Field>
            </div>
            {newPw.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                <PwRule ok={newPw.length >= 8} label="8+ characters" />
                <PwRule ok={/[a-zA-Z]/.test(newPw)} label="Has a letter" />
                <PwRule ok={/\d/.test(newPw)} label="Has a number" />
                <PwRule ok={confirmPw === newPw && confirmPw.length > 0} label="Matches confirmation" />
              </div>
            )}
            <div className="mt-5 flex justify-end">
              <Button variant="outline" onClick={changePw} disabled={!pwValid || pwMut.isPending}>
                {pwMut.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1.5 h-4 w-4" />}
                Change password
              </Button>
            </div>
          </FormSection>

          <FormSection icon={History} title="My recent activity" description="Your last 15 recorded actions in the system.">
            {activityQ.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (activity?.recentActions ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No recorded activity yet.</p>
            ) : (
              <div className="space-y-1.5">
                {activity!.recentActions.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2">
                    <Badge variant="outline" className="shrink-0 font-mono text-[10px]">{a.action}</Badge>
                    <p className="min-w-0 flex-1 truncate text-sm">{a.description}</p>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(new Date(a.createdAt))}</span>
                  </div>
                ))}
              </div>
            )}
          </FormSection>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="w-24 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}

function PwRule({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${ok ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
      {ok ? "✓" : "○"} {label}
    </span>
  );
}

/** Clickable avatar — uploads a new profile photo from the device. */
function AvatarUpload({ user, initials, onDone }: { user: { avatarUrl: string | null }; initials: string; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const updateMut = trpc.auth.updateProfile.useMutation();
  const meQ = trpc.auth.me.useQuery();

  const upload = async (f: File) => {
    if (f.size > 5 * 1024 * 1024) { toast.error("Image must be under 5MB."); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("kind", "product"); // images-only bucket (or Cloudinary when configured)
      const res = await fetch("/api/upload", { method: "POST", body: fd, credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      const me = meQ.data?.user;
      await updateMut.mutateAsync({
        fullName: me?.fullName ?? "",
        email: me?.email ?? null,
        phone: me?.phone ?? null,
        avatarUrl: data.url,
      });
      toast.success("Profile photo updated.");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="relative mx-auto h-20 w-20">
      <Avatar className="h-20 w-20">
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="Profile" className="h-full w-full rounded-full object-cover" />
        ) : (
          <AvatarFallback className="bg-primary text-2xl font-bold text-primary-foreground">{initials}</AvatarFallback>
        )}
      </Avatar>
      <button
        type="button"
        title="Change photo"
        onClick={() => fileRef.current?.click()}
        disabled={uploading || !meQ.data?.user}
        className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-gold-500 text-navy-900 shadow-md transition hover:bg-gold-400"
      >
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
      />
    </div>
  );
}

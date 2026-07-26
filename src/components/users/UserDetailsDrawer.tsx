import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, Ban, CircleCheck, Pencil, ReceiptText, Banknote, Activity, Loader2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { RoleBadge } from "@/components/common/RoleBadge";
import { StatusBadge, toneForStatus } from "@/components/common/StatusBadge";
import { formatCurrency, formatDateTime, timeAgo } from "@/lib/format";
import { useAuthContext } from "@/providers/auth-provider";

/**
 * HADRAN FABRICS MALL — staff profile drawer.
 * Account details, today's sales performance, recent audit activity,
 * and admin actions: edit, reset password, suspend/reactivate.
 */

interface UserDetailsDrawerProps {
  userId: number | null;
  open: boolean;
  onClose: () => void;
  onEdit: (id: number) => void;
}

export function UserDetailsDrawer({ userId, open, onClose, onEdit }: UserDetailsDrawerProps) {
  const utils = trpc.useUtils();
  const { user: me } = useAuthContext();
  const [resetOpen, setResetOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  const query = trpc.users.byId.useQuery({ id: userId! }, { enabled: open && userId != null, retry: 1 });
  const data = query.data;
  const u = data?.user;

  const invalidate = () => {
    void utils.users.list.invalidate();
    void utils.users.byId.invalidate();
    void utils.users.stats.invalidate();
  };

  const statusMutation = trpc.users.setStatus.useMutation({
    onSuccess: () => {
      toast.success("Status updated.");
      invalidate();
    },
    onError: (err) => toast.error("Could not update status.", { description: err.message }),
  });

  const resetMutation = trpc.users.resetPassword.useMutation({
    onSuccess: () => {
      toast.success("Password reset.", { description: "Share the new password with the staff member." });
      setResetOpen(false);
      setNewPassword("");
    },
    onError: (err) => toast.error("Could not reset password.", { description: err.message }),
  });

  const isSelf = me?.id === userId;

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="scrollbar-lux w-full overflow-y-auto border-l-gold-500/30 sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="font-display text-navy-900">{u ? u.fullName : "Staff member"}</SheetTitle>
            <SheetDescription>{u ? `${u.staffCode ?? ""} • @${u.username}` : "Loading…"}</SheetDescription>
          </SheetHeader>

          {query.isLoading ? (
            <div className="mt-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-xl" />
              ))}
            </div>
          ) : query.isError ? (
            <p className="mt-8 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{query.error.message}</p>
          ) : u ? (
            <div className="mt-6 space-y-5">
              {/* Identity */}
              <div className="card-lux space-y-3 rounded-xl border p-4">
                <div className="flex items-center justify-between">
                  <RoleBadge role={u.role} />
                  <StatusBadge label={u.status} tone={toneForStatus(u.status)} />
                </div>
                <div className="space-y-1.5 text-sm">
                  {u.email && <p className="text-muted-foreground">{u.email}</p>}
                  {u.phone && <p className="text-muted-foreground">{u.phone}</p>}
                  <p className="text-xs text-muted-foreground">
                    Joined {formatDateTime(new Date(u.createdAt)).split(",")[0]}
                    {data?.creatorName ? ` • added by ${data.creatorName}` : ""}
                    {u.lastLoginAt ? ` • last login ${timeAgo(new Date(u.lastLoginAt))}` : " • never logged in"}
                  </p>
                  {u.notes && <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">{u.notes}</p>}
                </div>
              </div>

              {/* Today performance */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-navy-900/5 px-2 py-3">
                  <ReceiptText className="mx-auto mb-1 h-4 w-4 text-gold-600" />
                  <p className="font-display text-lg font-bold text-navy-900">{data?.todaySales ?? 0}</p>
                  <p className="text-[11px] text-muted-foreground">Sales today</p>
                </div>
                <div className="rounded-xl bg-navy-900/5 px-2 py-3">
                  <Banknote className="mx-auto mb-1 h-4 w-4 text-gold-600" />
                  <p className="font-display text-lg font-bold text-navy-900">{formatCurrency(data?.todayRevenue ?? 0)}</p>
                  <p className="text-[11px] text-muted-foreground">Revenue today</p>
                </div>
                <div className="rounded-xl bg-navy-900/5 px-2 py-3">
                  <Activity className="mx-auto mb-1 h-4 w-4 text-gold-600" />
                  <p className="font-display text-lg font-bold text-navy-900">{data?.totalActions ?? 0}</p>
                  <p className="text-[11px] text-muted-foreground">Logged actions</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => onEdit(u.id)}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button variant="outline" size="sm" onClick={() => setResetOpen(true)}>
                  <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                  Reset password
                </Button>
                {!isSelf &&
                  (u.status === "ACTIVE" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:border-red-300 hover:bg-red-50"
                      disabled={statusMutation.isPending}
                      onClick={() => statusMutation.mutate({ id: u.id, status: "SUSPENDED" })}
                    >
                      <Ban className="mr-1.5 h-3.5 w-3.5" />
                      Suspend
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50"
                      disabled={statusMutation.isPending}
                      onClick={() => statusMutation.mutate({ id: u.id, status: "ACTIVE" })}
                    >
                      <CircleCheck className="mr-1.5 h-3.5 w-3.5" />
                      Reactivate
                    </Button>
                  ))}
              </div>

              <Separator />

              {/* Recent activity */}
              <div>
                <h3 className="mb-2 font-display text-sm font-semibold text-navy-900">Recent activity</h3>
                {(data?.recentActivity ?? []).length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">No recorded actions yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {data!.recentActivity.map((a) => (
                      <li key={a.id} className="rounded-lg border border-border px-3 py-2">
                        <p className="text-xs font-medium text-foreground">{a.description}</p>
                        <p className="text-[10px] text-muted-foreground">{timeAgo(new Date(a.createdAt))}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Reset password */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="border-gold-500/30 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-navy-900">
              <KeyRound className="h-5 w-5 text-gold-600" />
              Reset Password
            </DialogTitle>
            <DialogDescription>
              Set a new password for {u?.fullName}. They should change it after logging in.
            </DialogDescription>
          </DialogHeader>
          <Input
            data-no-scan
            type="text"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Min 8 chars, one letter and one number"
            className="input-lux"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-gold-500 font-semibold text-navy-950 hover:bg-gold-400"
              disabled={newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword) || resetMutation.isPending}
              onClick={() => u && resetMutation.mutate({ id: u.id, password: newPassword })}
            >
              {resetMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { timeAgo } from "@/lib/format";
import { playSound, setSoundsMuted, soundsMuted } from "@/lib/sounds";
import { Bell, Inbox, CheckCheck, ShieldCheck, PackageX, MessageSquare, Info, RotateCcw, Volume2, VolumeX } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

/**
 * HADRAN FABRICS MALL — notification bell.
 * Live unread badge + inbox of approvals, low-stock alerts, chat messages
 * and system notices. Polls in the background; new arrivals also trigger
 * the bell sound via the global sound watcher.
 */

const TYPE_META: Record<string, { icon: typeof Bell; classes: string }> = {
  APPROVAL: { icon: ShieldCheck, classes: "bg-amber-500/10 text-amber-600" },
  APPROVAL_RESULT: { icon: ShieldCheck, classes: "bg-emerald-500/10 text-emerald-600" },
  LOW_STOCK: { icon: PackageX, classes: "bg-red-500/10 text-red-600" },
  CHAT: { icon: MessageSquare, classes: "bg-navy-500/10 text-navy-600" },
  RETURN: { icon: RotateCcw, classes: "bg-purple-500/10 text-purple-600" },
  SYSTEM: { icon: Info, classes: "bg-muted text-muted-foreground" },
};

export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(soundsMuted());

  const countQ = trpc.notifications.unreadCount.useQuery(undefined, { refetchInterval: 10000 });
  const listQ = trpc.notifications.list.useQuery(undefined, { enabled: open });
  const markMut = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      countQ.refetch();
      listQ.refetch();
    },
  });

  const unread = countQ.data ?? 0;
  const items = listQ.data ?? [];

  const openItem = (id: number, link: string | null) => {
    markMut.mutate({ id });
    setOpen(false);
    if (link) navigate(link);
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setSoundsMuted(next);
    if (!next) playSound("notification");
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-navy-700 hover:bg-gold-100 hover:text-gold-700"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-88 border-gold-500/30 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="font-display text-sm font-semibold text-navy-900">
            Notifications {unread > 0 && <span className="ml-1 text-xs font-normal text-muted-foreground">({unread} unread)</span>}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleMute}
              title={muted ? "Unmute sounds" : "Mute sounds"}
              className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            {unread > 0 && (
              <button
                onClick={() => markMut.mutate({})}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-gold-700 transition hover:bg-gold-50"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gold-50">
              <Inbox className="h-5 w-5 text-gold-600" />
            </div>
            <p className="mt-3 text-sm font-medium text-navy-800">You're all caught up</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Low-stock alerts, approval requests and chat messages will appear here.
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-96">
            <ul className="divide-y divide-border/60">
              {items.map((n) => {
                const meta = TYPE_META[n.type] ?? TYPE_META.SYSTEM;
                const Icon = meta.icon;
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => openItem(n.id, n.link)}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-muted/60",
                        !n.isRead && "bg-gold-50/50",
                      )}
                    >
                      <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full", meta.classes)}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className={cn("truncate text-sm", !n.isRead ? "font-semibold" : "font-medium")}>{n.title}</span>
                          {!n.isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" />}
                        </span>
                        {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{n.body}</span>}
                        <span className="mt-1 block text-[10px] text-muted-foreground">{timeAgo(new Date(n.createdAt))}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}

        <div className="border-t border-border px-4 py-2 text-center">
          <Link to="/chat" onClick={() => setOpen(false)} className="text-[11px] font-medium text-gold-700 hover:underline">
            Open team chat
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

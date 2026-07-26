import { useEffect, useRef } from "react";
import { trpc } from "@/providers/trpc";
import { initSounds, playSound } from "@/lib/sounds";

/**
 * HADRAN FABRICS MALL — global sound watcher.
 * Mounted once in the app shell, so sounds work on EVERY page (not just chat):
 *  - chat unread total goes up    → "receive" chime
 *  - notification count goes up   → bell ding
 * Counts are baselined on first load so existing unread items stay silent.
 */
export function useAppSounds(enabled: boolean) {
  const chatQ = trpc.chat.unreadTotal.useQuery(undefined, {
    enabled,
    refetchInterval: 8000,
    refetchIntervalInBackground: true,
  });
  const notifQ = trpc.notifications.unreadCount.useQuery(undefined, {
    enabled,
    refetchInterval: 10000,
    refetchIntervalInBackground: true,
  });

  const chatBase = useRef<number | null>(null);
  const notifBase = useRef<number | null>(null);

  useEffect(() => {
    if (enabled) initSounds();
  }, [enabled]);

  useEffect(() => {
    const v = chatQ.data?.count;
    if (typeof v !== "number") return;
    if (chatBase.current === null) {
      chatBase.current = v;
      return;
    }
    if (v > chatBase.current) playSound("chat-receive");
    chatBase.current = v;
  }, [chatQ.data]);

  useEffect(() => {
    const v = notifQ.data;
    if (typeof v !== "number") return;
    if (notifBase.current === null) {
      notifBase.current = v;
      return;
    }
    if (v > notifBase.current) playSound("notification");
    notifBase.current = v;
  }, [notifQ.data]);
}

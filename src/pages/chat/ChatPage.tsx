import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/use-auth";
import { timeAgo } from "@/lib/format";
import { PageHeader } from "@/components/layout/PageHeader";
import { RoleBadge } from "@/components/common/RoleBadge";
import type { UserRole } from "@contracts/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MessageSquare, Send, Paperclip, Link2, X, Plus, Users, Package, ReceiptText, UserRound, Loader2, FileText, Trash2, LogOut,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { playSound } from "@/lib/sounds";

interface ConvItem {
  id: number; type: "DIRECT" | "GROUP"; title: string;
  lastMessage: { body: string | null; senderId: number; attachmentType: "IMAGE" | "DOCUMENT" | null; createdAt: string | Date } | null;
  unreadCount: number;
  participants: { userId: number; fullName: string; role: UserRole }[];
}
interface Msg {
  id: number; senderId: number; senderName: string; senderRole: UserRole;
  body: string | null; attachmentUrl: string | null; attachmentName: string | null;
  attachmentType: "IMAGE" | "DOCUMENT" | null;
  referenceType: "PRODUCT" | "SALE" | "CUSTOMER" | null; referenceId: number | null; referenceLabel: string | null;
  createdAt: string | Date;
}
interface StagedRef { type: "PRODUCT" | "SALE" | "CUSTOMER"; id: number; label: string }

const REF_ICONS = { PRODUCT: Package, SALE: ReceiptText, CUSTOMER: UserRound } as const;
const REF_PATHS: Record<string, (id: number) => string> = {
  PRODUCT: (id) => `/products/${id}`,
  SALE: (id) => `/sales?focus=${id}`,
  CUSTOMER: () => `/customers`,
};

export default function ChatPage() {
  const { user } = useAuth();
  const [activeConv, setActiveConv] = useState<number | null>(null);
  const [body, setBody] = useState("");
  const [stagedRef, setStagedRef] = useState<StagedRef | null>(null);
  const [stagedFile, setStagedFile] = useState<{ url: string; name: string; mimeType: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [refOpen, setRefOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const convsQ = trpc.chat.conversations.useQuery(undefined, { refetchInterval: 8000 });
  const msgsQ = trpc.chat.messages.useQuery(
    { conversationId: activeConv!, limit: 100 },
    { enabled: !!activeConv, refetchInterval: 4000 }
  );
  const sendMut = trpc.chat.send.useMutation();
  const markReadMut = trpc.chat.markRead.useMutation();

  const conversations = (convsQ.data ?? []) as ConvItem[];
  const active = conversations.find((c) => c.id === activeConv) ?? null;
  const messages = (msgsQ.data?.messages ?? []) as Msg[];

  // mark read whenever new messages arrive in the open conversation
  useEffect(() => {
    if (!activeConv || messages.length === 0) return;
    const latest = messages[messages.length - 1];
    if (active && active.unreadCount > 0) {
      markReadMut.mutate({ conversationId: activeConv, messageId: latest.id }, { onSuccess: () => convsQ.refetch() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, activeConv]);

  const prevMsgCount = useRef(0);
  useEffect(() => {
    if (messages.length > prevMsgCount.current && prevMsgCount.current > 0) {
      const newest = messages[messages.length - 1];
      if (newest && newest.senderId !== user?.id) playSound("chat-receive");
    }
    prevMsgCount.current = messages.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length, activeConv]);

  const uploadFile = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd, credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setStagedFile(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const canSend = !!(body.trim() || stagedFile || stagedRef) && !sendMut.isPending && !uploading;

  const send = async () => {
    if (!activeConv || !canSend) return;
    try {
      await sendMut.mutateAsync({
        conversationId: activeConv,
        body: body.trim() || undefined,
        attachmentUrl: stagedFile?.url,
        attachmentName: stagedFile?.name,
        attachmentType: stagedFile ? (stagedFile.mimeType.startsWith("image/") ? "IMAGE" : "DOCUMENT") : undefined,
        reference: stagedRef ? { type: stagedRef.type, id: stagedRef.id } : undefined,
      });
      setBody(""); setStagedFile(null); setStagedRef(null);
      playSound("chat-send");
      await Promise.all([msgsQ.refetch(), convsQ.refetch()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send");
    }
  };

  const initials = (name: string) => name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Team Chat"
        description="Coordinate with your team — reference products, sales and customers right in the conversation."
        actions={<Button onClick={() => setNewOpen(true)}><Plus className="mr-1.5 h-4 w-4" />New chat</Button>}
      />

      <div className="flex min-h-0 flex-1 gap-4">
        {/* Conversation list */}
        <aside className="flex w-80 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">Conversations</p>
            <p className="text-xs text-muted-foreground">{conversations.length} active</p>
          </div>
          <ScrollArea className="flex-1">
            {convsQ.isLoading ? (
              <div className="space-y-2 p-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
            ) : conversations.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No conversations yet.<br />Start one with the <b>New chat</b> button.
              </div>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveConv(c.id)}
                  className={`flex w-full items-start gap-3 border-b border-border/50 px-4 py-3 text-left transition hover:bg-muted/50 ${activeConv === c.id ? "bg-muted" : ""}`}
                >
                  <Avatar className="mt-0.5 h-9 w-9">
                    <AvatarFallback className={`text-xs ${c.type === "GROUP" ? "bg-gold/20 text-gold" : "bg-primary/10 text-primary"}`}>
                      {c.type === "GROUP" ? <Users className="h-4 w-4" /> : initials(c.title)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold">{c.title}</p>
                      {c.lastMessage && <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(c.lastMessage.createdAt)}</span>}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs text-muted-foreground">
                        {c.lastMessage
                          ? `${c.lastMessage.senderId === user?.id ? "You" : (c.participants.find((p) => p.userId === c.lastMessage?.senderId)?.fullName ?? "Someone")}: ${c.lastMessage.body ?? "📎 attachment"}`
                          : "No messages yet"}
                      </p>
                      {c.unreadCount > 0 && <Badge className="h-5 min-w-5 justify-center bg-gold px-1.5 text-[10px] text-primary">{c.unreadCount}</Badge>}
                    </div>
                  </div>
                </button>
              ))
            )}
          </ScrollArea>
        </aside>

        {/* Thread */}
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
          {!active ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
              <MessageSquare className="h-12 w-12 opacity-20" />
              <p className="text-sm">Select a conversation or start a new one</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-border px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{active.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {active.type === "GROUP"
                      ? active.participants.map((p) => p.fullName).join(", ")
                      : active.participants.find((p) => p.userId !== user?.id)?.role.replace("_", " ") ?? "Direct message"}
                  </p>
                </div>
                {active.type === "GROUP" && <Badge variant="outline">{active.participants.length} members</Badge>}
                <DeleteConversationButton
                  conv={active}
                  myId={user?.id ?? 0}
                  onDone={() => { setActiveConv(null); convsQ.refetch(); }}
                />
              </div>

              <ScrollArea className="flex-1 px-5 py-4">
                {msgsQ.isLoading ? (
                  <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-2/3" />)}</div>
                ) : messages.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">No messages yet — say hello 👋</p>
                ) : (
                  <div className="space-y-4">
                    {messages.map((m) => {
                      const mine = m.senderId === user?.id;
                      const RefIcon = m.referenceType ? REF_ICONS[m.referenceType] : null;
                      return (
                        <div key={m.id} className={`flex gap-3 ${mine ? "flex-row-reverse" : ""}`}>
                          <Avatar className="mt-1 h-8 w-8 shrink-0">
                            <AvatarFallback className={`text-[10px] ${mine ? "bg-primary text-primary-foreground" : "bg-gold/20 text-gold"}`}>
                              {initials(m.senderName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className={`max-w-[70%] ${mine ? "items-end text-right" : ""}`}>
                            <div className={`mb-1 flex items-center gap-2 text-[11px] text-muted-foreground ${mine ? "flex-row-reverse" : ""}`}>
                              <span className="font-medium text-foreground">{mine ? "You" : m.senderName}</span>
                              <RoleBadge role={m.senderRole} />
                              <span>{timeAgo(m.createdAt)}</span>
                            </div>
                            <div className={`inline-block rounded-2xl px-4 py-2.5 text-left text-sm shadow-sm ${mine ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm bg-card ring-1 ring-border"}`}>
                              {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                              {m.attachmentUrl && m.attachmentType === "IMAGE" && (
                                <a href={m.attachmentUrl} target="_blank" rel="noreferrer" className="mt-1 block">
                                  <img src={m.attachmentUrl} alt={m.attachmentName ?? "image"} className="max-h-56 rounded-lg" />
                                </a>
                              )}
                              {m.attachmentUrl && m.attachmentType === "DOCUMENT" && (
                                <a href={m.attachmentUrl} target="_blank" rel="noreferrer"
                                  className={`mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${mine ? "bg-white/10" : "bg-muted"}`}>
                                  <FileText className="h-4 w-4 shrink-0" />
                                  <span className="truncate underline">{m.attachmentName ?? "document"}</span>
                                </a>
                              )}
                              {m.referenceType && RefIcon && m.referenceId && (
                                <Link to={REF_PATHS[m.referenceType](m.referenceId)}
                                  className={`mt-1.5 flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium ${mine ? "border-gold/40 bg-gold/10 text-gold" : "border-gold/40 bg-gold/5 text-gold"}`}>
                                  <RefIcon className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate">{m.referenceLabel ?? `${m.referenceType} #${m.referenceId}`}</span>
                                  <Link2 className="h-3 w-3 shrink-0 opacity-60" />
                                </Link>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={bottomRef} />
                  </div>
                )}
              </ScrollArea>

              {/* Composer */}
              <div className="border-t border-border px-5 py-3">
                {(stagedFile || stagedRef) && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {stagedFile && (
                      <span className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs">
                        <Paperclip className="h-3 w-3" />{stagedFile.name}
                        <button onClick={() => setStagedFile(null)}><X className="h-3 w-3" /></button>
                      </span>
                    )}
                    {stagedRef && (() => {
                      const I = REF_ICONS[stagedRef.type];
                      return (
                        <span className="flex items-center gap-1.5 rounded-full bg-gold/10 px-3 py-1 text-xs text-gold ring-1 ring-gold/30">
                          <I className="h-3 w-3" /><span className="max-w-48 truncate">{stagedRef.label}</span>
                          <button onClick={() => setStagedRef(null)}><X className="h-3 w-3" /></button>
                        </span>
                      );
                    })()}
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <input ref={fileRef} type="file" className="hidden"
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); }} />
                  <Button variant="outline" size="icon" title="Attach file (max 5MB)"
                    onClick={() => fileRef.current?.click()} disabled={uploading}>
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                  </Button>

                  <Popover open={refOpen} onOpenChange={setRefOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="icon" title="Reference a product, sale or customer"><Link2 className="h-4 w-4" /></Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-96 p-0">
                      <ReferencePicker onPick={(ref) => { setStagedRef(ref); setRefOpen(false); }} />
                    </PopoverContent>
                  </Popover>

                  <Textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                    placeholder={`Message ${active.title}…  (Enter to send, Shift+Enter for new line)`}
                    className="max-h-32 min-h-[42px] flex-1 resize-none"
                    rows={1}
                  />
                  <Button size="icon" onClick={send} disabled={!canSend} className="bg-gold text-primary hover:bg-gold/90">
                    {sendMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      <NewChatDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        existingConvs={conversations}
        onOpened={(id) => { setNewOpen(false); convsQ.refetch().then(() => setActiveConv(id)); }}
      />
    </div>
  );
}

function ReferencePicker({ onPick }: { onPick: (ref: StagedRef) => void }) {
  const [type, setType] = useState<"PRODUCT" | "SALE" | "CUSTOMER">("PRODUCT");
  const [query, setQuery] = useState("");
  const searchQ = trpc.chat.searchEntities.useQuery(
    { type, query },
    { enabled: query.trim().length >= 2 }
  );
  const results = searchQ.data ?? [];
  return (
    <div>
      <div className="border-b border-border p-2">
        <Tabs value={type} onValueChange={(v) => setType(v as typeof type)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="PRODUCT">Product</TabsTrigger>
            <TabsTrigger value="SALE">Sale</TabsTrigger>
            <TabsTrigger value="CUSTOMER">Customer</TabsTrigger>
          </TabsList>
        </Tabs>
        <Input autoFocus className="mt-2" placeholder={`Search ${type.toLowerCase()}s… (min 2 chars)`}
          value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <ScrollArea className="max-h-64">
        <div className="p-1.5">
          {searchQ.isFetching ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : query.trim().length < 2 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Type at least 2 characters to search</p>
          ) : results.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">No matches found</p>
          ) : (
            results.map((r) => (
              <button key={r.id} onClick={() => onPick({ type, id: r.id, label: r.label })}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted">
                <span className="truncate font-medium">{r.label}</span>
                {r.hint && <span className="shrink-0 text-xs text-muted-foreground">{r.hint}</span>}
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function NewChatDialog({ open, onOpenChange, existingConvs, onOpened }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  existingConvs: ConvItem[]; onOpened: (id: number) => void;
}) {
  const [mode, setMode] = useState<"DIRECT" | "GROUP">("DIRECT");
  const [groupTitle, setGroupTitle] = useState("");
  const [checked, setChecked] = useState<number[]>([]);
  const staffQ = trpc.chat.staffOptions.useQuery(undefined, { enabled: open });
  const openDirectMut = trpc.chat.openDirect.useMutation();
  const createGroupMut = trpc.chat.createGroup.useMutation();

  const directUserIds = new Set(
    existingConvs.filter((c) => c.type === "DIRECT")
      .flatMap((c) => c.participants.map((p) => p.userId))
  );

  const pickDirect = async (userId: number) => {
    try {
      const res = await openDirectMut.mutateAsync({ userId });
      onOpened(res.conversationId);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
  };
  const createGroup = async () => {
    if (groupTitle.trim().length < 2) { toast.error("Give the group a name (min 2 characters)"); return; }
    if (checked.length === 0) { toast.error("Select at least one member"); return; }
    try {
      const res = await createGroupMut.mutateAsync({ title: groupTitle.trim(), memberIds: checked });
      setGroupTitle(""); setChecked([]);
      onOpened(res.conversationId);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
  };
  const toggle = (id: number) => setChecked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Start a conversation</DialogTitle></DialogHeader>
        <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="DIRECT">Direct message</TabsTrigger>
            <TabsTrigger value="GROUP">Group chat</TabsTrigger>
          </TabsList>
        </Tabs>
        {mode === "GROUP" && (
          <Input placeholder="Group name, e.g. Morning Shift" value={groupTitle} onChange={(e) => setGroupTitle(e.target.value)} />
        )}
        <ScrollArea className="max-h-72">
          <div className="space-y-1">
            {staffQ.isLoading ? (
              [1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)
            ) : (staffQ.data ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No other active staff found</p>
            ) : (
              (staffQ.data ?? []).map((s) => (
                <div key={s.id}
                  onClick={() => (mode === "DIRECT" ? pickDirect(s.id) : toggle(s.id))}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition hover:bg-muted ${checked.includes(s.id) ? "bg-gold/10 ring-1 ring-gold/40" : ""}`}>
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary/10 text-xs text-primary">
                      {s.fullName.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.fullName}</p>
                    <p className="text-xs text-muted-foreground">{s.staffCode}</p>
                  </div>
                  <RoleBadge role={s.role} />
                  {mode === "DIRECT" && directUserIds.has(s.id) && (
                    <span className="text-[10px] text-muted-foreground">existing</span>
                  )}
                  {mode === "GROUP" && checked.includes(s.id) && <Badge className="bg-gold text-primary">✓</Badge>}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
        {mode === "GROUP" && (
          <Button onClick={createGroup} disabled={createGroupMut.isPending} className="w-full bg-gold text-primary hover:bg-gold/90">
            {createGroupMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
            Create group ({checked.length} selected)
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Delete (direct / group creator) or leave (group member) conversation button. */
function DeleteConversationButton({ conv, myId, onDone }: { conv: ConvItem; myId: number; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const deleteMut = trpc.chat.deleteConversation.useMutation();
  const leaveMut = trpc.chat.leaveConversation.useMutation();

  // Group creator is the first participant who created it — server enforces;
  // the client just picks which action to offer.
  const isGroup = conv.type === "GROUP";
  const iAmCreator = isGroup && conv.participants[0]?.userId === myId;
  const action = isGroup && !iAmCreator ? "leave" : "delete";
  const busy = deleteMut.isPending || leaveMut.isPending;

  const run = async () => {
    try {
      if (action === "leave") {
        await leaveMut.mutateAsync({ conversationId: conv.id });
        toast.success(`You left "${conv.title}".`);
      } else {
        await deleteMut.mutateAsync({ conversationId: conv.id });
        toast.success("Conversation deleted.");
      }
      setOpen(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        title={action === "leave" ? "Leave group" : "Delete conversation"}
        className="text-muted-foreground hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        {action === "leave" ? <LogOut className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{action === "leave" ? `Leave "${conv.title}"?` : "Delete this conversation?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {action === "leave"
                ? "You'll stop receiving messages from this group. The group stays for everyone else."
                : isGroup
                  ? "This permanently deletes the group and ALL its messages for every member."
                  : "This permanently deletes the conversation and all its messages for both of you."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={run} disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {action === "leave" ? "Leave group" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

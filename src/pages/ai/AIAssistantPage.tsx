import { useEffect, useRef, useState } from "react";
import { trpc } from "@/providers/trpc";
import { timeAgo } from "@/lib/format";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Bot, Cloud, Cpu, Loader2, Plus, Send, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Conv { id: number; title: string; updatedAt: string | Date }
interface AiMsg { id: number; role: "USER" | "ASSISTANT"; content: string; createdAt: string | Date }

const SUGGESTIONS = [
  "How did we do today vs yesterday?",
  "Which products are low on stock?",
  "Top 5 selling products this week",
  "Show me staff performance for the last 7 days",
  "What is our current stock value?",
  "Any pending approvals?",
  "Payment breakdown for the last 30 days",
  "Summarise returns this month",
];

export default function AIAssistantPage() {
  const [activeConv, setActiveConv] = useState<number | null>(null);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState<{ question: string } | null>(null);
  const [mode, setMode] = useState<"cloud" | "offline" | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const convsQ = trpc.ai.conversations.useQuery();
  const msgsQ = trpc.ai.messages.useQuery({ conversationId: activeConv! }, { enabled: !!activeConv });
  const askMut = trpc.ai.ask.useMutation();
  const delMut = trpc.ai.deleteConversation.useMutation();

  const conversations = (convsQ.data ?? []) as Conv[];
  const messages = (msgsQ.data ?? []) as AiMsg[];

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length, pending]);

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || askMut.isPending) return;
    setQuestion("");
    setPending({ question: text });
    try {
      const res = await askMut.mutateAsync({ conversationId: activeConv ?? undefined, question: text });
      setMode(res.mode as "cloud" | "offline");
      if (!activeConv) setActiveConv(res.conversationId);
      await Promise.all([convsQ.refetch(), msgsQ.refetch()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Assistant failed to answer");
    } finally {
      setPending(null);
    }
  };

  const removeConv = async () => {
    if (deleteId == null) return;
    try {
      await delMut.mutateAsync({ conversationId: deleteId });
      if (activeConv === deleteId) setActiveConv(null);
      setDeleteId(null);
      convsQ.refetch();
      toast.success("Conversation deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const busy = askMut.isPending;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="AI Assistant"
        description="Ask anything about sales, stock, customers and performance — answers come straight from your live database."
        actions={
          <div className="flex items-center gap-2">
            {mode && (
              <Badge variant="outline" className={mode === "cloud" ? "border-emerald-500/40 text-emerald-600" : "border-amber-500/40 text-amber-600"}>
                {mode === "cloud" ? <Cloud className="mr-1 h-3 w-3" /> : <Cpu className="mr-1 h-3 w-3" />}
                {mode === "cloud" ? "Cloud AI" : "Built-in analyst"}
              </Badge>
            )}
            <Button onClick={() => setActiveConv(null)}><Plus className="mr-1.5 h-4 w-4" />New conversation</Button>
          </div>
        }
      />

      <div className="flex min-h-0 flex-1 gap-4">
        {/* Conversations sidebar */}
        <aside className="flex w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">History</p>
            <p className="text-xs text-muted-foreground">{conversations.length} conversations</p>
          </div>
          <ScrollArea className="flex-1">
            {convsQ.isLoading ? (
              <div className="space-y-2 p-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : conversations.length === 0 ? (
              <p className="p-6 text-center text-xs text-muted-foreground">Your past questions will appear here.</p>
            ) : (
              conversations.map((c) => (
                <div key={c.id}
                  onClick={() => setActiveConv(c.id)}
                  className={`group flex cursor-pointer items-start gap-2 border-b border-border/50 px-4 py-3 transition hover:bg-muted/50 ${activeConv === c.id ? "bg-muted" : ""}`}>
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.title}</p>
                    <p className="text-[11px] text-muted-foreground">{timeAgo(c.updatedAt)}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteId(c.id); }}
                    className="rounded p-1 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </ScrollArea>
        </aside>

        {/* Thread */}
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
          <ScrollArea className="flex-1 px-6 py-5">
            {!activeConv && messages.length === 0 && !pending ? (
              <div className="mx-auto max-w-2xl pt-10 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/5 ring-1 ring-gold/30">
                  <Bot className="h-8 w-8 text-gold" />
                </div>
                <h2 className="text-lg font-semibold">Ask Hadran AI</h2>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                  I can analyse today's sales, stock levels, top products, staff performance,
                  customers, returns and more — straight from the live database.
                </p>
                <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => ask(s)} disabled={busy}
                      className="rounded-xl border border-border bg-card px-4 py-3 text-left text-sm transition hover:border-gold/50 hover:bg-gold/5">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-3xl space-y-6">
                {messages.map((m) => (
                  <div key={m.id} className={`flex gap-3 ${m.role === "USER" ? "flex-row-reverse" : ""}`}>
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${m.role === "USER" ? "bg-primary text-primary-foreground" : "bg-gold/15 text-gold ring-1 ring-gold/30"}`}>
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${m.role === "USER" ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm bg-card ring-1 ring-border"}`}>
                      {m.role === "USER" ? (
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      ) : (
                        <MarkdownLite text={m.content} />
                      )}
                      <p className={`mt-1.5 text-[10px] ${m.role === "USER" ? "text-primary-foreground/60 text-right" : "text-muted-foreground"}`}>
                        {timeAgo(m.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
                {pending && (
                  <>
                    <div className="flex flex-row-reverse gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Bot className="h-4 w-4" />
                      </div>
                      <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-sm text-primary-foreground shadow-sm">
                        <p className="whitespace-pre-wrap">{pending.question}</p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold ring-1 ring-gold/30">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                      <div className="rounded-2xl rounded-tl-sm bg-card px-4 py-3 text-sm text-muted-foreground ring-1 ring-border">
                        Analysing the database…
                      </div>
                    </div>
                  </>
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </ScrollArea>

          <div className="border-t border-border px-6 py-4">
            <div className="mx-auto flex max-w-3xl items-end gap-2">
              <Textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(question); } }}
                placeholder="Ask about sales, stock, staff, customers… (Enter to send)"
                className="max-h-32 min-h-[44px] flex-1 resize-none"
                rows={1}
              />
              <Button size="icon" onClick={() => ask(question)} disabled={!question.trim() || busy}
                className="bg-gold text-primary hover:bg-gold/90">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-muted-foreground">
              Answers are generated from live shop data. Every question is recorded in the audit log.
            </p>
          </div>
        </section>
      </div>

      <AlertDialog open={deleteId != null} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove the conversation and all its messages.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={removeConv} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Minimal markdown renderer: bold, inline code, bullets, headings, and pipe tables. */
function MarkdownLite({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  const inline = (s: string): React.ReactNode => {
    const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((p, idx) => {
      if (p.startsWith("**") && p.endsWith("**")) return <strong key={idx} className="font-semibold">{p.slice(2, -2)}</strong>;
      if (p.startsWith("`") && p.endsWith("`")) return <code key={idx} className="rounded bg-muted px-1 py-0.5 text-xs">{p.slice(1, -1)}</code>;
      return <span key={idx}>{p}</span>;
    });
  };

  while (i < lines.length) {
    const line = lines[i];

    // pipe table
    if (line.trim().startsWith("|") && i + 1 < lines.length && /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[i + 1])) {
      const header = line.split("|").map((c) => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1 || arr.filter(Boolean).length <= 1);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(lines[i].split("|").map((c) => c.trim()).slice(1, -1));
        i++;
      }
      blocks.push(
        <div key={key++} className="my-2 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/60">
              <tr>{header.map((h, j) => <th key={j} className="px-3 py-1.5 text-left font-semibold">{inline(h)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-t border-border/50">
                  {r.map((c, ci) => <td key={ci} className="px-3 py-1.5">{inline(c)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    if (/^#{1,4}\s/.test(line.trim())) {
      const level = line.trim().match(/^#+/)![0].length;
      const content = line.trim().replace(/^#+\s*/, "");
      blocks.push(
        <p key={key++} className={`mt-3 font-semibold ${level <= 2 ? "text-base" : "text-sm"}`}>{inline(content)}</p>
      );
    } else if (/^\s*[-•*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-•*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-•*]\s+/, ""));
        i++;
      }
      i--; // outer loop increments
      blocks.push(
        <ul key={key++} className="my-1 list-disc space-y-0.5 pl-5">
          {items.map((it, j) => <li key={j}>{inline(it)}</li>)}
        </ul>
      );
    } else if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      i--;
      blocks.push(
        <ol key={key++} className="my-1 list-decimal space-y-0.5 pl-5">
          {items.map((it, j) => <li key={j}>{inline(it)}</li>)}
        </ol>
      );
    } else if (line.trim() === "") {
      blocks.push(<div key={key++} className="h-2" />);
    } else {
      blocks.push(<p key={key++} className="leading-relaxed">{inline(line)}</p>);
    }
    i++;
  }
  return <div className="space-y-0.5">{blocks}</div>;
}

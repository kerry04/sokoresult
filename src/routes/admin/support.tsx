import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { AttachmentUploader, AttachmentList, type AttachmentRow } from "@/components/support/Attachments";

export const Route = createFileRoute("/admin/support")({
  head: () => ({ meta: [{ title: "Admin · Support — SokoResult" }] }),
  component: AdminSupport,
});

interface Ticket {
  id: string;
  ticket_number: string;
  subject: string;
  category: string;
  status: string;
  user_id: string;
  description: string;
  created_at: string;
  updated_at: string;
}

interface Message {
  id: string;
  author_id: string;
  is_admin: boolean;
  body: string;
  created_at: string;
}

const STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
const STATUS_COLOR: Record<string, string> = {
  open: "bg-primary/15 text-primary border-primary/30",
  in_progress: "bg-warning/15 text-warning border-warning/30",
  resolved: "bg-success/15 text-success border-success/30",
  closed: "bg-muted text-muted-foreground border-border",
};

function AdminSupport() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [filter, setFilter] = useState<string>("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    let q = supabase.from("support_tickets").select("*").order("updated_at", { ascending: false });
    if (filter !== "all") q = q.eq("status", filter as any);
    const { data } = await q;
    setTickets((data ?? []) as Ticket[]);
  };

  useEffect(() => {
    load();
  }, [filter]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      setAttachments([]);
      return;
    }
    supabase
      .from("support_ticket_messages")
      .select("*")
      .eq("ticket_id", selectedId)
      .order("created_at", { ascending: true })
      .then(({ data }) => setMessages((data ?? []) as Message[]));
    supabase
      .from("support_ticket_attachments")
      .select("*")
      .eq("ticket_id", selectedId)
      .order("created_at", { ascending: true })
      .then(({ data }) => setAttachments((data ?? []) as AttachmentRow[]));
    const channel = supabase
      .channel(`admin-ticket-${selectedId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_ticket_messages", filter: `ticket_id=eq.${selectedId}` },
        (payload) =>
          setMessages((p) =>
            p.find((x) => x.id === (payload.new as Message).id) ? p : [...p, payload.new as Message],
          ),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const selected = tickets.find((t) => t.id === selectedId) ?? null;

  const send = async () => {
    if (!user || !selected || reply.trim().length < 1) return;
    setSending(true);
    const { error } = await supabase.from("support_ticket_messages").insert({
      ticket_id: selected.id,
      author_id: user.id,
      is_admin: true,
      body: reply.trim(),
    });
    setSending(false);
    if (error) {
      toast.error(friendlyError(error));
      return;
    }
    setReply("");
    // Auto-progress: open -> in_progress on first admin reply
    if (selected.status === "open") {
      await supabase.from("support_tickets").update({ status: "in_progress" }).eq("id", selected.id);
      load();
    }
  };

  const setStatus = async (status: string) => {
    if (!selected) return;
    const { error } = await supabase
      .from("support_tickets")
      .update({ status: status as any })
      .eq("id", selected.id);
    if (error) {
      toast.error(friendlyError(error));
      return;
    }
    toast.success(`Marked ${status.replace("_", " ")}`);
    load();
  };

  return (
    <div className="p-4 sm:p-6 grid lg:grid-cols-[320px_1fr] gap-4 h-[calc(100vh)]">
      <aside className="rounded-2xl border border-border bg-card flex flex-col min-h-0">
        <div className="p-3 border-b border-border flex items-center gap-2">
          <h2 className="font-semibold flex-1">Tickets</h2>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="overflow-y-auto flex-1">
          {tickets.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">No tickets in this view.</div>
          ) : (
            tickets.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={cn(
                  "w-full text-left p-3 border-b border-border/50 transition",
                  selectedId === t.id ? "bg-primary/10" : "hover:bg-accent/30",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground">{t.ticket_number}</span>
                  <Badge variant="outline" className={cn(STATUS_COLOR[t.status], "text-[10px]")}>
                    {t.status.replace("_", " ")}
                  </Badge>
                </div>
                <div className="mt-1 font-medium text-sm truncate">{t.subject}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {t.category} · {new Date(t.updated_at).toLocaleDateString("en-KE")}
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="rounded-2xl border border-border bg-card flex flex-col min-h-0">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Select a ticket to view the conversation.
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-border flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{selected.ticket_number}</span>
                  <Badge variant="outline" className={STATUS_COLOR[selected.status]}>
                    {selected.status.replace("_", " ")}
                  </Badge>
                </div>
                <h2 className="font-semibold mt-1">{selected.subject}</h2>
                <div className="text-xs text-muted-foreground">
                  User: <Link to="/u/$userId" params={{ userId: selected.user_id }} className="underline hover:text-foreground">{selected.user_id.slice(0, 8)}</Link>
                  {" · "}{selected.category}
                </div>
              </div>
              <Select value={selected.status} onValueChange={setStatus}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m) => (
                <div key={m.id} className={cn("flex", m.is_admin ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap",
                      m.is_admin
                        ? "bg-success/10 border border-success/30"
                        : "bg-background border border-border",
                    )}
                  >
                    {m.is_admin && (
                      <div className="text-[10px] uppercase tracking-wider text-success mb-1">Support (you)</div>
                    )}
                    {m.body}
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {new Date(m.created_at).toLocaleString("en-KE", { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" })}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>

            {attachments.length > 0 && (
              <div className="px-4 pb-3 border-t border-border pt-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Attachments</div>
                <AttachmentList attachments={attachments} />
              </div>
            )}

            <div className="p-3 border-t border-border">
              <Textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Reply to the user…"
                rows={3}
                maxLength={5000}
              />
              <div className="mt-2 flex justify-between items-center gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">{reply.length}/5000</span>
                  {user && selected && (
                    <AttachmentUploader
                      ticketId={selected.id}
                      userId={user.id}
                      onUploaded={(att) => setAttachments((prev) => [...prev, att])}
                    />
                  )}
                </div>
                <Button onClick={send} disabled={sending || !reply.trim()}>
                  <Send className="h-4 w-4" /> Send
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

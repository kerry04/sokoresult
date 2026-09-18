import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { ArrowLeft, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { AttachmentUploader, AttachmentList, type AttachmentRow } from "@/components/support/Attachments";

export const Route = createFileRoute("/_authed/support/$ticketId")({
  head: () => ({ meta: [{ title: "Ticket — SokoResult" }] }),
  component: TicketPage,
});

interface Ticket {
  id: string;
  ticket_number: string;
  subject: string;
  category: string;
  status: string;
  description: string;
  user_id: string;
  created_at: string;
}

interface Message {
  id: string;
  author_id: string;
  is_admin: boolean;
  body: string;
  created_at: string;
}

const STATUS_COLOR: Record<string, string> = {
  open: "bg-primary/15 text-primary border-primary/30",
  in_progress: "bg-warning/15 text-warning border-warning/30",
  resolved: "bg-success/15 text-success border-success/30",
  closed: "bg-muted text-muted-foreground border-border",
};

function TicketPage() {
  const { ticketId } = Route.useParams();
  const { user } = useAuth();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const [t, m, a] = await Promise.all([
      supabase.from("support_tickets").select("*").eq("id", ticketId).maybeSingle(),
      supabase
        .from("support_ticket_messages")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true }),
      supabase
        .from("support_ticket_attachments")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true }),
    ]);
    if (t.data) setTicket(t.data as Ticket);
    if (m.data) setMessages(m.data as Message[]);
    if (a.data) setAttachments(a.data as AttachmentRow[]);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`ticket-${ticketId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_ticket_messages", filter: `ticket_id=eq.${ticketId}` },
        (payload) => {
          setMessages((prev) =>
            prev.find((x) => x.id === (payload.new as Message).id)
              ? prev
              : [...prev, payload.new as Message],
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "support_tickets", filter: `id=eq.${ticketId}` },
        (payload) => setTicket((prev) => (prev ? { ...prev, ...(payload.new as Ticket) } : prev)),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticketId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = async () => {
    if (!user || reply.trim().length < 1) return;
    if (reply.length > 5000) {
      toast.error("Message too long (max 5000 chars)");
      return;
    }
    setSending(true);
    const { error } = await supabase.from("support_ticket_messages").insert({
      ticket_id: ticketId,
      author_id: user.id,
      is_admin: false,
      body: reply.trim(),
    });
    setSending(false);
    if (error) {
      toast.error(friendlyError(error));
      return;
    }
    setReply("");
  };

  if (!ticket) {
    return <div className="p-8 text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="px-4 sm:px-6 py-6 max-w-3xl mx-auto">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link to="/support"><ArrowLeft className="h-4 w-4" /> All tickets</Link>
      </Button>

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{ticket.ticket_number}</span>
              <Badge variant="outline" className={STATUS_COLOR[ticket.status]}>
                {ticket.status.replace("_", " ")}
              </Badge>
            </div>
            <h1 className="mt-2 text-xl font-bold">{ticket.subject}</h1>
            <div className="text-xs text-muted-foreground mt-1">
              {ticket.category} · Opened {new Date(ticket.created_at).toLocaleDateString("en-KE")}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {messages.map((m) => {
          const mine = m.author_id === user?.id && !m.is_admin;
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap",
                  mine
                    ? "bg-primary/15 border border-primary/30"
                    : m.is_admin
                      ? "bg-success/10 border border-success/30"
                      : "bg-card border border-border",
                )}
              >
                {m.is_admin && (
                  <div className="text-[10px] uppercase tracking-wider text-success mb-1">SokoResult Support</div>
                )}
                {m.body}
                <div className="text-[10px] text-muted-foreground mt-1">
                  {new Date(m.created_at).toLocaleString("en-KE", { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" })}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {attachments.length > 0 && (
        <div className="mt-4 rounded-2xl border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Attachments</div>
          <AttachmentList attachments={attachments} />
        </div>
      )}

      {ticket.status !== "closed" && ticket.status !== "resolved" && (
        <div className="mt-4 rounded-2xl border border-border bg-card p-4">
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Type your reply…"
            rows={3}
            maxLength={5000}
          />
          <div className="mt-3 flex justify-between items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">{reply.length}/5000</span>
              {user && (
                <AttachmentUploader
                  ticketId={ticketId}
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
      )}
      {(ticket.status === "closed" || ticket.status === "resolved") && (
        <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground text-center">
          This ticket is {ticket.status}. Open a new ticket if you need more help.
        </div>
      )}
    </div>
  );
}

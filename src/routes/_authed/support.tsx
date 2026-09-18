import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { Plus, Inbox } from "lucide-react";

export const Route = createFileRoute("/_authed/support")({
  head: () => ({ meta: [{ title: "Support — SokoResult" }] }),
  component: SupportPage,
});

const CATEGORIES = [
  { v: "account", l: "Account" },
  { v: "kyc", l: "Verification (KYC)" },
  { v: "deposits", l: "Deposits" },
  { v: "withdrawals", l: "Withdrawals" },
  { v: "trading", l: "Trading" },
  { v: "bug", l: "Bug report" },
  { v: "other", l: "Other" },
] as const;

const STATUS_COLOR: Record<string, string> = {
  open: "bg-primary/15 text-primary border-primary/30",
  in_progress: "bg-warning/15 text-warning border-warning/30",
  resolved: "bg-success/15 text-success border-success/30",
  closed: "bg-muted text-muted-foreground border-border",
};

const ticketSchema = z.object({
  subject: z.string().trim().min(3, "Subject must be at least 3 characters").max(200),
  category: z.enum(["account","kyc","deposits","withdrawals","trading","bug","other"]),
  description: z.string().trim().min(10, "Please describe in more detail").max(5000),
});

interface Ticket {
  id: string;
  ticket_number: string;
  subject: string;
  category: string;
  status: string;
  created_at: string;
  updated_at: string;
}

function SupportPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<string>("account");
  const [description, setDescription] = useState("");

  const load = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("support_tickets")
      .select("id, ticket_number, subject, category, status, created_at, updated_at")
      .order("updated_at", { ascending: false });
    if (!error) setTickets((data ?? []) as Ticket[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [user]);

  const submit = async () => {
    const parsed = ticketSchema.safeParse({ subject, category, description });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    if (!user) return;
    setSubmitting(true);
    const { data, error } = await supabase
      .from("support_tickets")
      .insert({
        user_id: user.id,
        subject: parsed.data.subject,
        category: parsed.data.category as any,
        description: parsed.data.description,
        ticket_number: "",
      })
      .select("id, ticket_number")
      .single();
    setSubmitting(false);
    if (error) {
      toast.error(friendlyError(error));
      return;
    }
    // Insert the first message body
    await supabase.from("support_ticket_messages").insert({
      ticket_id: data.id,
      author_id: user.id,
      is_admin: false,
      body: parsed.data.description,
    });
    toast.success(`Ticket ${data.ticket_number} created`, {
      description: "We'll respond within 24 hours.",
    });
    setShowForm(false);
    setSubject("");
    setDescription("");
    setCategory("account");
    navigate({ to: "/support/$ticketId", params: { ticketId: data.id } });
  };

  return (
    <div className="px-4 sm:px-6 py-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Support</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Need help? Open a ticket and our team will reply within 24 hours.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-4 w-4" /> New ticket
        </Button>
      </div>

      {showForm && (
        <div className="rounded-2xl border border-border bg-card p-5 mb-6 space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Subject</label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Briefly describe the issue"
              maxLength={200}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              maxLength={5000}
              placeholder="Tell us what happened, what you expected, and any error messages."
              className="mt-1"
            />
            <div className="text-[10px] text-muted-foreground mt-1 text-right">
              {description.length}/5000
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? "Submitting…" : "Submit ticket"}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {loading ? (
          <div className="text-muted-foreground text-sm">Loading…</div>
        ) : tickets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
            <Inbox className="h-8 w-8 mx-auto mb-3 opacity-50" />
            <div>No tickets yet. Open one above when you need help.</div>
          </div>
        ) : (
          tickets.map((t) => (
            <Link
              key={t.id}
              to="/support/$ticketId"
              params={{ ticketId: t.id }}
              className="block rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{t.ticket_number}</span>
                    <Badge variant="outline" className={STATUS_COLOR[t.status]}>{t.status.replace("_", " ")}</Badge>
                  </div>
                  <div className="mt-1.5 font-semibold truncate">{t.subject}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {CATEGORIES.find((c) => c.v === t.category)?.l ?? t.category} · Updated {new Date(t.updated_at).toLocaleDateString("en-KE", { month: "short", day: "numeric" })}
                  </div>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

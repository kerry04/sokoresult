import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2,
  Sparkles,
  Clock,
  TrendingUp,
  Target,
  CheckCircle2,
  XCircle,
  Newspaper,
  Bot,
  User,
  ArrowRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/suggestions")({
  component: SuggestionReviewQueue,
});

interface Suggestion {
  id: string;
  topic: string;
  suggested_question: string;
  suggested_yes_price: number;
  suggested_category: string;
  suggested_close_at: string | null;
  ai_reasoning: string | null;
  source_article_ids: string[] | null;
  used_market_id: string | null;
  created_by: string | null;
  created_at: string;
  confidence: number;
  status: string;
  auto_generated: boolean;
  trend_score: number;
  news_count: number;
  initial_probability: number | null;
  edge_score: number;
  horizon: string | null;
  event_type: string | null;
  key_entities: string[] | null;
  resolution_criteria: string | null;
}

interface SourceArticle {
  id: string;
  title: string;
  source: string;
  url: string | null;
  published_at: string;
}

type Tab = "pending" | "rejected";

function SuggestionReviewQueue() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("pending");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [sources, setSources] = useState<Record<string, SourceArticle>>({});
  const [loading, setLoading] = useState(true);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [counts, setCounts] = useState({ pending: 0, rejected: 0 });

  const load = async (status: Tab) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("market_suggestions")
      .select("*")
      .eq("status", status)
      .order("edge_score", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) {
      toast.error("Failed to load suggestions");
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as Suggestion[];
    setSuggestions(rows);

    const ids = [...new Set(rows.flatMap((s) => s.source_article_ids ?? []))];
    if (ids.length > 0) {
      const { data: arts } = await supabase
        .from("raw_news_data")
        .select("id, title, source, url, published_at")
        .in("id", ids);
      const map: Record<string, SourceArticle> = {};
      for (const a of (arts ?? []) as SourceArticle[]) map[a.id] = a;
      setSources(map);
    } else {
      setSources({});
    }

    const { count: pc } = await supabase
      .from("market_suggestions")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    const { count: rc } = await supabase
      .from("market_suggestions")
      .select("id", { count: "exact", head: true })
      .eq("status", "rejected");
    setCounts({ pending: pc ?? 0, rejected: rc ?? 0 });
    setLoading(false);
  };

  useEffect(() => {
    load(tab);
  }, [tab]);

  const approve = (s: Suggestion) => {
    navigate({
      to: "/admin/markets/create",
      search: {
        question: s.suggested_question,
        category: s.suggested_category,
        yes: Math.round(Number(s.suggested_yes_price) * 100),
        from: s.id,
        criteria: s.resolution_criteria ?? undefined,
        closes: s.suggested_close_at ?? undefined,
      },
    });
  };

  const reject = async (s: Suggestion) => {
    setRejecting(s.id);
    const { error } = await supabase
      .from("market_suggestions")
      .update({ status: "rejected" })
      .eq("id", s.id);
    setRejecting(null);
    if (error) {
      toast.error("Failed to reject");
      return;
    }
    toast.success("Suggestion rejected");
    setSuggestions((prev) => prev.filter((x) => x.id !== s.id));
    setCounts((c) => ({ pending: c.pending - 1, rejected: c.rejected + 1 }));
  };

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Review queue
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-drafted markets from the news pipeline. Approve one to open it in the market builder,
            or reject it.
          </p>
        </div>
        <div className="flex gap-2">
          {(["pending", "rejected"] as Tab[]).map((t) => (
            <Button
              key={t}
              variant={tab === t ? "default" : "outline"}
              size="sm"
              onClick={() => setTab(t)}
              className="capitalize"
            >
              {t}
              <span className="ml-1.5 rounded-full bg-background/20 px-1.5 text-xs">
                {t === "pending" ? counts.pending : counts.rejected}
              </span>
            </Button>
          ))}
        </div>
      </header>

      {loading ? (
        <div className="flex items-center text-muted-foreground py-16 justify-center">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading suggestions…
        </div>
      ) : suggestions.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-muted-foreground">
            {tab === "pending"
              ? "Nothing waiting. The pipeline drops new drafts here when trends qualify."
              : "No rejected suggestions."}
          </p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {suggestions.map((s) => (
            <SuggestionCard
              key={s.id}
              s={s}
              sources={sources}
              rejecting={rejecting === s.id}
              onApprove={() => approve(s)}
              onReject={() => reject(s)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SuggestionCard({
  s,
  sources,
  rejecting,
  onApprove,
  onReject,
}: {
  s: Suggestion;
  sources: Record<string, SourceArticle>;
  rejecting: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const yesPct = Math.round(Number(s.suggested_yes_price) * 100);
  const edgePct = Math.round(Number(s.edge_score) * 100);
  const articleList = useMemo(
    () =>
      (s.source_article_ids ?? [])
        .map((id) => sources[id])
        .filter(Boolean)
        .slice(0, 6),
    [s.source_article_ids, sources],
  );

  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="capitalize">
          {s.suggested_category}
        </Badge>
        {s.event_type && (
          <Badge variant="outline" className="capitalize">
            {s.event_type.replace("_", " ")}
          </Badge>
        )}
        {s.horizon && (
          <Badge variant="outline" className="capitalize flex items-center gap-1">
            <Clock className="h-3 w-3" /> {s.horizon}
          </Badge>
        )}
        {s.suggested_close_at && (
          <Badge variant="outline">
            Closes{" "}
            {new Date(s.suggested_close_at).toLocaleDateString("en-KE", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </Badge>
        )}
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
          {s.auto_generated ? (
            <>
              <Bot className="h-3 w-3" /> Pipeline
            </>
          ) : (
            <>
              <User className="h-3 w-3" /> Manual
            </>
          )}
        </span>
      </div>

      <h2 className="text-xl font-bold leading-snug">{s.suggested_question}</h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="YES price" value={`${yesPct}¢`} accent="text-success" />
        <Stat label="NO price" value={`${100 - yesPct}¢`} accent="text-destructive" />
        <Stat label="Edge score" value={`${edgePct}`} accent="text-primary" bar={edgePct} />
        <Stat
          label="Trend"
          value={`${Number(s.trend_score).toFixed(2)}`}
          sub={`${s.news_count} article${s.news_count === 1 ? "" : "s"}`}
        />
      </div>

      {s.key_entities && s.key_entities.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {s.key_entities.map((e) => (
            <Badge key={e} variant="secondary" className="text-xs">
              {e}
            </Badge>
          ))}
        </div>
      )}

      {s.resolution_criteria && (
        <div className="rounded-lg border border-border bg-card/50 p-3">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
            <Target className="h-3 w-3" /> Resolution criteria
          </div>
          <p className="text-sm leading-relaxed">{s.resolution_criteria}</p>
        </div>
      )}

      {s.ai_reasoning && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs uppercase tracking-wider text-muted-foreground">
            AI reasoning
          </summary>
          <p className="text-muted-foreground leading-relaxed mt-2">{s.ai_reasoning}</p>
        </details>
      )}

      {articleList.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Newspaper className="h-3 w-3" /> Sources ({articleList.length})
          </summary>
          <div className="space-y-2 mt-2">
            {articleList.map((a) => (
              <a
                key={a.id}
                href={a.url ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg border border-border bg-card/50 hover:border-primary/40 transition p-3"
              >
                <div className="text-[10px] uppercase tracking-wider text-primary font-bold mb-1">
                  {a.source}
                </div>
                <div className="text-sm font-medium line-clamp-2">{a.title}</div>
              </a>
            ))}
          </div>
        </details>
      )}

      <div className="flex gap-2 flex-wrap pt-1">
        <Button
          onClick={onApprove}
          className="bg-success text-success-foreground hover:bg-success/90"
        >
          Create market <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
        <Button variant="outline" onClick={onReject} disabled={rejecting}>
          {rejecting ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <XCircle className="h-4 w-4 mr-1" />
          )}
          Reject
        </Button>
        <span className="ml-auto text-xs text-muted-foreground self-center flex items-center gap-1">
          <TrendingUp className="h-3 w-3" /> confidence {Math.round(Number(s.confidence) * 100)}%
          <CheckCircle2 className="h-3 w-3 ml-2" /> {s.topic}
        </span>
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
  bar,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  bar?: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/50 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("font-mono text-2xl font-bold mt-0.5", accent)}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      {typeof bar === "number" && (
        <div className="mt-1.5 h-1 bg-primary/15 rounded-full overflow-hidden">
          <div className="h-full bg-primary" style={{ width: `${Math.min(100, bar)}%` }} />
        </div>
      )}
    </div>
  );
}

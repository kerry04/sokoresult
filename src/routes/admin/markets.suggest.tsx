import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Sparkles, Wand2, TrendingUp, Target, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { suggestMarket, type QuantSuggestion } from "@/lib/suggest-market.functions";

export const Route = createFileRoute("/admin/markets/suggest")({
  component: SuggestMarketPage,
});

interface PersistedSuggestion extends QuantSuggestion {
  id: string;
  sources: Array<{
    id: string;
    title: string;
    source: string;
    url: string;
    sentiment_score: number | null;
    published_at: string;
  }>;
}

function SuggestMarketPage() {
  const navigate = useNavigate();
  const [topic, setTopic] = useState("");
  const [days, setDays] = useState("7");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<PersistedSuggestion[]>([]);
  const [rejected, setRejected] = useState(0);

  const generate = async () => {
    if (!topic.trim()) {
      toast.error("Enter a topic or keyword");
      return;
    }
    setLoading(true);
    setResults([]);
    setRejected(0);

    try {
      const since = new Date(Date.now() - Number(days) * 86_400_000).toISOString();
      const { data: news } = await supabase
        .from("raw_news_data")
        .select(
          "id, title, body, source, url, sentiment_score, published_at, relevant_keywords, entities",
        )
        .gte("published_at", since)
        .order("published_at", { ascending: false })
        .limit(80);

      const lowered = topic.toLowerCase();
      const matched = (news ?? []).filter((n: any) => {
        const blob = `${n.title} ${n.body ?? ""}`.toLowerCase();
        if (blob.includes(lowered)) return true;
        return (n.relevant_keywords ?? []).some(
          (k: string) => k.includes(lowered) || lowered.includes(k),
        );
      });

      if (matched.length === 0) {
        toast.error(
          "No recent news for this topic. Try a broader keyword or wait for the scraper.",
        );
        setLoading(false);
        return;
      }

      const { suggestions, rejected: rej } = await suggestMarket({
        data: {
          topic,
          articles: matched.slice(0, 30).map((m: any) => ({
            id: m.id,
            title: m.title,
            source: m.source,
            published_at: m.published_at,
            sentiment: m.sentiment_score,
            entities: Array.isArray(m.entities) ? m.entities.map(String) : [],
          })),
        },
      });

      setRejected(rej);

      if (suggestions.length === 0) {
        toast.error("No tradable markets passed the resolvability filter.");
        setLoading(false);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const persisted: PersistedSuggestion[] = [];
      for (const s of suggestions) {
        const { data: saved, error } = await supabase
          .from("market_suggestions")
          .insert({
            topic,
            suggested_question: s.market_question,
            suggested_yes_price: s.initial_probability,
            suggested_category: s.category as any,
            suggested_close_at: s.deadline,
            ai_reasoning: s.reasoning,
            source_article_ids: s.source_article_ids,
            initial_probability: s.initial_probability,
            edge_score: s.edge_score,
            horizon: s.horizon,
            event_type: s.event_type,
            key_entities: s.key_entities,
            cluster_key: s.cluster_key,
            resolution_criteria: s.resolution_criteria,
            confidence: s.confidence,
            created_by: user?.id,
          })
          .select()
          .single();

        if (error) {
          console.error(error);
          continue;
        }

        const sourceArticles = matched
          .filter((m: any) => s.source_article_ids.includes(m.id))
          .slice(0, 8)
          .map((m: any) => ({
            id: m.id,
            title: m.title,
            source: m.source,
            url: m.url,
            sentiment_score: m.sentiment_score,
            published_at: m.published_at,
          }));

        persisted.push({ ...s, id: (saved as any).id, sources: sourceArticles });
      }

      setResults(persisted);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate suggestion");
    } finally {
      setLoading(false);
    }
  };

  const applySuggestion = (s: PersistedSuggestion) => {
    const params = new URLSearchParams({
      question: s.market_question,
      category: s.category,
      yes: String(Math.round(s.initial_probability * 100)),
      from: s.id,
      criteria: s.resolution_criteria,
    });
    if (s.deadline) params.set("closes", s.deadline);
    navigate({ to: `/admin/markets/create?${params.toString()}` as any });
  };

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" /> Quant market suggester
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Clusters recent news, computes a sentiment-derived prior, and ranks ideas by edge
          potential.
        </p>
      </header>

      <Card className="p-5 space-y-4">
        <div className="grid sm:grid-cols-[1fr_140px_auto] gap-3 items-end">
          <div>
            <Label htmlFor="topic">Topic / keyword</Label>
            <Input
              id="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="ruto, harambee stars, shilling…"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Window</Label>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Last 24h</SelectItem>
                <SelectItem value="7">Last 7d</SelectItem>
                <SelectItem value="30">Last 30d</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={generate}
            disabled={loading}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Wand2 className="h-4 w-4 mr-2" />
            )}
            Generate
          </Button>
        </div>
        {rejected > 0 && (
          <p className="text-xs text-muted-foreground">
            {rejected} candidate{rejected === 1 ? "" : "s"} rejected by the resolvability filter.
          </p>
        )}
      </Card>

      <div className="grid gap-4">
        {results.map((s) => (
          <SuggestionCard key={s.id} s={s} onUse={() => applySuggestion(s)} />
        ))}
      </div>
    </div>
  );
}

function SuggestionCard({ s, onUse }: { s: PersistedSuggestion; onUse: () => void }) {
  const yesPct = Math.round(s.initial_probability * 100);
  const noPct = 100 - yesPct;
  const edgePct = Math.round(s.edge_score * 100);

  return (
    <Card className="p-6 space-y-5 border-success/40 bg-gradient-to-b from-success/5 to-transparent">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge className="bg-success/20 text-success border-success/40 capitalize">
          {s.category}
        </Badge>
        <Badge variant="outline" className="capitalize">
          {s.event_type.replace("_", " ")}
        </Badge>
        <Badge variant="outline" className="capitalize flex items-center gap-1">
          <Clock className="h-3 w-3" /> {s.horizon}
        </Badge>
        {s.deadline && (
          <Badge variant="outline">
            Closes{" "}
            {new Date(s.deadline).toLocaleDateString("en-KE", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </Badge>
        )}
      </div>

      <h2 className="text-xl font-bold leading-snug">{s.market_question}</h2>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-success/30 bg-success/10 p-4 text-center">
          <div className="text-[10px] uppercase text-muted-foreground">Suggested YES</div>
          <div className="font-mono text-success text-3xl font-bold">KSh {yesPct}</div>
        </div>
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-center">
          <div className="text-[10px] uppercase text-muted-foreground">Suggested NO</div>
          <div className="font-mono text-destructive text-3xl font-bold">KSh {noPct}</div>
        </div>
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 text-center">
          <div className="text-[10px] uppercase text-muted-foreground flex items-center justify-center gap-1">
            <TrendingUp className="h-3 w-3" /> Edge score
          </div>
          <div className="font-mono text-primary text-3xl font-bold">{edgePct}</div>
          <div className="mt-1.5 h-1 bg-primary/15 rounded-full overflow-hidden">
            <div className="h-full bg-primary" style={{ width: `${edgePct}%` }} />
          </div>
        </div>
      </div>

      {s.key_entities.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {s.key_entities.map((e) => (
            <Badge key={e} variant="secondary" className="text-xs">
              {e}
            </Badge>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card/50 p-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
          <Target className="h-3 w-3" /> Resolution criteria
        </div>
        <p className="text-sm leading-relaxed">{s.resolution_criteria}</p>
      </div>

      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Reasoning</div>
        <p className="text-sm text-muted-foreground leading-relaxed">{s.reasoning}</p>
      </div>

      {s.sources.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Sources used ({s.sources.length})
          </div>
          <div className="space-y-2">
            {s.sources.map((src) => (
              <a
                key={src.id}
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg border border-border bg-card/50 hover:border-primary/40 transition p-3"
              >
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  <span className="font-bold text-primary">{src.source}</span>
                  {src.sentiment_score !== null && (
                    <span
                      className={src.sentiment_score >= 0 ? "text-success" : "text-destructive"}
                    >
                      sentiment {src.sentiment_score.toFixed(2)}
                    </span>
                  )}
                </div>
                <div className="text-sm font-medium line-clamp-2">{src.title}</div>
              </a>
            ))}
          </div>
        </div>
      )}

      <Button
        onClick={onUse}
        className="bg-success text-success-foreground hover:bg-success/90 w-full sm:w-auto"
      >
        Create market with these values →
      </Button>
    </Card>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Loader2, RefreshCw, Cpu, Zap, Newspaper, Flame, Lightbulb, Twitter } from "lucide-react";
import { toast } from "sonner";
import { OverviewTab } from "@/components/admin/news/OverviewTab";
import { SourcesTab } from "@/components/admin/news/SourcesTab";
import { FeedTab } from "@/components/admin/news/FeedTab";
import { TrendsTab } from "@/components/admin/news/TrendsTab";
import { SuggestionsTab } from "@/components/admin/news/SuggestionsTab";
import { TweetsTab } from "@/components/admin/news/TweetsTab";
import type { SourceHealth, TrendingKeyword, MarketSuggestion, NewsArticleRow, SocialPost } from "@/components/admin/news/types";
import { NEWS_SOURCES } from "@/lib/news-sources";

export const Route = createFileRoute("/admin/news")({
  head: () => ({ meta: [{ title: "News Intelligence — Admin" }] }),
  component: NewsIntelligence,
});

interface Totals {
  total: number;
  processed: number;
  unprocessed: number;
  last1h: number;
  last24h: number;
  avgSentiment: number;
}
interface CategoryStat { category: string; count: number; avgSentiment: number }

function NewsIntelligence() {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [categories, setCategories] = useState<CategoryStat[]>([]);
  const [articles, setArticles] = useState<NewsArticleRow[]>([]);
  const [sourceHealth, setSourceHealth] = useState<SourceHealth[]>([]);
  const [trends, setTrends] = useState<TrendingKeyword[]>([]);
  const [suggestions, setSuggestions] = useState<MarketSuggestion[]>([]);
  const [tweets, setTweets] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const since24 = new Date(Date.now() - 24 * 3600_000).toISOString();
    const since1 = new Date(Date.now() - 3600_000).toISOString();

    const [aggRes, recentRes, healthRes, trendsRes, sugRes, tweetsRes] = await Promise.all([
      supabase
        .from("raw_news_data")
        .select("source, category, sentiment_score, processed, published_at")
        .order("published_at", { ascending: false })
        .limit(5000),
      supabase
        .from("raw_news_data")
        .select("id, title, body, source, url, category, sentiment_score, published_at, processed, topics, relevant_keywords, entities")
        .order("published_at", { ascending: false })
        .limit(150),
      supabase.from("source_health").select("*"),
      supabase.from("trending_keywords").select("*").order("trend_score", { ascending: false }).limit(50),
      supabase.from("market_suggestions").select("*").order("edge_score", { ascending: false }).order("created_at", { ascending: false }).limit(60),
      supabase.from("social_posts").select("*").order("posted_at", { ascending: false }).limit(150),
    ]);

    const all = (aggRes.data ?? []) as Array<{
      source: string; category: string | null; sentiment_score: number | null; processed: boolean; published_at: string;
    }>;

    const processed = all.filter((r) => r.processed).length;
    const sents = all.map((r) => r.sentiment_score).filter((s): s is number => s !== null);
    setTotals({
      total: all.length,
      processed,
      unprocessed: all.length - processed,
      last1h: all.filter((r) => r.published_at >= since1).length,
      last24h: all.filter((r) => r.published_at >= since24).length,
      avgSentiment: sents.length > 0 ? sents.reduce((a, b) => a + b, 0) / sents.length : 0,
    });

    const byCat = new Map<string, { count: number; sum: number; n: number }>();
    for (const r of all) {
      if (!r.category) continue;
      const cur = byCat.get(r.category) ?? { count: 0, sum: 0, n: 0 };
      cur.count += 1;
      if (r.sentiment_score !== null) { cur.sum += r.sentiment_score; cur.n += 1; }
      byCat.set(r.category, cur);
    }
    setCategories(
      [...byCat.entries()]
        .map(([category, v]) => ({ category, count: v.count, avgSentiment: v.n > 0 ? v.sum / v.n : 0 }))
        .sort((a, b) => b.count - a.count),
    );

    setArticles((recentRes.data ?? []) as NewsArticleRow[]);

    // Derive source health: prefer the table; fall back to inferring from articles for sources without a row yet
    const healthByKey = new Map<string, SourceHealth>();
    for (const h of (healthRes.data ?? []) as SourceHealth[]) healthByKey.set(h.source, h);
    const articles24h = new Map<string, number>();
    const lastByKey = new Map<string, string>();
    for (const r of all) {
      if (r.published_at >= since24) articles24h.set(r.source, (articles24h.get(r.source) ?? 0) + 1);
      const cur = lastByKey.get(r.source);
      if (!cur || r.published_at > cur) lastByKey.set(r.source, r.published_at);
    }
    const merged: SourceHealth[] = NEWS_SOURCES.map((s) => {
      const existing = healthByKey.get(s.source);
      const last = existing?.last_success_at ?? lastByKey.get(s.source) ?? null;
      const ageMs = last ? Date.now() - new Date(last).getTime() : Infinity;
      const fails = existing?.consecutive_failures ?? 0;
      let status: SourceHealth["status"] = "active";
      if (fails >= 3 || ageMs > 6 * 3600_000) status = "down";
      else if (ageMs > 3600_000) status = "stale";
      return {
        source: s.source,
        last_fetch_at: existing?.last_fetch_at ?? null,
        last_success_at: last,
        articles_24h: existing?.articles_24h ?? articles24h.get(s.source) ?? 0,
        consecutive_failures: fails,
        last_error: existing?.last_error ?? null,
        status: existing?.status === "active" || existing?.status === "stale" || existing?.status === "down" ? existing.status : status,
        updated_at: existing?.updated_at ?? new Date().toISOString(),
      };
    });
    setSourceHealth(merged);

    setTrends((trendsRes.data ?? []) as TrendingKeyword[]);
    setSuggestions((sugRes.data ?? []) as MarketSuggestion[]);
    setTweets((tweetsRes.data ?? []) as SocialPost[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  const trigger = async (path: string, label: string, key: string) => {
    setRunning(key);
    try {
      const res = await fetch(path, { method: "POST" });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error ?? `${label} failed`);
      const summary =
        json.results?.length
          ? `${label}: ${json.results.reduce((a: number, r: { inserted?: number }) => a + (r.inserted ?? 0), 0)} new`
          : json.suggested !== undefined
          ? `${label}: ${json.suggested} suggested`
          : json.processed !== undefined
          ? `${label}: ${json.processed} analyzed`
          : json.keywordsTracked !== undefined
          ? `${label}: ${json.keywordsTracked} keywords tracked`
          : `${label} complete`;
      toast.success(summary);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `${label} failed`);
    } finally {
      setRunning(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-6 space-y-6"
    >
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Newspaper className="h-6 w-6 text-primary" />
            News Intelligence
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sentiment-driven market intelligence · {NEWS_SOURCES.length} sources · auto-refresh 30s
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => trigger("/api/public/hooks/scrape-news", "Scrape", "scrape")} disabled={running !== null}>
            {running === "scrape" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Scrape
          </Button>
          <Button variant="outline" size="sm" onClick={() => trigger("/api/public/hooks/analyze-sentiment", "Analyze", "analyze")} disabled={running !== null}>
            {running === "analyze" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cpu className="h-4 w-4" />}
            Analyze
          </Button>
          <Button variant="outline" size="sm" onClick={() => trigger("/api/public/hooks/compute-trends", "Trends", "trends")} disabled={running !== null}>
            {running === "trends" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
            Compute trends
          </Button>
          <Button variant="outline" size="sm" onClick={() => trigger("/api/public/hooks/scrape-tweets", "Tweets", "tweets")} disabled={running !== null}>
            {running === "tweets" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Twitter className="h-4 w-4" />}
            Scrape tweets
          </Button>
          <Button size="sm" onClick={() => trigger("/api/public/hooks/auto-suggest-markets", "Suggest", "suggest")} disabled={running !== null}>
            {running === "suggest" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lightbulb className="h-4 w-4" />}
            Auto-suggest
          </Button>
        </div>
      </header>

      <Tabs defaultValue="overview">
        <TabsList className="bg-card/50 h-auto p-1 flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="sources">
            Sources
            <span className="ml-1.5 text-[10px] font-mono text-muted-foreground">{sourceHealth.length}</span>
          </TabsTrigger>
          <TabsTrigger value="feed">
            Feed
            <span className="ml-1.5 text-[10px] font-mono text-muted-foreground">{articles.length}</span>
          </TabsTrigger>
          <TabsTrigger value="trends">
            Trends
            <span className="ml-1.5 text-[10px] font-mono text-orange-500">{trends.filter((t) => t.trend_score >= 0.3).length}</span>
          </TabsTrigger>
          <TabsTrigger value="suggestions">
            Suggestions
            <span className="ml-1.5 text-[10px] font-mono text-warning">{suggestions.filter((s) => s.status === "pending").length}</span>
          </TabsTrigger>
          <TabsTrigger value="tweets">
            Tweets
            <span className="ml-1.5 text-[10px] font-mono text-sky-500">{tweets.length}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab
            totals={totals}
            categories={categories}
            sourceHealth={sourceHealth}
            trends={trends}
            suggestions={suggestions}
          />
        </TabsContent>
        <TabsContent value="sources" className="mt-4">
          <SourcesTab health={sourceHealth} />
        </TabsContent>
        <TabsContent value="feed" className="mt-4">
          <FeedTab articles={articles} />
        </TabsContent>
        <TabsContent value="trends" className="mt-4">
          <TrendsTab trends={trends} />
        </TabsContent>
        <TabsContent value="suggestions" className="mt-4">
          <SuggestionsTab suggestions={suggestions} onChange={load} />
        </TabsContent>
        <TabsContent value="tweets" className="mt-4">
          <TweetsTab posts={tweets} />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}

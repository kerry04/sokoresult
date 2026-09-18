import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BadgeCheck, ExternalLink, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { CATEGORY_LABEL, formatPrice } from "@/lib/format";

export const Route = createFileRoute("/_authed/news")({
  head: () => ({ meta: [{ title: "News — SokoResult" }] }),
  component: NewsPage,
});

interface RawArticle {
  id: string;
  title: string;
  body: string | null;
  source: string;
  url: string;
  image_url: string | null;
  category: string | null;
  published_at: string;
  sentiment_score: number | null;
  topics: string[] | null;
  relevant_keywords: string[] | null;
}

interface MarketLite {
  id: string;
  slug: string;
  question: string;
  yes_price: number;
  no_price: number;
  keywords: string[] | null;
}

const FILTERS: Array<{ key: string; label: string; dot?: boolean }> = [
  { key: "all", label: "All" },
  { key: "trending", label: "Trending", dot: true },
  { key: "politics", label: "Politics" },
  { key: "sports", label: "Sports" },
  { key: "entertainment", label: "Entertainment" },
  { key: "economics", label: "Economics" },
];

function NewsPage() {
  const [articles, setArticles] = useState<RawArticle[]>([]);
  const [markets, setMarkets] = useState<MarketLite[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [trending, setTrending] = useState<Array<{ keyword: string; trend_score: number; mentions_1h: number }>>([]);

  useEffect(() => {
    const load = async () => {
      const [{ data: rows }, { data: ms }, { data: trRows }] = await Promise.all([
        supabase
          .from("raw_news_data")
          .select("id, title, body, source, url, image_url, category, published_at, sentiment_score, topics, relevant_keywords")
          .order("published_at", { ascending: false })
          .limit(80),
        supabase
          .from("markets")
          .select("id, slug, question, yes_price, no_price, keywords")
          .eq("status", "open")
          .limit(100),
        supabase
          .from("trending_keywords")
          .select("keyword, trend_score, mentions_1h")
          .order("trend_score", { ascending: false })
          .limit(8),
      ]);

      setArticles((rows ?? []) as RawArticle[]);
      setMarkets((ms ?? []) as MarketLite[]);
      setTrending((trRows ?? []) as Array<{ keyword: string; trend_score: number; mentions_1h: number }>);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    let list = articles;
    if (filter === "trending") {
      list = [...articles].sort(
        (a, b) => Math.abs(b.sentiment_score ?? 0) - Math.abs(a.sentiment_score ?? 0),
      );
    } else if (filter.startsWith("kw:")) {
      const kw = filter.slice(3).toLowerCase();
      list = articles.filter((a) =>
        [...(a.relevant_keywords ?? []), ...(a.topics ?? [])].some((k) => k.toLowerCase().includes(kw)),
      );
    } else if (filter !== "all") {
      list = articles.filter((a) => a.category === filter);
    }
    return list;
  }, [articles, filter]);

  const matchMarket = (a: RawArticle): MarketLite | null => {
    const tags = (a.relevant_keywords ?? []).map((t) => t.toLowerCase());
    if (tags.length === 0) return null;
    return (
      markets.find((m) =>
        (m.keywords ?? []).some((k) => tags.includes(k.toLowerCase())),
      ) ?? null
    );
  };

  return (
    <div className="px-3 sm:px-4 lg:px-6 py-4 sm:py-6 lg:py-8 max-w-3xl mx-auto">
      <div className="flex items-end justify-between gap-4 mb-4 sm:mb-5 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">Headlines</h1>
          <p className="mt-1 text-muted-foreground">
            Live Kenyan headlines, AI-scored for market impact.
          </p>
        </div>
      </div>

      {trending.length > 0 && (
        <div className="mb-4 -mx-1 px-1 overflow-x-auto scrollbar-hide">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Trending now</span>
          </div>
          <div className="flex gap-2">
            {trending.slice(0, 6).map((t) => {
              const key = `kw:${t.keyword}`;
              const active = filter === key;
              return (
                <button
                  key={t.keyword}
                  onClick={() => setFilter(active ? "all" : key)}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs whitespace-nowrap border capitalize transition",
                    active
                      ? "border-orange-500/60 bg-orange-500/10 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  #{t.keyword}
                  <span className="ml-1.5 font-mono text-[10px] text-orange-500">{t.trend_score.toFixed(1)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-1 px-1 scrollbar-hide">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition border flex items-center gap-1.5",
              filter === f.key
                ? "bg-primary/20 border-primary/50 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground",
            )}
          >
            {f.dot && <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />}
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-28 rounded-lg bg-card/40 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {filtered.map((a, i) => {
            const m = matchMarket(a);
            const s = a.sentiment_score;
            return (
              <motion.article
                key={a.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(i, 8) * 0.04 }}
                className="py-5 hover:bg-card/30 -mx-3 px-3 rounded-lg transition"
              >
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider mb-2 flex-wrap">
                  <span className="font-bold text-primary-foreground">{a.source}</span>
                  <span className="inline-flex items-center gap-1 text-success">
                    <BadgeCheck className="h-3 w-3" /> Verified
                  </span>
                  {s !== null && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1",
                        s > 0.2 ? "text-success" : s < -0.2 ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {s > 0.2 ? <TrendingUp className="h-3 w-3" /> : s < -0.2 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                      {s > 0 ? "+" : ""}{s.toFixed(2)}
                    </span>
                  )}
                  <span className="ml-auto text-muted-foreground normal-case tracking-normal">
                    {timeAgo(a.published_at)}
                  </span>
                </div>

                <h2 className="text-[15px] font-semibold leading-snug line-clamp-2 text-foreground">
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="hover:text-success transition inline-flex items-start gap-1">
                    {a.title}
                    <ExternalLink className="h-3 w-3 mt-1 shrink-0 opacity-50" />
                  </a>
                </h2>

                {a.body && (
                  <p className="mt-1.5 text-sm text-muted-foreground line-clamp-2">{a.body}</p>
                )}

                <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                  {a.category && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider bg-muted/40 text-muted-foreground">
                      {CATEGORY_LABEL[a.category] ?? a.category}
                    </span>
                  )}
                  {(a.topics ?? []).slice(0, 3).map((t) => (
                    <span key={t} className="px-2 py-0.5 rounded-full text-[10px] bg-primary/10 text-primary-foreground/80 border border-primary/20">
                      {t}
                    </span>
                  ))}
                </div>

                {m && (
                  <Link
                    to="/markets/$slug"
                    params={{ slug: m.slug }} search={{}}
                    className="mt-3 block rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-glow transition p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-muted-foreground line-clamp-1 flex-1">
                        {m.question}
                      </div>
                      <div className="flex items-center gap-2 font-mono text-xs shrink-0">
                        <span className="text-success font-bold">YES {formatPrice(Number(m.yes_price))}</span>
                        <span className="text-destructive font-bold">NO {formatPrice(Number(m.no_price))}</span>
                        <span className="text-success font-semibold">Trade →</span>
                      </div>
                    </div>
                  </Link>
                )}
              </motion.article>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center text-muted-foreground py-20">
              No stories yet — the scraper runs every 15 minutes.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604_800) return `${Math.floor(diff / 86_400)}d ago`;
  return new Date(iso).toLocaleDateString("en-KE", { month: "short", day: "numeric" });
}

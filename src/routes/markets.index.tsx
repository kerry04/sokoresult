import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Radio } from "lucide-react";
import { MarketCardCinema, type CinemaMarket } from "@/components/markets/MarketCardCinema";
import type { TapeItem } from "@/components/markets/NewsTape";
import { useAuth } from "@/lib/auth-context";
import { PublicHeader } from "@/components/nav/PublicHeader";
import { AccountSidebar } from "@/components/nav/AccountSidebar";
import { MobileBottomNav } from "@/components/nav/MobileBottomNav";
import { CATEGORY_LABEL, formatKESCompact, formatNumberCompact } from "@/lib/format";

export const Route = createFileRoute("/markets/")({
  head: () => ({ meta: [{ title: "Markets — SokoResult" }] }),
  component: MarketsRoute,
});

/**
 * The markets board is public — anyone can browse. Signed-in users get the
 * account chrome (laptop sidebar); visitors get the public header.
 * Trading itself stays gated at BUY via the draft ticket.
 */
function MarketsRoute() {
  const { user, loading } = useAuth();
  const board = <MarketsBoard />;

  if (!loading && user) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="lg:hidden">
          <PublicHeader />
        </div>
        <AccountSidebar />
        <div className="lg:pl-60">
          <main className="pb-[84px] lg:pb-0">{board}</main>
        </div>
        <MobileBottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicHeader />
      <main className="pb-[84px] lg:pb-0">{board}</main>
      <MobileBottomNav />
    </div>
  );
}

interface MarketRow extends CinemaMarket {
  keywords: string[] | null;
}

const CATS = ["all", "politics", "sports", "entertainment", "economics"];

function MarketsBoard() {
  const [markets, setMarkets] = useState<MarketRow[]>([]);
  const [history, setHistory] = useState<Record<string, number[]>>({});
  const [tapesByMarket, setTapesByMarket] = useState<Record<string, TapeItem[]>>({});
  const [pulseByMarket, setPulseByMarket] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [liveFlash, setLiveFlash] = useState(false);

  const marketsRef = useRef<MarketRow[]>([]);
  marketsRef.current = markets;

  useEffect(() => {
    (async () => {
      const { data: m } = await supabase
        .from("markets")
        .select(
          "id, slug, question, category, yes_price, no_price, volume_cents, trader_count, keywords, image_url, closes_at",
        )
        .eq("status", "open")
        .order("volume_cents", { ascending: false });
      const rows = (m ?? []) as MarketRow[];
      setMarkets(rows);

      if (rows.length) {
        const ids = rows.map((x) => x.id);

        // price history sparklines
        const { data: ph } = await supabase
          .from("price_history")
          .select("market_id, yes_price, recorded_at")
          .in("market_id", ids)
          .order("recorded_at", { ascending: true });
        const grouped: Record<string, number[]> = {};
        (ph ?? []).forEach((row) => {
          const k = row.market_id as string;
          if (!grouped[k]) grouped[k] = [];
          grouped[k].push(Number(row.yes_price));
        });
        setHistory(grouped);

        // matched news per market
        const { data: matches } = await supabase.rpc("match_news_to_markets", {
          _market_ids: ids,
          _per_market: 6,
        });
        const tapeMap: Record<string, TapeItem[]> = {};
        (matches ?? []).forEach(
          (row: {
            market_id: string;
            article_id: string;
            title: string;
            url: string;
            source: string;
            published_at: string;
          }) => {
            const arr = tapeMap[row.market_id] ?? [];
            arr.push({
              id: row.article_id,
              title: row.title,
              url: row.url,
              source: row.source,
              published_at: row.published_at,
            });
            tapeMap[row.market_id] = arr;
          },
        );
        setTapesByMarket(tapeMap);
      }
      setLoading(false);
    })();
  }, []);

  // Realtime: when a new processed article lands, fan it out to any market whose keywords overlap
  useEffect(() => {
    const channel = supabase
      .channel("markets-news-feed")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "raw_news_data" },
        (payload) => {
          const n = payload.new as {
            id: string;
            title: string;
            url: string;
            source: string;
            published_at: string;
            processed: boolean | null;
            relevant_keywords: string[] | null;
          };
          if (!n?.processed || !n?.relevant_keywords) return;
          const kws: string[] = n.relevant_keywords;
          const matched = marketsRef.current.filter(
            (m) => m.keywords && m.keywords.some((k) => kws.includes(k.toLowerCase())),
          );
          if (matched.length === 0) return;

          setLiveFlash(true);
          setTimeout(() => setLiveFlash(false), 1500);

          setTapesByMarket((prev) => {
            const next = { ...prev };
            for (const mk of matched) {
              const cur = next[mk.id] ?? [];
              if (cur.some((x) => x.id === n.id)) continue;
              next[mk.id] = [
                {
                  id: n.id,
                  title: n.title,
                  url: n.url,
                  source: n.source,
                  published_at: n.published_at,
                },
                ...cur,
              ].slice(0, 8);
            }
            return next;
          });
          setPulseByMarket((prev) => {
            const next = { ...prev };
            for (const mk of matched) next[mk.id] = (next[mk.id] ?? 0) + 1;
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(
    () => (filter === "all" ? markets : markets.filter((m) => m.category === filter)),
    [filter, markets],
  );

  const totalVolume = markets.reduce((acc, m) => acc + m.volume_cents, 0);
  const totalTraders = markets.reduce((acc, m) => acc + m.trader_count, 0);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5 sm:mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight flex items-center gap-2 sm:gap-3 flex-wrap">
            Markets
            <AnimatePresence>
              {liveFlash && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  className="inline-flex items-center gap-1 rounded-full border border-primary/50 bg-primary/15 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-primary-foreground"
                >
                  <Radio className="h-3 w-3 animate-pulse" />
                  Live
                </motion.span>
              )}
            </AnimatePresence>
          </h1>
          <p className="mt-1 text-sm sm:text-base text-muted-foreground">
            Trade the future of Africa.
          </p>
          {/* Mobile: compact one-line stats */}
          <p className="sm:hidden mt-2 num text-xs text-muted-foreground">
            <span className="text-foreground font-semibold">{markets.length}</span> markets
            <span className="mx-1.5 opacity-50">·</span>
            Vol <span className="text-foreground">{formatKESCompact(totalVolume)}</span>
            <span className="mx-1.5 opacity-50">·</span>
            <span className="text-success">{formatNumberCompact(totalTraders)}</span> traders
          </p>
        </div>
        <div className="hidden sm:flex gap-6 font-mono text-sm">
          <Stat label="Live markets" value={String(markets.length)} />
          <Stat label="Volume" value={formatKESCompact(totalVolume)} />
          <Stat label="Traders" value={formatNumberCompact(totalTraders)} accent />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-6 -mx-1 px-1 no-scrollbar">
        {CATS.map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition border",
              filter === c
                ? "bg-primary/20 border-primary/50 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground",
            )}
          >
            {c === "all" ? "All" : CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-72 rounded-2xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m, i) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.4) }}
            >
              <MarketCardCinema
                market={m}
                history={history[m.id] ?? []}
                tapeItems={tapesByMarket[m.id] ?? []}
                pulseKey={pulseByMarket[m.id]}
              />
            </motion.div>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center text-muted-foreground py-20">
          No markets in this category yet.
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-bold", accent && "text-success")}>{value}</div>
    </div>
  );
}

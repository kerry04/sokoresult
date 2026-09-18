import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Newspaper, Radio, ExternalLink, Pause, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export interface StreamItem {
  id: string;
  title: string;
  url: string;
  source: string;
  published_at: string;
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86_400)}d ago`;
}

interface Props {
  marketId: string;
  keywords: string[];
}

/**
 * Cinematic vertical news ticker — headlines scroll DOWN the screen
 * like end-of-movie credits (top → bottom), looping seamlessly.
 */
export function MarketNewsStream({ marketId, keywords }: Props) {
  const [items, setItems] = useState<StreamItem[]>([]);
  const [livePulse, setLivePulse] = useState(0);
  const [paused, setPaused] = useState(false);
  const seenIds = useRef<Set<string>>(new Set());

  // Initial fetch
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("match_news_to_markets", {
        _market_ids: [marketId],
        _per_market: 25,
      });
      if (cancelled) return;
      const list: StreamItem[] = (data ?? []).map((row: any) => ({
        id: row.article_id,
        title: row.title,
        url: row.url,
        source: row.source,
        published_at: row.published_at,
      }));
      list.forEach((x) => seenIds.current.add(x.id));
      setItems(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [marketId]);

  // Realtime
  useEffect(() => {
    if (!keywords?.length) return;
    const lowered = keywords.map((k) => k.toLowerCase());
    const channel = supabase
      .channel(`market-news-stream-${marketId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "raw_news_data" },
        (payload) => {
          const n: any = payload.new;
          if (!n?.processed || !Array.isArray(n.relevant_keywords)) return;
          const overlap = n.relevant_keywords.some((k: string) =>
            lowered.includes(String(k).toLowerCase()),
          );
          if (!overlap) return;
          if (seenIds.current.has(n.id)) return;
          seenIds.current.add(n.id);
          setItems((prev) =>
            [
              {
                id: n.id,
                title: n.title,
                url: n.url,
                source: n.source,
                published_at: n.published_at,
              },
              ...prev,
            ].slice(0, 40),
          );
          setLivePulse((p) => p + 1);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [marketId, keywords]);

  // Duplicate the list so the downward scroll loops seamlessly
  const reel = items.length ? [...items, ...items] : [];

  // Slower for longer reels, but never glacial
  const duration = Math.max(28, items.length * 4);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-background/40">
        <div className="flex items-center gap-2">
          <Newspaper className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm tracking-wide uppercase text-muted-foreground">
            Headlines · Live Reel
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <AnimatePresence>
            {livePulse > 0 && (
              <motion.span
                key={livePulse}
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
          {items.length > 0 && (
            <button
              onClick={() => setPaused((p) => !p)}
              className="text-muted-foreground hover:text-foreground transition"
              aria-label={paused ? "Play reel" : "Pause reel"}
            >
              {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Cinema reel — fixed-height stage, headlines scroll downward */}
      <div
        className="relative h-[420px] overflow-hidden"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        style={{
          maskImage:
            "linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)",
        }}
      >
        {items.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground italic">
            Awaiting headlines for this market…
          </div>
        ) : (
          <div
            className="absolute inset-x-0 top-0 will-change-transform"
            style={{
              animation: `cinema-credits ${duration}s linear infinite`,
              animationPlayState: paused ? "paused" : "running",
            }}
          >
            <ul className="flex flex-col">
              {reel.map((item, idx) => (
                <li key={`${item.id}-${idx}`} className="px-5 py-3 border-b border-border/30">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-start gap-3 hover:text-primary-foreground"
                  >
                    <div className="mt-1 h-1.5 w-1.5 rounded-full bg-primary/70 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm leading-snug line-clamp-2 group-hover:text-primary-foreground">
                        {item.title}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                        <span className="truncate">{item.source}</span>
                        <span>•</span>
                        <span>{timeAgo(item.published_at)}</span>
                      </div>
                    </div>
                    <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition shrink-0 mt-1" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Keyframes — start ABOVE the stage and scroll down past it,
          so the reel enters from the top like real credits would. */}
      <style>{`
        @keyframes cinema-credits {
          0%   { transform: translateY(-50%); }
          100% { transform: translateY(0%); }
        }
      `}</style>
    </div>
  );
}

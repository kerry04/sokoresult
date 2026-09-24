import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Headline {
  id: string;
  title: string;
  url: string;
  source: string;
  published_at: string;
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 0) return "now";
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86_400)}d`;
}

const REFRESH_MS = 5 * 60 * 1000;

function shortSource(source: string): string {
  // "the_standard_kenya" -> "Standard"
  return source
    .replace(/^(the|kenya)_?/i, "")
    .replace(/_/g, " ")
    .trim()
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * Slim live news wire that sits directly under the header.
 * Real headlines from the ingestion pipeline, scrolling in one
 * smooth GPU-driven loop. Pauses on hover; static under reduced motion.
 */
export function NewsTicker() {
  const [items, setItems] = useState<Headline[]>([]);
  const [loaded, setLoaded] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("raw_news_data")
        .select("id, title, url, source, published_at")
        .order("published_at", { ascending: false })
        .limit(30);
      if (cancelled) return;
      const seen = new Set<string>();
      const uniq = ((data ?? []) as Headline[]).filter((h) => {
        if (!h.title || !h.url) return false;
        const k = h.title.trim().toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      setItems(uniq.slice(0, 20));
      setLoaded(true);
    };
    load();
    timer.current = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, REFRESH_MS);
    return () => {
      cancelled = true;
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  // Pace the loop so headlines glide past at a readable speed (~7s each).
  const duration = Math.max(30, items.length * 7);

  return (
    <div
      className="news-wire border-b border-border/60 bg-card/40"
      role="marquee"
      aria-label="Latest Kenyan headlines"
    >
      <div className="mx-auto flex h-10 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <span className="inline-flex shrink-0 items-center gap-1.5">
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
          </span>
          <span className="font-mono text-[10px] font-bold tracking-[0.18em] text-destructive">
            LIVE
          </span>
        </span>

        <div className="news-wire-viewport relative min-w-0 flex-1 overflow-hidden">
          {!loaded ? (
            <p className="truncate text-[11px] text-muted-foreground/70 italic">
              Connecting live wire…
            </p>
          ) : items.length === 0 ? (
            <p className="truncate text-[11px] text-muted-foreground/70 italic">
              Awaiting headlines…
            </p>
          ) : (
            <div
              className="animate-ticker flex w-max items-center gap-8 pr-8 will-change-transform hover:[animation-play-state:paused]"
              style={{ animationDuration: `${duration}s` }}
            >
              {[0, 1].map((copy) => (
                <div key={copy} aria-hidden={copy === 1} className="flex items-center gap-8">
                  {items.map((h) => (
                    <a
                      key={`${copy}-${h.id}`}
                      href={h.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      tabIndex={copy === 1 ? -1 : 0}
                      className="group inline-flex max-w-[420px] items-center gap-2 text-[11px] whitespace-nowrap"
                    >
                      <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wide text-primary uppercase">
                        {shortSource(h.source)}
                      </span>
                      <span className="truncate text-muted-foreground group-hover:text-foreground group-hover:underline">
                        {h.title}
                      </span>
                      <span className="num shrink-0 text-[9px] text-muted-foreground/70">
                        {timeAgo(h.published_at)}
                      </span>
                      <span aria-hidden className="text-muted-foreground/40">
                        •
                      </span>
                    </a>
                  ))}
                </div>
              ))}
            </div>
          )}
          {/* edge fades */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-card to-transparent"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-card to-transparent"
          />
        </div>
      </div>
    </div>
  );
}

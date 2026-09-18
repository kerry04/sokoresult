import { motion, AnimatePresence } from "framer-motion";
import { Twitter, ExternalLink, Hash, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo, type SocialPost } from "./types";

function sentimentBorder(s: number | null): string {
  if (s === null) return "border-l-muted";
  if (s > 0.2) return "border-l-emerald-500";
  if (s < -0.2) return "border-l-rose-500";
  return "border-l-muted-foreground/40";
}

export function TweetsTab({ posts }: { posts: SocialPost[] }) {
  if (posts.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card/30 p-12 text-center">
        <Twitter className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">
          No tweets scraped yet. Nitter mirrors are unstable — Apify fallback runs every 15min for the
          top trending keywords.
        </p>
      </div>
    );
  }

  const byKeyword = new Map<string, SocialPost[]>();
  for (const p of posts) {
    const arr = byKeyword.get(p.keyword) ?? [];
    arr.push(p);
    byKeyword.set(p.keyword, arr);
  }
  const groups = [...byKeyword.entries()].sort((a, b) => b[1].length - a[1].length);

  // Detect sources by URL pattern (apify usually returns x.com / twitter.com directly w/ engagement >0)
  const apifyCount = posts.filter((p) => p.engagement > 0).length;
  const sourceLabel =
    apifyCount > 0 && apifyCount < posts.length ? "Mixed" : apifyCount > 0 ? "Apify" : "Nitter";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-1">
          {groups.slice(0, 4).map(([kw, arr]) => (
            <div key={kw} className="rounded-lg border border-border bg-card/40 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Hash className="h-3 w-3" />
                <span className="truncate">{kw}</span>
              </div>
              <div className="text-2xl font-bold font-mono mt-1">{arr.length}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">tweets</div>
            </div>
          ))}
        </div>
        <span className="px-2 py-1 rounded text-[10px] uppercase tracking-wider bg-sky-500/10 text-sky-400 border border-sky-500/30 font-mono">
          src: {sourceLabel}
        </span>
      </div>

      <div className="rounded-xl border border-border bg-card/30 overflow-hidden max-h-[640px] overflow-y-auto">
        <AnimatePresence initial={false}>
          {posts.slice(0, 80).map((p, i) => (
            <motion.div
              key={p.id}
              layout
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: Math.min(i * 0.01, 0.3) }}
              className={cn(
                "px-4 py-3 border-b border-l-4 border-border last:border-b-0 hover:bg-card/50 transition-colors",
                sentimentBorder(p.sentiment),
              )}
            >
              <div className="flex items-start gap-3">
                <Twitter className="h-4 w-4 text-sky-500 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1 flex-wrap">
                    <span className="font-mono truncate">{p.author ?? "@unknown"}</span>
                    <span>·</span>
                    <span>{timeAgo(p.posted_at)}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1 text-primary">
                      <Hash className="h-3 w-3" />
                      {p.keyword}
                    </span>
                    {p.sentiment !== null && (
                      <span
                        className={cn(
                          "font-mono",
                          p.sentiment > 0.2
                            ? "text-emerald-400"
                            : p.sentiment < -0.2
                            ? "text-rose-400"
                            : "text-muted-foreground",
                        )}
                      >
                        {p.sentiment >= 0 ? "+" : ""}
                        {p.sentiment.toFixed(2)}
                      </span>
                    )}
                    {p.engagement > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-rose-400/80">
                        <Heart className="h-3 w-3" />
                        {p.engagement}
                      </span>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed">{p.text}</p>
                </div>
                <a
                  href={p.post_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  aria-label="Open tweet"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

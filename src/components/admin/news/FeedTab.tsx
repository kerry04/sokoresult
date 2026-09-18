import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { NEWS_SOURCES } from "@/lib/news-sources";
import { timeAgo, type NewsArticleRow } from "./types";

export function FeedTab({ articles }: { articles: NewsArticleRow[] }) {
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<string>("all");
  const [sentiment, setSentiment] = useState<"all" | "pos" | "neg" | "neu">("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return articles.filter((a) => {
      if (source !== "all" && a.source !== source) return false;
      if (search && !a.title.toLowerCase().includes(search.toLowerCase())) return false;
      const s = a.sentiment_score ?? 0;
      if (sentiment === "pos" && s <= 0.2) return false;
      if (sentiment === "neg" && s >= -0.2) return false;
      if (sentiment === "neu" && Math.abs(s) > 0.2) return false;
      return true;
    });
  }, [articles, search, source, sentiment]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title or keyword…"
          className="max-w-xs"
        />
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="rounded-md border border-border bg-card px-3 text-sm"
        >
          <option value="all">All sources</option>
          {NEWS_SOURCES.map((s) => (
            <option key={s.source} value={s.source}>{s.display}</option>
          ))}
        </select>
        <div className="inline-flex rounded-md border border-border bg-card/40 p-0.5">
          {(["all", "pos", "neu", "neg"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setSentiment(v)}
              className={cn(
                "px-3 py-1 text-xs rounded uppercase tracking-wider",
                sentiment === v ? "bg-primary/20 text-foreground" : "text-muted-foreground",
              )}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="ml-auto self-center text-xs text-muted-foreground font-mono">
          {filtered.length}/{articles.length}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card/30 divide-y divide-border max-h-[640px] overflow-y-auto">
        <AnimatePresence initial={false}>
          {filtered.map((a) => {
            const isOpen = expanded === a.id;
            const s = a.sentiment_score;
            return (
              <motion.div
                key={a.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="px-4 py-3 hover:bg-card/50 transition"
              >
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider mb-1 flex-wrap">
                  <span className="font-bold text-foreground">{a.source}</span>
                  {a.category && (
                    <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary-foreground/80 border border-primary/20">
                      {a.category}
                    </span>
                  )}
                  {!a.processed && (
                    <span className="px-1.5 py-0.5 rounded bg-warning/10 text-warning border border-warning/30">
                      pending AI
                    </span>
                  )}
                  {s !== null && (
                    <span
                      className={cn(
                        "font-mono",
                        s > 0.2 ? "text-success" : s < -0.2 ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {s >= 0 ? "+" : ""}{s.toFixed(2)}
                    </span>
                  )}
                  <span className="ml-auto normal-case tracking-normal text-muted-foreground">
                    {timeAgo(a.published_at)}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <button
                    onClick={() => setExpanded(isOpen ? null : a.id)}
                    className="mt-0.5 text-muted-foreground hover:text-foreground"
                    aria-label="Expand"
                  >
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} />
                  </button>
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-foreground hover:text-primary inline-flex items-start gap-1 flex-1"
                  >
                    {a.title}
                    <ExternalLink className="h-3 w-3 mt-1 shrink-0 opacity-50" />
                  </a>
                </div>
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden mt-2 ml-5 text-xs text-muted-foreground space-y-2"
                    >
                      {a.body && <p className="line-clamp-4">{a.body}</p>}
                      {(a.relevant_keywords?.length ?? 0) > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {(a.relevant_keywords ?? []).map((k) => (
                            <span key={k} className="px-1.5 py-0.5 rounded bg-muted/40 text-foreground text-[10px]">
                              {k}
                            </span>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {filtered.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">No articles match.</div>
        )}
      </div>
    </div>
  );
}
